# Client + Partner Workspace — Gold-Standard Audit & Fluent Design
*Research: Ticlick CRM 11 essentials, Vezert SaaS portal 8 patterns, Logic Providers 100+ cases, LegistAI intake, VP0 visa anxiety-grade, Soliant prototype-first. Skills: `business-analyst` + `competitive-landscape` + `legal-advisor` + `product-manager-toolkit` + prior Phase A.*

---

## 1. Gold Standard — What Good Looks Like (Research Synthesis)

### Client/Student Portal — 11 Essentials (Ticlick 2026)
Every segment ranks these **must-have** (students score on survey “what they like most”):
1. **Personalized Dashboard** — one clear action above fold (Vezert +15-25% DAU)
2. **Secure Login** — 128-bit `portalToken` + `HttpOnly` future, role+client scoped
3. **Application Tracking** — `Submitted → Documents Review → Awaiting University → Offer → Visa → Enrollment` with timestamps
4. **Document Upload** — drag-drop, version `v1.0`, `guardUpload` magic-byte, expiry warning
5. **Messaging Center** — single thread, no WhatsApp hop, typing/file share
6. **Task & Deadline Management** — `Task₀` shows `Document submissions, uni deadlines, offer accept, tuition, visa appoint.`
7. **University Offer Tracking** — `Offer Received` → accept/reject with deadline countdown
8. **Visa Progress Tracking** — anxiety-grade: official status verbatim + plain explainer + `checked-at` stamps, `change-only` alerts (VP0)
9. **Invoices & Payments** — `paid / pending / forecasted` + usage forecasting
10. **Notifications & Alerts** — 6 types: missing docs, upcoming consultation, application update, university decision, visa milestone, payment due
11. **Mobile-Friendly** — bottom nav, 44px thumb targets, `mobile: snap-x` already shipped for services

**SaaS Portal 8 Patterns (Vezert) that move retention:**
`Onboarding checklist <4 min (+25-40% activation)` → `One clear action dashboard (+15-25% DAU)` → `Billing with forecasting` → `In-product help center 30-50% deflection` → `Progressive disclosure settings` → `Integrations wizard 60-90s` → `Tooltips` → `Status transparency`.

### Partner Portal — What Partners Value Most (revenue-linked)
Per Atlas/AgencyAuto: `Central booking visibility, tiered commissions auto, performance per sub-agent, real-time payout ledger, secure data share, training, mobile`. VisaBOS: `auto-capture Meta lead webhook, visual pipeline New→Won, one-click lead→student, Razorpay, internal chat, branch RBAC` → 22% conversion in 6w.

---

## 2. Opus OS Current vs Gold — Gap Audit

### Client Workspace `ClientPortal.tsx` — 7 tabs today

| Tab | Current | Gold | Gap | User Want? | Like Most? |
|---|---|---|---|---|---|
| `dashboard` | Generic `Journey Vault` `sessions/journeys[0].client` + `assignedCounselor` | **Personalized Dashboard — health score 0-100 + one clear CTA** `Complete your IELTS upload` + `next deadline countdown` | **High** — no health, no single CTA (Vezert) | Wants `Where am I stuck?` | **Yes — #1 liked** (transparency) |
| `study` | `StudyAbroadClientSection` `applications/documents` + `catalog/shortlist` | **Offer Tracking + SOP/LOR version vault** | Medium — offer accept/reject + version 10 missing | Wants `Offer Received → Accept in 14d` | **Yes — delight** |
| `visa` | `VisaServices` guided `Will be available soon` blurred ₹ | **Visa Progress Tracker anxiety-grade** `official status + plain explainer + checked-at + change-only alerts + checklist` | **High** — gold `6.5hrs/week` cut not yet | Wants `no update yet` silence broken | **Yes — most stressful** |
| `umrah` | `UmrahClientSection` `packages/calendar/bookings` `₹500 advance` | **Umrah Pilgrimage progress + installment bar** | Medium — schedule bar `2/3 paid` now via `ledger` but not in `ClientPortal` bookings tab | Wants `Makkah hotel confirmed?` | Yes |
| `attestation` | `AttestationClientSection` `applications` + `rateData` 42 fallback | **Chain visual + SLA buffered due + e-Register verify** | High — `A1/A4/A5` now built in API but not surfaced in `ClientPortal` | Wants `With Embassy → 8 days left` | Yes |
| `jobs` | `ManpowerMarketplace` `Match%` + `Quick Apply` | **JobOffer + onboarding hub** `credential expiry, multi-jurisdiction` | Medium — `ManpowerMarketplace` is marketplace, not `jobs` progress | Wants `Interview scheduled` | Yes |
| `journey` | Timeline `engagements[]` | **Task & Deadline Management** `visaDeadlines` Gantt + `tasks` calendar + ICS | **High** — `journey` is `engagements` list, not `deadlines` Gantt | **Wants `What’s due this week?`** | **Yes — #2 liked** |

**Cross-cutting gaps (all tabs):**
- **Onboarding checklist <4 min missing** — new `OP-…` sees empty dashboard, no `complete profile → 25% → 100%` checklist (Vezert +25% activation)
- **Messaging is `Journey` read-only + external WA** — **no in-portal thread** with typing/file (Ticlick #5, LegistAI `inline commenting, verify/needs translation`)
- **Notifications bell missing** — 6 types not surfaced; `createStaffAlert` exists but no `client:*:notifications` bell in `ClientPortal` header
- **Invoices fragmented** — `ClientPortal` `payments` list exists but **no forecasting, no schedule bar** `Advance/Balance/Visa` (Ledger now `paymentSchedules` ready, not wired to `ClientPortal`)
- **Mobile bottom nav missing** — desktop `WorkspaceShell` sidebar OK, but `ClientPortal` 7 tabs overflow on 375px (needs `snap-x` + `bottom tab bar`)
- **Help center 0%** — no in-product search/tooltips → 30-50% ticket deflection lost

**Evidence:** `grep ClientPortal` shows `sessionStorage portalToken` + `fetch /portal/study-abroad/*` etc., but `grep messaging` in `ClientPortal.tsx` = 0 hits.

### Partner Workspace `PartnerDashboard.tsx` — 5 tabs today

| Tab | Current | Gold | Gap |
|---|---|---|---|
| `overview` | `thrive.totalPoints + tier` | **Central booking visibility** `pending vs confirmed per sub-agent` | High — `overview` is points, not booking pipeline |
| `links` | `1-Click Links & Creative Kit` + deep `?country=` SubID | **Integrations wizard 60-90s** OAuth field mapping | Medium — wizard is manual `Copy Link` |
| `referrals` | Immutable audit log `referrals[]` | **Performance per sub-agent** `bookings, conversion, error freq` (AgencyAuto) | **High** — no per-agent dashboard |
| `payouts` | `requested → paid` | **Single ledger** `Finance vs Ops shared numbers` + `collectedBy` + `refund rules` | Medium — ledger exists but `PartnerDashboard` doesn’t show `paymentSchedules` |
| `tiers` | VIP `points` | **Training + internal chat** (VisaBOS) | Medium — no `Internal Team Chat` for sub-agents, no `Walk-in visitor log` |

**Gap:** `Central booking visibility` + `tiered commissions auto` + `real-time payout ledger` are **backend ready** (`ledgerRouter`, `family` analogy) but partner `referrals` tab is `leads`, not `bookings` (Umrah departures). Sub-agent sees `referrals` but not `Umrah Bookings` they created.

---

## 3. Design — Make Workspaces Fluent (Realtime Sync First)

**Principle (EDUCAUSE redesign):** *Remove silent stalls + clarify ownership + reduce double handling + embed visibility* → bulk profile creation, single-touch completeness, direct document submission, automated milestone notifications, real-time status vs spreadsheet.

**Realtime contract (all new):**
- `public:leads/visa/attestation/blog` + `staff:global:*` + `client:{id}:visa/attestation/payments/messages/family/journey` + `partner:{id}:bookings/commissions`
- `BlogManager` pattern reused: `createSyncClient(staff|client)` → `qc.invalidateQueries` + public `refetchInterval 30s`

### Client — 6 Slices (FFCI 10-15, quick wins first)

**C1 Dashboard 2.0 (Vezert 1 clear action)**
- DB: reuse `visaDeadlines` + `paymentSchedules` + `documents` + `familyMembers`
- API: `GET /api/portal/dashboard` (new, aggregates `healthScore = f(stage, doc, deadline, login) 0-100` + `nextAction: {label, href}` + `nextDeadline`)
- Frontend: `ClientPortal dashboard` → big `Health 72/100` ring + `One CTA: Upload IELTS (due in 3d)` + `Deadline countdown` + `Offer card` if `studyAbroadApplications offer` exists; `realtime: client:{id}:visa|payments|family`

**C2 Onboarding Checklist <4 min (Vezert + Ticlick)**
- 4 steps `Profile → Passport → Education → Intent` `progress 25%×4`; stored in `clients.intakeContext.onboarding {step, pct}` + `clients.leadStatus`; `publishSyncEvent client:{id}:journey` on each step; confetti on 100%

**C3 Messaging Center (in-portal)**
- DB: reuse `waOutbox` + `conversations` unified; add `portalMessages {id, clientId, from:'client'|'counselor', body, createdAt}` or reuse `conversations`
- API: `POST /api/portal/messages {body}` (client token) + `GET /api/portal/messages` → `client:{id}:messages` sync; staff `POST /api/portal/:id/messages` from `Client360`
- Frontend: `ClientPortal` new `Messages` tab (or `Journey` → tab) with `createSyncClient(client, [client:{id}:messages])` + typing + file attach via `documents/presigned`

**C4 Task & Deadline Calendar**
- Reuse `visaDeadlines` + `tasks` + `paymentSchedules`; `GET /api/portal/tasks?upcoming=7d` + ICS `GET /api/portal/calendar.ics` (for mobile add to calendar); `ClientPortal` `journey` → calendar `snap-x` + `deadline` dots

**C5 Visa Anxiety-Grade Tracker (VP0)**
- `VisaProgress` component: `official status verbatim` (from `visaApplications.stageKey`) + `plain explainer` (`Biometrics → Medical must be within 30d`) + `checkedAt` stamp + `timeline` (`Documents Under Review → Awaiting Decision → Offer → Visa`) + `changeOnly` push via `visaDeadlines` status `pending→overdue`
- Lives in `ClientPortal visa` tab, replaces `Will be available soon` blurred ₹ when `visaRules` seeded

**C6 Invoices & Forecasting + Help Center**
- `ClientPortal` `Billing` sub-card: `paymentSchedules` `paid/total` bar + `dueAt` + `forecast: next 30d ₹X` + `download invoice` (already `payments` ledger); Help: `?` button → search `docs/blog-module-gold-standard.md` articles + `WorkspaceShell` help center 30-50% deflection

### Partner — 4 Slices

**P1 Booking Visibility Tower:** `GET /api/partner/:id/bookings?division=umrah` (join `bookings` where `createdByPartner=partnerId`) → `PartnerDashboard referrals` tab add `Bookings` sub-table `departure, pax, status held/confirmed, collectedBy, viewCount` → `staff:global:partner:bookings`

**P2 Commission Autopilot:** Already `partnerLoyalty` `tier` + `ledgerRouter` `collectedBy`; add `GET /api/partner/:id/ledger` → `paymentSchedules where collectedBy=partnerId` + `commission = sum(amount)*tier.boostPct` live

**P3 Performance per Sub-Agent:** `GET /api/partner/:id/performance` → `bookings, conversion, error freq (overdue), avgCompletion` → `PartnerDashboard` new `Performance` tab (table + sparkline)

**P4 Mobile Pulse + Internal Chat:** `PartnerDashboard` bottom nav `snap-x` + `Inbox` `partner:{id}:messages` (reuse `Inbox` `staff:global:messages` but filtered)

---

## 4. Audit — Will User Use It Fluently?

| User | Wants (survey) | Liked Most (retention) | Opus Before | After Design | Fluency Test |
|---|---|---|---|---|---|
| **Student/Client** (study abroad) | `Check status without calling` `Upload without email` `Know what’s missing` | **Transparency + faster access** (Ticlick) | Had to call for status (6.5hr/week) | Dashboard health + one CTA + 24/7 progress + task calendar + visa timeline + in-portal chat → **no email needed** | Prototype with 5 students: can they find `next deadline` in <10s? |
| **Pilgrim family** | `Hotel confirmed?` `Installment due when?` | **Clarity on payment** | Installments scattered | Ledger bar `2/3 paid • ₹15k due 5 Jan` + `Refund rules` | Can mother see `with Embassy` stage without calling? |
| **Worker candidate** | `Interview when?` `Onboarding docs?` | **Mobile upload** | Marketplace only | `jobs` → `Offer tracker` + mobile bottom nav | Can candidate upload PCC from phone <30s? |
| **Sub-agent Partner** | `Where’s my booking?` `My commission?` | **Central visibility + auto payout** | Had to ask ops on WA | `Bookings` live + `Ledger` auto + `Performance` self-serve | Can sub-agent see `confirmed` without WA ping? |

**Soliant 4 practices applied:** Prototype-first (BlogManager already is prototype), mobile-default, error handling as UX (Visa `changeOnly` + Attestation `pre-screen`), non-functional `realtime` before build.

---

## 5. Implementation Order — Fluent Fast (each `publishSyncEvent` + `typecheck+build`)

1. **C1+C2** Dashboard + Onboarding (health score + checklist) — 1 week, lifts activation +25% (Vezert)
2. **C3+C4** Messaging + Calendar (waOutbox reuse, visaDeadlines) — 1 week, cuts 6.5hr status
3. **C5** Visa anxiety tracker + **P1** Booking Tower — 1 week, trust + branch visibility
4. **P2+P3** Commission + Performance — 1 week, revenue intelligence
5. **C6** Billing forecast + Help — 3 days, deflection

Each ships with `auditEvent` + `publishSyncEvent` + `refetchInterval` fallback for public.

