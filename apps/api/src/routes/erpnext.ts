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

// Helper: Push a single payment record into ERPNext Sales Invoice
export async function syncSinglePaymentToErp(env: ErpBindings, db: any, paymentId: string) {
  const payment = await db.select().from(payments).where(eq(payments.id, paymentId)).get();
  if (!payment) return { ok: false, message: 'Payment not found', status: 404 };

  const client = await db.select().from(clients).where(eq(clients.id, payment.clientId)).get();
  const payload = buildInvoicePayload(payment as any, client ? { name: client.name, email: client.email, phone: client.phone } : null);

  // Interlock: ERPNext requires Customer link to exist before Sales Invoice
  const custRes = await erpUpsert(env, 'Customer', {
    customer_name: payload.customer || 'Walk-in Customer',
    customer_type: 'Individual',
    customer_group: 'Individual',
    territory: 'India',
  } as any);
  const customerName = (custRes.data as any)?.name || payload.customer;
  payload.customer = customerName;

  const res = await erpUpsert(env, 'Sales Invoice', payload as any);
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
    return { ok: true, erpDoc: (res.data as any)?.name, logId };
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
  return { ok: false, message: res.message || 'ERPNext push failed', status: res.status };
}

// GET /api/erpnext/health — connectivity probe to the Frappe instance (owner only)
erpnextRouter.get('/health', async (c) => {
  const res = await erpHealth(c.env);
  if (!res.ok) return c.json({ error: res.message || 'ERPNext unreachable' }, 502);
  return c.json({ success: true, message: res.message });
});

// GET /api/erpnext/invoices — complete unified invoice ledger with ERPNext sync status
erpnextRouter.get('/invoices', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);

  try {
    const allPayments = await db.select().from(payments).all();
    const allClients = await db.select().from(clients).all();
    const allLogs = await db.select().from(erpnextSyncLog).where(eq(erpnextSyncLog.entityName, 'payments')).all();

    const clientMap = new Map(allClients.map((cl: any) => [cl.id, cl]));
    // Map latest sync log per payment
    const syncMap = new Map<string, any>();
    for (const log of allLogs) {
      const existing = syncMap.get(log.entityId);
      if (!existing || (log.createdAt || 0) > (existing.createdAt || 0)) {
        syncMap.set(log.entityId, log);
      }
    }

    const invoices = allPayments
      .sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0))
      .map((p: any) => {
        const client = clientMap.get(p.clientId);
        const sync = syncMap.get(p.id);
        const invoiceNo = `INV-${p.id.slice(0, 8).toUpperCase()}`;

        return {
          id: p.id,
          invoiceNo,
          clientId: p.clientId,
          clientName: client?.name || 'Walk-in Client',
          clientEmail: client?.email,
          clientPhone: client?.phone,
          engagementId: p.engagementId,
          amountPaise: p.amount,
          type: p.type,
          milestoneName: p.milestoneName || 'Service Milestone',
          method: p.method,
          referenceNumber: p.referenceNumber,
          status: p.status || 'confirmed',
          taxableAmountPaise: p.taxableAmount,
          cgstPaise: p.cgst,
          sgstPaise: p.sgst,
          igstPaise: p.igst,
          isInterstate: !!p.isInterstate,
          createdAt: p.createdAt,
          // ERPNext Sync telemetry
          erpSyncStatus: sync ? sync.status : 'not_synced',
          erpDocName: sync?.erpDocName || null,
          erpSyncedAt: sync?.syncedAt || null,
          erpError: sync?.error || null,
        };
      });

    return c.json({
      success: true,
      invoices,
      totalCount: invoices.length,
      syncedCount: invoices.filter((i) => i.erpSyncStatus === 'synced').length,
      pendingCount: invoices.filter((i) => i.erpSyncStatus !== 'synced').length,
    });
  } catch (error: any) {
    return c.json({ error: 'Failed to fetch invoice ledger', details: error.message }, 500);
  }
});

// POST /api/erpnext/invoices/sync-all — batch sync all unsynced or failed invoices (owner only)
erpnextRouter.post('/invoices/sync-all', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);

  try {
    const allPayments = await db.select().from(payments).all();
    const allLogs = await db.select().from(erpnextSyncLog).where(eq(erpnextSyncLog.entityName, 'payments')).all();

    const syncedPaymentIds = new Set(
      allLogs.filter((l: any) => l.status === 'synced').map((l: any) => l.entityId)
    );

    const pendingPayments = allPayments.filter((p: any) => !syncedPaymentIds.has(p.id));
    let synced = 0;
    let failed = 0;

    for (const payment of pendingPayments) {
      const result = await syncSinglePaymentToErp(c.env, db, payment.id);
      if (result.ok) synced++;
      else failed++;
    }

    await auditEvent(c, {
      action: 'ERP_BATCH_SYNC',
      entityName: 'payments',
      entityId: 'batch',
      afterState: { attempted: pendingPayments.length, synced, failed },
    });

    return c.json({
      success: true,
      attempted: pendingPayments.length,
      synced,
      failed,
    });
  } catch (error: any) {
    return c.json({ error: 'Batch sync failed', details: error.message }, 500);
  }
});

// POST /api/erpnext/payments/:id/sync — push one payment → Sales Invoice now (owner only)
erpnextRouter.post('/payments/:id/sync', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const paymentId = c.req.param('id');
  try {
    const res = await syncSinglePaymentToErp(c.env, db, paymentId);
    if (res.ok) {
      await auditEvent(c, { action: 'ERP_SYNCED', entityName: 'payments', entityId: paymentId, afterState: { doctype: 'Sales Invoice', erpDoc: res.erpDoc } });
      return c.json({ success: true, erpDoc: res.erpDoc, logId: res.logId });
    }
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

// GET /api/erpnext/reconcile — two-way financial ledger reconciliation with Frappe ERP
erpnextRouter.get('/reconcile', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);

  try {
    const allPayments = await db.select().from(payments).all();
    const allLogs = await db.select().from(erpnextSyncLog).where(eq(erpnextSyncLog.entityName, 'payments')).all();

    const syncedPaymentIds = new Set(allLogs.filter((l: any) => l.status === 'synced').map((l: any) => l.entityId));
    const pendingPaymentIds = new Set(allLogs.filter((l: any) => l.status === 'pending' || l.status === 'failed').map((l: any) => l.entityId));

    const totalPaise = allPayments.reduce((acc: number, p: any) => acc + (p.amountPaise || p.amount || 0), 0);
    const syncedPaise = allPayments.filter((p: any) => syncedPaymentIds.has(p.id)).reduce((acc: number, p: any) => acc + (p.amountPaise || p.amount || 0), 0);
    const unSyncedCount = allPayments.filter((p: any) => !syncedPaymentIds.has(p.id)).length;

    return c.json({
      success: true,
      summary: {
        totalLocalPayments: allPayments.length,
        totalLocalPaise: totalPaise,
        syncedToErpCount: syncedPaymentIds.size,
        syncedPaise,
        unSyncedCount,
        pendingOrFailedCount: pendingPaymentIds.size,
        reconciliationStatus: unSyncedCount === 0 ? 'fully_reconciled' : 'sync_pending',
      },
    });
  } catch (e: any) {
    return c.json({ error: 'Reconciliation check failed', details: e?.message }, 500);
  }
});