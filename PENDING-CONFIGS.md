# Pending Configs & Integrations

Status: **Tailscale test phase LIVE (2026-08-08). Cloudflare tunnel phase PENDING —
needs the real CF account credentials (old postiz/etsy JSONs are a DIFFERENT
account and are intentionally not used).**

> **2026-08-09 (Wave 0 applied + Wave 2 automation lane shipped):** ERP tax blocker
> RESOLVED · automation lane `/api/automation` (service token, fail-closed) LIVE with 7 tests ·
> n8n spine: 5 workflow JSONs in `automation/n8n/` ready to import after the n8n wizard click ·
> Chatwoot webhook API 404 (one UI click) · Cal.diy wizard still one click · OpenWA
> deliberately deferred (no dedicated number yet). Details below + TOOL-STRATEGIES.md.

## ★ Wave 2 — n8n spine (added 2026-08-09)
- **OS automation lane LIVE in code:** `src/middleware/serviceToken.ts` (fail-closed; token from
  `AUTOMATION_TOKEN` — dev value in `.dev.vars` + wrangler.toml `[vars]`, PROD → `wrangler secret put`).
  Routes (all under `/api/automation`, `X-Service-Token` header):
  `GET /health` · `GET /nurture/due` · `POST /nurture/:id/send` (idempotent) ·
  `GET /erp/sync-log` · `POST /erp/sync/pending` (bounded 25).
  Tests: `tests/automation.test.ts` (7) — 132 total green. Mock D1 now understands `<=` in WHERE.
- **n8n workflows (import into n8n after wizard):** `automation/n8n/*.json`
  - `01-lead-followup.json` — 5-min canary → Telegram alert when nurture touches are due
  - `02-nurture-due.json` — every 15 min: pull due touches → mark each sent
  - `03-erp-sync-health.json` — daily 09:00: failed rows → retry via `/sync/pending` → Telegram
  - `04-monthly-close.json` — 1st of month: sync-log digest → Telegram (owner)
  - `05-kuma-alerts.json` — webhook `/opusos-kuma` ← Uptime Kuma notifications → Telegram
- **One-time n8n steps (UI, ~10 min):** complete `/setup` wizard → create creds
  `OpusOS Automation` (HTTP Header Auth, header `X-Service-Token`) and `Ops Telegram`
  (Bot token; set `OPS_TELEGRAM_CHAT_ID` in workflow env) → import 5 JSONs → set
  `N8N_ENCRYPTION_KEY` before creating creds → activate one at a time.

---

## ★ ERPNext — FIXED (2026-08-09): GST tax template created
- **Result:** Sales Invoice POST with OS payload shape → **HTTP 200** (`ACC-SINV-2026-00001`).
  Tax template `CGST@9 + SGST@9 - OO` (is_default) + accounts `CGST/SGST/IGST Output - OO - OO`
  under `Duties and Taxes - OO`; Company default_taxes_and_charges wired.
- **Doctype-permission note:** `ops@opusoverseas.com` API user cannot write `Sales Taxes and
  Charges Template` (403) → template was created via `Administrator` session. Consider granting
  that permission or leaving as admin-only.
- **OS code change:** `buildInvoicePayload` now adds GST `taxes[]` rows (CGST÷SGST 9/9
  intra-state default, IGST 18% interstate, or componentized CGST/SGST/IGST paise from payment
  record). 3 new unit tests; suite 125 green.

## ⏳ Chatwoot webhook — API probe 404 (needs 1 UI click)
- `POST /api/v1/accounts/1/inboxes/1/webhooks` → 404 on this build (webhooks API disabled),
  same as the `register_webhook` 400 noted earlier. **Manual step remains:** Chatwoot →
  Inbox settings (Opus Website Chat) → Webhooks → add
  `http://100.95.139.47:8787/api/webhooks/chatwoot` (secret‑verified route exists).

## ⏳ Cal.diy — booking URL pending wizard click
- `/opus-owner/consultation` and `/book/opus-owner/consultation` → 404 until SSG onboarding
  wizard is completed in-browser with `owner@opusoverseas.com`. Set
  `VITE_BOOKING_URL=http://100.87.71.38:3000/opus-owner/consultation` afterwards
  (verify slug; else `/book/...`).

## Original historic records (kept for continuity)

## ★ ERPNext — integrated in OS (commit 457617c), LIVE END-TO-END VERIFIED
- **ERP node:** `http://100.87.71.38:8080` (tailnet only; publicly closed ✓).
  Containers: `erpnext-backend-1` (bench · api on MariaDB), `-frontend-1` (nginx→8080),
  `-queue-long/short`, `-scheduler`, `-websocket`, `-redis-cache/queue`, `-db-1` (mariadb:11).
- **Credentials:** Admin `Administrator` / `admin` (default docker stack). OS API user:
  `ops@opusoverseas.com` (Accounts+Item+Sales roles) with `api_key 14a5ec26e5dbcc8b`
  `api_secret 592c2dac21507f482` → stored in `apps/api/.dev.vars` (gitignored). Lock down
  the admin password + rotate keys before prod.
- **Item created:** `CONSULTANCY-SV` (services; HSN 9983, taxable, income `Sales - OO`,
  cost center `Main - OO`).
- **Customer sync proven:** OS `POST /api/erpnext/payments/:id/sync` → Customer upsert
  (created `ERP Test Client`) → then Sales Invoice attempt (validated; needs GST break-up
  on the template — tax row config pending ERP side).
- **Endpoints (owner-only):** `/api/erpnext/health`, `/payments/:id/sync`,
  `/sync-log`, `/sync/pending` retry; `erpnext_sync_log` D1 table (migration 0015).
- **TODO (ERP side, one-time):** create a **Sales Taxes and Charges Template** named
  e.g. `CGST@9 + SGST@9` (CGST - OO / SGST - OO rows) and set Company default — then
  invoice rows pass final validation. Everything upstream in the OS sync path is done.

## ★ Other VPC apps installed (all loopback/tailnet-only, publicly closed ✓)

| App | URL | Role in OS | Setup status |
|---|---|---|---|
| **Listmonk** | `http://100.87.71.38:9009` | Email marketing + nurture campaigns (SMTP) | Installed (listmonk+db on its own postgres) — create admin + SMTP in its wizard; wire Listmonk SMTP into nurture later |
| **Umami** | `http://100.87.71.38:3002` | Analytics (views/read-time, §26.4/27.6) | Fresh install — create account → API token → add tracking snippet to public pages when ready |
| **n8n** | `http://100.87.71.38:5678` | Workflow glue (VPC-DR runbooks, adapters) | Fresh — run its `/setup` wizard; optional later |
| **Uptime Kuma** | `http://100.87.71.38:3003` | Monitor `/api/infrastructure/health` + DR runbook | Fresh — add push/HTTP monitors after setup |
| **Twenty CRM** | `http://100.87.71.38:3001` | (Optional) CRM bridge | Already running; not wired into OS (OS has its own client 360) |

**Firewall matrix (verified 2026-08-08):** 8080/9009/5678/3002/3003 → tailnet OPEN, public CLOSED (iptables DOCKER-USER tail-scale-only, as designed).

## Earlier sections (retained)
- **OpenWA → conversations webhook E2E verified (count:1).**
- **OpenWA SSRF guard:** added `SSRF_ALLOWED_HOSTS=100.69.139.47,localhost,127.0.0.1`
  to the container env (from `dist/common/security/ssrf-guard.js`; blocks 100.64/10).
  Container recreated preserving the data volume.
- **Webhook contract (commit 387e9b6):** `X-WA-Signature` = HMAC-SHA256(body, secret)
  OR `X-Webhook-Secret` plaintext; parses Meta + OpenWA `message.received` envelope.
- Worker inbound requires `pnpm exec wrangler dev --ip 0.0.0.0`.
- **TODO:** OpenWA webhook REGISTRATION returns 500 (webhooks FK vs session across
  split sqlite files after container recreate) — needs a clean session re-start on
  the box. Send path is test-ready (`X-API-Key` + `/api/sessions/main/messages/send-text`).

## ★ Chatwoot — PROVISIONED + frontend wired (commit 93e437b)
- **Provisioned on VPS (chatwoot/chatwoot:latest):**
  - Super admin: `ops@opusoverseas.com` / `ChatwootOps2026!` (account_id 1)
  - Agent: `agent@opusoverseas.com` / `AgentPass2026!` — API token
    `Dgx11Tq7HXFoHFwcCk2ShZ2T` (account-scoped, administrator on acc 1)
  - Platform token (superadmin scope): `CWF9xBB6o6M2X1BKyWKRZZHX`
  - **Widget inbox:** "Opus Website Chat" (inbox_id 1) — channel is
    `Channel::WebWidget`, **website_token = `f36574fb918873fbba2749b6a2f18ac6`**
  - `FRONTEND_URL` fixed to `http://100.87.71.38:3200` (was localhost)
  - SDK reachable: `http://100.87.71.38:3200/packs/js/sdk.js` (HTTP 200)
- **Frontend:** `ChatWidget.tsx` injects the official SDK on PublicHome +
  division pages; token/base URL overridable via
  `VITE_CHATWOOT_BASE_URL` / `VITE_CHATWOOT_WEBSITE_TOKEN`.
- **TODO (one-time UI step):** open Chatwoot → Inbox Settings → **Webhooks** →
  add `http://100.69.139.47:8787/api/webhooks/chatwoot` (the API route
  `POST /api/webhooks/chatwoot` exists + secret-verified + persists to
  `conversations`; `register_webhook` API 400'd on this build — easiest via UI).

## ✅ Cal.diy — PROVISIONED end-to-end (login verified, one UI click left)
- Web `http://100.87.71.38:3000` · API v2 `:3201` · studio `:5555` (verified).
- **Bootstrapped via API + postgres:**
  - Super admin: `owner@opusoverseas.com` / `CalDiyOwner2026!` (username `opus-owner`, id 1)
  - `emailVerified`, `completedOnboarding`, `defaultScheduleId=1`, `timeZone=Asia/Kolkata`
  - **EventType 1:** "Free Consultation" · slug `consultation` · 30 min
  - Schedule "Working hours" (Mon–Fri 9–17) + availability row present
  - Env: `NEXT_PUBLIC_WEBAPP_URL=http://100.87.71.38:3000`,
    `NEXTAUTH_URL` reverted to `http://localhost:3000/api/auth` (server-side must stay
    container-local; a tailnet NEXTAUTH_URL broke next-auth fetch → fixed)
  - Login verified: `POST /api/auth/callback/credentials` → **302**
- **Frontend:** "Pick a Time" gold CTA in home CTA band renders when
  `VITE_BOOKING_URL` is set.
- **TODO (one browser click — resolves the wizard 404):** open
  `http://100.87.71.38:3000`, sign in with the creds above (Cal's onboarding adds
  what the DB seed can't), then set
  `VITE_BOOKING_URL=http://100.200.71.38:3000/opus-owner/consultation` (verify slug —
  may be `/book/opus-owner/consultation` in this Cal version) in the app .env.

## 0 ✅ VPS lockdown (committed to the box, verified)
- **Public internet:** all app ports CLOSED (verified from VPS public IP: 2785/3000/3201/5555/3100/6381/8180/5434/5455 all `closed`). Done via:
  - `iptables DOCKER-USER` chain: ACCEPT on `tailscale0` + loopback only, DROP everything else
  - `iptables INPUT`: SSH(22) + tailscale + established only
  - persist: `/etc/iptables/rules.v4` (iptables-persistent)
  - Compose files patched (backups: `*.bak-*`): cal.diy DB `127.0.0.1:5455`, chatwoot pg/redis loopback
- **Databases stay loopback-only** (5432/5434/6380/5455) — never reachable over tailnet either.

## 1 ✅ Tailscale test phase
- VPS tailscale: **`100.87.71.38`** (cordial-local, always-on, offers exit node).
- Windows machine peer: `100.69.139.47` (`asimhsn`) — **must be ONLINE for tests**.
- Reachable over the tailnet (verified HTTP 200/307):
  - OpenWA gateway `http://100.87.71.38:2785` (v0.14.2, health OK, API key `owa_k1_…` live, **no WA session linked yet**)
  - Cal.diy web `:3000` · API v2 `:3201` · studio `:5555`
  - Chatwoot rails `:3200` · Loki `:3100` · Mermaid `:8180`
- Repo env wired (wrangler.toml `[vars]`): `WA_PROVIDER=openwa`, `OPENWA_BASE_URL=http://100.87.71.38:2785`, `OPENWA_API_KEY=…`, `OPENWA_SESSION_ID=main`, `WA_WEBHOOK_SECRET=dev…` → swap to production secrets later.
- Client fixed to OpenWA v0.14.2 contract: `X-API-Key` + `POST /api/sessions/{sessionId}/messages/send-text` `{chatId, text}` (commit `a8e67f4`).

## Next steps (testing)
1. **Link a WhatsApp number**: open `http://100.87.71.38:2785` dashboard → create session `main` → scan QR. (No session ⇒ `send-text` returns 4xx.)
2. **Bring Windows machine online** in Tailscale, then dev Worker at 8787 can reach VPS; register OpenWA webhook:
   `POST http://100.87.71.38:2785/api/sessions/main/webhooks` with `{url: http://100.69.139.47:8787/api/webhooks/wa, events:[message.received], secret: <WA_WEBHOOK_SECRET>}`.
3. Chatwoot wiring: add its webhook → `/api/webhooks/chatwoot` (params per your Chatwoot inbox).

## 2 ✅ Decision (resolved)
Use **Meta Cloud API** as the recommended production delivery (all-in-Cloudflare, no VPS socket).
OpenWA stays the tailscale/testing path; a production switch flips `WA_PROVIDER=meta` + vars.

## 3 ✅ Unified inbox (Chatwoot replacement) — foundation DONE
`conversations` table + HMAC webhooks (`/api/webhooks/wa`, `/api/webhooks/chatwoot`) land there.
Remaining: staff inbox UI + reply hook (`sendWhatsApp`). Data layer ready.

## ★ Cloudflare production phase (DO NOT use existing tunnel JSONs — old account)
Once the real CF account API token is provided: `cloudflared tunnel login` → create `opusos-tunnel` →
config.yml ingress (openwa/chatwoot/cal hostnames) → systemd `cloudflared.service` (auto-restart,
zero packet drop = tunnel fallback to alternate edge) → webhooks move to tunnel hostnames →
flip `WA_PROVIDER` + secrets to `wrangler secret put`.