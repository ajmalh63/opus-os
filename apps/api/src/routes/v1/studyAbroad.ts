import { Hono } from 'hono';
import { getDb } from '../../db/client.js';
import { studyAbroadApplications, clients, bookings, appSettings } from '../../db/schema.js';
import { eq, desc, and, or, sql, inArray } from 'drizzle-orm';
import { computeProfileCompleteness, GATE_PCT } from '../../lib/studyAbroadMatch.js';
import { apiKeyAuth } from '../../middleware/apiKeyAuth.js';
import { idempotency } from '../../middleware/idempotency.js';
import { matchApplication, normalizeEnglish } from '../../lib/studyAbroadMatch.js';
import { auditEvent } from '../../middleware/audit.js';
import { dispatchWebhook } from '../../infra/webhookDispatcher.js';

export const v1StudyAbroadRouter = new Hono<{ Bindings: { DB: D1Database } }>();

const now = () => Math.floor(Date.now() / 1000);
const uid = () => `SBA-${now()}-${crypto.randomUUID().slice(0, 8)}`;

// POST /api/v1/study-abroad/match — Live Profile Eligibility Match Engine (v1.1: 9 exams, normalized to IELTS, gate-aware)
v1StudyAbroadRouter.post('/match', apiKeyAuth(['study-abroad:read']), async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const gpa = Number(body.gpa ?? body.cgpa) || 7.0;
  const rawEnglishScore = body.englishScore ?? body.ielts ?? body.score;
  const englishTest = body.englishTest || (body.ielts != null ? 'IELTS' : 'IELTS');
  const englishScore = rawEnglishScore != null ? normalizeEnglish(Number(rawEnglishScore), englishTest) ?? Number(rawEnglishScore) : 6.5;
  const targetCountry = body.targetCountry || 'United Kingdom';
  const tuitionBudgetLakhs = Number(body.tuitionBudgetLakhs ?? body.tuitionBudget) || 20;
  // Allow caller to override uni thresholds (optional), else sensible defaults
  const minGpa = body.minGpa != null ? Number(body.minGpa) : 6.5;
  const minEnglishScore = body.minEnglishScore != null ? Number(body.minEnglishScore) : 6.0;

  const result = matchApplication(
    { cgpa: gpa, englishScore, tuitionBudget: tuitionBudgetLakhs, targetCountry },
    { minGpa, minEnglishScore, country: targetCountry, tuitionLpaMin: body.tuitionLpaMin ?? 15, tuitionLpaMax: body.tuitionLpaMax ?? 25 },
  );

  return c.json({
    success: true,
    data: { ...result, normalized: { englishTest, rawEnglishScore, normalizedEnglishScore: englishScore } },
  });
});

// GET /api/v1/study-abroad/gate — Strategy Session gate state (80% + booking, v1.1)
v1StudyAbroadRouter.get('/gate', apiKeyAuth(['study-abroad:read']), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB unavailable' }, 500);
  const db = getDb(c.env.DB);
  const clientId = (c.req.query('clientId') || '').trim();
  if (!clientId) return c.json({ error: 'Validation Error', message: 'clientId query param is required.' }, 400);
  try {
    const client = await db.select().from(clients).where(eq(clients.id, clientId)).get();
    if (!client) return c.json({ error: 'Not Found', message: `Client '${clientId}' not found.` }, 404);
    let gatePct = GATE_PCT;
    try {
      const row = await db.select().from(appSettings).where(eq(appSettings.key, 'study_abroad_gate_pct')).get();
      const v = row?.value ? Number(row.value) : NaN;
      if (!Number.isNaN(v) && v >= 50 && v <= 100) gatePct = v;
    } catch {}
    const completeness = computeProfileCompleteness((client as any).intakeContext);
    const profileComplete = completeness.pct >= gatePct;
    const activeBooking = await db.select().from(bookings).where(
      and(
        eq(bookings.division, 'study-abroad'),
        or(eq(bookings.clientId, clientId), (client as any).email ? eq(bookings.attendeeEmail, (client as any).email) : sql`0=1`),
        inArray(bookings.status, ['scheduled', 'rescheduled', 'completed'])
      )
    ).orderBy(desc(bookings.startTime)).get() as any;
    let sessionStatus: 'required' | 'scheduled' | 'completed' = 'required';
    if (activeBooking) {
      if (activeBooking.status === 'completed') sessionStatus = 'completed';
      else if (['scheduled', 'rescheduled'].includes(activeBooking.status) && (activeBooking.startTime || 0) > Math.floor(Date.now()/1000)) sessionStatus = 'scheduled';
    }
    const settingRow = await db.select().from(appSettings).where(eq(appSettings.key, 'cal_booking_links')).get() as any;
    let bookingUrl = 'https://cal.opusoverseas.com/counseling';
    try { if (settingRow?.value) { const links = JSON.parse(settingRow.value); if (links['study-abroad']) bookingUrl = links['study-abroad']; } } catch {}
    try {
      const u = new URL(bookingUrl.startsWith('http') ? bookingUrl : `https://${bookingUrl}`);
      if ((client as any).name) u.searchParams.set('name', (client as any).name);
      if ((client as any).email) u.searchParams.set('email', (client as any).email);
      if ((client as any).phone) u.searchParams.set('phone', (client as any).phone);
      u.searchParams.set('notes', `OpusOS Portal Token: ${clientId}`);
      bookingUrl = u.toString();
    } catch {}
    return c.json({ success: true, data: { clientId, gatePct, profileComplete, completeness, sessionStatus, sessionMandatory: true, booking: activeBooking ? { id: activeBooking.id, title: activeBooking.title, startTime: activeBooking.startTime, endTime: activeBooking.endTime, status: activeBooking.status } : null, bookingUrl } });
  } catch (err: any) {
    return c.json({ error: 'Failed to retrieve gate state', details: err.message }, 500);
  }
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
