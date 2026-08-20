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

            if (token === 'token-visa-only') {
              return {
                user: {
                  id: "counselor-visa-only",
                  name: "Visa Counselor",
                  email: "visa@test.com",
                  role: "counselor",
                  userDivisions: JSON.stringify(["visa"])
                },
                session: {
                  id: "session-visa",
                  token,
                  userId: "counselor-visa-only"
                }
              };
            }
            if (token === 'token-manager') {
              return {
                user: {
                  id: "user-manager-1",
                  name: "Manager One",
                  email: "manager@test.com",
                  role: "manager",
                  userDivisions: JSON.stringify([])
                },
                session: {
                  id: "session-manager",
                  token,
                  userId: "user-manager-1"
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


describe('Better Auth & RBAC Security Integration Tests', () => {
  let mockD1: MockD1Database;

  beforeAll(() => {
    mockD1 = new MockD1Database();

    // Seed mock clients and engagements for division checking
    mockD1.tables.clients.push({
      id: "OP-2026-1001",
      portal_token: "OP-2026-1001",
      name: "Client One",
      phone: "+91 99999 99999",
      email: "client1@example.com",
      created_at: 0,
      updated_at: 0
    });

    mockD1.tables.engagements.push({
      id: "eng-101",
      client_id: "OP-2026-1001",
      division: "study-abroad",
      title: "Study Abroad Engagement",
      stage_key: "lead",
      outstanding_balance: 0,
      status: "active",
      created_at: 0,
      updated_at: 0
    });

    // Seed a counselor that only has visa access (study-abroad is restricted)
    mockD1.tables.users.push({
      id: "counselor-visa-only",
      name: "Visa Counselor",
      email: "visa@test.com",
      email_verified: 1,
      role: "counselor",
      user_divisions: JSON.stringify(["visa"]), // NO "study-abroad" access
      created_at: 0,
      updated_at: 0
    });

    mockD1.tables.sessions.push({
      id: "session-visa-only",
      user_id: "counselor-visa-only",
      token: "token-visa-only",
      expires_at: (Math.floor(Date.now() / 1000) + 3600) * 1000,
      ip_address: "127.0.0.1",
      user_agent: "test-agent",
      created_at: 0,
      updated_at: 0
    });

    // Seed a manager (who has global access and bypasses division checks)
    mockD1.tables.users.push({
      id: "user-manager-1",
      name: "Manager One",
      email: "manager@test.com",
      email_verified: 1,
      role: "manager",
      user_divisions: JSON.stringify([]),
      created_at: 0,
      updated_at: 0
    });

    mockD1.tables.sessions.push({
      id: "session-manager",
      user_id: "user-manager-1",
      token: "token-manager",
      expires_at: (Math.floor(Date.now() / 1000) + 3600) * 1000,
      ip_address: "127.0.0.1",
      user_agent: "test-agent",
      created_at: 0,
      updated_at: 0
    });
  });

  it('GET /api/clients/:id should return 401 Unauthorized for request with no token', async () => {
    const res = await app.request('/api/clients/OP-2026-1001', {}, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    expect(res.status).toBe(401);
    const data = await res.json() as any;
    expect(data.error).toContain('Unauthorized');
  });

  it('GET /api/clients/:id should return 403 Forbidden for counselor accessing client of restricted division', async () => {
    const res = await app.request('/api/clients/OP-2026-1001', {
      headers: {
        'Cookie': 'better-auth.session_token=token-visa-only'
      }
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    expect(res.status).toBe(403);
    const data = await res.json() as any;
    expect(data.error).toContain('Forbidden');
  });

  it('GET /api/clients/:id should return 200 for manager who bypasses division bounds', async () => {
    const res = await app.request('/api/clients/OP-2026-1001', {
      headers: {
        'Cookie': 'better-auth.session_token=token-manager'
      }
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    expect(res.status).toBe(200);
  });
});
