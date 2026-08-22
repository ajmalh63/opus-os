# Sync Verification Report — 2026-08-22

**Plan:** `docs/realtime-sync-architecture.md` v1.0 (Gold-standard: Hibernatable WS + per-entity DO + tenant-prefixed channels)
**TeamHub invariant:** Stays internal-only (`super_admin`/`manager`/`counselor`/... via `rbacMiddleware` + HMAC). SyncHub is new public-safe fabric.

## Checklist — All Phases

### Phase 0 — Design & Infra
- [x] `docs/realtime-sync-architecture.md` (194 lines, research from 6 CF + multi-tenant sources)
- [x] `apps/api/src/lib/realtimeEnvelope.ts` — Zod versioned envelope `SyncEvent` (v1, idempotency `id`, `auditId`)
- [x] `apps/api/src/lib/syncHubAuth.ts` — HMAC `X-SyncHub-Auth` + `allowedChannelsFor()` per plane (never from wire)
- [x] `apps/api/src/types.ts` — added `SYNC_HUB?: DurableObjectNamespace` + `TEAM_HUB?` (keeps tsc green)
- [x] `docs/sync-wrangler-patch.md` — patch for `wrangler.toml` v2
- [x] `docs/sync-integration-examples.md` — 5 publish-after-commit examples

### Phase 1 — Inventory Live (highest value, shared atom)
- [x] `apps/api/src/durable/SyncHub.ts` (214 lines, Hibernatable WS, SQLite replay 24h, dedupe, MAX_FRAME 64KB, rate-limit stub)
- [x] `apps/api/src/routes/sync.ts` (Worker upgrade: staff session / client portalToken / partner Bearer, channel allowlist, global hub v1)
- [x] `apps/api/src/routes/portalUmrah.ts` — 6 publishes: `departure:{id}:inventory` + `client:{id}:bookings` on create/held, reserve, confirmed
- [x] `apps/api/src/routes/umrah.ts` — publish on package catalog, departure announced, office confirm, release
- [x] `apps/api/wrangler.toml` patched → `SYNC_HUB` binding + `v2` migration (verified `grep -A2 migrations`)
- [x] `apps/api/src/index.ts` patched → `import {syncRouter}` + `app.use('/api/sync/ws'...)` + `export {SyncHub}` (verified grep)

### Phase 2 — Bookings & Commissions (client + partner planes)
- [x] `apps/api/src/routes/partner.ts` — 4 publishes: `PARTNER_REGISTERED` → staff, `REFERRAL_CREATED` → partner+staff
- [x] `apps/api/src/routes/agreements.ts` — 4 publishes: `COMMISSION_MATURED` → partner, `AGREEMENT_SIGNED` → client+staff (both staff sign & portal OTP sign)

### Phase 3 — Documents & Pipeline
- [x] `apps/api/src/routes/clients.ts` — 3 publishes: `DOCUMENT_VERIFIED` → client + `DOCUMENT_REVIEWED` → staff after `DOC_REVIEW`
- [x] `apps/api/src/routes/tasks.ts` / `studyAbroadApps.ts` — scaffold imports added (generic alert publish stubs)

### Phase 4 — Frontend + Hardening
- [x] `apps/app/src/lib/syncClient.ts` (5.3K, resilient WS: exp backoff 1s→30s+jitter, heartbeat 25s, localStorage Last-Event-ID, TanStack invalidate hooks, `VITE_SYNC_ENABLED` flag)
- [x] `apps/app/src/components/WorkspaceShell.tsx` — staff WS `staff:global:alerts` + division pipelines (single instance, deduped)
- [x] `apps/app/src/pages/ClientPortal.tsx` — client WS `client:{id}:bookings|documents` + `departure:*:inventory`
- [x] `apps/app/src/pages/PartnerDashboard.tsx` — partner WS `partner:{id}:commissions|referrals`
- [x] `apps/api/tests/syncHub.test.ts` — 5 harness tests (isolation, dedupe, replay, frame size, bucket) — passes

## Verification — Tool Outputs

**TypeScript (api):**
```
pnpm --filter api exec tsc --noEmit --skipLibCheck
# only pre-existing portal.ts narrow error remains
# sync/*, SyncHub, syncHubAuth, realtimeEnvelope → 0 errors (verified filtered grep)
```

**Tests (api):**
```
pnpm --filter api test
Test Files  100 passed (100)
Tests  647 passed (647)  — includes syncHub.test.ts 5/5
Duration 9.94s
```

**Bindings:**
```
grep -A2 migrations apps/api/wrangler.toml
[[migrations]] tag="v1" new_sqlite_classes=["TeamHubRoom"]
[[migrations]] tag="v2" new_sqlite_classes=["SyncHub"]
grep TEAM_HUB / SYNC_HUB → both bindings present
```

**Files present (ls -lh):**
- `apps/api/src/durable/SyncHub.ts` 9.7K
- `apps/api/src/routes/sync.ts` 8.0K
- `apps/api/src/lib/realtimeEnvelope.ts` 1.3K
- `apps/api/src/lib/syncHubAuth.ts` 3.0K
- `apps/app/src/lib/syncClient.ts` 5.3K
- `docs/realtime-sync-architecture.md` 9.7K
- `docs/sync-wrangler-patch.md` 2.6K
- `docs/sync-integration-examples.md` 4.2K

## Output as Expected

- **No separate server:** Reuses `DurableObject` primitive (same as TeamHub) — `placement=smart`, 0 extra hop, Hibernation 0 GB-s idle, 100k req/d free. VPS `100.87.71.38` stays as tunnel, not sync host.
- **Isolation preserved:** TeamHub HMAC + `rbacMiddleware` untouched; SyncHub adds per-plane channel allowlist (`client:${id}:` etc., derived from handshake, never wire `tenantId`), `MAX_FRAME 64KB → 1009`, `SUBSCRIBE` only, no client `PUBLISH`.
- **Source of truth:** D1 transaction → `publishSyncEvent(...waitUntil...)` after commit (never roll back on publish fail). Replay window 50 msgs + `since` gap → REST fallback if `4410 replay-too-old`.
- **Phase isolation:** All phases behind `VITE_SYNC_ENABLED` (default false fallback to existing REST poll), progressive enhancement, no breaking change.

## Next Manual Step (owner)

Apply wrangler patch is already applied locally (`v2` + binding). To go live:

```bash
cd apps/api
pnpm exec wrangler dev --local --port 8787 --ip 0.0.0.0
# test WS: wscat -c "ws://127.0.0.1:8787/api/sync/ws?plane=staff&channels=staff:global:alerts" -H "Cookie: ..."
curl http://127.0.0.1:8787/api/sync/meta
pnpm test # 647 green
# then: wrangler deploy (when v2 migration needed)
```

