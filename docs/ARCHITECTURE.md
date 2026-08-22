# Opus OS — Complete Architecture Map

> **Version:** 2026-08-22 (v5 — Tri-Workspace Realtime Sync, Wholesale/Retail Isolation, Listmonk Email Engine & Live In-App Helpdesk)  
> **Status:** Live & Unified (Cloudflare Workers API + SQLite D1 + R2 Vault + Persistent VPS Docker Tunnel + n8n Event Fabric)

---

## 1. System Overview

```
                                ┌───────────────────────────────────────────────────────────┐
                                │                     USERS & ROLES                         │
                                │   Public Leads · Verified Clients · Agency Partners · Staff │
                                └─────────────────────┬───────────────────┬─────────────────┘
                                                      │                   │
                             ┌────────────────────────▼─────┐   ┌─────────▼──────────────┐
                             │     CLOUDFLARE EDGE (prod)   │   │   EXTERNAL SERVICES    │
                             │  ─────────────────────────   │   │  ────────────────────  │
                             │  Workers API (Hono.js)       │   │  Razorpay (Payments)   │
                             │  D1 (opusos-db ACID Relational)  Titan Mail (MX Relay)│
                             │  R2 Encrypted Document Vault │   │  Google (GA4/GSC/GCP)  │
                             │  KV Cache · Turnstile AntiSpam│  │  Cal.com (Scheduling)  │
                             │  BetterAuth (D1 Adapter)     │   │                        │
                             └──────────────┬───────────────┘   └────────────────────────┘
                                            │
                       ┌────────────────────┴─────────────────────┐
                       │    PERMANENT CLOUDFLARED TUNNEL          │
                       │   Tunnel ID: 6f1a97cc-8e9b-4340-a435     │
                       │   16 Subdomains with Zero-Trust Guard    │
                       └────────────────────┬─────────────────────┘
                                            │
                                ┌───────────▼──────────────────────────────┐
                                │   ORACLE VPS (129.159.238.227)           │
                                │   37 Docker containers, 16 apps          │
                                │   • Listmonk (Transactional Mail Engine) │
                                │   • Chatwoot (Omnichannel Staff Inbox)   │
                                │   • OpenWA (WhatsApp Webhook Engine)     │
                                │   • n8n (Async Workflow Orchestration)   │
                                │   • ERPNext (GST Invoicing & Ledger)     │
                                └──────────────────────────────────────────┘
```

---

## 2. Tri-Workspace Real-Time Synchronization Matrix

Opus OS is built around **three strictly synchronized, role-isolated workspaces** sharing a single source of truth in Cloudflare D1:

```
┌───────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                     👑 SUPERADMIN & STAFF CRM                                     │
│  • Staff Roster & Dynamic Counselor Assignment (`GET /api/clients/staff-roster`, `PATCH /assign`) │
│  • Document Verification & Rejection Feedback Loop (`POST /api/visa/documents/:id/status`)        │
│  • Wholesale Pricing & Margin Management (`wholesalePricePaise` vs `retailPricePaise`)            │
│  • Unified Staff Messaging Inbox (`/inbox` — Chatwoot, WhatsApp, Email)                          │
└─────────────────────────────────▲───────────────────────────────────▲─────────────────────────────┘
                                  │ (Realtime D1 Sync)                │ (Attribution & Payouts)
                                  ▼                                   ▼
┌─────────────────────────────────────────────────┐   ┌─────────────────────────────────────────────┐
│               👤 CLIENT WORKSPACE               │   │            🤝 PARTNER WORKSPACE             │
│  • 5-Stage Live Enrolled Services Kanban Board  │   │  • Live Referred Candidate Pipeline Kanban  │
│  • Dynamic Assigned Counselor Live Desk Card    │   │  • Gross Retail Commission Ledger & Payouts │
│  • 1-Click In-App Counselor Live Chat (Chatwoot)│   │  • 1-Click Division Deep Links & QR Studio  │
│  • Document Vault (Instant status sync)         │   │  • VIP Loyalty Points Ladder (Thrive Engine)│
│  • Retail-Only Service Catalogues (5 Divisions) │   │  • Strict Isolation (No Private Client Docs)│
└─────────────────────────────────────────────────┘   └─────────────────────────────────────────────┘
```

### 2.1 Workspace Data Flow & Boundary Isolation Rules

| Domain / Field | Superadmin / Staff CRM | Client Portal (`/portal`) | Partner Dashboard (`/partner`) | Boundary Security Rule |
| :--- | :--- | :--- | :--- | :--- |
| **Assigned Counselor** | Full control to assign/reassign any staff user across student engagements. | Displays live assigned staff name, role, and direct chat button. | Displays assignment status indicator only. | ✅ Counselor emails & internal user IDs are masked. Direct communication is handled via in-app Chatwoot. |
| **Pricing & Margins** | Full visibility into supplier cost (`wholesalePricePaise`) and gross margin. | Displays **ONLY Retail Customer Fee** (`retailPricePaise` in integer paise / ₹). | Displays **Gross Retail Customer Price** and percentage commission. | ✅ **Strict Isolation**: `wholesalePricePaise` and supplier names are stripped at the API boundary across all public/portal endpoints. |
| **Documents & KYC** | Full document inspection, virus scan status, and verification controls. | Uploads via presigned R2 URLs; sees green `verified` badge or red `correction required` notes. | Sees candidate checklist progress (`Received / Pending`) without access to private files. | ✅ **DPDP-2023 Compliant**: Client documents are access-controlled and strictly isolated from partners. |
| **Internal Notes & Fraud Score** | Staff-only internal CRM notes (`clients.notes`, `intakeContext`). | **Hidden**. | **Hidden**. | ✅ Zero leakage of internal notes, staff commentary, or fraud scoring to external surfaces. |
| **Pipeline Progression** | Moves Kanban cards across stages (`lead` $ightarrow$ `complete`). | Stage updates live in client's 5-column service pipeline. | Stage updates live in partner's 5-column referral pipeline. | ✅ State transitions are synchronized in real-time. |

---

## 3. Unified Authentication & Access Gateway (`/login`)

Opus OS implements a **single, unified, role-aware authentication gateway** that eliminates login confusion across user tiers while maintaining strict Zero-Trust role isolation:

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

### 3.1 Security Specifications
1. **Password Sign-In**:
   * Email + Argon2/scrypt hashed password credentials via BetterAuth D1 adapter.
   * Real-time Caps Lock Detection (`⚠️ Caps Lock is ON`).
   * Session persistence (*"Remember session for 30 days"*).
2. **Direct Email OTP**:
   * Frictionless 6-digit one-time passcode delivered via transactional email (`Listmonk /api/tx` $ightarrow$ Titan relay).
3. **Two-Factor Authentication (TOTP)**:
   * Time-based 6-digit rolling code authenticator support (Google Authenticator, 1Password) enforced for administrative and elevated roles.
4. **Brute-Force & Lockout Guard**:
   * Rate-limited to 5 failed attempts per 15-minute sliding window with bounded audit logging (`LOGIN_FAILED`, `LOGIN_SUCCESS`).
5. **Intelligent Workspace Dispatch**:
   * `super_admin`, `manager`, `counselor`, `coordinator`, `receptionist` $ightarrow$ `/dashboard`
   * `partner` $ightarrow$ `/partner`
   * `client`, `user` $ightarrow$ `/portal`

---

## 4. Transactional Email System Architecture (Listmonk v6.2 + Cloudflare Worker Fallback)

The email subsystem operates on a **zero-gibberish, scalar-bound templating model**:

```
 ┌─────────────────────────────────────────────────────────────┐
 │                     Opus OS Workers API                     │
 │  (auth.ts · routes/agreements.ts · routes/portal.ts · etc.) │
 └──────────────────────────────┬──────────────────────────────┘
                                │
               Calls sendNotification(env, db, input)
                                │
                                ▼
 ┌─────────────────────────────────────────────────────────────┐
 │                apps/api/src/infra/notify.ts                 │
 │  • Resolves templateId via getListmonkTemplateId(env, kind) │
 │  • Passes SCALAR DATA MAP { Name, VerifyUrl, Amount, ... }  │
 │  • Bypasses pre-rendered HTML interpolation into raw tags   │
 └──────────────────────────────┬──────────────────────────────┘
                                │
       ┌────────────────────────┴────────────────────────┐
       ▼ (Primary)                                       ▼ (Fallback)
┌─────────────────────────────────┐             ┌─────────────────────────────────┐
│     LISTMONK TRANSACTIONAL      │             │    CLOUDFLARE EMAIL WORKERS     │
│   (listmonk.opusoverseas.com)   │             │       (env.EMAIL Binding)       │
│  • 13 Dedicated type:tx tpls    │             │  • Auto-detects pre-rendered    │
│  • Native Go html/template      │  Failover   │    HTML vs Plain Text           │
│  • DKIM / SPF / Titan Relay     ├────────────►│  • Zero-tag auto-linking        │
│  • Returns remoteId             │             │  • Direct SMTP relay            │
└─────────────────────────────────┘             └─────────────────────────────────┘
```

### 4.1 Verified Transactional Email Catalog (15 Operational Types)

| # | Kind | Listmonk ID | Subject Pattern | Bound Scalar Parameters |
| :--- | :--- | :---: | :--- | :--- |
| 1 | `verify` | **15** | *Verify & Activate Your Opus Overseas Account* | `Name`, `VerifyUrl`, `BannerText` |
| 2 | `passwordReset` | **16** | *Reset Your Opus Overseas Password* | `Name`, `ResetUrl`, `ExpiryMinutes` |
| 3 | `otp` | **17** | *Your Opus Overseas Code: {{otpCode}}* | `OtpCode`, `BannerText` |
| 4 | `paymentReceipt` | **18** | *Opus Overseas — payment receipt {{paymentId}} (₹{{amount}})* | `ClientName`, `Amount`, `MilestoneName`, `PaymentId`, `DateStr`, `PortalUrl` |
| 5 | `agreementInvite` | **19** | *Action Required: Please sign your {{agreementTitle}}* | `ClientName`, `AgreementTitle`, `SignUrl`, `ExpiryDays` |
| 6 | `agreementExecuted` | **20** | *Executed Copy: {{agreementTitle}}* | `ClientName`, `AgreementTitle`, `DownloadUrl`, `SignedDate` |
| 7 | `studyAbroadMilestone` | **21** | *Study Abroad Update: {{universityName}} — {{stageTitle}}* | `ClientName`, `UniversityName`, `CourseName`, `StageTitle`, `Details`, `PortalUrl` |
| 8 | `attestationProgress` | **22** | *Attestation Update: {{documentType}} — {{currentStage}}* | `ClientName`, `DocumentType`, `CurrentStage`, `Country`, `AwbNumber`, `PortalUrl` |
| 9 | `partnerPayout` | **23** | *Payout approved/settled — ₹{{amount}}* | `TitleText`, `PartnerName`, `StatusWord`, `Amount`, `PayoutId`, `PortalUrl` |
| 10 | `payoutRequestReceived` | **24** | *Payout request received — ₹{{amount}}* | `PartnerName`, `Amount`, `DateStr`, `StatusText`, `PortalUrl` |
| 11 | `consultationConfirmed` | **25** | *Consultation Confirmed: {{meetingTime}}* | `ClientName`, `CounselorName`, `MeetingTime`, `MeetingLink` |
| 12 | `documentVerified` | **26** | *Document verified — {{fileName}}* | `ClientName`, `FileName`, `StatusText`, `PortalUrl` |
| 13 | `nurtureTouch` | **27** | *{{heading}}* | `Heading`, `LeadName`, `MessageBody`, `CtaLabel`, `CtaUrl` |
| 14 | `bookingConfirmation` | **25** | *Consultation Confirmed: {{meetingTime}}* | `ClientName`, `CounselorName`, `MeetingTime`, `MeetingLink` |
| 15 | `genericFallback` | **5** | *{{Subject}}* | `Subject`, `Body` |

---

## 5. Live In-App Support & Omnichannel Messaging Architecture

Opus OS integrates **Chatwoot** as the core live communication engine, mounted seamlessly across all user interfaces:

```
                            ┌────────────────────────────────────────────────────────┐
                            │                 CLIENT / PARTNER UI                    │
                            │           (<ChatWidget /> Component)                   │
                            └───────────────────────────┬────────────────────────────┘
                                                        │
                            1. Boots via window.chatwootSDK.run()
                            2. Identifies User: window.$chatwoot.setUser(id, { name, email })
                            3. In-App Buttons trigger: window.$chatwoot.toggle()
                                                        │
                                                        ▼
                            ┌────────────────────────────────────────────────────────┐
                            │           CHATWOOT MESSAGING ENGINE                    │
                            │             (chat.opusoverseas.com)                    │
                            └───────────────────────────┬────────────────────────────┘
                                                        │
                               ┌────────────────────────┴────────────────────────┐
                               │                                                 │
                               ▼                                                 ▼
                ┌─────────────────────────────┐                   ┌─────────────────────────────┐
                │      STAFF INBOX DESK       │                   │     WHATSAPP BRIDGE (VPS)   │
                │        (apps/app/inbox)     │                   │   (OpenWA :2785 Webhooks)   │
                │  • Live Real-Time Chat      │                   │  • Inbound message sync     │
                │  • Linked Student CRM Data  │                   │  • Outbound template alerts │
                │  • Counselor Reassignment   │                   │  • 2-way conversation sync  │
                └─────────────────────────────┘                   └─────────────────────────────┘
```

---

## 6. The 5 Business Divisions — Operations & Data Lifecycle

Opus OS powers 5 distinct business divisions with strict compliance and integer-paise financial precision:

### 6.1 🎓 Study Abroad Division
* **Snapshot Architecture**: Real-time market data captured as immutable application snapshots (`study_abroad_applications.universityJson`).
* **Live Compatibility Engine**: Pure functional scorer (`lib/studyAbroadMatch.ts`) computing Match / Reach / Safe compatibility live (0–100 score, TOEFL/PTE $ightarrow$ IELTS normalization) without polluting the database.
* **Stage Machine**: `shortlisted` $ightarrow$ `docs_ready` $ightarrow$ `submitted` $ightarrow$ `under_review` $ightarrow$ `offer_letter` $ightarrow$ `deposit_paid` $ightarrow$ `enrolled` / `rejected`.
* **DPDP-2023 University Consent**: Student Profile Wizard captures explicit, cryptographically hashed consent for foreign university data sharing.

### 6.2 ✈️ Global Visa Processing Division
* **Inventory Catalog**: 165+ destinations across 56 standard products (`visa_products`) with entry types, processing turnaround times, and mandatory document checklists.
* **Wholesale Margin Guard**: Base consular fees are strictly isolated from customer retail rates.
* **Document Verification**: Staff review queue with presigned R2 downloads, instant `verified`/`rejected` toggles, and auto-generated client correction tasks.

### 6.3 🕋 Umrah & Spiritual Travel Division
* **Inventory & Family Pricing**: 60-column package catalog (`umrah_packages`) supporting Quad/Triple/Double sharing, solo supplement rates, and granular child/infant pricing components.
* **Party Booking Model**: Group departures (capacity 30) with ₹500 $	imes$ pax advance reservation, 72-hour seat hold window, Razorpay advance verification, and office balance settlement.
* **Automated Expiry Release**: Self-healing hold release for unpaid slots past 24 hours without cron overhead.

### 6.4 📑 Certificate Attestation Division
* **B2C Indicative Rate Cards**: State HRD $ightarrow$ MEA New Delhi $ightarrow$ Embassy / Apostille legalization sequences with indicative price bands.
* **Originals Transit Tracking**: Step-by-step custody chain, Blue Dart / DTDC courier AWB integration, and doorstep pickup scheduling.

### 6.5 💼 Overseas Manpower & Careers Division
* **Protected Job Catalog**: Proprietary Gulf & Europe vacancy boards with masked compensation details (`🔒 Login to View`) safeguarding corporate clients.
* **Candidate Workflow**: Application $ightarrow$ Trade Test $ightarrow$ Medical GAMCA $ightarrow$ Visa Stamping $ightarrow$ Emigration Clearance $ightarrow$ Deployment Flight.

---

## 7. Cryptographic Tamper-Evident SHA-256 Audit Chain

Every state mutation, financial transaction, staff assignment, and document verification is permanently chained in `audit_log`:

```
┌────────────────────────┐      ┌────────────────────────┐      ┌────────────────────────┐
│      GENESIS BLOCK     │      │      AUDIT BLOCK 1     │      │      AUDIT BLOCK 2     │
│  Hash: GENESIS         │◄─────┤  PrevHash: GENESIS     │◄─────┤  PrevHash: Hash(B1)    │
│  Action: SYSTEM_BOOT   │      │  Action: LEAD_CREATED  │      │  Action: PAYMENT_ENTER │
│  Hash: Hash(B0)        │      │  Hash: Hash(B1)        │      │  Hash: Hash(B2)        │
└────────────────────────┘      └────────────────────────┘      └────────────────────────┘
```

* **Formula**: `record_hash = SHA-256(prev_hash + canonicalize(event))`
* **PII Redaction**: Sensitive attributes (passwords, raw card numbers, full passports) are scrubbed at write boundary (`redactPayload`).
* **Verification Suite**: Verified in CI/CD via `scripts/audit-chain-verify.mjs` ensuring zero retroactive alterations.

---

## 8. Enterprise Zero-Cost Infrastructure Topology

Opus OS operates on a permanent **$0 monthly software and hosting budget**:

| Layer | Provider | Free Allowance | Opus OS Utilization |
| :--- | :--- | :--- | :--- |
| **Edge Compute** | Cloudflare Workers | 100,000 requests / day | Sub-10ms Hono API routing & auth gateway |
| **Relational Database** | Cloudflare D1 | 5M read / 100k write rows / day | 89 ACID relational tables (`opusos-db`) |
| **Object Storage** | Cloudflare R2 | 10 GB / 10M reads / mo ($0 egress) | Encrypted document vault for passports & KYC |
| **Email Relay** | Titan Mail / Listmonk | Unlimited transactional | Transactional emails via authenticated domain relay |
| **Live Chat & WhatsApp**| Self-Hosted VPS | Unlimited agents & messages | Chatwoot + OpenWA Docker containers |
| **Workflow Automation** | Self-Hosted n8n | Unlimited executions | Community Edition on `n8n.opusoverseas.com` |
| **Zero-Trust Network** | Cloudflare Tunnel | Free for up to 50 users | Persistent QUIC tunnel (`6f1a97cc-8e9b-4340-a435`) |

---

## 9. Monorepo Structure & Key Directory Map

```
Opus OS/
├── apps/
│   ├── api/                     # Cloudflare Workers Backend (Hono.js)
│   │   ├── src/
│   │   │   ├── auth.ts          # BetterAuth D1 engine & transactional email hooks
│   │   │   ├── db/schema.ts     # 89 Drizzle SQLite relational tables
│   │   │   ├── infra/           # Listmonk, Messaging, Notify, EmailTemplates
│   │   │   ├── middleware/      # RBAC, RateLimit, Audit Hash Chain
│   │   │   └── routes/          # Clients, Visa, Umrah, StudyAbroad, Attestation, Portal
│   │   └── migrations/          # Incremental Drizzle D1 SQL migrations (0001-0074)
│   │
│   └── app/                     # React 19 + Vite SPA Frontend
│       └── src/
│           ├── components/      # ClientDashboardHub, PartnerDashboardHub, ChatWidget
│           ├── pages/           # ClientPortal, PartnerDashboard, Dashboard, Login
│           └── lib/             # Session, Motion (GSAP), VisibilityTracking, Umami
│
├── packages/
│   ├── shared/                  # Zod validation schemas & shared contracts
│   └── integrations/            # n8n workflow blueprints & OpenAPI specs
│
└── docs/                        # Specifications, Architecture, and Audit Reports
    ├── ARCHITECTURE.md          # Complete living system architecture map
    └── IMPLEMENTATIONS-*.md     # Chronological implementation verified records
```
