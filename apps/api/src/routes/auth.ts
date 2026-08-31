import { Hono } from 'hono';
import { getDb } from '../db/client.js';
import { users, verifications, sessions, twoFactor, auditLog } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { rateLimit, isRateLimited, clearRateLimit } from '../middleware/rateLimit.js';
import { auditEvent, auditBounded } from '../middleware/audit.js';
import { sha256Hex } from '../lib/auditChain.js';
import { sendNotification } from '../infra/notify.js';
import {
  getAuth,
  hashPassword,
  verifyPassword,
  verifyAndUpgradePassword,
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
  sendVerificationEmailSafe,
  sendOtpEmail,
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

  const auth = getAuth(c.env);
  if (auth && typeof (auth as any).handler === 'function') {
    const res = await (auth as any).handler(new Request(c.req.raw.url, { method: 'POST', headers: c.req.raw.headers, body: JSON.stringify(body) }));
    const resBody: any = await res.json().catch(() => ({}));
    const headers = new Headers(res.headers);

    if (res.status >= 200 && res.status < 300 && resBody?.user) {
      await clearRateLimit(c.env, 'login-fail', email);
      const u = resBody.user;
      if (u.role === 'super_admin') {
        await auditEvent(c, {
          action: 'LOGIN_SUCCESS',
          entityName: 'users',
          entityId: u.id,
          category: 'auth',
          afterState: { email: u.email, twoFactorEnabled: !!u.twoFactorEnabled },
        });
        if (!u.twoFactorEnabled) resBody.twoFactorSetupRequired = true;
      }
    } else if (res.status >= 400) {
      await auditBounded(
        c,
        {
          action: 'LOGIN_FAILED',
          entityName: 'users',
          entityId: email || 'unknown',
          result: 'error',
          category: 'auth',
          afterState: { reason: 'invalid_credentials' },
        },
        'denial',
        email
      );
    }

    return new Response(JSON.stringify(resBody), { status: res.status, headers });
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

  // Gold standard: block suspended/archived before password check (no info leak + immediate revocation)
  const loginStatus = (user as any).status || 'active';
  if (loginStatus === 'suspended') {
    await auditBounded(c, { action: 'LOGIN_FAILED', entityName: 'users', entityId: user.id, result: 'denied', category: 'auth', afterState: { reason: 'account_suspended' } }, 'denial', email);
    return c.json({ error: 'Account suspended — contact admin', code: 'ACCOUNT_SUSPENDED' }, 403);
  }
  if (loginStatus === 'archived') {
    await auditBounded(c, { action: 'LOGIN_FAILED', entityName: 'users', entityId: user.id, result: 'denied', category: 'auth', afterState: { reason: 'account_archived' } }, 'denial', email);
    return c.json({ error: 'Account archived — contact admin to restore', code: 'ACCOUNT_ARCHIVED' }, 403);
  }

  // 2. Verify Password using WebCrypto PBKDF2 with automatic in-place upgrade
  const passwordValid = await verifyAndUpgradePassword(db, user.id, password, user.passwordHash, users, eq);

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

  // ASVS 6.3.5 + NIST: notify on new IP/device (gold standard for clients & staff)
  (async () => {
    try {
      const recent = await db.select().from(auditLog).where(eq(auditLog.actorId, user.id)).all().catch(()=>[]) as any[];
      const prevIps = new Set(recent.filter((r:any)=>r.action==='LOGIN_SUCCESS').map((r:any)=>{
        try { const s = typeof r.afterState==='string' ? JSON.parse(r.afterState) : r.afterState; return s?.ip || s?.email ? null : null; } catch { return null; }
      }).filter(Boolean));
      // Simpler: check sessions table for previous IPs
      const { sessions: sessTbl } = await import('../db/schema.js');
      const prevSessions = await db.select().from(sessTbl).where(eq(sessTbl.userId, user.id)).all().catch(()=>[]) as any[];
      const prevSessionIps = new Set(prevSessions.map((s:any)=>s.ipAddress).filter(Boolean));
      if (!prevSessionIps.has(ip) && prevSessionIps.size>0) {
        await sendNotification(c.env as any, db as any, {
          channel: 'email',
          to: user.email,
          subject: 'New sign-in to your Opus Overseas account',
          body: `<p>New sign-in detected for <b>${user.email}</b> from IP <code>${ip}</code> and device <code>${(ua||'').slice(0,120)}</code>. If this was you, you can ignore this. If not, <b>change your password and enable 2FA immediately</b> in Settings → Security.</p>`,
        }).catch(()=>{});
        await auditEvent(c, {action:'LOGIN_NEW_IP', entityName:'users', entityId:user.id, category:'auth', afterState:{ip, ua: ua.slice(0,120)}}).catch(()=>{});
      }
      // Always audit with IP for history
      await auditEvent(c, {action:'LOGIN_SUCCESS', entityName:'users', entityId:user.id, category:'auth', afterState:{email:user.email, ip, ua: ua.slice(0,80)}}).catch(()=>{});
    } catch {}
  })();

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
  // Gold standard: fail OPEN with audit on HIBP outage — never block signup when HIBP is unreachable (verified 2026-08-28 HIBP timeout → 500 blocked all signups)
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
    console.warn('[auth] HIBP check failed, failing open:', err?.message);
    await auditEvent(c, { action: 'HIBP_CHECK_FAILED', entityName: 'users', entityId: email, afterState: { error: String(err?.message || err) } }).catch(()=>{});
    // proceed — don’t block signup
  }

  const db = getDb(c.env.DB);
  try {
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
    }).catch(()=>{});

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
  } catch (e: any) {
    console.error('[auth] sign-up failed', e?.message, e?.stack);
    return c.json({ error: e?.message || 'Sign-up failed', code: 'SIGNUP_FAILED' }, 500);
  }
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
  const token = getSessionTokenFromCookie(c);
  if (!token) return c.json({ error: 'Unauthorized' }, 401);
  const db = getDb(c.env.DB);
  const sessionResult = await validateSessionToken(db, token);
  if (!sessionResult) return c.json({ error: 'Unauthorized' }, 401);

  const body = await c.req.json().catch(() => ({})) as any;
  const password = String(body?.password || '');
  if (!password) return c.json({ error: 'Password is required to enable 2FA', code: 'PASSWORD_REQUIRED' }, 400);

  // Verify current password (native PBKDF2 + legacy upgrade)
  const [currentUser] = await db.select().from(users).where(eq(users.id, sessionResult.user.id)).limit(1);
  if (!currentUser) return c.json({ error: 'User not found' }, 404);
  const passwordValid = await verifyAndUpgradePassword(db, currentUser.id, password, (currentUser as any).passwordHash, users, eq);
  if (!passwordValid) {
    await auditEvent(c, { action: 'TWO_FACTOR_ENABLE_FAILED', entityName: 'users', entityId: currentUser.id, result: 'denied', category: 'auth', afterState: { reason: 'invalid_password' } }).catch(()=>{});
    return c.json({ error: 'Enable failed — verify your password.', code: 'INVALID_PASSWORD' }, 400);
  }

  // Generate new TOTP secret + backup codes (overwrites any prior unverified setup)
  const secret = generateTotpSecret();
  const { plaintext: backupCodes, hashed } = await generateBackupCodes(8);
  const tfId = 'tf_' + generateRandomToken(12);
  await db.delete(twoFactor).where(eq(twoFactor.userId, currentUser.id)).catch(()=>{});
  await db.insert(twoFactor).values({
    id: tfId,
    userId: currentUser.id,
    secret,
    backupCodes: JSON.stringify(hashed),
    verified: false,
    failedVerificationCount: 0,
  });
  const totpURI = `otpauth://totp/OpusOS:${encodeURIComponent(currentUser.email)}?secret=${secret}&issuer=Opus%20Overseas`;

  await auditEvent(c, { action: 'TWO_FACTOR_ENABLED', entityName: 'users', entityId: currentUser.id, category: 'auth', afterState: { twoFactorSetup: true } }).catch(()=>{});
  return c.json({ success: true, totpURI, backupCodes, secret, uri: totpURI });
});

authRouter.post('/two-factor/disable', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const token = getSessionTokenFromCookie(c);
  if (!token) return c.json({ error: 'Unauthorized' }, 401);
  const db = getDb(c.env.DB);
  const sessionResult = await validateSessionToken(db, token);
  if (!sessionResult) return c.json({ error: 'Unauthorized' }, 401);
  const body = await c.req.json().catch(() => ({})) as any;
  const password = String(body?.password || '');
  // If password supplied, verify it (extra protection for disable)
  if (password) {
    const [u] = await db.select().from(users).where(eq(users.id, sessionResult.user.id)).limit(1);
    const ok = await verifyAndUpgradePassword(db, sessionResult.user.id, password, (u as any)?.passwordHash, users, eq);
    if (!ok) return c.json({ error: 'Disable failed — verify your password.', code: 'INVALID_PASSWORD' }, 400);
  }
  await db.delete(twoFactor).where(eq(twoFactor.userId, sessionResult.user.id)).catch(() => {});
  await db.update(users).set({ twoFactorEnabled: false }).where(eq(users.id, sessionResult.user.id));
  await auditEvent(c, { action: 'TWO_FACTOR_DISABLED', entityName: 'users', entityId: sessionResult.user.id, afterState: { twoFactorEnabled: false } });
  return c.json({ success: true, status: true });
});
// Alias for frontend compat: POST /two-factor/verify-totp → same as /two-factor/verify
authRouter.post('/two-factor/verify-totp', async (c) => {
  // Re-dispatch to the canonical verify handler logic
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const token = getSessionTokenFromCookie(c);
  if (!token) return c.json({ error: 'Unauthorized' }, 401);
  const db = getDb(c.env.DB);
  const sessionResult = await validateSessionToken(db, token);
  if (!sessionResult) return c.json({ error: 'Unauthorized' }, 401);
  const body = await c.req.json().catch(() => ({}));
  const code = String(body?.code || '').trim();
  if (!code || code.length !== 6) return c.json({ error: 'Valid 6-digit verification code required' }, 400);
  const [tf] = await db.select().from(twoFactor).where(eq(twoFactor.userId, sessionResult.user.id)).limit(1);
  if (!tf) return c.json({ error: 'Two-factor setup not initialized' }, 400);
  const isValid = await verifyTotp(code, tf.secret);
  if (!isValid) return c.json({ error: 'Invalid verification code' }, 400);
  await db.update(twoFactor).set({ verified: true }).where(eq(twoFactor.id, tf.id));
  await db.update(users).set({ twoFactorEnabled: true }).where(eq(users.id, sessionResult.user.id));
  await auditEvent(c, { action: 'TWO_FACTOR_ENABLED', entityName: 'users', entityId: sessionResult.user.id, afterState: { twoFactorEnabled: true } });
  return c.json({ success: true, status: true, message: 'Two-factor authentication enabled successfully' });
});

// POST /api/auth/change-password — Change password (requires current password, HIBP check on new)
authRouter.post('/change-password', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const token = getSessionTokenFromCookie(c);
  if (!token) return c.json({ error: 'Unauthorized' }, 401);
  const db = getDb(c.env.DB);
  const sessionResult = await validateSessionToken(db, token);
  if (!sessionResult) return c.json({ error: 'Unauthorized' }, 401);
  const body = await c.req.json().catch(() => ({})) as any;
  const currentPassword = String(body?.currentPassword || body?.current_password || body?.password || '');
  const newPassword = String(body?.newPassword || body?.new_password || body?.newPassword || '');
  if (!currentPassword || !newPassword) return c.json({ error: 'Current and new password are required' }, 400);
  if (newPassword.length < 8) return c.json({ error: 'New password must be at least 8 characters.' }, 400);
  const [u] = await db.select().from(users).where(eq(users.id, sessionResult.user.id)).limit(1);
  const ok = await verifyAndUpgradePassword(db, sessionResult.user.id, currentPassword, (u as any)?.passwordHash, users, eq);
  if (!ok) return c.json({ error: 'Change failed — verify your current password.', code: 'INVALID_PASSWORD' }, 400);
  try {
    const isBreached = await checkPasswordBreached(newPassword);
    if (isBreached) return c.json({ error: 'This new password has appeared in a data breach. Please choose a different password.', code: 'PASSWORD_COMPROMISED' }, 400);
  } catch { /* fail open */ }
  const newHash = await hashPassword(newPassword);
  await db.update(users).set({ passwordHash: newHash, updatedAt: new Date() }).where(eq(users.id, sessionResult.user.id));
  await auditEvent(c, { action: 'PASSWORD_CHANGED', entityName: 'users', entityId: sessionResult.user.id, category: 'auth' }).catch(()=>{});
  return c.json({ success: true, message: 'Password updated successfully.' });
});

// GET /api/auth/list-sessions — List active sessions for current user
authRouter.get('/list-sessions', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const token = getSessionTokenFromCookie(c);
  if (!token) return c.json({ error: 'Unauthorized' }, 401);
  const db = getDb(c.env.DB);
  const sessionResult = await validateSessionToken(db, token);
  if (!sessionResult) return c.json({ error: 'Unauthorized' }, 401);
  const { sessions } = await import('../db/schema.js');
  const rows = await db.select().from(sessions).where(eq(sessions.userId, sessionResult.user.id)).all().catch(()=>[]);
  const list = (rows as any[]).map((s:any) => ({ token: s.token, createdAt: s.createdAt, updatedAt: s.updatedAt, ipAddress: s.ipAddress, userAgent: s.userAgent, isCurrent: s.token === token }));
  return c.json(list);
});

// POST /api/auth/revoke-session — Revoke a single session by token
authRouter.post('/revoke-session', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const token = getSessionTokenFromCookie(c);
  if (!token) return c.json({ error: 'Unauthorized' }, 401);
  const db = getDb(c.env.DB);
  const sessionResult = await validateSessionToken(db, token);
  if (!sessionResult) return c.json({ error: 'Unauthorized' }, 401);
  const body = await c.req.json().catch(() => ({})) as any;
  const targetToken = String(body?.token || '');
  if (!targetToken) return c.json({ error: 'Session token is required' }, 400);
  if (targetToken === token) return c.json({ error: 'Cannot revoke current session via this endpoint. Use sign-out.' }, 400);
  const { sessions } = await import('../db/schema.js');
  // Ensure the target belongs to the same user
  const [target] = await db.select().from(sessions).where(eq(sessions.token, targetToken)).limit(1).catch(()=>[] as any);
  if (!target || (target as any).userId !== sessionResult.user.id) return c.json({ error: 'Session not found' }, 404);
  await db.delete(sessions).where(eq(sessions.token, targetToken));
  return c.json({ success: true });
});

// POST /api/auth/revoke-other-sessions — Revoke all other sessions except current
authRouter.post('/revoke-other-sessions', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const token = getSessionTokenFromCookie(c);
  if (!token) return c.json({ error: 'Unauthorized' }, 401);
  const db = getDb(c.env.DB);
  const sessionResult = await validateSessionToken(db, token);
  if (!sessionResult) return c.json({ error: 'Unauthorized' }, 401);
  const { sessions } = await import('../db/schema.js');
  const all = await db.select().from(sessions).where(eq(sessions.userId, sessionResult.user.id)).all().catch(()=>[] as any[]);
  let revoked = 0;
  for (const s of (all as any[])) {
    if (s.token !== token) { await db.delete(sessions).where(eq(sessions.token, s.token)); revoked++; }
  }
  return c.json({ success: true, revoked });
});

// GET /api/auth/login-history — Recent logins for Security Center (client & staff, own data only)
authRouter.get('/login-history', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const token = getSessionTokenFromCookie(c);
  if (!token) return c.json({ error: 'Unauthorized' }, 401);
  const db = getDb(c.env.DB);
  const sessionResult = await validateSessionToken(db, token);
  if (!sessionResult) return c.json({ error: 'Unauthorized' }, 401);
  const { sessions: sessTbl } = await import('../db/schema.js');
  const rows = await db.select().from(sessTbl).where(eq(sessTbl.userId, sessionResult.user.id)).all().catch(()=>[] as any[]);
  // Also pull auditLog for richer history (IP/UA)
  const audits = await db.select().from(auditLog).where(eq(auditLog.actorId, sessionResult.user.id)).all().catch(()=>[] as any[]);
  const logins = audits.filter((a:any)=>a.action==='LOGIN_SUCCESS' || a.action==='LOGIN_NEW_IP').sort((a:any,b:any)=> (b.createdAt||0)-(a.createdAt||0)).slice(0,20);
  return c.json({ sessions: rows, logins });
});

// POST /api/auth/reauth — Re-authenticate for sensitive actions (ASVS 3.7.1, NIST AAL2)
// Requires current password and, if 2FA enabled, a valid TOTP code. On success, touches session updatedAt.
authRouter.post('/reauth', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const token = getSessionTokenFromCookie(c);
  if (!token) return c.json({ error: 'Unauthorized' }, 401);
  const db = getDb(c.env.DB);
  const sessionResult = await validateSessionToken(db, token);
  if (!sessionResult) return c.json({ error: 'Unauthorized' }, 401);
  const body = await c.req.json().catch(()=>({})) as any;
  const password = String(body?.password || '');
  const code = String(body?.code || '').trim();
  if (!password) return c.json({ error: 'Password is required for re-authentication' }, 400);
  const [u] = await db.select().from(users).where(eq(users.id, sessionResult.user.id)).limit(1);
  const ok = await verifyAndUpgradePassword(db, sessionResult.user.id, password, (u as any)?.passwordHash, users, eq);
  if (!ok) return c.json({ error: 'Re-auth failed — verify your password.', code: 'INVALID_PASSWORD' }, 400);
  if ((u as any)?.twoFactorEnabled) {
    if (!code || code.length!==6) return c.json({ error: '2FA code is required for re-authentication' }, 400);
    const [tf] = await db.select().from(twoFactor).where(eq(twoFactor.userId, sessionResult.user.id)).limit(1);
    if (!tf || !(await verifyTotp(code, tf.secret))) return c.json({ error: 'Invalid 2FA code' }, 400);
  }
  // Touch session to mark re-auth time (ASVS 3.3.2 / 3.7.1)
  const { sessions: sessTbl } = await import('../db/schema.js');
  await db.update(sessTbl).set({ updatedAt: new Date() }).where(eq(sessTbl.token, token)).catch(()=>{});
  await auditEvent(c, {action:'REAUTH_SUCCESS', entityName:'users', entityId: sessionResult.user.id, category:'auth'}).catch(()=>{});
  return c.json({ success: true, message: 'Re-authenticated' });
});

// POST /api/auth/otp/send — Request 6-digit email OTP (enumeration-safe, OWASP ASVS 2.2.1)
authRouter.post('/otp/send', async (c) => {
  console.log('[otp/send] HIT', { hasDB: !!c.env?.DB, ip: c.req.header('cf-connecting-ip') });
  // DEBUG: ultra-minimal handler to isolate 500 cause — if this still 500, bug is in middleware, not handler
  if (c.req.query('debug') === '1') return c.json({ success: true, debug: 'hit' });
  if (!c.env?.DB) return c.json({ error: 'Database not available' }, 500);
  const body = await c.req.json().catch(() => ({}));
  const email = String(body?.email || '').trim().toLowerCase();
  console.log('[otp/send] email', email);

  if (!email || !email.includes('@')) {
    return c.json({ error: 'Valid email address is required' }, 400);
  }

  // Generic success message for enumeration safety (NIST SP800-63B, OWASP 2.2.1)
  const genericSuccess = {
    success: true,
    message: 'If an account exists with this email, a 6-digit code has been sent. Please check your inbox (and spam folder). It expires in 10 minutes.',
    email,
  };

  try {
    // Rate limit BEFORE user lookup (prevent enumeration via timing) — 5/600s per email, fail-closed
    // Wrapped in try/catch so D1 table missing never throws 500 (vite proxy would show text/plain 500)
    let over = false;
    try {
      const r = await isRateLimited(c.env, { bucket: 'otp-send', windowSeconds: 600, limit: 5 }, email, {
        failClosed: true,
      });
      over = r.over;
    } catch (e:any) {
      console.error(`[otp] isRateLimited failed for ${email}:`, e?.message);
      // Fail-open enumeration-safe: treat as not over, proceed to generic
      over = false;
    }
    if (over) {
      // Still return generic 200 to avoid leaking that this email is rate-limited vs non-existent
      await auditEvent(c as any, { action: 'OTP_SEND_RATE_LIMITED', entityName: 'users', entityId: email, category: 'auth', afterState: { email } }).catch(()=>{});
      return c.json(genericSuccess);
    }

    const db = getDb(c.env.DB);
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user) {
      // Enumeration-safe: do NOT reveal absence — pretend success, but audit internally
      await auditEvent(c as any, { action: 'OTP_SEND_UNKNOWN_EMAIL', entityName: 'users', entityId: email, category: 'auth', afterState: { email } }).catch(()=>{});
      // Small random delay to equalize timing vs real send (mitigate timing enumeration)
      await new Promise(r => setTimeout(r, 120 + Math.floor(Math.random()*80)));
      return c.json(genericSuccess);
    }

    // Block suspended/archived even for OTP (no info leak — we already returned generic if not found, but for existing we must 403)
    const userStatus = (user as any).status || 'active';
    if (userStatus === 'suspended' || userStatus === 'archived') {
      await auditEvent(c as any, { action: 'OTP_SEND_BLOCKED_STATUS', entityName: 'users', entityId: user.id, category: 'auth', afterState: { status: userStatus } }).catch(()=>{});
      // Still enumeration-safe? For existing but blocked, we must reveal 403 so user knows to contact admin — not an enumeration leak (they already know email exists because they tried)
      return c.json({ error: userStatus === 'suspended' ? 'Account suspended — contact admin' : 'Account archived — contact admin to restore', code: userStatus === 'suspended' ? 'ACCOUNT_SUSPENDED' : 'ACCOUNT_ARCHIVED' }, 403);
    }

    // Secure 6-digit OTP via WebCrypto (not Math.random — NIST approved)
    const buf = new Uint32Array(1);
    crypto.getRandomValues(buf);
    const rawOtp = String(100000 + (buf[0] % 900000));
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

    // Dispatch OTP email — fail-open: log but never throw 500 to client (would leak info via 500 vs 200)
    try {
      await sendOtpEmail(c.env, db, user, rawOtp);
    } catch (e:any) {
      console.error(`[otp] sendOtpEmail failed for ${email}:`, e?.message || e);
      await auditEvent(c as any, { action: 'OTP_EMAIL_FAILED', entityName: 'users', entityId: user.id, category: 'auth', afterState: { error: String(e?.message || e) } }).catch(()=>{});
      // Still return generic success — email infra failure is ops, not user error
    }

    await auditEvent(c as any, { action: 'OTP_SENT', entityName: 'users', entityId: user.id, category: 'auth', afterState: { email } }).catch(()=>{});

    return c.json(genericSuccess);
  } catch (e:any) {
    console.error(`[otp/send] unexpected error for ${email}:`, e?.message, e?.stack);
    // Fail-open enumeration-safe: still return generic 200, not 500 (500 would leak via status)
    await auditEvent(c as any, { action: 'OTP_SEND_FAILED', entityName: 'users', entityId: email, category: 'auth', afterState: { error: String(e?.message || e) } }).catch(()=>{});
    return c.json(genericSuccess);
  }
});

// POST /api/auth/send-verification-email — enumeration-safe (OWASP): always 200 generic
authRouter.post('/send-verification-email', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'Database not available' }, 500);
  const body = await c.req.json().catch(() => ({}));
  const email = String(body?.email || '').trim().toLowerCase();

  if (!email || !email.includes('@')) {
    return c.json({ error: 'Valid email address is required' }, 400);
  }

  const genericSuccess = {
    success: true,
    message: 'If an account exists with this email, a verification link has been sent. Please check your inbox (and spam folder).',
  };

  const { over } = await isRateLimited(c.env, { bucket: 'email-verification', windowSeconds: 900, limit: 10 }, email, {
    failClosed: true,
  });
  if (over) {
    await auditEvent(c as any, { action: 'VERIFY_EMAIL_RATE_LIMITED', entityName: 'users', entityId: email, category: 'auth' }).catch(()=>{});
    return c.json(genericSuccess);
  }

  try {
    const db = getDb(c.env.DB);
    const [user] = await db.select().from(users).where(eq(users.email, email)).limit(1);
    if (!user) {
      await auditEvent(c as any, { action: 'VERIFY_EMAIL_UNKNOWN', entityName: 'users', entityId: email, category: 'auth' }).catch(()=>{});
      await new Promise(r => setTimeout(r, 120 + Math.floor(Math.random()*80)));
      return c.json(genericSuccess);
    }

    if (user.emailVerified) {
      // Already verified — still return generic to avoid leaking, but audit
      await auditEvent(c as any, { action: 'VERIFY_EMAIL_ALREADY_VERIFIED', entityName: 'users', entityId: user.id, category: 'auth' }).catch(()=>{});
      return c.json(genericSuccess);
    }

    const token = generateRandomToken(32);
    const identifier = `verification:${user.id}`;
    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    await db.delete(verifications).where(eq(verifications.identifier, identifier)).catch(() => {});
    await db.insert(verifications).values({
      id: crypto.randomUUID(),
      identifier,
      value: token,
      attempts: 0,
      expiresAt,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const callbackBase = body?.callbackURL || (c.env as any)?.BETTER_AUTH_URL || 'https://app.opusoverseas.com';
    const verifyUrl = `${callbackBase}/verify-email?token=${encodeURIComponent(token)}`;
    try {
      await sendVerificationEmailSafe(c.env, db, user, verifyUrl);
    } catch (e:any) {
      console.error(`[verify-email] send failed for ${email}:`, e?.message);
      await auditEvent(c as any, { action: 'VERIFY_EMAIL_SEND_FAILED', entityName: 'users', entityId: user.id, category: 'auth', afterState: { error: String(e?.message||e) } }).catch(()=>{});
    }

    await auditEvent(c as any, { action: 'VERIFY_EMAIL_SENT', entityName: 'users', entityId: user.id, category: 'auth' }).catch(()=>{});
    return c.json(genericSuccess);
  } catch (e:any) {
    console.error(`[verify-email] unexpected for ${email}:`, e?.message);
    await auditEvent(c as any, { action: 'VERIFY_EMAIL_FAILED', entityName: 'users', entityId: email, category: 'auth', afterState: { error: String(e?.message||e) } }).catch(()=>{});
    return c.json(genericSuccess);
  }
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
  const otpStatus = (user as any).status || 'active';
  if (otpStatus === 'suspended') return c.json({ error: 'Account suspended — contact admin', code: 'ACCOUNT_SUSPENDED' }, 403);
  if (otpStatus === 'archived') return c.json({ error: 'Account archived — contact admin to restore', code: 'ACCOUNT_ARCHIVED' }, 403);

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