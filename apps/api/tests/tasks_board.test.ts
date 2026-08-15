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

describe('Task Boards (internal kanban over the OS task engine)', () => {
  beforeEach(() => {
    mockD1 = new MockD1Database();
  });

  const env = () => ({ DB: mockD1, BETTER_AUTH_SECRET: 's' });
  const COUNS = { 'Content-Type': 'application/json', cookie: 'better-auth.session_token=token-counselor' };

  it('list returns rows with assignee names resolved for the board', async () => {
    const now = Math.floor(Date.now() / 1000);
    mockD1.tables.users.push({ id: 'u-coun', name: 'Counselor', email: 'c@t.com', emailVerified: 1, image: null, passwordHash: 'x', twoFactorEnabled: 0, userDivisions: '[]', role: 'counselor', created_at: 1, updated_at: 1 });
    mockD1.tables.tasks.push({ id: 't1', client_id: null, engagement_id: null, assignee_id: 'u-coun', title: 'Follow up', description: null, priority: 'high', status: 'open', due_date: now + 86400, recurrence: 'none', created_at: now, updated_at: now, completed_at: null });

    const res = await app.request('/api/tasks', { headers: COUNS }, env());
    const d = await res.json() as any;
    expect(d.tasks[0].assigneeName).toBe('Counselor');
    expect(d.tasks[0].title).toBe('Follow up');
  });

  it('drag = PATCH status moves the card between columns', async () => {
    const now = Math.floor(Date.now() / 1000);
    mockD1.tables.tasks.push({ id: 't2', client_id: null, engagement_id: null, assignee_id: null, title: 'Go live checklist', description: null, priority: 'medium', status: 'open', due_date: null, recurrence: 'none', created_at: now, updated_at: now, completed_at: null });

    const move = await app.request('/api/tasks/t2', { method: 'PATCH', headers: COUNS, body: JSON.stringify({ status: 'in_progress' }) }, env());
    expect(move.status).toBe(200);
    const row = mockD1.tables.tasks.find((x: any) => x.id === 't2');
    expect(row.status).toBe('in_progress');
  });

  it('create task from the board form (title + priority + assignee)', async () => {
    const res = await app.request('/api/tasks', {
      method: 'POST', headers: COUNS,
      body: JSON.stringify({ title: 'Call the university', priority: 'urgent', assigneeId: 'u-coun' }),
    }, env());
    expect(res.status).toBe(200);
    const created = mockD1.tables.tasks.find((x: any) => x.title === 'Call the university');
    expect(created).toBeTruthy();
    expect(created.priority).toBe('urgent');
    expect(created.assignee_id).toBe('u-coun');
    // assignment notification logged (task channel)
    expect(mockD1.tables.notifications.some((n: any) => n.channel === 'task' && n.to === 'u-coun')).toBe(true);
  });

  it('staff-directory powers the picker and the workspace count', async () => {
    const now = Math.floor(Date.now() / 1000);
    mockD1.tables.users.push(
      { id: 'u-coun', name: 'Counselor', email: 'c@t.com', emailVerified: 1, image: null, passwordHash: 'x', twoFactorEnabled: 0, userDivisions: '[]', role: 'counselor', created_at: 1, updated_at: 1 },
      { id: 'u-recep', name: 'Reception', email: 'r@t.com', emailVerified: 1, image: null, passwordHash: 'x', twoFactorEnabled: 0, userDivisions: '[]', role: 'receptionist', created_at: 1, updated_at: 1 },
      { id: 'admin-1', name: 'Owner', email: 'o@t.com', emailVerified: 1, image: null, passwordHash: 'x', twoFactorEnabled: 0, userDivisions: '[]', role: 'super_admin', created_at: 1, updated_at: 1 },
    );
    const res = await app.request('/api/tasks/staff-directory', { headers: COUNS }, env());
    const d = await res.json() as any;
    // all staff visible to a counselor for assignment; owner shown to self only
    expect(d.staff.some((s: any) => s.id === 'u-recep')).toBe(true);
    expect(d.total).toBeGreaterThanOrEqual(2);
  });

  it('invalid board move (bad status) is rejected', async () => {
    mockD1.tables.tasks.push({ id: 't3', client_id: null, engagement_id: null, assignee_id: null, title: 'X', description: null, priority: 'low', status: 'open', due_date: null, recurrence: 'none', created_at: 1, updated_at: 1, completed_at: null });
    const res = await app.request('/api/tasks/t3', { method: 'PATCH', headers: COUNS, body: JSON.stringify({ status: 'sideways' }) }, env());
    expect(res.status).toBe(400);
  });
});