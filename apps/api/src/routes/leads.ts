import { resolveClientByToken } from '../lib/clientToken.js';
import { newPortalToken } from '../lib/clientToken.js';
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { leadIntakeSchema } from '@opusos/shared';
import { getDb } from '../db/client.js';
import { planSequence } from './nurture.js';
import { clients, consents, engagements, interactionPoints, scoringEvents, partners, referrals, commissionLedger, communications } from '../db/schema.js';
import { and, eq } from 'drizzle-orm';
import { rateLimit } from '../middleware/rateLimit.js';
import { pickCounselorForDivision, createAssignmentTask } from '../services/leadAssignment.js';
import { ensurePipelineStages } from '../db/seed.js';
import { accruePartnerPoints } from '../services/partnerLoyalty.js';
import { auditEvent } from '../middleware/audit.js';
import { isDivisionEnabled } from '../lib/divisions.js';
import { dispatchWebhookEvent, safeExecutionCtx } from '../lib/webhookDispatcher.js';
import { mauticSyncContact } from '../infra/mautic.js';

export const leadsRouter = new Hono<{ Bindings: { DB: D1Database; N8N_WEBHOOK_URL?: string; N8N_WEBHOOK_SECRET?: string } }>();

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
  const token = `OP-2026-${Math.floor(1000 + Math.random() * 9000)}`; // display id
  const portalToken = newPortalToken(); // 128-bit portal credential

  try {
    // F3 (Workflow Audit 2026-08-12): identity integrity — a second lead on
    // the same phone number is rejected, never duplicated (best-effort guard;
    // intake races are bounded by the turnstile + rate limit).
    const dup = await db.select().from(clients).where(eq(clients.phone, data.phone)).get().catch(() => undefined);
    if (dup) {
      return c.json({ error: 'A client with this phone number already exists', code: 'duplicate_phone', existingClientId: dup.id }, 409);
    }

    // Division availability kill-switch (docs/division-availability.md):
    // intake is captured only for divisions the business can serve today.
    // Server-side evaluation — never UI-only.
    if (!(await isDivisionEnabled(c.env, data.division))) {
      return c.json({ error: 'This service is not accepting leads yet', code: 'DIVISION_DISABLED' }, 409);
    }

    // Insert client (persist lead source + intake context for funnel scoring/qualification)
    await db.insert(clients).values({
      id: token,
      portalToken,
      name: data.name,
      phone: data.phone,
      email: data.email,
      highestQualification: data.highestQualification,
      leadSource: data.leadSource || 'website',
      intakeContext: data.dynamicContext ? JSON.stringify(data.dynamicContext) : null,
      // Declared interest: the lead form's division select is the primary
      // marketing-intent signal (nurture targeting, Wave 4).
      intentDivisions: data.division ? JSON.stringify([data.division]) : null,
      primaryDivision: data.division || null,
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
title: `Reach out to ${data.name} (${data.division.toUpperCase()}) within 15 min`,
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

    // Asynchronously dispatch lead.created event to n8n Orchestration Core
    dispatchWebhookEvent(
      c.env,
      'lead.created',
      {
        clientId: token,
        name: data.name,
        phone: data.phone,
        email: data.email,
        division: data.division,
        highestQualification: data.highestQualification,
        leadSource: data.leadSource || 'website',
        dynamicContext: data.dynamicContext || {},
        consents: {
          coreProcessing: true,
          whatsappUpdates: true,
          marketingCampaigns: true,
        },
        referralId,
        slaTaskId,
        totalPoints: intentSignals.reduce((a, s) => a + s.points, 0),
      },
      safeExecutionCtx(c)
    );

    // Sync to Mautic (Async / Fail-Open) to trigger automated marketing journeys
    const leadPoints = intentSignals.reduce((a, s) => a + s.points, 0) || 20;
    mauticSyncContact(c.env as any, {
      email: data.email,
      firstname: data.name,
      phone: data.phone,
      points: leadPoints,
      division: data.division,
      tags: [data.division, data.leadSource || 'website', leadPoints >= 50 ? 'hot' : leadPoints >= 20 ? 'warm' : 'cold'],
    }).catch(() => {});

    return c.json({
      success: true,
      token: portalToken,
      points_awarded: leadPoints,
      referralId,
      referredPartnerId,
      slaTaskId,
      message: "Lead captured and tracking token provisioned."
    });
  } catch (error: any) {
    return c.json({
      error: "Database insertion failed",
      
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
    const clientRecord = await resolveClientByToken(db, token);
    if (clientRecord && clientRecord.phone !== phone) return c.json({ error: 'Invalid token or phone' }, 404);

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
    return c.json({ error: "Failed to fetch status",  }, 500);
  }
});

// ============================================================================
// EXPRESS LEAD INTAKE (HIGH-CONVERTING FUNNELS & INTERACTIVE WIDGETS)
// Rapid 3-field capture with auto phone sanitization & duplicate reconnection.
// ============================================================================
const expressLeadSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  phone: z.string().min(7, "Phone number is required"),
  email: z.string().email("Valid email is required").optional().or(z.literal('')),
  division: z.enum(['study-abroad', 'visa', 'umrah', 'attestation', 'manpower']),
  goal: z.string().optional(),
  targetCountry: z.string().optional(),
  refCode: z.string().optional(),
  highestQualification: z.enum(['highschool', 'undergrad', 'postgrad']).optional(),
  context: z.record(z.any()).optional(),
  leadSource: z.string().optional(),
});

function normalizePhone(input: string): string {
  const digits = input.replace(/\D/g, '');
  if (digits.length === 10) {
    return `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`;
  }
  if (digits.length === 12 && digits.startsWith('91')) {
    const raw = digits.slice(2);
    return `+91 ${raw.slice(0, 5)} ${raw.slice(5)}`;
  }
  if (input.startsWith('+')) {
    return input.trim();
  }
  return `+91 ${digits.slice(0, 5)} ${digits.slice(5, 10)}`;
}

leadsRouter.post('/express', zValidator('json', expressLeadSchema), async (c) => {
  const data = c.req.valid('json');

  if (!c.env || !c.env.DB) {
    return c.json({
      success: true,
      token: "OP-2026-EXPRESS",
      message: "Lead received. Demo mode active."
    });
  }

  const db = getDb(c.env.DB);
  const formattedPhone = normalizePhone(data.phone);
  const userEmail = data.email && data.email.trim() !== '' ? data.email.trim() : `lead-${Date.now()}@inquiry.opusoverseas.com`;

  try {
    // Check if client already exists by phone
    const existing = await db.select().from(clients).where(eq(clients.phone, formattedPhone)).get().catch(() => undefined);

    if (existing) {
      // Connect new inquiry to existing client record
      const now = Math.floor(Date.now() / 1000);
      const existingEngagements = await db.select().from(engagements).where(and(eq(engagements.clientId, existing.id), eq(engagements.division, data.division))).get().catch(() => undefined);

      if (!existingEngagements) {
        await db.insert(engagements).values({
          id: crypto.randomUUID(),
          clientId: existing.id,
          division: data.division,
          title: data.goal ? `${data.division}: ${data.goal}` : `Express Inquiry — ${data.division}`,
          stageKey: 'lead',
          outstandingBalance: 0,
          status: 'active',
          createdAt: now,
          updatedAt: now,
        }).catch(() => {});
      }

      await db.insert(communications).values({
        id: crypto.randomUUID(),
        clientId: existing.id,
        channel: 'note',
        direction: 'incoming',
        subject: `Express Funnel Inquiry: ${data.goal || data.division}`,
        body: `Source: ${data.leadSource || 'interactive_widget'} · ${JSON.stringify({ ...data.context, targetCountry: data.targetCountry, goal: data.goal })}`,
        createdAt: now,
      }).catch(() => {});

      return c.json({
        success: true,
        token: existing.portalToken || existing.id,
        isExisting: true,
        message: "Welcome back! Your inquiry has been connected to your existing Opus profile."
      });
    }

    // Provision fresh client token
    const token = `OP-2026-${Math.floor(1000 + Math.random() * 9000)}`; // display id
    const portalToken = newPortalToken();
    const now = Math.floor(Date.now() / 1000);

    await db.insert(clients).values({
      id: token,
      name: data.name.trim(),
      phone: formattedPhone,
      email: userEmail,
      highestQualification: data.highestQualification || 'undergrad',
      leadSource: data.leadSource || 'express_funnel',
      intakeContext: JSON.stringify({ ...data.context, targetCountry: data.targetCountry, goal: data.goal }),
      intentDivisions: JSON.stringify([data.division]),
      primaryDivision: data.division,
      createdAt: now,
      updatedAt: now,
    });

    const ipAddress = c.req.header('x-real-ip') || c.req.header('cf-connecting-ip') || '127.0.0.1';

    // Insert standard DPDP-2023 core-processing consent
    await db.insert(consents).values({
      id: crypto.randomUUID(),
      clientId: token,
      consentType: 'core-processing',
      status: 'granted',
      ipAddress,
      sha256Hash: 'express_consent_v1',
      grantedAt: now,
    });

    // Create active engagement
    await db.insert(engagements).values({
      id: crypto.randomUUID(),
      clientId: token,
      division: data.division,
      title: data.goal ? `${data.division}: ${data.goal}` : `Express Inquiry — ${data.division}`,
      stageKey: 'lead',
      outstandingBalance: 0,
      status: 'active',
      createdAt: now,
      updatedAt: now,
    });

    return c.json({
      success: true,
      token,
      isExisting: false,
      message: "Your inquiry and profile have been created. An Opus senior advisor is assigned to your case."
    });
  } catch (err: any) {
    return c.json({ error: "Lead processing error", details: err.message }, 500);
  }
});


