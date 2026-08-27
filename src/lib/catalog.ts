import { getCollection, type CollectionEntry } from 'astro:content';

export const CATEGORY_META = [
  { slug: 'ai', label: 'AI', blurb: 'Indexes of models, products, and jobs to be done.' },
  { slug: 'software', label: 'Software', blurb: 'Where people compare and replace the tools they already use.' },
  { slug: 'startups', label: 'Startups', blurb: 'Launch pads, founder communities, and product rolls.' },
  { slug: 'design', label: 'Design', blurb: 'Portfolios, shots, and the people who made the work.' },
  { slug: 'jobs', label: 'Jobs', blurb: 'Hiring boards that are themselves directories of companies.' },
  { slug: 'learn', label: 'Learn', blurb: 'Course catalogs and reading lists, not single classes.' },
  { slug: 'no-code', label: 'No-code', blurb: 'Builders and templates that skip a traditional stack.' },
  { slug: 'marketing', label: 'Marketing', blurb: 'Directories of channels, creatives, and growth tools.' },
  { slug: 'local', label: 'Local', blurb: 'Places and services, indexed by city rather than category.' },
  { slug: 'people', label: 'People', blurb: 'Who-knows-who: talent, experts, and public profiles.' },
] as const;

export type CategorySlug = (typeof CATEGORY_META)[number]['slug'];
export type DirectoryEntry = CollectionEntry<'directories'>;

export function categoryLabel(slug: string): string {
  return CATEGORY_META.find((item) => item.slug === slug)?.label ?? slug;
}

export function categoryBlurb(slug: string): string {
  return CATEGORY_META.find((item) => item.slug === slug)?.blurb ?? '';
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
