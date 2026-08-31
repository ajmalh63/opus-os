import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { getDb } from "../db/client.js";
import { payments } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { auditBounded } from "../middleware/audit.js";
import { syncSinglePaymentToErp } from "./erpnext.js";
import { dispatchWebhookEvent, safeExecutionCtx } from "../lib/webhookDispatcher.js";

export const standardOrderRouter = new Hono<{
  Bindings: {
    DB?: D1Database;
    RAZORPAY_KEY_ID?: string;
    RAZORPAY_KEY_SECRET?: string;
  };
}>();

export const standardVerifyRouter = new Hono<{
  Bindings: {
    DB?: D1Database;
    RAZORPAY_KEY_ID?: string;
    RAZORPAY_KEY_SECRET?: string;
  };
}>();

const RZR_BASE = "https://api.razorpay.com/v1";

function basicAuth(keyId: string, keySecret: string): string {
  return "Basic " + btoa(`${keyId}:${keySecret}`);
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a.charCodeAt(i) ^ b.charCodeAt(i));
  return diff === 0;
}

export async function verifyRazorpaySignature(
  orderId: string,
  paymentId: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const body = `${orderId}|${paymentId}`;
  const enc = new TextEncoder();
  const keyData = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", keyData, enc.encode(body));
  const hex = Array.from(new Uint8Array(sig))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
  return timingSafeEqualHex(hex, signature);
}

// POST /api/create-order
const createOrderSchema = z.object({
  amount: z.number().int().min(100, "Minimum amount is 100 paise (₹1)"), // in paise
  currency: z.string().default("INR"),
  receipt: z.string().optional(),
  notes: z.record(z.any()).optional(),
});

standardOrderRouter.post("/", zValidator("json", createOrderSchema), async (c) => {
  const data = c.req.valid("json");
  const keyId = c.env.RAZORPAY_KEY_ID;
  const keySecret = c.env.RAZORPAY_KEY_SECRET;
  // P1-4 fail-closed: never create live-money orders with TEST keys in production
  if ((c.env as any).ENVIRONMENT === "production" && String(keyId || "").startsWith("rzp_test")) {
    return c.json({ error: "Payments are misconfigured for production (test key detected). Contact support." }, 503);
  }

  if (!keyId || !keySecret) {
    return c.json(
      { error: "Razorpay credentials not configured (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET)" },
      503
    );
  }

  const receipt = data.receipt || `rcpt_${Date.now().toString(36)}`;

  try {
    const rzRes = await fetch(`${RZR_BASE}/orders`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: basicAuth(keyId, keySecret),
      },
      body: JSON.stringify({
        amount: data.amount,
        currency: data.currency || "INR",
        receipt,
        notes: data.notes || {},
        partial_payment: false,
      }),
    });

    if (!rzRes.ok) {
      const errorText = await rzRes.text().catch(() => "");
      return c.json({ error: "Razorpay order creation failed", details: errorText }, rzRes.status >= 500 ? 500 : 400);
    }

    const order = (await rzRes.json()) as { id: string; amount: number; currency: string; [k: string]: any };

    return c.json({
      success: true,
      order_id: order.id,
      id: order.id,
      amount: order.amount,
      currency: order.currency,
      receipt: order.receipt,
      key_id: keyId,
    });
  } catch (err: any) {
    return c.json({ error: "Failed to connect to Razorpay", details: err?.message }, 500);
  }
});

// POST /api/verify-payment
const verifyPaymentSchema = z.object({
  razorpay_order_id: z.string().min(1, "Missing razorpay_order_id"),
  razorpay_payment_id: z.string().min(1, "Missing razorpay_payment_id"),
  razorpay_signature: z.string().min(1, "Missing razorpay_signature"),
  clientId: z.string().optional(),
  engagementId: z.string().optional(),
  milestoneName: z.string().optional(),
});

standardVerifyRouter.post("/", zValidator("json", verifyPaymentSchema), async (c) => {
  const data = c.req.valid("json");
  const keyId = c.env.RAZORPAY_KEY_ID;
  const keySecret = c.env.RAZORPAY_KEY_SECRET;

  if (!keyId || !keySecret) {
    return c.json(
      { error: "Razorpay credentials not configured (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET)" },
      503
    );
  }

  const isValid = await verifyRazorpaySignature(
    data.razorpay_order_id,
    data.razorpay_payment_id,
    data.razorpay_signature,
    keySecret
  );

  if (!isValid) {
    await auditBounded(
      c,
      {
        action: "PAYMENT_VERIFY_FAILED",
        entityName: "payments",
        entityId: data.razorpay_order_id,
        result: "error",
        category: "money",
        afterState: {
          orderId: data.razorpay_order_id,
          paymentId: data.razorpay_payment_id,
        },
      },
      "verify"
    );
    return c.json({ error: "Signature mismatch - invalid payment", success: false }, 400);
  }

  // If DB is available, check idempotency and record receipt if client/engagement provided
  if (c.env.DB) {
    try {
      const db = getDb(c.env.DB);
      const existing = await db
        .select()
        .from(payments)
        .where(eq(payments.referenceNumber, data.razorpay_payment_id))
        .get();

      let paymentId = existing?.id;

      if (!existing && data.clientId && data.engagementId) {
        paymentId = crypto.randomUUID();
        const now = Math.floor(Date.now() / 1000);
        await db.insert(payments).values({
          id: paymentId,
          clientId: data.clientId,
          engagementId: data.engagementId,
          amount: 0,
          type: "receipt",
          milestoneName: data.milestoneName || "Razorpay Checkout",
          method: "upi",
          referenceNumber: data.razorpay_payment_id,
          createdAt: now,
        });

        // Trigger real-time ERPNext sync
        syncSinglePaymentToErp(c.env as any, db, paymentId).catch((err: any) => {
          console.error("ERPNext background sync error:", err?.message);
        });

        // Trigger real-time n8n accounting webhook
        dispatchWebhookEvent(
          c.env,
          "payment.received",
          {
            paymentId,
            clientId: data.clientId,
            engagementId: data.engagementId,
            referenceNumber: data.razorpay_payment_id,
            milestoneName: data.milestoneName || "Razorpay Checkout",
            receivedAt: now,
          },
          safeExecutionCtx(c)
        );
      }
    } catch {
      // Non-blocking for client response
    }
  }

  return c.json({
    success: true,
    message: "Payment verified successfully",
    order_id: data.razorpay_order_id,
    payment_id: data.razorpay_payment_id,
  });
});
