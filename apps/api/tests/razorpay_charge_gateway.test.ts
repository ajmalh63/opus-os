import { describe, it, expect, beforeEach, vi } from 'vitest';
import app from '../src/index.js';
import { MockD1Database } from './mockDb.js';

vi.mock('../src/auth.js', () => ({
  getAuth: () => ({
    api: {
      getSession: async (options: any) => {
        const cookie = options?.headers?.get('cookie') || '';
        const token = (cookie.match(/better-auth\.session_token=([^;]+)/) || [])[1] || null;
        if (token === 'token-counselor') {
          return { user: { id: "counselor-1", name: "Counselor One", email: "counselor@test.com", role: "counselor", userDivisions: JSON.stringify(["study-abroad"]) }, session: { id: "s", token, userId: "counselor-1" } };
        }
        return null;
      }
    }
  })
}));

async function hmacHex(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  return Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// Free-form Razorpay gateway: POST /api/transactions/charge (any staff, any
// amount) + payment_link.paid webhook finalize on /api/public/payments/razorpay/webhook.
describe('Free-form Razorpay charge gateway', () => {
  let mockD1: MockD1Database;

  beforeEach(() => {
    mockD1 = new MockD1Database();
    mockD1.tables.clients.push({ id: 'OP-2026-1001', portal_token: 'OP-2026-1001', name: 'Client One', phone: '+91 98765 12345', email: 'client1@example.com', highest_qualification: 'undergrad', lead_source: 'website', intake_context: null, created_at: 0, updated_at: 0 });
    mockD1.tables.engagements.push({
      id: 'eng-rzp-1', client_id: 'OP-2026-1001', division: 'study-abroad', title: 'Consulting',
      stage_key: 'documents', outstanding_balance: 5900000, status: 'active', created_at: 0, updated_at: 0
    });
  });

  it('POST /api/transactions/charge creates the entry + payment link for ANY amount (counselor)', async () => {
    global.fetch = vi.fn(async (url: any, opts: any) => {
      if (String(url).includes('/payment_links')) {
        const body = JSON.parse(opts?.body || '{}');
        return new Response(JSON.stringify({ id: 'plink_test_1', status: 'created', amount: body.amount, short_url: 'https://rzp.io/rzp/abc' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('{}', { status: 404 });
    }) as any;

    const res = await app.request('/api/transactions/charge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': 'better-auth.session_token=token-counselor' },
      body: JSON.stringify({ clientId: 'OP-2026-1001', amount: 25000, description: 'Visa application fee' })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x', RAZORPAY_KEY_ID: 'rzp_test_key', RAZORPAY_KEY_SECRET: 'sec' });

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);
    expect(data.linkId).toBe('plink_test_1');
    expect(data.shortUrl).toBe('https://rzp.io/rzp/abc');
    expect(data.entryId).toBeTruthy();

    const entry = mockD1.tables.payments.find((p) => p.id === data.entryId);
    expect(entry).toBeTruthy();
    expect(entry.type).toBe('charge');
    expect(entry.amount).toBe(2500000);          // ₹25,000 → paise
    expect(entry.status).toBe('draft');          // balance moves only when paid
    expect(entry.link_status).toBe('created');
    expect(entry.razorpay_link_id).toBe('plink_test_1');
    expect(entry.engagement_id).toBe('eng-rzp-1'); // auto-picked active engagement
    expect(entry.entered_by).toBe('counselor-1');
  });

  it('validates amount bounds and client', async () => {
    global.fetch = vi.fn(async () => new Response('{}', { status: 404 })) as any;
    const env = { DB: mockD1, BETTER_AUTH_SECRET: 'x', RAZORPAY_KEY_ID: 'k', RAZORPAY_KEY_SECRET: 's' };

    let res = await app.request('/api/transactions/charge', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': 'better-auth.session_token=token-counselor' }, body: JSON.stringify({ clientId: 'OP-2026-1001', amount: 0.5 }) }, env);
    expect(res.status).toBe(400);

    res = await app.request('/api/transactions/charge', { method: 'POST', headers: { 'Content-Type': 'application/json', 'Cookie': 'better-auth.session_token=token-counselor' }, body: JSON.stringify({ clientId: 'OP-9999', amount: 1000 }) }, env);
    expect(res.status).toBe(400);
  });

  it('rejects a client with no engagement (409)', async () => {
    mockD1.tables.clients.push({ id: 'OP-2026-2002', portal_token: 'OP-2026-2002', name: 'No Eng Client', phone: '+91 90000 00000', email: 'x@x.com', highest_qualification: null, lead_source: null, intake_context: null, created_at: 0, updated_at: 0 });
    global.fetch = vi.fn(async () => new Response('{}', { status: 404 })) as any;
    const res = await app.request('/api/transactions/charge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': 'better-auth.session_token=token-counselor' },
      body: JSON.stringify({ clientId: 'OP-2026-2002', amount: 1000 })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x', RAZORPAY_KEY_ID: 'k', RAZORPAY_KEY_SECRET: 's' });
    expect(res.status).toBe(409);
  });

  it('webhook payment_link.paid finalizes: paid + receipt + balance (replay-safe)', async () => {
    mockD1.tables.payments.push({
      id: 'entry-1', client_id: 'OP-2026-1001', engagement_id: 'eng-rzp-1', amount: 2500000, type: 'charge',
      milestone_name: 'Visa application fee', method: null, reference_number: null,
      taxable_amount: null, cgst: null, sgst: null, igst: null, is_interstate: 0,
      invoice_date: null, due_date: null, gst_rate: 0, customer_gstin: null,
      razorpay_link_id: 'plink_1', razorpay_short_url: 'https://rzp.io/rzp/abc', link_status: 'created',
      razorpay_payment_id: null, status: 'draft', entered_by: 'counselor-1', confirmed_by: null, confirmed_at: null, erp_doc_name: null, created_at: 0
    });

    const payload = {
      event: 'payment_link.paid',
      contains: ['payment_link', 'order', 'payment'],
      payload: {
        order: { entity: { id: 'order_plink', amount: 2500000 } },
        payment: { entity: { id: 'pay_plink_1', amount: 2500000, method: 'upi', status: 'captured' } },
        payment_link: { entity: { id: 'plink_1', amount: 2500000, status: 'paid', notes: { entryId: 'entry-1', clientId: 'OP-2026-1001', engagementId: 'eng-rzp-1', milestone: 'Visa application fee' } } }
      }
    };
    const rawBody = JSON.stringify(payload);
    const signature = await hmacHex('whsec', rawBody);
    const env = { DB: mockD1, RAZORPAY_WEBHOOK_SECRET: 'whsec' };

    const res = await app.request('/api/public/payments/razorpay/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Razorpay-Signature': signature },
      body: rawBody
    }, env);
    expect(res.status).toBe(200);

    const entry = mockD1.tables.payments.find((p) => p.id === 'entry-1');
    expect(entry.status).toBe('paid');
    expect(entry.link_status).toBe('paid');
    expect(entry.razorpay_payment_id).toBe('pay_plink_1');
    expect(entry.method).toBe('upi');

    const receipts = mockD1.tables.payments.filter((p) => p.type === 'receipt');
    expect(receipts).toHaveLength(1);
    expect(receipts[0].reference_number).toBe('pay_plink_1');
    expect(receipts[0].amount).toBe(2500000);
    // balance: charge(+25k) − receipt(−25k) against fresh engagement = 0
    const eng = mockD1.tables.engagements.find((e) => e.id === 'eng-rzp-1');
    expect(eng.outstanding_balance).toBe(0);

    // replay the SAME delivery → no double receipt
    const res2 = await app.request('/api/public/payments/razorpay/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Razorpay-Signature': signature },
      body: rawBody
    }, env);
    expect(res2.status).toBe(200);
    expect(mockD1.tables.payments.filter((p) => p.type === 'receipt')).toHaveLength(1);
  });

  it('webhook rejects invalid signature (403)', async () => {
    const res = await app.request('/api/public/payments/razorpay/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Razorpay-Signature': 'deadbeef' },
      body: JSON.stringify({ event: 'payment_link.paid', payload: {} })
    }, { DB: mockD1, RAZORPAY_WEBHOOK_SECRET: 'whsec' });
    expect(res.status).toBe(403);
  });

  it('webhook payment_link.cancelled/expired flips link status', async () => {
    mockD1.tables.payments.push({
      id: 'entry-2', client_id: 'OP-2026-1001', engagement_id: 'eng-rzp-1', amount: 500000, type: 'charge',
      milestone_name: 'Test', method: null, reference_number: null,
      taxable_amount: null, cgst: null, sgst: null, igst: null, is_interstate: 0,
      invoice_date: null, due_date: null, gst_rate: 0, customer_gstin: null,
      razorpay_link_id: 'plink_2', razorpay_short_url: 'https://rzp.io/rzp/xyz', link_status: 'created',
      razorpay_payment_id: null, status: 'draft', entered_by: 'counselor-1', confirmed_by: null, confirmed_at: null, erp_doc_name: null, created_at: 0
    });
    const rawBody = JSON.stringify({ event: 'payment_link.cancelled', payload: { payment_link: { entity: { id: 'plink_2' } } } });
    const signature = await hmacHex('whsec', rawBody);
    const res = await app.request('/api/public/payments/razorpay/webhook', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Razorpay-Signature': signature },
      body: rawBody
    }, { DB: mockD1, RAZORPAY_WEBHOOK_SECRET: 'whsec' });
    expect(res.status).toBe(200);
    expect(mockD1.tables.payments.find((p) => p.id === 'entry-2').link_status).toBe('cancelled');
  });

  // ── Dunning: cancel / renew (server-authoritative via Razorpay API) ──
  function seedLinkEntry(id: string, linkId: string, linkStatus: string, createdAt = 0) {
    mockD1.tables.payments.push({
      id, client_id: 'OP-2026-1001', engagement_id: 'eng-rzp-1', amount: 500000, type: 'charge',
      milestone_name: 'Test', method: null, reference_number: null,
      taxable_amount: null, cgst: null, sgst: null, igst: null, is_interstate: 0,
      invoice_date: null, due_date: null, gst_rate: 0, customer_gstin: null,
      razorpay_link_id: linkId, razorpay_short_url: `https://rzp.io/rzp/${linkId}`, link_status: linkStatus,
      razorpay_payment_id: null, status: 'draft', entered_by: 'counselor-1', confirmed_by: null, confirmed_at: null, erp_doc_name: null, created_at: createdAt
    });
  }

  it('POST /:id/payment-link/cancel cancels at Razorpay and marks locally', async () => {
    seedLinkEntry('entry-c1', 'plink_c1', 'created');
    global.fetch = vi.fn(async (url: any) => {
      if (String(url).includes('/payment_links/plink_c1/cancel')) {
        return new Response(JSON.stringify({ id: 'plink_c1', status: 'cancelled' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('{}', { status: 404 });
    }) as any;

    const res = await app.request('/api/transactions/entry-c1/payment-link/cancel', {
      method: 'POST',
      headers: { 'Cookie': 'better-auth.session_token=token-counselor' }
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x', RAZORPAY_KEY_ID: 'k', RAZORPAY_KEY_SECRET: 's' });
    expect(res.status).toBe(200);
    expect(mockD1.tables.payments.find((p) => p.id === 'entry-c1').link_status).toBe('cancelled');
    // entry itself untouched (money state)
    expect(mockD1.tables.payments.find((p) => p.id === 'entry-c1').status).toBe('draft');
  });

  it('cancel is idempotent: already-cancelled → no-op, no API call', async () => {
    seedLinkEntry('entry-c2', 'plink_c2', 'cancelled');
    global.fetch = vi.fn(async () => new Response('{}', { status: 404 })) as any;
    const res = await app.request('/api/transactions/entry-c2/payment-link/cancel', {
      method: 'POST',
      headers: { 'Cookie': 'better-auth.session_token=token-counselor' }
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x', RAZORPAY_KEY_ID: 'k', RAZORPAY_KEY_SECRET: 's' });
    expect(res.status).toBe(200);
    expect((await res.json() as any).already).toBe(true);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('cancel refuses a paid link (409, no API call)', async () => {
    mockD1.tables.payments.push({
      id: 'entry-c3', client_id: 'OP-2026-1001', engagement_id: 'eng-rzp-1', amount: 500000, type: 'charge',
      milestone_name: 'Test', method: 'upi', reference_number: 'pay_c3',
      taxable_amount: null, cgst: null, sgst: null, igst: null, is_interstate: 0,
      invoice_date: null, due_date: null, gst_rate: 0, customer_gstin: null,
      razorpay_link_id: 'plink_c3', razorpay_short_url: 'https://rzp.io/rzp/plink_c3', link_status: 'paid',
      razorpay_payment_id: 'pay_c3', status: 'paid', entered_by: 'counselor-1', confirmed_by: null, confirmed_at: null, erp_doc_name: null, created_at: 0
    });
    global.fetch = vi.fn(async () => new Response('{}', { status: 404 })) as any;
    const res = await app.request('/api/transactions/entry-c3/payment-link/cancel', {
      method: 'POST',
      headers: { 'Cookie': 'better-auth.session_token=token-counselor' }
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x', RAZORPAY_KEY_ID: 'k', RAZORPAY_KEY_SECRET: 's' });
    expect(res.status).toBe(409);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('POST /:id/payment-link/renew replaces an expired link with a fresh one', async () => {
    seedLinkEntry('entry-r1', 'plink_r1', 'expired');
    global.fetch = vi.fn(async (url: any, opts: any) => {
      if (String(url).includes('/payment_links') && !String(url).includes('/cancel')) {
        const body = JSON.parse(opts?.body || '{}');
        expect(body.amount).toBe(500000);
        return new Response(JSON.stringify({ id: 'plink_r1_NEW', status: 'created', amount: body.amount, short_url: 'https://rzp.io/rzp/fresh' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('{}', { status: 404 });
    }) as any;

    const res = await app.request('/api/transactions/entry-r1/payment-link/renew', {
      method: 'POST',
      headers: { 'Cookie': 'better-auth.session_token=token-counselor' }
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x', RAZORPAY_KEY_ID: 'k', RAZORPAY_KEY_SECRET: 's' });
    expect(res.status).toBe(200);
    const entry = mockD1.tables.payments.find((p) => p.id === 'entry-r1');
    expect(entry.razorpay_link_id).toBe('plink_r1_NEW');
    expect(entry.razorpay_short_url).toBe('https://rzp.io/rzp/fresh');
    expect(entry.link_status).toBe('created');
    expect(entry.razorpay_payment_id).toBeNull();
  });

  it('renew refuses while a live link exists (409 — no double redeemable link)', async () => {
    seedLinkEntry('entry-r2', 'plink_r2', 'created');
    global.fetch = vi.fn(async () => new Response('{}', { status: 404 })) as any;
    const res = await app.request('/api/transactions/entry-r2/payment-link/renew', {
      method: 'POST',
      headers: { 'Cookie': 'better-auth.session_token=token-counselor' }
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x', RAZORPAY_KEY_ID: 'k', RAZORPAY_KEY_SECRET: 's' });
    expect(res.status).toBe(409);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it('POST /api/transactions/charge passes CALLBACK_URL through to the link', async () => {
    let sentBody: any = null;
    global.fetch = vi.fn(async (url: any, opts: any) => {
      if (String(url).includes('/payment_links')) {
        sentBody = JSON.parse(opts?.body || '{}');
        return new Response(JSON.stringify({ id: 'plink_cb', status: 'created', short_url: 'https://rzp.io/rzp/cb' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('{}', { status: 404 });
    }) as any;

    const res = await app.request('/api/transactions/charge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': 'better-auth.session_token=token-counselor' },
      body: JSON.stringify({ clientId: 'OP-2026-1001', amount: 1000, description: 'Callback test' })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x', RAZORPAY_KEY_ID: 'k', RAZORPAY_KEY_SECRET: 's', CALLBACK_URL: 'https://app.opusos.com/payment-confirmed' });
    expect(res.status).toBe(200);
    expect(sentBody.callback_url).toBe('https://app.opusos.com/payment-confirmed');
    expect(sentBody.callback_method).toBe('get');
  });

  // ── A-3 delivery log + refund reversal ──
  it('webhook writes the delivery log and skips already-processed replays', async () => {
    mockD1.tables.payments.push({
      id: 'entry-log1', client_id: 'OP-2026-1001', engagement_id: 'eng-rzp-1', amount: 100000, type: 'charge',
      milestone_name: 'Log test', method: null, reference_number: null,
      taxable_amount: null, cgst: null, sgst: null, igst: null, is_interstate: 0,
      invoice_date: null, due_date: null, gst_rate: 0, customer_gstin: null,
      razorpay_link_id: 'plink_log1', razorpay_short_url: 'https://rzp.io/rzp/log1', link_status: 'created',
      razorpay_payment_id: null, status: 'draft', entered_by: 'counselor-1', confirmed_by: null, confirmed_at: null, erp_doc_name: null, created_at: 0
    });
    const payload = {
      id: 'evt_log1',
      event: 'payment_link.paid',
      payload: {
        payment: { entity: { id: 'pay_log1', amount: 100000, method: 'upi' } },
        payment_link: { entity: { id: 'plink_log1', amount: 100000, notes: { entryId: 'entry-log1' } } }
      }
    };
    const rawBody = JSON.stringify(payload);
    const signature = await hmacHex('whsec', rawBody);
    const env = { DB: mockD1, RAZORPAY_WEBHOOK_SECRET: 'whsec' };

    const res = await app.request('/api/public/payments/razorpay/webhook', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Razorpay-Signature': signature }, body: rawBody
    }, env);
    expect(res.status).toBe(200);

    const logRow = mockD1.tables.webhook_events.find((e) => e.id === 'evt_log1');
    expect(logRow).toBeTruthy();
    expect(logRow.event).toBe('payment_link.paid');
    expect(logRow.processed).toBeTruthy(); // mock D1 stores booleans as 1/0
    expect(logRow.detail).toBeTruthy();
    expect(mockD1.tables.payments.filter((p) => p.type === 'receipt')).toHaveLength(1);

    // replay with the same event id → acknowledged, nothing re-processed
    const res2 = await app.request('/api/public/payments/razorpay/webhook', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Razorpay-Signature': signature }, body: rawBody
    }, env);
    expect((await res2.json() as any).detail).toBe('replay');
    expect(mockD1.tables.payments.filter((p) => p.type === 'receipt')).toHaveLength(1);
  });

  it('refund.processed records a counter-entry and bumps the balance (replay-safe)', async () => {
    // paid via link: charge paid + synced receipt
    mockD1.tables.payments.push({
      id: 'entry-rf1', client_id: 'OP-2026-1001', engagement_id: 'eng-rzp-1', amount: 500000, type: 'charge',
      milestone_name: 'Refund test', method: 'upi', reference_number: null,
      taxable_amount: null, cgst: null, sgst: null, igst: null, is_interstate: 0,
      invoice_date: null, due_date: null, gst_rate: 0, customer_gstin: null,
      razorpay_link_id: 'plink_rf1', razorpay_short_url: 'https://rzp.io/rzp/rf1', link_status: 'paid',
      razorpay_payment_id: 'pay_rf1', status: 'paid', entered_by: 'counselor-1', confirmed_by: null, confirmed_at: null, erp_doc_name: null, created_at: 0
    });
    mockD1.tables.payments.push({
      id: 'receipt-rf1', client_id: 'OP-2026-1001', engagement_id: 'eng-rzp-1', amount: 500000, type: 'receipt',
      milestone_name: 'Refund test (received)', method: 'upi', reference_number: 'pay_rf1',
      taxable_amount: null, cgst: null, sgst: null, igst: null, is_interstate: 0,
      invoice_date: null, due_date: null, gst_rate: 0, customer_gstin: null,
      razorpay_link_id: null, razorpay_short_url: null, link_status: 'none',
      razorpay_payment_id: null, status: 'synced', entered_by: 'counselor-1', confirmed_by: null, confirmed_at: null, erp_doc_name: null, created_at: 0
    });
    mockD1.tables.engagements[0].outstanding_balance = 0;

    const payload = {
      id: 'evt_rf1',
      event: 'refund.processed',
      payload: {
        refund: { entity: { id: 'rfnd_1', payment_id: 'pay_rf1', amount: 500000, status: 'processed' } }
      }
    };
    const rawBody = JSON.stringify(payload);
    const signature = await hmacHex('whsec', rawBody);
    const env = { DB: mockD1, RAZORPAY_WEBHOOK_SECRET: 'whsec' };

    const res = await app.request('/api/public/payments/razorpay/webhook', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Razorpay-Signature': signature }, body: rawBody
    }, env);
    expect(res.status).toBe(200);

    const refundRow = mockD1.tables.payments.find((p) => p.reference_number === 'rfnd_1');
    expect(refundRow).toBeTruthy();
    expect(refundRow.type).toBe('refund');
    expect(refundRow.amount).toBe(500000);
    expect(refundRow.status).toBe('synced');
    expect(mockD1.tables.engagements[0].outstanding_balance).toBe(500000); // money back on the book

    // replay under a DIFFERENT event id → refund-id dedupe still blocks the double credit
    const replayBody = JSON.stringify({ ...payload, id: 'evt_rf2' });
    const res2 = await app.request('/api/public/payments/razorpay/webhook', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Razorpay-Signature': await hmacHex('whsec', replayBody) }, body: replayBody
    }, env);
    expect((await res2.json() as any).detail).toBe('refund already recorded');
    expect(mockD1.tables.payments.filter((p) => p.reference_number === 'rfnd_1')).toHaveLength(1);
  });

  it('GET ?linkStatus=created filters the ledger; /links-summary buckets aging', async () => {
    const now = Math.floor(Date.now() / 1000);
    seedLinkEntry('entry-s1', 'plink_s1', 'created', now - 6 * 86400); // stale (≥5d)
    seedLinkEntry('entry-s2', 'plink_s2', 'created', now - 3 * 86400); // reminder window (≥3d)
    seedLinkEntry('entry-s3', 'plink_s3', 'created', now - 1 * 3600);  // fresh
    seedLinkEntry('entry-s4', 'plink_s4', 'paid', now);

    const res = await app.request('/api/transactions?linkStatus=created', {
      headers: { 'Cookie': 'better-auth.session_token=token-counselor' }
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(res.status).toBe(200);
    const ids = (await res.json() as any).transactions.map((t: any) => t.id);
    expect(ids.sort()).toEqual(['entry-s1', 'entry-s2', 'entry-s3']);

    const sres = await app.request('/api/transactions/links-summary', {
      headers: { 'Cookie': 'better-auth.session_token=token-counselor' }
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    const summary = await sres.json() as any;
    expect(summary.outstanding).toBe(3);
    expect(summary.remindDue).toBe(2); // s1 (6d) + s2 (3d)
    expect(summary.stale).toBe(1);      // s1 only
  });
});