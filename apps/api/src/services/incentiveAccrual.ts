import { getDb } from '../db/client.js';
import { incentiveRules, incentiveEntries, engagements, clients } from '../db/schema.js';
import { eq } from 'drizzle-orm';

// Incentive accrual engine (plan §29.4) — the missing write path.
// Owner configures rules; this service ACCRUES entries when a business trigger
// fires (agreement_signed, milestone_paid, visa_granted, placement_confirmed).
// Idempotent per (ruleId, triggerRef): replays never double-credit.

type Trigger = 'agreement_signed' | 'milestone_paid' | 'visa_granted' | 'placement_confirmed';

export interface AccrualContext {
  clientId: string;
  engagementId?: string | null;
  triggerRef: string;           // payment id / agreement id — dedupe key
  trigger: Trigger;
  triggerAmountPaise?: number;  // for percent rules
  fallbackAssigneeId?: string | null;
  env: { DB: D1Database };
}

export async function accrueIncentives(ctx: AccrualContext): Promise<{ accrued: number; skipped: number }> {
  const db = getDb(ctx.env.DB);
  const now = Math.floor(Date.now() / 1000);
  const period = `${new Date(now * 1000).getFullYear()}-${String(new Date(now * 1000).getMonth() + 1).padStart(2, '0')}`;

  const rules = await db.select().from(incentiveRules).where(eq(incentiveRules.active, true)).all();

  const eng = ctx.engagementId
    ? await db.select().from(engagements).where(eq(engagements.id, ctx.engagementId)).get()
    : null;
  const client = await db.select().from(clients).where(eq(clients.id, ctx.clientId)).get();
  const division = eng?.division;

  let accrued = 0, skipped = 0;
  for (const rule of rules) {
    if (rule.trigger !== ctx.trigger) continue;
    if (division && rule.division !== division && rule.division !== '*') continue;

    const dup = await db.select().from(incentiveEntries)
      .where(eq(incentiveEntries.triggerRef, `${rule.id}:${ctx.triggerRef}`))
      .get();
    if (dup) { skipped++; continue; }

    const assigneeId = (eng as any)?.counselorId ?? (eng as any)?.counselor_id ?? ctx.fallbackAssigneeId;
    if (!assigneeId) { skipped++; continue; } // no owner → nothing to accrue to

    let amount = rule.amount;
    if (rule.isPercent && ctx.triggerAmountPaise) {
      amount = Math.floor((ctx.triggerAmountPaise * rule.amount) / 100);
    }

    await db.insert(incentiveEntries).values({
      id: crypto.randomUUID(),
      employeeId: assigneeId,
      ruleId: rule.id,
      engagementId: eng?.id || null,
      triggerRef: `${rule.id}:${ctx.triggerRef}`,
      amount: amount,
      status: 'accrued',
      period,
      createdAt: now,
    });
    accrued++;
  }
  return { accrued, skipped };
}