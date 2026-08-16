# Pending Configs & Integrations

Status: **Tailscale test phase LIVE (2026-08-08). Cloudflare tunnel phase PENDING —
needs the real CF account credentials (old postiz/etsy JSONs are a DIFFERENT
account and are intentionally not used).**

## Z0. Domain → Cloudflare DNS (gold-standard playbook — PENDING)
Doc: **`DOMAIN-ONBOARDING-PLAYBOOK.md`** (root) · Kit: `ops/dns/` (zone-template.md,
check-dns.ps1 verifier, terraform/ optional). Blocked on CF credentials (F1).
- [ ] Add zone; recreate records from template (auto-scan NOT trusted)
- [ ] TTLs 300–600s → switch NS → verify
- [ ] ONE SPF (`v=spf1 mx include:senders.smtp2go.com ~all`) + DKIM selectors
      (Stalwart/Listmonk/Mautic) + DMARC p=none → ramp
- [ ] MTA-STS · CAA · DNSSEC · postmaster/dmarc/abuse/unsubscribe aliases
- [ ] Tunnel routes: mail./mautic./listmonk./chatwoot./umami./kuma./n8n.
- [ ] `ops/dns/check-dns.ps1` + MXToolbox/DNSViz/mail-tester ≥9 per sender class
- [ ] Playbook §4: CF Email Routing CANNOT coexist with Stalwart MX on same domain
- [ ] 48h stable → raise TTLs → DMARC quarantine → reject

> **2026-08-10 (Wave 1 code + gateway hardening shipped):** all code-side work is
> COMPLETE. Everything left in this file is a **manual action by the owner**
> (browser click, DNS record, secret, or VPS-side setup) â€” nothing is code-blocked.
> Master checklist below; detailed steps in the referenced sections.

---

# â˜… MASTER â€” Pending manual actions (do these; code is ready)

## A0. Tool-First control panel (code shipped â€” creds pending)
- [ ] **A0.1 Mautic (VPS docker @ `100.87.71.38:8085`)** â€” verified reachable; the
  **web installer is NOT complete** yet (installer page intercepts the API).
  Finish: open `http://100.87.71.38:8085` â†’ installer (DB = compose service,
  e.g. mysql/mariadb) â†’ create admin â†’ **Settings â†’ API Credentials â†’ New
  client â†’ "Client credentials" grant** â†’ Client ID/Secret â†’ set
  `MAUTIC_URL=http://100.87.71.38:8085` + `MAUTIC_CLIENT_ID` + `MAUTIC_CLIENT_SECRET`
  (dev: `apps/api/.dev.vars`). P2 = Mautic journeys tab.
- [ ] **A0.2 Listmonk ops live** â€” after `LISTMONK_*` envs are set (A4):
  Marketing Automation â†’ Campaigns/Templates/Audiences/Suppression tabs are
  fully operational (create/activate/pause/send-test â€” all audited).
- [ ] **A0.3 Chatwoot read feed (P3)** â€” `CHATWOOT_BASE_URL` + `CHATWOOT_API_TOKEN`.
- [ ] **A0.4 OpenWA health (P4)** â€” `OPENWA_API_URL` (prod lane = Meta Cloud API).
- [ ] **A0.6 Mailboxes adapter (Stalwart)** - deferred build (owner: later). Scaffold when Stalwart is live: registry in PENDING + adapter provisioning `nombre@domain` per staff, quotas/status in control panel.
- [ ] **A0.5 Guard contract live** - shipped in code (`/api/automation/guard/check`,
  service-token, 8 tests). When tools go live: workflows call guard before
  sends - `allow` = send, `block` = log. Nothing else to build.

## A. Wave 1 â€” Observability + email foundation (â‰ˆ40 min, steps in `WAVE1-HANDOFF-KIT.md`)
- [ ] **A1. Telegram ops bot** â€” @BotFather â†’ token â†’ `apps/api/.dev.vars`:
  `TELEGRAM_BOT_TOKEN` + `OPS_TELEGRAM_CHAT_ID` (kit Â§1). Prod: `wrangler secret put` Ã—2.
- [ ] **A2. Uptime Kuma** â€” `http://100.87.71.38:3003` â†’ import monitor JSON (kit Â§2) â†’
  add Telegram notification â†’ create push monitor "D1 backup heartbeat" â†’ copy its
  Push URL â†’ `wrangler secret put KUMA_PUSH_URL` (Worker cron `0 */6 * * *` pings it).
- [ ] **A3. Umami** â€” `http://100.87.71.38:3002` â†’ wizard â†’ Add Website â†’ copy Website ID â†’
  `apps/app/.env`: `VITE_UMAMI_BASE_URL=http://100.87.71.38:3002` + `VITE_UMAMI_WEBSITE_ID=<id>`.
  Tracker + 8 events already in code (verified).
- [ ] **A4. Listmonk** â€” `http://100.87.71.38:9009` â†’ wizard â†’ admin creds (store here) â†’
  SMTP + send test â†’ DKIM key â†’ DNS records below â†’ double opt-in list `subscribers@opus` â†’
  confirmation + transactional templates (kit Â§4).
- [ ] **A5. DNS records** (sending domain; kit Â§3) â€” SPF + DMARC (+MX) TXT + DKIM
  `dkim._domainkey.mail`.
- [ ] **A6. Mail-tester gate** â€” `https://www.mail-tester.com` â‰¥ 9/10 before any campaign.
- [ ] **A7. Listmonk webhook** â€” Settings â†’ Webhooks â†’ `http://<worker>/api/webhooks/listmonk`
  with secret = `LISTMONK_WEBHOOK_SECRET` (API env; consumer + suppression table already live).

## B. Wave 0 leftovers (one-click, from Wave 0)
- [ ] **B1. Chatwoot webhook** â€” Chatwoot â†’ Inbox settings (Opus Website Chat) â†’ Webhooks â†’
  `http://100.69.139.47:8787/api/webhooks/chatwoot`.
- [ ] **B2. Cal.diy** â€” open `http://100.87.71.38:3000`, sign in
  (`owner@opusoverseas.com` / `CalDiyOwner2026!`) to finish onboarding â†’ then set
  `VITE_BOOKING_URL` in the app env.

## C. Wave 2 â€” n8n spine (â‰ˆ10 min, steps in PENDING-CONFIGS Â§Wave 2)
- [ ] **C1.** n8n `http://100.87.71.38:5678` â†’ `/setup` wizard.
- [ ] **C2.** Set `N8N_ENCRYPTION_KEY` BEFORE creating creds.
- [ ] **C3.** Creds: `OpusOS Automation` (HTTP Header Auth, `X-Service-Token` =
  `AUTOMATION_TOKEN` value) + `Ops Telegram` (bot token; set `OPS_TELEGRAM_CHAT_ID`).
- [ ] **C4.** Import the 5 JSONs from `automation/n8n/` â†’ activate one at a time.

## D. Payment gateway (Razorpay) â€” creds + dashboard
- [ ] **D1.** `wrangler secret put RAZORPAY_KEY_ID` + `RAZORPAY_KEY_SECRET` +
  `RAZORPAY_WEBHOOK_SECRET` (dev: `apps/api/.dev.vars`).
- [ ] **D2.** `wrangler secret put CALLBACK_URL` â†’ `https://<app>/payment-confirmed`.
- [ ] **D3.** Dashboard â†’ Settings â†’ Webhooks: enable `payment_link.paid`,
  `payment_link.cancelled`, `payment_link.expired`, `refund.processed` â†’
  URL `https://<worker>/api/public/payments/razorpay/webhook`.
- [ ] **D4.** Apply migrations: `pnpm --filter api db:migrate` (or `wrangler d1 migrations
  apply opusos-db`) â€” includes `0026` (webhook log) + `0027` (listmonk suppressions).

## E. Open decisions (need a yes/no once)
- [ ] **E1. OpenWA number** â€” deferred until a dedicated number exists (production lane
  = Meta Cloud API when the CF domain is live).
- [ ] **E2. Twenty CRM** â€” keep shelved (recommended) / read-only bridge / decommission.
- [ ] **E3. Umami revenue join** â€” allow n8n read-only access to OS API (leadsâ†’payments)?
- [ ] **E4. Listmonk sending domain** â€” which subdomain for A5?
- [ ] **E5. ERP security** â€” rotate `Administrator`/`admin` password + rotate
  `ops@opusoverseas.com` api_key/secret before Cloudflare phase; grant ops user
  `Sales Taxes and Charges Template` write (or keep admin-only).

## F. Cloudflare production phase (post-CF creds)
- [ ] **F1.** Provide real CF account API token â†’ tunnel login â†’ `opusos-tunnel` â†’
  config.yml ingress â†’ systemd service â†’ webhooks move to tunnel hostnames â†’
  flip `WA_PROVIDER=meta` + secrets via `wrangler secret put`.
- [ ] **F2.** D1 â†’ R2 full export (GitHub Action using `wrangler d1 export`) â€” the worker
  heartbeat covers liveness only, not the dump.

> When Aâ€“D are done: flip Wave 1 to âœ… in `TOOL-STRATEGIES.md` Â§8 and I'll proceed
> to Wave 3 prep (nurture templates + e-invoice doc + CSAT).

---

## â˜… Wave 2 â€” n8n spine (added 2026-08-09)
- **OS automation lane LIVE in code:** `src/middleware/serviceToken.ts` (fail-closed; token from
  `AUTOMATION_TOKEN` â€” dev value in `.dev.vars` + wrangler.toml `[vars]`, PROD â†’ `wrangler secret put`).
  Routes (all under `/api/automation`, `X-Service-Token` header):
  `GET /health` Â· `GET /nurture/due` Â· `POST /nurture/:id/send` (idempotent) Â·
  `GET /erp/sync-log` Â· `POST /erp/sync/pending` (bounded 25).
  Tests: `tests/automation.test.ts` (7) â€” 132 total green. Mock D1 now understands `<=` in WHERE.
- **n8n workflows (import into n8n after wizard):** `automation/n8n/*.json`
  - `01-lead-followup.json` â€” 5-min canary â†’ Telegram alert when nurture touches are due
  - `02-nurture-due.json` â€” every 15 min: pull due touches â†’ mark each sent
  - `03-erp-sync-health.json` â€” daily 09:00: failed rows â†’ retry via `/sync/pending` â†’ Telegram
  - `04-monthly-close.json` â€” 1st of month: sync-log digest â†’ Telegram (owner)
  - `05-kuma-alerts.json` â€” webhook `/opusos-kuma` â† Uptime Kuma notifications â†’ Telegram
- **One-time n8n steps (UI, ~10 min):** complete `/setup` wizard â†’ create creds
  `OpusOS Automation` (HTTP Header Auth, header `X-Service-Token`) and `Ops Telegram`
  (Bot token; set `OPS_TELEGRAM_CHAT_ID` in workflow env) â†’ import 5 JSONs â†’ set
  `N8N_ENCRYPTION_KEY` before creating creds â†’ activate one at a time.

---

## â˜… ERPNext â€” FIXED (2026-08-09): GST tax template created
- **Result:** Sales Invoice POST with OS payload shape â†’ **HTTP 200** (`ACC-SINV-2026-00001`).
  Tax template `CGST@9 + SGST@9 - OO` (is_default) + accounts `CGST/SGST/IGST Output - OO - OO`
  under `Duties and Taxes - OO`; Company default_taxes_and_charges wired.
- **Doctype-permission note:** `ops@opusoverseas.com` API user cannot write `Sales Taxes and
  Charges Template` (403) â†’ template was created via `Administrator` session. Consider granting
  that permission or leaving as admin-only.
- **OS code change:** `buildInvoicePayload` now adds GST `taxes[]` rows (CGSTÃ·SGST 9/9
  intra-state default, IGST 18% interstate, or componentized CGST/SGST/IGST paise from payment
  record). 3 new unit tests; suite 125 green.

## â³ Chatwoot webhook â€” API probe 404 (needs 1 UI click)
- `POST /api/v1/accounts/1/inboxes/1/webhooks` â†’ 404 on this build (webhooks API disabled),
  same as the `register_webhook` 400 noted earlier. **Manual step remains:** Chatwoot â†’
  Inbox settings (Opus Website Chat) â†’ Webhooks â†’ add
  `http://100.95.139.47:8787/api/webhooks/chatwoot` (secretâ€‘verified route exists).

## â³ Cal.diy â€” booking URL pending wizard click
- `/opus-owner/consultation` and `/book/opus-owner/consultation` â†’ 404 until SSG onboarding
  wizard is completed in-browser with `owner@opusoverseas.com`. Set
  `VITE_BOOKING_URL=http://100.87.71.38:3000/opus-owner/consultation` afterwards
  (verify slug; else `/book/...`).

## Original historic records (kept for continuity)

## â˜… ERPNext â€” integrated in OS (commit 457617c), LIVE END-TO-END VERIFIED
- **ERP node:** `http://100.87.71.38:8080` (tailnet only; publicly closed âœ“).
  Containers: `erpnext-backend-1` (bench Â· api on MariaDB), `-frontend-1` (nginxâ†’8080),
  `-queue-long/short`, `-scheduler`, `-websocket`, `-redis-cache/queue`, `-db-1` (mariadb:11).
- **Credentials:** Admin `Administrator` / `admin` (default docker stack). OS API user:
  `ops@opusoverseas.com` (Accounts+Item+Sales roles) with `api_key 14a5ec26e5dbcc8b`
  `api_secret 592c2dac21507f482` â†’ stored in `apps/api/.dev.vars` (gitignored). Lock down
  the admin password + rotate keys before prod.
- **Item created:** `CONSULTANCY-SV` (services; HSN 9983, taxable, income `Sales - OO`,
  cost center `Main - OO`).
- **Customer sync proven:** OS `POST /api/erpnext/payments/:id/sync` â†’ Customer upsert
  (created `ERP Test Client`) â†’ then Sales Invoice attempt (validated; needs GST break-up
  on the template â€” tax row config pending ERP side).
- **Endpoints (owner-only):** `/api/erpnext/health`, `/payments/:id/sync`,
  `/sync-log`, `/sync/pending` retry; `erpnext_sync_log` D1 table (migration 0015).
- **TODO (ERP side, one-time):** create a **Sales Taxes and Charges Template** named
  e.g. `CGST@9 + SGST@9` (CGST - OO / SGST - OO rows) and set Company default â€” then
  invoice rows pass final validation. Everything upstream in the OS sync path is done.

## â˜… Other VPC apps installed (all loopback/tailnet-only, publicly closed âœ“)

| App | URL | Role in OS | Setup status |
|---|---|---|---|
| **Listmonk** | `http://100.87.71.38:9009` | Email marketing + nurture campaigns (SMTP) | Installed (listmonk+db on its own postgres) â€” create admin + SMTP in its wizard; wire Listmonk SMTP into nurture later |
| **Umami** | `http://100.87.71.38:3002` | Analytics (views/read-time, Â§26.4/27.6) | Fresh install â€” create account â†’ API token â†’ add tracking snippet to public pages when ready |
| **n8n** | `http://100.87.71.38:5678` | Workflow glue (VPC-DR runbooks, adapters) | Fresh â€” run its `/setup` wizard; optional later |
| **Uptime Kuma** | `http://100.87.71.38:3003` | Monitor `/api/infrastructure/health` + DR runbook | Fresh â€” add push/HTTP monitors after setup |
| **Twenty CRM** | `http://100.87.71.38:3001` | (Optional) CRM bridge | Already running; not wired into OS (OS has its own client 360) |

**Firewall matrix (verified 2026-08-08):** 8080/9009/5678/3002/3003 â†’ tailnet OPEN, public CLOSED (iptables DOCKER-USER tail-scale-only, as designed).

## Earlier sections (retained)
- **OpenWA â†’ conversations webhook E2E verified (count:1).**
- **OpenWA SSRF guard:** added `SSRF_ALLOWED_HOSTS=100.69.139.47,localhost,127.0.0.1`
  to the container env (from `dist/common/security/ssrf-guard.js`; blocks 100.64/10).
  Container recreated preserving the data volume.
- **Webhook contract (commit 387e9b6):** `X-WA-Signature` = HMAC-SHA256(body, secret)
  OR `X-Webhook-Secret` plaintext; parses Meta + OpenWA `message.received` envelope.
- Worker inbound requires `pnpm exec wrangler dev --ip 0.0.0.0`.
- **TODO:** OpenWA webhook REGISTRATION returns 500 (webhooks FK vs session across
  split sqlite files after container recreate) â€” needs a clean session re-start on
  the box. Send path is test-ready (`X-API-Key` + `/api/sessions/main/messages/send-text`).

## â˜… Chatwoot â€” PROVISIONED + frontend wired (commit 93e437b)
- **Provisioned on VPS (chatwoot/chatwoot:latest):**
  - Super admin: `ops@opusoverseas.com` / `ChatwootOps2026!` (account_id 1)
  - Agent: `agent@opusoverseas.com` / `AgentPass2026!` â€” API token
    `Dgx11Tq7HXFoHFwcCk2ShZ2T` (account-scoped, administrator on acc 1)
  - Platform token (superadmin scope): `CWF9xBB6o6M2X1BKyWKRZZHX`
  - **Widget inbox:** "Opus Website Chat" (inbox_id 1) â€” channel is
    `Channel::WebWidget`, **website_token = `f36574fb918873fbba2749b6a2f18ac6`**
  - `FRONTEND_URL` fixed to `http://100.87.71.38:3200` (was localhost)
  - SDK reachable: `http://100.87.71.38:3200/packs/js/sdk.js` (HTTP 200)
- **Frontend:** `ChatWidget.tsx` injects the official SDK on PublicHome +
  division pages; token/base URL overridable via
  `VITE_CHATWOOT_BASE_URL` / `VITE_CHATWOOT_WEBSITE_TOKEN`.
- **TODO (one-time UI step):** open Chatwoot â†’ Inbox Settings â†’ **Webhooks** â†’
  add `http://100.69.139.47:8787/api/webhooks/chatwoot` (the API route
  `POST /api/webhooks/chatwoot` exists + secret-verified + persists to
  `conversations`; `register_webhook` API 400'd on this build â€” easiest via UI).

## âœ… Cal.diy â€” PROVISIONED end-to-end (login verified, one UI click left)
- Web `http://100.87.71.38:3000` Â· API v2 `:3201` Â· studio `:5555` (verified).
- **Bootstrapped via API + postgres:**
  - Super admin: `owner@opusoverseas.com` / `CalDiyOwner2026!` (username `opus-owner`, id 1)
  - `emailVerified`, `completedOnboarding`, `defaultScheduleId=1`, `timeZone=Asia/Kolkata`
  - **EventType 1:** "Free Consultation" Â· slug `consultation` Â· 30 min
  - Schedule "Working hours" (Monâ€“Fri 9â€“17) + availability row present
  - Env: `NEXT_PUBLIC_WEBAPP_URL=http://100.87.71.38:3000`,
    `NEXTAUTH_URL` reverted to `http://localhost:3000/api/auth` (server-side must stay
    container-local; a tailnet NEXTAUTH_URL broke next-auth fetch â†’ fixed)
  - Login verified: `POST /api/auth/callback/credentials` â†’ **302**
- **Frontend:** "Pick a Time" gold CTA in home CTA band renders when
  `VITE_BOOKING_URL` is set.
- **TODO (one browser click â€” resolves the wizard 404):** open
  `http://100.87.71.38:3000`, sign in with the creds above (Cal's onboarding adds
  what the DB seed can't), then set
  `VITE_BOOKING_URL=http://100.200.71.38:3000/opus-owner/consultation` (verify slug â€”
  may be `/book/opus-owner/consultation` in this Cal version) in the app .env.

## 0 âœ… VPS lockdown (committed to the box, verified)
- **Public internet:** all app ports CLOSED (verified from VPS public IP: 2785/3000/3201/5555/3100/6381/8180/5434/5455 all `closed`). Done via:
  - `iptables DOCKER-USER` chain: ACCEPT on `tailscale0` + loopback only, DROP everything else
  - `iptables INPUT`: SSH(22) + tailscale + established only
  - persist: `/etc/iptables/rules.v4` (iptables-persistent)
  - Compose files patched (backups: `*.bak-*`): cal.diy DB `127.0.0.1:5455`, chatwoot pg/redis loopback
- **Databases stay loopback-only** (5432/5434/6380/5455) â€” never reachable over tailnet either.

## 1 âœ… Tailscale test phase
- VPS tailscale: **`100.87.71.38`** (cordial-local, always-on, offers exit node).
- Windows machine peer: `100.69.139.47` (`asimhsn`) â€” **must be ONLINE for tests**.
- Reachable over the tailnet (verified HTTP 200/307):
  - OpenWA gateway `http://100.87.71.38:2785` (v0.14.2, health OK, API key `owa_k1_â€¦` live, **no WA session linked yet**)
  - Cal.diy web `:3000` Â· API v2 `:3201` Â· studio `:5555`
  - Chatwoot rails `:3200` Â· Loki `:3100` Â· Mermaid `:8180`
- Repo env wired (wrangler.toml `[vars]`): `WA_PROVIDER=openwa`, `OPENWA_BASE_URL=http://100.87.71.38:2785`, `OPENWA_API_KEY=â€¦`, `OPENWA_SESSION_ID=main`, `WA_WEBHOOK_SECRET=devâ€¦` â†’ swap to production secrets later.
- Client fixed to OpenWA v0.14.2 contract: `X-API-Key` + `POST /api/sessions/{sessionId}/messages/send-text` `{chatId, text}` (commit `a8e67f4`).

## Next steps (testing)
1. **Link a WhatsApp number**: open `http://100.87.71.38:2785` dashboard â†’ create session `main` â†’ scan QR. (No session â‡’ `send-text` returns 4xx.)
2. **Bring Windows machine online** in Tailscale, then dev Worker at 8787 can reach VPS; register OpenWA webhook:
   `POST http://100.87.71.38:2785/api/sessions/main/webhooks` with `{url: http://100.69.139.47:8787/api/webhooks/wa, events:[message.received], secret: <WA_WEBHOOK_SECRET>}`.
3. Chatwoot wiring: add its webhook â†’ `/api/webhooks/chatwoot` (params per your Chatwoot inbox).

## 2 âœ… Decision (resolved)
Use **Meta Cloud API** as the recommended production delivery (all-in-Cloudflare, no VPS socket).
OpenWA stays the tailscale/testing path; a production switch flips `WA_PROVIDER=meta` + vars.

## 3 âœ… Unified inbox (Chatwoot replacement) â€” foundation DONE
`conversations` table + HMAC webhooks (`/api/webhooks/wa`, `/api/webhooks/chatwoot`) land there.
Remaining: staff inbox UI + reply hook (`sendWhatsApp`). Data layer ready.


## â˜… 2026-08-16 â€” Logpush + cal.com webhook secret (owner manual actions)

### G1. Cloudflare Logpush â€” long-term runtime log retention (PENDING)
In-OS runtime log viewer is LIVE (Security Logs â†’ Runtime Logs, commit a90dcc0).
Logpush ships the same logs to long-term storage â€” needs the Cloudflare dashboard:
- [ ] Dashboard â†’ Analytics & Logs â†’ Logpush â†’ Create job
- [ ] Dataset: **Workers Trace Events** â†’ destination: **R2** (or S3)
- [ ] Fields: timestamp, event, message, outcome, scriptName
- [ ] Enable; verify a test batch lands in the bucket

### G2. Cal.com webhook secret (PENDING)
Webhook receiver `/api/webhooks/cal` is live and accepts events, but the HMAC
secret is NOT set yet (dev mode = accepts without verification).
- [ ] cal.com â†’ Settings â†’ Developer â†’ Webhooks â†’ edit the webhook
- [ ] Add a secret â†’ paste it into OS: Consultations â†’ âš™ Config â†’ Webhook secret â†’ Save
- [ ] Verify: a test booking now requires the signature (401 without it)

### G3. Cal.com API key rotation (PENDING)
- [ ] Rotate `cal_live_...` key (was shared in chat) â†' Settings â†' Developer â†' API keys
- [ ] Paste new key into OS: Consultations â†' âš™ Config â†' API key â†' Save

### G5. Outbound email — TITAN paid mailbox relay ✅ LIVE (2026-08-16)
Oracle blocks outbound port 25; tunnel fixes inbound only. **KEY DISCOVERY:**
GoDaddy resells Titan on its OWN infrastructure — SMTP host is
`smtpout.secureserver.net:465` (NOT smtp.titan.email). Auth verified, test
email received, OS → Listmonk → Titan → Gmail chain verified end-to-end.
PAID mailbox limit (official GoDaddy): 500/day via SMTP (15k/mo) · 100
recipients/msg · bounce limit 5/hr, 10/day (exceed = suspension).

Daily budget (500/day):
- Transactional reserve 50/day: booking alerts + signup verification via
  notify.ts → Listmonk /api/tx → Titan ✅ (OS code updated to Listmonk v6.2
  API: template_id 5 + subject + data + from_email info@opusoverseas.com)
- Campaigns 350/day: Listmonk SMTP → Titan, throttle 50/hr × 7h evening
- Automations 100/day: Mautic throttled 10/hr, off-peak
- SINGLE-SENDER RULE: Mautic automations → webhook → Listmonk /api/tx

Setup steps:
- [x] Listmonk SMTP → smtpout.secureserver.net:465, user info@opusoverseas.com
      (auth verified, test email received)
- [x] OS listmonk.ts updated to v6.2 API (commit cc45011)
- [ ] Titan Webmail → Settings (gear, top-right) → "Enable Titan on Other Apps"
      (if you see "Configure 3rd party apps" it's already enabled)
- [ ] Mautic SMTP → route through Listmonk /api/tx (single sender) or direct
      with 10/hr throttle
- [ ] DNS (zone on Cloudflare): SPF `v=spf1 include:secureserver.net ~all`
      + Titan DKIM records
- [ ] WARM-UP: 20-30/day → +10-15%/day → 400/day over 2-3 weeks
- [ ] Bounce discipline: verify lists before campaigns (Listmonk bounce handling)

Scale-out (when 500/day insufficient):
- [ ] Add second mailbox campaigns@ (own 500/day + separate reputation)
- [ ] Or Brevo free (300/day) as campaign overflow
### G4. Cal.com anti-spam â€” DONE (2026-08-16): Requires Confirmation enabled
Turnstile is NOT available in cal.com cloud (it was self-hosted/Cal ID only) â€”
verified. The strongest available lever is now LIVE on all 3 event types:
- [x] **Requires Confirmation** (confirmationPolicy=always, via API) â€” every
      booking is PENDING until staff approves in cal.com
- [x] Email verification + 1/day limit + 2 active max + phone + qualifying
      question (via API)
- [x] OS-side: suspicion scoring, flood blocking, risk badges, pending badge,
      BOOKING_REQUESTED/CONFIRMED/REJECTED webhook handling
- [ ] **Staff workflow**: approve/reject bookings in cal.com (each booking
      arrives as PENDING in the OS Consultations tab + alert)
- [ ] Rotate `cal_live_...` key (was shared in chat) â†’ Settings â†’ Developer â†’ API keys
- [ ] Paste new key into OS: Consultations â†’ âš™ Config â†’ API key â†’ Save

## â˜… Cloudflare production phase (DO NOT use existing tunnel JSONs â€” old account)
Once the real CF account API token is provided: `cloudflared tunnel login` â†’ create `opusos-tunnel` â†’
config.yml ingress (openwa/chatwoot/cal hostnames) â†’ systemd `cloudflared.service` (auto-restart,
zero packet drop = tunnel fallback to alternate edge) â†’ webhooks move to tunnel hostnames â†’
flip `WA_PROVIDER` + secrets to `wrangler secret put`.

