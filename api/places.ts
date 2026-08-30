import type { VercelRequest, VercelResponse } from '@vercel/node';
import { setCorsHeaders } from './lib/auth.js';
import { listAreaShops, listCityShops } from './lib/places.js';

export const config = { maxDuration: 30 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const lat = Number(req.query.lat);
  const lng = Number(req.query.lng);
  const radius = Number(req.query.radius);
  const city = String(req.query.city || '').trim();
  const region = String(req.query.region || '').trim();
  const country = String(req.query.country || '').trim();
  const category = String(req.query.category || '').trim().toLowerCase();

  const result = Number.isFinite(lat) && Number.isFinite(lng)
    ? await listAreaShops({ lat, lng, radius, category })
    : await listCityShops(city || 'milton', region, country, category);

  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
  return res.status(200).json({
    city: result.city,
    region: result.region,
    country: result.country,
    lat: result.lat,
    lng: result.lng,
    radius: result.radius,
    source: result.source,
    shops: result.shops,
  });
}