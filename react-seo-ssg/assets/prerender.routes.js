/**
 * Routes to pre-render for Static Site Generation (SSG).
 * These routes are rendered at build time and saved as static HTML.
 * Only public (unauthenticated) pages should be listed here.
 */

const routes = [
  // Main pages
  "/",
  "/how-it-works",
  "/features",
  "/pricing",
  "/faq",

  // Company pages
  "/about",
  "/contact",

  // Auth pages (pre-render the shell for faster load)
  "/login",
  "/register",

  // Legal pages
  "/legal/terms-of-service",
  "/legal/privacy-policy",
  "/legal/cookie-policy",
];

export { routes };
