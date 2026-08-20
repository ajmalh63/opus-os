import { describe, it, expect, beforeEach } from 'vitest';
import app from '../src/index.js';
import { MockD1Database } from './mockDb.js';

// Regression: public attribution endpoints (POST /api/visibility/utm,
// POST /api/visibility/ga4/events, GET /api/visibility/ga4/config) must stay
// OPEN to anonymous visitors (rate-limited, not RBAC-gated) so conversion
// tracking fires on every public page. See index.ts mount ordering.
describe('Public visibility endpoints (anonymous access)', () => {
  let mockD1: MockD1Database;

  beforeEach(() => {
    mockD1 = new MockD1Database();
  });

  it('POST /api/visibility/utm is open without a session', async () => {
    const res = await app.request('/api/visibility/utm', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ source: 'google', medium: 'cpc', campaign: 'c1' }),
    }, { DB: mockD1, BETTER_AUTH_SECRET: 's' });
    expect(res.status).toBe(200);
    const j = await res.json() as any;
    expect(j.success).toBe(true);
    expect(mockD1.tables.utm_events.length).toBe(1);
  });

  it('POST /api/visibility/ga4/events is open without a session', async () => {
    const res = await app.request('/api/visibility/ga4/events', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ eventName: 'page_view', page: '/study-abroad' }),
    }, { DB: mockD1, BETTER_AUTH_SECRET: 's' });
    expect(res.status).toBe(200);
  });

  it('GET /api/visibility/ga4/config is open without a session', async () => {
    mockD1.tables.app_settings.push({ key: 'ga4_measurement_id', value: 'G-123', updated_at: 0 } as any);
    const res = await app.request('/api/visibility/ga4/config', {}, { DB: mockD1, BETTER_AUTH_SECRET: 's' });
    expect(res.status).toBe(200);
    const j = await res.json() as any;
    expect(j.measurementId).toBe('G-123');
  });

  it('manager-only visibility endpoints still require RBAC (no session → 401)', async () => {
    const res = await app.request('/api/visibility/seo/audit', {}, { DB: mockD1, BETTER_AUTH_SECRET: 's' });
    expect(res.status).toBe(401);
  });
});
