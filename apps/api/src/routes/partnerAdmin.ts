import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { getDb } from '../db/client.js';
import { partners } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { auditEvent } from '../middleware/audit.js';

// Partner management — owner ceiling (mounted under /api/admin).
// Owners approve/block partner accounts, edit referral codes.
export const partnerAdminRouter = new Hono<{ Bindings: { DB: D1Database; BETTER_AUTH_SECRET: string } }>();

// GET /api/admin/partners — full partner registry with masked PAN (owner)
partnerAdminRouter.get('/', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  try {
    const rows = await db.select().from(partners).all();
    return c.json({ partners: rows });
  } catch (e: any) {
    return c.json({ error: 'Partner registry lookup failed', details: e.message }, 500);
  }
});

// PATCH /api/admin/partners/:id/status — approve (active) / block
const statusSchema = z.object({ status: z.enum(['active', 'blocked']) });
partnerAdminRouter.patch('/:id/status', zValidator('json', statusSchema), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const id = c.req.param('id');
  const body = c.req.valid('json');
  try {
    const current = await db.select().from(partners).where(eq(partners.id, id)).get();
    if (!current) return c.json({ error: 'Partner not found' }, 404);
    await db.update(partners).set({ status: body.status }).where(eq(partners.id, id)).run();
    await auditEvent(c, {
      action: body.status === 'active' ? 'PARTNER_ACTIVATED' : 'PARTNER_BLOCKED',
      entityName: 'partners', entityId: id,
      afterState: { name: current.name, status: body.status, referralCode: current.referralCode },
    });
    return c.json({ success: true, id, status: body.status, message: `Partner '${current.name}' is now ${body.status}.` });
  } catch (e: any) {
    return c.json({ error: 'Partner status update failed', details: e.message }, 500);
  }
});