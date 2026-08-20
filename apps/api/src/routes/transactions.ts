import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { createPaymentSchema } from '@opusos/shared';
import { getDb } from '../db/client.js';
import { payments, engagements, clients, businessProfile, erpnextSyncLog, referrals } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { auditEvent } from '../middleware/audit.js';
import { erpUpsert, buildInvoicePayload } from '../infra/erpnext.js';
import { createPaymentLink, cancelPaymentLink } from '../services/paymentLinks.js';

// Transactions module
// internal account. Draft entry by any staff; confirmation/void remains an
// owner/manager action (see payments.ts). The module reads/writes the same
// `payments` ledger; infinite-loop-safe money math stays integer paise.

export const transactionsRouter = new Hono<{ Bindings: { DB: D1Database; BETTER_AUTH_SECRET: string }; Variables: { user?: { id?: string; role?: string } | null } }>();

// GET /api/transactions/clients-brief — client names + active engagements
transactionsRouter.get('/clients-brief', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  try {
    const rows = await db.select({ id: clients.id, name: clients.name }).from(clients).all();
    const engRows = await db.select({ id: engagements.id, clientId: engagements.clientId, division: engagements.division, title: engagements.title }).from(engagements).all();
    return c.json({ clients: rows, engagements: engRows });
  } catch (error: any) {
    return c.json({ error: 'Client brief failed',  }, 500);
  }
});

// POST /api/transactions/entries
// counselor auto-confirms invoices within their division scope and under the
// owner-set threshold (autoConfirmEnabled + threshold from business_profile).
transactionsRouter.post('/entries', zValidator('json', createPaymentSchema), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const data = c.req.valid('json');
  const user = (c.get('user') as any) || {};
  const now = Math.floor(Date.now() / 1000);

  try {
    const gst = await computeGst(db, data.amount, data.isInterstate);
    const gstRate = data.gstRate ?? 18;
    const paymentId = crypto.randomUUID();
    const draftStatus = 'draft';
    await db.insert(payments).values({
      id: paymentId, clientId: data.clientId, engagementId: data.engagementId,
      amount: data.amount, type: data.type, milestoneName: data.milestoneName,
      method: data.method, referenceNumber: data.referenceNumber,
      taxableAmount: gst.taxableAmount, cgst: gst.cgst, sgst: gst.sgst, igst: gst.igst,
      isInterstate: gst.isInterstate,
      invoiceDate: data.invoiceDate ?? null, dueDate: data.dueDate ?? null,
      gstRate, customerGstin: data.customerGstin ?? null,
      status: draftStatus, enteredBy: user.id, createdAt: now,
    });
    await auditEvent(c, { action: 'BILLING_ENTRY_DRAFT', entityName: 'payments', entityId: paymentId, afterState: { type: data.type, amount: data.amount, enteredBy: user.id } });

    // Counselor auto-confirm: within division scope + under threshold
    if (user.role === 'counselor' && data.type === 'invoice') {
      const profile = await db.select().from(businessProfile).where(eq(businessProfile.id, 'main')).get();
      const enabled = Number((profile as any)?.autoConfirmEnabled ?? (profile as any)?.auto_confirm_enabled ?? 0) === 1;
      const threshold = Number((profile as any)?.autoConfirmThresholdPaise ?? (profile as any)?.auto_confirm_threshold_paise ?? 0);
      const eng = await db.select().from(engagements).where(eq(engagements.id, data.engagementId)).get();
      const inScope = eng ? (JSON.parse((user.userDivisions as string) || '[]') as string[]).includes(eng.division) : false;
      if (enabled && threshold > 0 && data.amount <= threshold && inScope) {
        await db.update(payments).set({ status: 'confirmed', confirmedBy: user.id, confirmedAt: now }).where(eq(payments.id, paymentId));
        const balance = await recomputeBalance(db, data.engagementId);
        await db.update(engagements).set({ outstandingBalance: balance }).where(eq(engagements.id, data.engagementId));
        await auditEvent(c, { action: 'BILLING_ENTRY_AUTOCONFIRMED', entityName: 'payments', entityId: paymentId, afterState: { id: paymentId, confirmedBy: user.id, reason: 'counselor-scope-threshold' } });
        await pushToErpIfInvoice(c, db, paymentId, data.engagementId, now);
        return c.json({ success: true, id: paymentId, status: 'confirmed', autoConfirmed: true, message: 'Invoice auto-confirmed (within your scope and threshold) and synced to ERP.' });
      }
    }

    return c.json({ success: true, id: paymentId, status: 'draft', message: 'Billing entry saved as DRAFT €€ awaiting manager confirmation.' });
  } catch (error: any) {
    return c.json({ error: 'Draft entry failed',  }, 500);
  }
});

// GET /api/transactions
transactionsRouter.get('/', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const user = (c.get('user') as any) || {};
  const status = c.req.query('status');
  const linkStatus = c.req.query('linkStatus'); // whitelist: none|created|paid|cancelled|expired
  // SECURITY: the full financial ledger is manager+ — lower roles are
  // server-mandated to their own entries (the ?mine=1 filter was opt-in).
  const mine = c.req.query('mine') === '1' || (user.role !== 'super_admin' && user.role !== 'manager');
  try {
    let rows = await db.select().from(payments).all();
    if (status) rows = rows.filter((r) => r.status === status);
    if (linkStatus && ['none', 'created', 'paid', 'cancelled', 'expired'].includes(linkStatus)) {
      rows = rows.filter((r) => (linkStatus === 'none' ? !r.linkStatus || r.linkStatus === 'none' : r.linkStatus === linkStatus));
    }
    if (mine) rows = rows.filter((r) => r.enteredBy === user.id);
    rows.sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0));
    const clientRows = await db.select().from(clients).all();
    return c.json({ transactions: rows.map((r) => ({ ...r, clientName: clientRows.find((cl) => cl.id === r.clientId)?.name || 'Unknown' })) });
  } catch (error: any) {
    return c.json({ error: 'Transactions list failed',  }, 500);
  }
});

// GET /api/transactions/links-summary — dunning view: live links in aging
// buckets (3d = re-share reminder, 5d = renew/cancel decision). Drives the
// header chip; the ledger rows drive the per-row actions.
transactionsRouter.get('/links-summary', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  try {
    const rows = await db.select().from(payments).all();
    const live = rows.filter((r) => r.linkStatus === 'created' && r.status !== 'paid' && r.status !== 'void');
    const nowS = Math.floor(Date.now() / 1000);
    const bucket = (days: number) => live.filter((r) => nowS - Number(r.createdAt || 0) >= days * 86400).length;
    return c.json({
      outstanding: live.length,
      remindDue: bucket(3), // ≥3d: re-share the link (reminder window)
      stale: bucket(5),     // ≥5d: renew or cancel (escalation window)
      total: rows.length,
    });
  } catch (error: any) {
    return c.json({ error: 'Links summary failed',  }, 500);
  }
});

async function computeGst(db: ReturnType<typeof getDb>, amount: number, isInterstate?: boolean) {
  // GST-INCLUSIVE split (single source of truth — matches routes/payments.ts):
  // amount is what the client pays; taxable = amount / 1.18, GST = amount − taxable.
  const taxable = Math.round(amount / 1.18);
  const gstTotal = amount - taxable;
  const igst = isInterstate ? gstTotal : 0;
  const cgst = isInterstate ? 0 : Math.floor(gstTotal / 2);
  const sgst = isInterstate ? 0 : gstTotal - cgst;
  void db;
  return { taxableAmount: taxable, cgst, sgst, igst, isInterstate: !!isInterstate };
}

// Recompute outstanding balance for an engagement from confirmed-only entries
// (drafts are not money yet; void entries are excluded).
export async function recomputeBalance(db: ReturnType<typeof getDb>, engagementId: string): Promise<number> {
  const all = await db.select().from(payments).all().then((rs: any[]) =>
    rs.filter((p) => p.engagementId === engagementId && (p.status === 'confirmed' || p.status === 'synced' || p.status === 'paid')));
  return all.reduce((sum: number, p: any) => {
    if (p.type === 'invoice' || p.type === 'charge') return sum + Number(p.amount || 0);
    if (p.type === 'receipt') return sum - Number(p.amount || 0);
    if (p.type === 'refund') return sum + Number(p.amount || 0);
    return sum;
  }, 0);
}

// Instantly sync a confirmed invoice to ERPNext via the API (end-to-end).
// Customer upsert carries name/email/GSTIN; Sales Invoice uses the entry's
// gstRate/dates/GSTIN. Fail-open: on any ERP error we write a sync-log row so
// the n8n erp-sync-health spine retries it later
async function pushToErpIfInvoice(c: any, db: ReturnType<typeof getDb>, paymentId: string, engagementId: string, now: number): Promise<{ ok: boolean; reason?: string }> {
  const env = c.env;
  if (!env?.ERPNEXT_BASE_URL || !env.ERPNEXT_API_KEY) return { ok: false, reason: 'erp-unconfigured' };
  try {
    const row = await db.select().from(payments).where(eq(payments.id, paymentId)).get();
    if (!row || row.type !== 'invoice') return { ok: true };
    const client = await db.select().from(clients).where(eq(clients.id, row.clientId)).get();

    const customer = client ? { name: client.name, email: client.email || '', gstin: row.customerGstin || undefined } : { name: 'Walk-in Customer', email: '', gstin: row.customerGstin || undefined };
    const custRes = await erpUpsert(env, 'Customer', { customer_name: customer.name, email_id: customer.email, gstin: customer.gstin, customer_group: 'Individual', territory: 'India' } as any);

    const payload = buildInvoicePayload(row as any, { name: customer.name, email: customer.email });
    const invRes = await erpUpsert(env, 'Sales Invoice', payload as any);
    if (!invRes.ok) {
      await db.insert(erpnextSyncLog).values({
        id: crypto.randomUUID(), entityName: 'payments', entityId: paymentId, doctype: 'Sales Invoice',
        payloadJson: JSON.stringify(payload), status: 'pending', error: invRes.message || 'ERP push failed',
        attempts: 0, createdAt: now, updatedAt: now,
      } as any);
      return { ok: false, reason: 'erp-push-failed-queued' };
    }
    const docName = (invRes.data as any)?.name || null;
    await db.update(payments).set({ status: 'synced', erpDocName: docName }).where(eq(payments.id, paymentId));
    await db.insert(erpnextSyncLog).values({
      id: crypto.randomUUID(), entityName: 'payments', entityId: paymentId, doctype: 'Sales Invoice',
      payloadJson: JSON.stringify(payload), status: 'synced', error: null,
      attempts: 1, docName, createdAt: now, updatedAt: now,
    } as any);
    void custRes;
    return { ok: true };
  } catch (e: any) {
    const logField = { id: crypto.randomUUID(), entityName: 'payments', entityId: paymentId, doctype: 'Sales Invoice', payloadJson: '', status: 'pending', error: e?.message || 'ERP push error', attempts: 0, createdAt: now, updatedAt: now };
    await db.insert(erpnextSyncLog).values(logField as any).catch(() => {});
    return { ok: false, reason: 'erp-error' };
  }
}

// Owner/manager gate for confirm/void (money actions).
function isMoneyManager(c: any): boolean {
  const role = (c.get('user') as any)?.role;
  return role === 'super_admin' || role === 'manager';
}

// POST /api/transactions/:id/confirm
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
    const erp = await pushToErpIfInvoice(c, db, id, row.engagementId, now);
    return c.json({ success: true, id, status: 'confirmed', erp: erp?.ok === true ? 'synced' : (erp?.reason || 'queued'), message: 'Entry confirmed ₹€₹€₹₹ balance applied.' });
  } catch (error: any) {
    return c.json({ error: 'Confirm failed',  }, 500);
  }
});

// POST /api/transactions/:id/void
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
    return c.json({ error: 'Void failed',  }, 500);
  }
});

// POST /api/transactions/charge — FREE-FORM Razorpay gateway (any staff).
// Charge ANY client ANY amount in one step: picks the client's engagement
// (explicit or first active), creates the 'charge' entry + payment link.
// Money hits the balance only when the payment_link.paid webhook lands.
transactionsRouter.post('/charge', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const user = (c.get('user') as any) || {};
  const body: any = await c.req.json().catch(() => ({}));
  const clientId: string | undefined = body.clientId;
  const engagementId: string | undefined = body.engagementId;
  const amountPaise = Math.round(Number(body.amount || 0) * 100); // ₹ → paise
  const description = String(body.description || '').trim();

  const client = clientId ? await db.select().from(clients).where(eq(clients.id, clientId)).get() : undefined;
  if (!client) return c.json({ error: 'Select a valid client' }, 400);
  const cid: string = clientId!;
  if (!Number.isFinite(amountPaise) || amountPaise < 100 || amountPaise > 50_000_000) {
    return c.json({ error: 'Amount must be between ₹1 and ₹5,00,000' }, 400);
  }

  let eng = engagementId ? await db.select().from(engagements).where(eq(engagements.id, engagementId)).get() : undefined;
  if (eng && eng.clientId !== cid) return c.json({ error: 'Engagement does not belong to this client' }, 400);
  if (!eng) {
    const engs = await db.select().from(engagements).where(eq(engagements.clientId, cid)).all();
    eng = engs.find((e) => e.status === 'active') || engs[0];
    if (!eng) return c.json({ error: 'Client has no engagement — create one first' }, 409);
  }
  const engRow = eng;

  // Division scope: counselors/coordinators may only charge clients in their
  // assigned divisions (mirrors the auto-confirm gate below).
  const userDivisions = (() => { try { return JSON.parse((user.userDivisions as string) || '[]') as string[]; } catch { return []; } })();
  if ((user.role === 'counselor' || user.role === 'coordinator') && userDivisions.length > 0 && !userDivisions.includes(engRow.division)) {
    return c.json({ error: 'Client is outside your division scope' }, 403);
  }

  const entryId = crypto.randomUUID();
  const now = Math.floor(Date.now() / 1000);
  const created = await createPaymentLink(c.env as any, {
    amount: amountPaise,
    name: client.name,
    email: client.email,
    contact: client.phone,
    description: description || 'Opus Overseas payment',
    notes: { entryId, clientId: cid, engagementId: engRow.id, milestone: description || 'Direct charge', chargedBy: user.id || '' },
    expireBy: now + 7 * 24 * 3600, // 7 days
    callbackUrl: (c.env as any).CALLBACK_URL,
  });
  if (!created.ok || !created.linkId) return c.json({ error: created.reason || 'Payment link failed' }, 502);

  await db.insert(payments).values({
    id: entryId, clientId: cid, engagementId: engRow.id, amount: amountPaise, type: 'charge',
    milestoneName: description || 'Direct charge (Razorpay)',
    method: null, referenceNumber: null,
    taxableAmount: null, cgst: null, sgst: null, igst: null, isInterstate: false,
    invoiceDate: null, dueDate: null, gstRate: 0, customerGstin: null,
    razorpayLinkId: created.linkId, razorpayShortUrl: created.shortUrl || null,
    linkStatus: 'created', razorpayPaymentId: null,
    status: 'draft', enteredBy: user.id || null, createdAt: now,
  });
  await auditEvent(c, { action: 'CHARGE_LINK_CREATED', entityName: 'payments', entityId: entryId, afterState: { linkId: created.linkId, amount: amountPaise, clientId, engagementId: eng.id, createdBy: user.id } });
  return c.json({ success: true, entryId, linkId: created.linkId, shortUrl: created.shortUrl, message: 'Charge link created — send it to the customer.' });
});

// POST /api/transactions/:id/payment-link — any staff role: charge the entry
// via Razorpay Payment Link (any amount; the entry already carries it).
transactionsRouter.post('/:id/payment-link', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const id = c.req.param('id');
  const user = (c.get('user') as any) || {};
  try {
    const row = await db.select().from(payments).where(eq(payments.id, id)).get();
    if (!row) return c.json({ error: 'Entry not found' }, 404);
    if (row.type !== 'invoice' && row.type !== 'charge') return c.json({ error: 'Only invoice/charge entries can be charged via link' }, 400);
    if (row.status === 'paid' || row.status === 'synced') return c.json({ error: 'Entry already paid/synced' }, 409);

    const client = await db.select().from(clients).where(eq(clients.id, row.clientId)).get();
    const created = await createPaymentLink(c.env as any, {
      amount: row.amount,
      name: client?.name,
      email: client?.email,
      contact: client?.phone,
      description: row.milestoneName || 'Opus Overseas payment',
notes: { entryId: id, clientId: row.clientId, engagementId: row.engagementId, milestone: row.milestoneName || '', chargedBy: user.id || '' },
      expireBy: Math.floor(Date.now() / 1000) + 7 * 24 * 3600, // 7 days
      callbackUrl: (c.env as any).CALLBACK_URL,
    });
    if (!created.ok || !created.linkId) return c.json({ error: created.reason || 'Payment link creation failed' }, 502);

    await db.update(payments).set({ razorpayLinkId: created.linkId, razorpayShortUrl: created.shortUrl || null, linkStatus: 'created' }).where(eq(payments.id, id));
    await auditEvent(c, { action: 'PAYMENT_LINK_CREATED', entityName: 'payments', entityId: id, afterState: { linkId: created.linkId, amount: row.amount, createdBy: user.id } });
return c.json({ success: true, id, linkId: created.linkId, shortUrl: created.shortUrl, message: 'Payment link created — share it with the customer.' });
  } catch (error: any) {
    return c.json({ error: 'Payment link failed',  }, 500);
  }
});

// POST /api/transactions/:id/payment-link/cancel — server-authoritative cancel
// via the Razorpay Cancel API. Idempotent: cancelling an already-cancelled
// link is a success no-op; a PAID link can never be cancelled.
transactionsRouter.post('/:id/payment-link/cancel', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const id = c.req.param('id');
  const user = (c.get('user') as any) || {};
  try {
    const row = await db.select().from(payments).where(eq(payments.id, id)).get();
    if (!row) return c.json({ error: 'Entry not found' }, 404);
    if (!row.razorpayLinkId || !row.linkStatus || row.linkStatus === 'none') return c.json({ error: 'No payment link on this entry' }, 400);
    if (row.linkStatus === 'cancelled') return c.json({ success: true, already: true, message: 'Link already cancelled.' });
    if (row.linkStatus === 'paid') return c.json({ error: 'Link is already paid — do not cancel' }, 409);
    if (row.linkStatus === 'expired') return c.json({ error: 'Link already expired — renew it instead' }, 409);

    const cancelled = await cancelPaymentLink(c.env as any, row.razorpayLinkId);
    if (!cancelled.ok) return c.json({ error: cancelled.reason || 'Razorpay cancel failed' }, 502);

    await db.update(payments).set({ linkStatus: 'cancelled' }).where(eq(payments.id, id));
    await auditEvent(c, { action: 'PAYMENT_LINK_CANCELLED', entityName: 'payments', entityId: id, afterState: { linkId: row.razorpayLinkId, cancelledBy: user.id } });
    return c.json({ success: true, message: 'Payment link cancelled at Razorpay.' });
  } catch (error: any) {
    return c.json({ error: 'Cancel failed',  }, 500);
  }
});

// POST /api/transactions/:id/payment-link/renew — dunning step 2: fresh link
// (new 7-day window) for a cancelled/expired entry. Blocked while a live link
// exists so we never hold two redeemable links for the same money (A-2 claim).
transactionsRouter.post('/:id/payment-link/renew', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const id = c.req.param('id');
  const user = (c.get('user') as any) || {};
  try {
    const row = await db.select().from(payments).where(eq(payments.id, id)).get();
    if (!row) return c.json({ error: 'Entry not found' }, 404);
    if (row.type !== 'invoice' && row.type !== 'charge') return c.json({ error: 'Only invoice/charge entries can be charged via link' }, 400);
    if (row.status === 'paid' || row.status === 'synced' || row.status === 'void') return c.json({ error: 'Entry already settled' }, 409);
    if (row.linkStatus === 'created') return c.json({ error: 'A live link exists — cancel it first, then renew' }, 409);

    const client = await db.select().from(clients).where(eq(clients.id, row.clientId)).get();
    const created = await createPaymentLink(c.env as any, {
      amount: row.amount,
      name: client?.name,
      email: client?.email,
      contact: client?.phone,
      description: row.milestoneName || 'Opus Overseas payment',
      notes: { entryId: id, clientId: row.clientId, engagementId: row.engagementId, milestone: row.milestoneName || '', chargedBy: user.id || '' },
      expireBy: Math.floor(Date.now() / 1000) + 7 * 24 * 3600, // fresh 7 days
      callbackUrl: (c.env as any).CALLBACK_URL,
    });
    if (!created.ok || !created.linkId) return c.json({ error: created.reason || 'Payment link creation failed' }, 502);

    await db.update(payments).set({ razorpayLinkId: created.linkId, razorpayShortUrl: created.shortUrl || null, linkStatus: 'created', razorpayPaymentId: null }).where(eq(payments.id, id));
    await auditEvent(c, { action: 'PAYMENT_LINK_RENEWED', entityName: 'payments', entityId: id, afterState: { oldLinkId: row.razorpayLinkId, newLinkId: created.linkId, renewedBy: user.id } });
    return c.json({ success: true, id, linkId: created.linkId, shortUrl: created.shortUrl, message: 'Fresh payment link created — share it with the customer.' });
  } catch (error: any) {
    return c.json({ error: 'Renew failed',  }, 500);
  }
});

// Webhook finalize: called by the razorpay webhook on payment_link.paid.
// Marks the entry paid, applies a matching receipt to the balance, accrues
// incentives/partner points, and emails the receipt — all idempotent per
// payment id (A-2 replay protection).
export async function finalizePaymentLinkPayment(
  env: any,
  db: ReturnType<typeof getDb>,
  entryId: string,
  paymentId: string,
  amountPaise: number,
  milestone: string | undefined,
  method?: string
): Promise<{ ok: boolean; reason?: string }> {
  try {
    const row = await db.select().from(payments).where(eq(payments.id, entryId)).get();
    if (!row) return { ok: false, reason: 'entry not found' };

    // dedupe by razorpay payment id
    const dup = await db.select().from(payments).where(eq(payments.referenceNumber, paymentId)).get();
    if (dup) return { ok: true, reason: 'duplicate' };

    const now = Math.floor(Date.now() / 1000);

// 1. mark the charged entry paid (link lifecycle) — map Razorpay method
    // into our ledger enum (upi stays upi; card/netbanking/wallet → bank)
    const ledMethod = { upi: 'upi' as const, card: 'bank_transfer' as const, netbanking: 'bank_transfer' as const, wallet: 'bank_transfer' as const }[method || ''] as 'upi' | 'bank_transfer' | undefined;
    await db.update(payments).set({ status: 'paid', linkStatus: 'paid', razorpayPaymentId: paymentId, ...(ledMethod ? { method: ledMethod } : {}) }).where(eq(payments.id, entryId));

    // 2. matching receipt reduces outstanding balance
    const receiptId = crypto.randomUUID();
    await db.insert(payments).values({
      id: receiptId, clientId: row.clientId, engagementId: row.engagementId,
      amount: amountPaise, type: 'receipt', milestoneName: milestone || `${row.milestoneName || 'Payment'} (received)`,
      method: row.method || 'upi', referenceNumber: paymentId, status: 'synced',
      enteredBy: row.enteredBy, createdAt: now,
      invoiceDate: null, dueDate: null, gstRate: 0, customerGstin: null,
    });
    const bal = await recomputeBalance(db, row.engagementId);
    await db.update(engagements).set({ outstandingBalance: bal }).where(eq(engagements.id, row.engagementId));

    // 3. interlock: milestone_paid incentives + partner points + receipt email
    try {
      const { accrueIncentives } = await import('../services/incentiveAccrual.js');
      await accrueIncentives({ env, clientId: row.clientId, engagementId: row.engagementId, triggerRef: paymentId, trigger: 'milestone_paid', triggerAmountPaise: amountPaise }).catch(() => {});
    } catch { /* fail-open */ }
    try {
      const { accruePartnerPoints } = await import('../services/partnerLoyalty.js');
      const ref = await db.select().from(referrals).where(eq(referrals.clientId, row.clientId)).get();
      if (ref?.partnerId) await accruePartnerPoints({ env, partnerId: ref.partnerId, reason: 'milestone_paid', referenceKey: paymentId, amountPaise }).catch(() => {});
    } catch { /* fail-open */ }
    try {
      const { sendNotification } = await import('../infra/notify.js');
      const client = await db.select().from(clients).where(eq(clients.id, row.clientId)).get();
      if (client?.email) await sendNotification(env, db, { channel: 'email', to: client.email, subject: `Payment received ${paymentId}`, body: `Hi ${client.name}, we received ${(amountPaise / 100).toLocaleString('en-IN')} (${milestone || row.milestoneName}). Ref: ${paymentId}.`, clientId: client.id }).catch(() => {});
    } catch { /* fail-open */ }

    await auditEvent(env as any, { action: 'PAYMENT_LINK_PAID', entityName: 'payments', entityId: entryId, afterState: { paymentId, amount: amountPaise } });
    return { ok: true };
  } catch (e: any) {
    return { ok: false, reason: e?.message };
  }
}
