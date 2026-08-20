import { Hono } from 'hono';
import { getDb } from '../../db/client.js';
import { jobPostings, candidateProfiles, manpowerDeployments } from '../../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { apiKeyAuth } from '../../middleware/apiKeyAuth.js';
import { idempotency } from '../../middleware/idempotency.js';
import { auditEvent } from '../../middleware/audit.js';
import { dispatchWebhook } from '../../infra/webhookDispatcher.js';

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
