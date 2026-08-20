import { Hono } from 'hono';
import { getDb } from '../db/client.js';
import { clients, partners, referrals, commissionLedger } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { rateLimit } from '../middleware/rateLimit.js';
import { getAuth } from '../auth.js';
import { auditEvent } from '../middleware/audit.js';

export const partnerRouter = new Hono<{ Bindings: { DB: D1Database; BETTER_AUTH_SECRET: string } }>();

// Public partner signup spam protection (Section 18.2.2): 8 registrations / hour / IP.
partnerRouter.use('/', rateLimit({ bucket: 'partner-signup', windowSeconds: 3600, limit: 8 }));

// KYC masking for PAN (Section 39: masked at rest, never plaintext PII stored)
function maskPAN(pan: string): string {
  if (pan.length < 4) return "****";
  return "******" + pan.substring(pan.length - 4);
}

// Partner-scoped auth (A-3). Accepts either:
//   1. the legacy bearer apiToken from the 'Authorization' header, OR
//   2. a Better Auth session whose email matches the partner's account email.
// Returns the matched partner or null.
async function authPartner(db: ReturnType<typeof getDb>, id: string, c: { env: { DB: D1Database; BETTER_AUTH_SECRET: string }; req: { header: (name: string) => string | undefined; raw: Request } }): Promise<any | null> {
  const partner = await db.select().from(partners).where(eq(partners.id, id)).get();
  if (!partner || partner.status !== 'active') return null;

  const authHeader = c.req.header('Authorization') || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (bearer && partner.apiToken && bearer === partner.apiToken) return partner;

  if (partner.email) {
    const auth = getAuth(c.env);
    const session = await auth.api.getSession({ headers: c.req.raw.headers }).catch(() => null);
    if (session?.user?.email && session.user.email.toLowerCase() === partner.email.toLowerCase()) return partner;
  }
  return null;
}

// Shared dashboard payload (Section 39: one round-trip, self-evident numbers).
async function buildPartnerSummary(db: ReturnType<typeof getDb>, partnerId: string) {
  const partner = await db.select().from(partners).where(eq(partners.id, partnerId)).get();
  if (!partner) return null;

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

  return {
    partner: {
      id: partner.id,
      name: partner.name,
      referralCode: partner.referralCode ? `?ref=${partner.referralCode}` : null,
      status: partner.status,
      joinedAt: partner.createdAt,
    },
    totals: { matured, pending, paid, total: matured + pending + paid },
    referrals: referralRows,
  };
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

    const trimmedPan = String(body.panNumber).trim().toUpperCase();
    const ifsc = String(body.ifscCode).trim().toUpperCase();
    const pan = String(body.panNumber).trim().toUpperCase();
    // Gold-standard format enforcement (prevents garbage PAN / IFSC at the source)
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(pan)) {
      return c.json({ error: "PAN must match format ABCDE1234F (5 letters, 4 digits, 1 letter)" }, 400);
    }
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(ifsc)) {
      return c.json({ error: "IFSC must match format HDFC0000001 (4 letters, 0, 6 chars)" }, 400);
    }

    // Optional portal account (Section 25.x). When email + password are given we
    // create a Better Auth user (session-based login, mirroring the client portal)
    // and link the partner row to it via partners.email. Legacy KYC-only signups
    // stay token-based.
    let accountEmail: string | null = null;
    let accountCreated = false;
    if (body.email) {
      accountEmail = String(body.email).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(accountEmail)) {
        return c.json({ error: "Enter a valid email address." }, 400);
      }
      if (!body.password || String(body.password).length < 8) {
        return c.json({ error: "Password is required (min 8 characters) when registering with an email." }, 400);
      }
      const existing = await db.select().from(partners).where(eq(partners.email, accountEmail)).get();
      if (existing) {
        return c.json({ error: "A partner account with this email already exists. Sign in instead." }, 409);
      }
      try {
        const auth = getAuth(c.env);
        await auth.api.signUpEmail({
          body: { name: body.name, email: accountEmail, password: String(body.password), role: 'partner', userDivisions: '[]' },
        });
        accountCreated = true;
      } catch (signupErr: any) {
        const msg = String(signupErr?.message || '');
        if (/already exists|taken/i.test(msg)) {
          return c.json({ error: "An account with this email already exists. Sign in instead." }, 409);
        }
        return c.json({ error: "Account creation failed", details: msg || (signupErr?.body || signupErr?.status || 'unknown') }, 500);
      }
    }

    const maskedPan = maskPAN(pan);
    const partnerId = crypto.randomUUID();
    // Partner-scoped bearer token (A-3): returned at signup, required on referrals/commissions
    const apiToken = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');

    // Bank details encrypted at rest (WebCrypto, key = PARTNER_BANK_KEY from secrets;
    // key missing → keep a tagged ciphertext placeholder so we never store plaintext).
    const bankKey = (c.env as any)?.PARTNER_BANK_KEY as string | undefined;
    let bankAccountCipher = `unkeyed:${String(body.bankAccount).slice(-4)}`;
    if (bankKey && bankKey.length >= 32) {
      try {
        const raw = new TextEncoder().encode(bankKey.slice(0, 32));
        const key = await crypto.subtle.importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt']);
        const iv = crypto.getRandomValues(new Uint8Array(12));
        const data = new TextEncoder().encode(String(body.bankAccount));
        const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, data);
        const joined = new Uint8Array(iv.length + ct.byteLength);
        joined.set(iv, 0); joined.set(new Uint8Array(ct), iv.length);
        bankAccountCipher = `aes:${btoa(String.fromCharCode(...joined))}`;
      } catch (encErr: any) {
        console.error('bank encryption failed', encErr?.message);
        bankAccountCipher = `unkeyed:${String(body.bankAccount).slice(-4)}`;
      }
    }

    await db.insert(partners).values({
      id: partnerId,
      name: body.name,
      email: accountEmail,
      panNumber: maskedPan, // masked at rest (Section 39 - no plaintext PII)
      bankAccount: bankAccountCipher, // either AES-GCM ciphertext or a last-4 tag
      ifscCode: ifsc, // IFSC is not secret but validated; keep canonical form
      status: 'active',
      referralCode: body.referralCode || `OPUS-${body.name.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6)}-${Math.floor(1000 + Math.random() * 9000)}`,
      apiToken,
      createdAt: Math.floor(Date.now() / 1000)
    });

    await auditEvent(c, { action: 'PARTNER_REGISTERED', entityName: 'partners', entityId: partnerId, afterState: { name: body.name, email: accountEmail, maskedPan, accountCreated } });

    return c.json({
      success: true,
      partnerId,
      apiToken,
      accountCreated,
      email: accountEmail,
      maskedPan,
      message: accountCreated
        ? "Partner registered successfully. Check your inbox (dev: API log) for the email verification link, then sign in."
        : "Partner registered successfully with KYC validation."
    });

  } catch (error: any) {
    return c.json({ error: "Partner registration failed",  }, 500);
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
      // SECURITY: commission rate is a server-side business constant — never
      // accept it from the request body (a partner could set 99% and siphon
      // nearly all realized revenue on agreement sign).
      commissionRate: 5, // Default 5%
      createdAt: Math.floor(Date.now() / 1000)
    });

    await auditEvent(c, { action: 'REFERRAL_LOGGED', entityName: 'referrals', entityId: referralId, actorType: 'partner', authMethod: 'partner_token', afterState: { partnerId: body.partnerId, clientId: body.clientId, commissionRate: body.commissionRate || 5 } });

    return c.json({ success: true, referralId, message: "Referral logged successfully." });
  } catch (error: any) {
    return c.json({ error: "Referral processing failed",  }, 500);
  }
});

// GET /api/public/partners/session — Authenticated partner session (mirrors the
// client portal's /api/public/portal/session). Resolves the Better Auth session
// to the partner record by email and returns the full dashboard payload.
partnerRouter.get('/session', async (c) => {
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
    const partner = await db.select().from(partners).where(eq(partners.email, user.email)).get();

    if (!partner) {
      return c.json({ success: true, authenticated: false, email: user.email });
    }

    if (partner.status === 'blocked') {
      return c.json({ error: "Access Denied: Your partner account has been blocked by system administrator." }, 403);
    }

    const summary = await buildPartnerSummary(db, partner.id);
    return c.json({ success: true, authenticated: true, email: user.email, ...summary });
  } catch (error: any) {
    return c.json({ error: "Partner session failed",  }, 500);
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
    return c.json({ error: "Failed to fetch commissions",  }, 500);
  }
});

// GET /api/public/partners/:id/summary — the ONE dashboard payload the partner
// portal needs (gold standard: single round-trip, self-evident numbers).
// Returns profile (name/referralCode/status), rupee rollups per state, and
// per-referral entries with compute-at-a-glance statuses. Session- or token-bound.
partnerRouter.get('/:id/summary', async (c) => {
  const partnerId = c.req.param('id');
  if (!c.env || !c.env.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);

  try {
    const authed = await authPartner(db, partnerId, c);
    if (!authed) return c.json({ error: "Unauthorized: valid partner token or account session required" }, 401);

    const summary = await buildPartnerSummary(db, partnerId);
    if (!summary) return c.json({ error: "Partner not found" }, 404);

    return c.json(summary);
  } catch (error: any) {
    return c.json({ error: "Partner summary failed",  }, 500);
  }
});
