# Opus OS — Complete Architecture Map

> **Version:** 2026-08-16 (v2 — full VPS inventory + new integrations)
> **Status:** Live (dev/test via Tailscale) → Production target (Cloudflare + Cloudflared tunnel)

---

## 1. System Overview

```
                        ┌─────────────────────────────────────────────────┐
                        │                  USERS / CLIENTS                 │
                        │   Public site · Client portal · Partner portal  │
                        └───────────────┬─────────────────┬───────────────┘
                                        │                 │
                    ┌───────────────────▼─────┐   ┌───────▼──────────────┐
                    │   CLOUDFLARE (prod)     │   │  EXTERNAL SERVICES   │
                    │  ─────────────────────  │   │  ──────────────────  │
                    │  Workers API (Hono)     │   │  cal.com (booking)   │
                    │  D1 (SQLite) · R2 · KV  │   │  Titan/GoDaddy (mail)│
                    │  Turnstile · Email Svc  │   │  Razorpay (payments) │
                    │  Cron · Logpush         │   │  Google (GA4/GBP/GSC)│
                    └───────────┬─────────────┘   └──────────────────────┘
                                │
              ┌─────────────────┼──────────────────┐
              │        CONNECTIVITY (current → future)│
              │   Tailscale 100.87.71.38 (NOW)       │
              │   Cloudflared tunnel (PROD, pending) │
              └─────────────────┬──────────────────┘
                                │
                    ┌───────────▼──────────────────────────────┐
                    │   ORACLE VPS (129.159.238.227)           │
                    │   37 Docker containers, 14 apps          │
                    │   (tailnet-only, UFW locked, secrets 600)│
                    └──────────────────────────────────────────┘
```

---

## 2. Cloudflare Layer (production target)

| Service | Role | Status |
|---|---|---|
| **Workers API** (`apps/api`, Hono) | All business logic: auth, clients, payments, compliance, analytics, visibility, cal, notifications | ✅ Live (dev :8787) |
| **D1** (`opusos-db`) | Single source of truth — 69 migrations | ✅ Live |
| **R2** | Document vault, resume uploads | ✅ Coded |
| **KV** | Prompt cache, session helpers | ✅ Coded |
| **Turnstile** | Bot protection on public forms | ✅ Live |
| **Cron** | Heartbeat every 6h | ✅ Live |
| **Email Service** | OS transactional fallback — **not needed** (Titan relay live) | ⏸ Optional |
| **Logpush** | Long-term runtime log retention | ⏳ Pending (G1) |
| **Workers AI** | AEO citation checks, resume parsing | ✅ Coded |
| **Security** | Timing-safe HMAC · crypto.randomUUID · rate-limited public endpoints · secrets via `wrangler secret put` | ✅ Hardened |

---

## 3. VPS Layer — FULL Inventory (37 containers / 14 apps)

### 3.1 Email & Marketing Stack
| App | Containers | Port | Role | OS Integration |
|---|---|---|---|---|
| **Listmonk** | listmonk, listmonk-db (Postgres) | :9009 | **Single email sender** — campaigns + transactional | ✅ `notify.ts` → `/api/tx` → **Titan relay** (v6.2 API, `opus.api` user) |
| **Mautic** | mautic_web, mautic_cron, mautic_worker, db (MySQL) | :8085 | **Journey canvas** — visual automations, lead scoring, behavioral triggers | ✅ API live (Basic Auth), SMTP → Titan, single-sender rule |
| **Stalwart** | stalwart-mail | 25/465/587/993 | Mail server (inbound MX, personal mailboxes) | ⏳ DNS MX pending (Z0) |
| **Titan (GoDaddy)** | — (external) | — | **Outbound relay** — `smtpout.secureserver.net:465` | ✅ Verified end-to-end (500/day) |

### 3.2 CRM & Customer Stack
| App | Containers | Port | Role | OS Integration |
|---|---|---|---|---|
| **Twenty CRM** | twenty-server, twenty-worker, twenty-db (Postgres), twenty-redis | :3001 | **Open-source CRM** — contacts, companies, deals, pipeline | ⏳ **NEW** — `TWENTY_BASE_URL` already in `.dev.vars`; candidate for client/deal sync |
| **Chatwoot** | chatwoot-rails, chatwoot-sidekiq, chatwoot-redis, chatwoot-postgres (pgvector) | :3200 | Customer support inbox | ✅ OS `/api/webhooks/chatwoot` |
| **OpenReply** | openreply-web, openreply-worker, openreply-postgres, openreply-redis | :3100 | **Instagram DM/comment automation** (auto-replies, link tracking) | ⏳ Needs IG account connected; candidate for Marketing Hub (NOT Reviews — corrected) |

### 3.3 Messaging
| App | Containers | Port | Role | OS Integration |
|---|---|---|---|---|
| **OpenWA** | openwa | :2785 | WhatsApp gateway (test path) | ✅ OS `/api/webhooks/wa`; Meta Cloud API = prod path |

### 3.4 Automation & Ops
| App | Containers | Port | Role | OS Integration |
|---|---|---|---|---|
| **n8n** | n8n, n8n-db (Postgres) | :5678 | Automation spine | ✅ `AUTOMATION_TOKEN` service auth |
| **Uptime Kuma** | uptime-kuma | :3003 | Monitoring | ✅ Heartbeat cron push |
| **india-post-api** | india-post-api | :9888 | India Post tracking | ⏳ Attestation transit enrichment |

### 3.5 Analytics & ERP
| App | Containers | Port | Role | OS Integration |
|---|---|---|---|---|
| **Umami** | umami, umami-db (Postgres) | :3002 | Web analytics (self-hosted) | ⏳ Visibility Hub alternative |
| **ERPNext** | frontend, backend, websocket, scheduler, queue-long, queue-short, redis-queue, redis-cache, db (MariaDB) | :8080 | Accounting/ERP | ✅ OS `/api/erpnext` sync (GST tax template) |

---

## 4. External Services

| Service | Purpose | Integration |
|---|---|---|
| **cal.com** | Consultation booking (3 event types, Requires Confirmation, anti-spam stack) | ✅ Webhook → OS bookings pipeline |
| **Titan (GoDaddy)** | Outbound email relay — `smtpout.secureserver.net:465` | ✅ Listmonk SMTP (verified) |
| **Razorpay** | Payments | ✅ Webhook HMAC → payments |
| **better-auth** | Sessions, RBAC | ✅ Workers auth |
| **Google** | GA4 / GBP / Search Console (Visibility Hub) | ⏳ Config-driven, OAuth pending |
| **Listmonk webhooks** | Bounce/unsubscribe hygiene | ✅ `/api/webhooks/listmonk` |

---

## 5. Frontend (Vite React SPA)

```
apps/app (React 19 + wouter + TanStack Query + GSAP)
├── Public site      → /, /study-abroad, /visa-services, /umrah-travel,
│                      /attestation, /recruitment, /lead-form
│                      (visibility tracking: UTM + GA events + CF beacon)
├── Client portal    → /portal (status, docs, payments)
├── Partner portal   → /partner (catalog, links, commissions)
└── Workspace (shell + RBAC nav)
    ├── Overview: Dashboard · Inbox (clients + team chat) · Clients · Pipeline · Divisions
    ├── Operations: Billing & GST · Taxes & Compliance · Flow Analytics
    │               · Visibility Hub · Consultations · Agreements
    ├── Divisions: Study Abroad · Visa · Attestation · Umrah · Manpower
    └── Admin (/control): Staff · Roles · Audit · Growth · Funnel · Compliance
                          · Campaigns · Partners · Alerts · Growth Metrics
                          · Marketing · Infra · Performance
```

---

## 6. Data Flow — Key Pipelines

### 6.1 Consultation booking (cal.com → OS → notifications)
```
Client books (cal.com, Requires Confirmation + anti-spam)
  → webhook BOOKING_REQUESTED (HMAC timing-safe, rate-limited)
  → OS: booking (pending, risk-scored) + client + engagement + task
  → staff alert (custom WAV) + toast
  → email: notify.ts → Listmonk /api/tx → Titan → staff inbox
  → WhatsApp: notify.ts → OpenWA/Chatwoot → staff phone
  → staff approves in cal.com → BOOKING_CONFIRMED → scheduled
```

### 6.2 Email (single-sender rule)
```
OS transactional ──┐
Listmonk campaigns ─┼──► smtpout.secureserver.net:465 ──► Gmail/Outlook
Mautic automations ─┘        (Titan, 500/day budget, warm-up pending)
```

### 6.3 Marketing journeys (lead tiers) — AUTO-TRIGGERED
```
Lead created → tier computed (hot>75 / warm 50-75 / cold<50 from scoringEvents)
  → nurture auto-plan → journey matched (19 campaigns: 5 divisions × 3 tiers
    + 4 ops) → touches scheduled at day offsets
  → cron dispatch (6h) → email via Listmonk /api/tx → Titan relay
    → WhatsApp via OpenWA
  → Chatwoot: proactive campaigns (5, per division page, 5s on page) +
    automation rules (welcome/labels/assign/urgent) + macros + SLAs
  → OS Marketing tab → Journeys view (KPI cards + tier groups + touch
    timelines + client/sent stats)
```
```
OS lead scoring (hot/cold/junk) → Mautic segments
  → Mautic visual journeys (behavioral triggers, branches)
  → Listmonk delivery → Titan → inbox
  → OS events (umrah booking, payments) → Mautic webhook → journeys
```

### 6.4 Payments
```
Razorpay → webhook (HMAC) → payments table → GSTR-1/3B → CA pack PDF
```

### 6.5 Visibility
```
Public site → UTM capture + GA events (rate-limited) → D1
            → CF Web Analytics beacon → CF dashboard
SEO Hub → sitemap.xml + robots.txt (AI crawlers allowed)
AEO Monitor → Workers AI citation checks
Reviews → OS gbp_reviews table (Google/Trustpilot intake + response drafts) → Visibility Hub V6
```

---

## 7. Connectivity Evolution

| Phase | Now (test) | Production (pending) |
|---|---|---|
| VPS access | **Tailscale** 100.87.71.38 | **Cloudflared tunnel** (Z0/F pending CF creds) |
| OS → Listmonk | `http://100.87.71.38:9009` | `https://listmonk.opusoverseas.com` |
| OS → Mautic | `http://100.87.71.38:8085` (Basic Auth) | `https://mautic.opusoverseas.com` |
| OS → Twenty/OpenReply | tailnet IPs | tunnel hostnames |
| Webhooks | tailnet IPs | tunnel hostnames |
| Email | Titan relay (live) | Titan relay (unchanged) |

---

## 8. Security Posture (hardened 2026-08-16)

- **RBAC**: 5 roles + custom, division-scoped nav
- **Webhooks**: HMAC timing-safe (Razorpay, cal.com, WhatsApp, Chatwoot, Listmonk)
- **Rate limiting**: D1 sliding-window on all public endpoints (UTM 60/hr, GA 120/hr, cal 120/hr, forms, auth)
- **Turnstile**: all public writes
- **Secrets**: VPS files 600/640 (33 locked) · legacy creds removed · `.dev.vars` gitignored · prod = `wrangler secret put`
- **Crypto**: `crypto.randomUUID()` (no Math.random) · timing-safe comparisons
- **Audit trail**: every critical mutation → `audit_log` (before/after + IP)
- **Runtime logs**: in-OS viewer (Security Logs → Runtime)
- **VPS**: tailnet-only ports, UFW locked, fail-closed service tokens

---

## 9. Pending (see PENDING-CONFIGS.md)

- G1 Logpush · G2 cal.com webhook secret · G3 cal.com key rotation
- G4 anti-spam done · G5 Titan relay LIVE · G6 VPS secrets hardening DONE
- Z0 DNS → Cloudflare · F Cloudflare production phase (tunnel, secrets)
- A0 Tool-First creds (Mautic ✅ done · Listmonk ✅ done · Chatwoot pending)
- **NEW candidates**: Twenty CRM sync (contacts/deals) · OpenReply → Marketing Hub (IG automation, needs account) · india-post-api → transit enrichment ✅ DONE · Umami → Visibility Hub
- Mautic journey design (hot/cold/junk, umrah booking) · warm-up schedule