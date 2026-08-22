import { Hono } from 'hono';
import { getAuth, sendOtpEmail } from '../auth.js';
import { getDb } from '../db/client.js';
import { users, verifications, sessions } from '../db/schema.js';
import { eq, and, gt } from 'drizzle-orm';
import { rateLimit, isRateLimited, clearRateLimit } from '../middleware/rateLimit.js';
import { auditEvent, auditBounded } from '../middleware/audit.js';
import { sha256Hex } from '../lib/auditChain.js';

export const authRouter = new Hono<{
  Bindings: { DB: D1Database; BETTER_AUTH_SECRET: string; BETTER_AUTH_URL?: string; ADMIN_EMAIL?: string; ADMIN_PASSWORD?: string; ENVIRONMENT?: string };
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
      role: u.role || 'client',
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
  const { over } = await isRateLimited(c.env, { bucket: 'login-fail', windowSeconds: 900, limit: 5 }, email || 'anon', { failClosed: true });
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

// POST /api/auth/otp/send — Request 6-digit email OTP
authRouter.post('/otp/send', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'Database not available' }, 500);
  const body = await c.req.json().catch(() => ({}));
  const email = String(body?.email || '').trim().toLowerCase();

  if (!email || !email.includes('@')) {
    return c.json({ error: 'Valid email address is required' }, 400);
  }

  const { over } = await isRateLimited(c.env, { bucket: 'otp-send', windowSeconds: 600, limit: 5 }, email, { failClosed: true });
  if (over) {
    return c.json({ error: 'Too many OTP requests. Please wait a few minutes before trying again.' }, 429);
  }

  const db = getDb(c.env.DB);
  const user = await db.select().from(users).where(eq(users.email, email)).get();
  if (!user) {
    return c.json({ error: 'No account found with this email. Please check your spelling or create an account.' }, 404);
  }

  // Generate secure 6-digit OTP
  const rawOtp = String(Math.floor(100000 + Math.random() * 900000));
  const hashedOtp = await sha256Hex(rawOtp);
  const identifier = `otp:${email}`;
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

  // Clean old OTP and insert fresh verification row
  await db.delete(verifications).where(eq(verifications.identifier, identifier)).catch(() => {});
  await db.insert(verifications).values({
    id: crypto.randomUUID(),
    identifier,
    value: hashedOtp,
    attempts: 0,
    expiresAt,
    createdAt: new Date(),
    updatedAt: new Date()
  });

  // Dispatch OTP via Listmonk -> Titan Mail
  await sendOtpEmail(c.env, db, user, rawOtp);

  return c.json({
    success: true,
    message: `A 6-digit verification code has been sent to ${email}.`,
    email
  });
});

// POST /api/auth/otp/verify — Verify 6-digit email OTP & Create Session
authRouter.post('/otp/verify', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'Database not available' }, 500);
  const body = await c.req.json().catch(() => ({}));
  const email = String(body?.email || '').trim().toLowerCase();
  const otp = String(body?.otp || '').trim();

  if (!email || !otp || otp.length !== 6) {
    return c.json({ error: 'Valid 6-digit passcode is required' }, 400);
  }

  const db = getDb(c.env.DB);
  const identifier = `otp:${email}`;
  const { over: otpVerifyOver } = await isRateLimited(c.env, { bucket: 'otp-verify', windowSeconds: 900, limit: 10 }, identifier, { failClosed: true });
  if (otpVerifyOver) {
    return c.json({ error: 'Too many verification attempts. Try again in 15 minutes.' }, 429);
  }
  const row = await db.select().from(verifications).where(eq(verifications.identifier, identifier)).get();

  if (!row) {
    return c.json({ error: 'Passcode expired or not requested. Please request a new code.' }, 400);
  }

  if (new Date() > new Date(row.expiresAt)) {
    await db.delete(verifications).where(eq(verifications.identifier, identifier)).catch(() => {});
    return c.json({ error: 'Passcode has expired. Please request a fresh code.' }, 400);
  }

  if ((row.attempts || 0) >= 5) {
    return c.json({ error: 'Too many incorrect attempts' }, 429);
  }

  const hashedInput = await sha256Hex(otp);
  if (row.value !== hashedInput) {
    await db.update(verifications).set({ attempts: (row.attempts || 0) + 1 }).where(eq(verifications.identifier, identifier));
    return c.json({ error: 'Incorrect passcode. Please check the code sent to your email.' }, 400);
  }

  // Verification successful — delete verification record
  await db.delete(verifications).where(eq(verifications.identifier, identifier));

  const user = await db.select().from(users).where(eq(users.email, email)).get();
  if (!user) return c.json({ error: 'User not found' }, 404);

  // Create session for user
  const sessionId = crypto.randomUUID();
  const sessionToken = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  await db.insert(sessions).values({
    id: sessionId,
    userId: user.id,
    token: sessionToken,
    expiresAt,
    ipAddress: c.req.header('cf-connecting-ip') || '127.0.0.1',
    userAgent: c.req.header('user-agent') || 'browser',
    createdAt: new Date(),
    updatedAt: new Date()
  });

  const cookieStr = `better-auth.session_token=${sessionToken}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800; ${c.env?.ENVIRONMENT === 'production' ? 'Secure;' : ''}`;
  c.header('Set-Cookie', cookieStr);

  await auditEvent(c, {
    action: 'LOGIN_SUCCESS',
    entityName: 'users',
    entityId: user.id,
    category: 'auth',
    afterState: { email: user.email, method: 'email_otp' }
  });

  return c.json({
    success: true,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role
    }
  });
});

// POST /api/auth/sign-out — robust session termination & cookie clearance
authRouter.post('/sign-out', async (c) => {
  try {
    if (c.env?.DB) {
      const auth = getAuth(c.env);
      const session = await auth.api.getSession({ headers: c.req.raw.headers }).catch(() => null);
      if (session?.session?.id) {
        const db = getDb(c.env.DB);
        await db.delete(sessions).where(eq(sessions.id, session.session.id)).catch(() => {});
      }
    }
  } catch {
    // Fail-open to cookie clearing
  }

  // Clear all session cookies immediately
  const isProd = c.env?.ENVIRONMENT === 'production';
  c.header('Set-Cookie', `better-auth.session_token=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; ${isProd ? 'Secure;' : ''}`, { append: true });
  c.header('Set-Cookie', `better-auth.session_data=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; ${isProd ? 'Secure;' : ''}`, { append: true });
  c.header('Set-Cookie', `better-auth.dont_remember=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0; Expires=Thu, 01 Jan 1970 00:00:00 GMT; ${isProd ? 'Secure;' : ''}`, { append: true });

  return c.json({ success: true });
});

// All other /api/auth/* routes go to Better Auth (sign-in, sign-up, session, 2FA…)
authRouter.all('/*', (c) => {
  const auth = getAuth(c.env);
  return auth.handler(c.req.raw);
});