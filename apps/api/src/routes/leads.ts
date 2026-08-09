import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { leadIntakeSchema } from '@opusos/shared';
import { getDb } from '../db/client.js';
import { clients, consents, engagements, interactionPoints, scoringEvents, partners, referrals, commissionLedger } from '../db/schema.js';
import { and, eq } from 'drizzle-orm';
import { rateLimit } from '../middleware/rateLimit.js';
import { pickCounselorForDivision, createAssignmentTask } from '../services/leadAssignment.js';
import { ensurePipelineStages } from '../db/seed.js';
import { accruePartnerPoints } from '../services/partnerLoyalty.js';
import { auditEvent } from '../middleware/audit.js';

export const leadsRouter = new Hono<{ Bindings: { DB: D1Database } }>();

// Public lead-intake spam protection (Section 18.2.2): 5 submissions / hour / IP.
leadsRouter.use('/', rateLimit({ bucket: 'lead-form', windowSeconds: 3600, limit: 5 }));

leadsRouter.post('/', zValidator('json', leadIntakeSchema), async (c) => {
  const data = c.req.valid('json');
  
  if (!c.env || !c.env.DB) {
    return c.json({
      success: true,
      token: "OP-2026-MOCK",
      message: "Lead validated. DB not available."
    });
  }

  const db = getDb(c.env.DB);
  const token = `OP-2026-${Math.floor(1000 + Math.random() * 9000)}`;

  try {
    // Insert client (persist lead source + intake context for funnel scoring/qualification)
    await db.insert(clients).values({
      id: token,
      name: data.name,
      phone: data.phone,
      email: data.email,
      highestQualification: data.highestQualification,
      leadSource: data.leadSource || 'website',
      intakeContext: data.dynamicContext ? JSON.stringify(data.dynamicContext) : null,
      createdAt: Math.floor(Date.now() / 1000),
      updatedAt: Math.floor(Date.now() / 1000)
    });

    const ipAddress = c.req.header('x-real-ip') || c.req.header('cf-connecting-ip') || '127.0.0.1';
    
    // DPDP-2023 Consent Notice Hashing Helper
    const sha256 = async (message: string): Promise<string> => {
      const msgBuffer = new TextEncoder().encode(message);
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    };

    const CORE_PROCESSING_NOTICE = "OpusOS Consent Notice v1.0: Core processing of client application data for admissions, visa processing, and division-specific onboarding under DPDP-2023 guidelines.";
    const WHATSAPP_UPDATES_NOTICE = "OpusOS Consent Notice v1.0: Consent to receive updates, reminders, notifications, and communications via WhatsApp messenger.";
    const MARKETING_NOTICE = "OpusOS Consent Notice v1.0: Consent to receive occasional marketing updates, tips, scholarship alerts, and offers tailored to your interests via email.";

    const coreNoticeHash = await sha256(CORE_PROCESSING_NOTICE);
    const whatsappNoticeHash = await sha256(WHATSAPP_UPDATES_NOTICE);

    // Insert core-processing consent
    await db.insert(consents).values({
      id: crypto.randomUUID(),
      clientId: token,
      consentType: 'core-processing',
      status: 'granted',
      ipAddress,
      sha256Hash: coreNoticeHash,
      grantedAt: Math.floor(Date.now() / 1000)
    });
    await auditEvent(c, {
      action: 'CONSENT_GRANTED', entityName: 'consents', entityId: token,
      afterState: { clientId: token, consentType: 'core-processing', status: 'granted' },
    });

    // Insert whatsapp updates consent
    if (data.consents.whatsappUpdates) {
      await db.insert(consents).values({
        id: crypto.randomUUID(),
        clientId: token,
        consentType: 'whatsapp-updates',
        status: 'granted',
        ipAddress,
        sha256Hash: whatsappNoticeHash,
        grantedAt: Math.floor(Date.now() / 1000)
      });
      await auditEvent(c, {
        action: 'CONSENT_GRANTED', entityName: 'consents', entityId: token,
        afterState: { clientId: token, consentType: 'whatsapp-updates', status: 'granted' },
      });
    }

    // Insert marketing-campaigns consent (email/offers lane — Wave 2 brainstorm)
    if (data.consents.marketingCampaigns) {
      const marketingNoticeHash = await sha256(MARKETING_NOTICE);
      await db.insert(consents).values({
        id: crypto.randomUUID(),
        clientId: token,
        consentType: 'marketing-campaigns',
        status: 'granted',
        ipAddress,
        sha256Hash: marketingNoticeHash,
        grantedAt: Math.floor(Date.now() / 1000)
      });
      await auditEvent(c, {
        action: 'CONSENT_GRANTED', entityName: 'consents', entityId: token,
        afterState: { clientId: token, consentType: 'marketing-campaigns', status: 'granted' },
      });
    }

    // Insert engagement (self-heal: guarantee pipeline stages exist first —
    // engagements.stage_key has an FK to pipeline_stages; fresh DBs seeding)
    await ensurePipelineStages(db);
    const engagementId = crypto.randomUUID();
    await db.insert(engagements).values({
      id: engagementId,
      clientId: token,
      division: data.division,
      title: `${data.division.toUpperCase()} Application`,
      stageKey: 'lead',
      outstandingBalance: 0,
      status: 'active',
      createdAt: Math.floor(Date.now() / 1000),
      updatedAt: Math.floor(Date.now() / 1000)
    });

    // SPEED-TO-LEAD SLA (FunnelTODO #1): auto-create a 15-minute follow-up task on every
    // lead, round-robin to the least-loaded counselor allowed for this division.
    // Research: contact ≤5min = 21× more likely to qualify; after 24h the lead is cold.
    const now = Math.floor(Date.now() / 1000);
    let slaTaskId: string | null = null;
    try {
      const assigneeId = await pickCounselorForDivision(db, data.division);
      if (assigneeId) {
        slaTaskId = crypto.randomUUID();
        await createAssignmentTask(db, {
          taskId: slaTaskId,
          clientId: token,
          engagementId,
          assigneeId,
          title: `⏱ Reach out to ${data.name} (${data.division.toUpperCase()}) within 15 min`,
          description: `New lead ${token} — contact via phone/WhatsApp immediately. Context: division ${data.division}, qualification ${data.highestQualification}.`,
          priority: 'high',
          dueInSeconds: 15 * 60,
          now
        });
      }
    } catch (slaErr: any) {
      // SLA task must never block lead capture — log and continue.
      console.error('lead SLA task failed', slaErr?.message);
    }

    // Funnel auto-scoring at intake (Section 26.2.1) — seed interaction points, then award
    // intent-driven signals the lead gave us in the form so the MQL band is meaningful day-one.
    const intentSignals: { interactionCode: string; points: number; description: string }[] = [
      { interactionCode: 'website_lead_form', points: 10, description: 'Website lead form submitted' },
    ];
    const ctx = data.dynamicContext || {};
    if (ctx.targetCountry) intentSignals.push({ interactionCode: 'destination_specified', points: 10, description: 'Target country specified' });
    if (ctx.budget) intentSignals.push({ interactionCode: 'budget_given', points: 15, description: 'Budget provided' });
    if (ctx.intakeSeason) intentSignals.push({ interactionCode: 'intake_started', points: 5, description: 'Intake season specified' });

    // Partner affiliate interlock (Section 39): ?ref=OPUS-XX on intake creates the
    // referral record + an UNMATURED commission ledger entry + partner_referral score.
    // Commission matures only when this lead becomes a signed customer (agreements/sign).
    let referralId: string | null = null;
    let referredPartnerId: string | null = null;
    if (data.refCode) {
      try {
        const partner = await db.select().from(partners)
          .where(eq(partners.referralCode, data.refCode.trim())).get();
        if (partner && partner.status === 'active') {
          const rid = crypto.randomUUID();
          await db.insert(referrals).values({
            id: rid,
            partnerId: partner.id,
            clientId: token,
            commissionRate: 5,
            createdAt: now,
          });
          await db.insert(commissionLedger).values({
            id: crypto.randomUUID(),
            referralId: rid,
            amount: 0, // matured later in agreements/sign
            status: 'unmatured',
            createdAt: now,
          });
          referralId = rid;
          referredPartnerId = partner.id;
          intentSignals.push({ interactionCode: 'partner_referral', points: 15, description: 'Referral from partner' });
          // Thrive: referral_linked loyalty points (10% of 0 = 0; flat sign points
          // come at agreement; here we just record the activity marker).
          await accruePartnerPoints({ env: c.env as any, partnerId: partner.id, reason: 'referral_linked', referenceKey: token, amountPaise: 0 }).catch(() => {});
        }
      } catch (refErr: any) {
        console.error('lead referral link failed', refErr?.message);
      }
    }

    // Seed the points catalog once (idempotent), then award events for each signal.
    try {
      const existingCatalog = await db.select().from(interactionPoints).all();
      if (existingCatalog.length === 0) {
        for (const s of intentSignals) {
          await db.insert(interactionPoints).values({ code: s.interactionCode, points: s.points, description: s.description }).onConflictDoNothing();
        }
      }
      for (const s of intentSignals) {
        await db.insert(scoringEvents).values({
          id: crypto.randomUUID(),
          clientId: token,
          interactionCode: s.interactionCode,
          points: s.points,
          source: 'lead-form',
          createdAt: now,
        });
      }
    } catch (scoreErr: any) {
      // Scoring must never break lead capture — log and continue.
      console.error('lead auto-scoring failed', scoreErr?.message);
    }

    // Audit: lead capture is the funnel entry event (guest actor, IP recorded).
    await auditEvent(c, {
      action: 'LEAD_CREATED',
      entityName: 'clients',
      entityId: token,
      afterState: {
        division: data.division, leadSource: data.leadSource || 'website',
        referralId, slaTaskId,
        points: intentSignals.reduce((a, s) => a + s.points, 0),
      },
    });

    return c.json({
      success: true,
      token,
      points_awarded: intentSignals.reduce((a, s) => a + s.points, 0),
      referralId,
      referredPartnerId,
      slaTaskId,
      message: "Lead captured and tracking token provisioned."
    });
  } catch (error: any) {
    return c.json({
      error: "Database insertion failed",
      details: error.message
    }, 500);
  }
});

leadsRouter.get('/status', async (c) => {
  const phone = c.req.query('phone');
  const token = c.req.query('token');

  if (!phone || !token) {
    return c.json({ error: "Missing phone or token parameters" }, 400);
  }

  if (!c.env || !c.env.DB) {
    return c.json({ error: "DB not available" }, 500);
  }

  const db = getDb(c.env.DB);

  try {
    const clientRecord = await db.select().from(clients).where(and(eq(clients.id, token), eq(clients.phone, phone))).get();

    if (!clientRecord) {
      return c.json({ error: "No matching application found" }, 404);
    }

    const activeEngagements = await db.select().from(engagements).where(eq(engagements.clientId, token));

    return c.json({
      success: true,
      name: clientRecord.name,
      token: clientRecord.id,
      engagements: activeEngagements
    });
  } catch (error: any) {
    return c.json({ error: "Failed to fetch status", details: error.message }, 500);
  }
});

