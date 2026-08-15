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
          'token-counselor': { id: 'u-coun', name: 'Counselor', email: 'c@t.com', role: 'counselor', userDivisions: JSON.stringify([]) },
        };
        const u = users[token || ''];
        return u ? { user: u, session: { id: 's', token, userId: u.id } } : null;
      }
    }
  })
}));

let mockD1: MockD1Database;

function seedTask(id: string, over: Record<string, any> = {}) {
  const now = Math.floor(Date.now() / 1000);
  mockD1.tables.tasks.push({
    id, client_id: null, engagement_id: null, assignee_id: null, title: id, description: null,
    priority: 'medium', status: 'open', due_date: null, recurrence: 'none', created_at: now, updated_at: now, completed_at: null,
    cos: 'standard', blocked_reason: null, in_progress_at: null, ...over,
  });
}

describe('Kanban system (flow truth + WIP enforcement + prefs)', () => {
  beforeEach(() => { mockD1 = new MockD1Database(); });

  const env = () => ({ DB: mockD1, BETTER_AUTH_SECRET: 's' });
  const COUNS = { 'Content-Type': 'application/json', cookie: 'better-auth.session_token=token-counselor' };
  const MGR = { 'Content-Type': 'application/json', cookie: 'better-auth.session_token=token-manager' };

  it('board GET returns tasks names, staff total, defaults, and flow metrics', async () => {
    const now = Math.floor(Date.now() / 1000);
    mockD1.tables.users.push({ id: 'u-coun', name: 'Counselor', email: 'c@t.com', emailVerified: 1, image: null, passwordHash: 'x', twoFactorEnabled: 0, userDivisions: '[]', role: 'counselor', created_at: 1, updated_at: 1 });
    seedTask('t-done', { status: 'done', cos: 'standard', created_at: now - 200000, in_progress_at: now - 190000, completed_at: now - 3600, assignee_id: 'u-coun' });
    seedTask('t-open', { status: 'open' });

    const res = await app.request('/api/tasks/board', { headers: COUNS }, env());
    const d = await res.json() as any;
    expect(d.tasks.length).toBe(2);
    expect(d.staffTotal).toBeGreaterThanOrEqual(1);
    expect(d.prefs.columnLimitInProgress).toBe(6);
    expect(d.metrics.throughput7d).toBe(1);
    expect(d.metrics.cycleHours.p50).toBeGreaterThan(0); // 52h cycle from in_progress_at
    expect(d.metrics.wip.inProgress).toBe(0);
  });

  it('first move to in_progress stamps in_progress_at (cycle time root); re-moves do not reset', async () => {
    seedTask('t-cyc', {});
    await app.request('/api/tasks/t-cyc', { method: 'PATCH', headers: COUNS, body: JSON.stringify({ status: 'in_progress' }) }, env());
    let row: any = mockD1.tables.tasks.find((x: any) => x.id === 't-cyc');
    const stamped = row.in_progress_at;
    expect(stamped).toBeTypeOf('number');
    await app.request('/api/tasks/t-cyc', { method: 'PATCH', headers: COUNS, body: JSON.stringify({ status: 'open' }) }, env());
    await app.request('/api/tasks/t-cyc', { method: 'PATCH', headers: COUNS, body: JSON.stringify({ status: 'in_progress' }) }, env());
    row = mockD1.tables.tasks.find((x: any) => x.id === 't-cyc');
    expect(row.in_progress_at).toBe(stamped); // one-shot
  });

  it('WIP hard cap: 409 when the in-progress column is saturated (except expedite)', async () => {
    // lower the cap via manager prefs
    await app.request('/api/tasks/board/prefs', { method: 'PATCH', headers: MGR, body: JSON.stringify({ columnLimitInProgress: 1 }) }, env());
    seedTask('t-w1', { status: 'in_progress', cos: 'standard' });
    seedTask('t-w2', {});

    const blocked = await app.request('/api/tasks/t-w2', { method: 'PATCH', headers: COUNS, body: JSON.stringify({ status: 'in_progress' }) }, env());
    expect(blocked.status).toBe(409);
    expect((await blocked.json() as any).code).toBe('wip_limit');

    // expedite bypasses the column cap (class-of-service override)
    seedTask('t-exp', { cos: 'expedite' });
    const ok = await app.request('/api/tasks/t-exp', { method: 'PATCH', headers: COUNS, body: JSON.stringify({ status: 'in_progress' }) }, env());
    expect(ok.status).toBe(200);
  });

  it('person soft-cap returns a warning, not a block', async () => {
    await app.request('/api/tasks/board/prefs', { method: 'PATCH', headers: MGR, body: JSON.stringify({ personLimitInProgress: 1 }) }, env());
    seedTask('t-p1', { status: 'in_progress', assignee_id: 'u-coun' });
    seedTask('t-p2', { assignee_id: 'u-coun' });
    const res = await app.request('/api/tasks/t-p2', { method: 'PATCH', headers: COUNS, body: JSON.stringify({ status: 'in_progress' }) }, env());
    expect(res.status).toBe(200);
    expect((await res.json() as any).warning).toContain('watch');
  });

  it('blocked flag persists and surfaces in the metrics strip', async () => {
    seedTask('t-bl', { status: 'in_progress', assignee_id: 'u-coun' });
    await app.request('/api/tasks/t-bl', { method: 'PATCH', headers: COUNS, body: JSON.stringify({ blockedReason: 'waiting on university reply' }) }, env());
    const d = await (await app.request('/api/tasks/board', { headers: COUNS }, env())).json() as any;
    expect(d.tasks.find((t: any) => t.id === 't-bl').blockedReason).toBe('waiting on university reply');
    expect(d.metrics.blocked.length).toBe(1);
    expect(d.metrics.blocked[0].reason).toContain('university');
  });

  it('prefs PATCH: manager+ only, coerced limits, audited', async () => {
    const res = await app.request('/api/tasks/board/prefs', { method: 'PATCH', headers: MGR, body: JSON.stringify({ columnLimitInProgress: 99, expediteLimit: 0, policyText: 'Definition of Done: verified and archived.' }) }, env());
    expect(res.status).toBe(200);
    const d = await res.json() as any;
    expect(d.prefs.columnLimitInProgress).toBe(20); // clamped
    expect(d.prefs.expediteLimit).toBe(1); // clamped to min 1
    expect(d.prefs.policyText).toContain('Definition of Done');
    expect(mockD1.tables.audit_log.some((a: any) => String(a.action || '').includes('BOARD_PREFS_UPDATED'))).toBe(true);

    const denied = await app.request('/api/tasks/board/prefs', { method: 'PATCH', headers: COUNS, body: JSON.stringify({ columnLimitInProgress: 2 }) }, env());
    expect(denied.status).toBe(403);
  });
});