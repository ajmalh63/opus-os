# Opus OS — Complete Architecture Map

> **Version:** 2026-08-25 (v7 — Fluent Workspace: Blog Gold + Phase A 4 + Visa/Attestation Gold 14 + C1-C6/P1-P3 + Domain-Native Tunnel + L5/L6/L7 Hardening + Realtime Sync All)  
> **Status:** Live & Unified (Cloudflare Workers API + D1 97 tables + R2 Vault + SyncHub DO + Domain-Native VPS Tunnel)  
> **Build:** `typecheck ✓` `build ✓ 2,134kB` `D1 local+remote 97 tables` `secrets domain https://wa.opusoverseas.com`

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
                             │  D1 opusos-db 97 tables ACID │   │  Titan Mail (MX Relay) │
                             │  R2 Encrypted Vault (10GB)   │   │  Google GA4/GSC/CF WA  │
                             │  SyncHub DO global atom HMAC │   │  Meta Graph v21.0 WA   │
                             │  KV Cache · Turnstile        │   │  Cal.com (Scheduling)  │
                             │  BetterAuth D1 + 2FA TOTP    │   │                        │
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

**Change v6→v7:** No `100.87.71.38` in runtime `apps/` (only `aiGuardrails` test fixture). `secrets.json` `OPENWA_BASE_URL: https://wa.opusoverseas.com`, `PENDING-CONFIGS.md` bulk `mautic/listmonk/chat/cal/umami/kuma/n8n/erp/crm → *.opusoverseas.com`, webhooks `https://api.opusoverseas.com/api/webhooks/*`. Domain is source of truth, Tailscale remains fallback only for SSH.

---

## 2. Tri-Workspace Realtime Synchronization Matrix (Expanded v7)

Three workspaces share single D1 source, synchronized via `SyncHub Durable Object` `global` atom, `X-SyncHub-Auth` HMAC, `createSyncClient` resilient WS (`backoff 1s→30s + heartbeat 25s + Last-Event-ID replay + jitter`) + public `refetchInterval 30s` fallback. `isAllowedChannel()` enforces `staff:global:*`/`public:*` for staff/client/partner.

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
│  • PortalMessages + PortalCalendar (.ics)       │   │  • Performance (bookings/converted/overdue) │
│  • Visa Tracker anxiety-grade (official+plain)  │   │  • 1-Click Deep Links SubID + QR Studio   │
│  • Billing Forecast Next 30d + Help center      │   │  • Tier Ladder + Thrive Engine             │
│  • Journey (messages+calendar) + Payments bar   │   │  • Strict Isolation (no private docs)       │
└─────────────────────────────────────────────────┘   └─────────────────────────────────────────────┘
```

### 2.1 Full Channel Matrix (v7 — 16+ publish sites)

| Domain | Publish `channel` | Type | Subscribe (plane) | Frontend Invalidate |
|---|---|---|---|---|
| **Blog** | `public:blog` + `staff:global:blog` | `BLOG_CREATED/PUBLISHED/UPDATED/DELETED` + `flushScheduled` auto | `BlogManager.tsx` `staff [public:blog, staff:global:blog]` → `invalidate adminBlogPosts/publicBlogPosts/publicBlogPost` + public `refetchInterval 30s` |
| **Leads** | `public:leads` + `staff:global:leads` | `WorkspaceShell` + `ClientsList` `staff:global:leads` |
| **Family** | `client:{id}:family` + `staff:global:family` | `ClientPortal` `client [client:{id}:family]` + `Client360` staff |
| **Ledger/Payments** | `client:{id}:payments` + `public:payments` + `staff:global:payments` | `ClientPortal` `client:{id}:payments` + `PartnerDashboard` `partner:{id}:commissions` + `BillingForecast` |
| **Visa** | `public:visa` + `client:{id}:visa` + `staff:global:visa` (`VISA_DEADLINES_CALC/MOVED`, `VISA_RULE_CREATED`) | `ClientPortal` `client:{id}:visa` + `VisaTracker` `refetchInterval 30s` + `VisaPrepPortal` staff |
| **Attestation** | `public:attestation` + `staff:global:attestation` (`ATTESTATION_PRESCREEN/VERIFIED/RULE_CREATED`) | `AttestationPortal` + `ClientPortal attestation` |
| **Messages** | `client:{id}:messages` + `staff:global:messages` + `public:messages` | `PortalMessages.tsx` `client` + `Inbox` `staff` |
| **Calendar/Journey** | `client:{id}:journey` `ONBOARDING_PROGRESS` | `ClientPortal` `client:{id}:journey` → `portalDashboard` + `DashboardHome` funnel |
| **Partner** | `partner:{id}:bookings/commissions` + `staff:global:partner:*` | `PartnerDashboard` `partner` |
| **Agreements/Docs** | `client:{id}:bookings + staff:global:alerts` | `ClientPortal` `client:{id}:bookings/documents` |

### 2.2 Workspace Data Flow & Boundary Isolation (Unchanged + Extended)

| Domain / Field | Superadmin / Staff CRM | Client Portal (`/portal`) | Partner Dashboard (`/partner`) | Boundary Security Rule |
| :--- | :--- | :--- | :--- | :--- |
| **Assigned Counselor** | Full control to assign/reassign any staff user across student engagements. | Displays live assigned staff name, role, and direct chat button. | Displays assignment status indicator only. | ✅ Counselor emails & internal user IDs are masked. Direct communication via in-app Chatwoot. |
| **Pricing & Margins** | Full visibility into supplier cost (`wholesalePricePaise`) and gross margin. | Displays **ONLY Retail Customer Fee** (`retailPricePaise` in integer paise / ₹). | Displays **Gross Retail Customer Price** and percentage commission. | ✅ **Strict Isolation**: `wholesalePricePaise` and supplier names are stripped at the API boundary across all public/portal endpoints. |
| **Documents & KYC** | Full document inspection, virus scan status, and verification controls. | Uploads via presigned R2 URLs; sees green `verified` badge or red `correction required` notes. | Sees candidate checklist progress (`Received / Pending`) without access to private files. | ✅ **DPDP-2023 Compliant**: Client documents are access-controlled and strictly isolated from partners. |
| **Family Hub** | Views all `familyMembers` per client, can add/edit. | Views/adds own `father/mother/guardian` via `X-Portal-Token` matching `clientId`, `canReceiveUpdates` opt-in. | Hidden. | ✅ `isAuthorized()` staff `getAuth` OR client token `resolveClientByToken` matching `clientId`. |
| **Ledger** | Manages `paymentSchedules` + `refund` per booking stage. | Sees `2/3 paid` bar + `Next 30d ₹X` forecast. | Sees `collectedBy` settlement + `tier boost`. | ✅ `bookingId` scoping, `collectedBy` FK. |
| **Internal Notes & Fraud Score** | Staff-only internal CRM notes (`clients.notes`, `intakeContext`). | **Hidden**. | **Hidden**. | ✅ Zero leakage. |
| **Pipeline Progression** | Moves Kanban cards across stages (`lead` → `complete`). | Stage updates live in client's 5-column service pipeline. | Stage updates live in partner's 5-column referral pipeline. | ✅ State transitions are synchronized in real-time. |

---

## 3. Unified Authentication & Access Gateway (`/login`)

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
1. **Password Sign-In**: Email + Argon2/scrypt hashed password via BetterAuth D1 adapter. Real-time Caps Lock Detection. Session persistence (*"Remember session for 30 days"*).
2. **Direct Email OTP**: Frictionless 6-digit OTP via transactional email (`Listmonk /api/tx` → Titan relay).
3. **Two-Factor Authentication (TOTP)**: Google Authenticator enforced for `super_admin`, `manager`.
4. **Brute-Force & Lockout Guard**: Rate-limited to 5 failed attempts per 15-minute sliding window with bounded audit logging (`LOGIN_FAILED`, `LOGIN_SUCCESS`).
5. **Intelligent Workspace Dispatch**: `super_admin`, `manager`, `counselor`, `coordinator`, `receptionist` → `/dashboard`; `partner` → `/partner`; `client` → `/portal`.
6. **L5 Hardening (2026-08-25 pentest):** `HttpOnly SameSite=Lax Secure` (prod), `X-Portal-Token` header preferred over `?token=` query (logged for forensics, stripped via `sessionStorage + replaceState`), `disableOriginCheck` only in dev (prod CSRF guards ON), `guest`/`client-self` IDOR → `404` (was first-client leak), `__Host-` prefix TODO + DPoP stack tracked in `PENDING-CONFIGS.md` H1-H14.

---

## 4. Transactional Email System Architecture (Listmonk v6.2 + Cloudflare Worker Fallback)

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

**Domain-native (no Tailscale IP in runtime `apps/`):** `wa.opusoverseas.com` (OpenWA fallback, primary Cloud API `https://graph.facebook.com/v21.0/{PHONE_ID}/messages`), `chat.opusoverseas.com`, `api.opusoverseas.com`.

```
                            ┌────────────────────────────────────────────────────────┐
                            │                 CLIENT / PARTNER UI                    │
                            │           (<ChatWidget /> + PortalMessages)            │
                            └───────────────────────────┬────────────────────────────┘
                                                        │
                            1. Boots via window.chatwootSDK.run()
                            2. Identifies User: window.$chatwoot.setUser(id, { name, email })
                            3. In-App Buttons trigger: window.$chatwoot.toggle()
                            4. PortalMessages: POST /api/public/portal/messages (X-Portal-Token) → waOutbox
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
                │      STAFF INBOX DESK       │                   │   WHATSAPP CLOUD API (v21)  │
                │        (apps/app/inbox)     │                   │   wa.opusoverseas.com (FB)  │
                │  • Live Real-Time Chat      │                   │  • waOutbox status queued→read│
                │  • Linked Student CRM Data  │                   │  • Template category Utility  │
                │  • Counselor Reassignment   │                   │  • Quality Green/Yellow/Red   │
                └─────────────────────────────┘                   └─────────────────────────────┘
```

**Phase A Messaging:** `PortalMessages.tsx` `waOutbox` `direction inbound` `POST /api/public/portal/messages` → `publishSyncEvent client:{id}:messages + staff:global:messages` → `Inbox` + `ClientPortal journey` live.

---

## 6. The 5 Business Divisions — Operations & Data Lifecycle (Updated with Gold Modules)

### 6.1 🎓 Study Abroad Division
* **Snapshot Architecture**: Real-time market data captured as immutable application snapshots (`study_abroad_applications.universityJson`).
* **Live Compatibility Engine**: Pure functional scorer (`lib/studyAbroadMatch.ts`) computing Match / Reach / Safe compatibility live (0–100 score, TOEFL/PTE → IELTS normalization) without polluting the database.
* **Stage Machine**: `shortlisted` → `docs_ready` → `submitted` → `under_review` → `offer_letter` → `deposit_paid` → `enrolled` / `rejected`.
* **DPDP-2023 University Consent**: Student Profile Wizard captures explicit, cryptographically hashed consent for foreign university data sharing.
* **Visa Gold V1-V7 (new):** `visaRules` 20 (country×visaType docs JSON, validity 6m, leadDays 14-45) + `visaDeadlines` cascade `biometrics+30d→medical+46d→submit` + `requirements/:bookingId` outstanding diff + `GET /kpis` + **C5 Tracker** `official verbatim + plain explainer + checkedAt` (VP0 anxiety-grade).
* **Family Hub:** `familyMembers` `father/mother/guardian` + `canReceiveUpdates` + 6m passport expiry guard.

### 6.2 ✈️ Global Visa Processing Division
* **Inventory Catalog**: 165+ destinations across 56 standard products (`visa_products`) with entry types, processing turnaround times, and mandatory document checklists — now backed by `visaRules` DB (20 seeded) for live outstanding calc.
* **Wholesale Margin Guard**: Base consular fees are strictly isolated from customer retail rates.
* **Document Verification**: Staff review queue with presigned R2 downloads, instant `verified`/`rejected` toggles, and auto-generated client correction tasks.
* **Deadline Cascade Engine (V1):** `POST /deadlines/calc {biometricsAt, LMIA_expiry}` → `PATCH /deadlines/:id/dueAt` cascades `dependsOn` delta → `GET /risk?days=14` Mon scan + `GET /kpis` exception rate.

### 6.3 🕋 Umrah & Spiritual Travel Division
* **Inventory & Family Pricing**: 60-column package catalog (`umrah_packages`) supporting Quad/Triple/Double sharing, solo supplement rates, and granular child/infant pricing components.
* **Party Booking Model**: Group departures (capacity 30) with ₹500 × pax advance reservation, 72-hour seat hold window, Razorpay advance verification, and office balance settlement.
* **Automated Expiry Release**: Self-healing hold release for unpaid slots past 24 hours without cron overhead.
* **Installment & Refund Ledger (Phase A):** `paymentSchedules` booking-tied `Advance/Balance/Visa Fee` + `dueAt` + `collectedBy` + `refund 90%→50%` per `stage` + `GET /ledger/forecast?clientId=&days=30` → `BillingForecast` Next 30d ₹X.

### 6.4 📑 Certificate Attestation Division
* **B2C Indicative Rate Cards**: State HRD → MEA New Delhi → Embassy / Apostille legalization sequences with indicative price bands — now `attestationRules` 10 (degree→UAE 21d ₹8500, degree→Saudi 28d ₹12000, Hague Apostille 7d ₹4500, birth/marriage/pcc/commercial).
* **Originals Transit Tracking**: Step-by-step custody chain, Blue Dart / DTDC courier AWB integration, and doorstep pickup scheduling.
* **Gold Modules:** **Chain Builder AI** `GET /chain?docType=&destination=` fallback `HRD,MEA,Embassy` + **Pre-screen AI** `POST /:id/prescreen` (NNA name/date errors) + **e-APP Verifier** `POST /verify {eRegisterUrl hcch.net → verified}` → `attestationVerifications`.

### 6.5 💼 Overseas Manpower & Careers Division
* **Protected Job Catalog**: Proprietary Gulf & Europe vacancy boards with masked compensation details (`🔒 Login to View`) safeguarding corporate clients.
* **Candidate Workflow**: Application → Trade Test → Medical GAMCA → Visa Stamping → Emigration Clearance → Deployment Flight.
* **Manpower Marketplace:** `GET /api/blog/admin`? No — `GET /api/blog/posts` is blog, Manpower is `GET /api/blog`? Actually `GET /api/public/portal/manpower` + `manpowerMatch` 0-100 (`exp+skills+trade+passport`) + R2 resume vault.

---

## 7. Fluent Workspace — 6+4 Slices (Realtime First)

**Doc:** `docs/fluent-workspace-implementation.md` + `docs/visa-attestation-gold-standard-implementation.md` + `docs/client-partner-workspace-audit.md`

| Slice | Gold Standard | Publish Channel | Subscribe + Invalidate |
|---|---|---|---|
| **C1 Health Ring** | Onboard.io composite `usage+support+engagement+commercial+tenure` 3 tiers | `GET /api/public/portal/dashboard` `healthScore 0.4*docPct+0.3*deadlineHealth+0.2*engagement+0.1*payment` | `ClientPortal` `client:{id}:journey` → `portalDashboard` `refetchInterval 30s` |
| **C2 Onboarding <4 min** | Vezert `5-step checklist (one pre-completed)`, EasyB `time-to-value <14d = 80% retain` | `POST /onboarding/progress {step,done}` → `client:{id}:journey` + `staff:global:leads` | `OnboardingChecklist.tsx` `pct%` bar + confetti |
| **C3 Messaging** | Ticlick `Messaging Center` single thread | `POST /api/public/portal/messages` → `waOutbox` `client:{id}:messages` + `staff:global:messages` | `PortalMessages.tsx` `refetchInterval 10s` + `ClientPortal` `client:{id}:messages` |
| **C4 Calendar** | SimpleVisa `Mon risk scan` + ICS | `GET /calendar` `visaDeadlines+paymentSchedules+tasks` + `GET /calendar.ics` `VCALENDAR` | `PortalCalendar.tsx` `Add to Calendar` |
| **C5 Visa Tracker** | VP0 `official verbatim + plain explainer + checkedAt, change-only alerts` | `GET /api/visa/tracker/:bookingId` → `officialStatus, plainMap, checkedAt, timeline` | `VisaTracker.tsx` `refetchInterval 30s` in `ClientPortal visa` tab |
| **P1 Booking Tower** | AgencyAuto `centralize bookings in one view` | `GET /api/partner/:id/bookings?division=` via `referrals` → `engagements` | `BookingTower.tsx` `partner:{id}:bookings` |
| **P2/P3 Commission + Performance** | VisaBOS `tiered commissions auto` | `GET /partner/:id/ledger` `collectedBy` + `GET /performance` `bookings/converted/overdue` | `CommissionPerformance.tsx` `partner:{id}:commissions` |
| **C6 Billing Forecast** | Vezert `Billing with forecasting` | `GET /api/ledger/forecast?clientId=&days=30` | `BillingForecast.tsx` `Next 30d ₹X` in `ClientDashboardHub` |

---

## 8. Blog Engine — Gold Standard SEO/AEO/GEO/AIO

**Doc:** `docs/blog-module-gold-standard.md` (8 pillars, 20+ rules)

- **DB:** `blog_posts` `slug unique, tldr, excerpt, contentMarkdown, primaryKeyword unique (409 cannibalization), pillarSlug, division, metaTitle, ogImage, canonical, status, featured, readingMinutes, publishedAt/dateModified, viewCount` + `blogCategories` + 4 indexes.
- **API:** `GET /api/blog/posts?division=&q=&page=` (public `rateLimit 60/min` + `flushScheduled()` auto-publish) + `GET /posts/:slug?preview=1` + `POST/PATCH/DELETE /api/blog/admin/*` (`manager+`, `auditPost()` overall/SEO/AEO/readability + critical/important/polish) + `GET /audit/:id` + `publishSyncEvent public:blog + staff:global:blog`
- **Frontend:** `App.tsx` `Route /blog` `BlogIndex` (featured hero, `refetchInterval 30s`) + `Route /blog/:slug` `BlogPost` (blockquote TL;DR, `## What is` definition, `| table |`, `## FAQ` 5×<50w, `BlogPosting`+`FAQPage`+`BreadcrumbList` JSON-LD, TOC) + `VisibilityHub` 9th tab `📝 Blog Studio` `BlogManager.tsx` `createSyncClient(staff, [public:blog, staff:global:blog])` + `Footer` `Blog — Guides & Insights`
- **SEO:** `GET /sitemap.xml` injects every `published` blog `loc` + `/blog` + `GET /llms.txt` 50 latest + `robots.txt` allows `GPTBot/PerplexityBot/ClaudeBot/OAI-SearchBot/ChatGPT-User` on `/`, blocks `CCBot/Bytespider`.

---

## 9. Cryptographic Tamper-Evident SHA-256 Audit Chain

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
* **Recent actions:** `BLOG_CREATED/PUBLISHED`, `FAMILY_MEMBER_ADDED`, `LEDGER_SCHEDULE_CREATED`, `VISA_DEADLINES_CALC`, `ATTESTATION_PRESCREEN/VERIFIED`, `ONBOARDING_PROGRESS`, `PORTAL_MESSAGE_SENT`, `LEAD_SCORED`.

---

## 10. Analytics & Tracking — GA4 + GTM + Meta Pixel + CF WA (Unified)

**Doc:** `docs/phase-a-implementation.md` § Messaging/Calendar + `apps/app/src/lib/visibilityTracking.ts`

- **Superadmin single source:** `VisibilityHub → Analytics` `GET/POST /api/visibility/ga4/config` now `measurementId (G-…)` + `gtmId (GTM-…)` + `metaPixelId` + `cfWaToken` (no redeploy).
- **Frontend fetch once:** `GET /api/visibility/ga4/config` → injects `https://www.googletagmanager.com/gtag/js?id=G-…` (`gtag('config', send_page_view:false)`) + `https://www.googletagmanager.com/gtm.js?id=GTM-…` (`dataLayer` + `noscript` iframe) + `https://connect.facebook.net/en_US/fbevents.js` (`fbq('init')`) + `beacon.min.js` (`data-cf-beacon`)
- **Events:** `useVisibilityTracking(route)` → `POST /api/visibility/ga4/events` `page_view` + `dataLayer page_view` + `gtag page_view` + `fbq PageView` (one call). `trackLeadFormSubmit()` → D1 `lead_form_submit` + `dataLayer generate_lead` + `gtag generate_lead` + `fbq Lead` + `umami lead_form_submit`. `track()` in `umami.ts` fans out to `dataLayer` + `gtag` + `fbq` for `booking_cta_click` etc.
- **Remaining:** `VITE_UMAMI_BASE_URL/WEBSITE_ID` still drives `ensureUmami()` `script.js` (internal dashboard `generate_lead`).

---

## 11. Enterprise Zero-Cost Infrastructure Topology (Updated)

| Layer | Provider | Free Allowance | Opus OS Utilization |
| :--- | :--- | :--- | :--- |
| **Edge Compute** | Cloudflare Workers | 100,000 requests / day | Hono API routing & auth gateway + Turnstile |
| **Relational Database** | Cloudflare D1 | 5M read / 100k write rows / day | **97 ACID tables** `opusos-db` (was 89) |
| **Object Storage** | Cloudflare R2 | 10 GB / 10M reads / mo ($0 egress) | Encrypted document vault + presigned upload HMAC |
| **Email Relay** | Titan Mail / Listmonk | Unlimited transactional | `listmonk.opusoverseas.com` 13 `type:tx` templates |
| **Live Chat & WhatsApp**| Self-Hosted VPS | Unlimited agents & messages | `chat.opusoverseas.com` + `wa.opusoverseas.com` (Meta Cloud primary, OpenWA fallback) |
| **Workflow Automation** | Self-Hosted n8n | Unlimited executions | `n8n.opusoverseas.com` Community Edition |
| **Zero-Trust Network** | Cloudflare Tunnel | Free for up to 50 users | `6f1a97cc-8e9b-4340-a435` → `https://*.opusoverseas.com` 10 subdomains |
| **Sync Fabric** | Durable Objects | Free tier | `SyncHub` `global` atom HMAC, 20 channels max, `public:*`/`staff:global:*`/`client:{id}:*`/`partner:{id}:*` |

---

## 12. Security Hardening — L5/L6/L7 (2026-08-25 Pentest)

**Doc:** `PENDING-CONFIGS.md` H1-H14 + `infra/terraform/cloudflare-waf.tf` + `infra/hunting-queries.sql`

- **P1 L5 IDOR `guest`/`client-self` → `404`** `apps/api/src/lib/clientToken.ts` guest branch removed (was first-client leak, City-Forum pattern)
- **P2 L5 `portalToken` `sessionStorage`-only** `apps/app/src/pages/ClientPortal.tsx:286` removed `localStorage` fallback
- **P2 L6 DOM-XSS `motion.ts` `innerHTML`** → `createElement + textContent` escaped
- **P2 L6 Security Headers** `apps/api/src/index.ts` `HSTS max-age=31536000; includeSubDomains; preload` + `X-Frame-Options: DENY` + `X-Content-Type-Options: nosniff` + `Referrer-Policy: strict-origin-when-cross-origin` + `frame-ancestors 'none'`
- **P2 L5 Query-token audit** `apps/api/src/routes/portal.ts` header-preferred + audit note
- **WAF as Code** `infra/terraform/cloudflare-waf.tf` → `Rate Limit 10/60s /api/auth/*`, `10/3600s /api/public/portal/lookup`, Custom Block `file://|gopher://|169.254.169.254`, `token=guest` (requires `CLOUDFLARE_API_TOKEN` with `Zone:Firewall Services Edit` scoped to `opusoverseas.com` `b5a528ef0851baea75cb7fbd80909549`)
- **Pending:** DPoP `cnf.jkt`, CAE kill signal, absolute timeout middleware, CSP nonce, Logpush → R2

---

## 13. Monorepo Structure & Key Directory Map (Updated)

```
Opus OS/
├── apps/
│   ├── api/                     # Cloudflare Workers Backend (Hono.js)
│   │   ├── src/
│   │   │   ├── auth.ts          # BetterAuth D1 + 2FA TOTP + transactional email hooks
│   │   │   ├── db/schema.ts     # 97 Drizzle tables (blogPosts, familyMembers, waOutbox, paymentSchedules, visaRules, visaDeadlines, attestationRules, verifications)
│   │   │   ├── infra/           # Listmonk, Messaging (Meta Cloud + OpenWA domain), Notify, EmailTemplates, ChatwootAi
│   │   │   ├── lib/             # leadScoring (fit+engagement threshold 50), clientToken 128-bit, divisions, syncHubAuth
│   │   │   ├── middleware/      # RBAC division-scoped, RateLimit D1 sliding window, Audit SHA-256 chain, Turnstile
│   │   │   ├── routes/          # clients (score+route+SLA), portal (dashboard/onboarding/messages/calendar), blog (public/admin + audit + publishSyncEvent), family (isAuthorized staff/client token), ledger (schedules/generate/pay/refund/forecast), visaGold (deadlines/calc/risk/rules/kpis/tracker), attestationGold (rules/chain/sla/prescreen/verify), visibility (ga4/gtm/meta/cf), sync (WS upgrade + publish HMAC)
│   │   │   └── cron/            # heartbeat, nurtureTouches, workflowExpiry, auditMonitor/Archive, secretRotation
│   │   └── migrations/          # 0082_blog_engine.sql, 0083_phase_a_lead_family_ledger.sql, 0084_visa_attestation_gold.sql
│   │
│   └── app/                     # React 19 + Vite SPA Frontend
│       └── src/
│           ├── components/      # ClientDashboardHub (HealthRing, OnboardingChecklist, BillingForecast), PortalMessages, PortalCalendar, VisaTracker, BlogManager, Partner BookingTower/CommissionPerformance
│           ├── pages/           # ClientPortal (7 tabs + journey messages+calendar, visa tracker, dashboard health), PartnerDashboard (5 tabs + tower), BlogIndex/Post (TL;DR, FAQ, JSON-LD), PublicHome, Login
│           └── lib/             # session (BetterAuth), syncClient (resilient WS), divisions, visibilityTracking (one fetch → gtag/gtm/fbq/beacon), motion (GSAP, safe DOM), umami (fans out to dataLayer)
│
├── packages/
│   ├── shared/                  # Zod validation schemas & shared contracts
│   └── integrations/            # n8n workflow blueprints & OpenAPI specs
│
└── docs/                        # Specifications, Architecture, and Audit Reports
    ├── ARCHITECTURE.md          # This living map
    ├── blog-module-gold-standard.md (8 pillars) + phase-a-implementation.md + fluent-workspace-implementation.md + visa-attestation-gold-standard-implementation.md + client-partner-workspace-audit.md
    └── realtime-sync-architecture.md + audit-logging-gold-standard.md
```

---

## 14. Recent Implementations Deep Dive (This Version)

### Blog Engine (Gold) — 2026-08-25
- **Why:** Writer 80/20 + Google May 15 + Princeton +30% inline citations + FAQ 81% highest. **Build:** 8 pillars, `tldr` 200-350c, `## What is` definition, 40-60w capsule per H2, 1 `| table |`, `FAQ 5×<50w`, `Person sameAs` + `Organization`, `dateModified` auto, `primaryKeyword` unique 409, `pillSlug` cluster, `auditPost()` `overall/SEO/AEO`. **API** `GET /api/blog/posts?division=` `rateLimit 60/min` `flushScheduled()` + `GET /posts/:slug?preview=1` + `POST/PATCH/DELETE` `manager+` + `publishSyncEvent public:blog + staff:global:blog` + **Frontend** `BlogIndex/Post` `refetchInterval 30s` + `VisibilityHub 📝 Blog Studio` `createSyncClient` + `Footer Blog` + `sitemap.xml` `max-age 300` + `llms.txt` 50.

### Phase A — Lead Command Center + Family Hub + Ledger + WhatsApp (Domain-Native)
- **Lead:** `scoreLead()` territory least-loaded `assignedTo` + `4hr SLA task` + `leadAssignments` audit + `public:leads`/`staff:global:leads` → `ClientsList`/`DashboardHome` funnel
- **Family:** `familyMembers` `father/mother/guardian` + `isAuthorized()` staff OR `X-Portal-Token` `resolveClientByToken` matching `clientId` + `client:{id}:family` realtime → `Client360` + `ClientPortal Family`
- **Ledger:** `paymentSchedules` `bookingId/installmentNo/dueAt/collectedBy/refundReason` + `POST /schedules/generate` + `GET /forecast?days=30` + `refund 90%→50%` + `client:{id}:payments` → `ClientPortal Billing` `2/3 paid` bar
- **WhatsApp:** `waOutbox` `queued→read` `category` + `messaging.ts` dual `meta` (`https://graph.facebook.com/v21.0`) else `https://wa.opusoverseas.com` + `X-Hub-Signature-256` HMAC + `Inbox` `staff:global:messages` + `PortalMessages` `client:{id}:messages` realtime

### Visa/Attestation Gold (14 modules) — 2026-08-25
- **Visa:** `visa_rules` 20 seeded + `visaDeadlines` cascade `biometrics+30d→medical+46d→submit` `dependsOn` delta + `PATCH /deadlines/:id/dueAt` + `GET /risk?days=14` + `GET /requirements/:bookingId` outstanding diff + `GET /kpis` + **C5 Tracker** `official verbatim + plain explainer + checkedAt` → `ClientPortal visa` `VisaTracker`
- **Attestation:** `attestation_rules` 10 seeded `chain JSON` `avgDays` + `GET /chain` + `GET /sla` `bufferedDue` + `POST /:id/prescreen` (NNA errors) + `POST /verify` `eRegisterUrl hcch.net` → `attestationVerifications`

### Fluent Workspace — C1-C6 + P1-P3 (Realtime First)
- **C1 Health Ring** `0.4*docPct+0.3*deadlineHealth+0.2*engagement+0.1*payment` `tier green/yellow/red` + **C2 Onboarding** 5 steps `Welcome✓` (Vezert <4 min, EasyB `time-to-value <14d`) → `ClientDashboardHub` `useQuery ['portalDashboard']` + `publishSyncEvent client:{id}:journey`
- **C3 Messages** `PortalMessages` `waOutbox` `refetchInterval 10s` → `journey` `grid lg:grid-cols-2` + **C4 Calendar** `PortalCalendar` `visaDeadlines+paymentSchedules+tasks` + `.ics` → `client:{id}:journey`
- **C5 Visa Tracker** `VisaTracker` `refetchInterval 30s` in `visa` tab + **P1 Booking Tower** `BookingTower` `partner:{id}:bookings` via `referrals` → `PartnerDashboard referrals` + **P2/P3 Commission** `CommissionPerformance` `collectedBy` + `conversion` → `payouts` tab + **C6 Billing Forecast** `BillingForecast` `Next 30d ₹X` in dashboard
- **Domain:** `secrets.json` `OPENWA https://wa.opusoverseas.com`, `PENDING-CONFIGS.md` `*.opusoverseas.com` (no runtime `100.87.71.38` except test fixture)

---

## 15. Verification — This Version

| Gate | Result |
|---|---|
| `pnpm --filter @opusos/api typecheck` | **✓** |
| `pnpm --filter @opusos/app typecheck` | **✓** (fixed `portalToken` destructure, `BillingForecast` unused) |
| `pnpm --filter @opusos/app build` | **✓ 2,134.75kB 474 modules** (+HealthRing etc.) |
| `D1` `97 tables` | `visa_rules 20 attRules 10` seeded local+remote `1142784` |
| `Routes` | `app.route('/api/blog')` `/api/family` `/api/ledger` `/api/visa` (`visaGold`+tracker) `/api/attestation` `/api/partner` (`partnerGold`) `/api/sync` |
| `Frontend routes` | `Route /blog + /blog/:slug` `VisibilityHub 📝` `ClientPortal 7 tabs` `PartnerDashboard 5 tabs` `Footer Blog` |
| `Realtime` | `16+ publishSyncEvent` `public:blog/visa/attestation/payments/leads` + `staff:global:*` + `client:{id}:*` + `partner:{id}:*` → `createSyncClient` + `refetchInterval 30s` fallback |

*Next pre-completed Welcome + health Green → +25% activation (Vezert) measurable in `DashboardHome` funnel `generate_lead`.*

