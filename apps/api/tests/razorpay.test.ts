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
          return { user: { id: "admin-1", email: "admin@test.com", role: "super_admin", userDivisions: '[]' }, session: { id: "s", token, userId: "admin-1" } };
        }
        return null;
      }
    }
  })
}));

// Compute HMAC-SHA256 hex the same way the route does (for valid signature fixtures)
async function hmacHex(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

describe('Razorpay Integration (Section 44)', () => {
  let mockD1: MockD1Database;

  beforeEach(() => {
    mockD1 = new MockD1Database();
    mockD1.tables.engagements.push({
      id: 'eng-rzp-1', client_id: 'OP-2026-1001', division: 'study-abroad', title: 'Consulting',
      stage_key: 'documents', outstanding_balance: 5900000, status: 'active', created_at: 0, updated_at: 0
    });
  });

  it('POST /api/payments/razorpay/order creates a gateway order', async () => {
    // Mock Razorpay /orders
    global.fetch = vi.fn(async (url: any, opts: any) => {
      if (String(url).includes('/orders')) {
        return new Response(JSON.stringify({ id: 'order_123', amount: 5900000, currency: 'INR' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('{}', { status: 404 });
    }) as any;

    const res = await app.request('/api/payments/razorpay/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': 'better-auth.session_token=token-admin' },
      body: JSON.stringify({ clientId: 'OP-2026-1001', engagementId: 'eng-rzp-1', amount: 5900000 })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x', RAZORPAY_KEY_ID: 'rzp_test_key', RAZORPAY_KEY_SECRET: 'sec' });

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);
    expect(data.order_id).toBe('order_123');
    expect(data.amount_paise).toBe(5900000);
  });

  it('POST /api/payments/razorpay/order rejects unauthenticated', async () => {
    const res = await app.request('/api/payments/razorpay/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId: 'OP-2026-1001', engagementId: 'eng-rzp-1', amount: 5900000 })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(res.status).toBe(401);
  });

  it('POST /api/payments/razorpay/verify accepts valid signature and records receipt', async () => {
    const signature = await hmacHex('sec', 'order_123|pay_abc');
    global.fetch = vi.fn(async (url: any) => {
      if (String(url).includes('/payments/pay_abc')) {
        return new Response(JSON.stringify({ id: 'pay_abc', status: 'captured', amount: 5900000 }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('{}', { status: 404 });
    }) as any;

    const res = await app.request('/api/payments/razorpay/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': 'better-auth.session_token=token-admin' },
      body: JSON.stringify({
        clientId: 'OP-2026-1001', engagementId: 'eng-rzp-1',
        razorpay_order_id: 'order_123', razorpay_payment_id: 'pay_abc', razorpay_signature: signature
      })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x', RAZORPAY_KEY_ID: 'rzp_test_key', RAZORPAY_KEY_SECRET: 'sec' });

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.verified).toBe(true);
    // balance reduced by 5900000
    expect(mockD1.tables.engagements[0].outstanding_balance).toBe(0);
    expect(mockD1.tables.payments.length).toBe(1);
  });

  it('POST /api/payments/razorpay/verify rejects bad signature with 403', async () => {
    global.fetch = vi.fn(async () => new Response('{}', { status: 404 })) as any;
    const res = await app.request('/api/payments/razorpay/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': 'better-auth.session_token=token-admin' },
      body: JSON.stringify({
        clientId: 'OP-2026-1001', engagementId: 'eng-rzp-1',
        razorpay_order_id: 'order_123', razorpay_payment_id: 'pay_abc', razorpay_signature: 'deadbeef'
      })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x', RAZORPAY_KEY_ID: 'rzp_test_key', RAZORPAY_KEY_SECRET: 'sec' });
    expect(res.status).toBe(403);
  });

  it('POST /api/public/payments/razorpay/webhook rejects bad HMAC', async () => {
    const body = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_1', amount: 1000 } } } });
    const res = await app.request('/api/public/payments/razorpay/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': 'wrongsig' },
      body
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x', RAZORPAY_WEBHOOK_SECRET: 'whsec' });
    expect(res.status).toBe(403);
  });

  it('POST /api/public/payments/razorpay/webhook accepts valid HMAC and records capture', async () => {
    const body = JSON.stringify({
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_wh_1', amount: 2500000, notes: { engagementId: 'eng-rzp-1', clientId: 'OP-2026-1001' } } } }
    });
    const signature = await hmacHex('whsec', body);
    const res = await app.request('/api/public/payments/razorpay/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': signature },
      body
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x', RAZORPAY_WEBHOOK_SECRET: 'whsec' });

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.ok).toBe(true);
    expect(mockD1.tables.payments.some(p => p.reference_number === 'pay_wh_1')).toBe(true);
    expect(mockD1.tables.engagements[0].outstanding_balance).toBe(5900000 - 2500000);
  });

  it('webhook is idempotent â€” replaying the same payment does not double-credit', async () => {
    const body = JSON.stringify({
      event: 'payment.captured',
      payload: { payment: { entity: { id: 'pay_dup_1', amount: 1000000, notes: { engagementId: 'eng-rzp-1', clientId: 'OP-2026-1001' } } } }
    });
    const signature = await hmacHex('whsec', body);
    const env = { DB: mockD1, BETTER_AUTH_SECRET: 'x', RAZORPAY_WEBHOOK_SECRET: 'whsec' };

    await app.request('/api/public/payments/razorpay/webhook', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': signature }, body
    }, env);
    const second = await app.request('/api/public/payments/razorpay/webhook', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': signature }, body
    }, env);
    expect(second.status).toBe(200);
    const onlyOne = mockD1.tables.payments.filter((p: any) => p.reference_number === 'pay_dup_1');
    expect(onlyOne.length).toBe(1);
  });

  it('webhook fails closed (503) when RAZORPAY_WEBHOOK_SECRET is unset', async () => {
    const body = JSON.stringify({ event: 'payment.captured', payload: { payment: { entity: { id: 'pay_1', amount: 1000 } } } });
    const res = await app.request('/api/public/payments/razorpay/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-razorpay-signature': 'anything' },
      body
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(res.status).toBe(503);
  });

  it('order fails closed (503) when Razorpay creds are unset', async () => {
    const res = await app.request('/api/payments/razorpay/order', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': 'better-auth.session_token=token-admin' },
      body: JSON.stringify({ clientId: 'OP-2026-1001', engagementId: 'eng-rzp-1', amount: 5900000 })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(res.status).toBe(503);
  });
});
