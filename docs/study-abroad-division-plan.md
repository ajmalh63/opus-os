# Study Abroad Division — Implementation Plan (Phase 4)

Status: **COMPLETE (2026-08-15)** · 398 tests green · typecheck + build clean · migration 0054 applied
Pattern: research gold standards → schema + migration → match lib → backend routes (TDD) → frontend (Profiles 360 desk + Application Pipeline) → verify → docs.

---

## 1. Direction (owner decision, 2026-08-15)

**No university catalog in OpusOS.** Partner tools (realtime data) are the source of truth for
market data. OpusOS stores **application snapshots** — a form modal captures everything an agent
needs to apply, stored per student. Match/Reach/Safe compatibility is computed live (pure
function) against the student's profile — never stored.

## 2. Gold-standard research (2026 — SmartX, Erino, Relently, EduCtrl, SAMSCRM, Eduphron, monday CRM)

- **Deadline management**: reminders 7/3/1 days before application deadlines; offer acceptance
  deadlines (2–4 weeks); deposit deadlines.
- **Offer letter management**: conditional vs unconditional, conditions list, acceptance
  deadline, deposit amount + deadline, decision status.
- **Decision-pending dashboard** + pipeline health (stuck/aging cards).
- **Unified per-student application view** (one student, many applications, all statuses).
- **Document versioning + validity** (IELTS 2-yr expiry, notarization, verified/missing/expired).
- **Remarks/comms timeline** per application.
- **Admissions pipeline**: Shortlisted → Docs Ready → Submitted → Under Review → Offer →
  Deposit → Enrolled (+ Rejected lane).
- **Analytics**: conversion by stage, time-in-stage, offer→enrollment yield.

## 3. Schema (migration 0054)

### New table `study_abroad_applications`
| Column | Type | Notes |
|---|---|---|
| id | text PK | |
| clientId | text FK→clients | student |
| universityJson | text | **snapshot** of the application modal (name, country, city, website, portalUrl, portalUsername, program, degreeLevel, intake, deadline, applicationFeePaise, minGpa, minEnglishScore, englishTest, greRequired, tuitionLpaMin/Max, scholarshipsJson, notes) |
| status | text enum | shortlisted → docs_ready → submitted → under_review → offer_letter → deposit_paid → enrolled / rejected / withdrawn |
| docsChecklistJson | text | {transcript, cv, sop, lor1, lor2, ielts, passport, finance, portfolio}: 'missing'\|'received'\|'verified' |
| offerLetterKey | text | R2 key |
| offerType | text | conditional \| unconditional |
| offerConditionsJson | text | conditions list |
| offerDecision | text | pending \| accepted \| declined |
| acceptanceDeadline | int | |
| depositAmountPaise | int | |
| depositDeadline | int | |
| depositPaid | int bool | |
| rejectionReason | text | |
| decisionDate | int | |
| submittedAt | int | |
| notes | text | |
| createdAt / updatedAt | int | |

### `clients.intakeContext` canonical keys (extend)
`cgpa, englishTest, englishScore, targetIntake, targetCountry, tuitionBudget, preferredCourse, backlogs, gapYears`

### Legacy
`universities` + `study_abroad_shortlists` stay untouched (legacy; drop in later cleanup).

## 4. Match library `apps/api/src/lib/studyAbroadMatch.ts`
Pure function `matchApplication(profile, uniReq)` → `{ tier: 'match'|'reach'|'safe', score, reasons[] }`.
- match: all pass · reach: within 10% or one soft miss · safe: ≥15% above all thresholds.
- Score 0–100 weighted: CGPA 40, English 30, Budget 30.

## 5. Backend routes (TDD)

### Staff (`/api/study-abroad/applications`, RBAC counselor+)
- GET `/` (filters: status, country, intake, deadlineBefore) · GET `/:id` (with match tier)
- POST `/` (create from modal snapshot; zod) · PATCH `/:id` (snapshot fields)
- PATCH `/:id/status` (no-jump machine + auto-tasks: submitted→14d follow-up; offer→acceptance task; deposit→reminder; enrolled→visa prep)
- PATCH `/:id/offer` (offer letter upload key, type, conditions, deadlines, decision)
- PATCH `/:id/docs` (checklist state per doc)
- GET `/pipeline` (aggregate: counts per status, stuck >7d, decisions pending, deadlines ≤7d)

### Portal (`/api/public/portal/study-abroad/*`, token-auth)
- GET `/applications` (student's tracker) · POST `/applications/:id/accept-offer` (decision)

## 6. Frontend

### Tab 1 — Student Profiles (360 desk)
- Overview: applications-by-stage strip, next-deadline countdown, docs-ready %, comms timeline (existing `communications`), **remove plaintext portalPassword** (masked note)
- **New Application modal** (snapshot form + live Match/Reach/Safe badge)
- Shortlist tab → **Applications** (list of snapshots: uni, program, intake, deadline, status, fee, checklist %, offer status)
- Offer Letter panel (upload/conditions/deadlines/decision)
- Documents: per-application checklist grid (missing/received/verified)
- Counselling Summary (printable CSV)

### Tab 2 — Kanban Pipeline (application pipeline)
- Cards = applications; columns Shortlisted → Docs Ready → Submitted → Under Review → Offer Letter → Deposit Paid → Enrolled + Rejected
- **No-jump rules + WIP limits** (consistent with F1/F2 fix)
- Rich cards: deadline countdown (🔥<14d), missing-docs badge, match tier, program+intake, offer conditions
- Pipeline Health strip: counts, stuck >7d, decisions pending, deadlines this week
- Filters: country / intake / deadline window / match tier
- Today's Actions panel (tasks + deadline reminders)

## 7. Tests
`studyAbroadApplications.test.ts` (staff CRUD + no-jump + auto-tasks + pipeline aggregate),
`studyAbroadPortal.test.ts` (tracker + accept-offer), `studyAbroadMatch.test.ts` (tiers/score).

## 8. Verify
`pnpm typecheck` → `pnpm test` → `pnpm --filter app build` → migration applied → docs updated
(AGENTS.md, divisions-progress.md, this file).

## 9. Shipped (2026-08-15)

### Wave 2 — Student Portal & Intake (2026-08-15)
- **Student Profile Wizard** (`StudentProfileWizard.tsx`): 4 steps (Academic → Tests →
  Preferences → Review & Consent), progress bar (starts at 20%), planned-test capture,
  parent/guardian fields, **DPDP university-sharing consent** (SHA-256 notice hash + IP).
  Reused in client portal (self-serve) AND staff desk (agent-assisted walk-in).
- **Portal routes**: GET/PUT `/profile` (zod, completeness %, staff alert on 100%),
  GET `/documents` (vault + per-app checklist), POST `applications/:id/docs/:key/presigned`
  + PUT `/documents/upload` (HMAC-signed, OWASP-guarded, R2) — **upload auto-syncs the
  application checklist to 'received'** (staff sees it instantly; staff 'verified' shows
  to student instantly — single source of truth).
- **Client portal 🎓 tab** (`StudyAbroadClientSection.tsx`): My Profile / Applications
  (tracker + offer accept/decline) / Documents (per-app checklist uploads); 30s refetch
  for cross-tab sync.
- **Staff desk**: profile completeness % bar on registry cards + 📝 agent-assisted
  intake wizard modal.
- **Tests**: `studyAbroadPortalProfile.test.ts` (6) — **404 total green**.
- **Schema**: `study_abroad_applications` (migration 0054) — snapshot model, no catalog.
- **Match lib** `lib/studyAbroadMatch.ts` — reach/match/safe tiers + 0–100 score + TOEFL/PTE→IELTS normalization (9 unit tests).
- **Backend** `routes/studyAbroadApps.ts` — staff CRUD + no-jump status machine + auto-tasks (14-day decision follow-up, acceptance task, deposit reminder, visa prep) + offer/docs endpoints + pipeline aggregate (stuck >7d, decisions pending, deadlines ≤7d); portal tracker + accept-offer (10 tests).
- **Frontend** — `StudyAbroadApplicationModal.tsx` (snapshot form + LIVE match badge); Profiles tab: overview strip (apps/in-progress/offers/next deadline), Applications tab (snapshot cards + doc checklist grid + offer panel + no-jump status), portalPassword removed (masked note); Kanban tab → **Application Pipeline** (8 lifecycle columns + Rejected, rich cards with deadline countdown/missing-docs/match tier, Pipeline Health strip, country/intake/tier filters).
- **Verify**: 398 tests (71 files) · typecheck 3 workspaces · app build ✓ · migration 0054 applied to local D1.

## Deferred (integration wave)
Reminder dispatch (WhatsApp/email), Razorpay deposit collection, partner surface, OpusAI
eligibility upgrade, real e2e vs VPS.