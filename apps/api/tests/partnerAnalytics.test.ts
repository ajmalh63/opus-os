import { describe, it, expect, beforeAll, vi } from 'vitest';

vi.mock('../src/auth.js', () => ({
  getAuth: () => ({
    api: {
      getSession: async () => null,
    },
  }),
}));

import app from '../src/index.js';
import { MockD1Database } from './mockDb.js';

describe('Partner analytics & transparency (Phase A gold standard)', () => {
  let mockD1: MockD1Database;
  const now = Math.floor(Date.now() / 1000);

  beforeAll(() => {
    mockD1 = new MockD1Database();
    (mockD1.tables as any).partner_creatives = [];

    // p-a: full-featured partner (clicks, referral-detail, creatives, onboarding 4/4)
    mockD1.tables.partners.push({ id: 'p-a', name: 'Analytics Agency', email: 'agency@example.com', panNumber: '******1111A', bank_account: '99', ifsc_code: 'SBIN0000001', status: 'active', referral_code: 'OPUS-A', api_token: 'tok-123', created_at: now - 500000 });

    mockD1.tables.partner_links.push(
      { id: 'pl-a1', partner_id: 'p-a', catalog_type: 'university', catalog_item_id: 'uni-1', title: 'Melbourne', price_paise: 0, clicks: 5, created_at: now - 200000, last_clicked_at: now - 1000 },
      { id: 'pl-a2', partner_id: 'p-a', catalog_type: 'visa', catalog_item_id: 'visa-2', title: 'UK Visa', price_paise: 0, clicks: 15, created_at: now - 150000, last_clicked_at: now - 500 },
    );

    // ref-1: FULL timeline (referral → client → engagement → payment → commission)
    mockD1.tables.referrals.push({ id: 'ref-1', partner_id: 'p-a', client_id: 'OP-2026-5001', commission_rate: 5, created_at: now - 300000 });
    mockD1.tables.clients.push({ id: 'OP-2026-5001', portal_token: 'OP-2026-5001', name: 'Ramesh Kumar', phone: '+91 98765 43210', email: 'ramesh@example.com', created_at: now - 290000 });
    mockD1.tables.engagements.push({ id: 'eng-1', client_id: 'OP-2026-5001', division: 'study-abroad', title: 'US Masters Fall 2027', stage_key: 'lead', outstanding_balance: 0, status: 'active', created_at: now - 250000, updated_at: now - 250000 });
    mockD1.tables.payments.push({ id: 'pay-1', client_id: 'OP-2026-5001', engagement_id: 'eng-1', amount: 5000000, type: 'receipt', milestone_name: 'Consultation fee', status: 'confirmed', created_at: now - 200000 });
    mockD1.tables.commission_ledger.push({ id: 'cl-1', referral_id: 'ref-1', amount: 2500000, status: 'matured', created_at: now - 100000 });

    // ref-2: NO payment → payment_confirmed step must be absent
    mockD1.tables.referrals.push({ id: 'ref-2', partner_id: 'p-a', client_id: 'OP-2026-5002', commission_rate: 5, created_at: now - 250000 });
    mockD1.tables.clients.push({ id: 'OP-2026-5002', portal_token: 'OP-2026-5002', name: 'Sita Devi', phone: '+91 98765 43211', email: 'sita@example.com', created_at: now - 240000 });
    mockD1.tables.engagements.push({ id: 'eng-2', client_id: 'OP-2026-5002', division: 'visa', title: 'UK Visit Visa', stage_key: 'lead', outstanding_balance: 0, status: 'active', created_at: now - 220000, updated_at: now - 220000 });
    mockD1.tables.commission_ledger.push({ id: 'cl-2', referral_id: 'ref-2', amount: 100000, status: 'matured', created_at: now - 90000 });

    // creatives: 2 active + 1 inactive (out of order createdAt)
    const creativesTable: any[] = (mockD1.tables as any).partner_creatives;
    creativesTable.push(
      { id: 'cr-2', title: 'Gold Banner', type: 'banner', size: '728x90', url: '/study-abroad', image_key: 'r2/banner-gold', active: true, created_at: now - 100, updated_at: now - 100 },
      { id: 'cr-3', title: 'Retired Creative', type: 'text', size: null, url: '/umrah', image_key: null, active: false, created_at: now - 50, updated_at: now - 50 },
      { id: 'cr-1', title: 'Text Snippet', type: 'text', size: null, url: '/visa', image_key: null, active: true, created_at: now - 200, updated_at: now - 200 },
    );

    // p-new: fresh partner → onboarding 0/4
    mockD1.tables.partners.push({ id: 'p-new', name: 'Fresh Agency', panNumber: '******2222B', bank_account: '11', ifsc_code: 'SBIN0000002', status: 'active', referral_code: 'OPUS-NEW', api_token: 'tok-123', created_at: now - 10 });

    // p-email: partner with email + matured balance for payout email test
    mockD1.tables.partners.push({ id: 'p-email', name: 'Email Agency', email: 'pay@example.com', panNumber: '******3333C', bank_account: '22', ifsc_code: 'SBIN0000003', status: 'active', referral_code: 'OPUS-EM', api_token: 'tok-123', created_at: now - 100000 });
    mockD1.tables.referrals.push({ id: 'ref-3', partner_id: 'p-email', client_id: 'OP-2026-5003', commission_rate: 5, created_at: now - 90000 });
    mockD1.tables.clients.push({ id: 'OP-2026-5003', portal_token: 'OP-2026-5003', name: 'Vikram Singh', phone: '+91 98765 43212', email: 'vikram@example.com', created_at: now - 88000 });
    mockD1.tables.commission_ledger.push({ id: 'cl-3', referral_id: 'ref-3', amount: 1000000, status: 'matured', created_at: now - 50000 });
  });

  it('clicks: rejects with 401 for a wrong token', async () => {
    const res = await app.request('/api/public/partners/p-a/clicks', {
      headers: { Authorization: 'Bearer wrong-token' },
    }, { DB: mockD1, BETTER_AUTH_SECRET: 's' });
    expect(res.status).toBe(401);
  });

  it('clicks: returns links sorted by clicks DESC with totalClicks', async () => {
    const res = await app.request('/api/public/partners/p-a/clicks', {
      headers: { Authorization: 'Bearer tok-123' },
    }, { DB: mockD1, BETTER_AUTH_SECRET: 's' });
    expect(res.status).toBe(200);
    const j = await res.json() as any;
    expect(j.totalClicks).toBe(20);
    expect(j.links).toHaveLength(2);
    expect(j.links[0].id).toBe('pl-a2'); // 15 clicks first
    expect(j.links[0].clicks).toBe(15);
    expect(j.links[1].id).toBe('pl-a1');
    expect(j.links[1].catalogType).toBe('university');
    expect(j.links[0].lastClickedAt).toBe(now - 500);
  });

  it('referral-detail: full timeline with all 5 steps done, amountPaise from ledger', async () => {
    const res = await app.request('/api/public/partners/p-a/referral-detail', {
      headers: { Authorization: 'Bearer tok-123' },
    }, { DB: mockD1, BETTER_AUTH_SECRET: 's' });
    expect(res.status).toBe(200);
    const j = await res.json() as any;
    expect(j.referrals).toHaveLength(2);
    const r1 = j.referrals.find((r: any) => r.referralId === 'ref-1');
    expect(r1.clientId).toBe('OP-2026-5001');
    expect(r1.clientName).toBe('Ramesh Kumar');
    expect(r1.commissionRate).toBe(5);
    expect(r1.amountPaise).toBe(2500000);
    expect(r1.status).toBe('matured');

    const labels = r1.timeline.map((t: any) => t.label);
    expect(labels).toEqual(['Referral logged', 'Client created', 'Engagement active', 'Payment confirmed', 'Commission matured']);
    expect(r1.timeline.every((t: any) => t.state === 'done')).toBe(true);
    expect(r1.timeline[0].at).toBe(now - 300000);
    expect(r1.timeline[3].at).toBe(now - 200000); // first confirmed payment
  });

  it('referral-detail: payment step absent when no confirmed payment exists', async () => {
    const res = await app.request('/api/public/partners/p-a/referral-detail', {
      headers: { Authorization: 'Bearer tok-123' },
    }, { DB: mockD1, BETTER_AUTH_SECRET: 's' });
    expect(res.status).toBe(200);
    const j = await res.json() as any;
    const r2 = j.referrals.find((r: any) => r.referralId === 'ref-2');
    expect(r2.amountPaise).toBe(100000);
    const labels = r2.timeline.map((t: any) => t.label);
    expect(labels).not.toContain('Payment confirmed');
    expect(labels).toContain('Engagement active');
    expect(labels).toContain('Commission matured');
    expect(r2.timeline).toHaveLength(4);
  });

  it('creatives: only active rows returned, ordered by createdAt', async () => {
    const res = await app.request('/api/public/partners/p-a/creatives', {
      headers: { Authorization: 'Bearer tok-123' },
    }, { DB: mockD1, BETTER_AUTH_SECRET: 's' });
    expect(res.status).toBe(200);
    const j = await res.json() as any;
    expect(j.creatives).toHaveLength(2);
    expect(j.creatives[0].id).toBe('cr-1');
    expect(j.creatives[1].id).toBe('cr-2');
    expect(j.creatives.every((c: any) => c.active === true)).toBe(true);
    expect(j.creatives[1].type).toBe('banner');
    expect(j.creatives[1].size).toBe('728x90');
  });

  it('payout-config: updates only provided fields, persists, writes audit row', async () => {
    const res = await app.request('/api/public/partners/p-a/payout-config', {
      method: 'POST',
      headers: { Authorization: 'Bearer tok-123', 'Content-Type': 'application/json' },
      body: JSON.stringify({ payoutMethod: 'upi', payoutDetail: 'agency@upi', payoutThresholdPaise: 250000 }),
    }, { DB: mockD1, BETTER_AUTH_SECRET: 's' });
    expect(res.status).toBe(200);
    const j = await res.json() as any;
    expect(j.payoutMethod).toBe('upi');
    expect(j.payoutDetail).toBe('agency@upi');
    expect(j.payoutThresholdPaise).toBe(250000);

    const partner = mockD1.tables.partners.find((p: any) => p.id === 'p-a');
    expect(partner.payout_method).toBe('upi');
    expect(partner.payout_detail).toBe('agency@upi');
    expect(partner.payout_threshold_paise).toBe(250000);

    const row = (mockD1.tables.audit_log as any[]).find((l: any) => l.action === 'PARTNER_PAYOUT_CONFIG');
    expect(row).toBeTruthy();
    expect(row.entity_name).toBe('partners');
    expect(row.entity_id).toBe('p-a');
    expect(row.category).toBe('config');
    expect(JSON.parse(row.after_state).payoutMethod).toBe('upi');
  });

  it('onboarding: fresh partner is 0/4', async () => {
    const res = await app.request('/api/public/partners/p-new/onboarding', {
      headers: { Authorization: 'Bearer tok-123' },
    }, { DB: mockD1, BETTER_AUTH_SECRET: 's' });
    expect(res.status).toBe(200);
    const j = await res.json() as any;
    expect(j.totalCount).toBe(4);
    expect(j.doneCount).toBe(0);
    expect(j.steps.map((s: any) => s.key)).toEqual(['account', 'link', 'click', 'referral']);
    expect(j.steps.every((s: any) => s.done === false)).toBe(true);
  });

  it('onboarding: partner with email + link + click + referral is 4/4', async () => {
    const res = await app.request('/api/public/partners/p-a/onboarding', {
      headers: { Authorization: 'Bearer tok-123' },
    }, { DB: mockD1, BETTER_AUTH_SECRET: 's' });
    expect(res.status).toBe(200);
    const j = await res.json() as any;
    expect(j.doneCount).toBe(4);
    expect(j.totalCount).toBe(4);
    const done = j.steps.filter((s: any) => s.done).map((s: any) => s.key);
    expect(done).toEqual(['account', 'link', 'click', 'referral']);
  });

  it('payout request sends a notification email row (stub channel) and persists the request', async () => {
    const res = await app.request('/api/public/partners/p-email/payouts', {
      method: 'POST',
      headers: { Authorization: 'Bearer tok-123' },
    }, { DB: mockD1, BETTER_AUTH_SECRET: 's' });
    expect(res.status).toBe(200);
    const j = await res.json() as any;
    expect(j.amountPaise).toBe(1000000);

    expect((mockD1.tables.payout_requests as any[]).some((r: any) => r.partner_id === 'p-email' && r.status === 'requested')).toBe(true);

    const note = (mockD1.tables.notifications as any[]).find((n: any) => n.channel === 'email' && n.to === 'pay@example.com');
    expect(note).toBeTruthy();
    expect(note.subject).toBe('Opus Overseas — payout request received');
    expect(note.body).toContain('owner will approve');
    expect(note.status).toBe('sent'); // stub-ok when LISTMONK unset
  });
});
