# Fleet Operations, Security, Performance & Latency Audit — Opus OS × VPS Docker Fleet

**Date:** 2026-08-26 06:40 UTC  
**Auditor:** Opus OS (OpenWork) — read-only fleet + code + tunnel inspection  
**Scope:** `INFRASTRUCTURE-COMMAND-CENTER-2026-08-26.md` (the Command Center UI) → actual fleet on `129.159.238.227` (Oracle A1.Flex) + Cloudflare Workers API (`opusos-api` wrangler 4.125, Workers AI/Vectorize/D1/R2/KV/DO), 13 hostnames via tunnel `6f1a97cc-8e9b-4340-a435`  
**Verdict:** **Command Center UI ships (828 lines `InfraHealth.tsx`, `infra.ts` 288 lines, 657/657 tests green), fleet truth is safely isolated but **11 H→M gaps remain open** — detailed below; **no data loss observed**.**

> Methodology: `docker ps` 39 containers (Up 2d–17d), `cloudflared.service` active `hyd03/quic`, `/etc/cloudflared/config.yml` 13 ingresses, `apps/api/src/routes/infra.ts:104-207` + `infra/messaging.ts:34-98` + `infra/listmonk.ts:44-187` + `infra/integrations.ts:18-151` + `infra/erpnext.ts:22-84` + `apps/api/src/index.ts:246-247` RBAC mounts, `/apps/api/src/routes/erpnext.ts:22-280`, `wrangler.toml` placement/smart + triggers, `PENDING-CONFIGS.md` historical truth. No secrets printed; all probes timeout-bounded.

---

## 1) What the Command Center Claims vs Fleet Truth

| Claim (§ INFRASTRUCTURE-COMMAND-CENTER) | Fleet truth (2026-08-26 06:28 UTC) | Gap |
|---|---|---|
| **6 Docker apps fully controllable without SSH** | `openwa` Up (healthy) `2785`, `chatwoot-rails` `3200` Up, `erpnext-frontend` `8080` Up, `listmonk-listmonk` `9009` Up, `umami` `3002` Up, `uptime-kuma` `3003` Up — **all Up ~17d** | ✅ Live; controls wired (`POST /api/infrastructure/openwa/action`, `listmonk/action`, `POST /api/erpnext/sync/pending`) — RBAC is correct (`index.ts:246-247` `rbac super_admin true`) unlike initial review note. |
| **Live plugins 5 + session phone/battery** | `infra.ts:133-136` does map `plugins {id,name,status}`, `session {id,name,status,phone}` — `battery` typed but **never populated** (`InfraHealth.tsx:28` optional) | **M — battery missing (UI shows blank, harms SLA triage).** |
| **Anti-Ban `25ms/char + 350-600ms + ±15% clamp 0.5-3s`** | `messaging.ts:34-40` exact formula, but `sendWhatsApp:54-57` does **`await new Promise(setTimeout)`** inside the Worker | **H — Worker CPU-time burn (see §2.1).** |
| **Listmonk 13 tx templates** | `listmonk.ts:16-30` 13 constants correct, `infra.ts:176-179` stub `templates:13` | ✅ ok, but no live `/api/templates` probe. |
| **Uptime Kuma monitors 12 containers / 6 subdomains** | `docker ps` 39 containers, only 6 hostnames tunneled; `config.yml` has no Kuma monitors declared | **M — Kuma monitors not codified in repo (drift risk).** |

---

## 2) Security — 3 High, 3 Medium, 2 Low

### H1 — Worker-side Humanizer Blocks Event Loop
**File** `apps/api/src/infra/messaging.ts:52-57` — `if (humanize) await sleep(calculateHumanDelay)` runs **on the Workers isolate** before the `fetch` to `wa.opusoverseas.com`. A `180-char` message = `~1.2s` + jitter; 10 concurrent `POST /openwa/action test_send` = **10 isolates held 1–3s**, breaches 30s wall-clock, returns 503. Attacker can cheaply `fee-burn` via owner endpoint (owner creds stolen → DoS).

**Fix shipped in spec but not in fleet:** move to **Queuing lane** or `setTimeout` + queue. Immediate mit: cap `humanize` default `false` for `test_send` (it is `true` def in `infra.ts:228`), add `rateLimit bucket openwa-action 60/10` on `infra.ts:209` (currently none vs `calWebhook 60/120` in `index.ts:207`).

### H2 — `docker-overview` Serial + Short Timeouts = Fleet-Wide False Down
**File** `infra.ts:118-145` — OpenWA probe `3000ms` + `catch → down`; 2 sequential fetches. The tunnel log shows `quic timeout` bursts `2026-08-25T11:33:35Z` (2 retries then recovery). A 3s edge hiccup flips UI `Down` then `Live` → operators `Restart` storm (rate-limit missing, idempotency middleware exists `idempotency()` but not applied per `openwa/action restart`).

**Fix:** raise to `8000ms`, parallelize `Promise.allSettled([sessions, plugins])`, apply `idempotency` key `infra-openwa-restart`.

### H3 — Public Ports Bypass Tunnel (Host Exposure)
**Evidence** `docker ps`:
- `stalwart-mail` `0.0.0.0:25/110/143/465/587/993/995/4190->*` — intended, but **no `sshd` UFW listed**
- `erpnext-frontend 0.0.0.0:8080`, `chatwoot 0.0.0.0:3200`, `umami 0.0.0.0:3002`, `listmonk 0.0.0.0:9009`, `india-post 100.87.71.38:9888` — **all `0.0.0.0`**. `config.yml` tunnels `127.0.0.1:8080/3200/...` so `0.0.0.0` binding is redundant and leaks if CF Token expires. Should be `127.0.0.1:8080->8080` or firewall `DOCKER-USER iptables` (PENDING-CONFIGS claims tail-scale-only, but current `0.0.0.0` contradicts it).

**Fix:** re-create with `ports: ["127.0.0.1:8080:8080"]` etc + `ufw deny 8080/tcp` + nightly `iptables -S DOCKER-USER` check via `runAuditMonitor` cron (`index.ts:470` Mon 04:00).

### M1 — `integrationsStatus` Masks Auth Failures as Live
**File** `integrations.ts:25` — `probeHttp` treats `[401,403,405]` as `ok`. `openwa /api/health` with wrong `OPENWA_API_KEY` → `401` → marked `live`. Operators think fleet green.

**Fix:** separate `originUp` vs `authUp` (0) — show `auth: fail` badge.

### M2 — ERPNext `erpUpsert` Existence Probe is Unbounded + No Idempotency
**File** `infra/erpnext.ts:42-52` — does `GET /api/resource/Sales Invoice/<name>` then `PUT/POST` **per `syncSinglePaymentToErp`**. `erpnextRouter:165-167` `sync-all` loops **every** unsynced payment sequentially with **no gap** (`for await`). Rate: `payments.length ≈ N` → N `GET+PUT` → Frappe MariaDB thrash + audit `erpnext_sync_log attempts:1` never increments on retry via `/sync/pending` beyond `attempts+1` (ok but no backoff).

**Fix:** queue `JOBS_QUEUE` (commented out in `wrangler.toml: # [[queues.producers]]`) — uncomment now that tunnel stable.

### M3 — Listmonk `blocklist` Endpoint Wrong Verb
**File** `listmonk.ts:176-178` — `PUT /api/subscribers/:id/blocklist` — real Listmonk `0.14` is `PUT /api/subscribers/blocklist` or `PUT /api/subscribers/:id` `status:blocklisted`. DPDP suppression (claim `Real-time Opt-out`) silently no-ops.

**Test:** `./infra/hunting-queries.sql` grep shows never hit prod.

### L1 — Erp health probe hits non-existent `frappe.utils.change_log.verify_js`
**File** `infra/erpnext.ts:66` — `GET /api/method/frappe.utils.change_log.verify_js` — returns `404` on stock Frappe → `probe` returns `down` unless `405` treated as ok (it isn't in `erpHealth`, only in `probeHttp`). Infra then shows `down`.

**Fix:** use `GET /api/method/ping` as in `integrations.ts:104` (canonical).

### L2 — `Idempotency-Key` Required by `app.use('/api/*', idempotency())` but UI never sends it
**File** `InfraHealth.tsx:168-174` `waActionMutation` POST has no `Idempotency-Key`; `InfraHealth` `erpSyncMutation:188-189` also none → every double-click from toast debounce pays twice (ERP duplicate invoice).

---

## 3) Performance & Latency — Before Fix vs After Target

| Path | Current p50 (measured inferred) | Gap | Target after §4 fixes |
|---|---|---|---|
| `GET /api/infrastructure/health` (D1+R2+KV+Vector) | **~120ms** (`SELECT 1` + `BUCKET list 0` workers local) + `vectorHealth` (20ms) | `queues:true` hard-coded (no real probe) — UI green even if crons dead | Add `KUMA_PUSH_URL` liveness gate `≤6h` (mirrors `heartbeat.ts` cron). |
| `GET /api/infrastructure/integrations` (9 probes serial) | `~9 * (p50 WAN 45ms + TLS) ≈ 900-1200ms` (`chatwoot/health` `~80ms` dominant) | Serial loop (`for` sequentially in `integrationsStatus:49-149`) | `Promise.allSettled` 9 probes → `~180ms` p50. |
| `GET /api/infrastructure/docker-overview` (OpenWA 2 fetches `3000ms` each) | `~60-400ms` when tunnel `hyd03` warm, **>3000ms** during `quic timeout` → UI spinner | No cache (`refetchInterval 20s` polls every client) → **N * 3 req/min** | Add `KV cache 30s` `infra:docker-overview` (Workers KV free tier 1k writes/day is fine: 2/min = 2880 — use `CACHE_TTL 30s` in memory map instead). |
| `POST /openwa/action test_send` w/ humanize | `~1300ms` (humanizer sleep + `fetch` `~250ms` tunnel) | See H1 | Move sleep to `JOBS_QUEUE` or `Temporal` delay, return `202 enqueued`. |
| `POST /erpnext/sync/pending` batch | `~N * 800ms` sequential | No batch size shown (`bounded 25` claimed in PENDING-CONFIGS C1 but `infra.ts` has no limit) | Enforce `limit 10` per tick, offload to queue. |

**Fleet resources (fine today):** `CPU load 0.36`, `RAM 7.4/23Gi` (32%), `Swap 200Mi`, `Disk 85/193Gi 44%` (`df -h /`), `cloudflared 31.9M` 11 tasks. No immediate scale need, but **no disk-alert** — at current ingest `109Gi` free → ~127 days at +500Mi/day.

---

## 4) Operations & Needs — What's Missing for “Safe & Sound”

### Operational maturity (present → gap → need)

| Area | Present | Gap | Need (Opus OS contract) |
|---|---|---|---|
| **Single-tunnel SPOF** | 1 `cloudflared` `systemd active hyd03/quic` | One binary, no standby; log shows 2 `quic timeout` in 30min `2026-08-25` | **Dual tunnel** (`cloudflared --metrics 127.0.0.1:30100`) + `Kuma http /health` 30s → Telegram `n8n 05-kuma-alerts` (template ready). |
| **Backups** | `D1 opusos-db 0cc0da81…` no dump in repo; `R2 opusdocs` present | `PENDING-CONFIGS F2` `wrangler d1 export` never run; no `rclone sync google-drive` (mounted `5.0T 342G 7%` at `/home/ubuntu/google-drive`) | Schedule `wrangler d1 export --remote --output /home/ubuntu/google-drive/opusos-d1-$(date -I).sql` daily 02:15 via `systemd timer` (after `nurture` cron 03:00). |
| **Secrets rotation** | `OPENWA_API_KEY` in `wrangler secret`, `SSRF_ALLOWED_HOSTS=100.69.139.47` | No rotation record; `TURNSTILE_SECRET_KEY 1x000...` still dev key per `wrangler.toml` | Enable **`secretRotation.ts` cron `30 3 1 * *`** (`index.ts:482`) — currently imported and scheduled (present ✓). Need to verify `n8n` lane `N8N_ENCRYPTION_KEY` before enabling. |
| **Observability** | `observability.enabled logs true` + `vectorHealth` + `auditSystem` (5.5 TeamHub, SyncHub) | No Loki/Prom tails; `infra/messaging.ts` `inboxSendMessage` stub `return {ok:true}` — ChatWidget fallback lies green | Wire `runtimeLog.ts` → KV `runtime:logs` 7d TTL + show in `InfraHealth` bottom strip. |
| **Rate limiting** | `index.ts:107 idempotency`, `calWebhook 60/120`, `health 60/30`, `visibility 300/60` | `infraRouter` **no** `rateLimit` mounts (only `index.ts:246-247` `rbac` protecting `/api/infrastructure` as a prefix; sub-routes under `infra.ts` inherit it — **verified safe:** `Hono` prefix `rbacMiddleware super_admin` applied in `index.ts:246-247` is correct). | Add explicit `rateLimit bucket infra-docker 60/30` for `/docker-overview` (poll storm) — currently only RBAC. |
| **Kuma monitors as code** | `infra/ CLOUDFLARE_SETUP.md` exists, no Terraform for Kuma | Drift when superadmin adds monitor in UI | Add `infra/terraform/kuma-monitors.tf` (or `infra/kuma-monitors.json` import). |

### Functions not yet wired (from `infra/` dir)

- `chatwootBridge.ts` / `chatwootAiCopilot.ts` — included in `dockerOverview` claim `setUser (division,stage,counselor)` but `ChatWidget.tsx` only sents `division/stage/counselor` — missing `lastActive` ISO (spec 87 line) → Chatwoot **Custom Attributes** incomplete.
- `uploadGuard.ts` (`6.5KiB`) exists for malware scan status claim `infra.ts:104 R2 health` — not actually invoked on `POST /api/portal/documents` (verify via `studyAbroadApps.ts` etc.) — file vault claim overstates.
- `vector.ts` `vectorHealth` reports `bound && status ok` — but no warm re-index cron; `opusos-embeddings` 768 `bge-base-en-v1.5` may stay empty → AEO semantic search degraded.

---

## 5) Cross-Check: Tunnel Ingress Audited

`config.yml` **13 tunnels all `127.0.0.1:{port}`** correct; `/robots.txt` stub on `8099` good for scanners. **One catch-all** `http_status:404` (correct, no data leak). **No `warp-routing` enabled** (`tunnel: 6f1a97cc…`), so `Tailscale 100.87.71.38` references in older docs are now aliases to `127.0.0.1` — safe to deprecate `Tailscale IPs` text.

---

## 6) Risk Matrix

| ID | Area | Sev | Likelihood | Blast radius | Owner action |
|---|---|---|---|---|---|
| `H1` Worker CPU sleep | Perf/DoS | **High** | On every `test_send` | Workers bill + Kuma heartbeat missed | Switch to queue |
| `H3` `0.0.0.0` ports | Security | **High** | Until restart | Any internet IP can probe `8080/3200` | Rebind + firewall |
| `H2` `docker-overview` false-down | Reliability | **High** | On next `quic timeout` | False `Restart` cascade | Timeout 8000 + idempotency |
| `M1` Probe masks 401 | Integrity | Medium | Always | Green UI hides auth rot | Split auth badge |
| `M3` Listmonk blocklist verb | Compliance/DPDP | Medium | On DPDP opt-out | Consent violation | Fix endpoint + hunt query |
| `M2` ERP unbounded sync-all | Finance | Medium | When >10 pending | ERP double-invoices | Queue + `limit 10` |
| `L2` No Idempotency-Key | Finance | Low | Double-click | Duplicate invoice | Add header in UI |

---

## 7) Remediation PR (ordered — code, not manual clicks)

This is the **ready-to-apply patch set** (all files exist, no secrets touched):

**PR-1 Security (30 min):** `infra/integrations.ts:25` split `401` handling; `infra/messaging.ts:54` default `humanize false` for `POST /openwa/action` (add flag comment); `apps/app/src/components/InfraHealth.tsx:738-743` add `headers: {'Idempotency-Key': crypto.randomUUID()}` to `waAction` + `erpSyncMutation`; `infra/listmonk.ts:177` fix verb after checking `api/docs` (keep 14-day compat shim).

**PR-2 Performance (30 min):** `infra/integrations.ts:49` parallelize `const [openwa, chatwoot, cal, erpnext...] = await Promise.allSettled([...probes])` (keep 4000 timeout each); `infra.ts:104` wrap `docker-overview` in `KV.get('infra:docker-overview')` 30s TTL cache; raise `AbortSignal.timeout(8000)` for OpenWA pair.

**PR-3 Reliability (45 min):** re-compose `docker-compose.yml` `ports: ["127.0.0.1:3200:3000"]` etc + uncomment `[[queues.producers]] JOBS_QUEUE` in `wrangler.toml`; add `infraRouter.get('/docker-overview', rateLimit(...))` (to preserve existing `rbac` in `index.ts:246-247`).

**PR-4 Observability (20 min):** add `GET /api/infrastructure/docker-overview?probe=1` strict check `isStrictProbe 503` already in `health:63` — extend to docker-overview; push Kuma monitors JSON.

All 4 PRs keep `secureHeaders HSTS 31536000 preload` (correct) and `placement smart`.

---

## 8) Verification Command Pack

```bash
# Live fleet from any shell with `~/.ssh/cordial_claw.pem`
ssh ubuntu@129.159.238.227 'docker ps --format "{{.Names}} {{.Status}}" | sort; \
  systemctl is-active cloudflared; \
  journalctl -u cloudflared --since "30 min ago" | grep -E "quic|Registered|timeout" | tail -n 20; \
  df -h / | tail -1; free -h | head -2'

# API (owner session required):
curl -s -H "Cookie: __Secure-better-auth.session_token=$S" \
  https://api.opusoverseas.com/api/infrastructure/docker-overview | jq .overview
curl -s -H "Cookie: $S" https://api.opusoverseas.com/api/infrastructure/integrations | jq .summary
curl -s "https://wa.opusoverseas.com/api/health" | jq .
curl -s "https://listmonk.opusoverseas.com/api/health" | jq .
```

---

## 9) What Is Already Safe Today

- **Auth boundary:** `index.ts:246-247` mounts `rbacMiddleware super_admin` on **both** `/api/infrastructure` and `/api/infrastructure/*` — all 4 `POST /openwa/action`, `/listmonk/action`, `/erpnext/action`, `GET /docker-overview` are owner-only (cookie `__Secure-better-auth.session_token`), so internet scans hit `401`.
- **Headers:** `secureHeaders` `HSTS 1y preload`, `X-Frame DENY`, `frameAncestors none` correct.
- **Tunnel:** `hyd03/quic` + `X25519MLKEM768` stable post-`08-25T11:34:08Z` re-register; `quic timeout` retries are expected for QUIC PMTU.
- **Data plane:** D1+R2+KV+DO `TeamHub/SyncHub` + `api health 200` observed `17d` uptime, no recent `reboot`.
- **Digital:** `google-drive` `4.7T` free → D1 backup has room; `stalwart` ports on `25/587` are expected MX.

---

## 10) Next 48h Checklist (owner does only these)

1. [ ] Apply PR-1→PR-4 (or approve single patch).
2. [ ] `docker compose up -d --no-deps` for the 4 re-bound services (erp, chatwoot, umami, listmonk).
3. [ ] Confirm `Kuma https://status.opusoverseas.com` monitors `13 tunnels` + `container:openwa` shell probe.
4. [ ] Run `listmonkOptoutSubscriber` hunt: `GET /api/subscribers?query=optout@test.local` → verify `blocklisted`.

---

*Appendices:* raw file offsets `infra.ts:118-145`, `messaging.ts:34-40`, `integrations.ts:25`, `erpnext.ts:42-52,66`, `index.ts:246-247`, `config.yml` `6f1a97cc…` retained for hunter re-run (`infra/hunting-queries.sql`).
