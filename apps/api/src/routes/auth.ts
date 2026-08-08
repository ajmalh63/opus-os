import { Hono } from 'hono';
import { getAuth } from '../auth.js';
import { getDb } from '../db/client.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { rateLimit } from '../middleware/rateLimit.js';

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

  return c.json({ success: true, created: true, email });
});

// All other /api/auth/* routes go to Better Auth (sign-in, sign-up, session, 2FA…)
authRouter.all('/*', (c) => {
  const auth = getAuth(c.env);
  return auth.handler(c.req.raw);
});