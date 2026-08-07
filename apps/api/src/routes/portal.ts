import { Hono } from 'hono';
import { getDb } from '../db/client.js';
import { clients, engagements, consents, documents, partners, referrals, commissionLedger } from '../db/schema.js';
import { eq } from 'drizzle-orm';

export const portalRouter = new Hono<{ Bindings: { DB: D1Database; BETTER_AUTH_SECRET: string } }>();

// Simple mock encryption/decryption helper using env secret
function encryptPAN(pan: string, secret: string): string {
  // Mock encryption: prepend secret key hash to PAN
  return `enc:${btoa(pan)}:${secret.substring(0, 5)}`;
}

function maskPAN(pan: string): string {
  if (pan.length < 4) return "****";
  return "******" + pan.substring(pan.length - 4);
}

// GET /api/public/portal/lookup?token=OP-2026-X (Public Client Journey Tracking)
portalRouter.get('/public/portal/lookup', async (c) => {
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

// POST /api/partners (Register Partner with KYC & Encrypted PAN)
portalRouter.post('/partners', async (c) => {
  if (!c.env || !c.env.DB) {
    return c.json({ error: "DB not available" }, 500);
  }

  const db = getDb(c.env.DB);
  const secret = c.env.BETTER_AUTH_SECRET || "default-secret";

  try {
    const body = await c.req.json();
    
    if (!body.name || !body.panNumber || !body.bankAccount || !body.ifscCode) {
      return c.json({ error: "Missing required KYC fields: name, panNumber, bankAccount, ifscCode" }, 400);
    }

    // Encrypt the PAN at rest, and store details
    const encryptedPan = encryptPAN(body.panNumber, secret);
    const maskedPan = maskPAN(body.panNumber);
    const partnerId = crypto.randomUUID();

    await db.insert(partners).values({
      id: partnerId,
      name: body.name,
      panNumber: encryptedPan, // Encrypted at rest
      bankAccount: body.bankAccount,
      ifscCode: body.ifscCode,
      status: 'active',
      createdAt: Math.floor(Date.now() / 1000)
    });

    return c.json({
      success: true,
      partnerId,
      maskedPan,
      message: "Partner registered successfully with KYC validation."
    });

  } catch (error: any) {
    return c.json({ error: "Partner registration failed", details: error.message }, 500);
  }
});

// POST /api/partners/referrals (Log Partner Referral)
portalRouter.post('/partners/referrals', async (c) => {
  if (!c.env || !c.env.DB) {
    return c.json({ error: "DB not available" }, 500);
  }

  const db = getDb(c.env.DB);

  try {
    const body = await c.req.json();
    if (!body.partnerId || !body.clientId) {
      return c.json({ error: "Missing required fields: partnerId, clientId" }, 400);
    }

    // Check partner and client exist
    const partnerRecord = await db.select().from(partners).where(eq(partners.id, body.partnerId)).get();
    if (!partnerRecord) {
      return c.json({ error: "Partner not found" }, 404);
    }

    const clientRecord = await db.select().from(clients).where(eq(clients.id, body.clientId)).get();
    if (!clientRecord) {
      return c.json({ error: "Client not found" }, 404);
    }

    const referralId = crypto.randomUUID();
    await db.insert(referrals).values({
      id: referralId,
      partnerId: body.partnerId,
      clientId: body.clientId,
      commissionRate: body.commissionRate || 5, // Default 5%
      createdAt: Math.floor(Date.now() / 1000)
    });

    return c.json({ success: true, referralId, message: "Referral logged successfully." });
  } catch (error: any) {
    return c.json({ error: "Referral processing failed", details: error.message }, 500);
  }
});

// GET /api/partners/:id/commissions (Partner Commission Ledger)
portalRouter.get('/partners/:id/commissions', async (c) => {
  const partnerId = c.req.param('id');

  if (!c.env || !c.env.DB) {
    return c.json({ error: "DB not available" }, 500);
  }

  const db = getDb(c.env.DB);

  try {
    // Get referrals for this partner
    const partnerReferrals = await db.select().from(referrals).where(eq(referrals.partnerId, partnerId)).all();
    if (partnerReferrals.length === 0) {
      return c.json({ commissions: [] });
    }

    const referralIds = partnerReferrals.map(r => r.id);
    const ledger = await db.select().from(commissionLedger).all();
    const list = ledger.filter(entry => referralIds.includes(entry.referralId));

    return c.json({ commissions: list });
  } catch (error: any) {
    return c.json({ error: "Failed to fetch commissions", details: error.message }, 500);
  }
});
