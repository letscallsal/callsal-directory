import type { VercelRequest, VercelResponse } from '@vercel/node';
import { setCorsHeaders } from './lib/auth.js';

export default function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const key = (
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_PLACES_API_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GEMINI_API_KEY ||
    ''
  ).trim();

  if (!key) return res.status(500).json({ error: 'Server configuration error' });
  res.setHeader('Cache-Control', 'public, max-age=60');
  return res.status(200).json({ key });
}
