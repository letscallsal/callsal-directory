import seed from './milton-seed.js';
import { findMetro, type Metro } from './metros.js';
import { resolveGoogleKey } from './google-key.js';

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
  { category: 'barber', query: 'barber shops', includedType: 'hair_care', osmTag: 'shop:hairdresser' },
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
  return `directory:places:v5:${norm(country)}:${norm(region)}:${norm(city)}:${norm(category) || 'all'}`;
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
  location?: { latitude?: number; longitude?: number };
};

async function searchGoogleNiche(
  metro: Metro,
  niche: (typeof NICHE_QUERIES)[number],
  key: string,
  radius = 18000,
): Promise<Shop[]> {
  const inPlace = metro.city && metro.city !== 'Map' ? ` in ${metro.city} ${metro.region}` : '';
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask':
        'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.types,places.photos,places.rating,places.userRatingCount,places.googleMapsUri,places.regularOpeningHours.weekdayDescriptions,places.location',
    },
    body: JSON.stringify({
      textQuery: `${niche.query}${inPlace}`,
      pageSize: 20,
      languageCode: 'en',
      regionCode: metro.country,
      locationBias: {
        circle: {
          center: { latitude: metro.lat, longitude: metro.lng },
          radius,
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
    lat: place.location?.latitude,
    lng: place.location?.longitude,
    category: pickCategory(place.types || [], fallbackCategory),
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

type LegacyPlace = {
  place_id?: string;
  name?: string;
  formatted_address?: string;
  vicinity?: string;
  rating?: number;
  user_ratings_total?: number;
  types?: string[];
  geometry?: { location?: { lat?: number; lng?: number } };
};

type LegacyDetails = {
  name?: string;
  formatted_address?: string;
  formatted_phone_number?: string;
  website?: string;
  rating?: number;
  user_ratings_total?: number;
  url?: string;
  opening_hours?: { weekday_text?: string[] };
  geometry?: { location?: { lat?: number; lng?: number } };
};

async function fetchLegacyJson<T>(url: string): Promise<T | null> {
  const res = await fetch(url);
  if (!res.ok) return null;
  return (await res.json()) as T;
}

async function reverseGeocode(lat: number, lng: number, key: string): Promise<Metro | undefined> {
  const data = await fetchLegacyJson<{
    status?: string;
    results?: Array<{
      address_components?: Array<{ long_name?: string; short_name?: string; types?: string[] }>;
    }>;
  }>(`https://maps.googleapis.com/maps/api/geocode/json?latlng=${lat},${lng}&key=${key}`);
  if (!data || data.status !== 'OK' || !data.results?.length) return undefined;
  const comps = data.results[0].address_components || [];
  const pick = (type: string, short = false) => {
    const hit = comps.find((item) => (item.types || []).includes(type));
    return (short ? hit?.short_name : hit?.long_name) || '';
  };
  const city = pick('locality') || pick('postal_town') || pick('administrative_area_level_3');
  const region = pick('administrative_area_level_1', true);
  const countryRaw = pick('country', true);
  if (!city || (countryRaw !== 'CA' && countryRaw !== 'US')) return undefined;
  return { city, region, country: countryRaw, lat, lng };
}

async function enrichWithDetails(shops: Shop[], metro: Metro, key: string, limit = 32): Promise<Shop[]> {
  const head = shops.slice(0, limit);
  const tail = shops.slice(limit);
  const filled = await Promise.all(
    head.map(async (shop) => {
      if (!shop.placeId) return shop;
      const payload = await fetchLegacyJson<{ status?: string; result?: LegacyDetails }>(
        `https://maps.googleapis.com/maps/api/place/details/json?place_id=${encodeURIComponent(shop.placeId)}` +
          `&fields=name,formatted_address,formatted_phone_number,website,rating,user_ratings_total,opening_hours,url,geometry&key=${key}`,
      );
      if (payload?.status !== 'OK' || !payload.result) return shop;
      const details = payload.result;
      const parsed = parseFormattedAddress(details.formatted_address, metro);
      const phone = details.formatted_phone_number || shop.phone;
      const website = details.website || shop.website;
      return {
        ...shop,
        name: details.name || shop.name,
        city: parsed.city && parsed.city !== 'Map' ? parsed.city : shop.city,
        region: parsed.region || shop.region,
        country: parsed.country || shop.country,
        address: parsed.address || shop.address,
        phone,
        website,
        mapsUrl: details.url || shop.mapsUrl,
        rating: details.rating ?? shop.rating,
        reviews: details.user_ratings_total ?? shop.reviews,
        hours: details.opening_hours?.weekday_text || shop.hours,
        lat: details.geometry?.location?.lat ?? shop.lat,
        lng: details.geometry?.location?.lng ?? shop.lng,
        verified: {
          ...shop.verified,
          phone: Boolean(phone),
          website: Boolean(website),
          address: Boolean(parsed.address || shop.address),
        },
      };
    }),
  );
  return [...filled, ...tail];
}

async function searchLegacyNiche(
  metro: Metro,
  niche: (typeof NICHE_QUERIES)[number],
  key: string,
  radius = 18000,
): Promise<Shop[]> {
  const inPlace = metro.city && metro.city !== 'Map' ? ` in ${metro.city} ${metro.region}` : '';
  const query = encodeURIComponent(`${niche.query}${inPlace}`);
  const searchUrl =
    `https://maps.googleapis.com/maps/api/place/textsearch/json?query=${query}` +
    `&location=${metro.lat},${metro.lng}&radius=${Math.round(radius)}&key=${key}`;
  const data = await fetchLegacyJson<{ status?: string; results?: LegacyPlace[] }>(searchUrl);
  if (!data || (data.status !== 'OK' && data.status !== 'ZERO_RESULTS') || !data.results?.length) {
    return [];
  }

  const basics = data.results
    .filter((place) => place.place_id && place.name && !isFranchise(place.name))
    .slice(0, 16);

  const detailed = await Promise.all(
    basics.slice(0, 12).map(async (place) => {
      const detailsUrl =
        `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place.place_id}` +
        `&fields=name,formatted_address,formatted_phone_number,website,rating,user_ratings_total,opening_hours,url,geometry&key=${key}`;
      const payload = await fetchLegacyJson<{ status?: string; result?: LegacyDetails }>(detailsUrl);
      return mapLegacyPlace(place, metro, niche.category, payload?.status === 'OK' ? payload.result : undefined);
    }),
  );

  const rest = basics.slice(12).map((place) => mapLegacyPlace(place, metro, niche.category));
  return [...detailed, ...rest].filter((shop): shop is Shop => Boolean(shop));
}

function mapLegacyPlace(
  place: LegacyPlace,
  metro: Metro,
  fallbackCategory: ShopCategory,
  details?: LegacyDetails,
  allowFranchise = false,
): Shop | null {
  const name = (details?.name || place.name || '').trim();
  if (!name || (!allowFranchise && isFranchise(name))) return null;
  const parsed = parseFormattedAddress(
    details?.formatted_address || place.formatted_address || place.vicinity,
    metro,
  );
  const placeId = place.place_id;
  const photo = placeId ? `/api/photo?placeId=${encodeURIComponent(placeId)}` : undefined;
  const phone = details?.formatted_phone_number;
  const website = details?.website;
  return {
    name,
    slug: `${slugify(name)}-${slugify(parsed.city)}`,
    city: parsed.city,
    region: parsed.region,
    country: parsed.country,
    address: parsed.address,
    phone,
    website,
    placeId,
    photo,
    mapsUrl: details?.url || mapsSearchUrl(name, parsed.address),
    rating: details?.rating ?? place.rating,
    reviews: details?.user_ratings_total ?? place.user_ratings_total,
    hours: details?.opening_hours?.weekday_text,
    lat: details?.geometry?.location?.lat ?? place.geometry?.location?.lat,
    lng: details?.geometry?.location?.lng ?? place.geometry?.location?.lng,
    category: pickCategory(place.types || [], fallbackCategory),
    verified: {
      phone: Boolean(phone),
      website: Boolean(website),
      email: false,
      address: Boolean(parsed.address),
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
  const googleKey = await resolveGoogleKey();
  if (googleKey) {
    const data = await fetchLegacyJson<{
      status?: string;
      results?: Array<{
        formatted_address?: string;
        geometry?: { location?: { lat?: number; lng?: number } };
        address_components?: Array<{ long_name?: string; short_name?: string; types?: string[] }>;
      }>;
    }>(
      `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(query)}` +
        `&components=country:CA|country:US&key=${googleKey}`,
    );
    if (data?.status === 'OK' && data.results?.length) {
      const hit = data.results[0];
      const comps = hit.address_components || [];
      const pick = (type: string, short = false) => {
        const row = comps.find((item) => (item.types || []).includes(type));
        return (short ? row?.short_name : row?.long_name) || '';
      };
      const city = pick('locality') || pick('postal_town') || pick('administrative_area_level_3') || query.split(',')[0].trim();
      const region = pick('administrative_area_level_1', true);
      const countryRaw = pick('country', true);
      const lat = hit.geometry?.location?.lat;
      const lng = hit.geometry?.location?.lng;
      if (city && (countryRaw === 'CA' || countryRaw === 'US') && Number.isFinite(lat) && Number.isFinite(lng)) {
        const catalogHit = findMetro(city, region, countryRaw);
        if (catalogHit) return catalogHit;
        return { city, region, country: countryRaw, lat: lat as number, lng: lng as number };
      }
    }
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
  const coords = feature.geometry?.coordinates;
  const lng = Array.isArray(coords) ? Number(coords[0]) : undefined;
  const lat = Array.isArray(coords) ? Number(coords[1]) : undefined;
  return {
    name,
    slug: `${slugify(name)}-${slugify(city)}`,
    city,
    region,
    country: code,
    address: address || undefined,
    placeId: osmId,
    mapsUrl: mapsSearchUrl(name, address),
    lat: Number.isFinite(lat) ? lat : undefined,
    lng: Number.isFinite(lng) ? lng : undefined,
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

async function searchPhotonArea(
  lat: number,
  lng: number,
  niche: (typeof NICHE_QUERIES)[number],
): Promise<Shop[]> {
  const metro: Metro = {
    city: 'Map',
    region: '',
    country: lat >= 41.6 && lng <= -52 && lng >= -141 && lat <= 83.2 ? 'CA' : 'US',
    lat,
    lng,
  };
  const features = await photonGet(
    `https://photon.komoot.io/api/?q=${encodeURIComponent(niche.query)}&lat=${lat}&lon=${lng}&limit=12&lang=en&osm_tag=${encodeURIComponent(niche.osmTag)}`,
  );
  return features
    .map((feature) => mapPhotonFeature(feature, metro, niche.category))
    .filter((shop): shop is Shop => Boolean(shop));
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
  const googleKey = await resolveGoogleKey();
  let source: PlacesResult['source'] = 'listings';
  let live: Shop[] = [];

  if (googleKey) {
    try {
      const groups = await Promise.all(wanted.map((item) => searchLegacyNiche(metro, item, googleKey)));
      live = mergeShops(groups);
      if (live.length) source = 'places';
    } catch {
      live = [];
    }
    if (!live.length) {
      try {
        const groups = await Promise.all(wanted.map((item) => searchGoogleNiche(metro, item, googleKey)));
        live = mergeShops(groups).filter((shop) => !isFranchise(shop.name));
        if (live.length) source = 'places';
      } catch {
        live = [];
      }
    }
  }

  const shops = live;
  const result: PlacesResult = {
    source: live.length ? 'places' : 'seed',
    city: metro.city,
    region: metro.region,
    country: metro.country,
    lat: metro.lat,
    lng: metro.lng,
    shops,
  };
  if (live.length) await writeCache(key, result);
  return result;
}

function areaCacheKey(lat: number, lng: number, radius: number, category: string): string {
  const rlat = Math.round(lat * 200) / 200;
  const rlng = Math.round(lng * 200) / 200;
  const r = Math.round(radius / 250) * 250;
  return `directory:places:area:v7:${rlat}:${rlng}:${r}:${category || 'all'}`;
}

function offsetLatLng(lat: number, lng: number, northM: number, eastM: number): { lat: number; lng: number } {
  const dLat = northM / 111320;
  const dLng = eastM / (111320 * Math.cos((lat * Math.PI) / 180) || 1);
  return { lat: lat + dLat, lng: lng + dLng };
}

function areaCells(lat: number, lng: number, radius: number): Array<{ lat: number; lng: number; radius: number }> {
  if (radius <= 1600) return [{ lat, lng, radius }];
  const step = radius * 0.52;
  const cellR = Math.max(700, radius * 0.58);
  return [
    [-1, -1],
    [-1, 1],
    [1, -1],
    [1, 1],
  ].map(([north, east]) => {
    const point = offsetLatLng(lat, lng, north * step, east * step);
    return { lat: point.lat, lng: point.lng, radius: cellR };
  });
}

async function searchLegacyNearby(
  metro: Metro,
  key: string,
  radius: number,
  type = '',
  pages = 1,
): Promise<Shop[]> {
  let url =
    `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${metro.lat},${metro.lng}` +
    `&radius=${Math.round(radius)}&key=${key}`;
  if (type) url += `&type=${encodeURIComponent(type)}`;
  const shops: Shop[] = [];
  for (let page = 0; page < pages; page += 1) {
    const data = await fetchLegacyJson<{
      status?: string;
      results?: LegacyPlace[];
      next_page_token?: string;
    }>(url);
    if (!data || (data.status !== 'OK' && data.status !== 'ZERO_RESULTS')) break;
    for (const place of data.results || []) {
      const fallback = type ? categoryFromTypes([type, ...(place.types || [])]) : categoryFromTypes(place.types || []);
  const shop = mapLegacyPlace(place, metro, fallback === 'other' ? 'other' : fallback, undefined, true);
      if (shop && isLeadWorthy(place.types || [])) shops.push(shop);
    }
    if (!data.next_page_token || page === pages - 1) break;
    await new Promise((resolve) => setTimeout(resolve, 2100));
    url = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?pagetoken=${encodeURIComponent(data.next_page_token)}&key=${key}`;
  }
  return shops;
}

async function searchGoogleNearby(
  metro: Metro,
  key: string,
  radius: number,
  includedType = '',
): Promise<Shop[]> {
  const body: Record<string, unknown> = {
    maxResultCount: 20,
    languageCode: 'en',
    regionCode: metro.country || 'US',
    locationRestriction: {
      circle: {
        center: { latitude: metro.lat, longitude: metro.lng },
        radius: Math.max(600, Math.min(radius, 50000)),
      },
    },
  };
  if (includedType) body.includedTypes = [includedType];
  const res = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask':
        'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.types,places.location,places.rating,places.userRatingCount,places.googleMapsUri,places.regularOpeningHours.weekdayDescriptions',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { places?: GooglePlace[] };
  return (data.places || [])
    .filter((place) => isLeadWorthy(place.types || []))
    .map((place) => mapGooglePlace(place, metro, includedType ? categoryFromTypes([includedType, ...(place.types || [])]) : categoryFromTypes(place.types || [])))
    .filter((shop): shop is Shop => Boolean(shop));
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

  const googleKey = await resolveGoogleKey();
  let live: Shop[] = [];
  const guessedCountry: 'CA' | 'US' = lat >= 41.6 && lng <= -52 && lng >= -141 && lat <= 83.2 ? 'CA' : 'US';
  let metro: Metro = { city: '', region: '', country: guessedCountry, lat, lng };
  if (googleKey) {
    const typed = NICHE_QUERIES.find((item) => item.category === niche);
    try {
      metro = (await reverseGeocode(lat, lng, googleKey)) || metro;
      if (typed) {
        live = await searchLegacyNiche(metro, typed, googleKey, radius);
        live = live.filter((shop) => {
          if (!Number.isFinite(Number(shop.lat)) || !Number.isFinite(Number(shop.lng))) return true;
          return haversineMeters({ lat, lng }, { lat: Number(shop.lat), lng: Number(shop.lng) }) <= radius * 1.25;
        });
      } else {
        const cells = areaCells(lat, lng, radius);
        const modern = await Promise.all(
          cells.map((cell) => searchGoogleNearby({ ...metro, lat: cell.lat, lng: cell.lng }, googleKey, cell.radius)),
        );
        live = mergeShops(modern).filter((shop) => !isFranchise(shop.name));
        const phones = live.filter((shop) => shop.phone).length;
        if (!live.length || phones < Math.min(8, live.length)) {
          const groups = await Promise.all(
            cells.map((cell) =>
              searchLegacyNearby(
                { ...metro, lat: cell.lat, lng: cell.lng },
                googleKey,
                cell.radius,
                '',
                1,
              ),
            ),
          );
          live = await enrichWithDetails(mergeShops([live, ...groups]), metro, googleKey, 48);
        }
      }
    } catch {
      live = [];
    }
  }

  const result: PlacesResult = {
    source: live.length ? 'places' : 'seed',
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
