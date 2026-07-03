import { useEffect } from "react";

const SITE_NAME = "Perfect Resume";
const SITE_URL = "https://example.com"; // PROJECT CONFIG: canonical site URL

interface SEOHeadProps {
  title: string;
  description: string;
  canonical?: string;
  schema?: Record<string, unknown> | Record<string, unknown>[];
}

export function SEOHead({ title, description, canonical, schema }: SEOHeadProps) {
  useEffect(() => {
    document.title = title;

    // Meta description
    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = document.createElement("meta");
      metaDesc.setAttribute("name", "description");
      document.head.appendChild(metaDesc);
    }
    metaDesc.setAttribute("content", description);

    // Open Graph
    const ogTags: Record<string, string> = {
      "og:title": title,
      "og:description": description,
      "og:type": "website",
      "og:site_name": SITE_NAME,
      "og:url": canonical || SITE_URL,
    };
    for (const [property, content] of Object.entries(ogTags)) {
      let el = document.querySelector(`meta[property="${property}"]`);
      if (!el) {
        el = document.createElement("meta");
        el.setAttribute("property", property);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    }

    // Canonical URL
    if (canonical) {
      let canonicalLink = document.querySelector('link[rel="canonical"]');
      if (!canonicalLink) {
        canonicalLink = document.createElement("link");
        canonicalLink.setAttribute("rel", "canonical");
        document.head.appendChild(canonicalLink);
      }
      canonicalLink.setAttribute("href", canonical);
    }

    // JSON-LD structured data
    if (schema) {
      const schemaArray = Array.isArray(schema) ? schema : [schema];
      const existing = document.querySelectorAll('script[type="application/ld+json"]');
      existing.forEach((el) => {
        if (el.id?.startsWith("seo-schema")) el.remove();
      });
      schemaArray.forEach((schemaObj, i) => {
        const script = document.createElement("script");
        script.type = "application/ld+json";
        script.id = `seo-schema-${i}`;
        script.text = JSON.stringify(schemaObj);
        document.head.appendChild(script);
      });
    }
  }, [title, description, canonical, schema]);

  return null;
}

// Reusable schema builders
export const schemas = {
  website: () => ({
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: SITE_NAME,
    url: SITE_URL,
    description:
      "A custom-tailored resume for every role you apply to - precision-engineered to get past the first screening and earn the interview invitation.",
  }),

  organization: () => ({
    "@context": "https://schema.org",
    "@type": "Organization",
    name: SITE_NAME,
    url: SITE_URL,
    logo: `${SITE_URL}/images/logo.png`,
    sameAs: [],
  }),

  breadcrumbs: (items: { name: string; url: string }[]) => ({
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, i) => ({
      "@type": "ListItem",
      position: i + 1,
      name: item.name,
      item: item.url,
    })),
  }),

  faqPage: (questions: { q: string; a: string }[]) => ({
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: questions.map(({ q, a }) => ({
      "@type": "Question",
      name: q,
      acceptedAnswer: {
        "@type": "Answer",
        text: a,
      },
    })),
  }),

  softwareApplication: () => ({
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: SITE_NAME,
    applicationCategory: "BusinessApplication",
    operatingSystem: "Web",
    url: SITE_URL,
    offers: {
      "@type": "Offer",
      price: "0",
      priceCurrency: "USD",
      description: "Free tier with paid upgrades",
    },
  }),
};
