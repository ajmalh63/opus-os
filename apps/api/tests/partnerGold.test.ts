import { describe, it, expect, beforeAll } from 'vitest';
import app from '../src/index.js';
import { MockD1Database } from './mockDb.js';

describe('Partner Gold Standard Router (/api/partner/*)', () => {
  let mockD1: MockD1Database;
  const partnerId = 'partner_p1_test';
  const partnerToken = 'partner_test_token_xyz';
  const clientId1 = 'client_c1_test';
  const clientId2 = 'client_c2_test';

  beforeAll(() => {
    mockD1 = new MockD1Database();

    // 1. Seed partner
    (mockD1.tables.partners as any[]).push({
      id: partnerId,
      name: 'Alpha Overseas Partners',
      email: 'alpha@partner.com',
      status: 'active',
      referral_code: 'ALPHA99',
      api_token: partnerToken,
      created_at: 1700000000,
    });

    // 2. Seed referrals
    (mockD1.tables.referrals as any[]).push(
      { id: 'ref_1', partner_id: partnerId, client_id: clientId1, commission_rate: 10, created_at: 1700000000 },
      { id: 'ref_2', partner_id: partnerId, client_id: clientId2, commission_rate: 12, created_at: 1700001000 }
    );

    // 3. Seed engagements
    (mockD1.tables.engagements as any[]).push(
      { id: 'eng_1', client_id: clientId1, division: 'study', stage_key: 'complete', created_at: 1700000000 },
      { id: 'eng_2', client_id: clientId2, division: 'visa', stage_key: 'counseling', created_at: 1700001000 }
    );

    // 4. Seed payment schedules (collected by partner)
    (mockD1.tables.payment_schedules as any[]).push(
      { id: 'sched_1', engagement_id: 'eng_1', amount: 500000, status: 'paid', collected_by: partnerId, due_at: 1700005000 },
      { id: 'sched_2', engagement_id: 'eng_2', amount: 300000, status: 'pending', collected_by: partnerId, due_at: 1700010000 },
      { id: 'sched_3', engagement_id: 'eng_2', amount: 200000, status: 'overdue', collected_by: partnerId, due_at: 1700002000 }
    );
  });

  it('rejects unauthenticated requests with 401 Unauthorized', async () => {
    const res = await app.request(`/api/partner/${partnerId}/bookings`, {
      method: 'GET',
    }, { DB: mockD1 });

    expect(res.status).toBe(401);
    const body = await res.json() as any;
    expect(body.error).toContain('Unauthorized');
  });

  it('GET /api/partner/:id/bookings returns bookings for referred clients when authenticated', async () => {
    const res = await app.request(`/api/partner/${partnerId}/bookings`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${partnerToken}` },
    }, { DB: mockD1 });

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.total).toBe(2);
    expect(body.bookings).toHaveLength(2);
  });

  it('GET /api/partner/:id/bookings filters by division parameter', async () => {
    const res = await app.request(`/api/partner/${partnerId}/bookings?division=study`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${partnerToken}` },
    }, { DB: mockD1 });

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.total).toBe(1);
    expect(body.bookings[0].division).toBe('study');
  });

  it('GET /api/partner/:id/ledger returns collected and pending commissions when authenticated', async () => {
    const res = await app.request(`/api/partner/${partnerId}/ledger`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${partnerToken}` },
    }, { DB: mockD1 });

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.totalCollected).toBe(500000);
    expect(body.pending).toBe(300000);
    expect(body.ledger).toHaveLength(3);
  });

  it('GET /api/partner/:id/performance returns conversion rates and overdue count when authenticated', async () => {
    const res = await app.request(`/api/partner/${partnerId}/performance`, {
      method: 'GET',
      headers: { Authorization: `Bearer ${partnerToken}` },
    }, { DB: mockD1 });

    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    expect(body.performance.bookings).toBe(2);
    expect(body.performance.converted).toBe(1);
    expect(body.performance.conversion).toBe(50);
    expect(body.performance.overdue).toBe(1);
    expect(body.performance.referrals).toBe(2);
  });

  it('returns 401 when token does not match partner', async () => {
    const res = await app.request(`/api/partner/${partnerId}/bookings`, {
      method: 'GET',
      headers: { Authorization: 'Bearer wrong_token' },
    }, { DB: mockD1 });

    expect(res.status).toBe(401);
  });
});
