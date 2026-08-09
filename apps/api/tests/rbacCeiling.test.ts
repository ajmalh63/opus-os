import { describe, it, expect, beforeAll, vi } from 'vitest';

vi.mock('../src/auth.js', () => ({
  getAuth: () => ({
    api: {
      getSession: async ({ headers }: any) => {
        const c = typeof headers?.get === 'function' ? (headers.get('cookie') || '') : '';
        const m = c.match(/better-auth\.session_token=([^;]+)/);
        return m ? { user: { id: 'u-owner', role: 'super_admin', userDivisions: '[]' }, session: {} } : null;
      },
    },
  }),
}));

import app from '../src/index.js';
import { MockD1Database } from './mockDb.js';

describe('RBAC ceiling (owner-only permissions never grantable via roles API)', () => {
  let mockD1: MockD1Database;
  beforeAll(() => { mockD1 = new MockD1Database(); });
  const ownerCookie = { cookie: 'better-auth.session_token=token-owner' };

  it('role creation silently filters owner-only permission codes', async () => {
    const res = await app.request('/api/admin/rbac/roles', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...ownerCookie },
      body: JSON.stringify({ name: 'Escalated Ops', code: 'ops_escalated', permissions: ['clients:read', 'rbac:manage', 'audit:export', 'settings:edit'] }),
    }, { DB: mockD1, BETTER_AUTH_SECRET: 's' });
    expect(res.status).toBe(200);
    const j = await res.json() as any;
    expect(j.filtered).toBe(3); // rbac:manage + audit:export + settings:edit all dropped
    const row = (mockD1.tables.roles as any[]).find((r) => r.code === 'ops_escalated');
    expect(JSON.parse(row.permissions_json)).toEqual(['clients:read']);
  });

  it('unknown permission codes are also filtered (only seed codes accepted)', async () => {
    const res = await app.request('/api/admin/rbac/roles', {
      method: 'POST', headers: { 'Content-Type': 'application/json', ...ownerCookie },
      body: JSON.stringify({ name: 'Ghost', code: 'ghost_role', permissions: ['clients:read', 'does:not:exist'] }),
    }, { DB: mockD1, BETTER_AUTH_SECRET: 's' });
    expect(res.status).toBe(200);
    const j = await res.json() as any;
    expect(j.filtered).toBe(1);
  });
});