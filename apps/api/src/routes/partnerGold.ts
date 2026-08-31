import { Hono } from 'hono';
import { getDb } from '../db/client.js';
import { referrals, engagements, paymentSchedules, partners } from '../db/schema.js';
import { eq, inArray } from 'drizzle-orm';
import { getAuth } from '../auth.js';

export const partnerGoldRouter = new Hono<{ Bindings: { DB: D1Database; BETTER_AUTH_SECRET?: string } }>();

// Partner-scoped auth helper (accepts bearer apiToken or BetterAuth session)
async function authPartner(
  db: ReturnType<typeof getDb>,
  id: string,
  c: { env: { DB: D1Database; BETTER_AUTH_SECRET?: string }; req: { header: (name: string) => string | undefined; raw: Request } }
): Promise<any | null> {
  const partner = await db.select().from(partners).where(eq(partners.id, id)).get();
  if (!partner || partner.status !== 'active') return null;

  const authHeader = c.req.header('Authorization') || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (bearer && partner.apiToken && bearer === partner.apiToken) return partner;

  if (partner.email && c.env.BETTER_AUTH_SECRET) {
    const auth = getAuth(c.env as any);
    const session = await auth.api.getSession({ headers: c.req.raw.headers }).catch(() => null);
    if (session?.user?.email && session.user.email.toLowerCase() === partner.email.toLowerCase()) return partner;
  }
  return null;
}

// P1 — Booking Tower: partner sees bookings for their referred clients (auth bound)
partnerGoldRouter.get('/:id/bookings', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const id = c.req.param('id');
  const authed = await authPartner(db, id, c);
  if (!authed) return c.json({ error: 'Unauthorized: valid partner token or session required' }, 401);

  const refs = await db.select().from(referrals).where(eq(referrals.partnerId, id)).all();
  const clientIds = refs.map((r: any) => r.clientId);
  let engs: any[] = [];
  if (clientIds.length) {
    engs = await db.select().from(engagements).where(inArray(engagements.clientId, clientIds)).all();
  }
  const division = c.req.query('division');
  if (division) engs = engs.filter((e: any) => e.division === division);
  return c.json({ success: true, bookings: engs, total: engs.length });
});

// P2 — Commission Ledger: collectedBy = partnerId (auth bound)
partnerGoldRouter.get('/:id/ledger', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const id = c.req.param('id');
  const authed = await authPartner(db, id, c);
  if (!authed) return c.json({ error: 'Unauthorized: valid partner token or session required' }, 401);

  const rows = await db.select().from(paymentSchedules).where(eq(paymentSchedules.collectedBy, id)).orderBy(paymentSchedules.dueAt).all();
  const totalCollected = rows.filter((r: any) => r.status === 'paid').reduce((a: any, b: any) => a + b.amount, 0);
  const pending = rows.filter((r: any) => r.status === 'pending').reduce((a: any, b: any) => a + b.amount, 0);
  return c.json({ success: true, ledger: rows, totalCollected, pending });
});

// P3 — Performance per sub-agent (bookings, conversion, error) (auth bound)
partnerGoldRouter.get('/:id/performance', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const id = c.req.param('id');
  const authed = await authPartner(db, id, c);
  if (!authed) return c.json({ error: 'Unauthorized: valid partner token or session required' }, 401);

  const refs = await db.select().from(referrals).where(eq(referrals.partnerId, id)).all();
  const clientIds = refs.map((r: any) => r.clientId);
  const engs = clientIds.length ? (await db.select().from(engagements).all()).filter((e: any) => clientIds.includes(e.clientId)) : [];
  const bookings = engs.length;
  const converted = engs.filter((e: any) => ['complete', 'decision'].includes(e.stageKey)).length;
  const conversion = bookings ? Math.round((converted / bookings) * 100) : 0;
  const deadlines = await db.select().from(paymentSchedules).where(eq(paymentSchedules.status, 'overdue' as any)).all().catch(() => [] as any[]);
  const overdueForPartner = deadlines.filter((d: any) => d.collectedBy === id).length;
  return c.json({ success: true, performance: { bookings, converted, conversion, overdue: overdueForPartner, referrals: refs.length } });
});
