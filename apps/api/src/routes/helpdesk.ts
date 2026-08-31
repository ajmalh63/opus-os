import { Hono } from 'hono';
import { getDb } from '../db/client.js';
import { getAuth } from '../auth.js';
import { supportTickets, ticketMessages, clients, partners, users, tasks } from '../db/schema.js';
import { eq, and, desc, sql } from 'drizzle-orm';
import { zValidator } from '@hono/zod-validator';
import {
  createTicketSchema,
  updateTicketStatusSchema,
  assignTicketSchema,
  createTicketMessageSchema,
  ticketSatisfactionSchema
} from '@opusos/shared';
import { auditEvent } from '../middleware/audit.js';
import { publishSyncEvent } from './sync.js';
import { createStaffAlert } from '../infra/staffAlerts.js';
import { resolveClientByToken } from '../lib/clientToken.js';

// ============================================================================
// HELPDESK & SUPPORT TICKETING ENGINE (ITIL v4 Gold Standard)
// - Dynamic SLA with Pause-the-Clock on waiting_on_user
// - Strict Internal Staff Note Isolation
// - Real-time Multi-Workspace Sync across Client, Partner, and Staff
// ============================================================================

export function calculateSlaTarget(priority: string, createdAt: number = Math.floor(Date.now() / 1000)): { slaDueAt: number; remainingSeconds: number } {
  const slaHoursMap: Record<string, number> = {
    urgent: 2,  // 2 hours
    high: 6,    // 6 hours
    medium: 24, // 24 hours
    low: 48,    // 48 hours
  };
  const hours = slaHoursMap[priority] || 24;
  const remainingSeconds = hours * 3600;
  return {
    slaDueAt: createdAt + remainingSeconds,
    remainingSeconds,
  };
}

export async function generateTicketNumber(db: ReturnType<typeof getDb>): Promise<string> {
  const rows = await db.select({ count: sql<number>`count(*)` }).from(supportTickets).all();
  const count = (rows[0]?.count || 0) + 1;
  return `HD-${(1000 + count).toString()}`;
}

// Partner-scoped auth helper
async function authPartner(
  db: ReturnType<typeof getDb>,
  id: string,
  c: { env: { DB: D1Database; BETTER_AUTH_SECRET?: string }; req: { header: (name: string) => string | undefined; raw: Request } }
): Promise<any | null> {
  const partner = await db.select().from(partners).where(eq(partners.id, id)).get();
  if (!partner || partner.status !== 'active') return null;

  const authHeader = c.req.header('Authorization') || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  if (bearer && partner.apiToken && bearer === partner.apiToken) return partner;

  if (partner.email && c.env.BETTER_AUTH_SECRET) {
    const auth = getAuth(c.env as any);
    const session = await auth.api.getSession({ headers: c.req.raw.headers }).catch(() => null);
    if (session?.user?.email && session.user.email.toLowerCase() === partner.email.toLowerCase()) return partner;
  }
  return null;
}

function getPortalToken(c: any): string | undefined {
  const headerToken = c.req.header('x-portal-token') || c.req.header('X-Portal-Token') || c.req.header('authorization')?.replace(/^Bearer\s+/i, '');
  if (headerToken) return headerToken.trim();
  const queryToken = c.req.query('token');
  if (queryToken) return queryToken.trim();
  return undefined;
}

// ----------------------------------------------------------------------------
// 1. SUPERADMIN & STAFF HELPDESK ROUTER (/api/helpdesk/*)
// ----------------------------------------------------------------------------
export const helpdeskRouter = new Hono<{ Bindings: { DB: D1Database; BETTER_AUTH_SECRET?: string } }>();

// GET /api/helpdesk/tickets — Kanban data + filters + SLA status
helpdeskRouter.get('/tickets', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const statusFilter = c.req.query('status');
  const divisionFilter = c.req.query('division');
  const priorityFilter = c.req.query('priority');
  const sourceFilter = c.req.query('source');
  const assigneeFilter = c.req.query('assigneeId');
  const q = c.req.query('q')?.toLowerCase();

  const allTickets = await db.select().from(supportTickets).orderBy(desc(supportTickets.createdAt)).all();
  const now = Math.floor(Date.now() / 1000);

  const filtered = allTickets.filter((t) => {
    if (statusFilter && t.status !== statusFilter) return false;
    if (divisionFilter && t.division !== divisionFilter) return false;
    if (priorityFilter && t.priority !== priorityFilter) return false;
    if (sourceFilter && t.source !== sourceFilter) return false;
    if (assigneeFilter && t.assigneeId !== assigneeFilter) return false;
    if (q) {
      const matchSubject = t.subject.toLowerCase().includes(q);
      const matchNum = t.ticketNumber.toLowerCase().includes(q);
      const matchName = t.creatorName.toLowerCase().includes(q);
      if (!matchSubject && !matchNum && !matchName) return false;
    }
    return true;
  });

  const staffUsers = await db.select().from(users).all().catch(() => []);
  const staffMap = new Map(staffUsers.map((u) => [u.id, u.name]));

  const enriched = filtered.map((t) => {
    let isBreached = false;
    let remainingSec = 0;
    if (t.status !== 'resolved' && t.status !== 'closed' && t.slaDueAt) {
      if (t.status === 'waiting_on_user') {
        remainingSec = t.slaRemainingSeconds || 0;
      } else {
        remainingSec = t.slaDueAt - now;
        if (remainingSec <= 0) isBreached = true;
      }
    }

    return {
      ...t,
      assigneeName: t.assigneeId ? staffMap.get(t.assigneeId) || 'Staff' : 'Unassigned',
      isSlaBreached: isBreached,
      slaRemainingSeconds: remainingSec,
      isPaused: t.status === 'waiting_on_user',
    };
  });

  // Kanban Columns
  const kanban = {
    open: enriched.filter((t) => t.status === 'open'),
    in_progress: enriched.filter((t) => t.status === 'in_progress'),
    waiting_on_user: enriched.filter((t) => t.status === 'waiting_on_user'),
    resolved: enriched.filter((t) => t.status === 'resolved'),
    closed: enriched.filter((t) => t.status === 'closed'),
  };

  const ratings = allTickets.map((t) => t.satisfactionRating).filter(Boolean) as number[];
  const avgCsat = ratings.length > 0 ? parseFloat((ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1)) : 5.0;

  const metrics = {
    total: allTickets.length,
    open: kanban.open.length,
    inProgress: kanban.in_progress.length,
    waitingOnUser: kanban.waiting_on_user.length,
    resolved: kanban.resolved.length,
    closed: kanban.closed.length,
    slaBreachedCount: enriched.filter((t) => t.isSlaBreached).length,
    unassignedCount: allTickets.filter((t) => !t.assigneeId && t.status !== 'closed').length,
    avgCsat,
  };

  return c.json({ success: true, tickets: enriched, kanban, metrics });
});

// GET /api/helpdesk/tickets/:id — Full details + internal messages
helpdeskRouter.get('/tickets/:id', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const id = c.req.param('id');
  const ticket = await db.select().from(supportTickets).where(eq(supportTickets.id, id)).get();
  if (!ticket) return c.json({ error: 'Ticket not found' }, 404);

  const messages = await db.select().from(ticketMessages).where(eq(ticketMessages.ticketId, id)).orderBy(ticketMessages.createdAt).all();

  return c.json({ success: true, ticket, messages });
});

// PATCH /api/helpdesk/tickets/:id/status — Status transitions & SLA pause/resume
helpdeskRouter.patch('/tickets/:id/status', zValidator('json', updateTicketStatusSchema), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const id = c.req.param('id');
  const body = c.req.valid('json');
  const now = Math.floor(Date.now() / 1000);

  const ticket = await db.select().from(supportTickets).where(eq(supportTickets.id, id)).get();
  if (!ticket) return c.json({ error: 'Ticket not found' }, 404);

  const updates: Record<string, any> = {
    status: body.status,
    updatedAt: now,
  };

  // ITIL v4 SLA Pause/Resume Engine
  if (body.status === 'waiting_on_user' && ticket.status !== 'waiting_on_user') {
    updates.slaPausedAt = now;
    updates.slaRemainingSeconds = ticket.slaDueAt ? Math.max(0, ticket.slaDueAt - now) : 86400;
  } else if (ticket.status === 'waiting_on_user' && (body.status === 'in_progress' || body.status === 'open')) {
    const remaining = ticket.slaRemainingSeconds || 3600;
    updates.slaDueAt = now + remaining;
    updates.slaPausedAt = null;
  }

  if (body.status === 'resolved' && !ticket.resolvedAt) {
    updates.resolvedAt = now;
  }
  if (body.status === 'closed' && !ticket.closedAt) {
    updates.closedAt = now;
  }

  await db.update(supportTickets).set(updates).where(eq(supportTickets.id, id));

  // If a note is provided, insert a system/staff note
  if (body.note) {
    await db.insert(ticketMessages).values({
      id: crypto.randomUUID(),
      ticketId: id,
      senderType: 'staff',
      senderId: 'system',
      senderName: 'Opus Support Desk',
      message: `Status updated to ${body.status}: ${body.note}`,
      isInternalNote: true,
      createdAt: now,
    });
  }

  await auditEvent(c as any, {
    action: 'TICKET_STATUS_CHANGED',
    entityName: 'support_tickets',
    entityId: id,
    afterState: { status: body.status, ticketNumber: ticket.ticketNumber }
  }).catch(() => {});

  // Real-time synchronization
  try {
    await publishSyncEvent(c.env as any, { channel: 'staff:global:tickets', type: 'TICKET_UPDATED', payload: { id, status: body.status } }, (c as any).executionCtx);
    if (ticket.clientId) {
      await publishSyncEvent(c.env as any, { channel: `client:${ticket.clientId}:tickets`, type: 'TICKET_UPDATED', payload: { id, status: body.status } }, (c as any).executionCtx);
    }
    if (ticket.partnerId) {
      await publishSyncEvent(c.env as any, { channel: `partner:${ticket.partnerId}:tickets`, type: 'TICKET_UPDATED', payload: { id, status: body.status } }, (c as any).executionCtx);
    }
  } catch {}

  return c.json({ success: true, message: `Ticket status moved to ${body.status}` });
});

// PATCH /api/helpdesk/tickets/:id/assign — Assign to staff counselor
helpdeskRouter.patch('/tickets/:id/assign', zValidator('json', assignTicketSchema), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const id = c.req.param('id');
  const { assigneeId } = c.req.valid('json');
  const now = Math.floor(Date.now() / 1000);

  const ticket = await db.select().from(supportTickets).where(eq(supportTickets.id, id)).get();
  if (!ticket) return c.json({ error: 'Ticket not found' }, 404);

  await db.update(supportTickets).set({ assigneeId, updatedAt: now }).where(eq(supportTickets.id, id));

  await auditEvent(c as any, {
    action: 'TICKET_ASSIGNED',
    entityName: 'support_tickets',
    entityId: id,
    afterState: { assigneeId, ticketNumber: ticket.ticketNumber }
  }).catch(() => {});

  try {
    await publishSyncEvent(c.env as any, { channel: 'staff:global:tickets', type: 'TICKET_UPDATED', payload: { id, assigneeId } }, (c as any).executionCtx);
  } catch {}

  return c.json({ success: true, message: 'Assignee updated' });
});

// POST /api/helpdesk/tickets/:id/messages — Staff reply or internal note
helpdeskRouter.post('/tickets/:id/messages', zValidator('json', createTicketMessageSchema), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const id = c.req.param('id');
  const body = c.req.valid('json');
  const now = Math.floor(Date.now() / 1000);

  const ticket = await db.select().from(supportTickets).where(eq(supportTickets.id, id)).get();
  if (!ticket) return c.json({ error: 'Ticket not found' }, 404);

  const msgId = crypto.randomUUID();
  await db.insert(ticketMessages).values({
    id: msgId,
    ticketId: id,
    senderType: 'staff',
    senderId: 'staff_agent',
    senderName: 'Opus Support Specialist',
    message: body.message,
    isInternalNote: !!body.isInternalNote,
    attachmentsJson: JSON.stringify(body.attachments || []),
    createdAt: now,
  });

  const ticketUpdates: Record<string, any> = { updatedAt: now };
  if (!body.isInternalNote) {
    if (!ticket.firstResponseAt) ticketUpdates.firstResponseAt = now;
    if (ticket.status === 'open') ticketUpdates.status = 'in_progress';
  }
  await db.update(supportTickets).set(ticketUpdates).where(eq(supportTickets.id, id));

  await auditEvent(c as any, {
    action: 'TICKET_MESSAGE_SENT',
    entityName: 'ticket_messages',
    entityId: msgId,
    afterState: { ticketId: id, isInternalNote: body.isInternalNote }
  }).catch(() => {});

  // Real-time broadcasts
  try {
    await publishSyncEvent(c.env as any, { channel: 'staff:global:tickets', type: 'TICKET_MESSAGE_ADDED', payload: { ticketId: id, msgId } }, (c as any).executionCtx);
    if (!body.isInternalNote) {
      if (ticket.clientId) {
        await publishSyncEvent(c.env as any, { channel: `client:${ticket.clientId}:tickets`, type: 'TICKET_MESSAGE_ADDED', payload: { ticketId: id, msgId } }, (c as any).executionCtx);
      }
      if (ticket.partnerId) {
        await publishSyncEvent(c.env as any, { channel: `partner:${ticket.partnerId}:tickets`, type: 'TICKET_MESSAGE_ADDED', payload: { ticketId: id, msgId } }, (c as any).executionCtx);
      }
    }
  } catch {}

  return c.json({ success: true, id: msgId, message: 'Message recorded' });
});

// GET /api/helpdesk/analytics — Helpdesk metrics & performance report
helpdeskRouter.get('/analytics', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const tickets = await db.select().from(supportTickets).all();
  const now = Math.floor(Date.now() / 1000);

  const resolved = tickets.filter((t) => t.status === 'resolved' || t.status === 'closed');
  const breached = tickets.filter((t) => t.slaDueAt && t.slaDueAt < (t.resolvedAt || now));
  const slaCompliancePct = tickets.length > 0 ? Math.round(((tickets.length - breached.length) / tickets.length) * 100) : 100;

  const ratings = tickets.map((t) => t.satisfactionRating).filter(Boolean) as number[];
  const avgCsat = ratings.length > 0 ? parseFloat((ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1)) : 5.0;

  const divisionBreakdown: Record<string, number> = {};
  const categoryBreakdown: Record<string, number> = {};
  for (const t of tickets) {
    divisionBreakdown[t.division] = (divisionBreakdown[t.division] || 0) + 1;
    categoryBreakdown[t.category] = (categoryBreakdown[t.category] || 0) + 1;
  }

  return c.json({
    success: true,
    analytics: {
      totalTickets: tickets.length,
      resolvedTickets: resolved.length,
      openTickets: tickets.length - resolved.length,
      slaCompliancePct,
      avgCsat,
      totalRatings: ratings.length,
      divisionBreakdown,
      categoryBreakdown,
    }
  });
});


// ----------------------------------------------------------------------------
// 2. CLIENT PORTAL HELPDESK ROUTER (/api/public/portal/tickets)
// ----------------------------------------------------------------------------
export const portalTicketsRouter = new Hono<{ Bindings: { DB: D1Database; BETTER_AUTH_SECRET?: string } }>();

// GET /api/public/portal/tickets — Client's tickets & Kanban buckets
portalTicketsRouter.get('/', async (c) => {
  const token = getPortalToken(c) || '';
  if (!token) return c.json({ error: 'Token required' }, 401);
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const client = await resolveClientByToken(db, token);
  if (!client) return c.json({ error: 'Client not found' }, 404);

  const tickets = await db.select().from(supportTickets).where(eq(supportTickets.clientId, client.id)).orderBy(desc(supportTickets.createdAt)).all();

  const kanban = {
    active: tickets.filter((t) => t.status === 'open' || t.status === 'in_progress'),
    awaiting_user: tickets.filter((t) => t.status === 'waiting_on_user'),
    resolved: tickets.filter((t) => t.status === 'resolved' || t.status === 'closed'),
  };

  return c.json({ success: true, tickets, kanban });
});

// GET /api/public/portal/tickets/:id — Client ticket details (internal notes firewalled)
portalTicketsRouter.get('/:id', async (c) => {
  const token = getPortalToken(c) || '';
  if (!token) return c.json({ error: 'Token required' }, 401);
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const client = await resolveClientByToken(db, token);
  if (!client) return c.json({ error: 'Client not found' }, 404);

  const id = c.req.param('id');
  const ticket = await db.select().from(supportTickets).where(and(eq(supportTickets.id, id), eq(supportTickets.clientId, client.id))).get();
  if (!ticket) return c.json({ error: 'Ticket not found' }, 404);

  // STRICT FIREWALL: Only non-internal notes are exposed to clients
  const messages = await db
    .select()
    .from(ticketMessages)
    .where(and(eq(ticketMessages.ticketId, id), eq(ticketMessages.isInternalNote, false)))
    .orderBy(ticketMessages.createdAt)
    .all();

  return c.json({ success: true, ticket, messages });
});

// POST /api/public/portal/tickets — Raise a ticket
portalTicketsRouter.post('/', zValidator('json', createTicketSchema), async (c) => {
  const token = getPortalToken(c) || '';
  if (!token) return c.json({ error: 'Token required' }, 401);
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const client = await resolveClientByToken(db, token);
  if (!client) return c.json({ error: 'Client not found' }, 404);

  const body = c.req.valid('json');
  const now = Math.floor(Date.now() / 1000);
  const ticketNumber = await generateTicketNumber(db);
  const ticketId = `tick_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 4)}`;
  const { slaDueAt, remainingSeconds } = calculateSlaTarget(body.priority, now);

  await db.insert(supportTickets).values({
    id: ticketId,
    ticketNumber,
    source: 'client',
    clientId: client.id,
    creatorName: client.name || 'Client',
    creatorEmail: client.email || null,
    creatorPhone: client.phone || null,
    division: body.division,
    category: body.category,
    subject: body.subject,
    description: body.description,
    priority: body.priority,
    status: 'open',
    slaDueAt,
    slaRemainingSeconds: remainingSeconds,
    attachmentsJson: JSON.stringify(body.attachments || []),
    createdAt: now,
    updatedAt: now,
  });

  // Automatically insert initial user message
  await db.insert(ticketMessages).values({
    id: crypto.randomUUID(),
    ticketId,
    senderType: 'client',
    senderId: client.id,
    senderName: client.name || 'Client',
    message: body.description,
    isInternalNote: false,
    attachmentsJson: JSON.stringify(body.attachments || []),
    createdAt: now,
  });

  // Create an automated triage task for staff
  await db.insert(tasks).values({
    id: crypto.randomUUID(),
    clientId: client.id,
    title: `[Helpdesk] ${ticketNumber}: ${body.subject}`,
    description: `New ${body.priority.toUpperCase()} priority ticket opened by ${client.name || 'Client'}. Category: ${body.category}`,
    priority: body.priority === 'urgent' ? 'urgent' : body.priority === 'high' ? 'high' : 'medium',
    status: 'open',
    cos: body.priority === 'urgent' ? 'expedite' : 'standard',
    createdAt: now,
    updatedAt: now,
  }).catch(() => {});

  // Create staff alert
  await createStaffAlert(c.env as any, {
    division: body.division === 'general' ? 'study-abroad' : body.division as any,
    type: 'helpdesk_ticket',
    title: `New Ticket ${ticketNumber}: ${body.subject}`,
    body: `${client.name || 'Client'} raised a ticket in ${body.category} (${body.priority})`,
    clientId: client.id,
    payload: { ticketId, ticketNumber, priority: body.priority }
  }).catch(() => {});

  await auditEvent(c as any, {
    action: 'TICKET_CREATED',
    entityName: 'support_tickets',
    entityId: ticketId,
    afterState: { ticketNumber, clientId: client.id, priority: body.priority }
  }).catch(() => {});

  // Real-time broadcasts
  try {
    await publishSyncEvent(c.env as any, { channel: 'staff:global:tickets', type: 'TICKET_CREATED', payload: { ticketId, ticketNumber, priority: body.priority } }, (c as any).executionCtx);
    await publishSyncEvent(c.env as any, { channel: `client:${client.id}:tickets`, type: 'TICKET_CREATED', payload: { ticketId, ticketNumber } }, (c as any).executionCtx);
  } catch {}

  return c.json({ success: true, ticketId, ticketNumber, message: 'Support ticket raised successfully' });
});

// POST /api/public/portal/tickets/:id/messages — Client reply
portalTicketsRouter.post('/:id/messages', zValidator('json', createTicketMessageSchema), async (c) => {
  const token = getPortalToken(c) || '';
  if (!token) return c.json({ error: 'Token required' }, 401);
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const client = await resolveClientByToken(db, token);
  if (!client) return c.json({ error: 'Client not found' }, 404);

  const id = c.req.param('id');
  const ticket = await db.select().from(supportTickets).where(and(eq(supportTickets.id, id), eq(supportTickets.clientId, client.id))).get();
  if (!ticket) return c.json({ error: 'Ticket not found' }, 404);

  const body = c.req.valid('json');
  const now = Math.floor(Date.now() / 1000);
  const msgId = crypto.randomUUID();

  await db.insert(ticketMessages).values({
    id: msgId,
    ticketId: id,
    senderType: 'client',
    senderId: client.id,
    senderName: client.name || 'Client',
    message: body.message,
    isInternalNote: false,
    attachmentsJson: JSON.stringify(body.attachments || []),
    createdAt: now,
  });

  const updates: Record<string, any> = { updatedAt: now };
  // If was waiting_on_user, automatically resume SLA and flip to in_progress
  if (ticket.status === 'waiting_on_user') {
    updates.status = 'in_progress';
    const remaining = ticket.slaRemainingSeconds || 3600;
    updates.slaDueAt = now + remaining;
    updates.slaPausedAt = null;
  }
  await db.update(supportTickets).set(updates).where(eq(supportTickets.id, id));

  try {
    await publishSyncEvent(c.env as any, { channel: 'staff:global:tickets', type: 'TICKET_MESSAGE_ADDED', payload: { ticketId: id, msgId } }, (c as any).executionCtx);
    await publishSyncEvent(c.env as any, { channel: `client:${client.id}:tickets`, type: 'TICKET_MESSAGE_ADDED', payload: { ticketId: id, msgId } }, (c as any).executionCtx);
  } catch {}

  return c.json({ success: true, id: msgId, message: 'Reply submitted' });
});

// POST /api/public/portal/tickets/:id/satisfaction — 1-5 Star CSAT Feedback
portalTicketsRouter.post('/:id/satisfaction', zValidator('json', ticketSatisfactionSchema), async (c) => {
  const token = getPortalToken(c) || '';
  if (!token) return c.json({ error: 'Token required' }, 401);
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const client = await resolveClientByToken(db, token);
  if (!client) return c.json({ error: 'Client not found' }, 404);

  const id = c.req.param('id');
  const ticket = await db.select().from(supportTickets).where(and(eq(supportTickets.id, id), eq(supportTickets.clientId, client.id))).get();
  if (!ticket) return c.json({ error: 'Ticket not found' }, 404);

  const { rating, feedback } = c.req.valid('json');
  const now = Math.floor(Date.now() / 1000);

  await db.update(supportTickets).set({
    satisfactionRating: rating,
    satisfactionFeedback: feedback || null,
    updatedAt: now,
  }).where(eq(supportTickets.id, id));

  await auditEvent(c as any, {
    action: 'TICKET_CSAT_SUBMITTED',
    entityName: 'support_tickets',
    entityId: id,
    afterState: { rating, ticketNumber: ticket.ticketNumber }
  }).catch(() => {});

  try {
    await publishSyncEvent(c.env as any, { channel: 'staff:global:tickets', type: 'TICKET_UPDATED', payload: { id, rating } }, (c as any).executionCtx);
  } catch {}

  return c.json({ success: true, message: 'Thank you for your feedback!' });
});

// POST /api/public/portal/tickets/:id/close — Client confirms closure
portalTicketsRouter.post('/:id/close', async (c) => {
  const token = getPortalToken(c) || '';
  if (!token) return c.json({ error: 'Token required' }, 401);
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const client = await resolveClientByToken(db, token);
  if (!client) return c.json({ error: 'Client not found' }, 404);

  const id = c.req.param('id');
  const ticket = await db.select().from(supportTickets).where(and(eq(supportTickets.id, id), eq(supportTickets.clientId, client.id))).get();
  if (!ticket) return c.json({ error: 'Ticket not found' }, 404);

  const now = Math.floor(Date.now() / 1000);
  await db.update(supportTickets).set({
    status: 'closed',
    closedAt: now,
    updatedAt: now,
  }).where(eq(supportTickets.id, id));

  try {
    await publishSyncEvent(c.env as any, { channel: 'staff:global:tickets', type: 'TICKET_UPDATED', payload: { id, status: 'closed' } }, (c as any).executionCtx);
    await publishSyncEvent(c.env as any, { channel: `client:${client.id}:tickets`, type: 'TICKET_UPDATED', payload: { id, status: 'closed' } }, (c as any).executionCtx);
  } catch {}

  return c.json({ success: true, message: 'Ticket closed' });
});


// ----------------------------------------------------------------------------
// 3. PARTNER PORTAL HELPDESK ROUTER (/api/partner/:id/tickets)
// ----------------------------------------------------------------------------
export const partnerTicketsRouter = new Hono<{ Bindings: { DB: D1Database; BETTER_AUTH_SECRET?: string } }>();

// GET /api/partner/:id/tickets — Partner's tickets
partnerTicketsRouter.get('/:id/tickets', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const partnerId = c.req.param('id');
  if (!partnerId) return c.json({ error: 'Partner ID required' }, 400);

  const authed = await authPartner(db, partnerId, c);
  if (!authed) return c.json({ error: 'Unauthorized: valid partner token or session required' }, 401);

  const tickets = await db.select().from(supportTickets).where(eq(supportTickets.partnerId, partnerId)).orderBy(desc(supportTickets.createdAt)).all();

  const kanban = {
    active: tickets.filter((t) => t.status === 'open' || t.status === 'in_progress'),
    awaiting_user: tickets.filter((t) => t.status === 'waiting_on_user'),
    resolved: tickets.filter((t) => t.status === 'resolved' || t.status === 'closed'),
  };

  return c.json({ success: true, tickets, kanban });
});

// GET /api/partner/:id/tickets/:ticketId — Partner ticket detail
partnerTicketsRouter.get('/:id/tickets/:ticketId', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const partnerId = c.req.param('id');
  const ticketId = c.req.param('ticketId');
  if (!partnerId || !ticketId) return c.json({ error: 'Partner ID and Ticket ID required' }, 400);

  const authed = await authPartner(db, partnerId, c);
  if (!authed) return c.json({ error: 'Unauthorized: valid partner token or session required' }, 401);

  const ticket = await db.select().from(supportTickets).where(and(eq(supportTickets.id, ticketId), eq(supportTickets.partnerId, partnerId))).get();
  if (!ticket) return c.json({ error: 'Ticket not found' }, 404);

  // Exclude internal notes
  const messages = await db
    .select()
    .from(ticketMessages)
    .where(and(eq(ticketMessages.ticketId, ticketId), eq(ticketMessages.isInternalNote, false)))
    .orderBy(ticketMessages.createdAt)
    .all();

  return c.json({ success: true, ticket, messages });
});

// POST /api/partner/:id/tickets — Partner creates escalation
partnerTicketsRouter.post('/:id/tickets', zValidator('json', createTicketSchema), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const partnerId = c.req.param('id');
  if (!partnerId) return c.json({ error: 'Partner ID required' }, 400);

  const authed = await authPartner(db, partnerId, c);
  if (!authed) return c.json({ error: 'Unauthorized: valid partner token or session required' }, 401);

  const body = c.req.valid('json');
  const now = Math.floor(Date.now() / 1000);
  const ticketNumber = await generateTicketNumber(db);
  const ticketId = `ptick_${Date.now().toString(36)}_${crypto.randomUUID().slice(0, 4)}`;
  const { slaDueAt, remainingSeconds } = calculateSlaTarget(body.priority, now);

  await db.insert(supportTickets).values({
    id: ticketId,
    ticketNumber,
    source: 'partner',
    partnerId,
    creatorName: authed.name || 'Partner',
    creatorEmail: authed.email || null,
    creatorPhone: authed.phone || null,
    division: body.division,
    category: body.category,
    subject: body.subject,
    description: body.description,
    priority: body.priority,
    status: 'open',
    slaDueAt,
    slaRemainingSeconds: remainingSeconds,
    attachmentsJson: JSON.stringify(body.attachments || []),
    createdAt: now,
    updatedAt: now,
  });

  await db.insert(ticketMessages).values({
    id: crypto.randomUUID(),
    ticketId,
    senderType: 'partner',
    senderId: partnerId,
    senderName: authed.name || 'Partner',
    message: body.description,
    isInternalNote: false,
    attachmentsJson: JSON.stringify(body.attachments || []),
    createdAt: now,
  });

  // Create staff triage alert
  await createStaffAlert(c.env as any, {
    division: body.division === 'general' ? 'study-abroad' : body.division as any,
    type: 'helpdesk_ticket',
    title: `[Partner Desk] ${ticketNumber}: ${body.subject}`,
    body: `Partner ${authed.name} raised escalation (${body.priority})`,
    payload: { ticketId, ticketNumber, partnerId }
  }).catch(() => {});

  try {
    await publishSyncEvent(c.env as any, { channel: 'staff:global:tickets', type: 'TICKET_CREATED', payload: { ticketId, ticketNumber } }, (c as any).executionCtx);
    await publishSyncEvent(c.env as any, { channel: `partner:${partnerId}:tickets`, type: 'TICKET_CREATED', payload: { ticketId, ticketNumber } }, (c as any).executionCtx);
  } catch {}

  return c.json({ success: true, ticketId, ticketNumber, message: 'Partner ticket submitted' });
});

// POST /api/partner/:id/tickets/:ticketId/messages — Partner reply
partnerTicketsRouter.post('/:id/tickets/:ticketId/messages', zValidator('json', createTicketMessageSchema), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const partnerId = c.req.param('id');
  const ticketId = c.req.param('ticketId');
  if (!partnerId || !ticketId) return c.json({ error: 'Partner ID and Ticket ID required' }, 400);

  const authed = await authPartner(db, partnerId, c);
  if (!authed) return c.json({ error: 'Unauthorized: valid partner token or session required' }, 401);

  const ticket = await db.select().from(supportTickets).where(and(eq(supportTickets.id, ticketId), eq(supportTickets.partnerId, partnerId))).get();
  if (!ticket) return c.json({ error: 'Ticket not found' }, 404);

  const body = c.req.valid('json');
  const now = Math.floor(Date.now() / 1000);
  const msgId = crypto.randomUUID();

  await db.insert(ticketMessages).values({
    id: msgId,
    ticketId,
    senderType: 'partner',
    senderId: partnerId,
    senderName: authed.name || 'Partner',
    message: body.message,
    isInternalNote: false,
    attachmentsJson: JSON.stringify(body.attachments || []),
    createdAt: now,
  });

  const updates: Record<string, any> = { updatedAt: now };
  if (ticket.status === 'waiting_on_user') {
    updates.status = 'in_progress';
    const remaining = ticket.slaRemainingSeconds || 3600;
    updates.slaDueAt = now + remaining;
    updates.slaPausedAt = null;
  }
  await db.update(supportTickets).set(updates).where(eq(supportTickets.id, ticketId));

  try {
    await publishSyncEvent(c.env as any, { channel: 'staff:global:tickets', type: 'TICKET_MESSAGE_ADDED', payload: { ticketId, msgId } }, (c as any).executionCtx);
    await publishSyncEvent(c.env as any, { channel: `partner:${partnerId}:tickets`, type: 'TICKET_MESSAGE_ADDED', payload: { ticketId, msgId } }, (c as any).executionCtx);
  } catch {}

  return c.json({ success: true, id: msgId, message: 'Reply sent' });
});
