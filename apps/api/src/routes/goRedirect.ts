import { Hono } from 'hono';
import { getDb } from '../db/client.js';
import { partners, partnerLinks } from '../db/schema.js';
import { eq } from 'drizzle-orm';

// Public affiliate redirect — dedicated router mounted ONLY at /go.
// /go/:ref/:type/:id → records a click on the partner's link, then 302s to
// the public division page (with ?ref= so the lead form attributes).
const VALID: Record<string, string> = {
  university: '/study-abroad',
  departure: '/umrah-travel',
  job: '/recruitment',
  visa: '/visa-services',
  umrah_package: '/umrah-travel',
};

export const goRouter = new Hono<{ Bindings: { DB: D1Database; BETTER_AUTH_SECRET: string } }>();

goRouter.get('/:ref/:type/:id', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const { ref, type, id } = c.req.param();
  if (!VALID[type]) return c.json({ error: 'Bad link type' }, 400);

  const now = Math.floor(Date.now() / 1000);
  const partner = await db.select().from(partners).where(eq(partners.referralCode, ref)).get();

  // click tracking (fail-open)
  if (partner) {
    try {
      const links = await db.select().from(partnerLinks).all();
      const link = links.find((l: any) => l.partnerId === partner.id && l.catalogType === type && l.catalogItemId === id);
      if (link) {
        await db.update(partnerLinks).set({ clicks: (link.clicks || 0) + 1, lastClickedAt: now }).where(eq(partnerLinks.id, link.id));
      }
    } catch (e: any) { console.error('click tracking failed', e?.message); }
  }

  return c.redirect(`${VALID[type]}${ref ? `?ref=${ref}` : ''}`, 302);
});