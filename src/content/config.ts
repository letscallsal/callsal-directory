import { defineCollection, z } from 'astro:content';

const categories = [
  'components',
  'inspiration',
  'icons',
  'fonts',
  'illustrations',
  'photos',
  'ui-kits',
  'tools',
  'templates',
  '3d',
] as const;

const directories = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    category: z.enum(categories),
    tagline: z.string(),
    website: z.string().url(),
    preview: z.string(),
    affiliateUrl: z.string(),
    featured: z.boolean(),
    pricing: z.enum(['free', 'free-trial', 'freemium', 'paid']),
    whoItsFor: z.string(),
    standout: z.array(z.string()),
    verdict: z.string(),
    status: z.enum(['seed', 'published']),
    dateAdded: z.coerce.date(),
  }),
});

export const collections = { directories };
