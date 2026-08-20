import { describe, it, expect, beforeEach, vi } from 'vitest';
import app from '../src/index.js';
import { MockD1Database } from './mockDb.js';

// Mock Better Auth: sign-in handler that succeeds only with password 'right'.
// Email-based 2FA flag: admin2fa@test.com has 2FA enabled.
vi.mock('../src/auth.js', () => ({
  getAuth: () => ({
    api: {
      getSession: async (options: any) => {
        const cookie = options?.headers?.get('cookie') || '';
        const token = (cookie.match(/better-auth\.session_token=([^;]+)/) || [])[1] || null;
        if (token === 'token-admin') {
          return { user: { id: 'admin-1', email: 'admin@test.com', role: 'super_admin', userDivisions: '[]', twoFactorEnabled: true }, session: { id: 's', token, userId: 'admin-1' } };
        }
        return null;
      },
    },
    handler: async (request: Request) => {
      const url = new URL(request.url);
      if (url.pathname.endsWith('/sign-in/email')) {
        const body = await request.json().catch(() => ({})) as any;
        if (body.password === 'right') {
          const twoFactorEnabled = body.email === 'admin2fa@test.com';
          const role = body.email === 'staff@test.com' ? 'counselor' : 'super_admin';
          return new Response(JSON.stringify({
            user: { id: 'u-admin', email: body.email, role, twoFactorEnabled },
            token: 'tok-ok',
          }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return new Response(JSON.stringify({ message: 'Invalid email or password' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers: { 'Content-Type': 'application/json' } });
    },
  }),
}));

async function signIn(email: string, password: string, env: any) {
  return app.request('/api/auth/sign-in/email', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  }, env);
}

describe('Auth security hardening (lockout, audits, enforced 2FA — industry standards)', () => {
  let mockD1: MockD1Database;
  const ENV = () => ({ DB: mockD1, BETTER_AUTH_SECRET: 'x' });

  beforeEach(() => {
    mockD1 = new MockD1Database();
  });

  it('5 failed sign-ins → 6th attempt locked out (429 ACCOUNT_LOCKED) even with correct password', async () => {
    for (let i = 0; i < 5; i++) {
      const r = await signIn('owner@test.com', 'wrong', ENV());
      expect(r.status).toBe(401);
    }
    const locked = await signIn('owner@test.com', 'right', ENV());
    expect(locked.status).toBe(429);
    const j = await locked.json() as any;
    expect(j.code).toBe('ACCOUNT_LOCKED');
  });

  it('failed sign-ins write bounded LOGIN_FAILED audits (category auth, result error)', async () => {
    for (let i = 0; i < 3; i++) await signIn('owner@test.com', 'wrong', ENV());
    const rows = (mockD1.tables.audit_log as any[]).filter((l: any) => l.action === 'LOGIN_FAILED');
    expect(rows.length).toBe(3);
    expect(rows[0].category).toBe('auth');
    expect(rows[0].result).toBe('error');
    expect(rows[0].entity_id).toBe('owner@test.com');
  });

  it('successful sign-in clears the failure counter (no lockout accumulation)', async () => {
    // 3 fails + success, repeated 4× — without clearing, the 5th fail would lock.
    for (let round = 0; round < 4; round++) {
      for (let i = 0; i < 3; i++) await signIn('owner@test.com', 'wrong', ENV());
      const ok = await signIn('owner@test.com', 'right', ENV());
      expect(ok.status).toBe(200);
    }
    const after = await signIn('owner@test.com', 'wrong', ENV());
    expect(after.status).toBe(401); // not locked — counter was cleared on each success
  });

  it('successful super_admin sign-in writes LOGIN_SUCCESS audit', async () => {
    const r = await signIn('owner@test.com', 'right', ENV());
    expect(r.status).toBe(200);
    const row = (mockD1.tables.audit_log as any[]).find((l: any) => l.action === 'LOGIN_SUCCESS');
    expect(row).toBeTruthy();
    expect(row.category).toBe('auth');
    expect(row.result).toBe('success');
    expect(JSON.parse(row.after_state).email).toBe('owner@test.com');
  });

  it('super_admin without 2FA gets twoFactorSetupRequired flag; with 2FA it is absent', async () => {
    const no2fa = await signIn('owner@test.com', 'right', ENV());
    const j1 = await no2fa.json() as any;
    expect(j1.twoFactorSetupRequired).toBe(true);

    const with2fa = await signIn('admin2fa@test.com', 'right', ENV());
    const j2 = await with2fa.json() as any;
    expect(j2.twoFactorSetupRequired).toBeUndefined();
  });

  it('non-super_admin sign-in never gets the 2FA flag', async () => {
    const r = await signIn('staff@test.com', 'right', ENV());
    expect(r.status).toBe(200);
    const j = await r.json() as any;
    expect(j.twoFactorSetupRequired).toBeUndefined();
    // No LOGIN_SUCCESS audit for non-super_admin (only super_admin logins are audited)
    const rows = (mockD1.tables.audit_log as any[]).filter((l: any) => l.action === 'LOGIN_SUCCESS');
    expect(rows.length).toBe(0);
  });
});