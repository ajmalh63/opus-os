import { Hono } from 'hono';
import { getDb } from '../../db/client.js';
import { visaApplications } from '../../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { apiKeyAuth } from '../../middleware/apiKeyAuth.js';
import { idempotency } from '../../middleware/idempotency.js';
import { auditEvent } from '../../middleware/audit.js';
import { dispatchWebhook } from '../../infra/webhookDispatcher.js';

export const v1VisasRouter = new Hono<{ Bindings: { DB: D1Database } }>();

const now = () => Math.floor(Date.now() / 1000);

// GET /api/v1/visas/applications — List Visa Cases
v1VisasRouter.get('/applications', apiKeyAuth(['visa:read']), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB unavailable' }, 500);
  const db = getDb(c.env.DB);
  const clientId = c.req.query('clientId');

  try {
    let rows: any[] = [];
    if (clientId) {
      rows = await db
        .select()
        .from(visaApplications)
        .where(eq(visaApplications.clientId, clientId))
        .orderBy(desc(visaApplications.createdAt))
        .all();
    } else {
      rows = await db.select().from(visaApplications).orderBy(desc(visaApplications.createdAt)).limit(50).all();
    }

    return c.json({
      success: true,
      data: rows.map((r: any) => ({
        id: r.id,
        clientId: r.clientId,
        country: r.country,
        category: r.category,
        status: r.status,
        appointmentDate: r.appointmentDate,
        decisionDate: r.decisionDate,
        createdAt: r.createdAt,
      })),
      count: rows.length,
    });
  } catch (err: any) {
    return c.json({ error: 'Failed to retrieve visa applications', details: err.message }, 500);
  }
});

// PATCH /api/v1/visas/applications/:id/status — Update Visa Status
v1VisasRouter.patch('/applications/:id/status', apiKeyAuth(['visa:write']), idempotency(), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB unavailable' }, 500);
  const db = getDb(c.env.DB);
  const id = c.req.param('id') || '';
  const body = await c.req.json().catch(() => ({}));
  const status = body.status;

  if (!status) return c.json({ error: 'Validation Error', message: 'status is required.' }, 400);

  try {
    const app = await db.select().from(visaApplications).where(eq(visaApplications.id, id)).get();
    if (!app) return c.json({ error: 'Not Found', message: `Visa application '${id}' not found.` }, 404);

    await db.update(visaApplications).set({ status, updatedAt: now() }).where(eq(visaApplications.id, id)).execute();

    c.executionCtx?.waitUntil(
      Promise.all([
        auditEvent(c, {
          action: 'VISA_STATUS_CHANGED',
          entityName: 'visa_applications',
          entityId: id,
          result: 'success',
          category: 'workflow',
          actorType: 'service',
          authMethod: 'service_token',
          beforeState: { status: app.status },
          afterState: { status },
        }),
        dispatchWebhook(c.env, 'visa.status_changed', {
          applicationId: id,
          clientId: app.clientId,
          previousStatus: app.status,
          newStatus: status,
          updatedAt: now(),
        }),
      ]),
    );

    return c.json({
      success: true,
      data: { id, clientId: app.clientId, previousStatus: app.status, newStatus: status, updatedAt: now() },
    });
  } catch (err: any) {
    return c.json({ error: 'Failed to update visa application status', details: err.message }, 500);
  }
});
