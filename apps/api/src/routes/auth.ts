import { Hono } from 'hono';
import { getAuth } from '../auth.js';
import { getDb } from '../db/client.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { rateLimit, isRateLimited, clearRateLimit } from '../middleware/rateLimit.js';
import { auditEvent, auditBounded } from '../middleware/audit.js';

export const authRouter = new Hono<{
  Bindings: { DB: D1Database; BETTER_AUTH_SECRET: string; BETTER_AUTH_URL?: string; ADMIN_EMAIL?: string; ADMIN_PASSWORD?: string };
}>();

// Brute-force protection on auth-sensitive routes (spec §18.2.1).
authRouter.use('/sign-in/*', rateLimit({ bucket: 'login', windowSeconds: 300, limit: 8 }));
authRouter.use('/sign-up/*', rateLimit({ bucket: 'signup', windowSeconds: 300, limit: 8 }));
authRouter.use('/email-verification/*', rateLimit({ bucket: 'otp', windowSeconds: 300, limit: 5 }));
authRouter.use('/two-factor/*', rateLimit({ bucket: 'otp', windowSeconds: 300, limit: 10 }));
authRouter.use('/reset-password/*', rateLimit({ bucket: 'otp', windowSeconds: 300, limit: 5 }));
authRouter.use('/bootstrap-admin', rateLimit({ bucket: 'bootstrap', windowSeconds: 300, limit: 5 }));

// GET /api/auth/me — current session self-describe for the frontend guard.
authRouter.get('/me', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  try {
    const auth = getAuth(c.env);
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!session) return c.json({ authenticated: null });
    const u = session.user as any;
    return c.json({
      authenticated: true,
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role || 'counselor',
      userDivisions: (() => { try { return JSON.parse(u.userDivisions || '[]'); } catch { return []; } })(),
      twoFactorEnabled: !!u.twoFactorEnabled,
      emailVerified: !!u.emailVerified,
    });
  } catch (error: any) {
    return c.json({ error: 'Session lookup failed', details: error.message }, 500);
  }
});

// POST /api/auth/bootstrap-admin — first-run owner account creation.
// 409 once a verified super_admin exists; uses env ADMIN_EMAIL / ADMIN_PASSWORD.
authRouter.post('/bootstrap-admin', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const email = c.env.ADMIN_EMAIL;
  const password = c.env.ADMIN_PASSWORD;
  if (!email || !password) {
    return c.json({ error: 'Set ADMIN_EMAIL and ADMIN_PASSWORD (wrangler vars) to bootstrap the owner account.' }, 400);
  }

  const db = getDb(c.env.DB);
  const all = await db.select().from(users).all();
  const hasAdmin = all.some((u: any) => u.role === 'super_admin' && u.emailVerified);
  if (hasAdmin) return c.json({ error: 'A verified super_admin already exists' }, 409);

  // Route through Better Auth so hashing + verification share ONE implementation
  // (avoids nodejs_compat scrypt drift from manual hashPassword inserts).
  const auth = getAuth(c.env);
  const result = await auth.api.signUpEmail({
    body: {
      name: 'Owner', email, password,
      role: 'super_admin', userDivisions: JSON.stringify(['study-abroad', 'visa', 'umrah', 'attestation', 'manpower']),
    },
    headers: c.req.raw.headers,
  });
  const id = (result as any)?.user?.id;
  if (!id) throw new Error('signUpEmail did not return a user id');
  await db.update(users).set({
    emailVerified: true,
    role: 'super_admin',
    userDivisions: JSON.stringify(['study-abroad', 'visa', 'umrah', 'attestation', 'manpower']),
    updatedAt: new Date(),
  }).where(eq(users.id, id));

  await auditEvent(c, { action: 'BOOTSTRAP_ADMIN', entityName: 'users', entityId: id, afterState: { email, role: 'super_admin' } });

  return c.json({ success: true, created: true, email });
});

// POST /api/auth/sign-in/email — hardened intercept (industry standards):
//   1. ACCOUNT LOCKOUT: 5 failed attempts per email → 15-min lock (D1 counter).
//   2. FAILED-LOGIN AUDIT: every failure writes LOGIN_FAILED (bounded 20/hr).
//   3. SUCCESS: clears the failure counter; super_admin logins audited
//      (LOGIN_SUCCESS); super_admin without 2FA gets `twoFactorSetupRequired`
//      so the frontend enforces 2FA onboarding (workspace gate).
// The Better Auth handler still owns the response (cookies/headers verbatim).
authRouter.post('/sign-in/email', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const rawText = await c.req.text();
  let email = '';
  try { email = String((JSON.parse(rawText) as any)?.email || '').toLowerCase(); } catch { /* malformed body */ }

  // 1. Lockout gate (checked BEFORE the handler — even correct credentials are
  // blocked while the account is locked).
  const { over } = await isRateLimited(c.env, { bucket: 'login-fail', windowSeconds: 900, limit: 5 }, email || 'anon');
  if (over) {
    await auditBounded(c, {
      action: 'LOGIN_FAILED', entityName: 'users', entityId: email || 'unknown',
      result: 'denied', category: 'auth', afterState: { reason: 'account_locked' },
    }, 'denial', email);
    return c.json({ error: 'Too many failed attempts. Try again in 15 minutes.', code: 'ACCOUNT_LOCKED' }, 429);
  }

  // 2/3. Delegate to Better Auth, preserving the response (Set-Cookie etc.).
  const auth = getAuth(c.env);
  const res = await auth.handler(new Request(c.req.raw.url, { method: 'POST', headers: c.req.raw.headers, body: rawText }));
  const body: any = await res.json().catch(() => ({}));
  const headers = new Headers(res.headers);

  if (res.status >= 200 && res.status < 300 && body?.user) {
    await clearRateLimit(c.env, 'login-fail', email);
    const user = body.user;
    if (user.role === 'super_admin') {
      await auditEvent(c, {
        action: 'LOGIN_SUCCESS', entityName: 'users', entityId: user.id,
        category: 'auth', afterState: { email: user.email, twoFactorEnabled: !!user.twoFactorEnabled },
      });
      if (!user.twoFactorEnabled) body.twoFactorSetupRequired = true;
    }
  } else if (res.status >= 400) {
    await auditBounded(c, {
      action: 'LOGIN_FAILED', entityName: 'users', entityId: email || 'unknown',
      result: 'error', category: 'auth', afterState: { reason: 'invalid_credentials' },
    }, 'denial', email);
  }

  return new Response(JSON.stringify(body), { status: res.status, headers });
});

// 2FA enable/disable — security-sensitive state changes. These pass through
// Better Auth's own handler (cookies/headers preserved verbatim); we only add
// an audit row when the underlying call SUCCEEDS (2xx). Registered before the
// catch-all below so they intercept instead of falling through.
async function twoFactorIntercept(c: any, action: string) {
  const auth = getAuth(c.env);
  const res = await auth.handler(c.req.raw);
  if (res.status >= 200 && res.status < 400) {
    try {
      const session = await auth.api.getSession({ headers: c.req.raw.headers });
      const userId = (session?.user as any)?.id || null;
      await auditEvent(c, { action, entityName: 'users', entityId: userId || 'unknown', afterState: { twoFactorEnabled: action === 'TWO_FACTOR_ENABLED' } });
    } catch { /* fail-open: audit must never break the auth response */ }
  }
  return res;
}

authRouter.post('/two-factor/enable', (c) => twoFactorIntercept(c, 'TWO_FACTOR_ENABLED'));
authRouter.post('/two-factor/disable', (c) => twoFactorIntercept(c, 'TWO_FACTOR_DISABLED'));

// All other /api/auth/* routes go to Better Auth (sign-in, sign-up, session, 2FA…)
authRouter.all('/*', (c) => {
  const auth = getAuth(c.env);
  return auth.handler(c.req.raw);
});