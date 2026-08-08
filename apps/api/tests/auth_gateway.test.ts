import { describe, it, expect, beforeAll, vi } from 'vitest';
import app from '../src/index.js';
import { MockD1Database } from './mockDb.js';
import { seedSuperAdmin } from '../src/db/seed.js';
import { getDb } from '../src/db/client.js';

vi.mock('../src/auth.js', () => {
  return {
    getAuth: (env: any) => ({
      api: {
        getSession: async (options: any) => {
          const cookieHeader = options?.headers?.get('cookie') || '';
          const token = (cookieHeader.match(/better-auth\.session_token=([^;]+)/) || [])[1] || null;
          if (token === 'token-admin') {
            return {
              user: { id: 'u-admin', name: 'Owner', email: 'owner@test.com', role: 'super_admin', userDivisions: JSON.stringify([]), twoFactorEnabled: false, emailVerified: true },
              session: { id: 's-1', token, userId: 'u-admin' },
            };
          }
          return null;
        },
      },
    }),
  };
});

describe('Auth gateway (email+password / OTP / 2FA-ready)', () => {
  let mockD1: MockD1Database;

  beforeAll(() => {
    mockD1 = new MockD1Database();
  });

  it('seedSuperAdmin creates an owner with a verifiable password hash (idempotent)', async () => {
    const first = await seedSuperAdmin(getDb(mockD1 as any), 'OWNER@test.com', 'StrongPass123!');
    expect(first.created).toBe(true);

    const row = mockD1.tables.users.find((u: any) => u.email === 'OWNER@test.com');
    expect(row).toBeTruthy();
    expect(row.role).toBe('super_admin');
    expect([1, true]).toContain(row.email_verified);
    expect(row.password_hash).toBeTruthy();
    expect(row.password_hash).not.toContain('StrongPass123!');
    expect(row.password_hash.length).toBeGreaterThan(30); // scrypt hash, not plaintext
    expect(row.password_hash).not.toBe('StrongPass123!');

    const second = await seedSuperAdmin(getDb(mockD1 as any), 'owner@test.com', 'Other123!');
    expect(second.created).toBe(false);
  });

  it('GET /api/auth/me returns the session shape for an authenticated user', async () => {
    const res = await app.request('/api/auth/me', {
      headers: { Cookie: 'better-auth.session_token=token-admin' },
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.authenticated).toBe(true);
    expect(data.role).toBe('super_admin');
    expect(data.emailVerified).toBe(true);
  });

  it('GET /api/auth/me is null-safe for anonymous visitors', async () => {
    const res = await app.request('/api/auth/me', {}, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.authenticated).toBeNull();
  });

  it('bootstrap-admin refuses without env creds and 409s when an owner exists', async () => {
    const noCreds = await app.request('/api/auth/bootstrap-admin', { method: 'POST' }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(noCreds.status).toBe(400);

    const conflict = await app.request('/api/auth/bootstrap-admin', { method: 'POST' }, {
      DB: mockD1, BETTER_AUTH_SECRET: 'x', ADMIN_EMAIL: 'OWNER@test.com', ADMIN_PASSWORD: 'Passw123!',
    });
    expect(conflict.status).toBe(409);
  });
});