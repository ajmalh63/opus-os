import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { getDb } from '../db/client.js';
import { partners, commissionPlans, partnerTiers, partnerPoints, partnerLinks, referrals, commissionLedger, payoutRequests, partnerCreatives } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { auditEvent } from '../middleware/audit.js';
import { sendNotification } from '../infra/notify.js';

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
    // Registry view sanitizes credentials/PII: apiToken is a live credential
    // (returned once at signup); IFSC + bank are masked/omitted.
    const safe = rows.map((r: any) => ({
      ...r,
      apiToken: undefined,
      ifscCode: r.ifscCode ? `${String(r.ifscCode).slice(0, 4)}****${String(r.ifscCode).slice(-3)}` : null,
      bankAccount: r.bankAccount && String(r.bankAccount).startsWith('aes:') ? 'encrypted' : (String(r.bankAccount || '').replace(/.*:/, '')),
    }));
    return c.json({ partners: safe });
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
  catalogType: z.enum(['university', 'departure', 'job', 'visa', 'umrah_package', '*']).default('*'),
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

    // Payout lifecycle email (§4 design doc): notify the partner on
    // approve/paid. Fail-open — an email hiccup never fails the mutation.
    if (body.status === 'approved' || body.status === 'paid') {
      try {
        const partner = await db.select().from(partners).where(eq(partners.id, req_.partnerId)).get();
        if (partner?.email) {
          const amt = (Number(req_.amountPaise || 0) / 100).toLocaleString('en-IN', { style: 'currency', currency: 'INR' });
          await sendNotification(c.env as any, db, {
            channel: 'email',
            to: partner.email,
            subject: body.status === 'approved' ? 'Payout approved' : 'Payout paid',
            body: body.status === 'approved'
              ? `Payout approved — ${amt} will be settled.`
              : `Payout paid — ${amt} settled.`,
            clientId: req_.partnerId,
          });
        }
      } catch (e: any) {
        console.error('payout notification failed', e?.message);
      }
    }

    return c.json({ success: true, message: `Payout marked ${body.status}.` });
  } catch (e: any) {
    return c.json({ error: 'Payout update failed', details: e.message }, 500);
  }
});

// ---------- CREATIVE LIBRARY (owner-managed marketing materials, Phase B) ----------
// Pre-approved banners/text links partners can copy. Compliance-controlled:
// only the owner writes; the public portal reads active rows only.
const creativeSchema = z.object({
  title: z.string().min(1),
  type: z.enum(['banner', 'text']).default('text'),
  size: z.string().nullable().optional(), // e.g. "728x90" (banners)
  url: z.string().min(1), // target path e.g. "/study-abroad"
  imageKey: z.string().nullable().optional(), // R2 key for banners
  active: z.boolean().optional(),
});
const creativePatchSchema = z.object({
  title: z.string().min(1).optional(),
  type: z.enum(['banner', 'text']).optional(),
  size: z.string().nullable().optional(),
  url: z.string().min(1).optional(),
  imageKey: z.string().nullable().optional(),
  active: z.boolean().optional(),
});

// GET /api/admin/partners/creatives — ALL rows (incl. inactive), newest first
partnerAdminRouter.get('/creatives', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  try {
    const rows = await db.select().from(partnerCreatives).orderBy(desc(partnerCreatives.createdAt)).all();
    return c.json({ creatives: rows });
  } catch (e: any) {
    return c.json({ error: 'Creative library lookup failed', details: e.message }, 500);
  }
});

// POST /api/admin/partners/creatives — add a creative
partnerAdminRouter.post('/creatives', zValidator('json', creativeSchema), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const data = c.req.valid('json');
  const now = Math.floor(Date.now() / 1000);
  try {
    const id = crypto.randomUUID();
    await db.insert(partnerCreatives).values({
      id,
      title: data.title,
      type: data.type,
      size: data.size ?? null,
      url: data.url,
      imageKey: data.imageKey ?? null,
      active: data.active ?? true,
      createdAt: now,
      updatedAt: now,
    });
    await auditEvent(c, {
      action: 'CREATIVE_CREATED', entityName: 'partner_creatives', entityId: id, category: 'config',
      afterState: { title: data.title, type: data.type, url: data.url, active: data.active ?? true },
    });
    return c.json({ success: true, id, message: 'Creative saved.' });
  } catch (e: any) {
    return c.json({ error: 'Creative save failed', details: e.message }, 500);
  }
});

// PATCH /api/admin/partners/creatives/:id — partial update
partnerAdminRouter.patch('/creatives/:id', zValidator('json', creativePatchSchema), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const id = c.req.param('id');
  const data = c.req.valid('json');
  const now = Math.floor(Date.now() / 1000);
  try {
    const existing = await db.select().from(partnerCreatives).where(eq(partnerCreatives.id, id)).get();
    if (!existing) return c.json({ error: 'Creative not found' }, 404);
    const patch: Record<string, unknown> = { updatedAt: now };
    if (data.title !== undefined) patch.title = data.title;
    if (data.type !== undefined) patch.type = data.type;
    if (data.size !== undefined) patch.size = data.size;
    if (data.url !== undefined) patch.url = data.url;
    if (data.imageKey !== undefined) patch.imageKey = data.imageKey;
    if (data.active !== undefined) patch.active = data.active;
    await db.update(partnerCreatives).set(patch as any).where(eq(partnerCreatives.id, id));
    await auditEvent(c, {
      action: 'CREATIVE_UPDATED', entityName: 'partner_creatives', entityId: id, category: 'config',
      beforeState: { title: existing.title, active: existing.active },
      afterState: patch,
    });
    return c.json({ success: true, id, message: 'Creative updated.' });
  } catch (e: any) {
    return c.json({ error: 'Creative update failed', details: e.message }, 500);
  }
});

// DELETE /api/admin/partners/creatives/:id
partnerAdminRouter.delete('/creatives/:id', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const id = c.req.param('id');
  try {
    await db.delete(partnerCreatives).where(eq(partnerCreatives.id, id));
    await auditEvent(c, { action: 'CREATIVE_DELETED', entityName: 'partner_creatives', entityId: id, category: 'config' });
    return c.json({ success: true, message: 'Creative removed.' });
  } catch (e: any) {
    return c.json({ error: 'Creative delete failed', details: e.message }, 500);
  }
});
