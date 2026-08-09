import { describe, it, expect, beforeAll, vi } from 'vitest';

vi.mock('../src/auth.js', () => ({
  getAuth: () => ({
    api: {
      getSession: async ({ headers }: any) => {
        const c = typeof headers?.get === 'function' ? (headers.get('cookie') || '') : '';
        const m = c.match(/better-auth\.session_token=([^;]+)/);
        return m ? { user: { id: 'u-owner', role: 'super_admin', userDivisions: '[]' }, session: {} } : null;
      },
    },
  }),
}));

import app from '../src/index.js';
import { MockD1Database } from './mockDb.js';

describe('Partner Command Center (owner controls)', () => {
  let mockD1: MockD1Database;

  beforeAll(() => {
    const now = Math.floor(Date.now() / 1000);
    mockD1 = new MockD1Database();
    mockD1.tables.partners.push({ id: 'p-cc', name: 'CC Agency', panNumber: '******7777F', bank_account: '1', ifsc_code: 'SBIN0000001', status: 'active', referral_code: 'OPUS-CC', api_token: 't', created_at: now });
    mockD1.tables.partner_tiers.push({ id: 'tier-b', key: 'bronze', name: 'Bronze Partner', min_points: 0, commission_boost_pct: 0, perks_json: '[]', color: '#b87333', order: 1, created_at: now });
    mockD1.tables.partner_tiers.push({ id: 'tier-g', key: 'gold', name: 'Gold Partner', min_points: 500000, commission_boost_pct: 3, perks_json: '[]', color: '#d7a019', order: 3, created_at: now });
    mockD1.tables.partner_points.push({ id: 'pp-1', partner_id: 'p-cc', points: 100000, reason: 'client_signed', reference_key: 'p-cc:client_signed:ag-1', created_at: now });
    mockD1.tables.partner_links.push({ id: 'pl-1', partner_id: 'p-cc', catalog_type: 'university', catalog_item_id: 'uni-1', title: 'Melbourne', price_paise: 0, clicks: 12, created_at: now, last_clicked_at: null });
    mockD1.tables.referrals.push({ id: 'rf-1', partner_id: 'p-cc', client_id: 'OP-1', commission_rate: 5, created_at: now });
    mockD1.tables.commission_ledger.push({ id: 'cl-1', referral_id: 'rf-1', amount: 500000, status: 'matured', created_at: now });
  });

  it('owner creates a commission plan and it persists', async () => {
    const res = await app.request('/api/admin/partners/plans', {
      method: 'POST', headers: { 'Content-Type': 'application/json', cookie: 'better-auth.session_token=token-owner' },
      body: JSON.stringify({ catalogType: 'university', ratePct: 8 }),
    }, { DB: mockD1, BETTER_AUTH_SECRET: 's' });
    expect(res.status).toBe(200);
    const plans = (mockD1.tables.commission_plans || []) as any[];
    expect(plans.some((p) => p.catalog_type === 'university' && p.rate_pct === 8)).toBe(true);
  });

  it('owner saves a tier (creates new)', async () => {
    const res = await app.request('/api/admin/partners/tiers', {
      method: 'POST', headers: { 'Content-Type': 'application/json', cookie: 'better-auth.session_token=token-owner' },
      body: JSON.stringify({ key: 'diamond', name: 'Diamond Partner', minPoints: 3000000, commissionBoostPct: 8, perksJson: '["1:1 manager"]', color: '#4fd2dd', order: 5 }),
    }, { DB: mockD1, BETTER_AUTH_SECRET: 's' });
    expect(res.status).toBe(200);
    expect((mockD1.tables.partner_tiers as any[]).some((t) => t.key === 'diamond')).toBe(true);
  });

  it('owner analytics returns tier, points, clicks, commissions per partner', async () => {
    const res = await app.request('/api/admin/partners/analytics', {
      headers: { cookie: 'better-auth.session_token=token-owner' },
    }, { DB: mockD1, BETTER_AUTH_SECRET: 's' });
    expect(res.status).toBe(200);
    const j = await res.json() as any;
    const row = j.analytics.find((a: any) => a.id === 'p-cc');
    expect(row).toBeTruthy();
    expect(row.points).toBe(100000);
    expect(row.tier).toBe('bronze'); // 100k < 500k gold threshold
    expect(row.nextTier).toBe('gold');
    expect(row.clicks).toBe(12);
    expect(row.referrals).toBe(1);
    expect(row.earnedPaise).toBe(500000);
  });

  it('owner blocks a partner (status audit)', async () => {
    const res = await app.request('/api/admin/partners/p-cc/status', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', cookie: 'better-auth.session_token=token-owner' },
      body: JSON.stringify({ status: 'blocked' }),
    }, { DB: mockD1, BETTER_AUTH_SECRET: 's' });
    expect(res.status).toBe(200);
    expect((mockD1.tables.partners as any[]).find((p) => p.id === 'p-cc').status).toBe('blocked');
  });
});