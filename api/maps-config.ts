import type { VercelRequest, VercelResponse } from '@vercel/node';
import { setCorsHeaders } from './lib/auth.js';
import { resolveGoogleKey } from './lib/google-key.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const key = await resolveGoogleKey();
  if (!key) return res.status(500).json({ error: 'Google Maps is not configured' });
  res.setHeader('Cache-Control', 'private, max-age=60');
  return res.status(200).json({ key });
}
