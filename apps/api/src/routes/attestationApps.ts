import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { getDb } from '../db/client.js';
import { clients, engagements, attestationApplications, attestationRateCards, attestationRateMatrix, tasks } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { auditEvent } from '../middleware/audit.js';
import { createStaffAlert } from '../infra/staffAlerts.js';
import { sendNotification } from '../infra/notify.js';
import { guardUpload, sha256Hex } from '../infra/uploadGuard.js';
import { scanDocumentBytes } from '../lib/docScan.js';
import {
  createAttestationApplicationSchema, updateAttestationStageSchema, updateAttestationChainSchema,
  updateAttestationPickupSchema, createAttestationRateCardSchema, updateAttestationRateCardSchema
} from '@opusos/shared';

// Attestation division — gold-standard (Phase 4).
// One application = one document. Quote from rate card → client sends docs to US
// → we dispatch to supplier → chain (HRD/SDM/Chamber → MEA → Embassy/Apostille)
// → return → deliver. Prices are indicative ranges — NEVER supplier names (B2C).

export const attestationAppsRouter = new Hono<{ Bindings: { DB: D1Database; BETTER_AUTH_SECRET?: string; BUCKET?: any } }>();

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a.charCodeAt(i) ^ b.charCodeAt(i));
  return diff === 0;
}

async function signUploadPath(secret: string, clientId: string, filename: string, expires: number): Promise<string> {
  if (!secret) throw new Error('BETTER_AUTH_SECRET not configured — cannot sign upload URL');
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', encoder.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const data = `${clientId}:${filename}:${expires}`;
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
}

// ─── Stage machine (no-jump, backward allowed for full control) ───
const STAGE_TRANSITIONS: Record<string, string[]> = {
  quote_requested: ['quote_confirmed', 'rejected'],
  quote_confirmed: ['quote_requested', 'docs_awaiting', 'rejected'],
  docs_awaiting: ['quote_confirmed', 'in_process', 'rejected'],
  in_process: ['docs_awaiting', 'completed', 'rejected'],
  completed: ['in_process', 'dispatched'],
  dispatched: ['completed', 'delivered'],
  delivered: ['dispatched'],
  rejected: ['quote_requested', 'quote_confirmed', 'docs_awaiting', 'in_process'],
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
    documentKey: row.documentKey,
    documentStatus: row.documentStatus,
    paymentStatus: row.paymentStatus,
    paidAmountPaise: row.paidAmountPaise,
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

// ─── RATE MATRIX (staff) — the source of truth ───

// GET /api/attestation/rate-matrix — all rows
attestationAppsRouter.get('/rate-matrix', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  try {
    const rows = await db.select().from(attestationRateMatrix).all();
    return c.json({ success: true, matrix: rows.map(r => ({ ...r, steps: JSON.parse(r.stepsJson || '[]') })) });
  } catch (e: any) {
    return c.json({ error: 'Matrix fetch failed', details: e?.message }, 500);
  }
});

// PUT /api/attestation/rate-matrix — bulk upsert (rows: [{country, category, route, pricePaise, timelineDays, steps, active}])
attestationAppsRouter.put('/rate-matrix', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const now = Math.floor(Date.now() / 1000);
  try {
    const body = await c.req.json().catch(() => ({})) as any;
    const rows = Array.isArray(body.rows) ? body.rows : [];
    if (rows.length === 0) return c.json({ error: 'rows[] is required' }, 400);
    let upserted = 0;
    for (const r of rows) {
      if (!r.country || !r.category || !r.route || r.pricePaise === undefined) continue;
      const existing = await db.select().from(attestationRateMatrix)
        .where(and(eq(attestationRateMatrix.country, r.country), eq(attestationRateMatrix.category, r.category), eq(attestationRateMatrix.route, r.route)))
        .get();
      if (existing) {
        await db.update(attestationRateMatrix).set({
          pricePaise: r.pricePaise,
          timelineDays: r.timelineDays ?? existing.timelineDays,
          stepsJson: r.steps ? JSON.stringify(r.steps) : existing.stepsJson,
          active: r.active ?? existing.active,
          updatedAt: now
        }).where(eq(attestationRateMatrix.id, existing.id));
      } else {
        await db.insert(attestationRateMatrix).values({
          id: crypto.randomUUID(),
          country: r.country,
          category: r.category,
          route: r.route,
          pricePaise: r.pricePaise,
          timelineDays: r.timelineDays ?? 10,
          stepsJson: JSON.stringify(r.steps || []),
          active: r.active ?? true,
          createdAt: now,
          updatedAt: now
        });
      }
      upserted++;
    }
    await auditEvent(c as any, { action: 'RATE_MATRIX_UPDATED', entityName: 'attestation_rate_matrix', entityId: 'bulk', afterState: { rows: upserted } }).catch(() => {});
    return c.json({ success: true, upserted, message: `${upserted} matrix rows saved.` });
  } catch (e: any) {
    return c.json({ error: 'Matrix update failed', details: e?.message }, 500);
  }
});

// POST /api/attestation/rate-matrix/bands — price-band quick-fill (set all matching rows)
attestationAppsRouter.post('/rate-matrix/bands', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const now = Math.floor(Date.now() / 1000);
  try {
    const body = await c.req.json().catch(() => ({})) as any;
    const { route, category, pricePaise, timelineDays } = body;
    if (!route || pricePaise === undefined) return c.json({ error: 'route and pricePaise are required' }, 400);
    const rows = await db.select().from(attestationRateMatrix).all();
    let updated = 0;
    for (const r of rows) {
      if (r.route !== route) continue;
      if (category && r.category !== category) continue;
      await db.update(attestationRateMatrix).set({ pricePaise, timelineDays: timelineDays ?? r.timelineDays, updatedAt: now }).where(eq(attestationRateMatrix.id, r.id));
      updated++;
    }
    return c.json({ success: true, updated, message: `${updated} rows updated to ₹${(pricePaise / 100).toFixed(0)}.` });
  } catch (e: any) {
    return c.json({ error: 'Band update failed', details: e?.message }, 500);
  }
});

// DELETE /api/attestation/rate-matrix/:id — remove a row
attestationAppsRouter.delete('/rate-matrix/:id', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  try {
    const row = await db.select().from(attestationRateMatrix).where(eq(attestationRateMatrix.id, c.req.param('id'))).get();
    if (!row) return c.json({ error: 'Matrix row not found' }, 404);
    await db.delete(attestationRateMatrix).where(eq(attestationRateMatrix.id, row.id));
    return c.json({ success: true, message: 'Matrix row deleted.' });
  } catch (e: any) {
    return c.json({ error: 'Matrix row deletion failed', details: e?.message }, 500);
  }
});

// ─── RATE CARDS (staff) ───

// GET /api/attestation/rate-cards — all (staff)
attestationAppsRouter.get('/rate-cards', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  try {
    const rows = await db.select().from(attestationRateCards).all();
    return c.json({ success: true, rateCards: rows.map(r => ({ ...r, steps: JSON.parse(r.stepsJson || '[]'), documentTypes: JSON.parse(r.documentTypesJson || '[]') })) });
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
      title: body.title ?? null,
      description: body.description ?? null,
      documentTypesJson: JSON.stringify(body.documentTypes || []),
      pricePaise: body.pricePaise,
      govtFeePaise: body.govtFeePaise ?? 0,
      courierFeePaise: body.courierFeePaise ?? 0,
      translationFeePaise: body.translationFeePaise ?? 0,
      timelineDays: body.timelineDays ?? 10,
      stepsJson: JSON.stringify(body.steps || []),
      featured: body.featured ?? false,
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
    if (body.country !== undefined) updates.country = body.country;
    if (body.category !== undefined) updates.category = body.category;
    if (body.route !== undefined) updates.route = body.route;
    if (body.title !== undefined) updates.title = body.title;
    if (body.description !== undefined) updates.description = body.description;
    if (body.documentTypes !== undefined) updates.documentTypesJson = JSON.stringify(body.documentTypes);
    if (body.pricePaise !== undefined) updates.pricePaise = body.pricePaise;
    if (body.govtFeePaise !== undefined) updates.govtFeePaise = body.govtFeePaise;
    if (body.courierFeePaise !== undefined) updates.courierFeePaise = body.courierFeePaise;
    if (body.translationFeePaise !== undefined) updates.translationFeePaise = body.translationFeePaise;
    if (body.timelineDays !== undefined) updates.timelineDays = body.timelineDays;
    if (body.steps !== undefined) updates.stepsJson = JSON.stringify(body.steps);
    if (body.featured !== undefined) updates.featured = body.featured;
    if (body.active !== undefined) updates.active = body.active;
    await db.update(attestationRateCards).set(updates).where(eq(attestationRateCards.id, row.id));
    await auditEvent(c as any, { action: 'RATE_CARD_UPDATED', entityName: 'attestation_rate_cards', entityId: row.id, afterState: { fields: Object.keys(updates) } }).catch(() => {});
    return c.json({ success: true, message: 'Rate card updated.' });
  } catch (e: any) {
    return c.json({ error: 'Rate card update failed', details: e?.message }, 500);
  }
});

// DELETE /api/attestation/rate-cards/:id — remove a product from inventory
attestationAppsRouter.delete('/rate-cards/:id', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  try {
    const row = await db.select().from(attestationRateCards).where(eq(attestationRateCards.id, c.req.param('id'))).get();
    if (!row) return c.json({ error: 'Rate card not found' }, 404);
    await db.delete(attestationRateCards).where(eq(attestationRateCards.id, row.id));
    await auditEvent(c as any, { action: 'RATE_CARD_DELETED', entityName: 'attestation_rate_cards', entityId: row.id, afterState: { country: row.country, category: row.category } }).catch(() => {});
    return c.json({ success: true, message: 'Rate card deleted.' });
  } catch (e: any) {
    return c.json({ error: 'Rate card deletion failed', details: e?.message }, 500);
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

    // Quote from the RATE MATRIX (source of truth), fallback to featured rate card
    const matrixRow = await db.select().from(attestationRateMatrix)
      .where(and(eq(attestationRateMatrix.country, body.destinationCountry), eq(attestationRateMatrix.category, body.category), eq(attestationRateMatrix.route, body.route), eq(attestationRateMatrix.active, true)))
      .get();
    const rateCard = matrixRow ? null : await db.select().from(attestationRateCards)
      .where(and(eq(attestationRateCards.country, body.destinationCountry), eq(attestationRateCards.category, body.category), eq(attestationRateCards.route, body.route), eq(attestationRateCards.active, true)))
      .get();
    const quotePaise = matrixRow?.pricePaise ?? rateCard?.pricePaise ?? 0;
    const timelineDays = matrixRow?.timelineDays ?? rateCard?.timelineDays ?? 10;
    const chainSteps = matrixRow ? JSON.parse(matrixRow.stepsJson || '[]') : (rateCard ? JSON.parse(rateCard.stepsJson || '[]') : []);

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
      stage: 'quote_requested',
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

    // Notify the client when the exact quote is confirmed
    if (body.stage === 'quote_confirmed' && row.stage !== 'quote_confirmed') {
      const client = await db.select().from(clients).where(eq(clients.id, row.clientId)).get();
      if (client?.email) {
        await sendNotification(c.env as any, db, {
          channel: 'email', to: client.email,
          subject: `Quote confirmed — ${row.destinationCountry} attestation`,
          body: `Your quote for ${parseDoc(row).documentName || row.category} (${row.destinationCountry}) is confirmed at ₹${((row.totalQuotePaise || 0) / 100).toFixed(2)}. Log in to your portal to book the pickup and send your documents.`
        }).catch(() => {});
      }
    }

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

// PATCH /api/attestation/applications/:id — generic edit (document, fees, payment, notes)
attestationAppsRouter.patch('/applications/:id', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const now = Math.floor(Date.now() / 1000);
  try {
    const row = await db.select().from(attestationApplications).where(eq(attestationApplications.id, c.req.param('id'))).get();
    if (!row) return c.json({ error: 'Application not found' }, 404);
    const body = await c.req.json().catch(() => ({})) as any;
    const updates: any = { updatedAt: now };
    if (body.document !== undefined) updates.documentJson = JSON.stringify({ ...parseDoc(row), ...body.document });
    if (body.destinationCountry !== undefined) updates.destinationCountry = body.destinationCountry;
    if (body.category !== undefined) updates.category = body.category;
    if (body.route !== undefined) updates.route = body.route;
    if (body.translationNeeded !== undefined) updates.translationNeeded = body.translationNeeded;
    if (body.govtFeePaise !== undefined) updates.govtFeePaise = body.govtFeePaise;
    if (body.serviceFeePaise !== undefined) updates.serviceFeePaise = body.serviceFeePaise;
    if (body.courierFeePaise !== undefined) updates.courierFeePaise = body.courierFeePaise;
    if (body.translationFeePaise !== undefined) updates.translationFeePaise = body.translationFeePaise;
    if (body.totalQuotePaise !== undefined) updates.totalQuotePaise = body.totalQuotePaise;
    if (body.paymentStatus !== undefined) updates.paymentStatus = body.paymentStatus;
    if (body.paidAmountPaise !== undefined) updates.paidAmountPaise = body.paidAmountPaise;
    if (body.documentStatus !== undefined) updates.documentStatus = body.documentStatus;
    if (body.notes !== undefined) updates.notes = body.notes;
    await db.update(attestationApplications).set(updates).where(eq(attestationApplications.id, row.id));
    await auditEvent(c as any, { action: 'ATTESTATION_EDIT', entityName: 'attestation_applications', entityId: row.id, afterState: { fields: Object.keys(updates) } }).catch(() => {});
    return c.json({ success: true, message: 'Application updated.' });
  } catch (e: any) {
    return c.json({ error: 'Application update failed', details: e?.message }, 500);
  }
});

// DELETE /api/attestation/applications/:id — void an application
attestationAppsRouter.delete('/applications/:id', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  try {
    const row = await db.select().from(attestationApplications).where(eq(attestationApplications.id, c.req.param('id'))).get();
    if (!row) return c.json({ error: 'Application not found' }, 404);
    await db.delete(attestationApplications).where(eq(attestationApplications.id, row.id));
    await auditEvent(c as any, { action: 'ATTESTATION_DELETED', entityName: 'attestation_applications', entityId: row.id, afterState: { country: row.destinationCountry } }).catch(() => {});
    return c.json({ success: true, message: 'Application deleted.' });
  } catch (e: any) {
    return c.json({ error: 'Application deletion failed', details: e?.message }, 500);
  }
});

// POST /api/attestation/applications/:id/duplicate — same client, new application (multi-doc)
attestationAppsRouter.post('/applications/:id/duplicate', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const now = Math.floor(Date.now() / 1000);
  try {
    const row = await db.select().from(attestationApplications).where(eq(attestationApplications.id, c.req.param('id'))).get();
    if (!row) return c.json({ error: 'Application not found' }, 404);
    const id = crypto.randomUUID();
    await db.insert(attestationApplications).values({
      id,
      clientId: row.clientId,
      documentType: row.documentType,
      destinationCountry: row.destinationCountry,
      currentStep: 'hrd',
      status: 'pending',
      documentJson: row.documentJson,
      category: row.category,
      route: row.route,
      chainJson: row.chainJson,
      govtFeePaise: row.govtFeePaise,
      serviceFeePaise: row.serviceFeePaise,
      courierFeePaise: row.courierFeePaise,
      translationFeePaise: row.translationFeePaise,
      totalQuotePaise: row.totalQuotePaise,
      translationNeeded: row.translationNeeded,
      pickupStatus: 'awaiting_docs',
      stage: 'quote_requested',
      notes: `Duplicated from ${row.id.slice(0, 8)}`,
      createdAt: now,
      updatedAt: now
    });
    return c.json({ success: true, id, message: 'Application duplicated — edit the document details for the new one.' });
  } catch (e: any) {
    return c.json({ error: 'Duplicate failed', details: e?.message }, 500);
  }
});

// POST /api/attestation/applications/:id/document/presigned — staff uploads the original scan
attestationAppsRouter.post('/applications/:id/document/presigned', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  try {
    const row = await db.select().from(attestationApplications).where(eq(attestationApplications.id, c.req.param('id'))).get();
    if (!row) return c.json({ error: 'Application not found' }, 404);
    const original = c.req.query('filename');
    if (!original) return c.json({ error: 'filename is required' }, 400);
    const secret = c.env.BETTER_AUTH_SECRET;
    if (!secret) return c.json({ error: 'BETTER_AUTH_SECRET not configured' }, 500);
    const filename = `attestation-${row.id.slice(0, 8)}-${original.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    const expires = Math.floor(Date.now() / 1000) + 900;
    const signature = await signUploadPath(secret, row.clientId, filename, expires);
    const url = `/api/attestation/applications/${row.id}/document/upload?filename=${encodeURIComponent(filename)}&expires=${expires}&signature=${signature}`;
    return c.json({ success: true, url, expires, filename });
  } catch (e: any) {
    return c.json({ error: 'Presign failed', details: e?.message }, 500);
  }
});

// PUT /api/attestation/applications/:id/document/upload — store scan + mark received
attestationAppsRouter.put('/applications/:id/document/upload', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const now = Math.floor(Date.now() / 1000);
  try {
    const row = await db.select().from(attestationApplications).where(eq(attestationApplications.id, c.req.param('id'))).get();
    if (!row) return c.json({ error: 'Application not found' }, 404);
    const filename = c.req.query('filename');
    const expiresStr = c.req.query('expires');
    const signature = c.req.query('signature');
    if (!filename || !expiresStr || !signature) return c.json({ error: 'Missing upload parameters' }, 400);
    const expires = Number(expiresStr);
    if (Math.floor(Date.now() / 1000) > expires) return c.json({ error: 'Upload URL has expired' }, 400);
    const secret = c.env.BETTER_AUTH_SECRET;
    if (!secret) return c.json({ error: 'BETTER_AUTH_SECRET not configured' }, 500);
    const expectedSig = await signUploadPath(secret, row.clientId, filename, expires);
    if (!timingSafeEqual(signature, expectedSig)) return c.json({ error: 'Invalid upload signature' }, 400);

    const fileBody = await c.req.arrayBuffer();
    const bytes = new Uint8Array(fileBody);
    const guard = guardUpload('document', filename, bytes.byteLength, bytes);
    if (!guard.ok) return c.json({ error: guard.error }, (guard.status || 400) as any);
    const safeName = guard.safeName!;
    const mimeType = guard.mimeType!;
    const scan = scanDocumentBytes(bytes, mimeType, safeName);

    const r2Key = `${crypto.randomUUID()}-${safeName}`;
    const bucket = (c.env as any).BUCKET;
    if (bucket) await bucket.put(r2Key, fileBody, { httpMetadata: { contentType: mimeType } });

    await db.update(attestationApplications).set({
      documentKey: r2Key,
      documentStatus: scan.status === 'flagged' ? 'rejected' : 'received',
      notes: scan.status === 'flagged' ? `⚠️ ${scan.note}` : row.notes,
      updatedAt: now
    }).where(eq(attestationApplications.id, row.id));
    return c.json({ success: true, documentStatus: scan.status === 'flagged' ? 'rejected' : 'received', message: scan.status === 'flagged' ? 'Document flagged — review before processing.' : 'Document received.' });
  } catch (e: any) {
    return c.json({ error: 'Upload failed', details: e?.message }, 500);
  }
});

// GET /api/attestation/applications/pipeline — dashboard aggregate
attestationAppsRouter.get('/applications/pipeline', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const now = Math.floor(Date.now() / 1000);
  try {
    const rows = await db.select().from(attestationApplications).all();
    const counts: Record<string, number> = {};
    for (const r of rows) counts[r.stage] = (counts[r.stage] || 0) + 1;
    const stuck = rows.filter(r => !['delivered', 'rejected'].includes(r.stage) && (r.updatedAt || 0) < now - 7 * 86400).length;
    const awaitingDocs = rows.filter(r => r.stage === 'docs_awaiting' && r.documentStatus === 'missing').length;
    const unpaid = rows.filter(r => r.paymentStatus !== 'paid' && !['delivered', 'rejected'].includes(r.stage)).length;
    return c.json({ success: true, counts, stuck, awaitingDocs, unpaid, total: rows.length });
  } catch (e: any) {
    return c.json({ error: 'Pipeline fetch failed', details: e?.message }, 500);
  }
});

// ─── Client portal (token-auth) ───
export const portalAttestationRouter = new Hono<{ Bindings: { DB: D1Database } }>();

// GET /api/public/portal/attestation/rate-matrix?token= — quote calculator data (indicative)
portalAttestationRouter.get('/rate-matrix', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  try {
    const rows = await db.select().from(attestationRateMatrix).where(eq(attestationRateMatrix.active, true)).all();
    const countries = [...new Set(rows.map(r => r.country))].sort();
    return c.json({
      success: true,
      countries,
      matrix: rows.map(r => ({ country: r.country, category: r.category, route: r.route, pricePaise: r.pricePaise, timelineDays: r.timelineDays, steps: JSON.parse(r.stepsJson || '[]') })),
      disclaimer: 'Prices shown are indicative ranges and are not guaranteed — final cost may vary based on government fees, document type and processing. Subject to change without notice.'
    });
  } catch (e: any) {
    return c.json({ error: 'Matrix fetch failed', details: e?.message }, 500);
  }
});

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
      rateCards: rows.map(r => ({ country: r.country, category: r.category, route: r.route, title: r.title, description: r.description, documentTypes: JSON.parse(r.documentTypesJson || '[]'), pricePaise: r.pricePaise, govtFeePaise: r.govtFeePaise, courierFeePaise: r.courierFeePaise, translationFeePaise: r.translationFeePaise, timelineDays: r.timelineDays, steps: JSON.parse(r.stepsJson || '[]'), featured: !!r.featured })),
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
      stage: 'quote_requested',
      notes: body.notes ?? null,
      createdAt: now,
      updatedAt: now
    });

    await createStaffAlert(c.env as any, { division: 'attestation', type: 'attestation_quote', title: 'New attestation quote requested', body: `${body.document.documentName || body.category} → ${body.destinationCountry}`, clientId: token, payload: { applicationId: id } });
    return c.json({
      success: true, id,
      quote: { totalPaise: 0, servicePaise: 0, translationPaise: 0 },
      timelineDays,
      message: 'Quote request received! Our team will confirm the exact price with you shortly — the range shown is indicative and may vary.'
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
    if (!['quote_requested', 'quote_confirmed', 'docs_awaiting'].includes(row.stage)) return c.json({ error: 'Pickup can only be booked before processing' }, 409);

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