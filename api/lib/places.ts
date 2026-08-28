import seed from './milton-seed.js';

export type ShopCategory = 'dental' | 'salon' | 'food' | 'barber' | 'legal' | 'other';

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
  category: ShopCategory;
  verified: ShopVerified;
}

export interface PlacesResult {
  source: 'places' | 'seed';
  city: string;
  shops: Shop[];
}

const TYPE_LABELS: Record<string, string> = {
  barber: 'Barber',
  food: 'Food',
  dental: 'Dental',
  legal: 'Legal',
  salon: 'Salon',
  other: 'Local',
};

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

export async function listCityShops(city = 'milton'): Promise<PlacesResult> {
  const key = process.env.GOOGLE_PLACES_API_KEY;
  if (key) {
    try {
      const shops = await searchGooglePlaces(city, key);
      if (shops.length) return { source: 'places', city, shops };
    } catch {
      console.error('Places lookup failed. Serving the verified seed.');
    }
  }
  return { source: 'seed', city, shops: seedShops() };
}

async function searchGooglePlaces(city: string, key: string): Promise<Shop[]> {
  const res = await fetch('https://places.googleapis.com/v1/places:searchText', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-Goog-Api-Key': key,
      'X-Goog-FieldMask':
        'places.id,places.displayName,places.formattedAddress,places.nationalPhoneNumber,places.websiteUri,places.types',
    },
    body: JSON.stringify({ textQuery: `local businesses in ${city} ON`, pageSize: 20 }),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as {
    places?: Array<{
      id?: string;
      displayName?: { text?: string };
      formattedAddress?: string;
      nationalPhoneNumber?: string;
      websiteUri?: string;
      types?: string[];
    }>;
  };
  return (data.places || [])
    .map((place) => mapPlace(place))
    .filter((shop): shop is Shop => Boolean(shop));
}

function mapPlace(place: {
  id?: string;
  displayName?: { text?: string };
  formattedAddress?: string;
  nationalPhoneNumber?: string;
  websiteUri?: string;
  types?: string[];
}): Shop | null {
  const name = place.displayName?.text?.trim();
  if (!name) return null;
  const slug = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 80);
  return {
    name,
    slug,
    city: 'Milton',
    region: 'ON',
    country: 'CA',
    address: place.formattedAddress,
    phone: place.nationalPhoneNumber,
    website: place.websiteUri,
    placeId: place.id,
    category: categoryFromTypes(place.types || []),
    verified: {
      phone: Boolean(place.nationalPhoneNumber),
      website: Boolean(place.websiteUri),
      email: false,
      address: Boolean(place.formattedAddress),
      ownerName: false,
      socials: false,
      photo: false,
    },
  };
}

function categoryFromTypes(types: string[]): ShopCategory {
  const blob = types.join(' ');
  if (blob.includes('barber')) return 'barber';
  if (blob.includes('dentist') || blob.includes('dental')) return 'dental';
  if (blob.includes('lawyer') || blob.includes('attorney') || blob.includes('legal')) return 'legal';
  if (blob.includes('restaurant') || blob.includes('cafe') || blob.includes('bakery') || blob.includes('food')) {
    return 'food';
  }
  if (blob.includes('beauty') || blob.includes('spa') || blob.includes('hair_care') || blob.includes('salon')) {
    return 'salon';
  }
  return 'other';
}
