import { Hono } from 'hono';
import { getDb } from '../db/client.js';
import { payments, engagements, clients, appSettings, attestationApplications, studyAbroadApplications, seatBookings, visaApplications, manpowerDeployments, communications } from '../db/schema.js';
import { eq, and, gte, lte } from 'drizzle-orm';
import { createStaffAlert } from '../infra/staffAlerts.js';

// Business analytics — revenue intelligence (gold-standard patterns from
// Forecastio/Clari/Power BI): weighted pipeline forecast, AR aging, cash flow,
// per-division funnels + velocity. Mounted at /api/analytics (manager+).

export const analyticsRouter = new Hono<{ Bindings: { DB: D1Database } }>();

const STAGE_WEIGHTS: Record<string, number> = {
  lead: 0.1, qualified: 0.3, documents: 0.5, processing: 0.7, complete: 0.9,
};

async function getTarget(db: any): Promise<number> {
  const row = await db.select().from(appSettings).where(eq(appSettings.key, 'monthly_revenue_target')).get();
  return row?.value ? Number(row.value) || 0 : 0;
}

// GET /api/analytics/revenue — executive summary: collected vs target, AR aging, cash flow, forecast
analyticsRouter.get('/revenue', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const now = Math.floor(Date.now() / 1000);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime() / 1000;
  try {
    // N+1 pushdown: only last 6 months for cashFlow + this month for collected (was full scan)
    const sixMonthStart = monthStart - 5 * 30 * 86400;
    const allPayments = await db.select().from(payments).where(gte(payments.createdAt, sixMonthStart)).all();
    const engs = await db.select().from(engagements).where(eq(engagements.status, 'active')).all();

    // Collected this month (paid, minus refunds)
    const monthPaid = allPayments.filter(p => p.status === 'paid' && p.createdAt >= monthStart);
    const collectedPaise = monthPaid.reduce((s, p) => s + (p.type === 'refund' ? -p.amount : p.amount), 0);

    // AR aging: invoices/charges not paid, aged by dueDate (fallback createdAt)
    const open = allPayments.filter(p => ['invoice', 'charge'].includes(p.type) && !['paid', 'void'].includes(p.status));
    const ageOf = (p: any) => (p.dueDate || p.createdAt || now);
    const ar = {
      current: open.filter(p => ageOf(p) >= now).reduce((s, p) => s + p.amount, 0),
      d30: open.filter(p => ageOf(p) < now && ageOf(p) >= now - 30 * 86400).reduce((s, p) => s + p.amount, 0),
      d60: open.filter(p => ageOf(p) < now - 30 * 86400 && ageOf(p) >= now - 60 * 86400).reduce((s, p) => s + p.amount, 0),
      d90: open.filter(p => ageOf(p) < now - 60 * 86400 && ageOf(p) >= now - 90 * 86400).reduce((s, p) => s + p.amount, 0),
      overdue: open.filter(p => ageOf(p) < now - 90 * 86400).reduce((s, p) => s + p.amount, 0),
    };

    // Weighted pipeline forecast: engagements × stage weight × outstanding balance
    const pipelineValue = engs.filter(e => e.status === 'active').reduce((s, e) => s + (e.outstandingBalance || 0), 0);
    const weighted = engs.filter(e => e.status === 'active').reduce((s, e) => s + (e.outstandingBalance || 0) * (STAGE_WEIGHTS[e.stageKey] ?? 0.2), 0);
    const confirmedNotCollected = allPayments.filter(p => ['confirmed', 'synced'].includes(p.status)).reduce((s, p) => s + p.amount, 0);
    const forecast = {
      d30: Math.round(weighted * 0.4 + confirmedNotCollected),
      d60: Math.round(weighted * 0.7 + confirmedNotCollected),
      d90: Math.round(weighted + confirmedNotCollected),
    };

    // Cash flow: last 6 months collected vs pending
    const cashFlow: { month: string; collected: number; pending: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(); d.setMonth(d.getMonth() - i);
      const start = new Date(d.getFullYear(), d.getMonth(), 1).getTime() / 1000;
      const end = new Date(d.getFullYear(), d.getMonth() + 1, 1).getTime() / 1000;
      const monthRows = allPayments.filter(p => p.createdAt >= start && p.createdAt < end);
      cashFlow.push({
        month: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
        collected: monthRows.filter(p => p.status === 'paid').reduce((s, p) => s + (p.type === 'refund' ? -p.amount : p.amount), 0),
        pending: monthRows.filter(p => ['invoice', 'charge'].includes(p.type) && !['paid', 'void'].includes(p.status)).reduce((s, p) => s + p.amount, 0),
      });
    }

    const target = await getTarget(db);

    // Threshold alert (once per month): revenue < 50% of target by day 20
    const dayOfMonth = new Date().getDate();
    if (target > 0 && dayOfMonth >= 20 && collectedPaise < target / 2) {
      const flag = await db.select().from(appSettings).where(eq(appSettings.key, 'revenue_alert_fired')).get();
      if (!flag?.value || flag.value !== `${new Date().getFullYear()}-${new Date().getMonth()}`) {
        await createStaffAlert(c.env as any, { division: 'analytics', type: 'revenue_threshold', title: '⚠️ Revenue below 50% of monthly target', body: `Collected ₹${(collectedPaise / 100).toFixed(0)} of ₹${(target / 100).toFixed(0)} target by day ${dayOfMonth}.`, severity: 'warning', link: '/billing' });
        const existing = await db.select().from(appSettings).where(eq(appSettings.key, 'revenue_alert_fired')).get();
        if (existing) await db.update(appSettings).set({ value: `${new Date().getFullYear()}-${new Date().getMonth()}` }).where(eq(appSettings.key, 'revenue_alert_fired'));
        else await db.insert(appSettings).values({ key: 'revenue_alert_fired', value: `${new Date().getFullYear()}-${new Date().getMonth()}`, updatedAt: now });
      }
    }

    return c.json({
      success: true,
      month: { collectedPaise, targetPaise: target, pctOfTarget: target > 0 ? Math.round((collectedPaise / target) * 100) : null, pipelineValue, weightedPipeline: Math.round(weighted) },
      forecast,
      arAging: ar,
      cashFlow,
    });
  } catch (e: any) {
    return c.json({ error: 'Revenue analytics failed', details: e?.message }, 500);
  }
});

// GET /api/analytics/funnels — per-division conversion funnels + velocity
analyticsRouter.get('/funnels', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const now = Math.floor(Date.now() / 1000);
  try {
    const [attest, study, umrah, visa, manpower] = await Promise.all([
      db.select().from(attestationApplications).all(),
      db.select().from(studyAbroadApplications).all(),
      db.select().from(seatBookings).all(),
      db.select().from(visaApplications).all(),
      db.select().from(manpowerDeployments).all(),
    ]);

    const funnel = (stages: string[], rows: any[], stageOf: (r: any) => string, startedAt: (r: any) => number) => {
      const counts = stages.map(s => ({ stage: s, count: rows.filter(r => stageOf(r) === s).length }));
      const conversions: { from: string; to: string; pct: number }[] = [];
      for (let i = 0; i < stages.length - 1; i++) {
        const from = counts[i].count;
        conversions.push({ from: stages[i], to: stages[i + 1], pct: from > 0 ? Math.round((counts[i + 1].count / from) * 100) : 0 });
      }
      // Velocity: avg days from start to a terminal/advanced stage
      const advanced = rows.filter(r => stageOf(r) !== stages[0]);
      const avgDays = advanced.length > 0 ? Math.round(advanced.reduce((s, r) => s + Math.max(0, (now - startedAt(r)) / 86400), 0) / advanced.length) : 0;
      return { counts, conversions, avgDays };
    };

    return c.json({
      success: true,
      funnels: {
        attestation: funnel(
          ['quote_requested', 'quote_confirmed', 'docs_awaiting', 'in_process', 'completed', 'delivered'],
          attest, (r: any) => r.stage, (r: any) => r.createdAt
        ),
        'study-abroad': funnel(
          ['shortlisted', 'docs_ready', 'submitted', 'under_review', 'offer_letter', 'deposit_paid', 'enrolled'],
          study, (r: any) => r.stage, (r: any) => r.createdAt
        ),
        umrah: funnel(
          ['held', 'reserved', 'confirmed'],
          umrah, (r: any) => r.status, (r: any) => r.createdAt
        ),
        visa: funnel(
          ['submitted', 'document_prep', 'slot_booked', 'granted'],
          visa, (r: any) => r.status, (r: any) => r.createdAt
        ),
        manpower: funnel(
          ['applied', 'shortlisted', 'selected'],
          manpower, (r: any) => r.selectionStatus, (r: any) => r.createdAt
        ),
      },
    });
  } catch (e: any) {
    return c.json({ error: 'Funnel analytics failed', details: e?.message }, 500);
  }
});

// GET /api/analytics/stale-clients — clients with open engagements, no comms in 3 days
analyticsRouter.get('/stale-clients', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const now = Math.floor(Date.now() / 1000);
  try {
    const engs = await db.select().from(engagements).where(eq(engagements.status, 'active')).all();
    const comms = await db.select().from(communications).all();
    const clientsRows = await db.select().from(clients).all();
    const stale = engs
      .map(e => {
        const lastComms = comms.filter(c => c.clientId === e.clientId).sort((a, b) => b.createdAt - a.createdAt)[0];
        const days = lastComms ? Math.floor((now - lastComms.createdAt) / 86400) : Math.floor((now - e.createdAt) / 86400);
        return { engagementId: e.id, clientId: e.clientId, clientName: clientsRows.find(cl => cl.id === e.clientId)?.name || e.clientId, division: e.division, daysSinceContact: days };
      })
      .filter(x => x.daysSinceContact >= 3)
      .sort((a, b) => b.daysSinceContact - a.daysSinceContact);
    return c.json({ success: true, stale: stale.slice(0, 20) });
  } catch (e: any) {
    return c.json({ error: 'Stale clients failed', details: e?.message }, 500);
  }
});
// GET /api/analytics/growth — business growth metrics (MoM revenue, new clients,
// conversion, division growth, ARPU, referrals, retention, repeat business).
analyticsRouter.get('/growth', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const now = Math.floor(Date.now() / 1000);
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime() / 1000;
  const prevStart = new Date(new Date().getFullYear(), new Date().getMonth() - 1, 1).getTime() / 1000;
  try {
    const [allPayments, allClients, allEngs, allComms] = await Promise.all([
      db.select().from(payments).all(),
      db.select().from(clients).all(),
      db.select().from(engagements).all(),
      db.select().from(communications).all(),
    ]);

    const collectedIn = (start: number, end: number) =>
      allPayments.filter(p => p.status === 'paid' && p.createdAt >= start && p.createdAt < end)
        .reduce((s, p) => s + (p.type === 'refund' ? -p.amount : p.amount), 0);

    const thisMonth = collectedIn(monthStart, now);
    const lastMonth = collectedIn(prevStart, monthStart);
    const momGrowthPct = lastMonth > 0 ? Math.round(((thisMonth - lastMonth) / lastMonth) * 100) : (thisMonth > 0 ? 100 : 0);

    // New clients this month vs last
    const newThis = allClients.filter(cl => cl.createdAt >= monthStart).length;
    const newLast = allClients.filter(cl => cl.createdAt >= prevStart && cl.createdAt < monthStart).length;

    // Lead → client conversion: clients that came from a lead source vs total
    const sourced = allClients.filter(cl => cl.leadSource && cl.leadSource !== 'walk-in');
    const conversionPct = allClients.length > 0 ? Math.round((sourced.length / allClients.length) * 100) : 0;

    // Division-wise revenue this month + MoM growth
    const engMap = new Map(allEngs.map(e => [e.id, e]));
    const divRevenue: Record<string, { thisMonth: number; lastMonth: number; growthPct: number }> = {};
    for (const p of allPayments) {
      if (p.status !== 'paid') continue;
      const eng = engMap.get(p.engagementId);
      const div = eng?.division || 'other';
      if (!divRevenue[div]) divRevenue[div] = { thisMonth: 0, lastMonth: 0, growthPct: 0 };
      const amt = p.type === 'refund' ? -p.amount : p.amount;
      if (p.createdAt >= monthStart) divRevenue[div].thisMonth += amt;
      else if (p.createdAt >= prevStart) divRevenue[div].lastMonth += amt;
    }
    for (const div of Object.keys(divRevenue)) {
      const d = divRevenue[div];
      d.growthPct = d.lastMonth > 0 ? Math.round(((d.thisMonth - d.lastMonth) / d.lastMonth) * 100) : (d.thisMonth > 0 ? 100 : 0);
    }

    // ARPU: lifetime collected / clients
    const lifetime = allPayments.filter(p => p.status === 'paid').reduce((s, p) => s + (p.type === 'refund' ? -p.amount : p.amount), 0);
    const arpu = allClients.length > 0 ? Math.round(lifetime / allClients.length) : 0;

    // Referral share: clients whose lead source is referral/partner
    const referralClients = allClients.filter(cl => ['referral', 'partner'].includes(cl.leadSource || ''));
    const referralPct = allClients.length > 0 ? Math.round((referralClients.length / allClients.length) * 100) : 0;

    // Retention: clients with any communication or payment this month
    const activeIds = new Set<string>();
    allComms.filter(cm => cm.createdAt >= monthStart).forEach(cm => cm.clientId && activeIds.add(cm.clientId));
    allPayments.filter(p => p.createdAt >= monthStart).forEach(p => activeIds.add(p.clientId));
    const retentionPct = allClients.length > 0 ? Math.round((activeIds.size / allClients.length) * 100) : 0;

    // Repeat business: clients with 2+ engagements
    const engCounts: Record<string, number> = {};
    allEngs.forEach(e => { engCounts[e.clientId] = (engCounts[e.clientId] || 0) + 1; });
    const repeatClients = Object.values(engCounts).filter(n => n >= 2).length;
    const repeatPct = allClients.length > 0 ? Math.round((repeatClients / allClients.length) * 100) : 0;

    // Pipeline value + growth vs last month
    const activeEngs = allEngs.filter(e => e.status === 'active');
    const pipelineNow = activeEngs.reduce((s, e) => s + (e.outstandingBalance || 0), 0);
    const pipelineLast = allEngs.filter(e => e.status === 'active' && e.createdAt < monthStart).reduce((s, e) => s + (e.outstandingBalance || 0), 0);
    const pipelineGrowthPct = pipelineLast > 0 ? Math.round(((pipelineNow - pipelineLast) / pipelineLast) * 100) : 0;

    return c.json({
      success: true,
      revenue: { thisMonth, lastMonth, momGrowthPct },
      clients: { total: allClients.length, newThis, newLast, newGrowthPct: newLast > 0 ? Math.round(((newThis - newLast) / newLast) * 100) : (newThis > 0 ? 100 : 0) },
      conversion: { sourced, conversionPct },
      divisions: divRevenue,
      arpu,
      referrals: { count: referralClients.length, referralPct },
      retention: { active: activeIds.size, retentionPct },
      repeat: { count: repeatClients, repeatPct },
      pipeline: { value: pipelineNow, growthPct: pipelineGrowthPct },
    });
  } catch (e: any) {
    return c.json({ error: 'Growth analytics failed', details: e?.message }, 500);
  }
});
