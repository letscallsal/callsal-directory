import seed from './milton-seed.js';
import { findMetro, type Metro } from './metros.js';
import {
  decodeGeoId,
  photonGeocode,
  photonReverse,
  photonSuggest,
  searchOsmArea,
} from './osm-search.js';

export type ShopCategory =
  | 'dental'
  | 'salon'
  | 'food'
  | 'barber'
  | 'legal'
  | 'accounting'
  | 'auto'
  | 'fitness'
  | 'wellness'
  | 'trades'
  | 'other';

export interface ShopVerified {
  phone: boolean;
  website: boolean;
  email: boolean;
  address: boolean;
  ownerName: boolean;
  socials: boolean;
  photo: boolean;
}

export interface Shop {
  name: string;
  slug: string;
  city: string;
  region: string;
  country: string;
  address?: string;
  phone?: string;
  website?: string;
  email?: string;
  ownerName?: string;
  socials?: { instagram?: string };
  photo?: string;
  placeId?: string;
  mapsUrl?: string;
  rating?: number;
  reviews?: number;
  hours?: string[];
  lat?: number;
  lng?: number;
  status?: string;
  openNow?: boolean;
  summary?: string;
  primaryType?: string;
  priceLevel?: string;
  priceRange?: string;
  serviceArea?: boolean;
  openingDate?: string;
  flagged?: boolean;
  category: ShopCategory;
  verified: ShopVerified;
}

export interface PlacesResult {
  source: 'places' | 'listings' | 'seed';
  city: string;
  region?: string;
  country?: string;
  lat?: number;
  lng?: number;
  radius?: number;
  shops: Shop[];
}

const TYPE_LABELS: Record<string, string> = {
  barber: 'Barber',
  food: 'Food',
  dental: 'Dental',
  legal: 'Legal',
  salon: 'Salon',
  accounting: 'Accounting',
  auto: 'Auto',
  fitness: 'Fitness',
  wellness: 'Wellness',
  trades: 'Trades',
  other: 'Local',
};

const NICHE_QUERIES: Array<{
  category: ShopCategory;
  query: string;
  includedType: string;
  osmTag: string;
}> = [
  { category: 'food', query: 'restaurants', includedType: 'restaurant', osmTag: 'amenity:restaurant' },
  { category: 'barber', query: 'barber shops', includedType: 'barber_shop', osmTag: 'shop:hairdresser' },
  { category: 'dental', query: 'dentists', includedType: 'dentist', osmTag: 'amenity:dentist' },
  { category: 'legal', query: 'lawyers', includedType: 'lawyer', osmTag: 'office:lawyer' },
  { category: 'salon', query: 'hair salons', includedType: 'beauty_salon', osmTag: 'shop:beauty' },
  { category: 'accounting', query: 'accountants', includedType: 'accounting', osmTag: 'office:accountant' },
  { category: 'auto', query: 'auto repair', includedType: 'car_repair', osmTag: 'shop:car_repair' },
  { category: 'fitness', query: 'gyms', includedType: 'gym', osmTag: 'leisure:fitness_centre' },
  { category: 'wellness', query: 'spas', includedType: 'spa', osmTag: 'amenity:spa' },
  { category: 'trades', query: 'plumbers', includedType: 'plumber', osmTag: 'craft:electrician' },
];

const CACHE_TTL = 60 * 60 * 24 * 7;
const USER_AGENT = 'CallsalDirectory/1.0 (https://directory.callsal.app)';

export function typeLabel(slug: string): string {
  return TYPE_LABELS[slug] || 'Local';
}

export function seedShops(): Shop[] {
  return (seed.shops as Shop[]).slice();
}

export function shopDedupeKey(shop: {
  placeId?: string;
  slug?: string;
  name: string;
  address?: string;
  city?: string;
}): string {
  if (shop.placeId) return `place:${shop.placeId}`;
  if (shop.slug) return `slug:${shop.slug}`;
  const street = (shop.address || '').split(',')[0] || '';
  const norm = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '');
  return `loc:${norm(shop.name)}|${norm(street)}|${norm(shop.city || '')}`;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 72);
}

function mapsSearchUrl(name: string, address?: string): string {
  const query = [name, address].filter(Boolean).join(' ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
}

function parseFormattedAddress(
  formatted: string | undefined,
  fallback: { city: string; region: string; country: string },
): { city: string; region: string; country: string; address?: string } {
  if (!formatted) return fallback;
  const parts = formatted.split(',').map((part) => part.trim()).filter(Boolean);
  let country = fallback.country;
  let region = fallback.region;
  let city = fallback.city;
  if (parts.length >= 2) {
    const last = parts[parts.length - 1];
    if (/canada/i.test(last)) country = 'CA';
    else if (/united states|usa\b/i.test(last)) country = 'US';
    const regionPart = /canada|united states|usa/i.test(last) ? parts[parts.length - 2] : last;
    const regionMatch = regionPart.match(/\b([A-Z]{2})\b/);
    if (regionMatch) region = regionMatch[1];
    const cityIdx = /canada|united states|usa/i.test(last) ? parts.length - 3 : parts.length - 2;
    if (cityIdx >= 0) city = parts[cityIdx].replace(/\b[A-Z]{2}\b/, '').replace(/\d.*/, '').trim() || city;
  }
  return { city, region, country, address: formatted };
}

function pickCategory(types: string[], fallback: ShopCategory): ShopCategory {
  const from = categoryFromTypes(types);
  if (fallback === 'barber' && (from === 'salon' || from === 'wellness' || from === 'other')) return 'barber';
  if (from === 'other') return fallback || 'other';
  return from;
}

function categoryFromTypes(types: string[]): ShopCategory {
  const blob = types.join(' ').toLowerCase();
  if (blob.includes('barber')) return 'barber';
  if (blob.includes('dentist') || blob.includes('dental')) return 'dental';
  if (blob.includes('lawyer') || blob.includes('attorney') || blob.includes('legal')) return 'legal';
  if (blob.includes('accounting') || blob.includes('accountant')) return 'accounting';
  if (blob.includes('car_repair') || blob.includes('auto')) return 'auto';
  if (blob.includes('gym') || blob.includes('fitness')) return 'fitness';
  if (blob.includes('spa') || blob.includes('wellness')) return 'wellness';
  if (blob.includes('plumber') || blob.includes('electrician') || blob.includes('contractor')) return 'trades';
  if (blob.includes('restaurant') || blob.includes('cafe') || blob.includes('bakery') || blob.includes('food')) {
    return 'food';
  }
  if (blob.includes('beauty') || blob.includes('hair_care') || blob.includes('hair_salon') || blob.includes('salon')) {
    return 'salon';
  }
  return 'other';
}

function categoryFromOsm(osmKey: string, osmValue: string): ShopCategory {
  const key = `${osmKey}:${osmValue}`.toLowerCase();
  if (key.includes('barber') || key === 'shop:hairdresser') return 'barber';
  if (key.includes('dentist')) return 'dental';
  if (key.includes('lawyer') || key.includes('attorney')) return 'legal';
  if (key.includes('accountant') || key.includes('tax')) return 'accounting';
  if (key.includes('car_repair') || key.includes('car')) return 'auto';
  if (key.includes('fitness') || key.includes('gym') || key.includes('sports_centre')) return 'fitness';
  if (key.includes('spa') || key.includes('massage')) return 'wellness';
  if (key.includes('plumber') || key.includes('electrician') || key.includes('carpenter') || key.includes('hardware')) {
    return 'trades';
  }
  if (
    key.includes('restaurant') ||
    key.includes('cafe') ||
    key.includes('fast_food') ||
    key.includes('bakery') ||
    key.includes('pub')
  ) {
    return 'food';
  }
  if (key.includes('beauty') || key.includes('salon') || key.includes('hairdresser')) return 'salon';
  return 'other';
}

function haversineMeters(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const R = 6371000;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const s =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((a.lat * Math.PI) / 180) * Math.cos((b.lat * Math.PI) / 180) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * R * Math.asin(Math.sqrt(s));
}

const NON_LEAD_TYPES = new Set([
  'school',
  'primary_school',
  'secondary_school',
  'university',
  'church',
  'hindu_temple',
  'mosque',
  'synagogue',
  'place_of_worship',
  'cemetery',
  'park',
  'campground',
  'locality',
  'political',
  'neighborhood',
  'sublocality',
  'route',
  'street_address',
  'plus_code',
  'bus_station',
  'subway_station',
  'train_station',
  'transit_station',
  'light_rail_station',
  'airport',
  'city_hall',
  'courthouse',
  'fire_station',
  'police',
  'post_office',
  'library',
  'embassy',
]);

function isLeadWorthy(types: string[]): boolean {
  return !(types || []).some((type) => NON_LEAD_TYPES.has(String(type || '').toLowerCase()));
}

function cacheKey(city: string, region: string, country: string, category: string): string {
  const norm = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '');
  return `directory:places:v8:${norm(country)}:${norm(region)}:${norm(city)}:${norm(category) || 'all'}`;
}

async function readCache(key: string): Promise<PlacesResult | null> {
  try {
    const { getStorage } = await import('./storage.js');
    const storage = await getStorage();
    const hit = await storage.get<{ at: number; result: PlacesResult }>(key);
    if (!hit?.result) return null;
    if (Date.now() - hit.at > CACHE_TTL * 1000) return null;
    return hit.result;
  } catch {
    return null;
  }
}

async function writeCache(key: string, result: PlacesResult): Promise<void> {
  try {
    const { getStorage } = await import('./storage.js');
    const storage = await getStorage();
    await storage.set(key, { at: Date.now(), result }, CACHE_TTL);
  } catch {
    /* memory-only hosts skip */
  }
}

const FRANCHISE_PATTERNS = [
  /anytime fitness/i, /planet fitness/i, /goodlife/i, /fit4less/i,
  /mcdonald/i, /starbucks/i, /tim horton/i, /subway/i, /pizza hut/i,
  /domino/i, /wendy/i, /burger king/i, /taco bell/i, /\bkfc\b/i,
  /great clips/i, /sport clips/i, /supercuts/i, /cost cutters/i,
  /jiffy lube/i, /midas/i, /h&r block/i, /massage envy/i,
  /the ups store/i, /fedex office/i, /walmart/i, /costco/i,
  /home depot/i, /canadian tire/i, /shoppers drug/i,
];

function isFranchise(name: string): boolean {
  return FRANCHISE_PATTERNS.some((pattern) => pattern.test(name));
}


function mergeShops(groups: Shop[][]): Shop[] {
  const merged = new Map<string, Shop>();
  const score = (shop: Shop) =>
    (shop.phone ? 4 : 0) + (shop.website ? 2 : 0) + (shop.address ? 1 : 0);
  for (const group of groups) {
    for (const shop of group) {
      if (isFranchise(shop.name)) continue;
      const key = shopDedupeKey(shop);
      const prev = merged.get(key);
      if (!prev || score(shop) > score(prev)) merged.set(key, shop);
    }
  }
  return [...merged.values()].sort((a, b) => a.name.localeCompare(b.name));
}

function seedForCity(city: string): Shop[] {
  const want = city.trim().toLowerCase();
  if (!want) return seedShops();
  return seedShops().filter((shop) => shop.city.toLowerCase() === want);
}

async function geocodeCity(query: string): Promise<Metro | undefined> {
  return photonGeocode(query);
}

function areaCacheKey(lat: number, lng: number, radius: number, category: string): string {
  const rlat = Math.round(lat * 200) / 200;
  const rlng = Math.round(lng * 200) / 200;
  const r = Math.round(radius / 250) * 250;
  return `directory:places:osm:v1:${rlat}:${rlng}:${r}:${category || 'all'}`;
}

export async function listCityShops(
  city = '',
  region = '',
  country = '',
  category = '',
): Promise<PlacesResult> {
  const rawCity = city.trim();
  if (!rawCity) return { source: 'places', city: '', shops: [] };

  const metro =
    findMetro(rawCity, region, country) ||
    (await geocodeCity([rawCity, region, country].filter(Boolean).join(' ')));
  if (!metro) {
    return { source: 'seed', city: rawCity, region, country, shops: seedForCity(rawCity) };
  }

  const niche = category.trim().toLowerCase();
  const key = cacheKey(metro.city, metro.region, metro.country, niche);
  const cached = await readCache(key);
  if (cached) return cached;

  const live = mergeShops([await searchOsmArea(metro, 8000, niche)]);
  const result: PlacesResult = {
    source: live.length ? 'places' : 'listings',
    city: metro.city,
    region: metro.region,
    country: metro.country,
    lat: metro.lat,
    lng: metro.lng,
    shops: live.slice(0, 160),
  };
  if (live.length) await writeCache(key, result);
  return result;
}

export async function listAreaShops(opts: {
  lat: number;
  lng: number;
  radius?: number;
  category?: string;
}): Promise<PlacesResult> {
  const lat = Number(opts.lat);
  const lng = Number(opts.lng);
  const radius = Math.max(600, Math.min(Number(opts.radius) || 4000, 25000));
  const niche = String(opts.category || '').trim().toLowerCase();
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
    return { source: 'seed', city: '', shops: [] };
  }

  const key = areaCacheKey(lat, lng, radius, niche);
  const cached = await readCache(key);
  if (cached) return cached;

  const metro = (await photonReverse(lat, lng)) || { city: '', region: '', country: '', lat, lng };
  const live = mergeShops([await searchOsmArea({ ...metro, lat, lng }, radius, niche)]).filter((shop) => {
    if (!Number.isFinite(Number(shop.lat)) || !Number.isFinite(Number(shop.lng))) return true;
    return haversineMeters({ lat, lng }, { lat: Number(shop.lat), lng: Number(shop.lng) }) <= radius * 1.25;
  });

  const result: PlacesResult = {
    source: live.length ? 'places' : 'listings',
    city: metro.city,
    region: metro.region,
    country: metro.country,
    lat,
    lng,
    radius,
    shops: live.slice(0, 160),
  };
  if (live.length) await writeCache(key, result);
  return result;
}

export type PlaceSuggestion = {
  id: string;
  label: string;
  main: string;
  secondary: string;
};

export type ResolvedPlace = {
  lat: number;
  lng: number;
  city: string;
  region: string;
  country: string;
  label: string;
};

export async function suggestPlaces(query: string): Promise<PlaceSuggestion[]> {
  return photonSuggest(query);
}

export async function resolvePlace(placeId: string): Promise<ResolvedPlace | undefined> {
  const decoded = decodeGeoId(placeId.trim());
  if (!decoded) return undefined;
  return {
    lat: decoded.lat,
    lng: decoded.lng,
    city: decoded.city,
    region: decoded.region,
    country: decoded.country,
    label: decoded.label,
  };
}

export async function resolveQuery(query: string): Promise<ResolvedPlace | undefined> {
  const q = query.trim();
  if (!q) return undefined;
  const suggestions = await suggestPlaces(q);
  if (suggestions[0]?.id) {
    const hit = await resolvePlace(suggestions[0].id);
    if (hit) return hit;
  }
  const geo = await geocodeCity(q);
  if (!geo) return undefined;
  return {
    lat: geo.lat,
    lng: geo.lng,
    city: geo.city,
    region: geo.region,
    country: geo.country,
    label: [geo.city, geo.region, geo.country].filter(Boolean).join(', ') || q,
  };
}
