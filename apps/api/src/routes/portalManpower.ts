import { Hono } from 'hono';
import { getDb } from '../db/client.js';
import { clients, jobPostings, manpowerDeployments, membershipPlans, appSettings } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { auditEvent } from '../middleware/audit.js';
import { createStaffAlert } from '../infra/staffAlerts.js';
import { manpowerFormSchema, missingManpowerSections } from '../validation/manpowerForm.js';

// Client self-service Manpower surface (token = client.id).
// Mounted at /api/public/portal/manpower.
export const portalManpowerRouter = new Hono<{
  Bindings: { DB: D1Database; BETTER_AUTH_SECRET: string; RAZORPAY_KEY_ID?: string; RAZORPAY_KEY_SECRET?: string }
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

// Membership is active when the flag is set and (if an expiry exists) not past.
function isMember(client: any, now: number): boolean {
  return !!client?.exclusiveMember && (!client.exclusiveExpiresAt || client.exclusiveExpiresAt > now);
}

// Seed default plans once (idempotent) so the paywall is never empty.
// Inserts only the defaults that are missing (by key) — never skips seeding
// just because a custom plan already exists.
export async function seedMembershipPlans(db: any) {
  const existing = await db.select().from(membershipPlans).all();
  const existingKeys = new Set(existing.map((p: any) => p.key));
  const now = Math.floor(Date.now() / 1000);
  const defaults = [
    { key: 'exclusive-30', name: 'Exclusive 30 Days', description: '30 days of secret job offers', pricePaise: 49900, durationDays: 30, tier: 'basic', perksJson: '["Secret job offers", "Direct apply"]', sortOrder: 1 },
    { key: 'exclusive-90', name: 'Exclusive 90 Days', description: '90 days of secret job offers', pricePaise: 129900, durationDays: 90, tier: 'pro', perksJson: '["Secret job offers", "Direct apply", "Priority shortlisting"]', sortOrder: 2 },
    { key: 'exclusive-365', name: 'Exclusive 1 Year', description: 'A full year of secret job offers', pricePaise: 399900, durationDays: 365, tier: 'premium', perksJson: '["Secret job offers", "Direct apply", "Priority shortlisting", "Resume review"]', sortOrder: 3 },
  ];
  for (const p of defaults) {
    if (existingKeys.has(p.key)) continue;
    await db.insert(membershipPlans).values({ id: crypto.randomUUID(), ...p, active: true, createdAt: now, updatedAt: now }).onConflictDoNothing();
  }
}

function publicJob(j: any) {
  const parse = (s: any) => { try { const a = JSON.parse(s || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } };
  return {
    id: j.id, title: j.title, country: j.country, sector: j.sector, salaryText: j.salaryText,
    collar: j.collar, description: j.description, employer: j.employer,
    salaryMinPaise: j.salaryMinPaise, salaryMaxPaise: j.salaryMaxPaise, currency: j.currency,
    vacancies: j.vacancies, benefits: parse(j.benefitsJson), requirements: parse(j.requirementsJson),
    experienceYearsMin: j.experienceYearsMin, tradeCategory: j.tradeCategory,
    visaProvided: !!j.visaProvided, medicalRequired: !!j.medicalRequired, deadline: j.deadline,
    featured: !!j.featured, tier: j.tier, exclusive: j.tier === 'secret', createdAt: j.createdAt,
  };
}

// GET /jobs — public jobs for everyone; secret jobs only for exclusive members
portalManpowerRouter.get('/jobs', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const now = Math.floor(Date.now() / 1000);
  try {
    const token = c.req.query('token');
    let member = false;
    if (token) {
      const client = await db.select().from(clients).where(eq(clients.id, token)).get();
      member = isMember(client, now);
    }
    const rows = await db.select().from(jobPostings)
      .where(and(eq(jobPostings.status, 'open'), member ? undefined : eq(jobPostings.tier, 'public')))
      .all();
    return c.json({ success: true, jobs: rows.map(publicJob) });
  } catch (e: any) {
    return c.json({ error: 'Failed to fetch jobs', details: e?.message }, 500);
  }
});

// GET /membership?token= — membership status + active plans for the paywall
portalManpowerRouter.get('/membership', async (c) => {
  const token = c.req.query('token');
  if (!token) return c.json({ error: 'token is required' }, 400);
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const now = Math.floor(Date.now() / 1000);
  try {
    await seedMembershipPlans(db);
    const client = await db.select().from(clients).where(eq(clients.id, token)).get();
    if (!client) return c.json({ error: 'Client not found for token' }, 404);
    const plans = await db.select().from(membershipPlans).where(eq(membershipPlans.active, true)).all();
    plans.sort((a: any, b: any) => (a.sortOrder || 0) - (b.sortOrder || 0));
    const setting = await db.select().from(appSettings).where(eq(appSettings.key, 'exclusive_community_enabled')).get();
    const enabled = setting?.value !== 'false';
    const openSecretJobs = await db.select().from(jobPostings)
      .where(and(eq(jobPostings.status, 'open'), eq(jobPostings.tier, 'secret')))
      .all();
    const comingSoon = !enabled || plans.length === 0 || openSecretJobs.length === 0;
    return c.json({
      success: true,
      enabled,
      comingSoon,
      membership: {
        isMember: isMember(client, now),
        expiresAt: client.exclusiveExpiresAt,
        plan: client.exclusivePlan,
        since: client.exclusiveSince,
      },
      plans: plans.map((p: any) => ({
        key: p.key, name: p.name, description: p.description, pricePaise: p.pricePaise,
        durationDays: p.durationDays, tier: p.tier, perks: (() => { try { return JSON.parse(p.perksJson || '[]'); } catch { return []; } })(),
      })),
    });
  } catch (e: any) {
    return c.json({ error: 'Failed to fetch membership', details: e?.message }, 500);
  }
});

// POST /membership/order — create a Razorpay order for a membership plan
portalManpowerRouter.post('/membership/order', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { token?: string; planKey?: string };
  const { token, planKey } = body;
  if (!token || !planKey) return c.json({ error: 'token and planKey are required' }, 400);
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  if (!c.env.RAZORPAY_KEY_ID || !c.env.RAZORPAY_KEY_SECRET) {
    return c.json({ error: 'Razorpay not configured — set RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET' }, 503);
  }
  const db = getDb(c.env.DB);
  try {
    await seedMembershipPlans(db);
    const client = await db.select().from(clients).where(eq(clients.id, token)).get();
    if (!client) return c.json({ error: 'Client not found for token' }, 404);
    const plan = await db.select().from(membershipPlans).where(and(eq(membershipPlans.key, planKey), eq(membershipPlans.active, true))).get();
    if (!plan) return c.json({ error: 'Plan not found or inactive' }, 404);

    const rzRes = await fetch(`${RZR_BASE}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': basicAuth(c) },
      body: JSON.stringify({
        amount: plan.pricePaise,
        currency: 'INR',
        receipt: `memb_${token}_${Date.now().toString(36)}`,
        notes: { clientId: token, planKey, planName: plan.name },
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
portalManpowerRouter.post('/membership/verify', async (c) => {
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

    const client = await db.select().from(clients).where(eq(clients.id, token)).get();
    if (!client) return c.json({ error: 'Client not found for token' }, 404);
    const plan = await db.select().from(membershipPlans).where(eq(membershipPlans.key, planKey)).get();
    if (!plan) return c.json({ error: 'Plan not found' }, 404);

    // Extend from current expiry if still active, else from now.
    const base = isMember(client, now) && client.exclusiveExpiresAt ? client.exclusiveExpiresAt : now;
    const expiresAt = base + plan.durationDays * 86400;

    await db.update(clients).set({
      exclusiveMember: true,
      exclusiveExpiresAt: expiresAt,
      exclusivePlan: planKey,
      exclusiveSince: client.exclusiveSince || now,
      updatedAt: now,
    }).where(eq(clients.id, token));

    await auditEvent(c as any, {
      action: 'MEMBERSHIP_GRANTED', entityName: 'clients', entityId: token,
      afterState: { clientId: token, planKey, paymentId: razorpay_payment_id, expiresAt },
    }).catch(() => {});

    await createStaffAlert(c.env as any, { division: 'manpower', type: 'membership_sale', title: `Membership purchased: ${plan.name}`, body: `${token} — expires ${new Date(expiresAt * 1000).toLocaleDateString()}`, clientId: token, payload: { planKey, expiresAt } });
    return c.json({ success: true, message: 'Membership activated.', expiresAt });
  } catch (e: any) {
    return c.json({ error: 'Failed to verify membership payment', details: e?.message }, 500);
  }
});

// GET /applications?token= — this client's own job applications + pipeline
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
      return {
        id: d.id, jobId: d.jobId, jobTitle: job?.title || 'Job', jobCountry: job?.country || '',
        selectionStatus: d.selectionStatus, medicalStatus: d.medicalStatus,
        visaStatus: d.visaStatus, flightStatus: d.flightStatus,
        formJson, resumeKey: d.resumeKey, appliedAt: d.appliedAt,
        rejectionReason: d.rejectionReason, notes: d.notes, updatedAt: d.updatedAt,
      };
    });
    joined.sort((a: any, b: any) => (b.appliedAt || 0) - (a.appliedAt || 0));
    return c.json({ success: true, applications: joined });
  } catch (e: any) {
    return c.json({ error: 'Failed to fetch applications', details: e?.message }, 500);
  }
});

// POST /applications — apply to a public job (anyone) or a secret job (members only)
portalManpowerRouter.post('/applications', async (c) => {
  const body = await c.req.json().catch(() => ({})) as {
    token?: string; jobId?: string; formJson?: unknown; resumeKey?: string | null;
  };
  const { token, jobId, formJson, resumeKey } = body;
  if (!token || !jobId) return c.json({ error: 'token and jobId are required' }, 400);
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const now = Math.floor(Date.now() / 1000);

  try {
    const client = await db.select().from(clients).where(eq(clients.id, token)).get();
    if (!client) return c.json({ error: 'Client not found for token' }, 404);

    const job = await db.select().from(jobPostings).where(eq(jobPostings.id, jobId)).get();
    if (!job) return c.json({ error: 'Job not found' }, 404);
    if (job.status !== 'open') return c.json({ error: 'This opening is not open for applications' }, 400);
    if (job.tier === 'secret' && !isMember(client, now)) {
      return c.json({ error: 'This is an exclusive job. Join the paid community to apply.' }, 403);
    }

    const parsed = manpowerFormSchema.safeParse(formJson || {});
    if (!parsed.success) {
      return c.json({ success: false, code: 'incomplete_form', error: 'Application form incomplete.', missingSections: missingManpowerSections(formJson) }, 400);
    }

    // Idempotent: one application per (client, job)
    const existing = await db.select().from(manpowerDeployments)
      .where(and(eq(manpowerDeployments.clientId, token), eq(manpowerDeployments.jobId, jobId)))
      .get();
    if (existing) return c.json({ success: true, id: existing.id, duplicate: true, message: 'You already applied to this opening.' });

    const id = crypto.randomUUID();
    await db.insert(manpowerDeployments).values({
      id, clientId: token, jobId,
      selectionStatus: 'applied', medicalStatus: 'pending', visaStatus: 'pending', flightStatus: 'pending',
      formJson: JSON.stringify(parsed.data), resumeKey: resumeKey || null, appliedAt: now, updatedAt: now,
    });

    await auditEvent(c as any, {
      action: 'JOB_APPLIED', entityName: 'manpower_deployments', entityId: id,
      afterState: { id, clientId: token, jobId, title: job.title, tier: job.tier },
    }).catch(() => {});

    await createStaffAlert(c.env as any, { division: 'manpower', type: 'manpower_application', title: `Job application: ${job.title}`, body: `${job.country} — ${token}`, clientId: token, payload: { jobId, jobTitle: job.title, tier: job.tier } });
    return c.json({ success: true, id, message: 'Application submitted. Our recruitment desk will review it.' });
  } catch (e: any) {
    return c.json({ error: 'Failed to submit application', details: e?.message }, 500);
  }
});
