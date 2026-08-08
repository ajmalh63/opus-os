# Pending Configs & Integrations

Status: **Tailscale test phase LIVE (2026-08-08). Cloudflare tunnel phase PENDING —
needs the real CF account credentials (old postiz/etsy JSONs are a DIFFERENT
account and are intentionally not used).**

## ★ LIVE VERIFIED 2026-08-08 — messaging E2E over tailnet
- VPS OpenWA → HMAC webhook → local worker → `conversations` row (**`count:1`**).
- **OpenWA SSRF guard:** added `SSRF_ALLOWED_HOSTS=100.69.139.47,localhost,127.0.0.1`
  to the container env (from `dist/common/security/ssrf-guard.js`; blocks 100.64/10).
  Container recreated preserving the data volume.
- **Webhook contract (commit 387e9b6):** `X-WA-Signature` = HMAC-SHA256(body, secret)
  OR `X-Webhook-Secret` plaintext; parses Meta + OpenWA `message.received` envelope.
- Worker inbound requires `pnpm exec wrangler dev --ip 0.0.0.0`.
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

## ✅ Cal.diy — reachable, embed ready (frontend wired)
- Web at `http://100.87.71.38:3000`, API v2 `:3201`, studio `:5555` (verified 200).
- **Frontend:** "Pick a Time" CTA (gold outline) renders in the home CTA band
  when `VITE_BOOKING_URL` is set (deep-link to a Cal.diy booking page).
- **TODO (needs you):** create the Cal.diy super admin + first event type in
  its UI (`/setup`), then paste the event/booking URL into `VITE_BOOKING_URL`.

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