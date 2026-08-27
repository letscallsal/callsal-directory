import { getCollection, type CollectionEntry } from 'astro:content';

export const CATEGORY_META = [
  { slug: 'components', label: 'Components', blurb: 'Interface pieces you can drop into a product and make your own.' },
  { slug: 'inspiration', label: 'Inspiration', blurb: 'Galleries and feeds of work worth studying before you start.' },
  { slug: 'icons', label: 'Icons', blurb: 'Icon families that stay consistent across a whole interface.' },
  { slug: 'fonts', label: 'Fonts', blurb: 'Type libraries you can actually license into a digital project.' },
  { slug: 'illustrations', label: 'Illustrations', blurb: 'Scene art and character sets for empty states, heroes, and explainers.' },
  { slug: 'photos', label: 'Photos', blurb: 'Photography libraries with a license you can use in client work.' },
  { slug: 'ui-kits', label: 'UI kits', blurb: 'Themed component kits that give you a full look, not one widget.' },
  { slug: 'tools', label: 'Tools', blurb: 'Software that digital creatives use to make the work.' },
  { slug: 'templates', label: 'Templates', blurb: 'Starting files for sites, decks, and product surfaces.' },
  { slug: '3d', label: '3D', blurb: 'Models and scenes you can download and use, not just admire.' },
] as const;

export const PRICING_LABELS = {
  free: 'Free',
  'free-trial': 'Free trial',
  freemium: 'Freemium',
  paid: 'Paid',
} as const;

export type CategorySlug = (typeof CATEGORY_META)[number]['slug'];
export type PricingSlug = keyof typeof PRICING_LABELS;
/** Listing card data, including `data.preview` from the content schema. */
export type DirectoryEntry = CollectionEntry<'directories'>;

export function categoryLabel(slug: string): string {
  return CATEGORY_META.find((item) => item.slug === slug)?.label ?? slug;
}

export function categoryBlurb(slug: string): string {
  return CATEGORY_META.find((item) => item.slug === slug)?.blurb ?? '';
}

export function pricingLabel(slug: string): string {
  return PRICING_LABELS[slug as PricingSlug] ?? slug;
}

export async function getDirectories(): Promise<DirectoryEntry[]> {
  const all = await getCollection('directories');
  return all.sort((a, b) => a.data.title.localeCompare(b.data.title));
}

export function byCategory(entries: DirectoryEntry[], slug: CategorySlug): DirectoryEntry[] {
  return entries
    .filter((entry) => entry.data.category === slug)
    .sort((a, b) => a.data.title.localeCompare(b.data.title));
}

export function featured(entries: DirectoryEntry[]): DirectoryEntry[] {
  return entries.filter((entry) => entry.data.featured);
}

export function newest(entries: DirectoryEntry[]): DirectoryEntry[] {
  return [...entries].sort(
    (a, b) => b.data.dateAdded.getTime() - a.data.dateAdded.getTime(),
  );
}

export function categoriesWithListings(entries: DirectoryEntry[]) {
  return CATEGORY_META.filter((category) =>
    entries.some((entry) => entry.data.category === category.slug),
  );
}
