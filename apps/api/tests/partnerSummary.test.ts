import { describe, it, expect, beforeAll } from 'vitest';
import app from '../src/index.js';
import { MockD1Database } from './mockDb.js';

describe('Partner portal summary (§39 gold-standard dashboard payload)', () => {
  let mockD1: MockD1Database;

  beforeAll(() => {
    mockD1 = new MockD1Database();
    const now = Math.floor(Date.now() / 1000);
    mockD1.tables.partners.push({ id: 'p-sum', name: 'Hyderabad Agency', panNumber: '******1234F', bank_account: '999', ifsc_code: 'SBIN0000001', status: 'active', referral_code: 'OPUS-HYD', api_token: 'tok-123', created_at: now - 400000 });
    mockD1.tables.referrals.push(
      { id: 'ref-1', partner_id: 'p-sum', client_id: 'OP-2026-1001', commission_rate: 5, created_at: now - 300000 },
      { id: 'ref-2', partner_id: 'p-sum', client_id: 'OP-2026-1002', commission_rate: 5, created_at: now - 200000 },
    );
    mockD1.tables.commission_ledger.push(
      { id: 'cl-1', referral_id: 'ref-1', amount: 2500000, status: 'matured', created_at: now - 100000 },
      { id: 'cl-2', referral_id: 'ref-2', amount: 500000, status: 'paid', created_at: now - 50000 },
    );
  });

  it('returns profile + rupee rollups + per-referral breakdown for the authed partner', async () => {
    const res = await app.request('/api/public/partners/p-sum/summary', {
      headers: { Authorization: 'Bearer tok-123' },
    }, { DB: mockD1, BETTER_AUTH_SECRET: 's' });
    expect(res.status).toBe(200);
    const j = await res.json() as any;

    expect(j.partner.name).toBe('Hyderabad Agency');
    expect(j.partner.referralCode).toBe('?ref=OPUS-HYD');

    // rollups: matured 2500000 (₹25,000) + paid 500000 (₹5,000)
    expect(j.totals.matured).toBe(2500000);
    expect(j.totals.paid).toBe(500000);
    expect(j.totals.total).toBe(3000000);

    expect(j.referrals).toHaveLength(2);
    const r1 = j.referrals.find((r: any) => r.referredClientId === 'OP-2026-1001');
    expect(r1.amountPaise).toBe(2500000);
    expect(r1.status).toBe('matured');
    expect(r1.ratePct).toBe(5);
  });

  it('rejects with 401 for a wrong token', async () => {
    const res = await app.request('/api/public/partners/p-sum/summary', {
      headers: { Authorization: 'Bearer wrong-token' },
    }, { DB: mockD1, BETTER_AUTH_SECRET: 's' });
    expect(res.status).toBe(401);
  });
});