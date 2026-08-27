import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createToken, loadUserByEmail, publicUser, setAuthCookie, setCorsHeaders, verifyPassword } from '../lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const origin = req.headers.origin || '';

    if (!email || !password) return res.status(400).json({ error: 'EMAIL AND PASSWORD REQUIRED' });

    const user = await loadUserByEmail(email);
    if (!user) return res.status(401).json({ error: 'INVALID CREDENTIALS' });

    const ok = await verifyPassword(password, user.passwordHash);
    if (!ok) return res.status(401).json({ error: 'INVALID CREDENTIALS' });

    const pub = publicUser(user);
    const token = await createToken(pub);
    setAuthCookie(res, token, origin);
    return res.status(200).json({ success: true, user: pub });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(500).json({ error: 'LOGIN FAILED. TRY AGAIN.' });
  }
}
