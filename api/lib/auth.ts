import type { VercelRequest, VercelResponse } from '@vercel/node';

export const COOKIE_NAME = 'directory_auth';
const COOKIE_MAX_AGE = 60 * 60 * 24 * 7;
export const MIN_PASSWORD_LENGTH = 6;

export interface DirectoryUser {
  id: string;
  email: string;
  name: string;
}

export interface StoredUser extends DirectoryUser {
  passwordHash: string;
  createdAt: string;
}

function jwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (secret) return secret;
  if (process.env.VERCEL === '1') {
    console.warn('JWT_SECRET missing; signing with directory fallback');
  }
  return 'callsal-directory-fallback-do-not-ship-as-prod-secret';
}

export function matchesSetupKey(value: string): boolean {
  const key = String(value || '');
  return key.length > 0 && key === jwtSecret();
}

export function publicUser(user: StoredUser | DirectoryUser): DirectoryUser {
  return { id: user.id, email: user.email, name: user.name };
}

export async function hashPassword(password: string): Promise<string> {
  const bcrypt = (await import('bcryptjs')).default;
  return bcrypt.hashSync(password, 10);
}

export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  const bcrypt = (await import('bcryptjs')).default;
  return bcrypt.compareSync(password, hash);
}

export async function createToken(user: DirectoryUser): Promise<string> {
  const jwt = (await import('jsonwebtoken')).default;
  return jwt.sign(
    { sub: user.id, email: user.email, name: user.name },
    jwtSecret(),
    { expiresIn: '7d' },
  );
}

export async function verifyToken(token: string): Promise<DirectoryUser | null> {
  try {
    const jwt = (await import('jsonwebtoken')).default;
    const decoded = jwt.verify(token, jwtSecret());
    if (typeof decoded === 'string') return null;
    const payload = decoded as { sub: string; email: string; name: string };
    return { id: payload.sub, email: payload.email, name: payload.name };
  } catch {
    return null;
  }
}

export function getTokenFromRequest(req: VercelRequest): string | null {
  const cookies = req.headers.cookie;
  if (!cookies) return null;
  const match = cookies.match(new RegExp(`${COOKIE_NAME}=([^;]+)`));
  return match ? decodeURIComponent(match[1]) : null;
}

export async function getAuthUser(req: VercelRequest): Promise<DirectoryUser | null> {
  const token = getTokenFromRequest(req);
  if (!token) return null;
  return verifyToken(token);
}

function cookieDomain(origin: string): string {
  const isCallsalDomain = origin.includes('callsal.app') && !origin.includes('vercel.app');
  return isCallsalDomain ? '; Domain=.callsal.app' : '';
}

function cookieFlags(origin: string): string {
  const isProduction = process.env.NODE_ENV === 'production' || process.env.VERCEL === '1';
  return `Path=/; HttpOnly; SameSite=Lax${isProduction ? '; Secure' : ''}${cookieDomain(origin)}`;
}

export function setAuthCookie(res: VercelResponse, token: string, origin = '') {
  res.setHeader('Set-Cookie', [`${COOKIE_NAME}=${token}; ${cookieFlags(origin)}; Max-Age=${COOKIE_MAX_AGE}`]);
}

export function clearAuthCookie(res: VercelResponse, origin = '') {
  res.setHeader('Set-Cookie', [`${COOKIE_NAME}=; ${cookieFlags(origin)}; Max-Age=0`]);
}

export function emailKey(email: string): string {
  return `directory:user:email:${email.trim().toLowerCase()}`;
}

export function userIdKey(id: string): string {
  return `directory:user:id:${id}`;
}

export function bookmarksKey(userId: string): string {
  return `directory:bookmarks:${userId}`;
}

export function leadsKey(userId: string): string {
  return `directory:leads:${userId}`;
}

export function planKey(userId: string): string {
  return `directory:plan:${userId}`;
}

export async function loadUserByEmail(email: string): Promise<StoredUser | null> {
  const { getStorage } = await import('./storage.js');
  const storage = await getStorage();
  return storage.get<StoredUser>(emailKey(email));
}

export async function saveUser(user: StoredUser): Promise<void> {
  const { getStorage } = await import('./storage.js');
  const storage = await getStorage();
  await storage.set(emailKey(user.email), user);
  await storage.set(userIdKey(user.id), user);
}

export async function setUserPassword(user: StoredUser, password: string): Promise<StoredUser> {
  const next = { ...user, passwordHash: await hashPassword(password) };
  await saveUser(next);
  return next;
}

export async function ensureFreePlan(userId: string): Promise<void> {
  const { getStorage } = await import('./storage.js');
  const storage = await getStorage();
  const plan = await storage.get<string>(planKey(userId));
  if (plan === 'paid') return;
  await storage.set(planKey(userId), 'free');
}

const allowedOrigins = [
  'https://directory.callsal.app',
  'https://callsal.app',
  'https://www.callsal.app',
  'http://localhost:3000',
  'http://localhost:4321',
  'http://localhost:5173',
];

export function isAllowedOrigin(origin: string): boolean {
  if (allowedOrigins.includes(origin)) return true;
  if (origin.match(/^https:\/\/callsal.*\.vercel\.app$/)) return true;
  return false;
}

export function setCorsHeaders(req: VercelRequest, res: VercelResponse) {
  const origin = req.headers.origin || '';
  if (isAllowedOrigin(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-directory-setup');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
}
