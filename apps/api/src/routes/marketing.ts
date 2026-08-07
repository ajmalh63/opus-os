import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { getDb } from '../db/client.js';
import { clients, interactionPoints, scoringEvents, segments } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';

export const marketingRouter = new Hono<{ Bindings: { DB: D1Database; BETTER_AUTH_SECRET: string } }>();

// Default interaction point catalog (Section 26.2.1 - automated event-driven scoring)
const DEFAULT_POINTS: { code: string; points: number; description: string }[] = [
  { code: 'website_lead_form', points: 10, description: 'Website lead form submitted' },
  { code: 'partner_referral', points: 15, description: 'Referral from partner' },
  { code: 'walk_in', points: 20, description: 'Walk-in visitor' },
  { code: 'destination_specified', points: 10, description: 'Target country specified' },
  { code: 'budget_given', points: 15, description: 'Budget provided' },
  { code: 'whatsapp_reply', points: 15, description: 'Replied on WhatsApp within 24h' },
  { code: 'email_opened', points: 5, description: 'Opened marketing email' },
  { code: 'download_checklist', points: 10, description: 'Downloaded checklist' },
  { code: 'consultation_booked', points: 30, description: 'Booked a consultation' },
  { code: 'portal_account_created', points: 25, description: 'Created client-portal account' },
  { code: 'job_application_submitted', points: 25, description: 'Submitted job application' },
  { code: 'resume_uploaded', points: 20, description: 'Uploaded resume' },
  { code: 'testimonial_submitted', points: 8, description: 'Submitted testimonial' },
];

// Gold-standard band boundaries (Section 26.2) - cold <50, warm 50-75, hot >75
const HOT = 75;
const WARM = 50;

// POST /api/marketing/interactions  { clientId, interactionCode, source? }
// Records one interaction event -> auto-applies its points to the lead score.
const interactionSchema = z.object({
  clientId: z.string().min(1),
  interactionCode: z.string().min(1),
  source: z.string().optional(),
});

marketingRouter.post('/interactions', zValidator('json', interactionSchema), async (c) => {
  const data = c.req.valid('json');
  if (!c.env || !c.env.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  const now = Math.floor(Date.now() / 1000);

  try {
    const client = await db.select().from(clients).where(eq(clients.id, data.clientId)).get();
    if (!client) return c.json({ error: "Client not found" }, 404);

    // Look up point value from catalog (seed if empty)
    let points = await db.select().from(interactionPoints).where(eq(interactionPoints.code, data.interactionCode)).get();
    if (!points) {
      // ensure catalog seeded
      const count = await db.select().from(interactionPoints).all();
      if (count.length === 0) {
        for (const p of DEFAULT_POINTS) {
          await db.insert(interactionPoints).values(p).onConflictDoNothing();
        }
      }
      points = await db.select().from(interactionPoints).where(eq(interactionPoints.code, data.interactionCode)).get();
    }
    if (!points || points.points <= 0) {
      return c.json({ error: `Unknown interaction code: ${data.interactionCode}` }, 400);
    }

    await db.insert(scoringEvents).values({
      id: crypto.randomUUID(),
      clientId: data.clientId,
      interactionCode: data.interactionCode,
      points: points.points,
      source: data.source || 'api',
      createdAt: now,
    });

    return c.json({
      success: true,
      points_awarded: points.points,
      interaction: data.interactionCode,
      message: "Interaction scored.",
    });
  } catch (error: any) {
    return c.json({ error: "Interaction scoring failed", details: error.message }, 500);
  }
});

// GET /api/marketing/leads/:id/score
// Returns total, band (hot/warm/cold/junk), full event log + recent activity date.
marketingRouter.get('/leads/:id/score', async (c) => {
  const clientId = c.req.param('id');
  if (!c.env || !c.env.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);

  try {
    const client = await db.select().from(clients).where(eq(clients.id, clientId)).get();
    if (!client) return c.json({ error: "Client not found" }, 404);

    const events = await db.select().from(scoringEvents).where(eq(scoringEvents.clientId, clientId)).orderBy(desc(scoringEvents.createdAt)).all();

    let total = 0;
    const byType: Record<string, number> = {};
    for (const e of events) {
      const pos = Math.max(0, e.points);
      total += pos;
      byType[e.interactionCode] = (byType[e.interactionCode] || 0) + pos;
    }

    let band: 'hot' | 'warm' | 'cold' = 'cold';
    if (total >= HOT) band = 'hot';
    else if (total >= WARM) band = 'warm';

    return c.json({
      clientId,
      score: total,
      band,
      thresholds: { hot: HOT, warm: WARM },
      breakdown: byType,
      eventCount: events.length,
      lastInteractionAt: events[0]?.createdAt || null,
    });
  } catch (error: any) {
    return c.json({ error: "Score lookup failed", details: error.message }, 500);
  }
});

// GET /api/marketing/segments?band=hot (list segments ; simple built-in band grouping)
marketingRouter.get('/segments', async (c) => {
  if (!c.env || !c.env.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  const band = c.req.query('band');

  try {
    const stored = await db.select().from(segments).all();
    if (stored.length > 0) {
      return c.json({ segments: band ? stored.filter(s => (s.rulesJson || '').includes(band)) : stored });
    }
    // No DB segments configured: derive bands dynamically from current scores
    const clients_ = await db.select().from(clients).all();
    const bands: Record<string, number[]> = { hot: [], warm: [], cold: [] };
    for (const cl of clients_) {
      const ev = await db.select().from(scoringEvents).where(eq(scoringEvents.clientId, cl.id)).all();
      const score = ev.reduce((a, b) => a + Math.max(0, b.points), 0);
      if (score >= HOT) bands.hot.push(score);
      else if (score >= WARM) bands.warm.push(score);
      else bands.cold.push(score);
    }
    const safe = (arr: number[]) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : 0;
    const derived = [
      { name: 'Hot (auto)', rulesJson: JSON.stringify({ band: 'hot' }), avgScore: safe(bands.hot), count: bands.hot.length },
      { name: 'Warm (auto)', rulesJson: JSON.stringify({ band: 'warm' }), avgScore: safe(bands.warm), count: bands.warm.length },
      { name: 'Cold (auto)', rulesJson: JSON.stringify({ band: 'cold' }), avgScore: safe(bands.cold), count: bands.cold.length },
    ];
    return c.json({ segments: band ? derived.filter(s => s.rulesJson.includes(band)) : derived, derived: true });
  } catch (error: any) {
    return c.json({ error: "Segment lookup failed", details: error.message }, 500);
  }
});

// GET /api/marketing/leads (all scores for SuperUser marketing tab)
marketingRouter.get('/leads', async (c) => {
  if (!c.env || !c.env.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  try {
    const allClients = await db.select().from(clients).all();
    const rows = [];
    for (const cl of allClients) {
      const ev = await db.select().from(scoringEvents).where(eq(scoringEvents.clientId, cl.id)).all();
      const score = ev.reduce((a, b) => a + Math.max(0, b.points), 0);
      const band = score >= HOT ? 'hot' : score >= WARM ? 'warm' : 'cold';
      rows.push({ clientId: cl.id, name: cl.name, phone: cl.phone, email: cl.email, score, band, interactions: ev.length });
    }
    return c.json({ leads: rows });
  } catch (error: any) {
    return c.json({ error: "Lead scoring fetch failed", details: error.message }, 500);
  }
});