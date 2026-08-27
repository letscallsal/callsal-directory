import { defineCollection, z } from 'astro:content';

const categories = [
  'ai',
  'software',
  'startups',
  'design',
  'jobs',
  'learn',
  'no-code',
  'marketing',
  'local',
  'people',
] as const;

const directories = defineCollection({
  type: 'content',
  schema: z.object({
    title: z.string(),
    // slug is reserved by Astro; keep it in each .md frontmatter, not here
    category: z.enum(categories),
    tagline: z.string(),
    website: z.string().url(),
    affiliateUrl: z.string(),
    featured: z.boolean(),
    whoItsFor: z.string(),
    standout: z.array(z.string()),
    verdict: z.string(),
    status: z.enum(['seed', 'published']),
    dateAdded: z.coerce.date(),
  }),
});

export const collections = { directories };
