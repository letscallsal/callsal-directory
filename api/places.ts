import type { VercelRequest, VercelResponse } from '@vercel/node';
import { setCorsHeaders } from './lib/auth.js';
import { listCityShops } from './lib/places.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const city = String(req.query.city || 'milton').trim().toLowerCase();
  const result = await listCityShops(city);
  return res.status(200).json({
    city: result.city,
    source: result.source,
    shops: result.shops,
  });
}
