// Automation lane (n8n spine, Wave 2).
// Mounted at /api/automation; gated by serviceTokenMiddleware (fail-closed).
// Exposes exactly what the 5 n8n workflows need — nothing human-facing, no
// RBAC routes. Read-only + one idempotent write (kill/retry) per workflow.

import { Hono } from 'hono';
import { getDb } from '../db/client.js';
import { nurtureTouches, erpnextSyncLog, clients, communications } from '../db/schema.js';
import { and, eq, lte } from 'drizzle-orm';
import { erpHealth, erpUpsert } from '../infra/erpnext.js';
import { sendNotification } from '../infra/notify.js';
import { auditEvent } from '../middleware/audit.js';

type Body = {
  DB: D1Database; AUTOMATION_TOKEN?: string;
  ERPNEXT_BASE_URL?: string; ERPNEXT_API_KEY?: string; ERPNEXT_API_SECRET?: string;
  WA_PROVIDER?: 'openwa' | 'meta';
  OPENWA_BASE_URL?: string; OPENWA_API_KEY?: string; OPENWA_SESSION_ID?: string;
  META_WHATSAPP_PHONE_ID?: string; META_WHATSAPP_TOKEN?: string;
};

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

// POST /api/automation/nurture/:id/send — dispatch a due touch for real:
// personalizes the campaign body, sends via WhatsApp provider (OpenWA/Meta),
// records a communication + audit, then marks the touch sent. Idempotent:
// already-sent touches return without re-sending. On provider failure the
// touch stays 'scheduled' so the n8n retry keeps polling.
automationRouter.post('/nurture/:id/send', async (c) => {
  const db = getDb(c.env.DB);
  const id = c.req.param('id');
  const now = Math.floor(Date.now() / 1000);

  const found = await db.select().from(nurtureTouches).where(eq(nurtureTouches.id, id)).all();
  if (found.length === 0) return c.json({ error: 'not found' }, 404);
  const touch = found[0];
  if (touch.status === 'sent') return c.json({ id, status: 'sent' });

  const client = await db.select().from(clients).where(eq(clients.id, touch.clientId)).get();
  if (!client) return c.json({ error: 'client not found', touchId: id }, 404);
  if (!client.phone) return c.json({ error: 'client has no phone', touchId: id }, 400);

  // Personalisation: {{name}} + any dynamicContext keys (targetCountry, sector, …)
  let context: Record<string, any> = {};
  try { context = client.intakeContext ? JSON.parse(client.intakeContext) : {}; } catch { /* keep {} */ }
  const body = touch.body
    .replace(/\{\{\s*name\s*\}\}/g, client.name || 'there')
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => String(context[k] ?? `{{${k}}}`));

  const res = await sendNotification(c.env as any, db as any, {
    channel: 'whatsapp', to: client.phone, body, clientId: client.id,
  });
  if (!res.ok) {
    return c.json({ error: 'send failed', reason: res.reason || 'unknown', touchId: id }, 502);
  }

  // Durable record of the outbound message + audit — then flip the touch.
  await db.insert(communications).values({
    id: crypto.randomUUID(),
    clientId: client.id,
    senderId: null,
    channel: 'whatsapp',
    direction: 'outgoing',
    subject: `nurture:${touch.campaignId || 'default'}:${touch.stage}`,
    body,
    createdAt: now,
  }).catch(() => {});
  await auditEvent(c, { action: 'NURTURE_DISPATCHED', entityName: 'nurture_touches', entityId: id, afterState: { clientId: client.id, stage: touch.stage, provider: res.provider, remoteId: res.remoteId } });
  await db.update(nurtureTouches).set({ status: 'sent', sentAt: now }).where(eq(nurtureTouches.id, id)).run();
  return c.json({ id, status: 'sent', provider: res.provider, remoteId: res.remoteId });
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