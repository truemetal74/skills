/**
 * Routes prerendered to static HTML at build time (see prerender.js) and
 * listed in sitemap.xml. Every route here needs a MUST_CONTAIN entry in
 * prerender.js.
 *
 * Only PUBLIC, stateless routes belong here. Everything else in App.tsx is
 * either behind sign-in, meaningless without a one-time token (/magic,
 * /verify, /reset-password), or a snapshot of transient client state —
 * prerendering those would publish an empty or misleading page, so robots.txt
 * disallows them instead.
 *
 * /login and /register are deliberately NOT prerendered: they carry no
 * indexable content and would only compete with "/" for the brand name.
 */

// PROJECT CONFIG: the public routes, e.g. ['/', '/pricing', '/faq', '/terms', '/privacy'].
const routes = ['/'];

export { routes };
