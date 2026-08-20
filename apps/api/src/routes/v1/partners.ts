import { Hono } from 'hono';
import { getDb } from '../../db/client.js';
import { partners, referrals } from '../../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { apiKeyAuth } from '../../middleware/apiKeyAuth.js';

export const v1PartnersRouter = new Hono<{ Bindings: { DB: D1Database } }>();

// GET /api/v1/partners — List Active Partners & Referral Codes
v1PartnersRouter.get('/', apiKeyAuth(['partners:read']), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB unavailable' }, 500);
  const db = getDb(c.env.DB);

  try {
    const rows = await db
      .select()
      .from(partners)
      .where(eq(partners.status, 'active'))
      .orderBy(desc(partners.createdAt))
      .all();

    return c.json({
      success: true,
      data: rows.map((p: any) => ({
        id: p.id,
        name: p.name,
        email: p.email,
        referralCode: p.referralCode,
        referralLink: p.referralCode ? `https://opusoverseas.com/?ref=${p.referralCode}` : null,
        status: p.status,
        createdAt: p.createdAt,
      })),
      count: rows.length,
    });
  } catch (err: any) {
    return c.json({ error: 'Failed to retrieve partners', details: err.message }, 500);
  }
});
