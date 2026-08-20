import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { getDb } from '../db/client.js';
import { partners, partnerLinks, partnerTiers, partnerPoints, referrals, commissionLedger, universities, groupDepartures, jobPostings, attestationChains, payoutRequests, visaProducts, umrahPackages, partnerCreatives, clients, engagements, payments } from '../db/schema.js';
import { eq, inArray } from 'drizzle-orm';
import { accruePartnerPoints } from '../services/partnerLoyalty.js';
import { getAuth } from '../auth.js';
import { auditEvent, auditBounded } from '../middleware/audit.js';
import { sendNotification } from '../infra/notify.js';
import { getDivisionsEnabled } from '../lib/divisions.js';

// Mock-D1-safe field reader: real D1 (drizzle) returns camelCase keys, the
// test MockD1 keeps snake_case — read whichever is present.
function pick(r: any, camel: string, snake: string): any {
  if (r === null || r === undefined) return undefined;
  const v = r[camel] !== undefined ? r[camel] : r[snake];
  return v !== undefined ? v : null;
}

// Zoho Thrive-style partner workspace (plan §39 extension):
//  - unified public catalog (inventory) for partner sharing
//  - per-item affiliate links with click tracking (/go/:ref/:type/:id)
//  - VIP tiers qualified on loyalty points (= lifetime commissions)
//  - points ledger with idempotent accrual

export const thriveRouter = new Hono<{ Bindings: { DB: D1Database; BETTER_AUTH_SECRET: string } }>();
export const publicThriveRouter = new Hono<{ Bindings: { DB: D1Database; BETTER_AUTH_SECRET: string } }>();

const AUTH_HEADER = 'Authorization';
function bearer(c: any): string {
  const h = c.req.header(AUTH_HEADER) || '';
  return h.startsWith('Bearer ') ? h.slice(7).trim() : '';
}

// Session- OR token-bound (mirrors authPartner in routes/partner.ts): a Better
// Auth session whose email matches the partner's account email authenticates
// exactly like the legacy bearer apiToken.
async function authedPartner(db: ReturnType<typeof getDb>, id: string, c: { env: { DB: D1Database; BETTER_AUTH_SECRET: string }; req: { header: (name: string) => string | undefined; raw: Request } }): Promise<any | null> {
  const p = await db.select().from(partners).where(eq(partners.id, id)).get();
  if (!p || p.status !== 'active') return null;

  const token = bearer(c);
  if (token && p.apiToken && token === p.apiToken) return p;

  if (p.email) {
    const auth = getAuth(c.env);
    const session = await auth.api.getSession({ headers: c.req.raw.headers }).catch(() => null);
    if (session?.user?.email && session.user.email.toLowerCase() === p.email.toLowerCase()) return p;
  }
  return null;
}

// ---------- PUBLIC CATALOG (the "inventory" partners share) ----------
publicThriveRouter.get('/catalog', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const type = c.req.query('type'); // optional filter
  // Division availability (docs/division-availability.md): inventory of a
  // disabled division is hidden from the shared catalog — partners can only
  // share offers the business can currently serve. University stays (the
  // study-abroad page remains live even while other divisions are off).
  const divisions = await getDivisionsEnabled(c.env);
  try {
    const items: any[] = [];

    if (!type || type === 'university') {
      const rows = await db.select().from(universities).all();
      items.push(...rows.map((r: any) => ({ type: 'university', id: r.id, title: r.name || r.universityName || 'University', pricePaise: 0, meta: { country: r.country || '' } })));
    }
if ((!type || type === 'departure') && divisions.umrah) {
      const rows = await db.select().from(groupDepartures).all();
      const pkgIds = [...new Set(rows.map((r: any) => r.packageId).filter(Boolean))];
      const pkgs = pkgIds.length ? await db.select().from(umrahPackages).where(inArray(umrahPackages.id, pkgIds)).all() : [];
      items.push(...rows.map((r: any) => {
        const pkg = pkgs.find((p: any) => p.id === r.packageId);
        return {
          type: 'departure',
          id: r.id,
          title: `${pkg?.name || 'Umrah departure'} — ${new Date(r.departureDate * 1000).toLocaleDateString()}`,
          pricePaise: Number(r.price || 0),
          meta: {
            date: r.departureDate,
            tier: r.packageTier,
            departureCity: r.departureCity || pkg?.departureCity || null,
            capacity: r.capacity,
            bookedSeats: r.bookedSeats,
            available: Math.max(0, r.capacity - r.bookedSeats),
            status: r.status,
            advanceFeePaise: r.bookingFee,
          },
        };
      }));
    }
    if ((!type || type === 'umrah_package') && divisions.umrah) {
      const rows = await db.select().from(umrahPackages).where(eq(umrahPackages.status, 'open')).all();
      items.push(...rows.map((r: any) => ({
        type: 'umrah_package',
        id: r.id,
        title: r.name,
        pricePaise: Number(r.retailPricePaise || 0),
        meta: {
          tier: r.tier,
          totalDays: r.totalDays,
          flightType: r.flightType,
          departureCity: r.departureCity,
          makkahDistanceMeters: r.makkahDistanceMeters,
          madinahDistanceMeters: r.madinahDistanceMeters,
          roomSharing: r.roomSharing,
          mealsPlan: r.mealsPlan,
          advanceFeePaise: r.advanceFeePaise,
          featured: r.featured,
        },
      })));
    }
    if ((!type || type === 'job') && divisions.manpower) {
      const rows = await db.select().from(jobPostings).all();
      items.push(...rows.map((r: any) => ({ type: 'job', id: r.id, title: r.title || 'Job posting', pricePaise: 0, meta: { country: r.country || '' } })));
    }
    if ((!type || type === 'visa') && divisions.visa) {
      const rows = await db.select().from(visaProducts).where(eq(visaProducts.status, 'active')).all();
      items.push(...rows.map((r: any) => ({ type: 'visa', id: r.id, title: `${r.visaType} — ${r.country}`, pricePaise: Number(r.feePaise || 0), meta: { country: r.country, entryType: r.entryType, processingTime: r.processingTime } })));
    }

    return c.json({ items });
  } catch (e: any) {
    return c.json({ error: 'Catalog failed', details: e.message }, 500);
  }
});

// ---------- PARTNER LINK CRUD (token-bound) ----------
const linkSchema = z.object({ catalogType: z.enum(['university', 'departure', 'job', 'visa', 'umrah_package']), catalogItemId: z.string().min(1), title: z.string().min(1), pricePaise: z.number().int().min(0).default(0) });

// POST /api/public/partners/:id/links — create a share link for an inventory item
publicThriveRouter.post('/:id/links', zValidator('json', linkSchema), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const partnerId = c.req.param('id');
  const data = c.req.valid('json');
  try {
    const authed = await authedPartner(db, partnerId, c);
    if (!authed) return c.json({ error: 'Unauthorized' }, 401);

    const existing = await db.select().from(partnerLinks).all();
    const dup = existing.find((l: any) => l.partnerId === partnerId && l.catalogType === data.catalogType && l.catalogItemId === data.catalogItemId);
    if (dup) return c.json({ success: true, id: dup.id, link: `/go/${authed.referralCode}/${data.catalogType}/${data.catalogItemId}`, message: 'Link already exists.' });

    const id = crypto.randomUUID();
    await db.insert(partnerLinks).values({
      id, partnerId, catalogType: data.catalogType, catalogItemId: data.catalogItemId,
      title: data.title, pricePaise: data.pricePaise, clicks: 0, createdAt: Math.floor(Date.now() / 1000), lastClickedAt: null,
    });
    // Thrive: share activity reward (capped by idempotency key = link id)
    await accruePartnerPoints({ env: c.env as any, partnerId, reason: 'share', referenceKey: id }).catch(() => {});
    return c.json({ success: true, id, link: `/go/${authed.referralCode}/${data.catalogType}/${data.catalogItemId}` });
  } catch (e: any) {
    return c.json({ error: 'Link create failed', details: e.message }, 500);
  }
});

// GET /api/public/partners/:id/links — all share links + click counts
publicThriveRouter.get('/:id/links', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const partnerId = c.req.param('id');
  try {
    const authed = await authedPartner(db, partnerId, c);
    if (!authed) return c.json({ error: 'Unauthorized' }, 401);
    const links = await db.select().from(partnerLinks).where(eq(partnerLinks.partnerId, partnerId)).all();
    return c.json({ links });
  } catch (e: any) {
    return c.json({ error: 'Links fetch failed', details: e.message }, 500);
  }
});

// ---------- TIERS + POINTS ----------
// GET /api/public/partners/:id/thrive — tier, points, progress, boost, links summary
publicThriveRouter.get('/:id/thrive', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const partnerId = c.req.param('id');
  try {
    const authed = await authedPartner(db, partnerId, c);
    if (!authed) return c.json({ error: 'Unauthorized' }, 401);

    const tiers = await db.select().from(partnerTiers).all();
    const sorted = [...tiers].sort((a: any, b: any) => a.order - b.order);
    const pointsRows = await db.select().from(partnerPoints).where(eq(partnerPoints.partnerId, partnerId)).all();
    const totalPoints = pointsRows.reduce((a: number, p: any) => a + Number(p.points || 0), 0);

    // current tier = highest whose minPoints <= totalPoints
    let tier = sorted[0], next = null;
    for (const t of sorted) { if (Number(t.minPoints) <= totalPoints) tier = t; }
    next = sorted.find((t: any) => Number(t.minPoints) > totalPoints) || null;
    const progress = next ? Math.min(100, Math.round((totalPoints / Number(next.minPoints)) * 100)) : 100;

    const links = await db.select().from(partnerLinks).where(eq(partnerLinks.partnerId, partnerId)).all();
    const totalClicks = links.reduce((a: number, l: any) => a + Number(l.clicks || 0), 0);

    return c.json({
      ref: authed.referralCode,
      tier: tier ? { key: tier.key, name: tier.name, minPoints: tier.minPoints, boostPct: tier.commissionBoostPct, perks: JSON.parse(tier.perksJson || '[]'), color: tier.color } : null,
      nextTier: next ? { key: next.key, name: next.name, minPoints: next.minPoints } : null,
      totalPoints,
      progressPct: progress,
      totalClicks,
      linkCount: links.length,
    });
  } catch (e: any) {
    return c.json({ error: 'Thrive summary failed', details: e.message }, 500);
  }
});
// GET /api/public/partners/:id/clicks — per-link click analytics (gold standard
// transparency: partners optimize campaigns on real numbers, not vibes)
publicThriveRouter.get('/:id/clicks', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const partnerId = c.req.param('id');
  try {
    const authed = await authedPartner(db, partnerId, c);
    if (!authed) return c.json({ error: 'Unauthorized' }, 401);
    const links = await db.select().from(partnerLinks).where(eq(partnerLinks.partnerId, partnerId)).all();
    const sorted = [...links].sort((a: any, b: any) => Number(pick(b, 'clicks', 'clicks') || 0) - Number(pick(a, 'clicks', 'clicks') || 0));
    const totalClicks = links.reduce((a: number, l: any) => a + Number(pick(l, 'clicks', 'clicks') || 0), 0);
    return c.json({
      totalClicks,
      links: sorted.map((l: any) => ({
        id: l.id,
        title: l.title,
        catalogType: pick(l, 'catalogType', 'catalog_type'),
        catalogItemId: pick(l, 'catalogItemId', 'catalog_item_id'),
        clicks: Number(pick(l, 'clicks', 'clicks') || 0),
        lastClickedAt: pick(l, 'lastClickedAt', 'last_clicked_at'),
        createdAt: pick(l, 'createdAt', 'created_at'),
      })),
    });
  } catch (e: any) {
    return c.json({ error: 'Clicks fetch failed', details: e.message }, 500);
  }
});

// GET /api/public/partners/:id/referral-detail — per-referral transparency.
// Gold standard: show the MATH, never just totals — a real timeline derived
// from existing tables (referral → client → engagement → payment → commission).
publicThriveRouter.get('/:id/referral-detail', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const partnerId = c.req.param('id');
  try {
    const authed = await authedPartner(db, partnerId, c);
    if (!authed) return c.json({ error: 'Unauthorized' }, 401);

    const refs = await db.select().from(referrals).where(eq(referrals.partnerId, partnerId)).all();
    const clientIds = [...new Set(refs.map((r: any) => r.clientId))];
    const clientRows = clientIds.length ? await db.select().from(clients).where(inArray(clients.id, clientIds)).all() : [];
    // inArray is filtered by real D1; MockD1 returns unfiltered → filter in JS too
    const engRows = clientIds.length ? await db.select().from(engagements).where(inArray(engagements.clientId, clientIds)).all() : [];
    const payRows = clientIds.length ? await db.select().from(payments).where(inArray(payments.clientId, clientIds)).all() : [];
    const ledgerRows = await db.select().from(commissionLedger).all();

    const clientFor = (id: string) => clientRows.find((cl: any) => cl.id === id);
    const engsFor = (id: string) => engRows
      .filter((e: any) => pick(e, 'clientId', 'client_id') === id)
      .sort((a: any, b: any) => Number(pick(a, 'createdAt', 'created_at') || 0) - Number(pick(b, 'createdAt', 'created_at') || 0));
    const paysFor = (id: string) => payRows
      .filter((p: any) => pick(p, 'clientId', 'client_id') === id && ['confirmed', 'paid', 'synced'].includes(p.status))
      .sort((a: any, b: any) => Number(pick(a, 'createdAt', 'created_at') || 0) - Number(pick(b, 'createdAt', 'created_at') || 0));
    const maturedFor = (refId: string) => ledgerRows.filter((l: any) => l.referralId === refId && ['matured', 'paid'].includes(l.status));

    const out = refs.map((r: any) => {
      const client = clientFor(r.clientId);
      const timeline: Array<{ label: string; at: number | null; state: string }> = [
        { label: 'Referral logged', at: pick(r, 'createdAt', 'created_at'), state: 'done' },
      ];
      if (client) timeline.push({ label: 'Client created', at: pick(client, 'createdAt', 'created_at'), state: 'done' });
      const engs = engsFor(r.clientId);
      if (engs.length) timeline.push({ label: 'Engagement active', at: pick(engs[0], 'createdAt', 'created_at'), state: 'done' });
      const pays = paysFor(r.clientId);
      if (pays.length) timeline.push({ label: 'Payment confirmed', at: pick(pays[0], 'createdAt', 'created_at'), state: 'done' });
      const matured = maturedFor(r.id);
      if (matured.length) timeline.push({ label: 'Commission matured', at: pick(matured[0], 'createdAt', 'created_at'), state: 'done' });

      return {
        referralId: r.id,
        clientId: r.clientId,
        clientName: client?.name ?? r.clientId,
        commissionRate: Number(pick(r, 'commissionRate', 'commission_rate') ?? 5),
        amountPaise: matured.reduce((a: number, l: any) => a + Number(l.amount || 0), 0),
        status: matured.length ? matured[0].status : 'unmatured',
        createdAt: pick(r, 'createdAt', 'created_at'),
        timeline,
      };
    });

    return c.json({ referrals: out });
  } catch (e: any) {
    return c.json({ error: 'Referral detail failed', details: e.message }, 500);
  }
});

// GET /api/public/partners/:id/creatives — pre-approved marketing library
// (active only, oldest first)
publicThriveRouter.get('/:id/creatives', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const partnerId = c.req.param('id');
  try {
    const authed = await authedPartner(db, partnerId, c);
    if (!authed) return c.json({ error: 'Unauthorized' }, 401);
    const rows = await db.select().from(partnerCreatives).all();
    const active = rows
      .filter((r: any) => r.active === true || r.active === 1)
      .sort((a: any, b: any) => Number(pick(a, 'createdAt', 'created_at') || 0) - Number(pick(b, 'createdAt', 'created_at') || 0));
    return c.json({
      creatives: active.map((r: any) => ({
        id: r.id,
        title: r.title,
        type: pick(r, 'type', 'type'),
        size: pick(r, 'size', 'size'),
        url: r.url,
        imageKey: pick(r, 'imageKey', 'image_key'),
        active: r.active === true || r.active === 1,
      })),
    });
  } catch (e: any) {
    return c.json({ error: 'Creatives fetch failed', details: e.message }, 500);
  }
});

// POST /api/public/partners/:id/payout-config — partner sets settlement
// preference (bank/upi + detail + threshold). Audited as a config change.
const payoutConfigSchema = z.object({
  payoutMethod: z.enum(['bank', 'upi']).optional(),
  payoutDetail: z.string().optional(),
  payoutThresholdPaise: z.number().int().min(0).optional(),
});
publicThriveRouter.post('/:id/payout-config', zValidator('json', payoutConfigSchema), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const partnerId = c.req.param('id');
  try {
    const authed = await authedPartner(db, partnerId, c);
    if (!authed) return c.json({ error: 'Unauthorized' }, 401);
    const data = c.req.valid('json');

    const patch: Record<string, any> = {};
    if (data.payoutMethod !== undefined) patch.payoutMethod = data.payoutMethod;
    if (data.payoutDetail !== undefined) patch.payoutDetail = data.payoutDetail;
    if (data.payoutThresholdPaise !== undefined) patch.payoutThresholdPaise = data.payoutThresholdPaise;
    if (Object.keys(patch).length) {
      await db.update(partners).set(patch).where(eq(partners.id, partnerId)).run();
    }

    const updated = await db.select().from(partners).where(eq(partners.id, partnerId)).get();
    const after = {
      payoutMethod: pick(updated, 'payoutMethod', 'payout_method') ?? null,
      payoutDetail: pick(updated, 'payoutDetail', 'payout_detail') ?? null,
      payoutThresholdPaise: Number(pick(updated, 'payoutThresholdPaise', 'payout_threshold_paise') ?? 0),
    };
    await auditBounded(c, {
      action: 'PARTNER_PAYOUT_CONFIG',
      entityName: 'partners',
      entityId: partnerId,
      category: 'config',
      afterState: after,
      actorType: 'partner',
      authMethod: 'partner_token',
    }, 'denial');
    return c.json(after);
  } catch (e: any) {
    return c.json({ error: 'Payout config failed', details: e.message }, 500);
  }
});

// GET /api/public/partners/:id/onboarding — activation checklist. Gold
// standard: first-link-in-5-min — a fresh partner should land here right
// after login and be 3 steps from a real referral.
publicThriveRouter.get('/:id/onboarding', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const partnerId = c.req.param('id');
  try {
    const authed = await authedPartner(db, partnerId, c);
    if (!authed) return c.json({ error: 'Unauthorized' }, 401);

    const links = await db.select().from(partnerLinks).where(eq(partnerLinks.partnerId, partnerId)).all();
    const refs = await db.select().from(referrals).where(eq(referrals.partnerId, partnerId)).all();
    const hasClick = links.some((l: any) => Number(pick(l, 'clicks', 'clicks') || 0) > 0);

    const steps = [
      { key: 'account', done: !!authed.email, label: 'Set up your email', hint: 'Add your email to receive payout alerts and updates' },
      { key: 'link', done: links.length > 0, label: 'Create your first link', hint: 'Pick an offer and share — do it within 5 minutes' },
      { key: 'click', done: hasClick, label: 'Get your first click', hint: 'Share your link on WhatsApp or social media' },
      { key: 'referral', done: refs.length > 0, label: 'Land your first referral', hint: 'Every referred client earns you commission' },
    ];
    return c.json({
      steps,
      doneCount: steps.filter((s) => s.done).length,
      totalCount: steps.length,
    });
  } catch (e: any) {
    return c.json({ error: 'Onboarding fetch failed', details: e.message }, 500);
  }
});

// POST /api/public/partners/:id/payouts — request payment of matured balance
publicThriveRouter.post('/:id/payouts', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const partnerId = c.req.param('id');
  try {
const p = await authedPartner(db, partnerId, c);
    if (!p) return c.json({ error: 'Unauthorized' }, 401);

    // matured balance = matured ledger entries for this partner (clamped)
    const myRefs = await db.select().from(referrals).where(eq(referrals.partnerId, partnerId)).all();
    const ledger = await db.select().from(commissionLedger).all();
    const matured = ledger
      .filter((l: any) => myRefs.some((r) => r.id === l.referralId) && l.status === 'matured')
      .reduce((a: number, l: any) => a + Number(l.amount || 0), 0);
    if (matured <= 0) return c.json({ error: 'No matured balance to withdraw' }, 400);

    const requested = await db.select().from(payoutRequests).where(eq(payoutRequests.partnerId, partnerId)).all();
    if (requested.some((r: any) => r.status === 'requested')) {
      return c.json({ error: 'A payout request is already pending' }, 409);
    }

    await db.insert(payoutRequests).values({
      id: crypto.randomUUID(), partnerId, amountPaise: matured, status: 'requested',
      note: 'Self-service payout request', requestedAt: Math.floor(Date.now() / 1000), resolvedAt: null, updatedBy: null,
    });
    await auditEvent(c, { action: 'PARTNER_PAYOUT_REQUESTED', entityName: 'payout_requests', entityId: partnerId, actorType: 'partner', authMethod: 'partner_token', afterState: { partnerId, amountPaise: matured, status: 'requested' } });

    // Notify the partner their request is in the owner's queue (fail-open:
    // a notification hiccup must never fail the request itself).
    if (p.email) {
      try {
        await sendNotification(c.env as any, db, {
          channel: 'email',
          to: p.email,
          subject: 'Opus Overseas — payout request received',
          body: `Your payout request of ₹${(matured / 100).toLocaleString('en-IN')} (${matured} paise) was received — owner will approve.`,
        });
      } catch (e: any) {
        console.error('payout request email failed', e?.message);
      }
    }

    return c.json({ success: true, amountPaise: matured, message: `Payout of the matured balance requested — owner will approve.` });
  } catch (e: any) {
    return c.json({ error: 'Payout request failed', details: e.message }, 500);
  }
});

// GET /api/public/partners/:id/payouts — request history
publicThriveRouter.get('/:id/payouts', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  try {
    const p = await authedPartner(db, c.req.param('id'), c);
    if (!p) return c.json({ error: 'Unauthorized' }, 401);
    const rows = await db.select().from(payoutRequests).where(eq(payoutRequests.partnerId, c.req.param('id'))).all();
    return c.json({ payouts: [...rows].sort((a: any, b: any) => b.requestedAt - a.requestedAt) });
  } catch (e: any) {
    return c.json({ error: 'Payout history failed', details: e.message }, 500);
  }
});
