# Wave 1 — Handoff Kit (VPS + DNS tasks)

**What's already done in code (this repo, VERIFIED 2026-08-10):**
- Telegram alert channel in the notification engine (`sendNotification` channel `telegram`,
  stub-safe until token set) — `TELEGRAM_BOT_TOKEN` + `OPS_TELEGRAM_CHAT_ID` env.
- Umami tracker + event taxonomy wired into every public surface — **8/8 events fire**:
  `lead_form_submit` (lead form + division inquiries) · `booking_cta_click` (home CTA) ·
  `chat_open` (widget) · `eligibility_check` · `jobs_click` · `umrah_departure_view`
  (departure countdown) · `partner_register` · `share_link_copied`; script injection on boot.
- **Heartbeat cron LIVE in code:** Worker `scheduled` trigger (`0 */6 * * *`) pings the
  Kuma push monitor with real D1 health (`status=up/down`) — so the "D1 backup heartbeat"
  push monitor has a producer and can't false-alarm. Env `KUMA_PUSH_URL`, fail-open.
- `/api/health` returns `{status:"healthy", timestamp}` — the keyword monitor target.

**What needs YOU (browser/DNS, ~40 min):** the items below, in order. Each is paste-ready.

---

## 1. Telegram ops bot (≈5 min)

1. Open Telegram → find **@BotFather** → `/newbot` → name `OpusOS Ops` → save the **token**.
2. Open your bot → press **Start** (creates the chat).
3. Get the chat id: open `https://api.telegram.org/bot<TOKEN>/getUpdates` in a browser,
   send one message to the bot, refresh — read `result[0].message.chat.id`.
4. Fill:
   - `apps/api/.dev.vars`: `TELEGRAM_BOT_TOKEN=<token>` · `OPS_TELEGRAM_CHAT_ID=<chat id>`
   - Prod later: `wrangler secret put TELEGRAM_BOT_TOKEN` (+ `OPS_TELEGRAM_CHAT_ID`).
5. Verify: OS already logs every send to `notifications` (channel `telegram`); once the
   token+chat are set, any `sendNotification({channel:'telegram',...})` posts for real.

## 2. Uptime Kuma import (≈10 min)

Open `http://100.87.71.38:3003` → Settings → **Import** → paste:

```json
{
  "version": "1.23.0",
  "monitorList": [
    { "name": "OS API /health", "type": "http", "url": "http://100.87.71.38:8787/api/health", "interval": 60, "maxretries": 2 },
    { "name": "OS App", "type": "http", "url": "http://127.0.0.1:5173/", "interval": 300 },
    { "name": "ERPNext", "type": "http", "url": "http://100.87.71.38:8080/api/method/ping", "interval": 300, "maxretries": 2 },
    { "name": "Chatwoot", "type": "http", "url": "http://100.87.71.38:3200/packs/js/sdk.js", "interval": 300 },
    { "name": "OpenWA", "type": "http", "url": "http://100.87.71.38:2785/api/health", "interval": 60 },
    { "name": "Cal.diy", "type": "http", "url": "http://100.87.71.38:3000/", "interval": 300 },
    { "name": "Listmonk", "type": "http", "url": "http://100.87.71.38:9009/", "interval": 300 },
    { "name": "Umami", "type": "http", "url": "http://100.87.71.38:3002/", "interval": 300 },
    { "name": "n8n", "type": "http", "url": "http://100.87.71.38:5678/healthz", "interval": 300 },
    { "name": "D1 backup heartbeat", "type": "push", "interval": 86400, "heartbeatRetry": 2, "expectedStatus": "healthy" }
  ]
}
```

Then: **Notifications** → add **Telegram** (paste bot token + chat id) → assign to the
monitors you care about. Add maintenance windows (Settings → Maintenance) for Friday
night patches. The `/api/health` + push-monitor combo detects silent failures (backup
jobs that stop reporting).

**Push monitor wiring (uses the new cron):** create the push monitor named `D1 backup
heartbeat` → copy its **Push URL** (Kuma shows `/api/push/<token>`) → set it on the API:
`wrangler secret put KUMA_PUSH_URL` (prod) or `apps/api/.dev.vars` (dev). The Worker
cron pings it every 6 h with `status=up` (D1 reachable) or `status=down`. A full D1 → R2
database export is **not** part of this heartbeat — that goes to a GitHub Action
(`wrangler d1 export`) once you provide Cloudflare credentials (post-CF phase).

## 3. DNS records (sending domain, ≈10 min — only when you have the domain)

At your DNS provider add **four records** (replace `mail.opusoverseas.com` with the actual
sending subdomain):

| Record | Name | Value |
|---|---|---|
| SPF TXT | `mail` | `v=spf1 include:listmonk.opusoverseas.com -all` |
| DMARC TXT | `_dmarc` | `v=DMARC1; p=quarantine; rua=mailto:dmarc@opusoverseas.com; fo=1` |
| MX TXT | `mail` (MX): `v=spf1 ...` — see provider; Listmonk sends only | — |
| DKIM | `dkim._domainkey.mail` | generated inside Listmonk (below) |

Verify afterwards with `https://www.mail-tester.com` (score ≥ 9/10 before any campaign).

## 4. Listmonk setup (≈10 min)

Open `http://100.87.71.38:9009` → complete the wizard:
1. **Admin account** — store credentials in `PENDING-CONFIGS.md` (never plaintext in chat).
2. **SMTP**: use your provider's SMTP (or the VPS's local sendmail) → **Settings → SMTP**;
   run the built-in send test. Set environment `LISTMONK_*` if needed in
   `/home/ubuntu/services/listmonk/.env` → `docker compose up -d`.
3. **DKIM**: Dashboard → **Keys** → generate a DKIM key → copy the TXT value into the
   DNS table above → wait for propagation (**check** shows OK).
4. **Create list**: `subscribers@opus` — enable **Double opt-in** (gold standard; OS DPDP
   alignment), add public subscribe URL widget for `/lead-form`.
5. **Create double opt-in confirmation** template + a **transactional template**
   (`{{ .OptInUrl }}`, `{{ .Tx.Data.ref }}`) — OS nurture/SMS hooks POST these fields.
6. **Warm-up plan:** start at **50 sends/day**, double weekly, only engaged subscribers;
   never cold-blast — matches the OS consent model.

## 5. Umami on the VPS (≈5 min)

Open `http://100.87.71.38:3002` → complete wizard → **Add Website** → name "Opus Overseas",
domain `opusoverseas.in` → copy the **Website ID** to:
`apps/app/.env → VITE_UMAMI_WEBSITE_ID=<id>`

The tracker is already injected by the app (`lib/umami.ts`, cookieless). The event
taxonomy is already wired — **8/8 events verified firing** (incl. `umrah_departure_view`):
`lead_form_submit · booking_cta_click · chat_open · eligibility_check · jobs_click ·
umrah_departure_view · partner_register · share_link_copied`.

## 6. Wire the OS to Telegram (5 min)

After step 1, restart the API once (`wrangler dev` or deploy). Then:
- Test: any `sendNotification({channel:'telegram',...})` logs + posts.
- n8n/Kuma can also call **OS API `/api/automation/health`** if you later mount Telegram
  notifications server-side (recorded in `notifications`, channel `telegram`).

---

## Order of operations for the milestone
1. Telegram bot + chat id (unblocks alerts everywhere).
2. Uptime Kuma import + Telegram notification → watch the stack live.
3. Umami site id → real events appear.
4. Listmonk wizard + SMTP + DKIM + double opt-in (needs DNS).
5. Mail-tester ≥ 9/10 gate before Wave 3 nurture.

**When you've completed items 1–3:** `git add` the updated `.env`/`.dev.vars` placeholders
are already committed — flip `Wave 1` to ✅ in TOOL-STRATEGIES.md §8 and I'll proceed to
the Wave 3 prep (nurture templates + e-invoice doc + CSAT).