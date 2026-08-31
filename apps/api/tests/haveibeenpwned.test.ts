import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import app from '../src/index.js';
import { MockD1Database } from './mockDb.js';

// NOTE: this suite does NOT mock ../src/auth.js — it exercises the REAL
// better-auth instance (with the have-i-been-pwned plugin) so the HIBP
// password screening runs end-to-end. Global fetch is stubbed to simulate
// api.pwnedpasswords.com responses.

// 'password' → SHA-1 5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8
// prefix '5BAA6' is sent to HIBP; suffix '1E4C9B93F3F0682250B6CF8331B7EE68FD8'
// is compared locally.
const BREACHED_SUFFIX = '1E4C9B93F3F0682250B6CF8331B7EE68FD8';
const CLEAN_SUFFIX = 'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

function hibpResponse(lines: string[]) {
  return new Response(lines.join('\n'), { status: 200, headers: { 'Content-Type': 'text/plain' } });
}

describe('HaveIBeenPwned breached-password screening (NIST SP 800-63B)', () => {
  let mockD1: MockD1Database;
  const ENV = () => ({ DB: mockD1, BETTER_AUTH_SECRET: 'test-secret-123' });

  beforeEach(() => {
    mockD1 = new MockD1Database();
  });
  afterEach(() => vi.unstubAllGlobals());

  async function signUp(email: string, password: string) {
    return app.request('/api/auth/sign-up/email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test User', email, password }),
    }, ENV());
  }

  it('blocks a breached password at sign-up (400 PASSWORD_COMPROMISED)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(hibpResponse([`${BREACHED_SUFFIX}:100000`])));
    const res = await signUp('victim@test.com', 'password');
    expect(res.status).toBe(400);
    const j = await res.json() as any;
    expect(JSON.stringify(j).toLowerCase()).toContain('compromised');
    // No user row was created
    expect((mockD1.tables.users as any[]).some((u: any) => u.email === 'victim@test.com')).toBe(false);
  });

  it('allows a clean password at sign-up', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(hibpResponse([`${CLEAN_SUFFIX}:1`])));
    const res = await signUp('safe@test.com', 'Correct-Horse-Battery-Staple-2026');
    expect(res.status).toBe(200);
    expect((mockD1.tables.users as any[]).some((u: any) => u.email === 'safe@test.com')).toBe(true);
  });

  it('only the SHA-1 prefix leaves the server (k-anonymity)', async () => {
    const fetchMock = vi.fn().mockResolvedValue(hibpResponse([`${CLEAN_SUFFIX}:1`]));
    vi.stubGlobal('fetch', fetchMock);
    await signUp('privacy@test.com', 'SuperSecretPassphrase-9876');
    const calls = fetchMock.mock.calls;
    const hibpCall = calls.find((c: any) => String(c[0]).includes('pwnedpasswords.com'));
    expect(hibpCall).toBeTruthy();
    const url = String(hibpCall![0]);
    expect(url).toMatch(/\/range\/[0-9A-F]{5}$/); // exactly the 5-char prefix
    // The full password must never appear in the request
    expect(url).not.toContain('SuperSecretPassphrase');
  });

  it('fail-open resilience: HIBP network error logs audit and allows sign-up (200)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    const res = await signUp('offline@test.com', 'Even-A-Good-Password-Passes-1');
    expect(res.status).toBe(200);
    expect((mockD1.tables.users as any[]).some((u: any) => u.email === 'offline@test.com')).toBe(true);
  });
});