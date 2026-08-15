// Campaign catalog — INFORMATIONAL ONLY (Tool-First strategy, Wave 3).
// Operations now live in best-of-breed tools (Listmonk email, Mautic journeys,
// Chatwoot conversations, OpenWA WhatsApp); the OS reads them through the
// /api/integrations adapters. This module is the legacy read-side only:
// GET lists OS-defined campaigns (seeded/legacy) with their touch plans.

import { Hono } from 'hono';
import { getDb } from '../db/client.js';
import { campaigns, campaignTouches } from '../db/schema.js';
import { eq } from 'drizzle-orm';

type CampaignBindings = { DB: D1Database; BETTER_AUTH_SECRET?: string };
type D1 = ReturnType<typeof getDb>;

export const campaignsRouter = new Hono<{ Bindings: CampaignBindings }>();

// GET /api/admin/campaigns — read-only catalog with touches (newest first)
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