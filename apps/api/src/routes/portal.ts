import { Hono } from 'hono';
import { getDb } from '../db/client.js';
import { clients, engagements, consents, documents } from '../db/schema.js';
import { eq } from 'drizzle-orm';

export const portalRouter = new Hono<{ Bindings: { DB: D1Database; BETTER_AUTH_SECRET: string } }>();

// GET /api/public/portal/lookup?token=OP-2026-X (Public Client Journey Tracking, Section 25)
portalRouter.get('/lookup', async (c) => {
  const token = c.req.query('token');

  if (!token) {
    return c.json({ error: "Token query parameter is required." }, 400);
  }

  if (!c.env || !c.env.DB) {
    return c.json({ error: "DB not available" }, 500);
  }

  const db = getDb(c.env.DB);

  try {
    const client = await db.select().from(clients).where(eq(clients.id, token)).get();
    if (!client) {
      return c.json({ error: "Client not found matching token." }, 404);
    }

    // Fetch progress entities
    const activeEngagements = await db.select().from(engagements).where(eq(engagements.clientId, token)).all();
    const clientConsents = await db.select().from(consents).where(eq(consents.clientId, token)).all();
    const clientDocs = await db.select().from(documents).where(eq(documents.clientId, token)).all();

    return c.json({
      success: true,
      client: {
        id: client.id,
        name: client.name,
        email: client.email,
        createdAt: client.createdAt
      },
      engagements: activeEngagements,
      consents: clientConsents.map(cons => ({
        consentType: cons.consentType,
        status: cons.status,
        grantedAt: cons.grantedAt
      })),
      documents: clientDocs.map(doc => ({
        id: doc.id,
        fileName: doc.fileName,
        version: doc.version,
        status: doc.status,
        uploadedAt: doc.uploadedAt
      }))
    });

  } catch (error: any) {
    return c.json({ error: "Portal lookup transaction failed", details: error.message }, 500);
  }
});

