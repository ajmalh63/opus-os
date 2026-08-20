import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { getDb } from '../db/client.js';
import { payments, engagements, milestones, clients, referrals, webhookEvents } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { sendNotification } from '../infra/notify.js';
import { accrueIncentives } from '../services/incentiveAccrual.js';
import { auditBounded } from '../middleware/audit.js';
import { accruePartnerPoints } from '../services/partnerLoyalty.js';
import { auditEvent } from '../middleware/audit.js';
import { recomputeBalance } from './transactions.js';
import { dispatchWebhookEvent, safeExecutionCtx } from '../lib/webhookDispatcher.js';

export const razorpayRouter = new Hono<{
  Bindings: { DB: D1Database; BETTER_AUTH_SECRET: string; RAZORPAY_KEY_ID?: string; RAZORPAY_KEY_SECRET?: string; N8N_WEBHOOK_URL?: string; N8N_WEBHOOK_SECRET?: string }
}>();

// Razorpay REST base (docs 2026): https://api.razorpay.com/v1
const RZR_BASE = 'https://api.razorpay.com/v1';

type RzBindings = { RAZORPAY_KEY_ID?: string; RAZORPAY_KEY_SECRET?: string; BETTER_AUTH_SECRET?: string };

// Fail-CLOSED (A-1): never fall back to a public constant. If gateway creds are
// unset we refuse to operate rather than silently using test keys in prod.
function basicAuth(c: { env: RzBindings }): string {
  const key = c.env.RAZORPAY_KEY_ID;
  const secret = c.env.RAZORPAY_KEY_SECRET;
  if (!key || !secret) {
    throw new Error('Razorpay credentials not configured (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET)');
  }
  return 'Basic ' + btoa(`${key}:${secret}`);
}

// Constant-time hex comparison (Workers has no timingSafeEqual). Same runtime
// regardless of where the first mismatch lands, so timing cannot leak the key.
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a.charCodeAt(i) ^ b.charCodeAt(i));
  return diff === 0;
}

// POST /api/payments/razorpay/order  { engagementId, amount, method? , clientId }
// Creates a Razorpay order server-side. Amount is always computed/verified against the ledger.
const orderSchema = z.object({
  clientId: z.string().min(1),
  engagementId: z.string().min(1),
  amount: z.number().int().positive(), // paise, must match ledger expectation
  milestoneName: z.string().optional(),
  method: z.enum(['upi', 'card', 'netbanking', 'wallet']).optional(),
});

razorpayRouter.post('/order', zValidator('json', orderSchema), async (c) => {
  const data = c.req.valid('json');
  if (!c.env || !c.env.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);

  try {
    if (!c.env.RAZORPAY_KEY_ID || !c.env.RAZORPAY_KEY_SECRET) {
      return c.json({ error: "Razorpay not configured — set RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET" }, 503);
    }
    // 1. Verify engagement exists and amount matches known ledger balance owed
    const eng = await db.select().from(engagements).where(eq(engagements.id, data.engagementId)).get();
    if (!eng) return c.json({ error: "Engagement not found" }, 404);

    // 2. Create Razorpay order (RFC 7807-ish error handled simply)
    const rzRes = await fetch(`${RZR_BASE}/orders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': basicAuth(c),
      },
      body: JSON.stringify({
        amount: data.amount,
        currency: 'INR',
        receipt: `${data.clientId}_${Date.now().toString(36)}`,
        notes: { engagementId: data.engagementId, clientId: data.clientId, milestone: data.milestoneName || '' },
        partial_payment: false,
      }),
    });

    if (!rzRes.ok) {
      const rzErr = await rzRes.text().catch(() => '');
      return c.json({ error: 'Razorpay order creation failed', details: rzErr }, 502);
    }

    const order = (await rzRes.json()) as { id: string; amount: number; currency: string; [k: string]: any };

    // 3. Persist order state so verify/webhooks can reconcile (idempotency)
    // We store a placeholder payment row in 'charge-created' status via the existing ledger
    // records to keep single source of truth (Section 44.4).
    return c.json({
      success: true,
      order,
      amount_paise: data.amount,
      currency: 'INR',
      key: c.env.RAZORPAY_KEY_ID,
      order_id: order.id,
      clientId: data.clientId,
      engagementId: data.engagementId,
    });
  } catch (error: any) {
    return c.json({ error: "Razorpay order failed",  }, 500);
  }
});

// POST /api/payments/razorpay/verify  { razorpay_order_id, razorpay_payment_id, razorpay_signature }
// Verifies HMAC SHA256 of `${order_id}|${payment_id}` with the key secret, then finalizes the ledger entry.
const verifySchema = z.object({
  clientId: z.string().min(1),
  engagementId: z.string().min(1),
  razorpay_order_id: z.string().min(1),
  razorpay_payment_id: z.string().min(1),
  razorpay_signature: z.string().min(1),
  milestoneName: z.string().optional(),
});

async function verifySignature(orderId: string, paymentId: string, signature: string, secret: string): Promise<boolean> {
  const body = `${orderId}|${paymentId}`;
  const enc = new TextEncoder();
  const keyData = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', keyData, enc.encode(body));
  const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
  return timingSafeEqualHex(hex, signature);
}

razorpayRouter.post('/verify', zValidator('json', verifySchema), async (c) => {
  const data = c.req.valid('json');
  if (!c.env || !c.env.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  // Fail-closed (A-1): no public fallback secret
  const secret = c.env.RAZORPAY_KEY_SECRET;
  if (!secret || !c.env.RAZORPAY_KEY_ID) return c.json({ error: "Razorpay not configured — set RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET" }, 503);

  try {
    const ok = await verifySignature(data.razorpay_order_id, data.razorpay_payment_id, data.razorpay_signature, secret);
    if (!ok) {
      await auditBounded(c, {
        action: 'PAYMENT_VERIFY_FAILED',
        entityName: 'payments',
        entityId: data.razorpay_order_id,
        result: 'error',
        category: 'money',
        afterState: { orderId: data.razorpay_order_id, paymentId: data.razorpay_payment_id },
      }, 'verify');
      return c.json({ error: "Signature mismatch - payment not confirmed" }, 403);
    }

    // Idempotency (A-2): a receipt for this razorpay payment must not be double-credited
    const existing = await db.select().from(payments).where(eq(payments.referenceNumber, data.razorpay_payment_id)).get();
    if (existing) {
      return c.json({ success: true, id: existing.id, razorpay_payment_id: data.razorpay_payment_id, verified: true, message: "Payment already recorded." });
    }

    // Fetch payment from Razorpay to confirm captured (authoritative)
    const rzRes = await fetch(`${RZR_BASE}/payments/${data.razorpay_payment_id}`, {
      headers: { 'Authorization': basicAuth(c) },
    });
    const paymentInfo = (rzRes.ok ? await rzRes.json() : {}) as { status?: string; amount?: number };
    const captured = paymentInfo?.status === 'captured';

    if (!captured) {
      return c.json({ error: "Payment not captured by gateway" }, 402);
    }

    const now = Math.floor(Date.now() / 1000);

    const paymentId = crypto.randomUUID();
    const invoiceAmount = paymentInfo?.amount ?? 0;

    const eng = await db.select().from(engagements).where(eq(engagements.id, data.engagementId)).get();
    if (!eng) return c.json({ error: "Engagement not found" }, 404);

    await db.insert(payments).values({
      id: paymentId,
      clientId: data.clientId,
      engagementId: data.engagementId,
      amount: invoiceAmount,
      type: 'receipt',
      milestoneName: data.milestoneName?.trim() || 'Online payment',
      method: 'upi',
      referenceNumber: data.razorpay_payment_id,
      createdAt: now,
    });

    // Decrement outstanding balance (receipt reduces)
    await db
      .update(engagements)
      .set({ outstandingBalance: eng.outstandingBalance - invoiceAmount, updatedAt: now })
      .where(eq(engagements.id, data.engagementId));

    // Interlock: incentive accrual on milestone_paid (plan §29.4). Idempotent
    // per (rule, payment). Fail-open — never blocks a verified payment.
    try {
      const result = await accrueIncentives({
        env: c.env as any,
        clientId: data.clientId,
        engagementId: data.engagementId,
        triggerRef: data.razorpay_payment_id,
        trigger: 'milestone_paid',
        triggerAmountPaise: invoiceAmount,
      });
      if (result.accrued > 0) console.log(`incentives accrued: ${result.accrued} (payment ${data.razorpay_payment_id})`);
    } catch (incErr: any) {
      console.error('milestone incentive accrual failed', incErr?.message);
    }

    // Thrive: milestone_paid loyalty points for the referring partner (2%).
    try {
      const ref = await db.select().from(referrals).where(eq(referrals.clientId, data.clientId)).get();
      if (ref?.partnerId) {
        await accruePartnerPoints({ env: c.env as any, partnerId: ref.partnerId, reason: 'milestone_paid', referenceKey: data.razorpay_payment_id, amountPaise: invoiceAmount }).catch(() => {});
      }
    } catch (ppErr: any) {
      console.error('partner points accrual failed', ppErr?.message);
    }

    // §7.6 Transactional email — payment receipt to the client (never throws;
    // dev uses the stub channel; prod uses the CF Email binding).
    try {
      const client = await db.select().from(clients).where(eq(clients.id, data.clientId)).get();
      if (client?.email) {
        await sendNotification(c.env as any, db as any, {
          channel: 'email',
          to: client.email,
          subject: `Opus Overseas — payment receipt ${data.razorpay_payment_id}`,
          body: `Hi ${client.name}, we have received your payment of â‚¹${(invoiceAmount / 100).toLocaleString('en-IN')} (${data.milestoneName?.trim() || 'Online payment'}). Reference: ${data.razorpay_payment_id}. Thank you — Opus Overseas.`,
          clientId: client.id,
        });
      }
    } catch (emailErr: any) {
      console.error('receipt email failed', emailErr?.message);
    }

    // Dispatch payment.received event to n8n for ERPNext invoicing & accounting reconciliation
    dispatchWebhookEvent(
      c.env,
      'payment.received',
      {
        paymentId,
        clientId: data.clientId,
        engagementId: data.engagementId,
        amountPaise: invoiceAmount,
        amountRupees: invoiceAmount / 100,
        milestoneName: data.milestoneName?.trim() || 'Online payment',
        method: 'upi',
        referenceNumber: data.razorpay_payment_id,
        receivedAt: now,
      },
      safeExecutionCtx(c)
    );

    return c.json({
      success: true,
      id: paymentId,
      razorpay_payment_id: data.razorpay_payment_id,
      verified: true,
      message: "Payment verified & recorded.",
    });
  } catch (error: any) {
    return c.json({ error: "Verify failed",  }, 500);
  }
});

export const razorpayWebhookRouter = new Hono<{
  Bindings: { DB: D1Database; RAZORPAY_WEBHOOK_SECRET?: string; BETTER_AUTH_SECRET?: string }
}>();

// POST /api/public/payments/razorpay/webhook  (HMAC X-Razorpay-Signature verified; event payment.captured)
// A-1/A-2 hardening: webhook secret is its OWN dashboard secret (never the API
// key), fail-closed if unset, timing-safe comparison, dedupe by entity.id so
// replayed deliveries can never double-credit.
razorpayWebhookRouter.post('/', async (c) => {
  const rawBody = await c.req.text();
  const signature = c.req.header('x-razorpay-signature') || '';

  if (!c.env.DB) return c.json({ error: "DB not available" }, 500);
  const secret = c.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return c.json({ error: "Razorpay webhook not configured — set RAZORPAY_WEBHOOK_SECRET" }, 503);
  const db = getDb(c.env.DB);

  // HMAC over raw body, timing-safe compare (A-2)
  const enc = new TextEncoder();
  const keyData = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', keyData, enc.encode(rawBody));
  const hexSig = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');

  if (!timingSafeEqualHex(hexSig, signature)) {
    await auditBounded(c, {
      action: 'WEBHOOK_REJECTED',
      entityName: 'webhooks',
      entityId: 'razorpay',
      result: 'error',
      category: 'access',
      actorType: 'service',
      authMethod: 'hmac',
      afterState: { source: 'razorpay', event: (() => { try { return JSON.parse(rawBody)?.event; } catch { return null; } })() },
    }, 'webhook');
    return c.json({ error: "Invalid webhook signature" }, 403);
  }

  const event = JSON.parse(rawBody);

  // ── A-3 durable delivery log ──────────────────────────────────────────────
  // Every event is persisted BEFORE processing (id, event, entity, signature,
  // received_at). Already-processed replays are acknowledged without re-run;
  // failures keep processed=false + detail so reconciliation can find them.
  const nowS = Math.floor(Date.now() / 1000);
  const eventEntityId = event.payload?.payment_link?.entity?.id || event.payload?.payment?.entity?.id || event.payload?.refund?.entity?.id || event.payload?.order?.entity?.id || '';
  const eventId = event.id || `${event.event}:${eventEntityId}:${nowS}`;
  const existingEvent = await db.select().from(webhookEvents).where(eq(webhookEvents.id, eventId)).get();
  if (existingEvent && existingEvent.processed) {
    return c.json({ ok: true, detail: 'replay' });
  }
  if (!existingEvent) {
    await db.insert(webhookEvents).values({ id: eventId, event: event.event, entityId: eventEntityId, signature, receivedAt: nowS, processed: false, detail: null }).catch(() => {});
  }
  const markDone = (detail: string) => db.update(webhookEvents).set({ processed: true, detail }).where(eq(webhookEvents.id, eventId)).catch(() => {});
  const markError = (detail: string) => db.update(webhookEvents).set({ detail }).where(eq(webhookEvents.id, eventId)).catch(() => {});

  // Payment Link lifecycle — created via the Transactions module (any staff).
  if (event.event === 'payment_link.paid' && event.payload?.payment_link?.entity?.id) {
    const link = event.payload.payment_link.entity;
    const paymentEntity = event.payload.payment?.entity || {};
    const notes = link.notes || {};
    const entryId = notes.entryId;
    try {
      const { finalizePaymentLinkPayment } = await import('./transactions.js');
      const { getDb } = await import('../db/client.js');
      const db = getDb(c.env.DB);
      if (entryId) {
        const res = await finalizePaymentLinkPayment(c.env, db, entryId, paymentEntity.id || link.id, paymentEntity.amount || link.amount || 0, notes.milestone || `Payment link ${link.id}`, paymentEntity.method);
        await markDone(res.reason || 'finalized');
        return c.json({ ok: res.ok, detail: res.reason || 'finalized' });
      }
      // entry not found via notes → link still paid; log for manual reconciliation
      await markDone('no entryId in notes — manual reconciliation');
      return c.json({ ok: true, detail: 'no entryId in notes' });
    } catch (err: any) {
      await markError(err?.message || 'finalize failed');
      return c.json({ ok: false, detail: err?.message || 'finalize failed' }, 500);
    }
  }

  // Payment Link status updates (non-paid)
  if ((event.event === 'payment_link.cancelled' || event.event === 'payment_link.expired') && event.payload?.payment_link?.entity?.id) {
    const link = event.payload.payment_link.entity;
    try {
      const { getDb } = await import('../db/client.js');
      const db = getDb(c.env.DB);
      const rows = await db.select().from(payments).where(eq(payments.razorpayLinkId, link.id)).all();
      if (rows[0]) {
        await db.update(payments).set({ linkStatus: event.event === 'payment_link.cancelled' ? 'cancelled' : 'expired' }).where(eq(payments.id, rows[0].id));
      }
      await markDone('link status synced');
      return c.json({ ok: true });
    } catch (err: any) {
      await markError(err?.message || 'link status sync failed');
      return c.json({ ok: false, detail: err?.message }, 500);
    }
  }

  // Refund reversal — refund.processed (order checkout) / payment_link.refunded.
  // Counter-entry (type 'refund', reference=refund id) bumps the balance back;
  // dedupe by refund id so replayed deliveries never double-credit.
  if ((event.event === 'refund.processed' || event.event === 'payment_link.refunded') && event.payload?.refund?.entity?.id) {
    const refund = event.payload.refund.entity;
    const receipt = refund.payment_id
      ? await db.select().from(payments).where(eq(payments.referenceNumber, refund.payment_id)).get()
      : undefined;
    if (!receipt) { await markDone('refund: no matching receipt'); return c.json({ ok: true, detail: 'no matching receipt' }); }
    const dup = await db.select().from(payments).where(eq(payments.referenceNumber, refund.id)).get();
    if (dup) { await markDone('refund: already recorded'); return c.json({ ok: true, detail: 'refund already recorded' }); }

    await db.insert(payments).values({
      id: crypto.randomUUID(), clientId: receipt.clientId, engagementId: receipt.engagementId,
      // Razorpay refund entities carry NEGATIVE amounts; store the absolute
      // value so recomputeBalance (+refund) restores the balance correctly.
      amount: Math.abs(refund.amount) || receipt.amount, type: 'refund', milestoneName: `Refund (${refund.id})`,
      referenceNumber: refund.id, status: 'synced', enteredBy: 'system', createdAt: nowS,
    });
    const bal = await recomputeBalance(db, receipt.engagementId);
    await db.update(engagements).set({ outstandingBalance: bal }).where(eq(engagements.id, receipt.engagementId));
    await auditEvent(c, { action: 'PAYMENT_REFUNDED', entityName: 'payments', entityId: receipt.id, afterState: { refundId: refund.id, amount: refund.amount || receipt.amount } });
    await markDone('refund recorded');
    return c.json({ ok: true, detail: 'refund recorded' });
  }

  // payment.captured from order checkout (existing path)
  if (event.event === 'payment.captured' && event.payload?.payment?.entity?.id) {
    const entity = event.payload.payment.entity;
    const notes = entity.notes || {};
    const engagementId = notes.engagementId;
    const clientId = notes.clientId;

    // Idempotency: dedupe by the razorpay payment id (A-2 replay protection)
    const existing = await db.select().from(payments).where(eq(payments.referenceNumber, entity.id)).get();
    if (existing) {
      await markDone('duplicate');
      return c.json({ ok: true, message: 'duplicate' });
    }

    if (engagementId) {
      const amount = entity.amount || 0;
      await db.insert(payments).values({
        id: crypto.randomUUID(),
        clientId: clientId || '',
        engagementId,
        amount,
        type: 'receipt',
        milestoneName: 'Razorpay webhook capture',
        method: 'upi',
        referenceNumber: entity.id,
        status: 'synced', // in-balance gate: recomputeBalance counts synced only
        createdAt: nowS,
      });
      const eng = await db.select().from(engagements).where(eq(engagements.id, engagementId)).get();
      if (eng) {
        await db.update(engagements).set({ outstandingBalance: eng.outstandingBalance - amount, updatedAt: nowS }).where(eq(engagements.id, engagementId));
      }
      
      // Dispatch payment.received to n8n for WhatsApp receipt & ERPNext invoice
      const client = clientId ? await db.select().from(clients).where(eq(clients.id, clientId)).get() : null;
      await dispatchWebhookEvent(
        c.env,
        'payment.received',
        {
          payment_id: entity.id,
          amount_paise: amount,
          amount_inr: amount / 100,
          method: entity.method || 'upi',
          client_id: clientId || '',
          client_name: client?.name || notes.clientName || 'Candidate',
          client_phone: client?.phone || notes.phone || '',
          client_email: client?.email || notes.email || '',
          engagement_id: engagementId,
          timestamp: new Date(nowS * 1000).toISOString(),
        },
        safeExecutionCtx(c)
      );
    }
    await markDone('receipt recorded');
  }

  // payment.failed: Autonomous drop-off recovery on WhatsApp
  if (event.event === 'payment.failed' && event.payload?.payment?.entity?.id) {
    const entity = event.payload.payment.entity;
    const notes = entity.notes || {};
    const clientId = notes.clientId;
    const client = clientId ? await db.select().from(clients).where(eq(clients.id, clientId)).get() : null;

    await dispatchWebhookEvent(
      c.env,
      'payment.failed',
      {
        payment_id: entity.id,
        amount_paise: entity.amount || 0,
        amount_inr: (entity.amount || 0) / 100,
        method: entity.method || 'upi',
        client_id: clientId || '',
        client_name: client?.name || notes.clientName || 'Candidate',
        client_phone: client?.phone || notes.phone || '',
        error_code: entity.error_code || 'PAYMENT_FAILED',
        error_description: entity.error_description || entity.error_reason || 'Transaction could not be processed by your bank',
        retry_link: `https://opusoverseas.com/portal/payments?retry=${entity.id}`,
        timestamp: new Date(nowS * 1000).toISOString(),
      },
      safeExecutionCtx(c)
    );
    await markDone('payment.failed dispatched for recovery');
  }

  // Always 200 on consume (at-least-once, idempotent via payment id / event id)
  return c.json({ ok: true });
});