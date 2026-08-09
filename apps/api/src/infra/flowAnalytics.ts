import { getDb } from '../db/client.js';
import { engagements, auditLog, pipelineStages } from '../db/schema.js';
import { eq } from 'drizzle-orm';

// Flow analytics (§16.4.5) — owner/manager gold-standard tooling on top of the
// existing board. No new tables: CFD is reconstructed from the immutable
// STAGE_CHANGE audit trail; throughput from completed cards; the forecast is a
// Monte Carlo simulation of days-to-clear current WIP.

const DAY = 86400;

export interface FlowAnalytics {
  windowDays: number;
  cfd: { date: string; counts: Record<string, number> }[];
  throughputPerDay: { date: string; completed: number }[];
  leadTimeAvgDays: number;
  wipToday: number;
  monteCarlo: { samples: number; p50: number; p75: number; p90: number };
}

type StageChangeRow = { id: string; action: string; entityName: string; entityId: string; beforeState: string | null; afterState: string | null; createdAt: number };

function parseJson(s: string | null): any {
  if (!s) return null;
  try { return JSON.parse(s); } catch { return null; }
}

function dayKey(epoch: number): string {
  const d = new Date(epoch * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function simulateMonteCarlo(throughput: number[], wip: number, samples = 600): { samples: number; p50: number; p75: number; p90: number } {
  if (wip <= 0) return { samples, p50: 0, p75: 0, p90: 0 };
  const rates = throughput.filter((n) => n > 0);
  if (rates.length === 0) rates.push(Math.max(1, Math.round(wip / 30)));
  const outcomes: number[] = [];
  for (let i = 0; i < samples; i++) {
    let left = wip;
    let spent = 0;
    while (left > 0 && spent < 3650) {
      left -= Math.max(1, Math.round(rates[Math.floor(Math.random() * rates.length)]));
      spent++;
    }
    outcomes.push(spent > 3650 ? 3650 : spent);
  }
  outcomes.sort((a, b) => a - b);
  const p = (q: number) => outcomes[Math.min(outcomes.length - 1, Math.floor(q * outcomes.length))] || 0;
  return { samples, p50: p(0.5), p75: p(0.75), p90: p(0.9) };
}

export async function kanbanFlowAnalytics(env: { DB: D1Database }, opts: { days?: number } = {}): Promise<FlowAnalytics> {
  const days = Math.min(90, Math.max(7, opts.days || 30));
  const db = getDb(env.DB);
  const now = Math.floor(Date.now() / 1000);
  const start = now - days * DAY;

  const stageRows = await db.select().from(pipelineStages).all();
  const stageOrder = [...stageRows].sort((a: any, b: any) => a.sequence - b.sequence);
  const stageNames = stageOrder.map((s: any) => s.key);
  const completeKey = stageNames.find((s) => s === 'complete') || stageNames[stageNames.length - 1];

  const allEvents = await db.select().from(auditLog).where(eq(auditLog.action, 'STAGE_CHANGE')).all() as unknown as StageChangeRow[];
  const events = allEvents.filter((r) => r.createdAt >= start);

  const active = await db.select().from(engagements).where(eq(engagements.status, 'active')).all();

  const byCard: Record<string, { enteredAt: number; stage: string }[]> = {};
  const push = (cardId: string, t: number, stage: string) => {
    (byCard[cardId] = byCard[cardId] || []).push({ enteredAt: t, stage });
  };
  for (const e of active) push(String(e.id), Number(e.createdAt), e.stageKey);
  for (const r of events) {
    const stage = parseJson(r.afterState)?.stageKey;
    if (stage) push(String(r.entityId), Number(r.createdAt), stage);
  }
  for (const k in byCard) byCard[k].sort((a, b) => a.enteredAt - b.enteredAt);

  // CFD
  const dayList: string[] = [];
  const countsByDay: Record<string, Record<string, number>> = {};
  for (let d = start; d <= now; d += DAY) {
    const dk = dayKey(d);
    const dayEnd = d + DAY - 1;
    const c: Record<string, number> = {};
    stageNames.forEach((st) => { c[st] = 0; });
    for (const k in byCard) {
      const es = byCard[k];
      for (let i = 0; i < es.length; i++) {
        const ent = es[i];
        const exit = i + 1 < es.length ? es[i + 1].enteredAt : Infinity;
        if (ent.enteredAt <= dayEnd && exit > dayEnd) c[ent.stage] = (c[ent.stage] || 0) + 1;
      }
    }
    countsByDay[dk] = c;
    dayList.push(dk);
  }

  // Throughput = cards arriving INTO the final stage per day
  const completedByCard = new Set<string>();
  const throughputPerDay: { date: string; completed: number }[] = [];
  for (let d = start; d <= now; d += DAY) {
    const end = d + DAY - 1;
    let n = 0;
    for (const r of events) {
      const st = parseJson(r.afterState)?.stageKey;
      if (st === completeKey && Number(r.createdAt) >= d && Number(r.createdAt) <= end) {
        n++;
        completedByCard.add(String(r.entityId));
      }
    }
    throughputPerDay.push({ date: dayKey(d), completed: n });
  }

  const leadTimes: number[] = [];
  for (const k in byCard) {
    if (!completedByCard.has(k)) continue;
    const es = byCard[k];
    const first = es[0].enteredAt;
    const lastEnd = es[es.length - 1].enteredAt;
    if (lastEnd >= first) leadTimes.push((lastEnd - first) / DAY);
  }
  const leadTimeAvgDays = leadTimes.length ? leadTimes.reduce((a, b) => a + b, 0) / leadTimes.length : 0;

  const wip = Object.keys(byCard).length;
  const monteCarlo = simulateMonteCarlo(throughputPerDay.map((t) => t.completed), wip);

  return {
    windowDays: days,
    cfd: dayList.map((date) => ({ date, counts: countsByDay[date] })),
    throughputPerDay,
    leadTimeAvgDays: Math.round(leadTimeAvgDays * 10) / 10,
    wipToday: wip,
    monteCarlo,
  };
}