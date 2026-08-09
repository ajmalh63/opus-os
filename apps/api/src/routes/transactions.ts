import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { createPaymentSchema } from '@opusos/shared';
import { getDb } from '../db/client.js';
import { payments, engagements, clients, businessProfile } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { auditEvent } from '../middleware/audit.js';

// Transactions module — the unified billing surface available to EVERY
// internal account. Draft entry by any staff; confirmation/void remains an
// owner/manager action (see payments.ts). The module reads/writes the same
// `payments` ledger; infinite-loop-safe money math stays integer paise.

export const transactionsRouter = new Hono<{ Bindings: { DB: D1Database; BETTER_AUTH_SECRET: string }; Variables: { user?: { id?: string; role?: string } | null } }>();

// GET /api/transactions/clients-brief — all staff need client names for the form
transactionsRouter.get('/clients-brief', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  try {
    const rows = await db.select({ id: clients.id, name: clients.name }).from(clients).all();
    return c.json({ clients: rows });
  } catch (error: any) {
    return c.json({ error: 'Client brief failed', details: error.message }, 500);
  }
});

// POST /api/transactions/entries — draft billing entry (any staff role)
transactionsRouter.post('/entries', zValidator('json', createPaymentSchema), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const data = c.req.valid('json');
  const user = (c.get('user') as any) || {};
  const now = Math.floor(Date.now() / 1000);

  try {
    const gst = await computeGst(db, data.amount, data.isInterstate);
    const paymentId = crypto.randomUUID();
    await db.insert(payments).values({
      id: paymentId, clientId: data.clientId, engagementId: data.engagementId,
      amount: data.amount, type: data.type, milestoneName: data.milestoneName,
      method: data.method, referenceNumber: data.referenceNumber,
      taxableAmount: gst.taxableAmount, cgst: gst.cgst, sgst: gst.sgst, igst: gst.igst,
      isInterstate: gst.isInterstate, status: 'draft', enteredBy: user.id, createdAt: now,
    });
    await auditEvent(c, { action: 'BILLING_ENTRY_DRAFT', entityName: 'payments', entityId: paymentId, afterState: { type: data.type, amount: data.amount, enteredBy: user.id } });
    return c.json({ success: true, id: paymentId, status: 'draft', message: 'Billing entry saved as DRAFT — awaiting manager confirmation.' });
  } catch (error: any) {
    return c.json({ error: 'Draft entry failed', details: error.message }, 500);
  }
});

// GET /api/transactions — unified ledger (all staff; 'mine=1' filters your drafts)
transactionsRouter.get('/', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const user = (c.get('user') as any) || {};
  const status = c.req.query('status');
  const mine = c.req.query('mine') === '1' && user.role !== 'super_admin' && user.role !== 'manager';
  try {
    let rows = await db.select().from(payments).all();
    if (status) rows = rows.filter((r) => r.status === status);
    if (mine) rows = rows.filter((r) => r.enteredBy === user.id);
    rows.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
    const clientRows = await db.select().from(clients).all();
    return c.json({ transactions: rows.map((r) => ({ ...r, clientName: clientRows.find((cl) => cl.id === r.clientId)?.name || 'Unknown' })) });
  } catch (error: any) {
    return c.json({ error: 'Transactions list failed', details: error.message }, 500);
  }
});

async function computeGst(db: ReturnType<typeof getDb>, amount: number, isInterstate?: boolean) {
  const rate = 0.18;
  const taxable = amount;
  const tax = Math.round(amount * rate);
  const igst = isInterstate ? tax : 0;
  const cgst = isInterstate ? 0 : Math.round(tax / 2);
  const sgst = isInterstate ? 0 : tax - cgst;
  void db;
  return { taxableAmount: taxable, cgst, sgst, igst, isInterstate: !!isInterstate };
}

// Recompute outstanding balance for an engagement from confirmed-only entries
// (drafts are not money yet; void entries are excluded).
async function recomputeBalance(db: ReturnType<typeof getDb>, engagementId: string): Promise<number> {
  const all = await db.select().from(payments).all().then((rs: any[]) =>
    rs.filter((p) => p.engagementId === engagementId && (p.status === 'confirmed' || p.status === 'synced' || p.status === 'paid')));
  return all.reduce((sum: number, p: any) => {
    if (p.type === 'invoice' || p.type === 'charge') return sum + Number(p.amount || 0);
    if (p.type === 'receipt') return sum - Number(p.amount || 0);
    if (p.type === 'refund') return sum + Number(p.amount || 0);
    return sum;
  }, 0);
}

// Owner/manager gate for confirm/void (money actions).
function isMoneyManager(c: any): boolean {
  const role = (c.get('user') as any)?.role;
  return role === 'super_admin' || role === 'manager';
}

// POST /api/transactions/:id/confirm — apply draft to the client's balance
transactionsRouter.post('/:id/confirm', async (c) => {
  if (!isMoneyManager(c)) return c.json({ error: 'Forbidden: confirmation requires owner/manager' }, 403);
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const id = c.req.param('id');
  const user = (c.get('user') as any) || {};
  const now = Math.floor(Date.now() / 1000);
  try {
    const row = await db.select().from(payments).where(eq(payments.id, id)).get();
    if (!row) return c.json({ error: 'Entry not found' }, 404);
    if (row.status !== 'draft') return c.json({ error: `Only draft entries can be confirmed (current: ${row.status})` }, 409);
    // Flip to confirmed FIRST so balance recomputation includes this entry.
    await db.update(payments).set({ status: 'confirmed', confirmedBy: user.id, confirmedAt: now }).where(eq(payments.id, id));
    const balance = await recomputeBalance(db, row.engagementId);
    await db.update(engagements).set({ outstandingBalance: balance }).where(eq(engagements.id, row.engagementId));
    await auditEvent(c, { action: 'BILLING_ENTRY_CONFIRMED', entityName: 'payments', entityId: id, afterState: { id, confirmedBy: user.id } });
    return c.json({ success: true, id, status: 'confirmed', message: 'Entry confirmed — balance applied.' });
  } catch (error: any) {
    return c.json({ error: 'Confirm failed', details: error.message }, 500);
  }
});

// POST /api/transactions/:id/void — revert a draft or confirmed entry
transactionsRouter.post('/:id/void', async (c) => {
  if (!isMoneyManager(c)) return c.json({ error: 'Forbidden: voiding requires owner/manager' }, 403);
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const id = c.req.param('id');
  const user = (c.get('user') as any) || {};
  const now = Math.floor(Date.now() / 1000);
  try {
    const row = await db.select().from(payments).where(eq(payments.id, id)).get();
    if (!row) return c.json({ error: 'Entry not found' }, 404);
    if (row.status === 'synced' || row.status === 'paid') {
      return c.json({ error: 'Synced/paid entries cannot be voided in-place; raise a refund instead' }, 409);
    }
    // Flip to void FIRST so balance recomputation excludes this entry.
    await db.update(payments).set({ status: 'void', confirmedBy: row.confirmedBy || user.id, confirmedAt: now }).where(eq(payments.id, id));
    const balance = await recomputeBalance(db, row.engagementId);
    await db.update(engagements).set({ outstandingBalance: balance }).where(eq(engagements.id, row.engagementId));
    await auditEvent(c, { action: 'BILLING_ENTRY_VOID', entityName: 'payments', entityId: id, afterState: { id } });
    return c.json({ success: true, id, status: 'void', message: 'Entry voided.' });
  } catch (error: any) {
    return c.json({ error: 'Void failed', details: error.message }, 500);
  }
});