import { describe, it, expect, beforeAll } from 'vitest';
import app from '../src/index.js';
import { MockD1Database } from './mockDb.js';
import { seedPartnerTiers, accruePartnerPoints, resolveTier } from '../src/services/partnerLoyalty.js';

describe('Partner Thrive workspace (§39 / Zoho Thrive-style)', () => {
  let mockD1: MockD1Database;

  beforeAll(() => {
    mockD1 = new MockD1Database();
    const now = Math.floor(Date.now() / 1000);
    mockD1.tables.partners.push({ id: 'p-thrive', name: 'Thrive Agency', panNumber: '******9999F', bank_account: '1', ifsc_code: 'SBIN0000001', status: 'active', referral_code: 'OPUS-THRIVE', api_token: 'tok-thrive', created_at: now });
    mockD1.tables.universities.push({ id: 'uni-1', name: 'Melbourne Uni', country: 'Australia', min_gpa: 6.5, min_ielts: 6.5, budget_lpa: 20, created_at: now });
    mockD1.tables.job_postings.push({ id: 'job-1', title: 'Software Engineer — UAE', country: 'UAE', sector: 'IT', salary_text: 'AED 15k', status: 'open', created_at: now });
    mockD1.tables.partner_tiers.push({ id: 'tier-bronze', key: 'bronze', name: 'Bronze Partner', min_points: 0, commission_boost_pct: 0, perks_json: '[]', color: '#b87333', order: 1, created_at: now });
    mockD1.tables.partner_tiers.push({ id: 'tier-gold', key: 'gold', name: 'Gold Partner', min_points: 500000, commission_boost_pct: 3, perks_json: '["+3% boost"]', color: '#d7a019', order: 3, created_at: now });
  });

  it('public catalog returns unified inventory across divisions', async () => {
    const res = await app.request('/api/public/catalog', {}, { DB: mockD1, BETTER_AUTH_SECRET: 's' });
    expect(res.status).toBe(200);
    const j = await res.json() as any;
    const types = j.items.map((i: any) => i.type);
    expect(types).toContain('university');
    expect(types).toContain('job');
  });

  it('partner creates a share link for an inventory item (token-bound)', async () => {
    const res = await app.request('/api/public/partners/p-thrive/links', {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer tok-thrive' },
      body: JSON.stringify({ catalogType: 'university', catalogItemId: 'uni-1', title: 'Melbourne Uni', pricePaise: 0 }),
    }, { DB: mockD1, BETTER_AUTH_SECRET: 's' });
    expect(res.status).toBe(200);
    const j = await res.json() as any;
    expect(j.link).toContain('/go/OPUS-THRIVE/university/uni-1');
  });

  it('public /go/:ref/:type/:id redirects and counts a click', async () => {
    const res = await app.request('/go/OPUS-THRIVE/university/uni-1', {}, { DB: mockD1, BETTER_AUTH_SECRET: 's' });
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('/study-abroad?ref=OPUS-THRIVE');
    const link = (mockD1.tables.partner_links as any[]).find((l) => l.catalog_item_id === 'uni-1');
    expect(link.clicks).toBe(1);
  });

  it('loyalty points accrue idempotently and tiers resolve on points', async () => {
    const r1 = await accruePartnerPoints({ env: { DB: mockD1 } as any, partnerId: 'p-thrive', reason: 'client_signed', referenceKey: 'ag-1' });
    expect(r1.accrued).toBe(true);
    expect(r1.points).toBe(2500);
    const r2 = await accruePartnerPoints({ env: { DB: mockD1 } as any, partnerId: 'p-thrive', reason: 'client_signed', referenceKey: 'ag-1' });
    expect(r2.accrued).toBe(false); // idempotent

    const tier = await resolveTier({ DB: mockD1 } as any, 'p-thrive');
    expect(tier.tier.key).toBe('bronze'); // 2500 < 500000
    expect(tier.next?.key).toBe('gold');
  });
});