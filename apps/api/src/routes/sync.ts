import { Hono } from 'hono';
import { getDb } from '../db/client.js';
import { clients, partners } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { syncHubAuthHeaders } from '../lib/syncHubAuth.js';
import type { OpusEnv } from '../types.js';

// Sync Fabric — Worker-side WebSocket upgrade + publish proxy
// TeamHub stays internal-only (rbacMiddleware: staff). This fabric is the public-safe bus for staff/client/partner.
// Gold standard: auth at upgrade, channel allowlist from handshake identity, Hibernatable WS in DO, batch+replay.

export const syncRouter = new Hono<{ Bindings: OpusEnv; Variables: { user: any } }>();

// Helper: resolve identity from request (in order: staff session → client token → partner api_token)
async function resolveIdentity(c: any): Promise<{ plane:'staff'|'client'|'partner', tenantId:string, channels:string[], role?:string, divisions?:string[] } | null> {
  const url = new URL(c.req.url);
  const channels = (url.searchParams.get('channels') || c.req.query('channels') || '').split(',').map((s:string)=>s.trim()).filter(Boolean).slice(0,20);

  // 1) Staff — Better Auth session already set by rbac where applicable, but /api/sync is public upgrade so check directly
  const user = c.get('user');
  if (user?.id) {
    return { plane:'staff', tenantId: user.id, channels, role: user.role, divisions: user.divisions || [] };
  }
  // Try to read session via Better Auth if not already in context (fallback)
  // We keep it simple: if Authorization: Bearer or Cookie present and user not set, we attempt to load via auth.ts helpers
  // For now rely on rbac mount for staff — staff WS should go via /api/sync/ws with session cookie, worker will see user

  // 2) Client — ?token=portalToken
  const token = url.searchParams.get('token') || url.searchParams.get('portalToken');
  if (token) {
    if (!c.env?.DB) return null;
    const db = getDb(c.env.DB);
    const row = await db.select().from(clients).where(eq(clients.portalToken, token)).get();
    if (!row || row.status === 'blocked') return null;
    return { plane:'client', tenantId: row.id, channels };
  }

  // 3) Partner — Authorization: Bearer <api_token>
  const auth = c.req.header('authorization') || c.req.header('Authorization');
  if (auth?.startsWith('Bearer ')) {
    const t = auth.slice(7).trim();
    if (t && c.env?.DB) {
      const db = getDb(c.env.DB);
      const row = await db.select().from(partners).where(eq(partners.apiToken, t)).get();
      if (!row || row.status === 'blocked') return null;
      return { plane:'partner', tenantId: row.id, channels };
    }
  }

  return null;
}

function isAllowedChannel(plane:'staff'|'client'|'partner', tenantId:string, ch:string): boolean {
  if (plane==='staff') return ch.startsWith('staff:') || ch.startsWith('departure:') || ch.startsWith('public:');
  if (plane==='client') return ch.startsWith(`client:${tenantId}:`) || ch.startsWith('departure:') || ch.startsWith('public:');
  if (plane==='partner') return ch.startsWith(`partner:${tenantId}:`) || ch.startsWith('departure:') || ch.startsWith('public:');
  return false;
}

// GET /api/sync/ws — Upgrade to WebSocket (public, but authenticated)
syncRouter.get('/ws', async (c) => {
  const upgrade = c.req.header('upgrade');
  if (upgrade !== 'websocket') return c.json({ error: 'Expected websocket' }, 400);
  if (!c.env?.SYNC_HUB) return c.json({ error: 'Sync not configured (SYNC_HUB binding)' }, 503);

  const identity = await resolveIdentity(c);
  if (!identity) return c.json({ error: 'unauthorized — staff session, client token, or partner Bearer required' }, 401);

  // Channel allowlist — must derive from handshake identity, never trust wire alone
  for (const ch of identity.channels) {
    if (!isAllowedChannel(identity.plane, identity.tenantId, ch)) {
      return c.json({ error: 'forbidden channel', channel: ch }, 403);
    }
  }
  if (identity.channels.length === 0) {
    return c.json({ error: 'channels required (?channels=departure:dep_123:inventory,client:xxx:bookings)' }, 400);
  }
  if (identity.plane !== 'staff' && identity.channels.length > 5) {
    return c.json({ error: 'too many channels (max 5 for public)' }, 400);
  }

  // Route to global hub for v1 (shard later to per-entity if >1K rps)
  const atom = 'global'; // v1 global; v2: `sync:client-${tenantId}` etc. — see docs/realtime-sync-architecture.md
  const hubAuth = await syncHubAuthHeaders(c.env as any, atom);
  const since = c.req.query('since') || '0';

  const url = new URL(c.req.url);
  const hubUrl = `http://hub/ws?atom=${encodeURIComponent(atom)}&plane=${identity.plane}&tenantId=${encodeURIComponent(identity.tenantId)}&channels=${encodeURIComponent(identity.channels.join(','))}&since=${encodeURIComponent(since)}`;

  const stub = (c.env.SYNC_HUB as any).idFromName(`sync:${atom}`);
  const hub = (c.env.SYNC_HUB as any).get(stub);
  // Forward Upgrade request with HMAC
  const headers = new Headers();
  headers.set('Upgrade', 'websocket');
  headers.set('X-SyncHub-Auth', hubAuth['X-SyncHub-Auth']);
  // Forward original headers needed for DO to trust
  const req = new Request(hubUrl, { headers });

  return hub.fetch(req);
});

// POST /api/sync/publish — internal only (Worker → Hub). Public callers cannot publish.
syncRouter.post('/publish', async (c) => {
  if (!c.env?.SYNC_HUB) return c.json({ error: 'Sync not configured' }, 503);
  // This endpoint is not mounted publicly without HMAC — but double-check caller is Worker
  // Expect X-SyncHub-Auth header from internal publish helper (publishSyncEvent)
  const provided = c.req.header('X-SyncHub-Auth') || '';
  // We use atom=global for v1, so verify against global
  const { verifySyncHubAuth } = await import('../lib/syncHubAuth.js');
  const ok = await verifySyncHubAuth(c.env as any, 'global', provided);
  if (!ok) return c.json({ error: 'unauthorized publish' }, 401);

  let body: any;
  try { body = await c.req.json(); } catch { return c.json({ error:'invalid json'},400); }
  const atom = 'global';
  const hubAuth = await syncHubAuthHeaders(c.env as any, atom);
  const stub = (c.env.SYNC_HUB as any).idFromName(`sync:${atom}`);
  const hub = (c.env.SYNC_HUB as any).get(stub);
  const res = await hub.fetch(`http://hub/publish?atom=${atom}`, {
    method:'POST',
    headers: { 'Content-Type':'application/json', ...hubAuth },
    body: JSON.stringify(body),
  });
  return new Response(res.body, { status: res.status, headers: { 'Content-Type':'application/json'} });
});

// GET /api/sync/meta — public health
syncRouter.get('/meta', async (c) => {
  if (!c.env?.SYNC_HUB) return c.json({ error:'Sync not configured'},503);
  const atom='global';
  const hubAuth = await syncHubAuthHeaders(c.env as any, atom);
  const stub = (c.env.SYNC_HUB as any).idFromName(`sync:${atom}`);
  const hub = (c.env.SYNC_HUB as any).get(stub);
  const res = await hub.fetch(`http://hub/meta?atom=${atom}`, { headers: hubAuth });
  return new Response(res.body, { status: res.status, headers:{ "Content-Type":"application/json"}});
});

// Helper for other routes: publish after D1 commit (fire-and-forget via waitUntil)
export async function publishSyncEvent(env: OpusEnv, event: { channel:string, type:string, payload:any, auditId?:string }, ctx?: ExecutionContext) {
  if (!env?.SYNC_HUB || !env?.BETTER_AUTH_SECRET) return;
  const full = {
    v: 1,
    id: crypto.randomUUID(),
    channel: event.channel,
    type: event.type,
    payload: event.payload,
    ts: Date.now(),
    ...(event.auditId ? { auditId: event.auditId } : {}),
  };
  const atom='global';
  const { syncHubAuthHeaders: h } = await import('../lib/syncHubAuth.js');
  const headers = await h(env as any, atom);
  const stub = (env.SYNC_HUB as any).idFromName(`sync:${atom}`);
  const hub = (env.SYNC_HUB as any).get(stub);
  const p = hub.fetch(`http://hub/publish?atom=${atom}`, {
    method:'POST',
    headers: { 'Content-Type':'application/json', ...headers },
    body: JSON.stringify(full),
  }).catch(()=>{});
  if (ctx?.waitUntil) ctx.waitUntil(p); else await p;
}
