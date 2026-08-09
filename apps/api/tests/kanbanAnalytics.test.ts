import { describe, it, expect, beforeAll, vi } from 'vitest';

vi.mock('../src/auth.js', () => ({
  getAuth: () => ({
    api: {
      getSession: async ({ headers }: any) => {
        const c = typeof headers?.get === 'function' ? (headers.get('cookie') || '') : '';
        const m = c.match(/better-auth\.session_token=([^;]+)/);
        return m ? { user: { id: 'u', role: m[1] === 'token-admin' ? 'super_admin' : 'manager', userDivisions: '[]' }, session: {} } : null;
      },
    },
  }),
}));

import app from '../src/index.js';
import { MockD1Database } from './mockDb.js';
import { kanbanFlowAnalytics } from '../src/infra/flowAnalytics.js';

describe('Kanban flow analytics (§16.4.5)', () => {
  let mockD1: MockD1Database;

  beforeAll(() => {
    const now = Math.floor(Date.now() / 1000);
    mockD1 = new MockD1Database();
    mockD1.tables.pipeline_stages.push(
      { id: 'st-lead', key: 'lead', name: 'Lead', sequence: 1, wip_limit: null, created_at: now - 90 * 86400 },
      { id: 'st-qual', key: 'qualified', name: 'Qualified', sequence: 2, wip_limit: null, created_at: now - 90 * 86400 },
      { id: 'st-complete', key: 'complete', name: 'Complete', sequence: 3, wip_limit: null, created_at: now - 90 * 86400 }
    );
    mockD1.tables.engagements.push({ id: 'eng-1', client_id: 'OP-1', division: 'study-abroad', title: 'A', stage_key: 'lead', outstanding_balance: 0, status: 'active', created_at: now - 10 * 86400, updated_at: now });
    mockD1.tables.audit_log.push(
      { id: 'a1', actor_id: null, action: 'STAGE_CHANGE', entity_name: 'engagements', entity_id: 'eng-1', before_state: null, after_state: JSON.stringify({ stageKey: 'qualified' }), ip_address: null, created_at: now - 5 * 86400 },
      { id: 'a2', actor_id: null, action: 'STAGE_CHANGE', entity_name: 'engagements', entity_id: 'eng-1', after_state: JSON.stringify({ stageKey: 'complete' }), before_state: null, created_at: now - 1 * 86400 }
    );
  });

  it('builds CFD, throughput and Monte Carlo from staged mock data', async () => {
    const r = await kanbanFlowAnalytics({ DB: mockD1 } as any, { days: 30 });
    expect(r.cfd.length).toBeGreaterThan(5);
    expect(r.cfd[0].counts).toHaveProperty('lead');
    expect(r.throughputPerDay.some((t) => t.completed >= 1)).toBe(true);
    expect(r.wipToday).toBeGreaterThan(0);
    // Monte Carlo always returns percentiles
    expect(r.monteCarlo.p50).toBeGreaterThanOrEqual(0);
    expect(r.monteCarlo.p90).toBeGreaterThanOrEqual(r.monteCarlo.p50);
  });

  it('GET /api/kanban/analytics is manager-accessible', async () => {
    const res = await app.request('/api/kanban/analytics?days=7', {
      headers: { cookie: 'better-auth.session_token=token-mgr' },
    }, { DB: mockD1, BETTER_AUTH_SECRET: 's' });
    expect(res.status).toBe(200);
    const j = await res.json() as any;
    expect(j.analytics.leadTimeAvgDays).toBeGreaterThanOrEqual(0);
  });
});

function toIsoDays(n: number): string { return new Date(n).toISOString().slice(0, 10); }