# Integration Imports — OpusOS ⇄ External Apps (Wave 1)

Everything in this folder is **ready-to-import** — no code changes needed in OpusOS;
you configure/augment the external app with these files after its wizard.

| App | OpusOS side (code, done) | Import here (human step) | Files |
|---|---|---|---|
| **Listmonk** (email) | `infra/listmonk.ts` client (health, upsert subscriber, `/api/tx`, templates) · notify `email` channel routes to Listmonk when `LISTMONK_BASE_URL` set · logs every send | Wizard + SMTP + DKIM + DNS (handoff kit §4); import the 6 templates; create double-opt-in list | `listmonk-templates.json` |
| **Uptime Kuma** (monitoring) | `/api/infrastructure/health` probe + `/api/automation/health` · integration registry panel | Settings → Import the JSON (Wave 1 kit §2) + Telegram notification | kit §2 JSON (canonical copy below) |
| **Chatwoot** (inbox) | Webhook receiver `/api/webhooks/chatwoot` · OS Inbox surface · widget from env | Register webhook URL (UI, one click); import canned replies / macros (cheat-sheet below) | `chatwoot-*` (below) |
| **Cal.diy** (scheduling) | `VITE_BOOKING_URL` CTA on public site | Finish wizard; set booking link in `apps/app/.env` | kit §PENDING |
| **ERPNext** (books) | REST sync (`/api/erpnext`) — payments → Sales Invoice, one-way · gst tax template done | (wave 0 done) sales-tax template + company default set; e-invoice in Wave 3 | kit §0 |
| **Umami** (analytics) | Client-side tracker `lib/umami.ts` + 8-event taxonomy wired | Wizard → add website → put Website ID in `apps/app/.env` (`VITE_UMAMI_WEBSITE_ID`) | kit §5 |
| **n8n** (automation) | `/api/automation` service-token lane + 5 spine workflows | `/setup` wizard, import `automation/n8n/*.json`, create creds `OpusOS Automation` + `Ops Telegram` | `automation/n8n/*.json` |
| **OpenWA / Meta** (WhatsApp) | `infra/messaging.ts` send adapter + HMAC webhook | Pair a number (dedicated), set `OPENWA_*` env | kit §7 |
| **Twenty** (CRM) | Optional bridge; shelved decision | Keep shelved (no import) | — |

## How a send works once configured (your Listmonk question, in one line)
`OpusOS event (receipt/OTP/agreement/nurture)` → `notify.ts channel=email` →
`listmonk.ts /api/tx` (or nurture via campaign) → **Listmonk does DKIM/bounce/delivery**
→ status recorded in OS `notifications` (channel `email`, provider `listmonk`).
No SMTP logic inside OpusOS. Same pattern for every other app: **OS owns the business
event; the external app owns its specialty.**

## Chatwoot quick-import (canned replies, one-time UI)
Inbox Settings → **Canned Responses** → add (macros for client journeys):
1. `[Study] Document checklist` — transcripts, SOP, LOR, IELTS, bank proof
2. `[Visa] Biometrics next step` — after payment, book slot, carry passport copy
3. `[Umrah] Departure prep` — visa/COVID docs + hotel check-in hours
4. `[Attestation] Status nudge` — "your chain is at MEA stage, ~3 business days"
5. `[Manpower] Offer letter review` — 24h SLA on salary/terms review

## Uptime Kuma canonical monitor JSON (same as handoff kit §2, kept here)
Copy → Uptime Kuma → Settings → Import:
```json
{
  "version": "1.23.0",
  "monitorList": [
    { "name": "OS API /api/health", "type": "http", "url": "http://127.0.0.1:8787/api/health", "interval": 60 },
    { "name": "OS App", "type": "http", "url": "http://127.0.0.1:5173/", "interval": 300 },
    { "name": "ERPNext", "type": "http", "url": "http://127.0.0.1:8080/api/method/ping", "interval": 300 },
    { "name": "Chatwoot", "type": "http", "url": "http://127.0.0.1:3200/packs/js/sdk.js", "interval": 300 },
    { "name": "OpenWA", "type": "http", "url": "http://127.0.0.1:2785/api/health", "interval": 60 },
    { "name": "Cal.diy", "type": "http", "url": "http://127.0.0.1:3000/", "interval": 300 },
    { "name": "Listmonk", "type": "http", "url": "http://127.0.0.1:9009/", "interval": 300 },
    { "name": "Umami", "type": "http", "url": "http://127.0.0.1:3002/", "interval": 300 },
    { "name": "n8n", "type": "http", "url": "http://127.0.0.1:5678/healthz", "interval": 300 },
    { "name": "D1 backup heartbeat", "type": "push", "interval": 86400, "expectedStatus": "healthy" }
  ]
}
```

## Verify after wiring
- `GET /api/infrastructure/integrations` (owner) → every app `live` with latency,
  or `stub`/`down` telling you which env/credential is missing
- Send a test receipt: `POST /api/payments` (or a nurture dispatch) → check
  `notifications` row: `channel=email, provider=listmonk, status=sent`
- Listmonk dashboard → Subscribers shows the upsert; Logs shows delivery.