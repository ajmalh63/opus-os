import { Hono } from 'hono';
import { getDb } from '../db/client.js';
import { payments, statutoryRegisters, tdsRecords, tcsRecords, purchaseInvoices, businessProfile } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { auditEvent } from '../middleware/audit.js';

// Compliance extras (plan §6 / §14.5.6): statutory calendar + CA export center.
// Kept separate from compliance.ts to avoid churning the legacy file.

const RULES: { key: string; label: string; due: number }[] = [
  { key: 'gstr1', label: 'GSTR-1 filing', due: 11 },
  { key: 'gstr3b', label: 'GSTR-3B filing', due: 20 },
  { key: 'tds', label: 'TDS/TCS deposit', due: 25 },
  { key: 'pf', label: 'PF (EPFO) payment', due: 15 },
  { key: 'esi', label: 'ESI payment', due: 15 },
  { key: 'lwf', label: 'LWF (Telangana)', due: 10 },
];

function nextDueDates(rule: { due: number }, anchor: Date, months = 3) {
  const out: { date: string; epoch: number }[] = [];
  for (let i = 0; i < months; i++) {
    const d = new Date(anchor.getFullYear(), anchor.getMonth() + i, rule.due);
    out.push({ date: d.toISOString().slice(0, 10), epoch: Math.floor(d.getTime() / 1000) });
  }
  return out;
}

export const complianceExtrasRouter = new Hono<{ Bindings: { DB: D1Database; BETTER_AUTH_SECRET: string } }>();

// GET /api/compliance/calendar — next 3 months of statutory deadlines
complianceExtrasRouter.get('/calendar', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const now = Math.floor(Date.now() / 1000);
  const anchor = new Date(now * 1000);

  try {
    const [paymts, regs] = await Promise.all([
      db.select().from(payments).all(),
      db.select().from(statutoryRegisters).all(),
    ]);
    const fmt = (e: number) => new Date(e * 1000).toISOString().slice(0, 7);

    const calendar = RULES.flatMap((rule) =>
      nextDueDates(rule, anchor).map((due) => {
        const month = due.date.slice(0, 7);
        let status: 'clear' | 'due' | 'overdue' = 'due';
        if (rule.key === 'gstr1' || rule.key === 'gstr3b') {
          const hasData = paymts.some((p: any) => fmt(Number(p.createdAt)) === month);
          status = hasData ? 'clear' : due.epoch < now ? 'overdue' : 'due';
        } else {
          const paid = (regs as any[]).some((r) => r.month === month && r.type === rule.key && r.status === 'paid');
          status = paid ? 'clear' : due.epoch < now ? 'overdue' : 'due';
        }
        return { key: rule.key, label: rule.label, date: due.date, due: due.epoch, dueDate: due.date, month, status };
      })
    );
    return c.json({ calendar, month: `${anchor.getFullYear()}-${String(anchor.getMonth() + 1).padStart(2, '0')}` });
  } catch (e: any) {
    return c.json({ error: 'Compliance calendar failed', details: e.message }, 500);
  }
});

// GET /api/compliance/export?period=YYYY-MM — CA-ready statutory pack (JSON)
complianceExtrasRouter.get('/export', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const period = c.req.query('period') || `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`;

  try {
    const [paymts, regs, tds, tcs, invs, prof] = await Promise.all([
      db.select().from(payments).all(),
      db.select().from(statutoryRegisters).all(),
      db.select().from(tdsRecords).all(),
      db.select().from(tcsRecords).all(),
      db.select().from(purchaseInvoices).all(),
      db.select().from(businessProfile).where(eq(businessProfile.id, 'main')).get(),
    ]);

    const fmt = (e: number) => new Date(e * 1000).toISOString().slice(0, 7);
    const pack = {
      exportedAt: new Date().toISOString(),
      period,
      businessProfile: prof || null,
      gst: {
        outwardPayments: (paymts as any[]).filter((p) => fmt(Number(p.createdAt)) === period),
        purchaseInvoices: (invs as any[]).filter((p) => fmt(Number(p.createdAt)) === period),
        gstr2bMonth: null, // uploaded separately; kept as a marker
      },
      statutory: (regs as any[]).filter((r) => r.month === period),
      tds: (tds as any[]).filter((r) => (r as any).period === period),
      tcs: (tcs as any[]).filter((r) => (r as any).period === period),
    };

    await auditEvent(c, {
      action: 'COMPLIANCE_EXPORT', entityName: 'compliance', entityId: period,
      afterState: { period, size: JSON.stringify(pack).length },
    });

    return c.json({ success: true, period, pack });
  } catch (e: any) {
    return c.json({ error: 'CA export failed', details: e.message }, 500);
  }
});