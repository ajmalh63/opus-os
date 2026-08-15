import { DurableObject } from 'cloudflare:workers';
import { Hono } from 'hono';
import { getDb } from '../db/client.js';
import { users } from '../db/schema.js';
import { eq } from 'drizzle-orm';

// Team Hub (§5.5) — a Durable Object per room gives us persistent, low-latency
// chat with zero D1 writes on the hot path. Messages live in DO storage;
// the file drive is R2 under `team/`. Free-tier safe: one DO per room.

export interface TeamHubMessage {
  id: string;
  roomId: string;
  senderId: string;
  senderName: string;
  body: string;
  ts: number;
}

export class TeamHubRoom extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const method = request.method;

    // POST /messages { senderId, senderName, body }
    if (method === 'POST' && url.pathname.endsWith('/messages')) {
      const body = (await request.json().catch(() => ({}))) as Partial<TeamHubMessage>;
      const msg: TeamHubMessage = {
        id: crypto.randomUUID(),
        roomId: this.ctx.id.name || 'room',
        senderId: String(body.senderId || 'system'),
        senderName: String(body.senderName || 'System'),
        body: String(body.body || '').slice(0, 2000),
        ts: Math.floor(Date.now() / 1000),
      };
      if (!msg.body.trim()) return new Response(JSON.stringify({ error: 'empty message' }), { status: 400, headers: HEADERS });
      const list = await this.getMessages();
      list.push(msg);
      if (list.length > 500) list.splice(0, list.length - 500); // cap history
      await this.ctx.storage.put('messages', list);
      return new Response(JSON.stringify({ ok: true, message: msg }), { status: 200, headers: HEADERS });
    }

    // GET /messages?after=<ts>
    if (method === 'GET' && url.pathname.endsWith('/messages')) {
      const after = Number(url.searchParams.get('after')) || 0;
      const list = await this.getMessages();
      const filtered = list.filter((m) => m.ts > after);
      return new Response(JSON.stringify({ messages: filtered, roomId: this.ctx.id.name }), { status: 200, headers: HEADERS });
    }

    // GET /meta
    if (method === 'GET' && url.pathname.endsWith('/meta')) {
      return new Response(JSON.stringify({ roomId: this.ctx.id.name, count: (await this.getMessages()).length }), { status: 200, headers: HEADERS });
    }

    return new Response(JSON.stringify({ error: 'not found' }), { status: 404, headers: HEADERS });
  }

  private async getMessages(): Promise<TeamHubMessage[]> {
    const stored = await this.ctx.storage.get<TeamHubMessage[]>('messages');
    return Array.isArray(stored) ? stored : [];
  }
}

const HEADERS = { 'Content-Type': 'application/json' };

type Env = { DB: D1Database; TEAM_HUB: DurableObjectNamespace<TeamHubRoom>; BUCKET?: R2Bucket; BETTER_AUTH_SECRET: string };

// Worker-side router: staff (all roles) chat rooms + R2 team file drive.
export const teamHubRouter = new Hono<{ Bindings: Env; Variables: { user: any } }>();

function roomStub(env: Env, roomId: string) {
  const id = env.TEAM_HUB.idFromName(roomId);
  return env.TEAM_HUB.get(id);
}

// GET /api/teamhub/rooms/:id/messages?after= — poll chat history
teamHubRouter.get('/rooms/:id/messages', async (c) => {
  if (!c.env?.TEAM_HUB) return c.json({ error: 'Team Hub not configured (Durable Object binding)' }, 503);
  const after = c.req.query('after') || '0';
  try {
    const res = await roomStub(c.env, c.req.param('id')).fetch(`http://room/messages?after=${after}`);
    return new Response(res.body, { status: res.status, headers: { 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return c.json({ error: 'Room fetch failed', details: e.message }, 500);
  }
});

// POST /api/teamhub/rooms/:id/messages { body }
teamHubRouter.post('/rooms/:id/messages', async (c) => {
  if (!c.env?.TEAM_HUB) return c.json({ error: 'Team Hub not configured' }, 503);
  const user = (c.get('user') as any) || {};
  const body = await c.req.json().catch(() => ({})) as { body?: string };
  try {
    const res = await roomStub(c.env, c.req.param('id')).fetch('http://room/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ senderId: user.id, senderName: user.name || 'Staff', body: body.body }),
    });
    return new Response(res.body, { status: res.status, headers: { 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return c.json({ error: 'Send failed', details: e.message }, 500);
  }
});

// GET /api/teamhub/files — R2 team drive listing
teamHubRouter.get('/files', async (c) => {
  if (!c.env?.BUCKET) return c.json({ files: [] });
  try {
    const listed = await c.env.BUCKET.list({ prefix: 'team/' });
    const files = listed.objects.map((o) => ({
      key: o.key,
      size: o.size,
      uploadedAt: o.uploaded ? Math.floor(new Date(o.uploaded).getTime() / 1000) : null,
    }));
    return c.json({ files });
  } catch (e: any) {
    return c.json({ error: 'File drive listing failed', details: e.message }, 500);
  }
});