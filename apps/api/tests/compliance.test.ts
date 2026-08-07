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
        if (token === 'token-manager') {
          return { user: { id: "mgr-1", email: "mgr@test.com", role: "manager", userDivisions: '[]' }, session: { id: "s", token, userId: "mgr-1" } };
        }
        if (token === 'token-counselor') {
          return { user: { id: "counselor-1", email: "c@test.com", role: "counselor", userDivisions: '[]' }, session: { id: "s", token, userId: "counselor-1" } };
        }
        return null;
      }
    }
  })
}));

// Current month period string for seeded rows
const NOW = Math.floor(Date.now() / 1000);
const PERIOD = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

describe('Compliance Workbench - GST (Section 14.5)', () => {
  let mockD1: MockD1Database;

  beforeEach(() => {
    mockD1 = new MockD1Database();
    mockD1.tables.business_profile.push({
      id: 'main', legal_name: 'Opus Overseas', gstin: '36AABCO1234F1Z5', pan: 'AABCO1234F', tan: 'HYD12345A',
      state_code: '36', state_name: 'Telangana', address: 'Nizamabad', hsn_json: '{"study-abroad":"9983","visa":"9983","umrah":"9985","attestation":"9988","manpower":"9983"}',
      gst_rate_json: '{"study-abroad":18,"visa":18,"umrah":5,"attestation":18,"manpower":18}', updated_at: 0
    });
    mockD1.tables.clients.push(
      { id: 'OP-2026-B2B', name: 'B2B Client', phone: '+91 99999 00001', email: 'b2b@x.com', gstin: '29ABCDE1234F1Z5', state: '29', createdAt: 0, updatedAt: 0 } as any,
      { id: 'OP-2026-B2C', name: 'B2C Client', phone: '+91 99999 00002', email: 'b2c@x.com', gstin: null, state: '36', createdAt: 0, updatedAt: 0 } as any,
    );
    mockD1.tables.engagements.push(
      { id: 'eng-b2b', clientId: 'OP-2026-B2B', division: 'study-abroad', title: 'UK App', stageKey: 'documents', outstandingBalance: 0, status: 'active', createdAt: NOW, updatedAt: NOW } as any,
      { id: 'eng-b2c', clientId: 'OP-2026-B2C', division: 'study-abroad', title: 'US App', stageKey: 'documents', outstandingBalance: 0, status: 'active', createdAt: NOW, updatedAt: NOW } as any,
    );
    // Outward invoice: B2B intra-state CGST+SGST 18%
    mockD1.tables.payments.push({
      id: 'pay-1', clientId: 'OP-2026-B2B', engagementId: 'eng-b2b', amount: 118000, type: 'invoice', milestoneName: 'Consulting fee',
      method: 'upi', referenceNumber: 'ref1', taxableAmount: 100000, cgst: 9000, sgst: 9000, igst: 0, isInterstate: false, createdAt: NOW
    });
    // Outward invoice: B2C interstate IGST 18%
    mockD1.tables.payments.push({
      id: 'pay-2', clientId: 'OP-2026-B2C', engagementId: 'eng-b2c', amount: 59000, type: 'invoice', milestoneName: 'Visa assist',
      method: 'upi', referenceNumber: 'ref2', taxableAmount: 50000, cgst: 0, sgst: 0, igst: 9000, isInterstate: true, createdAt: NOW
    });
  });

  it('rejects counselor access to compliance (403)', async () => {
    const res = await app.request('/api/compliance/gstr1', {
      headers: { 'Cookie': 'better-auth.session_token=token-counselor' }
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(res.status).toBe(403);
  });

  it('POST /api/compliance/business-profile saves GSTIN + HSN map', async () => {
    const res = await app.request('/api/compliance/business-profile', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': 'better-auth.session_token=token-admin' },
      body: JSON.stringify({ legalName: 'Opus Overseas Pvt Ltd', gstin: '36AABCO1234F1Z5', rates: { attestation: 18 } })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(res.status).toBe(200);
    expect(mockD1.tables.business_profile[0].gstin).toBe('36AABCO1234F1Z5');
    expect(mockD1.tables.business_profile[0].legal_name).toBe('Opus Overseas Pvt Ltd');
  });

  it('GET /api/compliance/gstr1 splits B2B vs B2C and aggregates HSN', async () => {
    const res = await app.request(`/api/compliance/gstr1?period=${PERIOD}`, {
      headers: { 'Cookie': 'better-auth.session_token=token-manager' }
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.success).toBe(true);
    const g = body.data;
    expect(g.gstin).toBe('36AABCO1234F1Z5');
    // B2B: one supplier (29ABCDE...) with 1 invoice
    expect(g.b2b.length).toBe(1);
    expect(g.b2b[0].ctin).toBe('29ABCDE1234F1Z5');
    expect(g.b2b[0].inv.length).toBe(1);
    expect(g.b2b[0].inv[0].itms[0].txval).toBe(100000);
    expect(g.b2b[0].inv[0].itms[0].camt).toBe(9000);
    // B2C: aggregated line at 18%
    expect(g.b2cs.length).toBe(1);
    expect(g.b2cs[0].txval).toBe(50000);
    expect(g.b2cs[0].iamt).toBe(9000);
    // HSN summary
    expect(g.hsn.length).toBeGreaterThan(0);
    const h = g.hsn.find((x: any) => x.txval === 150000);
    expect(h).toBeDefined();
  });

  it('GET /api/compliance/gstr3b computes output tax, ITC and net payable', async () => {
    // Add a purchase with ITC
    mockD1.tables.purchase_invoices.push({
      id: 'pi-1', vendor_name: 'Courier', vendorGstin: '27ABCDE1234F1Z5', invoiceNumber: 'INV-1', invoiceDate: NOW,
      amount: 23600, taxable_amount: 20000, cgst: 1800, sgst: 1800, igst: 0, is_interstate: false, itc_claimable: 1, vendor_msme: 1, createdAt: NOW, paid_at: NOW, updatedAt: NOW
    });
    const res = await app.request(`/api/compliance/gstr3b?period=${PERIOD}`, {
      headers: { 'Cookie': 'better-auth.session_token=token-admin' }
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.computed.outputTax).toBe(27000); // 9000+9000+9000
    expect(body.computed.inputItc).toBe(3600);   // 1800+1800
    expect(body.computed.netPayable).toBe(23400);
  });

  it('POST /api/compliance/reconcile-2b matches purchases against portal JSON', async () => {
    mockD1.tables.purchase_invoices.push({
      id: 'pi-2', vendor_name: 'Hotel', vendorGstin: '36ABCDE1234F1Z5', invoiceNumber: 'HT-100', invoiceDate: NOW,
      amount: 11800, taxable_amount: 10000, cgst: 900, sgst: 900, igst: 0, is_interstate: false, itc_claimable: 1, vendor_msme: 0, createdAt: NOW, paid_at: NOW, updatedAt: NOW
    });
    const payload = {
      period: PERIOD,
      gstr2b: { docdata: { b2b: [{ ctin: '36ABCDE1234F1Z5', doclist: [{ inum: 'HT-100', txval: 10000, iamt: 0, camt: 900, samt: 900 }] }] } }
    };
    const res = await app.request('/api/compliance/reconcile-2b', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': 'better-auth.session_token=token-admin' },
      body: JSON.stringify(payload)
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.summary.matched).toBe(1);
    expect(body.summary.twoBOnly).toBe(0);
    expect(body.summary.booksOnly).toBe(0);
  });

  it('POST /api/compliance/tds + tcs records appear in the register', async () => {
    await app.request('/api/compliance/tds', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': 'better-auth.session_token=token-admin' },
      body: JSON.stringify({ vendorName: 'Consultant', payeePan: 'ABCDE1234F', section: '194J', code: '1027', grossAmount: 50000, tdsAmount: 5000, period: PERIOD })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    await app.request('/api/compliance/tcs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': 'better-auth.session_token=token-admin' },
      body: JSON.stringify({ clientName: 'Umrah Client', taxableAmount: 70000, tcsAmount: 3500, fyAmount: 70000, period: PERIOD })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });

    const res = await app.request(`/api/compliance/tds-tcs?period=${PERIOD}`, {
      headers: { 'Cookie': 'better-auth.session_token=token-admin' }
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    expect(body.tds.length).toBe(1);
    expect(body.tds[0].code).toBe('1027');
    expect(body.tcs.length).toBe(1);
    expect(body.tcs[0].section).toBe('206C(1H)');
  });
});