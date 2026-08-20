import { Hono } from 'hono';
import { getDb } from '../../db/client.js';
import { documents } from '../../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { apiKeyAuth } from '../../middleware/apiKeyAuth.js';
import { idempotency } from '../../middleware/idempotency.js';
import { auditEvent } from '../../middleware/audit.js';
import { dispatchWebhook } from '../../infra/webhookDispatcher.js';

export const v1DocumentsRouter = new Hono<{ Bindings: { DB: D1Database } }>();

const now = () => Math.floor(Date.now() / 1000);

// GET /api/v1/documents — List Vault Documents for a Client
v1DocumentsRouter.get('/', apiKeyAuth(['documents:read']), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB unavailable' }, 500);
  const db = getDb(c.env.DB);
  const clientId = c.req.query('clientId');

  if (!clientId) {
    return c.json({ error: 'Validation Error', message: 'clientId query parameter is required.' }, 400);
  }

  try {
    const rows = await db
      .select()
      .from(documents)
      .where(eq(documents.clientId, clientId))
      .orderBy(desc(documents.uploadedAt))
      .all();

    return c.json({
      success: true,
      data: rows.map((d: any) => ({
        id: d.id,
        clientId: d.clientId,
        fileName: d.fileName,
        status: d.status,
        docLabel: d.docLabel,
        mimeType: d.mimeType,
        sizeBytes: d.sizeBytes,
        uploadedAt: d.uploadedAt,
        verifiedAt: d.verifiedAt,
      })),
      count: rows.length,
    });
  } catch (err: any) {
    return c.json({ error: 'Failed to retrieve documents', details: err.message }, 500);
  }
});

// PATCH /api/v1/documents/:id/verify — Mark Document Verified / Rejected
v1DocumentsRouter.patch('/:id/verify', apiKeyAuth(['documents:write']), idempotency(), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB unavailable' }, 500);
  const db = getDb(c.env.DB);
  const id = c.req.param('id') || '';
  const body = await c.req.json().catch(() => ({}));
  const status = body.status; // 'verified' | 'rejected'

  if (!status || !['verified', 'rejected'].includes(status)) {
    return c.json({ error: 'Validation Error', message: 'status must be "verified" or "rejected".' }, 400);
  }

  try {
    const doc = await db.select().from(documents).where(eq(documents.id, id)).get();
    if (!doc) return c.json({ error: 'Not Found', message: `Document '${id}' not found.` }, 404);

    await db
      .update(documents)
      .set({ status, verifiedAt: status === 'verified' ? now() : null })
      .where(eq(documents.id, id))
      .execute();

    c.executionCtx?.waitUntil(
      Promise.all([
        auditEvent(c, {
          action: 'DOC_VERIFIED',
          entityName: 'documents',
          entityId: id,
          result: 'success',
          category: 'document',
          actorType: 'service',
          authMethod: 'service_token',
          beforeState: { status: doc.status },
          afterState: { status },
        }),
        dispatchWebhook(c.env, 'document.verified', {
          documentId: id,
          clientId: doc.clientId,
          fileName: doc.fileName,
          status,
          verifiedAt: now(),
        }),
      ]),
    );

    return c.json({
      success: true,
      data: { id, clientId: doc.clientId, fileName: doc.fileName, status, verifiedAt: now() },
    });
  } catch (err: any) {
    return c.json({ error: 'Failed to verify document', details: err.message }, 500);
  }
});
