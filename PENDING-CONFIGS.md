# Pending Configs & Integrations

Status: **Tailscale test phase LIVE (2026-08-08). Cloudflare tunnel phase PENDING —
needs the real CF account credentials (old postiz/etsy JSONs are a DIFFERENT
account and are intentionally not used).**

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