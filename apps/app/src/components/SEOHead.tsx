import { useEffect } from 'react';

export interface SEOHeadProps {
  title: string;
  description: string;
  canonicalPath?: string;
  ogImage?: string;
  ogType?: 'website' | 'article';
  schemas?: Record<string, any>[];
}

const DOMAIN = 'https://opusoverseas.com';
const DEFAULT_OG_IMAGE = 'https://opusoverseas.com/og-image.png';

/**
 * Pure string renderer for build-time prerender (Vite prerender / Prestruct).
 * Returns the full <title> + meta + OG + Twitter + canonical + JSON-LD block
 * as HTML string — injected into static HTML so crawlers/AI see it without JS.
 * Gold standard: Google JS SEO Dec 2025 — critical SEO elements must be in
 * initial HTML, not injected via useEffect.
 */
export function renderSEOHeadString(props: SEOHeadProps): string {
  const { title, description, canonicalPath = '', ogImage = DEFAULT_OG_IMAGE, ogType = 'website', schemas = [] } = props;
  const fullCanonical = `${DOMAIN}${canonicalPath.startsWith('/') ? canonicalPath : `/${canonicalPath}`}`;
  const tags: string[] = [];
  tags.push(`<title>${escapeHtml(title)}</title>`);
  tags.push(`<meta name="description" content="${escapeHtml(description)}">`);
  tags.push(`<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1">`);
  tags.push(`<meta property="og:title" content="${escapeHtml(title)}">`);
  tags.push(`<meta property="og:description" content="${escapeHtml(description)}">`);
  tags.push(`<meta property="og:url" content="${escapeHtml(fullCanonical)}">`);
  tags.push(`<meta property="og:type" content="${ogType}">`);
  tags.push(`<meta property="og:site_name" content="Opus Overseas">`);
  tags.push(`<meta property="og:locale" content="en_IN">`);
  tags.push(`<meta property="og:image" content="${escapeHtml(ogImage)}">`);
  tags.push(`<meta name="twitter:card" content="summary_large_image">`);
  tags.push(`<meta name="twitter:title" content="${escapeHtml(title)}">`);
  tags.push(`<meta name="twitter:description" content="${escapeHtml(description)}">`);
  tags.push(`<meta name="twitter:image" content="${escapeHtml(ogImage)}">`);
  tags.push(`<link rel="canonical" href="${escapeHtml(fullCanonical)}">`);
  if (schemas.length > 0) {
    const graphData = { '@context': 'https://schema.org', '@graph': schemas };
    tags.push(`<script type="application/ld+json" id="opus-seo-schema">${JSON.stringify(graphData)}</script>`);
  }
  return tags.join('\n  ');
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

export default function SEOHead({
  title,
  description,
  canonicalPath = '',
  ogImage = DEFAULT_OG_IMAGE,
  ogType = 'website',
  schemas = [],
}: SEOHeadProps) {
  const fullCanonical = `${DOMAIN}${canonicalPath.startsWith('/') ? canonicalPath : `/${canonicalPath}`}`;

  useEffect(() => {
    // 1. Title
    document.title = title;

    // Helper to set or create meta tags
    const setMeta = (attr: 'name' | 'property', key: string, content: string) => {
      let el = document.head.querySelector(`meta[${attr}="${key}"]`) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement('meta');
        el.setAttribute(attr, key);
        document.head.appendChild(el);
      }
      el.setAttribute('content', content);
    };

    // 2. Standard Meta
    setMeta('name', 'description', description);
    setMeta('name', 'robots', 'index, follow, max-image-preview:large, max-snippet:-1, max-video-preview:-1');

    // 3. OpenGraph
    setMeta('property', 'og:title', title);
    setMeta('property', 'og:description', description);
    setMeta('property', 'og:url', fullCanonical);
    setMeta('property', 'og:type', ogType);
    setMeta('property', 'og:site_name', 'Opus Overseas');
    setMeta('property', 'og:locale', 'en_IN');
    setMeta('property', 'og:image', ogImage);

    // 4. Twitter Cards
    setMeta('name', 'twitter:card', 'summary_large_image');
    setMeta('name', 'twitter:title', title);
    setMeta('name', 'twitter:description', description);
    setMeta('name', 'twitter:image', ogImage);

    // 5. Canonical Link
    let canonicalEl = document.head.querySelector('link[rel="canonical"]') as HTMLLinkElement | null;
    if (!canonicalEl) {
      canonicalEl = document.createElement('link');
      canonicalEl.setAttribute('rel', 'canonical');
      document.head.appendChild(canonicalEl);
    }
    canonicalEl.setAttribute('href', fullCanonical);

    // 6. JSON-LD Schema Script
    let scriptEl = document.getElementById('opus-seo-schema') as HTMLScriptElement | null;
    if (!scriptEl) {
      scriptEl = document.createElement('script');
      scriptEl.id = 'opus-seo-schema';
      scriptEl.type = 'application/ld+json';
      document.head.appendChild(scriptEl);
    }

    if (schemas.length > 0) {
      const graphData = {
        '@context': 'https://schema.org',
        '@graph': schemas,
      };
      scriptEl.textContent = JSON.stringify(graphData, null, 2);
    }
  }, [title, description, fullCanonical, ogImage, ogType, schemas]);

  return null;
}
