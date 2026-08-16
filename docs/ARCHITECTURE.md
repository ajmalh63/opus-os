# Opus OS — Complete Architecture Map

> **Version:** 2026-08-16 · **Status:** Live (dev/test via Tailscale) → Production target (Cloudflare + Cloudflared tunnel)

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
                    │   Docker apps (tailnet-only, locked)     │
                    │  ──────────────────────────────────────  │
                    │  Listmonk :9009  · Mautic :8085          │
                    │  Stalwart mail  · OpenWA :2785           │
                    │  Chatwoot :3200 · n8n :5678              │
                    │  Umami :3002    · ERPNext :8080          │
                    │  Uptime Kuma :3003 · india-post-api      │
                    │  openreply :3100                         │
                    └──────────────────────────────────────────┘
```

---

## 2. Cloudflare Layer (production target)

| Service | Role | Status |
|---|---|---|
| **Workers API** (`apps/api`, Hono) | All business logic: auth, clients, payments, compliance, analytics, visibility, cal, notifications | ✅ Live (dev :8787) |
| **D1** (`opusos-db`) | Single source of truth — 69 migrations, all business tables | ✅ Live |
| **R2** | Document vault (attestation/visa docs), resume uploads | ✅ Coded |
| **KV** | Prompt cache, session helpers | ✅ Coded |
| **Turnstile** | Bot protection on public forms (lead, partner, match, manpower) | ✅ Live (mock key dev) |
| **Cron** | Heartbeat every 6h (Uptime Kuma push) | ✅ Live |
| **Email Service** | OS transactional fallback (`EMAIL` binding) — **not needed now** (Titan relay live) | ⏸ Optional |
| **Logpush** | Long-term runtime log retention | ⏳ Pending (G1) |
| **Workers AI** | AEO citation checks, resume parsing (graceful degradation) | ✅ Coded |

---

## 3. VPS Layer (Oracle, Docker)

| App | Port (tailnet) | Role | Integration |
|---|---|---|---|
| **Listmonk** | :9009 | Email campaigns + transactional engine (single sender) | OS `notify.ts` → `/api/tx` → **Titan relay** ✅ |
| **Mautic** | :8085 | Marketing automation (drip sequences, lead scoring) | Route through Listmonk (single-sender rule) ⏳ |
| **Stalwart** | 25/465/587/993 | Mail server (inbound MX, personal mailboxes) | DNS MX pending (Z0) |
| **OpenWA** | :2785 | WhatsApp gateway (test path) | OS `/api/webhooks/wa` ✅ |
| **Chatwoot** | :3200 | Customer support inbox | OS `/api/webhooks/chatwoot` ✅ |
| **n8n** | :5678 | Automation spine (Wave 2) | `AUTOMATION_TOKEN` service auth |
| **Umami** | :3002 | Web analytics (self-hosted) | Visibility Hub alternative |
| **ERPNext** | :8080 | Accounting/ERP | OS `/api/erpnext` sync ✅ |
| **Uptime Kuma** | :3003 | Monitoring | Heartbeat cron push ✅ |
| **india-post-api** | :9888 | India Post tracking | Attestation transit |
| **openreply** | :3100 | (OpenReply) | — |

---

## 4. External Services

| Service | Purpose | Integration |
|---|---|---|
| **cal.com** | Consultation booking (3 event types, Requires Confirmation, anti-spam) | Webhook → OS bookings pipeline ✅ |
| **Titan (GoDaddy)** | Outbound email relay — `smtpout.secureserver.net:465` | Listmonk SMTP ✅ verified |
| **Razorpay** | Payments | Webhook HMAC → payments table ✅ |
| **better-auth** | Sessions, RBAC | Workers auth ✅ |
| **Google** | GA4 / GBP / Search Console (Visibility Hub) | Config-driven, OAuth pending |
| **Listmonk webhooks** | Bounce/unsubscribe hygiene | `/api/webhooks/listmonk` ✅ |

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
    ├── Overview: Dashboard · Inbox · Clients · Pipeline · Divisions
    ├── Operations: Billing & GST · Taxes & Compliance · Flow Analytics
    │               · Visibility Hub · Consultations
    ├── Divisions: Study Abroad · Visa · Attestation · Umrah · Manpower
    └── Admin (/control): Staff · Roles · Audit · Growth · Funnel · Compliance
                          · Campaigns · Partners · Alerts · Growth Metrics
                          · Marketing · Infra · Performance
```

---

## 6. Data Flow — Key Pipelines

### 6.1 Consultation booking (cal.com → OS → notifications)
```
Client books (cal.com, Requires Confirmation)
  → webhook BOOKING_REQUESTED (HMAC)
  → OS: booking (pending) + client upsert + engagement + task
  → staff alert (custom WAV sound) + toast
  → email: notify.ts → Listmonk /api/tx → Titan → staff inbox
  → WhatsApp: notify.ts → OpenWA/Chatwoot → staff phone
  → staff approves in cal.com → BOOKING_CONFIRMED → status scheduled
```

### 6.2 Email (single-sender rule)
```
OS transactional ──┐
Listmonk campaigns ─┼──► smtpout.secureserver.net:465 ──► Gmail/Outlook
Mautic automations ─┘        (Titan, 500/day budget)
```

### 6.3 Payments
```
Razorpay → webhook (HMAC) → payments table → GSTR-1/3B → CA pack PDF
```

### 6.4 Visibility
```
Public site → UTM capture + GA events → D1
            → CF Web Analytics beacon → CF dashboard
SEO Hub → sitemap.xml + robots.txt (AI crawlers allowed)
AEO Monitor → Workers AI citation checks
```

---

## 7. Connectivity Evolution

| Phase | Now (test) | Production (pending) |
|---|---|---|
| VPS access | **Tailscale** 100.87.71.38 | **Cloudflared tunnel** (Z0/F pending CF creds) |
| OS → Listmonk | `http://100.87.71.38:9009` | `https://listmonk.opusoverseas.com` |
| Webhooks | tailnet IPs | tunnel hostnames |
| Email | Titan relay (live) | Titan relay (unchanged) |

---

## 8. Security Posture

- **RBAC**: super_admin / manager / counselor / receptionist / coordinator + custom roles, division-scoped nav
- **Webhooks**: HMAC-verified (Razorpay, cal.com, WhatsApp, Chatwoot, Listmonk)
- **Turnstile**: all public writes
- **Audit trail**: every critical mutation → `audit_log` (before/after JSON + IP)
- **Runtime logs**: in-OS viewer (Security Logs → Runtime)
- **Secrets**: `wrangler secret put` in prod; `.dev.vars` local only; API keys never in git
- **VPS**: tailnet-only ports, UFW locked, fail-closed service tokens

---

## 9. Pending (see PENDING-CONFIGS.md)

- G1 Logpush · G2 cal.com webhook secret · G3 cal.com key rotation
- G4 anti-spam done · G5 Titan relay LIVE
- Z0 DNS → Cloudflare · F Cloudflare production phase (tunnel, secrets)
- A0 Tool-First creds (Mautic/Listmonk/Chatwoot) · A4 Listmonk envs
- Mautic → Listmonk single-sender wiring