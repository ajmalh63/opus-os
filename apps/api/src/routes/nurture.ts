import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { getDb } from '../db/client.js';
import { nurtureTouches, consents, engagements, clients } from '../db/schema.js';
import { eq, and, lte } from 'drizzle-orm';

// WhatsApp re-nurture sequence engine (FunnelTODO #4).
// Provider-agnostic: rows are staged outbound touches due at day offsets; a
// Listmonk/OpenWA consumer polls /api/marketing/nurture/due and marks rows sent
// via /api/marketing/nurture/:id/send. DPDP-safe: only planned for leads with
// granted whatsapp-updates consent.
//
// Sequence cadence (gold-standard re-engagement — email-sequence skill):
//   Day 0  value      — check-in, no pressure
//   Day 3  case_study — a real recent student result
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
  if (existing.length > 0) return { status: 'already_planned', count: existing.length };

  const division = (await db.select().from(engagements).where(eq(engagements.clientId, clientId)).get())?.division || 'study-abroad';
  const started = Math.floor(Date.now() / 1000);
  for (const s of SEQUENCE) {
    await db.insert(nurtureTouches).values({
      id: crypto.randomUUID(),
      clientId,
      engagementId,
      channel: 'whatsapp',
      stage: s.stage,
      body: s.build(client.name, division),
      dueAt: started + s.day * 86400,
      status: 'scheduled',
      createdAt: started,
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