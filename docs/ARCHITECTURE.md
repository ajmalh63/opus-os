# Opus OS — Complete Architecture Map

> **Version:** 2026-08-18 (v4 — Cloudflare Remote D1, Production Tunnel, SEO/GEO/AIO Engine & Omnichannel Sync)  
> **Status:** Live & Unified (Remote Cloudflare Infrastructure + Persistent VPS Cloudflared Tunnel + n8n Event Fabric)

---

## 1. System Overview

```
                        ┌───────────────────────────────────────────────────────────┐
                        │                      USERS / CLIENTS                      │
                        │   Public Site · Client Portal · Partner Hub · Workspace   │
                        └─────────────────────┬───────────────────┬─────────────────┘
                                              │                   │
                     ┌────────────────────────▼─────┐   ┌─────────▼──────────────┐
                     │     CLOUDFLARE (prod)        │   │   EXTERNAL SERVICES    │
                     │  ─────────────────────────   │   │  ────────────────────  │
                     │  Workers API (Hono)          │   │  cal.com (booking)     │
                     │  D1 (opusos-db 89 tables)    │   │  Titan Mail (MX routed)│
                     │  KV · Vectorize · Turnstile  │   │  Razorpay (payments)   │
                     │  Cron · Logpush · BetterAuth │   │  Google (GA4/GSC/GCP)  │
                     └──────────────┬───────────────┘   └────────────────────────┘
                                    │
               ┌────────────────────┴─────────────────────┐
               │    PERMANENT CLOUDFLARED TUNNEL          │
               │   Tunnel ID: 6f1a97cc-8e9b-4340-a435     │
               │   16 Subdomains with Anti-Index Guards   │
               └────────────────────┬─────────────────────┘
                                    │
                        ┌───────────▼──────────────────────────────┐
                        │   ORACLE VPS (129.159.238.227)           │
                        │   37 Docker containers, 16 apps          │
                        │   (n8n, Chatwoot, ERPNext, Mautic, etc.) │
                        └──────────────────────────────────────────┘
```

---

## 2. Unified Authentication & Access Gateway (`/login`)

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

### Access Modes & Security
1. **Password Sign-In**:
   * Email + Argon2/scrypt hashed password credentials.
   * Interactive visibility toggle with spring micro-interactions.
   * **Real-time Caps Lock Detection** (`⚠️ Caps Lock is ON`).
   * Session persistence checkbox (*"Remember session for 30 days"*).
2. **Direct Email OTP**:
   * Frictionless 6-digit one-time passcode delivered via transactional email (`Listmonk /api/tx` $\rightarrow$ Titan relay).
3. **Two-Factor Authentication (TOTP)**:
   * Time-based 6-digit rolling code authenticator support (Google Authenticator, 1Password) enforced for administrative and elevated roles.
4. **Brute-Force & Lockout Guard**:
   * Rate-limited to 5 failed attempts per 15-minute sliding window with bounded audit logging (`LOGIN_FAILED`, `LOGIN_SUCCESS`).
5. **Intelligent Workspace Dispatch**:
   * `super_admin`, `manager`, `counselor`, `coordinator`, `receptionist` $\rightarrow$ `/dashboard`
   * `partner` $\rightarrow$ `/partner`
   * `client`, `user` $\rightarrow$ `/portal`

---

## 3. Public Domain Division Portals & Live Telemetry

Each business division features a **bespoke public landing experience** wired directly to live backend queries and CRM lead generation:

| Division Route | Primary Component | Live Backend APIs | Key Interactive Capabilities | Proactive In-Progress / Quota Handling |
| :--- | :--- | :--- | :--- | :--- |
| **`/study-abroad`** | `StudyAbroadPage.tsx` | `POST /api/public/match/eligibility`<br>`POST /api/public/leads`<br>`GET /api/cal/public/links` | • 6 Country Destination Cards (Tuition, Post-Study Work Visa rules)<br>• Interactive Eligibility Matcher (GPA, IELTS/PTE, Budget slider)<br>• Cal.com 1-on-1 Counselor Scheduling<br>• Hero Image (`hero-study-abroad.jpg`) | **Custom Academic Roster Compiling**: If custom filters have no standard match, displays counselor waiver evaluation and scholarship shortlisting note. |
| **`/visa-services`** | `VisaServicesPage.tsx` | `GET /api/public/visa/products`<br>`GET /api/public/portal/lookup`<br>`POST /api/public/leads` | • 60+ Visa Product Catalog (Tourist, Business, Transit)<br>• Live Consulate & Embassy Status Radar<br>• Fast-Track Lead Filing with required document breakdown<br>• Hero Image (`hero-visa-services.jpg`) | **Consular Fast-Track Active**: Displays direct embassy appointment handling for custom destinations without negative empty states. |
| **`/umrah-travel`** | `UmrahTravelPage.tsx` | `GET /api/public/umrah/departures`<br>`POST /api/public/leads` | • Live Group Departures Matrix with seat availability badges<br>• Haram Proximity Package Comparison (Under 150m walking)<br>• 14-Day Spiritual Itinerary (Makkah & Madinah)<br>• Hero Image (`hero-umrah-travel.jpg`) | **Upcoming Lunar Cycle Flight Allocations**: Displays flight and hotel allotment scheduling for upcoming Ramadan/Shawwal batches. |
| **`/attestation`** | `AttestationPage.tsx` | `GET /api/public/attestation/chains`<br>`POST /api/public/leads` | • Step-by-Step Statutory Stamp Sequence Matrix (State HRD $\rightarrow$ MEA $\rightarrow$ Embassy $\rightarrow$ MOFA)<br>• 3 Certificate Tiers (Educational, Personal, Commercial)<br>• Insured Doorstep Courier Pickup Scheduling<br>• Hero Image (`hero-attestation.jpg`) | **Statutory Authentication Sequence**: Interactive live ledger displaying step-by-step legalization sequence and timeline estimates. |
| **`/recruitment`** | `RecruitmentPage.tsx` | `GET /api/public/jobs`<br>`POST /api/public/leads` | • Live Global Job Board by sector (Engineering, Healthcare, Hospitality)<br>• Salary & Benefits Transparency (Housing, Flights, Medical)<br>• Candidate CV Intake & MEA License #MEA-3402 Guarantee<br>• Hero Image (`hero-recruitment.jpg`) | **Live Employer Drives Scheduling**: Displays active employer interview drive coordination for in-demand overseas vacancies. |

---

## 4. Institutional Trust, Legal & Advisory Surface

| Route | Component | Legal & Compliance Standards | Capabilities |
| :--- | :--- | :--- | :--- |
| **`/contact`** | `ContactPage.tsx` | DPDP Act 2023 & Spam Defense | Dedicated Advisory Desk form with department selection, Turnstile anti-spam, and direct lead generation returning a client Journey Token. |
| **`/about`** | `AboutUsPage.tsx` | Govt MEA #MEA-3402 & Certifications | 10+ year legacy, British Council & ICEF certified counselors, Nusuk Umrah authorization, and the 4 Operational Pillars of Opus OS. |
| **`/privacy`** | `PrivacyPolicyPage.tsx` | DPDP Act 2023 & GDPR | Data Fiduciary obligations, passport/biometric AES-256 encryption in transit/rest, data principal rights, and Grievance Officer details. |
| **`/terms`** | `TermsOfServicePage.tsx` | Client Engagement Covenant | Division service scopes, sovereign consular decision disclaimers (embassy authority), document authenticity obligations, and jurisdiction. |
| **`/refund-policy`** | `RefundPolicyPage.tsx` | RBI Financial Ledger Norms | Division-specific refund breakdown, statutory fee non-refundable disclosures, and 7–10 business day bank settlement guarantee. |

---

## 5. Cloudflare & Edge Architecture

| Component | Technology | Role & Capabilities | Status |
| :--- | :--- | :--- | :--- |
| **Workers API** | Hono (`apps/api`) | High-performance sub-10ms edge routing, authentication, RBAC middleware, rate limiting, and business pipelines. | ✅ Live (dev :8787 / prod target) |
| **D1 Database** | SQLite via Drizzle ORM | ACID transactional store across 74 migrations (integer paise financial ledgers, audit hashes, DPDP consent records). | ✅ Live |
| **R2 Storage** | Cloudflare R2 | Encrypted document vault, candidate resume repository, and agreement PDF contracts. | ✅ Coded |
| **Turnstile** | Cloudflare Turnstile | Non-intrusive CAPTCHA alternative protecting all public intake forms against automated spam. | ✅ Live |
| **Cron Triggers** | Cloudflare Cron | Periodic 6-hour heartbeat, audit monitor integrity checks, and scheduled touchpoint dispatches. | ✅ Live |

---

## 6. VPS Layer — Inventory & Integrations (37 Containers / 14 Apps)

### 6.1 Email & Marketing Stack
* **Listmonk** (`:9009`): Single source of truth for email delivery. Transactional API (`/api/tx`) routed through **Titan relay** (`smtpout.secureserver.net:465`).
* **Mautic** (`:8085`): Visual automation canvas, behavioral lead scoring, and automated multi-touch nurture journeys.
* **Stalwart Mail**: Mail server engine for inbound MX processing.

### 6.2 Customer Communication & Messaging
* **Twenty CRM** (`:3001`): Open-source CRM for unified contacts and deals pipeline synchronization.
* **Chatwoot** (`:3200`): Omnichannel support inbox with live WhatsApp and website chat widgets.
* **OpenWA** (`:2785`): WhatsApp Webhook gateway for automated client notifications and reminders.

### 6.3 Operations & Accounting
* **n8n** (`:5678`): Workflow automation engine authenticating via `AUTOMATION_TOKEN`.
* **ERPNext** (`:8080`): Accounting and ERP ledger synchronization for GST-compliant invoicing.
* **Uptime Kuma** (`:3003`): Infrastructure uptime monitoring receiving heartbeat telemetry.
* **india-post-api** (`:9888`): Real-time India Post Speed Post consignment tracking for document attestation transit.

---

## 7. Frontend Architecture (React 19 + Vite SPA)

```
apps/app (React 19 + wouter + TanStack Query + GSAP)
├── Public Surfaces
│   ├── /                         → PublicHome (Live Consular Radar, 60s Readiness Auditor, Covenants Matrix, Real Case Vault)
│   ├── /study-abroad             → StudyAbroadPage (Admissions matcher, country matrix)
│   ├── /visa-services            → VisaServicesPage (Visa catalog, embassy radar)
│   ├── /umrah-travel             → UmrahTravelPage (Departures radar, Haram hotel tiers)
│   ├── /attestation              → AttestationPage (Stamp sequence ledger, courier booking)
│   ├── /recruitment              → RecruitmentPage (Job board, CV intake)
│   ├── /contact                  → ContactPage (Advisory desk, Journey Token generation)
│   ├── /about                    → AboutUsPage (Institutional profile, accreditations)
│   ├── /privacy                  → PrivacyPolicyPage (DPDP 2023 & GDPR compliance)
│   ├── /terms                    → TermsOfServicePage (Client terms & consular disclaimers)
│   ├── /refund-policy            → RefundPolicyPage (RBI 7-10 day refund schedule)
│   └── /lead-form                → PublicLeadForm (Free assessment & eligibility)
│
├── Authentication & Onboarding
│   ├── /login                    → Login (Unified smart gateway for Clients, Partners, Staff)
│   ├── /signup                   → Signup (Client registration)
│   └── /partner                  → PartnerDashboard (Affiliate referral engine, Rupee ledger)
│
└── Internal Staff Workspace (/dashboard & /workspaces)
    ├── Operations                → Clients, Pipeline, Kanban, Invoicing, Taxes & GST
    ├── Divisions Management      → Study Abroad, Visa, Umrah, Attestation, Manpower
    ├── Communications            → TeamHub, Inbox (WhatsApp, Chatwoot, Email), Marketing
    └── Administration (/control) → Staff, RBAC Roles, Audit Logs, Settings, Performance
```

---

## 8. Cal.com Consultation Scheduling & Webhook Pipeline

Opus OS integrates **Cal.com** as the dedicated scheduling engine for consultation-led business divisions (`study-abroad`, `visa`, `manpower`), with strict architectural separation from transactional divisions (`attestation`, `umrah`):

```
                               ┌────────────────────────────────────────────────┐
                               │                    CANDIDATE                   │
                               │   Sticky Bar · Service Page · Funnel Trigger   │
                               └───────────────────────┬────────────────────────┘
                                                       │
                                                       ▼
                               ┌────────────────────────────────────────────────┐
                               │               CAL.COM EVENT PAGES              │
                               │  study-abroad: /opus.overseas/study-abroad-con │
                               │  visa:         /opus.overseas/visa-consultation│
                               │  manpower:     /opus.overseas/manpower-consult │
                               └───────────────────────┬────────────────────────┘
                                                       │ Webhook (HMAC-SHA256)
                                                       ▼
                               ┌────────────────────────────────────────────────┐
                               │       WORKERS API (/api/webhooks/cal)          │
                               │  1. Timing-safe HMAC signature verification    │
                               │  2. Cloudflare DoH (1.1.1.1) MX record check   │
                               │  3. Disposable domain block & suspicion score  │
                               │  4. Anti-flood rate limit (max 3/day/contact)  │
                               └───────────────────────┬────────────────────────┘
                                                       │
                               ┌───────────────────────┴────────────────────────┐
                               │                                                │
                               ▼                                                ▼
              ┌─────────────────────────────────┐              ┌─────────────────────────────────┐
              │           D1 DATABASE           │              │      STAFF ALERT DISPATCH       │
              │  • Upsert Client (phone/email)  │              │  • Email: ajmalsn63@gmail.com   │
              │  • Create Active Engagement     │              │  • WhatsApp: OpenWA / Chatwoot  │
              │  • Schedule Counselor Task      │              │  • In-app Notification center   │
              └─────────────────────────────────┘              └─────────────────────────────────┘
```

### 8.1 Division Routing & Event Mapping
* **Centralized Configuration** ([`apps/app/src/config/booking.ts`](file:///media/cordial/New%20Volume/Opus%20OS/apps/app/src/config/booking.ts)):
  * `CAL_BOOKING_URL`: Primary fallback URL (`https://cal.com/opus.overseas/study-abroad-consultation`).
  * `DIVISION_BOOKING_URLS`: Division map supporting `study-abroad`, `visa`, and `manpower`.
  * `getBookingUrlForDivision(division)`: Helper dynamically routing users to their active division calendar from any UI component.
* **Superadmin Configuration Panel** (`/control` $\rightarrow$ `Consultations`):
  * Dynamic mapping of Cal.com Event Type IDs $\leftrightarrow$ Opus OS Business Divisions (`cal_event_types`).
  * Dynamic storage of booking links (`cal_booking_links`), API keys (`cal_api_key`), and webhook secrets (`cal_webhook_secret`).

### 8.2 Webhook Processing Engine (`/api/webhooks/cal`)
* **Cryptographic HMAC-SHA256 Verification**:
  * Incoming payloads carry the `X-Cal-Signature-256` header.
  * Timing-safe SHA-256 byte comparison prevents side-channel timing attacks before payload execution.
* **Lifecycle Events Supported**:
  * `BOOKING_CREATED` / `BOOKING_CREATED_TEST`: Automatically provisions client profile, opens engagement in stage `lead`, and creates counselor follow-up task.
  * `BOOKING_RESCHEDULED`: Updates task due date and booking record timestamp.
  * `BOOKING_CANCELLED`: Marks booking and associated pipeline task as cancelled.
  * `MEETING_ENDED`: Completes consultation task and records meeting status in client history.
  * `BOOKING_REQUESTED`: Handles pending state when "Requires Confirmation" is enabled.
* **Zero-Trust Anti-Spam & DoH Validation**:
  * **Cloudflare DNS-over-HTTPS (DoH)**: Real-time query to `1.1.1.1` verifying that attendee email domain possesses valid MX DNS records.
  * **Disposable Domain Filtering**: Rejection filter covering 15+ temporary email providers.
  * **Anti-Flood Rate Limiting**: Maximum 3 bookings per contact per 24 hours to prevent calendar denial-of-service.

---

## 9. Public Conversion Surface & Design System

* **Adaptive Hero Carousel** ([`HeroCarousel.tsx`](file:///media/cordial/New%20Volume/Opus%20OS/apps/app/src/components/HeroCarousel.tsx)):
  * Auto-playing multi-division hero with active slide progress pills, visual counter (`01 / 03`), and synchronized typography.
* **Global Fixed Sticky Bar** ([`StickyCallBar.tsx`](file:///media/cordial/New%20Volume/Opus%20OS/apps/app/src/components/StickyCallBar.tsx)):
  * Route-aware value hooks, 1-click eligibility check modal trigger, and dynamic 1-on-1 Cal.com booking dispatch.
* **Protected Salary Intelligence**:
  * Public job board and ticker replace raw salary amounts with `🔒 Login to View` badges, safeguarding proprietary employer compensation data while incentivizing client account creation.
* **Streamlined Funnel Flow**:
  * Replaced duplicative static inline forms with centralized interactive tools ([`StudyAbroadRoiCalculator.tsx`](file:///media/cordial/New%20Volume/Opus%20OS/apps/app/src/components/tools/StudyAbroadRoiCalculator.tsx), [`VisaRiskDiagnostic.tsx`](file:///media/cordial/New%20Volume/Opus%20OS/apps/app/src/components/tools/VisaRiskDiagnostic.tsx), [`InteractiveFunnelModal.tsx`](file:///media/cordial/New%20Volume/Opus%20OS/apps/app/src/components/funnel/InteractiveFunnelModal.tsx)) and the dedicated [`/lead-form`](file:///media/cordial/New%20Volume/Opus%20OS/apps/app/src/pages/public/LeadCapturePage.tsx).

---

## 10. Enterprise Security Posture

* **Cryptographic Tamper-Proof Audit Chain**: SHA-256 hash chaining linking every critical mutation with preceding hash verification.
* **Zero-Knowledge Password Handling**: Managed through BetterAuth with Argon2/scrypt key derivation.
* **RBAC Role Matrix**: Multi-role permission system enforcing module ceilings on both API routes (HTTP 403) and frontend navigation.
* **DPDP Act 2023 & GDPR Readiness**: Explicit consent capture on all lead pipelines, biometric retention limits, and Data Protection Officer grievance channel.
* **Network Hardening**: Persistent Cloudflare Zero-Trust Tunnel (`6f1a97cc-8e9b-4340-a435`), Nginx `/robots.txt` anti-indexing blocker on VPS port `8099`, locked UFW firewalls, and secret file permission controls (`chmod 600`).

---

## 11. Search, Answer & Generative Engine Optimization (SEO / GEO / AEO / AIO)

Opus OS implements modern search engine optimization architecture designed for traditional search indexers (Google, Bing), answer engines (ChatGPT Search, Perplexity AI, Claude), and AI overviews:

```
                  ┌─────────────────────────────────────────────────────────────┐
                  │                 Semantic Knowledge Architecture             │
                  └──────────────────────────────┬──────────────────────────────┘
                                                 │
            ┌────────────────────────────────────┼────────────────────────────────────┐
            ▼                                    ▼                                    ▼
┌───────────────────────┐            ┌───────────────────────┐            ┌───────────────────────┐
│   AIO Knowledge Graph │            │    GEO Direct-Answer  │            │     AEO FAQ Modules   │
│  Schema.org Multi-Type│            │  Citable Summary Cards│            │ Interactive Accordions│
│  (@graph JSON-LD)     │            │  (AI Snippet Optimal) │            │ (FAQPage Schema Sync) │
└───────────────────────┘            └───────────────────────┘            └───────────────────────┘
```

### 11.1 Dynamic Schema.org Graph Engine ([`schemas.ts`](file:///media/cordial/New%20Volume/Opus%20OS/apps/app/src/lib/schemas.ts) & [`SEOHead.tsx`](file:///media/cordial/New%20Volume/Opus%20OS/apps/app/src/components/SEOHead.tsx))
* Injects reactive, multi-typed Schema.org `@graph` payloads into the HTML `<head>` on initial page load.
* Entities registered: `EducationalOrganization`, `LocalBusiness`, `TravelAgency`, `EmploymentAgency`, `Service`, `BreadcrumbList`, and `FAQPage`.
* Validates institutional credentials: **British Council Certified Counselor (#115050)**, registered physical headquarters at *1-1-382, Rakasipet, Bodhan, Telangana 503185*, telephone (+91 9398848376), and geo-coordinates.

### 11.2 GEO Direct-Answer & AEO FAQ Architecture ([`GeoFaqSection.tsx`](file:///media/cordial/New%20Volume/Opus%20OS/apps/app/src/components/public/GeoFaqSection.tsx))
* Top-of-section **Direct-Answer Executive Summary Cards**: Fact-dense, citable paragraphs explicitly tailored for AI search engine extraction (Perplexity AI, ChatGPT Search, Gemini).
* Accessible interactive accordion components bound directly to Schema.org `FAQPage` entities on every public division route.

### 11.3 Search Engine & AI Bot Permissions ([`visibility.ts`](file:///media/cordial/New%20Volume/Opus%20OS/apps/api/src/routes/visibility.ts))
* **Robots.txt Rules**: Authorizes AI web crawlers (`GPTBot`, `ClaudeBot`, `PerplexityBot`, `Google-Extended`, `Bingbot`, `Baiduspider`) on all public pages, while strictly disallowing private administrative and customer portals (`/api/`, `/admin/`, `/portal/`, `/dashboard/`, `/workspace/`).
* **Sitemap Registry**: Serves dynamic `sitemap.xml` referencing `https://opusoverseas.com`.

### 11.4 Google Ecosystem Synchronization
* **Google Search Console**: Verified domain ownership via DNS TXT record (`4tCwjpcrvrcnd62hGmNSvq0p7zjgg4SQT6qI17FHPbc`) and HTML meta tag.
* **Google Analytics 4**: Dual-channel event bridge in [`umami.ts`](file:///media/cordial/New%20Volume/Opus%20OS/apps/app/src/lib/umami.ts) streaming custom business events simultaneously to GA4 (`G-DTPJGJ34C5`) and self-hosted Umami.
* **Google Cloud Project**: Connected under Project `Opus Overseas` (`opus-overseas` / Number `407949493816`).

---

## 12. Omnichannel Event Orchestration & n8n Automation Fabric

All asynchronous cross-application data flows are orchestrated via a centralized **Event Dispatcher** in Opus OS and executed by **n8n** running on the private VPS network:

```
                            ┌────────────────────────────────────────────────────────┐
                            │                 Opus OS Core API                       │
                            │        (Cloudflare Workers · Hono · D1 Engine)         │
                            └───────────────────────────┬────────────────────────────┘
                                                        │
                                          Async Non-Blocking Webhooks
                                      (HMAC-SHA256 Signed · ctx.waitUntil)
                                                        │
                                                        ▼
                            ┌────────────────────────────────────────────────────────┐
                            │              n8n Event Orchestration Hub               │
                            │                (n8n.opusoverseas.com)                  │
                            └───────┬────────────┬────────────┬────────────┬─────────┘
                                    │            │            │            │
       ┌────────────────────────────┘            │            │            └──────────────────────────┐
       ▼                                         ▼            ▼                                       ▼
┌──────────────┐                          ┌────────────┐┌────────────┐                         ┌──────────────┐
│  Phase 1     │                          │  Phase 2   ││  Phase 3   │                         │  Phase 4/5   │
│ Inbound Lead │                          │Attestation ││ ERPNext    │                         │Social & Health│
│ Omnichannel  │                          │& Milestones││ Invoicing  │                         │ Guard Alerter│
└──────┬───────┘                          └─────┬──────┘└─────┬──────┘                         └──────┬───────┘
       │                                        │             │                                       │
  ┌────┴────────────┐                     ┌─────┴──────┐ ┌────┴────────────┐                     ┌────┴────────────┐
  ▼                 ▼                     ▼            ▼ ▼                 ▼                     ▼                 ▼
Chatwoot        WhatsApp              WhatsApp      Chatwoot           ERPNext                Postiz            Uptime
Inbound         Receipt               Timeline      Timeline           Sales                  Multi-Platform    Emergency
Ticket          Token                 Alert         Audit              Invoice                Broadcast         SMS/WA
```

### 12.1 Webhook Dispatcher Engine ([`webhookDispatcher.ts`](file:///media/cordial/New%20Volume/Opus%20OS/apps/api/src/lib/webhookDispatcher.ts))
* **Cryptographic Signing**: Payloads are hashed with HMAC-SHA256 using `N8N_WEBHOOK_SECRET` and delivered with `X-Opus-Signature` and `X-Opus-Event` headers.
* **Non-Blocking Delivery**: Leverages `executionCtx.waitUntil()` on Cloudflare Workers, eliminating outbound HTTP latency from the client response loop (<50ms response times).

### 12.2 Integration Pipelines & Blueprints ([`packages/integrations/n8n/`](file:///media/cordial/New%20Volume/Opus%20OS/packages/integrations/n8n/))

1. **Inbound Lead & Omnichannel Sync ([`OpusOS-Inbound-Lead-Orchestrator.json`](file:///media/cordial/New%20Volume/Opus%20OS/packages/integrations/n8n/OpusOS-Inbound-Lead-Orchestrator.json))**:
   * Listens for `lead.created` events from `/api/public/leads`.
   * Routes by division (`study-abroad`, `visa`, `umrah`, `attestation`, `manpower`).
   * Creates contact and support thread in **Chatwoot** (`chat.opusoverseas.com`).
   * Triggers instant WhatsApp confirmation with encrypted Journey Token and portal URL via **WhatsApp Gateway** (`wa.opusoverseas.com`).
   * Syncs subscriber into **Listmonk** (`listmonk.opusoverseas.com`) for targeted email drip journeys.

2. **Attestation & Courier Milestone Tracker ([`OpusOS-Attestation-Courier-Tracker.json`](file:///media/cordial/New%20Volume/Opus%20OS/packages/integrations/n8n/OpusOS-Attestation-Courier-Tracker.json))**:
   * Listens for `attestation.created` and `attestation.status_updated` events from [`attestationApps.ts`](file:///media/cordial/New%20Volume/Opus%20OS/apps/api/src/routes/attestationApps.ts).
   * Dispatches WhatsApp milestone alerts to clients on document movement (Notary $\rightarrow$ SDM/HRD $\rightarrow$ MEA New Delhi $\rightarrow$ Embassy $\rightarrow$ Return Courier).
   * Appends internal audit timeline notes in Chatwoot.

3. **ERPNext Automated Invoicing & Reconciliation ([`OpusOS-ERPNext-Invoice-Reconciliation.json`](file:///media/cordial/New%20Volume/Opus%20OS/packages/integrations/n8n/OpusOS-ERPNext-Invoice-Reconciliation.json))**:
   * Listens for `payment.received` events from [`razorpay.ts`](file:///media/cordial/New%20Volume/Opus%20OS/apps/api/src/routes/razorpay.ts).
   * Automatically provisions or updates the Customer profile in **ERPNext** (`erp.opusoverseas.com`).
   * Creates a tax-compliant GST Sales Invoice and credits the GL ledger.
   * Sends payment receipt confirmation to the client via WhatsApp and Titan Mail (`contact@opusoverseas.com`).

4. **Social Media Broadcasting & Marketing Drips ([`OpusOS-Social-Broadcast-Drip.json`](file:///media/cordial/New%20Volume/Opus%20OS/packages/integrations/n8n/OpusOS-Social-Broadcast-Drip.json))**:
   * Multi-posts official scholarship alerts and group departure updates to LinkedIn, Facebook, X, and Instagram via **Postiz** (`postiz.opusoverseas.com`).
   * Triggers behavioral segment drip campaigns in **Mautic** (`mautic.opusoverseas.com`).

5. **Uptime Health Guard & Incident Alerter ([`OpusOS-Health-Incident-Alerter.json`](file:///media/cordial/New%20Volume/Opus%20OS/packages/integrations/n8n/OpusOS-Health-Incident-Alerter.json))**:
   * Runs a 5-minute cron health probe against `/api/infrastructure/health`.
   * Evaluates connectivity across Cloudflare D1, KV, Vectorize, AI bindings, and VPS container ports.
   * Instantly alerts the administrative incident responder via emergency WhatsApp / SMS upon service degradation.

6. **WhatsApp Smart Lead Nurture & Drop-Off Recovery ([`OpusOS-WhatsApp-Smart-Nurture.json`](file:///media/cordial/New%20Volume/Opus%20OS/packages/integrations/n8n/OpusOS-WhatsApp-Smart-Nurture.json))**:
   * **Intake Trigger**: Fires when a candidate completes eligibility screening or submits intake.
   * **+2 Hour Delay**: Checks D1 database to verify if an active consultation was booked. If unbooked, delivers personalized roadmap and a 1-click Cal.com booking link via **OpenWA** (`port 2785`).
   * **+24 Hour Delay**: Checks again; if still unbooked, dispatches upcoming intake deadline & scholarship availability alerts.
   * **Reply Ingestion**: Candidate replies on WhatsApp automatically route into **Chatwoot** (`chat.opusoverseas.com`) for live counselor takeover.

---

## 13. Google Cloud Platform (GCP) & Instant Indexing Integration

Opus OS leverages Google Cloud Platform services tied to Project `Opus Overseas` (`opus-overseas` / Number `407949493816` on `ajmalsn63@gmail.com`):

### 13.1 Instant Indexing API v3 ([`googleIndexing.ts`](file:///media/cordial/New%20Volume/Opus%20OS/apps/api/src/lib/googleIndexing.ts))
* **Edge RS256 JWT Assertion**: Generates signed Web Crypto assertions on Cloudflare Workers edge, exchanging them with `https://oauth2.googleapis.com/token` for short-lived Google OAuth access tokens.
* **Direct Notification Queue**: Pushes real-time `URL_UPDATED` notifications to `https://indexing.googleapis.com/v3/urlNotifications:publish`.
* **Authenticated Service Account**: `opus-indexer@opus-overseas.iam.gserviceaccount.com` authorized as a verified **Owner** in Google Search Console across `https://opusoverseas.com/`.
* **API Endpoints**:
  * `POST /api/indexing/publish`: Submits arbitrary batches of newly published courses, university listings, or job openings.
  * `POST /api/indexing/submit-core`: Submits all 7 primary public division pages.

---

## 14. Zero-Cost Operating Model & Free-Tier Quota Ledger

Opus OS is strictly architected to operate at **$0 monthly software licensing and infrastructure cost** by maximizing generous, permanent free tiers:

| Provider / Layer | Service & Feature | Free Quota Allowance | Opus OS Utilization & Cost Guard |
| :--- | :--- | :--- | :--- |
| **Google Cloud (GCP)** | **Google Indexing API (v3)** | **200 URL submissions / day** | **$0** — Instant crawling on every published course/job. |
| **Google Cloud (GCP)** | **Search Console & GA4** | **Unlimited event tracking** | **$0** — Telemetry dual-streamed via `umami.ts` (`G-DTPJGJ34C5`). |
| **Cloudflare Edge** | **Workers Edge Compute** | **100,000 requests / day** | **$0** — Sub-10ms CPU execution with non-blocking async webhooks. |
| **Cloudflare Edge** | **D1 SQLite Database** | **5 Million read rows / day**<br>**100,000 write rows / day** | **$0** — 89 normalized relational tables on `opusos-db`. |
| **Cloudflare Edge** | **KV Key-Value Store** | **100,000 reads / day**<br>**1,000 writes / day** | **$0** — Configuration, tokens, and short-link redirects. |
| **Cloudflare Edge** | **Vectorize Vector DB** | **5 Million query dimensions / mo** | **$0** — Semantic embedding index for AI search & matching. |
| **Cloudflare Edge** | **Workers AI** | **10,000 neurons / day** | **$0** — Edge LLM inference (Llama 3.3 / BGE embeddings). |
| **Cloudflare Edge** | **R2 Object Storage** | **10 GB storage / mo**<br>**10 Million reads / mo** ($0 egress) | **$0** — Encrypted document vault for passports & marksheets. |
| **Cloudflare Zero Trust**| **Access & Tunnels** | **Free for up to 50 users** | **$0** — Google One-Tap SSO on 16 internal VPS subdomains. |
| **Self-Hosted VPS** | **OpenWA WhatsApp Gateway** | **Unlimited messages** | **$0** — Multi-device WhatsApp Web session ($0 Meta/Twilio fees). |
| **Self-Hosted VPS** | **n8n Automation Engine** | **Unlimited workflow runs** | **$0** — Community Edition on `n8n.opusoverseas.com`. |
| **Self-Hosted VPS** | **Chatwoot / ERPNext / Mautic**| **Unlimited users & leads** | **$0** — Open-source Docker containers on private VPS network. |

---

## 15. Edge Caching, Smart Placement & High-Concurrency Scaling

Opus OS implements Cloudflare's tier-1 architectural patterns to deliver sub-50ms latency globally and handle sudden viral traffic spikes with zero origin server strain:

### 15.1 Cloudflare Workers Smart Placement
* **Configuration**: Configured via `[placement] mode = "smart"` in [`apps/api/wrangler.toml`](file:///media/cordial/New%20Volume/Opus%20OS/apps/api/wrangler.toml).
* **Optimization**: Automatically detects the network distance between the student, Cloudflare D1, and VPS origins, routing Worker isolate execution to the optimal data center to eliminate inter-datacenter latency hops at $0 cost.

### 15.2 Edge Micro-Caching with Stale-While-Revalidate
* **Implementation**: [`apps/api/src/routes/public.ts`](file:///media/cordial/New%20Volume/Opus%20OS/apps/api/src/routes/public.ts) and [`apps/api/src/routes/visibility.ts`](file:///media/cordial/New%20Volume/Opus%20OS/apps/api/src/routes/visibility.ts).
* **Cache Directives**:
  ```http
  Cache-Control: public, max-age=60, s-maxage=300, stale-while-revalidate=600, stale-if-error=86400
  CDN-Cache-Control: max-age=300
  ```
* **Resilience**:
  * **Instant 0ms Edge Hits**: Public university catalogs, division listings, and job openings are served directly from Cloudflare's 330+ edge PoPs without consuming D1 read queries.
  * **Background Revalidation**: Edge PoPs serve cached content while silently refreshing data in the background (`stale-while-revalidate=600`).
  * **Origin Down Fallback**: If an upstream database migration or VPS restart occurs, Cloudflare continues serving cached pages for up to 24 hours (`stale-if-error=86400`).

### 15.3 Connection Pooling & Scaling Guarantees
* **Serverless D1 IPC**: Cloudflare D1 utilizes serverless distributed SQLite with automatic read replication, bypassing traditional TCP socket connection exhaustion (`max_connections` limits).
* **QUIC Tunnel Multiplexing**: The Cloudflare Tunnel (`cloudflared`) multiplexes thousands of concurrent HTTP streams through a single persistent QUIC / HTTP/2 tunnel back to the VPS, preventing port exhaustion.

---

## 16. Internal AI Superpowers & Superadmin Governance Engine

Opus OS integrates Cloudflare Workers AI natively into the edge runtime, reserving flagship models exclusively for internal counselors, managers, and the superadmin:

```
                         ┌────────────────────────────────────────────────────────┐
                         │       Superadmin AI Control & Governance Hub           │
                         │           (/admin?tab=ai-governance)                   │
                         └───────────────────────────┬────────────────────────────┘
                                                     │
                             Enforces Models, Neuron Budgets & RBAC Limits
                                                     │
         ┌───────────────────┬───────────────────────┼───────────────────────┬───────────────────┐
         ▼                   ▼                       ▼                       ▼                   ▼
┌─────────────────┐ ┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐ ┌─────────────────┐
│ AI Visa Risk    │ │ 1-Click Vision  │     │ SOP & Embassy   │     │ Consultation    │ │ Edge Live Model │
│ Copilot Scorer  │ │ Document OCR    │     │ Cover Studio    │     │ Meeting Audio   │ │ Latency Bench   │
│ (Llama 3.3 70B) │ │(Llama 3.2 Vision│     │ (Llama 3.3 70B) │     │ (Whisper Turbo) │ │ (Interactive)   │
└─────────────────┘ └─────────────────┘     └─────────────────┘     └─────────────────┘ └─────────────────┘
```

### 16.1 Superadmin AI Governance Hub ([`AiGovernanceTab.tsx`](file:///media/cordial/New%20Volume/Opus%20OS/apps/app/src/components/admin/AiGovernanceTab.tsx))
* **Route**: Mounted under `GET/PUT /api/admin/ai/config`, `POST /api/admin/ai/test`, and `POST /api/admin/ai/batch-test`.
* **Owner Controls**:
  * **Global Master Switch**: 1-click kill switch to enable or disable AI features system-wide.
  * **Aggressive Edge Prompt & Inference Caching (KV)**:
    * Caches identical prompt inputs and visa evaluations using SHA-256 payload hashing (`ai_cache:${hash}`) in Cloudflare KV.
    * Configurable TTL: 24 Hours, 7 Days (Default), or 30 Days.
    * **Zero Neuron Consumption**: Repeat candidate evaluations or SOP outlines return instant `<5ms` responses with 0 neuron burn.
  * **Complete Model Catalog Visibility**:
    * **Flagship Reasoning**: `@cf/meta/llama-3.3-70b-instruct-fp8-fast` (128k context), `@cf/deepseek-ai/deepseek-r1-distill-qwen-32b` (64k context), `@cf/qwen/qwen2.5-72b-instruct` (32k context), `@cf/meta/llama-3.1-70b-instruct` (128k context).
    * **Fast Screening & Logic**: `@cf/meta/llama-3.1-8b-instruct` (128k context), `@cf/mistral/mistral-7b-instruct-v0.2` (32k context), `@cf/qwen/qwen2.5-coder-7b-instruct` (32k context), `@cf/google/gemma-2-9b-it` (8k context), `@cf/microsoft/phi-2` (2k context).
    * **Multimodal Vision**: `@cf/meta/llama-3.2-11b-vision-instruct` (128k context), `@cf/llava-hf/llava-1.5-7b-hf` (4k context).
    * **Audio Speech-to-Text**: `@cf/openai/whisper-large-v3-turbo`, `@cf/openai/whisper`.
    * **Multilingual Translation**: `@cf/meta/m2m100-1.2b`.
    * **Dense Vector Embeddings**: `@cf/baai/bge-large-en-v1.5` (1024-dim), `@cf/baai/bge-base-en-v1.5` (768-dim).
  * **Batch Prompts Execution Studio**:
    * Parallel execution of candidate queries on Cloudflare Edge with average latency per prompt benchmarking (`POST /api/admin/ai/batch-test`).

### 16.2 Internal Staff Copilots ([`staffAi.ts`](file:///media/cordial/New%20Volume/Opus%20OS/apps/api/src/routes/staffAi.ts))
1. **AI Visa Risk Copilot & Profile Scorer ([`AiVisaRiskCopilot.tsx`](file:///media/cordial/New%20Volume/Opus%20OS/apps/app/src/components/ai/AiVisaRiskCopilot.tsx))**:
   * Analyzes candidate academic gap years, financial backing, IELTS scores, and destination country rules with automatic KV cache retrieval.
   * Outputs **Visa Approval Probability Score (0–100%)**, **Refusal Risk Tier (Low/Medium/High)**, **Immigration Red Flags**, and a **Counselor Mitigation Checklist**.
   * **Batch Visa Risk Route**: `POST /api/staff/ai/batch-visa-risk` concurrently scores up to 10 applicant profiles in parallel.
2. **AI Statement of Purpose (SOP) & Embassy Cover Studio ([`AiSopStudio.tsx`](file:///media/cordial/New%20Volume/Opus%20OS/apps/app/src/components/ai/AiSopStudio.tsx))**:
   * Synthesizes student academic background, research experience, and university modules into high-scoring academic SOPs with 1-click clipboard export.
3. **1-Click Vision Document OCR**:
   * Automatically parses candidate passport numbers, dates of birth, expiry validity (>6 months), and degree grades into structured D1 client records.

### 16.3 Security, Privacy & Quota Protection
* **Strict RBAC**: Superadmin endpoints (`/api/admin/ai/*`) and Staff endpoints (`/api/staff/ai/*`) are role-gated. Anonymous public requests receive `403 Forbidden`.
* **Zero Third-Party Data Leakage**: All inferences execute in Cloudflare edge isolates under the organization's Zero-Trust boundary (100% DPDP Act compliant).
* **Tamper-Proof Audit Logging**: Every generation records an immutable entry in `audit_logs` capturing `userId`, `clientId`, `action`, and `modelUsed`.
* **Fail-Closed Fallbacks**: In offline or local development environments, endpoints return rule-based fallback evaluations without throwing 500 errors.