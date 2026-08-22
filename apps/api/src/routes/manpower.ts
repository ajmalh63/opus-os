import { Hono } from 'hono';
import { getDb } from '../db/client.js';
import { clients, engagements, consents, candidateProfiles, manpowerDeployments, jobPostings, membershipPlans, appSettings, tasks } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { parseResumeWithAI } from '../infra/ai.js';
import { auditEvent } from '../middleware/audit.js';
import { seedMembershipPlans } from './portalManpower.js';
import { computeManpowerMatch, calculateProfileCompleteness } from '../lib/manpowerMatch.js';

export const manpowerRouter = new Hono<{ Bindings: { DB: D1Database; MANPOWER_AI?: 'mock' | 'real'; AI?: unknown }; Variables: { user?: { id?: string; role?: string } | null } }>();

// Persist the parsed candidate profile (DPDP-gated: only when the client has a
// granted manpower-retain consent). Fail-open — never blocks the parse itself.
async function persistCandidate(env: { DB: D1Database }, clientId: string | undefined, candidate: any, resumeKey: string | null, source: 'ai' | 'mock') {
  if (!clientId || !env?.DB || !candidate) return;
  try {
    const db = getDb(env.DB);
    const consent = await db.select().from(consents)
      .where(eq(consents.clientId, clientId))
      .all();
    const retain = consent.some((ct: any) => ct.consentType === 'manpower-retain' && ct.status === 'granted');
    if (!retain) return; // DPDP: no retain consent → no profile storage

    const now = Math.floor(Date.now() / 1000);
    const existing = await db.select().from(candidateProfiles).where(eq(candidateProfiles.clientId, clientId)).get();
    const fields = {
      name: String(candidate.name || 'Unnamed'),
      email: candidate.email || null,
      phone: candidate.phone || null,
      skillsJson: JSON.stringify(candidate.skills || []),
      experienceJson: JSON.stringify(candidate.experience || []),
      education: candidate.education || null,
      resumeKey: resumeKey || null,
      source,
      updatedAt: now,
    };
    if (existing) {
      await db.update(candidateProfiles).set({ ...fields, updatedAt: now }).where(eq(candidateProfiles.clientId, clientId));
    } else {
      await db.insert(candidateProfiles).values({ id: crypto.randomUUID(), clientId, createdAt: now, ...fields });
    }
  } catch (e: any) {
    console.error('candidate profile persist failed', e?.message);
  }
}

// Explicitly labeled demo candidates (B-3). Only used when MANPOWER_AI !== 'real'.
// Never presented as a real Workers AI result.
const MOCK_CANDIDATES = {
  default: {
    name: "Aditya Verma",
    email: "aditya.verma@example.com",
    phone: "+91 98989 12345",
    skills: ["Java", "Spring Boot", "Docker", "Kubernetes", "SQL"],
    experience: ["Software Engineer at Infosys (2 years)", "Intern at Tech Solutions (6 months)"],
    education: "B.Tech in Computer Science from NIT Nagpur"
  },
  priya: {
    name: "Priya Patel",
    email: "priya.patel@example.com",
    phone: "+91 97979 54321",
    skills: ["React", "TypeScript", "Tailwind CSS", "Redux", "Figma"],
    experience: ["Frontend Developer at Wipro (3 years)"],
    education: "B.E. in Information Technology from Pune University"
  }
};

// POST /api/manpower/resume/parse (Workers AI Resume Parser)
manpowerRouter.post('/resume/parse', async (c) => {
  try {
    const body = await c.req.parseBody();
    const file = body.resume as File | undefined;

    if (!file) {
      return c.json({ error: "No resume file uploaded." }, 400);
    }

    // B-3: when MANPOWER_AI=real we use the real AI parser (no mock, no 501).
    // Contract: resume TEXT arrives in the `text` form field (or a .txt file) —
    // PDF text-extraction is a Queue job (§10 ms CPU rule). Silent demo data is
    // never produced in real mode.
    if (c.env.MANPOWER_AI === 'real') {
      let text = String(body.text || '');
      if (!text && file && (file.name || '').toLowerCase().endsWith('.txt')) {
        const buf = await file.arrayBuffer().catch(() => null);
        if (buf) text = new TextDecoder('utf-8').decode(buf);
      }
      if (!text) {
        return c.json({ error: 'MANPOWER_AI=real requires a `text` form field (or .txt file) with the resume content' }, 400);
      }

      const result = await parseResumeWithAI(c.env, text);
      if (!result.ok || !result.candidate) {
        return c.json({ error: result.reason || 'AI resume parse failed' }, 502);
      }
      await persistCandidate(c.env, String(body.clientId || ''), result.candidate, String(body.resumeKey || null), 'ai');
      return c.json({
        success: true,
        mocked: false,
        candidate: result.candidate,
        parsedData: result.candidate,
        message: 'Resume parsed by Workers AI (real mode).',
      });
    }

// Mock mode (MANPOWER_AI !== 'real', e.g. dev default "mock"): return the
    // training/demo candidate wrapped so the response is EXPLICITLY demo data.
    const fileNameLower = file.name?.toLowerCase() || '';
    const mockCandidate = fileNameLower.includes('priya')
      ? MOCK_CANDIDATES.priya
      : MOCK_CANDIDATES.default;

    await persistCandidate(c.env, String(body.clientId || ''), mockCandidate, String(body.resumeKey || null), 'mock').catch(() => {});

    return c.json({
      success: true,
      mocked: true,
      candidate: mockCandidate,
      parsedData: mockCandidate,
      message: "Resume processed by mock parser (MANPOWER_AI != 'real'). DEMO DATA — not a real parsing result."
    });

  } catch (error: any) {
    return c.json({ error: "Resume parser exception", details: error.message }, 500);
  }
});

// GET /api/manpower/candidates (Screening Pool Desk View)
manpowerRouter.get('/candidates', async (c) => {
  if (!c.env || !c.env.DB) {
    return c.json({ error: "DB not available" }, 500);
  }

  const db = getDb(c.env.DB);

  try {
    const activeManpowerEngs = await db
      .select()
      .from(engagements)
      .where(eq(engagements.division, 'manpower'))
      .all();

    if (activeManpowerEngs.length === 0) {
      return c.json({ candidates: [] });
    }

    const clientIds = activeManpowerEngs.map(e => e.clientId);
    const allClients = await db.select().from(clients).all();
    const list = allClients
      .filter(cl => clientIds.includes(cl.id))
      .map(cl => ({
        id: cl.id,
        name: cl.name,
        email: cl.email,
        phone: cl.phone,
        highestQualification: cl.highestQualification,
        createdAt: cl.createdAt
      }));

    return c.json({ candidates: list });
  } catch (error: any) {
    return c.json({ error: "Failed to fetch candidates pool", details: error.message }, 500);
  }
});

// POST /api/manpower/interviews/invite
manpowerRouter.post('/interviews/invite', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { clientId?: string; recruiterId?: string };
  const { clientId } = body;
  if (!clientId) return c.json({ error: "clientId is required" }, 400);

  if (!c.env || !c.env.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  try {
    const client = await db.select().from(clients).where(eq(clients.id, clientId)).get();
    if (!client) return c.json({ error: "Client not found" }, 404);

    const calBase = (c.env as any)?.CAL_BASE_URL || 'https://cal.opusoverseas.com';
    const inviteLink = `${calBase}/opus-owner/consultation?ref=${clientId}`;
    
    await auditEvent(c as any, {
      action: 'LEAD_CREATED',
      entityName: 'clients',
      entityId: clientId,
      afterState: { id: clientId, status: 'invited', inviteLink }
    }).catch(() => {});

    return c.json({
      success: true,
      inviteLink,
      message: `Interview invitation link generated for WhatsApp dispatch.`
    });
  } catch (error: any) {
    return c.json({ error: "Invite failed", details: error.message }, 500);
  }
});

// POST /api/manpower/interviews/confirm
manpowerRouter.post('/interviews/confirm', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { clientId?: string; slotEpoch?: number; assigneeId?: string };
  const { clientId, slotEpoch, assigneeId } = body;
  if (!clientId || !slotEpoch) {
    return c.json({ error: "Missing required fields: clientId, slotEpoch" }, 400);
  }

  if (!c.env || !c.env.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  const now = Math.floor(Date.now() / 1000);

  try {
    const client = await db.select().from(clients).where(eq(clients.id, clientId)).get();
    if (!client) return c.json({ error: "Client not found" }, 404);

    const engs = await db.select().from(engagements).where(eq(engagements.clientId, clientId)).all();
    const primaryEng = engs.find(e => e.division === 'manpower');
    if (primaryEng) {
      await db.update(engagements)
        .set({ stageKey: 'processing', updatedAt: now })
        .where(eq(engagements.id, primaryEng.id));
    }

    const taskId = crypto.randomUUID();
    const { tasks } = await import('../db/schema.js');
    await db.insert(tasks).values({
      id: taskId,
      clientId,
      engagementId: primaryEng?.id || null,
      assigneeId: assigneeId || null,
      title: `Manpower Client Interview: ${client.name}`,
      description: `Cal.diy booking confirmed for ${new Date(slotEpoch * 1000).toLocaleString('en-IN')}`,
      priority: 'high',
      status: 'open',
      cos: 'fixed_date',
      dueDate: slotEpoch,
      createdAt: now,
      updatedAt: now
    });

    await auditEvent(c as any, {
      action: 'STAGE_CHANGE',
      entityName: 'engagements',
      entityId: primaryEng?.id || '',
      afterState: { id: primaryEng?.id || '', stageKey: 'processing', taskId }
    }).catch(() => {});

    return c.json({ success: true, taskId, message: "Interview slot confirmed and scheduled in recruiter tasks." });
  } catch (error: any) {
    return c.json({ error: "Confirmation failed", details: error.message }, 500);
  }
});

// GET /api/manpower/deployments — Get deployment tracking (optionally by clientId / jobId / triageTier), joined + candidate detail & match scores
manpowerRouter.get('/deployments', async (c) => {
  const clientId = c.req.query('clientId');
  const jobId = c.req.query('jobId');
  const triageFilter = c.req.query('triageTier');

  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);

  try {
    let list = await db.select().from(manpowerDeployments).all();
    if (clientId) list = list.filter((d) => d.clientId === clientId);
    if (jobId) list = list.filter((d) => d.jobId === jobId);

    const jobs = await db.select().from(jobPostings).all();
    const allClients = await db.select().from(clients).all();
    const vasTasks = await db.select().from(tasks).all().catch(() => []);
    const joined = list.map(d => {
      const job = jobs.find(j => j.id === d.jobId);
      const cl = allClients.find(c => c.id === d.clientId);
      const clientVasTask = vasTasks.find(t => t.clientId === d.clientId);
      const hasPaidVas = !!clientVasTask || !!cl?.exclusiveMember;
      let formJson = null;
      try { formJson = d.formJson ? JSON.parse(d.formJson) : null; } catch { formJson = null; }

      const match = job ? computeManpowerMatch(formJson, {
        title: job.title,
        country: job.country,
        sector: job.sector,
        collar: job.collar,
        experienceYearsMin: job.experienceYearsMin,
        tradeCategory: job.tradeCategory,
        requirements: (() => { try { return JSON.parse(job.requirementsJson || '[]'); } catch { return []; } })()
      }) : { score: 50, tier: 'standard' as const, strengths: [], gaps: [], reasons: [] };

      const completeness = calculateProfileCompleteness(formJson);

      return {
        ...d,
        formJson,
        jobTitle: job?.title || 'Unknown Job',
        jobCountry: job?.country || 'Unknown Country',
        jobSector: job?.sector || '',
        collar: job?.collar || 'blue_collar',
        employer: job?.employer || null,
        employerReference: job?.employerReference || null,
        candidateName: cl?.name || 'Unknown',
        candidateEmail: cl?.email || '',
        candidatePhone: cl?.phone || '',
        exclusiveMember: !!cl?.exclusiveMember,
        hasPaidVas,
        vasServiceTitle: clientVasTask?.title || (cl?.exclusiveMember ? 'Exclusive Community' : null),
        matchScore: match.score,
        matchTier: match.tier,
        matchStrengths: match.strengths,
        matchGaps: match.gaps,
        profileCompletenessPct: completeness.pct,
        missingProfileSections: completeness.missing
      };
    });

    const filtered = triageFilter && triageFilter !== 'all'
      ? triageFilter === 'paid_vas'
        ? joined.filter((d) => d.hasPaidVas)
        : joined.filter((d) => d.matchTier === triageFilter)
      : joined;

    return c.json({
      success: true,
      deployments: filtered,
      counts: {
        total: joined.length,
        topMatch: joined.filter(d => d.matchTier === 'top_match').length,
        standard: joined.filter(d => d.matchTier === 'standard').length,
        coldPool: joined.filter(d => d.matchTier === 'cold_pool').length,
        paidVas: joined.filter(d => d.hasPaidVas).length
      }
    });
  } catch (error: any) {
    return c.json({ error: "Failed to fetch deployments", details: error.message }, 500);
  }
});

// POST /api/manpower/deployments — Initiate deployment record
manpowerRouter.post('/deployments', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { clientId?: string; jobId?: string };
  const { clientId, jobId } = body;
  if (!clientId || !jobId) {
    return c.json({ error: "clientId and jobId are required" }, 400);
  }

  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  const now = Math.floor(Date.now() / 1000);

  try {
    const id = crypto.randomUUID();
    await db.insert(manpowerDeployments).values({
      id,
      clientId,
      jobId,
      selectionStatus: 'applied',
      medicalStatus: 'pending',
      visaStatus: 'pending',
      flightStatus: 'pending',
      updatedAt: now
    });

    await auditEvent(c as any, {
      action: 'DEPLOYMENT_CREATE',
      entityName: 'manpower_deployments',
      entityId: id,
      afterState: { id, clientId, jobId }
    }).catch(() => {});

    return c.json({ success: true, id, message: "Deployment record initialized." });
  } catch (error: any) {
    return c.json({ error: "Failed to create deployment record", details: error.message }, 500);
  }
});

// PATCH /api/manpower/deployments/:id — Update selection/medical/visa/flight statuses
manpowerRouter.patch('/deployments/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({})) as {
    selectionStatus?: 'applied' | 'shortlisted' | 'selected' | 'rejected';
    medicalStatus?: 'pending' | 'fit' | 'unfit' | 'restricted';
    visaStatus?: 'pending' | 'submitted' | 'stamped' | 'rejected';
    flightStatus?: 'pending' | 'booked' | 'deployed';
    notes?: string;
    rejectionReason?: string;
  };

  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  const now = Math.floor(Date.now() / 1000);

  try {
    const existing = await db.select().from(manpowerDeployments).where(eq(manpowerDeployments.id, id)).get();
    if (!existing) {
      return c.json({ error: "Deployment record not found" }, 404);
    }

    const updates: any = { updatedAt: now };
    if (body.selectionStatus !== undefined) updates.selectionStatus = body.selectionStatus;
    if (body.medicalStatus !== undefined) updates.medicalStatus = body.medicalStatus;
    if (body.visaStatus !== undefined) updates.visaStatus = body.visaStatus;
    if (body.flightStatus !== undefined) updates.flightStatus = body.flightStatus;
    if (body.notes !== undefined) updates.notes = body.notes;
    if (body.rejectionReason !== undefined) updates.rejectionReason = body.rejectionReason;

    await db.update(manpowerDeployments).set(updates).where(eq(manpowerDeployments.id, id));

    // Automation 1: selectionStatus changes to 'selected' -> Schedule medical Task within 48h
    if (body.selectionStatus === 'selected' && existing.selectionStatus !== 'selected') {
      const taskId = crypto.randomUUID();
      const { tasks } = await import('../db/schema.js');
      await db.insert(tasks).values({
        id: taskId,
        clientId: existing.clientId,
        title: 'Initiate Medical Diagnostics checkup',
        description: 'Candidate selected for job. Schedule clinical medical fit diagnostics.',
        priority: 'high',
        status: 'open',
        dueDate: now + (48 * 3600), // 48 hours
        createdAt: now,
        updatedAt: now
      });
    }

    // Automation 2: medicalStatus changes to 'fit' -> Schedule Visa slot booking task
    if (body.medicalStatus === 'fit' && existing.medicalStatus !== 'fit') {
      const taskId = crypto.randomUUID();
      const { tasks } = await import('../db/schema.js');
      await db.insert(tasks).values({
        id: taskId,
        clientId: existing.clientId,
        title: 'Schedule Visa slot booking',
        description: 'Candidate marked medically fit. Initiate visa stamping procedures.',
        priority: 'medium',
        status: 'open',
        dueDate: now + (24 * 3600),
        createdAt: now,
        updatedAt: now
      });
    }

    // Automation 3: flightStatus changes to 'deployed' -> Create payout review task
    if (body.flightStatus === 'deployed' && existing.flightStatus !== 'deployed') {
      const taskId = crypto.randomUUID();
      const { tasks } = await import('../db/schema.js');
      await db.insert(tasks).values({
        id: taskId,
        clientId: existing.clientId,
        title: 'Deploy Payout Coordinator Commission',
        description: 'Candidate has successfully traveled and deployed. Review final agent commissions.',
        priority: 'medium',
        status: 'open',
        dueDate: now + (48 * 3600),
        createdAt: now,
        updatedAt: now
      });
    }

    await auditEvent(c as any, {
      action: 'DEPLOYMENT_UPDATE',
      entityName: 'manpower_deployments',
      entityId: id,
      afterState: updates
    }).catch(() => {});

    return c.json({ success: true, message: "Deployment record updated successfully." });
  } catch (error: any) {
    return c.json({ error: "Failed to update deployment", details: error.message }, 500);
  }
});

// GET /api/manpower/jobs — Retrieve all job postings (with applicant counts + parsed lists)
manpowerRouter.get('/jobs', async (c) => {
  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  try {
    const list = await db.select().from(jobPostings).all();
    const deps = await db.select().from(manpowerDeployments).all();
    const parse = (s: any) => { try { const a = JSON.parse(s || '[]'); return Array.isArray(a) ? a : []; } catch { return []; } };
    const jobs = list.map((j: any) => ({
      ...j,
      benefits: parse(j.benefitsJson),
      requirements: parse(j.requirementsJson),
      applicantCount: deps.filter((d) => d.jobId === j.id).length,
    }));
    const q = (c.req.query('q') || '').trim().toLowerCase();
    const filtered = q ? jobs.filter((j: any) => `${j.title} ${j.country} ${j.sector} ${j.employer || ''}`.toLowerCase().includes(q)) : jobs;
    return c.json({ success: true, jobs: filtered });
  } catch (error: any) {
    return c.json({ error: "Failed to fetch jobs", details: error.message }, 500);
  }
});

// POST /api/manpower/jobs — Create a job posting (public or secret tier, rich agency fields)
manpowerRouter.post('/jobs', async (c) => {
  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  const body = await c.req.json().catch(() => ({})) as any;

  if (!body.title || !body.country || !body.sector || !body.salaryText) {
    return c.json({ error: "Missing required fields: title, country, sector, salaryText" }, 400);
  }

  const now = Math.floor(Date.now() / 1000);
  const id = crypto.randomUUID();
  const arr = (v: any) => (Array.isArray(v) ? JSON.stringify(v) : '[]');
  try {
    await db.insert(jobPostings).values({
      id,
      title: body.title,
      country: body.country,
      sector: body.sector,
      salaryText: body.salaryText,
      collar: body.collar || 'blue_collar',
      tier: body.tier || 'public',
      status: 'open',
      description: body.description || null,
      employer: body.employer || null,
      employerReference: body.employerReference || null,
      salaryMinPaise: body.salaryMinPaise ?? null,
      salaryMaxPaise: body.salaryMaxPaise ?? null,
      currency: body.currency || 'AED',
      vacancies: body.vacancies ?? 1,
      benefitsJson: arr(body.benefits),
      requirementsJson: arr(body.requirements),
      experienceYearsMin: body.experienceYearsMin ?? 0,
      ageMin: body.ageMin ?? null,
      ageMax: body.ageMax ?? null,
      tradeCategory: body.tradeCategory || null,
      visaProvided: body.visaProvided !== false,
      medicalRequired: body.medicalRequired !== false,
      deadline: body.deadline || null,
      featured: !!body.featured,
      createdAt: now
    });
    await auditEvent(c as any, {
      action: 'JOB_POSTED',
      entityName: 'job_postings',
      entityId: id,
      afterState: { id, title: body.title, tier: body.tier || 'public', employer: body.employer || null }
    }).catch(() => {});
    return c.json({ success: true, id, message: "Job posting created." });
  } catch (error: any) {
    return c.json({ error: "Failed to create job posting", details: error.message }, 500);
  }
});

// PATCH /api/manpower/jobs/:id — Update posting (status fill, collar/tier + rich fields)
manpowerRouter.patch('/jobs/:id', async (c) => {
  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({})) as any;
  try {
    const existing = await db.select().from(jobPostings).where(eq(jobPostings.id, id)).get();
    if (!existing) return c.json({ error: "Job posting not found" }, 404);

    const updates: any = {};
    const text = ['title', 'country', 'sector', 'salaryText', 'description', 'employer', 'employerReference', 'currency', 'tradeCategory'];
    for (const k of text) if (body[k] !== undefined) updates[k] = body[k];
    if (body.collar !== undefined) updates.collar = body.collar;
    if (body.tier !== undefined) updates.tier = body.tier;
    if (body.status !== undefined) updates.status = body.status;
    if (body.salaryMinPaise !== undefined) updates.salaryMinPaise = body.salaryMinPaise;
    if (body.salaryMaxPaise !== undefined) updates.salaryMaxPaise = body.salaryMaxPaise;
    if (body.vacancies !== undefined) updates.vacancies = body.vacancies;
    if (body.experienceYearsMin !== undefined) updates.experienceYearsMin = body.experienceYearsMin;
    if (body.ageMin !== undefined) updates.ageMin = body.ageMin;
    if (body.ageMax !== undefined) updates.ageMax = body.ageMax;
    if (body.deadline !== undefined) updates.deadline = body.deadline;
    if (body.visaProvided !== undefined) updates.visaProvided = body.visaProvided;
    if (body.medicalRequired !== undefined) updates.medicalRequired = body.medicalRequired;
    if (body.featured !== undefined) updates.featured = body.featured;
    if (Array.isArray(body.benefits)) updates.benefitsJson = JSON.stringify(body.benefits);
    if (Array.isArray(body.requirements)) updates.requirementsJson = JSON.stringify(body.requirements);

    await db.update(jobPostings).set(updates).where(eq(jobPostings.id, id));
    return c.json({ success: true, id, message: "Job posting updated." });
  } catch (error: any) {
    return c.json({ error: "Failed to update job posting", details: error.message }, 500);
  }
});

// ============================================================
// PAID EXCLUSIVE COMMUNITY — ADMIN-MANAGED MEMBERSHIP PLANS
// Superadmin controls prices, durations, tiers, perks, active state.
// ============================================================

// GET /api/manpower/membership-plans — list all plans (incl. inactive)
manpowerRouter.get('/membership-plans', async (c) => {
  if (c.get('user')?.role !== 'super_admin') return c.json({ error: 'Forbidden — super admin only' }, 403);
  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  try {
    await seedMembershipPlans(db);
    const list = await db.select().from(membershipPlans).all();
    list.sort((a: any, b: any) => (a.sortOrder || 0) - (b.sortOrder || 0));
    return c.json({ success: true, plans: list });
  } catch (error: any) {
    return c.json({ error: "Failed to fetch membership plans", details: error.message }, 500);
  }
});

// POST /api/manpower/membership-plans — create a plan
manpowerRouter.post('/membership-plans', async (c) => {
  if (c.get('user')?.role !== 'super_admin') return c.json({ error: 'Forbidden — super admin only' }, 403);
  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  const body = await c.req.json().catch(() => ({})) as any;
  if (!body.key || !body.name || !body.pricePaise || !body.durationDays) {
    return c.json({ error: "Missing required fields: key, name, pricePaise, durationDays" }, 400);
  }
  const now = Math.floor(Date.now() / 1000);
  try {
    const id = crypto.randomUUID();
    await db.insert(membershipPlans).values({
      id, key: body.key, name: body.name, description: body.description || null,
      pricePaise: body.pricePaise, durationDays: body.durationDays,
      tier: body.tier || 'basic', perksJson: Array.isArray(body.perks) ? JSON.stringify(body.perks) : '[]',
      active: body.active !== false, sortOrder: body.sortOrder ?? 0, createdAt: now, updatedAt: now,
    });
    await auditEvent(c as any, { action: 'MEMBERSHIP_PLAN_CREATED', entityName: 'membership_plans', entityId: id, afterState: { key: body.key, pricePaise: body.pricePaise } }).catch(() => {});
    return c.json({ success: true, id, message: "Membership plan created." });
  } catch (error: any) {
    return c.json({ error: "Failed to create membership plan", details: error.message }, 500);
  }
});

// PUT /api/manpower/membership-plans/:id — update a plan
manpowerRouter.put('/membership-plans/:id', async (c) => {
  if (c.get('user')?.role !== 'super_admin') return c.json({ error: 'Forbidden — super admin only' }, 403);
  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({})) as any;
  try {
    const existing = await db.select().from(membershipPlans).where(eq(membershipPlans.id, id)).get();
    if (!existing) return c.json({ error: "Membership plan not found" }, 404);
    const updates: any = { updatedAt: Math.floor(Date.now() / 1000) };
    if (body.key !== undefined) updates.key = body.key;
    if (body.name !== undefined) updates.name = body.name;
    if (body.description !== undefined) updates.description = body.description;
    if (body.pricePaise !== undefined) updates.pricePaise = body.pricePaise;
    if (body.durationDays !== undefined) updates.durationDays = body.durationDays;
    if (body.tier !== undefined) updates.tier = body.tier;
    if (Array.isArray(body.perks)) updates.perksJson = JSON.stringify(body.perks);
    if (body.active !== undefined) updates.active = body.active;
    if (body.sortOrder !== undefined) updates.sortOrder = body.sortOrder;
    await db.update(membershipPlans).set(updates).where(eq(membershipPlans.id, id));
    return c.json({ success: true, id, message: "Membership plan updated." });
  } catch (error: any) {
    return c.json({ error: "Failed to update membership plan", details: error.message }, 500);
  }
});

// DELETE /api/manpower/membership-plans/:id — deactivate a plan
manpowerRouter.delete('/membership-plans/:id', async (c) => {
  if (c.get('user')?.role !== 'super_admin') return c.json({ error: 'Forbidden — super admin only' }, 403);
  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  const id = c.req.param('id');
  try {
    await db.update(membershipPlans).set({ active: false, updatedAt: Math.floor(Date.now() / 1000) }).where(eq(membershipPlans.id, id));
    return c.json({ success: true, id, message: "Membership plan deactivated." });
  } catch (error: any) {
    return c.json({ error: "Failed to deactivate membership plan", details: error.message }, 500);
  }
});

// PATCH /api/manpower/clients/:id/membership — staff manual grant/revoke
manpowerRouter.patch('/clients/:id/membership', async (c) => {
  const role = c.get('user')?.role;
  if (role !== 'super_admin' && role !== 'manager') return c.json({ error: 'Forbidden' }, 403);
  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({})) as { exclusiveMember?: boolean; planKey?: string; durationDays?: number };
  const now = Math.floor(Date.now() / 1000);
  try {
    const client = await db.select().from(clients).where(eq(clients.id, id)).get();
    if (!client) return c.json({ error: "Client not found" }, 404);
    const updates: any = { updatedAt: now };
    if (body.exclusiveMember === true) {
      updates.exclusiveMember = true;
      updates.exclusivePlan = body.planKey || client.exclusivePlan || 'exclusive-30';
      updates.exclusiveSince = client.exclusiveSince || now;
      const base = (client.exclusiveMember && client.exclusiveExpiresAt && client.exclusiveExpiresAt > now) ? client.exclusiveExpiresAt : now;
      updates.exclusiveExpiresAt = base + (body.durationDays || 30) * 86400;
    } else if (body.exclusiveMember === false) {
      updates.exclusiveMember = false;
      updates.exclusiveExpiresAt = null;
    }
    await db.update(clients).set(updates).where(eq(clients.id, id));
    await auditEvent(c as any, { action: 'MEMBERSHIP_STAFF_UPDATE', entityName: 'clients', entityId: id, afterState: updates }).catch(() => {});
    return c.json({ success: true, message: "Client membership updated." });
  } catch (error: any) {
    return c.json({ error: "Failed to update client membership", details: error.message }, 500);
  }
});

// DELETE /api/manpower/jobs/:id — archive a job posting (soft delete, keeps audit trail)
manpowerRouter.delete('/jobs/:id', async (c) => {
  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  const id = c.req.param('id');
  try {
    const existing = await db.select().from(jobPostings).where(eq(jobPostings.id, id)).get();
    if (!existing) return c.json({ error: "Job posting not found" }, 404);
    await db.update(jobPostings).set({ status: 'archived' }).where(eq(jobPostings.id, id));
    await auditEvent(c as any, { action: 'JOB_ARCHIVED', entityName: 'job_postings', entityId: id, afterState: { id, status: 'archived' } }).catch(() => {});
    return c.json({ success: true, id, message: "Job posting archived." });
  } catch (error: any) {
    return c.json({ error: "Failed to archive job posting", details: error.message }, 500);
  }
});

// ============================================================
// APP SETTINGS — owner-controlled feature switches
// ============================================================

// GET /api/manpower/settings — read feature switches (superadmin)
manpowerRouter.get('/settings', async (c) => {
  if (c.get('user')?.role !== 'super_admin') return c.json({ error: 'Forbidden — super admin only' }, 403);
  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  try {
    const row = await db.select().from(appSettings).where(eq(appSettings.key, 'exclusive_community_enabled')).get();
    return c.json({ success: true, exclusiveCommunityEnabled: row?.value !== 'false' });
  } catch (error: any) {
    return c.json({ error: "Failed to fetch settings", details: error.message }, 500);
  }
});

// PUT /api/manpower/settings — set feature switches (superadmin)
manpowerRouter.put('/settings', async (c) => {
  if (c.get('user')?.role !== 'super_admin') return c.json({ error: 'Forbidden — super admin only' }, 403);
  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  const body = await c.req.json().catch(() => ({})) as { exclusiveCommunityEnabled?: boolean };
  const now = Math.floor(Date.now() / 1000);
  try {
    const value = body.exclusiveCommunityEnabled === false ? 'false' : 'true';
    await db.insert(appSettings).values({ key: 'exclusive_community_enabled', value, updatedAt: now })
      .onConflictDoUpdate({ target: appSettings.key, set: { value, updatedAt: now } });
    await auditEvent(c as any, { action: 'SETTINGS_UPDATED', entityName: 'app_settings', entityId: 'exclusive_community_enabled', afterState: { value } }).catch(() => {});
    return c.json({ success: true, exclusiveCommunityEnabled: value === 'true' });
  } catch (error: any) {
    return c.json({ error: "Failed to update settings", details: error.message }, 500);
  }
});
