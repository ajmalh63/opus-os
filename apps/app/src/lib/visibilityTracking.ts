import { useEffect } from 'react';
const API = (import.meta as any).env?.VITE_API_URL || '';

// Visibility Hub — public-site tracking (GA4 + GTM + Meta Pixel + CF WA + D1)
// Elite wiring: one fetch to /api/visibility/ga4/config drives all pixels.
// - GA4 via gtag.js (if G-... set)
// - GTM via gtm.js (if GTM-... set) — dataLayer is source of truth, GTM then fires GA4/Meta/etc
// - Meta Pixel via fbevents.js (if pixel set) — fbq PageView on every page_view, Lead on conversions
// - CF WA beacon via beacon.min.js (if token set)
// - D1 local capture always (lead_form_submit, page_view) for attribution in Superadmin
// Principles: decision-aligned events only, no duplication, SPA-safe inject-once.

function post(path: string, body: any) {
  try {
    fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }).catch(() => {});
  } catch { /* silent */ }
}

// --- Script injectors (idempotent) ---
let injected = { gtag: '', gtm: '', meta: '', cf: false };

function ensureGtag(measurementId: string) {
  if (!measurementId || injected.gtag === measurementId) return;
  if (typeof document === 'undefined') return;
  // gtag.js
  if (!document.querySelector(`script[src*="gtag/js?id=${measurementId}"]`)) {
    const s = document.createElement('script');
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtag/js?id=${measurementId}`;
    document.head.appendChild(s);
  }
  // dataLayer + gtag stub
  (window as any).dataLayer = (window as any).dataLayer || [];
  if (!(window as any).gtag) {
    (window as any).gtag = function() {
      (window as any).dataLayer.push(arguments);
    };
  }
  (window as any).gtag('js', new Date());
  (window as any).gtag('config', measurementId, { send_page_view: false });
  injected.gtag = measurementId;
}

function ensureGtm(gtmId: string) {
  if (!gtmId || injected.gtm === gtmId) return;
  if (typeof document === 'undefined') return;
  (window as any).dataLayer = (window as any).dataLayer || [];
  (window as any).dataLayer.push({ 'gtm.start': new Date().getTime(), event: 'gtm.js' });
  if (!document.querySelector(`script[src*="googletagmanager.com/gtm.js?id=${gtmId}"]`)) {
    const s = document.createElement('script');
    s.async = true;
    s.src = `https://www.googletagmanager.com/gtm.js?id=${gtmId}`;
    document.head.appendChild(s);
  }
  // noscript fallback (for non-JS crawl, not needed for SPA but added for completeness)
  if (!document.getElementById('gtm-noscript')) {
    const ns = document.createElement('noscript');
    ns.id = 'gtm-noscript';
    ns.innerHTML = `<iframe src="https://www.googletagmanager.com/ns.html?id=${gtmId}" height="0" width="0" style="display:none;visibility:hidden"></iframe>`;
    document.body.prepend(ns);
  }
  injected.gtm = gtmId;
}

function ensureMetaPixel(pixelId: string) {
  if (!pixelId || injected.meta === pixelId) return;
  if (typeof document === 'undefined') return;
  // fbq stub (Meta's standard snippet) — @ts-ignore: Meta's 7-arg IIFE intentionally called with 4
  if (!(window as any).fbq) {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    (function(f:any,b:any,e:any,v:any){ let n:any,t:any,s:any; if(f.fbq) return; n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)}; if(!f._fbq) f._fbq=n; n.push=n; n.loaded=!0; n.version='2.0'; n.queue=[]; t=b.createElement(e); t.async=!0; t.src=v; s=b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t,s); } as any)(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
  }
  (window as any).fbq('init', pixelId);
  injected.meta = pixelId;
}

function ensureCfBeacon(cfWaToken: string) {
  if (!cfWaToken || injected.cf) return;
  if (typeof document === 'undefined' || document.getElementById('cf-beacon')) { injected.cf = true; return; }
  const script = document.createElement('script');
  script.id = 'cf-beacon';
  script.defer = true;
  script.src = 'https://static.cloudflareinsights.com/beacon.min.js';
  script.setAttribute('data-cf-beacon', JSON.stringify({ token: cfWaToken }));
  document.head.appendChild(script);
  injected.cf = true;
}

// --- Unified fire helpers (dataLayer-first, then pixels) ---
function pushDataLayer(eventName: string, params: Record<string, any> = {}) {
  try {
    (window as any).dataLayer = (window as any).dataLayer || [];
    (window as any).dataLayer.push({ event: eventName, ...params, _opus_ts: Date.now() });
  } catch {}
}

function fireGtag(eventName: string, params: Record<string, any> = {}) {
  try { (window as any).gtag?.('event', eventName, params); } catch {}
}

function fireFbq(track: 'track' | 'trackCustom', eventName: string, params: Record<string, any> = {}) {
  try { (window as any).fbq?.(track, eventName, params); } catch {}
}

// One-time config fetch + inject (cached for session)
let configPromise: Promise<any> | null = null;
function getConfig(): Promise<{ measurementId?: string; gtmId?: string; metaPixelId?: string; cfWaToken?: string }> {
  if (configPromise) return configPromise;
  configPromise = fetch(`${API}/api/visibility/ga4/config`)
    .then(r => r.json())
    .then(d => ({ measurementId: d?.measurementId, gtmId: d?.gtmId, metaPixelId: d?.metaPixelId, cfWaToken: d?.cfWaToken }))
    .catch(() => ({}));
  return configPromise;
}

function injectAll(cfg: { measurementId?: string; gtmId?: string; metaPixelId?: string; cfWaToken?: string }) {
  if (cfg.gtmId) ensureGtm(cfg.gtmId);
  if (cfg.measurementId) ensureGtag(cfg.measurementId);
  if (cfg.metaPixelId) ensureMetaPixel(cfg.metaPixelId);
  if (cfg.cfWaToken) ensureCfBeacon(cfg.cfWaToken);
}

export function useVisibilityTracking(route: string) {
  useEffect(() => {
    // 1. UTM capture → attribution (V7) — preserve for lead
    try {
      const params = new URLSearchParams(window.location.search);
      const utm = {
        source: params.get('utm_source') || undefined,
        medium: params.get('utm_medium') || undefined,
        campaign: params.get('utm_campaign') || undefined,
      };
      if (utm.source || utm.medium || utm.campaign) {
        post('/api/visibility/utm', utm);
        localStorage.setItem('opusos_utm', JSON.stringify(utm));
      }
    } catch { /* silent */ }

    // 2. Config fetch + pixel inject (once)
    getConfig().then(cfg => {
      injectAll(cfg);
      // 3. Page view — fires after inject so gtag/fbq exist
      // D1 local (always)
      post('/api/visibility/ga4/events', { eventName: 'page_view', page: route });
      // dataLayer (for GTM)
      pushDataLayer('page_view', { page_path: route, page_location: window.location.href, page_title: document.title });
      // GA4 (recommended: no auto page_view, we fire manually)
      if (cfg.measurementId) fireGtag('page_view', { page_path: route, page_location: window.location.href, page_title: document.title });
      // Meta
      if (cfg.metaPixelId) fireFbq('track', 'PageView');
    });

    // 4. Meta injection from SEO Hub (V1) — SPA title/OG/schema
    fetch(`${API}/api/visibility/public/meta?route=${encodeURIComponent(route)}`)
      .then(r => r.json())
      .then((d: any) => {
        if (!d?.meta) return;
        const m = d.meta;
        if (m.title) document.title = m.title;
        const setMeta = (name: string, content: string, attr = 'name') => {
          let el = document.head.querySelector(`meta[${attr}="${name}"]`) as HTMLMetaElement | null;
          if (!el) { el = document.createElement('meta'); el.setAttribute(attr, name); document.head.appendChild(el); }
          el.setAttribute('content', content);
        };
        if (m.metaDescription) setMeta('description', m.metaDescription);
        if (m.ogTitle) { setMeta('og:title', m.ogTitle, 'property'); setMeta('twitter:title', m.ogTitle); }
        if (m.ogImage) { setMeta('og:image', m.ogImage, 'property'); setMeta('twitter:image', m.ogImage); }
        if (m.schemaJson) {
          try {
            const parsed = JSON.parse(m.schemaJson);
            let el = document.getElementById('seo-jsonld') as HTMLScriptElement | null;
            if (!el) { el = document.createElement('script'); el.id = 'seo-jsonld'; el.type = 'application/ld+json'; document.head.appendChild(el); }
            el.textContent = JSON.stringify(parsed);
          } catch { /* invalid schema */ }
        }
      })
      .catch(() => {});
  }, [route]);
}

// Decision-grade conversions (single source of truth — call these, not raw post/gtag)
// Lead: the only conversion that matters for Opus (D1 + GA4 generate_lead + Meta Lead + GTM)
export function trackLeadFormSubmit() {
  const utm = localStorage.getItem('opusos_utm');
  let source = 'website';
  try { if (utm) { const u = JSON.parse(utm); if (u.source) source = `${u.source}${u.medium ? '/' + u.medium : ''}${u.campaign ? '/' + u.campaign : ''}`; } } catch {}
  const page = window.location.pathname;
  // D1
  post('/api/visibility/ga4/events', { eventName: 'lead_form_submit', page, source });
  // dataLayer (GTM)
  pushDataLayer('generate_lead', { page_path: page, source, value: 1, currency: 'INR' });
  pushDataLayer('lead_form_submit', { page_path: page, source });
  // GA4 recommended
  fireGtag('generate_lead', { source, page_path: page, value: 1, currency: 'INR' });
  // Meta
  fireFbq('track', 'Lead', { content_name: page, utm_source: source });
  // Umami (kept for internal dashboard)
  try { (window as any).umami?.track('lead_form_submit', { source, page }); } catch {}
  return source;
}

// Secondary intent signals (not conversions — for optimization)
export function trackBookingCta(page?: string) {
  const p = page || window.location.pathname;
  post('/api/visibility/ga4/events', { eventName: 'booking_cta_click', page: p });
  pushDataLayer('cta_click', { cta: 'booking', page_path: p });
  fireGtag('select_content', { content_type: 'cta', content_id: 'booking', page_path: p });
  fireFbq('trackCustom', 'BookingCtaClick', { page: p });
}

export function trackEligibilityCheck(page?: string) {
  const p = page || window.location.pathname;
  post('/api/visibility/ga4/events', { eventName: 'eligibility_check', page: p });
  pushDataLayer('eligibility_check', { page_path: p });
  fireGtag('view_item', { page_path: p });
}
