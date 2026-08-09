import { Hono } from 'hono';
import { getDb } from '../db/client.js';
import { clients, partners, referrals, commissionLedger } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { rateLimit } from '../middleware/rateLimit.js';

export const partnerRouter = new Hono<{ Bindings: { DB: D1Database; BETTER_AUTH_SECRET: string } }>();

// Public partner signup spam protection (Section 18.2.2): 8 registrations / hour / IP.
partnerRouter.use('/', rateLimit({ bucket: 'partner-signup', windowSeconds: 3600, limit: 8 }));

// KYC masking for PAN (Section 39: masked at rest, never plaintext PII stored)
function maskPAN(pan: string): string {
  if (pan.length < 4) return "****";
  return "******" + pan.substring(pan.length - 4);
}

// Partner-scoped auth (A-3): bearer token from the 'Authorization' header must
// match the partner's stored apiToken. Returns the matched partner or null.
async function authPartner(db: ReturnType<typeof getDb>, id: string, c: { req: { header: (name: string) => string | undefined } }): Promise<any | null> {
  const auth = c.req.header('Authorization') || '';
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : '';
  if (!bearer) return null;
  const partner = await db.select().from(partners).where(eq(partners.id, id)).get();
  if (!partner || partner.status !== 'active') return null;
  return partner.apiToken && bearer === partner.apiToken ? partner : null;
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
    // Partner-scoped bearer token (A-3): returned at signup, required on referrals/commissions
    const apiToken = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');

    await db.insert(partners).values({
      id: partnerId,
      name: body.name,
      panNumber: maskedPan, // masked at rest (Section 39 - no plaintext PII)
      bankAccount: body.bankAccount,
      ifscCode: body.ifscCode,
      status: 'active',
      referralCode: body.referralCode || null,
      apiToken,
      createdAt: Math.floor(Date.now() / 1000)
    });

    return c.json({
      success: true,
      partnerId,
      apiToken,
      maskedPan,
      message: "Partner registered successfully with KYC validation."
    });

  } catch (error: any) {
    return c.json({ error: "Partner registration failed", details: error.message }, 500);
  }
});

// POST /api/public/partners/referrals (Log Partner Referral) - partner-token required
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

    // A-3: only the authenticated partner may log their own referral
    const authed = await authPartner(db, body.partnerId, c);
    if (!authed) return c.json({ error: "Unauthorized: valid partner token required" }, 401);

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

// GET /api/public/partners/:id/commissions (Partner Commission Ledger) - partner-token bound
partnerRouter.get('/:id/commissions', async (c) => {
  const partnerId = c.req.param('id');

  if (!c.env || !c.env.DB) {
    return c.json({ error: "DB not available" }, 500);
  }

  const db = getDb(c.env.DB);

  try {
    // A-3: only the authenticated partner may read their own commissions
    const authed = await authPartner(db, partnerId, c);
    if (!authed) return c.json({ error: "Unauthorized: valid partner token required" }, 401);

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

// GET /api/public/partners/:id/summary â€” the ONE dashboard payload the partner
// portal needs (gold standard: single round-trip, self-evident numbers).
// Returns profile (name/referralCode/status), rupee rollups per state, and
// per-referral entries with compute-at-a-glance statuses. Token-bounded.
partnerRouter.get('/:id/summary', async (c) => {
  const partnerId = c.req.param('id');
  if (!c.env || !c.env.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);

  try {
    const authed = await authPartner(db, partnerId, c);
    if (!authed) return c.json({ error: "Unauthorized: valid partner token required" }, 401);

    const partner = await db.select().from(partners).where(eq(partners.id, partnerId)).get();
    if (!partner) return c.json({ error: "Partner not found" }, 404);

    const partnerReferrals = await db.select().from(referrals).where(eq(referrals.partnerId, partnerId)).all();
    const referralIds = partnerReferrals.map(r => r.id);
    const ledger = await db.select().from(commissionLedger).all();
    const entries = ledger.filter(e => referralIds.includes(e.referralId));

    let matured = 0, pending = 0, paid = 0;
    const referralRows = partnerReferrals.map(r => {
      const entry = entries.find(e => e.referralId === r.id);
      const amount = entry?.amount ?? 0;
      const status = entry?.status ?? 'unmatured';
      if (status === 'matured') matured += amount;
      else if (status === 'paid') paid += amount;
      else pending += amount;
      return {
        referralId: r.id,
        referredClientId: r.clientId,
        ratePct: r.commissionRate ?? 5,
        amountPaise: amount,
        status,
      };
    });

    return c.json({
      partner: {
        name: partner.name,
        referralCode: partner.referralCode ? `?ref=${partner.referralCode}` : null,
        status: partner.status,
        joinedAt: partner.createdAt,
      },
      totals: { matured, pending, paid, total: matured + pending + paid },
      referrals: referralRows,
    });
  } catch (error: any) {
    return c.json({ error: "Partner summary failed", details: error.message }, 500);
  }
});
