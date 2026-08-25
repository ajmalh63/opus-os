# Client Portal — Complete End-to-End Navigation, Sublink & Interactive Action Map

> **Document Version:** 2026-08-23 (v8.0 — Global Careers Wizard + Real Match% + Attestation Fallback + Visa Guided Path + Nizamabad HQ Footer)  
> **Target Surface:** `/portal` (`apps/app/src/pages/ClientPortal.tsx`, `ClientDashboardHub.tsx`, `ManpowerMarketplace.tsx`, `ManpowerProfileWizard.tsx`, `StudentProfileWizard.tsx`, `AttestationClientSection.tsx`, `VisaServices`, `UmrahClientSection`, `ClientWorkspaceControlsTab`)  
> **Scope:** Every Header Link, Sidebar Desk, Tab, Wizard Step, Field, Dropdown, Button CTA, State Transition, Realtime Sync & Superadmin Mirror.

---

### Changelog v7.0 → v8.0 (this update)

| Area | Before (v7) | After (v8) | Files |
|------|-------------|------------|-------|
| **Footer + HQ** | Fake `O` circle, `Hyderabad HQ` sidebar, `Hyderabad` processing centre | Real `Footer.svg` logo (`/Footer.svg`), `Nizamabad HQ — Nizamabad, Nizamabad, Telangana` + `+91 93988 48376` + `contact@opusoverseas.com` in both `Footer.tsx` and `ClientPortal.tsx` footer + sidebar widget | `Footer.tsx`, `ClientPortal.tsx:522,711` |
| **Global Careers — duplicate cards** | Two white cards stacked (`Verified Openings` + inner `My Applications — Live Tracking` with duplicate 6-job grid) | **Single `bg-white rounded-2xl p-6`** — header + search + tabs + job grid. Inner duplicate removed | `ManpowerMarketplace.tsx:67` |
| **Global Careers — Match%** | Fake `85 + (job.id.charCodeAt(0)%12)` random 85–96% | Real `computeManpowerMatchFrontend(profile, job)` — 100pt weighted: **Exp 35 + Skills 35 + Trade/Edu 15 + Passport/Medical 15**, tiers `top_match ≥75 emerald / standard ≥50 amber / cold_pool slate`. Demo `35%` until `pct ≥60%` | `lib/manpowerMatch.ts`, `ManpowerMarketplace.tsx:260` |
| **Global Careers — Profile** | No dedicated wizard, `formJson` empty → always `incomplete_form` | **New `ManpowerProfileWizard.tsx` 6 steps** (Personal / Contact & Passport / Experience & Skills / Education & Trade / Salary & Medical / Review & Resume) + `manpowerCompleteness()` 8 checks → `GET/PUT /api/public/portal/manpower/profile` → `clients.intakeContext.manpowerProfile` + `localStorage` fallback + invalidates `manpowerProfile/portalClientSession/kanban` + staff alert 100%. Tabs `My Profile (pct%) | Open Jobs | My Applications` mirror StudyAbroad | `ManpowerProfileWizard.tsx`, `ManpowerMarketplace.tsx:72`, `portalManpower.ts:414` |
| **Global Careers — Resume** | No vault, `resumeKey` null | **Resume vault** — presigned `POST /resume/presigned` → `PUT /resume/upload` → R2 `r2Key` + `documents` row (`Resume`) + `manpowerProfile.resumeKey`; visible in wizard Review, Profile tab, Documents workspace, staff `Client360` | `portalManpower.ts:461,483` |
| **Global Careers — Apply** | `token + jobId` only, quota not visible | `token + jobId + formJson + resumeKey` → `manpowerFormSchema` validated; `isProfileReady (pct≥60)` gate; quota `3/3` `429 QUOTA_EXCEEDED` + `activeCount`; `matchScore/tier` stored → staff `ManpowerPortal` triage + alert `🔥 Top Match 82%` | `ManpowerMarketplace.tsx:26`, `portalManpower.ts:405` |
| **Attestation — Destination dropdown** | `rateData.countries` only → empty when `attestationRateCards` empty (0 active) | Fallback `ALL_SERVICE_COUNTRIES` 42 destinations (UAE…Other) — same list as staff `AttestationPortal.ATTESTATION_COUNTRIES`. Helper text when fallback active. `rateData.countries` prioritized when present | `AttestationClientSection.tsx:8,183` |
| **Attestation — Superadmin mirror** | Placeholder text | Full `AttestationSuperadminForm` in `ClientWorkspaceControlsTab` — 7 fields (Destination 42-dropdown, Category, Doc name/holder/issuingState, Translation, Urgency, Deadline) → `POST /api/attestation/applications` on behalf of selected `OP-2026-XXXX`, realtime to `AttestationPortal` + client tracker | `ClientWorkspaceControlsTab.tsx` |
| **Visa Processing** | 3-col card grid per country, `₹ fee` visible, `Start →` active | **Subtle guided path** — paused amber banner `⏸️ Applications paused — pricing will be available soon`, single selector (country → visa type dropdown without `₹`), checklist `— doc` bullets, blurred `₹••••`, `✓ Join Waitlist — Notify Me When Live` → `POST /api/public/portal/visa/inquiry` (waitlist). No payment while paused | `ClientPortal.tsx:1424` |
| **Realtime sync** | StudyAbroad only 30s poll | Manpower, Attestation, Visa now all `refetchInterval 30000` + `publishSyncEvent(client:{id}:applications)` + `qc.invalidateQueries` on save/upload | `portalManpower.ts`, `attestationApps.ts`, `ClientPortal.tsx` |
| **Superadmin — Client Workspace Controls** | 7 tabs (directory/onboard/divisions/partners/alerts/ai/developer) | **New 8th tab `🎛️ Client Workspace Controls`** — client picker (`/api/clients`) → division switcher (5) → for each division **every form/field/dropdown/button editable** (intakeContext JSON, rate-cards, price-bands, jobs, chain, pickup, match weights, toggles, quota, vault). Writes via `PATCH /api/clients/:id` | `ClientWorkspaceControlsTab.tsx`, `AdminConsole.tsx:9,13` |

---

## 1. Master Workspace Navigation & Layout Tree

```
                                ┌─────────────────────────────────────────────────────────┐
                                │                 /portal WORKSPACE ROOT                  │
                                └────────────────────────────┬────────────────────────────┘
                                                             │
         ┌───────────────────────────────────────────────────┼───────────────────────────────────────────────────┐
         ▼                                                   ▼                                                   ▼
┌──────────────────┐                                ┌──────────────────┐                                ┌──────────────────┐
│   TOP NAV BAR    │                                │   LEFT SIDEBAR   │                                │ FLOATING WIDGETS │
│  (Header Strip)  │                                │  (Action Desks)  │                                │  (Live Support)  │
└────────┬─────────┘                                └────────┬─────────┘                                └────────┬─────────┘
         │                                                   │                                                   │
         ├─► [Logo Header.svg] ─► / (Home)                   ├─► 📊 1. Dashboard ──► [Section 3]                 └─► [💬 Live Chat]
         ├─► [Language: EN] ──► Switch Locale                ├─► 🎓 2. Study ──────► [Section 4]                     (Chatwoot FAB)
         ├─► [Sync Badge] ────► Realtime Telemetry           ├─► ✈️ 3. Visa ───────► [Section 5 — Guided Paused]      └─► Opens Staff
         ├─► [💬 Live Chat] ──► Toggle Chatwoot              ├─► 🕋 4. Umrah ──────► [Section 6]                         Inbox Chat
         ├─► [📞 +91 93988 48376] ──► tel:+919398848376       ├─► 📑 5. Attestation─► [Section 7 — 42 countries fallback]
         └─► [Sign Out] ──────► Invalidate & /login          ├─► 💼 6. Jobs ───────► [Section 8 — Profile→Jobs→Applications]
                                                             ├─► 🗺️ 7. Journey ────► [Section 9]
                                                             └─► [Nizamabad HQ Helpdesk] ────► Chatwoot +  address
```

**Auth:** `X-Portal-Token` header (preferred, `sessionStorage` + `replaceState` cleans `?token` from URL) → `GET /api/public/portal/lookup` → `portalClientSession` + `kanban` + `documents` hydration. BetterAuth cookie fallback. 128-bit `OP-2026-XXXX` display id.

---

## 2. Authentication & Entry Convergence Map

```
═════════════════════════════════════════════════════════════════════════════════════════════════════
ENTRY POINT                          ACTION TAKEN                          DESTINATION / WHAT COMES NEXT
═════════════════════════════════════════════════════════════════════════════════════════════════════

1. URL Token Query ────────────────► GET /api/public/portal/lookup ──────► Hydrates workspace state
   Example: ?token=OP-2026-1042        (Verifies 128-bit CSPRNG token)     Renders Dashboard with active files

2. Authenticated Session ──────────► GET /api/public/portal/session ──────► Hydrates authenticated user
   (BetterAuth Session Cookie)         (Resolves user & counselor)         Renders Dashboard with client account

3. First-Time / Guest Visitor ─────► Renders Token Entry Screen ──────────► Option A: Enter OP-2026-XXXX token
   (No Cookie, No Token)                                                    Option B: Click "Sign In with Email"
                                                                            └─► Navigates to /login (OTP/Pass)
```

---

## 3. Desk 1: 📊 Dashboard & Kanban Hub (`portalTab: 'dashboard'`)

```
┌───────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                 DASHBOARD DESK LINK & ACTION MAP                                  │
└───────────────────────────────────────────────────────────────────────────────────────────────────┘

 🌟 HERO ACTION STRIP
 ├─► [Client ID Badge: #OP-2026-XXXX] ────► Displays verified client journey account number
 └─► [+ Apply New Service] Button ────────► Clicks ➔ Jumps directly to 🎓 Study Abroad Desk (`study`)

 📈 TOP TELEMETRY RIBBON CARDS
 ├─► Card 1: [🚀 Enrolled Services] ─────► Clicks ➔ Scrolls down to 5-Stage Realtime Kanban Board
 ├─► Card 2: [📑 Document Vault] ────────► Clicks ➔ Jumps directly to 🗺️ Journey Vault (`journey`)
 ├─► Card 3: [💳 Payments & Receipts] ───► Clicks ➔ Jumps to 🗺️ Journey Desk Receipts Ledger
 └─► Card 4: [👤 Assigned Counselor]
     ├─► [Counselor Name] ─► Displays real assigned staff name & branch (Nizamabad HQ — )
     ├─► [Live Chat Desk] Button ────────► Calls window.$chatwoot.toggle() (Opens In-App Chat)
     └─► [📞 Call Desk] Button ──────────► Triggers dialer (+91 93988 48376)

 📋 5-STAGE REALTIME SERVICE PIPELINE KANBAN
 │ (Live card per enrolled service: Study Abroad, Visa, Umrah, Attestation, Jobs)
 │
 ├─► Column 1: [1. Intake (Lead)] ───────► Click card ➔ Division intake view
 ├─► Column 2: [2. Qualified (Counsel)] ─► Click card ➔ Counselor consultation review
 ├─► Column 3: [3. Documents (Vault)] ───► Click card ➔ Division document checklist
 ├─► Column 4: [4. Processing (Embassy)] ─► Click card ➔ University/consular tracker
 └─► Column 5: [5. Completed (Enrolled)] ─► Click card ➔ Offer/visa/flight download

 🚀 6-DIVISION 1-CLICK ACTION LAUNCHPAD
 ├─► [🎓 Study Abroad Desk] Button ──────► Switches tab to `study`
 ├─► [✈️ Visa Processing Desk] Button ───► Switches tab to `visa` (guided paused path)
 ├─► [🕋 Umrah Packages & Dates] Button ─► Switches tab to `umrah`
 ├─► [📑 Certificate Legalization] Button► Switches tab to `attestation` (42 countries)
 ├─► [💼 Overseas Careers Board] Button ─► Switches tab to `jobs` (Profile→Jobs→Applications)
 └─► [🗺️ Verified Journey Files] Button ─► Switches tab to `journey`

 🏠 SIDEBAR WIDGET — Nizamabad HQ (updated)
 └─► `Nizamabad HQ` · `Nizamabad` · `Nizamabad, Telangana, India` · `Mon–Sat 9:30 AM–6:30 PM` → Chatwoot bubble
```

---

## 4. Desk 2: 🎓 Study Abroad Desk (`portalTab: 'study'`)

```
┌───────────────────────────────────────────────────────────────────────────────────────────────────┐
│                               STUDY ABROAD DESK LINK & ACTION MAP                                 │
└───────────────────────────────────────────────────────────────────────────────────────────────────┘

 📌 TOP SUB-NAVIGATION TABS
 ├─► [1. Student Profile & Wizard] — 6 steps (universal, any country, DPDP):
 │   ├─► Step 1: [Personal] — Full name, DOB, Gender, Nationality, Phone, Email, Address, City/State/Pincode, Passport, Languages, Emergency contact
 │   ├─► Step 2: [Academic] — Highest qual, Univ name, CGPA, 10th/12th %, Board, Degree, Grad year, Backlogs, Gap years/reason, Work exp/company/role
 │   ├─► Step 3: [Tests] — IELTS/TOEFL/PTE/SAT/ACT/GRE/GMAT scores, testPlanned, englishWaiver, testDate
 │   ├─► Step 4: [Preferences] — Target country (42+ list, free-text), Intake, Course, Tuition/Living budget (₹ lakh), Funding source, Scholarship
 │   ├─► Step 5: [Financial & Family] — Parent name/phone/occupation, Family income, Sponsor, Funding bank, Passport
 │   └─► Step 6: [Review & Consent] — DPDP university-sharing consent (SHA-256) + completeness chips → [Save Profile] → PUT /portal/study-abroad/profile → computes completeness% → unlocks Match Engine
 │
 ├─► [2. University Applications & Snapshots]
 │   ├─► Application Card — Univ name, Program, Country, Intake, Stage chip, Deadline chip (`🔥 3d left`)
 │   ├─► [Match Compatibility Badge] — Live: 🎯 MATCH / 🚀 REACH / 🛡️ SAFE (from intakeContext vs uni requirements)
 │   ├─► [View Details] — Modal: Tuition, deadline countdown, campus details
 │   ├─► [Offer Letter Panel] — Conditional/Unconditional + deadline + Deposit `₹` → [Download PDF] (presigned R2) / [Accept]/[Decline] → POST /accept-offer
 │   └─► [+ Add Another University] — Shortlist selector → POST /applications
 │
 └─► [3. Document Vault & Presigned Upload Checklist]
     ├─► Per-application keys: transcript, cv, sop, lor1/lor2, ielts, passport, finance, portfolio + `other` (labelled, multi)
     ├─► [Upload] → `POST /applications/:id/docs/:key/presigned?token&filename&label` → `PUT` R2 → `received` → staff `verified` → client badge `✓ Verified`
     └─► Note: 30s poll + `publishSyncEvent(client:{id}:documents)` — staff verification appears without refresh
```

---

## 5. Desk 3: ✈️ Visa Processing Desk (`portalTab: 'visa'` — **v8 Guided Paused Path**)

```
┌───────────────────────────────────────────────────────────────────────────────────────────────────┐
│                          VISA SERVICES DESK — GUIDED PAUSED PATH (v8)                             │
└───────────────────────────────────────────────────────────────────────────────────────────────────┘

 ⏸️ PAUSED BANNER (amber, top)
 └─► `⏸️ Applications paused — pricing will be available soon` + `Will be available soon` pill
     Text: `No fees are charged while paused. Save your interest — we’ll notify you when live.`

 📋 YOUR APPLICATIONS (if any) — read-only tracker
 └─► Grid of existing visa drafts → [Continue Draft] or status chip `draft / submitted / approved` → opens wizard/tracker

 🔍 GUIDED SINGLE-SELECTOR (replaces 3-col card grid — subtle, no overload)
 ├─► [Select Destination Country Dropdown] — 42 countries (same as attestation), filtered from `/portal/visa/products`
 ├─► Other country? → `[__other__]` → expands `Request a custom visa` form: Country * + Visa type + Notes → [Request Visa] → POST /portal/visa/inquiry → staff alert
 └─► When country selected → single subtle card:
     ├─► Header: `Your next step · 1. Choose destination → 2. See checklist → 3. Join waitlist` + `entryType` pill
     ├─► [Visa type for {country}] Dropdown — options without `₹` (shows `• processingTime • Will be available soon`)
     ├─► Required Documents checklist — `— Passport scan` bullets (no ✓, prepare early)
     ├─► Fee row: `Fee | blurred ₹•••• | Will be available soon` pill (price hidden)
     └─► CTAs: `[✓ Join Waitlist — Notify Me When Live]` → POST /portal/visa/inquiry {country, visaType, notes:"Waitlist — paused"} → `setNotice ✓ You’re on the waitlist` + `[Need another country? →]` → sets `country=__other__`

 🛠️ WIZARD (existing, now paused entry only via tracker drafts)
 ├─► 9 steps: applicant / passport / contact / employment / travel / financial / visaHistory / docs / review — `saveSection` per step → PUT /portal/visa/applications/:id
 └─► Submit → POST /.../submit → `missingSections` guard → tracker. New starts blocked while paused (waitlist instead).

 🔒 PRICING HIDDEN GLOBALLY — `feePaise` replaced with blurred skeleton + pill; staff `VisaPrepPortal` still sees exact `₹` for internal costing.
```

---

## 6. Desk 4: 🕋 Umrah Travel Desk (`portalTab: 'umrah'`)

```
┌───────────────────────────────────────────────────────────────────────────────────────────────────┐
│                                UMRAH PILGRIMAGE DESK LINK & ACTION MAP                            │
└───────────────────────────────────────────────────────────────────────────────────────────────────┘

 📌 TOP SUB-NAVIGATION TABS
 ├─► [1. Browse Packages]
 │   ├─► Tier Cards — Economy (Quad) · Standard (Triple) · Premium (Double) · Luxury
 │   ├─► Hotel Proximity Chips — Makkah <150m, Madinah Haram boundary
 │   ├─► [View Full Itinerary] → 14-Day spiritual itinerary
 │   └─► [Check Available Dates] → Jumps to Group Departures Calendar
 │
 ├─► [2. Group Departures Calendar]
 │   ├─► Departure Row — Date, Return, City (Nizamabad/Hyderabad/Mumbai override), Tier
 │   ├─► Seat Badge — `🟢 12 Seats Available of 30`
 │   └─► [Book Seats] → Party Booking Builder Modal
 │       ├─► Pax Count & Rooming (1–10, Shared/Solo)
 │       ├─► Passenger Breakdown (Adult / Child with Bed / Child no Bed / Infant)
 │       ├─► Live ₹ calc: Total + Advance ₹500×pax + 72h Hold
 │       └─► [Reserve Seat via Advance] → Razorpay ₹500/pax → `Reserved (72h Hold)`
 │
 └─► [3. My Bookings Tracker]
     ├─► Booking Card — PNR, Pax count, Departure City, Seat Status
     ├─► [Pay Remaining Balance Online] → Razorpay remaining → `Confirmed`
     └─► [Confirm Office Cash Settlement] → Token → staff confirms in CRM
```

---

## 7. Desk 5: 📑 Attestation Desk (`portalTab: 'attestation'` — **v8 Fallback + Realtime**)

```
┌───────────────────────────────────────────────────────────────────────────────────────────────────┐
│                        ATTESTATION DESK — 42 COUNTRIES, REALTIME SYNC (v8)                       │
└───────────────────────────────────────────────────────────────────────────────────────────────────┘

 🔍 RATE CARD & ROUTE CALCULATOR
 ├─► [Select Document Category] — [Educational] [Personal] [Commercial]
 ├─► [Select Destination Country *] — 42 options (UAE, Saudi, Qatar, Kuwait, Oman, Bahrain, Malaysia, China, Thailand, Vietnam, Taiwan, Sri Lanka, Bangladesh, Japan, South Korea, Singapore, Hong Kong, USA, UK, Canada, Australia, NZ, Ireland, Germany, France, Netherlands, Sweden, Switzerland, Spain, Italy, Poland, Russia, Turkey, Egypt, Jordan, Libya, South Africa, Brazil, Mexico, Other)
 │   └─► Source: `GET /public/portal/attestation/rate-cards?token` → `countries[]` when `attestationRateCards.active`; fallback `ALL_SERVICE_COUNTRIES` when table empty (so dropdown never empty)
 ├─► [Select Legalization Route] — State HRD vs SDM vs Chamber (from rateCard `stepsJson`)
 └─► Indicative Price Band — `₹ min – max` (from `app_settings.attestation_price_bands` embassy/apostille × category) — `Indicative only — exact price confirmed after partner check`

 📦 DOORSTEP ORIGINAL PICKUP BOOKING
 ├─► [Book Doorstep Courier Pickup] → Modal: Address, Date slot, Courier (Blue Dart/DTDC) → POST /public/portal/attestation/applications → AWB + transit courier
 │
 📋 STATUTORY STAMP SEQUENCE TRACKER (realtime)
 ├─► Stage pipeline: `quote_requested → quote_confirmed → docs_awaiting → in_process → completed → dispatched → delivered → rejected` (no-jump guard + backward allowed)
 ├─► Chain steps: `Notary/SDM/HRD/Chamber → MEA → Embassy/Apostille → MOFA` → `PATCH /chain` `pending/done/failed` + date/note → `all done → completed` + task
 ├─► Pickup: `awaiting_docs → docs_received → dispatched_to_supplier → returned → delivered` → `PATCH /pickup`
 └─► Realtime: `publishSyncEvent(client:{id}:applications)` + `refetchInterval 30s` → staff `AttestationPortal → Stamping & Apps` and client `tracker` share same `attestationApplications` rows

 🧾 QUOTE FORM — 7 fields (superadmin mirror identical):
 ├─► Destination *select (42), Category *select (3), Document name *text, Holder name *text, Issuing state *text, Arabic translation checkbox, Urgency `normal/urgent` select, Needed by date, Scan file (presigned R2), Add to Cart + Bulk Quote (5% bundle)
 └─► Superadmin `ClientWorkspaceControlsTab → attestation` can create on behalf of any `OP-2026-XXXX` via `POST /api/attestation/applications` (same schema) → appears in client tracker instantly

 💰 Staff controls — `AttestationPortal → Rate Cards` (11 fields per product), `Price Bands` (6 ranges), `Chain`, `Pickup`, `Courier` — all `publishSyncEvent` → portal price/band/chain reflect without refresh.
```

---

## 8. Desk 6: 💼 Global Careers Desk (`portalTab: 'jobs'` — **v8 Single Card + Wizard**)

```
┌───────────────────────────────────────────────────────────────────────────────────────────────────┐
│                    GLOBAL CAREERS DESK — PROFILE → JOBS → APPLICATIONS (v8)                       │
└───────────────────────────────────────────────────────────────────────────────────────────────────┘

 🔰 SINGLE WHITE CARD (duplicate removed — was 2 cards stacked)
 └─► Outer `bg-white rounded-2xl p-6 border slate-200/80` now holds header + search + tabs + job grid. Inner `My Applications — Live Tracking` duplicate deleted.

 📌 TOP TABS (inside single card)
 ├─► `My Profile (pct%)` — 6-step `ManpowerProfileWizard`
 │   ├─► Step 1 Personal — fullName, dob, gender, nationality, currentCity, languages
 │   ├─► Step 2 Contact & Passport — phone, email, emergencyContact/Phone, hasPassport → passportNumber/expiry
 │   ├─► Step 3 Experience & Skills — totalYears, currentRole, currentEmployer, skills CSV, tradeCertifications, drivingLicense LMV/HMV/both, willingToTravel
 │   ├─► Step 4 Education & Trade — highestQualification (highschool/ITI/diploma/undergrad/postgrad/phd), institution, fieldOfStudy
 │   ├─► Step 5 Salary & Medical — currentSalaryPaise, expectedSalaryPaise, noticePeriodDays, selfDeclaredFit (fit for Gulf), hasChronicCondition
 │   ├─► Step 6 Review & Resume — file picker (PDF/DOCX/JPG 5MB) → presigned R2, manpowerConsent DPDP checkbox, completeness chips
 │   └─► [Save Profile] → `PUT /public/portal/manpower/profile` (header X-Portal-Token, fallback localStorage `manpowerProfile:{token}`) → merges into `clients.intakeContext.manpowerProfile` + invalidates `manpowerProfile/portalClientSession/kanban` + staff alert at 100%
 │       └─► Resume vault (realtime): `POST /resume/presigned` → `PUT /resume/upload` → `resumeKey/resumeName` → visible in `Documents` workspace + staff `Client360`
 │
 ├─► `Open Jobs` — International Job Marketplace
 │   ├─► Search: [Role/trade input] + [All countries ({n}) dropdown] + `Direct Hiring` pill
 │   ├─► Paused chip: `Live` emerald (marketplace live; visa separately paused)
 │   ├─► Gate banner (when pct<60): `Complete your profile (pct%) to see real Match% — demo 35%` → [Complete profile →] switches to Profile tab
 │   ├─► Job Vacancy Cards Matrix (2-col):
 │   │   ├─► Job Title + `Match {score}%` pill (tier-colored: emerald ≥75 / amber ≥50 / slate <50) — **Real** `computeManpowerMatchFrontend(profile, job)` 100pt: Exp 35 + Skills 35 + Trade/Edu 15 + Passport/Medical 15. Before 60% shows 35% cold_pool demo.
 │   │   ├─► Pills: Country mono + Sector + Collar `Blue/White` gold + INR blur? No — salary visible: `QR 2,500 (~₹57,000)` with conversion (`QR×22.8 / AED×22.6 / SAR×22.2`)
 │   │   ├─► Benefits highlights + Description clamp-2
 │   │   └─► [View Details] + [⚡ Quick Apply] (gold, min-h-11) — `Quick Apply` checks `isProfileReady`, else throws `Complete profile 60%+` → switches to Profile. On success `POST /portal/manpower/applications {token, jobId, formJson, resumeKey}` → `manpowerFormSchema` → quota 3 `429 QUOTA_EXCEEDED` + `matchScore/tier` alert `🔥 Top Match 82%`
 │   └─► Empty: `No jobs match your filter.`
 │
 └─► `My Applications (n)` — 6-Stage Deployment Tracker
     ├─► Application row: `jobTitle — jobCountry · selectionStatus · Match 78% (top_match)` + tier pill + strengths/gaps chips
     ├─► Poll `GET /portal/manpower/applications?token` `refetchInterval 30s` — staff `ManpowerPortal → Deployment Status` writes same `manpowerDeployments` + `matchScore/tier` → client sees live
     └─► No separate VAS/Community duplicate panel — those live in superadmin controls + payment vault.

 🔍 FILTERS — Countries derived from `jobPostings` distinct `country`; Sectors from `filterOptions.sectors` (superadmin editable); `manpower_filters` in `app_settings` hot-reloads without deploy.

 💰 PRICING — Will be available soon: Manpower job salaries show `salaryText` (employer band) but VAS/membership `₹499/₹999` still visible for paid add-ons (intentional — VAS is not paused).
```

---

## 9. Desk 7: 🗺️ Journey Vault & Consents (`portalTab: 'journey'`)

```
┌───────────────────────────────────────────────────────────────────────────────────────────────────┐
│                               JOURNEY VAULT DESK LINK & ACTION MAP                                │
└───────────────────────────────────────────────────────────────────────────────────────────────────┘

 ⚖️ DPDP-2023 COMPLIANCE & SUBJECT RIGHTS MANAGER
 ├─► [Core Processing Consent] ──────────────► Active (Required for visa/admission fulfillment)
 ├─► [WhatsApp Milestone Updates] ───────────► Toggle: [Granted] ➔ Click [Withdraw] ➔ Suppresses WA alerts
 ├─► [University & Consular Data Sharing] ───► Toggle: [Granted] ➔ Click [Withdraw] ➔ Suppresses sharing
 ├─► [Marketing & Scholarship Alerts] ───────► Toggle: [Granted] ➔ Click [Withdraw] ➔ Suppresses promo emails
 └─► Note: Every withdrawal calls POST /api/public/portal/consent/withdraw with legal SHA-256 evidence proof

 🗄️ VERIFIED DOCUMENT VAULT
 ├─► Document Item Card ─────────────────────► File Name, Version, Upload Timestamp, Scan Clean Status, Resume `resumeName`
 ├─► Verification Status Badge ──────────────► 🟢 Verified / 🟡 Pending / 🔴 Rejected (with notes)
 ├─► [Secure Preview / Download] Button ─────► Generates temporary signed R2 download link (`/documents/:docId/download` `X-Portal-Token` ownership check)
 └─► [+ Upload New Document] Button ─────────► Opens File Picker ➔ Presigned R2 PUT ➔ Adds file to vault + `publishSyncEvent(client:{id}:documents)` → staff `Client360` sees instantly

 💳 SETTLED INVOICES & PAYMENT RECEIPTS
 ├─► Payment Record Row ─────────────────────► Payment ID, Milestone Name, Settlement Date, Method (UPI/Card), `totalQuotePaise` / `paidAmountPaise`
 ├─► Amount in INR (Paise Converted) ────────► Exact rupee figure (e.g. ₹50,000) — hidden when `Will be available soon` flag active
 └─► [Download Tax Invoice / Receipt] Button ─► Generates official GST-compliant payment receipt PDF (via `jspdf` + `html2canvas`)
```

---

## 10. Global Floating Overlays, Footer & Realtime Sync

```
═════════════════════════════════════════════════════════════════════════════════════════════════════
COMPONENT / LINK                     ACTION TRIGGERED                      RESULTING OVERLAY / VIEW
═════════════════════════════════════════════════════════════════════════════════════════════════════

1. [💬 Counselor Live Chat] ────────► window.$chatwoot.toggle() ─────────► Chatwoot live chat window
   (Top Header & Sticky Button)       (Sends client ID, name, email)       Routes to Staff Inbox (/inbox)

2. [📞 Support Hotline] ────────────► tel:+919398848376 ─────────────────► Dialer to Nizamabad HQ

3. [Sign Out] ──────────────────────► handleSignOut() ───────────────────► Destroys session, clears cache, → /login

4. [Footer Logo] ───────────────────► /Footer.svg (real logo, not O) ────► Rendered in public `Footer.tsx` + client `ClientPortal.tsx` footer

5. Nizamabad HQ Footer ────────────────► Static block ──────────────────────► `Nizamabad` + `Nizamabad, Telangana, India` + `+91 93988 48376` + `contact@opusoverseas.com` + `Mon–Sat 9:30–6:30`
   (Replaces `Hyderabad HQ` sidebar widget + `Hyderabad` processing centre placeholder)

6. Realtime Sync Bus ───────────────► `publishSyncEvent` + TanStack `invalidateQueries` + `refetchInterval 30000` + WS (`client:{id}:documents`, `staff:division:*:pipeline`)
                                    ├─► Client wizard save → `clients.intakeContext` → `manpowerProfile/studyProfile` queries → Match% + kanban stage → staff desk
                                    ├─► Staff `PATCH /stage` / `PATCH /chain` / `PATCH /pickup` → client tracker chain/fee/pickup → without refresh
                                    └─► Resume/doc upload → `documents` row → both vaults

7. Superadmin Mirror ───────────────► Admin Console → `🎛️ Client Workspace Controls` (`/admin?tab=clientControls`) — superadmin-only hub mirroring **every client form/field/dropdown/button**:
                                    ├─► Client picker (every `OP-2026-XXXX`) → Division switcher (5) → for each: editable wizard (same 6 steps), job posting full form (11 fields), dropdown editors (Countries/Sectors/Collars), button toggles (Quick Apply/View Details/60% gate/Match/Salary INR/Turnstile), quota input, match weights display, vault clear, chain/pickup editors
                                    ├─► Writes via `PATCH /api/clients/:id` `intakeContext` + `POST /api/manpower/jobs` + `POST /api/attestation/applications` on behalf of client → realtime to portal & kanban
                                    └─► Also: `Division Go-Live & Kill-Switch Hub` → pause `visa` while keeping page Live; `ManpowerPortal`/`AttestationPortal` for granular CRUD
```

---

## 11. File & Endpoint Index (v8)

```
ClientPortal.tsx — portalTab router (dashboard/study/visa/umrah/attestation/jobs/journey) + X-Portal-Token + Nizamabad footer
ManpowerMarketplace.tsx — single-card, tabs profile/jobs/applications, search, real Match% (4-pillar), quota 3, waitlist
ManpowerProfileWizard.tsx — 6-step wizard + manpowerCompleteness()
lib/manpowerMatch.ts — frontend mirror of api/lib/manpowerMatch.ts (computeManpowerMatchFrontend)
AttestationClientSection.tsx — country fallback ALL_SERVICE_COUNTRIES 42, rateCards + priceBands, cart/bulk
ClientWorkspaceControlsTab.tsx — superadmin mirror (every field/dropdown/button for 5 divisions)
Footer.tsx — Nizamabad HQ block, real Footer.svg
Logo.tsx — /Header.svg vs /Footer.svg switch
portalManpower.ts — GET/PUT /profile, POST/PUT /resume/*, POST /applications (409 QUOTA_EXCEEDED), GET /jobs filtered by tier
portalVisa.ts — GET /products, POST /inquiry (waitlist), wizard saveSection
attestationApps.ts — rate-cards, price-bands, applications, chain, pickup, portalAttestationRouter (42 countries)
```

