/**
 * Static Site Generation (SSG) prerendering — run after `vite build`.
 *
 * WHY THIS EXISTS: this app renders entirely client-side, so the HTML shipped
 * to a crawler is `<div id="root"></div>` and nothing else. Googlebot runs the
 * JavaScript and sees the real page; no major AI crawler does — GPTBot,
 * ClaudeBot and PerplexityBot each fetch the raw HTML once, never execute a
 * script, and never come back. Without this step the site is, to them, a title
 * tag and an empty div.
 *
 * This serves dist/ locally, visits each public route with a real browser,
 * waits for React to render, and overwrites the built HTML with the rendered
 * DOM. Users still get the normal SPA (main.tsx re-renders on load); crawlers
 * get real HTML on the first byte. Also writes sitemap.xml.
 *
 * Run: node prerender.js   (or `npm run build:ssg` for build + prerender)
 */

import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import http from 'http';
import handler from 'serve-handler';
import { fileURLToPath } from 'url';
import { routes } from './prerender.routes.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const DIST_DIR = path.join(__dirname, 'dist');
const PORT = 5174;
const BASE_URL = `http://localhost:${PORT}`;
const SITE_URL = 'https://example.com'; // PROJECT CONFIG: canonical site URL

/**
 * Proof that prerendering actually worked, checked per route. A prerender that
 * silently captures an empty #root still writes a valid HTML file and still
 * exits 0 — it just quietly ships the exact bug this script exists to fix, and
 * nobody notices until the page fails to rank months later. So each route
 * declares a string that MUST appear in its captured HTML, and a miss fails
 * the build.
 */
// PROJECT CONFIG: one entry per route in prerender.routes.js. Pick text that only
// appears once the page has really rendered (a headline, a section heading, text
// fetched at runtime), plus 'application/ld+json' for pages that carry a schema.
const MUST_CONTAIN = {
  '/': ['<the landing page headline>', 'application/ld+json'],
};

/**
 * The mirror of MUST_CONTAIN: strings that must NOT survive into the captured
 * HTML, checked for every route.
 *
 * The consent banner is client-only chrome. If it were ever baked into the
 * static snapshot, the first thing an AI crawler read on the page would be a
 * cookie notice — and the banner's own suppression logic would have silently
 * regressed without any test failing. `window.__PRERENDER__` (set below) is
 * what keeps it out; this gate is what proves it stayed out.
 */
// PROJECT CONFIG: the banner's own markup and a phrase only the banner uses. Not a
// generic phrase like "analytics cookies": a prerendered cookie or privacy policy
// legitimately contains it and would fail the build.
const MUST_NOT_CONTAIN = ['data-testid="consent-banner"'];

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) =>
      handler(req, res, {
        public: DIST_DIR,
        cleanUrls: false,
        rewrites: [{ source: '**', destination: '/index.html' }],
      }),
    );
    server.listen(PORT, () => {
      console.log(`[Prerender] Serving ${DIST_DIR} at ${BASE_URL}`);
      resolve(server);
    });
  });
}

async function prerenderRoute(browser, route) {
  console.log(`[Prerender] Rendering ${route}`);
  const page = await browser.newPage();
  try {
    await page.setViewport({ width: 1280, height: 900 });
    // Marks this as the build-time render. The consent banner, the analytics
    // loader and any scroll/intro animation must check it: no consent UI is
    // rendered into the snapshot, no tag is ever loaded from the build container
    // (which would otherwise send a phantom pageview to production analytics on
    // every deploy), and no text is captured mid-animation (hidden or at
    // opacity 0). Must be set before any navigation.
    await page.evaluateOnNewDocument(() => {
      window.__PRERENDER__ = true;
    });
    await page.goto(`${BASE_URL}${route}`, { waitUntil: 'networkidle0', timeout: 30000 });
    await page.waitForSelector('#root > *', { timeout: 15000 });
    // SEOHead writes <title>/meta/JSON-LD from a useEffect, which runs after
    // the first paint — wait for its schema block rather than a fixed sleep.
    await page.waitForSelector('script[data-seo-schema]', { timeout: 15000 });

    let html = await page.content();
    // Vite injects modulepreload links for dynamic chunks with absolute URLs
    // of THIS server — rewrite to root-relative or they 404 on the real host.
    html = html.replaceAll(`${BASE_URL}/`, '/');

    const missing = (MUST_CONTAIN[route] ?? []).filter((needle) => !html.includes(needle));
    if (missing.length > 0) {
      throw new Error(`captured HTML is missing required content: ${missing.join(', ')}`);
    }

    const leaked = MUST_NOT_CONTAIN.filter((needle) => html.includes(needle));
    if (leaked.length > 0) {
      throw new Error(`captured HTML contains client-only content: ${leaked.join(', ')}`);
    }

    const outputPath =
      route === '/'
        ? path.join(DIST_DIR, 'index.html')
        : path.join(DIST_DIR, route.replace(/^\/|\/$/g, ''), 'index.html');
    fs.mkdirSync(path.dirname(outputPath), { recursive: true });
    fs.writeFileSync(outputPath, html, 'utf-8');

    console.log(`[Prerender] OK ${route} -> ${outputPath} (${(html.length / 1024).toFixed(1)} kB)`);
    return { route, ok: true };
  } catch (error) {
    console.error(`[Prerender] FAIL ${route}: ${error.message}`);
    return { route, ok: false, error: error.message };
  } finally {
    await page.close();
  }
}

function writeSitemap(okRoutes) {
  const today = new Date().toISOString().split('T')[0];
  const urls = okRoutes
    .map(
      (route) => `  <url>
    <loc>${SITE_URL}${route}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>monthly</changefreq>
    <priority>${route === '/' ? '1.0' : '0.5'}</priority>
  </url>`,
    )
    .join('\n');

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>
`;
  fs.writeFileSync(path.join(DIST_DIR, 'sitemap.xml'), sitemap, 'utf-8');
  console.log(`[Prerender] Sitemap: ${okRoutes.length} URL(s)`);
}

async function main() {
  if (!fs.existsSync(DIST_DIR)) {
    console.error('[Prerender] dist/ not found — run `npm run build` first.');
    process.exit(1);
  }

  const server = await startServer();
  const browser = await puppeteer.launch({
    headless: 'new',
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });

  const results = [];
  for (const route of routes) {
    results.push(await prerenderRoute(browser, route));
  }

  await browser.close();
  server.close();

  const ok = results.filter((r) => r.ok);
  const failed = results.filter((r) => !r.ok);
  if (ok.length > 0) writeSitemap(ok.map((r) => r.route));

  console.log(`\n[Prerender] Done: ${ok.length} OK, ${failed.length} failed`);
  if (failed.length > 0) process.exit(1);
}

main().catch((error) => {
  console.error('[Prerender] Fatal:', error);
  process.exit(1);
});
