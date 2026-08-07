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
        if (token === 'token-counselor') {
          return { user: { id: "counselor-1", email: "counselor@test.com", role: "counselor", userDivisions: '["study-abroad"]' }, session: { id: "s", token, userId: "counselor-1" } };
        }
        return null;
      }
    }
  })
}));

describe('RBAC Suite - Role Builder (Section 33)', () => {
  let mockD1: MockD1Database;

  beforeEach(() => {
    mockD1 = new MockD1Database();
  });

  it('GET /api/admin/rbac/permissions requires super_admin', async () => {
    const unauth = await app.request('/api/admin/rbac/permissions', {}, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(unauth.status).toBe(401);

    const counselor = await app.request('/api/admin/rbac/permissions', {
      headers: { 'Cookie': 'better-auth.session_token=token-counselor' }
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(counselor.status).toBe(403); // authenticated but insufficient role

    const admin = await app.request('/api/admin/rbac/permissions', {
      headers: { 'Cookie': 'better-auth.session_token=token-admin' }
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(admin.status).toBe(200);
  });

  it('POST /api/admin/rbac/seed creates permission catalog + default roles idempotently', async () => {
    const res = await app.request('/api/admin/rbac/seed', {
      method: 'POST',
      headers: { 'Cookie': 'better-auth.session_token=token-admin' }
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(res.status).toBe(200);
    expect(mockD1.tables.permissions.length).toBeGreaterThan(10);
    expect(mockD1.tables.roles.length).toBe(5);
  });

  it('POST /api/admin/rbac/roles creates a custom role', async () => {
    const res = await app.request('/api/admin/rbac/roles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': 'better-auth.session_token=token-admin' },
      body: JSON.stringify({ name: 'Visa Specialist', code: 'visa_specialist', permissions: ['clients:read', 'kanban:view', 'documents:manage'] })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(res.status).toBe(200);
    expect(mockD1.tables.roles.some(r => r.code === 'visa_specialist')).toBe(true);
  });

  it('PUT /api/admin/rbac/roles/:id/permissions blocks owner-only grants on non-owner roles', async () => {
    mockD1.tables.roles.push({ id: 'r-counselor', name: 'Counselor', code: 'counselor', permissions_json: '[]', system: true, editable: false });
    const res = await app.request('/api/admin/rbac/roles/r-counselor/permissions', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', 'Cookie': 'better-auth.session_token=token-admin' },
      body: JSON.stringify({ permissions: ['clients:read', 'financials:view'] })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(res.status).toBe(403);
  });

  it('POST /api/admin/rbac/users/:id/roles assigns a role with division scope', async () => {
    mockD1.tables.roles.push({ id: 'r-counselor', name: 'Counselor', code: 'counselor', permissions_json: '[]', system: true, editable: false });
    mockD1.tables.users.push({ id: 'counselor-1', name: 'Counselor', email: 'counselor@test.com', role: 'counselor' } as any);
    const res = await app.request('/api/admin/rbac/users/counselor-1/roles', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': 'better-auth.session_token=token-admin' },
      body: JSON.stringify({ roleId: 'r-counselor', divisions: ['study-abroad', 'visa'], activeTo: 9999999999 })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(res.status).toBe(200);
    expect(mockD1.tables.user_roles.length).toBe(1);
    expect(mockD1.tables.user_roles[0].division_scope).toContain('visa');
  });
});