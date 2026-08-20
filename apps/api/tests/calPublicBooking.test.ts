import { describe, it, expect, beforeEach, vi } from 'vitest';
import app from '../src/index.js';
import { MockD1Database } from './mockDb.js';

vi.mock('../src/auth.js', () => ({
  getAuth: () => ({
    api: {
      getSession: async () => null,
    },
  }),
}));

// Public cal.com booking API (gold-standard anti-spam funnel):
//   GET  /api/cal/public/slots  — rate-limited slot availability
//   POST /api/cal/public/book   — Turnstile + rate limit + suspicion score +
//                                 flood limit + server-side creation via API v2
describe('Public cal.com booking API — anti-spam funnel', () => {
  let mockD1: MockD1Database;
  const ENV = () => ({
    DB: mockD1,
    BETTER_AUTH_SECRET: 'x',
    TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA', // always-pass mock
  });

  beforeEach(() => {
    mockD1 = new MockD1Database();
    mockD1.tables.app_settings.push(
      { key: 'cal_api_key', value: 'cal_live_testkey123', updated_at: 1 },
      { key: 'cal_event_types', value: JSON.stringify({ 'study-abroad': '111', visa: '222', manpower: '333' }), updated_at: 1 },
    );
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => { vi.unstubAllGlobals(); });

  const mockCal = (fn: (url: string, init?: any) => any) => {
    (fetch as any).mockImplementation(fn);
  };

  it('GET /slots: no API key configured → 503 no_api_key', async () => {
    mockD1.tables.app_settings = mockD1.tables.app_settings.filter((r: any) => r.key !== 'cal_api_key');
    const res = await app.request('/api/cal/public/slots?division=study-abroad&start=2026-09-01T00:00:00Z&end=2026-09-15T00:00:00Z', {}, ENV());
    expect(res.status).toBe(503);
    const j = await res.json() as any;
    expect(j.reason).toBe('no_api_key');
  });

  it('GET /slots: no event type configured for the division → 503 no_event_type', async () => {
    // Remove manpower from the configured event map (only study-abroad + visa set)
    mockD1.tables.app_settings = mockD1.tables.app_settings.filter((r: any) => r.key !== 'cal_event_types');
    mockD1.tables.app_settings.push({ key: 'cal_event_types', value: JSON.stringify({ 'study-abroad': '111', visa: '222' }), updated_at: 1 });
    const res = await app.request('/api/cal/public/slots?division=manpower&start=2026-09-01T00:00:00Z&end=2026-09-15T00:00:00Z', {}, ENV());
    expect(res.status).toBe(503);
    const j = await res.json() as any;
    expect(j.reason).toBe('no_event_type');
  });

  it('GET /slots: proxies cal.com API v2 and flattens date-keyed slots', async () => {
    mockCal(async (url: string) => {
      expect(String(url)).toContain('api.cal.com/v2/slots');
      expect(String(url)).toContain('eventTypeId=111');
      return new Response(JSON.stringify({
        status: 'success',
        data: { slots: { '2026-09-02': ['2026-09-02T09:00:00Z', '2026-09-02T10:00:00Z'], '2026-09-03': ['2026-09-03T09:00:00Z'] } },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    const res = await app.request('/api/cal/public/slots?division=study-abroad&start=2026-09-01T00:00:00Z&end=2026-09-15T00:00:00Z', {}, ENV());
    expect(res.status).toBe(200);
    const j = await res.json() as any;
    expect(j.success).toBe(true);
    expect(j.slots).toEqual(['2026-09-02T09:00:00Z', '2026-09-02T10:00:00Z', '2026-09-03T09:00:00Z']);
  });

  it('POST /book: honeypot field filled → fake success, nothing booked', async () => {
    const book = mockD1.tables.bookings;
    const res = await app.request('/api/cal/public/book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        division: 'study-abroad', start: '2026-09-02T09:00:00Z',
        name: 'Spam Bot', email: 'bot@spam.com', website: 'http://spam.example',
      }),
    }, ENV());
    expect(res.status).toBe(200);
    expect((await res.json() as any).success).toBe(true);
    expect(book.length).toBe(0);
    expect((fetch as any)).not.toHaveBeenCalledWith(expect.stringContaining('api.cal.com/v2/bookings'), expect.anything());
  });

  it('POST /book: high suspicion score (disposable email + no phone) → 403, no booking', async () => {
    const book = mockD1.tables.bookings;
    const res = await app.request('/api/cal/public/book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        division: 'study-abroad', start: '2026-09-02T09:00:00Z',
        name: 'Test User', email: 'spam@mailinator.com',
      }),
    }, ENV());
    expect(res.status).toBe(403);
    const j = await res.json() as any;
    expect(j.reason).toBe('suspicious');
    expect(book.length).toBe(0);
  });

  it('POST /book: flood limit — 3+ bookings same email/phone in 24h → 429', async () => {
    for (const n of [1, 2, 3]) {
      mockD1.tables.bookings.push({
        id: `b${n}`, calUid: `uid${n}`, eventTypeId: '111', division: 'study-abroad',
        title: 't', startTime: 1, endTime: 2, attendeeName: 'X',
        attendeeEmail: 'flood@example.com', attendeePhone: '+911234567890',
        status: 'scheduled', createdAt: Math.floor(Date.now() / 1000), updatedAt: 1,
      } as any);
    }
    const res = await app.request('/api/cal/public/book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        division: 'study-abroad', start: '2026-09-02T09:00:00Z',
        name: 'Flooder', email: 'flood@example.com', phone: '+911234567890',
      }),
    }, ENV());
    expect(res.status).toBe(429);
    expect((await res.json() as any).reason).toBe('flood_limit');
  });

  it('POST /book: valid request creates the booking server-side + local row + audit', async () => {
    mockCal(async (url: string, init?: any) => {
      if (String(url).includes('/v2/bookings')) {
        const body = JSON.parse(String(init?.body));
        expect(body.eventTypeId).toBe(111);
        expect(body.attendee.email).toBe('genuine@example.com');
        expect(body.attendee.timeZone).toBe('Asia/Kolkata');
        return new Response(JSON.stringify({
          status: 'success',
          data: { uid: 'cal-uid-123', start: '2026-09-02T09:00:00Z', end: '2026-09-02T09:30:00Z', status: 'scheduled' },
        }), { status: 201, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('{}', { status: 404 });
    });
    const res = await app.request('/api/cal/public/book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        division: 'study-abroad', start: '2026-09-02T09:00:00Z',
        name: 'Genuine Student', email: 'genuine@example.com', phone: '+919876543210',
        timeZone: 'Asia/Kolkata',
      }),
    }, ENV());
    expect(res.status).toBe(200);
    const j = await res.json() as any;
    expect(j.success).toBe(true);
    expect(j.booking.uid).toBe('cal-uid-123');
    const row = mockD1.tables.bookings.find((b: any) => b.cal_uid === 'cal-uid-123');
    expect(row).toBeTruthy();
    expect(row.attendee_email).toBe('genuine@example.com');
    expect(row.risk_score).toBeLessThan(50);
  });

  it('POST /book: division without an event type → 503 no_event_type', async () => {
    mockD1.tables.app_settings = mockD1.tables.app_settings.filter((r: any) => r.key !== 'cal_event_types');
    mockD1.tables.app_settings.push({ key: 'cal_event_types', value: JSON.stringify({ 'study-abroad': '111', visa: '222' }), updated_at: 1 });
    const res = await app.request('/api/cal/public/book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        division: 'manpower', start: '2026-09-02T09:00:00Z',
        name: 'Genuine', email: 'genuine@example.com', phone: '+919876543210',
      }),
    }, ENV());
    expect(res.status).toBe(503);
    expect((await res.json() as any).reason).toBe('no_event_type');
  });

  it('POST /book: non-consultation division rejected by schema (umrah → 400)', async () => {
    const res = await app.request('/api/cal/public/book', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        division: 'umrah', start: '2026-09-02T09:00:00Z',
        name: 'Genuine', email: 'genuine@example.com',
      }),
    }, ENV());
    expect(res.status).toBe(400);
  });
});
