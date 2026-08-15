import { describe, it, expect, beforeEach, vi } from 'vitest';
import app from '../src/index.js';
import { MockD1Database } from './mockDb.js';

vi.mock('../src/auth.js', () => ({
  getAuth: () => ({ api: { getSession: async () => null } }),
}));

const TOKEN = 'dev-automation-token-change-me';
let mockD1: MockD1Database;

describe('Owner weekly digest (automation lane)', () => {
  const ENV = () => ({ DB: mockD1, AUTOMATION_TOKEN: TOKEN });

  beforeEach(() => {
    mockD1 = new MockD1Database();
    const now = Math.floor(Date.now() / 1000);
    // clients: 1 new in window, 1 older
    mockD1.tables.clients.push(
      { id: 'OP-2026-1001', name: 'New Lead', phone: '+91 1', email: 'n@x.com', highest_qualification: null, lead_source: 'website', intake_context: null, created_at: now - 1 * 86400, updated_at: now },
      { id: 'OP-2026-1002', name: 'Old Lead', phone: '+91 2', email: 'o@x.com', highest_qualification: null, lead_source: 'website', intake_context: null, created_at: now - 30 * 86400, updated_at: now },
    );
    // nurture: 1 sent in window, 1 skipped in window, 1 scheduled+due
    mockD1.tables.nurture_touches.push(
      { id: 't-a', client_id: 'OP-2026-1001', channel: 'email', stage: 'value', body: 'hi', due_at: now - 200000, status: 'sent', sent_at: now - 2 * 86400, created_at: now - 4 * 86400, engagement_id: null, campaign_id: null },
      { id: 't-b', client_id: 'OP-2026-1001', channel: 'whatsapp', stage: 'final', body: 'hi', due_at: now - 100000, status: 'skipped', sent_at: now - 1 * 86400, created_at: now - 3 * 86400, engagement_id: null, campaign_id: null },
      { id: 't-c', client_id: 'OP-2026-1001', channel: 'email', stage: 'offer', body: 'hi', due_at: now - 500, status: 'scheduled', sent_at: null, created_at: now - 2 * 86400, engagement_id: null, campaign_id: null },
    );
    // erp: 2 failed in window, 1 synced old
    mockD1.tables.erpnext_sync_log.push(
      { id: 'e1', entity_id: 'P1', doctype: 'Sales Invoice', status: 'failed', error: 'HTTP 408 timeout', attempts: 2, created_at: now - 1 * 86400, synced_at: null, erp_doc_name: null },
      { id: 'e2', entity_id: 'P2', doctype: 'Sales Invoice', status: 'failed', error: 'GSTIN mismatch', attempts: 1, created_at: now - 2 * 86400, synced_at: null, erp_doc_name: null },
      { id: 'e3', entity_id: 'P3', doctype: 'Sales Invoice', status: 'synced', error: null, attempts: 1, created_at: now - 20 * 86400, synced_at: now, erp_doc_name: 'ACC-SINV-X' },
    );
    // payments: 1 live stale link, 1 paid
    mockD1.tables.payments.push(
      { id: 'p1', client_id: 'OP-2026-1001', engagement_id: 'eng-1', amount: 500000, type: 'charge', milestone_name: 'Stale', method: null, reference_number: null, taxable_amount: null, cgst: null, sgst: null, igst: null, is_interstate: 0, invoice_date: null, due_date: null, gst_rate: 0, customer_gstin: null, razorpay_link_id: 'pl_1', razorpay_short_url: 'x', link_status: 'created', razorpay_payment_id: null, status: 'draft', entered_by: 'counselor-1', confirmed_by: null, confirmed_at: null, erp_doc_name: null, created_at: now - 6 * 86400 },
      { id: 'p2', client_id: 'OP-2026-1001', engagement_id: 'eng-1', amount: 250000, type: 'receipt', milestone_name: 'Paid', method: 'upi', reference_number: 'pay_x', taxable_amount: null, cgst: null, sgst: null, igst: null, is_interstate: 0, invoice_date: null, due_date: null, gst_rate: 0, customer_gstin: null, razorpay_link_id: null, razorpay_short_url: null, link_status: 'none', razorpay_payment_id: null, status: 'paid', entered_by: 'counselor-1', confirmed_by: null, confirmed_at: null, erp_doc_name: null, created_at: now - 1 * 86400 },
    );
    // engagements: one positive, one negative (exception)
    mockD1.tables.engagements.push(
      { id: 'eng-1', client_id: 'OP-2026-1001', division: 'study-abroad', title: 'C1', stage_key: 'documents', outstanding_balance: 5900000, status: 'active', created_at: now, updated_at: now },
      { id: 'eng-2', client_id: 'OP-2026-1002', division: 'umrah', title: 'C2', stage_key: 'documents', outstanding_balance: -10000, status: 'active', created_at: now, updated_at: now },
    );
    // 1 suppressed subscriber
    mockD1.tables.listmonk_suppressions.push({ email: 'n@x.com', suppressed: true, reason: 'hard_bounce', soft_count: 0, created_at: now, updated_at: now });
  });

  it('aggregates the weekly KPI digest + flags exceptions', async () => {
    const res = await app.request('/api/automation/digest/weekly', { headers: { 'X-Service-Token': TOKEN } }, ENV());
    expect(res.status).toBe(200);
    const d = await res.json() as any;
    expect(d.ok).toBe(true);
    expect(d.summary.leads).toBe(1);                 // 1 client in window
    expect(d.summary.nurture.sent).toBe(1);          // t-a
    expect(d.summary.nurture.skipped).toBe(1);       // t-b
    expect(d.summary.nurture.dueNow).toBe(1);        // t-c
    expect(d.summary.suppressed).toBe(1);
    expect(d.summary.links.outstanding).toBe(1);     // p1 live
    expect(d.summary.links.stale).toBe(1);           // p1 ≥5d
    expect(d.summary.receivables.totalPaise).toBe(5890000); // 5900000 - 10000
    expect(d.summary.receivables.negativeCount).toBe(1);
    expect(d.summary.erp.failed).toBe(2);
    expect(d.summary.erp.samples).toContain('GSTIN mismatch');

    // Telegram-ready markdown with exceptions flagged
    expect(d.markdown).toContain('📊 OpusOS Ops Digest');
    expect(d.markdown).toContain('⛓ Payment links: 1 outstanding (1 stale ≥5d ⚠️)');
    expect(d.markdown).toContain('⚠️ Needs attention');
    expect(d.markdown).toContain('ERP sync failures: 2');
  });

  it('all-clear state emits no ⚠️ exceptions', async () => {
    mockD1.tables.erpnext_sync_log = [];
    mockD1.tables.payments = mockD1.tables.payments.filter((p) => p.id !== 'p1');
    mockD1.tables.engagements[1].outstanding_balance = 0;
    const res = await app.request('/api/automation/digest/weekly?days=7', { headers: { 'X-Service-Token': TOKEN } }, ENV());
    const d = await res.json() as any;
    expect(d.markdown).toContain('✅ All clear.');
    expect(d.markdown).not.toContain('⚠️');
  });

  it('rejects without the service token (fail-closed)', async () => {
    const res = await app.request('/api/automation/digest/weekly', {}, ENV());
    expect(res.status).toBe(401);
  });
});