# OpusOS — Operations & Integration Playbook

| | |
|---|---|
| **System** | OpusOS — Business Operating System for Opus Overseas |
| **Version** | 1.0 |
| **Date updated** | 2026-08-09 |
| **Status** | Local + Tailscale test phase LIVE · Cloudflare production PENDING (real CF account needed) |
| **Canonical repo** | `C:\Opus OS` (OneDrive copy is a frozen backup — never edit it) |
| **Conflict rule** | Where this playbook disagrees with `AGENTS.md`, **AGENTS.md wins** until the owner updates it |

---

## Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture](#2-architecture)
3. [Cloudflare Backend Infrastructure](#3-cloudflare-backend-infrastructure)
4. [Module Map — Backend API Routes](#4-module-map--backend-api-routes)
5. [Module Map — Frontend](#5-module-map--frontend)
6. [Data Model](#6-data-model)
7. [Authentication, Authorization & RBAC](#7-authentication-authorization--rbac)
8. [Core Business Workflows](#8-core-business-workflows)
9. [Integrated Open-Source Applications](#9-integrated-open-source-applications)
10. [Security Posture](#10-security-posture)
11. [Observability & Monitoring](#11-observability--monitoring)
12. [Testing & CI](#12-testing--ci)
13. [Runbooks](#13-runbooks)
14. [Disaster Recovery & Backup](#14-disaster-recovery--backup)
15. [Environment & Configuration Reference](#15-environment--configuration-reference)
16. [Known Issues & Pending Work](#16-known-issues--pending-work)
17. [Roadmap & Future State](#17-roadmap--future-state)

---

## 1. System Overview

**OpusOS** is the private business operating system behind **Opus Overseas**, a five-division consultancy headquartered in Nizamabad, Telangana, India:

| Division | Business | Primary OS modules |
|---|---|---|
| **Study Abroad** | Admissions, SOPs, eligibility counselling | Lead funnel, universities, eligibility match, agreements |
| **Global Visa** | Student / work / family visas | Kanban pipeline, case tracking, payments & milestones |
| **Umrah & Travel** | Group departures, hotels, packages | Umrah departures calendar, seat bookings, pricing |
| **Attestation** | Document legalization | Attestation chains, transit shipments (Blue Dart / DTDC) |
| **Manpower** | Overseas recruitment, job board | Job postings, resume/candidate hub, placements |

**Design philosophy (locked rules):**

1. **Work-first:** dev runs locally (`wrangler dev` on the Windows machine); no remote Cloudflare deploys until explicitly commanded.
2. **10 ms CPU ceiling:** Workers handlers stay DB + JSON; AI/PDF/email go async via `JOBS_QUEUE` (Queues + `job_results` poll pattern).
3. **Money = integer paise.** Floats for money are banned. ₹ formatting only at the UI boundary.
4. **Shared Zod validation** in `packages/shared` — used by API handlers and React forms alike.
5. **DPDP Act 2023 compliance:** every client consent recorded with IP + SHA-256 hash; nurture/WhatsApp gated on consent.
6. **Audit everything:** immutable `audit_log` rows for money, agreements, consents, staff-scope, kanban moves, inbox replies, AI calls.

**Module inventory at a glance:**
- API: **21 routers + webhooks** exposed via Hono (`apps/api/src/index.ts`)
- Database: **45 tables** in Cloudflare D1, 16 Drizzle migrations (`0000`–`0015`)
- Frontend: **13 pages + artifact widgets** in `apps/app/src/pages` + `components`
- Tests: **122+ Vitest tests** in `apps/api/tests` (24 files) — `pnpm test`
- Integrated apps: **OpenWA, Chatwoot, Cal.diy, ERPNext, Listmonk, Umami, n8n, Uptime Kuma, Twenty, Oracle VPC, Tailscale**

---

## 2. Architecture

```
┌────────────────────────────────────────────────────────────────────────────┐
│                            Cloudflare (planned)                            │
│  apps/app (React 19 SPA · Vite · Tailwind v4, static assets)                │
│        │  /api proxy                                                       │
│  apps/api (Hono Worker — 10 ms CPU budget)                                 │
│    ├── D1 (SQLite, 45 tables)    ├── R2 vault (documents, PDFs, backups)   │
│    ├── KV (cache + feature flags only; sessions stay in D1)                │
│    ├── Vectorize (768-d cosine; universities, SOP, resumes)                │
│    ├── Queues (JOBS_QUEUE — async PDF / e-mail / AI)                       │
│    └── Workers AI (embeddings bge-base-en-v1.5 + llama models — planned)   │
└────────────────────────────────────────────────────────────────────────────┘
        │ outbound (HTTP / webhooks)                    │ webhooks (HMAC) in
        ▼                                                ▼
┌───────────────────────────────── Oracle VPC (tailnet-only) ─────────────────────────────────┐
│ OpenWA :2785 (WhatsApp)   · Chatwoot :3200 (Rails inbox)   · Cal.diy :3000/3201/5555        │
│ ERPNext :8080 (bookkeeping + GST) · Listmonk :9009 (email) · Umami :3002 (analytics)         │
│ n8n :5678 (glue) · Uptime Kuma :3003 (monitor) · Twenty :3001                                │
│ iptables DOCKER-USER: tailscale0 + loopback ACCEPT, everything else DROP                   │
└────────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Front-office → back-office is one-way:** OpusOS pushes payments → ERPNext Sales Invoices (REST, `api_key:secret`). No ERP reads back into the OS.
- **Inbound messaging:** OpenWA (WhatsApp) and Chatwoot webhooks carry conversations into the unified `conversations` table; staff reply via `POST /api/inbox/:id/reply` → `sendWhatsApp`.
- **Brainless network hygiene:** VPS apps public-CLOSED, databases loopback-only, tailnet-only admin; Windows machine `100.69.139.47` must be online for tailnet tests.

---

## 3. Cloudflare Backend Infrastructure

Source: `apps/api/INFRASTRUCTURE.md`. Reference the wrangler.toml for bindings.

| Service | Binding | Role | Code | Free tier |
|---|---|---|---|---|
| D1 | `DB` | Relational DB — sessions + all business data | `src/db.ts` | 5 GB, 5M row reads/d, 100k writes/d |
| R2 | `BUCKET` | Document vault, signed PDFs, backups | `src/infra/vault.ts` | 10 GB egress-free |
| KV | `KV` | Server-side cache + feature flags **only** | `src/infra/kv.ts` | 1 GB, 100k reads/d (1k writes/d — budget!) |
| Queues | `JOBS_QUEUE` | Async email/PDF/AI (respects 10 ms) | `src/infra/queue.ts` | 10k ops/d |
| Vectorize | `VECTOR_INDEX` | Semantic search + AI matching | `src/infra/vector.ts` | 30M queried dims/mo |
| Workers AI | `AI` (planned) | Embeddings bge-base-en-v1.5 + models | `src/infra/ai.ts` | 10k neurons/d |
| Durable Objects | (optional) | Real-time kanban / team hub | — | 100k req/d |

**Why Redis is not a Worker binding:** sessions are in D1 (revocable, auditable, no KV write quota burn); KV TTL-cache is the recommended server-side cache (`infra/kv.ts`); real Redis only on the VPC (OpenWA, Apache/Openes).

**Vectorize one-time setup (before deploy):**
```bash
wrangler vectorize create opusos-embeddings --dimensions 768 --metric cosine
# paste returned index_id into wrangler.json [[vectorize]] index_id
```

**Rate limiting (3 layers):**
1. **In-app (primary):** `middleware/rateLimit.ts` — D1 sliding-window counters (`rate_limit` table), atomic `ON CONFLICT DO UPDATE SET count = count + 1`; `429 + Retry-After`, `X-RateLimit-*` headers; fail-open on infra error.
   Wired on: OTP 5/5 min · sign-in 8/5 min · `/api/public/leads` 5/h/IP · portal lookup 10/h/IP · partners 8/h/IP · eligibility 20/h/IP.
2. **Cloudflare WAF custom rule (free):** block `POST /api/public/leads` per-IP burst at the edge (snippet in INFRASTRUCTURE.md).
3. **Turnstile (tertiary):** public lead + partner forms.

**Health/status:** `GET /api/infrastructure/health` (owner-only) — live status across every CF service; designed to be polled by Uptime Kuma on the VPC and by the 70%-free-tier-guardrail cron.

---

## 4. Module Map — Backend API Routes

All routers mounted in `apps/api/src/index.ts`. Paths below are offsets of the mount points. Error shapes: `{ error: string, details?: any }`; zod rejects return `{ error, details }`.

### 4.1 Public routes (no session)

| Method & path | Router file | Purpose | Rate limit / gate |
|---|---|---|---|
| `POST /api/auth/*` | auth.ts | Better Auth sign-up/email, sign-in/email, me, two-factor, 2FA, bootstrap-admin | OTP 5/5min, sign-in 8/5min |
| `POST /api/public/leads` | leads.ts | Lead intake: client + consent + scoring + SLA task + referral↔commission; self-heals pipeline_stages | 5/hour/IP + Turnstile |
| `GET/POST /api/public/portal/*` | portal.ts | Journey lookup by token, claim to session, A/B variants | 10/hour/IP, token-bound |
| `GET /api/public/jobs` | jobs.ts | Ticker of job postings (Manpower) | public |
| `GET /api/public/umrah/departures` | umrah.ts | Umrah group departures + availability | public |
| `GET /api/public/attestation/chains` | public.ts | Attestation chains + fees + timeline | public |
| `POST /api/public/match/eligibility` | public.ts | University shortlist (rules engine; AI later) | 20/hr/IP |
| `POST /api/public/partners` | partner.ts | Partner KYC registration + referralCode | 8/hr/IP |
| `POST /api/webhooks/wa` | messagingWebhooks.ts | OpenWA/Meta inbound → `conversations` | HMAC-SHA256 body or `X-Webhook-Secret` |
| `POST /api/webhooks/chatwoot` | messagingWebhooks.ts | Chatwoot inbound → `conversations` | shared secret |
| `POST /api/public/payments/razorpay/webhook` | razorpay.ts | payment events → payments ledger, idempotent | HMAC + webhook secret |

### 4.2 Protected routes (RBAC-gated)

| Mount | Router | Role gate |
|---|---|---|
| `GET/PUT /api/clients/:id`, docs upload, communications | clients.ts | all staff (5 roles) |
| `/api/kanban` (board, stages, move) | kanban.ts | super, manager, counselor, coordinator; receptionist read-only |
| `/api/agreements` (templates, drafts, sign) | agreements.ts | super, manager, counselor, coordinator |
| `/api/payments` + `/api/payments/razorpay` (ledger, orders, verify) | payments.ts, razorpay.ts | **super_admin, manager only** |
| `/api/umrah` (departures, bookings) | umrah.ts | all staff roles |
| `/api/transit` (shipments) | transit.ts | super, manager, counselor, coordinator |
| `/api/manpower` (jobs, candidates) | manpower.ts | super, manager, counselor, coordinator |
| `/api/tasks` (queue) | tasks.ts | all staff roles |
| `/api/marketing` (funnel, partners,experiments) | marketing.ts | **super_admin, manager only** |
| `/api/marketing/nurture` (plan/due/send) | nurture.ts | **super_admin, manager only** |
| `/api/incentives` + `/api/staff/incentives` | incentives.ts | rules mgr+; self-view all staff |
| `/api/compliance` (GSTR1/3B/2B/TDS/TCS) | compliance.ts | **super_admin, manager only** |
| `/api/infrastructure` (health) | infra.ts | **super_admin only** |
| `/api/admin` (staff mgmt + audit) | admin.ts | **super_admin only** |
| `/api/admin/rbac` (roles/permissions) | rbac.ts | **super_admin only** |
| `/api/inbox` (threads, replies) | inbox.ts | all staff roles |
| `/api/erpnext` (health, sync, sync-log, pending) | erpnext.ts | **super_admin only** |

**RBAC ceiling inviolable:** `/admin`, `/admin/rbac`, `/infrastructure`, `/erpnext`, `/payments` mgr+-only. Counselor is intentionally denied payments/marketing/compliance/incentives (see AGENTS.md "Ownership/owner ceiling").

---

## 5. Module Map — Frontend

`apps/app/src` — React 19 + Vite + Tailwind v4 (`@theme` brand: brand-navy `#0a2d50`, brand-gold `#d7a019`, brand-cream `#FAF8F4`; utilities `.clay-card`, `.glass-pill`, `.hero-orb`, `.film-grain`). Routing via wouter in `App.tsx`.

| Route (app) | Page component | Public / Auth | Notes |
|---|---|---|---|
| `/` | PublicHome | Public | Hero carousel, live artifacts (JobTicker, DepartureCountdown, AttestationChain, VisaStatusWidget, EligibilityChecker), ChatWidget, Cal CTAR |
| `/study-abroad`, `/visa-services`, `/umrah-travel`, `/attestation`, `/recruitment` | PublicService | Public | Per-division landing, images from `config/images.ts` |
| `/lead-form` | PublicLeadForm | Public | Full lead intake + DPDP consents + A/B variants |
| `/portal` | ClientPortal | Token | "My Journey" status lookup |
| `/partner` | PartnerDashboard | Partner token | KYC, referrals, commission statement |
| `/login`, `/signup` | Login, Signup | Public | Auth with 2FA onboarding |
| `/workspaces` | LandingPortal | AuthGuard | Staff hub (all roles) |
| `/kanban` | KanbanBoard | AuthGuard | Drag-drop board + WIP |
| `/clients/:id` | Client360 | AuthGuard | Profile, vault, agreements, payments, timeline |
| `/inbox` | Inbox | AuthGuard | Unified WhatsApp/chat inbox + reply |
| `/admin` | AdminConsole | AuthGuard (owner) | Tabs: Clients, Kanban, Audit, Roles, Growth, Funnel, Compliance |

Components: `AuthGuard`, `TwoFactorSetup`, `StaffTools`, `RolesTab`, `GrowthTab`, `FunnelTab`, `ComplianceTab`, `ChatWidget` (boot via `window.chatwootSDK.run` — never `window.ChatwootSDK`), `Nav`, `Footer`, `HeroCarousel`, `StickyCallBar`, `Img`, artifacts under `components/artifacts/`.

---

## 6. Data Model

**45 tables in D1** (schema: `apps/api/src/db/schema.ts`; migrations `0000`–`0015`):

**Auth:** `users` (role, userDivisions JSON), `sessions`, `accounts`, `verifications` — timestamps `mode:'timestamp'`; `better-auth` D1 adapter.

**CRM:** `clients` (OP-2026-XXXX ids, consents, enrichment), `engagements` (stageKey FK — call `ensurePipelineStages` on empty DB), `documents` (R2 vault, courier tracking), `communications` (timeline), `pipeline_stages` (WIP limits).

**Money:** `payments` (integer paise + CGST/SGST/IGST split + interstate flag), `milestones`, `commission_ledger`.

**Legal & compliance:** `consents` (DPDP: IP + SHA-256 per consent, granted/withdrawn), `agreements` (content snapshot, eSignMethod, IP/UA, hash), `business_profile` (GSTIN/PAN/TAN/State/HSN/rates), `purchase_invoices` (ITC, 2B), `tds_records` (new IT codes 1026/1027/1028), `tcs_records` (206C(1H)) — all amounts integer **paise**.

**Divisions:** `group_departures` + `seat_bookings` (Umrah; prices paise), `transit_shipments` (Blue Dart/DTDC), `job_postings` (Manpower), `attestation_chains` (per-country step JSON: notary, fee, timeline), `universities` (GPA/IELTS/budget LPA constraints).

**Marketing:** `interaction_points` (scoring codes), `scoring_events`, `segments`, `nurture_touches` (DPDP-safe, 4-touch), `experiments` + `experiment_assignments` (hypothesis-locked A/B).

**Partners:** `partners` (PAN, bank, referralCode, apiToken), `referrals`, `commission_ledger` (unmatured→matured→paid).

**Inbox:** `conversations` (channel, contact_key identity, unread counts, status), `communications` (full timeline, nullable clientId for pre-client webhook rows).

**RBAC suite:** `permissions` (code, family, ownerOnly, seeded), `roles` (permissionsJson, inherited parentId, system flag), `user_roles` (divisionScope JSON, activeFrom/To windows, revoke trail).

**Ops tables:** `audit_log` (immutable; actor, beforeState/afterState JSON, IP), `tasks` (SLA accounts, priority, recurrence, dueDt) with notifications, `rate_limit` (D1 sliding window), `erpnext_sync_log` (one-way book sync queue, attempts/error/docName, status machine pending→synced/failed/skipped) + `jobs` (async queue producer table where applicable).

**Time:** all datetimes stored **epoch seconds** (integers) by convention; UI formats ₹ and dates.

---

## 7. Authentication, Authorization & RBAC

### 7.1 Auth flow
- **Better Auth v1.6.26** (`apps/api/src/auth.ts`) with D1 adapter.
- Sign-up/sign-in email+password; **email-OTP verification** enabled; **TOTP 2FA** + 8 backup codes (`TwoFactorSetup.tsx`).
- Session cookie `opusos-session`; `GET /api/auth/me` returns role + userDivisions + 2FA state.
- **Bootstrap:** `POST /api/auth/bootstrap-admin` (env `ADMIN_EMAIL`/`ADMIN_PASSWORD`) creates owner on first run; recreates if nobody present.
- **Staff registration:** owner-only `POST /api/admin/register-staff` → routes through `auth.api.signUpEmail` (never raw scrypt — provider-drift invariant).

### 7.2 RBAC model
- Two composite: `users.role` (legacy column kept for compat) + full permission suite (`roles.permissionsJson`, `user_roles.divisionScope`).
- `rbacMiddleware(roles[], requireSession=true)` mounted per-router (see §4.2).
- **Permissions families:** client · kanban · agreement · payment · finance · compliance · marketing · incentives · inbox · admin · infrastructure · erpnext · public.
- `owner_only` permissions (admin, infrastructure, erpnext, RBAC) cannot be granted to non-super-admin.
- **Client-level scoping:** staff/userDivisions restrict which division rows a user sees (division scoping middleware); counselor reads allowed divisions only.

### 7.3 Guardrails (never losen)
- `/api/payments*`, `/api/marketing*`, `/api/compliance*`, `/api/incentives*`: **manager+ only**.
- `/api/admin*`, `/api/infrastructure*`, `/api/erpnext*`: **super_admin only**.
- Counselor gets **read-only** kanban, no money, no compliance.

---

## 8. Core Business Workflows

| # | Workflow | Endpoints | Tables | Notes |
|---|---|---|---|---|
| 1 | **Lead intake** | `POST /api/public/leads` | clients, consents, engagements, audit_log, conversations | DPDP consent recorded w/ IP+SHA256; auto-scoring; SLA task 15 min; referral Δ commission; WhatsApp oportunity queue |
| 2 | **Portal journey** | `GET /api/public/portal/lookup` | clients, engagements, documents | Token-only, rate-limited 10/hr; `claim` binds to session |
| 3 | **Kanban move** | `POST /api/kanban/board/move` | pipeline_stages, engagements, audit_log | WIP soft warning; partial credit |
| 4 | **Agreement sign** | `POST /api/agreements/:id/sign` | agreements, milestones, audit_log | Captures IP+UA+SHA hash; creates milestones |
| 5 | **Payment + Razorpay** | `POST /api/payments`, `/razorpay/order`, `/verify`, `/webhook` | payments, milestones | Amounts in paise; GST (CGST/SGST or IGST) auto-split; webhook idempotent by refId |
| 6 | **ERPNext sync** | `POST /api/erpnext/payments/:id/sync` | erpnext_sync_log | One-way; UpsertCustomer → Sales Invoice; retry endpoint |
| 7 | **Inbox reply** | `POST /api/inbox/:id/reply` | conversations, communications | sendWhatsApp; audit reply |
| 8 | **Umrah booking** | `/api/umrah/departures` + reserve | group_departures, seat_bookings | Hold → confirmed on payment |
| 9 | **Manpower resume parse** | `POST /api/manpower/candidates` (mocked) | resume_data | MANPOWER_AI=mock locally → Workers AI later |
| 10 | **Compliance GSTR** | `/api/compliance/*` | business_profile, purchase_invoices, tax records | GSTR1/3B/2B + TDS/TCS workbench |

---

## 9. Integrated Open-Source Applications

### 9.1 Inventory (VPS = Oracle ARM, tailnet `100.87.71.38`)

| App | Version | Port | Auth | OS integration | Status |
|---|---|---|---|---|---|
| **OpenWA** | 0.14.2 | 2785 | X-API-KEY per session + webhook secret | `sendWhatsApp` via Queue; HMAC webhook → conversations | 🔶 LIVE (session not linked, webhook 500 — see §16) |
| **Chatwoot** | latest | 3200 Rails | Agent API token + website token | Webwidget `ChatWidget.tsx`, webhook `/api/webhooks/chatwoot` → inbox | ✅ LIVE (webhook not yet registered) |
| **Cal.diy** | Cal.com fork | 3000 web / 3201 API | NextAuth (owner@opusoverseas.com) | `VITE_BOOKING_URL` → booking ctx | 🔶 PROVISIONED (wizard not run) |
| **ERPNext** | Frappe docker | 8080 | API Key (ops@opusoverseas.com) | REST sync `Payments → Sales Invoice` | ✅ END-TO-END VERIFIED |
| **Listmonk** | latest | 9009 | admin wizard | Future email/nurture SMTP | 🔶 Installed, unconfigured |
| **Umami** | latest | 3002 | wizard | Future analytics (views/read-time) | 🔶 Installed, unconfigured |
| **n8n** | latest | 5678 | /setup wizard | Future workflow glue / DR | 🔶 Installed, unconfigured |
| **Uptime Kuma** | latest | 3003 | wizard | Monitor `/api/infrastructure/health` | 🔶 Installed, unconfigured |
| **Twenty CRM** | latest | 3001 | — | optional bridge (not wired) | 🔶 RUNNING |
| **Oracle VPC** | ARM | — | tailnet-only | All above incl. OpenWA, Chatwoot | ✅ HARDENED |

### 9.2 Integration contracts (in code)
- `src/infra/messaging.ts` — `sendWhatsApp({ chatId, text })` → OpenWA `POST /api/sessions/{id}/messages/send-text`, key admin; fallback Meta Cloud API.
- `src/infra/erpnext.ts` — Frappe REST v2, token auth header; `upsertCustomer` + `makeInvoice`.
- Webhook HMAC: body signed SHA-256; constant-time compare; missing secret ⇒ 403.
- Queue for WhatsApp send (Async) — no blocking.

---

## 10. Security Posture

- **Secrets:** `wrangler secret put` (via `.dev.vars` in dev; never in `[vars]` except marked DEV ONLY—see `wrangler.toml` note).
- **No hardcoded fallback secrets** — fail-closed (503) if required binding/env missing.
- **HMAC everywhere:** Razorpay webhook (`RAZORPAY_WEBHOOK_SECRET`, idempotency on entity id), WA webhook (`WA_WEBHOOK_SECRET`), Chatwoot working secret.
- **Rate limits** per §3 (3 layers).
- **Firewall:** iptables DOCKER-USER tailscale0+loopback only; DBs loopback-only; SSH restricted; cloudflared ready for prod.
- **DPDP:** consent hash + IP evidence; nurture touch creation gated; retention (manpower cv retention) per consent.
- **App-level:** zod strict validation, query params validated, error shape never leaks internals beyond `err.message` + optional stack (dev).
- **Upgrade bullets:** Cloudflare Turnstile on forms; strict email verification; backup codes recovery; OTFT for staff; audit trail append-only.

---

## 11. Observability & Monitoring

- `GET /api/infrastructure/health` — owner-only probe of: D1, R2, KV, Vectorize, Queue, DB, ERPNext, OpenWA, Chatwoot (returns per-service up/down).
- **Uptime Kuma** → will poll the probe; free-tier guardrail cron (70% usage) proposed (INFRASTRUCTURE.md §70 guardrail).
- **Cloudflare dashboards** for Worker notices/errors; `wrangler tail` for dev logs.
- **D1 audit_log** — business audit trail: read via `/api/admin/audit` (owner) and AdminConsole "Audit" tab.
- **erpnext_sync_log** — books sync health: `GET /api/erpnext/sync-log` + retry `POST /api/erpnext/sync/pending`.
- **Metrics for money ops:** open orders vs verified, payment capture rate, milestone aging (yellow/orange/red/hold), GST reconciliation delta (2B vs 2A).

---

## 12. Testing & CI

- **Test runner:** Vitest, 122+ tests across 24 files in `apps/api/tests` (auth, rbac, leads, clients, kanban, payments, agreements, umrah, manpower, compliance, erpnext, incentives, messages, etc.).
- **Commands:**
```bash
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
pnpm --filter app build
```
- **Local DB prep:** `npx wrangler d1 migrations apply DB --local` before first run.
- **CI:** `.github/workflows/ci.yml` — install → typecheck → test → build on push.
- **Test golden rules:** no remote calls (mock OpenWA/ERP/OpenPay); deterministic time; paise math asserted.

---

## 13. Runbooks

### 13.1 Local development boot
```bash
cd C:\Opus OS
pnpm install --frozen-lockfile
npx wrangler d1 migrations apply DB --local        # once per fresh checkout
pnpm exec wrangler dev --port 8787 --ip 0.0.0.0 --local     # Terminal 1 (API)
pnpm dev --host 127.0.0.1 --port 5173                        # Terminal 2 (app)
```
> Detached/persistent (Windows): `Start-Process cmd /c '... > log 2>&1'` — background jobs die with shell exit.

### 13.2 Why lead stops appearing in funnel
1. `ensurePipelineStages(db)` auto-heals on intake — first check `pipeline_stages` has `lead` key.
2. Check `POST /api/public/leads` HTTP 200/400; inspect `rate_limit` for 429s.
3. Consult `audit_log` for `LEAD_CREATED` rows.

### 13.3 Payment verified but not in ERP
- Open `/api/erpnext` routes as owner: `GET /api/erpnext/sync-log` → find `status=failed`; fix payload; `POST /api/erpnext/sync/pending`.
- Confirm Frappe doc exists (`Sales Invoice`); verify GST tax template on ERP side (§9.1 TODO).

### 13.4 Inbox / WhatsApp not replying
- Check OpenWA session linked + healthy (dashboard :2785); `WA_PROVIDER` env; `sendWhatsApp` queue consumer alive.
- If Chatwoot: SDK reachable `:3200/packs/js/sdk.js`; `VITE_CHATWOOT_BASE_URL`/`WEBSITE_TOKEN` correct; webhook registered under Inbox Settings → Webhooks (UI).

### 13.5 2FA lockout
- Backup codes (8) shown at setup — retrieve from secure location; else owner resets record (`2FA off` via better-auth admin path).

### 13.6 500 / 503 on worker
- Check binds: D1 `[[d1_databases]]` id `07f9c2d1-local-dev-db-id` exists; `.dev.vars` secrets present; Tailscale VPS peer up (webhook hosts).

---

## 14. Disaster Recovery & Backup

| Asset | Backup mechanism | RPO | Restore |
|---|---|---|---|
| D1 (all business data) | `wrangler d1 export DB --local` → dump to R2 (hook) | 24 h | `wrangler d1 import` |
| R2 bucket | Region replication + lifecycle | — | bucket restore |
| VPC apps (OpenWA/Chatwoot/ERPNext) | docker volumes in `/home/ubuntu/volumes` | nightly rsync | `docker compose up -d` + restore volume |
| MariaDB (ERPNext) | nightly mysqldump to volume | 24 h | `mysql < dump` |
| Ruby/Postgres (Chatwoot) | pg_dump | 24 h | `psql restore` |
| `erpnext_sync_log` | embedded in D1 export | same as D1 | replay retry endpoint |

**DR runbook (VPC):**
1. `ssh ubuntu@100.87.71.38` (tailnet)
2. `cd /home/ubuntu/services/<app> && docker compose logs --tail 50`
3. Restart individual service; full `docker compose up -d --build` if images drifted.
4. If VPS lost: recreate ARM instance → install docker + tailscale → restore volumes → re-register Tailscale peer → re-open app webhook reg (OpenWA+Chatwoot).

**Manual DB export example** (local dev D1):
```bash
wrangler d1 export DB --table clients --table engagements --local > backup.sql
```

---

## 15. Environment & Configuration Reference

### 15.1 wrangler.toml (api)
- `ENVIRONMENT=development` · `TURNSTILE_SECRET_KEY` (mock key 1x00… dev)
- `MANPOWER_AI=mock` (prod must =real)
- `ADMIN_EMAIL` / `ADMIN_PASSWORD` (bootstrap owner; dev creds only)
- `WA_PROVIDER=openwa` · `OPENWA_BASE_URL=http://100.87.71.38:2785` · `OPENWA_API_KEY` (DEV ONLY) · `OPENWA_SESSION_ID=main` · `WA_WEBHOOK_SECRET` (dev)
- `ERPNEXT_BASE_URL=http://100.87.71.38:8080` (owner-only sync past)
- Bindings: `DB` (D1), `BUCKET` (R2), `KV`, `QUEUE` (JOBS_QUEUE), `VECTOR_INDEX` (768-d)

### 15.2 apps/app env (`apps/app/.env`)
- `VITE_BOOKING_URL` — Cal.diy booking URL (gold CTA; only renders when set)
- `VITE_CHATWOOT_BASE_URL` — Chatwoot SDK / webchat base
- `VITE_CHATWOOT_WEBSITE_TOKEN` — widget token

### 15.3 Secrets (never in `[vars]`)
- `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` (dev .dev.vars ok; prod → wrangler secret put)
- `RAZORPAY_WEBHOOK_SECRET`
- `ERPNEXT_API_KEY` / `ERPNEXT_API_SECRET`
- `WA_WEBHOOK_SECRET` when locked down; Meta API creds (`META_WHATSAPP_PHONE_ID` etc.) if switching `WA_PROVIDER=meta`.

### 15.4 Tailscale fabric
- VPS: `100.87.71.38`, Windows: `100.69.139.47`; VPS offers exit node — set via `ps1` script (`run-vps-tailscale` helper).

---

## 16. Known Issues & Pending Work

| ID | Issue | Priority | Owner | Status |
|---|---|---|---|---|
| P1 | **OpenWA webhook registration 500** (webhooks FK against split sqlite db after container recreate) | High | Dev | Blocked on VPS; needs session re-create + re-register |
| P2 | **Cal.diy wizard incomplete** (login OK; publish step pending) → booking URL | Med | Owner | One browser click needed |
| P3 | **ERPNext Sales Tax template** (invoice final validation blocked) | High | ERP side | Create CGST/SGST row template on ERP; set company default |
| P4 | **Listmonk/UX (email)** | Med | Q3 | Wizard → SMTP → nurture adapter |
| P5 | **Umami + Uptime Kuma + n8n** setup | Med | Q3 | Wizards; targets free-tier dashboards |
| P6 | **Cloudflare PROD** — no real CF account creds yet; old postiz/etsy tunnel creds unusable | High | Owner | Provide real CF token → tunnel + set `WA_PROVIDER=meta` |
| P7 | **Turnstile** live keys | Med | Owner | after domain |
| P8 | **AI residency** (OPUSAI plan) | Low | Dev | Worker AI binding + queue consumer (draft) |

---

## 17. Roadmap & Future State

### Shipped (ROADMAP.md Phase 0–5 ✅)
Auth+B 4-Auth · RBAC+division scoping · Lead funnel · Client360+Vault · Kanban · Service agreements eSign · GST billing (paise) · Milestone escalation · Umrah + Attestation + Manpower modules · Client Portal · Partner program · ERPNext sync · OpenWA+Chatwoot messaging · Compliance workbench (modern IT codes) · 2FA · Emboz Inbox · Infra heath endpoint.

### Next milestones
1. **Cloudflare production cutover** (real account, wrangler deploy, stable domain, cloudflared, SecureCors+secureCookie).
2. **ERP tax cutover** → invoices pass validation; GST returns powered by D1 data.
3. **AI phase (OpusAI blueprint)** — Queue-consumer pattern; resume parser real; SOP mentor; MCQ; VMQ; tuned budget + audit per call; RBAC-gated.
4. **Marketing scale** — Listmonk nurture; Umami analytics; experiments harness live; referral links.
5. **Hardening pass** — Turnstile prod, WAF custom rules, backup automation to R2 scheduled, incident-playbook drill.

*Maintained by the **ACE meta loop**: Micro → Meso (plan-first) → Macro (spec-first) → Meta (this doc + AGENTS.md update).***