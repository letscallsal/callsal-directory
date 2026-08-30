import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHmac } from 'crypto';

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

export interface SessionBoard {
  leads: Array<{
    slug: string;
    placeId?: string;
    stage: string;
    addedAt: string;
    updatedAt: string;
    oracleDraft?: string;
    note?: string;
    log?: Array<{ at: string; type: string; from?: string; to?: string; text?: string }>;
    name?: string;
    category?: string;
    city?: string;
    region?: string;
    address?: string;
    phone?: string;
    website?: string;
    email?: string;
    ownerName?: string;
    photo?: string;
    mapsUrl?: string;
  }>;
  lastScanByCity?: Record<string, string>;
  oracleDays?: Record<string, number>;
}

export interface AuthSession extends DirectoryUser {
  plan?: 'free' | 'paid';
  board?: SessionBoard;
  passwordHash?: string;
}

const BUILTIN_EMAIL = 'letscallsal@gmail.com';
const BUILTIN_HASH = '$2b$10$yvl9JGntkjfnkp1lhmUUaezBOB2oC5ANpB9ucjZKaje7KWK6GLHLq';

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

export function userIdFromEmail(email: string): string {
  const normalized = email.trim().toLowerCase();
  return createHmac('sha256', jwtSecret())
    .update(`directory:id:v2:${normalized}`)
    .digest('hex')
    .slice(0, 32);
}

export function userFromEmail(email: string): DirectoryUser {
  const normalized = email.trim().toLowerCase();
  return { id: userIdFromEmail(normalized), email: normalized, name: normalized.split('@')[0] };
}

export function isBuiltInEmail(email: string): boolean {
  return email.trim().toLowerCase() === BUILTIN_EMAIL;
}

export function builtInHash(): string {
  return BUILTIN_HASH;
}

export function userFromCredentials(email: string, _password?: string): DirectoryUser {
  return userFromEmail(email);
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

export async function builtInUser(email: string, password: string): Promise<StoredUser | null> {
  if (!isBuiltInEmail(email)) return null;
  if (!(await verifyPassword(password, BUILTIN_HASH))) return null;
  const user = userFromEmail(BUILTIN_EMAIL);
  return {
    ...user,
    passwordHash: BUILTIN_HASH,
    createdAt: '2026-01-01T00:00:00.000Z',
  };
}

export async function createToken(
  user: DirectoryUser,
  extra?: { plan?: 'free' | 'paid'; board?: SessionBoard; passwordHash?: string },
): Promise<string> {
  const jwt = (await import('jsonwebtoken')).default;
  const payload: Record<string, unknown> = { sub: user.id, email: user.email, name: user.name };
  if (extra?.plan) payload.pl = extra.plan;
  if (extra?.board) payload.bd = extra.board;
  if (extra?.passwordHash) payload.ph = extra.passwordHash;
  return jwt.sign(payload, jwtSecret(), { expiresIn: '7d' });
}

export async function verifyToken(token: string): Promise<DirectoryUser | null> {
  const session = await verifySession(token);
  if (!session) return null;
  return { id: session.id, email: session.email, name: session.name };
}

export async function verifySession(token: string): Promise<AuthSession | null> {
  try {
    const jwt = (await import('jsonwebtoken')).default;
    const decoded = jwt.verify(token, jwtSecret());
    if (typeof decoded === 'string') return null;
    const payload = decoded as {
      sub: string;
      email: string;
      name: string;
      pl?: 'free' | 'paid';
      bd?: SessionBoard;
      ph?: string;
    };
    if (!payload.sub || !payload.email) return null;
    return {
      id: payload.sub,
      email: payload.email,
      name: payload.name,
      plan: payload.pl,
      board: payload.bd,
      passwordHash: payload.ph,
    };
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
  const session = await getAuthSession(req);
  if (!session) return null;
  return { id: session.id, email: session.email, name: session.name };
}

export async function getAuthSession(req: VercelRequest): Promise<AuthSession | null> {
  const token = getTokenFromRequest(req);
  if (!token) return null;
  return verifySession(token);
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
