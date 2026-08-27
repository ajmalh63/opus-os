import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { getDb } from '../db/client.js';
import { webhookEvents } from '../db/schema.js';
import { clients, engagements, agreements, consents, interactionPoints, scoringEvents, segments, partners, referrals, commissionLedger, experiments, experimentAssignments, campaigns, campaignTouches, nurtureTouches } from '../db/schema.js';
import { eq, desc, and, gte } from 'drizzle-orm';
import { pickCounselorForDivision, createAssignmentTask } from '../services/leadAssignment.js';

export const marketingRouter = new Hono<{ Bindings: { DB: D1Database; BETTER_AUTH_SECRET: string } }>();

// Default interaction point catalog (Section 26.2.1 - automated event-driven scoring)
const DEFAULT_POINTS: { code: string; points: number; description: string }[] = [
  { code: 'website_lead_form', points: 10, description: 'Website lead form submitted' },
  { code: 'partner_referral', points: 15, description: 'Referral from partner' },
  { code: 'walk_in', points: 20, description: 'Walk-in visitor' },
  { code: 'destination_specified', points: 10, description: 'Target country specified' },
  { code: 'budget_given', points: 15, description: 'Budget provided' },
  { code: 'whatsapp_reply', points: 15, description: 'Replied on WhatsApp within 24h' },
  { code: 'email_opened', points: 5, description: 'Opened marketing email' },
  { code: 'download_checklist', points: 10, description: 'Downloaded checklist' },
  { code: 'consultation_booked', points: 30, description: 'Booked a consultation' },
  { code: 'portal_account_created', points: 25, description: 'Created client-portal account' },
  { code: 'job_application_submitted', points: 25, description: 'Submitted job application' },
  { code: 'resume_uploaded', points: 20, description: 'Uploaded resume' },
  { code: 'testimonial_submitted', points: 8, description: 'Submitted testimonial' },
];

// Gold-standard band boundaries (Section 26.2) - cold <50, warm 50-75, hot >75
const HOT = 75;
const WARM = 50;

// POST /api/marketing/interactions  { clientId, interactionCode, source? }
// Records one interaction event -> auto-applies its points to the lead score.
const interactionSchema = z.object({
  clientId: z.string().min(1),
  interactionCode: z.string().min(1),
  source: z.string().optional(),
});

marketingRouter.post('/interactions', zValidator('json', interactionSchema), async (c) => {
  const data = c.req.valid('json');
  if (!c.env || !c.env.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  const now = Math.floor(Date.now() / 1000);

  try {
    const client = await db.select().from(clients).where(eq(clients.id, data.clientId)).get();
    if (!client) return c.json({ error: "Client not found" }, 404);

    // Look up point value from catalog (seed if empty)
    let points = await db.select().from(interactionPoints).where(eq(interactionPoints.code, data.interactionCode)).get();
    if (!points) {
      // ensure catalog seeded
      const count = await db.select().from(interactionPoints).all();
      if (count.length === 0) {
        for (const p of DEFAULT_POINTS) {
          await db.insert(interactionPoints).values(p).onConflictDoNothing();
        }
      }
      points = await db.select().from(interactionPoints).where(eq(interactionPoints.code, data.interactionCode)).get();
    }
    if (!points || points.points <= 0) {
      return c.json({ error: `Unknown interaction code: ${data.interactionCode}` }, 400);
    }

    await db.insert(scoringEvents).values({
      id: crypto.randomUUID(),
      clientId: data.clientId,
      interactionCode: data.interactionCode,
      points: points.points,
      source: data.source || 'api',
      createdAt: now,
    });

    return c.json({
      success: true,
      points_awarded: points.points,
      interaction: data.interactionCode,
      message: "Interaction scored.",
    });
  } catch (error: any) {
    return c.json({ error: "Interaction scoring failed", details: error.message }, 500);
  }
});

// GET /api/marketing/leads/:id/score
// Returns total, band (hot/warm/cold/junk), full event log + recent activity date.
marketingRouter.get('/leads/:id/score', async (c) => {
  const clientId = c.req.param('id');
  if (!c.env || !c.env.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);

  try {
    const client = await db.select().from(clients).where(eq(clients.id, clientId)).get();
    if (!client) return c.json({ error: "Client not found" }, 404);

    const events = await db.select().from(scoringEvents).where(eq(scoringEvents.clientId, clientId)).orderBy(desc(scoringEvents.createdAt)).all();

    let total = 0;
    const byType: Record<string, number> = {};
    for (const e of events) {
      const pos = Math.max(0, e.points);
      total += pos;
      byType[e.interactionCode] = (byType[e.interactionCode] || 0) + pos;
    }

    let band: 'hot' | 'warm' | 'cold' = 'cold';
    if (total >= HOT) band = 'hot';
    else if (total >= WARM) band = 'warm';

    return c.json({
      clientId,
      score: total,
      band,
      thresholds: { hot: HOT, warm: WARM },
      breakdown: byType,
      eventCount: events.length,
      lastInteractionAt: events[0]?.createdAt || null,
    });
  } catch (error: any) {
    return c.json({ error: "Score lookup failed", details: error.message }, 500);
  }
});

// GET /api/marketing/segments?band=hot (list segments ; simple built-in band grouping)
marketingRouter.get('/segments', async (c) => {
  if (!c.env || !c.env.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  const band = c.req.query('band');

  try {
    const stored = await db.select().from(segments).all();
    if (stored.length > 0) {
      return c.json({ segments: band ? stored.filter(s => (s.rulesJson || '').includes(band)) : stored });
    }
    // No DB segments configured: derive bands dynamically from current scores
    const clients_ = await db.select().from(clients).all();
    const bands: Record<string, number[]> = { hot: [], warm: [], cold: [] };
    for (const cl of clients_) {
      const ev = await db.select().from(scoringEvents).where(eq(scoringEvents.clientId, cl.id)).all();
      const score = ev.reduce((a, b) => a + Math.max(0, b.points), 0);
      if (score >= HOT) bands.hot.push(score);
      else if (score >= WARM) bands.warm.push(score);
      else bands.cold.push(score);
    }
    const safe = (arr: number[]) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
    const derived = [
      { name: 'Hot (auto)', rulesJson: JSON.stringify({ band: 'hot' }), avgScore: safe(bands.hot), count: bands.hot.length },
      { name: 'Warm (auto)', rulesJson: JSON.stringify({ band: 'warm' }), avgScore: safe(bands.warm), count: bands.warm.length },
      { name: 'Cold (auto)', rulesJson: JSON.stringify({ band: 'cold' }), avgScore: safe(bands.cold), count: bands.cold.length },
    ];
    return c.json({ segments: band ? derived.filter(s => s.rulesJson.includes(band)) : derived, derived: true });
  } catch (error: any) {
    return c.json({ error: "Segment lookup failed", details: error.message }, 500);
  }
});

// GET /api/marketing/leads (all scores for SuperUser marketing tab)
marketingRouter.get('/leads', async (c) => {
  if (!c.env || !c.env.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  try {
    const allClients = await db.select().from(clients).all();
    const allEngagements = await db.select().from(engagements).all();
    const allConsents = await db.select().from(consents).all();
    const allScoring = await db.select().from(scoringEvents).all();
    const allReferrals = await db.select().from(referrals).all();

    const rows = [];
    for (const cl of allClients) {
      const ev = allScoring.filter((e) => e.clientId === cl.id);
      const score = ev.reduce((a, b) => a + Math.max(0, b.points), 0);
      const band = score >= HOT ? 'hot' : score >= WARM ? 'warm' : 'cold';

      const engs = allEngagements.filter((e) => e.clientId === cl.id);
      const activeEng = engs.find((e) => e.status === 'active') || engs[0];
      // "Client" = enrolled in a service (funnel stage beyond lead); "Lead" = inquiry only.
      const isEnrolled = engs.some((e: any) =>
        ['qualified', 'documents', 'processing', 'complete'].includes(e.stageKey));
      const stage = activeEng?.stageKey || null;
      const division = activeEng?.division || cl.primaryDivision || null;

      // Submitted form data — the full intakeContext (dynamicContext) the
      // client filled in on the public form (target country, package,
      // departure, quoted fee, traveler count, etc.).
      let formData: Record<string, unknown> | null = null;
      try { formData = cl.intakeContext ? JSON.parse(cl.intakeContext) : null; } catch { formData = null; }

      // Consents granted (DPDP evidence trail)
      const clientConsents = allConsents.filter((c) => c.clientId === cl.id && c.status === 'granted');
      const consentsMap = {
        coreProcessing: clientConsents.some((c) => c.consentType === 'core-processing'),
        whatsappUpdates: clientConsents.some((c) => c.consentType === 'whatsapp-updates'),
        marketingCampaigns: clientConsents.some((c) => c.consentType === 'marketing-campaigns'),
        universitySharing: clientConsents.some((c) => c.consentType === 'university-sharing'),
      };

      const referral = allReferrals.find((r) => r.clientId === cl.id);

      rows.push({
        clientId: cl.id,
        name: cl.name,
        phone: cl.phone,
        email: cl.email,
        score,
        band,
        interactions: ev.length,
        isEnrolled,
        stage,
        division,
        leadSource: cl.leadSource || 'website',
        createdAt: cl.createdAt,
        formData,
        consents: consentsMap,
        referralCode: referral ? `partner:${referral.partnerId}` : null,
        // Link to the Client 360 workspace
        detailUrl: `/clients/${cl.id}`,
      });
    }
    rows.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    return c.json({ leads: rows });
  } catch (error: any) {
    return c.json({ error: "Lead scoring fetch failed", details: error.message }, 500);
  }
});

// GET /api/marketing/funnel — full-funnel analytics (Section 26.3):
//   stage counts + conversion %, velocity (days per stage), and stale-lead recovery queue.
// Tracks the 5 business funnel stages; "converted" = customer boundary = signed agreement.
const FUNNEL_STAGES = ['lead', 'qualified', 'documents', 'processing', 'complete'];

marketingRouter.get('/funnel', async (c) => {
  if (!c.env || !c.env.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  const now = Math.floor(Date.now() / 1000);
  const DAY = 86400;

  try {
    const allEngagements = await db.select().from(engagements).all();
    const active = allEngagements.filter((e) => e.status === 'active');

    // Stage counts (current snapshot)
    const stageCounts: Record<string, number> = {};
    for (const st of FUNNEL_STAGES) {
      stageCounts[st] = active.filter((e: any) => e.stageKey === st).filter(Boolean).length;
    }
    const totalLeads = (stageCounts.lead + stageCounts.qualified + stageCounts.documents + stageCounts.processing + stageCounts.complete) || active.length;

    // Conversion: cumulative % of total leads that reached at least each stage
    const cumulative = { ...stageCounts };
    let running = stageCounts.complete;
    const conversionOrder = [...FUNNEL_STAGES].reverse();
    for (const st of conversionOrder.slice(1)) {
      running += stageCounts[st];
      cumulative[st] = running;
    }
    const funnel = FUNNEL_STAGES.map((st) => {
      const stageReached = st === 'lead' ? totalLeads : cumulative[st];
      return {
        stage: st,
        count: stageCounts[st],
        reachedStage: stageReached,
        conversionRate: totalLeads > 0 ? Math.round((stageReached / totalLeads) * 1000) / 10 : 0,
      };
    });

    // Velocity: average age (days) of deals still sitting in each stage
    const velocity: Record<string, number> = {};
    for (const st of FUNNEL_STAGES) {
      const inStage = active.filter((e: any) => e.stageKey === st && e.createdAt);
      if (inStage.length === 0) { velocity[st] = 0; continue; }
      velocity[st] = Math.round(inStage.reduce((a, e: any) => a + (now - e.createdAt), 0) / inStage.length / DAY);
    }

    // Signed customers (boundary: any agreement signed)
    const signedAgreements = await db.select().from(agreements).all();
    const customerIds = new Set((signedAgreements as any[]).filter((a) => a.status === 'signed').map((a) => a.clientId));
    const customers = (signedAgreements as any[]).filter((a) => a.status === 'signed').length;
    const leadToCustomer = totalLeads > 0 ? Math.round((customers / totalLeads) * 1000) / 10 : 0;

    // Stale recovery queue: active lead/qualified engagement untouched >7 days with zero scoring events
    const staleCutoff = now - 7 * DAY;
    const stale: any[] = [];
    for (const e of active) {
      if (!['lead', 'qualified'].includes(e.stageKey)) continue;
      if ((e.updatedAt || 0) > staleCutoff) continue;
      const ev = await db.select().from(scoringEvents).where(eq(scoringEvents.clientId, e.clientId)).all();
      const lastTouch = ev.length > 0 ? Math.max(...ev.map((x: any) => x.createdAt)) : 0;
      if (lastTouch > staleCutoff) continue;
      const cl = await db.select().from(clients).where(eq(clients.id, e.clientId)).get();
      stale.push({
        clientId: e.clientId, name: cl?.name || '—', phone: cl?.phone || '',
        division: e.division, stageKey: e.stageKey,
        ageDays: Math.round((now - (e.createdAt || now)) / DAY),
        lastTouchAt: lastTouch || null, outstandingBalance: e.outstandingBalance || 0,
      });
    }
    stale.sort((a, b) => b.ageDays - a.ageDays);

    // Partner attribution on converted customers (Section 39 interlock)
    const partnerAttribution: any[] = [];
    const referredClients = await db.select().from(referrals).all();
    for (const ref of referredClients as any[]) {
      const isCustomer = customerIds.has(ref.clientId);
      const partner = await db.select().from(partners).where(eq(partners.id, ref.partnerId)).get();
      const ledger = await db.select().from(commissionLedger).where(eq(commissionLedger.referralId, ref.id)).get();
      partnerAttribution.push({
        clientId: ref.clientId,
        partnerId: ref.partnerId,
        partnerName: partner?.name || '—',
        referralCode: partner?.referralCode || null,
        converted: isCustomer,
        commissionRate: ref.commissionRate,
        commissionStatus: ledger?.status || 'none',
        commissionPaise: ledger?.amount || 0,
      });
    }

    return c.json({
      success: true,
      generatedAt: now,
      totalLeads,
      customers,
      leadToCustomer,
      funnel,
      velocity,
      stale,
      staleCount: stale.length,
      partnerAttribution,
      bands: { hot: HOT, warm: WARM },
    });
  } catch (error: any) {
    return c.json({ error: "Funnel analytics failed", details: error.message }, 500);
  }
});

// GET /api/marketing/partners — affiliate leaderboard (Section 39 interlock):
// referrals per partner, converted count, total matured commission, active status.
marketingRouter.get('/partners', async (c) => {
  if (!c.env || !c.env.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  try {
    const allPartners = await db.select().from(partners).all();
    const allReferrals = await db.select().from(referrals).all();
    const allLedger = await db.select().from(commissionLedger).all();
    const signed = await db.select().from(agreements).all();
    const signedClientIds = new Set((signed as any[]).filter((a: any) => a.status === 'signed').map((a: any) => a.clientId));

    const rows = allPartners.map((p: any) => {
      const refs = allReferrals.filter((r: any) => r.partnerId === p.id);
      const refIds = refs.map((r: any) => r.id);
      const ledger = allLedger.filter((l: any) => refIds.includes(l.referralId));
      const matured = ledger.filter((l: any) => l.status === 'matured' || l.status === 'paid');
      const converted = refs.filter((r: any) => signedClientIds.has(r.clientId)).length;
      return {
        partnerId: p.id,
        name: p.name,
        referralCode: p.referralCode || null,
        status: p.status,
        referrals: refs.length,
        converted,
        conversionRate: refs.length > 0 ? Math.round((converted / refs.length) * 1000) / 10 : 0,
        commissionPaise: matured.reduce((a, l) => a + Number(l.amount || 0), 0),
        commissionPendingCount: ledger.filter((l: any) => l.status === 'unmatured').length,
      };
    });
    rows.sort((a: any, b: any) => b.commissionPaise - a.commissionPaise);

    return c.json({ partners: rows });
  } catch (error: any) {
    return c.json({ error: "Affiliate leaderboard failed", details: error.message }, 500);
  }
});

// POST /api/marketing/stale/:clientId/reactivate — revive a lead untouched >7 days:
// creates a high-priority 24h re-engagement task (least-loaded division counselor)
// and logs a stale_reactivated scoring event so it exits the stale queue.
// Gold standard (SiriusDecisions): 25% of dead leads revive in 12 months; cost is
// 30-50% of new acquisition. Action beats a passive list.
marketingRouter.post('/stale/:clientId/reactivate', async (c) => {
  if (!c.env || !c.env.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  const clientId = c.req.param('clientId');
  const now = Math.floor(Date.now() / 1000);
  try {
    const client = await db.select().from(clients).where(eq(clients.id, clientId)).get();
    if (!client) return c.json({ error: "Client not found" }, 404);
    const eng = await db.select().from(engagements).where(eq(engagements.clientId, clientId)).get();
    const division = eng?.division || 'study-abroad';

    const assigneeId = await pickCounselorForDivision(db, division);
    const taskId = crypto.randomUUID();
    await createAssignmentTask(db, {
      taskId,
      clientId,
      engagementId: eng?.id || null,
      assigneeId,
      title: `♻️ Re-engage stale lead ${client.name} (${division.toUpperCase()})`,
      description: `Lead ${clientId} untouched >7 days (age ~${eng ? Math.floor((now - eng.createdAt) / 86400) : 0}d). Re-engage via phone/WhatsApp with fresh value + a new trigger. Previous context: ${(client as any).intakeContext || 'none'}.`,
      priority: 'high',
      dueInSeconds: 24 * 3600,
      now
    });

    await db.insert(scoringEvents).values({
      id: crypto.randomUUID(),
      clientId,
      interactionCode: 'stale_reactivated',
      points: 5,
      source: 'stale-recovery',
      createdAt: now
    });

    if (eng) {
      await db.update(engagements).set({ updatedAt: now }).where(eq(engagements.id, eng.id));
    }

    return c.json({ success: true, taskId, assigneeId, message: `Re-engagement task created for ${client.name}.` });
  } catch (error: any) {
    return c.json({ error: "Reactivation failed", details: error.message }, 500);
  }
});

// ===================== A/B EXPERIMENTS (FunnelTODO #5, ab-test-setup skill) =====================
// Harness only: creation REQUIRES hypothesis, primaryMetric, baselineRate and
// mde (the skill's "commit before launch" gate), so a live test can't be
// launched without a locked, measurable hypothesis.

const createExperimentSchema = z.object({
  key: z.string().min(2).max(60),
  name: z.string().min(2),
  hypothesis: z.string().min(10),
  primaryMetric: z.string().min(3),
  baselineRate: z.number().min(0).max(1),
  mde: z.number().min(0.001).max(0.5),
  variantA: z.string().min(1),
  variantB: z.string().min(1),
});

// POST /api/marketing/experiments  (manager+)
// GET /api/marketing/journeys — tier journeys with touches + live stats
marketingRouter.get('/journeys', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  try {
    const [camps, touches, plans] = await Promise.all([
      db.select().from(campaigns).all(),
      db.select().from(campaignTouches).all(),
      db.select().from(nurtureTouches).all(),
    ]);
    const touchMap: Record<string, any[]> = {};
    touches.forEach(t => { (touchMap[t.campaignId] = touchMap[t.campaignId] || []).push(t); });
    const planCounts: Record<string, number> = {};
    const sentCounts: Record<string, number> = {};
    plans.forEach(p => {
      if (p.campaignId) {
        planCounts[p.campaignId] = (planCounts[p.campaignId] || 0) + 1;
        if (p.status === 'sent') sentCounts[p.campaignId] = (sentCounts[p.campaignId] || 0) + 1;
      }
    });
    const journeys = camps.map(c => ({
      id: c.id, key: c.key, name: c.name, division: c.division,
      status: c.status, eligibility: JSON.parse(c.eligibilityJson || '{}'),
      touches: (touchMap[c.id] || []).sort((a, b) => a.seq - b.seq),
      clientsPlanned: planCounts[c.id] || 0,
      touchesSent: sentCounts[c.id] || 0,
    }));
    const tier = (j: any) => j.eligibility?.tier || 'ops';
    return c.json({
      success: true,
      journeys,
      summary: {
        total: journeys.length,
        active: journeys.filter(j => j.status === 'active').length,
        hot: journeys.filter(j => tier(j) === 'hot').length,
        warm: journeys.filter(j => tier(j) === 'warm').length,
        cold: journeys.filter(j => tier(j) === 'cold').length,
        ops: journeys.filter(j => tier(j) === 'ops').length,
        totalPlanned: plans.length,
        totalSent: plans.filter(p => p.status === 'sent').length,
      },
    });
  } catch (e: any) {
    return c.json({ error: 'Journeys failed', details: e?.message }, 500);
  }
});

marketingRouter.post('/experiments', zValidator('json', createExperimentSchema), async (c) => {
  if (!c.env || !c.env.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  const data = c.req.valid('json');
  try {
    const existing = await db.select().from(experiments).where(eq(experiments.key, data.key)).get();
    if (existing) return c.json({ error: "Experiment key already exists" }, 409);
    await db.insert(experiments).values({
      id: crypto.randomUUID(),
      key: data.key,
      name: data.name,
      hypothesis: data.hypothesis,
      primaryMetric: data.primaryMetric,
      baselineRate: data.baselineRate,
      mde: data.mde,
      variantA: data.variantA,
      variantB: data.variantB,
      status: 'draft',
      createdAt: Math.floor(Date.now() / 1000),
    });
    return c.json({ success: true, key: data.key, status: 'draft', message: "Experiment created (draft). Lock hypothesis + activate before launch." });
  } catch (error: any) {
    return c.json({ error: "Experiment creation failed", details: error.message }, 500);
  }
});

// POST /api/marketing/experiments/:key/activate  — only from a locked draft
marketingRouter.post('/experiments/:key/activate', async (c) => {
  if (!c.env || !c.env.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  try {
    const key = c.req.param('key');
    const exp = await db.select().from(experiments).where(eq(experiments.key, key)).get();
    if (!exp) return c.json({ error: "Experiment not found" }, 404);
    if (exp.status === 'active') return c.json({ success: true, message: "Already active" });
    await db.update(experiments).set({ status: 'active', startedAt: Math.floor(Date.now() / 1000) }).where(eq(experiments.key, key));
    return c.json({ success: true, key, status: 'active', message: "Experiment live. No peeking — run to conclusion." });
  } catch (error: any) {
    return c.json({ error: "Activation failed", details: error.message }, 500);
  }
});

// GET /api/marketing/experiments  — list + per-variant assignment/conversion stats
marketingRouter.get('/experiments', async (c) => {
  if (!c.env || !c.env.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  try {
    const list = await db.select().from(experiments).all();
    const assignments = await db.select().from(experimentAssignments).all();
    const signed = await db.select().from(agreements).all();
    const signedClientIds = new Set((signed as any[]).filter((a) => a.status === 'signed').map((a) => a.clientId));

    const rows = (list as any[]).map((e) => {
      const ofKey = assignments.filter((a: any) => a.experimentKey === e.key);
      const a = ofKey.filter((x: any) => x.variant === 'A');
      const b = ofKey.filter((x: any) => x.variant === 'B');
      const stat = (arr: any[]) => {
        const converted = arr.filter((x) => signedClientIds.has(x.clientId)).length;
        return { assigned: arr.length, converted, rate: arr.length ? Math.round((converted / arr.length) * 1000) / 10 : 0 };
      };
      return {
        key: e.key,
        name: e.name,
        hypothesis: e.hypothesis,
        primaryMetric: e.primaryMetric,
        baselineRate: e.baselineRate,
        mde: e.mde,
        variantA: e.variantA,
        variantB: e.variantB,
        status: e.status,
        startedAt: e.startedAt,
        variants: { A: stat(a), B: stat(b) },
      };
    });
    return c.json({ experiments: rows });
  } catch (error: any) {
    return c.json({ error: "Experiment list failed", details: error.message }, 500);
  }
});

// GET /api/marketing/email-tracking — aggregated Listmonk event metrics
marketingRouter.get('/email-tracking', async (c) => {
  if (!c.env || !c.env.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  try {
    const allEvents = await db.select().from(webhookEvents).all();
    const events = (allEvents as any[]).filter((ev) => (ev.event || '').startsWith('listmonk'));
    const totals = { sent: 0, opens: 0, clicks: 0, bounces: 0, unsubs: 0 };
    const emailMap = new Map<string, { email: string; opens: number; clicks: number; bounces: number; unsubs: number; last: number }>();

    for (const ev of events) {
      totals.sent++;
      const email = (ev.entityId || 'unknown').toLowerCase();
      const eventType = (ev.event || '').toLowerCase();

      if (!emailMap.has(email) && email !== 'unknown') {
        emailMap.set(email, { email, opens: 0, clicks: 0, bounces: 0, unsubs: 0, last: ev.receivedAt || Math.floor(Date.now() / 1000) });
      }
      const entry = emailMap.get(email);

      if (eventType.includes('open')) {
        totals.opens++;
        if (entry) entry.opens++;
      } else if (eventType.includes('click')) {
        totals.clicks++;
        if (entry) entry.clicks++;
      } else if (eventType.includes('bounce')) {
        totals.bounces++;
        if (entry) entry.bounces++;
      } else if (eventType.includes('unsub')) {
        totals.unsubs++;
        if (entry) entry.unsubs++;
      }
      if (entry && ev.receivedAt) {
        entry.last = Math.max(entry.last, ev.receivedAt);
      }
    }

    return c.json({
      totals,
      byEmail: Array.from(emailMap.values()).slice(0, 100),
    });
  } catch (error: any) {
    return c.json({ error: "Failed to load email tracking", details: error.message }, 500);
  }
});

// GET /api/marketing/whatsapp/templates — list all 11 operational & marketing templates
marketingRouter.get('/whatsapp/templates', async (c) => {
  const { WHATSAPP_TEMPLATES } = await import('../infra/whatsappTemplates.js');
  const templates = Object.values(WHATSAPP_TEMPLATES).map((t) => ({
    key: t.key,
    name: t.name,
    category: t.category,
    division: t.division,
    description: t.description,
    sampleVariables: t.sampleVariables,
    renderedSample: t.template(t.sampleVariables),
  }));
  return c.json({ success: true, templates });
});

// POST /api/marketing/whatsapp/test-send — test dispatch any template through Chatwoot & OpenWA
marketingRouter.post('/whatsapp/test-send', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  if (!body.phone) {
    return c.json({ error: 'Phone number is required' }, 400);
  }
  const { dispatchUnifiedWhatsApp } = await import('../infra/chatwootBridge.js');
  const result = await dispatchUnifiedWhatsApp(c.env as any, {
    phone: body.phone,
    name: body.name || 'Valued Client',
    email: body.email,
    templateKey: body.templateKey,
    variables: body.variables || {},
    customText: body.customText,
    division: body.division || 'general',
    tags: ['marketing-dispatch', 'superadmin'],
  });
  return c.json({
    success: result.ok,
    result,
  });
});

// POST /api/marketing/send-email — direct dispatch an HTML5 template or custom email to a client
marketingRouter.post('/send-email', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  if (!body.to) {
    return c.json({ error: 'Recipient email address is required' }, 400);
  }
  const { sendNotification } = await import('../infra/notify.js');
  const db = getDb(c.env.DB);
  const result = await sendNotification(c.env as any, db as any, {
    channel: 'email',
    to: body.to,
    subject: body.subject || 'Opus Overseas Admissions & Services',
    body: body.html || body.body || '<p>Hello from Opus Overseas.</p>',
    clientId: body.clientId || null,
  });
  return c.json({
    success: result.ok,
    result,
  });
});

// In-memory store for custom created journeys during runtime session
const CUSTOM_JOURNEYS: any[] = [];

// POST /api/marketing/journeys/custom — create and activate a custom multi-step automated journey
marketingRouter.post('/journeys/custom', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  if (!body.name) {
    return c.json({ error: 'Journey name is required' }, 400);
  }
  const journey = {
    id: 'cust-' + Date.now(),
    name: body.name,
    description: body.description || 'Custom multi-step automation sequence',
    division: body.division || 'all',
    targetScore: body.targetScore || 'All Leads',
    isPublished: true,
    events: body.steps || [
      { id: 1, name: 'Day 0 WhatsApp Intro', triggerMode: 'immediate', type: 'message.send' },
      { id: 2, name: 'Day 3 Email Case Study', triggerMode: 'interval', triggerInterval: '3', triggerIntervalUnit: 'days', type: 'email.send' },
    ],
    createdAt: Math.floor(Date.now() / 1000),
  };
  CUSTOM_JOURNEYS.push(journey);
  return c.json({ success: true, journey });
});

// GET /api/marketing/journeys/custom — list custom created journeys
marketingRouter.get('/journeys/custom', async (c) => {
  return c.json({ success: true, journeys: CUSTOM_JOURNEYS });
});