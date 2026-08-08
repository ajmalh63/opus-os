// Unified messaging clients (PENDING-CONFIGS #1/#2).
// Provider-agnostic: WA_PROVIDER = 'openwa' (Baileys on VPS) | 'meta' (Meta Cloud API).
// Both are plain HTTPS — the Worker can call them; only OpenWA requires the VPS
// socket sidecar, Meta is fully Cloudflare-native.

export type MessagingEnv = {
  WA_PROVIDER?: 'openwa' | 'meta';
  OPENWA_BASE_URL?: string;
  OPENWA_SESSION_TOKEN?: string;
  META_WHATSAPP_PHONE_ID?: string;
  META_WHATSAPP_TOKEN?: string;
};

export interface SendResult {
  ok: boolean;
  provider: string;
  remoteId?: string;
  reason?: string;
}

// Outbound WhatsApp message. Returns { ok } — never throws.
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
      if (!res.ok) return { ok: false, provider, reason: `meta ${res.status}` };
      const data = (await res.json().catch(() => ({}))) as any;
      return { ok: true, provider, remoteId: data?.messages?.[0]?.id };
    } catch (e: any) {
      return { ok: false, provider, reason: e?.message };
    }
  }

  // OpenWA (Baileys sidecar on VPS)
  const base = env.OPENWA_BASE_URL;
  if (!base) return { ok: false, provider, reason: 'OPENWA_BASE_URL not configured' };
  try {
    const res = await fetch(`${base}/api/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.OPENWA_SESSION_TOKEN || ''}` },
      body: JSON.stringify({ to, text }),
    });
    if (!res.ok) return { ok: false, provider, reason: `openwa ${res.status}` };
    return { ok: true, provider };
  } catch (e: any) {
    return { ok: false, provider, reason: e?.message };
  }
}

// Unified customer-inbox send (web chat / email) — replaces Chatwoot's send API.
export async function inboxSendMessage(env: MessagingEnv, channel: string, contactKey: string, text: string): Promise<SendResult> {
  // In-repo inbox: messages persist via the conversations table (no external
  // Chatwoot needed). This stub is the delivery hook for email/web providers.
  return { ok: true, provider: 'inbox' };
}