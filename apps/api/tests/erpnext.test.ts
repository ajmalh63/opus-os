import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import app from '../src/index.js';
import { MockD1Database } from './mockDb.js';
import { buildInvoicePayload } from '../src/infra/erpnext.js';
import { erpnextSyncLog } from '../src/db/schema.js';

vi.mock('../src/auth.js', () => {
  return {
    getAuth: () => ({
      api: {
        getSession: async (options: any) => {
          const cookieHeader = options?.headers?.get('cookie') || '';
          const token = (cookieHeader.match(/better-auth\.session_token=([^;]+)/) || [])[1] || null;
          if (token === 'token-admin') {
            return {
              user: { id: 'u-owner', name: 'Owner', email: 'o@t.com', role: 'super_admin', userDivisions: '[]' },
              session: { id: 's-1', token, userId: 'u-owner' },
            };
          }
          return null;
        },
      },
    }),
  };
});

describe('ERPNext back-office integration', () => {
  let mockD1: MockD1Database;
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeAll(() => {
    mockD1 = new MockD1Database();
    mockD1.tables.clients.push({ id: 'OP-2026-8001', name: 'Erp Client', email: 'e@x.com', phone: '+91 99999 00000', created_at: 1, updated_at: 1 });
    mockD1.tables.engagements.push({ id: 'eng-8001', client_id: 'OP-2026-8001', division: 'study-abroad', title: 'US', stage_key: 'qualified', status: 'active', created_at: 1, updated_at: 1, outstanding_balance: 0 });
    mockD1.tables.payments.push({ id: 'pay-8001', client_id: 'OP-2026-8001', engagement_id: 'eng-8001', amount: 1180000, type: 'invoice', milestone_name: 'Fees', method: 'bank_transfer', created_at: 1 });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('buildInvoicePayload maps a rupee payment into a Frappe Sales Invoice shape', () => {
    const payload = buildInvoicePayload(
      { id: 'pay-8001', amount: 1180000, milestone_name: 'Full Fee' },
      { name: 'Erp Client', email: 'e@x.com' }
    );
    expect(payload.customer).toBe('Erp Client');
    expect(payload.customer_email).toBe('e@x.com');
    expect(payload.company).toBe('Opus Overseas');
    expect(payload.items[0].rate).toBe(11800); // paise → rupees
    expect(payload.currency).toBe('INR');
  });

  it('buildInvoicePayload attaches CGST+SGST rows for intra-state (9% each, no components)', () => {
    const payload = buildInvoicePayload(
      { id: 'pay-8002', amount: 1180000, milestone_name: 'Full Fee', isInterstate: false },
      { name: 'Erp Client', email: 'e@x.com' }
    );
    expect(payload.taxes).toHaveLength(2);
    expect(payload.taxes[0]).toMatchObject({ account_head: 'CGST Output - OO - OO', rate: 9 });
    expect(payload.taxes[1]).toMatchObject({ account_head: 'SGST Output - OO - OO', rate: 9 });
  });

  it('buildInvoicePayload attaches IGST row for interstate payments', () => {
    const payload = buildInvoicePayload(
      { id: 'pay-8003', amount: 1180000, milestone_name: 'Full Fee', isInterstate: 1 },
      { name: 'Erp Client', email: 'e@x.com' }
    );
    expect(payload.taxes).toHaveLength(1);
    expect(payload.taxes[0]).toMatchObject({ account_head: 'IGST Output - OO - OO', rate: 18 });
  });

  it('buildInvoicePayload preserves stored componentized paise splits', () => {
    const payload = buildInvoicePayload(
      { id: 'pay-8004', amount: 1180000, taxableAmount: 1000000, cgst: 90000, sgst: 90000, igst: 0, isInterstate: false },
      { name: 'Erp Client', email: 'e@x.com' }
    );
    expect(payload.taxes).toHaveLength(2);
    expect(payload.taxes[0].rate).toBeCloseTo(9);
    expect(payload.taxes[1].rate).toBeCloseTo(9);
  });

  it('POST /api/erpnext/payments/:id/sync → success writes a synced log entry', async () => {
    // Mock the two-step flow: (1) GET customer probe → 404 (create), (2) POST Customer → created,
    // (3) POST Sales Invoice → created doc SINV-00001
    let calls = 0;
    fetchMock = vi.fn().mockImplementation(async (url: string) => {
      calls++;
      if (url.includes('Customer/')) return new Response('{}', { status: 404 }); // probe missing
      if (url.includes('Customer')) return new Response(JSON.stringify({ data: { name: 'ERP Test Client' } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      return new Response(JSON.stringify({ data: { name: 'SINV-00001' } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', fetchMock);

    const res = await app.request('/api/erpnext/payments/pay-8001/sync', {
      method: 'POST',
      headers: { 'Cookie': 'better-auth.session_token=token-admin' },
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x', ERPNEXT_BASE_URL: 'http://erp:8000' });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);
    expect(data.erpDoc).toBe('SINV-00001');

    const log = (mockD1.tables.erpnext_sync_log as any[]).find((l) => l.entity_name === 'payments' && l.entity_id === 'pay-8001');
    expect(log).toBeTruthy();
    expect(log.status).toBe('synced');
    expect(log.erp_doc_name).toBe('SINV-00001');
  });

  it('POST /api/erpnext/payments/:id/sync → failed logs failure and retries later', async () => {
    fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ exc_type: 'AuthenticationError' }), { status: 401, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);

    const res = await app.request('/api/erpnext/payments/pay-8001/sync', {
      method: 'POST',
      headers: { 'Cookie': 'better-auth.session_token=token-admin' },
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x', ERPNEXT_BASE_URL: 'http://erp:8000' });
    expect(res.status).toBe(502);

    const log = (mockD1.tables.erpnext_sync_log as any[]).find((l) => l.entity_id === 'pay-8001' && l.status === 'failed');
    expect(log).toBeTruthy();
    expect(log.attempts).toBe(1);
  });

  it('rbac: non-owner is denied ERPNext access', async () => {
    const res = await app.request('/api/erpnext/health', {
      headers: { 'Cookie': 'better-auth.session_token=nope' },
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect([401, 403]).toContain(res.status);
  });
});