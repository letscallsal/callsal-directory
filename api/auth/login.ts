import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  builtInUser,
  createToken,
  getAuthSession,
  isBuiltInEmail,
  loadUserByEmail,
  publicUser,
  saveUser,
  setAuthCookie,
  setCorsHeaders,
  ensureFreePlan,
  verifyPassword,
} from '../lib/auth.js';
import { isPersistentStorage } from '../lib/storage.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const origin = req.headers.origin || '';

    if (!email || !password) return res.status(400).json({ error: 'EMAIL AND PASSWORD REQUIRED' });

    const builtin = await builtInUser(email, password);
    if (isBuiltInEmail(email) && !builtin) {
      return res.status(401).json({ error: 'INVALID CREDENTIALS' });
    }

    if (isPersistentStorage()) {
      let stored = await loadUserByEmail(email);
      if (builtin && !stored) {
        stored = builtin;
        await saveUser(stored);
        await ensureFreePlan(stored.id);
      }
      if (stored) {
        const ok = await verifyPassword(password, stored.passwordHash);
        if (!ok) return res.status(401).json({ error: 'INVALID CREDENTIALS' });
        const user = publicUser(stored);
        const token = await createToken(user, { plan: 'free', passwordHash: stored.passwordHash });
        setAuthCookie(res, token, origin);
        return res.status(200).json({ success: true, user });
      }
    }

    if (builtin) {
      const user = publicUser(builtin);
      const token = await createToken(user, { plan: 'free', passwordHash: builtin.passwordHash });
      setAuthCookie(res, token, origin);
      return res.status(200).json({ success: true, user });
    }

    const session = await getAuthSession(req);
    if (session?.email === email && session.passwordHash) {
      const ok = await verifyPassword(password, session.passwordHash);
      if (!ok) return res.status(401).json({ error: 'INVALID CREDENTIALS' });
      const user = publicUser(session);
      const token = await createToken(user, {
        plan: session.plan === 'paid' ? 'paid' : 'free',
        board: session.board,
        passwordHash: session.passwordHash,
      });
      setAuthCookie(res, token, origin);
      return res.status(200).json({ success: true, user });
    }

    return res.status(401).json({ error: 'INVALID CREDENTIALS' });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'LOGIN FAILED. TRY AGAIN.' });
  }
}
