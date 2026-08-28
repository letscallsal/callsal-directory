import seed from '../data/milton-leads.json';

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

export const TYPE_META = [
  { slug: 'barber', label: 'Barber' },
  { slug: 'food', label: 'Food' },
  { slug: 'dental', label: 'Dental' },
  { slug: 'legal', label: 'Legal' },
  { slug: 'salon', label: 'Salon' },
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

export async function getShops(): Promise<Shop[]> {
  const merged = new Map<string, Shop>();

  const add = (shop: Shop, overwrite: boolean) => {
    const key = nameStreetKey(shop);
    if (!overwrite && merged.has(key)) return;
    merged.set(key, shop);
  };

  for (const mod of Object.values(cityModules)) {
    for (const shop of cityShops(mod)) add(shop, false);
  }

  for (const shop of seed.shops as Shop[]) add(shop, true);

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

export function shopDedupeKey(shop: { placeId?: string; slug?: string; name: string; address?: string; city?: string }): string {
  if (shop.placeId) return `place:${shop.placeId}`;
  if (shop.slug) return `slug:${shop.slug}`;
  const street = (shop.address || '').split(',')[0] || '';
  const norm = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '');
  return `loc:${norm(shop.name)}|${norm(street)}|${norm(shop.city || '')}`;
}
