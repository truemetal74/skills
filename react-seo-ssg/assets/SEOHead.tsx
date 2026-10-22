import { useEffect } from 'react';

/**
 * Per-page <title>, meta description, canonical, Open Graph/Twitter cards and
 * JSON-LD, applied to document.head as an effect.
 *
 * WHY AN EFFECT AND NOT JUST index.html: the tags in index.html are the static
 * baseline every crawler sees without running JavaScript (AI crawlers such as
 * GPTBot, ClaudeBot and PerplexityBot never run any). This component lets a
 * route OVERRIDE that baseline, and gives `prerender.js` something to wait for
 * (`script[data-seo-schema]`) before it snapshots the DOM — so every
 * prerendered page must pass at least one `schema`. Every tag is updated in
 * place when index.html already declares it, so the two never both ship and
 * duplicate each other.
 *
 * Returns null — it renders nothing.
 */

export const SITE_NAME = 'Example'; // PROJECT CONFIG: product name
export const SITE_URL = 'https://example.com'; // PROJECT CONFIG: canonical site URL
/** The link-preview image, 1200x630. PROJECT CONFIG: path under public/. */
const OG_IMAGE = `${SITE_URL}/og-image.jpg`;

interface SEOHeadProps {
  title: string;
  description: string;
  /** Root-relative path, e.g. '/'. Becomes the canonical + og:url. */
  path: string;
  schema?: Record<string, unknown> | Record<string, unknown>[];
}

function upsertMeta(selector: string, attr: 'name' | 'property', key: string, content: string): void {
  let el = document.querySelector(selector);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

export function SEOHead({ title, description, path, schema }: SEOHeadProps): null {
  // `schema` is typically a fresh object literal per render, so the serialized
  // STRING is the dependency; object identity would rewrite head every render.
  const schemaJson = schema ? JSON.stringify(Array.isArray(schema) ? schema : [schema]) : '';

  useEffect(() => {
    const canonical = `${SITE_URL}${path}`;
    document.title = title;

    upsertMeta('meta[name="description"]', 'name', 'description', description);

    const og: Record<string, string> = {
      'og:title': title,
      'og:description': description,
      'og:type': 'website',
      'og:site_name': SITE_NAME,
      'og:url': canonical,
      'og:image': OG_IMAGE,
    };
    for (const [key, content] of Object.entries(og)) {
      upsertMeta(`meta[property="${key}"]`, 'property', key, content);
    }

    const twitter: Record<string, string> = {
      'twitter:card': 'summary_large_image',
      'twitter:title': title,
      'twitter:description': description,
      'twitter:image': OG_IMAGE,
    };
    for (const [key, content] of Object.entries(twitter)) {
      upsertMeta(`meta[name="${key}"]`, 'name', key, content);
    }

    let link = document.querySelector('link[rel="canonical"]');
    if (!link) {
      link = document.createElement('link');
      link.setAttribute('rel', 'canonical');
      document.head.appendChild(link);
    }
    link.setAttribute('href', canonical);

    // Remove only OUR schema blocks before re-adding, so a re-render can't
    // stack duplicate blocks (which Google treats as an error).
    document.querySelectorAll('script[data-seo-schema]').forEach((el) => el.remove());
    if (schemaJson) {
      (JSON.parse(schemaJson) as Record<string, unknown>[]).forEach((obj) => {
        const script = document.createElement('script');
        script.type = 'application/ld+json';
        script.setAttribute('data-seo-schema', '');
        script.textContent = JSON.stringify(obj);
        document.head.appendChild(script);
      });
    }
  }, [title, description, path, schemaJson]);

  return null;
}

export const schemas = {
  website: (description: string) => ({
    '@context': 'https://schema.org',
    '@type': 'WebSite',
    name: SITE_NAME,
    url: SITE_URL,
    description,
  }),

  organization: (logoPath: string) => ({
    '@context': 'https://schema.org',
    '@type': 'Organization',
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}${logoPath}`,
  }),

  breadcrumbs: (items: readonly { name: string; path: string }[]) => ({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: items.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.name,
      item: `${SITE_URL}${item.path}`,
    })),
  }),

  faqPage: (questions: readonly { q: string; a: string }[]) => ({
    '@context': 'https://schema.org',
    '@type': 'FAQPage',
    mainEntity: questions.map(({ q, a }) => ({
      '@type': 'Question',
      name: q,
      acceptedAnswer: { '@type': 'Answer', text: a },
    })),
  }),
} as const;

export default SEOHead;
