import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { getDb } from '../db/client.js';
import { tasks, notifications, users, engagements, studyAbroadApplications, seatBookings, visaApplications, manpowerDeployments, attestationApplications } from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';

export const tasksRouter = new Hono<{ Bindings: { DB: D1Database; BETTER_AUTH_SECRET: string }; Variables: { user?: { id?: string } | null } }>();

const createTaskSchema = z.object({
  clientId: z.string().optional(),
  engagementId: z.string().optional(),
  assigneeId: z.string().optional(),
  title: z.string().min(2, { message: "Title is required" }),
  description: z.string().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).default('medium'),
  dueDate: z.number().int().optional(),
  recurrence: z.enum(['none', 'daily', 'weekly', 'monthly']).default('none'),
});

const updateTaskSchema = z.object({
  status: z.enum(['open', 'in_progress', 'done', 'cancelled']).optional(),
  assigneeId: z.string().nullable().optional(),
  priority: z.enum(['low', 'medium', 'high', 'urgent']).optional(),
  dueDate: z.number().int().nullable().optional(),
  title: z.string().min(2).optional(),
  description: z.string().nullable().optional(),
  cos: z.enum(['standard', 'expedite', 'fixed_date']).optional(),
  blockedReason: z.string().max(300).nullable().optional(),
});

// POST /api/tasks (create)
tasksRouter.post('/', zValidator('json', createTaskSchema), async (c) => {
  const data = c.req.valid('json');
  if (!c.env || !c.env.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  const now = Math.floor(Date.now() / 1000);

  try {
    const id = crypto.randomUUID();
    await db.insert(tasks).values({
      id,
      clientId: data.clientId || null,
      engagementId: data.engagementId || null,
      assigneeId: data.assigneeId || null,
      title: data.title,
      description: data.description || null,
      priority: data.priority,
      dueDate: data.dueDate || null,
      recurrence: data.recurrence,
      createdAt: now,
      updatedAt: now
    });

    // Assignment notification: if targeting a specific staff member, record an
    // entry so their "My Work" unread count reflects it (notifications log,
    // task channel). Fail-open.
    if (data.assigneeId) {
      try {
        await db.insert(notifications).values({
          id: crypto.randomUUID(),
          channel: 'task',
          to: data.assigneeId,
          subject: `Task assigned: ${data.title}`,
          body: `${data.title}${data.priority ? ` (${data.priority})` : ''}${data.dueDate ? ` · due ${new Date(data.dueDate * 1000).toLocaleDateString()}` : ''}`,
          status: 'sent',
          provider: 'internal',
          clientId: data.clientId || null,
          createdAt: now,
          sentAt: now,
        } as any);
      } catch (notErr: any) {
        console.error('task notification insert failed', notErr?.message);
      }
    }

    return c.json({ success: true, id, message: "Task created." });
  } catch (error: any) {
    return c.json({ error: "Task creation failed", details: error.message }, 500);
  }
});

// GET /api/tasks?assignee=:id&status=open (list with filters)
// GET /api/tasks/divisions-stats — live counters per division (hub cards, all staff)
tasksRouter.get('/divisions-stats', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  try {
    const [engs, apps, umrah, visa, manpower, attest, allTasks] = await Promise.all([
      db.select().from(engagements).all(),
      db.select().from(studyAbroadApplications).all(),
      db.select().from(seatBookings).all(),
      db.select().from(visaApplications).all(),
      db.select().from(manpowerDeployments).all(),
      db.select().from(attestationApplications).all(),
      db.select().from(tasks).all(),
    ]);
    const openTasks = allTasks.filter(t => t.status === 'open').length;
    const stats: Record<string, any> = {
      'study-abroad': { applications: apps.length, inProgress: apps.filter((a: any) => !['enrolled', 'rejected', 'withdrawn'].includes(a.stage)).length, openTasks },
      visa: { applications: visa.length, inProgress: visa.filter(v => !['delivered', 'cancelled'].includes(v.status)).length, openTasks },
      umrah: { bookings: umrah.length, active: umrah.filter(b => ['held', 'reserved', 'confirmed'].includes(b.status)).length, openTasks },
      manpower: { deployments: manpower.length, inProgress: manpower.filter(m => m.selectionStatus === 'selected' || m.visaStatus === 'submitted').length, openTasks },
      attestation: { applications: attest.length, quoteRequests: attest.filter((a: any) => a.stage === 'quote_requested').length, inProcess: attest.filter((a: any) => ['in_process', 'completed', 'dispatched'].includes(a.stage)).length, openTasks },
      engagements: engs.length,
    };
    return c.json({ success: true, stats });
  } catch (e: any) {
    return c.json({ error: 'Stats fetch failed', details: e?.message }, 500);
  }
});

tasksRouter.get('/', async (c) => {
  if (!c.env || !c.env.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);

  try {
    const assignee = c.req.query('assignee');
    const status = c.req.query('status');

    let list = await db.select().from(tasks).orderBy(desc(tasks.createdAt)).all();
    if (assignee) list = list.filter(t => t.assigneeId === assignee);
    if (status) list = list.filter(t => t.status === status);

    const userRows = await db.select().from(users).all().catch(() => []);
    const nameOf = new Map(userRows.map((u: any) => [u.id, u.name]));
    return c.json({ tasks: list.map((t: any) => ({ ...t, assigneeName: nameOf.get(t.assigneeId) || null })) });
  } catch (error: any) {
    return c.json({ error: "Failed to fetch tasks", details: error.message }, 500);
  }
});

// GET /api/tasks/client/:clientId (tasks for a client - used in Client 360)
tasksRouter.get('/client/:clientId', async (c) => {
  const clientId = c.req.param('clientId');
  if (!c.env || !c.env.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);

  try {
    const list = await db.select().from(tasks).where(eq(tasks.clientId, clientId)).all();
    return c.json({ tasks: list });
  } catch (error: any) {
    return c.json({ error: "Failed to fetch client tasks", details: error.message }, 500);
  }
});

// GET /api/tasks/assigned-to-me — unread/undone tasks for the session user
// GET /api/tasks/staff-directory - minimal staff list for the board picker
// (id/name/role only; all-staff rbac at mount). Powers "assign to" + the
// workspace staff count on Task Boards.
tasksRouter.get('/staff-directory', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const user = (c.get('user') as any) || {};
  try {
    const rows = await db.select().from(users).all().catch(() => []);
    const staff = rows
      .filter((u: any) => u.role !== 'super_admin' || u.id === user.id)
      .map((u: any) => ({ id: u.id, name: u.name, role: u.role }));
    return c.json({ staff, total: staff.length });
  } catch (e: any) {
    return c.json({ error: 'Staff directory failed', details: e.message }, 500);
  }
});

tasksRouter.get('/assigned-to-me', async (c) => {
  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  const user = (c.get('user') as any) || {};
  try {
    const all = await db.select().from(tasks).all();
    const mine = all.filter((t: any) => t.assigneeId === user.id && t.status !== 'done' && t.status !== 'cancelled');
    return c.json({ tasks: mine, openCount: mine.length });
  } catch (error: any) {
    return c.json({ error: "Task lookup failed", details: error.message }, 500);
  }
});

// GET /api/tasks/overdue (overdue open tasks - powers reminders/My Work)
tasksRouter.get('/overdue', async (c) => {
  if (!c.env || !c.env.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  const now = Math.floor(Date.now() / 1000);

  try {
    const list = await db
      .select()
      .from(tasks)
      .where(and(eq(tasks.status, 'open'), desc(tasks.dueDate)))
      .all();
    const overdue = list.filter(t => t.dueDate && t.dueDate < now);
    return c.json({ tasks: overdue });
  } catch (error: any) {
    return c.json({ error: "Failed to fetch overdue tasks", details: error.message }, 500);
  }
});

// PATCH /api/tasks/:id (update status/assignee/priority/due)
tasksRouter.patch('/:id', zValidator('json', updateTaskSchema), async (c) => {
  const id = c.req.param('id');
  const data = c.req.valid('json');
  if (!c.env || !c.env.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  const now = Math.floor(Date.now() / 1000);

try {
    const existing = await db.select().from(tasks).where(eq(tasks.id, id)).get();
    if (!existing) return c.json({ error: "Task not found" }, 404);

    // ── Kanban WIP enforcement (gold standard: finish-before-start, enforced
    // server-side so the API can't bypass the UI). Expedite bypasses the
    // column cap (class-of-service override); the person cap is soft.
    let warning: string | null = null;
    if (data.status === 'in_progress' && existing.status !== 'in_progress' && existing.cos !== 'expedite') {
      const { getBoardPrefs } = await import('./board.js');
      const prefs = await getBoardPrefs(db);
      const inProgressCount = await db.select({ id: tasks.id }).from(tasks)
        .where(and(eq(tasks.status, 'in_progress'), eq(tasks.cos, 'standard' as any)))
        .all().catch(() => []);
      const filtered = inProgressCount.filter((t: any) => t.id !== id);
      if (filtered.length >= Number(prefs.columnLimitInProgress)) {
        return c.json({ error: `WIP limit reached (${prefs.columnLimitInProgress}) — finish or pull something else first`, code: 'wip_limit' }, 409);
      }
      if (existing.assigneeId) {
        const mine = await db.select({ id: tasks.id }).from(tasks)
          .where(and(eq(tasks.status, 'in_progress'), eq(tasks.assigneeId, existing.assigneeId as any)))
          .all().catch(() => []);
        if (mine.filter((t: any) => t.id !== id).length >= Number(prefs.personLimitInProgress)) {
          warning = `watch: ${prefs.personLimitInProgress}+ active tasks per person — finish before starting`;
        }
      }
    }

    await db
      .update(tasks)
      .set({
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.assigneeId !== undefined ? { assigneeId: data.assigneeId } : {}),
        ...(data.priority !== undefined ? { priority: data.priority } : {}),
        ...(data.dueDate !== undefined ? { dueDate: data.dueDate } : {}),
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.cos !== undefined ? { cos: data.cos } : {}),
        ...(data.blockedReason !== undefined ? { blockedReason: data.blockedReason } : {}),
        ...(data.status === 'done' ? { completedAt: now } : {}),
        // TRUE cycle time: timestamp the FIRST move into in_progress (one-shot)
        ...(data.status === 'in_progress' && !existing.inProgressAt ? { inProgressAt: now } : {}),
        updatedAt: now
      })
      .where(eq(tasks.id, id));

    return c.json({ success: true, id, message: "Task updated.", ...(warning ? { warning } : {}) });
  } catch (error: any) {
    return c.json({ error: "Task update failed", details: error.message }, 500);
  }
});

// DELETE /api/tasks/:id
tasksRouter.delete('/:id', async (c) => {
  const id = c.req.param('id');
  if (!c.env || !c.env.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);

  try {
    await db.delete(tasks).where(eq(tasks.id, id));
    return c.json({ success: true, id, message: "Task deleted." });
  } catch (error: any) {
    return c.json({ error: "Task deletion failed", details: error.message }, 500);
  }
});

