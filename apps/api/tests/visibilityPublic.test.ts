import { describe, it, expect, beforeEach, vi } from 'vitest';
import app from '../src/index.js';
import { MockD1Database } from './mockDb.js';

vi.mock('../src/auth.js', () => {
  return {
    getAuth: () => ({
      api: {
        getSession: async (options: any) => {
          const cookieHeader = options?.headers?.get('cookie') || '';
          const match = cookieHeader.match(/better-auth\.session_token=([^;]+)/);
          const token = match ? match[1] : null;

          if (token === 'token-admin') {
            return {
              user: {
                id: 'admin-1',
                name: 'Admin User',
                email: 'admin@test.com',
                role: 'super_admin',
                userDivisions: JSON.stringify(['study-abroad', 'visa', 'umrah', 'attestation', 'manpower']),
              },
              session: {
                id: 'session-admin',
                token,
                userId: 'admin-1',
              },
            };
          }
          return null;
        },
      },
    }),
  };
});

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

  it('GET /api/visibility/public/meta returns gold-standard default meta for any static route', async () => {
    const res = await app.request('/api/visibility/public/meta?route=/study-abroad', {}, { DB: mockD1, BETTER_AUTH_SECRET: 's' });
    expect(res.status).toBe(200);
    const j = await res.json() as any;
    expect(j.success).toBe(true);
    expect(j.meta.title).toBe('Study Abroad Programs | Top Universities in UK, USA & Germany');
    expect(j.meta.metaDescription.length).toBeLessThanOrEqual(165);
    expect(j.meta.ogTitle).toBeDefined();
    expect(JSON.parse(j.meta.schemaJson)['@type']).toBe('EducationalOrganization');
  });

  it('GET /api/visibility/seo/audit returns 100/100 average score with 0 issues across all 7 routes', async () => {
    const res = await app.request('/api/visibility/seo/audit', {
      headers: { cookie: 'better-auth.session_token=token-admin' },
    }, { DB: mockD1, BETTER_AUTH_SECRET: 's' });
    expect(res.status).toBe(200);
    const j = await res.json() as any;
    expect(j.success).toBe(true);
    expect(j.avgScore).toBe(100);
    expect(j.pages.length).toBe(7);
    for (const page of j.pages) {
      expect(page.score).toBe(100);
      expect(page.issues.length).toBe(0);
    }
  });

  it('GET /api/visibility/seo/pages returns 7 complete pages', async () => {
    const res = await app.request('/api/visibility/seo/pages', {
      headers: { cookie: 'better-auth.session_token=token-admin' },
    }, { DB: mockD1, BETTER_AUTH_SECRET: 's' });
    expect(res.status).toBe(200);
    const j = await res.json() as any;
    expect(j.success).toBe(true);
    expect(j.pages.length).toBe(7);
    for (const page of j.pages) {
      expect(page.hasMeta).toBe(true);
      expect(page.hasSchema).toBe(true);
    }
  });
});
