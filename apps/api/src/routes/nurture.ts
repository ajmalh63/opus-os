import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { getDb } from '../db/client.js';
import { nurtureTouches, consents, engagements, clients, campaigns, campaignTouches } from '../db/schema.js';
import { eq, and, lte } from 'drizzle-orm';

// WhatsApp re-nurture sequence engine (FunnelTODO #4).
// Provider-agnostic: rows are staged outbound touches due at day offsets; a
// Listmonk/OpenWA consumer polls /api/marketing/nurture/due and marks rows sent
// via /api/marketing/nurture/:id/send. DPDP-safe: only planned for leads with
// granted whatsapp-updates consent.
//
// Campaign-aware planning (Wave 2 brainstorm): a lead is matched to the first
// ACTIVE campaign for its division whose eligibility predicate passes against
// its dynamicContext. Campaign touches override the legacy default SEQUENCE.
//
// Default cadence (gold-standard re-engagement — email-sequence skill):
//   Day 0  value      — check-in, no pressure
//   Day 3  case_study — a real recent result
//   Day 5  offer      — free no-obligation consultation
//   Day 12 final      — honest last check-in

const SEQUENCE: { stage: 'value' | 'case_study' | 'offer' | 'final'; day: number; build: (name: string, division: string) => string }[] = [
  {
    stage: 'value',
    day: 0,
    build: (n, d) => `Hi ${n}! You explored ${d.toUpperCase()} with Opus Overseas a while back. No pressure at all — just letting you know we're here if you'd like to pick it up again.`,
  },
  {
    stage: 'case_study',
    day: 3,
    build: (n, d) => `Hi ${n}, one of our recent ${d.toUpperCase()} cases went from enquiry to signed in under a month. Happy to walk you through how.`,
  },
  {
    stage: 'offer',
    day: 5,
    build: (n) => `Hi ${n}, how about a free, no-obligation consultation? Reply YES and we'll set a time that suits you.`,
  },
  {
    stage: 'final',
    day: 12,
    build: (n) => `Hi ${n}, last check-in from us unless you'd like more. If there's any way we can help with your journey, just reply — we're here.`,
  },
];

type NurtureBindings = { DB: D1Database; BETTER_AUTH_SECRET?: string };
type D1 = ReturnType<typeof getDb>;

type CampaignRow = {
  id: string; key: string; name: string; description: string | null;
  division: string; eligibilityJson: string; status: string;
  createdAt: number; updatedAt: number;
};
type TouchRow = { id: string; campaignId: string; seq: number; day: number; stage: 'value' | 'case_study' | 'offer' | 'final'; body: string; createdAt: number };

function safeParse(raw: string | null | undefined): Record<string, any> {
  try { return raw ? JSON.parse(raw) : {}; } catch { return {}; }
}

// Match the lead to the first ACTIVE campaign for its division whose eligibility
// predicate passes against its intake context. Predicate shape in
// campaigns.eligibilityJson: { "<contextKey>": [allowed] } — array = OR within
// key, keys = AND; empty/absent predicate applies to the whole division.
export async function pickCampaign(db: D1, division: string, context: Record<string, any>): Promise<{ campaign: CampaignRow; touches: TouchRow[] } | null> {
  const rows = await db.select().from(campaigns).where(eq(campaigns.division, division as any)).all();
  for (const c of rows) {
    if (c.status !== 'active') continue;
    const pred = safeParse(c.eligibilityJson);
    const keys = Object.keys(pred);
    const matched = keys.length === 0 || keys.every((k) => {
      const allowed = pred[k];
      const v = context?.[k];
      if (v === undefined || v === null) return false;
      return Array.isArray(allowed) ? allowed.some((a: any) => String(a).toLowerCase() === String(v).toLowerCase()) : String(allowed).toLowerCase() === String(v).toLowerCase();
    });
    if (!matched) continue;
    const touches = await db.select().from(campaignTouches).where(eq(campaignTouches.campaignId, c.id)).all()
      .then((rs) => rs.slice().sort((a, b) => a.seq - b.seq)) as unknown as TouchRow[];
    return { campaign: c, touches };
  }
  return null;
}

async function planSequence(db: D1, clientId: string, engagementId: string | null, now: number) {
  const client = await db.select().from(clients).where(eq(clients.id, clientId)).get();
  if (!client) throw Object.assign(new Error("Client not found"), { status: 404 });

  const consent = await db.select().from(consents)
    .where(and(
      eq(consents.clientId, clientId),
      eq(consents.consentType, 'whatsapp-updates'),
      eq(consents.status, 'granted')
    ))
    .all();
  if (consent.length === 0) return { status: 'skipped', reason: 'no-whatsapp-consent' as const };

  const existing = await db.select().from(nurtureTouches).where(eq(nurtureTouches.clientId, clientId)).all();
  if (existing.length > 0) return { status: 'already_planned', campaignKey: existing[0].campaignId ?? null, count: existing.length };

  const engagement = await db.select().from(engagements).where(eq(engagements.clientId, clientId)).all();
  const div = engagement.find((e: any) => e.status === 'active')?.division || 'study-abroad';
  const context = safeParse(client.intakeContext);

  // CAMPAIGN-AWARE: division+context match wins over the default sequence.
  const matched = await pickCampaign(db, div, context);
  if (matched) {
    for (const touch of matched.touches) {
      await db.insert(nurtureTouches).values({
        id: crypto.randomUUID(),
        clientId,
        engagementId,
        channel: 'whatsapp',
        stage: touch.stage,
        body: touch.body,
        campaignId: matched.campaign.id,
        dueAt: now + touch.day * 86400,
        status: 'scheduled',
        createdAt: now,
      });
    }
    return { status: 'planned', campaignId: matched.campaign.key, count: matched.touches.length };
  }

  for (const s of SEQUENCE) {
    await db.insert(nurtureTouches).values({
      id: crypto.randomUUID(),
      clientId,
      engagementId,
      channel: 'whatsapp',
      stage: s.stage,
      body: s.build(client.name, div),
      dueAt: now + s.day * 86400,
      status: 'scheduled',
      createdAt: now,
    });
  }
  return { status: 'planned', count: SEQUENCE.length };
}

export const nurtureRouter = new Hono<{ Bindings: NurtureBindings }>();

// POST /api/marketing/nurture/plan  { clientId, engagementId? }
const planSchema = z.object({ clientId: z.string().min(1), engagementId: z.string().optional() });
nurtureRouter.post('/plan', zValidator('json', planSchema), async (c) => {
  if (!c.env || !c.env.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  try {
    const data = c.req.valid('json');
    const result = await planSequence(db, data.clientId, data.engagementId || null, Math.floor(Date.now() / 1000));
    return c.json({ success: true, ...result });
  } catch (error: any) {
    const status = error?.status || 500;
    return c.json({ error: error.message, details: error?.details }, status);
  }
});

// GET /api/marketing/nurture?clientId=  — the client's plan
nurtureRouter.get('/', async (c) => {
  if (!c.env || !c.env.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  try {
    const clientId = c.req.query('clientId');
    if (!clientId) return c.json({ touches: [] });
    const rows = await db.select().from(nurtureTouches).where(eq(nurtureTouches.clientId, clientId)).all();
    return c.json({ touches: rows });
  } catch (error: any) {
    return c.json({ error: "Nurture lookup failed", details: error.message }, 500);
  }
});

// GET /api/marketing/nurture/due?now=  — provider-consumer pull of due touches
nurtureRouter.get('/due', async (c) => {
  if (!c.env || !c.env.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  try {
    const now = Number(c.req.query('now')) || Math.floor(Date.now() / 1000);
    const rows = await db.select().from(nurtureTouches)
      .where(and(eq(nurtureTouches.status, 'scheduled'), lte(nurtureTouches.dueAt, now)))
      .all();
    return c.json({ touches: rows });
  } catch (error: any) {
    return c.json({ error: "Due touch lookup failed", details: error.message }, 500);
  }
});

// POST /api/marketing/nurture/:id/send  — mark a dispatched touch delivered
nurtureRouter.post('/:id/send', async (c) => {
  if (!c.env || !c.env.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  try {
    const id = c.req.param('id');
    const now = Math.floor(Date.now() / 1000);
    await db.update(nurtureTouches).set({ status: 'sent', sentAt: now }).where(eq(nurtureTouches.id, id)).run();
    const row = await db.select().from(nurtureTouches).where(eq(nurtureTouches.id, id)).all();
    if (row.length === 0) return c.json({ error: 'Touch not found' }, 404);
    return c.json({ success: true, id, status: 'sent' });
  } catch (error: any) {
    return c.json({ error: "Mark-sent failed", details: error.message }, 500);
  }
});

// ==========================================
// Campaign catalog (Wave 2 brainstorm) — manager+ surfaces
// ==========================================

// POST /api/marketing/nurture/campaigns  — create/activate a campaign
const campaignSchema = z.object({
  key: z.string().min(2).max(64),
  name: z.string().min(2),
  description: z.string().optional(),
  division: z.enum(['study-abroad', 'visa', 'umrah', 'attestation', 'manpower']),
  eligibilityJson: z.record(z.union([z.string(), z.array(z.string())])).optional(),
  status: z.enum(['draft', 'active', 'paused']).default('draft'),
  touches: z.array(z.object({
    seq: z.number().int().min(1),
    day: z.number().int().min(0),
    stage: z.enum(['value', 'case_study', 'offer', 'final']),
    body: z.string().min(1),
  })).min(1).max(12),
});
nurtureRouter.post('/campaigns', zValidator('json', campaignSchema), async (c) => {
  if (!c.env || !c.env.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const now = Math.floor(Date.now() / 1000);
  const data = c.req.valid('json');
  try {
    const id = crypto.randomUUID();
    await db.insert(campaigns).values({
      id,
      key: data.key,
      name: data.name,
      description: data.description || null,
      division: data.division,
      eligibilityJson: JSON.stringify(data.eligibilityJson || {}),
      status: data.status,
      createdAt: now,
      updatedAt: now,
    });
    for (const t of data.touches) {
      await db.insert(campaignTouches).values({
        id: crypto.randomUUID(),
        campaignId: id,
        seq: t.seq,
        day: t.day,
        stage: t.stage,
        body: t.body,
        createdAt: now,
      });
    }
    return c.json({ success: true, id, key: data.key, touchCount: data.touches.length });
  } catch (e: any) {
    return c.json({ error: 'Campaign create failed', details: e.message }, 500);
  }
});

// GET /api/marketing/nurture/campaigns  — list catalog (with touches)
nurtureRouter.get('/campaigns', async (c) => {
  if (!c.env || !c.env.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  try {
    const rows = await db.select().from(campaigns).all();
    const result = [];
    for (const r of rows) {
      const touches = await db.select().from(campaignTouches).where(eq(campaignTouches.campaignId, r.id)).all()
        .then((t) => t.slice().sort((a, b) => a.seq - b.seq));
      result.push({ ...r, touches });
    }
    return c.json({ campaigns: result });
  } catch (e: any) {
    return c.json({ error: 'Campaign list failed', details: e.message }, 500);
  }
});

// PATCH /api/marketing/nurture/campaigns/:key/status  — activate/pause/draft
nurtureRouter.patch('/campaigns/:key/status', async (c) => {
  if (!c.env || !c.env.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const key = c.req.param('key');
  const body = await c.req.json().catch(() => ({})) as { status?: string };
  if (!body.status || !['draft', 'active', 'paused'].includes(body.status)) {
    return c.json({ error: 'status must be draft|active|paused' }, 400);
  }
  try {
    await db.update(campaigns).set({ status: body.status as any, updatedAt: Math.floor(Date.now() / 1000) }).where(eq(campaigns.key, key)).run();
    return c.json({ success: true, key, status: body.status });
  } catch (e: any) {
    return c.json({ error: 'Campaign update failed', details: e.message }, 500);
  }
});