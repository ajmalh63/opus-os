import { describe, it, expect, beforeEach, vi } from 'vitest';
import app from '../src/index.js';
import { MockD1Database } from './mockDb.js';

vi.mock('../src/auth.js', () => ({
  getAuth: () => ({
    api: {
      getSession: async (options: any) => {
        const token = (options?.headers?.get('cookie') || '').match(/better-auth\.session_token=([^;]+)/)?.[1] || null;
        const users: Record<string, any> = {
          'token-manager': { id: 'mgr-1', name: 'Manager', email: 'm@t.com', role: 'manager', userDivisions: JSON.stringify([]) },
          'token-counselor': { id: 'c-1', name: 'Counselor', email: 'c@t.com', role: 'counselor', userDivisions: JSON.stringify([]) },
        };
        const u = users[token || ''];
        return u ? { user: u, session: { id: 's', token, userId: u.id } } : null;
      }
    }
  })
}));

let mockD1: MockD1Database;

function seedPipeline(stages: { key: string; wipLimit: number | null }[], engs: { id: string; stageKey: string }[]) {
  const now = Math.floor(Date.now() / 1000);
  stages.forEach((s, i) => mockD1.tables.pipeline_stages.push({ id: `st-${i}`, key: s.key, name: s.key, sequence: i, wip_limit: s.wipLimit, created_at: now }));
  engs.forEach((e, i) => mockD1.tables.engagements.push({
    id: e.id, client_id: 'OP-2026-1001', division: 'study-abroad', title: 'Eng', stage_key: e.stageKey, outstanding_balance: 0, status: 'active', created_at: now, updated_at: now,
  }));
}

describe('Pipeline kanban invariants (F1 WIP enforcement, F2 stage integrity)', () => {
  beforeEach(() => { mockD1 = new MockD1Database(); });

  const env = () => ({ DB: mockD1, BETTER_AUTH_SECRET: 's' });
  const COUNS = { 'Content-Type': 'application/json', cookie: 'better-auth.session_token=token-manager' };
  const move = (cardId: string, sourceStage: string, targetStage: string) =>
    app.request('/api/kanban/board/move', { method: 'POST', headers: COUNS, body: JSON.stringify({ cardId, sourceStage, targetStage }) }, env());

  it('F1: moving into a saturated stage returns 409 wip_limit and does NOT move', async () => {
    seedPipeline([{ key: 'lead', wipLimit: null }, { key: 'qualified', wipLimit: 1 }], [
      { id: 'eng-1', stageKey: 'lead' },   // mover
      { id: 'eng-2', stageKey: 'qualified' }, // occupies the single slot
    ]);
    const res = await move('eng-1', 'lead', 'qualified');
    expect(res.status).toBe(409);
    expect((await res.json() as any).code).toBe('wip_limit');
    expect(mockD1.tables.engagements.find((x: any) => x.id === 'eng-1').stage_key).toBe('lead'); // unchanged
  });

  it('F1: move allowed within the limit (WIP 2, one slot free)', async () => {
    seedPipeline([{ key: 'lead', wipLimit: null }, { key: 'qualified', wipLimit: 2 }], [
      { id: 'eng-1', stageKey: 'lead' },
      { id: 'eng-2', stageKey: 'qualified' },
    ]);
    const res = await move('eng-1', 'lead', 'qualified');
    expect(res.status).toBe(200);
    expect(mockD1.tables.engagements.find((x: any) => x.id === 'eng-1').stage_key).toBe('qualified');
  });

  it('F2: forged source stage returns 409 stage_mismatch (no invalid moves)', async () => {
    seedPipeline([{ key: 'lead', wipLimit: null }, { key: 'complete', wipLimit: null }], [{ id: 'eng-1', stageKey: 'lead' }]);
    const res = await move('eng-1', 'qualified', 'complete'); // card is actually at 'lead'
    expect(res.status).toBe(409);
    expect((await res.json() as any).code).toBe('stage_mismatch');
    expect(mockD1.tables.engagements.find((x: any) => x.id === 'eng-1').stage_key).toBe('lead');
  });

  it('F2: unknown target stage rejected (404) before any state change', async () => {
    seedPipeline([{ key: 'lead', wipLimit: null }], [{ id: 'eng-1', stageKey: 'lead' }]);
    const res = await move('eng-1', 'lead', 'bogus-stage');
    expect([404, 400]).toContain(res.status);
    expect(mockD1.tables.engagements.find((x: any) => x.id === 'eng-1').stage_key).toBe('lead');
  });

  it('legit move still works end-to-end and is audited', async () => {
    seedPipeline([{ key: 'lead', wipLimit: null }, { key: 'documents', wipLimit: null }], [{ id: 'eng-1', stageKey: 'lead' }]);
    const res = await move('eng-1', 'lead', 'documents');
    expect(res.status).toBe(200);
    expect(mockD1.tables.engagements.find((x: any) => x.id === 'eng-1').stage_key).toBe('documents');
    expect(mockD1.tables.audit_log.some((a: any) => String(a.action || '').includes('STAGE_CHANGE'))).toBe(true);
  });
});
