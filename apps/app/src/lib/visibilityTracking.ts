import { useEffect } from 'react';

// Visibility Hub — public-site tracking hook (V2 GA events + V7 UTM capture + V1 meta injection).
// Runs on public pages only. Best-effort: failures are silent (never block the page).

function post(path: string, body: any) {
  try {
    fetch(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    }).catch(() => {});
  } catch { /* silent */ }
}

export function useVisibilityTracking(route: string) {
  useEffect(() => {
    // 1. UTM capture → attribution (V7)
    try {
      const params = new URLSearchParams(window.location.search);
      const utm = {
        source: params.get('utm_source') || undefined,
        medium: params.get('utm_medium') || undefined,
        campaign: params.get('utm_campaign') || undefined,
      };
      if (utm.source || utm.medium || utm.campaign) {
        post('/api/visibility/utm', utm);
        // Persist for lead-form attribution
        localStorage.setItem('opusos_utm', JSON.stringify(utm));
      }
    } catch { /* silent */ }

    // 2. GA event (V2)
    post('/api/visibility/ga4/events', { eventName: 'page_view', page: route });

    // 3. Meta injection from SEO Hub (V1) — best effort for the SPA
    fetch(`/api/visibility/public/meta?route=${encodeURIComponent(route)}`)
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
          } catch { /* invalid schema — skip */ }
        }
      })
      .catch(() => {});
  }, [route]);
}

// Call on lead-form submit to attribute the lead (V7)
export function trackLeadFormSubmit() {
  const utm = localStorage.getItem('opusos_utm');
  let source = 'website';
  try { if (utm) { const u = JSON.parse(utm); if (u.source) source = `${u.source}${u.medium ? '/' + u.medium : ''}`; } } catch { /* ignore */ }
  post('/api/visibility/ga4/events', { eventName: 'lead_form_submit', page: window.location.pathname, source });
  return source;
}