import { describe, it, expect, beforeAll, vi } from 'vitest';

// Mock the auth module so RBAC middleware resolves sessions by cookie value
// (same pattern as funnel.test.ts).
vi.mock('../src/auth.js', () => {
  return {
    getAuth: (env: any) => {
      const users: Record<string, any> = {
        'token-admin': { id: 'owner-1', name: 'Owner', email: 'o@test.com', role: 'super_admin', userDivisions: JSON.stringify([]), twoFactorEnabled: false },
        'token-manager': { id: 'mgr-1', name: 'Mgr', email: 'm@test.com', role: 'manager', userDivisions: JSON.stringify([]), twoFactorEnabled: false },
      };
      return {
        api: { getSession: async ({ headers }: any) => {
          const cookie = typeof headers?.get === 'function' ? (headers.get('cookie') || '') : (headers?.['cookie'] || '');
          const match = cookie.match(/better-auth\.session_token=([^;]+)/);
          const token = match?.[1] || '';
          const user = users[token];
          if (!user) return null;
          return { user, session: { id: 's-' + token, token, userId: user.id } };
        } },
      };
    },
  };
});

import app from '../src/index.js';
import { MockD1Database } from './mockDb.js';

describe('Resume upload (public manpower → R2)', () => {
  let mock: MockD1Database;
  beforeAll(() => { mock = new MockD1Database(); });

  it('rejects without BUCKET binding → 503', async () => {
    const res = await app.request('/api/public/manpower/resume', {
      method: 'POST', headers: { 'Content-Type': 'multipart/form-data' },
    }, { DB: mock, TURNSTILE_SECRET_KEY: '1x' });
    expect(res.status).toBe(503);
  });
});

describe('Employer compliance statutory registers', () => {
  let mockD1: MockD1Database;
  beforeAll(() => {
    mockD1 = new MockD1Database();
    mockD1.tables.statutory_registers.push({
      id: 'st-1', month: '2026-08', type: 'pt', employee_name: 'Test Emp', employee_id: null,
      wage_amount: 5000000, deduction_paise: 20000, employer_share: 0, due_date: '2026-08-20',
      paid_at: null, status: 'pending', notes: null, created_at: 1, updated_at: 1,
    });
  });

  it('GET /api/compliance/statutory lists + aggregates by type', async () => {
    const res = await app.request('/api/compliance/statutory', { headers: { 'cookie': 'better-auth.session_token=token-manager' } }, { DB: mockD1, BETTER_AUTH_SECRET: 's' });
    expect(res.status).toBe(200);
    const j = await res.json() as any;
    expect(j.registers).toHaveLength(1);
    expect(j.summary.pt.totalWage).toBeGreaterThanOrEqual(2500000);
  });

  it('POST creates entries (paise amounts)', async () => {
    const res = await app.request('/api/compliance/statutory', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'cookie': 'better-auth.session_token=token-manager' },
      body: JSON.stringify({ entries: [{ month: '2026-08', type: 'pf', employeeName: 'A', wageAmount: 100000, deductionPaise: 12000, employerShare: 13000 }] }),
    }, { DB: mockD1, BETTER_AUTH_SECRET: 's' });
    expect(res.status).toBe(200);
    const rows = (mockD1.tables.statutory_registers as any[]).filter(r => r.type === 'pf');
    expect(rows).toHaveLength(1);
  });
});

describe('Partner admin (owner)', () => {
  let mockD1: MockD1Database;
  beforeAll(() => {
    mockD1 = new MockD1Database();
    mockD1.tables.partners.push({ id: 'p-1', name: 'AgencyX', panNumber: '******1234F', bank_account: '999', ifsc_code: 'SBIN0000001', status: 'active', referral_code: 'OPUS-X', api_token: 't', created_at: 1 });
  });

  it('PATCH /api/admin/partners/:id/status blocks a partner', async () => {
    const res = await app.request('/api/admin/partners/p-1/status', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', 'cookie': 'better-auth.session_token=token-admin' },
      body: JSON.stringify({ status: 'blocked' }),
    }, { DB: mockD1, BETTER_AUTH_SECRET: 's' });
    expect(res.status).toBe(200);
    const row = (mockD1.tables.partners as any[]).find(p => p.id === 'p-1');
    expect(row.status).toBe('blocked');
  });
  // Compliance router uses its own Rbac; owner-only admin path verified above.
});