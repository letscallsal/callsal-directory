import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  createToken,
  getAuthSession,
  loadUserByEmail,
  publicUser,
  setAuthCookie,
  setCorsHeaders,
  userFromCredentials,
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

    if (!isPersistentStorage()) {
      const user = userFromCredentials(email, password);
      const existing = await getAuthSession(req);
      const extra = existing && existing.id === user.id
        ? { plan: existing.plan === 'paid' ? 'paid' as const : 'free' as const, board: existing.board }
        : { plan: 'free' as const };
      const token = await createToken(user, extra);
      setAuthCookie(res, token, origin);
      return res.status(200).json({ success: true, user });
    }

    const stored = await loadUserByEmail(email);
    if (!stored) return res.status(401).json({ error: 'INVALID CREDENTIALS' });

    const ok = await verifyPassword(password, stored.passwordHash);
    if (!ok) return res.status(401).json({ error: 'INVALID CREDENTIALS' });

    const user = publicUser(stored);
    const token = await createToken(user);
    setAuthCookie(res, token, origin);
    return res.status(200).json({ success: true, user });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'LOGIN FAILED. TRY AGAIN.' });
  }
}
