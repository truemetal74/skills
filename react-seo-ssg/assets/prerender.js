/**
 * Pre-rendering script for Static Site Generation (SSG).
 *
 * 1. Starts a local server serving the built Vite app
 * 2. Uses Puppeteer to visit each route
 * 3. Waits for React + SEO tags to render
 * 4. Captures HTML and saves to dist/
 * 5. Generates sitemap.xml
 *
 * Run after `npm run build`: node prerender.js
 */

import puppeteer from "puppeteer";
import fs from "fs";
import path from "path";
import http from "http";
import handler from "serve-handler";
import { fileURLToPath } from "url";
import { routes } from "./prerender.routes.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DIST_DIR = path.join(__dirname, "dist");
const PORT = 5174;
const BASE_URL = `http://localhost:${PORT}`;
const SITE_URL = "https://example.com"; // PROJECT CONFIG: canonical site URL

function startServer() {
  return new Promise((resolve) => {
    const server = http.createServer((request, response) => {
      return handler(request, response, {
        public: DIST_DIR,
        cleanUrls: false,
        rewrites: [{ source: "**", destination: "/index.html" }],
      });
    });
    server.listen(PORT, () => {
      console.log(`[Prerender] Server running at ${BASE_URL}`);
      resolve(server);
    });
  });
}

async function waitForPageLoad(page) {
  try {
    await page.waitForNetworkIdle({ timeout: 10000 });
    await page.waitForSelector("#root > *", { timeout: 10000 });
    // Extra time for SEO tag injection by React effects
    await new Promise((resolve) => setTimeout(resolve, 1000));
  } catch (error) {
    console.warn("[Prerender] Timeout waiting for page:", error.message);
  }
}

async function prerenderRoute(browser, route) {
  const url = `${BASE_URL}${route}`;
  console.log(`[Prerender] Rendering: ${route}`);

  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080 });
    await page.goto(url, { waitUntil: "networkidle0", timeout: 30000 });
    await waitForPageLoad(page);

    const html = await page.content();

    let outputPath;
    if (route === "/") {
      outputPath = path.join(DIST_DIR, "index.html");
    } else {
      const routePath = route.replace(/^\//, "").replace(/\/$/, "");
      const outputDir = path.join(DIST_DIR, routePath);
      fs.mkdirSync(outputDir, { recursive: true });
      outputPath = path.join(outputDir, "index.html");
    }

    fs.writeFileSync(outputPath, html, "utf-8");
    console.log(`[Prerender] OK ${outputPath}`);
    await page.close();
    return { route, success: true };
  } catch (error) {
    console.error(`[Prerender] FAIL ${route}`, error.message);
    return { route, success: false, error: error.message };
  }
}

function generateSitemap(successfulRoutes) {
  const today = new Date().toISOString().split("T")[0];

  function getRouteConfig(route) {
    if (route === "/") return { priority: "1.0", changefreq: "weekly" };
    if (["/how-it-works", "/features"].includes(route))
      return { priority: "0.9", changefreq: "monthly" };
    if (["/pricing", "/faq"].includes(route))
      return { priority: "0.8", changefreq: "monthly" };
    if (["/about", "/contact"].includes(route))
      return { priority: "0.7", changefreq: "monthly" };
    if (["/login", "/register"].includes(route))
      return { priority: "0.6", changefreq: "monthly" };
    if (
      [
        "/legal/terms-of-service",
        "/legal/privacy-policy",
        "/legal/cookie-policy",
      ].includes(route)
    )
      return { priority: "0.3", changefreq: "yearly" };
    return { priority: "0.5", changefreq: "monthly" };
  }

  const urlEntries = successfulRoutes
    .map((route) => {
      const config = getRouteConfig(route);
      return `  <url>
    <loc>${SITE_URL}${route}</loc>
    <lastmod>${today}</lastmod>
    <changefreq>${config.changefreq}</changefreq>
    <priority>${config.priority}</priority>
  </url>`;
    })
    .join("\n");

  const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries}
</urlset>
`;

  const sitemapPath = path.join(DIST_DIR, "sitemap.xml");
  fs.writeFileSync(sitemapPath, sitemap, "utf-8");
  console.log(
    `[Prerender] Sitemap: ${successfulRoutes.length} URLs -> ${sitemapPath}`
  );
}

async function prerender() {
  console.log(`[Prerender] Starting... ${routes.length} routes`);

  if (!fs.existsSync(DIST_DIR)) {
    console.error('[Prerender] dist/ not found. Run "npm run build" first.');
    process.exit(1);
  }

  const server = await startServer();

  const browser = await puppeteer.launch({
    headless: "new",
    executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-dev-shm-usage",
      "--disable-gpu",
    ],
  });

  const results = { success: 0, failed: 0, successfulRoutes: [], errors: [] };

  for (const route of routes) {
    const result = await prerenderRoute(browser, route);
    if (result.success) {
      results.success++;
      results.successfulRoutes.push(route);
    } else {
      results.failed++;
      results.errors.push({ route, error: result.error });
    }
  }

  await browser.close();
  server.close();

  if (results.successfulRoutes.length > 0) {
    generateSitemap(results.successfulRoutes);
  }

  console.log(
    `\n[Prerender] Done: ${results.success} OK, ${results.failed} failed`
  );
  if (results.errors.length > 0) {
    results.errors.forEach(({ route, error }) =>
      console.log(`  FAIL ${route}: ${error}`)
    );
  }

  if (results.failed > 0) process.exit(1);
}

prerender().catch((error) => {
  console.error("[Prerender] Fatal:", error);
  process.exit(1);
});
