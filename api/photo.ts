import type { VercelRequest, VercelResponse } from '@vercel/node';
import { setCorsHeaders } from './lib/auth.js';
import { placesApiKey } from './lib/places.js';

const CACHE_HIT = 'public, s-maxage=86400, stale-while-revalidate=604800';
const CACHE_MISS = 'public, s-maxage=3600';

type PhotoOk = { status: 'ok'; redirect?: string; body?: Buffer; contentType?: string };
type PhotoResult = PhotoOk | { status: 'config' } | { status: 'miss' };

function queryValue(value: string | string[] | undefined): string {
  return String(Array.isArray(value) ? value[0] : value || '').trim();
}

function normalizePlaceId(raw: string): string {
  return raw.replace(/^places\//, '').trim();
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  setCorsHeaders(req, res);
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const key = placesApiKey();
  if (!key) return res.status(500).json({ error: 'Server configuration error' });

  const placeId = normalizePlaceId(queryValue(req.query.placeId));
  const name = queryValue(req.query.name).slice(0, 160);
  const address = queryValue(req.query.address).slice(0, 240);
  if (!placeId && !name) return res.status(400).json({ error: 'Missing placeId' });

  try {
    const result = await resolveListingPhoto(key, placeId, name, address);
    if (result.status === 'config') {
      return res.status(500).json({ error: 'Server configuration error' });
    }
    if (result.status === 'miss') {
      res.setHeader('Cache-Control', CACHE_MISS);
      return res.status(404).end();
    }
    res.setHeader('Cache-Control', CACHE_HIT);
    if (result.redirect) {
      res.setHeader('Location', result.redirect);
      return res.status(302).end();
    }
    if (result.body) {
      res.setHeader('Content-Type', result.contentType || 'image/jpeg');
      return res.status(200).send(result.body);
    }
    res.setHeader('Cache-Control', CACHE_MISS);
    return res.status(404).end();
  } catch {
    res.setHeader('Cache-Control', CACHE_MISS);
    return res.status(404).end();
  }
}

async function resolveListingPhoto(
  key: string,
  placeId: string,
  name: string,
  address: string,
): Promise<PhotoResult> {
  const fromNew = await photoViaNewApi(key, placeId, name, address);
  if (fromNew.status !== 'miss') return fromNew;
  return photoViaLegacyApi(key, placeId, name, address);
}

async function photoViaNewApi(
  key: string,
  placeId: string,
  name: string,
  address: string,
): Promise<PhotoResult> {
  const headers = {
    'Content-Type': 'application/json',
    'X-Goog-Api-Key': key,
    'X-Goog-FieldMask': 'places.id,places.photos',
  };

  let id = placeId;
  let photoName = '';

  if (id) {
    const details = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`, {
      headers: {
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'photos',
      },
    });
    if (details.status === 401 || details.status === 403) return { status: 'config' };
    if (details.ok) {
      const data = (await details.json()) as { photos?: Array<{ name?: string }> };
      photoName = data.photos?.[0]?.name || '';
    }
  } else if (name) {
    const query = [name, address].filter(Boolean).join(' ');
    const search = await fetch('https://places.googleapis.com/v1/places:searchText', {
      method: 'POST',
      headers,
      body: JSON.stringify({ textQuery: query, pageSize: 1 }),
    });
    if (search.status === 401 || search.status === 403) return { status: 'config' };
    if (search.ok) {
      const data = (await search.json()) as {
        places?: Array<{ id?: string; photos?: Array<{ name?: string }> }>;
      };
      const place = data.places?.[0];
      id = place?.id || '';
      photoName = place?.photos?.[0]?.name || '';
    }
  }

  if (!photoName && id && id !== placeId) {
    const details = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(id)}`, {
      headers: {
        'X-Goog-Api-Key': key,
        'X-Goog-FieldMask': 'photos',
      },
    });
    if (details.ok) {
      const data = (await details.json()) as { photos?: Array<{ name?: string }> };
      photoName = data.photos?.[0]?.name || '';
    }
  }

  if (!photoName) return { status: 'miss' };

  const media = await fetch(
    `https://places.googleapis.com/v1/${photoName}/media?maxWidthPx=800&skipHttpRedirect=true`,
    { headers: { 'X-Goog-Api-Key': key } },
  );
  if (media.status === 401 || media.status === 403) return { status: 'config' };
  if (!media.ok) return { status: 'miss' };
  const body = (await media.json()) as { photoUri?: string };
  if (!body.photoUri) return { status: 'miss' };
  return { status: 'ok', redirect: body.photoUri };
}

async function photoViaLegacyApi(
  key: string,
  placeId: string,
  name: string,
  address: string,
): Promise<PhotoResult> {
  let ref = '';
  let denied = false;

  if (placeId) {
    const details = await legacyJson(
      'https://maps.googleapis.com/maps/api/place/details/json',
      { place_id: placeId, fields: 'photos' },
      key,
    );
    if (details.status === 'REQUEST_DENIED') denied = true;
    ref = details.result?.photos?.[0]?.photo_reference || '';
  }

  if (!ref && name) {
    const found = await legacyJson(
      'https://maps.googleapis.com/maps/api/place/findplacefromtext/json',
      {
        input: [name, address].filter(Boolean).join(' '),
        inputtype: 'textquery',
        fields: 'place_id,photos',
      },
      key,
    );
    if (found.status === 'REQUEST_DENIED') denied = true;
    const candidate = found.candidates?.[0];
    ref = candidate?.photos?.[0]?.photo_reference || '';
    if (!ref && candidate?.place_id) {
      const details = await legacyJson(
        'https://maps.googleapis.com/maps/api/place/details/json',
        { place_id: candidate.place_id, fields: 'photos' },
        key,
      );
      if (details.status === 'REQUEST_DENIED') denied = true;
      ref = details.result?.photos?.[0]?.photo_reference || '';
    }
  }

  if (!ref) return denied ? { status: 'config' } : { status: 'miss' };

  const params = new URLSearchParams({
    maxwidth: '800',
    photoreference: ref,
    key,
  });
  const image = await fetch(`https://maps.googleapis.com/maps/api/place/photo?${params}`);
  if (!image.ok) return { status: 'miss' };
  const bytes = Buffer.from(await image.arrayBuffer());
  if (bytes.length < 80) return { status: 'miss' };
  return {
    status: 'ok',
    body: bytes,
    contentType: image.headers.get('content-type') || 'image/jpeg',
  };
}

async function legacyJson(
  endpoint: string,
  params: Record<string, string>,
  key: string,
): Promise<{
  status?: string;
  result?: { photos?: Array<{ photo_reference?: string }> };
  candidates?: Array<{ place_id?: string; photos?: Array<{ photo_reference?: string }> }>;
}> {
  const search = new URLSearchParams({ ...params, key });
  const res = await fetch(`${endpoint}?${search}`);
  if (!res.ok) return {};
  return (await res.json()) as {
    status?: string;
    result?: { photos?: Array<{ photo_reference?: string }> };
    candidates?: Array<{ place_id?: string; photos?: Array<{ photo_reference?: string }> }>;
  };
}
