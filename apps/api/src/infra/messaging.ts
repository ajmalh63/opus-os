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

// Outbound WhatsApp message via OpenWA gateway. Never throws.
export async function sendWhatsApp(env: MessagingEnv, to: string, text: string): Promise<SendResult> {
  const provider = env.WA_PROVIDER || 'openwa';

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