/**
 * Opus OS — Centralized Webhook Dispatcher
 * Asynchronously emits structured business events to n8n orchestration hub
 * with HMAC-SHA256 signatures and non-blocking delivery.
 */

export interface OpusWebhookEvent {
  id: string;
  event: 
    | 'lead.created'
    | 'booking.created'
    | 'attestation.created'
    | 'attestation.status_updated'
    | 'payment.received'
    | 'payment.failed'
    | 'payment.link_requested'
    | 'candidate.applied';
  timestamp: number;
  environment: string;
  data: Record<string, any>;
}

async function computeHmacSha256(secret: string, payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const signature = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  return Array.from(new Uint8Array(signature))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// hono's c.executionCtx getter THROWS when no execution context exists
// (tests via app.request(), non-Workers runtimes). Always access it safely.
export function safeExecutionCtx(c: any): ExecutionContext | undefined {
  try {
    return (c as any).executionCtx;
  } catch {
    return undefined;
  }
}

export async function dispatchWebhookEvent(
  env: { N8N_WEBHOOK_URL?: string; N8N_WEBHOOK_SECRET?: string; [key: string]: any },
  event: OpusWebhookEvent['event'],
  data: Record<string, any>,
  executionCtx?: ExecutionContext
): Promise<void> {
  // Fail-closed: never dispatch with a fallback/committed secret. If the
  // automation lane isn't configured, skip dispatch (log once) — a forged
  // event with a public key is worse than no event.
  const webhookUrl = env.N8N_WEBHOOK_URL;
  const secret = env.N8N_WEBHOOK_SECRET;
  if (!webhookUrl || !secret) {
    console.warn('[WebhookDispatcher] N8N_WEBHOOK_URL/SECRET not configured — event skipped', event);
    return;
  }

  const payload: OpusWebhookEvent = {
    id: `evt_${crypto.randomUUID()}`,
    event,
    timestamp: Math.floor(Date.now() / 1000),
    environment: 'production',
    data,
  };

  const dispatchPromise = (async () => {
    try {
      const rawBody = JSON.stringify(payload);
      const signature = await computeHmacSha256(secret, rawBody);

      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'OpusOS-Webhook-Engine/1.0',
          'X-Opus-Signature': signature,
          'X-Opus-Event': event,
        },
        body: rawBody,
      });

      if (!response.ok) {
        console.warn(`[WebhookDispatcher] Non-200 response from n8n (${response.status}): ${event}`);
      }
    } catch (err: any) {
      // Safe no-op on network failure so user flows are never blocked
      console.warn(`[WebhookDispatcher] Delivery failed for ${event}: ${err?.message}`);
    }
  })();

  if (executionCtx && typeof executionCtx.waitUntil === 'function') {
    executionCtx.waitUntil(dispatchPromise);
  } else {
    // Fire and forget in local/test environments
    dispatchPromise.catch(() => {});
  }
}
