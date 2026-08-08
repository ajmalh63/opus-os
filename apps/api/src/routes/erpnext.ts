import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { getDb } from '../db/client.js';
import { erpnextSyncLog, payments, clients } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { erpHealth, erpUpsert, buildInvoicePayload } from '../infra/erpnext.js';
import { auditEvent } from '../middleware/audit.js';

type ErpBindings = {
  DB: D1Database;
  BETTER_AUTH_SECRET: string;
  ERPNEXT_BASE_URL?: string;
  ERPNEXT_API_KEY?: string;
  ERPNEXT_API_SECRET?: string;
};

export const erpnextRouter = new Hono<{ Bindings: ErpBindings }>();
export const erpnextPublicWebhookRouter = new Hono<{ Bindings: ErpBindings }>();

// GET /api/erpnext/health — connectivity probe to the Frappe instance (owner only)
erpnextRouter.get('/health', async (c) => {
  const res = await erpHealth(c.env);
  if (!res.ok) return c.json({ error: res.message || 'ERPNext unreachable' }, 502);
  return c.json({ success: true, message: res.message });
});

// POST /api/erpnext/payments/:id/sync — push one payment → Sales Invoice now (owner only)
erpnextRouter.post('/payments/:id/sync', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const paymentId = c.req.param('id');
  try {
    const payment = await db.select().from(payments).where(eq(payments.id, paymentId)).get();
    if (!payment) return c.json({ error: 'Payment not found' }, 404);

    const client = await db.select().from(clients).where(eq(clients.id, payment.clientId)).get();
    const payload = buildInvoicePayload(payment as any, client ? { name: client.name, email: client.email, phone: client.phone } : null);

    const res = await erpUpsert(c.env, 'Sales Invoice', payload as any);
    const now = Math.floor(Date.now() / 1000);
    const logId = crypto.randomUUID();

    if (res.ok) {
      await db.insert(erpnextSyncLog).values({
        id: logId,
        entityName: 'payments',
        entityId: paymentId,
        doctype: 'Sales Invoice',
        payloadJson: JSON.stringify(payload),
        status: 'synced',
        attempts: 1,
        erpDocName: (res.data as any)?.name || paymentId,
        error: null,
        createdAt: now,
        syncedAt: now,
      });
      await auditEvent(c, { action: 'ERP_SYNCED', entityName: 'payments', entityId: paymentId, afterState: { doctype: 'Sales Invoice', erpDoc: (res.data as any)?.name } });
      return c.json({ success: true, erpDoc: (res.data as any)?.name, logId });
    }

    await db.insert(erpnextSyncLog).values({
      id: logId,
      entityName: 'payments',
      entityId: paymentId,
      doctype: 'Sales Invoice',
      payloadJson: JSON.stringify(payload),
      status: 'failed',
      attempts: 1,
      error: res.message || 'ERPNext push failed',
      createdAt: now,
    });
    await auditEvent(c, { action: 'ERP_SYNC_FAILED', entityName: 'payments', entityId: paymentId, afterState: { error: res.message } });
    return c.json({ error: true, message: res.message || 'ERPNext push failed', status: res.status }, 502);
  } catch (e: any) {
    return c.json({ error: 'ERPNext sync failed', details: e?.message }, 500);
  }
});

// GET /api/erpnext/sync-log — audit trail of what was pushed (owner only, newest first)
erpnextRouter.get('/sync-log', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const rows = await db.select().from(erpnextSyncLog).all();
  const list = rows
    .sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0))
    .map((r: any) => ({
      id: r.id, entityName: r.entityName, entityId: r.entityId, doctype: r.doctype,
      status: r.status, attempts: r.attempts, erpDocName: r.erpDocName, error: r.error,
      createdAt: r.createdAt, syncedAt: r.syncedAt,
    }));
  return c.json({ entries: list });
});

// POST /api/erpnext/sync/pending — re-attempt all failed/pending rows (owner only, bounded)
erpnextRouter.post('/sync/pending', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const rows = (await db.select().from(erpnextSyncLog).all())
    .filter((r: any) => r.status === 'pending' || r.status === 'failed');
  let pushed = 0, failed = 0;
  const now = Math.floor(Date.now() / 1000);
  for (const r of rows) {
    // parse payload (already-sent invoice) and re-attempt
    const payload = JSON.parse(r.payloadJson || '{}') as Record<string, any>;
    const res = await erpUpsert(c.env, r.doctype, payload, undefined);
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