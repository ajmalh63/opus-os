import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { registerStaffSchema } from '@opusos/shared';
import { getDb } from '../db/client.js';
import { users, auditLog, runtimeLogs } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAuth } from '../auth.js';
import { auditEvent } from '../middleware/audit.js';

export const adminRouter = new Hono<{ Bindings: { DB: D1Database; BETTER_AUTH_SECRET: string; BETTER_AUTH_URL?: string } }>();

// GET /api/admin/runtime-logs — in-OS runtime log viewer (super_admin)
adminRouter.get('/runtime-logs', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const limit = Math.min(Number(c.req.query('limit') || 200), 500);
  const level = c.req.query('level') || '';
  const source = c.req.query('source') || '';
  const rows = await db.select().from(runtimeLogs).all();
  const filtered = rows
    .filter(r => (!level || r.level === level) && (!source || r.source.includes(source)))
    .sort((a, b) => b.createdAt - a.createdAt)
    .slice(0, limit);
  const sources = [...new Set(rows.map(r => r.source))].sort();
  return c.json({ success: true, logs: filtered, sources });
});

// GET /api/admin/audit-logs (Audit trails fetch) — newest first, bounded
adminRouter.get('/audit-logs', async (c) => {
  if (!c.env || !c.env.DB) {
    return c.json({ error: "DB not available" }, 500);
  }

  const db = getDb(c.env.DB);

  try {
    const rows = await db.select().from(auditLog).all();
    const list = [...rows].sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 250);
    return c.json({ logs: list });
  } catch (error: any) {
    return c.json({ error: "Failed to fetch audit logs", details: error.message }, 500);
  }
});

// GET /api/admin/staff (List staff users)
// NEVER returns the passwordHash — that column leaves the DB only for
// Better Auth's own verification; it is stripped from API responses.
adminRouter.get('/staff', async (c) => {
  if (!c.env || !c.env.DB) {
    return c.json({ error: "DB not available" }, 500);
  }

  const db = getDb(c.env.DB);

  try {
    const rows = await db.select().from(users).all();
    const staff = rows.map((u: any) => {
      const { passwordHash, ...safe } = u;
      void passwordHash;
      return safe;
    });
    return c.json({ staff });
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
const scopeSchema = z.object({ userDivisions: z.array(z.string().min(1)).max(10) });

adminRouter.post('/staff/:id/scope', zValidator('json', scopeSchema), async (c) => {
  const staffId = c.req.param('id');
  const body = c.req.valid('json');

  if (!c.env || !c.env.DB) {
    return c.json({ error: "DB not available" }, 500);
  }

  const db = getDb(c.env.DB);

  try {
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

    // Audit: division scope changes alter what data staff can touch.
    await auditEvent(c, {
      action: 'STAFF_SCOPE_UPDATE',
      entityName: 'users',
      entityId: staffId,
      afterState: { userDivisions: body.userDivisions },
    });

    return c.json({ success: true, message: "Staff division scopes updated successfully." });
  } catch (error: any) {
    return c.json({ error: "Scope update transaction failed", details: error.message }, 500);
  }
});
