# Pending Configs & Integrations

Status: **MOSTLY IMPLEMENTED (repo side).** VPS provisioning remains external ops.

## 1 ✅ Unified messaging — repo side DONE (commit e6643f1)
- `src/infra/messaging.ts` — `sendWhatsApp(env, to, text)` provider-agnostic:
  `WA_PROVIDER='openwa'` (VPS Baileys) | `'meta'` (Meta Cloud API — fully Cloudflare, no VPS).
- **Webhooks** (HMAC `x-wa-signature` verified, mirroring Razorpay):
  - `POST /api/webhooks/wa` — OpenWA **and** Meta Cloud API payload shapes unified
  - `POST /api/webhooks/chatwoot` — conversation_created / message_created
  - Both persist into the **`conversations`** table (the unified customer inbox =
    Chatwoot replacement, #3).
- **Env (wrangler [vars] + OpusEnv):** `WA_PROVIDER` `OPENWA_BASE_URL`
  `OPENWA_SESSION_TOKEN` `META_WHATSAPP_PHONE_ID` `META_WHATSAPP_TOKEN`
  `WA_WEBHOOK_SECRET`.
- Migration `0013_petite_mystique` (`conversations`), 3 tests.

### Still EXTERNAL (needs your Oracle VPS / Meta access — out of repo):
- Provision OpenWA (if `WA_PROVIDER=openwa`) OR Meta Business API
  (recommended — no VPS needed). Wire vault:
  - VPS: `cloudflared` tunnel → `OPENWA_BASE_URL`, set `OPENWA_SESSION_TOKEN`,
    point OpenWA webhooks at `POST /api/webhooks/wa` with `WA_WEBHOOK_SECRET`.
  - Meta: create app + phone number → `META_WHATSAPP_PHONE_ID`/`TOKEN`, subscribe
    webhooks → `/api/webhooks/wa`.
- Nurture dispatch cron (5 min) → poll `/api/marketing/nurture/due` →
  `sendWhatsApp(...)` → `POST /:id/send` — **api is ready**; schedule the Worker
  cron in wrangler.toml `[triggers]` and paste credentials.

## 2 ✅ Decision (resolved)
Use **Meta Cloud API** as the recommended delivery (all-in-Cloudflare). OpenWA
only if you prefer the own-number Web route (VPS sidecar required — Workers
cannot hold outbound WebSockets).

## 3 ✅ Unified inbox (Chatwoot replacement) — foundation DONE
`conversations` table + webhooks landing there. Remaining (optional): the staff
inbox UI page reading conversations (+ reply hook via `sendWhatsApp`). Next
session candidate; the data layer is in place.