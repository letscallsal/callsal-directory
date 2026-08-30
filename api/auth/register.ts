import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  MIN_PASSWORD_LENGTH,
  createToken,
  ensureFreePlan,
  hashPassword,
  loadUserByEmail,
  matchesSetupKey,
  publicUser,
  saveUser,
  setAuthCookie,
  setCorsHeaders,
  setUserPassword,
  verifyPassword,
} from '../lib/auth.js';
import type { StoredUser } from '../lib/auth.js';
import { isPersistentStorage } from '../lib/storage.js';

function validEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function setupKeyFrom(req: VercelRequest): string {
  const header = req.headers['x-directory-setup'];
  return Array.isArray(header) ? header[0] || '' : String(header || '');
}

async function signIn(res: VercelResponse, user: { id: string; email: string; name: string }, origin: string, status: number) {
  const token = await createToken(user, { plan: 'free' });
  setAuthCookie(res, token, origin);
  return res.status(status).json({ success: true, user: publicUser(user) });
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
    if (password.length < MIN_PASSWORD_LENGTH) {
      return res.status(400).json({ error: `PASSWORD MUST BE AT LEAST ${MIN_PASSWORD_LENGTH} CHARACTERS` });
    }

    if (!isPersistentStorage()) {
      return res.status(503).json({ error: 'ACCOUNT STORAGE IS NOT CONFIGURED' });
    }

    const existing = await loadUserByEmail(email);
    if (existing) {
      const reset = matchesSetupKey(setupKeyFrom(req));
      if (!reset && !(await verifyPassword(password, existing.passwordHash))) {
        return res.status(409).json({ error: 'EMAIL ALREADY REGISTERED' });
      }
      const user = reset ? await setUserPassword(existing, password) : existing;
      await ensureFreePlan(user.id);
      return signIn(res, publicUser(user), origin, 200);
    }

    const user: StoredUser = {
      id: crypto.randomUUID(),
      email,
      name: email.split('@')[0],
      passwordHash: await hashPassword(password),
      createdAt: new Date().toISOString(),
    };
    await saveUser(user);
    await ensureFreePlan(user.id);
    return signIn(res, publicUser(user), origin, 201);
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ error: 'REGISTRATION FAILED. TRY AGAIN.' });
  }
}
