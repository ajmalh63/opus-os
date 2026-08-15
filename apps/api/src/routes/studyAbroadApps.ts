import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { getDb } from '../db/client.js';
import { clients, engagements, studyAbroadApplications, tasks } from '../db/schema.js';
import { eq, and, gte, lte, inArray, sql } from 'drizzle-orm';
import { auditEvent } from '../middleware/audit.js';
import { createStaffAlert } from '../infra/staffAlerts.js';
import {
  createStudyAbroadApplicationSchema, updateStudyAbroadApplicationSchema,
  updateApplicationStatusSchema, updateApplicationOfferSchema, updateApplicationDocsSchema
} from '@opusos/shared';
import { matchApplication, profileFromIntakeContext, normalizeEnglish, type UniRequirements } from '../lib/studyAbroadMatch.js';

// Study Abroad applications — snapshot model (Phase 4).
// No university catalog: each application stores the modal snapshot
// (universityJson). Match/Reach/Safe is computed live vs the student profile.
// Staff surface mounted at /api/study-abroad (RBAC counselor+).

export const studyAbroadAppsRouter = new Hono<{ Bindings: { DB: D1Database } }>();

// ─── Status machine (no-jump rules, mirrors visa/kanban invariants) ───
const TRANSITIONS: Record<string, string[]> = {
  shortlisted: ['docs_ready', 'withdrawn'],
  docs_ready: ['submitted', 'shortlisted', 'withdrawn'],
  submitted: ['under_review', 'withdrawn'],
  under_review: ['offer_letter', 'rejected', 'withdrawn'],
  offer_letter: ['deposit_paid', 'rejected', 'withdrawn'],
  deposit_paid: ['enrolled', 'withdrawn'],
  enrolled: [],
  rejected: [],
  withdrawn: [],
};

const TERMINAL = new Set(['enrolled', 'rejected', 'withdrawn']);

function parseSnapshot(row: any): any {
  try { return JSON.parse(row.universityJson); } catch { return {}; }
}

function parseDocs(row: any): Record<string, string> {
  try { return JSON.parse(row.docsChecklistJson || '{}'); } catch { return {}; }
}

function parseConditions(row: any): string[] {
  try { return JSON.parse(row.offerConditionsJson || '[]'); } catch { return []; }
}

/** Serialize an application row for API responses (snapshot + live match tier). */
function serializeApplication(row: any, client?: any) {
  const uni = parseSnapshot(row);
  const profile = profileFromIntakeContext(client?.intakeContext);
  const req: UniRequirements = {
    minGpa: uni.minGpa ?? null,
    minEnglishScore: normalizeEnglish(uni.minEnglishScore, uni.englishTest),
    tuitionLpaMin: uni.tuitionLpaMin ?? null,
    tuitionLpaMax: uni.tuitionLpaMax ?? null,
    country: uni.country ?? null,
    program: uni.program ?? null,
  };
  const match = matchApplication(profile, req);
  return {
    id: row.id,
    clientId: row.clientId,
    status: row.status,
    university: uni,
    match,
    docsChecklist: parseDocs(row),
    offer: {
      offerLetterKey: row.offerLetterKey,
      offerType: row.offerType,
      offerConditions: parseConditions(row),
      offerDecision: row.offerDecision,
      acceptanceDeadline: row.acceptanceDeadline,
      depositAmountPaise: row.depositAmountPaise,
      depositDeadline: row.depositDeadline,
      depositPaid: !!row.depositPaid,
    },
    rejectionReason: row.rejectionReason,
    decisionDate: row.decisionDate,
    submittedAt: row.submittedAt,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ─── Auto-task triggers (deadline management — dispatch rides integration wave) ───
async function createTask(db: any, clientId: string, title: string, description: string, priority: string, dueDate: number) {
  await db.insert(tasks).values({
    id: crypto.randomUUID(),
    clientId,
    title,
    description,
    priority,
    status: 'open',
    cos: 'standard',
    dueDate,
    createdAt: Math.floor(Date.now() / 1000),
    updatedAt: Math.floor(Date.now() / 1000)
  });
}

async function handleStatusSideEffects(db: any, c: any, row: any, newStatus: string, now: number) {
  const uni = parseSnapshot(row);
  if (newStatus === 'submitted' && !row.submittedAt) {
    await db.update(studyAbroadApplications).set({ submittedAt: now, updatedAt: now }).where(eq(studyAbroadApplications.id, row.id));
    await createTask(db, row.clientId, `University Decision Follow-up: ${uni.name}`, `Check admission portal status for ${uni.program} (${uni.intake}).`, 'medium', now + 14 * 86400);
  }
  if (newStatus === 'offer_letter') {
    const due = row.acceptanceDeadline || now + 14 * 86400;
    await createTask(db, row.clientId, `Acceptance Decision: ${uni.name}`, `Offer received for ${uni.program}. Decide accept/decline by deadline.`, 'high', due);
  }
  if (newStatus === 'deposit_paid') {
    await createTask(db, row.clientId, `Visa Documentation Checklist: ${uni.name}`, `Deposit paid. Compile financial proof, visa files, and checklist items.`, 'high', now + 3 * 86400);
  }
}

// GET /api/study-abroad/applications — list (filters: clientId, status, country, intake, deadlineBefore)
studyAbroadAppsRouter.get('/', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  try {
    const { clientId, status, country, intake, deadlineBefore } = c.req.query();
    let rows = await db.select().from(studyAbroadApplications).all();
    if (clientId) rows = rows.filter(r => r.clientId === clientId);
    if (status) rows = rows.filter(r => r.status === status);
    if (country) rows = rows.filter(r => (parseSnapshot(r).country || '').toLowerCase() === country.toLowerCase());
    if (intake) rows = rows.filter(r => (parseSnapshot(r).intake || '').toLowerCase().includes(intake.toLowerCase()));
    if (deadlineBefore) rows = rows.filter(r => {
      const d = parseSnapshot(r).deadline;
      return d && d <= Number(deadlineBefore);
    });
    rows.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    const clientIds = [...new Set(rows.map(r => r.clientId))];
    const allClients = await db.select().from(clients).all();
    const applications = rows.map(r => serializeApplication(r, allClients.find(cl => cl.id === r.clientId)));
    return c.json({ success: true, applications });
  } catch (e: any) {
    return c.json({ error: 'Applications fetch failed', details: e?.message }, 500);
  }
});

// GET /api/study-abroad/applications/pipeline — aggregate for the kanban health strip
studyAbroadAppsRouter.get('/pipeline', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const now = Math.floor(Date.now() / 1000);
  try {
    const rows = await db.select().from(studyAbroadApplications).all();
    const counts: Record<string, number> = {};
    for (const r of rows) counts[r.status] = (counts[r.status] || 0) + 1;

    const stuck = rows
      .filter(r => !TERMINAL.has(r.status) && (r.updatedAt || 0) < now - 7 * 86400)
      .map(r => ({ id: r.id, clientId: r.clientId, status: r.status, university: parseSnapshot(r).name, updatedAt: r.updatedAt }));

    const decisionsPending = rows
      .filter(r => r.status === 'offer_letter' && r.offerDecision === 'pending')
      .map(r => ({ id: r.id, clientId: r.clientId, university: parseSnapshot(r).name, acceptanceDeadline: r.acceptanceDeadline }));

    const deadlinesSoon = rows
      .filter(r => {
        const uni = parseSnapshot(r);
        const candidates = [uni.deadline, r.acceptanceDeadline, r.depositDeadline].filter(Boolean) as number[];
        return candidates.some(d => d >= now && d <= now + 7 * 86400);
      })
      .map(r => {
        const uni = parseSnapshot(r);
        const next = [uni.deadline, r.acceptanceDeadline, r.depositDeadline].filter(Boolean).sort((a, b) => a - b)[0];
        return { id: r.id, clientId: r.clientId, university: uni.name, deadline: next, kind: next === uni.deadline ? 'application' : next === r.acceptanceDeadline ? 'acceptance' : 'deposit' };
      });

    return c.json({ success: true, counts, stuck, decisionsPending, deadlinesSoon, total: rows.length });
  } catch (e: any) {
    return c.json({ error: 'Pipeline fetch failed', details: e?.message }, 500);
  }
});

// POST /api/study-abroad/applications — create from the modal snapshot
studyAbroadAppsRouter.post('/', zValidator('json', createStudyAbroadApplicationSchema), async (c) => {
  const body = c.req.valid('json');
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const now = Math.floor(Date.now() / 1000);
  try {
    const client = await db.select().from(clients).where(eq(clients.id, body.clientId)).get();
    if (!client) return c.json({ error: 'Student not found' }, 404);

    const id = crypto.randomUUID();
    await db.insert(studyAbroadApplications).values({
      id,
      clientId: body.clientId,
      universityJson: JSON.stringify(body.university),
      status: body.status,
      notes: body.notes ?? null,
      createdAt: now,
      updatedAt: now
    });

    // Ensure a study-abroad engagement exists (pipeline visibility)
    const eng = await db.select().from(engagements).where(and(eq(engagements.clientId, body.clientId), eq(engagements.division, 'study-abroad'))).get();
    if (!eng) {
      await db.insert(engagements).values({
        id: crypto.randomUUID(),
        clientId: body.clientId,
        division: 'study-abroad',
        title: `Study Abroad — ${body.university.program}`,
        stageKey: 'lead',
        outstandingBalance: 0,
        status: 'active',
        createdAt: now,
        updatedAt: now
      });
    }

    await auditEvent(c as any, { action: 'APPLICATION_CREATED', entityName: 'study_abroad_applications', entityId: id, afterState: { clientId: body.clientId, university: body.university.name, status: body.status } }).catch(() => {});
    return c.json({ success: true, id, message: `Application created for ${body.university.name}.` });
  } catch (e: any) {
    return c.json({ error: 'Application creation failed', details: e?.message }, 500);
  }
});

// GET /api/study-abroad/applications/:id — detail with live match tier
studyAbroadAppsRouter.get('/:id', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  try {
    const row = await db.select().from(studyAbroadApplications).where(eq(studyAbroadApplications.id, c.req.param('id'))).get();
    if (!row) return c.json({ error: 'Application not found' }, 404);
    const client = await db.select().from(clients).where(eq(clients.id, row.clientId)).get();
    return c.json({ success: true, application: serializeApplication(row, client) });
  } catch (e: any) {
    return c.json({ error: 'Application fetch failed', details: e?.message }, 500);
  }
});

// PATCH /api/study-abroad/applications/:id — update snapshot fields
studyAbroadAppsRouter.patch('/:id', zValidator('json', updateStudyAbroadApplicationSchema), async (c) => {
  const body = c.req.valid('json');
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const now = Math.floor(Date.now() / 1000);
  try {
    const row = await db.select().from(studyAbroadApplications).where(eq(studyAbroadApplications.id, c.req.param('id'))).get();
    if (!row) return c.json({ error: 'Application not found' }, 404);
    const updates: any = { updatedAt: now };
    if (body.university) {
      const merged = { ...parseSnapshot(row), ...body.university };
      updates.universityJson = JSON.stringify(merged);
    }
    if (body.notes !== undefined) updates.notes = body.notes;
    await db.update(studyAbroadApplications).set(updates).where(eq(studyAbroadApplications.id, row.id));
    await auditEvent(c as any, { action: 'APPLICATION_UPDATED', entityName: 'study_abroad_applications', entityId: row.id, afterState: { fields: Object.keys(updates) } }).catch(() => {});
    return c.json({ success: true, message: 'Application updated.' });
  } catch (e: any) {
    return c.json({ error: 'Application update failed', details: e?.message }, 500);
  }
});

// PATCH /api/study-abroad/applications/:id/status — no-jump machine + auto-tasks
studyAbroadAppsRouter.patch('/:id/status', zValidator('json', updateApplicationStatusSchema), async (c) => {
  const body = c.req.valid('json');
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const now = Math.floor(Date.now() / 1000);
  try {
    const row = await db.select().from(studyAbroadApplications).where(eq(studyAbroadApplications.id, c.req.param('id'))).get();
    if (!row) return c.json({ error: 'Application not found' }, 404);

    const allowed = TRANSITIONS[row.status] || [];
    if (!allowed.includes(body.status)) {
      return c.json({ error: `Cannot move from '${row.status}' to '${body.status}'`, code: 'invalid_transition', allowed }, 409);
    }

    const updates: any = { status: body.status, updatedAt: now };
    if (body.status === 'rejected') updates.rejectionReason = body.rejectionReason ?? null;
    if (body.status === 'offer_letter') updates.decisionDate = now;
    await db.update(studyAbroadApplications).set(updates).where(eq(studyAbroadApplications.id, row.id));

    const updated = { ...row, ...updates };
    await handleStatusSideEffects(db, c, updated, body.status, now);

    await auditEvent(c as any, { action: 'APPLICATION_STATUS', entityName: 'study_abroad_applications', entityId: row.id, afterState: { oldStatus: row.status, newStatus: body.status } }).catch(() => {});
    return c.json({ success: true, message: `Application moved to ${body.status}.` });
  } catch (e: any) {
    return c.json({ error: 'Status update failed', details: e?.message }, 500);
  }
});

// PATCH /api/study-abroad/applications/:id/offer — offer letter management
studyAbroadAppsRouter.patch('/:id/offer', zValidator('json', updateApplicationOfferSchema), async (c) => {
  const body = c.req.valid('json');
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const now = Math.floor(Date.now() / 1000);
  try {
    const row = await db.select().from(studyAbroadApplications).where(eq(studyAbroadApplications.id, c.req.param('id'))).get();
    if (!row) return c.json({ error: 'Application not found' }, 404);

    const updates: any = { updatedAt: now };
    if (body.offerLetterKey !== undefined) updates.offerLetterKey = body.offerLetterKey;
    if (body.offerType !== undefined) updates.offerType = body.offerType;
    if (body.offerConditions !== undefined) updates.offerConditionsJson = JSON.stringify(body.offerConditions);
    if (body.acceptanceDeadline !== undefined) updates.acceptanceDeadline = body.acceptanceDeadline;
    if (body.depositAmountPaise !== undefined) updates.depositAmountPaise = body.depositAmountPaise;
    if (body.depositDeadline !== undefined) updates.depositDeadline = body.depositDeadline;
    if (body.offerDecision !== undefined) {
      updates.offerDecision = body.offerDecision;
      if (body.offerDecision === 'accepted') {
        const due = row.depositDeadline || now + 7 * 86400;
        await createTask(db, row.clientId, `Deposit Payment: ${parseSnapshot(row).name}`, `Offer accepted. Pay deposit of ₹${((row.depositAmountPaise ?? 0) / 100).toFixed(2)} by deadline.`, 'high', due);
      }
    }
    await db.update(studyAbroadApplications).set(updates).where(eq(studyAbroadApplications.id, row.id));
    await auditEvent(c as any, { action: 'OFFER_UPDATED', entityName: 'study_abroad_applications', entityId: row.id, afterState: { fields: Object.keys(updates) } }).catch(() => {});
    return c.json({ success: true, message: 'Offer details updated.' });
  } catch (e: any) {
    return c.json({ error: 'Offer update failed', details: e?.message }, 500);
  }
});

// PATCH /api/study-abroad/applications/:id/docs — per-application checklist
studyAbroadAppsRouter.patch('/:id/docs', zValidator('json', updateApplicationDocsSchema), async (c) => {
  const body = c.req.valid('json');
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const now = Math.floor(Date.now() / 1000);
  try {
    const row = await db.select().from(studyAbroadApplications).where(eq(studyAbroadApplications.id, c.req.param('id'))).get();
    if (!row) return c.json({ error: 'Application not found' }, 404);
    const merged = { ...parseDocs(row), ...body.docs };
    await db.update(studyAbroadApplications).set({ docsChecklistJson: JSON.stringify(merged), updatedAt: now }).where(eq(studyAbroadApplications.id, row.id));
    return c.json({ success: true, docsChecklist: merged });
  } catch (e: any) {
    return c.json({ error: 'Docs update failed', details: e?.message }, 500);
  }
});

// ─── Client portal (token-auth) ───
export const portalStudyAbroadRouter = new Hono<{ Bindings: { DB: D1Database } }>();

// GET /api/public/portal/study-abroad/applications?token= — student tracker
portalStudyAbroadRouter.get('/applications', async (c) => {
  const token = c.req.query('token');
  if (!token) return c.json({ error: 'token is required' }, 400);
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  try {
    const client = await db.select().from(clients).where(eq(clients.id, token)).get();
    if (!client) return c.json({ error: 'Client not found for token' }, 404);
    const rows = await db.select().from(studyAbroadApplications).where(eq(studyAbroadApplications.clientId, token)).all();
    rows.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    return c.json({ success: true, applications: rows.map(r => serializeApplication(r, client)) });
  } catch (e: any) {
    return c.json({ error: 'Applications fetch failed', details: e?.message }, 500);
  }
});

// POST /api/public/portal/study-abroad/applications/:id/accept-offer?token=
portalStudyAbroadRouter.post('/applications/:id/accept-offer', async (c) => {
  const token = c.req.query('token');
  if (!token) return c.json({ error: 'token is required' }, 400);
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const now = Math.floor(Date.now() / 1000);
  try {
    const row = await db.select().from(studyAbroadApplications).where(eq(studyAbroadApplications.id, c.req.param('id'))).get();
    if (!row) return c.json({ error: 'Application not found' }, 404);
    if (row.clientId !== token) return c.json({ error: 'Not your application' }, 403);
    if (row.status !== 'offer_letter') return c.json({ error: 'No offer to accept yet' }, 409);
    if (row.offerDecision !== 'pending') return c.json({ error: 'Decision already recorded' }, 409);

    const body = await c.req.json().catch(() => ({})) as { decision?: string };
    const decision = body.decision === 'declined' ? 'declined' : 'accepted';
    await db.update(studyAbroadApplications).set({ offerDecision: decision, updatedAt: now }).where(eq(studyAbroadApplications.id, row.id));

    if (decision === 'accepted') {
      const due = row.depositDeadline || now + 7 * 86400;
      await createTask(db, row.clientId, `Deposit Payment: ${parseSnapshot(row).name}`, `Offer accepted. Pay deposit of ₹${((row.depositAmountPaise ?? 0) / 100).toFixed(2)} by deadline.`, 'high', due);
      await createStaffAlert(c.env as any, { division: 'study-abroad', type: 'offer_accepted', title: 'Offer accepted by student', body: `${parseSnapshot(row).name} — ${parseSnapshot(row).program}`, clientId: row.clientId, payload: { applicationId: row.id } });
    }
    await auditEvent(c as any, { action: 'OFFER_DECISION', entityName: 'study_abroad_applications', entityId: row.id, afterState: { decision } }).catch(() => {});
    return c.json({ success: true, message: `Offer ${decision}.` });
  } catch (e: any) {
    return c.json({ error: 'Offer decision failed', details: e?.message }, 500);
  }
});