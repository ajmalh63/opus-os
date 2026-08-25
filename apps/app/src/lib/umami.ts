// Wave 1 — Umami privacy-first tracker (cookieless, DPDP-friendly).
// Injects the self-hosted Umami script once from env VITE_UMAMI_BASE_URL and
// exposes track() for the plan's event taxonomy. No-op unless configured.

const UMAMI_BASE = (import.meta.env.VITE_UMAMI_BASE_URL as string) || '';
const UMAMI_WEBSITE_ID = (import.meta.env.VITE_UMAMI_WEBSITE_ID as string) || '';
const configured = !!(UMAMI_BASE && UMAMI_WEBSITE_ID);

declare global {
  interface Window {
    umami?: { track: (event: string, data?: Record<string, any>) => void };
  }
}

let scriptInjected = false;

export function ensureUmami(): void {
  if (!configured || scriptInjected || typeof document === 'undefined') return;
  scriptInjected = true;
  const s = document.createElement('script');
  s.defer = true;
  s.src = `${UMAMI_BASE.replace(/\/$/, '')}/script.js`;
  s.dataset.websiteId = UMAMI_WEBSITE_ID;
  document.head.appendChild(s);
}

// Fire a taxonomy event; safe no-op when Umami isn't configured (event
// tracking must never break the business action it accompanies).
// ELITE WIRING: every umami track also forwards to GTM dataLayer + GA4 gtag + Meta fbq
// so existing callsites (EVENTS.bookingCta etc.) automatically become GA4/Meta without rewiring.
export function track(event: string, data?: Record<string, any>): void {
  // 1. Umami (internal)
  if (configured) {
    try { window.umami?.track(event, data); } catch { /* best-effort */ }
  }
  // 2. GTM dataLayer (always — GTM then fans out to GA4/Meta/etc)
  try {
    (window as any).dataLayer = (window as any).dataLayer || [];
    (window as any).dataLayer.push({ event, ...data, _opus_ts: Date.now() });
  } catch {}
  // 3. GA4 gtag — map taxonomy to GA4 recommended where possible
  try {
    const gtag = (window as any).gtag;
    if (gtag) {
      if (event === 'lead_form_submit') gtag('event', 'generate_lead', { ...data, currency: 'INR', value: 1 });
      else if (event === 'booking_cta_click') gtag('event', 'select_content', { content_type: 'cta', content_id: 'booking', ...data });
      else if (event === 'eligibility_check') gtag('event', 'view_item', data);
      else gtag('event', event, data);
    }
  } catch {}
  // 4. Meta fbq — only for decision-grade (avoid noise)
  try {
    const fbq = (window as any).fbq;
    if (fbq) {
      if (event === 'lead_form_submit') fbq('track', 'Lead', data);
      else if (event === 'booking_cta_click') fbq('trackCustom', 'BookingCtaClick', data);
    }
  } catch {}
}

// Event taxonomy v1 (Wave 1 doc — keep in sync with TOOL-STRATEGIES §5.5):
//   lead_form_submit · booking_cta_click · chat_open · eligibility_check ·
//   jobs_click · umrah_departure_view · partner_register · share_link_copied
export const EVENTS = {
  leadSubmit: 'lead_form_submit',
  bookingCta: 'booking_cta_click',
  chatOpen: 'chat_open',
  eligibility: 'eligibility_check',
  jobsClick: 'jobs_click',
  umrahView: 'umrah_departure_view',
  partnerRegister: 'partner_register',
  shareCopied: 'share_link_copied',
  featureClick: 'feature_click',
  calculatorUse: 'calculator_use',
} as const;