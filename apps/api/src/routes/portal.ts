import { Hono } from 'hono';
import { getDb } from '../db/client.js';
import { getAuth } from '../auth.js';
import { clients, engagements, consents, documents, payments } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

export const portalRouter = new Hono<{ Bindings: { DB: D1Database; BETTER_AUTH_SECRET: string; BETTER_AUTH_URL?: string } }>();

function buildJourney(client: any, engs: any[], cons: any[], docs: any[], pays: any[]) {
  return {
    success: true,
    client: {
      id: client.id,
      name: client.name,
      email: client.email,
      createdAt: client.createdAt
    },
    engagements: engs,
    consents: cons.map((x: any) => ({ consentType: x.consentType, status: x.status, grantedAt: x.grantedAt })),
    documents: docs.map((x: any) => ({
      id: x.id, fileName: x.fileName, version: x.version, status: x.status, uploadedAt: x.uploadedAt
    })),
    payments: pays.map((x: any) => ({
      id: x.id, amount: x.amount, type: x.type, milestoneName: x.milestoneName,
      method: x.method, referenceNumber: x.referenceNumber, createdAt: x.createdAt
    }))
  };
}

// GET /api/public/portal/lookup?token=OP-2026-X (Public token-based journey lookup, Section 25)
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

    const activeEngagements = await db.select().from(engagements).where(eq(engagements.clientId, token)).all();
    const clientConsents = await db.select().from(consents).where(eq(consents.clientId, token)).all();
    const clientDocs = await db.select().from(documents).where(eq(documents.clientId, token)).all();
    const clientPayments = await db.select().from(payments).where(eq(payments.clientId, token)).all();

    return c.json(buildJourney(client, activeEngagements, clientConsents, clientDocs, clientPayments));
  } catch (error: any) {
    return c.json({ error: "Portal lookup transaction failed", details: error.message }, 500);
  }
});

// GET /api/public/portal/session (Authenticated My Journey - Section 25.4)
// Resolves the logged-in user (Better Auth session) to their client record(s) by email.
portalRouter.get('/session', async (c) => {
  if (!c.env || !c.env.DB) {
    return c.json({ error: "DB not available" }, 500);
  }

  const db = getDb(c.env.DB);
  const auth = getAuth(c.env);
  const sessionResult = await auth.api.getSession({ headers: c.req.raw.headers });

  if (!sessionResult?.user) {
    return c.json({ error: "Not authenticated. Please sign in." }, 401);
  }

  try {
    const user = sessionResult.user;
    const clientList = await db.select().from(clients).where(eq(clients.email, user.email)).all();

    if (clientList.length === 0) {
      return c.json({
        success: true,
        authenticated: true,
        email: user.email,
        journeys: []
      });
    }

    const journeys = [];
    for (const client of clientList) {
      const engs = await db.select().from(engagements).where(eq(engagements.clientId, client.id)).all();
      const cons = await db.select().from(consents).where(eq(consents.clientId, client.id)).all();
      const docs = await db.select().from(documents).where(eq(documents.clientId, client.id)).all();
      const pays = await db.select().from(payments).where(eq(payments.clientId, client.id)).all();
      journeys.push(buildJourney(client, engs, cons, docs, pays));
    }

    return c.json({ success: true, authenticated: true, email: user.email, journeys });
  } catch (error: any) {
    return c.json({ error: "Portal session transaction failed", details: error.message }, 500);
  }
});

// POST /api/public/portal/claim (Link a journey token to the authenticated account, Section 25.7)
// Body: { token, phone } - verifies phone matches the client record, then links email.
portalRouter.post('/claim', async (c) => {
  if (!c.env || !c.env.DB) {
    return c.json({ error: "DB not available" }, 500);
  }

  const db = getDb(c.env.DB);
  const auth = getAuth(c.env);
  const sessionResult = await auth.api.getSession({ headers: c.req.raw.headers });

  if (!sessionResult?.user) {
    return c.json({ error: "Not authenticated. Please sign in." }, 401);
  }

  try {
    const body = await c.req.json();
    const token = String(body.token || '').trim();
    const phone = String(body.phone || '').trim();

    if (!token || !phone) {
      return c.json({ error: "Missing required fields: token, phone" }, 400);
    }

    const client = await db.select().from(clients).where(eq(clients.id, token)).get();
    if (!client) {
      return c.json({ error: "Client not found matching token." }, 404);
    }

    // Verify phone matches the client record (ownership proof)
    const normalizedTokenPhone = phone.replace(/\s+/g, '');
    const normalizedClientPhone = (client.phone || '').replace(/\s+/g, '');
    if (normalizedTokenPhone !== normalizedClientPhone) {
      return c.json({ error: "Phone number does not match the journey token." }, 403);
    }

    // Link: attach the logged-in email to the client record (one-time ownership bind)
    await db
      .update(clients)
      .set({ email: sessionResult.user.email, updatedAt: Math.floor(Date.now() / 1000) })
      .where(and(eq(clients.id, token), eq(clients.id, client.id)));

    const engs = await db.select().from(engagements).where(eq(engagements.clientId, token)).all();
    const cons = await db.select().from(consents).where(eq(consents.clientId, token)).all();
    const docs = await db.select().from(documents).where(eq(documents.clientId, token)).all();
    const pays = await db.select().from(payments).where(eq(payments.clientId, token)).all();

    return c.json({
      success: true,
      message: "Journey linked to your account.",
      journey: buildJourney(client, engs, cons, docs, pays)
    });
  } catch (error: any) {
    return c.json({ error: "Portal claim transaction failed", details: error.message }, 500);
  }
});
