import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { getDb } from '../db/client.js';
import { paymentSchedules, payments, clients, engagements } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { publishSyncEvent } from './sync.js';
import { auditEvent } from '../middleware/audit.js';

export const ledgerRouter = new Hono<{ Bindings: { DB: D1Database } }>();
const now = () => Math.floor(Date.now()/1000);
const uid = () => `sch-${Date.now().toString(36)}-${crypto.randomUUID().slice(0,4)}`;

// POST /api/ledger/schedules/generate — create installment schedule for a booking
ledgerRouter.post('/schedules/generate', zValidator('json', z.object({
  clientId: z.string().min(3),
  bookingId: z.string().min(3),
  installments: z.array(z.object({ label: z.string().min(2), amount: z.number().int().positive(), dueAt: z.number().int() })).min(1).max(6),
})), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const { clientId, bookingId, installments } = c.req.valid('json') as any;
  // Ensure client exists
  const cl = await db.select().from(clients).where(eq(clients.id, clientId)).get();
  if (!cl) return c.json({ error: 'Client not found' }, 404);
  const total = installments.length;
  const rows: any[] = [];
  for (let i=0; i<installments.length; i++) {
    const inst = installments[i];
    const id = uid();
    const ts = now();
    const row = { id, clientId, bookingId, installmentNo: i+1, totalInstallments: total, label: inst.label, amount: inst.amount, dueAt: inst.dueAt, status: 'pending' as const, createdAt: ts, updatedAt: ts };
    await db.insert(paymentSchedules).values(row as any);
    rows.push(row);
  }
  await auditEvent(c as any, { action: 'LEDGER_SCHEDULE_CREATED', entityName: 'payment_schedules', entityId: bookingId, afterState: { clientId, bookingId, count: rows.length } });
  try { await publishSyncEvent(c.env as any, { channel: `client:${clientId}:payments`, type: 'LEDGER_SCHEDULE_CREATED', payload: { bookingId, count: rows.length } }, (c as any).executionCtx); } catch {}
  try { await publishSyncEvent(c.env as any, { channel: 'public:payments', type: 'LEDGER_SCHEDULE_CREATED', payload: { bookingId } }, (c as any).executionCtx); } catch {}
  try { await publishSyncEvent(c.env as any, { channel: 'staff:global:payments', type: 'LEDGER_SCHEDULE_CREATED', payload: { bookingId } }, (c as any).executionCtx); } catch {}
  return c.json({ success: true, schedules: rows });
});

// GET /api/ledger/schedules?clientId=&bookingId=
ledgerRouter.get('/schedules', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const clientId = c.req.query('clientId');
  const bookingId = c.req.query('bookingId');
  const conditions: any[] = [];
  if (clientId) conditions.push(eq(paymentSchedules.clientId, clientId));
  if (bookingId) conditions.push(eq(paymentSchedules.bookingId, bookingId));
  const where = conditions.length ? and(...conditions) : undefined;
  const rows = await db.select().from(paymentSchedules).where(where as any).orderBy(paymentSchedules.installmentNo).all();
  // Join with payments to derive paid status (if payment exists for that installment label)
  const pays = await db.select().from(payments).where(clientId ? eq(payments.clientId, clientId) : undefined as any).all().catch(()=>[]);
  const enriched = rows.map((r:any)=> {
    const paid = pays.find((p:any)=> p.milestoneName === r.label && p.engagementId === r.bookingId);
    const derivedStatus = paid ? 'paid' : (r.dueAt < now() && r.status === 'pending' ? 'overdue' : r.status);
    return { ...r, derivedStatus, paidRef: paid?.referenceNumber || null };
  });
  return c.json({ success: true, schedules: enriched });
});

// POST /api/ledger/schedules/:id/pay — mark installment paid (manager+)
ledgerRouter.post('/schedules/:id/pay', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const id = c.req.param('id');
  const row = await db.select().from(paymentSchedules).where(eq(paymentSchedules.id, id)).get();
  if (!row) return c.json({ error: 'Not found' }, 404);
  await db.update(paymentSchedules).set({ status: 'paid', updatedAt: now() } as any).where(eq(paymentSchedules.id, id));
  await auditEvent(c as any, { action: 'LEDGER_INSTALLMENT_PAID', entityName: 'payment_schedules', entityId: id, afterState: { bookingId: (row as any).bookingId } });
  try { await publishSyncEvent(c.env as any, { channel: `client:${(row as any).clientId}:payments`, type: 'LEDGER_INSTALLMENT_PAID', payload: { id, bookingId: (row as any).bookingId } }, (c as any).executionCtx); } catch {}
  try { await publishSyncEvent(c.env as any, { channel: 'public:payments', type: 'LEDGER_INSTALLMENT_PAID', payload: { id } }, (c as any).executionCtx); } catch {}
  return c.json({ success: true });
});

// POST /api/ledger/refund — refund per booking stage policy
ledgerRouter.post('/refund', zValidator('json', z.object({
  bookingId: z.string().min(3),
  reason: z.string().min(3),
  stage: z.enum(['held','confirmed','visa_issued','completed']).default('held'),
})), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const { bookingId, reason, stage } = c.req.valid('json') as any;
  // Policy versioned (simple): held 90% → confirmed 50% → visa_issued 0%
  const policy: Record<string, number> = { held: 0.9, confirmed: 0.5, visa_issued: 0, completed: 0 };
  const rate = policy[stage] ?? 0;
  // Find schedules for booking to compute refundable amount (sum of paid)
  const schedules = await db.select().from(paymentSchedules).where(eq(paymentSchedules.bookingId, bookingId)).all();
  const paidSum = schedules.filter((s:any)=> s.status==='paid').reduce((a:any,b:any)=> a + b.amount, 0);
  const refundAmount = Math.round(paidSum * rate);
  // Create refund ledger entry as negative installment
  if (refundAmount > 0) {
    const id = uid();
    const ts = now();
    await db.insert(paymentSchedules).values({
      id, clientId: (schedules[0] as any)?.clientId || 'unknown',
      bookingId, installmentNo: 99, totalInstallments: schedules.length+1,
      label: `Refund (${stage} ${Math.round(rate*100)}%) — ${reason.slice(0,40)}`,
      amount: -refundAmount, dueAt: ts, status: 'refunded' as any, refundReason: reason, refundPolicyVersion: `v1-${stage}`, createdAt: ts, updatedAt: ts,
    } as any);
  }
  await auditEvent(c as any, { action: 'LEDGER_REFUND_ISSUED', entityName: 'payment_schedules', entityId: bookingId, afterState: { stage, rate, refundAmount, reason } });
  try { await publishSyncEvent(c.env as any, { channel: 'public:payments', type: 'LEDGER_REFUND_ISSUED', payload: { bookingId, refundAmount } }, (c as any).executionCtx); } catch {}
  return c.json({ success: true, refundAmount, rate, stage });
});

// GET /api/ledger/forecast?clientId=&days=30 — next 30d due (C6 Billing forecast)
ledgerRouter.get('/forecast', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const clientId = c.req.query('clientId');
  const days = parseInt(c.req.query('days') || '30');
  const cutoff = now() + days*86400;
  const conditions: any[] = [eq(paymentSchedules.status, 'pending' as any)];
  if (clientId) conditions.push(eq(paymentSchedules.clientId, clientId));
  const rows = await db.select().from(paymentSchedules).where(and(...conditions)).all();
  const upcoming = rows.filter((r:any)=> r.dueAt <= cutoff);
  const totalDue = upcoming.reduce((a:any,b:any)=> a + b.amount, 0);
  return c.json({ success: true, forecast: { days, totalDue, count: upcoming.length, items: upcoming.slice(0,10) } });
});
