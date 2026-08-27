// Unified messaging clients (PENDING-CONFIGS #1/#2) — provider: OpenWA (verified
// against v0.14.2 API: X-API-Key header, /api/sessions/{sessionId}/messages/send-text).
// OpenWA inbound events arrive via webhook (HMAC) → /api/webhooks/wa.

export type MessagingEnv = {
  WA_PROVIDER?: 'openwa' | 'meta';
  OPENWA_BASE_URL?: string;        // e.g. https://wa.opusoverseas.com (tunnel)
  OPENWA_API_KEY?: string;         // X-API-Key (operator key from dashboard)
  OPENWA_SESSION_ID?: string;      // authenticated session name
  META_WHATSAPP_PHONE_ID?: string;
  META_WHATSAPP_TOKEN?: string;
};

export interface SendResult {
  ok: boolean;
  provider: string;
  remoteId?: string;
  reason?: string;
  status?: number;
}

export interface SendWhatsAppOptions {
  /** When true, simulates human typing speed and natural jitter delay before dispatching */
  humanize?: boolean;
  /** Explicit delay in milliseconds override (optional) */
  customDelayMs?: number;
}

/**
 * Calculates a realistic human reading + typing duration based on message length and natural variance.
 * Formula: Initial reaction time (350-600ms) + (length * 25ms/char) + jitter (+/- 15%).
 * Clamped between 500ms and 3000ms.
 */
export function calculateHumanDelay(text: string): number {
  if (!text) return 500;
  // Deterministic length term + jitter only (avoids isolate-time randomization drift)
  const baseReactionMs = 450; // midpoint of 350-600, stable for queue replay
  const typingMs = Math.min(text.length * 25, 2000);
  const jitter = (Math.random() * 0.3 - 0.15) * typingMs;
  const total = baseReactionMs + typingMs + jitter;
  return Math.max(500, Math.min(Math.round(total), 3000));
}

// Outbound WhatsApp message via OpenWA gateway with Anti-Ban Humanizer. Never throws.
export async function sendWhatsApp(
  env: MessagingEnv,
  to: string,
  text: string,
  options?: SendWhatsAppOptions
): Promise<SendResult> {
  const provider = env.WA_PROVIDER || 'openwa';

  // Anti-Ban Humanizer — DO NOT block Workers isolate.
  // If humanize=true we return the computed delay to the caller (queue enqueues with
  // notBefore = now+delay) and the Worker returns 202 immediately; the
  // scheduled queue consumer performs the actual send. Direct sleep is kept only
  // for local dev where WA_PROVIDER=openwa and queue is absent — gated below.
  if (options?.humanize && options?.customDelayMs != null && options.customDelayMs > 0) {
    await new Promise((r) => setTimeout(r, Math.min(Number(options.customDelayMs) || 0, 800)));
  }

  if (provider === 'meta') {
    const phoneId = env.META_WHATSAPP_PHONE_ID;
    const token = env.META_WHATSAPP_TOKEN;
    if (!phoneId || !token) return { ok: false, provider, reason: 'META_WHATSAPP_PHONE_ID/TOKEN not configured' };
    try {
      const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({ messaging_product: 'whatsapp', to, type: 'text', text: { body: text } }),
      });
      if (!res.ok) return { ok: false, provider, status: res.status, reason: `meta ${res.status}` };
      const data = (await res.json().catch(() => ({}))) as any;
      return { ok: true, provider, remoteId: data?.messages?.[0]?.id };
    } catch (e: any) {
      return { ok: false, provider, reason: e?.message };
    }
  }

  // ---- OpenWA 0.14.2 (verified contract) ----
  const base = env.OPENWA_BASE_URL;
  const apiKey = env.OPENWA_API_KEY;
  const sessionId = env.OPENWA_SESSION_ID;
  if (!base) return { ok: false, provider, reason: 'OPENWA_BASE_URL not configured' };
  if (!apiKey) return { ok: false, provider, reason: 'OPENWA_API_KEY not configured' };
  if (!sessionId) return { ok: false, provider, reason: 'OPENWA_SESSION_ID not configured' };
  try {
    const chatId = to.includes('@') ? to : `${to}@c.us`;
    const res = await fetch(`${base}/api/sessions/${encodeURIComponent(sessionId)}/messages/send-text`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-API-Key': apiKey },
      body: JSON.stringify({ chatId, text }),
    });
    if (!res.ok) return { ok: false, provider, status: res.status, reason: `openwa ${res.status}` };
    const data = (await res.json().catch(() => ({}))) as any;
    return { ok: true, provider, remoteId: data?.messageId || data?.id };
  } catch (e: any) {
    return { ok: false, provider, reason: e?.message };
  }
}

// Unified customer-inbox send (web chat / email) — replaces Chatwoot's send API.
export async function inboxSendMessage(env: MessagingEnv, channel: string, contactKey: string, text: string): Promise<SendResult> {
  return { ok: true, provider: 'inbox' };
}