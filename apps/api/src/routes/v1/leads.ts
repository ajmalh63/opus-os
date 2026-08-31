import { Hono } from 'hono';
import { safeExecutionCtx } from '../../lib/webhookDispatcher.js';
import { getDb } from '../../db/client.js';
import { clients, engagements } from '../../db/schema.js';
import { eq, desc, and } from 'drizzle-orm';
import { apiKeyAuth } from '../../middleware/apiKeyAuth.js';
import { idempotency } from '../../middleware/idempotency.js';
import { newPortalToken } from '../../lib/clientToken.js';
import { auditEvent } from '../../middleware/audit.js';
import { dispatchWebhook } from '../../infra/webhookDispatcher.js';

export const v1LeadsRouter = new Hono<{ Bindings: { DB: D1Database } }>();

const now = () => Math.floor(Date.now() / 1000);
const uid = () => `LEAD-${now()}-${crypto.randomUUID().slice(0, 8)}`;

// GET /api/v1/leads — List leads with filtering and pagination
v1LeadsRouter.get('/', apiKeyAuth(['leads:read']), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB unavailable' }, 500);
  const db = getDb(c.env.DB);

  const division = c.req.query('division');
  const limit = Math.min(Number(c.req.query('limit')) || 50, 100);
  const offset = Number(c.req.query('offset')) || 0;

  try {
    let rows: any[] = [];
    if (division) {
      rows = await db
        .select()
        .from(clients)
        .where(and(eq(clients.primaryDivision, division), eq(clients.status, 'active')))
        .orderBy(desc(clients.createdAt))
        .limit(limit)
        .offset(offset)
        .all();
    } else {
      rows = await db
        .select()
        .from(clients)
        .where(eq(clients.status, 'active'))
        .orderBy(desc(clients.createdAt))
        .limit(limit)
        .offset(offset)
        .all();
    }

    return c.json({
      success: true,
      data: rows.map((r: any) => ({
        id: r.id,
        name: r.name,
        email: r.email,
        phone: r.phone,
        primaryDivision: r.primaryDivision,
        leadScore: r.leadScore || 0,
        status: r.status,
        portalUrl: r.portalToken ? `https://app.opusoverseas.com/portal?token=${r.portalToken}` : null,
        createdAt: r.createdAt,
      })),
      pagination: { limit, offset, count: rows.length },
    });
  } catch (err: any) {
    return c.json({ error: 'Failed to retrieve leads', details: err.message }, 500);
  }
});

// POST /api/v1/leads — Create new lead (with idempotency support)
v1LeadsRouter.post('/', apiKeyAuth(['leads:write']), idempotency(), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB unavailable' }, 500);
  const db = getDb(c.env.DB);
  const body = await c.req.json().catch(() => ({}));

  const name = (body.name || '').trim();
  const email = (body.email || '').trim().toLowerCase();
  const phone = (body.phone || '').trim();
  const division = body.division || 'study-abroad';
  const notes = body.notes || '';

  if (!name || (!email && !phone)) {
    return c.json(
      {
        error: 'Validation Error',
        message: 'Name and either email or phone are required.',
        code: 'VALIDATION_FAILED',
      },
      400,
    );
  }

  try {
    const cid = `OP-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
    const portalToken = newPortalToken();

    await db.insert(clients).values({
      id: cid,
      portalToken,
      name,
      email: email || `${phone.replace(/\D/g, '')}@lead.opusoverseas.com`,
      phone: phone || '0000000000',
      primaryDivision: division,
      leadSource: 'rest-api',
      notes,
      status: 'active',
      createdAt: now(),
      updatedAt: now(),
    });

    const eid = uid();
    await db.insert(engagements).values({
      id: eid,
      clientId: cid,
      division,
      title: `Consultation (${division})`,
      stageKey: 'lead',
      status: 'active',
      outstandingBalance: 0,
      createdAt: now(),
      updatedAt: now(),
    });

    // Outbound Webhook & Audit Event
    safeExecutionCtx(c)?.waitUntil(
      Promise.all([
        auditEvent(c, {
          action: 'API_LEAD_CREATED',
          entityName: 'clients',
          entityId: cid,
          result: 'success',
          category: 'lead',
          actorType: 'service',
          authMethod: 'service_token',
          afterState: { name, email, phone, division, source: 'rest-api' },
        }),
        dispatchWebhook(c.env, 'lead.created', {
          clientId: cid,
          name,
          email,
          phone,
          division,
          createdAt: now(),
        }),
      ]),
    );

    return c.json(
      {
        success: true,
        data: {
          id: cid,
          name,
          email,
          phone,
          division,
          portalUrl: `https://app.opusoverseas.com/portal?token=${portalToken}`,
          createdAt: now(),
        },
      },
      201,
    );
  } catch (err: any) {
    return c.json({ error: 'Failed to create lead', details: err.message }, 500);
  }
});
