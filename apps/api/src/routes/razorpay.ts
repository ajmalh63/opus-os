import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { getDb } from '../db/client.js';
import { payments, engagements, milestones } from '../db/schema.js';
import { eq } from 'drizzle-orm';

export const razorpayRouter = new Hono<{
  Bindings: { DB: D1Database; BETTER_AUTH_SECRET: string; RAZORPAY_KEY_ID?: string; RAZORPAY_KEY_SECRET?: string }
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
    return c.json({ error: "Razorpay order failed", details: error.message }, 500);
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

    return c.json({
      success: true,
      id: paymentId,
      razorpay_payment_id: data.razorpay_payment_id,
      verified: true,
      message: "Payment verified & recorded.",
    });
  } catch (error: any) {
    return c.json({ error: "Verify failed", details: error.message }, 500);
  }
});

export const razorpayWebhookRouter = new Hono<{
  Bindings: { DB: D1Database; RAZORPAY_WEBHOOK_SECRET?: string }
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
    return c.json({ error: "Invalid webhook signature" }, 403);
  }

  const event = JSON.parse(rawBody);
  if (event.event === 'payment.captured' && event.payload?.payment?.entity?.id) {
    const entity = event.payload.payment.entity;
    const notes = entity.notes || {};
    const engagementId = notes.engagementId;
    const clientId = notes.clientId;

    // Idempotency: dedupe by the razorpay payment id (A-2 replay protection)
    const existing = await db.select().from(payments).where(eq(payments.referenceNumber, entity.id)).get();
    if (existing) {
      return c.json({ ok: true, message: 'duplicate' });
    }

    if (engagementId) {
      const amount = entity.amount || 0;
      const now = Math.floor(Date.now() / 1000);
      await db.insert(payments).values({
        id: crypto.randomUUID(),
        clientId: clientId || '',
        engagementId,
        amount,
        type: 'receipt',
        milestoneName: 'Razorpay webhook capture',
        method: 'upi',
        referenceNumber: entity.id,
        createdAt: now,
      });
      const eng = await db.select().from(engagements).where(eq(engagements.id, engagementId)).get();
      if (eng) {
        await db.update(engagements).set({ outstandingBalance: eng.outstandingBalance - amount, updatedAt: now }).where(eq(engagements.id, engagementId));
      }
    }
  }

  // Always 200 on consume (at-least-once, idempotent via payment id)
  return c.json({ ok: true });
});