import { auditBounded, auditEvent } from '../middleware/audit.js';
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
  file?: { key: string; name: string; size: number; mime: string };
}

export class TeamHubRoom extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    // Authenticate: every call must carry HMAC(BETTER_AUTH_SECRET, roomName).
    // DOs are reachable via their own workers.dev URL in prod — never trust
    // unauthenticated callers or caller-supplied senderId.
    const url = new URL(request.url);
    const method = request.method;
    const expected = await doVerify(this.env, this.ctx.id.name || 'room');
    const provided = request.headers.get('X-TeamHub-Auth') || '';
    if (!expected || provided.length !== expected.length || !timingSafeEqual(provided, expected)) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401, headers: HEADERS });
    }

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
        ...(body.file ? { file: body.file } : {}),
      };
      if (!msg.body.trim() && !msg.file) return new Response(JSON.stringify({ error: 'empty message' }), { status: 400, headers: HEADERS });
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

async function doVerify(env: Env, roomId: string): Promise<string> {
  const secret = env.BETTER_AUTH_SECRET || '';
  const data = new TextEncoder().encode(`${secret}:${roomId}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

const HEADERS = { 'Content-Type': 'application/json' };

type Env = { DB: D1Database; TEAM_HUB: DurableObjectNamespace<TeamHubRoom>; BUCKET?: R2Bucket; BETTER_AUTH_SECRET: string };

// Worker-side router: staff (all roles) chat rooms + R2 team file drive.
export const teamHubRouter = new Hono<{ Bindings: Env; Variables: { user: any } }>();

function roomStub(env: Env, roomId: string) {
  const id = env.TEAM_HUB.idFromName(roomId);
  return env.TEAM_HUB.get(id);
}

// Shared-secret auth between the worker and the DO: HMAC(BETTER_AUTH_SECRET,
// roomId). The DO verifies it — nobody can hit the DO's workers.dev URL
// directly and read/spoof room messages without the secret.
async function doAuthHeaders(env: Env, roomId: string): Promise<Record<string, string>> {
  const secret = env.BETTER_AUTH_SECRET || '';
  const data = new TextEncoder().encode(`${secret}:${roomId}`);
  const digest = await crypto.subtle.digest('SHA-256', data);
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
  return { 'X-TeamHub-Auth': hex };
}

// GET /api/teamhub/rooms/:id/messages?after= — poll chat history
teamHubRouter.get('/rooms/:id/messages', async (c) => {
  if (!c.env?.TEAM_HUB) return c.json({ error: 'Team Hub not configured (Durable Object binding)' }, 503);
  const after = c.req.query('after') || '0';
  try {
    const headers = await doAuthHeaders(c.env, c.req.param('id'));
    const res = await roomStub(c.env, c.req.param('id')).fetch(`http://room/messages?after=${after}`, { headers });
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
    const authHeaders = await doAuthHeaders(c.env, c.req.param('id'));
    const res = await roomStub(c.env, c.req.param('id')).fetch('http://room/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders },
      body: JSON.stringify({ senderId: user.id, senderName: user.name || 'Staff', body: body.body }),
    });
    return new Response(res.body, { status: res.status, headers: { 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return c.json({ error: 'Send failed', details: e.message }, 500);
  }
});

// GET /api/teamhub/members — staff profiles for the room roster (Slack-like)
teamHubRouter.get('/members', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  try {
    const staff = await db.select().from(users).all();
    const members = staff.map((u: any) => ({
      id: u.id, name: u.name || u.email, email: u.email,
      role: u.role || 'staff',
      initials: (u.name || u.email || '?').split(' ').map((p: string) => p[0]).join('').slice(0, 2).toUpperCase(),
    }));
    return c.json({ members });
  } catch (e: any) {
    return c.json({ error: 'Members failed', details: e.message }, 500);
  }
});

// POST /api/teamhub/rooms/:id/files — upload a file to R2 + post as attachment message
teamHubRouter.post('/rooms/:id/files', async (c) => {
  if (!c.env?.BUCKET || !c.env?.TEAM_HUB) return c.json({ error: 'File drive not configured' }, 503);
  const user = (c.get('user') as any) || {};
  const roomId = c.req.param('id');
  try {
    const form = await c.req.formData();
    const file = form.get('file') as File | null;
    if (!file) return c.json({ error: 'No file provided' }, 400);
    const MAX = 10 * 1024 * 1024;
    if (file.size > MAX) return c.json({ error: 'File too large (max 10MB)' }, 413);
    const key = `team/${roomId}/${crypto.randomUUID()}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    await c.env.BUCKET.put(key, file.stream(), { httpMetadata: { contentType: file.type || 'application/octet-stream' } });
      await auditEvent(c, { action: 'FILE_UPLOADED', entityName: 'teamhub-files', entityId: key, afterState: { roomId: c.req.param('id'), key }, category: 'access' }).catch(() => {});
    // Post as attachment message
    const res = await roomStub(c.env, roomId).fetch('http://room/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        senderId: user.id, senderName: user.name || 'Staff',
        body: `📎 ${file.name}`,
        file: { key, name: file.name, size: file.size, mime: file.type || 'application/octet-stream' },
      }),
    });
    return new Response(res.body, { status: res.status, headers: { 'Content-Type': 'application/json' } });
  } catch (e: any) {
    return c.json({ error: 'Upload failed', details: e.message }, 500);
  }
});

// GET /api/teamhub/files/:key — download from R2
teamHubRouter.get('/files/:key', async (c) => {
  if (!c.env?.BUCKET) return c.json({ error: 'File drive not configured' }, 503);
  try {
    const key = c.req.param('key');
    // SECURITY: only team-drive keys (team/<room>/...) are servable — the vault
    // bucket also holds client resumes + audit archives. Force octet-stream +
    // nosniff + attachment so uploaded HTML/SVG can never execute inline.
    if (!key.startsWith('team/')) return c.json({ error: 'Forbidden' }, 403);
    const obj = await c.env.BUCKET.get(key);
    if (!obj) return c.json({ error: 'File not found' }, 404);
    const headers = new Headers();
    headers.set('Content-Type', 'application/octet-stream');
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Content-Disposition', `attachment; filename="${String(key.split('/').pop() || 'file').replace(/"/g, '')}"`);
    return new Response(obj.body, { headers });
  } catch (e: any) {
    return c.json({ error: 'Download failed', details: e.message }, 500);
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