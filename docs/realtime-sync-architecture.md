# OpusOS Realtime Sync Fabric — Gold-Standard Architecture

> **Status:** Design v1.0 — 2026-08-22  
> **Scope:** Sync `superadmin+staff` ↔ `client` ↔ `partner` workspaces without a separate server  
> **Constraint:** `TeamHub` stays **internal-only** (superadmin + staff). Public planes get a *new* fabric.  
> **Research:** Cloudflare Durable Objects Hibernation WS API (2026-06-19), DO Best Practices, Multi-tenant channel isolation (Svelte Realtime, Supabase RLS, Genesys/NICE), Praesidia/Bird realtime over WebSocket

---

## 0. Executive Answer

**You do NOT need a separate sync server.**

Add a **`SyncHub` Durable Object fabric** — same primitive as `TeamHubRoom` (`apps/api/src/routes/teamHub.ts:22`) but with **hard tenant isolation per-entity**.

* `TeamHubRoom` = stays internal-only (`rbacMiddleware: super_admin/manager/counselor/coordinator/receptionist`) + HMAC `X-TeamHub-Auth` (lines 28-33, 106-112). Do not open it.
* `SyncHub` = new `DurableObject` class, **per-entity atoms**: `client:{id}`, `departure:{id}`, `partner:{id}`, `staff:division:{key}`. Worker is the only writer (D1 commit → `fetch('/publish')`); browsers are read-only subscribers.

Why not a VPS Node/Redis box (`<internal-ip>` already has 16 services):
- One extra hop, single point of failure, breaks `placement=smart` and 10ms budget
- DO hibernation keeps 1000s of idle WS alive at ~0 GB-s (pays only when JS runs)
- D1 remains sole truth; realtime is fan-out notification only — no split-brain

Gold-standard principle applied: **one DO per coordination atom** (not one global DO) + **Hibernatable WS API** + **tenant-prefixed channels**

---

## 1. Research — What “Gold Standard” Says (2024-2026)

### 1.1 Cloudflare Durable Objects — Sources fetched 2026-08-22
- **Use WebSockets docs + Hibernation WS API**: `ctx.acceptWebSocket(server)` + `webSocketMessage/webSocketClose/webSocketError` handlers; `serializeAttachment/deserializeAttachment` to survive hibernation; `getWebSockets(tag)` for room fan-out; `setWebSocketAutoResponse(ping→pong)` to avoid wake-ups. Std lib `server.accept()` pins GB-s; Hibernation does not.
- **Rules of Durable Objects**: 1 DO per room/user/booking atom, `idFromName()` deterministic routing, SQLite `new_sqlite_classes`, `blockConcurrencyWhile()` only in constructor, RPC over `fetch` for compat≥2024-04-03, persist-then-cache.
- **Seat-booking tutorial**: `Flight` DO holds seats + `broadcastSeats()` over WS — exactly your `group_departures.capacity/bookedSeats` problem.

### 1.2 Multi-Tenant Channel Isolation
- **Real-Time WebSocket Server-Side Routing (2026)**: O(1) `Map` router, `MAX_FRAME_BYTES=64KB`, `WeakMap<WebSocket,ConnContext>`, `namespaced(ctx, channel) = tenantId:channel`, allow-list before lookup, `Promise.resolve(handler).catch()` isolation, token-bucket per `tenant:channel`.
- **Supabase Realtime multi-tenant RLS**: Two surfaces — Postgres Changes RLS vs `realtime.messages` RLS. Private channels `private:true` + topic `tenant:{id}:audit-feed`; silent 202-drop if RLS denies. Lesson: **channel name is the security boundary, derived from handshake identity, never from wire**.
- **Svelte Realtime / Genesys CCaaS**: Shared Redis/BGP pools need explicit per-tenant `channel`/`channelPrefix` ( `keyPrefix` does NOT scope pub/sub). Always `tenantId` from `ctx.user.tenantId` (server-trust).

Applied to OpusOS: `portalToken`, `api_token`, `Better Auth session` → server-trust tenant, then `prefix = staff: / client:{id}: / partner:{id}:`

---

## 2. Topology — How It Fits OpusOS

```
Public Site / Portal / Partner
  │  WSS  (browser, resilient WS, exp backoff, Last-Event-ID)
  ▼
Worker  apps/api/src/index.ts  (/api/sync/*)
  │  validates Upgrade + Auth (session / portalToken / api_token) + rateLimit
  │  idFromName('sync:'+atom) → stub.fetch('/ws')  (or /publish)
  ▼
SyncHub DO  apps/api/src/durable/SyncHub.ts   (Hibernatable WS, SQLite replay window)
  │  ctx.acceptWebSocket(server), serializeAttachment({tenant, userId, channels})
  ▼
D1 opusos-db  (still sole truth — SyncHub never writes business rows, only notification events)
```

- **Writer path:** `POST /api/portal/umrah/departures/:id/book` → `BEGIN; UPDATE group_departures SET bookedSeats; INSERT seatBookings; COMMIT;` → on OK → `stub.publish({channel:'departure:{id}:inventory', event:'INVENTORY_UPDATED'})` — publish fails → still committed (poll fallback), never roll back.
- **Reader path:** Browser `GET /api/sync/ws?channels=departure:{id}:inventory,client:{id}:bookings` → Worker auth → `SyncHub.fetch('/ws')` → 101 + `ctx.getWebSockets()` fan-out.

---

## 3. Channel Naming — The Security Contract

```
Format:  <plane>:<atom>:<topic>    plane derived from handshake, NEVER from wire

Internal (staff-plane, Better Auth session, rbacMiddleware):
  staff:global:alerts
  staff:division:{study-abroad|visa|umrah|attestation|manpower}:pipeline
  staff:client:{clientId}:timeline
  staff:departure:{departureId}:inventory
  staff:partner:{partnerId}:commissions

Public — Client plane (portalToken 128-bit):
  client:{clientId}:bookings
  client:{clientId}:documents
  client:{clientId}:applications
  client:{clientId}:ledger

Public — Partner plane (Bearer api_token):
  partner:{partnerId}:referrals
  partner:{partnerId}:commissions
  partner:{partnerId}:inventory:{departureId}

Shared atom — departure inventory (both staff+public read, only Worker writes):
  departure:{departureId}:inventory
  departure:{departureId}:manifest   → staff-only

Global public catalog (read-only):
  public:catalog:umrah
  public:catalog:jobs
```

**Rule:** `allowedChannelsFor(conn) = f(handshakeIdentity)` — `SUBSCRIBE` with wire `channel` is checked `if (!allowed.has(namespaced)) return ERROR`. No `tenantId` from payload.

---

## 4. Auth per Plane — At Upgrade

| Plane | How to open WSS | Worker checks before acceptWebSocket | DO attachment |
|---|---|---|---|
| Staff | Cookie: better-auth.session_token | rbacMiddleware → c.get('user') exists | {plane:'staff', userId, role} |
| Client | wss://.../api/sync/ws?token=portalToken | Lookup clients.portalToken, status != blocked | {plane:'client', clientId} |
| Partner | Authorization: Bearer <api_token> | Lookup partners.api_token, status=active | {plane:'partner', partnerId} |

All use `crypto.randomUUID()` for `connectionId`, never `Math.random()`. In DO: `server.serializeAttachment({plane, id, channels})` so hibernation wake still knows ACL. Revocation → Worker calls `DO /kick` → DO closes matching `getWebSockets(tag)` with 4401.

---

## 5. Message Envelope — Versioned, Auditable

```ts
type SyncEvent = {
  v: 1;
  id: string;               // crypto.randomUUID()
  channel: string;          // departure:dep_123:inventory
  type: string;             // INVENTORY_UPDATED | BOOKING_CREATED | DOCUMENT_VERIFIED | COMMISSION_MATURED
  payload: unknown;         // minimal diff, PII masked via mask.ts
  ts: number;               // Date.now()
  auditId?: string;
}
```

- Server→Client only. Client→Server frames allowed only `SUBSCRIBE | UNSUBSCRIBE | PING` (allow-list). No `PUBLISH` from browsers.
- Batch: collect up to 50 msgs or 50ms, send one WS frame array.

---

## 6. Publish Flow — D1 Commit Then Fan-Out

D1 transaction → on OK → hub.fetch('/publish') with HMAC(BETTER_AUTH_SECRET, 'sync:'+atom) same pattern as TeamHub doVerify. Publish endpoint dedupes by event.id in SQLite UNIQUE(id).

---

## 7. Subscribe Flow — Hibernation-Aware DO

- Uses `ctx.storage.sql.exec` sync SQLite, `getWebSockets()` for fan-out, `serializeAttachment` for cross-hibernation identity.
- One DO per atom → scales horizontally, no noisy neighbor. Batch 50 msgs / 50ms.
- Replay last 50 events per subscribed channel on connect + `?since={lastTs}` for reconnect gap. If since < retention (24h), fallback to REST GET /api/public/portal/lookup.

---

## 8. Security Hardening Checklist

- [ ] Hibernation API only, MAX_FRAME_BYTES 64KB → close 1009 before parse
- [ ] Allow-list route map O(1) before handler; namespaced(ctx, channel) tenant prefix from handshake
- [ ] Timing-safe crypto.subtle.timingSafeEqual for api_token compares
- [ ] Rate limit per (tenant, channel) token bucket 20/s + 50 burst
- [ ] Zod on every payload shape before publish/subscribe
- [ ] PII scrub in payload via mask.ts
- [ ] auditLog correlation on every publish
- [ ] No client PUBLISH — enforces D1 as truth

---

## 9. What Changes in Repo

wrangler.toml:
```toml
[[durable_objects.bindings]]
name = "SYNC_HUB"
class_name = "SyncHub"
[[migrations]]
tag = "v2"
new_sqlite_classes = ["SyncHub"]
```

No D1 schema migration. Add `src/durable/SyncHub.ts` + `src/routes/sync.ts` + `src/lib/syncHubAuth.ts` + `src/lib/realtimeEnvelope.ts`. Frontend `src/lib/syncClient.ts` with TanStack Query invalidation. Tests `tests/syncHub.test.ts` with cloudflare:test.

---

## 10. Phased Rollout

Phase 0 — This Doc + Config (0.5 day)
Phase 1 — Inventory Live (1-2 days) departure:* live badges
Phase 2 — Bookings & Commissions (2 days) client:* + partner:*
Phase 3 — Documents & Alerts (1 day)
Phase 4 — Hardening & Observability (analyticsEngine, chaos test)

Each phase behind VITE_SYNC_ENABLED=false, keeps REST poll fallback.

---

## References Fetched
- developers.cloudflare.com/durable-objects/best-practices/websockets/ (Hibernation WS API)
- developers.cloudflare.com/durable-objects/best-practices/rules-of-durable-objects/
- developers.cloudflare.com/durable-objects/examples/websocket-hibernation-server/ + tutorials/build-a-seat-booking-app/
- real-time-websocket.com/backend-websocket-connection-management/server-side-routing-patterns/
- praesidia.ai/blog/real-time-events-over-websocket + bird.com/docs/guides/realtime/overview
- svelte-realtime.dev/docs/multi-tenant + supabase/realtime DeepWiki

