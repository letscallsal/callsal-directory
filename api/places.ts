import type { VercelRequest, VercelResponse } from '@vercel/node';
import { setCorsHeaders } from './lib/auth.js';
import { listCityShops } from './lib/places.js';

export const config = { maxDuration: 30 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const city = String(req.query.city || '').trim();
  const region = String(req.query.region || '').trim();
  const country = String(req.query.country || '').trim();
  const category = String(req.query.category || '').trim().toLowerCase();
  const result = await listCityShops(city || 'milton', region, country, category);
  res.setHeader('Cache-Control', 'public, s-maxage=3600, stale-while-revalidate=86400');
  return res.status(200).json({
    city: result.city,
    region: result.region,
    country: result.country,
    source: result.source,
    shops: result.shops,
  });
}
