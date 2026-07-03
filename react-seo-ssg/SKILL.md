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
| `prerender.js` | `front-end/prerender.js` | Serves `dist/`, visits routes with Puppeteer, saves HTML, writes sitemap.xml. `PROJECT CONFIG`: `SITE_URL` |
| `prerender.routes.js` | `front-end/prerender.routes.js` | The list of public routes to prerender — keep in sync with public routes in `App.tsx` |
| `SEOHead.tsx` | `src/components/seo/SEOHead.tsx` | Per-page `<title>`, meta description, canonical URL, Open Graph, and JSON-LD (`schema` prop for FAQPage/Person/Organization etc.). `PROJECT CONFIG`: `SITE_URL` |

## Wiring

1. `npm i -D puppeteer serve-handler`
2. package.json scripts: `"build:ssg": "tsc -b && vite build && node prerender.js"`
3. Render `<SEOHead title=... description=... path=... schema={...} />` at the top of
   every public page; prerender waits for these tags before capturing.
4. Docker: the frontend build stage needs Chromium — the deploy-cloudrun skill's
   `frontend.Dockerfile` has the marked block (`PUPPETEER_EXECUTABLE_PATH` etc.) and
   uses `npm run build:ssg`.
5. When adding a public page: add the route to `prerender.routes.js` or it won't be
   prerendered or listed in the sitemap.
