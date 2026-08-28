import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  createToken,
  hashPassword,
  isFreeTestLogin,
  loadUserByEmail,
  publicUser,
  saveUser,
  setAuthCookie,
  setCorsHeaders,
  upsertFreeTestUser,
} from '../lib/auth.js';
import type { StoredUser } from '../lib/auth.js';

function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const password = String(req.body?.password || '');
    const origin = req.headers.origin || '';

    if (!validEmail(email)) return res.status(400).json({ error: 'VALID EMAIL REQUIRED' });
    if (password.length < 8) return res.status(400).json({ error: 'PASSWORD MUST BE AT LEAST 8 CHARACTERS' });

    if (isFreeTestLogin(email, password)) {
      const user = await upsertFreeTestUser();
      const pub = publicUser(user);
      const token = await createToken(pub);
      setAuthCookie(res, token, origin);
      return res.status(201).json({ success: true, user: pub });
    }

    const existing = await loadUserByEmail(email);
    if (existing) return res.status(409).json({ error: 'EMAIL ALREADY REGISTERED' });

    const user: StoredUser = {
      id: crypto.randomUUID(),
      email,
      name: email.split('@')[0],
      passwordHash: await hashPassword(password),
      createdAt: new Date().toISOString(),
    };
    await saveUser(user);
    const pub = publicUser(user);
    const token = await createToken(pub);
    setAuthCookie(res, token, origin);
    return res.status(201).json({ success: true, user: pub });
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ error: 'REGISTRATION FAILED. TRY AGAIN.' });
  }
}
