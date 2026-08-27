# Directory

A curated index of tools and libraries for digital creatives. Free first.

Live host (after you connect hosting): https://directory.callsal.app

This is a static Astro site. No auth, no CMS, no database. Listings live as Markdown in a content collection. Search runs in the browser against that collection.

## Taste

This is not a directory of directories. It is for digital creatives — designers, illustrators, and the people who ship interfaces.

- Prefer aggregators and libraries a working creative would actually open.
- Free first. `free` and `free-trial` beat `freemium` and `paid`.
- No Product Hunt, G2, AlternativeTo, or other launch/review boards.
- Do not invent review counts, prices, quotes, or affiliate links.

## Categories

`components`, `inspiration`, `icons`, `fonts`, `illustrations`, `photos`, `ui-kits`, `tools`, `templates`, `3d`

## Run locally

Install dependencies, then use the Astro dev and build scripts in package.json.

astro.config.mjs sets output to static and site to https://directory.callsal.app.

## Add a listing

1. Create a Markdown file in src/content/directories/ using the listing slug as the filename.
2. Fill the frontmatter. slug should match the filename without the extension.
   Astro reserves slug on content collections, so it stays in the Markdown frontmatter and is not part of the Zod schema in src/content/config.ts.
3. Write a short editorial body under the frontmatter if you want extra context on the listing page.
4. Build or run the site and open /directory/<slug>.

Frontmatter fields:

- title — display name
- slug — URL slug (/directory/<slug>)
- category — one of: components, inspiration, icons, fonts, illustrations, photos, ui-kits, tools, templates, 3d
- tagline — one line
- website — canonical URL
- affiliateUrl — leave empty until there is a real affiliate
- featured — true to appear in the Featured row
- pricing — one of: free, free-trial, freemium, paid
- whoItsFor — who should open this resource
- standout — list of short, factual points
- verdict — honest close. No invented metrics or quotes
- status — seed or published
- dateAdded — YYYY-MM-DD, drives the New row

## Hosting

This repo is the source. The owner connects Vercel to https://github.com/letscallsal/callsal-directory and points directory.callsal.app at that project. Do not put secrets in the repo; the site is static.

© 2026 CALLSAL
