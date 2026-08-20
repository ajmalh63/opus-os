/**
 * Centralized Booking & Lead Capture Configuration (Cal.com integration)
 */
export const CAL_BOOKING_URL = 
  (typeof import.meta !== 'undefined' && import.meta.env?.VITE_BOOKING_URL) || 
  'https://cal.com/opus.overseas/study-abroad-consultation';

export const DIVISION_BOOKING_URLS: Record<string, string> = {
  'study-abroad': 'https://cal.com/opus.overseas/study-abroad-consultation',
  'visa': 'https://cal.com/opus.overseas/visa-consultation',
  'manpower': 'https://cal.com/opus.overseas/manpower-screening',
};

export function getBookingUrlForDivision(division?: string): string {
  if (division && DIVISION_BOOKING_URLS[division]) {
    return DIVISION_BOOKING_URLS[division];
  }
  return CAL_BOOKING_URL;
}

// Cal.com is the scheduling engine for CONSULTATION-LED divisions only
// (study-abroad, visa, manpower). Attestation & Umrah are TRANSACTIONAL —
// they must NOT route to a cal.com booking (architecture doc §8).
export const CONSULTATION_DIVISIONS = ['study-abroad', 'visa', 'manpower'] as const;
export function isConsultationDivision(division?: string): boolean {
  return !!division && (CONSULTATION_DIVISIONS as readonly string[]).includes(division);
}

export const LEAD_FORM_ROUTE = '/lead-form';
export const CONTACT_ROUTE = '/contact';
export const LOGIN_ROUTE = '/login';

// Lead-form href that preserves partner attribution (?ref=) when present in
// the current URL, so /go deep links keep attribution through the funnel.
export function leadFormHref(extraQuery?: Record<string, string>): string {
  const params = new URLSearchParams(
    typeof window !== 'undefined' ? window.location.search : '',
  );
  const ref = params.get('ref');
  const query = new URLSearchParams();
  if (ref) query.set('ref', ref);
  if (extraQuery) {
    for (const [k, v] of Object.entries(extraQuery)) {
      if (v) query.set(k, v);
    }
  }
  const qs = query.toString();
  return `${LEAD_FORM_ROUTE}${qs ? `?${qs}` : ''}`;
}
