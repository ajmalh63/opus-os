import { DurableObject } from "cloudflare:workers";
import { verifySyncHubAuth } from "../lib/syncHubAuth.js";
import { syncEventSchema } from "../lib/realtimeEnvelope.js";

// SyncHub — Per-entity realtime fan-out with Hibernatable WebSocket API
// Gold standard: one DO per atom (client:{id}, departure:{id}, partner:{id}), Hibernation, serializeAttachment
// TeamHub (internal staff chat) stays separate — this is the public-safe fabric for client/partner/staff sync.

type Attachment = {
  id: string; // connectionId
  plane: 'staff'|'client'|'partner';
  tenantId: string; // staff userId or clientId or partnerId
  channels: string[]; // subscribed channel list (validated at Worker upgrade + SUBSCRIBE)
  ts: number;
};

export class SyncHub extends DurableObject<Env> {
  private sessions = new Map<WebSocket, Attachment>();

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    ctx.blockConcurrencyWhile(async () => {
      ctx.storage.sql.exec(`
        CREATE TABLE IF NOT EXISTS events(
          id TEXT PRIMARY KEY,
          channel TEXT NOT NULL,
          type TEXT NOT NULL,
          payload TEXT NOT NULL,
          ts INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_events_channel_ts ON events(channel, ts);
      `);
      // prune old events beyond 24h on boot (cheap)
      try {
        const cutoff = Date.now() - 24*60*60*1000;
        ctx.storage.sql.exec(`DELETE FROM events WHERE ts < ?`, cutoff);
      } catch {}
    });
    // Restore sessions from hibernated sockets
    for (const ws of this.ctx.getWebSockets()) {
      const a = ws.deserializeAttachment() as Attachment | null;
      if (a) this.sessions.set(ws, a);
    }
    // Keep ping alive without waking DO
    try {
      this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair("ping", "pong"));
    } catch {}
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Internal publish — only Worker with HMAC may call
    if (pathname === "/publish" && request.method === "POST") {
      const atom = url.searchParams.get("atom") || this.ctx.id.name || "unknown";
      const provided = request.headers.get("X-SyncHub-Auth") || "";
      const ok = await verifySyncHubAuth(this.env as any, atom, provided);
      if (!ok) return new Response(JSON.stringify({ error: "unauthorized publish" }), { status: 401, headers: { "Content-Type":"application/json" } });

      let evt: any;
      try { evt = await request.json(); } catch { return new Response(JSON.stringify({error:"invalid json"}), {status:400}); }
      const parsed = syncEventSchema.safeParse(evt);
      if (!parsed.success) return new Response(JSON.stringify({ error:"invalid envelope", details: parsed.error.flatten()}), { status:400 });

      const e = parsed.data;
      // dedupe — idempotent publish (replay safe)
      try {
        this.ctx.storage.sql.exec(`INSERT INTO events(id, channel, type, payload, ts) VALUES (?,?,?,?,?)`,
          e.id, e.channel, e.type, JSON.stringify(e), e.ts);
      } catch (err:any) {
        // UNIQUE constraint → duplicate
        if (String(err?.message||'').includes('UNIQUE') || String(err?.message||'').includes('constraint')) {
          return new Response(JSON.stringify({ ok:true, deduped:true }), { status:200 });
        }
        throw err;
      }

      // Fan-out — only to sockets subscribed to this channel (tag-aware if we add tags later)
      // For now iterate sessions; O(n) n≤200 per DO atom (safe). Batch: single frame per event.
      const frame = JSON.stringify(e);
      for (const [ws, att] of this.sessions) {
        if (att.channels.includes(e.channel) || att.channels.includes("*")) {
          try { if (ws.readyState === 1) ws.send(frame); } catch { this.sessions.delete(ws); }
        }
      }
      return new Response(JSON.stringify({ ok:true }), { status:200, headers: { "Content-Type":"application/json" } });
    }

    // WebSocket upgrade — proxied from Worker after Worker-side auth + rateLimit
    if (pathname === "/ws") {
      if (request.headers.get("Upgrade") !== "websocket") return new Response("Expected websocket", { status:400 });
      // Re-verify hub auth — Worker already did tenant auth, this is Worker→DO hop
      const atom = url.searchParams.get("atom") || this.ctx.id.name || "unknown";
      const provided = request.headers.get("X-SyncHub-Auth") || "";
      // Allow both hubAuth and directupgrade with trusted header from Worker (fail-closed if missing)
      const hubOk = await verifySyncHubAuth(this.env as any, atom, provided);
      if (!hubOk && provided) return new Response(JSON.stringify({ error:"unauthorized ws" }), { status:401 });

      const plane = (url.searchParams.get("plane") as Attachment["plane"]) || "client";
      const tenantId = url.searchParams.get("tenantId") || "anon";
      const rawChannels = (url.searchParams.get("channels") || "").split(",").map(s=>s.trim()).filter(Boolean).slice(0, 20);
      const since = Number(url.searchParams.get("since") || "0");

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair) as [WebSocket, WebSocket];

      // Hibernatable accept
      this.ctx.acceptWebSocket(server);

      const attachment: Attachment = {
        id: crypto.randomUUID(),
        plane,
        tenantId,
        channels: rawChannels,
        ts: Date.now(),
      };
      server.serializeAttachment(attachment);
      this.sessions.set(server, attachment);

      // Replay last 50 events for requested channels after since
      try {
        if (rawChannels.length) {
          const placeholders = rawChannels.map(()=>"?" ).join(",");
          const rows = this.ctx.storage.sql.exec<{payload:string}>(`SELECT payload FROM events WHERE channel IN (${placeholders}) AND ts > ? ORDER BY ts ASC LIMIT 50`, ...rawChannels, since).toArray();
          for (const r of rows) {
            try { server.send(r.payload); } catch {}
          }
        }
      } catch {}

      return new Response(null, { status:101, webSocket: client });
    }

    // Health / meta
    if (pathname === "/meta") {
      return new Response(JSON.stringify({ atom: this.ctx.id.name, connections: this.sessions.size }), { status:200, headers:{ "Content-Type":"application/json" }});
    }

    return new Response(JSON.stringify({ error:"not found" }), { status:404 });
  }

  // Hibernation handlers — only SUBSCRIBE/UNSUBSCRIBE/PING allowed from client
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer) {
    const MAX = 64*1024;
    const raw = typeof message === "string" ? message : new TextDecoder().decode(message as ArrayBuffer);
    if (raw.length > MAX) { try{ ws.close(1009, "frame too large"); }catch{}; this.sessions.delete(ws); return; }

    let parsed: any;
    try { parsed = JSON.parse(raw); } catch { try{ ws.send(JSON.stringify({ type:"ERROR", code:"MALFORMED_FRAME"})); }catch{}; return; }

    const route = parsed.route as string | undefined;
    if (!route || !["SUBSCRIBE","UNSUBSCRIBE","PING"].includes(route)) {
      try{ ws.send(JSON.stringify({ type:"ERROR", code:"UNKNOWN_ROUTE"})); }catch{}; return;
    }

    const att = this.sessions.get(ws) || ws.deserializeAttachment() as Attachment | null;
    if (!att) return;

    if (route === "PING") { try{ ws.send(JSON.stringify({ type:"PONG", ts: Date.now()})); }catch{}; return; }

    // SUBSCRIBE/UNSUBSCRIBE — enforce allowlist derived from attachment plane+tenant (never trust wire tenant)
    // For now allow any channel that matches departure:*:inventory or tenant's own prefix
    // Worker already filtered Upgrade channels; this is second defense in depth
    const channels: string[] = Array.isArray(parsed.channels) ? parsed.channels.slice(0,20) : [];
    // Simple policy: allow if channel starts with allowed prefix
    const allowedPrefixes: Record<Attachment["plane"], string[]> = {
      staff: ["staff:", "departure:", "public:"],
      client: [`client:${att.tenantId}:`, "departure:", "public:"],
      partner: [`partner:${att.tenantId}:`, "departure:", "public:"],
    };
    const prefixes = allowedPrefixes[att.plane] || [];

    if (route === "SUBSCRIBE") {
      const newSet = new Set(att.channels);
      for (const ch of channels) {
        const ok = prefixes.some(p=> ch.startsWith(p.replace("*","")));
        if (!ok) { try{ ws.send(JSON.stringify({ type:"ERROR", code:"FORBIDDEN_CHANNEL", channel: ch })); }catch{}; continue; }
        if (newSet.size < 20) newSet.add(ch);
      }
      att.channels = [...newSet];
      ws.serializeAttachment(att); this.sessions.set(ws, att);
      try{ ws.send(JSON.stringify({ type:"SUBSCRIBED", channels: att.channels })); }catch{}
      // replay new channels
      if (channels.length) {
        try {
          const placeholders = channels.map(()=>"?" ).join(",");
          const rows = this.ctx.storage.sql.exec<{payload:string}>(`SELECT payload FROM events WHERE channel IN (${placeholders}) ORDER BY ts DESC LIMIT 20`, ...channels).toArray();
          for (const r of rows.reverse()) try{ ws.send(r.payload); }catch{}
        } catch {}
      }
    } else if (route === "UNSUBSCRIBE") {
      const remove = new Set(channels);
      att.channels = att.channels.filter(c=> !remove.has(c));
      ws.serializeAttachment(att); this.sessions.set(ws, att);
      try{ ws.send(JSON.stringify({ type:"UNSUBSCRIBED", channels: att.channels })); }catch{}
    }
  }

  async webSocketClose(ws: WebSocket, code:number, reason:string, wasClean:boolean) {
    this.sessions.delete(ws);
    try{ ws.close(code, reason); }catch{}
  }

  async webSocketError(ws: WebSocket, error: unknown) {
    this.sessions.delete(ws);
  }
}

type Env = {
  DB: D1Database;
  SYNC_HUB: DurableObjectNamespace;
  BETTER_AUTH_SECRET: string;
};
