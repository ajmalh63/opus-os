import { Hono } from 'hono';
import { getDb } from '../db/client.js';
import { staffAlerts, appSettings } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { getAlertTypesForRole, ALERT_TYPES } from '../infra/staffAlerts.js';
import { auditEvent } from '../middleware/audit.js';

// Staff alert feed — mounted at /api/staff/alerts (rbacMiddleware: all staff roles).
export const staffAlertsRouter = new Hono<{
  Bindings: { DB: D1Database; BETTER_AUTH_SECRET: string };
  Variables: { user?: { id?: string; role?: string } | null };
}>();

// GET /api/staff/alerts — latest alerts visible to the caller's role
staffAlertsRouter.get('/', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const role = c.get('user')?.role || 'counselor';
  try {
    const allowed = await getAlertTypesForRole(c.env, role);
    const rows = await db.select().from(staffAlerts).orderBy(desc(staffAlerts.createdAt)).limit(50).all();
    const visible = allowed.includes('*')
      ? rows
      : rows.filter((r) => allowed.includes(r.type));
    const list = visible.map((r: any) => {
      let payload = null;
      try { payload = r.payloadJson ? JSON.parse(r.payloadJson) : null; } catch { payload = null; }
      return {
        id: r.id, division: r.division, type: r.type, title: r.title, body: r.body,
        payload, clientId: r.clientId, status: r.status, createdAt: r.createdAt,
      };
    });
    return c.json({ success: true, alerts: list, newCount: list.filter((a: any) => a.status === 'new').length });
  } catch (e: any) {
    return c.json({ error: 'Failed to fetch alerts', details: e?.message }, 500);
  }
});

// POST /api/staff/alerts/:id/seen — mark an alert as seen
staffAlertsRouter.post('/:id/seen', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const id = c.req.param('id');
  try {
    await db.update(staffAlerts).set({ status: 'seen' }).where(eq(staffAlerts.id, id));
    return c.json({ success: true });
  } catch (e: any) {
    return c.json({ error: 'Failed to update alert', details: e?.message }, 500);
  }
});

// GET /api/staff/alerts/visibility — current per-role visibility config (superadmin)
// DELETE /api/staff/alerts/:id — dismiss a single alert
staffAlertsRouter.delete('/:id', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  try {
    const row = await db.select().from(staffAlerts).where(eq(staffAlerts.id, c.req.param('id'))).get();
    if (!row) return c.json({ error: 'Alert not found' }, 404);
    await db.delete(staffAlerts).where(eq(staffAlerts.id, row.id));
    return c.json({ success: true, message: 'Alert dismissed.' });
  } catch (e: any) {
    return c.json({ error: 'Alert dismissal failed', details: e?.message }, 500);
  }
});

// POST /api/staff/alerts/clear — clear all SEEN alerts (done notifications)
staffAlertsRouter.post('/clear', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  try {
    const rows = await db.select().from(staffAlerts).all();
    const seen = rows.filter(r => r.status === 'seen');
    for (const r of seen) {
      await db.delete(staffAlerts).where(eq(staffAlerts.id, r.id));
    }
    return c.json({ success: true, cleared: seen.length, message: `${seen.length} notifications cleared.` });
  } catch (e: any) {
    return c.json({ error: 'Clear failed', details: e?.message }, 500);
  }
});

staffAlertsRouter.get('/visibility', async (c) => {
  if (c.get('user')?.role !== 'super_admin') return c.json({ error: 'Forbidden' }, 403);
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  try {
    const row = await db.select().from(appSettings).where(eq(appSettings.key, 'staff_alert_visibility')).get();
    return c.json({ success: true, visibility: row?.value ? JSON.parse(row.value) : null, types: ALERT_TYPES });
  } catch (e: any) {
    return c.json({ error: 'Failed to fetch visibility', details: e?.message }, 500);
  }
});

// PUT /api/staff/alerts/visibility — set per-role visibility (superadmin)
staffAlertsRouter.put('/visibility', async (c) => {
  if (c.get('user')?.role !== 'super_admin') return c.json({ error: 'Forbidden' }, 403);
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const body = await c.req.json().catch(() => ({})) as { visibility?: Record<string, string[]> };
  const now = Math.floor(Date.now() / 1000);
  try {
    const value = JSON.stringify(body.visibility || {});
    await db.insert(appSettings).values({ key: 'staff_alert_visibility', value, updatedAt: now })
      .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: now } });
    await auditEvent(c as any, { action: 'ALERT_VISIBILITY_UPDATED', entityName: 'app_settings', entityId: 'staff_alert_visibility', afterState: { value } }).catch(() => {});
    return c.json({ success: true, visibility: body.visibility || {} });
  } catch (e: any) {
    return c.json({ error: 'Failed to update visibility', details: e?.message }, 500);
  }
});
