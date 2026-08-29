import seed from './milton-seed.js';
import { findMetro, type Metro } from './metros.js';

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
  category: ShopCategory;
  verified: ShopVerified;
}

export interface PlacesResult {
  source: 'places' | 'listings' | 'seed';
  city: string;
  region?: string;
  country?: string;
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

export function placesApiKey(): string | undefined {
  const key = process.env.GOOGLE_PLACES_API_KEY || process.env.GOOGLE_API_KEY;
  const trimmed = key?.trim();
  return trimmed || undefined;
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

function cacheKey(city: string, region: string, country: string, category: string): string {
  const norm = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '');
  return `directory:places:v3:${norm(country)}:${norm(region)}:${norm(city)}:${norm(category) || 'all'}`;
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

type GooglePlace = {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  types?: string[];
  photos?: Array<{ name?: string }>;
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  regularOpeningHours?: { weekdayDescriptions?: string[] };
};

async function searchGoogleNiche(
  metro: Metro,
  niche: (typeof NICHE_QUERIES)[number],
  key: string,
): Promise<Shop[]> {
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask':
        'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.types,places.photos,places.rating,places.userRatingCount,places.googleMapsUri,places.regularOpeningHours.weekdayDescriptions',
    },
    body: JSON.stringify({
      textQuery: `${niche.query} in ${metro.city} ${metro.region}`,
      pageSize: 20,
      languageCode: 'en',
      regionCode: metro.country,
      includedType: niche.includedType,
      locationBias: {
        circle: {
          center: { latitude: metro.lat, longitude: metro.lng },
          radius: 18000,
        },
      },
    }),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { places?: GooglePlace[] };
  return (data.places || [])
    .map((place) => mapGooglePlace(place, metro, niche.category))
    .filter((shop): shop is Shop => Boolean(shop));
}

function mapGooglePlace(place: GooglePlace, metro: Metro, fallbackCategory: ShopCategory): Shop | null {
  const name = place.displayName?.text?.trim();
  if (!name) return null;
  const parsed = parseFormattedAddress(place.formattedAddress, metro);
  const slug = `${slugify(name)}-${slugify(parsed.city)}`;
  const photo = place.id && place.photos?.length
    ? `/api/photo?placeId=${encodeURIComponent(place.id)}`
    : undefined;
  return {
    name,
    slug,
    city: parsed.city,
    region: parsed.region,
    country: parsed.country,
    address: parsed.address,
    phone: place.nationalPhoneNumber,
    website: place.websiteUri,
    placeId: place.id,
    photo,
    mapsUrl: place.googleMapsUri || mapsSearchUrl(name, parsed.address),
    rating: place.rating,
    reviews: place.userRatingCount,
    hours: place.regularOpeningHours?.weekdayDescriptions,
    category: categoryFromTypes(place.types || []) === 'other' ? fallbackCategory : categoryFromTypes(place.types || []),
    verified: {
      phone: Boolean(place.nationalPhoneNumber),
      website: Boolean(place.websiteUri),
      email: false,
      address: Boolean(place.formattedAddress),
      ownerName: false,
      socials: false,
      photo: Boolean(photo),
    },
  };
}

type PhotonFeature = {
  geometry?: { coordinates?: number[] };
  properties?: {
    name?: string;
    osm_type?: string;
    osm_id?: number;
    osm_key?: string;
    osm_value?: string;
    street?: string;
    housenumber?: string;
    postcode?: string;
    city?: string;
    state?: string;
    countrycode?: string;
    country?: string;
  };
};

async function photonGet(url: string): Promise<PhotonFeature[]> {
  const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' } });
  if (!res.ok) return [];
  const data = (await res.json()) as { features?: PhotonFeature[] };
  return data.features || [];
}

async function geocodeCity(query: string): Promise<Metro | undefined> {
  const known = findMetro(query);
  if (known) return known;
  const features = await photonGet(
    `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=5&lang=en`,
  );
  for (const feature of features) {
    const props = feature.properties || {};
    const code = (props.countrycode || '').toUpperCase();
    if (code !== 'CA' && code !== 'US') continue;
    const city = (props.city || props.name || '').trim();
    if (!city) continue;
    const catalogHit = findMetro(city, '', code);
    if (catalogHit) return catalogHit;
    const stateRaw = String(props.state || '').trim();
    const region = /^[A-Za-z]{2}$/.test(stateRaw)
      ? stateRaw.toUpperCase()
      : stateRaw.replace(/[^A-Za-z]/g, '').slice(0, 2).toUpperCase() || (code === 'CA' ? 'ON' : 'NY');
    const coords = feature.geometry?.coordinates;
    const lng = Array.isArray(coords) ? Number(coords[0]) : 0;
    const lat = Array.isArray(coords) ? Number(coords[1]) : 0;
    return {
      city,
      region,
      country: code as 'CA' | 'US',
      lat: Number.isFinite(lat) ? lat : 0,
      lng: Number.isFinite(lng) ? lng : 0,
    };
  }
  return undefined;
}

function mapPhotonFeature(feature: PhotonFeature, metro: Metro, fallbackCategory: ShopCategory): Shop | null {
  const props = feature.properties || {};
  const name = props.name?.trim();
  if (!name) return null;
  const code = (props.countrycode || metro.country).toUpperCase();
  if (code !== 'CA' && code !== 'US') return null;
  const city = (props.city || metro.city).trim();
  const stateRaw = String(props.state || metro.region).trim();
  const region = /^[A-Za-z]{2}$/.test(stateRaw) ? stateRaw.toUpperCase() : metro.region;
  const street = [props.housenumber, props.street].filter(Boolean).join(' ');
  const address = [street, city, region, props.postcode].filter(Boolean).join(', ');
  const osmId = props.osm_id ? `osm:${props.osm_type || 'N'}:${props.osm_id}` : undefined;
  const category = props.osm_key && props.osm_value
    ? categoryFromOsm(props.osm_key, props.osm_value)
    : fallbackCategory;
  return {
    name,
    slug: `${slugify(name)}-${slugify(city)}`,
    city,
    region,
    country: code,
    address: address || undefined,
    placeId: osmId,
    mapsUrl: mapsSearchUrl(name, address),
    category: category === 'other' ? fallbackCategory : category,
    verified: {
      phone: false,
      website: false,
      email: false,
      address: Boolean(address),
      ownerName: false,
      socials: false,
      photo: false,
    },
  };
}

async function searchPhotonNiche(metro: Metro, niche: (typeof NICHE_QUERIES)[number]): Promise<Shop[]> {
  const query = `${niche.query} ${metro.city} ${metro.region}`;
  const features = await photonGet(
    `https://photon.komoot.io/api/?q=${encodeURIComponent(query)}&limit=10&lang=en&osm_tag=${encodeURIComponent(niche.osmTag)}`,
  );
  return features
    .map((feature) => mapPhotonFeature(feature, metro, niche.category))
    .filter((shop): shop is Shop => Boolean(shop));
}

function mergeShops(groups: Shop[][]): Shop[] {
  const merged = new Map<string, Shop>();
  const score = (shop: Shop) =>
    (shop.placeId && !String(shop.placeId).startsWith('osm:') ? 16 : 0) +
    (shop.photo ? 8 : 0) +
    (shop.website ? 4 : 0) +
    (shop.phone ? 2 : 0) +
    (shop.rating ? 1 : 0);
  for (const group of groups) {
    for (const shop of group) {
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

export async function listCityShops(
  city = 'milton',
  region = '',
  country = '',
  category = '',
): Promise<PlacesResult> {
  const rawCity = city.trim();
  if (!rawCity) {
    return { source: 'seed', city: 'Milton', region: 'ON', country: 'CA', shops: seedShops() };
  }

  const metro = findMetro(rawCity, region, country) || (await geocodeCity([rawCity, region, country].filter(Boolean).join(' ')));
  if (!metro) {
    const local = seedForCity(rawCity);
    return { source: 'seed', city: rawCity, region, country, shops: local };
  }

  const niche = category.trim().toLowerCase();
  const key = cacheKey(metro.city, metro.region, metro.country, niche);
  const cached = await readCache(key);
  if (cached) return cached;

  const wanted = NICHE_QUERIES.filter((item) => !niche || item.category === niche);
  const googleKey = placesApiKey();
  let source: PlacesResult['source'] = 'listings';
  let live: Shop[] = [];

  if (googleKey) {
    try {
      const groups = await Promise.all(wanted.map((item) => searchGoogleNiche(metro, item, googleKey)));
      live = mergeShops(groups);
      if (live.length) source = 'places';
    } catch {
      live = [];
    }
  }

  if (!live.length) {
    const groups = await Promise.all(wanted.map((item) => searchPhotonNiche(metro, item)));
    live = mergeShops(groups);
    source = live.length ? 'listings' : 'seed';
  }

  const shops = mergeShops([live, seedForCity(metro.city)]);
  const result: PlacesResult = {
    source: shops.length ? source : 'seed',
    city: metro.city,
    region: metro.region,
    country: metro.country,
    shops,
  };
  if (live.length) await writeCache(key, result);
  return result;
}
