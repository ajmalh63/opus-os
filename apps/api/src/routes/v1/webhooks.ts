import { Hono } from 'hono';
import { getDb } from '../../db/client.js';
import { outboundWebhooks } from '../../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { apiKeyAuth } from '../../middleware/apiKeyAuth.js';
import { idempotency } from '../../middleware/idempotency.js';
import { auditEvent } from '../../middleware/audit.js';

export const v1WebhooksRouter = new Hono<{ Bindings: { DB: D1Database } }>();

const now = () => Math.floor(Date.now() / 1000);
const uid = () => `wh_${now()}_${crypto.randomUUID().slice(0, 8)}`;

// GET /api/v1/webhooks — List subscriptions
v1WebhooksRouter.get('/', apiKeyAuth(['webhooks:manage']), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB unavailable' }, 500);
  const db = getDb(c.env.DB);

  try {
    const rows = await db.select().from(outboundWebhooks).orderBy(desc(outboundWebhooks.createdAt)).all();

    return c.json({
      success: true,
      data: rows.map((r: any) => ({
        id: r.id,
        name: r.name,
        url: r.url,
        events: typeof r.events === 'string' ? JSON.parse(r.events) : r.events,
        isActive: r.isActive,
        failureCount: r.failureCount,
        lastDeliveryAt: r.lastDeliveryAt,
        lastDeliveryStatus: r.lastDeliveryStatus,
        createdAt: r.createdAt,
      })),
      count: rows.length,
    });
  } catch (err: any) {
    return c.json({ error: 'Failed to retrieve webhooks', details: err.message }, 500);
  }
});

// POST /api/v1/webhooks — Create webhook subscription
v1WebhooksRouter.post('/', apiKeyAuth(['webhooks:manage']), idempotency(), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB unavailable' }, 500);
  const db = getDb(c.env.DB);
  const body = await c.req.json().catch(() => ({}));

  const name = (body.name || 'External Listener').trim();
  const url = (body.url || '').trim();
  const events = Array.isArray(body.events) && body.events.length > 0 ? body.events : ['*'];

  if (!url || !url.startsWith('http')) {
    return c.json({ error: 'Validation Error', message: 'Valid HTTP/HTTPS URL is required.' }, 400);
  }

  try {
    const id = uid();
    const secret = `whsec_${crypto.randomUUID().replace(/-/g, '')}`;

    await db.insert(outboundWebhooks).values({
      id,
      name,
      url,
      secret,
      events: JSON.stringify(events),
      isActive: true,
      failureCount: 0,
      createdAt: now(),
      updatedAt: now(),
    });

    c.executionCtx?.waitUntil(
      auditEvent(c, {
        action: 'WEBHOOK_SUBSCRIBED',
        entityName: 'outbound_webhooks',
        entityId: id,
        result: 'success',
        category: 'workflow',
        actorType: 'service',
        authMethod: 'service_token',
        afterState: { name, url, events },
      }),
    );

    return c.json(
      {
        success: true,
        data: {
          id,
          name,
          url,
          secret, // Plaintext secret returned ONCE on creation
          events,
          isActive: true,
          createdAt: now(),
        },
      },
      201,
    );
  } catch (err: any) {
    return c.json({ error: 'Failed to create webhook', details: err.message }, 500);
  }
});

// DELETE /api/v1/webhooks/:id — Delete subscription
v1WebhooksRouter.delete('/:id', apiKeyAuth(['webhooks:manage']), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB unavailable' }, 500);
  const db = getDb(c.env.DB);
  const id = c.req.param('id') || '';

  try {
    const existing = await db.select().from(outboundWebhooks).where(eq(outboundWebhooks.id, id)).get();
    if (!existing) return c.json({ error: 'Not Found', message: `Webhook '${id}' not found.` }, 404);

    await db.delete(outboundWebhooks).where(eq(outboundWebhooks.id, id)).execute();

    return c.json({ success: true, message: `Webhook '${id}' deleted.` });
  } catch (err: any) {
    return c.json({ error: 'Failed to delete webhook', details: err.message }, 500);
  }
});
