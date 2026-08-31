import { resolveClientByToken } from '../lib/clientToken.js';
import { Hono } from 'hono';
import { getDb } from '../db/client.js';
import { clients, jobPostings, manpowerDeployments, membershipPlans, tasks } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { auditEvent } from '../middleware/audit.js';
import { createStaffAlert } from '../infra/staffAlerts.js';
import { isDivisionEnabled } from '../lib/divisions.js';
import { manpowerFormSchema, missingManpowerSections } from '../validation/manpowerForm.js';
import { computeManpowerMatch, verifyTurnstileToken, calculateProfileCompleteness, MANPOWER_VAS_CATALOG } from '../lib/manpowerMatch.js';
import { manpowerApplicationSchema, manpowerVasOrderSchema, manpowerVasVerifySchema } from '@opusos/shared';

// Re-export for any dependent modules
export { MANPOWER_VAS_CATALOG };

// Client self-service Manpower surface (token = client.id).
// Mounted at /api/public/portal/manpower.
import { safeExecutionCtx } from '../lib/webhookDispatcher.js';
import { publishSyncEvent } from './sync.js';

export const portalManpowerRouter = new Hono<{
  Bindings: {
    DB: D1Database;
    BETTER_AUTH_SECRET: string;
    RAZORPAY_KEY_ID?: string;
    RAZORPAY_KEY_SECRET?: string;
    TURNSTILE_SECRET_KEY?: string;
  }
}>();

const RZR_BASE = 'https://api.razorpay.com/v1';

function basicAuth(c: { env: { RAZORPAY_KEY_ID?: string; RAZORPAY_KEY_SECRET?: string } }): string {
  const key = c.env.RAZORPAY_KEY_ID;
  const secret = c.env.RAZORPAY_KEY_SECRET;
  if (!key || !secret) throw new Error('Razorpay credentials not configured');
  return 'Basic ' + btoa(`${key}:${secret}`);
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a.charCodeAt(i) ^ b.charCodeAt(i));
  return diff === 0;
}

async function verifySignature(orderId: string, paymentId: string, signature: string, secret: string): Promise<boolean> {
  const body = `${orderId}|${paymentId}`;
  const enc = new TextEncoder();
  const keyData = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', keyData, enc.encode(body));
  const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return timingSafeEqualHex(hex, signature);
}

// Candidate Pass is active when the flag is set and (if an expiry exists) not past.
// NOTE: the legacy column name exclusive_member now semantically means
// 'active Candidate Pass holder' (₹100 lifetime Razorpay anti-spam pass).
function isMember(client: any, now: number): boolean {
  return !!client?.exclusiveMember && (!client.exclusiveExpiresAt || client.exclusiveExpiresAt > now);
}

// Seed the default plan once (idempotent) so the paywall is never empty.
// SINGLE-PLAN PAYWALL: only the ₹100 lifetime candidate-pass exists. The legacy
// exclusive-30/90/365 plans are discontinued and are no longer seeded.
export async function seedMembershipPlans(db: any) {
  const existing = await db.select().from(membershipPlans).all();
  const existingKeys = new Set(existing.map((p: any) => p.key));
  const now = Math.floor(Date.now() / 1000);
  const defaults = [
    {
      key: 'candidate-pass',
      name: 'Candidate Verification Pass',
      description: 'One-time anti-spam verification pass for lifetime access to browse and apply to unlimited overseas jobs.',
      pricePaise: 10000,
      durationDays: 36500,
      tier: 'verified_candidate',
      perksJson: JSON.stringify([
        'Lifetime access to all overseas job openings (Europe, Gulf, Asia)',
        'Apply to unlimited international job vacancies without recurring fees',
        'Direct resume upload to secure Cloudflare R2 Document Vault',
        'AI Candidate Profile matching with licensed global recruiters',
        'Real-time WhatsApp & Email interview scheduling alerts',
        'GST Tax Invoice (₹84.75 + 18% GST ₹15.25) sent to your inbox',
      ]),
      sortOrder: 0,
    },
  ];
  for (const p of defaults) {
    if (existingKeys.has(p.key)) continue;
    await db.insert(membershipPlans).values({ id: crypto.randomUUID(), ...p, active: true, createdAt: now, updatedAt: now }).onConflictDoNothing();
  }
}

// Maps a job row for the client portal. Non-members (no active Candidate Pass)
// get locked:true with the employer masked; pass holders get the full listing.
function publicJob(j: any, member: boolean) {
  const parse = (s: any) => { try { const a = JSON.parse(s || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } };
  return {
    id: j.id, title: j.title, country: j.country, sector: j.sector, salaryText: j.salaryText,
    collar: j.collar, description: j.description,
    employer: member ? j.employer : null,
    salaryMinPaise: j.salaryMinPaise, salaryMaxPaise: j.salaryMaxPaise, currency: j.currency,
    vacancies: j.vacancies, benefits: parse(j.benefitsJson), requirements: parse(j.requirementsJson),
    experienceYearsMin: j.experienceYearsMin, tradeCategory: j.tradeCategory,
    visaProvided: !!j.visaProvided, medicalRequired: !!j.medicalRequired, deadline: j.deadline,
    featured: !!j.featured, locked: !member, createdAt: j.createdAt,
  };
}

// GET /jobs — all open jobs are listed; employer details are masked for
// non-members (no active Candidate Pass), pass holders see the full listing.
portalManpowerRouter.get('/jobs', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  if (!(await isDivisionEnabled(c.env, 'manpower'))) return c.json({ success: true, jobs: [] });
  const db = getDb(c.env.DB);
  const now = Math.floor(Date.now() / 1000);
  try {
    // Token via query param OR X-Portal-Token header (portal UI sends the header —
    // header avoids portal tokens leaking into URLs/access logs).
    const token = c.req.query('token') || c.req.header('x-portal-token') || c.req.header('X-Portal-Token');
    let member = false;
    if (token) {
      const client = await resolveClientByToken(db, token);
      member = isMember(client, now);
    }
    const rows = await db.select().from(jobPostings)
      .where(eq(jobPostings.status, 'open'))
      .limit(Math.min(Math.max(Number(c.req.query('limit')) || 200, 1), 500))
      .all();
    return c.json({ success: true, jobs: rows.map((j: any) => publicJob(j, member)) });
  } catch (e: any) {
    return c.json({ error: 'Failed to fetch jobs', details: e?.message }, 500);
  }
});

// GET /membership?token= (or X-Portal-Token header) — membership status + plans for the paywall
portalManpowerRouter.get('/membership', async (c) => {
  const token = c.req.query('token') || c.req.header('x-portal-token') || c.req.header('X-Portal-Token');
  if (!token) return c.json({ error: 'token is required' }, 400);
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const now = Math.floor(Date.now() / 1000);
  try {
    // SINGLE-PLAN PAYWALL: only the candidate-pass plan is offered. Response
    // shape kept for frontend compatibility (enabled/comingSoon always on/now).
    await seedMembershipPlans(db);
    const client = await resolveClientByToken(db, token);
    if (!client) return c.json({ error: 'Client not found for token' }, 404);
    const plans = await db.select().from(membershipPlans).where(eq(membershipPlans.active, true)).all();
    plans.sort((a: any, b: any) => (a.sortOrder || 0) - (b.sortOrder || 0));
    const passPlans = plans.filter((p: any) => p.key === 'candidate-pass');
    return c.json({
      success: true,
      enabled: true,
      comingSoon: false,
      membership: {
        isMember: isMember(client, now),
        expiresAt: client.exclusiveExpiresAt,
        plan: client.exclusivePlan,
        since: client.exclusiveSince,
      },
      plans: passPlans.map((p: any) => ({
        key: p.key, name: p.name, description: p.description, pricePaise: p.pricePaise,
        durationDays: p.durationDays, tier: p.tier, perks: (() => { try { return JSON.parse(p.perksJson || '[]'); } catch { return []; } })(),
      })),
    });
  } catch (e: any) {
    return c.json({ error: 'Failed to fetch membership', details: e?.message }, 500);
  }
});

// POST /membership/order — create a Razorpay order for a membership plan
// Gold: TRUST — charge ONCE per client. candidate-pass is lifetime (36500d). Re-order when already verified is blocked.
portalManpowerRouter.post('/membership/order', async (c) => {
  if (!(await isDivisionEnabled(c.env, 'manpower'))) {
    return c.json({ error: 'This service is not accepting applications yet', code: 'DIVISION_DISABLED' }, 409);
  }
  const body = await c.req.json().catch(() => ({})) as { token?: string; planKey?: string };
  const { token, planKey } = body;
  if (!token || !planKey) return c.json({ error: 'token and planKey are required' }, 400);
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  // P1-4 fail-closed: never accept live-money orders against Razorpay TEST keys in production
  if ((c.env as any).ENVIRONMENT === 'production' && String(c.env.RAZORPAY_KEY_ID || '').startsWith('rzp_test')) {
    return c.json({ error: 'Payments are misconfigured for production (test key detected). Contact support.' }, 503);
  }
  if (!c.env.RAZORPAY_KEY_ID || !c.env.RAZORPAY_KEY_SECRET) {
    return c.json({ error: 'Razorpay not configured — set RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET' }, 503);
  }
  const db = getDb(c.env.DB);
  try {
    await seedMembershipPlans(db);
    const client = await resolveClientByToken(db, token);
    if (!client) return c.json({ error: 'Client not found for token' }, 404);
    const plan = await db.select().from(membershipPlans).where(and(eq(membershipPlans.key, planKey), eq(membershipPlans.active, true))).get();
    if (!plan) return c.json({ error: 'Plan not found or inactive' }, 404);
    // TRUST GUARD — tied to client ID, charge once: if already lifetime verified, reject with 409
    const nowChk = Math.floor(Date.now() / 1000);
    if (isMember(client, nowChk) && planKey === 'candidate-pass') {
      return c.json({ error: 'Already verified — lifetime access active. No further payment needed.', code: 'ALREADY_VERIFIED', expiresAt: client.exclusiveExpiresAt }, 409);
    }
    // For any plan other than candidate-pass (legacy rows), extension is allowed — but warn if <7d left
    // Idempotency: receipt is a deterministic short hash of token|planKey|hourBucket —
    // dedupes rapid double-clicks within the same hour. Razorpay caps receipt at 56 chars,
    // so the raw composite (32-char token + planKey + bucket) must be hashed short.
    const hourBucket = Math.floor(Date.now() / 3600000);
    const receiptHash = Array.from(
      new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${token}|${planKey}|${hourBucket}`)))
    ).map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 40);
    const rzRes = await fetch(`${RZR_BASE}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': basicAuth(c) },
      body: JSON.stringify({
        amount: plan.pricePaise,
        currency: 'INR',
        receipt: `memb_${receiptHash}`,
        notes: { clientId: client.id, portalToken: token, planKey, planName: plan.name },
        partial_payment: false,
      }),
    });
    if (!rzRes.ok) {
      const rzErr = await rzRes.text().catch(() => '');
      return c.json({ error: 'Razorpay order creation failed', details: rzErr }, 502);
    }
    const order = (await rzRes.json()) as { id: string; amount: number; currency: string };
    return c.json({ success: true, order_id: order.id, amount_paise: order.amount, currency: order.currency, key: c.env.RAZORPAY_KEY_ID, planKey });
  } catch (e: any) {
    return c.json({ error: 'Failed to create membership order', details: e?.message }, 500);
  }
});

// POST /membership/verify — verify Razorpay signature, then grant membership
// Gold: idempotent, tied to client.id, prevents replay/double-charge
portalManpowerRouter.post('/membership/verify', async (c) => {
  if (!(await isDivisionEnabled(c.env, 'manpower'))) {
    return c.json({ error: 'This service is not accepting applications yet', code: 'DIVISION_DISABLED' }, 409);
  }
  const body = await c.req.json().catch(() => ({})) as {
    token?: string; planKey?: string; razorpay_order_id?: string; razorpay_payment_id?: string; razorpay_signature?: string;
  };
  const { token, planKey, razorpay_order_id, razorpay_payment_id, razorpay_signature } = body;
  if (!token || !planKey || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return c.json({ error: 'Missing required payment fields' }, 400);
  }
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const secret = c.env.RAZORPAY_KEY_SECRET;
  if (!secret) return c.json({ error: 'Razorpay not configured' }, 503);
  const db = getDb(c.env.DB);
  const now = Math.floor(Date.now() / 1000);
  try {
    const ok = await verifySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature, secret);
    if (!ok) return c.json({ error: 'Signature mismatch — payment not confirmed' }, 403);

    const client = await resolveClientByToken(db, token);
    if (!client) return c.json({ error: 'Client not found for token' }, 404);
    const plan = await db.select().from(membershipPlans).where(eq(membershipPlans.key, planKey)).get();
    if (!plan) return c.json({ error: 'Plan not found' }, 404);

    // Idempotency: same paymentId replay → return existing grant, don't extend again
    // Check audit log for this paymentId (provider guarantees uniqueness per payment)
    try {
      const { auditLog } = await import('../db/schema.js');
      const existing = await db.select().from(auditLog).where(eq(auditLog.entityId, token)).all().catch(()=>[]) as any[];
      const dup = existing.find((a:any) => {
        try { const s = typeof a.afterState==='string'? JSON.parse(a.afterState): a.afterState; return s?.paymentId===razorpay_payment_id && a.action==='MEMBERSHIP_GRANTED'; } catch { return false; }
      });
      if (dup) {
        return c.json({ success: true, message: 'Membership already activated for this payment.', expiresAt: client.exclusiveExpiresAt, duplicate: true });
      }
    } catch {}

    // Trust guard: if already lifetime verified, don't extend on replay — return current
    if (isMember(client, now) && planKey === 'candidate-pass') {
      return c.json({ success: true, message: 'Already verified — lifetime access active.', expiresAt: client.exclusiveExpiresAt, alreadyVerified: true });
    }

    const base = isMember(client, now) && client.exclusiveExpiresAt ? client.exclusiveExpiresAt : now;
    const expiresAt = base + plan.durationDays * 86400;

    await db.update(clients).set({
      exclusiveMember: true,
      exclusiveExpiresAt: expiresAt,
      exclusivePlan: planKey,
      exclusiveSince: client.exclusiveSince || now,
      updatedAt: now,
    }).where(eq(clients.id, client.id));

    await auditEvent(c as any, {
      action: 'MEMBERSHIP_GRANTED', entityName: 'clients', entityId: client.id,
      afterState: { clientId: client.id, portalToken: token, planKey, paymentId: razorpay_payment_id, orderId: razorpay_order_id, expiresAt, amountPaise: plan.pricePaise },
    }).catch(() => {});

    await createStaffAlert(c.env as any, { division: 'manpower', type: 'membership_sale', title: `Membership purchased: ${plan.name}`, body: `${client.id} — expires ${new Date(expiresAt * 1000).toLocaleDateString()}`, clientId: client.id, payload: { planKey, expiresAt } });
    // P1-3 realtime: push to staff so the Candidate-Pass sale appears instantly
    const execCtx = safeExecutionCtx(c);
    execCtx?.waitUntil(
      publishSyncEvent(c.env as any, { channel: 'staff:global:manpower', type: 'MANPOWER_MEMBERSHIP_GRANTED', payload: { clientId: client.id, planKey, expiresAt } }, execCtx).catch(() => {})
    );
    return c.json({ success: true, message: 'Membership activated.', expiresAt });
  } catch (e: any) {
    return c.json({ error: 'Failed to verify membership payment', details: e?.message }, 500);
  }
});

// GET /vas-plans — optional value added career accelerator services
portalManpowerRouter.get('/vas-plans', async (c) => {
  return c.json({ success: true, plans: MANPOWER_VAS_CATALOG });
});

// POST /vas/order — create Razorpay order for optional career accelerator add-on
portalManpowerRouter.post('/vas/order', async (c) => {
  const body = await c.req.json().catch(() => ({})) as any;
  const parsed = manpowerVasOrderSchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Invalid VAS request', details: parsed.error.format() }, 400);
  }
  const { token, serviceKey } = parsed.data;
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  if (!c.env.RAZORPAY_KEY_ID || !c.env.RAZORPAY_KEY_SECRET) {
    return c.json({ error: 'Razorpay not configured' }, 503);
  }

  const vasItem = MANPOWER_VAS_CATALOG.find((s) => s.key === serviceKey);
  if (!vasItem) return c.json({ error: 'Selected career service not found' }, 404);

  const db = getDb(c.env.DB);
  const client = await resolveClientByToken(db, token);
  if (!client) return c.json({ error: 'Client profile not found' }, 404);

  try {
    const rzRes = await fetch(`${RZR_BASE}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': basicAuth(c) },
      body: JSON.stringify({
        amount: vasItem.pricePaise,
        currency: 'INR',
        receipt: `vas_${serviceKey.slice(0, 5)}_${Date.now().toString(36)}`,
        notes: { clientId: token, serviceKey, title: vasItem.title },
        partial_payment: false,
      }),
    });
    if (!rzRes.ok) {
      const errTxt = await rzRes.text().catch(() => '');
      return c.json({ error: 'Payment gateway error', details: errTxt }, 502);
    }
    const order = (await rzRes.json()) as { id: string; amount: number; currency: string };
    return c.json({
      success: true,
      order_id: order.id,
      amount_paise: order.amount,
      currency: order.currency,
      key: c.env.RAZORPAY_KEY_ID,
      serviceKey,
      title: vasItem.title
    });
  } catch (e: any) {
    return c.json({ error: 'Failed to initiate VAS order', details: e?.message }, 500);
  }
});

// POST /vas/verify — confirm VAS payment and create recruiter task
portalManpowerRouter.post('/vas/verify', async (c) => {
  const body = await c.req.json().catch(() => ({})) as any;
  const parsed = manpowerVasVerifySchema.safeParse(body);
  if (!parsed.success) {
    return c.json({ error: 'Missing required payment verification parameters' }, 400);
  }
  const { token, serviceKey, razorpay_order_id, razorpay_payment_id, razorpay_signature } = parsed.data;
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const secret = c.env.RAZORPAY_KEY_SECRET;
  if (!secret) return c.json({ error: 'Razorpay credentials not configured' }, 503);

  const db = getDb(c.env.DB);
  const now = Math.floor(Date.now() / 1000);
  try {
    const ok = await verifySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature, secret);
    if (!ok) return c.json({ error: 'Payment signature mismatch' }, 403);

    const client = await resolveClientByToken(db, token);
    if (!client) return c.json({ error: 'Client profile not found' }, 404);

    const vasItem = MANPOWER_VAS_CATALOG.find((s) => s.key === serviceKey);
    const serviceTitle = vasItem?.title || 'Career Service';

    // Auto-create counselor fulfillment task
    const taskId = crypto.randomUUID();
    await db.insert(tasks).values({
      id: taskId,
      clientId: client.id,
      title: `Deliver ${serviceTitle}: ${client.name}`,
      description: `Client purchased ${serviceTitle}. Deliverable: ${vasItem?.deliverable || 'Deliver service within SLA'}. Payment ID: ${razorpay_payment_id}`,
      priority: 'high',
      status: 'open',
      cos: 'fixed_date',
      dueDate: now + (vasItem?.durationDays || 3) * 86400,
      createdAt: now,
      updatedAt: now
    });

    await auditEvent(c as any, {
      action: 'PAYMENT_ENTER',
      entityName: 'tasks',
      entityId: taskId,
      afterState: { clientId: token, serviceKey, paymentId: razorpay_payment_id, amountPaise: vasItem?.pricePaise }
    }).catch(() => {});

    await createStaffAlert(c.env as any, {
      division: 'manpower',
      type: 'vas_purchase',
      title: `Career Add-On Purchased: ${serviceTitle}`,
      body: `${client.name} (₹${((vasItem?.pricePaise || 0) / 100).toLocaleString('en-IN')})`,
      clientId: token,
      payload: { serviceKey, paymentId: razorpay_payment_id }
    });

    return c.json({
      success: true,
      message: `Payment confirmed. Our career advisory team will deliver your ${serviceTitle}.`,
      deliverable: vasItem?.deliverable
    });
  } catch (e: any) {
    return c.json({ error: 'VAS verification error', details: e?.message }, 500);
  }
});

// GET /applications?token= — this client's own job applications + pipeline & match scores
portalManpowerRouter.get('/applications', async (c) => {
  const token = c.req.query('token');
  if (!token) return c.json({ error: 'token is required' }, 400);
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  try {
    const list = await db.select().from(manpowerDeployments).where(eq(manpowerDeployments.clientId, token)).all();
    const jobs = await db.select().from(jobPostings).all();
    const joined = list.map((d: any) => {
      const job = jobs.find((j) => j.id === d.jobId);
      let formJson = null;
      try { formJson = d.formJson ? JSON.parse(d.formJson) : null; } catch { formJson = null; }

      // Compute match score
      const match = job ? computeManpowerMatch(formJson, {
        title: job.title,
        country: job.country,
        sector: job.sector,
        collar: job.collar,
        experienceYearsMin: job.experienceYearsMin,
        tradeCategory: job.tradeCategory,
        requirements: (() => { try { return JSON.parse(job.requirementsJson || '[]'); } catch { return []; } })()
      }) : { score: 50, tier: 'standard' as const, strengths: [], gaps: [], reasons: [] };

      return {
        id: d.id, jobId: d.jobId, jobTitle: job?.title || 'Job', jobCountry: job?.country || '',
        selectionStatus: d.selectionStatus, medicalStatus: d.medicalStatus,
        visaStatus: d.visaStatus, flightStatus: d.flightStatus,
        formJson, resumeKey: d.resumeKey, appliedAt: d.appliedAt,
        rejectionReason: d.rejectionReason, notes: d.notes, updatedAt: d.updatedAt,
        matchScore: match.score, matchTier: match.tier, matchStrengths: match.strengths, matchGaps: match.gaps
      };
    });
    joined.sort((a: any, b: any) => (b.appliedAt || 0) - (a.appliedAt || 0));
    
    // Active applications count for quota display
    const activeCount = list.filter(d => !['rejected'].includes(d.selectionStatus) && d.flightStatus !== 'deployed').length;
    return c.json({ success: true, applications: joined, activeCount, maxQuota: 3 });
  } catch (e: any) {
    return c.json({ error: 'Failed to fetch applications', details: e?.message }, 500);
  }
});

// ─── Candidate profile (StudyAbroad parity: wizard + realtime sync) ───
function getPortalTokenManpower(c: any): string | undefined {
  const h = c.req.header('x-portal-token') || c.req.header('X-Portal-Token') || c.req.header('authorization')?.replace(/^Bearer\s+/i, '');
  if (h) return h.trim();
  const q = c.req.query('token');
  if (q) return q.trim();
  return undefined;
}

// GET /profile — returns manpowerProfile + completeness (shared with kanban/staff via clients.intakeContext)
portalManpowerRouter.get('/profile', async (c) => {
  const token = getPortalTokenManpower(c);
  if (!token) return c.json({ error: 'token is required' }, 400);
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  try {
    const client = await resolveClientByToken(db, token);
    if (!client) return c.json({ error: 'Client not found' }, 404);
    let ctx: any = {};
    try { ctx = client.intakeContext ? JSON.parse(client.intakeContext) : {}; } catch {}
    const profile = ctx.manpowerProfile || {};
    const completeness = calculateProfileCompleteness(profile);
    return c.json({ success: true, profile, completeness, pct: completeness.pct });
  } catch (e: any) {
    return c.json({ error: 'Profile fetch failed', details: e?.message }, 500);
  }
});

// PUT /profile — candidate self-serve save (mirrors StudyAbroad wizard: merges, audits, staff alert at 100%)
portalManpowerRouter.put('/profile', async (c) => {
  const token = getPortalTokenManpower(c);
  if (!token) return c.json({ error: 'token is required' }, 400);
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const body = await c.req.json().catch(() => ({}));
  const db = getDb(c.env.DB);
  const now = Math.floor(Date.now() / 1000);
  try {
    const client = await resolveClientByToken(db, token);
    if (!client) return c.json({ error: 'Client not found' }, 404);
    let ctx: any = {};
    try { ctx = client.intakeContext ? JSON.parse(client.intakeContext) : {}; } catch {}
    const before = calculateProfileCompleteness(ctx.manpowerProfile || {}).pct;
    const merged = { ...(ctx.manpowerProfile || {}), ...body };
    ctx.manpowerProfile = merged;
    await db.update(clients).set({ intakeContext: JSON.stringify(ctx), updatedAt: now }).where(eq(clients.id, token));
    const after = calculateProfileCompleteness(merged).pct;
    if (after === 100 && before < 100) {
      await createStaffAlert(c.env as any, { division: 'manpower', type: 'profile_complete', title: 'Candidate profile complete (100%)', body: `${client.name} completed manpower profile — ready for matching & dispatch.`, clientId: token, payload: { pct: 100 } });
    }
    await auditEvent(c as any, { action: 'PROFILE_UPDATED', entityName: 'clients', entityId: token, afterState: { division: 'manpower', pct: after } }).catch(() => {});
    return c.json({ success: true, profile: merged, completeness: calculateProfileCompleteness(merged), message: after === 100 ? 'Profile complete — Match% now live!' : `Profile ${after}% complete.` });
  } catch (e: any) {
    return c.json({ error: 'Profile save failed', details: e?.message }, 500);
  }
});

// POST /resume/presigned — R2 presigned PUT for resume (requires candidate verification pass)
portalManpowerRouter.post('/resume/presigned', async (c) => {
  const token = getPortalTokenManpower(c);
  const filename = c.req.query('filename');
  if (!token || !filename) return c.json({ error: 'token and filename required' }, 400);
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const client = await resolveClientByToken(db, token);
  if (!client) return c.json({ error: 'Client not found for token' }, 404);
  const now = Math.floor(Date.now() / 1000);
  if (!isMember(client, now)) {
    return c.json({
      error: 'Candidate Verification Pass (₹100) required to upload resumes and prevent automated spam.',
      code: 'CANDIDATE_PASS_REQUIRED',
    }, 403);
  }
  const secret = (c.env as any).BETTER_AUTH_SECRET || (c.env as any).ADMIN_PASSWORD || 'manpower_presigned_secret';
  const expires = Math.floor(Date.now() / 1000) + 900;
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const sigSafe = `${token}:${safe}:${expires}:manpower:resume`;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(sigSafe));
  const signature = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
  const url = `/api/public/portal/manpower/resume/upload?token=${encodeURIComponent(token)}&filename=${encodeURIComponent(safe)}&expires=${expires}&signature=${signature}`;
  return c.json({ success: true, url, expires, filename: safe });
});

portalManpowerRouter.put('/resume/upload', async (c) => {
  const token = c.req.query('token') || getPortalTokenManpower(c);
  const filename = c.req.query('filename');
  const expiresStr = c.req.query('expires');
  const signature = c.req.query('signature');
  if (!token || !filename || !expiresStr || !signature) return c.json({ error: 'Missing upload params' }, 400);
  if (Math.floor(Date.now() / 1000) > Number(expiresStr)) return c.json({ error: 'Upload URL expired' }, 400);
  const secret = (c.env as any).BETTER_AUTH_SECRET;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sigSafe = `${token}:${filename}:${expiresStr}:manpower:resume`;
  const expected = await crypto.subtle.sign('HMAC', key, enc.encode(sigSafe));
  const expectedHex = Array.from(new Uint8Array(expected)).map(b => b.toString(16).padStart(2, '0')).join('');
  let ok = expectedHex.length === signature.length;
  if (ok) { let d=0; for (let i=0;i<expectedHex.length;i++) d|=expectedHex.charCodeAt(i)^signature.charCodeAt(i); ok=d===0; }
  if (!ok) return c.json({ error: 'Invalid signature' }, 400);
  const buf = await c.req.arrayBuffer();
  const bucket = (c.env as any).BUCKET;
  if (!bucket) return c.json({ error: 'Storage not configured' }, 500);
  const r2Key = `${crypto.randomUUID()}-${filename}`;
  await bucket.put(r2Key, buf);
  const db = getDb(c.env.DB);
  const now = Math.floor(Date.now() / 1000);
  let ctx: any = {};
  try { const cl = await resolveClientByToken(db, token); if (cl?.intakeContext) ctx = JSON.parse(cl.intakeContext); } catch {}
  const mp = ctx.manpowerProfile || {};
  mp.resumeKey = r2Key; mp.resumeName = filename;
  ctx.manpowerProfile = mp;
  await db.update(clients).set({ intakeContext: JSON.stringify(ctx), updatedAt: now }).where(eq(clients.id, token));
  await db.insert((await import('../db/schema.js')).documents).values({ id: crypto.randomUUID(), clientId: token, fileName: filename, r2Key, version: 'v1.0', status: 'pending', uploadedAt: now, sizeBytes: buf.byteLength, mimeType: 'application/octet-stream', uploadedBy: 'client', docLabel: 'Resume', scanStatus: 'clean' }).catch(()=>{});
  return c.json({ success: true, fileName: filename, r2Key });
});

// POST /applications — apply to any open job (active Candidate Pass required)
portalManpowerRouter.post('/applications', async (c) => {
  if (!(await isDivisionEnabled(c.env, 'manpower'))) {
    return c.json({ error: 'This service is not accepting applications yet', code: 'DIVISION_DISABLED' }, 409);
  }
  const body = await c.req.json().catch(() => ({})) as any;
  const parsedInput = manpowerApplicationSchema.safeParse(body);
  if (!parsedInput.success) {
    return c.json({ error: 'Invalid application request', details: parsedInput.error.format() }, 400);
  }

  const { token, jobId, formJson, resumeKey, turnstileToken } = parsedInput.data;
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);

  // Cloudflare Turnstile Bot Defense Check
  const turnstileCheck = await verifyTurnstileToken(
    turnstileToken,
    c.env.TURNSTILE_SECRET_KEY,
    c.req.header('CF-Connecting-IP') || c.req.header('x-forwarded-for')
  );
  if (!turnstileCheck.success) {
    return c.json({ error: 'Bot challenge validation failed. Please try again.', details: turnstileCheck.reason }, 403);
  }

  const db = getDb(c.env.DB);
  const now = Math.floor(Date.now() / 1000);

  try {
    const client = await resolveClientByToken(db, token);
    if (!client) return c.json({ error: 'Client not found for token' }, 404);

    const job = await db.select().from(jobPostings).where(eq(jobPostings.id, jobId)).get();
    if (!job) return c.json({ error: 'Job not found' }, 404);
    if (job.status !== 'open') return c.json({ error: 'This opening is not open for applications' }, 400);
    // Unified paywall gate: an active Candidate Pass (₹100 one-time) is required
    // to apply to ALL overseas jobs (anti-spam verification).
    if (!isMember(client, now)) {
      return c.json({
        error: 'An active Candidate Pass (₹100 one-time) is required to apply for overseas jobs. Unlock it from your Jobs tab.',
        code: 'MEMBERSHIP_REQUIRED',
        planKey: 'candidate-pass',
      }, 403);
    }

    // Anti-Spam Quota Check: Max 3 active applications per candidate
    const existingApps = await db.select().from(manpowerDeployments)
      .where(eq(manpowerDeployments.clientId, token))
      .all();
    
    const activeCount = existingApps.filter(d => !['rejected'].includes(d.selectionStatus) && d.flightStatus !== 'deployed').length;
    if (activeCount >= 3) {
      return c.json({
        error: 'Active application limit reached (3/3). Please await current reviews before applying to additional openings.',
        code: 'QUOTA_EXCEEDED',
        activeCount,
        maxQuota: 3
      }, 429);
    }

    const parsed = manpowerFormSchema.safeParse(formJson || {});
    if (!parsed.success) {
      return c.json({ success: false, code: 'incomplete_form', error: 'Application form incomplete.', missingSections: missingManpowerSections(formJson) }, 400);
    }

    // Idempotent: one application per (client, job)
    const existing = existingApps.find(d => d.jobId === jobId);
    if (existing) return c.json({ success: true, id: existing.id, duplicate: true, message: 'You already applied to this opening.' });

    // Compute live match
    const match = computeManpowerMatch(parsed.data as any, {
      title: job.title,
      country: job.country,
      sector: job.sector,
      collar: job.collar,
      experienceYearsMin: job.experienceYearsMin,
      tradeCategory: job.tradeCategory,
      requirements: (() => { try { return JSON.parse(job.requirementsJson || '[]'); } catch { return []; } })()
    });

    const id = crypto.randomUUID();
    await db.insert(manpowerDeployments).values({
      id, clientId: token, jobId,
      selectionStatus: 'applied', medicalStatus: 'pending', visaStatus: 'pending', flightStatus: 'pending',
      formJson: JSON.stringify(parsed.data), resumeKey: resumeKey || null, appliedAt: now, updatedAt: now,
    });

    await auditEvent(c as any, {
      action: 'JOB_APPLIED', entityName: 'manpower_deployments', entityId: id,
      afterState: { id, clientId: token, jobId, title: job.title, matchScore: match.score, matchTier: match.tier },
    }).catch(() => {});

    await createStaffAlert(c.env as any, {
      division: 'manpower',
      type: 'manpower_application',
      title: `Job application: ${job.title} (${match.tier === 'top_match' ? '🔥 Top Match ' + match.score + '%' : match.score + '%'})`,
      body: `${job.country} — ${token}`,
      clientId: token,
      payload: { jobId, jobTitle: job.title, matchScore: match.score, matchTier: match.tier }
    });

    return c.json({
      success: true,
      id,
      matchScore: match.score,
      matchTier: match.tier,
      message: 'Application submitted successfully. Our recruitment desk will review your profile.'
    });
  } catch (e: any) {
    return c.json({ error: 'Failed to submit application', details: e?.message }, 500);
  }
});
