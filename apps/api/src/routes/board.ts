// Task Boards — kanban SYSTEM endpoints (flow truth + system settings).
// Gold-standard (2026): WIP limits are ENFORCED (backend), classes of service
// with an Expedite lane, real cycle time (in_progress_at), blockers visible,
// explicit policies stored in board_prefs, and flow metrics computed live —
// so reviews run on data, not impressions.

import { Hono } from 'hono';
import { getDb } from '../db/client.js';
import { tasks, users, boardPrefs } from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { auditEvent } from '../middleware/audit.js';

type BoardBindings = { DB: D1Database; BETTER_AUTH_SECRET?: string };
type D1 = ReturnType<typeof getDb>;

export const boardRouter = new Hono<{ Bindings: BoardBindings; Variables: { user?: { id?: string; role?: string } | null } }>();

// ── Defaults (aligned with gold-standard starting points) ──────────────────
export const BOARD_DEFAULTS = {
  columnLimitInProgress: 6,   // hard cap on the In-progress column
  personLimitInProgress: 3,   // soft per-person cap
  expediteLimit: 1,           // expedite lane WIP (bypasses column cap)
  policyText: 'Open: ready but not started. In progress: actively worked — finish before starting new. Done: verified and archived. Blocked cards must state a reason and an owner.',
  doneAutoArchiveDays: 14,
};

export async function getBoardPrefs(db: D1): Promise<Record<string, number | string>> {
  const rows = await db.select().from(boardPrefs).all().catch(() => []);
  const merged: Record<string, number | string> = { ...BOARD_DEFAULTS };
  for (const r of rows) {
    try { merged[r.key] = JSON.parse(r.value); } catch { /* keep default */ }
  }
  return merged;
}

function pctile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return Math.round(sorted[idx] / 3600 * 10) / 10; // hours
}

// GET /api/tasks/board — the whole system view for the UI in one call:
// tasks (+names), staff total, prefs, and live flow metrics.
boardRouter.get('/board', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  try {
    const [rows, userRows, prefs] = await Promise.all([
      db.select().from(tasks).orderBy(desc(tasks.createdAt)).all(),
      db.select().from(users).all().catch(() => []),
      getBoardPrefs(db),
    ]);
    const nameOf = new Map(userRows.map((u: any) => [u.id, u.name]));
    const staffTotal = userRows.filter((u: any) => u.role !== 'super_admin').length;

    const now = Math.floor(Date.now() / 1000);
    const weekAgo = now - 7 * 86400;
    const done = rows.filter((t) => t.status === 'done' && Number(t.completedAt || 0) > 0);
    const done7 = done.filter((t) => Number(t.completedAt) >= weekAgo);
    // TRUE cycle = inProgressAt → completedAt; fallback = createdAt → completedAt
    const cycles = done.map((t) => ((Number(t.completedAt) - Number(t.inProgressAt || t.createdAt))));
    const cycleSorted = cycles.filter((v) => v > 0).sort((a, b) => a - b);
    const leads = done.map((t) => Number(t.completedAt) - Number(t.createdAt)).filter((v) => v > 0).sort((a, b) => a - b);
    const inProgress = rows.filter((t) => t.status === 'in_progress');
    const blocked = rows.filter((t) => t.status !== 'done' && t.status !== 'cancelled' && !!t.blockedReason)
      .map((t) => ({ id: t.id, title: t.title, assigneeName: nameOf.get(t.assigneeId) || null, reason: t.blockedReason, ageHours: Math.round((now - Number(t.updatedAt || now)) / 3600) }))
      .sort((a: any, b: any) => b.ageHours - a.ageHours);

    return c.json({
      generatedAt: now,
      tasks: rows.map((t: any) => ({ ...t, assigneeName: nameOf.get(t.assigneeId) || null })),
      staffTotal,
      prefs,
      metrics: {
        cycleHours: { p50: pctile(cycleSorted, 50), p85: pctile(cycleSorted, 85), p95: pctile(cycleSorted, 95) },
        leadHoursP50: pctile(leads, 50),
        throughput7d: done7.length,
        wip: { inProgress: inProgress.length, expedite: rows.filter((t) => t.cos === 'expedite' && t.status !== 'done' && t.status !== 'cancelled').length },
        blocked,
        wipAgeHours: inProgress.map((t) => Math.max(0, Math.round((now - Number(t.inProgressAt || t.createdAt)) / 3600))),
      },
    });
  } catch (e: any) {
    return c.json({ error: 'Board data failed', details: e.message }, 500);
  }
});

// PATCH /api/tasks/board/prefs — manager+ only; audited (experiment trail:
// change → observe → data-backed revert, per the feedback-loop practice).
boardRouter.patch('/board/prefs', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const user = (c.get('user') as any) || {};
  if (user.role !== 'super_admin' && user.role !== 'manager') return c.json({ error: 'Manager+ only' }, 403);
  const db = getDb(c.env.DB);
  const body: any = await c.req.json().catch(() => ({}));
  const changes: Record<string, number | string> = {};
  if (typeof body.columnLimitInProgress === 'number') changes.columnLimitInProgress = Math.min(20, Math.max(1, Math.round(body.columnLimitInProgress)));
  if (typeof body.personLimitInProgress === 'number') changes.personLimitInProgress = Math.min(10, Math.max(1, Math.round(body.personLimitInProgress)));
  if (typeof body.expediteLimit === 'number') changes.expediteLimit = Math.min(5, Math.max(1, Math.round(body.expediteLimit)));
  if (typeof body.policyText === 'string' && body.policyText.trim().length >= 10) changes.policyText = body.policyText.trim().slice(0, 2000);

  const now = Math.floor(Date.now() / 1000);
  const current = await getBoardPrefs(db);
  for (const [k, v] of Object.entries(changes)) {
    if (current[k] !== v) {
      const existing = await db.select().from(boardPrefs).where(eq(boardPrefs.key, k)).get().catch(() => undefined);
      if (existing) {
        await db.update(boardPrefs).set({ value: JSON.stringify(v), updatedAt: now }).where(eq(boardPrefs.key, k));
      } else {
        await db.insert(boardPrefs).values({ key: k, value: JSON.stringify(v), updatedAt: now });
      }
    }
  }
  await auditEvent(c, { action: 'BOARD_PREFS_UPDATED', entityName: 'board', entityId: 'prefs', afterState: { by: user.id, changes } });
  return c.json({ ok: true, prefs: { ...current, ...changes } });
});