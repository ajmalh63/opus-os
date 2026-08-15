// Staff performance & team operations scorecard (2026 best practice: a
// BALANCED metric set — output, quality/time, and load — never a single KPI).
// Manager+ only. All numbers are derived live from existing records
// (tasks/agreements/payments) — no new tracking data, nothing to maintain.

import { Hono } from 'hono';
import { getDb } from '../db/client.js';
import { tasks, users, payments, agreements } from '../db/schema.js';

type PerfBindings = { DB: D1Database; BETTER_AUTH_SECRET?: string };

export const performanceRouter = new Hono<{ Bindings: PerfBindings }>();

const DAY = 86400;
const RANGES = { '7': 7, '30': 30, '90': 90 } as Record<string, number>;

function medianHours(times: number[]): number | null {
  if (times.length === 0) return null;
  const s = [...times].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  const v = s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  return Math.round((v / 3600) * 10) / 10;
}

function pct(done: number, total: number): number | null {
  if (total === 0) return null;
  return Math.round((done / total) * 1000) / 10;
}

// GET /api/performance?days=30
// headlines  → the BAN row (big-answer numbers) incl. the approval queue
// roster     → per-staff scorecard (throughput today/week/range, cycle, on-time, load)
// trend      → daily completions, last min(14, days) days (sparkline data)
// artifacts  → live queues: awaiting approval · overdue · recently done
performanceRouter.get('/', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const days = RANGES[String(c.req.query('days') || '30')] || 30;
  const now = Math.floor(Date.now() / 1000);
  const since = now - days * DAY;
  const dayStart = now - (now % DAY);

  try {
    const [taskRows, userRows, payRows, agRows] = await Promise.all([
      db.select().from(tasks).all().catch(() => []),
      db.select().from(users).all().catch(() => []),
      db.select().from(payments).all().catch(() => []),
      db.select().from(agreements).all().catch(() => []),
    ]);
    const staff = userRows.filter((u) => u.role !== 'super_admin'); // owner reviews staff
    const nameOf = new Map(staff.map((u) => [u.id, u.name]));

    const doneInRange = taskRows.filter((t) => t.status === 'done' && Number(t.completedAt || 0) >= since);

    // Approval queue: draft invoices/charges awaiting manager confirm +
    // agreements not yet signed (evidence queues, Moxo 2026 pattern).
    const approvalPay = payRows.filter((p) => (p.type === 'invoice' || p.type === 'charge') && p.status === 'draft');
    const approvalAg = agRows.filter((a) => a.status === 'draft' || a.status === 'sent');
    const approvalQueue = approvalPay.length + approvalAg.length;

    const overdue = taskRows.filter((t) =>
      (t.status === 'open' || t.status === 'in_progress') && t.dueDate && t.dueDate < now);
    const open = taskRows.filter((t) => t.status === 'open' || t.status === 'in_progress');

    // ── Roster scorecard ──────────────────────────────────────────────
    const roster = staff.map((u) => {
      const mine = taskRows.filter((t) => t.assigneeId === u.id);
      const done = mine.filter((t) => t.status === 'done');
      const doneRange = done.filter((t) => Number(t.completedAt || 0) >= since);
      const doneToday = done.filter((t) => Number(t.completedAt || 0) >= dayStart).length;
      const weekAgo = now - 7 * DAY;
      const doneWeek = done.filter((t) => Number(t.completedAt || 0) >= weekAgo).length;
      const onTime = doneRange.filter((t) => !t.dueDate || Number(t.completedAt || 0) <= t.dueDate);
      const myOverdue = overdue.filter((t) => t.assigneeId === u.id).length;
      const myOpen = open.filter((t) => t.assigneeId === u.id).length;
      const inProgress = mine.filter((t) => t.status === 'in_progress').length;
      const cycles = doneRange
        .filter((t) => t.createdAt && Number(t.completedAt || 0) > Number(t.inProgressAt || t.createdAt || 0))
        .map((t) => Number(t.completedAt) - Number(t.inProgressAt || t.createdAt)); // TRUE cycle: first-move → done
      const urgentOpen = mine.filter((t) => (t.status === 'open' || t.status === 'in_progress') && t.priority === 'urgent').length;

      return {
        userId: u.id,
        name: u.name,
        role: u.role,
        divisionCount: (() => { try { return (JSON.parse(u.userDivisions || '[]') as string[]).length; } catch { return 0; } })(),
        doneTotal: done.length,
        doneToday, doneWeek, doneRange: doneRange.length,
        avgCycleHours: medianHours(cycles),
        onTimeRate: pct(onTime.length, doneRange.length),
        open: myOpen,
        inProgress,
        overdue: myOverdue,
        urgentOpen,
      };
    }).sort((a, b) => b.doneRange - a.doneRange || b.doneToday - a.doneToday);

    // ── Trend (last min(14, days) days, sparkline-ready) ───────────────
    const trendDays = Math.min(14, days);
    const trend: { day: number; done: number }[] = [];
    for (let i = trendDays - 1; i >= 0; i--) {
      const start = dayStart - i * DAY;
      const end = start + DAY;
      trend.push({ day: start, done: doneInRange.filter((t) => Number(t.completedAt || 0) >= start && Number(t.completedAt || 0) < end).length });
    }

    // ── Live artifacts (evidence queues) ───────────────────────────────
    const recentDone = [...doneInRange]
      .sort((a, b) => Number(b.completedAt || 0) - Number(a.completedAt || 0))
      .slice(0, 12)
      .map((t) => ({
        id: t.id, title: t.title, assignee: nameOf.get(t.assigneeId || '') || 'unassigned',
        clientId: t.clientId || null, priority: t.priority,
        completedAt: t.completedAt, cycleHours: t.createdAt && t.completedAt && t.completedAt > t.createdAt
          ? Math.round(((t.completedAt - t.createdAt) / 3600) * 10) / 10 : null,
      }));

    const overdueList = overdue
      .sort((a, b) => Number(a.dueDate || 0) - Number(b.dueDate || 0))
      .map((t) => ({
        id: t.id, title: t.title, assignee: nameOf.get(t.assigneeId || '') || 'unassigned',
        priority: t.priority, dueDate: t.dueDate, daysLate: Math.max(1, Math.floor((now - Number(t.dueDate || 0)) / DAY)),
      }));

    const approvalList = [
      ...approvalPay.map((p) => ({ kind: 'payment', id: p.id, label: `${p.type}: ${p.milestoneName || ''}`.trim(), amountPaise: p.amount })),
      ...approvalAg.map((a) => ({ kind: 'agreement', id: a.id, label: `agreement ${a.id.slice(0, 8)}`, amountPaise: null })),
    ].slice(0, 12);

    return c.json({
      generatedAt: now,
      windowDays: days,
      headlines: {
        ticketsOpen: open.length,
        overdue: overdue.length,
        doneToday: doneInRange.filter((t) => Number(t.completedAt || 0) >= dayStart).length,
        doneInRange: doneInRange.length,
        avgCycleHours: medianHours(doneInRange.filter((t) => t.createdAt && Number(t.completedAt || 0) > Number(t.createdAt || 0)).map((t) => Number(t.completedAt) - Number(t.createdAt))),
        onTimeRate: pct(doneInRange.filter((t) => !t.dueDate || Number(t.completedAt || 0) <= t.dueDate).length, doneInRange.length),
        approvalQueue,
        activeStaff: staff.filter((u) => taskRows.some((t) => t.assigneeId === u.id)).length,
      },
      roster,
      trend,
      artifacts: { approval: approvalList, overdue: overdueList, recentDone },
    });
  } catch (e: any) {
    return c.json({ error: 'Performance summary failed', details: e.message }, 500);
  }
});