// Listmonk webhook consumer (Wave 3, DPDP-aligned email hygiene).
// Receives Listmonk event POSTs (bounce / unsubscribe / subscribe / click /
// open), maintains `listmonk_suppressions`, and logs every delivery into the
// A-3 `webhook_events` table. Fail-closed: 503 unless LISTMONK_WEBHOOK_SECRET
// is configured; Listmonk has no built-in HMAC, so the secret travels as a
// query param (?secret=) or X-Webhook-Secret header (configured in Listmonk
// UI under Settings → Webhooks) — compared in constant time.

import { Hono } from 'hono';
import { getDb } from '../db/client.js';
import { listmonkSuppressions, webhookEvents } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { timingSafeEqualHex } from '../services/paymentLinks.js';
import { auditBounded } from '../middleware/audit.js';

type WhEnv = { DB: D1Database; LISTMONK_WEBHOOK_SECRET?: string };

export const listmonkWebhookRouter = new Hono<{ Bindings: WhEnv }>();

function extractEmail(body: any): string | undefined {
  const d = body?.data || {};
  const subscriber = d.Subscriber || d.subscriber || d.email;
  const email = typeof subscriber === 'string' ? subscriber : subscriber?.email;
  return (email ? String(email).trim().toLowerCase() : undefined) || undefined;
}

function extractBounceType(body: any): 'hard' | 'soft' | undefined {
  const t = (body?.data?.Bounce?.type || body?.data?.Bounce?.bounce_type || '').toString().toLowerCase();
  return t === 'hard' || t === 'soft' ? t : undefined;
}

async function upsertSuppression(
  db: ReturnType<typeof getDb>,
  email: string,
  patch: Partial<{ suppressed: boolean; reason: string | null; softCount: number }>
): Promise<void> {
  const now = Math.floor(Date.now() / 1000);
  await db.insert(listmonkSuppressions).values({ email, suppressed: false, reason: null, softCount: 0, createdAt: now, updatedAt: now }).onConflictDoNothing();
  await db.update(listmonkSuppressions).set({ ...patch, updatedAt: now }).where(eq(listmonkSuppressions.email, email));
}

listmonkWebhookRouter.post('/', async (c) => {
  const secret = c.env.LISTMONK_WEBHOOK_SECRET;
  if (!secret) return c.json({ error: 'Listmonk webhook not configured — set LISTMONK_WEBHOOK_SECRET' }, 503);
  if (!c.env.DB) return c.json({ error: 'DB not available' }, 500);

  const provided = c.req.query('secret') || c.req.header('x-webhook-secret') || '';
  if (!provided || !timingSafeEqualHex(provided.toString(), secret)) {
    await auditBounded(c, {
      action: 'WEBHOOK_REJECTED',
      entityName: 'webhooks',
      entityId: 'listmonk',
      result: 'error',
      category: 'access',
      actorType: 'service',
      authMethod: 'secret',
      afterState: { source: 'listmonk' },
    }, 'webhook');
    return c.json({ error: 'Invalid webhook secret' }, 401);
  }

  const db = getDb(c.env.DB);
  const body: any = await c.req.json().catch(() => ({}));
  const event = String(body?.event || '').toLowerCase();
  const email = extractEmail(body);
  const now = Math.floor(Date.now() / 1000);

  // A-3: log the delivery (dedupe key = event+email) BEFORE acting
  const logId = `listmonk:${event}:${email || 'unknown'}`;
  await db.insert(webhookEvents).values({ id: logId, event: `listmonk.${event}`, entityId: email || null, signature: provided, receivedAt: now, processed: true, detail: null }).onConflictDoNothing();

  if (!email) {
    await db.update(webhookEvents).set({ detail: 'no email in payload' }).where(eq(webhookEvents.id, logId)).catch(() => {});
    return c.json({ ok: true, detail: 'no email' });
  }

  let detail = 'tracked';
  try {
    if (event === 'bounce') {
      const type = extractBounceType(body);
      if (type === 'hard') {
        await upsertSuppression(db, email, { suppressed: true, reason: 'hard_bounce' });
        detail = 'suppressed: hard_bounce';
      } else if (type === 'soft') {
        const row = await db.select().from(listmonkSuppressions).where(eq(listmonkSuppressions.email, email)).get();
        const count = (row?.softCount || 0) + 1;
        if (count >= 3) {
          await upsertSuppression(db, email, { suppressed: true, reason: 'soft_bounce_3x', softCount: count });
          detail = 'suppressed: soft_bounce_3x';
        } else {
          await upsertSuppression(db, email, { suppressed: false, softCount: count });
          detail = `soft bounce ${count}/3`;
        }
      } else {
        detail = 'bounce without type';
      }
    } else if (event === 'unsubscribe' || event === 'unsubscribed') {
      await upsertSuppression(db, email, { suppressed: true, reason: 'unsubscribed' });
      detail = 'suppressed: unsubscribed';
    } else if (event === 'complained' || event === 'complaint') {
      await upsertSuppression(db, email, { suppressed: true, reason: 'complaint' });
      detail = 'suppressed: complaint';
    } else if (event === 'subscribe' || event === 'resubscribe') {
      await upsertSuppression(db, email, { suppressed: false, reason: null, softCount: 0 });
      detail = 'suppression cleared (re-subscribed)';
    }
    // click/open → log-only (detail stays 'tracked')
  } catch (e: any) {
    detail = `error: ${e?.message || 'unknown'}`;
  }
  await db.update(webhookEvents).set({ detail }).where(eq(webhookEvents.id, logId)).catch(() => {});
  return c.json({ ok: true, detail });
});

// Shared with the nurture lane: emails currently hard-suppressed (DPDP).
export async function getSuppressedEmails(db: ReturnType<typeof getDb>): Promise<Set<string>> {
  const rows = await db.select().from(listmonkSuppressions).where(eq(listmonkSuppressions.suppressed, true)).all();
  return new Set(rows.map((r) => r.email.toLowerCase()));
}