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

// Accepts either a shared-secret header (x-webhook-secret) — plaintext compare —
// or an HMAC-SHA256 body signature (x-wa-signature) computed with the shared
// secret, as OpenWA delivers. Timing-safe in both paths.
async function secretOk(c: any, body: string): Promise<boolean> {
  const secret = c.env?.WA_WEBHOOK_SECRET || '';
  if (!secret) return false;

  const plain = c.req.header('x-webhook-secret') || '';
  if (plain && timingSafeEqualStr(plain.trim(), secret)) return true;

  const sig = c.req.header('x-wa-signature') || '';
  if (!sig) return false;
  const expected = await hmacSha256(secret, body);
  return timingSafeEqualStr(sig.trim(), expected);
}

async function hmacSha256(secret: string, body: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
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
  const raw = await c.req.text();
  if (!(await secretOk(c, raw))) return c.json({ error: 'Forbidden' }, 403);
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  try {
const parsed = JSON.parse(raw) as any;
    const msgs: { from?: string; text?: string }[] = [];
    // Meta Cloud API: { value: { messages: [{from, text:{body}}] } }
    if (parsed?.value?.messages) msgs.push(...parsed.value.messages.map((m: any) => ({ from: m.from, text: m.text?.body || m.text?.text || '' })));
    // OpenWA raw.events array
    else if (parsed?.raw?.events) msgs.push(...parsed.raw.events.map((m: any) => ({ from: m.from, text: m.text?.body || m.text || '' })));
    // OpenWA v0.14 event envelope: { event:'message.received', data:{ from, message:{ body, id } } }
    else if (parsed?.event === 'message.received' && parsed?.data?.from && parsed?.data?.message) {
      msgs.push({ from: parsed.data.from, text: parsed.data.message.body || parsed.data.message.text || '' });
    }
    // Loose fallback
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
  const rawCw = await c.req.text();
  if (!(await secretOk(c, rawCw))) return c.json({ error: 'Forbidden' }, 403);
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  try {
    const ev = JSON.parse(rawCw) as any;
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

