import { resolveClientByToken } from '../lib/clientToken.js';
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { getDb } from '../db/client.js';
import { clients, engagements, studyAbroadApplications, tasks, documents, consents } from '../db/schema.js';
import { eq, and, gte, lte, inArray, sql } from 'drizzle-orm';
import { auditEvent } from '../middleware/audit.js';
import { publishSyncEvent } from './sync.js';
import { createStaffAlert } from '../infra/staffAlerts.js';
import { sendNotification } from '../infra/notify.js';
import { getListmonkTemplateId } from '../infra/listmonk.js';
import { studyAbroadMilestoneTemplate } from '../infra/emailTemplates.js';
import { guardUpload, sha256Hex } from '../infra/uploadGuard.js';
import { scanDocumentBytes } from '../lib/docScan.js';
import {
  createStudyAbroadApplicationSchema, updateStudyAbroadApplicationSchema,
  updateApplicationStatusSchema, updateApplicationOfferSchema, updateApplicationDocsSchema,
  studentProfileSchema
} from '@opusos/shared';
import { matchApplication, profileFromIntakeContext, normalizeEnglish, computeProfileCompleteness, type UniRequirements } from '../lib/studyAbroadMatch.js';

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
    const client = await db.select().from(clients).where(eq(clients.id, row.clientId)).get();
    if (client?.email) {
      const { subject, html } = studyAbroadMilestoneTemplate({
        clientName: client.name || 'Valued Student',
        universityName: uni.name || 'University',
        courseName: uni.program,
        stageTitle: 'Offer Letter Received 🎉',
        details: `Congratulations! You have received an offer from ${uni.name} for ${uni.program || 'your program'} (${uni.intake || 'upcoming intake'}). Log in to your portal to review conditions and make your decision by ${new Date(due * 1000).toLocaleDateString('en-IN')}.`,
        portalUrl: 'https://opusoverseas.com/login',
      });
      const offerDetails = `Congratulations! You have received an offer from ${uni.name} for ${uni.program || 'your program'} (${uni.intake || 'upcoming intake'}). Log in to your portal to review conditions and make your decision by ${new Date(due * 1000).toLocaleDateString('en-IN')}.`;
      await sendNotification(c.env as any, db, {
        channel: 'email',
        to: client.email,
        subject, body: html,
        templateId: getListmonkTemplateId(c.env as any, 'studyAbroadMilestone'),
        data: { ClientName: client.name || 'Valued Student', UniversityName: uni.name || 'University', CourseName: uni.program || '', StageTitle: 'Offer Letter Received 🎉', Details: offerDetails, PortalUrl: 'https://opusoverseas.com/login', Subject: subject },
      }).catch(() => {});
    try { await publishSyncEvent(c.env as any, { channel: `staff:global:alerts`, type: 'DOCUMENT_UPLOADED', payload: {} }, (c as any).executionCtx); } catch {}
    }
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
    try { await publishSyncEvent(c.env as any, { channel: `client:${row.clientId}:applications`, type: 'APPLICATION_STATUS_CHANGED', payload: { applicationId: row.id, oldStatus: row.status, newStatus: body.status } }, (c as any).executionCtx); await publishSyncEvent(c.env as any, { channel: `staff:division:study-abroad:pipeline`, type: 'APPLICATION_STATUS_CHANGED', payload: { applicationId: row.id, newStatus: body.status } }, (c as any).executionCtx); } catch {}
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
export const portalStudyAbroadRouter = new Hono<{ Bindings: { DB: D1Database; BETTER_AUTH_SECRET?: string; BUCKET?: any } }>();

// Sign upload URLs (mirrors portal.ts — HMAC over clientId:filename:expires[:appId:docKey])
async function signUploadPath(secret: string, clientId: string, filename: string, expires: number, appId?: string, docKey?: string, label?: string): Promise<string> {
  if (!secret) throw new Error('BETTER_AUTH_SECRET not configured — cannot sign upload URL');
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const data = `${clientId}:${filename}:${expires}${appId ? `:${appId}:${docKey}` : ''}${label ? `:${label}` : ''}`;
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a.charCodeAt(i) ^ b.charCodeAt(i));
  return diff === 0;
}

// GET /api/public/portal/study-abroad/profile?token= — profile + completeness + consent
portalStudyAbroadRouter.get('/profile', async (c) => {
  const token = c.req.query('token');
  if (!token) return c.json({ error: 'token is required' }, 400);
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  try {
    const client = await resolveClientByToken(db, token);
    if (!client) return c.json({ error: 'Client not found for token' }, 404);
    let ctx: any = {};
    if (client.intakeContext) { try { ctx = JSON.parse(client.intakeContext); } catch { /* tolerate */ } }
    const consent = await db.select().from(consents).where(and(eq(consents.clientId, token), eq(consents.consentType, 'university-sharing'))).get();
    return c.json({
      success: true,
      profile: ctx,
      completeness: computeProfileCompleteness(client.intakeContext),
      universitySharingConsent: consent?.status === 'granted',
      highestQualification: client.highestQualification,
    });
  } catch (e: any) {
    return c.json({ error: 'Profile fetch failed', details: e?.message }, 500);
  }
});

// PUT /api/public/portal/study-abroad/profile?token= — student writes their own data
portalStudyAbroadRouter.put('/profile', zValidator('json', studentProfileSchema), async (c) => {
  const token = c.req.query('token');
  if (!token) return c.json({ error: 'token is required' }, 400);
  const body = c.req.valid('json');
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const now = Math.floor(Date.now() / 1000);
  try {
    const client = await resolveClientByToken(db, token);
    if (!client) return c.json({ error: 'Client not found for token' }, 404);

    let ctx: any = {};
    if (client.intakeContext) { try { ctx = JSON.parse(client.intakeContext); } catch { /* tolerate */ } }
    const beforePct = computeProfileCompleteness(client.intakeContext).pct;
    const merged = { ...ctx, ...body };
    await db.update(clients).set({ intakeContext: JSON.stringify(merged), updatedAt: now }).where(eq(clients.id, token));

    // DPDP: university-sharing consent recorded with notice hash + IP
    if (body.universitySharingConsent === true) {
      const existing = await db.select().from(consents).where(and(eq(consents.clientId, token), eq(consents.consentType, 'university-sharing'))).get();
      if (!existing) {
        const notice = 'OpusOS Consent Notice v1.0: University sharing — your academic profile and documents may be shared with universities you apply to, under DPDP-2023 guidelines.';
        const hash = await sha256Hex(new TextEncoder().encode(notice));
        await db.insert(consents).values({
          id: crypto.randomUUID(),
          clientId: token,
          consentType: 'university-sharing',
          status: 'granted',
          ipAddress: c.req.header('x-real-ip') || c.req.header('cf-connecting-ip') || '127.0.0.1',
          sha256Hash: hash,
          grantedAt: now
        });
      }
    }

    const afterPct = computeProfileCompleteness(JSON.stringify(merged)).pct;
    if (afterPct === 100 && beforePct < 100) {
      await createStaffAlert(c.env as any, { division: 'study-abroad', type: 'profile_complete', title: 'Student profile complete', body: `${client.name} completed their profile (100%) — ready for counselling & shortlisting.`, clientId: token, payload: { pct: 100 } });
      if (client.email) {
        const { subject, html } = studyAbroadMilestoneTemplate({
          clientName: client.name || 'Valued Student',
          universityName: 'Global Universities Advisory',
          stageTitle: 'Profile Complete (100%) 🎓',
          details: 'Thank you! Your study-abroad profile is 100% complete. Our senior counselor has received your file and will reach out with your personalized university shortlist shortly.',
          portalUrl: 'https://opusoverseas.com/login',
        });
        await sendNotification(c.env as any, db, {
          channel: 'email',
          to: client.email,
          subject, body: html,
          templateId: getListmonkTemplateId(c.env as any, 'studyAbroadMilestone'),
          data: { ClientName: client.name || 'Valued Student', UniversityName: 'Global Universities Advisory', CourseName: '', StageTitle: 'Profile Complete (100%) 🎓', Details: 'Thank you! Your study-abroad profile is 100% complete. Our senior counselor has received your file and will reach out with your personalized university shortlist shortly.', PortalUrl: 'https://opusoverseas.com/login', Subject: subject },
        }).catch(() => {});
      }
    }
    await auditEvent(c as any, { action: 'PROFILE_UPDATED', entityName: 'clients', entityId: token, afterState: { pct: afterPct, fields: Object.keys(body) } }).catch(() => {});

    return c.json({ success: true, profile: merged, completeness: computeProfileCompleteness(JSON.stringify(merged)), message: afterPct === 100 ? 'Profile complete! Our counsellor will reach out with your university shortlist.' : `Profile ${afterPct}% complete.` });
  } catch (e: any) {
    return c.json({ error: 'Profile update failed', details: e?.message }, 500);
  }
});

// GET /api/public/portal/study-abroad/documents?token= — vault + per-application checklist
portalStudyAbroadRouter.get('/documents', async (c) => {
  const token = c.req.query('token');
  if (!token) return c.json({ error: 'token is required' }, 400);
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  try {
    const docs = await db.select().from(documents).where(eq(documents.clientId, token)).all();
    const apps = await db.select().from(studyAbroadApplications).where(eq(studyAbroadApplications.clientId, token)).all();
    return c.json({
      success: true,
      documents: docs.map(d => ({ id: d.id, fileName: d.fileName, version: d.version, status: d.status, uploadedAt: d.uploadedAt, sizeBytes: d.sizeBytes, mimeType: d.mimeType, docLabel: d.docLabel, scanStatus: d.scanStatus })),
      applications: apps.map(a => ({ id: a.id, university: parseSnapshot(a).name, docsChecklist: parseDocs(a) })),
    });
  } catch (e: any) {
    return c.json({ error: 'Documents fetch failed', details: e?.message }, 500);
  }
});

// GET /api/public/portal/study-abroad/documents/:docId/download?token= — owner-only
portalStudyAbroadRouter.get('/documents/:docId/download', async (c) => {
  const token = c.req.query('token');
  if (!token) return c.json({ error: 'token is required' }, 400);
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  try {
    const doc = await db.select().from(documents).where(eq(documents.id, c.req.param('docId'))).get();
    if (!doc) return c.json({ error: 'Document not found' }, 404);
    if (doc.clientId !== token) return c.json({ error: 'Not your document' }, 403); // ownership bound
    const bucket = (c.env as any).BUCKET;
    if (!bucket) return c.json({ error: 'Storage not configured' }, 500);
    const obj = await bucket.get(doc.r2Key);
    if (!obj) return c.json({ error: 'File missing in storage' }, 404);
    return new Response(obj.body, {
      headers: {
        'Content-Type': doc.mimeType || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${doc.fileName.replace(/"/g, '')}"`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store'
      }
    });
  } catch (e: any) {
    return c.json({ error: 'Download failed', details: e?.message }, 500);
  }
});

// POST /api/public/portal/study-abroad/applications/:id/docs/:key/presigned?token=
// Filename convention: {key}-{appId}-{original} → upload endpoint syncs the checklist.
portalStudyAbroadRouter.post('/applications/:id/docs/:key/presigned', async (c) => {
  const token = c.req.query('token');
  const appId = c.req.param('id');
  const key = c.req.param('key');
  const original = c.req.query('filename');
  const label = c.req.query('label'); // custom "Other" document label (optional)
  if (!token || !original) return c.json({ error: 'token and filename are required' }, 400);
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  try {
    const client = await resolveClientByToken(db, token);
    if (!client) return c.json({ error: 'Client not found for token' }, 404);
    const app = await db.select().from(studyAbroadApplications).where(eq(studyAbroadApplications.id, appId)).get();
    if (!app || app.clientId !== token) return c.json({ error: 'Application not found' }, 404);

    const filename = `${key}-${appId.slice(0, 8)}-${original.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const expires = Math.floor(Date.now() / 1000) + 900;
    const secret = c.env.BETTER_AUTH_SECRET;
    if (!secret) return c.json({ error: 'BETTER_AUTH_SECRET not configured' }, 500);
    const signature = await signUploadPath(secret, token, filename, expires, appId, key, label || undefined);
    const url = `/api/public/portal/study-abroad/documents/upload?token=${token}&filename=${encodeURIComponent(filename)}&expires=${expires}&signature=${signature}&appId=${encodeURIComponent(appId)}&docKey=${encodeURIComponent(key)}${label ? `&label=${encodeURIComponent(label)}` : ''}`;
    return c.json({ success: true, url, expires, filename });
  } catch (e: any) {
    return c.json({ error: 'Presigned URL generation failed', details: e?.message }, 500);
  }
});

// PUT /api/public/portal/study-abroad/documents/upload — hardened upload + checklist sync
portalStudyAbroadRouter.put('/documents/upload', async (c) => {
  const token = c.req.query('token');
  const filename = c.req.query('filename');
  const expiresStr = c.req.query('expires');
  const signature = c.req.query('signature');
  const appId = c.req.query('appId');
  const docKey = c.req.query('docKey');
  const label = c.req.query('label');
  if (!token || !filename || !expiresStr || !signature) return c.json({ error: 'Missing upload parameters' }, 400);
  const expires = Number(expiresStr);
  if (Math.floor(Date.now() / 1000) > expires) return c.json({ error: 'Upload URL has expired' }, 400);
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const secret = c.env.BETTER_AUTH_SECRET;
  if (!secret) return c.json({ error: 'BETTER_AUTH_SECRET not configured' }, 500);

  const expectedSig = await signUploadPath(secret, token, filename, expires, appId || undefined, docKey || undefined, label || undefined);
  if (!timingSafeEqual(signature, expectedSig)) return c.json({ error: 'Invalid upload signature' }, 400);

  const db = getDb(c.env.DB);
  const fileBody = await c.req.arrayBuffer();
  const bytes = new Uint8Array(fileBody);
  const guard = guardUpload('document', filename, bytes.byteLength, bytes);
  if (!guard.ok) return c.json({ error: guard.error }, (guard.status || 400) as any);
  const safeName = guard.safeName!;
  const mimeType = guard.mimeType!;
  const digest = await sha256Hex(bytes);
  const now = Math.floor(Date.now() / 1000);

  // Rate limit: max 20 client uploads per token per hour (abuse guard).
  const recentUploads = await db.select().from(documents).where(and(eq(documents.clientId, token), eq(documents.uploadedBy, 'client'), gte(documents.uploadedAt, now - 3600))).all();
  if (recentUploads.length >= 20) return c.json({ error: 'Upload limit reached — try again later' }, 429);

  try {
    const r2Key = `${crypto.randomUUID()}-${safeName}`;
    const bucket = (c.env as any).BUCKET;
    if (bucket) await bucket.put(r2Key, fileBody, { httpMetadata: { contentType: mimeType } });

    const existingDocs = await db.select().from(documents).where(and(eq(documents.clientId, token), eq(documents.fileName, safeName))).all();
    let version = 'v1.0';
    if (existingDocs.length > 0) {
      const versions = existingDocs.map(d => { const m = d.version.match(/v(\d+)\.(\d+)/); return m ? parseFloat(`${m[1]}.${m[2]}`) : 1.0; });
      version = `v${(Math.max(...versions) + 1.0).toFixed(1)}`;
    }
    // Prompt-injection / malicious-content scan (untrusted data principle).
    const scan = scanDocumentBytes(bytes, mimeType, safeName);

    await db.insert(documents).values({
      id: crypto.randomUUID(),
      clientId: token,
      fileName: safeName,
      r2Key,
      version,
      status: 'pending',
      uploadedAt: now,
      sizeBytes: bytes.byteLength,
      mimeType,
      sha256: digest,
      uploadedBy: 'client',
      docLabel: label || null,
      scanStatus: scan.status,
      scanNote: scan.note
    });

    if (scan.status === 'flagged') {
      await createStaffAlert(c.env as any, { division: 'study-abroad', type: 'doc_flagged', title: '⚠️ Flagged document uploaded', body: `${safeName}: ${scan.note}`, clientId: token, payload: { scanNote: scan.note } });
    }

    // ── Instant sync: mark the application checklist key 'received' ──
    // appId + docKey are signed query params (no filename parsing needed).
    if (appId && docKey) {
      const app = await db.select().from(studyAbroadApplications).where(eq(studyAbroadApplications.id, appId)).get();
      if (app && app.clientId === token) {
        const checklist = parseDocs(app);
        checklist[docKey] = 'received';
        await db.update(studyAbroadApplications).set({ docsChecklistJson: JSON.stringify(checklist), updatedAt: now }).where(eq(studyAbroadApplications.id, app.id));
        await createStaffAlert(c.env as any, { division: 'study-abroad', type: 'doc_uploaded', title: `Document uploaded: ${docKey}`, body: `${safeName} — awaiting verification.`, clientId: token, payload: { applicationId: app.id, docKey } });
      }
    }

    // Verification task (mirrors portal.ts)
    const engs = await db.select().from(engagements).where(eq(engagements.clientId, token)).all();
    if (engs[0]) {
      await db.insert(tasks).values({
        id: crypto.randomUUID(),
        clientId: token,
        engagementId: engs[0].id,
        assigneeId: null,
        title: `Verify uploaded document: ${safeName}`,
        description: `Client ${token} uploaded ${safeName} (${version}) via portal. Please review.`,
        priority: 'medium',
        status: 'open',
        cos: 'standard',
        createdAt: now,
        updatedAt: now
      });
    }

    return c.json({ success: true, fileName: safeName, version, status: 'pending', scanStatus: scan.status, message: scan.status === 'flagged' ? 'Document uploaded. Our team will review it before verification.' : 'Document uploaded. Our team will verify it shortly.' });
  } catch (e: any) {
    return c.json({ error: 'Upload failed', details: e?.message }, 500);
  }
});

// GET /api/public/portal/study-abroad/applications?token= — student tracker
portalStudyAbroadRouter.get('/applications', async (c) => {
  const token = c.req.query('token');
  if (!token) return c.json({ error: 'token is required' }, 400);
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  try {
    const client = await resolveClientByToken(db, token);
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
    try { await publishSyncEvent(c.env as any, { channel: `client:${row.clientId}:applications`, type: 'OFFER_DECISION', payload: { applicationId: row.id, decision } }, (c as any).executionCtx); } catch {}
    return c.json({ success: true, message: `Offer ${decision}.` });
  } catch (e: any) {
    return c.json({ error: 'Offer decision failed', details: e?.message }, 500);
  }
});