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

describe('Staff Incentive Engine (Sections 29/31)', () => {
  let mockD1: MockD1Database;

  beforeEach(() => {
    mockD1 = new MockD1Database();
  });

  it('POST /api/incentives/rules creates a fixed-amount rule (owner) and blocks counselor', async () => {
    const denied = await app.request('/api/incentives/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': 'better-auth.session_token=token-counselor' },
      body: JSON.stringify({ division: 'umrah', trigger: 'milestone_paid', amount: 50000 })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(denied.status).toBe(403);

    const ok = await app.request('/api/incentives/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': 'better-auth.session_token=token-admin' },
      body: JSON.stringify({ division: 'umrah', trigger: 'milestone_paid', amount: 50000 })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(ok.status).toBe(200);
    expect(mockD1.tables.incentive_rules.length).toBe(1);
    expect(mockD1.tables.incentive_rules[0].amount).toBe(50000);
  });

  it('GET /api/incentives/rules lists configured rules', async () => {
    mockD1.tables.incentive_rules.push({ id: 'r1', division: 'study-abroad', trigger: 'agreement_signed', amount: 200000, is_percent: false, active: true, created_at: 0 } as any);
    const res = await app.request('/api/incentives/rules', {
      headers: { 'Cookie': 'better-auth.session_token=token-manager' }
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.rules.length).toBe(1);
    expect(data.rules[0].trigger).toBe('agreement_signed');
  });

  it('GET /api/staff/incentives/self returns own accrued total (counselor self-view)', async () => {
    mockD1.tables.incentive_entries.push(
      { id: 'e1', employee_id: 'counselor-1', rule_id: 'r', engagement_id: null, trigger_ref: null, amount: 90000, status: 'accrued', period: null, created_at: 0 },
      { id: 'e2', employee_id: 'counselor-1', rule_id: 'r', engagement_id: null, trigger_ref: null, amount: 50000, status: 'accrued', period: null, created_at: 0 },
    );
    const res = await app.request('/api/staff/incentives/self', {
      headers: { 'Cookie': 'better-auth.session_token=token-counselor' }
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.total).toBe(140000);
    expect(data.entries.length).toBe(2);
  });

  it('POST /api/incentives/close drafts payout statements and marks entries paid', async () => {
    mockD1.tables.users.push({ id: 'admin-1', name: 'Admin', email: 'a@x.com', role: 'super_admin' } as any);
    mockD1.tables.incentive_entries.push({ id: 'a1', employee_id: 'admin-1', rule_id: 'r', engagement_id: null, trigger_ref: null, amount: 100000, status: 'accrued', period: null, created_at: 0 });
    const res = await app.request('/api/incentives/close', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': 'better-auth.session_token=token-admin' },
      body: JSON.stringify({ period: '2026-08' })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.statements.length).toBe(1);
    expect(data.statements[0].net).toBe(90000); // 100000 - 10% TDS
    const entry = mockD1.tables.incentive_entries.find(e => e.id === 'a1');
    expect(entry.status).toBe('paid');
    expect(mockD1.tables.payout_statements.length).toBe(1);
  });

  it('POST /api/incentives/statements/:id/approve marks approved', async () => {
    mockD1.tables.payout_statements.push({ id: 'st1', employee_id: 'admin-1', period: '2026-08', gross: 100000, tds: 10000, net: 90000, status: 'draft', approved_by: null, created_at: 0 } as any);
    const res = await app.request('/api/incentives/statements/st1/approve', {
      method: 'POST',
      headers: { 'Cookie': 'better-auth.session_token=token-admin' }
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(res.status).toBe(200);
    expect(mockD1.tables.payout_statements[0].status).toBe('approved');
    expect(mockD1.tables.payout_statements[0].approved_by).toBe('owner');
  });

  // ============ Audit trail for incentive money events ============
  it('rule create writes an INCENTIVE_RULE_CREATED audit row with the session actor', async () => {
    const res = await app.request('/api/incentives/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': 'better-auth.session_token=token-admin' },
      body: JSON.stringify({ division: 'umrah', trigger: 'milestone_paid', amount: 50000 })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(res.status).toBe(200);
    const logs = mockD1.tables.audit_log as any[];
    const row = logs.find((l: any) => l.action === 'INCENTIVE_RULE_CREATED');
    expect(row).toBeTruthy();
    expect(row.actor_id).toBe('admin-1');
    expect(row.entity_name).toBe('incentive_rules');
    expect(JSON.parse(row.after_state).amount).toBe(50000);
  });

  it('rule patch writes an INCENTIVE_RULE_UPDATED audit row', async () => {
    mockD1.tables.incentive_rules.push({ id: 'r-x', division: 'umrah', trigger: 'milestone_paid', amount: 50000, is_percent: false, active: true, created_at: 0 } as any);
    const res = await app.request('/api/incentives/rules/r-x', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Cookie': 'better-auth.session_token=token-admin' },
      body: JSON.stringify({ amount: 75000 })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(res.status).toBe(200);
    const row = (mockD1.tables.audit_log as any[]).find((l: any) => l.action === 'INCENTIVE_RULE_UPDATED');
    expect(row).toBeTruthy();
    expect(row.actor_id).toBe('admin-1');
    expect(JSON.parse(row.after_state).amount).toBe(75000);
  });

  it('period close writes an INCENTIVE_PERIOD_CLOSED audit row', async () => {
    mockD1.tables.users.push({ id: 'admin-1', name: 'Admin', email: 'a@x.com', role: 'super_admin' } as any);
    mockD1.tables.incentive_entries.push({ id: 'a2', employee_id: 'admin-1', rule_id: 'r', engagement_id: null, trigger_ref: null, amount: 100000, status: 'accrued', period: null, created_at: 0 });
    const res = await app.request('/api/incentives/close', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': 'better-auth.session_token=token-admin' },
      body: JSON.stringify({ period: '2026-09' })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(res.status).toBe(200);
    const row = (mockD1.tables.audit_log as any[]).find((l: any) => l.action === 'INCENTIVE_PERIOD_CLOSED');
    expect(row).toBeTruthy();
    expect(JSON.parse(row.after_state).period).toBe('2026-09');
    expect(JSON.parse(row.after_state).statementCount).toBe(1);
  });

  it('statement approve writes a PAYOUT_APPROVED audit row', async () => {
    mockD1.tables.payout_statements.push({ id: 'st2', employee_id: 'admin-1', period: '2026-08', gross: 100000, tds: 10000, net: 90000, status: 'draft', approved_by: null, created_at: 0 } as any);
    const res = await app.request('/api/incentives/statements/st2/approve', {
      method: 'POST',
      headers: { 'Cookie': 'better-auth.session_token=token-admin' }
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(res.status).toBe(200);
    const row = (mockD1.tables.audit_log as any[]).find((l: any) => l.action === 'PAYOUT_APPROVED');
    expect(row).toBeTruthy();
    expect(row.actor_id).toBe('admin-1');
    expect(JSON.parse(row.after_state).net).toBe(90000);
  });
});