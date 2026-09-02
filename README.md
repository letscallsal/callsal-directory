# Directory

A curated index of tools and libraries for digital creatives. Free first.

Visual twin of https://callsal.app (`letscallsal/callsal-website` master `2a422ccd`): same 3D room, boot pill, Syne + Inter, black / white / lime, glass chrome, EST MMXXVI, snap-scroll. Next stage is this index. No Armory, no booking, no portfolio, no diorama / bust / lidar leftovers.

Live host (after you connect hosting): https://directory.callsal.app

Listings live as Markdown in `src/content/directories`. Search runs in the browser against that collection.

## Taste

This is not a directory of directories. It is for digital creatives — designers, illustrators, and the people who ship interfaces.

- Prefer aggregators and libraries a working creative would actually open.
- Free first. `free` and `free-trial` beat `freemium` and `paid`.
- No Product Hunt, G2, AlternativeTo, or other launch/review boards.
- Do not invent review counts, prices, quotes, or affiliate links.

## Categories

`components`, `inspiration`, `icons`, `fonts`, `illustrations`, `photos`, `ui-kits`, `tools`, `templates`, `3d`

## Auth and bookmarks

Registration is open to anybody (email + password). Login, logout, and a session cookie (`directory_auth`, httpOnly, 7 days).

Pattern ports from callsal-website `/api/auth/{me,login,logout}` plus an open `/api/auth/register`. Users and bookmarks persist in the same Vercel-friendly store the website already uses: Vercel KV / Upstash Redis. In-memory fallback for local `astro dev` only (lost on restart). No sqlite. No paid add-ons beyond that KV.

- `GET /api/auth/me`
- `POST /api/auth/register` `{ email, password }`
- `POST /api/auth/login` `{ email, password }`
- `POST /api/auth/logout`
- `GET /api/bookmarks` → `{ slugs }`
- `POST /api/bookmarks` `{ slug }`
- `DELETE /api/bookmarks?slug=`

Bookmark controls sit on cards and listing pages. `/saved/` is the Saved view.

### Environment variables (Vercel)

Required in production:

- `JWT_SECRET` — signing key for the session cookie. Generate a long random string.

Listings come from OpenStreetMap. No Google key.

One of these pairs (reuse the website KV if it is already provisioned):

- `KV_REST_API_URL` + `KV_REST_API_TOKEN` (Vercel KV)
- or `UPSTASH_REDIS_REST_URL` + `UPSTASH_REDIS_REST_TOKEN`

Locally, omit them and the API uses in-memory storage.

## Run locally

Install dependencies, then use the Astro dev and build scripts in package.json.

astro.config.mjs sets output to static and site to https://directory.callsal.app. Vercel serves `/api` as serverless functions next to the static build.

## Add a listing

1. Create a Markdown file in src/content/directories/ using the listing slug as the filename.
2. Fill the frontmatter. slug should match the filename without the extension.
   Astro reserves slug on content collections, so it stays in the Markdown frontmatter and is not part of the Zod schema in src/content/config.ts.
3. Write a short editorial body under the frontmatter if you want extra context on the listing page.
4. Build or run the site and open /directory/<slug>.
5. Quote standout lines that contain a colon, or YAML will treat them as objects.

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

This repo is the source. The owner connects Vercel to https://github.com/letscallsal/callsal-directory and points directory.callsal.app at that project. Set the env vars above on that project. Do not put secrets in the repo.

© 2026 CALLSAL
