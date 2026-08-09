import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { getDb } from '../db/client.js';
import { partners, commissionPlans, partnerTiers, partnerPoints, partnerLinks, referrals, commissionLedger, payoutRequests } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { auditEvent } from '../middleware/audit.js';

// Partner Command Center — owner ceiling (mounted under /api/admin/partners).
// Thrive-equivalent controls: registry + status, commission plans per
// inventory type/item/partner, VIP tier ladder editing, per-partner analytics.

export const partnerAdminRouter = new Hono<{
  Bindings: { DB: D1Database; BETTER_AUTH_SECRET: string };
  Variables: { user?: { id?: string } | null };
}>();

// ---------- REGISTRY + STATUS (existing) ----------
partnerAdminRouter.get('/', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  try {
    const rows = await db.select().from(partners).all();
    return c.json({ partners: rows });
  } catch (e: any) {
    return c.json({ error: 'Partner registry lookup failed', details: e.message }, 500);
  }
});

const statusSchema = z.object({ status: z.enum(['active', 'blocked']) });
partnerAdminRouter.patch('/:id/status', zValidator('json', statusSchema), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const id = c.req.param('id');
  const body = c.req.valid('json');
  try {
    const current = await db.select().from(partners).where(eq(partners.id, id)).get();
    if (!current) return c.json({ error: 'Partner not found' }, 404);
    await db.update(partners).set({ status: body.status }).where(eq(partners.id, id)).run();
    await auditEvent(c, {
      action: body.status === 'active' ? 'PARTNER_ACTIVATED' : 'PARTNER_BLOCKED',
      entityName: 'partners', entityId: id,
      afterState: { name: current.name, status: body.status, referralCode: current.referralCode },
    });
    return c.json({ success: true, id, status: body.status, message: `Partner '${current.name}' is now ${body.status}.` });
  } catch (e: any) {
    return c.json({ error: 'Partner status update failed', details: e.message }, 500);
  }
});

// ---------- COMMISSION PLANS (inventory commission control) ----------
// Resolution order: partner+item > partner+type > global+item > global+type > default 5%.
const planSchema = z.object({
  partnerId: z.string().optional().nullable(),
  catalogType: z.enum(['university', 'departure', 'job', 'attestation', '*']).default('*'),
  catalogItemId: z.string().optional().nullable(),
  ratePct: z.number().int().min(0).max(100),
});

// GET /api/admin/partners/plans — all commission plans + resolvable effective rates
partnerAdminRouter.get('/plans', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  try {
    const plans = await db.select().from(commissionPlans).all();
    const partnerRows = await db.select().from(partners).all();
    const catalogItems: Record<string, any[]> = {};
    return c.json({ plans, partners: partnerRows.map((p) => ({ id: p.id, name: p.name })), catalogItems });
  } catch (e: any) {
    return c.json({ error: 'Commission plans lookup failed', details: e.message }, 500);
  }
});

// POST /api/admin/partners/plans — create/upsert a plan (owner)
partnerAdminRouter.post('/plans', zValidator('json', planSchema), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const data = c.req.valid('json');
  const now = Math.floor(Date.now() / 1000);
  const userId = (c.get('user') as any)?.id || null;
  try {
    const existing = await db.select().from(commissionPlans).all();
    const dup = existing.find((p: any) =>
      String(p.partnerId ?? '') === String(data.partnerId ?? '') &&
      p.catalogType === data.catalogType &&
      String(p.catalogItemId ?? '') === String(data.catalogItemId ?? ''));
    if (dup) {
      await db.update(commissionPlans).set({ ratePct: data.ratePct, updatedBy: userId, updatedAt: now }).where(eq(commissionPlans.id, dup.id));
      return c.json({ success: true, id: dup.id, message: 'Commission plan updated.' });
    }
    const id = crypto.randomUUID();
    await db.insert(commissionPlans).values({
      id, partnerId: data.partnerId || null, catalogType: data.catalogType,
      catalogItemId: data.catalogItemId || null, ratePct: data.ratePct, updatedBy: userId, createdAt: now, updatedAt: now,
    });
    await auditEvent(c, { action: 'COMMISSION_PLAN_SET', entityName: 'commission_plans', entityId: id, afterState: data });
    return c.json({ success: true, id, message: 'Commission plan saved.' });
  } catch (e: any) {
    return c.json({ error: 'Commission plan save failed', details: e.message }, 500);
  }
});

// DELETE /api/admin/partners/plans/:id — remove a plan (falls back to defaults)
partnerAdminRouter.delete('/plans/:id', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  try {
    await db.delete(commissionPlans).where(eq(commissionPlans.id, c.req.param('id')));
    return c.json({ success: true, message: 'Commission plan removed.' });
  } catch (e: any) {
    return c.json({ error: 'Commission plan delete failed', details: e.message }, 500);
  }
});

// ---------- TIER LADDER EDITOR ----------
const tierSchema = z.object({
  id: z.string().optional(),
  key: z.string().min(2),
  name: z.string().min(2),
  minPoints: z.number().int().min(0),
  commissionBoostPct: z.number().int().min(0).max(25),
  perksJson: z.string().default('[]'),
  color: z.string().default('brand-gold'),
  order: z.number().int().min(1),
});

// GET /api/admin/partners/tiers — current ladder
partnerAdminRouter.get('/tiers', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  try {
    const tiers = await db.select().from(partnerTiers).all();
    return c.json({ tiers: [...tiers].sort((a: any, b: any) => a.order - b.order) });
  } catch (e: any) {
    return c.json({ error: 'Tier ladder lookup failed', details: e.message }, 500);
  }
});

// POST /api/admin/partners/tiers — create or update a tier
partnerAdminRouter.post('/tiers', zValidator('json', tierSchema), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const data = c.req.valid('json');
  const now = Math.floor(Date.now() / 1000);
  try {
    if (data.id) {
      const existing = await db.select().from(partnerTiers).where(eq(partnerTiers.id, data.id)).get();
      if (!existing) return c.json({ error: 'Tier not found' }, 404);
      await db.update(partnerTiers).set({
        key: data.key, name: data.name, minPoints: data.minPoints,
        commissionBoostPct: data.commissionBoostPct, perksJson: data.perksJson, color: data.color, order: data.order,
      }).where(eq(partnerTiers.id, data.id));
      return c.json({ success: true, message: 'Tier updated.' });
    }
    const id = crypto.randomUUID();
    await db.insert(partnerTiers).values({ id, key: data.key, name: data.name, minPoints: data.minPoints, commissionBoostPct: data.commissionBoostPct, perksJson: data.perksJson, color: data.color, order: data.order, createdAt: now });
    await auditEvent(c, { action: 'TIER_SAVED', entityName: 'partner_tiers', entityId: id, afterState: { key: data.key, minPoints: data.minPoints, boost: data.commissionBoostPct } });
    return c.json({ success: true, id, message: 'Tier created.' });
  } catch (e: any) {
    return c.json({ error: 'Tier save failed', details: e.message }, 500);
  }
});

// DELETE /api/admin/partners/tiers/:id
partnerAdminRouter.delete('/tiers/:id', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  try {
    await db.delete(partnerTiers).where(eq(partnerTiers.id, c.req.param('id')));
    return c.json({ success: true, message: 'Tier removed.' });
  } catch (e: any) {
    return c.json({ error: 'Tier delete failed', details: e.message }, 500);
  }
});

// ---------- PARTNER ANALYTICS (per-partner progress, Thrive-equivalent) ----------
// GET /api/admin/partners/analytics — all partners with tier, points, clicks, referrals, commissions
partnerAdminRouter.get('/analytics', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  try {
    const [partnerRows, tiers, pointsRows, linkRows, referralRows, ledger] = await Promise.all([
      db.select().from(partners).all(),
      db.select().from(partnerTiers).all(),
      db.select().from(partnerPoints).all(),
      db.select().from(partnerLinks).all(),
      db.select().from(referrals).all(),
      db.select().from(commissionLedger).all(),
    ]);
    const sortedTiers = [...tiers].sort((a: any, b: any) => a.order - b.order);

    const analytics = partnerRows.map((p) => {
      const points = pointsRows.filter((r: any) => r.partnerId === p.id).reduce((a: number, r: any) => a + Number(r.points || 0), 0);
      const myRefs = referralRows.filter((r: any) => r.partnerId === p.id);
      const myLedger = ledger.filter((l: any) => myRefs.some((r: any) => r.id === l.referralId));
      const earned = myLedger.filter((l: any) => l.status === 'matured').reduce((a: number, l: any) => a + Number(l.amount || 0), 0);
      const paid = myLedger.filter((l: any) => l.status === 'paid').reduce((a: number, l: any) => a + Number(l.amount || 0), 0);
      const clicks = linkRows.filter((l: any) => l.partnerId === p.id).reduce((a: number, l: any) => a + Number(l.clicks || 0), 0);
      const linkCount = linkRows.filter((l: any) => l.partnerId === p.id).length;

      let tier = sortedTiers[0];
      for (const t of sortedTiers) { if (Number(t.minPoints) <= points) tier = t; }
      const next = sortedTiers.find((t: any) => Number(t.minPoints) > points) || null;

      return {
        id: p.id, name: p.name, status: p.status, referralCode: p.referralCode,
        points, tier: tier?.key || 'bronze', tierName: tier?.name || 'Bronze', tierBoost: tier?.commissionBoostPct || 0,
        nextTier: next?.key || null,
        clicks, linkCount,
        referrals: myRefs.length,
        earnedPaise: earned, paidPaise: paid,
        joinedAt: p.createdAt,
      };
    });
    analytics.sort((a, b) => b.points - a.points);
    return c.json({ analytics });
  } catch (e: any) {
    return c.json({ error: 'Partner analytics failed', details: e.message }, 500);
  }
});

// GET /api/admin/partners/:id/activity — per-partner point/click history
partnerAdminRouter.get('/:id/activity', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const id = c.req.param('id');
  try {
    const points = await db.select().from(partnerPoints).where(eq(partnerPoints.partnerId, id)).all();
    const links = await db.select().from(partnerLinks).where(eq(partnerLinks.partnerId, id)).all();
    return c.json({ points, links });
  } catch (e: any) {
    return c.json({ error: 'Partner activity lookup failed', details: e.message }, 500);
  }
});
// ---------- PAYOUT APPROVAL (owner) ----------
// GET /api/admin/partners/payouts — all payout requests
partnerAdminRouter.get('/payouts', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  try {
    const rows = await db.select().from(payoutRequests).all();
    const partnerRows = await db.select().from(partners).all();
    const merged = [...rows].sort((a: any, b: any) => b.requestedAt - a.requestedAt).map((r: any) => ({
      ...r, partnerName: partnerRows.find((p) => p.id === r.partnerId)?.name || 'Unknown',
    }));
    return c.json({ payouts: merged });
  } catch (e: any) {
    return c.json({ error: 'Payout list failed', details: e.message }, 500);
  }
});

// PATCH /api/admin/partners/payouts/:id — approve (marks ledger paid) or reject
partnerAdminRouter.patch('/payouts/:id', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const body = await c.req.json().catch(() => ({})) as { status?: string };
  if (!['approved', 'paid', 'rejected'].includes(body.status || '')) return c.json({ error: 'status must be approved|paid|rejected' }, 400);
  const now = Math.floor(Date.now() / 1000);
  const id = c.req.param('id');
  try {
    const req_ = await db.select().from(payoutRequests).where(eq(payoutRequests.id, id)).get();
    if (!req_) return c.json({ error: 'Payout not found' }, 404);
    await db.update(payoutRequests).set({ status: body.status as any, resolvedAt: now, updatedBy: (c.get('user') as any)?.id || null }).where(eq(payoutRequests.id, id));

    // When paid, flip matching matured ledger entries to paid.
    if (body.status === 'paid' && req_.amountPaise) {
      const ledger = await db.select().from(commissionLedger).all();
      const myRefs = await db.select().from(referrals).where(eq(referrals.partnerId, req_.partnerId)).all();
      for (const l of ledger) {
        if (myRefs.some((r: any) => r.id === l.referralId) && l.status === 'matured') {
          await db.update(commissionLedger).set({ status: 'paid' }).where(eq(commissionLedger.id, l.id));
        }
      }
    }
    await auditEvent(c, { action: 'PARTNER_PAYOUT_' + String(body.status).toUpperCase(), entityName: 'payout_requests', entityId: id, afterState: { partnerId: req_.partnerId, amount: req_.amountPaise, status: body.status } });
    return c.json({ success: true, message: `Payout marked ${body.status}.` });
  } catch (e: any) {
    return c.json({ error: 'Payout update failed', details: e.message }, 500);
  }
});
