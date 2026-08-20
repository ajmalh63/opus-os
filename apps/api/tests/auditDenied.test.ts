import { describe, it, expect, beforeEach, vi } from 'vitest';
import app from '../src/index.js';
import { MockD1Database } from './mockDb.js';

vi.mock('../src/auth.js', () => ({
  getAuth: () => ({
    api: {
      getSession: async (options: any) => {
        const cookie = options?.headers?.get('cookie') || '';
        const token = (cookie.match(/better-auth\.session_token=([^;]+)/) || [])[1] || null;
        if (token === 'token-admin') {
          return { user: { id: 'admin-1', email: 'a@t.com', role: 'super_admin', userDivisions: '[]' }, session: { id: 's', token, userId: 'admin-1' } };
        }
        if (token === 'token-counselor') {
          return { user: { id: 'counselor-1', email: 'c@t.com', role: 'counselor', userDivisions: '["study-abroad"]' }, session: { id: 's', token, userId: 'counselor-1' } };
        }
        return null;
      },
    },
  }),
}));

describe('Failure & denial audit logging (SOC 2 CC6.1 — docs/audit-logging-gold-standard.md Phase 2)', () => {
  let mockD1: MockD1Database;

  beforeEach(() => {
    mockD1 = new MockD1Database();
  });

  it('RBAC 403 writes ACCESS_DENIED audit with the session actor', async () => {
    const res = await app.request('/api/admin/staff', {
      headers: { Cookie: 'better-auth.session_token=token-counselor' },
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(res.status).toBe(403);
    const row = (mockD1.tables.audit_log as any[]).find((l: any) => l.action === 'ACCESS_DENIED');
    expect(row).toBeTruthy();
    expect(row.actor_id).toBe('counselor-1');
    expect(row.actor_type).toBe('user');
    expect(row.result).toBe('denied');
    expect(row.category).toBe('access');
    expect(JSON.parse(row.after_state).reason).toContain('Insufficient role');
  });

  it('401 (no session) writes ACCESS_DENIED with null actor', async () => {
    const res = await app.request('/api/clients', {}, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(res.status).toBe(401);
    const row = (mockD1.tables.audit_log as any[]).find((l: any) => l.action === 'ACCESS_DENIED');
    expect(row).toBeTruthy();
    expect(row.actor_id).toBeNull();
    expect(row.actor_type).toBe('public');
    expect(row.result).toBe('denied');
  });

  it('denial audits are bounded at 20/hr per actor+route (no scanner flood)', async () => {
    for (let i = 0; i < 25; i++) {
      await app.request('/api/admin/staff', {
        headers: { Cookie: 'better-auth.session_token=token-counselor' },
      }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    }
    const denied = (mockD1.tables.audit_log as any[]).filter((l: any) => l.action === 'ACCESS_DENIED');
    expect(denied.length).toBe(20);
  });

  it('razorpay webhook bad HMAC writes WEBHOOK_REJECTED (result error, service actor)', async () => {
    const res = await app.request('/api/public/payments/razorpay/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': 'deadbeef' },
      body: JSON.stringify({ event: 'payment_link.paid' }),
    }, { DB: mockD1, RAZORPAY_WEBHOOK_SECRET: 'wh-secret' });
    expect(res.status).toBe(403);
    const row = (mockD1.tables.audit_log as any[]).find((l: any) => l.action === 'WEBHOOK_REJECTED');
    expect(row).toBeTruthy();
    expect(row.result).toBe('error');
    expect(row.category).toBe('access');
    expect(row.actor_type).toBe('service');
    expect(JSON.parse(row.after_state).source).toBe('razorpay');
  });

  it('razorpay /verify bad signature writes PAYMENT_VERIFY_FAILED (money)', async () => {
    global.fetch = vi.fn(async () => new Response('{}', { status: 404 })) as any;
    const res = await app.request('/api/payments/razorpay/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': 'better-auth.session_token=token-admin' },
      body: JSON.stringify({
        clientId: 'OP-2026-1001', engagementId: 'eng-1',
        razorpay_order_id: 'order_123', razorpay_payment_id: 'pay_abc', razorpay_signature: 'deadbeef',
      }),
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x', RAZORPAY_KEY_ID: 'rzp_test_key', RAZORPAY_KEY_SECRET: 'sec' });
    expect(res.status).toBe(403);
    const row = (mockD1.tables.audit_log as any[]).find((l: any) => l.action === 'PAYMENT_VERIFY_FAILED');
    expect(row).toBeTruthy();
    expect(row.result).toBe('error');
    expect(row.category).toBe('money');
  });

  it('umrah verify-advance bad signature writes UMRAH_ADVANCE_VERIFY_FAILED (money)', async () => {
    const res = await app.request('/api/public/portal/umrah/bookings/b-1/verify-advance', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId: 'b-1', razorpay_order_id: 'order_1', razorpay_payment_id: 'pay_1', razorpay_signature: 'bad' }),
    }, { DB: mockD1, RAZORPAY_KEY_SECRET: 'sec' });
    expect(res.status).toBe(403);
    const row = (mockD1.tables.audit_log as any[]).find((l: any) => l.action === 'UMRAH_ADVANCE_VERIFY_FAILED');
    expect(row).toBeTruthy();
    expect(row.result).toBe('error');
    expect(row.category).toBe('money');
  });

  it('listmonk webhook bad secret writes WEBHOOK_REJECTED (source listmonk)', async () => {
    const res = await app.request('/api/webhooks/listmonk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-webhook-secret': 'wrong' },
      body: JSON.stringify({ data: { email: 'x@y.z' } }),
    }, { DB: mockD1, LISTMONK_WEBHOOK_SECRET: 'lm-secret' });
    expect(res.status).toBe(401);
    const row = (mockD1.tables.audit_log as any[]).find((l: any) => l.action === 'WEBHOOK_REJECTED' && JSON.parse(l.after_state).source === 'listmonk');
    expect(row).toBeTruthy();
    expect(row.result).toBe('error');
  });

  it('wa webhook bad secret writes WEBHOOK_REJECTED (source wa)', async () => {
    const res = await app.request('/api/webhooks/wa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-webhook-secret': 'wrong' },
      body: JSON.stringify({ message: 'hi' }),
    }, { DB: mockD1, WA_WEBHOOK_SECRET: 'wa-secret' });
    expect(res.status).toBe(403);
    const row = (mockD1.tables.audit_log as any[]).find((l: any) => l.action === 'WEBHOOK_REJECTED' && JSON.parse(l.after_state).source === 'wa');
    expect(row).toBeTruthy();
    expect(row.result).toBe('error');
  });
});