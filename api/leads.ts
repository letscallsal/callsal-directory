import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  createToken,
  getAuthSession,
  setAuthCookie,
  setCorsHeaders,
  type AuthSession,
} from './lib/auth.js';
import {
  PRICE,
  addShop,
  hydrateBoard,
  isPipelineOwner,
  loadBoard,
  loadPlan,
  moveLead,
  normalizeStage,
  oracleAllowed,
  runOracle,
  saveBoard,
  scanCity,
  setPlan,
  storedBoardOf,
  usage,
  type BoardState,
  type Plan,
} from './lib/board.js';
import { isPersistentStorage } from './lib/storage.js';

async function writeSession(req: VercelRequest, res: VercelResponse, session: AuthSession, plan: Plan, board: BoardState) {
  if (isPersistentStorage()) return;
  const token = await createToken(session, { plan, board: storedBoardOf(board) });
  setAuthCookie(res, token, req.headers.origin || '');
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const session = await getAuthSession(req);
  if (!session) return res.status(401).json({ error: 'Not authenticated' });
  const user = { id: session.id, email: session.email, name: session.name };

  const owner = isPipelineOwner(user);
  const persist = isPersistentStorage();
  let plan: Plan = persist ? await loadPlan(user.id) : (session.plan === 'paid' ? 'paid' : 'free');
  let board = persist ? await loadBoard(user) : hydrateBoard(session.board);

  if (req.method === 'GET') {
    return res.status(200).json({
      plan,
      leads: board.leads,
      usage: usage(board, plan, owner),
    });
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const body = req.body || {};
  const action = String(body.action || '').trim();

  if (action === 'sandbox-upgrade') {
    plan = 'paid';
    if (persist) await setPlan(user.id, 'paid');
    await writeSession(req, res, session, plan, board);
    return res.status(200).json({
      plan,
      leads: board.leads,
      usage: usage(board, plan, owner),
      sandbox: true,
    });
  }

  if (action === 'add') {
    const listing = {
      slug: String(body.slug || '').trim().toLowerCase(),
      placeId: String(body.placeId || '').trim(),
      name: String(body.name || '').trim(),
      category: String(body.category || '').trim().toLowerCase(),
      city: String(body.city || '').trim(),
      region: String(body.region || '').trim(),
      country: String(body.country || '').trim(),
      address: String(body.address || '').trim(),
      phone: String(body.phone || '').trim(),
      website: String(body.website || '').trim(),
      email: String(body.email || '').trim(),
      ownerName: String(body.ownerName || '').trim(),
      photo: String(body.photo || '').trim(),
      mapsUrl: String(body.mapsUrl || '').trim(),
      instagram: String(body.instagram || '').trim(),
    };
    const result = await addShop(board, listing, plan, owner);
    if (result.reason === 'missing') return res.status(404).json({ error: 'SHOP NOT FOUND' });
    if (result.reason === 'cap') {
      return res.status(402).json({
        error: 'FREE CAP',
        upgrade: true,
        price: PRICE,
        message: `Free accounts can save 25 leads. Paid Directory is ${PRICE}.`,
        plan,
        leads: board.leads,
        usage: usage(board, plan, owner),
      });
    }
    board = result.board;
    if (persist) await saveBoard(user, board);
    await writeSession(req, res, session, plan, board);
    return res.status(200).json({
      plan,
      leads: board.leads,
      added: result.added,
      usage: usage(board, plan, owner),
    });
  }

  if (action === 'scan') {
    const city = String(body.city || 'milton').trim().toLowerCase();
    const result = await scanCity(board, city, plan, owner);
    if (result.reason === 'paid') {
      return res.status(402).json({
        error: 'PAID',
        upgrade: true,
        price: PRICE,
        message: `Scan is on Paid Directory at ${PRICE}.`,
        plan,
        leads: board.leads,
        usage: usage(board, plan, owner),
      });
    }
    if (result.reason === 'scan-wait') {
      return res.status(429).json({
        error: 'SCAN WAIT',
        message: 'Scan can run again after 8am.',
        plan,
        leads: board.leads,
        usage: usage(board, plan, owner),
      });
    }
    board = result.board;
    if (persist) await saveBoard(user, board);
    await writeSession(req, res, session, plan, board);
    return res.status(200).json({
      plan,
      leads: board.leads,
      added: result.added,
      skipped: result.skipped,
      source: result.source,
      usage: usage(board, plan, owner),
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
        usage: usage(board, plan, owner),
      });
    }
    if (!gate.ok) {
      return res.status(429).json({
        error: 'ORACLE WAIT',
        message: gate.message,
        plan,
        leads: board.leads,
        usage: usage(board, plan, owner),
      });
    }
    const oracle = runOracle(board);
    if (persist) await saveBoard(user, board);
    await writeSession(req, res, session, plan, board);
    return res.status(200).json({
      plan,
      leads: board.leads,
      oracle,
      usage: usage(board, plan, owner),
    });
  }

  const slug = String(body.slug || '').trim();
  const rawStage = String(body.stage || '').trim();
  if (slug && rawStage) {
    board = moveLead(board, slug, normalizeStage(rawStage));
    if (persist) await saveBoard(user, board);
    await writeSession(req, res, session, plan, board);
    return res.status(200).json({
      plan,
      leads: board.leads,
      usage: usage(board, plan, owner),
    });
  }

  return res.status(400).json({ error: 'VALID ACTION REQUIRED' });
}
