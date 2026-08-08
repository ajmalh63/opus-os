import { describe, it, expect, beforeAll, vi } from 'vitest';
import app from '../src/index.js';
import { MockD1Database } from './mockDb.js';

vi.mock('../src/auth.js', () => {
  return {
    getAuth: (env: any) => {
      return {
        api: {
          signUpEmail: async () => ({ user: { id: "staff-new-uuid" } }),
          getSession: async (options: any) => {
            const cookieHeader = options?.headers?.get('cookie') || '';
            const match = cookieHeader.match(/better-auth\.session_token=([^;]+)/);
            const token = match ? match[1] : null;

            if (token === 'token-admin') {
              return {
                user: {
                  id: "admin-1",
                  name: "Admin User",
                  email: "admin@test.com",
                  role: "super_admin",
                  userDivisions: JSON.stringify(["study-abroad", "visa", "umrah", "attestation", "manpower"])
                },
                session: {
                  id: "session-admin",
                  token,
                  userId: "admin-1"
                }
              };
            }
            if (token === 'token-counselor') {
              return {
                user: {
                  id: "counselor-1",
                  name: "Counselor One",
                  email: "counselor@test.com",
                  role: "counselor",
                  userDivisions: JSON.stringify(["study-abroad"])
                },
                session: {
                  id: "session-counselor",
                  token,
                  userId: "counselor-1"
                }
              };
            }
            return null;
          }
        }
      };
    }
  };
});

describe('Super User Administration & Staff Management Tests', () => {
  let mockD1: MockD1Database;

  beforeAll(() => {
    mockD1 = new MockD1Database();

    // Seed mock admin user
    mockD1.tables.users.push({
      id: "admin-1",
      name: "Admin User",
      email: "admin@test.com",
      email_verified: 1,
      role: "super_admin",
      user_divisions: JSON.stringify(["study-abroad", "visa", "umrah", "attestation", "manpower"]),
      created_at: 0,
      updated_at: 0
    });

    // Seed mock audit log entry
    mockD1.tables.audit_log.push({
      id: "log-1",
      actor_id: "admin-1",
      action: "BALANCE_OVERRIDE",
      entity_table: "engagements",
      entity_id: "eng-1",
      details: "Adjusted to 260000 paise",
      ip_address: "127.0.0.1",
      created_at: 0
    });
  });

  it('GET /api/admin/audit-logs should return 401 Unauthorized without session token', async () => {
    const res = await app.request('/api/admin/audit-logs', {}, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    expect(res.status).toBe(401);
  });

  it('GET /api/admin/audit-logs should return 403 Forbidden for counselor role (non-owner ceiling)', async () => {
    const res = await app.request('/api/admin/audit-logs', {
      headers: {
        'Cookie': 'better-auth.session_token=token-counselor'
      }
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    expect(res.status).toBe(403);
  });

  it('GET /api/admin/audit-logs should fetch audit logs for super_admin role', async () => {
    const res = await app.request('/api/admin/audit-logs', {
      headers: {
        'Cookie': 'better-auth.session_token=token-admin'
      }
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.logs.length).toBeGreaterThan(0);
    expect(data.logs[0].action).toBe("BALANCE_OVERRIDE");
  });

  it('POST /api/admin/register-staff should register employee with scopes under super_admin permissions', async () => {
    const res = await app.request('/api/admin/register-staff', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': 'better-auth.session_token=token-admin'
      },
      body: JSON.stringify({
        name: "New Counselor",
        email: "new.counselor@test.com",
        role: "counselor",
        userDivisions: ["visa", "manpower"]
      })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);
    expect(data.id).toBeDefined();
    // No password supplied → route issues a one-time temporary password
    expect(data.temporaryPassword).toBeDefined();
    expect(data.temporaryPassword.length).toBeGreaterThanOrEqual(8);
  });

  it('POST /api/admin/staff/:id/scope should update staff division scopes', async () => {
    // Seed staff user
    const staffId = "staff-new-123";
    mockD1.tables.users.push({
      id: staffId,
      name: "Staff Scope Test",
      email: "scope.test@test.com",
      role: "coordinator",
      user_divisions: JSON.stringify(["visa"]),
      created_at: 0,
      updated_at: 0
    });

    const res = await app.request(`/api/admin/staff/${staffId}/scope`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': 'better-auth.session_token=token-admin'
      },
      body: JSON.stringify({
        userDivisions: ["visa", "attestation", "study-abroad"]
      })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });

    expect(res.status).toBe(200);

    const user = mockD1.tables.users.find(u => u.id === staffId);
    expect(user).toBeDefined();
    const scopes = JSON.parse(user.user_divisions);
    expect(scopes).toContain("attestation");
    expect(scopes).toContain("study-abroad");
  });
});
