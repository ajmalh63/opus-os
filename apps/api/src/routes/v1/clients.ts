import { Hono } from 'hono';
import { getDb } from '../../db/client.js';
import { clients, engagements, tasks, documents } from '../../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { apiKeyAuth } from '../../middleware/apiKeyAuth.js';
import { idempotency } from '../../middleware/idempotency.js';
import { auditEvent } from '../../middleware/audit.js';
import { dispatchWebhook } from '../../infra/webhookDispatcher.js';

export const v1ClientsRouter = new Hono<{ Bindings: { DB: D1Database } }>();

const now = () => Math.floor(Date.now() / 1000);

// GET /api/v1/clients/:id — Fetch Client 360 profile
v1ClientsRouter.get('/:id', apiKeyAuth(['clients:read']), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB unavailable' }, 500);
  const db = getDb(c.env.DB);
  const id = c.req.param('id') || '';

  try {
    const client = await db.select().from(clients).where(eq(clients.id, id)).get();
    if (!client) {
      return c.json({ error: 'Not Found', message: `Client '${id}' not found.` }, 404);
    }

    const clientEngagements = await db
      .select()
      .from(engagements)
      .where(eq(engagements.clientId, id))
      .orderBy(desc(engagements.createdAt))
      .all();

    const clientTasks = await db.select().from(tasks).where(eq(tasks.clientId, id)).all();
    const clientDocs = await db.select().from(documents).where(eq(documents.clientId, id)).all();

    return c.json({
      success: true,
      data: {
        id: client.id,
        name: client.name,
        email: client.email,
        phone: client.phone,
        primaryDivision: client.primaryDivision,
        status: client.status,
        portalUrl: client.portalToken ? `https://app.opusoverseas.com/portal?token=${client.portalToken}` : null,
        engagements: clientEngagements.map((e: any) => ({
          id: e.id,
          division: e.division,
          title: e.title,
          stageKey: e.stageKey,
          status: e.status,
        })),
        tasksCount: clientTasks.length,
        documentsCount: clientDocs.length,
        createdAt: client.createdAt,
        updatedAt: client.updatedAt,
      },
    });
  } catch (err: any) {
    return c.json({ error: 'Failed to fetch client', details: err.message }, 500);
  }
});

// PATCH /api/v1/clients/:id/stage — Advance client pipeline stage
v1ClientsRouter.patch('/:id/stage', apiKeyAuth(['clients:write']), idempotency(), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB unavailable' }, 500);
  const db = getDb(c.env.DB);
  const id = c.req.param('id') || '';
  const body = await c.req.json().catch(() => ({}));

  const stageKey = (body.stageKey || '').trim();
  const notes = body.notes || '';

  if (!stageKey) {
    return c.json({ error: 'Validation Error', message: 'stageKey is required.' }, 400);
  }

  try {
    const client = await db.select().from(clients).where(eq(clients.id, id)).get();
    if (!client) return c.json({ error: 'Not Found', message: `Client '${id}' not found.` }, 404);

    const activeEng = await db
      .select()
      .from(engagements)
      .where(eq(engagements.clientId, id))
      .orderBy(desc(engagements.createdAt))
      .get();

    const previousStage = activeEng?.stageKey || 'lead';

    if (activeEng) {
      await db
        .update(engagements)
        .set({ stageKey, updatedAt: now() })
        .where(eq(engagements.id, activeEng.id))
        .execute();
    }

    await db.update(clients).set({ updatedAt: now() }).where(eq(clients.id, id)).execute();

    c.executionCtx?.waitUntil(
      Promise.all([
        auditEvent(c, {
          action: 'STAGE_CHANGED',
          entityName: 'engagements',
          entityId: activeEng?.id || id,
          result: 'success',
          category: 'workflow',
          actorType: 'service',
          authMethod: 'service_token',
          beforeState: { stageKey: previousStage },
          afterState: { stageKey, notes },
        }),
        dispatchWebhook(c.env, 'client.stage_changed', {
          clientId: id,
          previousStage,
          newStage: stageKey,
          notes,
          timestamp: now(),
        }),
      ]),
    );

    return c.json({
      success: true,
      data: {
        clientId: id,
        previousStage,
        newStage: stageKey,
        updatedAt: now(),
      },
    });
  } catch (err: any) {
    return c.json({ error: 'Failed to update stage', details: err.message }, 500);
  }
});
