import { Hono } from 'hono';
import { getDb } from '../../db/client.js';
import { jobPostings, candidateProfiles, manpowerDeployments, clients, tasks } from '../../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { apiKeyAuth } from '../../middleware/apiKeyAuth.js';
import { idempotency } from '../../middleware/idempotency.js';
import { auditEvent } from '../../middleware/audit.js';
import { dispatchWebhook } from '../../infra/webhookDispatcher.js';
import { computeManpowerMatch, calculateProfileCompleteness, MANPOWER_VAS_CATALOG, type VASPlan } from '../../lib/manpowerMatch.js';

export const v1RecruitmentRouter = new Hono<{ Bindings: { DB: D1Database } }>();

const now = () => Math.floor(Date.now() / 1000);
const uid = () => `JOB-${now()}-${crypto.randomUUID().slice(0, 8)}`;

// GET /api/v1/recruitment/jobs — List Open Overseas Job Demands
v1RecruitmentRouter.get('/jobs', apiKeyAuth(['recruitment:read']), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB unavailable' }, 500);
  const db = getDb(c.env.DB);
  const country = c.req.query('country');
  const sector = c.req.query('sector');

  try {
    const rows = await db
      .select()
      .from(jobPostings)
      .where(eq(jobPostings.status, 'open'))
      .orderBy(desc(jobPostings.createdAt))
      .all();

    let filtered = rows;
    if (country) filtered = filtered.filter((j) => j.country.toLowerCase() === country.toLowerCase());
    if (sector) filtered = filtered.filter((j) => j.sector.toLowerCase() === sector.toLowerCase());

    return c.json({
      success: true,
      data: filtered.map((j: any) => ({
        id: j.id,
        title: j.title,
        country: j.country,
        sector: j.sector,
        salaryText: j.salaryText,
        collar: j.collar,
        vacancies: j.vacancies,
        employer: j.employer,
        visaProvided: j.visaProvided,
        createdAt: j.createdAt,
      })),
      count: filtered.length,
    });
  } catch (err: any) {
    return c.json({ error: 'Failed to retrieve jobs', details: err.message }, 500);
  }
});

// POST /api/v1/recruitment/jobs — Create New Job Posting
v1RecruitmentRouter.post('/jobs', apiKeyAuth(['recruitment:write']), idempotency(), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB unavailable' }, 500);
  const db = getDb(c.env.DB);
  const body = await c.req.json().catch(() => ({}));

  const title = (body.title || '').trim();
  const country = (body.country || '').trim();
  const sector = (body.sector || '').trim();
  const salaryText = (body.salaryText || 'Competitive').trim();
  const vacancies = Number(body.vacancies) || 1;
  const employer = body.employer || 'Verified Gulf Employer';

  if (!title || !country || !sector) {
    return c.json({ error: 'Validation Error', message: 'title, country, and sector are required.' }, 400);
  }

  try {
    const jobId = uid();
    await db.insert(jobPostings).values({
      id: jobId,
      title,
      country,
      sector,
      salaryText,
      vacancies,
      employer,
      status: 'open',
      createdAt: now(),
    });

    c.executionCtx?.waitUntil(
      Promise.all([
        auditEvent(c, {
          action: 'JOB_POSTING_CREATED',
          entityName: 'job_postings',
          entityId: jobId,
          result: 'success',
          category: 'workflow',
          actorType: 'service',
          authMethod: 'service_token',
          afterState: { title, country, sector, vacancies, employer },
        }),
        dispatchWebhook(c.env, 'recruitment.job_created', {
          jobId,
          title,
          country,
          sector,
          vacancies,
          createdAt: now(),
        }),
      ]),
    );

    return c.json(
      {
        success: true,
        data: { id: jobId, title, country, sector, salaryText, vacancies, employer, createdAt: now() },
      },
      201,
    );
  } catch (err: any) {
    return c.json({ error: 'Failed to create job posting', details: err.message }, 500);
  }
});

// GET /api/v1/recruitment/deployments — List Candidate Applications & Deployments with Match Triage
v1RecruitmentRouter.get('/deployments', apiKeyAuth(['recruitment:read']), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB unavailable' }, 500);
  const db = getDb(c.env.DB);
  const triageTier = c.req.query('triageTier'); // 'top_match' | 'standard' | 'cold_pool' | 'paid_vas'

  try {
    const [rawDeployments, jobs, allClients, allTasks] = await Promise.all([
      db.select().from(manpowerDeployments).all(),
      db.select().from(jobPostings).all(),
      db.select().from(clients).all(),
      db.select().from(tasks).all().catch(() => []),
    ]);

    const joined = rawDeployments.map((d) => {
      const job = jobs.find((j) => j.id === d.jobId);
      const cl = allClients.find((clnt) => clnt.id === d.clientId);
      const clientVasTask = allTasks.find((t) => t.clientId === d.clientId);
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
        requirements: (() => { try { return JSON.parse(job.requirementsJson || '[]'); } catch { return []; } })(),
      }) : { score: 50, tier: 'standard' as const, strengths: [], gaps: [], reasons: [] };

      const completeness = calculateProfileCompleteness(formJson);

      return {
        id: d.id,
        clientId: d.clientId,
        candidateName: cl?.name || 'Candidate',
        candidateEmail: cl?.email || '',
        candidatePhone: cl?.phone || '',
        jobId: d.jobId,
        jobTitle: job?.title || 'Open Vacancy',
        jobCountry: job?.country || 'Overseas',
        jobSector: job?.sector || '',
        collar: job?.collar || 'blue_collar',
        selectionStatus: d.selectionStatus,
        medicalStatus: d.medicalStatus,
        visaStatus: d.visaStatus,
        flightStatus: d.flightStatus,
        matchScore: match.score,
        matchTier: match.tier,
        matchStrengths: match.strengths,
        matchGaps: match.gaps,
        profileCompletenessPct: completeness.pct,
        hasPaidVas,
        vasServiceTitle: clientVasTask?.title || (cl?.exclusiveMember ? 'Candidate Pass' : null),
        appliedAt: d.appliedAt,
      };
    });

    const filtered = triageTier && triageTier !== 'all'
      ? triageTier === 'paid_vas'
        ? joined.filter((d) => d.hasPaidVas)
        : joined.filter((d) => d.matchTier === triageTier)
      : joined;

    return c.json({
      success: true,
      data: filtered,
      triageSummary: {
        total: joined.length,
        topMatch: joined.filter((d) => d.matchTier === 'top_match').length,
        standard: joined.filter((d) => d.matchTier === 'standard').length,
        coldPool: joined.filter((d) => d.matchTier === 'cold_pool').length,
        paidVas: joined.filter((d) => d.hasPaidVas).length,
      },
    });
  } catch (err: any) {
    return c.json({ error: 'Failed to retrieve deployments', details: err.message }, 500);
  }
});

// POST /api/v1/recruitment/match — Real-time Algorithmic Profile Match
v1RecruitmentRouter.post('/match', apiKeyAuth(['recruitment:read']), async (c) => {
  const body = await c.req.json().catch(() => ({})) as any;
  const candidateProfile = body.candidateProfile;
  const jobRequirements = body.jobRequirements;

  if (!candidateProfile || !jobRequirements) {
    return c.json({ error: 'Validation Error', message: 'candidateProfile and jobRequirements are required.' }, 400);
  }

  const match = computeManpowerMatch(candidateProfile, jobRequirements);
  const completeness = calculateProfileCompleteness(candidateProfile);

  return c.json({
    success: true,
    data: {
      score: match.score,
      tier: match.tier,
      strengths: match.strengths,
      gaps: match.gaps,
      reasons: match.reasons,
      profileCompleteness: completeness,
    },
  });
});

// GET /api/v1/recruitment/vas-plans — List Optional Career Acceleration Services Catalog
v1RecruitmentRouter.get('/vas-plans', apiKeyAuth(['recruitment:read']), async (c) => {
  return c.json({
    success: true,
    data: MANPOWER_VAS_CATALOG.map((plan: VASPlan) => ({
      key: plan.key,
      title: plan.title,
      description: plan.description,
      deliverable: plan.deliverable,
      pricePaise: plan.pricePaise,
      priceRupees: plan.pricePaise / 100,
      durationDays: plan.durationDays,
      slaNotice: `Guaranteed ${plan.durationDays * 24}h SLA fulfillment window`,
      complianceNotice: '100% compliant with ILO C181 & Emigration Act 1983. Standard applications strictly free.',
    })),
  });
});
