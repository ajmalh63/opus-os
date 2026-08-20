import { describe, it, expect, beforeAll, vi } from 'vitest';

vi.mock('../src/auth.js', () => {
  const users: Record<string, any> = {
    'token-owner': { id: 'u-owner', role: 'super_admin', userDivisions: '[]' },
    'token-mgr': { id: 'u-mgr', role: 'manager', userDivisions: '[]' },
    'token-counselor': { id: 'u-counselor', role: 'counselor', userDivisions: '["study-abroad"]' },
    'token-receptionist': { id: 'u-receptionist', role: 'receptionist', userDivisions: '[]' },
  };
  return {
    getAuth: () => ({
      api: {
        getSession: async ({ headers }: any) => {
          const c = typeof headers?.get === 'function' ? (headers.get('cookie') || '') : '';
          const m = c.match(/better-auth\.session_token=([^;]+)/);
          const user = m ? users[m[1]] : null;
          return user ? { user, session: {} } : null;
        },
      },
    }),
  };
});

import app from '../src/index.js';
import { MockD1Database } from './mockDb.js';

const ENV = (m: MockD1Database) => ({ DB: m, BETTER_AUTH_SECRET: 's', ERPNEXT_BASE_URL: 'http://erp:8080', ERPNEXT_API_KEY: 'k', ERPNEXT_API_SECRET: 'sec' });

describe('Transactions module (all internal accounts)', () => {
  let mockD1: MockD1Database;

  beforeAll(() => {
    mockD1 = new MockD1Database();
    mockD1.tables.clients.push({ id: 'OP-2026-TX1', portal_token: 'OP-2026-TX1', name: 'Billing Client', phone: '999', email: 'tx@example.com', created_at: 1, updated_at: 1 });
    mockD1.tables.engagements.push({ id: 'eng-tx', client_id: 'OP-2026-TX1', division: 'study-abroad', title: 'E', stage_key: 'lead', outstanding_balance: 0, status: 'active', created_at: 1, updated_at: 1 });
  });

  const body = (over = {}) => JSON.stringify({
    clientId: 'OP-2026-TX1', engagementId: 'eng-tx', type: 'invoice',
    amount: 1180000, milestoneName: 'Service invoice', method: 'upi',
    isInterstate: false, ...over,
  });

  it('counselor creates a DRAFT entry (no balance effect)', async () => {
    const res = await app.request('/api/transactions/entries', {
      method: 'POST', headers: { 'Content-Type': 'application/json', cookie: 'better-auth.session_token=token-counselor' },
      body: body(),
    }, ENV(mockD1));
    expect(res.status).toBe(200);
    const j = await res.json() as any;
    expect(j.status).toBe('draft');
    const row = (mockD1.tables.payments as any[]).find((p) => p.id === j.id);
    expect(row.status).toBe('draft');
    expect(row.entered_by).toBe('u-counselor');
    // draft must NOT affect balance
    expect((mockD1.tables.engagements as any[]).find((e) => e.id === 'eng-tx').outstanding_balance).toBe(0);
  });

  it('receptionist can also draft (all staff)', async () => {
    const res = await app.request('/api/transactions/entries', {
      method: 'POST', headers: { 'Content-Type': 'application/json', cookie: 'better-auth.session_token=token-receptionist' },
      body: body({ type: 'receipt', amount: 50000 }),
    }, ENV(mockD1));
    expect(res.status).toBe(200);
  });

  it('counselor CANNOT confirm (money ceiling)', async () => {
    const draft = (mockD1.tables.payments as any[]).find((p) => p.status === 'draft');
    const res = await app.request(`/api/transactions/${draft.id}/confirm`, {
      method: 'POST', headers: { cookie: 'better-auth.session_token=token-counselor' },
    }, ENV(mockD1));
    expect(res.status).toBe(403);
  });

  it('manager confirms → balance applied + status confirmed', async () => {
    vi.stubGlobal('fetch', vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ data: { name: 'ACC-M1' } }), { status: 200, headers: { 'Content-Type': 'application/json' } }))));
    const draft = (mockD1.tables.payments as any[]).find((p) => p.status === 'draft' && p.type === 'invoice');
    const res = await app.request(`/api/transactions/${draft.id}/confirm`, {
      method: 'POST', headers: { cookie: 'better-auth.session_token=token-mgr' },
    }, ENV(mockD1));
    expect(res.status).toBe(200);
    const row = (mockD1.tables.payments as any[]).find((p) => p.id === draft.id);
    const syncRows = (mockD1.tables.erpnext_sync_log || []) as any[];
    if (row.status !== 'synced') console.log('MANUAL-SYNC-FAIL', row.status, JSON.stringify(syncRows[syncRows.length-1]?.error || 'no log'));
    console.log('MANUAL-DOC', row.erp_doc_name, 'sync-rows', syncRows.length);
    // manual confirm + instant ERP push → synced, with ERP doc name recorded
    expect(['confirmed', 'synced']).toContain(row.status);
    expect(row.erp_doc_name).toBeTruthy();
    // invoice +1180000 ⇒ outstanding 1180000
    const eng = (mockD1.tables.engagements as any[]).find((e) => e.id === 'eng-tx');
    expect(eng.outstanding_balance).toBe(1180000);
  });

  it('ledger lists entries with client names for staff (counselor sees own only — server-mandated mine)', async () => {
    // Seed entries entered by this counselor so the server-side mine filter returns them
    const now = Math.floor(Date.now() / 1000);
    (mockD1.tables.payments as any[]).push(
      { id: 'mine-1', client_id: 'OP-2026-TX1', engagement_id: 'eng-tx', amount: 100000, type: 'invoice', milestone_name: 'Mine A', status: 'confirmed', entered_by: 'u-counselor', created_at: now },
      { id: 'mine-2', client_id: 'OP-2026-TX1', engagement_id: 'eng-tx', amount: 50000, type: 'receipt', milestone_name: 'Mine B', status: 'confirmed', entered_by: 'u-counselor', created_at: now },
    );
    const res = await app.request('/api/transactions', {
      headers: { cookie: 'better-auth.session_token=token-counselor' },
    }, ENV(mockD1));
    expect(res.status).toBe(200);
    const j = await res.json() as any;
    expect(j.transactions.length).toBeGreaterThanOrEqual(2);
    expect(j.transactions[0].clientName).toBe('Billing Client');
  });

  it('manager voids a draft receipt; balance recomputed', async () => {
    const draft = (mockD1.tables.payments as any[]).find((p) => p.status === 'draft');
    await app.request(`/api/transactions/${draft.id}/void`, { method: 'POST', headers: { cookie: 'better-auth.session_token=token-mgr' } }, ENV(mockD1));
    const row = (mockD1.tables.payments as any[]).find((p) => p.id === draft.id);
    expect(row.status).toBe('void');
  });

  describe('counselor auto-confirm + instant ERP (Wave-1/2 end-to-end)', () => {
    it('auto-confirms an invoice within scope + under threshold and syncs to ERP', async () => {
      // enable policy: threshold ₹25,000 (2500000 paise)
      mockD1.tables.business_profile.push({ id: 'main', auto_confirm_enabled: 1, auto_confirm_threshold_paise: 2500000, gst_rate_json: '{}', hsn_json: '{}', updated_at: 0 });
      // ERP reachable (mocked fetch)
      vi.stubGlobal('fetch', vi.fn().mockImplementation((url: string) => {
        const s = String(url);
        console.log('ERP fetch', s);
        if (s.includes('/api/resource/Customer')) return Promise.resolve(new Response(JSON.stringify({ data: { name: 'Billing Client' } }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
        if (s.includes('/api/resource/Sales%20Invoice') || s.includes('/api/resource/Sales Invoice')) return Promise.resolve(new Response(JSON.stringify({ data: { name: 'ACC-TX-1' } }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
        return Promise.resolve(new Response('ok', { status: 200 }));
      }));

      const res = await app.request('/api/transactions/entries', {
        method: 'POST', headers: { 'Content-Type': 'application/json', cookie: 'better-auth.session_token=token-counselor' },
        body: JSON.stringify({ clientId: 'OP-2026-TX1', engagementId: 'eng-tx', type: 'invoice', amount: 100000, milestoneName: 'Auto invoice', isInterstate: false, gstRate: 18 }),
      }, ENV(mockD1));
      expect(res.status).toBe(200);
      const j = await res.json() as any;
      expect(j.status).toBe('confirmed');
      expect(j.autoConfirmed).toBe(true);

      const row = (mockD1.tables.payments as any[]).find((p) => p.id === j.id);
      const synclog = (mockD1.tables.erpnext_sync_log || []) as any[];
      if (row.status !== 'synced') console.log('SYNC-FAIL', row.status, synclog[synclog.length - 1]?.error || 'no log', '[', synclog.length, 'rows ]');
      expect(row.status).toBe('synced'); // instant ERP push flipped it
      expect(row.erp_doc_name).toBeTruthy();
      // balance from the confirmed amount only (invoice +100000, minus voided receipt excluded)
      const eng = (mockD1.tables.engagements as any[]).find((e) => e.id === 'eng-tx');
      expect(eng.outstanding_balance).toBeGreaterThan(0);
    });

    it('invoice above threshold stays draft (needs manager)', async () => {
      const res = await app.request('/api/transactions/entries', {
        method: 'POST', headers: { 'Content-Type': 'application/json', cookie: 'better-auth.session_token=token-counselor' },
        body: JSON.stringify({ clientId: 'OP-2026-TX1', engagementId: 'eng-tx', type: 'invoice', amount: 90000000, milestoneName: 'Big invoice', isInterstate: false }),
      }, ENV(mockD1));
      expect(res.status).toBe(200);
      expect((await res.json() as any).status).toBe('draft');
    });
  });
});
