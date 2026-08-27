# Directory

A directory of directories.

Live host (after you connect hosting): https://directory.callsal.app

This is a static Astro site. No auth, no CMS, no database. Listings live as Markdown in a content collection. Search runs in the browser against that collection.

## Run locally

```bash
npm install
npm run dev
```

Production build:

```bash
npm run build
npm run preview
```

`astro.config.mjs` sets `output: 'static'` and `site: 'https://directory.callsal.app'`.

## Add a listing

1. Create a Markdown file in `src/content/directories/`.
   Use the listing slug as the filename, e.g. `src/content/directories/product-hunt.md`.
2. Fill the frontmatter. `slug` should match the filename (without `.md`).
   Astro reserves `slug` on content collections, so it stays in the Markdown frontmatter and is not part of the Zod schema in `src/content/config.ts`.
3. Write a short editorial body under the frontmatter if you want extra context on the listing page.
4. Run `npm run build` (or `npm run dev`) and open `/directory/<slug>`.

Frontmatter fields:

- `title` — display name
- `slug` — URL slug (`/directory/<slug>`)
- `category` — one of: `ai`, `software`, `startups`, `design`, `jobs`, `learn`, `no-code`, `marketing`, `local`, `people`
- `tagline` — one line
- `website` — canonical URL
- `affiliateUrl` — leave empty (`""`) until there is a real affiliate
- `featured` — `true` to appear in the Featured row
- `whoItsFor` — who should open this directory
- `standout` — list of short, factual points
- `verdict` — honest close. No invented metrics or quotes
- `status` — `seed` or `published`
- `dateAdded` — `YYYY-MM-DD`, drives the New row

Do not invent review counts, prices, quotes, or affiliate links.

## Hosting

This repo is the source. The owner connects Vercel to https://github.com/letscallsal/callsal-directory and points `directory.callsal.app` at that project. Do not put secrets in the repo; the site is static.

© 2026 CALLSAL
