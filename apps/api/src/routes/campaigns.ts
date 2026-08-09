// Campaign catalog management (Wave 2 brainstorm) — SUPER_ADMIN ONLY.
// Mounted at /api/admin/campaigns (already under the owner ceiling via
// rbacMiddleware(['super_admin']) in index.ts). Managers can trigger nurture
// planning, but the campaign library itself is an owner surface.

import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { getDb } from '../db/client.js';
import { campaigns, campaignTouches } from '../db/schema.js';
import { eq } from 'drizzle-orm';

type CampaignBindings = { DB: D1Database; BETTER_AUTH_SECRET?: string };
type D1 = ReturnType<typeof getDb>;

export const campaignsRouter = new Hono<{ Bindings: CampaignBindings }>();

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

// POST /api/admin/campaigns — create a campaign with its touch plan
campaignsRouter.post('/', zValidator('json', campaignSchema), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const now = Math.floor(Date.now() / 1000);
  const data = c.req.valid('json');
  try {
    const existing = await db.select({ id: campaigns.id }).from(campaigns).where(eq(campaigns.key, data.key)).all();
    if (existing.length > 0) return c.json({ error: 'campaign key already exists', key: data.key }, 409);

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

// GET /api/admin/campaigns — catalog with touches (newest first)
campaignsRouter.get('/', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  try {
    const rows = await db.select().from(campaigns).all();
    const result = [];
    for (const r of rows) {
      const touches = await db.select().from(campaignTouches).where(eq(campaignTouches.campaignId, r.id)).all()
        .then((t) => t.slice().sort((a, b) => a.seq - b.seq));
      result.push({ ...r, touches });
    }
    result.sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0));
    return c.json({ campaigns: result });
  } catch (e: any) {
    return c.json({ error: 'Campaign list failed', details: e.message }, 500);
  }
});

// PATCH /api/admin/campaigns/:key/status  { status: draft|active|paused }
campaignsRouter.patch('/:key/status', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
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