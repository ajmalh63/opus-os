// Automation lane (n8n spine, Wave 2).
// Mounted at /api/automation; gated by serviceTokenMiddleware (fail-closed).
// Exposes exactly what the 5 n8n workflows need — nothing human-facing, no
// RBAC routes. Read-only + one idempotent write (kill/retry) per workflow.

import { Hono } from 'hono';
import { getDb } from '../db/client.js';
import { nurtureTouches, erpnextSyncLog } from '../db/schema.js';
import { and, eq, lte } from 'drizzle-orm';
import { erpHealth, erpUpsert } from '../infra/erpnext.js';

type Body = { DB: D1Database; AUTOMATION_TOKEN?: string; ERPNEXT_BASE_URL?: string; ERPNEXT_API_KEY?: string; ERPNEXT_API_SECRET?: string };

export const automationRouter = new Hono<{ Bindings: Body }>();

// GET /api/automation/health — what n8n polls (per the 5-workflow spine)
automationRouter.get('/health', async (c) => {
  let erp = 'unknown';
  if (c.env.ERPNEXT_BASE_URL) {
    const r = await erpHealth(c.env as any);
    erp = r.ok ? 'up' : 'down';
  }
  const db = getDb(c.env.DB);
  const now = Number(c.req.query('now')) || Math.floor(Date.now() / 1000);
  const due = await db.select({ id: nurtureTouches.id }).from(nurtureTouches)
    .where(and(eq(nurtureTouches.status, 'scheduled'), lte(nurtureTouches.dueAt, now))).all().catch(() => []);
  return c.json({ ok: true, services: { db: 'up', erp, automation: 'up' }, dueNurtureTouches: due.length });
});

// GET /api/automation/nurture/due — provider-consumer pull (workflow: nurture-due)
automationRouter.get('/nurture/due', async (c) => {
  const db = getDb(c.env.DB);
  const now = Number(c.req.query('now')) || Math.floor(Date.now() / 1000);
  const rows = await db.select().from(nurtureTouches)
    .where(and(eq(nurtureTouches.status, 'scheduled'), lte(nurtureTouches.dueAt, now))).all();
  return c.json({ touches: rows });
});

// POST /api/automation/nurture/:id/send — mark touch dispatched (idempotent)
automationRouter.post('/nurture/:id/send', async (c) => {
  const db = getDb(c.env.DB);
  const id = c.req.param('id');
  const now = Math.floor(Date.now() / 1000);
  const found = await db.select({id: nurtureTouches.id, status: nurtureTouches.status}).from(nurtureTouches).where(eq(nurtureTouches.id, id)).all();
  if (found.length === 0) return c.json({ error: 'not found' }, 404);
  if (found[0].status === 'sent') return c.json({ id, status: 'sent' });
  await db.update(nurtureTouches).set({ status: 'sent', sentAt: now }).where(eq(nurtureTouches.id, id)).run();
  return c.json({ id, status: 'sent' });
});

// GET /api/automation/erp/sync-log — n8n polls failed rows for alerting
automationRouter.get('/erp/sync-log', async (c) => {
  const db = getDb(c.env.DB);
  const rows = await db.select().from(erpnextSyncLog).all();
  const list = rows.sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 50)
    .map((r: any) => ({ id: r.id, entityId: r.entityId, doctype: r.doctype, status: r.status, error: r.error, attempts: r.attempts }));
  return c.json({ entries: list });
});

// POST /api/automation/erp/sync/pending — n8n retries failed rows (bounded)
automationRouter.post('/erp/sync/pending', async (c) => {
  const db = getDb(c.env.DB);
  const rows = (await db.select().from(erpnextSyncLog).all())
    .filter((r: any) => r.status === 'pending' || r.status === 'failed');
  let pushed = 0, failed = 0;
  const now = Math.floor(Date.now() / 1000);
  for (const r of rows.slice(0, 25)) {
    const payload = JSON.parse(r.payloadJson || '{}') as Record<string, any>;
    const res = await erpUpsert(c.env as any, r.doctype, payload);
    if (res.ok) {
      await db.update(erpnextSyncLog)
        .set({ status: 'synced', attempts: (r.attempts || 0) + 1, erpDocName: (res.data as any)?.name || r.entityId, syncedAt: now, error: null })
        .where(eq(erpnextSyncLog.id, r.id));
      pushed++;
    } else {
      await db.update(erpnextSyncLog)
        .set({ status: 'failed', attempts: (r.attempts || 0) + 1, error: res.message || 'ERPNext push failed' })
        .where(eq(erpnextSyncLog.id, r.id));
      failed++;
    }
  }
  return c.json({ success: true, pushed, failed, total: rows.length });
});