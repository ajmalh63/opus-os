# Fluent Workspace — 6+4 Slices — Gold-Standard Implementation Blueprint
*Skills: `product-manager-toolkit` (RICE, PRD) + `ui-ux-pro-max` (accessibility, touch, performance) + `business-analyst` (cohort, KPI) + `legal-advisor` (retention). Research: Rocketlane 5-phase, EasyB 12-step churn 60-70% in 90d, Onboard.io health score, SaaS Portal 8 patterns, Enterprise UX.*

---

## 0. Realtime Contract (All Slices)

**Hub:** `SyncHub Durable Object` `global` atom, `X-SyncHub-Auth` HMAC. Every mutation `await publishSyncEvent(env, {channel, type, payload}, ctx)` → `public:*` + `staff:global:*` + `client:{id}:*` + `partner:{id}:*`.

**Frontend:** `createSyncClient({plane:'staff'|'client'|'partner', channels, enabled: VITE_SYNC_ENABLED !== 'false'})` → `qc.invalidateQueries({queryKey})` + public `refetchInterval 30s` fallback.

**Matrix (this doc):**

| Slice | publish channel | subscribe |
|---|---|---|
| C1 Dashboard health | `client:{id}:journey` + `staff:global:leads` | `ClientPortal` client, `DashboardHome` staff |
| C2 Onboarding checklist | `client:{id}:journey` + `staff:global:leads` | same |
| C3 Messaging (waOutbox) | `client:{id}:messages` + `staff:global:messages` + `public:messages` | `ClientPortal Messages` client, `Inbox` staff |
| C4 Calendar | `client:{id}:visa` (visaDeadlines) + `staff:global:visa` | `ClientPortal journey` calendar |
| C5 Visa tracker (anxiety-grade) | `client:{id}:visa` `VISA_STATUS_CHANGED` | `ClientPortal visa` tab |
| P1 Booking Tower | `partner:{id}:bookings` + `staff:global:partner:bookings` | `PartnerDashboard` partner |
| P2/P3 Commission/Performance | `partner:{id}:commissions` + `staff:global:payments` | `PartnerDashboard` partner |
| C6 Billing forecast + Help | `client:{id}:payments` + `public:payments` | `ClientPortal Billing` + `WorkspaceShell` help |

---

## 1. C1+C2 — Dashboard 2.0 + Onboarding <4 min (Health + One CTA)

**Gold standard (research):**
- **Vezert 8 patterns:** `one clear action above fold` (+15-25% DAU), `onboarding checklist <4 min` (+25-40% activation), billing forecast, help center.
- **Rocketlane 5 phases:** Pre-Kickoff → Kickoff → Setup/Config → Active Delivery (milestone + leading indicators: portal engagement, open blockers, task velocity vs baseline, unowned tasks) → Go-Live. + **Leading vs Lagging:** portal logins/week, blocker count, velocity — not just go-live date. 4hr SLA, 48hr escalation.
- **EasyB 12-step:** churn 60-70% in 90d, *define activation* as **one in-product action** (for Opus: `first document upload` or `first booking`), **5-step checklist (one pre-completed)**, time-to-value <14d = 80% retain vs 35-50% after 30d, Day-7 health alert (<3 logins → red), Day-14 check-in, Day-60 health predicts 90% retain.
- **Onboard.io health score:** composite `usage + support + engagement + commercial + tenure`, weighted (not list), start **at signature not launch**, 3 tiers Green/Yellow/Red each with action, yellow is where scores die, **test backwards** vs lost customers.

**Brainstorm — Opus OS specifics:**
- **Health Ring idea:** Donut `72/100` with segments `docs 40% + deadlines 30% + engagement 20% + payment 10%` — color Green ≥70, Yellow 40-69, Red <40. Yellow triggers `createStaffAlert` + `waOutbox` nudge.
- **One CTA idea:** If `nextDeadline in <3d` → `Upload IELTS` else if `offer pending` → `Accept offer` else `Book consultation`.
- **Onboarding 5-step idea:** `✓ Welcome (pre-completed) → Profile → Passport → Education → Intent` → confetti + `health +20` on 100%; stored in `clients.intakeContext.onboarding {pct, steps: [{key,done}]}` + `clients.leadStatus new→mql` after 3/5.

**Design:**
- **DB:** `clients.intakeContext JSON {onboarding: {pct, steps, updatedAt}, lastPortalLoginAt}` + `clients.leadScore/leadStatus` already (0083) + `tasks` for SLA.
- **API:** `GET /api/portal/dashboard` (new, client token) returns `{healthScore, nextAction: {label, href}, nextDeadline, onboarding:{pct, steps}, recentMessages:3}`; `POST /api/portal/onboarding/progress {step, done}` → patches `intakeContext.onboarding`, recalculates `healthScore = 0.4*docPct +0.3*deadlineHealth +0.2*engagement +0.1*payment` (docPct from `documents` vs `visaRules` checklist), publishes `client:{id}:journey`.
- **Frontend:** `ClientPortal dashboard` tab → `HealthRing` (SVG donut, `prefers-reduced-motion`, `aria-label`, `line-height 1.5`) + `One CTA` button `bg-brand-gold` 44px thumb target + `OnboardingChecklist` 5 rows with checkbox, progress bar `pct%`, `confetti` on 100; `WorkspaceShell` help search stub. `useQuery ['portalDashboard', token] refetchInterval 30s` + `createSyncClient(client, [client:{id}:journey])`.

**Verification:** Activation = `first document upload` within 14d → cohort `activationRate`; health Green≥70.

---

## 2. C3+C4 — Messaging + Calendar (cuts 6.5hr/week status)

**Gold:** Ticlick 11 essentials `Messaging & Task & Deadline` + Vezert `in-product help center`; Rocketlane `task management with client visibility` + `progress milestone` + `CRM integration`.

**Brainstorm:**
- **Unified thread idea:** Student ↔ Counselor in `waOutbox`/`conversations` same `clientId`, typing indicator via `SyncHub` `TYPING` event (ephemeral, not stored).
- **Calendar idea:** `visaDeadlines` + `paymentSchedules` → `GET /api/portal/calendar.ics` + `GET /api/portal/tasks?upcoming=7d` → `ClientPortal journey` `snap-x` chips + `Add to Calendar` button.

**Design:**
- `POST /api/portal/messages {body, attachmentId?}` (client token) → `waOutbox` `direction=inbound` + `publishSyncEvent client:{id}:messages`; staff `POST /api/family/...` equivalent already `staff:global:messages` → `Inbox` `createSyncClient(staff, [staff:global:messages])`
- `GET /api/portal/tasks` already `tasks` table; add filter `upcoming` `dueAt between now and +7d`; `GET /api/portal/calendar.ics` generates `BEGIN:VCALENDAR` from `visaDeadlines` + `paymentSchedules`

---

## 3. C5 Visa Tracker (Anxiety-Grade) + P1 Booking Tower (Trust + Visibility)

**Gold:** VP0 `official verbatim + plain explainer + checked-at` *mirrors, never authority*, `change-only alerts`; AgencyAuto `centralize bookings in one operational view` + `real-time status`.

**Brainstorm:**
- **Visa tracker idea:** `Official: Administrative Processing` (from `visaApplications.status`) + `Explainer: additional review, timelines vary` + `Checked 14 min ago` + `timeline` `checkedAt` history → `change-only` via `visaDeadlines status pending→overdue` push.
- **Booking tower idea:** Partner sees `pending vs confirmed` per sub-agent, `collectedBy` settlement, `viewCount` — like `BlogManager` but for `bookings`.

**Design:**
- `visaGoldRouter` already `GET /kpis`, `GET /risk`; add `GET /api/visa/tracker/:bookingId` → `{officialStatus, plainExplainer, checkedAt, timeline[]}`; frontend `ClientPortal visa` tab `VisaProgress` component + `PartnerDashboard referrals` sub-table `Bookings`

---

## 4. P2+P3 Commission + Performance (Revenue Intelligence)

**Gold:** VisaBOS tiered commissions auto, AgencyAuto `monitor agent performance real-time`.

**Design:**
- `GET /api/partner/:id/ledger` already `paymentSchedules where collectedBy=partnerId` + `commission = sum*boostPct` (from `thrive.tier`); `GET /api/partner/:id/performance` → `{bookings, conversion, errorFreq, avgCompletion}`; `PartnerDashboard` new `Performance` tab `createSyncClient(partner, [partner:{id}:commissions])`

---

## 5. C6 Billing Forecast + Help (30-50% deflection)

**Gold:** Vezert `Billing with forecasting + In-product help center search` → predictability + deflection.

**Design:**
- `GET /api/ledger/schedules?clientId=` already `derivedStatus paid/overdue`; add `forecast: sum(dueAt in 30d where status pending)` → `ClientPortal Billing` card `Next 30d ₹X` + `Help` `?` button → `WorkspaceShell` search `docs/blog-module + docs/fluent-workspace` articles

---

**Implementation order (each publishSyncEvent + typecheck+build):** C1+C2 → C3+C4 → C5+P1 → P2+P3 → C6. Next commit is C1+C2.

