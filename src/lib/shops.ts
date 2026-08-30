import seed from '../data/milton-leads.json';

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

export const TYPE_META = [
  { slug: 'barber', label: 'Barber' },
  { slug: 'food', label: 'Food' },
  { slug: 'dental', label: 'Dental' },
  { slug: 'legal', label: 'Legal' },
  { slug: 'salon', label: 'Salon' },
  { slug: 'accounting', label: 'Accounting' },
  { slug: 'auto', label: 'Auto' },
  { slug: 'fitness', label: 'Fitness' },
  { slug: 'wellness', label: 'Wellness' },
  { slug: 'trades', label: 'Trades' },
  { slug: 'other', label: 'Local' },
] as const;

export type TypeSlug = (typeof TYPE_META)[number]['slug'];

const FEATURED_SLUGS = [
  'nova-cuts-barbershop-miano-hair-care',
  'milton-family-dental',
  'portabellos-italian-bistro',
  'exsalonce-laser-esthetics',
  'ask-law',
  'james-evans-barrister-solicitor',
  'firepower-fitness-wellness',
  'shine-my-nails',
];

const BOT_WALL = /cloudflare|cf-browser-verification|challenge-platform|just a moment|attention required|captcha/i;

type CitySeed = { shops?: Shop[] };

const cityModules = import.meta.glob('../data/cities/*.json', { eager: true }) as Record<
  string,
  CitySeed | { default: CitySeed }
>;

function cityShops(mod: CitySeed | { default: CitySeed }): Shop[] {
  if ('default' in mod && mod.default && Array.isArray(mod.default.shops)) {
    return mod.default.shops;
  }
  if ('shops' in mod && Array.isArray(mod.shops)) {
    return mod.shops;
  }
  return [];
}

function nameStreetKey(shop: { name: string; address?: string }): string {
  const street = (shop.address || '').split(',')[0] || '';
  const norm = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '');
  return `${norm(shop.name)}|${norm(street)}`;
}

export function typeLabel(slug: string): string {
  return TYPE_META.find((item) => item.slug === slug)?.label ?? 'Local';
}

export function shopDedupeKey(shop: {
  placeId?: string;
  slug?: string;
  name: string;
  address?: string;
  city?: string;
}): string {
  if (shop.placeId) return `place:${shop.placeId}`;
  return `loc:${nameStreetKey(shop)}`;
}

export async function getShops(): Promise<Shop[]> {
  const merged = new Map<string, Shop>();

  const score = (s: Shop) =>
    (s.placeId ? 8 : 0) +
    (s.website ? 4 : 0) +
    (s.phone ? 2 : 0) +
    (s.category && s.category !== 'other' ? 1 : 0);

  const add = (shop: Shop) => {
    const key = shopDedupeKey(shop);
    const prev = merged.get(key);
    if (!prev || score(shop) > score(prev)) merged.set(key, shop);
  };

  for (const mod of Object.values(cityModules)) {
    for (const shop of cityShops(mod)) add(shop);
  }

  for (const shop of seed.shops as Shop[]) add(shop);

  return [...merged.values()];
}

export function byType(shops: Shop[], slug: string): Shop[] {
  return shops.filter((shop) => shop.category === slug).sort((a, b) => a.name.localeCompare(b.name));
}

export function featuredShops(shops: Shop[]): Shop[] {
  const rank = new Map(FEATURED_SLUGS.map((slug, i) => [slug, i]));
  return shops
    .filter((shop) => rank.has(shop.slug))
    .sort((a, b) => (rank.get(a.slug) ?? 99) - (rank.get(b.slug) ?? 99));
}

export function typesWithShops(shops: Shop[]) {
  return TYPE_META.filter((item) => shops.some((shop) => shop.category === item.slug));
}

export function isBotWallCapture(url: string): boolean {
  return BOT_WALL.test(url);
}

export function storedHomepagePreview(shop: Shop): string | undefined {
  if (!shop.verified.photo || !shop.photo) return undefined;
  if (isBotWallCapture(shop.photo)) return undefined;
  return shop.photo;
}

export function listingPhotoSrc(shop: Shop): string | undefined {
  if (shop.placeId && !String(shop.placeId).startsWith('osm:')) {
    return `/api/photo?placeId=${encodeURIComponent(shop.placeId)}`;
  }
  const name = shop.name?.trim();
  if (!name) return undefined;
  const params = new URLSearchParams({ name });
  const address = shop.address?.trim() || [shop.city, shop.region].filter(Boolean).join(', ');
  if (address) params.set('address', address);
  return `/api/photo?${params.toString()}`;
}

export function cardPhotoSrc(shop: Shop): string | undefined {
  return listingPhotoSrc(shop) || storedHomepagePreview(shop);
}
