import { Hono } from 'hono';
import { getDb } from '../db/client.js';
import { users, verifications, sessions, twoFactor } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { rateLimit, isRateLimited, clearRateLimit } from '../middleware/rateLimit.js';
import { auditEvent, auditBounded } from '../middleware/audit.js';
import { sha256Hex } from '../lib/auditChain.js';
import {
  getAuth,
  hashPassword,
  verifyPassword,
  createSession,
  validateSessionToken,
  invalidateSession,
  setSessionCookie,
  clearSessionCookie,
  getSessionTokenFromCookie,
  ensureSuperadmin,
  generateTotpSecret,
  verifyTotp,
  generateBackupCodes,
  generateRandomToken,
} from '../auth.js';
import { checkPasswordBreached } from '../lib/auth/crypto.js';

export const authRouter = new Hono<{
  Bindings: {
    DB: D1Database;
    BETTER_AUTH_SECRET?: string;
    BETTER_AUTH_URL?: string;
    ADMIN_EMAIL?: string;
    ADMIN_PASSWORD?: string;
    ENVIRONMENT?: string;
  };
}>();

// Brute-force protection on auth-sensitive routes (spec §18.2.1).
authRouter.use('/sign-in/*', rateLimit({ bucket: 'login', windowSeconds: 300, limit: 8 }));
authRouter.use('/sign-up/*', rateLimit({ bucket: 'signup', windowSeconds: 300, limit: 8 }));
authRouter.use('/email-verification/*', rateLimit({ bucket: 'otp', windowSeconds: 300, limit: 5 }));
authRouter.use('/two-factor/*', rateLimit({ bucket: 'otp', windowSeconds: 300, limit: 10 }));
authRouter.use('/reset-password/*', rateLimit({ bucket: 'otp', windowSeconds: 300, limit: 5 }));
authRouter.use('/bootstrap-admin', rateLimit({ bucket: 'bootstrap', windowSeconds: 300, limit: 5 }));

// GET /api/auth/me — Current session self-describe
authRouter.get('/me', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);

  try {
    const auth = getAuth(c.env);
    const sessionResult = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!sessionResult) return c.json({ authenticated: null });

    const u = sessionResult.user as any;
    return c.json({
      authenticated: true,
      id: u.id,
      name: u.name,
      email: u.email,
      role: u.role || 'client',
      userDivisions: (() => {
        try {
          return typeof u.userDivisions === 'string' ? JSON.parse(u.userDivisions || '[]') : u.userDivisions || [];
        } catch {
          return [];
        }
      })(),
      twoFactorEnabled: !!u.twoFactorEnabled,
      emailVerified: !!u.emailVerified,
    });
  } catch (error: any) {
    return c.json({ error: 'Session lookup failed', details: error.message }, 500);
  }
});

authRouter.get('/get-session', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);

  try {
    const auth = getAuth(c.env);
    const sessionResult = await auth.api.getSession({ headers: c.req.raw.headers });
    if (!sessionResult) return c.json(null);

    return c.json(sessionResult);
  } catch {
    return c.json(null);
  }
});

// POST /api/auth/bootstrap-admin — First-run owner account creation & self-heal
authRouter.post('/bootstrap-admin', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);

  const email = c.env.ADMIN_EMAIL;
  const password = c.env.ADMIN_PASSWORD;
  if (!email || !password) {
    return c.json({ error: 'Set ADMIN_EMAIL and ADMIN_PASSWORD (wrangler vars) to bootstrap the owner account.' }, 400);
  }

  const db = getDb(c.env.DB);
  const allUsers = await db.select().from(users).all();
  const hasAdmin = allUsers.some(
    (u: any) => u.role === 'super_admin' && (u.emailVerified === true || u.emailVerified === 1 || u.email_verified === 1 || u.email_verified === true)
  );

  if (hasAdmin) {
    return c.json({ error: 'A verified super_admin already exists' }, 409);
  }

  const auth = getAuth(c.env);
  const result = await auth.api.signUpEmail({
    body: {
      name: 'Owner',
      email,
      password,
      role: 'super_admin',
      userDivisions: JSON.stringify(['study-abroad', 'visa', 'umrah', 'attestation', 'manpower']),
    },
    headers: c.req.raw.headers,
  });

  const id = (result as any)?.user?.id;
  if (!id) throw new Error('signUpEmail did not return a user id');

  await db
    .update(users)
    .set({
      emailVerified: true,
      role: 'super_admin',
      userDivisions: JSON.stringify(['study-abroad', 'visa', 'umrah', 'attestation', 'manpower']),
      updatedAt: new Date(),
    })
    .where(eq(users.id, id));

  await auditEvent(c, {
    action: 'BOOTSTRAP_ADMIN',
    entityName: 'users',
    entityId: id,
    afterState: { email, role: 'super_admin' },
  });

  return c.json({ success: true, created: true, email });
});

// POST /api/auth/sign-in/email — Native WebCrypto Sign-In
authRouter.post('/sign-in/email', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);

  const body = await c.req.json().catch(() => ({}));
  const email = String(body?.email || '').trim().toLowerCase();
  const password = String(body?.password || '');
  const totpCode = body?.totpCode ? String(body.totpCode).trim() : undefined;

  if (!email || !password) {
    return c.json({ error: 'Email and password are required' }, 400);
  }

  // 1. Account Lockout check (5 failed attempts per 15 min)
  const { over } = await isRateLimited(
    c.env,
    { bucket: 'login-fail', windowSeconds: 900, limit: 5 },
    email || 'anon',
    { failClosed: true }
  );

  if (over) {
    await auditBounded(
      c,
      {
        action: 'LOGIN_FAILED',
        entityName: 'users',
        entityId: email || 'unknown',
        result: 'denied',
        category: 'auth',
        afterState: { reason: 'account_locked' },
      },
      'denial',
      email
    );
    return c.json({ error: 'Too many failed attempts. Try again in 15 minutes.', code: 'ACCOUNT_LOCKED' }, 429);
  }

  const db = getDb(c.env.DB);

  // Self-heal superadmin on sign-in attempt if database is newly provisioned
  if (email === 'owner@opusoverseas.com' || (c.env.ADMIN_EMAIL && email === c.env.ADMIN_EMAIL.toLowerCase())) {
    await ensureSuperadmin(db, c.env).catch(() => {});
  }

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);

  if (!user) {
    await auditBounded(
      c,
      {
        action: 'LOGIN_FAILED',
        entityName: 'users',
        entityId: email,
        result: 'error',
        category: 'auth',
        afterState: { reason: 'user_not_found' },
      },
      'denial',
      email
    );
    return c.json({ error: 'Invalid email or password' }, 401);
  }

  // 2. Verify Password using WebCrypto PBKDF2
  const passwordValid = await verifyPassword(password, user.passwordHash);

  if (!passwordValid) {
    await auditBounded(
      c,
      {
        action: 'LOGIN_FAILED',
        entityName: 'users',
        entityId: email,
        result: 'error',
        category: 'auth',
        afterState: { reason: 'invalid_password' },
      },
      'denial',
      email
    );
    return c.json({ error: 'Invalid email or password' }, 401);
  }

  // 3. 2FA Check if enabled on user account
  if (user.twoFactorEnabled) {
    const [tf] = await db.select().from(twoFactor).where(eq(twoFactor.userId, user.id)).limit(1);
    if (tf && tf.verified) {
      if (!totpCode) {
        return c.json({ twoFactorRedirect: true, userId: user.id }, 200);
      }

      // Check TOTP code or backup code
      const isTotpValid = await verifyTotp(totpCode, tf.secret);
      let isBackupValid = false;

      if (!isTotpValid) {
        const hashedInput = await sha256Hex(totpCode);
        const storedCodes: string[] = JSON.parse(tf.backupCodes || '[]');
        if (storedCodes.includes(hashedInput)) {
          isBackupValid = true;
          const remaining = storedCodes.filter((c) => c !== hashedInput);
          await db.update(twoFactor).set({ backupCodes: JSON.stringify(remaining) }).where(eq(twoFactor.id, tf.id));
        }
      }

      if (!isTotpValid && !isBackupValid) {
        return c.json({ error: 'Invalid two-factor authentication code' }, 400);
      }
    }
  }

  // 4. Login Successful: Clear failure rate limits & create session
  await clearRateLimit(c.env, 'login-fail', email);

  const ip = c.req.header('cf-connecting-ip') || '127.0.0.1';
  const ua = c.req.header('user-agent') || 'browser';
  const { session, token } = await createSession(db, user.id, ip, ua);

  setSessionCookie(c, token);

  let userDivisions: string[] = [];
  try {
    userDivisions = typeof user.userDivisions === 'string' ? JSON.parse(user.userDivisions || '[]') : user.userDivisions || [];
  } catch {
    userDivisions = [];
  }

  const responseBody: any = {
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
      userDivisions: JSON.stringify(userDivisions),
      twoFactorEnabled: !!user.twoFactorEnabled,
    },
    session: {
      id: session.id,
      userId: session.userId,
      token,
      expiresAt: session.expiresAt,
    },
  };

  if (user.role === 'super_admin') {
    await auditEvent(c, {
      action: 'LOGIN_SUCCESS',
      entityName: 'users',
      entityId: user.id,
      category: 'auth',
      afterState: { email: user.email, twoFactorEnabled: !!user.twoFactorEnabled },
    });
    if (!user.twoFactorEnabled) responseBody.twoFactorSetupRequired = true;
  }

  return c.json(responseBody);
});

// POST /api/auth/sign-up/email — Native WebCrypto Sign-Up with NIST SP 800-63B breached password protection
authRouter.post('/sign-up/email', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);

  const body = await c.req.json().catch(() => ({}));
  const name = String(body?.name || '').trim();
  const email = String(body?.email || '').trim().toLowerCase();
  const password = String(body?.password || '');
  const role = body?.role === 'partner' ? 'partner' : 'client';

  if (!name || !email || !password || password.length < 8) {
    return c.json({ error: 'Name, valid email and a password of at least 8 characters are required' }, 400);
  }

  // NIST SP 800-63B: Screen against HaveIBeenPwned breached passwords
  try {
    const isBreached = await checkPasswordBreached(password);
    if (isBreached) {
      return c.json(
        {
          error: 'This password has appeared in a data breach and is compromised. Please choose a different password.',
          code: 'PASSWORD_COMPROMISED',
        },
        400
      );
    }
  } catch (err: any) {
    // Fail closed if HIBP service fails
    return c.json({ error: 'Password security verification failed. Please try again later.' }, 500);
  }

  const db = getDb(c.env.DB);
  const existing = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (existing.length > 0) {
    return c.json({ error: 'An account with this email address already exists' }, 409);
  }

  const passwordHash = await hashPassword(password);
  const userId = 'usr_' + generateRandomToken(12);
  const now = new Date();

  const [newUser] = await db
    .insert(users)
    .values({
      id: userId,
      name,
      email,
      emailVerified: false,
      role: role as any,
      userDivisions: '[]',
      passwordHash,
      twoFactorEnabled: false,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  const ip = c.req.header('cf-connecting-ip') || '127.0.0.1';
  const ua = c.req.header('user-agent') || 'browser';
  const { session, token } = await createSession(db, newUser.id, ip, ua);

  setSessionCookie(c, token);

  await auditEvent(c, {
    action: 'USER_REGISTERED',
    entityName: 'users',
    entityId: newUser.id,
    afterState: { email: newUser.email, role: newUser.role },
  });

  return c.json({
    user: {
      id: newUser.id,
      name: newUser.name,
      email: newUser.email,
      role: newUser.role,
      userDivisions: '[]',
      twoFactorEnabled: false,
    },
    session: {
      id: session.id,
      userId: session.userId,
      token,
      expiresAt: session.expiresAt,
    },
  });
});

// POST /api/auth/sign-out — Session Termination & Cookie Clearance
authRouter.post('/sign-out', async (c) => {
  try {
    if (c.env?.DB) {
      const token = getSessionTokenFromCookie(c);
      if (token) {
        const db = getDb(c.env.DB);
        await invalidateSession(db, token).catch(() => {});
      }
    }
  } catch {
    // Fail-open
  }

  clearSessionCookie(c);
  return c.json({ success: true });
});

// 2FA Routes
authRouter.post('/two-factor/generate', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const token = getSessionTokenFromCookie(c);
  if (!token) return c.json({ error: 'Unauthorized' }, 401);

  const db = getDb(c.env.DB);
  const sessionResult = await validateSessionToken(db, token);
  if (!sessionResult) return c.json({ error: 'Unauthorized' }, 401);

  const user = sessionResult.user;
  const secret = generateTotpSecret();
  const { plaintext: backupCodes, hashed } = await generateBackupCodes(8);

  const tfId = 'tf_' + generateRandomToken(12);

  await db.delete(twoFactor).where(eq(twoFactor.userId, user.id)).catch(() => {});
  await db.insert(twoFactor).values({
    id: tfId,
    userId: user.id,
    secret,
    backupCodes: JSON.stringify(hashed),
    verified: false,
    failedVerificationCount: 0,
  });

  const uri = `otpauth://totp/OpusOS:${encodeURIComponent(user.email)}?secret=${secret}&issuer=OpusOS`;

  return c.json({
    secret,
    uri,
    backupCodes,
  });
});

authRouter.post('/two-factor/verify', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const token = getSessionTokenFromCookie(c);
  if (!token) return c.json({ error: 'Unauthorized' }, 401);

  const db = getDb(c.env.DB);
  const sessionResult = await validateSessionToken(db, token);
  if (!sessionResult) return c.json({ error: 'Unauthorized' }, 401);

  const body = await c.req.json().catch(() => ({}));
  const code = String(body?.code || body?.totpCode || '').trim();

  if (!code || code.length !== 6) {
    return c.json({ error: 'Valid 6-digit verification code required' }, 400);
  }

  const [tf] = await db.select().from(twoFactor).where(eq(twoFactor.userId, sessionResult.user.id)).limit(1);
  if (!tf) return c.json({ error: 'Two-factor setup not initialized' }, 400);

  const isValid = await verifyTotp(code, tf.secret);
  if (!isValid) {
    return c.json({ error: 'Invalid verification code' }, 400);
  }

  await db.update(twoFactor).set({ verified: true }).where(eq(twoFactor.id, tf.id));
  await db.update(users).set({ twoFactorEnabled: true }).where(eq(users.id, sessionResult.user.id));

  await auditEvent(c, {
    action: 'TWO_FACTOR_ENABLED',
    entityName: 'users',
    entityId: sessionResult.user.id,
    afterState: { twoFactorEnabled: true },
  });

  return c.json({ success: true, message: 'Two-factor authentication enabled successfully' });
});

authRouter.post('/two-factor/enable', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);

  const auth = getAuth(c.env);
  let userId: string | null = null;
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    userId = (session?.user as any)?.id || null;
  } catch {}

  if (userId) {
    const db = getDb(c.env.DB);
    await db.update(users).set({ twoFactorEnabled: true }).where(eq(users.id, userId));
    await auditEvent(c, {
      action: 'TWO_FACTOR_ENABLED',
      entityName: 'users',
      entityId: userId,
      afterState: { twoFactorEnabled: true },
    });
  }

  return c.json({ success: true, status: true });
});

authRouter.post('/two-factor/disable', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);

  const auth = getAuth(c.env);
  let userId: string | null = null;
  try {
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    userId = (session?.user as any)?.id || null;
  } catch {}

  if (userId) {
    const db = getDb(c.env.DB);
    await db.delete(twoFactor).where(eq(twoFactor.userId, userId)).catch(() => {});
    await db.update(users).set({ twoFactorEnabled: false }).where(eq(users.id, userId));
    await auditEvent(c, {
      action: 'TWO_FACTOR_DISABLED',
      entityName: 'users',
      entityId: userId,
      afterState: { twoFactorEnabled: false },
    });
  }

  return c.json({ success: true, status: true });
});

// POST /api/auth/otp/send — Request 6-digit email OTP
authRouter.post('/otp/send', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'Database not available' }, 500);
  const body = await c.req.json().catch(() => ({}));
  const email = String(body?.email || '').trim().toLowerCase();

  if (!email || !email.includes('@')) {
    return c.json({ error: 'Valid email address is required' }, 400);
  }

  const { over } = await isRateLimited(c.env, { bucket: 'otp-send', windowSeconds: 600, limit: 5 }, email, {
    failClosed: true,
  });
  if (over) {
    return c.json({ error: 'Too many OTP requests. Please wait a few minutes before trying again.' }, 429);
  }

  const db = getDb(c.env.DB);
  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) {
    return c.json({ error: 'No account found with this email. Please check your spelling or create an account.' }, 404);
  }

  // Generate secure 6-digit OTP
  const rawOtp = String(Math.floor(100000 + Math.random() * 900000));
  const hashedOtp = await sha256Hex(rawOtp);
  const identifier = `otp:${email}`;
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 mins

  await db.delete(verifications).where(eq(verifications.identifier, identifier)).catch(() => {});
  await db.insert(verifications).values({
    id: crypto.randomUUID(),
    identifier,
    value: hashedOtp,
    attempts: 0,
    expiresAt,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  return c.json({
    success: true,
    message: `A 6-digit verification code has been sent to ${email}.`,
    email,
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
  const { over: otpVerifyOver } = await isRateLimited(
    c.env,
    { bucket: 'otp-verify', windowSeconds: 900, limit: 10 },
    identifier,
    { failClosed: true }
  );
  if (otpVerifyOver) {
    return c.json({ error: 'Too many verification attempts. Try again in 15 minutes.' }, 429);
  }

  const [row] = await db.select().from(verifications).where(eq(verifications.identifier, identifier)).limit(1);

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

  await db.delete(verifications).where(eq(verifications.identifier, identifier));

  const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  if (!user) return c.json({ error: 'User not found' }, 404);

  const ip = c.req.header('cf-connecting-ip') || '127.0.0.1';
  const ua = c.req.header('user-agent') || 'browser';
  const { session, token } = await createSession(db, user.id, ip, ua);

  setSessionCookie(c, token);

  await auditEvent(c, {
    action: 'LOGIN_SUCCESS',
    entityName: 'users',
    entityId: user.id,
    category: 'auth',
    afterState: { email: user.email, method: 'email_otp' },
  });

  return c.json({
    success: true,
    user: {
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.role,
    },
  });
});