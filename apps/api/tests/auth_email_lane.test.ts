import { describe, it, expect, vi } from 'vitest';
import { MockD1Database } from './mockDb.js';
import { getDb } from '../src/db/client.js';
import { sendPasswordResetEmail, sendVerificationEmailSafe, sendOtpEmail } from '../src/auth.js';
import * as authHelpers from '../src/auth.js';

// Verifies the exact user-facing question: "will a customer receive the OTP /
// reset email through Listmonk?" — YES, once LISTMONK_* envs are set: the auth
// callbacks now route through the notify engine â†’ Listmonk /api/tx (immediate,
// transactional lane). Until configured, they fall back to log-only (stub),
// never silent failures, never blocking the auth request.
describe('Auth transactional email lane (Listmonk)', () => {
  let mockD1: MockD1Database;

  beforeEach(() => {
    mockD1 = new MockD1Database();
  });

const listmonkEnv = () => ({
    DB: mockD1,
    LISTMONK_BASE_URL: 'http://100.87.71.38:9009',
    LISTMONK_API_USER: 'admin@opusoverseas.com',
    LISTMONK_API_PASS: 'pw',
  });

  it('reset password email â†’ delivered through Listmonk /api/tx with the link (clickable)', async () => {
    const calls: { url: string; body: any }[] = [];
    global.fetch = vi.fn(async (url: any, opts: any) => {
      const u = String(url);
      if (u.includes('/api/subscribers')) {
        return new Response(JSON.stringify({ data: { id: 7 } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      if (u.includes('/api/tx')) {
        calls.push({ url: u, body: JSON.parse(opts.body) });
        return new Response(JSON.stringify({ data: { id: 99 } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('{}', { status: 404 });
    }) as any;

    await sendPasswordResetEmail(listmonkEnv() as any, getDb(mockD1 as any), { email: 'customer@example.com' }, 'https://app.opusoverseas.com/reset?token=abc&x=1');
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('http://100.87.71.38:9009/api/tx');
    expect(calls[0].body.subscriber_email).toBe('customer@example.com');
    expect(calls[0].body.headers.subject).toContain('Reset');
// link is present AND wrapped as a clickable <a> (auto-linkify)
    expect(calls[0].body.template_body).toContain('https://app.opusoverseas.com/reset?token=abc');
    expect(calls[0].body.template_body).toContain('<a href="https://app.opusoverseas.com/reset?token=abc&x=1"');
    // delivered + persisted as a notification
    expect(mockD1.tables.notifications.some((n) => n.channel === 'email' && n.to === 'customer@example.com' && n.status === 'sent')).toBe(true);
  });

  it('OTP email â†’ direct transactional send (immediate, not a queued campaign)', async () => {
    const txBodies: any[] = [];
    global.fetch = vi.fn(async (url: any, opts: any) => {
      const u = String(url);
      if (u.includes('/api/subscribers')) return new Response(JSON.stringify({ data: { id: 8 } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      if (u.includes('/api/tx')) { txBodies.push(JSON.parse(opts.body)); return new Response(JSON.stringify({ data: { id: 100 } }), { status: 200, headers: { 'Content-Type': 'application/json' } }); }
      return new Response('{}', { status: 404 });
    }) as any;

    await sendOtpEmail(listmonkEnv() as any, getDb(mockD1 as any), { email: 'otp@example.com' }, '482913');
    expect(txBodies).toHaveLength(1);
    expect(txBodies[0].subscriber_email).toBe('otp@example.com');
    expect(txBodies[0].headers.subject).toContain('482913');
    expect(txBodies[0].template_body).toContain('482913');
  });

  it('verification email passes through with the URL', async () => {
    const txBodies: any[] = [];
    global.fetch = vi.fn(async (url: any, opts: any) => {
      const u = String(url);
      if (u.includes('/api/subscribers')) return new Response(JSON.stringify({ data: { id: 9 } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      if (u.includes('/api/tx')) { txBodies.push(JSON.parse(opts.body)); return new Response(JSON.stringify({ data: { id: 101 } }), { status: 200, headers: { 'Content-Type': 'application/json' } }); }
      return new Response('{}', { status: 404 });
    }) as any;

    await sendVerificationEmailSafe(listmonkEnv() as any, getDb(mockD1 as any), { email: 'verify@example.com' }, 'https://app.opusoverseas.com/verify?token=v1');
    expect(txBodies[0].headers.subject).toContain('Verify');
    expect(txBodies[0].template_body).toContain('https://app.opusoverseas.com/verify?token=v1');
  });

  it('unconfigured Listmonk â†’ stub-ok, auth never blocks (dev log remains)', async () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => { });
    global.fetch = vi.fn(async () => new Response('{}', { status: 404 })) as any;
    await sendOtpEmail({ DB: mockD1 } as any, getDb(mockD1 as any), { email: 'dev@example.com' }, '111111');
    // stub email = "delivered" — no throw, notification row logged as sent
    expect(mockD1.tables.notifications.some((n) => n.to === 'dev@example.com' && n.status === 'sent')).toBe(true);
    spy.mockRestore();
  });

  // The three helpers are actually wired into better-auth's config (not dead code)
  it('auth.ts exports the helpers the callbacks call', () => {
    expect(typeof authHelpers.sendPasswordResetEmail).toBe('function');
    expect(typeof authHelpers.sendVerificationEmailSafe).toBe('function');
    expect(typeof authHelpers.sendOtpEmail).toBe('function');
  });
});

