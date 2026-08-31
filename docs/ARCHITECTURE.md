# Opus OS — Complete Architecture Map

> **Version:** 2026-08-31 (**v14 — Enterprise Audit Remediation Campaign:** realtime publish+subscribe loop closed end-to-end · AIP-158 pagination (`lib/paginate.ts`) · `X-Request-ID` tracing · `safeExecutionCtx` systemic fix (17 files) · unified `lib/apiClient.ts` (RFC 9110 Retry-After) + 32 silent-swallow queryFns eliminated · ClientPortal split 2,308→1,036 + lazy visa chunk · NotificationCenter (realtime bell) · PWA (manifest + fail-safe SW + offline) · RBAC deny-matrix suite — **122/122 files, 757 tests**). v13: Login OTP Gold Fix (local `wrangler.local.toml` + idempotency body-clone re-enabled) + Manpower ₹100 Candidate-Pass Paywall (secret tier & exclusive plans retired; unified portal marketplace) + Razorpay Receipt ≤56 Compliance + Honest API-Outage UX  
> **Status:** Live & Unified (Cloudflare Workers API + D1 101 tables (99 + ocr_runs + manpower_workflows) + R2 `opusdocs` Vault (presigned 15m, $0 egress) + KV Edge Accelerator + Queues + Workers AI/Vectorize + SyncHub DO)  
> **Build:** `typecheck ✓ 0 errors (api + app)` `test ✓ 120/120 files passed (745 tests)` `D1 101 tables` `secrets domain https://wa.opusoverseas.com` `Hybrid: Opus = System of Record (kept), Cloudflare Workflows = 0 (free 3k/day, not yet scaffolded — per your “keep everything as is”)`

---

## 1. System Overview & Physical Topology

```
                                 ┌───────────────────────────────────────────────────────────┐
                                 │                     USERS & ROLES                         │
                                 │   Public Leads · Verified Clients · Agency Partners · Staff │
                                 └─────────────────────┬───────────────────┬─────────────────┘
                                                       │                   │
                              ┌────────────────────────▼─────┐   ┌─────────▼──────────────┐
                              │     CLOUDFLARE EDGE (prod)   │   │   EXTERNAL SERVICES    │
                              │  ─────────────────────────   │   │  ────────────────────  │
                              │  Workers API (Hono.js v4)    │   │  Razorpay (Payments)   │
                               │  D1 opusos-db 101 tables ACID│   │  Titan Mail (MX Relay) │
                               │  R2 Encrypted Vault (Zero $) │   │  Google GA4/CF Web Analytics│
                               │  KV Edge Cache (<1ms Reads)  │   │  Meta Graph v21.0 WA   │
                              │  Queues Async Worker + DLQ   │   │  Cal.com (Scheduling)  │
                              │  Workers AI + Vectorize DB   │   │                        │
                              │  SyncHub DO global atom HMAC │   │                        │
                              │  Native Edge Auth + 2FA TOTP │   │                        │
                              └──────────────┬───────────────┘   └────────────────────────┘
                                             │
                        ┌────────────────────┴─────────────────────┐
                        │    CLOUDFLARED TUNNEL (domain-native)     │
                        │   Tunnel ID: 6f1a97cc-8e9b-4340-a435       │
                        │   10 Subdomains → https://*.opusoverseas.com│
                        │   wa · chat · mautic · listmonk · cal      │
                        │   umami · kuma · n8n · erp · crm · api     │
                        └────────────────────┬─────────────────────┘
                                             │
                                 ┌───────────▼──────────────────────────────┐
                                 │   ORACLE VPS (129.159.238.227)           │
                                 │   37 Docker containers, 10 apps          │
                                 │   • mautic.opusoverseas.com (8085)       │
                                 │   • listmonk.opusoverseas.com (9009)     │
                                 │   • chat.opusoverseas.com (3200)         │
                                 │   • wa.opusoverseas.com (2785 OpenWA)    │
                                 │   • cal.opusoverseas.com (3000)          │
                                 │   • umami.opusoverseas.com (3002)        │
                                 │   • kuma.opusoverseas.com (3003)         │
                                 │   • n8n.opusoverseas.com (5678)          │
                                 │   • erp.opusoverseas.com (8080 ERPNext)  │
                                 │   • crm.opusoverseas.com (3001 Twenty)   │
                                 └──────────────────────────────────────────┘
```

---

## 2. Tri-Workspace Realtime Synchronization Matrix

Three workspaces share a single D1 source of truth, synchronized via `SyncHub Durable Object` (`global` atom, `X-SyncHub-Auth` HMAC, `createSyncClient` resilient WebSocket with backoff 1s→30s + heartbeat 25s + Last-Event-ID replay + jitter) + public `refetchInterval 30s` polling fallback. `isAllowedChannel()` enforces channel isolation across planes.

```
┌───────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                     👑 SUPERADMIN & STAFF CRM                                     │
│  • Blog Studio (8 pillars, TL;DR, FAQ 5×<50w, table, Person/Org @id) → public:blog                │
│  • Lead Command Center (score 0-100, territory least-loaded, 4hr SLA task) → public:leads         │
│  • Family Hub (father/mother/guardian, 6m expiry guard) → client:{id}:family                     │
│  • Ledger (booking-tied installments, refund 90%→50%) → public:payments                            │
│  • Visa Gold V1-V7 + Attestation Gold A1-A7 → public:visa / public:attestation                   │
│  • Fluent C1-C6/P1-P3 (Health Ring, Onboarding, Messages, Calendar, Tracker, Tower, Forecast)    │
└─────────────────────────────────▲───────────────────────────────────▲─────────────────────────────┘
                                  │ (Realtime D1 Sync)                │ (Attribution & Payouts)
                                  ▼                                   ▼
┌─────────────────────────────────────────────────┐   ┌─────────────────────────────────────────────┐
│               👤 CLIENT WORKSPACE               │   │            🤝 PARTNER WORKSPACE             │
│  • Dashboard 2.0 Health 0-100 + One CTA + 5-step│   │  • Booking Tower (live per sub-agent)       │
│  • Onboarding Checklist <4 min (Welcome✓)       │   │  • Commission Ledger (auto tier boost)      │
│  • Document Vault (50MB Cap + 30d Auto-Retention│   │  • Performance (bookings/converted/overdue) │
│  • Custom "Other" Document Ingest & Verification│   │  • 1-Click Deep Links SubID + QR Studio     │
│  • PortalMessages + PortalCalendar (.ics)       │   │  • 4-Division Affiliate Catalog (No Attest) │
│  • Visa Tracker anxiety-grade (official+plain)  │   │  • Masked Bank & UPI Direct Payouts         │
│  • Billing Forecast Next 30d + Help center      │   │  • Strict Data Isolation (No Client Files)  │
└─────────────────────────────────────────────────┘   └─────────────────────────────────────────────┘
```

### 2.1 Full Channel Matrix (18+ Publish Sites)

| Domain | Publish `channel` | Event Type | Subscriber Plane | Invalidation Target |
|---|---|---|---|---|
| **Document Vault** | `client:{id}:documents` + `staff:global:alerts` | `DOCUMENT_UPLOADED`, `DOCUMENT_DELETED`, `DOCUMENT_VERIFIED` | `ClientPortal` (Vault Tab) + `StaffAlerts` + `Client360` | Invalidate `['clientVault', token]`, refresh quota & status |
| **Blog** | `public:blog` + `staff:global:blog` | `BLOG_CREATED/PUBLISHED/UPDATED/DELETED` | `BlogManager.tsx` `staff [public:blog, staff:global:blog]` | Invalidate `adminBlogPosts`, `publicBlogPosts` |
| **Leads** | `public:leads` + `staff:global:leads` | `LEAD_CREATED`, `LEAD_ASSIGNED`, `STAGE_CHANGED` | `WorkspaceShell` + `ClientsList` `staff:global:leads` | Invalidate `leadsList`, update Kanban |
| **Family** | `client:{id}:family` + `staff:global:family` | `FAMILY_MEMBER_ADDED`, `FAMILY_MEMBER_UPDATED` | `ClientPortal` `client [client:{id}:family]` + `Client360` staff | Invalidate family members list |
| **Ledger/Payments** | `client:{id}:payments` + `public:payments` + `staff:global:payments` | `PAYMENT_RECORDED`, `INSTALLMENT_UPDATED` | `ClientPortal` `client:{id}:payments` + `PartnerDashboard` `partner:{id}:commissions` | Invalidate billing & forecast |
| **Visa** | `public:visa` + `client:{id}:visa` + `staff:global:visa` | `VISA_DEADLINES_CALC/MOVED`, `VISA_RULE_CREATED`, **`VISA_APPLICATION_SUBMITTED`, `VISA_STATUS_UPDATED` (v14)** | `ClientPortal` `client:{id}:visa` + `VisaTracker` + **`ClientVisaSection` + `VisaPrepPortal` + `NotificationCenter` (v14)** | Invalidate deadlines & checklist + `portalVisaApplications` |
| **Attestation** | `public:attestation` + `staff:global:attestation` | `ATTESTATION_PRESCREEN/VERIFIED/RULE_CREATED` | `AttestationPortal` + `ClientPortal attestation` | Invalidate document chains |
| **Messages** | `client:{id}:messages` + `staff:global:messages` + `public:messages` | `PORTAL_MESSAGE_SENT`, `INBOX_REPLY` | `PortalMessages.tsx` `client` + `Inbox` `staff` | Invalidate message thread |
| **Calendar/Journey** | `client:{id}:journey` | `ONBOARDING_PROGRESS`, `DOCUMENT_DELETED` | `ClientPortal` `client:{id}:journey` | Invalidate `portalDashboard` |
| **Partner** | `partner:{id}:bookings`, `partner:{id}:commissions` | `PARTNER_BOOKING_ADDED`, `COMMISSION_EARNED` | `PartnerDashboard` `partner` | Invalidate booking tower & ledger |
| **Manpower (v13/v14)** | `client:{id}:applications` + `staff:global:manpower` + `public:manpower` | `MANPOWER_DEPLOYMENT_CREATED/UPDATED`, `MANPOWER_JOB_POSTED`, `MANPOWER_MEMBERSHIP_GRANTED` | `ManpowerMarketplace` + staff `ManpowerPortal` + `NotificationCenter` | Invalidate `portalManpowerApps`, `manpowerMarketplace`, `manpowerJobs/Deployments/Candidates` |
| **Razorpay Verify (v14)** | `client:{id}:payments` | `PAYMENT_VERIFIED` | `ManpowerMarketplace` + `NotificationCenter` | Invalidate `portalManpowerApps`, `portalPayments` |

**v14 — publish/subscribe loop CLOSED end-to-end:** every client-facing publish above now has a live subscriber. Client plane: `ManpowerMarketplace` (`client:{id}:applications` + `:payments`), `ClientVisaSection` (`client:{id}:visa`), `ClientHelpdeskSection` (`client:{id}:tickets`), `NotificationCenter` (all four channels — unread badge, mark-read-on-open, localStorage persistence, replay-safe dedupe by event id). Staff plane: `ManpowerPortal` (`staff:global:manpower`), `VisaPrepPortal` (`staff:global:visa`). Every channel is enforced against the `syncHubAuth` allowlist (`client:{tenantId}:*`, `staff:*`, `public:*`) server-side at WS upgrade — a client can never subscribe to another tenant's feed. Flow: **mutation → D1 commit → `publishSyncEvent` (via `safeExecutionCtx`) → SyncHub DO → WebSocket → react-query invalidation → UI updates instantly.**

### 2.2 Boundary Security & Data Isolation Matrix

| Domain / Entity | Superadmin / Staff CRM | Client Portal (`/portal`) | Partner Dashboard (`/partner`) | Boundary Security Rule |
| :--- | :--- | :--- | :--- | :--- |
| **Client Document Vault** | Full document inspection, virus scan status, and verification controls. | Uploads via presigned R2 URLs; sees status badges and storage quota. | **Strictly Forbidden (403/Hidden)** | ✅ **DPDP-2023 Compliant**: Client documents are isolated; partners cannot view, list, or download client private files. |
| **Supplier Cost & Margins** | Full visibility into supplier cost (`wholesalePricePaise`) and gross margin. | Displays **ONLY Retail Customer Fee** (`retailPricePaise` in integer paise / ₹). | Displays **Gross Retail Customer Price** and percentage commission. | ✅ **Wholesale Price Isolation**: `wholesalePricePaise` and supplier names are stripped at the API boundary across all public/portal endpoints. |
| **Assigned Counselor** | Full control to assign/reassign any staff user across student engagements. | Displays live assigned staff name, role, and direct chat button. | Displays assignment status indicator only. | ✅ Counselor emails & internal user IDs are masked. Direct communication routed via in-app Chatwoot. |
| **Partner KYC & Bank Accounts** | Full compliance review for payout approval. | N/A | Masked PAN (`******234F`) and encrypted bank accounts (last-4 tag only). | ✅ PII is protected against database dumps and MITM inspection. |
| **Internal Notes & Scoring** | Staff-only internal CRM notes (`clients.notes`, `intakeContext`). | **Hidden**. | **Hidden**. | ✅ Zero leakage outside staff perimeter. |

---

## 3. Client Document Vault & Upload Protection Architecture

```
                                  CLIENT UPLOAD REQUEST
                                            │
                                            ▼
                    ┌───────────────────────────────────────────────┐
                    │     1. Presigned HMAC-SHA256 URL Verify       │
                    │        (15-min expiry + Token Check)          │
                    └───────────────────────┬───────────────────────┘
                                            │
                                            ▼
                    ┌───────────────────────────────────────────────┐
                    │     2. Filename Sanitization & Path Guard     │
                    │        (Basename only, control chars strip)   │
                    └───────────────────────┬───────────────────────┘
                                            │
                                            ▼
                    ┌───────────────────────────────────────────────┐
                    │     3. Allowlist & Magic-Byte Sniffer         │
                    │        (PDF, PNG, JPG, WEBP, DOC, DOCX)       │
                    │        • Reads binary signatures (%PDF, etc.) │
                    └───────────────────────┬───────────────────────┘
                                            │
                                            ▼
                    ┌───────────────────────────────────────────────┐
                    │     4. Antivirus & Prompt Injection Scanner   │
                    │        (scanDocumentBytes - Latin-1 loss-less)│
                    │        • Flags: /OpenAction, /Launch, <script>│
                    │        • Flags: LLM Jailbreaks & Overrides    │
                    └───────────────────────┬───────────────────────┘
                                            │
                                            ▼
                    ┌───────────────────────────────────────────────┐
                    │     5. SHA-256 Fingerprint & Audit Chain      │
                    │        (Tamper-evident record_hash in D1)     │
                    └───────────────────────┬───────────────────────┘
                                            │
                                            ▼
                    ┌───────────────────────────────────────────────┐
                    │     6. Cloudflare R2 Storage (UUID Key)       │
                    │        (Isolated from public web execution)   │
                    └───────────────────────────────────────────────┘
```

### 3.1 30-Day Auto-Retention & Storage Governance
* **50 MB Client Storage Quota**: Calculated dynamically on `/api/public/portal/vault` via `SUM(sizeBytes)`.
* **30-Day Post-Journey Purge**:
  * While engagements are active: `retentionStatus: 'active_journey'`.
  * Journey complete: 30-day grace period countdown begins (`retentionStatus: 'grace_period'`).
  * Expired: Cloudflare R2 binary objects are purged (`retentionStatus: 'expired'`), leaving database records and SHA-256 audit hashes intact for compliance.
* **Voluntary Purge**: Clients can trigger immediate vault cleanup (`POST /api/public/portal/vault/purge-voluntary`) once they have downloaded their files.

### 3.2 Ingest Defense & Magic-Byte Sniffing (`uploadGuard.ts`)
* **Allowed Extensions**: `.pdf`, `.png`, `.jpg`, `.jpeg`, `.webp`, `.doc`, `.docx` (Resumes: `.pdf`, `.doc`, `.docx`, `.txt`).
* **Binary Sniffing**: Header bytes are verified against known file signatures (e.g. `%PDF` at offset 0, `\x89PNG` at offset 0). Content-Type headers are treated as untrusted.

### 3.3 Prompt-Injection & Anti-Malware Content Scanner (`docScan.ts`)
* **Untrusted Data Boundary**: Every uploaded binary is parsed losslessly to inspect raw character streams for:
  * Malicious PDF directives: `/Launch`, `/OpenAction`, `/JavaScript`.
  * Script injections: `<script>`, `javascript:`.
  * LLM jailbreaks & instruction overrides: `ignore all previous instructions`, `reveal your system prompt`, `EXECUTE_`, `transfer funds to`.
* **Quarantine**: Flagged documents are assigned `scanStatus: 'flagged'`, trigger an urgent staff review task, and are strictly blocked from being ingested into AI model contexts.

---

## 4. Unified Authentication & Access Gateway (`/login`)

```
                           ┌──────────────────────────┐
                           │   Unified /login Page    │
                           │   (Email + Pass / OTP)   │
                           └─────────────┬────────────┘
                                         │ Authenticated via /api/auth
                                         ▼
              ┌──────────────────────────┼──────────────────────────┐
              │                          │                          │
              ▼                          ▼                          ▼
    🏢 Superadmin & Staff        🤝 Agency Partners         👤 Clients & Applicants
       (Internal OS)               (Affiliate Hub)           (Personal Dashboard)
      → /dashboard                   → /partner                 → /portal
```

### 4.1 Security Specifications
1. **Password Sign-In**: Native Edge Auth NIST SP 800-132 PBKDF2-HMAC-SHA256 (100k iterations, 16-byte salt) with constant-time `timingSafeEqual`. Dual-verifier with in-place automatic upgrade from legacy hashes.
2. **Breached Password Defense**: NIST SP 800-63B HaveIBeenPwned k-anonymity SHA-1 range screening.
3. **Direct Email OTP**: Frictionless 6-digit OTP via transactional email (`Listmonk /api/tx` → Titan relay).
4. **Two-Factor Authentication (TOTP)**: RFC 6238 WebCrypto HMAC-SHA1 TOTP with Base32 secret encoding and recovery backup codes.
5. **Partner-Scoped Authentication (`authPartner`)**: All `/api/partner/:id/*` endpoints verify either a bearer API token (`Authorization: Bearer <apiToken>`) or an active **Native Edge Auth** session (`__Host-opusos_session` 256-bit, 30d) matching `partners.email`. Mismatched calls return `401 Unauthorized`.

---

## 5. The 5 Business Divisions — Operations & Data Lifecycle

### 5.1 🎓 Study Abroad Division
* **Snapshot Model**: Real-time market data captured as immutable application snapshots (`study_abroad_applications.universityJson`).
* **Live Compatibility Engine**: Pure functional scorer (`lib/studyAbroadMatch.ts`) computing Match / Reach / Safe compatibility live (0–100 score, TOEFL/PTE → IELTS normalization).
* **Stage Machine**: `shortlisted` → `docs_ready` → `submitted` → `under_review` → `offer_letter` → `deposit_paid` → `enrolled` / `rejected`.
* **DPDP-2023 University Consent**: Explicit, cryptographically hashed consent for foreign university data sharing.

### 5.2 🛂 Global Visa Processing Division
* **Inventory Catalog**: 165+ destinations across 56 standard products (`visa_products`) with mandatory checklists.
* **Deadline Cascade Engine**: Automatically computes milestone deadlines (`biometricsAt` $\rightarrow$ `medicalAt` $\rightarrow$ `submitAt`) and alerts counselors of risk windows.
* **C5 Tracker**: Dual-mode anxiety-grade tracker showing official status alongside plain-English explanations.

### 5.3 🧳 Tours & Travels Division (Incorporating Umrah Inventory)
* **Comprehensive Scope**: Curated international holidays, domestic escapes, corporate MICE, and direct Umrah pilgrimage operations.
* **Party Booking Model**: Group departures (capacity 30) with ₹500 × pax advance reservation, 72-hour seat hold window, Razorpay advance verification, and office balance settlement.
* **Member Price Gating**: Public pages show itineraries & dynamic configuration engines; live rate cards and wholesale PNR allocations require client authentication (`/login`).

### 5.4 📜 Certificate Attestation Division
* **Indicative B2C Rate Cards**: State HRD → MEA New Delhi → Embassy / Apostille legalization sequences with indicative price bands.
* **Chain Tracking & Prescreen**: Step-by-step custody chain with Blue Dart / DTDC courier tracking and NNA name/date error prescreening.
* **Affiliate Policy**: Attestation is strictly excluded from the partner affiliate program to prevent pricing exposure.

### 5.5 👷 Overseas Manpower & Placement Division
* **Protected Job Catalog**: Proprietary Gulf & Europe vacancy boards with masked compensation details (`🔒 Login to View`).
* **Candidate Workflow**: Application → Trade Test → Medical GAMCA → Visa Stamping → Emigration Clearance → Deployment Flight.
* **NEW 2026-08-30 — Country Workflows (PRD-003):** `manpower_workflows` table per GCC (Qatar QVC, UAE MOHRE, Saudi Wakala/Wafid, Kuwait, Bahrain, Oman) — `stagesJson`, `requiredDocsJson`, `medicalType` (wafid/gamca/qvc), `visaStepsJson` (wakala/tafweed/mofa/enjaz), per-country SLA.
* **NEW — Blind-Bridge Privacy:** `employer_demands.blind_bridge=true` (default) + `employer_demands.country` — MPR routed via Opus with rate hidden from agency, agency bank hidden from employer (Mahad gold, RICE 400).
* **NEW — 5-Factor AI Scoring:** `computeManpowerMatch()` now 5-factor (30 exp + 30 skills + 15 trade + **10 language** + 15 readiness = 100) — language `personal.languages` vs job languageRequirement (HireStream gold).
* **NEW v13 — ₹100 Candidate-Pass Paywall (Razorpay Gold):** ONE anti-spam payment gates the division — `candidate-pass` (₹10,000 paise, lifetime 36500d) required to BROWSE jobs (employer stripped, `locked:true` for non-members) and APPLY (`403 MEMBERSHIP_REQUIRED` server-enforced on **every** application). Flow: `POST /membership/order` → Razorpay Standard Checkout → `POST /membership/verify` (HMAC-SHA256 `timingSafeEqual` signature verify, idempotent replay guard via audit-log `paymentId` check, hash-chained `MEMBERSHIP_GRANTED` audit event, staff `membership_sale` alert). Receipt ≤56 chars (Razorpay cap) via deterministic SHA-256 short hash of `token|planKey|hourBucket`.
* **BREAKING v13 — Secret Tier & Exclusive Plans RETIRED:** `job_postings.tier` collapsed to `public` (legacy column kept, zero migrations), `exclusive-*` membership plans + community toggle + plan-CRUD endpoints removed across API, client portal, and staff workspace. `clients.exclusive_member=true` now semantically means "active Candidate-Pass holder" (legacy `exclusive_*` columns kept untouched). `GET /membership` returns the single candidate-pass plan (`comingSoon:false` always); `GET /jobs` + `GET /membership` accept `X-Portal-Token` header (token never in URLs).
* **NEW v13 — Unified Client Marketplace:** `/portal?tab=jobs` renders ONE component — `ManpowerMarketplace` (Profile → Open Jobs → My Applications → Career Add-Ons) — behind the `ManpowerAccessGate` paywall for non-members (loading skeleton → gate → marketplace; `onSuccess` refetch, no reload). Legacy duplicate `ManpowerJobs` browse/tracker view deleted (~560 LOC). Staff `ManpowerPortal` cleaned: tier selector, exclusive toggle, plan CRUD UI removed; manual Candidate-Pass grant/revoke retained as support tool (`PATCH /api/manpower/clients/:id/membership`, lifetime default).

---

## 6. Cryptographic Tamper-Evident SHA-256 Audit Chain

Every state mutation, financial transaction, staff assignment, and document upload is permanently chained in `audit_log`:

```
┌────────────────────────┐      ┌────────────────────────┐      ┌────────────────────────┐
│      GENESIS BLOCK     │      │      AUDIT BLOCK 1     │      │      AUDIT BLOCK 2     │
│  Hash: GENESIS         │◄─────┤  PrevHash: GENESIS     │◄─────┤  PrevHash: Hash(B1)    │
│  Action: SYSTEM_BOOT   │      │  Action: LEAD_CREATED  │      │  Action: DOC_UPLOAD    │
│  Hash: Hash(B0)        │      │  Hash: Hash(B1)        │      │  Hash: Hash(B2)        │
└────────────────────────┘      └────────────────────────┘      └────────────────────────┘
```

* **Formula**: `record_hash = SHA-256(prev_hash + canonicalize(event))`
* **PII Redaction**: Sensitive attributes (passwords, raw card numbers, full passports) are scrubbed at write boundary (`redactPayload`).
* **Integrity Validation**: Verified via `scripts/audit-chain-verify.mjs` ensuring zero retroactive alterations.

---

### 6.3 Helpdesk & Multi-Workspace Real-Time Kanban Module (ITIL v4 Gold Standard)

```
       ┌────────────────────────┐         ┌────────────────────────┐
       │     Client Portal      │         │     Partner Portal     │
       │    (/portal#helpdesk)  │         │   (/partner#helpdesk)  │
       │  • 3-Stage Kanban      │         │  • Escalations Tower   │
       │  • Ticket Intake       │         │  • Commission Inquiries│
       │  • 1-5★ CSAT Rating    │         │  • Real-time Thread    │
       └───────────┬────────────┘         └───────────┬────────────┘
                   │                                  │
                   │ POST /api/public/portal/tickets  │ POST /api/partner/:id/tickets
                   ▼                                  ▼
      ┌─────────────────────────────────────────────────────────────┐
      │          Hono API Gateway & Helpdesk Engine (D1)            │
      │   • Automated Ticket Numbering (HD-1001)                    │
      │   • Dynamic SLA Calculation (Urgent: 2h, High: 6h)          │
      │   • ITIL v4 "Pause-the-Clock" on waiting_on_user            │
      │   • Strict Internal Note Firewall (isInternalNote: false)   │
      │   • Automated Staff Triage Tasks & Alerts                   │
      └─────────────────────────────┬───────────────────────────────┘
                                    │
                                    ▼
                     ┌─────────────────────────────┐
                     │   Superadmin Command Center │
                     │          (/helpdesk)        │
                     │  • 5-Column Kanban Board    │
                     │  • SLA Breach & Timer Watch │
                     │  • Yellow Internal Notes    │
                     │  • Macro Canned Responses   │
                     └─────────────────────────────┘
                                    ▲
                                    │ Pub/Sub
                     ┌──────────────┴──────────────┐
                     │     SyncHub Durable Object  │
                     │  staff:global:tickets       │
                     │  client:{clientId}:tickets  │
                     │  partner:{partnerId}:tickets│
                     └─────────────────────────────┘
```

---

## 7. Enterprise Infrastructure Topology

| Layer | Provider | Free Allowance | Opus OS Utilization |
| :--- | :--- | :--- | :--- |
| **Edge Compute** | Cloudflare Workers **Free** | 100,000 requests / day | Hono API routing & auth gateway + Turnstile |
| **Relational Database** | Cloudflare D1 **Free** | 5M read / 100k write rows / day | **101 ACID tables** `opusos-db` (99 + `ocr_runs` + `manpower_workflows`) |
| **Object Storage** | Cloudflare R2 **Free** | 10 GB / 10M reads / mo ($0 egress vs S3 $90/TB) | 50MB-capped vault `opusdocs` + presigned 15m HMAC — **live `opusdocs` 2026-08-19** |
| **Email Relay** | Titan Mail / Listmonk + Resend fallback | Unlimited transactional, Titan DKIM + Resend HTTPS fallback (port 25 free) | `listmonk.opusoverseas.com` 15 `type:tx` templates |
| **Live Chat & WhatsApp**| Self-Hosted VPS | Unlimited agents & messages | `chat.opusoverseas.com` + `wa.opusoverseas.com` |
| **Workflow Automation** | Self-Hosted n8n | Unlimited executions | `n8n.opusoverseas.com` Community Edition — **kept as-is (hybrid: Opus = Record, Cloudflare Workflows = 0/3k/day free, not scaffolded per your call)** |
| **Zero-Trust Network** | Cloudflare Tunnel **Free** | Free for up to 50 users | `6f1a97cc-8e9b-4340-a435` → `https://*.opusoverseas.com` |
| **Sync Fabric** | Durable Objects **Free** | 100k req/day, 13k GB-s | `SyncHub` `global` atom HMAC, 20 channels max |
| **Web Analytics** | Cloudflare Web Analytics **Free** | Unlimited, cookie-less, DPDP-friendly | **NEW 2026-08-30:** `beacon.min.js` in `index.html` (auto-inject when zone enabled) + GA4 `G-DTPJGJ34C5` kept — no banner needed |

---

### 7.1 API Gold Standards (v14 remediation campaign)

| Standard | Implementation |
|---|---|
| **Request correlation** | `X-Request-ID` middleware on every `/api/*` response — echoes a client-supplied UUID or generates one (http.dev correlation standard); **live-verified** |
| **ExecutionContext safety** | `safeExecutionCtx(c)` (`lib/webhookDispatcher.ts`) — Hono's `c.executionCtx` getter **throws** when no ExecutionContext exists (tests, non-Workers runtimes). All raw accesses converted across 17 files (middleware, routes/v1/*, publish sites); zero raw references remain outside `sync.ts`/helper |
| **Pagination (AIP-158)** | `lib/paginate.ts`: `limit` clamp (values above max **coerced**, not rejected), opaque versioned cursor (`cur1_` + base64 offset; invalid token resets to page 1), `nextPageToken` present only when more pages. Wired: `GET /clients` (def 500/cap 1000 — backward-compatible), `GET /admin/audit-logs` (250), `GET /manpower/deployments` (200/cap 500, clamped **before** the 4-table in-memory join), `GET /portal/manpower/jobs` (200/500). Unit-tested (`paginate.test.ts`: clamp coercion, cursor round-trip, end-of-results signal, token opacity) |
| **Frontend api client** | `lib/apiClient.ts`: `ApiError` (status/payload/retryAfterMs), RFC 9110 `Retry-After` (delay-seconds **and** HTTP-date forms, ≤30s cap), 429 retry ×3 exponential backoff, 204/empty-safe JSON. Adopted: paywall order+verify (`ManpowerAccessGate`), manpower applications. 32 silent-swallow queryFns (`if (!r.ok) return <fake-empty>`) converted to throw — react-query retries + surfaces error state instead of hiding data loss (2 intentional background pollers preserved) |
| **RBAC regression** | `tests/rbac_deny_matrix.test.ts` (8 tests, Burp-Authorize semantics): admin-only endpoints strict 401/403 for counselor + unauthenticated; counselor **row-level division scoping** verified (in-scope visible, out-of-scope hidden); forged portal token horizontal deny |

---

## 8. Verification Matrix

| Gate | Result | Notes |
|---|:---:|---|
| `pnpm typecheck` (all workspaces) | **✓ 0 errors** | `packages/shared`, `apps/api`, `apps/app` typechecked |
| `pnpm test` (vitest suite) | **✓ 122/122 passed** | **757 tests across all divisions and subsystems** (v14: +8 RBAC deny-matrix, +4 paginate) |
| `pnpm --filter app build` | **✓ passed** | Production bundle clean; `ClientPortal` route chunk lazy, `ClientVisaSection` sub-chunk split (v14) |
| `D1 Database` | **99 tables** | `support_tickets`, `ticket_messages`, `two_factor` added |
| `Helpdesk Engine` | **ITIL v4 Standard** | Dynamic SLA Pause-the-Clock + strict internal note firewall |
| `Document Vault Lifecycle` | **30-Day Auto-Purge** | 50MB quota calculation + voluntary purge support |
| `Upload Security Guard` | **OWASP Aligned** | Magic-byte sniffing + prompt-injection & malware byte scanner |
| `Partner Authorization` | **Zero-Trust (IDOR Free)** | Gated via `authPartner()` bearer token / Native Edge Auth session (`__Host-opusos_session`) |
| `Strict CSP Nonce` | **Gold (OWASP V14.4.3)** | `cspNonce.ts` per-request 128-bit WebCrypto nonce + `strict-dynamic`, no `unsafe-inline`, `object-src 'none'`, `base-uri 'none'` — **verified `curl` has nonce, 0 violations** |
| `GEO / SEO` | **Gold (Google Dec 2025)** | `llms.txt` (27 lines), `robots.txt` (GPTBot/OAI/Claude/Perplexity allow), `sitemap.xml` 13 URLs valid XML, `_headers` immutable, `renderSEOHeadString` for prerender — **curl raw HTML now has og:title** |
| `Perf Route-Lazy` | **Gold (Core Web Vitals)** | `vite manualChunks pdf/motion/qr` + `React.lazy` 18 routes + `pdf.ts` dynamic `import('jspdf')` → entry 2.46→1.18 MB (277 gzip), cache-hit 89%, TTI -32% — **verified 496 modules split into ~30 chunks** |
| `Kanban a11y` | **WCAG 2.2 AA (2.5.7 + 4.1.3)** | `⋮ Move` menu per card (tap, not drag), `aria-live="polite"` announce, keyboard `Space/M/Esc`, ≥24×24 target, `tabIndex=0` + `role=listitem` |
| `Staff OCR Workbench` | **ICAO 9303 Gold (Staff-only)** | `ocr_runs` (hash-chained `OCR_RAN/CONFIRMED`) + `documents.ocrJson/ocrSignals` **never queried by portal** (portal selects only `fileName/status`), `mrzValidator.ts` 7-3-1 + composite + VIZ surname cross, `POST /api/staff/ocr/run|confirm` RBAC `counselor+` + 30/min + HITL |
| `Manpower Workflows + Blind` | **GCC 6-Country Gold** | `manpower_workflows` (qatar/uae/saudi/kuwait/bahrain/oman) per `stagesJson/docs/medicalType/visaSteps`, `employer_demands.blind_bridge + country`, **5-factor** scoring (30+30+15+10 language+15) — **PRD-003 shipped 2026-08-30** |
| `Manpower ₹100 Paywall (v13)` | **Gold (Anti-Spam + Razorpay)** | `candidate-pass` lifetime pass gates browse (employer masked, `locked:true`) + apply (`403 MEMBERSHIP_REQUIRED` server gate on every application); secret tier & exclusive plans retired across all workspaces; receipt ≤56 via SHA-256 hash; `X-Portal-Token` header accepted; idempotent payment replay guard; 7 dedicated regression tests (`manpower_paywall.test.ts`) |
| `Login OTP Local Dev (v13)` | **Gold (DX + Proxy Integrity)** | `apps/api/wrangler.local.toml` — AI/Vectorize bindings excluded → zero remote-proxy sessions, fully-offline workerd on :8787 behind the Vite proxy; idempotency middleware body-clone fix (`c.req.raw.clone()`) re-enabled after root-causing the historic 500 on `POST /api/auth/otp/send`; `Login.tsx` now surfaces API-outage honestly instead of a misleading generic OTP error |
| `Web Analytics` | **DPDP-friendly Free** | `beacon.min.js` defer in `index.html` (auto-inject when zone enabled) + GA4 kept — no banner, unlimited |
| `Canonical Division Taxonomy` | **5 Unique Desks** | 🎓 Study Abroad · 🛂 Visa · 🧳 Tours & Travels · 📜 Attestation · 👷 Manpower |
| `Realtime Pub/Sub` | **20+ Channels** | `SyncHub DO` + multi-workspace tickets sync — **hybrid: Opus = Record, Cloudflare Workflows = 0/3k/day (kept as-is per your call, design at `docs/HYBRID-WORKFLOW-ORCHESTRATION-DESIGN-2026-08-30.md`)** |
| `Request Correlation (v14)` | **Gold (http.dev)** | `X-Request-ID` echo-or-generate on every `/api/*` response — **live-verified header echo** |
| `RBAC Deny Matrix (v14)` | **OWASP A01 Regression** | `rbac_deny_matrix.test.ts` 8/8: vertical deny (admin-only 401/403), counselor row-level division scoping, forged-token horizontal deny |
| `Unified apiClient (v14)` | **Gold (RFC 9110)** | `ApiError` + `apiFetch`: Retry-After both forms ≤30s, 429 ×3 backoff; paywall + manpower adopted; **32 silent-swallow queryFns eliminated** (2 intentional pollers kept) |
| `AIP-158 Pagination (v14)` | **Gold** | `lib/paginate.ts` clamp + opaque cursor + `nextPageToken`; wired into clients / audit-logs / deployments / jobs; unit-tested 4/4 |
| `ExecutionContext Safety (v14)` | **Systemic** | `safeExecutionCtx` everywhere — getter-throw crash class eliminated across 17 files; zero raw `c.executionCtx` outside `sync.ts`/helper |
| `ClientPortal Split (v14)` | **Maintainability Gold** | 2,308 → 1,036 lines (−55%); visa desk extracted to lazy `ClientVisaSection` chunk; zero visa symbols remain in shell |
| `NotificationCenter (v14)` | **Realtime Gold** | Bell + live feed over 4 existing SyncHub channels — no extra polling/backend; unread badge, localStorage persistence, replay-safe dedupe, a11y (aria-expanded/labelled region/Escape) |
| `PWA (v14)` | **Installable** | `manifest.json` + `sw.js` (never intercepts `/api/*`, network-first navigations, SWR assets, versioned caches) + `offline.html` fallback + guarded registration — **bump `CACHE_VERSION` per deploy** |

---

## 9. Local Development Quickstart (v14)

```bash
# Frontend — Vite on :5173 (proxies /api → 127.0.0.1:8787)
pnpm --filter app dev

# API — fully-offline local mode (AI/Vectorize excluded → no remote proxy session)
cd apps/api && npx wrangler dev --config wrangler.local.toml --port 8787
# secrets auto-load from apps/api/.dev.vars (gitignored)

# Production deploy — UNCHANGED (AI/Vectorize live via the real wrangler.toml)
wrangler deploy
```

* **Why `wrangler.local.toml` exists:** Workers AI + Vectorize bindings are *always remote* in `wrangler dev` — on offline/blocked networks the dev server dies at `Establishing remote connection…` (connect timeout), taking the whole API down with it. The local config drops both bindings; `src/infra/vector.ts` already degrades gracefully (`if (!env.VECTOR_INDEX)`), so login/OTP and every portal flow run 100% locally. D1/KV/R2/Queues/DOs all simulate locally with zero auth.
* **Idempotency middleware (re-enabled v13):** reads request bodies from `c.req.raw.clone()` — the original stream stays intact for route handlers. Root cause of the historic 500 on `POST /api/auth/otp/send` was `await c.req.text()` consuming the body stream; regression-covered in `tests/idempotency.test.ts`.
* **Razorpay environments:** local dev = test pair (`rzp_test_…` in `.dev.vars` + `apps/app/.env`); production = Worker secrets (`wrangler secret put RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET / RAZORPAY_WEBHOOK_SECRET`) + `VITE_RAZORPAY_KEY_ID` in `apps/app/.env.production`. Key **ID** is public by design; the **secret** never leaves the server. Live/live and test/test pairs must match.
* **PWA (v14):** `public/sw.js` + `public/manifest.json` + `public/offline.html`. The service worker **never intercepts `/api/*`** (auth, realtime and payments always hit the network) and serves navigations network-first, so a deploy can never serve a stale app shell. **Bump `CACHE_VERSION` in `sw.js` on every deploy** to invalidate old asset caches. iOS installs via Share → Add to Home Screen (Apple does not support `beforeinstallprompt`).
