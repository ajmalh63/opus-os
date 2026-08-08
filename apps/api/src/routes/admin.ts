import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { registerStaffSchema } from '@opusos/shared';
import { getDb } from '../db/client.js';
import { users, auditLog } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAuth } from '../auth.js';

export const adminRouter = new Hono<{ Bindings: { DB: D1Database; BETTER_AUTH_SECRET: string; BETTER_AUTH_URL?: string } }>();

// GET /api/admin/audit-logs (Audit trails fetch)
adminRouter.get('/audit-logs', async (c) => {
  if (!c.env || !c.env.DB) {
    return c.json({ error: "DB not available" }, 500);
  }

  const db = getDb(c.env.DB);

  try {
    const list = await db.select().from(auditLog).all();
    return c.json({ logs: list });
  } catch (error: any) {
    return c.json({ error: "Failed to fetch audit logs", details: error.message }, 500);
  }
});

// GET /api/admin/staff (List staff users)
adminRouter.get('/staff', async (c) => {
  if (!c.env || !c.env.DB) {
    return c.json({ error: "DB not available" }, 500);
  }

  const db = getDb(c.env.DB);

  try {
    const list = await db.select().from(users).all();
    return c.json({ staff: list });
  } catch (error: any) {
    return c.json({ error: "Failed to fetch staff list", details: error.message }, 500);
  }
});

// POST /api/admin/register-staff (Register staff & configure scopes)
adminRouter.post('/register-staff', zValidator('json', registerStaffSchema), async (c) => {
  const data = c.req.valid('json');

  if (!c.env || !c.env.DB) {
    return c.json({ error: "DB not available" }, 500);
  }

  const db = getDb(c.env.DB);

  try {
    // Create the account through Better Auth itself so password hashing +
    // verification share ONE implementation (avoids nodejs_compat scrypt drift
    // when we would hash manually). Returns a temp password when none given.
    const auth = getAuth(c.env);
    const tempPassword = data.password || `Opus${crypto.randomUUID().slice(0, 8)}!${Date.now().toString(36).slice(-4)}`;
    const result = await auth.api.signUpEmail({
      body: {
        name: data.name, email: data.email, password: tempPassword,
        role: data.role, userDivisions: JSON.stringify(data.userDivisions),
      },
      headers: c.req.raw.headers,
    });
    const id = (result as any)?.user?.id;
    if (!id) throw new Error('signUpEmail did not return a user id');
    await db.update(users).set({
      emailVerified: true, // staff accounts are admin-verified on creation
      role: data.role,
      userDivisions: JSON.stringify(data.userDivisions),
      updatedAt: new Date(),
    }).where(eq(users.id, id));

    return c.json({
      success: true,
      id,
      temporaryPassword: data.password ? undefined : tempPassword,
      message: "Staff user successfully registered and scoped."
    });
  } catch (error: any) {
    return c.json({ error: "Staff registration failed", details: error.message }, 500);
  }
});

// POST /api/admin/staff/:id/scope (Modify user division scopes)
adminRouter.post('/staff/:id/scope', async (c) => {
  const staffId = c.req.param('id');

  if (!c.env || !c.env.DB) {
    return c.json({ error: "DB not available" }, 500);
  }

  const db = getDb(c.env.DB);

  try {
    const body = await c.req.json();
    if (!body.userDivisions || !Array.isArray(body.userDivisions)) {
      return c.json({ error: "userDivisions list is required." }, 400);
    }

    const user = await db.select().from(users).where(eq(users.id, staffId)).get();
    if (!user) {
      return c.json({ error: "Staff user not found" }, 404);
    }

    await db
      .update(users)
      .set({
        userDivisions: JSON.stringify(body.userDivisions),
        updatedAt: new Date()
      })
      .where(eq(users.id, staffId));

    return c.json({ success: true, message: "Staff division scopes updated successfully." });
  } catch (error: any) {
    return c.json({ error: "Scope update transaction failed", details: error.message }, 500);
  }
});
