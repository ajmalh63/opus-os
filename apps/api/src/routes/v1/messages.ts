import { Hono } from 'hono';
import { safeExecutionCtx } from '../../lib/webhookDispatcher.js';
import { getDb } from '../../db/client.js';
import { notifications } from '../../db/schema.js';
import { apiKeyAuth } from '../../middleware/apiKeyAuth.js';
import { idempotency } from '../../middleware/idempotency.js';
import { sendWhatsApp } from '../../infra/messaging.js';
import { auditEvent } from '../../middleware/audit.js';

export const v1MessagesRouter = new Hono<{ Bindings: { DB: D1Database; OPENWA_BASE_URL?: string; OPENWA_API_KEY?: string; OPENWA_SESSION_ID?: string } }>();

const now = () => Math.floor(Date.now() / 1000);
const uid = () => `NOTIF-${now()}-${crypto.randomUUID().slice(0, 8)}`;

// POST /api/v1/messages/whatsapp — Send Outbound WhatsApp Message
v1MessagesRouter.post('/whatsapp', apiKeyAuth(['messages:write']), idempotency(), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB unavailable' }, 500);
  const db = getDb(c.env.DB);
  const body = await c.req.json().catch(() => ({}));

  const phone = (body.phone || '').trim();
  const text = (body.text || '').trim();
  const clientId = body.clientId || null;

  if (!phone || !text) {
    return c.json({ error: 'Validation Error', message: 'phone and text are required.' }, 400);
  }

  try {
    const notifId = uid();
    const result = await sendWhatsApp(c.env as any, phone, text);

    await db.insert(notifications).values({
      id: notifId,
      channel: 'whatsapp',
      to: phone,
      subject: 'WhatsApp Dispatch',
      body: text,
      status: result.ok ? 'sent' : 'failed',
      provider: result.provider,
      remoteId: result.remoteId || null,
      clientId,
      createdAt: now(),
      sentAt: result.ok ? now() : null,
    });

    safeExecutionCtx(c)?.waitUntil(
      auditEvent(c as any, {
        action: 'WHATSAPP_DISPATCHED',
        entityName: 'notifications',
        entityId: notifId,
        result: result.ok ? 'success' : 'error',
        category: 'communication',
        actorType: 'service',
        authMethod: 'service_token',
        afterState: { phone, textLength: text.length, ok: result.ok },
      }),
    );

    return c.json({
      success: result.ok,
      data: {
        id: notifId,
        to: phone,
        provider: result.provider,
        remoteId: result.remoteId || null,
        reason: result.reason || null,
        createdAt: now(),
      },
    });
  } catch (err: any) {
    return c.json({ error: 'Failed to send message', details: err.message }, 500);
  }
});
