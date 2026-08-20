import { Hono } from 'hono';
import { getDb } from '../../db/client.js';
import { attestationRateCards, attestationApplications, clients } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { apiKeyAuth } from '../../middleware/apiKeyAuth.js';
import { idempotency } from '../../middleware/idempotency.js';
import { auditEvent } from '../../middleware/audit.js';
import { dispatchWebhook } from '../../infra/webhookDispatcher.js';

export const v1AttestationRouter = new Hono<{ Bindings: { DB: D1Database } }>();

const now = () => Math.floor(Date.now() / 1000);
const uid = () => `ATT-${now()}-${crypto.randomUUID().slice(0, 8)}`;

// GET /api/v1/attestation/rate-cards — List Indicative Rate Cards
v1AttestationRouter.get('/rate-cards', apiKeyAuth(['attestation:read']), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB unavailable' }, 500);
  const db = getDb(c.env.DB);
  const country = c.req.query('country');

  try {
    let rows: any[] = [];
    if (country) {
      rows = await db
        .select()
        .from(attestationRateCards)
        .where(eq(attestationRateCards.country, country))
        .all();
    } else {
      rows = await db.select().from(attestationRateCards).all();
    }

    return c.json({
      success: true,
      data: rows.map((r: any) => ({
        id: r.id,
        country: r.country,
        category: r.category,
        route: r.route,
        title: r.title,
        timelineDays: r.timelineDays,
        pricePaise: r.pricePaise,
        govtFeePaise: r.govtFeePaise,
      })),
      count: rows.length,
    });
  } catch (err: any) {
    return c.json({ error: 'Failed to retrieve rate cards', details: err.message }, 500);
  }
});

// POST /api/v1/attestation/orders — Create Attestation Application
v1AttestationRouter.post('/orders', apiKeyAuth(['attestation:write']), idempotency(), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB unavailable' }, 500);
  const db = getDb(c.env.DB);
  const body = await c.req.json().catch(() => ({}));

  const clientId = (body.clientId || '').trim();
  const destinationCountry = (body.destinationCountry || body.targetCountry || '').trim();
  const category = body.category || 'personal';
  const documentType = body.documentType || 'degree';

  if (!clientId || !destinationCountry) {
    return c.json({ error: 'Validation Error', message: 'clientId and destinationCountry are required.' }, 400);
  }

  try {
    const client = await db.select().from(clients).where(eq(clients.id, clientId)).get();
    if (!client) return c.json({ error: 'Not Found', message: `Client '${clientId}' not found.` }, 404);

    const orderId = uid();
    await db.insert(attestationApplications).values({
      id: orderId,
      clientId,
      destinationCountry,
      category,
      documentType,
      stage: 'quote_requested',
      status: 'pending',
      createdAt: now(),
      updatedAt: now(),
    });

    c.executionCtx?.waitUntil(
      Promise.all([
        auditEvent(c, {
          action: 'ATTESTATION_ORDER_CREATED',
          entityName: 'attestation_applications',
          entityId: orderId,
          result: 'success',
          category: 'workflow',
          actorType: 'service',
          authMethod: 'service_token',
          afterState: { clientId, destinationCountry, category, documentType },
        }),
        dispatchWebhook(c.env, 'attestation.order_created', {
          orderId,
          clientId,
          destinationCountry,
          category,
          createdAt: now(),
        }),
      ]),
    );

    return c.json(
      {
        success: true,
        data: {
          id: orderId,
          clientId,
          destinationCountry,
          category,
          documentType,
          stage: 'quote_requested',
          createdAt: now(),
        },
      },
      201,
    );
  } catch (err: any) {
    return c.json({ error: 'Failed to create attestation order', details: err.message }, 500);
  }
});
