import { findMetro, type Metro } from './metros.js';
import type { Shop, ShopCategory, PlacesResult } from './places.js';

const USER_AGENT = 'CallsalDirectory/1.0 (https://directory.callsal.app)';
const OVERPASS_URLS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
  'https://overpass.openstreetmap.fr/api/interpreter',
  'https://maps.mail.ru/osm/tools/overpass/api/interpreter',
];

const SKIP_AMENITY = new Set([
  'parking',
  'parking_space',
  'parking_entrance',
  'bench',
  'waste_basket',
  'toilets',
  'atm',
  'vending_machine',
  'bicycle_parking',
  'shelter',
  'place_of_worship',
  'school',
  'college',
  'university',
  'kindergarten',
  'grave_yard',
  'fountain',
  'clock',
]);

type OsmTags = Record<string, string>;
type OsmEl = {
  type?: string;
  id?: number;
  lat?: number;
  lon?: number;
  center?: { lat?: number; lon?: number };
  tags?: OsmTags;
};

type PhotonFeature = {
  geometry?: { coordinates?: number[] };
  properties?: {
    osm_type?: string;
    osm_id?: number;
    name?: string;
    street?: string;
    housenumber?: string;
    postcode?: string;
    city?: string;
    state?: string;
    country?: string;
    countrycode?: string;
    osm_key?: string;
    osm_value?: string;
  };
};

const NICHE_OVERPASS: Record<string, string> = {
  food: '["amenity"~"^(restaurant|cafe|fast_food|bar|pub|ice_cream)$"]',
  barber: '["shop"~"^(hairdresser|barber)$"]',
  dental: '["amenity"="dentist"]',
  legal: '["office"~"^(lawyer|attorney)$"]',
  salon: '["shop"~"^(beauty|cosmetics|hairdresser)$"]',
  accounting: '["office"~"^(accountant|tax_advisor)$"]',
  auto: '["shop"~"^(car_repair|car)$"]',
  fitness: '["leisure"~"^(fitness_centre|sports_centre)$"]',
  wellness: '["leisure"="spa"]',
  trades: '["craft"~"^(plumber|electrician|carpenter|painter|hvac)$"]',
};

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 72);
}

export function osmMapsUrl(type: string, id: number): string {
  const kind = type === 'way' ? 'way' : type === 'relation' ? 'relation' : 'node';
  return `https://www.openstreetmap.org/${kind}/${id}`;
}

async function jsonGet<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
    });
    if (!res.ok) return null;
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

function overpassQuery(lat: number, lng: number, radius: number, niche: string): string {
  const r = Math.round(Math.max(400, Math.min(radius, 25000)));
  const around = `(around:${r},${lat},${lng})`;
  const phone = (filter: string) =>
    `nwr${filter}["name"]["phone"]${around};nwr${filter}["name"]["contact:phone"]${around};`;
  const typed = NICHE_OVERPASS[niche];
  const body = typed
    ? phone(typed)
    : [
        phone('["shop"]'),
        phone('["office"]'),
        phone('["craft"]'),
        phone('["amenity"~"^(restaurant|cafe|fast_food|bar|pub|ice_cream|clinic|dentist|doctors|pharmacy|veterinary|car_wash|bank)$"]'),
        phone('["leisure"~"^(fitness_centre|sports_centre|spa)$"]'),
      ].join('');
  return `[out:json][timeout:22];(${body});out center 160;`;
}

async function overpassSearch(lat: number, lng: number, radius: number, niche: string): Promise<OsmEl[]> {
  const data = overpassQuery(lat, lng, radius, niche);
  for (const endpoint of OVERPASS_URLS) {
    try {
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'User-Agent': USER_AGENT,
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          Accept: 'application/json',
        },
        body: 'data=' + encodeURIComponent(data),
      });
      if (!res.ok) continue;
      const json = (await res.json()) as { elements?: OsmEl[] };
      if (Array.isArray(json.elements)) return json.elements;
    } catch {
      /* try next mirror */
    }
  }
  return [];
}

function categoryFromOsm(tags: OsmTags): ShopCategory {
  const amenity = tags.amenity || '';
  const shop = tags.shop || '';
  const office = tags.office || '';
  const leisure = tags.leisure || '';
  const craft = tags.craft || '';
  const blob = `${amenity} ${shop} ${office} ${leisure} ${craft}`.toLowerCase();
  if (blob.includes('barber') || shop === 'hairdresser') return shop === 'beauty' ? 'salon' : 'barber';
  if (shop === 'beauty' || shop === 'cosmetics' || amenity === 'salon') return 'salon';
  if (amenity === 'dentist') return 'dental';
  if (office === 'lawyer' || office === 'attorney') return 'legal';
  if (office === 'accountant' || office === 'tax_advisor') return 'accounting';
  if (shop === 'car_repair' || shop === 'car') return 'auto';
  if (leisure === 'fitness_centre' || leisure === 'sports_centre') return 'fitness';
  if (leisure === 'spa' || shop === 'massage') return 'wellness';
  if (['plumber', 'electrician', 'carpenter', 'painter', 'hvac'].includes(craft)) return 'trades';
  if (['restaurant', 'cafe', 'fast_food', 'bar', 'pub', 'ice_cream'].includes(amenity) || shop === 'bakery') {
    return 'food';
  }
  return 'other';
}

function mapOsmEl(el: OsmEl, metro: Metro, niche: string): Shop | null {
  const tags = el.tags || {};
  const name = String(tags.name || '').trim();
  if (!name) return null;
  if (SKIP_AMENITY.has(tags.amenity || '')) return null;
  const lat = Number(el.lat ?? el.center?.lat);
  const lng = Number(el.lon ?? el.center?.lon);
  const phone = String(tags.phone || tags['contact:phone'] || tags['contact:mobile'] || '').trim();
  const website = String(tags.website || tags['contact:website'] || '').trim();
  const email = String(tags.email || tags['contact:email'] || '').trim();
  const hours = String(tags.opening_hours || '').trim();
  const street = [tags['addr:housenumber'], tags['addr:street']].filter(Boolean).join(' ');
  const city = tags['addr:city'] || metro.city;
  const region = tags['addr:state'] || metro.region;
  const address = [street, city, region, tags['addr:postcode']].filter(Boolean).join(', ');
  const id = Number(el.id);
  const type = String(el.type || 'node');
  const category = categoryFromOsm(tags);
  return {
    name,
    slug: `${slugify(name)}-${slugify(city)}-${id || 'x'}`,
    city,
    region,
    country: metro.country,
    address: address || undefined,
    phone: phone || undefined,
    website: website || undefined,
    email: email || undefined,
    placeId: id ? `osm:${type}:${id}` : undefined,
    mapsUrl: id ? osmMapsUrl(type, id) : `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}`,
    hours: hours ? [hours] : undefined,
    lat: Number.isFinite(lat) ? lat : undefined,
    lng: Number.isFinite(lng) ? lng : undefined,
    primaryType: tags.shop || tags.amenity || tags.office || tags.craft || tags.leisure || undefined,
    category: niche && category === 'other' ? (niche as ShopCategory) : category,
    verified: {
      phone: Boolean(phone),
      website: Boolean(website),
      email: Boolean(email),
      address: Boolean(address),
      ownerName: false,
      socials: false,
      photo: false,
    },
  };
}

export async function searchOsmArea(
  metro: Metro,
  radius: number,
  niche: string,
): Promise<Shop[]> {
  const els = await overpassSearch(metro.lat, metro.lng, radius, niche);
  return els
    .map((el) => mapOsmEl(el, metro, niche))
    .filter((shop): shop is Shop => Boolean(shop && shop.phone));
}

export async function photonGeocode(query: string): Promise<Metro | undefined> {
  const known = findMetro(query);
  if (known && !/,/.test(query)) return known;
  const data = await jsonGet<{ features?: PhotonFeature[] }>(
    `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=1&lang=en`,
  );
  const hit = data?.features?.[0];
  const coords = hit?.geometry?.coordinates;
  if (!hit || !Array.isArray(coords) || coords.length < 2) return undefined;
  const lng = Number(coords[0]);
  const lat = Number(coords[1]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  const props = hit.properties || {};
  const city = String(props.city || props.name || query.split(',')[0]).trim();
  const regionRaw = String(props.state || '').trim();
  const region = /^[A-Za-z]{2}$/.test(regionRaw) ? regionRaw.toUpperCase() : regionRaw;
  const country = String(props.countrycode || '').toUpperCase();
  const catalog = findMetro(city, region, country);
  if (catalog) return catalog;
  return { city, region, country, lat, lng };
}

export async function photonReverse(lat: number, lng: number): Promise<Metro | undefined> {
  const data = await jsonGet<{ features?: PhotonFeature[] }>(
    `https://photon.komoot.io/reverse?lat=${encodeURIComponent(String(lat))}&lon=${encodeURIComponent(String(lng))}&lang=en`,
  );
  const hit = data?.features?.[0];
  const props = hit?.properties || {};
  const city = String(props.city || props.name || '').trim();
  const regionRaw = String(props.state || '').trim();
  const region = /^[A-Za-z]{2}$/.test(regionRaw) ? regionRaw.toUpperCase() : regionRaw;
  const country = String(props.countrycode || '').toUpperCase();
  return { city, region, country, lat, lng };
}

export type OsmSuggestion = {
  id: string;
  label: string;
  main: string;
  secondary: string;
};

function encodeGeoId(lat: number, lng: number, city: string, region: string, country: string, label: string): string {
  return ['geo', lat.toFixed(5), lng.toFixed(5), city, region, country, label].join('|');
}

export function decodeGeoId(id: string): {
  lat: number;
  lng: number;
  city: string;
  region: string;
  country: string;
  label: string;
} | undefined {
  if (!id.startsWith('geo|')) return undefined;
  const parts = id.split('|');
  if (parts.length < 7) return undefined;
  const lat = Number(parts[1]);
  const lng = Number(parts[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return undefined;
  return {
    lat,
    lng,
    city: parts[3] || '',
    region: parts[4] || '',
    country: parts[5] || '',
    label: parts.slice(6).join('|'),
  };
}

export async function photonSuggest(query: string): Promise<OsmSuggestion[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const data = await jsonGet<{ features?: PhotonFeature[] }>(
    `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=8&lang=en`,
  );
  return (data?.features || [])
    .map((feature) => {
      const coords = feature.geometry?.coordinates;
      if (!Array.isArray(coords) || coords.length < 2) return null;
      const lng = Number(coords[0]);
      const lat = Number(coords[1]);
      if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
      const props = feature.properties || {};
      const main = String(props.name || '').trim();
      const city = String(props.city || '').trim();
      const region = String(props.state || '').trim();
      const country = String(props.countrycode || props.country || '').trim();
      const street = [props.housenumber, props.street].filter(Boolean).join(' ');
      const secondary = [street || city, region, country].filter(Boolean).join(', ');
      const label = [main || street || city, secondary].filter(Boolean).join(', ');
      if (!label) return null;
      return {
        id: encodeGeoId(lat, lng, city || main, region, country.toUpperCase(), label),
        label,
        main: main || label,
        secondary,
      };
    })
    .filter((row): row is OsmSuggestion => Boolean(row));
}
