import { getDb } from '../db/client.js';
import { partners, partnerPoints, partnerTiers } from '../db/schema.js';
import { eq } from 'drizzle-orm';

// Thrive-style loyalty points engine (plan §39 / Zoho Thrive pattern).
// Points = paise-equivalent activity rewards. Rewardable activities:
//   referral_linked (10% of referred client's first milestone later),
//   client_signed   (flat 2500),
//   milestone_paid  (2% of paid amount),
//   share           (500 per share link created — capped).
// Idempotent per (partnerId, reason, referenceKey); tiers qualify on the
// cumulative points (= lifetime commissions approximation).

const SIGN_POINTS = 2500;
const SHARE_POINTS = 500;
const REFERRAL_LINKED_POINTS = 500; // Thrive: activity reward for bringing a lead in

export interface PointsCtx {
  env: { DB: D1Database };
  partnerId: string;
  reason: 'referral_linked' | 'client_signed' | 'milestone_paid' | 'share';
  referenceKey: string;
  amountPaise?: number; // for milestone_paid (2%) / referral_linked (10% of paid)
  referenceKeyForShare?: string;
}

export async function accruePartnerPoints(ctx: PointsCtx): Promise<{ points: number; accrued: boolean }> {
  const db = getDb(ctx.env.DB);
  const now = Math.floor(Date.now() / 1000);

  let points = 0;
  if (ctx.reason === 'client_signed') points = SIGN_POINTS;
  else if (ctx.reason === 'share') points = SHARE_POINTS;
  else if (ctx.reason === 'referral_linked') points = REFERRAL_LINKED_POINTS;
  else if (ctx.reason === 'milestone_paid' && ctx.amountPaise) points = Math.floor((ctx.amountPaise * 2) / 100);

  if (points <= 0) return { points: 0, accrued: false };

  const dup = await db.select().from(partnerPoints)
    .where(eq(partnerPoints.referenceKey, `${ctx.partnerId}:${ctx.reason}:${ctx.referenceKey}`))
    .get();
  if (dup) return { points: 0, accrued: false };

  await db.insert(partnerPoints).values({
    id: crypto.randomUUID(),
    partnerId: ctx.partnerId,
    points,
    reason: ctx.reason,
    referenceKey: `${ctx.partnerId}:${ctx.reason}:${ctx.referenceKey}`,
    createdAt: now,
  });
  return { points, accrued: true };
}

// Resolve tier for a partner (qualified on cumulative points).
export async function resolveTier(env: { DB: D1Database }, partnerId: string) {
  const db = getDb(env.DB);
  const tiers = await db.select().from(partnerTiers).all();
  const sorted = [...tiers].sort((a: any, b: any) => a.order - b.order);
  const rows = await db.select().from(partnerPoints).where(eq(partnerPoints.partnerId, partnerId)).all();
  const total = rows.reduce((a: number, p: any) => a + Number(p.points || 0), 0);

  let tier = sorted[0];
  for (const t of sorted) { if (Number(t.minPoints) <= total) tier = t; }
  const next = sorted.find((t: any) => Number(t.minPoints) > total) || null;
  return { tier, next, totalPoints: total };
}

// Idempotent seed of the default VIP tier ladder.
export async function seedPartnerTiers(env: { DB: D1Database }): Promise<void> {
  const db = getDb(env.DB);
  const now = Math.floor(Date.now() / 1000);
  const defaults = [
    { key: 'bronze', name: 'Bronze Partner', minPoints: 0, boost: 0, perks: ['Standard commission rate', 'Monthly payout cycle'], color: '#b87333', order: 1 },
    { key: 'silver', name: 'Silver Partner', minPoints: 100000, boost: 1, perks: ['+1% commission boost', 'Priority support'], color: '#c0c0c0', order: 2 },
    { key: 'gold', name: 'Gold Partner', minPoints: 500000, boost: 3, perks: ['+3% commission boost', 'Weekly payout option', 'Co-branded creatives'], color: '#d7a019', order: 3 },
    { key: 'platinum', name: 'Platinum Partner', minPoints: 1500000, boost: 5, perks: ['+5% commission boost', 'Bi-weekly payouts', 'Dedicated partner manager'], color: '#9aa5b1', order: 4 },
  ];
  for (const t of defaults) {
    await db.insert(partnerTiers).values({
      id: `tier-${t.key}`, key: t.key, name: t.name, minPoints: t.minPoints,
      commissionBoostPct: t.boost, perksJson: JSON.stringify(t.perks), color: t.color, order: t.order, createdAt: now,
    }).onConflictDoNothing();
  }
}