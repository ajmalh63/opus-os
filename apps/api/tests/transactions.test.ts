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

const ENV = (m: MockD1Database) => ({ DB: m, BETTER_AUTH_SECRET: 's' });

describe('Transactions module (all internal accounts)', () => {
  let mockD1: MockD1Database;

  beforeAll(() => {
    mockD1 = new MockD1Database();
    mockD1.tables.clients.push({ id: 'OP-2026-TX1', name: 'Billing Client', phone: '999', email: 'tx@example.com', created_at: 1, updated_at: 1 });
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
    const draft = (mockD1.tables.payments as any[]).find((p) => p.status === 'draft' && p.type === 'invoice');
    const res = await app.request(`/api/transactions/${draft.id}/confirm`, {
      method: 'POST', headers: { cookie: 'better-auth.session_token=token-mgr' },
    }, ENV(mockD1));
    expect(res.status).toBe(200);
    const row = (mockD1.tables.payments as any[]).find((p) => p.id === draft.id);
    expect(row.status).toBe('confirmed');
    // invoice +1180000 ⇒ outstanding 1180000 (receipt still draft?)
    const eng = (mockD1.tables.engagements as any[]).find((e) => e.id === 'eng-tx');
    expect(eng.outstanding_balance).toBe(1180000);
  });

  it('ledger lists entries with client names for staff', async () => {
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
});