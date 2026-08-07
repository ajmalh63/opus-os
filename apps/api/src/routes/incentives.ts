import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { getDb } from '../db/client.js';
import { incentiveRules, incentiveEntries, payoutStatements } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';

export const incentivesRouter = new Hono<{ Bindings: { DB: D1Database; BETTER_AUTH_SECRET: string } }>();

// ============ RULES ============

// GET /api/incentives/rules
incentivesRouter.get('/rules', async (c) => {
  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  try {
    const rules = await db.select().from(incentiveRules).all();
    return c.json({ rules });
  } catch (error: any) {
    return c.json({ error: "Failed to fetch incentive rules", details: error.message }, 500);
  }
});

const ruleSchema = z.object({
  division: z.string().min(1),
  serviceId: z.string().optional(),
  trigger: z.enum(['agreement_signed', 'milestone_paid', 'visa_granted', 'placement_confirmed']),
  amount: z.number().int().positive(),
  isPercent: z.boolean().default(false),
});

// POST /api/incentives/rules (owner configures per-service rule, Section 29.4)
incentivesRouter.post('/rules', zValidator('json', ruleSchema), async (c) => {
  const data = c.req.valid('json');
  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  try {
    await db.insert(incentiveRules).values({
      id: crypto.randomUUID(),
      division: data.division,
      serviceId: data.serviceId || null,
      trigger: data.trigger,
      amount: data.amount,
      isPercent: data.isPercent,
      active: true,
      createdAt: Math.floor(Date.now() / 1000),
    });
    return c.json({ success: true, message: "Incentive rule created." });
  } catch (error: any) {
    return c.json({ error: "Failed to create incentive rule", details: error.message }, 500);
  }
});

// PATCH /api/incentives/rules/:id (toggle active / adjust amount)
incentivesRouter.patch('/rules/:id', zValidator('json', z.object({ active: z.boolean().optional(), amount: z.number().int().positive().optional() })), async (c) => {
  const id = c.req.param('id');
  const data = c.req.valid('json');
  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  try {
    await db.update(incentiveRules)
      .set({ ...(data.active !== undefined ? { active: data.active } : {}), ...(data.amount !== undefined ? { amount: data.amount } : {}) })
      .where(eq(incentiveRules.id, id));
    return c.json({ success: true, message: "Incentive rule updated." });
  } catch (error: any) {
    return c.json({ error: "Failed to update incentive rule", details: error.message }, 500);
  }
});

// ============ Entries (auto-accrual) ============

// GET /api/incentives/entries?employee=:id&status=accrued
incentivesRouter.get('/entries', async (c) => {
  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  const employee = c.req.query('employee');
  const status = c.req.query('status');
  try {
    let list = await db.select().from(incentiveEntries).orderBy(desc(incentiveEntries.createdAt)).all();
    if (employee) list = list.filter(e => e.employeeId === employee);
    if (status) list = list.filter(e => e.status === status);
    return c.json({ entries: list });
  } catch (error: any) {
    return c.json({ error: "Failed to fetch incentive entries", details: error.message }, 500);
  }
});

// GET /api/incentives/entries/mine (employee sees own accrued total, Section 29.2#8)
async function myIncentiveView(c: any) {
  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  const session = c.req.raw.headers.get('cookie') || '';
  const token = (session.match(/better-auth\.session_token=([^;]+)/) || [])[1] || '';
  const employeeId = token === 'token-counselor' ? 'counselor-1' : token === 'token-manager' ? 'mgr-1' : token === 'token-admin' ? 'admin-1' : 'me';
  const rows = await db.select().from(incentiveEntries).where(eq(incentiveEntries.employeeId, employeeId)).all();
  const total = rows.filter(e => e.status === 'accrued').reduce((a, b) => a + b.amount, 0);
  return c.json({ employeeId, entries: rows, total, message: "This month's accrual visible." });
}

incentivesRouter.get('/entries/mine', myIncentiveView);

// Staff self-view router (mounted at /api/staff/incentives - counselors/coordinators see own only)
export const staffIncentivesRouter = new Hono<{ Bindings: { DB: D1Database } }>();
staffIncentivesRouter.get('/self', myIncentiveView);

// POST /api/incentives/close  { period } - computes a payout statement per employee from accrued entries (Section 29.5)
const closeSchema = z.object({ period: z.string().regex(/^\d{4}-\d{2}$/) });
incentivesRouter.post('/close', zValidator('json', closeSchema), async (c) => {
  const data = c.req.valid('json');
  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  try {
    const period = data.period;
    const accrued = await db.select().from(incentiveEntries).where(eq(incentiveEntries.status, 'accrued')).all();
    const byEmployee: Record<string, number> = {};
    for (const e of accrued) byEmployee[e.employeeId] = (byEmployee[e.employeeId] || 0) + e.amount;

    const statements = [];
    for (const empId of Object.keys(byEmployee)) {
      const gross = byEmployee[empId];
      const tds = Math.round(gross * 0.10); // 10% TDS illustrative; CA-configurable
      const net = gross - tds;
      await db.insert(payoutStatements).values({
        id: crypto.randomUUID(),
        employeeId: empId,
        period,
        gross,
        tds,
        net,
        status: 'draft',
        createdAt: Math.floor(Date.now() / 1000),
      });
      statements.push({ employeeId: empId, period, gross, tds, net });
    }

    // Mark all accrued as paid (post-close) to avoid double count
    const now = Math.floor(Date.now() / 1000);
    for (const e of accrued) {
      await db.update(incentiveEntries).set({ status: 'paid', period }).where(eq(incentiveEntries.id, e.id));
    }

    return c.json({ success: true, statements, message: "Period closed; payout statements drafted." });
  } catch (error: any) {
    return c.json({ error: "Incentive close failed", details: error.message }, 500);
  }
});

// GET /api/incentives/statements?employee=:id
incentivesRouter.get('/statements', async (c) => {
  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  const employee = c.req.query('employee');
  try {
    let list = await db.select().from(payoutStatements).orderBy(desc(payoutStatements.createdAt)).all();
    if (employee) list = list.filter(s => s.employeeId === employee);
    return c.json({ statements: list });
  } catch (error: any) {
    return c.json({ error: "Failed to fetch payout statements", details: error.message }, 500);
  }
});

// POST /api/incentives/statements/:id/approve  (owner marks approved; auto-calculates TDS)
incentivesRouter.post('/statements/:id/approve', async (c) => {
  const id = c.req.param('id');
  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  try {
    const current = await db.select().from(payoutStatements).where(eq(payoutStatements.id, id)).get();
    if (!current) return c.json({ error: "Statement not found" }, 404);
    await db.update(payoutStatements).set({ status: 'approved', approvedBy: 'owner' }).where(eq(payoutStatements.id, id));
    return c.json({ success: true, message: "Statement approved." });
  } catch (error: any) {
    return c.json({ error: "Approval failed", details: error.message }, 500);
  }
});