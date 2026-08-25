# Visa + Attestation — Gold-Standard Implementation Blueprint
*Research: VisaFlo 38% admin, 23% transcription error, 6.5hr status; SimpleVisa weekly cadence; AreTerix/Tvoxel/VisaBOS 18-module OS; Softsys CRM attestation; PEC 2025 e-Apostille 65% time cut + 40% cost; FR/DIRCO blowout 1-3d→5w; HCCH e-APP. Skills: `business-analyst` + `competitive-landscape` + `legal-advisor` + `revops` + `billing-automation` + `whatsapp-cloud-api`*

---

## 1. Architecture — Opus OS Aware

**Base:** `Hono` + `D1 (drizzle 93 tables)` + `Better Auth` + `R2` + `SyncHub Durable Object` `global` atom `X-SyncHub-Auth` HMAC + `TanStack Query` + `wouter` + `RBAC division-scoped` + `auditEvent` + `rateLimit` + domains `*.opusoverseas.com` (no `100.87.71.38`).

**Pattern reused from `blog` + `family` + `clients` LCC:**
- Every mutation `await publishSyncEvent(env, {channel, type, payload}, ctx)` → `public:*` + `staff:global:*` + `client:{id}:*`
- Frontend `createSyncClient({plane:'staff'|'client', channels})` → `qc.invalidateQueries({queryKey})` + public `refetchInterval 30s` fallback
- All writes `auditEvent` + `rateLimit` for public

**New tables (0084):**
- `visaRules {id, country, visaType, docs JSON, validityRule, leadDays, updatedAt}` — country-requirements DB
- `visaDeadlines {id, clientId, bookingId, type biometrics|medical|submit|LMIA_expiry, dueAt, dependsOn, status pending|met|overdue, createdAt}` — cascade engine
- `attestationRules {id, docType, destination, isHague, chain JSON [HRD,MEA,Embassy], avgDays, fee, updatedAt}` — Chain Builder AI
- `attestationVerifications {id, applicationId, apostilleId, eRegisterUrl, verificationStatus, verifiedAt}` — e-APP QR verify

Existing tables reused: `clients` (leadScore/assignedTo/slaDueAt), `engagements` (division visa), `documents` + `guardUpload` + `R2`, `waOutbox` + `paymentSchedules` + `tasks` + `familyMembers`.

---

## 2. Visa — 7 Modules — Gold Standard + Brainstorm + Design

### V1 Deadline Cascade Engine — Gold: VisaFlo cascading (biometrics → medical → submit → LMIA expiry), SimpleVisa Mon risk scan
**Brainstorm:**
- **A.** Single date change reflows all downstream (VisaFlo 40% cut); **B.** `T-14 no submitted` risk list; **C.** Exception lane vs standard lane split.

**Design:**
- **DB:** `visaDeadlines` as above, FK `bookingId=engagements.id` or `visaApplications.id`
- **API:** `POST /api/visa/deadlines/calc {bookingId, biometricsAt}` → creates 3 rows `biometrics +30d medical, medical+16d submit` etc.; `PATCH /:id/dueAt` → recalc dependents via `dependsOn`; `GET /api/visa/deadlines?clientId=&bookingId=&overdue=1` + `GET /api/visa/risk?days=14` (Mon scan); `publishSyncEvent public:visa + client:{id}:visa`
- **Frontend:** `VisaPrepPortal` Gantt + `ClientPortal visa` countdown red <48h + `WorkspaceShell` `staff:global:visa` toast; cron `02:00 runWorkflowExpiry` extends to `visaDeadlines overdue → createStaffAlert + waOutbox template: deadline_warning`
- **Realtime:** `public:visa` (staff can see) + `client:{id}:visa` (student sees own) + `staff:global:visa`

### V2 Country/Intake Requirements DB — Gold: VisaBOS built-in checklist per visa type, valid 6-month passport rule
**Brainstorm:** **A.** Seed from PEC 2025 + FR failure feed; **B.** Validity `passportExpiry <6m` block submit; **C.** `leadDays` drives `V1` dueAt.

**Design:**
- `visaRules` seeded with 20 top countries × 4 visa types (student/work/visit/family) via script `scripts/seed-visa-rules.mjs` reading `PEC 2025` JSON
- `GET /api/visa/rules?country=&visaType=` + `POST /api/visa/rules` (manager+) + `GET /api/visa/requirements/:bookingId` merges `visaRules.docs` with `documents` per client → returns `outstandingDocs[]` + `validityOk: bool`
- `portalVisa` draft `zod` validates `passportExpiry` against rule before `POST /applications`

### V3 Client Dashboard 24/7 — Gold: 60-75% status-check cut, progress bar
**Brainstorm:** **A.** Same `portal` journey pattern as `ClientPortal` city but visa-specific `stageKey → progressPct`; **B.** `viewCount` not needed, but `lastViewedAt` for nudge

**Design:**
- `GET /api/visa/applications` already returns `stageKey`; add `progressPct: {lead:10, docs:30, submitted:60, embassy:80, approved:100}` + `outstandingDocs` from V2; frontend `Visa application → 60% • 2 docs needed` + `waOutbox` status line
- `useVisibilityTracking('/visa-services')` already logs; add `trackVisaStageView`

### V4 Batch Employer Console — Gold: VisaFlo batch 8 LMIA once
**Brainstorm:** **A.** Employer is `clients` with `gstin` or `clients where primaryDivision=manpower`? Use `engagements` grouping by `employerId` stored in `intakeContext.employerId`; **B.** Bulk-assign side-by-side table.

**Design:**
- `GET /api/visa/batch?employerId=&division=work` → list `engagements` same employer, each with `stageKey, outstandingDocs`
- `POST /api/visa/batch/apply {employerId, sharedFields: {NOC, companyDocs}}` → loops `engagements` → `publishSyncEvent staff:global:visa:batch`

### V5 Transcription Guard (prefill) — Gold: 23% returns from copy error, single intake → gov form
**Brainstorm:** **A.** Single `clients.intakeContext` JSON as source of truth; **B.** `prefill` returns gov-form JSON, no re-type.

**Design:**
- `POST /api/visa/:id/prefill` → reads `clients` + `familyMembers` + `visaRules` → returns `{givenName, surname, dob, passportNumber, ...}` validated via `zod` + `guardUpload` magic-byte already; frontend `VisaPrepPortal` has `Copy to gov form` button that pastes into `contenteditable` gov mock

### V6 Weekly Ops Cadence + KPIs — Gold: SimpleVisa Mon-Fri cadence + 5 KPIs (attach rate, completion time, approval, tickets/100, exception %)
**Brainstorm:** **A.** Use existing `VisibilityHub → Reports` `reportSchedules`; **B.** `GET /api/visa/kpis` computes from `engagements` + `visaDeadlines` + `waOutbox`

**Design:**
- `GET /api/visa/kpis` → `{attachRate, avgCompletionDays, approvalRate, ticketsPer100, exceptionRate}`
- `POST /api/visibility/reports` schedule `visa_weekly` period `weekly` → `publishSyncEvent staff:global:visa:kpis`
- Frontend `VisaPrepPortal` card `Mon risk scan` button → `GET /api/visa/risk?days=14`

### V7 SOP/LOR Version Vault — Gold: PrepareBuddy 10 versions CV, 3-5 LOR revisions
**Brainstorm:** **A.** Reuse `documents` `version v1.0 +1.0` but scoped to `appId` not `clientId+fileName`; **B.** Per-application LOR vault

**Design:**
- `documents` already `clientId, fileName, version, r2Key`; add `appId` nullable for studyAbroad (`studyAbroadApplications.id`) → `GET /api/documents?appId=` lists 10 versions
- `POST /api/documents/presigned?appId=` stores `r2Key = appId-fileName-vN`

---

## 3. Attestation — 7 Modules — Gold Standard + Brainstorm + Design

### A1 Chain Builder AI — Gold: HRD→MEA→Embassy vs Hague Apostille final
**Design:**
- `attestationRules` seeded with `PEC 2025` + `Softsys` country DB (120+ Hague members)
- `GET /api/attestation/rules?docType=&destination=` + `POST /api/attestation/applications` auto-selects `chain` → `publishSyncEvent public:attestation`

### A2 Pre-screen AI (65% time cut) — Gold: NNA top errors (name differently, missing date)
**Design:**
- `POST /api/attestation/:id/prescreen` → `scanDocumentBytes` + `AI Vision` (Workers AI `llama-3.3`) checks seal legible / date missing / name mismatch → returns `issues[]` + `verificationStatus` → `staff:global:attestation:prescreen`

### A3 Stage Bot Auto Status — Gold: Email Campaigns trigger on stage move
**Design:** Already `PATCH /stage` → `publishSyncEvent ATTESTATION_STAGE_CHANGED`; add `sendNotification` per stage using `waOutbox` + `listmonk` template (`lead_ack` style)

### A4 SLA & Buffer Planner — Gold: FR 28d, DIRCO 35d, IL 14d, plan 3-6 mo advance
**Design:**
- `GET /api/attestation/sla?destination=` → `avgDays` from `attestationRules` + `bufferedDue = desiredDate - avgDays - 14` → `tasks` due
- `attestationAppsRouter` already `visaLeadDays`; extend

### A5 e-APP Verifier — Gold: QR + e-Register `https://hcch.net/verify` (68% lack resources)
**Design:**
- `attestationVerifications` + `GET /api/attestation/verify?apostilleId=` → fetch `e-Register` → store `verificationStatus` → `publishSyncEvent attestation:verify`

### A6 Batch / Corporate Retainer — Gold: Subscription Management monthly HR batch
**Design:**
- `POST /api/attestation/batch {docIds, destination}` → bulk `applications` + `paymentSchedules` 1 retainer/month + `reportSchedules:attestation_monthly`

### A7 Expiry Guard (passport 6m) — Gold: Leads Automatic Reminders WA/email
**Design:** Cron `02:00` scans `clients.passportExpiry` + `familyMembers`? → `expiry -180d` → `createStaffAlert` + `waOutbox template: passport_expiry_warning` → `client:{id}:attestation`

---

## 4. Cross-Cutting — Realtime, Domains, Legal

**Realtime matrix:**
- `public:visa`, `client:{id}:visa`, `staff:global:visa`, `staff:global:visa:batch`, `staff:global:visa:kpis`
- `public:attestation`, `client:{id}:attestation`, `staff:global:attestation:prescreen/verify`
- All `POST/PATCH` already `auditEvent` + `publishSyncEvent` + `rateLimit`

**Domains (as requested, no `100.87.71.38`):**
- `wa.opusoverseas.com` (OpenWA fallback, primary is Cloud API `graph.facebook.com`), `mautic/listmonk/chat/cal/umami/kuma/n8n/erp/crm/api.opusoverseas.com` via `secrets.json` + `PENDING-CONFIGS.md` (tunnel)

**Legal (attestation):** `legal-advisor` skill: GDPR/CCPA for `documents` `R2` + `familyMembers` PII, retention per `reportSchedules`, DPA placeholder — `documents` already `sha256Hex` + `r2Key` non-guessable.

**Implementation order (next sprint):**
1. `V1` + `A3` (Deadline + Stage Bot) — close 38% + 6.5hr (RICE 9.4+8.4)
2. `V2` + `A1` (Requirements DB + Chain Builder)
3. `A2` + `A5` (Pre-screen + Verifier)
4. `V3` + `A4` + `A7` (Dashboard + SLA + Expiry)

Each ships with `docs/phase-a-*.md` + `auditEvent` + `publishSyncEvent` + `typecheck+build` gate.
