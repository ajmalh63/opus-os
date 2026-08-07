# Pending Configs & Integrations

Status: PENDING — not yet implemented, documented for future sessions.

## 1. OpenWA + Chatwoot integration (VPS ↔ Cloudflare)

Connect the Oracle-VPS services to this Cloudflare project over HTTPS both ways.
Workers can `fetch()` any public URL (outbound); VPS services POST webhooks to
public Worker routes (inbound) — same pattern as the Razorpay webhook.

### Data flows

```
① OUTBOUND (Cloudflare → VPS)   Worker fetch() → OpenWA/Chatwoot REST APIs
② INBOUND  (VPS → Cloudflare)   OpenWA/Chatwoot POST webhooks → public Worker URLs
```

### Step 1 — VPS reachability
- Open ports on Oracle security list (OpenWA ~3000, Chatwoot ~3000/8080) + iptables;
  run both behind a reverse proxy (Caddy/Nginx) with HTTPS.
- PREFERRED: install `cloudflared` (Cloudflare Tunnel) on the VPS → stable
  hostnames (e.g. `https://openwa.<tunnel>.trycloudflare.com`), no port exposure.

### Step 2 — Worker env config (wrangler.toml [vars] + OpusEnv in src/types.ts)

```toml
[vars]
OPENWA_BASE_URL = "https://openwa.yourdomain.com"
CHATWOOT_BASE_URL = "https://chatwoot.yourdomain.com"
CHATWOOT_API_TOKEN = "..."
WA_WEBHOOK_SECRET = "..."
```

### Step 3 — Inbound webhook routes (public, no session — mirror Razorpay)

| Route | Purpose | Inbound from |
|---|---|---|
| `POST /api/public/wa/webhook` | WhatsApp msgs, status updates, QR/session events | OpenWA |
| `POST /api/public/chatwoot/webhook` | conversation_created / message_created | Chatwoot Inbox → Webhooks |

Both verify signature/secret (HMAC or shared token like Razorpay), parse payload,
write to D1 (communications / conversations), enqueue Workers AI auto-reply.

### Step 4 — Outbound API clients (src/infra/, like kv.ts/vector.ts)
- `sendWhatsApp(env, to, text)` → `POST {OPENWA_BASE_URL}/api/send` with OpenWA
  session token — used by the nurture engine dispatch.
- `chatwootSendMessage(env, inboxId, contactId, text)` →
  `POST {CHATWOOT_BASE_URL}/api/v1/accounts/{id}/conversations/{id}/messages`
  with CHATWOOT_API_TOKEN.

### Step 5 — Wire marketing automation dispatch
- Cron Trigger (every ~5 min) → handler: poll `GET /api/marketing/nurture/due` →
  `sendWhatsApp(...)` → `POST /api/marketing/nurture/:id/send`.
- Sequencing/AI stays in Cloudflare; OpenWA is only the socket courier.

### Security
- Never expose OpenWA session key/QR outside VPS↔Worker HTTPS.
- Verify webhook secrets on both inbound routes.
- Chatwoot: dedicated API agent token scoped to the inbox (not admin).

## 2. WhatsApp delivery route decision (pending)
- **Meta Cloud API** (official, HTTPS webhook): everything can live fully in
  Cloudflare, no OpenWA on VPS at all.
- **OpenWA Baileys** (unofficial Web-mode): only the persistent-socket process
  stays on the VPS (Workers cannot hold outbound WebSockets).

## 3. Chatwoot replacement option (pending)
- Consider dropping Chatwoot: build the unified customer inbox (site chat +
  WhatsApp threads) as a page in this app — D1 conversations table, Workers AI
  auto-reply, staff reply UI. Saves the VPS from running both services.
