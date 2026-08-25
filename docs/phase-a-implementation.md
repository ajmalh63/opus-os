# Phase A — Lead Router + Family Hub + WhatsApp Native + Ledger
*Gold standard synthesis: RevOps (Single Source, Speed-to-Lead, SLA), WhatsApp Cloud API v21 (2026), Billing Automation + Razorpay, Product Discovery. Loaded: revops + whatsapp-cloud-api + billing-automation + analytics-tracking*

---

## 0. Mission — Why Phase A First
Research: 30-40% post-counseling leak + 15-20% walk-in leak + 4-6hr response → <30min benchmark. Every hour beyond 30 min = 10x conversion drop. WhatsApp 90% prefer channel but scattered. Installments 59% banking integration gap. Closing these 4 stops revenue leak before scaling counselors (Phase B).

**Realtime sync contract (all workspaces):**
- Every mutation publishes `public:*` + `staff:global:*` via `publishSyncEvent` → `SYNC_HUB` DO `global` → WS `SyncHub` → `createSyncClient` invalidates TanStack queryKeys.
- Channels: `public:leads`, `public:blog` (already), `public:payments`, `public:messages`, plus `staff:global:leads|family|messages|payments` and `client:{id}:messages|payments` and `departure:*:inventory`.
- Frontend: `BlogManager` already subscribes to `public:blog`/`staff:global:blog`; new modules will follow same pattern (see wiring below). Public visitors get `refetchInterval 30s` + staff gets WS push.
- `flushScheduled` for leads? Not needed — assignment is instant, not scheduled.

---

## 1. Lead Command Center (LCC)

**Gold standard (RevOps + SmartX/Erino 2026):**
- Single source CRM, dedup `email domain + phone + name`, speed-to-lead **<5 min ideal, <30 min benchmark** (21x more likely to qualify), SLA 4hr contact / 48hr qualify, round-robin + territory/skill routing + fallback owner (unassigned → cold fast), lead scoring explicit (fit: counsellor country/course/budget) + implicit (pricing page, multiple visits) + negative (competitor, student email), MQL = fit + engagement ≥ 50-80, recycling with reason code.

**Brainstorm — Opus OS specifics:**
- **Source attribution:** already `leadSource` + `utm` capture via `visibilityTracking.ts` → extend to `leadCapture` widget that auto-detects `fb_ad, google, walk_in, shiksha, leverage` via UTM + manual picker for front-desk.
- **Scoring model v1 (simple, recalibrate quarterly):** `country intent (+15) + budget tier (+15) + intake urgency (+20) + visits 2+ (+10) + pricing page view (+15) + WhatsApp opt-in (+10) − personal email (−10) − competitor domain (−30)`. Threshold 50 = MQL → auto task + WA template.
- **Routing v1:** territory-based `division → counselor.skills` + round-robin weighted by capacity (PTO, current WIP). Fallback `Central Desk` if no match. Log every routing decision to `audit`.
- **SLA engine:** `leadsRouter.post('/')` after insert → `publishSyncEvent public:leads` + create `task` due in 4hr + `createStaffAlert`. Cron checks every 15 min: if `task` overdue → escalate to manager + reassign.

**DB:**
- `leads` table already exists? Check `schema.ts` — yes `leads`? Add `leadScore`, `assignedTo`, `mqlAt`, `slaDueAt`, `duplicateOf`.
- Add `leadAssignments` audit table (leadId, fromUser, toUser, reason, at).

**API:**
- `POST /api/leads` (public, Turnstile) → scoring + routing + SLA task → `POST /api/visibility/utm` already
- `GET /api/leads?status=&assignee=&q=` (manager+) + `PATCH /:id/assign` `POST /:id/recycle`
- Publish `public:leads` + `staff:global:leads` on create/assign/recycle

**Frontend (Superadmin → Workspace → Clients or new `Leads` tab):**
- Table `Lead | Score badge | Source utm | Assigned counselor avatar | SLA countdown (red <1hr) | Quick assign dropdown` + **Speed-to-lead timer** per row.
- Filter `MQL | SQL | Unassigned | Overdue SLA` + bulk assign.

**Realtime:** `ClientsList` + `DashboardHome` already use `clients` query — add `createSyncClient(staff, ['public:leads','staff:global:leads'])` → `invalidate ['clients','leads']`.

---

## 2. Family Hub (Multi-Contact Record)

**Gold standard (Erino multi-contact):** Indian study-abroad decisions involve student + at least one parent as final decision-maker. Generic CRM single-person fails → secondhand distortion, financial talks inconsistent. Need `student ↔ parent` linked contacts, parent sees same stage as student, financials once.

**Brainstorm:**
- `familyMembers` table: `id, clientId (student OP-...), relation (father/mother/guardian/spouse), name, phone, email, isPrimaryContact, canReceiveUpdates (bool), createdAt`. Student remains `clients` primary; parents are members.
- On `POST /api/clients` or later `POST /api/family/:clientId/members`, auto-create task "Verify parent contact" if missing.
- **Visibility:** `Client360` + `ClientPortal` show Family Hub card: student + parents, each with `WhatsApp opt-in` + `view stage` (read-only). `publishSyncEvent client:{id}:family` + `staff:global:family`.
- **Compliance:** opt-in explicit per parent (timestamp, method), opt-out keyword `STOP` via WhatsApp webhook → `canReceiveUpdates=false`.

**API:**
- `GET /api/family/:clientId/members` (staff + client token)
- `POST /api/family/:clientId/members` `{relation, name, phone, email}`
- `PATCH /members/:id` / `DELETE`

**Frontend:**
- `Client360` tab `👨‍👩‍👧 Family` (manager+) + `ClientPortal` section (client sees own family, can add parent).
- Communication Hub will use this to send to correct thread (student vs parent).

---

## 3. WhatsApp Native (Business Cloud API, not loopback)

**Gold standard v21 (Meta 2026):**
- System User Token permanent, phone-number-id scoping, portfolio-based limits 250→Unlimited (quality-gated), template categories `Marketing / Utility / Authentication` (Utility ~₹0.35 vs Marketing ~₹0.88), 24h service window free, outside window → template only, quality rating 7-day recency-weighted (Green/Yellow/Red) at number + per-template level, opt-in documented, opt-out `STOP`.

**Opus OS today:** `OPENWA_BASE_URL/http://100.87.71.38:2785` (tailnet loopback, X-API-Key, single session `main`) + `WA_PROVIDER=openwa` fallback to Meta. Works for testing but **not portfolio-scalable**, not quality-rated, not template-approved.

**Brainstorm — Phase A native:**
- **Dual-provider abstraction:** keep `messaging.ts` `sendWhatsApp(to, body, opts)` → if `WHATSAPP_TOKEN && PHONE_NUMBER_ID` set → Cloud API `https://graph.facebook.com/v21.0/{PHONE_NUMBER_ID}/messages` else fallback OpenWA. Means same `sendNotification` path works without code change.
- **Env:** `WHATSAPP_TOKEN, PHONE_NUMBER_ID, WABA_ID, VERIFY_TOKEN, APP_SECRET` (new). Keep `OPENWA_*` as fallback for dev.
- **Outbox:** `whatsappMessages` table already? Check — `conversations` exists, but need `waOutbox` with `status: queued→sent→delivered→read→failed`, `wamid`, `templateName`, `category`, `quality` tracking.
- **Templates:** Seed 3 approved templates in `WhatsApp Manager`: `lead_ack` (Utility), `sla_followup` (Utility), `installment_reminder` (Utility). Marketing `promo` later. Store `templateId` in `appSettings`.
- **Webhook:** Already `POST /api/webhooks/wa` (HMAC `X-WA-Signature`) + `X-Hub-Signature-256` for Cloud API (APP_SECRET timingSafeEqual). Add handler for `message_template_status_update` → update `appSettings` template quality.
- **Inbox:** `Unified Inbox` tab already `conversations` — wire Cloud API inbound to same table (`source: whatsapp_cloud` vs `openwa`), so counselor sees one thread regardless of provider.

**API:**
- `POST /api/messaging/whatsapp/send` `{to, type:'text'|'template', body, templateName, vars}` (manager+)
- `GET /api/messaging/whatsapp/templates` (list approved)
- Webhook `GET /api/webhooks/wa` verify (`hub.verify_token`) + `POST` (HMAC) → `publishSyncEvent public:messages` + `staff:global:messages`

**Frontend:**
- `Inbox` page already central — add provider badge `Cloud API ✓` vs `OpenWA (dev)` + template picker dropdown + quality dot (Green/Yellow/Red) next to number.
- `BlogManager`? no. `ClientsList` → `Send WA` button uses `sendWhatsApp` abstraction.

**Realtime:** `Inbox` subscribes `staff:global:messages` + `public:messages` (staff plane allows). New inbound → `invalidate ['conversations','inbox']` → badge + toast.

---

## 4. Installment & Refund Ledger (Booking-Tied)

**Gold standard (billing-automation + AgencyAuto 3.2):**
- Every payment tied to `bookingId` (never orphan), installment schedule per booking, sub-agent collection visibility, refund rules per booking stage (e.g., before confirmation 100%, after visa 0%), single dashboard Finance vs Ops share same numbers.

**Opus OS today:** `payments` table with `clientId, engagementId, amount, type, milestoneName, referenceNumber, method, createdAt` + Razorpay `order/verify`. Good ledger but `bookingId` is `engagementId` (for visa) and `umrahBookings` has installments via `milestoneName`? Not explicit installment schedule. Refund is `type: refund` but no rule.

**Brainstorm:**
- **Canonical ledger:** Keep `payments` as ledger, add `bookingId` FK nullable (for Umrah `bookings.id`, Manpower `applications.id`), add `installmentNo, totalInstallments, dueAt, collectedBy (sub-agent id), refundReason, refundPolicyVersion`.
- **Schedule generator:** On `Umrah booking created` (or `Manpower VAS order`) → auto-create 3 rows: `advance (₹500, due now)` `balance (due T-7 days)` `visa fee (due on docs)`. Each with `status: pending|paid|overdue` derived from `payments` join.
- **Sub-agent settlement:** `partners` already have `apiToken`, add `collectedPayments` view: `SELECT collectedBy, sum(amount) WHERE method='cash_sub_agent'`. Auto commission `tier` calc on publish (like blog).
- **Refund engine:** `POST /api/payments/:id/refund` checks `booking.status` → stage `held→ 90%, confirmed→50%, visa_issued→0%` per policy stored in `appSettings:refund_policy` JSON (versioned). Writes `payments` `type: refund` negative amount + `publishSyncEvent public:payments`.

**API:**
- `GET /api/payments/schedule?bookingId=&clientId=` (staff/client)
- `POST /api/payments/schedule/generate` `{bookingId, plan:['advance','balance']}`
- `POST /api/payments/:id/refund` `{reason, policyVersion}` (manager+)
- `GET /api/payments/ledger?bookingId=` (joins `payments` + `schedule` → progress bar `paid / total`)

**Frontend:**
- `ClientPortal` → `Bookings` tab already shows installments via Razorpay; enhance to show schedule bar `2/3 paid • ₹15,000 due 5 Jan` + `Pay now` per installment.
- `UmrahPortal` / `ManpowerPortal` → schedule table per departure with `collectedBy` badge.
- **Superadmin → Billing → Ledger** new table `Booking | Installment | Due | Paid | By | Refund` with `public:payments` sync.

**Realtime:** `ClientPortal` already subscribes `client:{id}:payments` + `departure:*:inventory`; add `public:payments` to `BlogManager`? No, billing tab subscribes `public:payments` → new payment → `invalidate ['payments','ledger','bookings']`.

---

## 5. Cross-Cutting Realtime Sync Design

**Channels (allowlist in `sync.ts`):**
- `public:leads`, `public:blog`, `public:messages`, `public:payments`, `departure:*:inventory`, `public:family` (future)
- `staff:global:leads`, `staff:global:blog`, `staff:global:messages`, `staff:global:payments`, `staff:global:family`, `staff:global:alerts`
- `client:{OP-…}:family`, `client:{OP-…}:messages`, `client:{OP-…}:payments`

**Wiring per workspace:**
- `DashboardHome` → `staff:global:leads|payments` → funnel + revenue tiles live
- `ClientsList` → `public:leads` + `staff:global:leads` + `staff:global:family`
- `Client360 Family tab` + `ClientPortal Family` → `client:{id}:family`
- `Inbox` → `staff:global:messages` + `public:messages`
- `Billing / UmrahPortal / ManpowerPortal` → `public:payments` + `client:{id}:payments`

**Offline fallback:** Public pages already `refetchInterval 30s` (BlogIndex/Post); Leads table will get same.

---

## 6. Implementation Order (this sprint)
1. **Lead Command Center** — DB `leadScore, assignedTo, slaDueAt` + routing + SLA task + sync `public:leads`
2. **Family Hub** — `familyMembers` table + API + `Client360` tab + `ClientPortal` section
3. **WhatsApp Native** — env + `sendWhatsApp` Cloud API branch + `waOutbox` + webhook `X-Hub-Signature-256` + `Inbox` template picker + sync `public:messages`
4. **Ledger** — `bookingId, installmentNo` migration + schedule generator + refund policy + `public:payments` sync

Each ships with `docs/phase-a-*.md` + `auditEvent` + `publishSyncEvent` + `typecheck+build` gate.
