import { Hono } from 'hono';
import { getDb } from '../db/client.js';
import { notifications } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';

// Notification log (§7.6) — end-to-end outbound message audit. Owner-only.
export const notificationsRouter = new Hono<{ Bindings: { DB: D1Database } }>();

// GET /api/admin/notifications?clientId=&limit= — delivery log, newest first
notificationsRouter.get('/', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const clientId = c.req.query('clientId');
  const limit = Math.min(200, Number(c.req.query('limit')) || 50);

  try {
    let rows;
    if (clientId) {
      rows = await db.select().from(notifications).where(eq(notifications.clientId, clientId)).orderBy(desc(notifications.createdAt)).limit(limit).all();
    } else {
      rows = await db.select().from(notifications).orderBy(desc(notifications.createdAt)).limit(limit).all();
    }
    return c.json({ notifications: rows });
  } catch (e: any) {
    return c.json({ error: 'Notification log lookup failed', details: e.message }, 500);
  }
});