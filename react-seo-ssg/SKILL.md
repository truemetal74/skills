---
name: react-seo-ssg
description: Static-site-generation (SSG) prerendering and SEO for the house React/Vite stack — Puppeteer prerenders public routes to static HTML at build time, generates sitemap.xml, and an SEOHead component manages meta tags, Open Graph and JSON-LD structured data. Use this when adding SEO or prerendering to a Vite SPA, when marketing/landing pages need to be crawlable, when asked about sitemaps, meta tags, structured data, or "why doesn't Google see my React page".
---

# SEO + SSG prerendering (house stack)

Vite SPAs render client-side, so crawlers see an empty shell. This skill's approach:
after `vite build`, a Puppeteer script visits each public route on a local server and
saves the rendered HTML as `dist/<route>/index.html`, plus a `sitemap.xml`. nginx (see
deploy-cloudrun skill) serves the prerendered file when it exists, falling back to the
SPA — so crawlers get real HTML and users get the normal app.

## Files (assets/)

| File | Copy to | Role |
|---|---|---|
| `prerender.js` | `front-end/prerender.js` | Serves `dist/`, visits routes with Puppeteer, saves HTML, writes sitemap.xml, fails the build when a page did not really render. `PROJECT CONFIG`: `SITE_URL`, `MUST_CONTAIN`, `MUST_NOT_CONTAIN` |
| `prerender.routes.js` | `front-end/prerender.routes.js` | The list of public routes to prerender — keep in sync with public routes in `App.tsx` |
| `SEOHead.tsx` | `src/components/seo/SEOHead.tsx` | Per-page `<title>`, meta description, canonical URL (from `path`), Open Graph + Twitter card, and JSON-LD blocks marked `data-seo-schema` (builders: website, organization, breadcrumbs, faqPage). `PROJECT CONFIG`: `SITE_NAME`, `SITE_URL`, `OG_IMAGE` |

## Wiring

1. `npm i -D puppeteer serve-handler`
2. package.json scripts: `"build:ssg": "tsc -b && vite build && node prerender.js"`
3. Render `<SEOHead title=... description=... path=... schema={...} />` at the top of
   every public page; prerender waits for these tags before capturing.
4. Docker: the frontend build stage needs Chromium — the deploy-cloudrun skill's
   `frontend.Dockerfile` has the marked block (`PUPPETEER_EXECUTABLE_PATH` etc.) and
   uses `npm run build:ssg`.
5. When adding a public page: add the route to `prerender.routes.js` AND a
   `MUST_CONTAIN` entry in `prerender.js`, or it won't be prerendered, gated or
   listed in the sitemap.

## Rules (each one learned from a shipped bug)

1. **Gate every route.** A prerender that captures an empty `#root` still writes a valid
   file and exits 0. `MUST_CONTAIN[route]` lists text that only exists once the page
   really rendered (a headline; for pages that fetch content at runtime, a phrase from
   that content). A miss fails the build. Never delete a gate to get a build through.
2. **Every prerendered page passes a `schema` to `SEOHead`.** The script waits for
   `script[data-seo-schema]`; a page without one times out.
3. **`window.__PRERENDER__` is the build-time flag.** The script sets it before
   navigation. Anything client-only checks it: the consent banner renders nothing, the
   analytics/GTM loader loads nothing (otherwise every deploy sends a phantom pageview),
   and intro/scroll animations are skipped (otherwise text is captured hidden).
   `MUST_NOT_CONTAIN` proves the banner stayed out: use the banner's own markup
   (`data-testid="consent-banner"`) and a phrase only it uses. Not a generic phrase like
   "analytics cookies": the prerendered cookie and privacy policies contain it.
4. **Root-relative URLs.** Vite injects `modulepreload` links with the prerender
   server's absolute URL; the script rewrites `http://localhost:PORT/` to `/` or they
   404 in production.
5. **Content fetched at runtime must be in the build upload.** E.g. legal pages as
   `public/legal/*.md`: a `.gcloudignore` with `*.md` drops them at any depth, so add
   `!public/legal/*.md`. Rule 1's gate is what catches this.
6. `/login` and `/register` are not prerendered: no indexable content, and they would
   compete with `/` for the brand name. Token pages and signed-in pages go in
   `robots.txt` `Disallow`, not in the routes list.
