import { describe, it, expect, beforeAll, vi } from 'vitest';

vi.mock('../src/auth.js', () => ({
  getAuth: () => ({
    api: {
      getSession: async ({ headers }: any) => {
        const c = typeof headers?.get === 'function' ? (headers.get('cookie') || '') : '';
        const m = c.match(/better-auth\.session_token=([^;]+)/);
        if (!m) return null;
        return m[1] === 'token-counselor'
          ? { user: { id: 'u-counselor', role: 'counselor', userDivisions: '[]' }, session: {} }
          : { user: { id: 'u-owner', role: 'super_admin', userDivisions: '[]' }, session: {} };
      },
    },
  }),
}));

import app from '../src/index.js';
import { getDb } from '../src/db/client.js';
import { seedPartnerCreatives } from '../src/db/seed.js';
import { MockD1Database } from './mockDb.js';

describe('Partner creative library (owner admin, Phase B)', () => {
  let mockD1: MockD1Database;
  const OWNER = { headers: { cookie: 'better-auth.session_token=token-admin' } };
  const COUNSELOR = { headers: { cookie: 'better-auth.session_token=token-counselor' } };

  beforeAll(() => {
    const now = Math.floor(Date.now() / 1000);
    mockD1 = new MockD1Database();
    // mockDb.ts predates partner_creatives — register locally (do not touch mockDb.ts)
    (mockD1.tables as any).partner_creatives = [];
  });

  it('401 without a session on GET /creatives', async () => {
    const res = await app.request('/api/admin/partners/creatives', {}, { DB: mockD1, BETTER_AUTH_SECRET: 's' });
    expect(res.status).toBe(401);
  });

  it('403 for counselor on GET /creatives', async () => {
    const res = await app.request('/api/admin/partners/creatives', COUNSELOR, { DB: mockD1, BETTER_AUTH_SECRET: 's' });
    expect(res.status).toBe(403);
  });

  it('200 for owner on GET /creatives — all rows incl. inactive, newest first', async () => {
    const now = Math.floor(Date.now() / 1000);
    (mockD1.tables as any).partner_creatives.push(
      { id: 'c-1', title: 'Older Text', type: 'text', size: null, url: '/study-abroad', image_key: null, active: 1, created_at: now - 100, updated_at: now - 100 },
      { id: 'c-2', title: 'Newer Banner', type: 'banner', size: '728x90', url: '/umrah-travel', image_key: 'r2/banner.png', active: 0, created_at: now, updated_at: now },
    );
    const res = await app.request('/api/admin/partners/creatives', OWNER, { DB: mockD1, BETTER_AUTH_SECRET: 's' });
    expect(res.status).toBe(200);
    const j = await res.json() as any;
    expect(j.creatives).toHaveLength(2);
    expect(j.creatives[0].title).toBe('Newer Banner'); // newest first
    expect(j.creatives[0].active).toBe(false); // inactive rows ARE included
    expect(j.creatives[1].title).toBe('Older Text');
    expect(j.creatives[1].active).toBe(true);
  });

  it('owner POST /creatives inserts + audits CREATIVE_CREATED', async () => {
    const res = await app.request('/api/admin/partners/creatives', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', cookie: 'better-auth.session_token=token-admin' },
      body: JSON.stringify({ title: 'Winter Sale Banner', type: 'banner', size: '728x90', url: '/umrah-travel', imageKey: 'r2/winter.png', active: true }),
    }, { DB: mockD1, BETTER_AUTH_SECRET: 's' });
    expect(res.status).toBe(200);
    const rows = (mockD1.tables as any).partner_creatives as any[];
    const created = rows.find((r: any) => r.title === 'Winter Sale Banner');
    expect(created).toBeTruthy();
    expect(created.type).toBe('banner');
    expect(created.url).toBe('/umrah-travel');
    expect(created.active).toBe(1); // drizzle binds booleans as 1/0
    expect((mockD1.tables as any).audit_log.some((a: any) => a.action === 'CREATIVE_CREATED')).toBe(true);
  });

  it('owner PATCH /creatives/:id updates + audits CREATIVE_UPDATED', async () => {
    const res = await app.request('/api/admin/partners/creatives/c-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', cookie: 'better-auth.session_token=token-admin' },
      body: JSON.stringify({ title: 'Renamed Text', active: false }),
    }, { DB: mockD1, BETTER_AUTH_SECRET: 's' });
    expect(res.status).toBe(200);
    const row = (mockD1.tables as any).partner_creatives.find((r: any) => r.id === 'c-1');
    expect(row.title).toBe('Renamed Text');
    expect(row.active).toBe(0); // drizzle binds booleans as 1/0
    expect((mockD1.tables as any).audit_log.some((a: any) => a.action === 'CREATIVE_UPDATED')).toBe(true);
  });

  it('owner DELETE /creatives/:id removes + audits CREATIVE_DELETED', async () => {
    const res = await app.request('/api/admin/partners/creatives/c-2', {
      method: 'DELETE',
      headers: { cookie: 'better-auth.session_token=token-admin' },
    }, { DB: mockD1, BETTER_AUTH_SECRET: 's' });
    expect(res.status).toBe(200);
    expect((mockD1.tables as any).partner_creatives.some((r: any) => r.id === 'c-2')).toBe(false);
    expect((mockD1.tables as any).audit_log.some((a: any) => a.action === 'CREATIVE_DELETED')).toBe(true);
  });
});

describe('seedPartnerCreatives (Phase B)', () => {
  let mockD1: MockD1Database;

  beforeAll(() => {
    mockD1 = new MockD1Database();
    (mockD1.tables as any).partner_creatives = [];
  });

  it('seeds 4 text creatives on an empty table; idempotent on second call', async () => {
    const db = getDb(mockD1 as any);
    await seedPartnerCreatives(db as any);
    const rows = (mockD1.tables as any).partner_creatives as any[];
    expect(rows).toHaveLength(4);
    expect(rows.every((r: any) => r.type === 'text')).toBe(true);
    const titles = rows.map((r: any) => r.title);
    expect(titles).toContain('Study Abroad — Free Counselling');
    expect(rows.find((r: any) => r.title === 'Study Abroad — Free Counselling').url).toBe('/study-abroad');
    expect(titles).toContain('Visa Services — Expert Guidance');
    expect(rows.find((r: any) => r.title === 'Visa Services — Expert Guidance').url).toBe('/visa-services');
    expect(titles).toContain('Umrah Packages — Group Departures');
    expect(rows.find((r: any) => r.title === 'Umrah Packages — Group Departures').url).toBe('/umrah-travel');
    expect(titles).toContain('Manpower Recruitment — Global Jobs');
    expect(rows.find((r: any) => r.title === 'Manpower Recruitment — Global Jobs').url).toBe('/recruitment');

    await seedPartnerCreatives(db as any);
    expect((mockD1.tables as any).partner_creatives).toHaveLength(4); // still 4
  });
});

describe('Payout lifecycle emails (Phase B)', () => {
  let mockD1: MockD1Database;

  beforeAll(() => {
    const now = Math.floor(Date.now() / 1000);
    mockD1 = new MockD1Database();
    (mockD1.tables as any).partner_creatives = [];
    (mockD1.tables as any).partners.push({
      id: 'p-mail', name: 'Mail Agency', email: 'partner@example.com', pan_number: 'P', bank_account: '1', ifsc_code: 'S',
      status: 'active', referral_code: 'OPUS-MAIL', api_token: null, created_at: now,
    });
    (mockD1.tables as any).payout_requests.push({
      id: 'po-1', partner_id: 'p-mail', amount_paise: 500000, status: 'requested', note: null,
      requested_at: now, resolved_at: null, updated_by: null,
    });
  });

  it('approving a payout emails the partner (notifications row, channel email)', async () => {
    const res = await app.request('/api/admin/partners/payouts/po-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', cookie: 'better-auth.session_token=token-admin' },
      body: JSON.stringify({ status: 'approved' }),
    }, { DB: mockD1, BETTER_AUTH_SECRET: 's' });
    expect(res.status).toBe(200);
    const email = (mockD1.tables as any).notifications.find((n: any) => n.channel === 'email' && n.to === 'partner@example.com');
    expect(email).toBeTruthy();
    expect(email.subject).toContain('approved');
  });

  it('marking paid emails the partner (notifications row, channel email)', async () => {
    const res = await app.request('/api/admin/partners/payouts/po-1', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', cookie: 'better-auth.session_token=token-admin' },
      body: JSON.stringify({ status: 'paid' }),
    }, { DB: mockD1, BETTER_AUTH_SECRET: 's' });
    expect(res.status).toBe(200);
    const email = (mockD1.tables as any).notifications.filter((n: any) => n.channel === 'email' && n.to === 'partner@example.com').at(-1);
    expect(email).toBeTruthy();
    expect(email.subject).toMatch(/settled|paid/i);
  });
});
