import type { VercelRequest, VercelResponse } from '@vercel/node';
import { setCorsHeaders } from './lib/auth.js';
import { resolvePlace, resolveQuery, suggestPlaces } from './lib/places.js';

export const config = { maxDuration: 15 };

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const placeId = String(req.query.placeId || '').trim();
  const query = String(req.query.q || '').trim();
  const resolve = String(req.query.resolve || '') === '1';

  if (placeId) {
    const place = await resolvePlace(placeId);
    if (!place) return res.status(404).json({ error: 'Place not found' });
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
    return res.status(200).json({ place });
  }

  if (resolve && query) {
    const place = await resolveQuery(query);
    if (!place) return res.status(404).json({ error: 'Place not found' });
    res.setHeader('Cache-Control', 'public, s-maxage=120, stale-while-revalidate=600');
    return res.status(200).json({ place });
  }

  const suggestions = query.length >= 2 ? await suggestPlaces(query) : [];
  res.setHeader('Cache-Control', 'public, s-maxage=60, stale-while-revalidate=300');
  return res.status(200).json({ suggestions });
}
