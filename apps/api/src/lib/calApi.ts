/**
 * Cal.com API v2 client — server-side slots + booking creation.
 *
 * Gold-standard anti-spam rationale: the public cal.com booking page is a
 * spammer's dream (no bot gate, no rate limit, no lead validation — they can
 * book every slot). By creating bookings SERVER-SIDE through the API we keep
 * the funnel inside Opus OS where Turnstile, rate limits, suspicion scoring
 * and flood limits apply BEFORE a slot is ever locked.
 *
 * Docs: https://cal.com/docs/api-reference/v2/bookings/create-a-booking
 * Auth:  Authorization: Bearer <apiKey> + cal-api-version header.
 */
export const CAL_API_BASE = 'https://api.cal.com/v2';
// cal.com v2 is versioned PER ENDPOINT — using one version for all calls 404s.
// Verified against the live API (2026-08-18):
//   GET  /v2/event-types → 2024-06-14
//   GET  /v2/slots       → 2024-09-04
//   POST /v2/bookings    → 2026-02-25
export const CAL_API_VERSION_EVENT_TYPES = '2024-06-14';
export const CAL_API_VERSION_SLOTS = '2024-09-04';
export const CAL_API_VERSION_BOOKINGS = '2026-02-25';

export interface CalSlotResult {
  ok: boolean;
  slots?: string[]; // ISO-8601 UTC start times
  reason?: 'no_api_key' | 'invalid_api_key' | 'bad_request' | 'slot_taken' | 'unavailable' | 'error';
  message?: string;
}

export interface CalBookingResult {
  ok: boolean;
  uid?: string;
  start?: string;
  end?: string;
  status?: string;
  reason?: 'no_api_key' | 'invalid_api_key' | 'bad_request' | 'slot_taken' | 'unavailable' | 'error';
  message?: string;
}

async function calFetch(apiKey: string, path: string, version: string, init?: RequestInit): Promise<Response> {
  return fetch(`${CAL_API_BASE}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'cal-api-version': version,
      ...(init?.headers || {}),
    },
  });
}

function normalizeError(status: number): CalSlotResult['reason'] {
  if (status === 401 || status === 403) return 'invalid_api_key';
  if (status === 400 || status === 422) return 'bad_request';
  if (status === 409) return 'slot_taken';
  if (status >= 500) return 'unavailable';
  return 'error';
}

/** GET /v2/slots — available start times for an event type in a window. */
export async function calGetSlots(
  apiKey: string,
  eventTypeId: string | number,
  startISO: string,
  endISO: string,
  timeZone: string,
): Promise<CalSlotResult> {
  if (!apiKey) return { ok: false, reason: 'no_api_key', message: 'Cal.com API key not configured' };
  try {
    const qs = new URLSearchParams({
      eventTypeId: String(eventTypeId),
      start: startISO,
      end: endISO,
      timeZone,
    });
    const res = await calFetch(apiKey, `/slots?${qs.toString()}`, CAL_API_VERSION_SLOTS);
    if (!res.ok) {
      const reason = normalizeError(res.status);
      return { ok: false, reason, message: `Cal.com slots request failed (${res.status})` };
    }
    const body: any = await res.json();
    // v2 shape: { status, data: { slots: { "2026-03-20": ["2026-03-20T15:00:00Z", ...] } } }
    const byDate: Record<string, string[]> = body?.data?.slots || {};
    const slots = Object.values(byDate).flat().sort();
    return { ok: true, slots };
  } catch {
    return { ok: false, reason: 'unavailable', message: 'Cal.com API unreachable' };
  }
}

/** POST /v2/bookings — create a booking server-side. */
export async function calCreateBooking(
  apiKey: string,
  input: {
    eventTypeId: string | number;
    start: string; // ISO-8601 UTC
    attendee: { name: string; email: string; timeZone: string; language?: string; phoneNumber?: string };
    metadata?: Record<string, unknown>;
  },
): Promise<CalBookingResult> {
  if (!apiKey) return { ok: false, reason: 'no_api_key', message: 'Cal.com API key not configured' };
  try {
    const res = await calFetch(apiKey, '/bookings', CAL_API_VERSION_BOOKINGS, {
      method: 'POST',
      body: JSON.stringify({
        start: input.start,
        eventTypeId: Number(input.eventTypeId),
        attendee: {
          name: input.attendee.name,
          email: input.attendee.email,
          timeZone: input.attendee.timeZone,
          language: input.attendee.language || 'en',
          ...(input.attendee.phoneNumber ? { phoneNumber: input.attendee.phoneNumber } : {}),
        },
        metadata: input.metadata || { source: 'opusos' },
      }),
    });
    if (!res.ok) {
      const reason = normalizeError(res.status);
      let message = `Cal.com booking failed (${res.status})`;
      try {
        const err: any = await res.json();
        message = err?.error?.message || err?.message || message;
      } catch { /* keep default */ }
      return { ok: false, reason, message };
    }
    const body: any = await res.json();
    const data = body?.data || {};
    return {
      ok: true,
      uid: data.uid,
      start: data.start,
      end: data.end,
      status: data.status || 'scheduled',
    };
  } catch {
    return { ok: false, reason: 'unavailable', message: 'Cal.com API unreachable' };
  }
}