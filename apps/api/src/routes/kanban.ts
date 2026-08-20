import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { moveCardSchema } from '@opusos/shared';
import { getDb } from '../db/client.js';
import { engagements, pipelineStages, clients, auditLog, tasks } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { auditBegin } from '../middleware/audit.js';
import { kanbanFlowAnalytics } from '../infra/flowAnalytics.js';

export const kanbanRouter = new Hono<{
  Bindings: { DB: D1Database };
  Variables: { user?: { role?: string; userDivisions?: string } | null };
}>();

// GET /api/kanban/board
// Division-scoped: counselors/coordinators see only their permitted divisions
// (userDivisions on the session). Money fields (outstandingBalance) are only
// exposed to roles with finance access (super_admin/manager).
kanbanRouter.get('/board', async (c) => {
  if (!c.env || !c.env.DB) {
    return c.json({ error: "DB not available" }, 500);
  }

  const db = getDb(c.env.DB);
  const user = (c.get('user') as any) ?? null;
  const role = user?.role as string | undefined;
  const canSeeMoney = role === 'super_admin' || role === 'manager';
  let scopedDivisions: string[] | null = null;
  if (role === 'counselor' || role === 'coordinator') {
    try { scopedDivisions = JSON.parse((user?.userDivisions as string) || '[]'); } catch { scopedDivisions = []; }
  }

  try {
    const stages = await db.select().from(pipelineStages).all();
    const activeEngagements = await db
      .select({
        id: engagements.id,
        clientId: engagements.clientId,
        division: engagements.division,
        title: engagements.title,
        stageKey: engagements.stageKey,
        outstandingBalance: engagements.outstandingBalance,
        status: engagements.status,
        counselorId: engagements.counselorId,
        clientName: clients.name
      })
      .from(engagements)
      .innerJoin(clients, eq(engagements.clientId, clients.id))
      .all();

    const visible = scopedDivisions
      ? activeEngagements.filter((card) => scopedDivisions!.includes(card.division) && card.status !== 'archived')
      : activeEngagements.filter((card) => card.status !== 'archived');

    // Money is finance-tooling: strip for roles without it.
    const cards = visible.map((card) =>
      canSeeMoney ? card : { ...card, outstandingBalance: 0 }
    );

    // Group cards by stageKey, and attach each card's linked tasks (the
    // gold-standard "task lane inside card" pattern — tasks bound to an
    // engagement ride along on the board, so staff see work at a glance).
    const allTasks = await db.select().from(tasks).all();
    const tasksByEngagement = new Map<string, any[]>();
    for (const t of allTasks) {
      if (!t.engagementId) continue;
      const arr = tasksByEngagement.get(t.engagementId) || [];
      arr.push(t);
      tasksByEngagement.set(t.engagementId, arr);
    }

    const columns = stages.map(stage => {
      const stageCards = cards.filter(card => card.stageKey === stage.key).map((card) => ({
        ...card,
        tasks: (tasksByEngagement.get(card.id) || []).map((t) => ({
          id: t.id, title: t.title, priority: t.priority, status: t.status,
          assigneeId: t.assigneeId, dueDate: t.dueDate,
        })),
      }));
      return {
        ...stage,
        cards: stageCards
      };
    });

    return c.json({ columns });
  } catch (error: any) {
    return c.json({ error: "Failed to fetch board data", details: error.message }, 500);
  }
});

// POST /api/kanban/board/move
kanbanRouter.post('/board/move', zValidator('json', moveCardSchema), async (c) => {
  const data = c.req.valid('json');

  if (!c.env || !c.env.DB) {
    return c.json({ error: "DB not available" }, 500);
  }

  const db = getDb(c.env.DB);

  try {
    // 1. Fetch target stage WIP config
    const targetStage = await db
      .select()
      .from(pipelineStages)
      .where(eq(pipelineStages.key, data.targetStage))
      .get();

    if (!targetStage) {
      return c.json({ error: "Target stage not found" }, 404);
    }

    // 2. Query current card count in target stage
    const activeCardsInTarget = await db
      .select()
      .from(engagements)
      .where(and(eq(engagements.stageKey, data.targetStage), eq(engagements.status, 'active')))
      .all();

    const currentCount = activeCardsInTarget.length;
    const isWipBreached = targetStage.wipLimit !== null && (currentCount + 1) > targetStage.wipLimit;

    // 3. Get current engagement for audit log beforeState
    const currentEngagement = await db
      .select()
      .from(engagements)
      .where(eq(engagements.id, data.cardId))
      .get();

    if (!currentEngagement) {
      return c.json({ error: "Engagement card not found" }, 404);
    }

    // ── Pipeline invariants (Workflow Audit 2026-08-12 F1/F2) ──────────────
    // F2b: source must match the card's CURRENT stage (no jumps/invalid moves)
    if (currentEngagement.stageKey !== data.sourceStage) {
      return c.json({ error: `Card is at '${currentEngagement.stageKey}', not '${data.sourceStage}'`, code: 'stage_mismatch' }, 409);
    }
    // F1: WIP ceiling enforced on the PULL side (finish-before-start)
    if (isWipBreached) {
      return c.json({ error: `WIP limit reached (${targetStage.wipLimit}) on '${targetStage.key}' — finish or pull something else first`, code: 'wip_limit', limit: targetStage.wipLimit }, 409);
    }

    // 4. Update the card stage
    await db
      .update(engagements)
      .set({
        stageKey: data.targetStage,
        updatedAt: Math.floor(Date.now() / 1000)
      })
      .where(eq(engagements.id, data.cardId));

    // 5. Record change in audit log (actorId from live session)
    const ipAddress = c.req.header('x-real-ip') || c.req.header('cf-connecting-ip') || '127.0.0.1';
    const { actorId } = await auditBegin(c);
    await db.insert(auditLog).values({
      id: crypto.randomUUID(),
      actorId,
      action: 'STAGE_CHANGE',
      entityName: 'engagements',
      entityId: data.cardId,
      beforeState: JSON.stringify(currentEngagement),
      afterState: JSON.stringify({ ...currentEngagement, stageKey: data.targetStage }),
      ipAddress,
      createdAt: Math.floor(Date.now() / 1000)
    });

    return c.json({
      success: true,
      wipLimitBreached: isWipBreached,
      currentCount: currentCount + 1,
      limit: targetStage.wipLimit,
      message: isWipBreached 
        ? "WIP limit warning: column capacity exceeded." 
        : "Card moved successfully."
    });

  } catch (error: any) {
    return c.json({ error: "Move transaction failed", details: error.message }, 500);
  }
});

// POST /api/kanban/board/:cardId/tasks — create a task ON the card (gold
// standard: "assign tasks directly from the pipeline screen"). The task is
// bound to the card's engagement so it shows in the card's task lane.
const cardTaskSchema = z.object({
  title: z.string().min(2),
  description: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  assigneeId: z.string().optional(),
  dueDate: z.number().int().optional(),
});
kanbanRouter.post('/board/:cardId/tasks', zValidator('json', cardTaskSchema), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const cardId = c.req.param('cardId');
  const data = c.req.valid('json');
  const now = Math.floor(Date.now() / 1000);

  try {
    const card = await db.select().from(engagements).where(eq(engagements.id, cardId)).get();
    if (!card) return c.json({ error: 'Card not found' }, 404);

    const taskId = crypto.randomUUID();
    await db.insert(tasks).values({
      id: taskId,
      clientId: card.clientId,
      engagementId: card.id,
      assigneeId: data.assigneeId || null,
      title: data.title,
      description: data.description || null,
      priority: data.priority,
      dueDate: data.dueDate || null,
      recurrence: 'none',
      createdAt: now,
      updatedAt: now,
    });
    return c.json({ success: true, id: taskId, message: 'Task added to card.' });
  } catch (error: any) {
    return c.json({ error: 'Card task creation failed', details: error.message }, 500);
  }
});

// PATCH /api/kanban/board/tasks/:taskId — quick status toggle from the lane
kanbanRouter.patch('/board/tasks/:taskId', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const taskId = c.req.param('taskId');
  const body = await c.req.json().catch(() => ({})) as { status?: string };
  if (!['open', 'in_progress', 'done', 'cancelled'].includes(body.status || '')) {
    return c.json({ error: 'status must be open|in_progress|done|cancelled' }, 400);
  }
  const now = Math.floor(Date.now() / 1000);
  try {
    await db.update(tasks)
      .set({ status: body.status as any, ...(body.status === 'done' ? { completedAt: now } : {}), updatedAt: now })
      .where(eq(tasks.id, taskId));
    return c.json({ success: true, id: taskId, status: body.status });
  } catch (error: any) {
    return c.json({ error: 'Task update failed', details: error.message }, 500);
  }
});

// POST /api/kanban/board/create - manual card creation
kanbanRouter.post('/board/create', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const body = await c.req.json().catch(() => ({})) as {
    clientId: string;
    division: 'study-abroad' | 'visa' | 'umrah' | 'attestation' | 'manpower';
    title: string;
    stageKey: string;
    counselorId?: string;
  };

  if (!body.clientId || !body.division || !body.title || !body.stageKey) {
    return c.json({ error: 'Missing required fields: clientId, division, title, stageKey' }, 400);
  }

  const now = Math.floor(Date.now() / 1000);
  try {
    const id = crypto.randomUUID();
    await db.insert(engagements).values({
      id,
      clientId: body.clientId,
      division: body.division,
      title: body.title,
      stageKey: body.stageKey,
      counselorId: body.counselorId || null,
      outstandingBalance: 0,
      status: 'active',
      createdAt: now,
      updatedAt: now
    });
    return c.json({ success: true, id, message: 'Card created successfully.' });
  } catch (error: any) {
    return c.json({ error: 'Failed to create card', details: error.message }, 500);
  }
});

// PATCH /api/kanban/board/:cardId/status - update card status
kanbanRouter.patch('/board/:cardId/status', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const cardId = c.req.param('cardId');
  const body = await c.req.json().catch(() => ({})) as { status?: string };

  if (!body.status) {
    return c.json({ error: 'status is required' }, 400);
  }

  try {
    await db.update(engagements)
      .set({ status: body.status, updatedAt: Math.floor(Date.now() / 1000) })
      .where(eq(engagements.id, cardId));
    return c.json({ success: true, id: cardId, status: body.status });
  } catch (error: any) {
    return c.json({ error: 'Failed to update card status', details: error.message }, 500);
  }
});

// PATCH /api/kanban/board/:cardId/counselor - assign counselor to engagement
kanbanRouter.patch('/board/:cardId/counselor', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const cardId = c.req.param('cardId');
  const body = await c.req.json().catch(() => ({})) as { counselorId?: string | null };

  try {
    await db.update(engagements)
      .set({ 
        counselorId: body.counselorId || null, 
        updatedAt: Math.floor(Date.now() / 1000) 
      })
      .where(eq(engagements.id, cardId));
    return c.json({ success: true, id: cardId, counselorId: body.counselorId || null });
  } catch (error: any) {
    return c.json({ error: 'Failed to update card counselor', details: error.message }, 500);
  }
});

// PATCH /api/kanban/board/:cardId/metadata - update card title, balance, and status
kanbanRouter.patch('/board/:cardId/metadata', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const cardId = c.req.param('cardId');
  const body = await c.req.json().catch(() => ({})) as { 
    title?: string; 
    outstandingBalance?: number; 
    status?: 'active' | 'archived' | 'cancelled'
  };

  try {
    const me = (c.get('user') as any) || {};
    const isManager = ['super_admin', 'manager'].includes(me.role);
    // Division scope: counselors/coordinators may only touch cards in their divisions
    const card = await db.select().from(engagements).where(eq(engagements.id, cardId)).get();
    if (!card) return c.json({ error: 'Card not found' }, 404);
    let divisions: string[] = [];
    try { divisions = JSON.parse(me.userDivisions || '[]'); } catch { divisions = []; }
    if (!isManager && divisions.length > 0 && !divisions.includes(card.division)) {
      return c.json({ error: 'Card is outside your division scope' }, 403);
    }

    const updatePayload: any = { updatedAt: Math.floor(Date.now() / 1000) };
    if (body.title !== undefined) updatePayload.title = body.title;
    // SECURITY: outstandingBalance is money — manager+ only (counselors could
    // zero a rival's balance or game WIP analytics otherwise).
    if (body.outstandingBalance !== undefined) {
      if (!isManager) return c.json({ error: 'Only managers can edit balances' }, 403);
      updatePayload.outstandingBalance = body.outstandingBalance;
    }
    if (body.status !== undefined) updatePayload.status = body.status;

    await db.update(engagements)
      .set(updatePayload)
      .where(eq(engagements.id, cardId));

    return c.json({ success: true, id: cardId, ...updatePayload });
  } catch (error: any) {
    return c.json({ error: 'Failed to update card metadata', details: error.message }, 500);
  }
});

// DELETE /api/kanban/board/:cardId - delete/purge card (manager+ only —
// deletion also removes division-scoping rows and can bypass RBAC fail-open)
kanbanRouter.delete('/board/:cardId', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const me = (c.get('user') as any) || {};
  if (!['super_admin', 'manager'].includes(me.role)) {
    return c.json({ error: 'Only managers can delete cards' }, 403);
  }
  const cardId = c.req.param('cardId');

  try {
    await db.delete(engagements).where(eq(engagements.id, cardId));
    return c.json({ success: true, id: cardId, message: 'Card deleted successfully.' });
  } catch (error: any) {
    return c.json({ error: 'Failed to delete card', details: error.message }, 500);
  }
});


// POST /api/kanban/board/tasks - Create manual task directly
const manualTaskSchema = z.object({
  title: z.string().min(2),
  description: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  assigneeId: z.string().optional(),
  dueDate: z.number().int().optional(),
  clientId: z.string().optional(),
  engagementId: z.string().optional(),
});
kanbanRouter.post('/board/tasks', zValidator('json', manualTaskSchema), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const data = c.req.valid('json');
  const now = Math.floor(Date.now() / 1000);
  try {
    const taskId = crypto.randomUUID();
    await db.insert(tasks).values({
      id: taskId,
      clientId: data.clientId || null,
      engagementId: data.engagementId || null,
      assigneeId: data.assigneeId || null,
      title: data.title,
      description: data.description || null,
      priority: data.priority,
      dueDate: data.dueDate || null,
      recurrence: 'none',
      createdAt: now,
      updatedAt: now,
    });
    return c.json({ success: true, id: taskId, message: 'Task created.' });
  } catch (error: any) {
    return c.json({ error: 'Task creation failed', details: error.message }, 500);
  }
});

// DELETE /api/kanban/board/tasks/:taskId
kanbanRouter.delete('/board/tasks/:taskId', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const taskId = c.req.param('taskId');
  try {
    await db.delete(tasks).where(eq(tasks.id, taskId));
    return c.json({ success: true, id: taskId, message: 'Task deleted successfully.' });
  } catch (error: any) {
    return c.json({ error: 'Task deletion failed', details: error.message }, 500);
  }
});

// GET /api/kanban/analytics?days=30 — flow analytics (CFD + Monte Carlo, §16.4.5).
// Mounted manager+/owner-only in index.ts.
kanbanRouter.get('/analytics', async (c) => {
  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const days = Math.max(7, Math.min(90, Number(c.req.query('days')) || 30));
  try {
    const result = await kanbanFlowAnalytics(c.env, { days });
    return c.json({ analytics: result });
  } catch (error: any) {
    return c.json({ error: "Flow analytics failed", details: error.message }, 500);
  }
});
