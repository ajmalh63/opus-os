// Conversion Goal Exit & Lifecycle Engine
// Immediately suppresses converted clients from prospecting drips and enrolls them into onboarding.

import { getDb } from '../db/client.js';
import { clients, nurtureTouches } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { mauticSyncContact } from '../infra/mautic.js';
import { dispatchUnifiedWhatsApp } from '../infra/chatwootBridge.js';
import { createStaffAlert } from '../infra/staffAlerts.js';
import { auditBounded } from '../middleware/audit.js';

export type ConversionGoalType =
  | 'PAYMENT_CONFIRMED'
  | 'AGREEMENT_SIGNED'
  | 'UMRAH_ADVANCE_VERIFIED'
  | 'OFFER_LETTER_RECEIVED'
  | 'VISA_APPROVED'
  | 'ATTESTATION_RECEIVED';

export interface ConversionGoalParams {
  clientId: string;
  division: string;
  goalType: ConversionGoalType;
  amountPaise?: number;
  details?: Record<string, any>;
}

export async function handleLeadConversionGoal(
  env: any,
  params: ConversionGoalParams,
  ctx?: any
): Promise<{ success: boolean; suppressedTouches: number }> {
  if (!env?.DB) return { success: false, suppressedTouches: 0 };
  const db = getDb(env.DB);

  // 1. Fetch Client
  const client = await db.select().from(clients).where(eq(clients.id, params.clientId)).get();
  if (!client) return { success: false, suppressedTouches: 0 };

  // 2. Goal-Based Suppression: Cancel all scheduled prospecting nurture touches
  const scheduledTouches = await db
    .select()
    .from(nurtureTouches)
    .where(and(eq(nurtureTouches.clientId, params.clientId), eq(nurtureTouches.status, 'scheduled')))
    .all();

  if (scheduledTouches.length > 0) {
    await db
      .update(nurtureTouches)
      .set({ status: 'skipped' })
      .where(and(eq(nurtureTouches.clientId, params.clientId), eq(nurtureTouches.status, 'scheduled')));
  }

  // 3. Mautic Sync: Promote to Stage 5 (Won / Enrolled) & apply conversion tags
  if (client.email) {
    mauticSyncContact(env, {
      email: client.email,
      firstname: client.name,
      phone: client.phone || undefined,
      points: 100, // Maximum engagement score upon commercial conversion
      division: params.division,
      tags: [
        params.division,
        'converted',
        `converted:${params.division}`,
        'client-active',
        params.goalType.toLowerCase(),
      ],
    }).catch(() => {});
  }

  // 4. Chatwoot Timeline & Tags Sync
  if (client.phone) {
    dispatchUnifiedWhatsApp(env, {
      phone: client.phone,
      name: client.name,
      email: client.email || undefined,
      customText: `🎉 *Milestone Achieved: ${client.name}* is now officially enrolled for ${params.division.toUpperCase()}!`,
      division: params.division,
      tags: ['converted', 'won', 'active-client', params.division],
    }).catch(() => {});
  }

  // 5. Counselor Staff Notification
  await createStaffAlert(env, {
    division: (params.division as any) || 'study-abroad',
    type: 'conversion_goal',
    title: `🏆 Lead Converted: ${client.name} (${params.division})`,
    body: `Conversion Goal [${params.goalType}] achieved. Suppressed ${scheduledTouches.length} prospecting touches.`,
    severity: 'info',
    link: `/crm`,
  });

  return {
    success: true,
    suppressedTouches: scheduledTouches.length,
  };
}
