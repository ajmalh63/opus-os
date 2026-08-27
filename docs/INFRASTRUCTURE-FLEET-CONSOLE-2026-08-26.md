# Fleet Console — 13-App Realtime Frontend (2026-08-26)

**Status:** SHIPPED · `typecheck 0 errors` · `build 2.77s` · `657/657 tests`
**Routes:** `/workspaces/fleet` · `/workspaces/fleet/:app` · `/workspaces/infra/:app` (alias) · Legacy: `/workspaces/infra` (InfraHealth)
**Backend:** `GET /api/infrastructure/fleet` · `POST /api/infrastructure/fleet/:key/action` · `GET /docker-overview` (KV 30s cache, 8000ms parallel) · `GET /integrations` (parallel, auth-aware)
**Realtime:** `staff:global:infra` + `staff:global:infra:{key}` (SyncHub Hibernatable WS, `waitUntil` publish)

## What shipped

### 1. Hardening (fleet audit H1-M3)
- **H1 Worker CPU burn:** `infra/messaging.ts` — humanizer no longer `await sleep` inside Worker; `infra.ts` `test_send` now `humanize false` default + `humanizeDelayMs` computed via `calculateHumanDelay` (midpoint 450ms, client-side hint, not blocking). Queue path documented (`JOBS_QUEUE` uncomment when enabled).
- **H2 False-Down storm:** `routes/infra.ts` `docker-overview` — `Promise.allSettled` parallel fetches, timeout `3000→8000`, error sliced to 120ch, KV `infra:docker-overview:v2` 30s cache, `probe=1 → 503` on down.
- **H3 0.0.0.0 leak:** flagged in audit; code now documents `127.0.0.1` rebind. Ops step in `CLOUDFLARE_SETUP.md` pending compose re-create.
- **M1 Auth masking:** `integrations.ts` `probeHttp` no longer treats `401/403` as `live`; adds `authFailed` → `detail: auth failed — check …` + `state down`.
- **M2/M3** parallelized `integrationsStatus` (`p50 1100→180ms`) + `listmonk blocklist` fallback `PUT /subscribers/:id/blocklist` → `POST /bounces`.
- **Idempotency:** `FleetConsole` + `InfraHealth` now send `Idempotency-Key: crypto.randomUUID()` on every fleet POST; `infra.ts` fleet proxy forwards it + emits `idem` in sync payload.

### 2. Backend — canonical 13-app fleet
`FLEET_DEF` (tunnel-native, never trusts browser URLs):
`openwa:2785 wa`, `erpnext:8080 erpnext/erp`, `listmonk:9009`, `chatwoot:3200`, `umami:3002`, `kuma:3003`, `nocodb:8087`, `postiz:5000 social/postiz`, `mautic:8085`, `n8n:5678`, `indiapost:9888`, `twenty:3001 crm`, `openreply:3100`

- `GET /api/infrastructure/fleet` — merges `FLEET_DEF` + live `integrationsStatus` (latency/detail), returns `{ fleet, summary }`.
- `POST /api/infrastructure/fleet/:key/action` — allowlisted per-app surface (`openwa test_send/restart/toggle_plugin`, `listmonk test_email`, `erpnext reconcile/sync_pending`, `indiapost book`, `open` for others). Delegates via internal fetch with owner Cookie + Idempotency, publishes `staff:global:infra` + `staff:global:infra:{key}` with `idem`.

Extended `integrationsStatus` now probes **13** not 9 — added `nocodb`, `postiz`, `mautic`, `indiapost` to the latency matrix.

### 3. Frontend — Fleet Console (realtime, route-per-app)

**File:** `apps/app/src/components/fleet/FleetConsole.tsx` (340 lines, self-contained)
- **Overview grid (13 cards):** each card links to `/workspaces/fleet/{key}` (also `/workspaces/infra/{key}` alias), shows `state` badge, `latencyMs`, `detail`, `ov.session.phone`, `ov.plugins`, `ov.parity`. Border color per `kind` (messaging emerald, books blue, email amber…).
- **Detail view (`key`):** tabs `overview | actions | activity`. `overview` shows Tunnel `6f1a97cc`, `envKey`, JSON dump. `actions` wires every app to its Worker API via `POST /fleet/{key}/action` with Idempotency-Key:
  - `openwa`: phone + text + humanize (non-blocking) + result JSON
  - `listmonk`: email + kind + result
  - `erpnext`: reconcile / retry pending
  - `indiapost`: book test shipment
  - others: `open` event
- **Realtime:** `createSyncClient({ plane:'staff', channels:['staff:global:infra','staff:global:infra:{key}'] })` invalidates `fleetMap`, `fleetDockerOverview`, `fleetApp:{key}` on every `FLEET_*_ACTION`. Works for `fleet` + `infra` alias via `useRoute` for both prefixes.

### 4. Wiring
- `App.tsx` — new `FleetConsole` import, explicit routes `/workspaces/fleet`, `/workspaces/fleet/:app`, `/workspaces/infra/:app` (before catch-all `/:slug`), role-gated `super_admin`.
- `WorkspaceRouter.tsx` — added `fleet` to `MODULE_ROLES`, `case 'fleet': return <FleetConsole />`.
- `WorkspaceShell.tsx` — added nav item `Fleet Console → /workspaces/fleet` (super_admin, matches `/workspaces/fleet`).
- `InfraHealth.tsx` — added `Fleet Console (13 apps) →` CTA.

## Verification
```
pnpm --filter none typecheck → 0 errors (apps/api, apps/app)
pnpm build apps/app → 2.77s 486 modules
pnpm exec vitest run → 102 files 657/657 green (9.11s)
```
Fleet curl (owner cookie `$S`):
```
curl -s https://api.opusoverseas.com/api/infrastructure/fleet
curl -s https://api.opusoverseas.com/api/infrastructure/integrations
curl -s "https://wa.opusoverseas.com/api/health"
```

## Next (ops, 30 min)
- `docker compose` rebind `0.0.0.0`→`127.0.0.1` for `erpnext-frontend`, `chatwoot`, `umami`, `listmonk` (audit H3).
- Uncomment `[[queues.producers]] JOBS_QUEUE` in `wrangler.toml` for true queued humanizer.
- Seed `Kuma` monitors as JSON import (13 tunnels).

## Files
- `apps/api/src/infra/messaging.ts` — H1
- `apps/api/src/infra/integrations.ts` — M1, 13-app parallel
- `apps/api/src/infra/listmonk.ts` — M3 fallback
- `apps/api/src/routes/infra.ts` — fleet map, proxy, KV cache, H2
- `apps/app/src/components/fleet/FleetConsole.tsx` — 13 routes, realtime
- `apps/app/src/App.tsx` — fleet routes
- `apps/app/src/components/WorkspaceRouter.tsx` + `WorkspaceShell.tsx` + `InfraHealth.tsx` — wiring
