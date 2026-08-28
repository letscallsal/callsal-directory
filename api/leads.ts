import type { VercelRequest, VercelResponse } from '@vercel/node';
import { getAuthUser, setCorsHeaders } from './lib/auth.js';
import {
  PRICE,
  addShop,
  loadBoard,
  loadPlan,
  moveLead,
  normalizeStage,
  oracleAllowed,
  runOracle,
  saveBoard,
  scanCity,
  setPlan,
  usage,
} from './lib/board.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });

  const plan = await loadPlan(user.id);
  let board = await loadBoard(user.id);

  if (req.method === 'GET') {
    return res.status(200).json({
      plan,
      leads: board.leads,
      usage: usage(board, plan),
    });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body || {};
  const action = String(body.action || '').trim();

  if (action === 'sandbox-upgrade') {
    await setPlan(user.id, 'paid');
    const nextPlan = await loadPlan(user.id);
    return res.status(200).json({
      plan: nextPlan,
      leads: board.leads,
      usage: usage(board, nextPlan),
      sandbox: true,
    });
  }

  if (action === 'add') {
    const slug = String(body.slug || '').trim().toLowerCase();
    const result = await addShop(board, slug, plan);
    if (result.reason === 'missing') return res.status(404).json({ error: 'SHOP NOT FOUND' });
    if (result.reason === 'cap') {
      return res.status(402).json({
        error: 'FREE CAP',
        upgrade: true,
        price: PRICE,
        message: `Free accounts can save 25 leads. Paid Directory is ${PRICE}.`,
        plan,
        leads: board.leads,
        usage: usage(board, plan),
      });
    }
    board = result.board;
    await saveBoard(user.id, board);
    return res.status(200).json({
      plan,
      leads: board.leads,
      added: result.added,
      usage: usage(board, plan),
    });
  }

  if (action === 'scan') {
    const city = String(body.city || 'milton').trim().toLowerCase();
    const result = await scanCity(board, city, plan);
    if (result.reason === 'paid') {
      return res.status(402).json({
        error: 'PAID',
        upgrade: true,
        price: PRICE,
        message: `Scan is on Paid Directory at ${PRICE}.`,
        plan,
        leads: board.leads,
        usage: usage(board, plan),
      });
    }
    if (result.reason === 'scan-wait') {
      return res.status(429).json({
        error: 'SCAN WAIT',
        message: 'Scan can run again after 8am.',
        plan,
        leads: board.leads,
        usage: usage(board, plan),
      });
    }
    board = result.board;
    await saveBoard(user.id, board);
    return res.status(200).json({
      plan,
      leads: board.leads,
      added: result.added,
      skipped: result.skipped,
      source: result.source,
      usage: usage(board, plan),
    });
  }

  if (action === 'oracle') {
    const gate = oracleAllowed(board, plan);
    if (!gate.ok && gate.message === 'paid') {
      return res.status(402).json({
        error: 'PAID',
        upgrade: true,
        price: PRICE,
        message: `Oracle is on Paid Directory at ${PRICE}.`,
        plan,
        leads: board.leads,
        usage: usage(board, plan),
      });
    }
    if (!gate.ok) {
      return res.status(429).json({
        error: 'ORACLE WAIT',
        message: gate.message,
        plan,
        leads: board.leads,
        usage: usage(board, plan),
      });
    }
    const oracle = runOracle(board);
    await saveBoard(user.id, board);
    return res.status(200).json({
      plan,
      leads: board.leads,
      oracle,
      usage: usage(board, plan),
    });
  }

  const slug = String(body.slug || '').trim().toLowerCase();
  const rawStage = String(body.stage || '').trim();
  if (slug && rawStage) {
    board = moveLead(board, slug, normalizeStage(rawStage));
    await saveBoard(user.id, board);
    return res.status(200).json({
      plan,
      leads: board.leads,
      usage: usage(board, plan),
    });
  }

  return res.status(400).json({ error: 'VALID ACTION REQUIRED' });
}
