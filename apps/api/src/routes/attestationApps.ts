import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { getDb } from '../db/client.js';
import { clients, engagements, attestationApplications, attestationRateCards, tasks } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { auditEvent } from '../middleware/audit.js';
import { createStaffAlert } from '../infra/staffAlerts.js';
import {
  createAttestationApplicationSchema, updateAttestationStageSchema, updateAttestationChainSchema,
  updateAttestationPickupSchema, createAttestationRateCardSchema, updateAttestationRateCardSchema
} from '@opusos/shared';

// Attestation division — gold-standard (Phase 4).
// One application = one document. Quote from rate card → client sends docs to US
// → we dispatch to supplier → chain (HRD/SDM/Chamber → MEA → Embassy/Apostille)
// → return → deliver. Prices are indicative ranges — NEVER supplier names (B2C).

export const attestationAppsRouter = new Hono<{ Bindings: { DB: D1Database } }>();

// ─── Stage machine (no-jump) ───
const STAGE_TRANSITIONS: Record<string, string[]> = {
  quote: ['docs_awaiting', 'rejected'],
  docs_awaiting: ['in_process', 'rejected'],
  in_process: ['completed', 'rejected'],
  completed: ['dispatched'],
  dispatched: ['delivered'],
  delivered: [],
  rejected: [],
};

const CHAIN_STEP_STATUS = ['pending', 'done', 'failed'] as const;

function parseChain(row: any): any[] {
  try { return JSON.parse(row.chainJson || '[]'); } catch { return []; }
}

function parseDoc(row: any): any {
  try { return JSON.parse(row.documentJson || '{}'); } catch { return {}; }
}

function serializeApplication(row: any) {
  return {
    id: row.id,
    clientId: row.clientId,
    document: parseDoc(row),
    category: row.category,
    route: row.route,
    destinationCountry: row.destinationCountry,
    chain: parseChain(row),
    fees: {
      govtFeePaise: row.govtFeePaise,
      serviceFeePaise: row.serviceFeePaise,
      courierFeePaise: row.courierFeePaise,
      translationFeePaise: row.translationFeePaise,
      totalQuotePaise: row.totalQuotePaise,
    },
    translationNeeded: !!row.translationNeeded,
    pickup: {
      status: row.pickupStatus,
      address: row.pickupAddress,
      courierInbound: row.courierInbound,
      courierOutbound: row.courierOutbound,
      courierReturn: row.courierReturn,
    },
    stage: row.stage,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

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

// ─── RATE CARDS (staff) ───

// GET /api/attestation/rate-cards — all (staff)
attestationAppsRouter.get('/rate-cards', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  try {
    const rows = await db.select().from(attestationRateCards).all();
    return c.json({ success: true, rateCards: rows.map(r => ({ ...r, steps: JSON.parse(r.stepsJson || '[]') })) });
  } catch (e: any) {
    return c.json({ error: 'Rate cards fetch failed', details: e?.message }, 500);
  }
});

// POST /api/attestation/rate-cards — create
attestationAppsRouter.post('/rate-cards', zValidator('json', createAttestationRateCardSchema), async (c) => {
  const body = c.req.valid('json');
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const now = Math.floor(Date.now() / 1000);
  try {
    const id = crypto.randomUUID();
    await db.insert(attestationRateCards).values({
      id,
      country: body.country,
      category: body.category,
      route: body.route,
      pricePaise: body.pricePaise,
      timelineDays: body.timelineDays ?? 10,
      stepsJson: JSON.stringify(body.steps || []),
      active: body.active ?? true,
      createdAt: now,
      updatedAt: now
    });
    await auditEvent(c as any, { action: 'RATE_CARD_CREATED', entityName: 'attestation_rate_cards', entityId: id, afterState: { country: body.country, category: body.category } }).catch(() => {});
    return c.json({ success: true, id });
  } catch (e: any) {
    return c.json({ error: 'Rate card creation failed', details: e?.message }, 500);
  }
});

// PATCH /api/attestation/rate-cards/:id — update
attestationAppsRouter.patch('/rate-cards/:id', zValidator('json', updateAttestationRateCardSchema), async (c) => {
  const body = c.req.valid('json');
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const now = Math.floor(Date.now() / 1000);
  try {
    const row = await db.select().from(attestationRateCards).where(eq(attestationRateCards.id, c.req.param('id'))).get();
    if (!row) return c.json({ error: 'Rate card not found' }, 404);
    const updates: any = { updatedAt: now };
    if (body.pricePaise !== undefined) updates.pricePaise = body.pricePaise;
    if (body.timelineDays !== undefined) updates.timelineDays = body.timelineDays;
    if (body.steps !== undefined) updates.stepsJson = JSON.stringify(body.steps);
    if (body.active !== undefined) updates.active = body.active;
    await db.update(attestationRateCards).set(updates).where(eq(attestationRateCards.id, row.id));
    return c.json({ success: true, message: 'Rate card updated.' });
  } catch (e: any) {
    return c.json({ error: 'Rate card update failed', details: e?.message }, 500);
  }
});

// ─── APPLICATIONS (staff) ───

// GET /api/attestation/applications — list (filter: clientId, stage, country)
attestationAppsRouter.get('/applications', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  try {
    const { clientId, stage, country } = c.req.query();
    let rows = await db.select().from(attestationApplications).all();
    if (clientId) rows = rows.filter(r => r.clientId === clientId);
    if (stage) rows = rows.filter(r => r.stage === stage);
    if (country) rows = rows.filter(r => r.destinationCountry.toLowerCase() === country.toLowerCase());
    rows.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    return c.json({ success: true, applications: rows.map(serializeApplication) });
  } catch (e: any) {
    return c.json({ error: 'Applications fetch failed', details: e?.message }, 500);
  }
});

// POST /api/attestation/applications — create from rate card → quote
attestationAppsRouter.post('/applications', zValidator('json', createAttestationApplicationSchema), async (c) => {
  const body = c.req.valid('json');
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const now = Math.floor(Date.now() / 1000);
  try {
    const client = await db.select().from(clients).where(eq(clients.id, body.clientId)).get();
    if (!client) return c.json({ error: 'Client not found' }, 404);

    // Quote from the rate card (indicative — never guaranteed)
    const rateCard = await db.select().from(attestationRateCards)
      .where(and(eq(attestationRateCards.country, body.destinationCountry), eq(attestationRateCards.category, body.category), eq(attestationRateCards.route, body.route), eq(attestationRateCards.active, true)))
      .get();
    const quotePaise = rateCard?.pricePaise ?? 0;
    const timelineDays = rateCard?.timelineDays ?? 10;
    const chainSteps = rateCard ? JSON.parse(rateCard.stepsJson || '[]') : [];

    const id = crypto.randomUUID();
    await db.insert(attestationApplications).values({
      id,
      clientId: body.clientId,
      documentType: 'degree', // legacy column — new flow uses documentJson
      destinationCountry: body.destinationCountry,
      currentStep: 'hrd',
      status: 'pending',
      documentJson: JSON.stringify(body.document),
      category: body.category,
      route: body.route,
      chainJson: JSON.stringify(chainSteps.map((label: string) => ({ key: label.toLowerCase().replace(/[^a-z0-9]+/g, '_'), label, status: 'pending', date: null, note: null }))),
      govtFeePaise: 0,
      serviceFeePaise: quotePaise,
      courierFeePaise: 0,
      translationFeePaise: body.translationNeeded ? Math.round(quotePaise * 0.15) : 0,
      totalQuotePaise: quotePaise + (body.translationNeeded ? Math.round(quotePaise * 0.15) : 0),
      translationNeeded: !!body.translationNeeded,
      pickupStatus: 'awaiting_docs',
      stage: 'quote',
      notes: body.notes ?? null,
      createdAt: now,
      updatedAt: now
    });

    // Ensure attestation engagement exists
    const eng = await db.select().from(engagements).where(and(eq(engagements.clientId, body.clientId), eq(engagements.division, 'attestation'))).get();
    if (!eng) {
      await db.insert(engagements).values({
        id: crypto.randomUUID(),
        clientId: body.clientId,
        division: 'attestation',
        title: `Attestation — ${body.document.documentName || body.category}`,
        stageKey: 'lead',
        outstandingBalance: 0,
        status: 'active',
        createdAt: now,
        updatedAt: now
      });
    }

    await auditEvent(c as any, { action: 'ATTESTATION_QUOTE', entityName: 'attestation_applications', entityId: id, afterState: { country: body.destinationCountry, category: body.category, route: body.route, quotePaise } }).catch(() => {});
    return c.json({
      success: true, id,
      quote: { totalPaise: quotePaise + (body.translationNeeded ? Math.round(quotePaise * 0.15) : 0), servicePaise: quotePaise, translationPaise: body.translationNeeded ? Math.round(quotePaise * 0.15) : 0 },
      timelineDays,
      message: `Quote created. Estimated ${timelineDays} working days. Prices are indicative and subject to change.`
    });
  } catch (e: any) {
    return c.json({ error: 'Application creation failed', details: e?.message }, 500);
  }
});

// PATCH /api/attestation/applications/:id/stage — no-jump machine
attestationAppsRouter.patch('/applications/:id/stage', zValidator('json', updateAttestationStageSchema), async (c) => {
  const body = c.req.valid('json');
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const now = Math.floor(Date.now() / 1000);
  try {
    const row = await db.select().from(attestationApplications).where(eq(attestationApplications.id, c.req.param('id'))).get();
    if (!row) return c.json({ error: 'Application not found' }, 404);
    const allowed = STAGE_TRANSITIONS[row.stage] || [];
    if (!allowed.includes(body.stage)) {
      return c.json({ error: `Cannot move from '${row.stage}' to '${body.stage}'`, code: 'invalid_transition', allowed }, 409);
    }
    await db.update(attestationApplications).set({ stage: body.stage, updatedAt: now }).where(eq(attestationApplications.id, row.id));

    // Auto-tasks
    if (body.stage === 'docs_awaiting') {
      await createTask(db, row.clientId, `Awaiting documents: ${parseDoc(row).documentName || row.category}`, `Client needs to send the original document to our office for ${row.destinationCountry} attestation.`, 'medium', now + 7 * 86400);
    }
    if (body.stage === 'completed') {
      await createTask(db, row.clientId, `Dispatch attested documents: ${parseDoc(row).documentName || row.category}`, `Attestation complete for ${row.destinationCountry}. Prepare return dispatch to client.`, 'high', now + 24 * 3600);
    }
    await auditEvent(c as any, { action: 'ATTESTATION_STAGE', entityName: 'attestation_applications', entityId: row.id, afterState: { oldStage: row.stage, newStage: body.stage } }).catch(() => {});
    return c.json({ success: true, message: `Application moved to ${body.stage}.` });
  } catch (e: any) {
    return c.json({ error: 'Stage update failed', details: e?.message }, 500);
  }
});

// PATCH /api/attestation/applications/:id/chain — advance a chain step
attestationAppsRouter.patch('/applications/:id/chain', zValidator('json', updateAttestationChainSchema), async (c) => {
  const body = c.req.valid('json');
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const now = Math.floor(Date.now() / 1000);
  try {
    const row = await db.select().from(attestationApplications).where(eq(attestationApplications.id, c.req.param('id'))).get();
    if (!row) return c.json({ error: 'Application not found' }, 404);
    const chain = parseChain(row);
    const step = chain.find((s: any) => s.key === body.stepKey);
    if (!step) return c.json({ error: 'Chain step not found' }, 404);
    step.status = body.status;
    step.date = body.status === 'done' ? now : step.date;
    step.note = body.note ?? step.note;
    await db.update(attestationApplications).set({ chainJson: JSON.stringify(chain), updatedAt: now }).where(eq(attestationApplications.id, row.id));

    // When the last step is done → completed
    const allDone = chain.every((s: any) => s.status === 'done');
    if (allDone && row.stage === 'in_process') {
      await db.update(attestationApplications).set({ stage: 'completed', updatedAt: now }).where(eq(attestationApplications.id, row.id));
      await createTask(db, row.clientId, `Dispatch attested documents: ${parseDoc(row).documentName || row.category}`, `Attestation complete for ${row.destinationCountry}. Prepare return dispatch to client.`, 'high', now + 24 * 3600);
    }
    await auditEvent(c as any, { action: 'ATTESTATION_CHAIN', entityName: 'attestation_applications', entityId: row.id, afterState: { stepKey: body.stepKey, status: body.status } }).catch(() => {});
    return c.json({ success: true, chain });
  } catch (e: any) {
    return c.json({ error: 'Chain update failed', details: e?.message }, 500);
  }
});

// PATCH /api/attestation/applications/:id/pickup — pickup flow (client → us → supplier → client)
attestationAppsRouter.patch('/applications/:id/pickup', zValidator('json', updateAttestationPickupSchema), async (c) => {
  const body = c.req.valid('json');
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const now = Math.floor(Date.now() / 1000);
  try {
    const row = await db.select().from(attestationApplications).where(eq(attestationApplications.id, c.req.param('id'))).get();
    if (!row) return c.json({ error: 'Application not found' }, 404);
    const updates: any = { updatedAt: now };
    if (body.pickupStatus !== undefined) updates.pickupStatus = body.pickupStatus;
    if (body.pickupAddress !== undefined) updates.pickupAddress = body.pickupAddress;
    if (body.courierInbound !== undefined) updates.courierInbound = body.courierInbound;
    if (body.courierOutbound !== undefined) updates.courierOutbound = body.courierOutbound;
    if (body.courierReturn !== undefined) updates.courierReturn = body.courierReturn;
    await db.update(attestationApplications).set(updates).where(eq(attestationApplications.id, row.id));
    await auditEvent(c as any, { action: 'ATTESTATION_PICKUP', entityName: 'attestation_applications', entityId: row.id, afterState: updates }).catch(() => {});
    return c.json({ success: true, message: 'Pickup details updated.' });
  } catch (e: any) {
    return c.json({ error: 'Pickup update failed', details: e?.message }, 500);
  }
});

// ─── Client portal (token-auth) ───
export const portalAttestationRouter = new Hono<{ Bindings: { DB: D1Database } }>();

// GET /api/public/portal/attestation/rate-cards?token= — public price ranges (indicative)
portalAttestationRouter.get('/rate-cards', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  try {
    const rows = await db.select().from(attestationRateCards).where(eq(attestationRateCards.active, true)).all();
    const countries = [...new Set(rows.map(r => r.country))].sort();
    return c.json({
      success: true,
      countries,
      rateCards: rows.map(r => ({ country: r.country, category: r.category, route: r.route, pricePaise: r.pricePaise, timelineDays: r.timelineDays, steps: JSON.parse(r.stepsJson || '[]') })),
      disclaimer: 'Prices shown are indicative ranges and are not guaranteed — final cost may vary based on government fees, document type and processing. Subject to change without notice.'
    });
  } catch (e: any) {
    return c.json({ error: 'Rate cards fetch failed', details: e?.message }, 500);
  }
});

// GET /api/public/portal/attestation/applications?token= — tracker with chain timeline
portalAttestationRouter.get('/applications', async (c) => {
  const token = c.req.query('token');
  if (!token) return c.json({ error: 'token is required' }, 400);
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  try {
    const client = await db.select().from(clients).where(eq(clients.id, token)).get();
    if (!client) return c.json({ error: 'Client not found for token' }, 404);
    const rows = await db.select().from(attestationApplications).where(eq(attestationApplications.clientId, token)).all();
    rows.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
    return c.json({ success: true, applications: rows.map(serializeApplication) });
  } catch (e: any) {
    return c.json({ error: 'Applications fetch failed', details: e?.message }, 500);
  }
});

// POST /api/public/portal/attestation/applications — client creates from rate card
portalAttestationRouter.post('/applications', zValidator('json', createAttestationApplicationSchema), async (c) => {
  const token = c.req.query('token');
  if (!token) return c.json({ error: 'token is required' }, 400);
  const body = c.req.valid('json');
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const now = Math.floor(Date.now() / 1000);
  try {
    const client = await db.select().from(clients).where(eq(clients.id, token)).get();
    if (!client) return c.json({ error: 'Client not found for token' }, 404);
    if (body.clientId !== token) return c.json({ error: 'Not your account' }, 403);

    const rateCard = await db.select().from(attestationRateCards)
      .where(and(eq(attestationRateCards.country, body.destinationCountry), eq(attestationRateCards.category, body.category), eq(attestationRateCards.route, body.route), eq(attestationRateCards.active, true)))
      .get();
    const quotePaise = rateCard?.pricePaise ?? 0;
    const timelineDays = rateCard?.timelineDays ?? 10;
    const chainSteps = rateCard ? JSON.parse(rateCard.stepsJson || '[]') : [];

    const id = crypto.randomUUID();
    await db.insert(attestationApplications).values({
      id,
      clientId: token,
      documentType: 'degree',
      destinationCountry: body.destinationCountry,
      currentStep: 'hrd',
      status: 'pending',
      documentJson: JSON.stringify(body.document),
      category: body.category,
      route: body.route,
      chainJson: JSON.stringify(chainSteps.map((label: string) => ({ key: label.toLowerCase().replace(/[^a-z0-9]+/g, '_'), label, status: 'pending', date: null, note: null }))),
      govtFeePaise: 0,
      serviceFeePaise: quotePaise,
      courierFeePaise: 0,
      translationFeePaise: body.translationNeeded ? Math.round(quotePaise * 0.15) : 0,
      totalQuotePaise: quotePaise + (body.translationNeeded ? Math.round(quotePaise * 0.15) : 0),
      translationNeeded: !!body.translationNeeded,
      pickupStatus: 'awaiting_docs',
      stage: 'quote',
      notes: body.notes ?? null,
      createdAt: now,
      updatedAt: now
    });

    await createStaffAlert(c.env as any, { division: 'attestation', type: 'attestation_quote', title: 'New attestation quote requested', body: `${body.document.documentName || body.category} → ${body.destinationCountry}`, clientId: token, payload: { applicationId: id } });
    return c.json({
      success: true, id,
      quote: { totalPaise: quotePaise + (body.translationNeeded ? Math.round(quotePaise * 0.15) : 0), servicePaise: quotePaise, translationPaise: body.translationNeeded ? Math.round(quotePaise * 0.15) : 0 },
      timelineDays,
      message: `Quote created. Estimated ${timelineDays} working days. Prices are indicative and subject to change.`
    });
  } catch (e: any) {
    return c.json({ error: 'Application creation failed', details: e?.message }, 500);
  }
});

// POST /api/public/portal/attestation/applications/:id/pickup — client books pickup (sends docs to US)
portalAttestationRouter.post('/applications/:id/pickup', zValidator('json', updateAttestationPickupSchema), async (c) => {
  const token = c.req.query('token');
  if (!token) return c.json({ error: 'token is required' }, 400);
  const body = c.req.valid('json');
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const now = Math.floor(Date.now() / 1000);
  try {
    const row = await db.select().from(attestationApplications).where(eq(attestationApplications.id, c.req.param('id'))).get();
    if (!row) return c.json({ error: 'Application not found' }, 404);
    if (row.clientId !== token) return c.json({ error: 'Not your application' }, 403);
    if (row.stage !== 'quote' && row.stage !== 'docs_awaiting') return c.json({ error: 'Pickup can only be booked before processing' }, 409);

    const updates: any = { updatedAt: now };
    if (body.pickupAddress !== undefined) updates.pickupAddress = body.pickupAddress;
    if (body.courierInbound !== undefined) updates.courierInbound = body.courierInbound;
    if (body.pickupStatus !== undefined) updates.pickupStatus = body.pickupStatus;
    await db.update(attestationApplications).set(updates).where(eq(attestationApplications.id, row.id));
    await createStaffAlert(c.env as any, { division: 'attestation', type: 'docs_inbound', title: 'Client documents inbound', body: `${row.destinationCountry} — ${body.courierInbound || 'no AWB yet'}`, clientId: token, payload: { applicationId: row.id } });
    return c.json({ success: true, message: 'Pickup booked. Send your original documents to our office — we handle the rest.' });
  } catch (e: any) {
    return c.json({ error: 'Pickup booking failed', details: e?.message }, 500);
  }
});