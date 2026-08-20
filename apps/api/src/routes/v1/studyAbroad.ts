import { Hono } from 'hono';
import { getDb } from '../../db/client.js';
import { studyAbroadApplications, clients } from '../../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { apiKeyAuth } from '../../middleware/apiKeyAuth.js';
import { idempotency } from '../../middleware/idempotency.js';
import { matchApplication } from '../../lib/studyAbroadMatch.js';
import { auditEvent } from '../../middleware/audit.js';
import { dispatchWebhook } from '../../infra/webhookDispatcher.js';

export const v1StudyAbroadRouter = new Hono<{ Bindings: { DB: D1Database } }>();

const now = () => Math.floor(Date.now() / 1000);
const uid = () => `SBA-${now()}-${crypto.randomUUID().slice(0, 8)}`;

// POST /api/v1/study-abroad/match — Live Profile Eligibility Match Engine
v1StudyAbroadRouter.post('/match', apiKeyAuth(['study-abroad:read']), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const gpa = Number(body.gpa) || 7.0;
  const ielts = Number(body.ielts) || 6.5;
  const targetCountry = body.targetCountry || 'United Kingdom';
  const tuitionBudgetLakhs = Number(body.tuitionBudgetLakhs) || 20;

  const result = matchApplication(
    { cgpa: gpa, englishScore: ielts, tuitionBudget: tuitionBudgetLakhs, targetCountry },
    { minGpa: 6.5, minEnglishScore: 6.0, country: targetCountry, tuitionLpaMin: 15, tuitionLpaMax: 25 },
  );

  return c.json({
    success: true,
    data: result,
  });
});

// GET /api/v1/study-abroad/applications — List Applications
v1StudyAbroadRouter.get('/applications', apiKeyAuth(['study-abroad:read']), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB unavailable' }, 500);
  const db = getDb(c.env.DB);
  const clientId = c.req.query('clientId');

  try {
    let rows: any[] = [];
    if (clientId) {
      rows = await db
        .select()
        .from(studyAbroadApplications)
        .where(eq(studyAbroadApplications.clientId, clientId))
        .orderBy(desc(studyAbroadApplications.createdAt))
        .all();
    } else {
      rows = await db
        .select()
        .from(studyAbroadApplications)
        .orderBy(desc(studyAbroadApplications.createdAt))
        .limit(50)
        .all();
    }

    return c.json({
      success: true,
      data: rows.map((r: any) => {
        let uni: any = {};
        try {
          uni = JSON.parse(r.universityJson);
        } catch {
          uni = {};
        }
        return {
          id: r.id,
          clientId: r.clientId,
          universityName: uni.name || 'University',
          programName: uni.program || 'Degree Program',
          targetCountry: uni.country || 'Global',
          targetIntake: uni.intake || 'Fall 2026',
          status: r.status,
          decisionDate: r.decisionDate,
          createdAt: r.createdAt,
        };
      }),
      count: rows.length,
    });
  } catch (err: any) {
    return c.json({ error: 'Failed to retrieve applications', details: err.message }, 500);
  }
});

// POST /api/v1/study-abroad/applications — Create Application Snapshot
v1StudyAbroadRouter.post('/applications', apiKeyAuth(['study-abroad:write']), idempotency(), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB unavailable' }, 500);
  const db = getDb(c.env.DB);
  const body = await c.req.json().catch(() => ({}));

  const clientId = (body.clientId || '').trim();
  const universityName = (body.universityName || '').trim();
  const programName = (body.programName || '').trim();
  const targetCountry = (body.targetCountry || 'United Kingdom').trim();
  const targetIntake = (body.targetIntake || 'Fall 2026').trim();

  if (!clientId || !universityName || !programName) {
    return c.json({ error: 'Validation Error', message: 'clientId, universityName, and programName are required.' }, 400);
  }

  try {
    const client = await db.select().from(clients).where(eq(clients.id, clientId)).get();
    if (!client) return c.json({ error: 'Not Found', message: `Client '${clientId}' not found.` }, 404);

    const appId = uid();
    const universityJson = JSON.stringify({
      name: universityName,
      program: programName,
      country: targetCountry,
      intake: targetIntake,
    });

    await db.insert(studyAbroadApplications).values({
      id: appId,
      clientId,
      universityJson,
      status: 'shortlisted',
      docsChecklistJson: JSON.stringify({
        passport: 'pending',
        transcripts: 'pending',
        ielts: 'pending',
        sop: 'pending',
        lor: 'pending',
      }),
      createdAt: now(),
      updatedAt: now(),
    });

    c.executionCtx?.waitUntil(
      Promise.all([
        auditEvent(c, {
          action: 'APPLICATION_CREATED',
          entityName: 'study_abroad_applications',
          entityId: appId,
          result: 'success',
          category: 'workflow',
          actorType: 'service',
          authMethod: 'service_token',
          afterState: { clientId, universityName, programName, targetCountry, targetIntake },
        }),
        dispatchWebhook(c.env, 'study_abroad.application_created', {
          applicationId: appId,
          clientId,
          universityName,
          programName,
          targetCountry,
          targetIntake,
          createdAt: now(),
        }),
      ]),
    );

    return c.json(
      {
        success: true,
        data: {
          id: appId,
          clientId,
          universityName,
          programName,
          targetCountry,
          targetIntake,
          status: 'shortlisted',
          createdAt: now(),
        },
      },
      201,
    );
  } catch (err: any) {
    return c.json({ error: 'Failed to create application', details: err.message }, 500);
  }
});
