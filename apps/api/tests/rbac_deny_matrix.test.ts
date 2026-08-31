/**
 * P1-2: RBAC deny-by-default matrix (OWASP A01:2021 — Broken Access Control).
 *
 * Methodology (Burp "Authorize" extension semantics, adapted to vitest):
 * replay each privileged request under three auth contexts — super_admin
 * (allow), counselor (vertical-deny), unauthenticated (authn-deny) — and
 * assert the response DIFFERS: authorized gets 2xx, everyone else gets 401/403.
 * Any 2xx leaking to a lower context = broken function-level authorization.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import app from '../src/index.js';
import { MockD1Database } from './mockDb.js';

vi.mock('../src/auth.js', () => {
  return {
    getAuth: (env: any) => {
      return {
        api: {
          getSession: async (options: any) => {
            const cookieHeader = options?.headers?.get('cookie') || '';
            const match = cookieHeader.match(/better-auth\.session_token=([^;]+)/);
            const token = match ? match[1] : null;
            if (token === 'token-admin') {
              return {
                user: {
                  id: 'admin-1', name: 'Admin', email: 'admin@test.com', role: 'super_admin',
                  userDivisions: JSON.stringify(['study-abroad', 'visa', 'umrah', 'attestation', 'manpower']),
                },
                session: { id: 'session-admin', token, userId: 'admin-1' },
              };
            }
            if (token === 'token-counselor') {
              return {
                user: {
                  id: 'counselor-1', name: 'Counselor', email: 'c@test.com', role: 'counselor',
                  userDivisions: JSON.stringify(['study-abroad']),
                },
                session: { id: 'session-counselor', token, userId: 'counselor-1' },
              };
            }
            return null;
          },
        },
      };
    },
  };
});

// Privileged endpoints: super_admin ONLY — any lower role must be denied outright.
const ADMIN_ONLY_ENDPOINTS: Array<[string, string]> = [
  ['GET', '/api/admin/audit-logs'],
  ['GET', '/api/admin/api-keys'],
];

// Staff endpoints: counselor may reach them but ONLY with row-level scoping
// (the access-control matrix "Scoped" column — 200 with filtered rows, by design).
const STAFF_SCOPED_ENDPOINTS: Array<[string, string]> = [
  ['GET', '/api/clients'],
];

describe('P1-2 RBAC deny matrix (deny-by-default, OWASP A01)', () => {
  let mockD1: MockD1Database;

  beforeAll(() => {
    mockD1 = new MockD1Database();
    mockD1.tables.clients.push({ id: 'OP-IN-SCOPE', portal_token: 'OP-IN-SCOPE', name: 'InScope', email: 'in@x.com', created_at: 0, updated_at: 0 } as any);
    mockD1.tables.clients.push({ id: 'OP-OUT-SCOPE', portal_token: 'OP-OUT-SCOPE', name: 'OutScope', email: 'out@x.com', created_at: 0, updated_at: 0 } as any);
    // Counselor's userDivisions = ["study-abroad"] → engagement row grants visibility.
    mockD1.tables.engagements.push({ id: 'eng-1', clientId: 'OP-IN-SCOPE', division: 'study-abroad', created_at: 0, updated_at: 0 } as any);
    mockD1.tables.engagements.push({ id: 'eng-2', clientId: 'OP-OUT-SCOPE', division: 'manpower', created_at: 0, updated_at: 0 } as any);
  });

  const request = (method: string, path: string, token?: string) =>
    app.request(
      path,
      { method, headers: token ? { cookie: `better-auth.session_token=${token}` } : {} },
      { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' } as any,
    );

  it.each(ADMIN_ONLY_ENDPOINTS)('%s %s → admin allowed', async (method, path) => {
    const res = await request(method, path, 'token-admin');
    expect(res.status).toBe(200);
  });

  it.each(ADMIN_ONLY_ENDPOINTS)('%s %s → counselor vertically denied (401/403, never 2xx)', async (method, path) => {
    const res = await request(method, path, 'token-counselor');
    expect([401, 403]).toContain(res.status);
  });

  it.each(ADMIN_ONLY_ENDPOINTS)('%s %s → unauthenticated denied (401/403, never 2xx)', async (method, path) => {
    const res = await request(method, path);
    expect([401, 403]).toContain(res.status);
  });

  it.each(STAFF_SCOPED_ENDPOINTS)('%s %s → counselor allowed but division-scoped (row-level authz)', async (method, path) => {
    const res = await request(method, path, 'token-counselor');
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    // Counselor's division is "study-abroad"; only clients engaged in that
    // division may appear. (Engagements seeded below: one in-division, one out.)
    const ids = (data.clients || []).map((cl: any) => cl.id);
    expect(ids).toContain('OP-IN-SCOPE');
    expect(ids).not.toContain('OP-OUT-SCOPE');
  });

  it('client portal routes reject forged portal tokens (horizontal deny)', async () => {
    const res = await request('GET', '/api/public/portal/manpower/applications?token=FORGED-TOKEN');
    expect([200, 401, 403]).toContain(res.status); // 200 with EMPTY applications is the designed behavior
    if (res.status === 200) {
      const data = await res.json() as any;
      expect(data.applications || []).toEqual([]);
    }
  });
});
