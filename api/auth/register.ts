import type { VercelRequest, VercelResponse } from '@vercel/node';
import {
  MIN_PASSWORD_LENGTH,
  builtInUser,
  createToken,
  ensureFreePlan,
  getAuthSession,
  hashPassword,
  isBuiltInEmail,
  loadUserByEmail,
  matchesSetupKey,
  publicUser,
  saveUser,
  setAuthCookie,
  setCorsHeaders,
  setUserPassword,
  userFromEmail,
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

async function signIn(
  res: VercelResponse,
  user: { id: string; email: string; name: string },
  origin: string,
  status: number,
  passwordHash: string,
) {
  const token = await createToken(user, { plan: 'free', passwordHash });
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

    const builtin = await builtInUser(email, password);
    if (isBuiltInEmail(email)) {
      if (!builtin) return res.status(409).json({ error: 'EMAIL ALREADY REGISTERED' });
      if (isPersistentStorage()) {
        const existing = await loadUserByEmail(email);
        if (!existing) {
          await saveUser(builtin);
          await ensureFreePlan(builtin.id);
        }
      }
      return signIn(res, publicUser(builtin), origin, 200, builtin.passwordHash);
    }

    const persist = isPersistentStorage();
    const existing = persist ? await loadUserByEmail(email) : null;
    if (existing) {
      const reset = matchesSetupKey(setupKeyFrom(req));
      if (!reset && !(await verifyPassword(password, existing.passwordHash))) {
        return res.status(409).json({ error: 'EMAIL ALREADY REGISTERED' });
      }
      const user = reset ? await setUserPassword(existing, password) : existing;
      await ensureFreePlan(user.id);
      return signIn(res, publicUser(user), origin, 200, user.passwordHash);
    }

    const session = await getAuthSession(req);
    if (!persist && session?.email === email && session.passwordHash) {
      if (!(await verifyPassword(password, session.passwordHash))) {
        return res.status(409).json({ error: 'EMAIL ALREADY REGISTERED' });
      }
      return signIn(res, publicUser(session), origin, 200, session.passwordHash);
    }

    const identity = userFromEmail(email);
    const user: StoredUser = {
      id: identity.id,
      email: identity.email,
      name: identity.name,
      passwordHash: await hashPassword(password),
      createdAt: new Date().toISOString(),
    };
    if (persist) {
      await saveUser(user);
      await ensureFreePlan(user.id);
    }
    return signIn(res, publicUser(user), origin, persist ? 201 : 201, user.passwordHash);
  } catch (err) {
    console.error('Register error:', err);
    return res.status(500).json({ error: 'REGISTRATION FAILED. TRY AGAIN.' });
  }
}
