import type { VercelRequest, VercelResponse } from '@vercel/node';
import { clearAuthCookie, setCorsHeaders } from '../lib/auth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
  clearAuthCookie(res, req.headers.origin || '');
  return res.status(200).json({ success: true });
}
