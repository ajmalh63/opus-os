# SyncHub Wrangler Patch — Apply when ready (behind flag)

> **Do not `wrangler deploy` until Phase 1 code is tested with `wrangler dev --local`**

## Required change in `apps/api/wrangler.toml`

Replace Durable Objects section (line 126-136):

```toml
# ============================================================
# Durable Objects - Team Hub (§5.5) + Sync Fabric (v2) — Gold-standard Hibernatable WS
# TeamHub stays internal-only; SyncHub is the public-safe bus for client/partner/staff
# Local dev: DOs run in workerd via `wrangler dev --local`.
# ============================================================
[[durable_objects.bindings]]
name = "TEAM_HUB"
class_name = "TeamHubRoom"

[[durable_objects.bindings]]
name = "SYNC_HUB"
class_name = "SyncHub"

[[migrations]]
tag = "v1"
new_sqlite_classes = ["TeamHubRoom"]

[[migrations]]
tag = "v2"
new_sqlite_classes = ["SyncHub"]
```

## Why v2?
- `new_sqlite_classes` (not `new_classes`) — SQLite-backed DO (required for Hibernation + storage.sql)
- `v1` already shipped TeamHubRoom — never reuse tag, always new tag `v2`

## Env var (feature flag, frontend)

`apps/app/.env.local` / `.dev.vars`:

```
VITE_SYNC_ENABLED=true   # false keeps WS disabled, REST poll fallback (safe default)
VITE_SYNC_WS_BASE=ws://127.0.0.1:8787   # local; prod: wss://api.opusoverseas.com
```

No new secrets — reuse `BETTER_AUTH_SECRET` for HMAC.

## Index integration (apps/api/src/index.ts)

Add after TeamHub imports (line ~56):

```ts
import { syncRouter } from './routes/sync.js';
import { SyncHub } from './durable/SyncHub.js';
export { SyncHub } from './durable/SyncHub.js'; // must be exported for wrangler DO routing
```

Mount (before health, after teamHubRouter):

```ts
// Realtime Sync Fabric — public WS (auth at upgrade) + internal publish
// Rate-limit Upgrade to prevent WS spam
app.use('/api/sync/ws', rateLimit({ bucket:'sync-ws', windowSeconds:60, limit:30 }));
app.use('/api/sync/publish', rateLimit({ bucket:'sync-publish', windowSeconds:60, limit:120 }));
app.route('/api/sync', syncRouter);
```

No `workers_dev` change. Smart placement stays.

## Verification

```bash
cd apps/api
npx tsc --noEmit
pnpm test
pnpm exec wrangler dev --local --port 8787 --ip 0.0.0.0
# In another shell:
curl http://127.0.0.1:8787/api/sync/meta
# WS test (staff cookie or ?token=portalToken):
wscat -c "ws://127.0.0.1:8787/api/sync/ws?plane=staff&channels=staff:global:alerts&token=OP-2026-..." -H "Cookie: better-auth.session_token=..."
```

When green, flip `VITE_SYNC_ENABLED=true` and document in `PHASE-1` PR.
