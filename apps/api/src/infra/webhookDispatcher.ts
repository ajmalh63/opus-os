import { getDb } from '../db/client.js';
import { outboundWebhooks } from '../db/schema.js';
import { eq } from 'drizzle-orm';

export interface WebhookEventPayload {
  id: string; // evt_...
  event: string; // e.g. lead.created, study_abroad.offer_received
  createdAt: number;
  data: Record<string, any>;
}

// Compute HMAC-SHA256 signature
async function signWebhookPayload(secret: string, timestamp: number, payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const data = enc.encode(`${timestamp}.${payload}`);
  const sig = await crypto.subtle.sign('HMAC', key, data);
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Outbound Webhook Dispatcher
export async function dispatchWebhook(
  env: { DB?: D1Database },
  event: string,
  data: Record<string, any>,
): Promise<{ dispatched: number; failed: number }> {
  if (!env?.DB) return { dispatched: 0, failed: 0 };
  const db = getDb(env.DB);
  const now = Math.floor(Date.now() / 1000);

  try {
    const subscribers = await db.select().from(outboundWebhooks).where(eq(outboundWebhooks.isActive, true)).all();
    if (!subscribers.length) return { dispatched: 0, failed: 0 };

    const eventPayload: WebhookEventPayload = {
      id: `evt_${now}_${crypto.randomUUID().slice(0, 8)}`,
      event,
      createdAt: now,
      data,
    };

    const payloadJson = JSON.stringify(eventPayload);
    let dispatched = 0;
    let failed = 0;

    const promises = subscribers.map(async (sub) => {
      let events: string[] = [];
      try {
        events = typeof sub.events === 'string' ? JSON.parse(sub.events) : sub.events;
      } catch {
        events = [];
      }

      // Check if subscriber is interested in this event or wildcard
      if (!events.includes('*') && !events.includes(event)) {
        return;
      }

      const deliveryId = `del_${now}_${crypto.randomUUID().slice(0, 8)}`;
      const signature = await signWebhookPayload(sub.secret, now, payloadJson);

      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 10000); // 10s timeout

        const res = await fetch(sub.url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'User-Agent': 'OpusOS-Webhook/1.0',
            'X-Opus-Event': event,
            'X-Opus-Delivery-Id': deliveryId,
            'X-Opus-Signature': `t=${now},v1=${signature}`,
          },
          body: payloadJson,
          signal: controller.signal,
        });

        clearTimeout(timeout);

        if (res.ok) {
          dispatched++;
          await db
            .update(outboundWebhooks)
            .set({
              lastDeliveryAt: now,
              lastDeliveryStatus: res.status,
              failureCount: 0,
              updatedAt: now,
            })
            .where(eq(outboundWebhooks.id, sub.id))
            .execute();
        } else {
          failed++;
          await db
            .update(outboundWebhooks)
            .set({
              lastDeliveryAt: now,
              lastDeliveryStatus: res.status,
              failureCount: sub.failureCount + 1,
              updatedAt: now,
            })
            .where(eq(outboundWebhooks.id, sub.id))
            .execute();
        }
      } catch {
        failed++;
        await db
          .update(outboundWebhooks)
          .set({
            lastDeliveryAt: now,
            lastDeliveryStatus: 0,
            failureCount: sub.failureCount + 1,
            updatedAt: now,
          })
          .where(eq(outboundWebhooks.id, sub.id))
          .execute();
      }
    });

    await Promise.all(promises);
    return { dispatched, failed };
  } catch {
    return { dispatched: 0, failed: 0 };
  }
}
