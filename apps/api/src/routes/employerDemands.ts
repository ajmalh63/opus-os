import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { getDb } from '../db/client.js';
import { employerDemands, waOutbox } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { auditEvent } from '../middleware/audit.js';
import { createStaffAlert } from '../infra/staffAlerts.js';
import { publishSyncEvent } from './sync.js';

export const publicEmployerDemandsRouter = new Hono<{ Bindings: { DB: D1Database } }>();
export const employerDemandsRouter = new Hono<{ Bindings: { DB: D1Database }; Variables: { user?: { id?: string; role?: string } | null } }>();

const createEmployerDemandSchema = z.object({
  companyName: z.string().min(2, 'Company name is required'),
  contactName: z.string().min(2, 'Contact name is required'),
  workEmail: z.string().email('Valid work email is required'),
  phone: z.string().min(8, 'Phone is required'),
  industry: z.string().min(2, 'Industry is required'),
  positionType: z.string().min(2, 'Position type is required'),
  numberOfPositions: z.number().int().min(1).max(500),
  urgency: z.enum(['immediate', 'soon', 'moderate', 'planning']),
  engagementType: z.enum(['direct_hire', 'contract', 'temp_to_hire', 'contract_to_hire', 'open']),
  payRange: z.string().min(2, 'Pay range is required'),
  jobDescription: z.string().min(20, 'Job description must be at least 20 characters'),
  decisionMaker: z.string().optional(),
});

// POST /api/public/employer-demands — structured B2B intake (Turnstile + rateLimit outside)
publicEmployerDemandsRouter.post('/', zValidator('json', createEmployerDemandSchema), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const body = c.req.valid('json');
  const now = Math.floor(Date.now() / 1000);
  try {
    const id = `ED-${now}-${crypto.randomUUID().slice(0, 6)}`;
    await db.insert(employerDemands).values({
      id,
      companyName: body.companyName.trim(),
      contactName: body.contactName.trim(),
      workEmail: body.workEmail.trim().toLowerCase(),
      phone: body.phone.trim(),
      industry: body.industry,
      positionType: body.positionType,
      numberOfPositions: body.numberOfPositions,
      urgency: body.urgency,
      engagementType: body.engagementType,
      payRange: body.payRange,
      jobDescription: body.jobDescription.trim(),
      decisionMaker: body.decisionMaker?.trim() || null,
      status: 'new',
      source: 'website-hire',
      createdAt: now,
      updatedAt: now,
    } as any);

    // Staff alert + waOutbox + sync (gold standard: alert BD team in <5 min)
    const waId = `wa_${now}_${crypto.randomUUID().slice(0, 8)}`;
    const waBody = `New Employer Demand 🧳\n\nCompany: ${body.companyName}\nContact: ${body.contactName} (${body.phone}, ${body.workEmail})\nIndustry: ${body.industry}\nRoles: ${body.positionType} × ${body.numberOfPositions}\nUrgency: ${body.urgency} | Engagement: ${body.engagementType}\nPay: ${body.payRange}\n\nJD: ${body.jobDescription.slice(0, 400)}${body.jobDescription.length > 400 ? '…' : ''}\n\n→ Kanban: Employer Demand #${id}`;

    try {
      await db.insert(waOutbox).values({
        id: waId,
        toPhone: '+919398848376', // BD hotline — replace with env var if needed
        direction: 'outbound',
        type: 'text',
        body: waBody,
        status: 'queued',
        category: 'utility',
        createdAt: now,
        updatedAt: now,
      } as any);
    } catch {}

    // Fire-and-forget WhatsApp via wa.opusoverseas.com if configured
    try {
      const base = (c.env as any).OPENWA_BASE_URL || 'https://wa.opusoverseas.com';
      const key = (c.env as any).OPENWA_API_KEY || '';
      const sess = (c.env as any).OPENWA_SESSION_ID || 'main';
      if (base && key) {
        fetch(`${(base as string).replace(/\/$/, '')}/api/sessions/${encodeURIComponent(sess)}/messages/send-text`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'X-API-Key': key },
          body: JSON.stringify({ chatId: `919398848376@c.us`, text: waBody }),
        }).catch(() => {}).then(async (r: any) => {
          if (r?.ok) {
            try {
              const j = await r.json().catch(() => ({})) as any;
              await db.update(waOutbox).set({ status: 'sent', wamid: j?.messageId || null, updatedAt: Math.floor(Date.now()/1000) }).where(eq(waOutbox.id, waId));
            } catch {}
          }
        });
      }
    } catch {}

    await createStaffAlert(c.env as any, {
      division: 'manpower',
      type: 'employer_demand',
      title: `New Employer Demand — ${body.companyName} (${body.industry})`,
      body: `${body.positionType} × ${body.numberOfPositions} — ${body.urgency} — ${body.engagementType} — ${body.payRange}`,
      payload: { demandId: id, companyName: body.companyName, industry: body.industry, urgency: body.urgency },
    } as any).catch(() => {});

    try {
      await publishSyncEvent(c.env as any, { channel: `staff:global:manpower`, type: 'EMPLOYER_DEMAND_CREATED', payload: { id, companyName: body.companyName, industry: body.industry, urgency: body.urgency } }, (c as any).executionCtx);
      await publishSyncEvent(c.env as any, { channel: `staff:global:manpower:employer`, type: 'EMPLOYER_DEMAND_CREATED', payload: { id } }, (c as any).executionCtx);
    } catch {}

    await auditEvent(c as any, { action: 'EMPLOYER_DEMAND_CREATED', entityName: 'employer_demands', entityId: id, afterState: { companyName: body.companyName, industry: body.industry, positionType: body.positionType, numberOfPositions: body.numberOfPositions } }).catch(() => {});

    return c.json({ success: true, id, message: 'Demand received — our BD team will call today. Time-to-shortlist: 7 days.' }, 201);
  } catch (e: any) {
    return c.json({ error: 'Failed to submit demand', details: e?.message }, 500);
  }
});

// GET /api/employer-demands — staff list (manager+ with blind-bridge masking for agency roles)
function maskDemandForAgency(row: any) {
  if (!row?.blindBridge) return row;
  return { ...row, companyName: 'Confidential Employer', payRange: 'Confidential', workEmail: row.workEmail ? row.workEmail.replace(/(?<=.{2}).*(?=@)/, '***') : row.workEmail, phone: row.phone ? '***-***-' + String(row.phone).slice(-4) : row.phone };
}
function isAgencyRole(role?: string) { return role === 'counselor' || role === 'partner' || role === 'coordinator' || role === 'receptionist'; }
employerDemandsRouter.get('/', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  try {
    const status = c.req.query('status');
    let rows = await db.select().from(employerDemands).orderBy(desc(employerDemands.createdAt)).all();
    if (status) rows = rows.filter((r: any) => r.status === status);
    const role = (c.get('user' as any) as any)?.role;
    if (isAgencyRole(role)) rows = rows.map((r:any)=> maskDemandForAgency(r));
    return c.json({ success: true, demands: rows, count: rows.length });
  } catch (e: any) {
    return c.json({ error: 'Failed to fetch demands', details: e?.message }, 500);
  }
});

// PATCH /api/employer-demands/:id/status — staff workflow (new → qualified → active → closed)
employerDemandsRouter.patch('/:id/status', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({})) as { status?: string };
  const allowed = ['new', 'qualified', 'active', 'closed', 'rejected'];
  if (!body.status || !allowed.includes(body.status)) return c.json({ error: `status must be one of ${allowed.join(', ')}` }, 400);
  const now = Math.floor(Date.now() / 1000);
  try {
    const row = await db.select().from(employerDemands).where(eq(employerDemands.id, id)).get() as any;
    if (!row) return c.json({ error: 'Demand not found' }, 404);
    await db.update(employerDemands).set({ status: body.status as any, updatedAt: now }).where(eq(employerDemands.id, id));
    await auditEvent(c as any, { action: 'EMPLOYER_DEMAND_STATUS', entityName: 'employer_demands', entityId: id, afterState: { oldStatus: row.status, newStatus: body.status } }).catch(() => {});
    try {
      await publishSyncEvent(c.env as any, { channel: `staff:global:manpower`, type: 'EMPLOYER_DEMAND_STATUS', payload: { id, status: body.status } }, (c as any).executionCtx);
      await publishSyncEvent(c.env as any, { channel: `staff:global:manpower:employer`, type: 'EMPLOYER_DEMAND_STATUS', payload: { id, status: body.status } }, (c as any).executionCtx);
    } catch {}
    return c.json({ success: true, message: `Demand ${id} → ${body.status}` });
  } catch (e: any) {
    return c.json({ error: 'Status update failed', details: e?.message }, 500);
  }
});

// PATCH /api/employer-demands/:id/blind-bridge — toggle (manager+)
employerDemandsRouter.patch('/:id/blind-bridge', async (c) => {
  const role = (c.get('user' as any) as any)?.role;
  if (role !== 'super_admin' && role !== 'manager') return c.json({ error: 'Forbidden — manager+ only' }, 403);
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const id = c.req.param('id');
  const body = await c.req.json().catch(()=>({})) as any;
  if (typeof body.blindBridge !== 'boolean') return c.json({ error: 'blindBridge boolean required' }, 400);
  try {
    const row = await db.select().from(employerDemands).where(eq(employerDemands.id, id)).get();
    if (!row) return c.json({ error: 'Demand not found' }, 404);
    await db.update(employerDemands).set({ blindBridge: body.blindBridge, updatedAt: Math.floor(Date.now()/1000) }).where(eq(employerDemands.id, id));
    await auditEvent(c as any, { action: 'EMPLOYER_DEMAND_BLIND_TOGGLE', entityName: 'employer_demands', entityId: id, afterState: { blindBridge: body.blindBridge } }).catch(()=>{});
    return c.json({ success: true, blindBridge: body.blindBridge });
  } catch (e:any) { return c.json({ error: 'Failed to toggle blindBridge', details: e?.message }, 500); }
});

// GET /api/employer-demands/:id — detail (masked for agency if blindBridge)
employerDemandsRouter.get('/:id', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  try {
    const row:any = await db.select().from(employerDemands).where(eq(employerDemands.id, c.req.param('id'))).get();
    if (!row) return c.json({ error: 'Demand not found' }, 404);
    const role = (c.get('user' as any) as any)?.role;
    const out = isAgencyRole(role) && row.blindBridge ? maskDemandForAgency(row) : row;
    return c.json({ success: true, demand: out });
  } catch (e: any) {
    return c.json({ error: 'Failed to fetch demand', details: e?.message }, 500);
  }
});
