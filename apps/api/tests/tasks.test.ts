import { describe, it, expect, beforeEach, vi } from 'vitest';
import app from '../src/index.js';
import { MockD1Database } from './mockDb.js';

vi.mock('../src/auth.js', () => ({
  getAuth: () => ({
    api: {
      getSession: async (options: any) => {
        const cookie = options?.headers?.get('cookie') || '';
        const match = cookie.match(/better-auth\.session_token=([^;]+)/);
        const token = match ? match[1] : null;
        if (token === 'token-counselor') {
          return {
            user: { id: "counselor-1", email: "counselor@test.com", role: "counselor", userDivisions: '["study-abroad"]' },
            session: { id: "s", token, userId: "counselor-1" }
          };
        }
        if (token === 'token-admin') {
          return {
            user: { id: "admin-1", email: "admin@test.com", role: "super_admin", userDivisions: '[]' },
            session: { id: "s", token, userId: "admin-1" }
          };
        }
        return null;
      }
    }
  })
}));

describe('Staff Tasks Module (Section 8.2)', () => {
  let mockD1: MockD1Database;

  beforeEach(() => {
    mockD1 = new MockD1Database();
  });

  it('POST /api/tasks rejects unauthenticated requests', async () => {
    const res = await app.request('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: "Review LORs" })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    expect(res.status).toBe(401);
  });

  it('POST /api/tasks creates a task (counselor)', async () => {
    const res = await app.request('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': 'better-auth.session_token=token-counselor' },
      body: JSON.stringify({
        clientId: "OP-2026-1001",
        title: "Verify LORs before submission",
        priority: "high",
        dueDate: Math.floor(Date.now() / 1000) + 86400
      })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);
    expect(mockD1.tables.tasks.length).toBe(1);
  });

  it('GET /api/tasks/client/:id returns only that client\'s tasks', async () => {
    await app.request('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': 'better-auth.session_token=token-counselor' },
      body: JSON.stringify({ clientId: "OP-2026-1001", title: "Task A" })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    await app.request('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': 'better-auth.session_token=token-counselor' },
      body: JSON.stringify({ clientId: "OP-2026-1002", title: "Task B" })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });

    const res = await app.request('/api/tasks/client/OP-2026-1001', {
      headers: { 'Cookie': 'better-auth.session_token=token-counselor' }
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.tasks.length).toBe(1);
    expect(data.tasks[0].clientId).toBe('OP-2026-1001');
  });

  it('PATCH /api/tasks/:id marks done', async () => {
    // create a task then patch it
    const created = await app.request('/api/tasks', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': 'better-auth.session_token=token-counselor' },
      body: JSON.stringify({ clientId: "OP-2026-1001", title: "To be completed" })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    const createdData = await created.json() as any;
    const t = mockD1.tables.tasks.find(x => x.id === createdData.id);

    const res = await app.request(`/api/tasks/${t.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Cookie': 'better-auth.session_token=token-counselor' },
      body: JSON.stringify({ status: 'done' })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    expect(res.status).toBe(200);
    const updated = mockD1.tables.tasks.find(x => x.id === t.id);
    expect(updated.status).toBe('done');
    expect(updated.completed_at).toBeDefined();
  });

  it('GET /api/tasks/overdue returns only overdue open tasks', async () => {
    const overdueTask = {
      id: 'task-overdue-1', client_id: 'OP-2026-1001', engagement_id: null,
      assignee_id: 'counselor-1', title: 'Overdue reminder', description: null,
      priority: 'high', status: 'open', due_date: Math.floor(Date.now() / 1000) - 86400,
      recurrence: 'none', created_at: 0, updated_at: 0, completed_at: null
    };
    mockD1.tables.tasks.push(overdueTask);

    const res = await app.request('/api/tasks/overdue', {
      headers: { 'Cookie': 'better-auth.session_token=token-counselor' }
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.tasks.find((t: any) => t.id === 'task-overdue-1')).toBeDefined();
  });
});