import { Hono } from 'hono';
import { getDb } from '../db/client.js';
import { conversations } from '../db/schema.js';
import { eq } from 'drizzle-orm';

type WhBindings = { DB: D1Database; WA_WEBHOOK_SECRET?: string };

export const waWebhookRouter = new Hono<{ Bindings: WhBindings }>();
export const chatwootWebhookRouter = new Hono<{ Bindings: WhBindings }>();

function timingSafeEqualStr(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function secretOk(c: any): boolean {
  const secret = c.env?.WA_WEBHOOK_SECRET || '';
  if (!secret) return false;
  const provided = (c.req.header('x-wa-signature') || c.req.header('x-webhook-secret') || '').trim();
  return provided.length > 0 && timingSafeEqualStr(provided, secret);
}

async function persistMessage(
  db: ReturnType<typeof getDb>,
  channel: 'whatsapp' | 'webchat' | 'email',
  contactKey: string,
  contactName: string | null,
  body: string
) {
  const now = Math.floor(Date.now() / 1000);
  const remoteId = `${channel}:${contactKey}`;
  const existing = await db.select().from(conversations).where(eq(conversations.remoteId, remoteId)).get();
  if (existing) {
    await db.update(conversations).set({
      lastMessage: body,
      lastMessageAt: now,
      unread: (existing.unread || 0) + 1,
      status: 'open',
    }).where(eq(conversations.id, existing.id));
} else {
    await db.insert(conversations).values({
      id: crypto.randomUUID(),
      channel,
      remoteId,
      contactKey,
      contactName,
      lastMessage: body,
      lastMessageAt: now,
      unread: 1,
      status: 'open',
      createdAt: now,
    });
  }
}

waWebhookRouter.post('/', async (c) => {
  if (!secretOk(c)) return c.json({ error: 'Forbidden' }, 403);
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  try {
    const raw = await c.req.text();
    const parsed = JSON.parse(raw) as any;
    const msgs: { from?: string; text?: string }[] = [];
    if (parsed?.value?.messages) msgs.push(...parsed.value.messages.map((m: any) => ({ from: m.from, text: m.text?.body || m.text?.text || '' })));
    else if (parsed?.raw?.events) msgs.push(...parsed.raw.events.map((m: any) => ({ from: m.from, text: m.text?.body || m.text || '' })));
    else if (parsed?.from || parsed?.text || parsed?.message) msgs.push({ from: parsed.from, text: parsed.text?.body || parsed.text || parsed.message });
    for (const m of msgs) {
      if (!m.from || !m.text) continue;
      await persistMessage(db, 'whatsapp', m.from, null, m.text);
    }
    return c.json({ ok: true, count: msgs.length });
  } catch (e: any) {
    return c.json({ error: 'Bad payload', details: e?.message }, 400);
  }
});

chatwootWebhookRouter.post('/', async (c) => {
  if (!secretOk(c)) return c.json({ error: 'Forbidden' }, 403);
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  try {
    const ev = (await c.req.json()) as any;
    const phone = ev?.conversation?.meta?.sender?.phone_number || ev?.conversation?.meta?.sender?.email;
    const name = ev?.conversation?.meta?.sender?.name || null;
    const body = ev?.message?.content || ev?.content || '';
    if ((phone || name) && body) {
      await persistMessage(db, 'whatsapp', String(phone || name || 'unknown'), name, body);
    }
    return c.json({ ok: true });
  } catch (e: any) {
    return c.json({ error: 'Bad payload', details: e?.message }, 400);
  }
});

