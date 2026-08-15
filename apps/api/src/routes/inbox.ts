import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { z } from 'zod';
import { getDb } from '../db/client.js';
import { conversations, communications } from '../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { sendNotification } from '../infra/notify.js';
import { auditEvent } from '../middleware/audit.js';
import { getAuth } from '../auth.js';

// Staff unified inbox (OpenWA + Chatwoot inbound surface).
// Conversations arrive via the webhooks; staff list them here, expand a thread,
// and reply — which dispatches through sendWhatsApp (OpenWA/Meta).

type InboxBindings = {
  DB: D1Database;
  BETTER_AUTH_SECRET: string;
  WA_PROVIDER?: 'openwa' | 'meta';
  OPENWA_BASE_URL?: string;
  OPENWA_API_KEY?: string;
  OPENWA_SESSION_ID?: string;
  META_WHATSAPP_PHONE_ID?: string;
  META_WHATSAPP_TOKEN?: string;
};

export const inboxRouter = new Hono<{ Bindings: InboxBindings }>();

// GET /api/inbox — open conversations (newest first) + unread counts
inboxRouter.get('/', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  try {
    const rows = await db.select().from(conversations).orderBy(desc(conversations.lastMessageAt)).all();
    const list = rows.map((conv: any) => ({
      id: conv.id,
      channel: conv.channel,
      contactKey: conv.contactKey,
      contactName: conv.contactName,
      lastMessage: conv.lastMessage,
      lastMessageAt: conv.lastMessageAt,
      unread: conv.unread || 0,
      status: conv.status,
    }));
    return c.json({ conversations: list, unreadTotal: list.reduce((a, c2: any) => a + (c2.unread || 0), 0) });
  } catch (error: any) {
    return c.json({ error: 'Inbox list failed', details: error.message }, 500);
  }
});

// GET /api/inbox/:id/thread — messages for a conversation
inboxRouter.get('/:id/thread', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  try {
    const conv = await db.select().from(conversations).where(eq(conversations.id, c.req.param('id'))).get();
    if (!conv) return c.json({ error: 'Conversation not found' }, 404);
    const msgs = await db.select().from(communications).where(eq(communications.subject, `${conv.channel}:${conv.contactKey}`)).all();
    const list = msgs.map((m: any) => ({
      id: m.id, channel: m.channel, direction: m.direction, subject: m.subject,
      body: m.body, createdAt: m.createdAt,
    }));
    // mark read
    await db.update(conversations).set({ unread: 0 }).where(eq(conversations.id, conv.id));
    return c.json({ conversation: conv, messages: list });
  } catch (error: any) {
    return c.json({ error: 'Thread fetch failed', details: error.message }, 500);
  }
});

const replySchema = z.object({ body: z.string().min(1).max(5000) });

// POST /api/inbox/:id/reply — staff replies; dispatches via WhatsApp gateway
inboxRouter.post('/:id/reply', zValidator('json', replySchema), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const data = c.req.valid('json');
  try {
    const conv = await db.select().from(conversations).where(eq(conversations.id, c.req.param('id'))).get();
    if (!conv) return c.json({ error: 'Conversation not found' }, 404);

    // Extract a sendable phone from contact key (strip + and spaces)
    const phone = (conv.contactKey || '').replace(/[^0-9]/g, '');
    // §7.6: route through the notification engine so every send is logged.
    // Falls back to direct sendWhatsApp when the engine is unavailable.
    const result = phone.length >= 10
      ? await sendNotification(c.env as any, db as any, { channel: 'whatsapp', to: phone, body: data.body })
      : { ok: false as const, provider: 'inbox', reason: 'contact key is not a parseable phone', notificationId: '' };

    const auth = getAuth(c.env);
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    const senderId = ((session?.user as any)?.id as string) || null;

    await db.insert(communications).values({
      id: crypto.randomUUID(),
      clientId: null,
      senderId,
      channel: 'whatsapp',
      direction: 'outgoing',
      subject: `${conv.channel}:${conv.contactKey}`,
      body: data.body,
      createdAt: Math.floor(Date.now() / 1000),
    });
    await db.update(conversations).set({
      lastMessage: data.body,
      lastMessageAt: Math.floor(Date.now() / 1000),
      status: 'open',
    }).where(eq(conversations.id, conv.id));

    await auditEvent(c, {
      action: 'INBOX_REPLY', entityName: 'conversations', entityId: conv.id,
      afterState: { contactKey: conv.contactKey, dispatched: result.ok, provider: result.provider },
    });

    if (!result.ok) {
      return c.json({ success: true, queued: false, reason: result.reason, message: 'Reply logged locally; gateway delivery pending.' });
    }
    return c.json({ success: true, queued: true, message: 'Reply dispatched via WhatsApp.' });
  } catch (error: any) {
    return c.json({ error: 'Reply failed', details: error.message }, 500);
  }
});