import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { getDb } from '../db/client.js';
import { tasks } from '../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';

export const tasksRouter = new Hono<{ Bindings: { DB: D1Database; BETTER_AUTH_SECRET: string } }>();

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

    return c.json({ success: true, id, message: "Task created." });
  } catch (error: any) {
    return c.json({ error: "Task creation failed", details: error.message }, 500);
  }
});

// GET /api/tasks?assignee=:id&status=open (list with filters)
tasksRouter.get('/', async (c) => {
  if (!c.env || !c.env.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);

  try {
    const assignee = c.req.query('assignee');
    const status = c.req.query('status');

    let list = await db.select().from(tasks).orderBy(desc(tasks.createdAt)).all();
    if (assignee) list = list.filter(t => t.assigneeId === assignee);
    if (status) list = list.filter(t => t.status === status);

    return c.json({ tasks: list });
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

    await db
      .update(tasks)
      .set({
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.assigneeId !== undefined ? { assigneeId: data.assigneeId } : {}),
        ...(data.priority !== undefined ? { priority: data.priority } : {}),
        ...(data.dueDate !== undefined ? { dueDate: data.dueDate } : {}),
        ...(data.title !== undefined ? { title: data.title } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.status === 'done' ? { completedAt: now } : {}),
        updatedAt: now
      })
      .where(eq(tasks.id, id));

    return c.json({ success: true, id, message: "Task updated." });
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
