import type { VercelRequest, VercelResponse } from '@vercel/node';
import { bookmarksKey, getAuthUser, setCorsHeaders } from './lib/auth.js';
import { getStorage } from './lib/storage.js';

const SLUG = /^[a-z0-9][a-z0-9-]{0,80}$/;

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();

  const user = await getAuthUser(req);
  if (!user) return res.status(401).json({ error: 'Not authenticated' });

  const storage = await getStorage();
  const key = bookmarksKey(user.id);
  const current = (await storage.get<string[]>(key)) ?? [];

  if (req.method === 'GET') {
    return res.status(200).json({ slugs: current });
  }

  const slug = String(req.body?.slug || req.query?.slug || '').trim().toLowerCase();
  if (!SLUG.test(slug)) return res.status(400).json({ error: 'VALID LISTING SLUG REQUIRED' });

  if (req.method === 'POST') {
    const slugs = current.includes(slug) ? current : [...current, slug];
    await storage.set(key, slugs);
    return res.status(200).json({ slugs });
  }

  if (req.method === 'DELETE') {
    const slugs = current.filter((item) => item !== slug);
    await storage.set(key, slugs);
    return res.status(200).json({ slugs });
  }

  return res.status(405).json({ error: 'Method not allowed' });
}
