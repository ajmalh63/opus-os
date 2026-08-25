import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { getDb } from '../db/client.js';
import { referrals, engagements, paymentSchedules, clients, partners } from '../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';
import { publishSyncEvent } from './sync.js';

export const partnerGoldRouter = new Hono<{ Bindings: { DB: D1Database } }>();
const now = () => Math.floor(Date.now()/1000);

// P1 — Booking Tower: partner sees bookings for their referred clients
partnerGoldRouter.get('/:id/bookings', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const id = c.req.param('id');
  const partner = await db.select().from(partners).where(eq(partners.id, id)).get();
  if (!partner) return c.json({ error: 'Partner not found' }, 404);
  const refs = await db.select().from(referrals).where(eq(referrals.partnerId, id)).all();
  const clientIds = refs.map((r:any)=> r.clientId);
  let engs: any[] = [];
  if (clientIds.length) {
    // Drizzle doesn't have IN helper easily, so fetch all and filter
    const all = await db.select().from(engagements).all();
    engs = all.filter((e:any)=> clientIds.includes(e.clientId));
  }
  const division = c.req.query('division');
  if (division) engs = engs.filter((e:any)=> e.division === division);
  return c.json({ success: true, bookings: engs, total: engs.length });
});

// P2 — Commission Ledger: collectedBy = partnerId
partnerGoldRouter.get('/:id/ledger', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const id = c.req.param('id');
  const rows = await db.select().from(paymentSchedules).where(eq(paymentSchedules.collectedBy, id)).orderBy(paymentSchedules.dueAt).all();
  const totalCollected = rows.filter((r:any)=> r.status==='paid').reduce((a:any,b:any)=> a + b.amount, 0);
  const pending = rows.filter((r:any)=> r.status==='pending').reduce((a:any,b:any)=> a + b.amount, 0);
  return c.json({ success: true, ledger: rows, totalCollected, pending });
});

// P3 — Performance per sub-agent (bookings, conversion, error)
partnerGoldRouter.get('/:id/performance', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const id = c.req.param('id');
  const refs = await db.select().from(referrals).where(eq(referrals.partnerId, id)).all();
  const clientIds = refs.map((r:any)=> r.clientId);
  const engs = clientIds.length ? (await db.select().from(engagements).all()).filter((e:any)=> clientIds.includes(e.clientId)) : [];
  const bookings = engs.length;
  const converted = engs.filter((e:any)=> ['complete','decision'].includes(e.stageKey)).length;
  const conversion = bookings ? Math.round((converted/bookings)*100) : 0;
  const deadlines = await db.select().from(paymentSchedules).where(eq(paymentSchedules.status, 'overdue' as any)).all().catch(()=>[] as any[]);
  const overdueForPartner = deadlines.filter((d:any)=> d.collectedBy === id).length;
  return c.json({ success: true, performance: { bookings, converted, conversion, overdue: overdueForPartner, referrals: refs.length } });
});
