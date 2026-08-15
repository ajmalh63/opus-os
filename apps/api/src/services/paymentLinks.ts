// Razorpay Payment Links engine (2026 docs) — usable from the Transactions
// module by ANY staff role. Flow: entry (any ₹) → create payment link →
// short_url returned for WhatsApp/email → customer pays → payment_link.paid
// webhook → finalize (mark paid + receipt applied + incentives/points/email).
// Fail-closed: no key/secret → 503, never test keys in prod.

const RZR_BASE = 'https://api.razorpay.com/v1';

type RzEnv = { RAZORPAY_KEY_ID?: string; RAZORPAY_KEY_SECRET?: string };

export function rzrAuth(env: RzEnv): string {
  const key = env.RAZORPAY_KEY_ID;
  const secret = env.RAZORPAY_KEY_SECRET;
  if (!key || !secret) throw new Error('Razorpay credentials not configured');
  return 'Basic ' + btoa(`${key}:${secret}`);
}

// POST /v1/payment_links — create a payment link for amount (integer paise)
export interface PaymentLinkInput {
  amount: number; // paise
  name?: string;
  email?: string;
  contact?: string;
  description?: string;
  notes: Record<string, string>; // { entryId, clientId, engagementId, milestone }
  expireBy?: number; // epoch seconds
  callbackUrl?: string; // customer lands here after payment (e.g. /payment-confirmed)
}

export async function createPaymentLink(
  env: RzEnv,
  input: PaymentLinkInput
): Promise<{ ok: boolean; shortUrl?: string; linkId?: string; status?: string; reason?: string }> {
  let auth: string;
  try { auth = rzrAuth(env); } catch (e: any) { return { ok: false, reason: e?.message }; }

  try {
    const body: Record<string, any> = {
      amount: input.amount,
      currency: 'INR',
      description: input.description || 'Opus Overseas payment',
      accept_partial: false,
      customer: { name: input.name || 'Customer', ...(input.email ? { email: input.email } : {}), ...(input.contact ? { contact: input.contact } : {}) },
      notify: { sms: !!input.contact, email: !!input.email },
      reminder_enable: true,
      notes: input.notes,
    };
    if (input.expireBy) body.expire_by = input.expireBy;
    if (input.callbackUrl) body.callback_url = input.callbackUrl, body.callback_method = 'get';

    const res = await fetch(`${RZR_BASE}/payment_links`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: auth },
      body: JSON.stringify(body),
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { ok: false, reason: json?.error?.description || `Razorpay HTTP ${res.status}` };
    }
    return { ok: true, shortUrl: json.short_url, linkId: json.id, status: json.status };
  } catch (e: any) {
    return { ok: false, reason: e?.message };
  }
}

// POST /v1/payment_links/{id}/cancel — server-authoritative cancel.
// Returns { ok, status?, reason? }; caller owns state transitions.
export async function cancelPaymentLink(env: RzEnv, linkId: string): Promise<{ ok: boolean; status?: string; reason?: string }> {
  let auth: string;
  try { auth = rzrAuth(env); } catch (e: any) { return { ok: false, reason: e?.message }; }
  try {
    const res = await fetch(`${RZR_BASE}/payment_links/${linkId}/cancel`, {
      method: 'POST',
      headers: { Authorization: auth },
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok && res.status !== 200) {
      return { ok: false, reason: json?.error?.description || `Razorpay HTTP ${res.status}` };
    }
    return { ok: true, status: json.status || 'cancelled' };
  } catch (e: any) {
    return { ok: false, reason: e?.message };
  }
}

// Constant-time hex comparison (Workers-safe).
export function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a.charCodeAt(i) ^ b.charCodeAt(i));
  return diff === 0;
}

// Verify HMAC-SHA256 of the JSON body with the webhook secret (A-2).
export async function verifyWebhookSignature(rawBody: string, signature: string, secret: string): Promise<boolean> {
  if (!signature) return false;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(rawBody));
  const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return timingSafeEqualHex(hex, signature);
}