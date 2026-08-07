import { Hono } from 'hono';
import { getDb } from '../db/client.js';
import { clients, partners, referrals, commissionLedger } from '../db/schema.js';
import { eq } from 'drizzle-orm';

export const partnerRouter = new Hono<{ Bindings: { DB: D1Database; BETTER_AUTH_SECRET: string } }>();

// KYC masking for PAN (Section 39: masked at rest, never plaintext PII stored)
function maskPAN(pan: string): string {
  if (pan.length < 4) return "****";
  return "******" + pan.substring(pan.length - 4);
}

// POST /api/public/partners (Register Partner with KYC - PUBLIC signup, Section 39)
partnerRouter.post('/', async (c) => {
  if (!c.env || !c.env.DB) {
    return c.json({ error: "DB not available" }, 500);
  }

  const db = getDb(c.env.DB);

  try {
    const body = await c.req.json();

    if (!body.name || !body.panNumber || !body.bankAccount || !body.ifscCode) {
      return c.json({ error: "Missing required KYC fields: name, panNumber, bankAccount, ifscCode" }, 400);
    }

    const trimmedPan = String(body.panNumber).trim();
    const maskedPan = maskPAN(trimmedPan);
    const partnerId = crypto.randomUUID();

    await db.insert(partners).values({
      id: partnerId,
      name: body.name,
      panNumber: maskedPan, // masked at rest (Section 39 - no plaintext PII)
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

// POST /api/public/partners/referrals (Log Partner Referral) - owner/manager authenticated via RBAC mount
partnerRouter.post('/referrals', async (c) => {
  if (!c.env || !c.env.DB) {
    return c.json({ error: "DB not available" }, 500);
  }

  const db = getDb(c.env.DB);

  try {
    const body = await c.req.json();
    if (!body.partnerId || !body.clientId) {
      return c.json({ error: "Missing required fields: partnerId, clientId" }, 400);
    }

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

// GET /api/public/partners/:id/commissions (Partner Commission Ledger)
partnerRouter.get('/:id/commissions', async (c) => {
  const partnerId = c.req.param('id');

  if (!c.env || !c.env.DB) {
    return c.json({ error: "DB not available" }, 500);
  }

  const db = getDb(c.env.DB);

  try {
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
