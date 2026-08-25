import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { getDb } from '../db/client.js';
import { visaRules, visaDeadlines, clients, engagements, documents } from '../db/schema.js';
import { eq, and, lte, gte, sql } from 'drizzle-orm';
import { publishSyncEvent } from './sync.js';
import { auditEvent } from '../middleware/audit.js';

export const visaGoldRouter = new Hono<{ Bindings: { DB: D1Database } }>();
const now = () => Math.floor(Date.now()/1000);
const uid = () => `vg-${Date.now().toString(36)}-${crypto.randomUUID().slice(0,4)}`;

// V1 — Deadline Cascade Engine
visaGoldRouter.post('/deadlines/calc', zValidator('json', z.object({
  clientId: z.string().min(3),
  bookingId: z.string().min(3),
  biometricsAt: z.number().int().optional(),
  LMIA_expiryAt: z.number().int().optional(),
})), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const { clientId, bookingId, biometricsAt, LMIA_expiryAt } = c.req.valid('json') as any;
  const base = biometricsAt || now();
  const deadlines: any[] = [];
  // biometrics → medical +30d → submit +16d
  const bioId = uid();
  deadlines.push({ id: bioId, clientId, bookingId, type: 'biometrics' as const, dueAt: base, dependsOn: null, status: 'pending' as const, createdAt: now() });
  const medId = uid();
  deadlines.push({ id: medId, clientId, bookingId, type: 'medical' as const, dueAt: base + 30*86400, dependsOn: bioId, status: 'pending' as const, createdAt: now() });
  const subId = uid();
  deadlines.push({ id: subId, clientId, bookingId, type: 'submit' as const, dueAt: base + 46*86400, dependsOn: medId, status: 'pending' as const, createdAt: now() });
  if (LMIA_expiryAt) deadlines.push({ id: uid(), clientId, bookingId, type: 'LMIA_expiry' as const, dueAt: LMIA_expiryAt, dependsOn: null, status: 'pending' as const, createdAt: now() });
  for (const d of deadlines) await db.insert(visaDeadlines).values(d as any);
  await auditEvent(c as any, { action: 'VISA_DEADLINES_CALC', entityName: 'visa_deadlines', entityId: bookingId, afterState: { count: deadlines.length } });
  try { await publishSyncEvent(c.env as any, { channel: `client:${clientId}:visa`, type: 'VISA_DEADLINES_CALC', payload: { bookingId } }, (c as any).executionCtx); } catch {}
  try { await publishSyncEvent(c.env as any, { channel: 'staff:global:visa', type: 'VISA_DEADLINES_CALC', payload: { bookingId } }, (c as any).executionCtx); } catch {}
  try { await publishSyncEvent(c.env as any, { channel: 'public:visa', type: 'VISA_DEADLINES_CALC', payload: { bookingId } }, (c as any).executionCtx); } catch {}
  return c.json({ success: true, deadlines });
});

visaGoldRouter.get('/deadlines', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const clientId = c.req.query('clientId');
  const bookingId = c.req.query('bookingId');
  const overdue = c.req.query('overdue');
  const conditions: any[] = [];
  if (clientId) conditions.push(eq(visaDeadlines.clientId, clientId));
  if (bookingId) conditions.push(eq(visaDeadlines.bookingId, bookingId));
  if (overdue === '1') conditions.push(eq(visaDeadlines.status, 'overdue' as any));
  // auto-mark overdue
  try {
    const all = await db.select().from(visaDeadlines).where(conditions.length ? and(...conditions) : undefined as any).all();
    for (const r of all as any[]) if (r.dueAt < now() && r.status === 'pending') await db.update(visaDeadlines).set({ status: 'overdue' as any }).where(eq(visaDeadlines.id, r.id));
  } catch {}
  const rows = await db.select().from(visaDeadlines).where(conditions.length ? and(...conditions) : undefined as any).orderBy(visaDeadlines.dueAt).all();
  return c.json({ success: true, deadlines: rows });
});

visaGoldRouter.patch('/deadlines/:id/dueAt', zValidator('json', z.object({ dueAt: z.number().int() })), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const id = c.req.param('id');
  const { dueAt } = c.req.valid('json') as any;
  const row = await db.select().from(visaDeadlines).where(eq(visaDeadlines.id, id)).get();
  if (!row) return c.json({ error: 'Not found' }, 404);
  const delta = dueAt - (row as any).dueAt;
  await db.update(visaDeadlines).set({ dueAt } as any).where(eq(visaDeadlines.id, id));
  // cascade to dependents
  const dependents = await db.select().from(visaDeadlines).where(eq(visaDeadlines.dependsOn, id)).all();
  for (const d of dependents as any[]) await db.update(visaDeadlines).set({ dueAt: d.dueAt + delta } as any).where(eq(visaDeadlines.id, d.id));
  try { await publishSyncEvent(c.env as any, { channel: `client:${(row as any).clientId}:visa`, type: 'VISA_DEADLINE_MOVED', payload: { id, delta } }, (c as any).executionCtx); } catch {}
  return c.json({ success: true, delta, dependents: dependents.length });
});

visaGoldRouter.get('/risk', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const days = parseInt(c.req.query('days') || '14');
  const cutoff = now() + days*86400;
  const rows = await db.select().from(visaDeadlines).where(and(eq(visaDeadlines.status, 'pending' as any), lte(visaDeadlines.dueAt, cutoff))).orderBy(visaDeadlines.dueAt).all();
  return c.json({ success: true, risk: rows, count: rows.length });
});

// V2 — Country Requirements DB
visaGoldRouter.get('/rules', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const country = c.req.query('country');
  const visaType = c.req.query('visaType');
  const conditions: any[] = [];
  if (country) conditions.push(eq(visaRules.country, country));
  if (visaType) conditions.push(eq(visaRules.visaType, visaType));
  const rows = await db.select().from(visaRules).where(conditions.length ? and(...conditions) : undefined as any).orderBy(visaRules.country).all();
  return c.json({ success: true, rules: rows });
});
visaGoldRouter.post('/rules', zValidator('json', z.object({
  country: z.string().min(2), visaType: z.string().min(2), docs: z.array(z.object({ label: z.string(), required: z.boolean().default(true), validityRule: z.string().optional() })).min(1),
  validityRule: z.string().optional(), leadDays: z.number().int().min(1).default(21),
})), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const body = c.req.valid('json') as any;
  const id = uid();
  await db.insert(visaRules).values({ id, country: body.country, visaType: body.visaType, docs: JSON.stringify(body.docs), validityRule: body.validityRule || null, leadDays: body.leadDays, updatedAt: now() } as any);
  await auditEvent(c as any, { action: 'VISA_RULE_CREATED', entityName: 'visa_rules', entityId: id });
  try { await publishSyncEvent(c.env as any, { channel: 'staff:global:visa', type: 'VISA_RULE_CREATED', payload: { id } }, (c as any).executionCtx); } catch {}
  return c.json({ success: true, id });
});

// V2 — Requirements for a booking (outstanding docs)
visaGoldRouter.get('/requirements/:bookingId', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const bookingId = c.req.param('bookingId');
  const eng = await db.select().from(engagements).where(eq(engagements.id, bookingId)).get();
  if (!eng) return c.json({ error: 'Booking not found' }, 404);
  // Derive country/type from engagement title or query param fallback
  const country = c.req.query('country') || 'Canada';
  const visaType = c.req.query('visaType') || 'work';
  const rule = await db.select().from(visaRules).where(and(eq(visaRules.country, country), eq(visaRules.visaType, visaType))).get();
  const docs = rule ? JSON.parse((rule as any).docs) : [];
  const uploaded = await db.select().from(documents).where(eq(documents.clientId, (eng as any).clientId)).all();
  const outstanding = docs.filter((d:any)=> !uploaded.some((u:any)=> u.fileName?.toLowerCase().includes(d.label.toLowerCase().slice(0,6))));
  const validityOk = !( (eng as any).clientId && docs.some((d:any)=> d.validityRule?.includes('6m'))); // simplified: check passport 6m via separate expiry guard
  return c.json({ success: true, rule, outstanding, validityOk, uploadedCount: uploaded.length });
});

// V6 — KPIs
visaGoldRouter.get('/kpis', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const engs = await db.select().from(engagements).where(eq(engagements.division, 'visa' as any)).all();
  const deadlines = await db.select().from(visaDeadlines).all();
  const total = engs.length;
  const exception = deadlines.filter((d:any)=> d.status==='overdue').length;
  const exceptionRate = total ? Math.round((exception/total)*100) : 0;
  const avgCompletion = deadlines.length ? Math.round(deadlines.reduce((a:any,b:any)=> a + (b.dueAt - b.createdAt),0)/deadlines.length/86400) : 0;
  return c.json({ success: true, kpis: { totalVisaCases: total, exceptionRate, avgCompletionDays: avgCompletion, deadlinesOverdue: exception } });
});

// C5 — Visa Anxiety-Grade Tracker (VP0: official verbatim + plain explainer + checkedAt, change-only)
visaGoldRouter.get('/tracker/:bookingId', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const bookingId = c.req.param('bookingId');
  const eng = await db.select().from(engagements).where(eq(engagements.id, bookingId)).get();
  if (!eng) return c.json({ error: 'Booking not found' }, 404);
  const deadlines = await db.select().from(visaDeadlines).where(eq(visaDeadlines.bookingId, bookingId)).orderBy(visaDeadlines.dueAt).all();
  const docs = await db.select().from(documents).where(eq(documents.clientId, (eng as any).clientId)).all();
  const officialStatus = (eng as any).stageKey || 'lead';
  const plainMap: Record<string,string> = {
    lead: 'Application initiated — gathering documents',
    documents: 'Documents under review — we check completeness',
    processing: 'Submitted to authority — awaiting decision',
    decision: 'Decision made — check offer/visa stamp',
    complete: 'Completed — ready for travel',
  };
  const timeline = (deadlines as any[]).map(d=> ({ type: d.type, dueAt: d.dueAt, status: d.status, checkedAt: Math.floor(Date.now()/1000) }));
  return c.json({ success: true, tracker: { bookingId, officialStatus, plainExplainer: plainMap[officialStatus] || 'Status update', checkedAt: Math.floor(Date.now()/1000), timeline, docsCount: docs.length, nextDeadline: (deadlines as any[]).find(d=> d.status==='pending') || null } });
});
