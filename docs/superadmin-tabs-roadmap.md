# OpusOS — Superadmin Workspace: New Tabs Research & Roadmap

> **Goal:** Identify which additional tabs the superadmin workspace should have, grounded in
> (a) the Opus Overseas business domain (5 divisions: Study Abroad, Visa, Attestation, Umrah, Manpower),
> (b) 2026 industry benchmarks for each vertical, and
> (c) what OpusOS already has built but hidden.
> Every tab must sync across all workspaces via the existing single-source-of-truth (D1) + RBAC + division-scoping architecture.

---

## 1. Current State Inventory

### 1.1 Tabs visible in the nav today
| Section | Tab | Roles |
|---|---|---|
| Overview | Dashboard, Inbox, Clients, Pipeline, Divisions | all / staff-scoped |
| Operations | Billing & GST, Taxes & Compliance, Flow Analytics | all / manager+ |
| Operations | Admin Desk, Security Logs | super_admin only |
| Divisions | Study Abroad, Visa, Attestation, Umrah, Manpower portals | division-scoped staff |

### 1.2 Built but HIDDEN from the nav (in `WorkspaceRouter`, no nav entry)
| Module | What it already does | Why it's hidden |
|---|---|---|
| **Marketing Hub** (`MarketingTab`) | Campaigns, templates, audiences, suppression, email engagement | never promoted |
| **Team Hub** (`TeamHub`) | Internal rooms/chat per ops/sales/finance/umrah | never promoted |
| **Partners & Referrals** (`partnerAdmin`) | partner tiers, links, commission ledger, referrals | never promoted |
| **Agreements** (`agreements.ts`) | clause library, templates, agreements, e-sign status | never promoted |
| **Incentives** (`incentives.ts`) | incentive rules, entries, payout statements | never promoted |
| **Transit & Shipments** (`transit.ts`) | courier/shipment tracking (attestation docs) | never promoted |
| **Integrations** (`integrations.ts`, `erpnext.ts`) | ERPNext sync log, webhook health, Listmonk, Razorpay | never promoted |
| **Performance** (`performance.ts`) | staff performance metrics | never promoted |
| **Boards / Funnel / Growth / Roles / Infra** | kanban boards, funnel, growth, RBAC, infra health | partial / admin-only |

### 1.3 Data already available (schema)
`clients, engagements, pipelineStages, documents, consents, communications, conversations, payments, milestones,
agreements (+clauseLibrary, agreementTemplates), umrahPackages, groupDepartures, seatBookings, bookingPassengers,
jobPostings, attestationChains, universities, transitShipments, partners, referrals, commissionLedger, tasks,
membershipPlans, appSettings, staffAlerts, permissions, roles, userRoles, businessProfile, purchaseInvoices,
tdsRecords, tcsRecords, statutoryRegisters, incentiveRules, incentiveEntries, payoutStatements, nurtureTouches,
campaigns, campaignTouches, experiments, experimentAssignments, notifications, webhookEvents, listmonkSuppressions,
candidateProfiles, partnerTiers, partnerLinks, erpnextSyncLog, interactionPoints, scoringEvents, segments`

### 1.4 Roles & scoping
- Roles: `super_admin`, `manager`, `counselor`, `receptionist`, `coordinator` + custom roles (RBAC seeded)
- Division scoping: `userDivisions` on staff; `allowedNavFor()` filters nav by role + division
- Cross-workspace sync primitives: shared D1 tables, `staff_alerts` (severity + link), audit trail, Live Activity

---

## 2. Industry Benchmarks (2026 research)

| Vertical | Benchmarks | Features they all have that OpusOS lacks |
|---|---|---|
| **Study Abroad** (SmartX, Ticlick, VisaCRM, Relently) | application lifecycle, document vault w/ expiry alerts, visa workflows, commission tracking, intake mgmt, university DB, WhatsApp automation, B2B sub-agent portals | **University & program DB with intake deadlines**, document **expiry alerts** (IELTS 2yr, passports), **commission tracking per university**, test-prep (IELTS/PTE) batch tracking |
| **Umrah** (TravelSuite, UmrahCore, OmraDesk) | package mgmt, pilgrim registration, hotel allotments, visa tracking, group/flight scheduling, **occupancy heatmaps**, reseller networks, voucher mgmt | **Hotel allotment & occupancy**, **flight/group scheduling board**, **voucher management**, reseller pricing isolation |
| **Manpower** (Zoho Recruit, Bullhorn, JobAdder) | dual candidate+client pipelines, job orders, client portals, timesheets, pay/bill rates, placement billing | **Job-order ↔ candidate matching**, **placement billing**, timesheets/pay-bill for temp staffing |
| **Attestation** (SlotTaker, OneSource) | status tracking, **deadline reminders**, document verification, **partner network**, **slot booking** | **Embassy slot booking tracker**, partner-lawyer network, deadline reminders |
| **Travel back-office** (TravelOperations) | full financial system, integrations, automation, reporting | **Consolidated reporting center**, expense management, supplier management |

**Cross-cutting themes:** every benchmark product has (1) a **reports/BI center**, (2) **WhatsApp as a first-class channel**,
(3) **supplier/vendor management**, (4) **document expiry automation**, (5) **AI assistance** (chatbots, screening bots, summaries).

---

## 3. Recommended New Tabs (prioritized)

### Tier 0 — RESOLVED (audit of /control, 2026-08-16)
The Admin Console (`/control`) already covers most "hidden" modules. Decisions:

| Module | Verdict | Action |
|---|---|---|
| Incentives & Payouts | ✅ covered by `Growth & Incentives` tab | keep in console |
| Partners & Referrals | ✅ covered by `Partners` tab | keep in console |
| Campaigns | ✅ covered by `Campaigns` tab | keep in console |
| Compliance / Funnel / Growth / Roles / Audit | ✅ covered by console tabs | keep in console |
| **Marketing Hub** | ⚠️ wired but no button → unreachable | **DONE: added "Marketing" button (owner)** |
| **Infra Health** | ⚠️ wired but no button → unreachable | **DONE: added "Infra Health" button (owner)** |
| **Performance / Boards** | ❌ not in console | **DONE: added "Performance" button (owner); Boards REMOVED — duplicate of /kanban staff task board** |
| **Team Hub** | ❌ superseded by Inbox (unified messaging) | **DROPPED** — Inbox covers all messages |
| **Agreements / Transit / Integrations** | backend-only, no standalone UI | **DROPPED as tabs** — kept as embedded services (Client360 uses agreements+transit; MarketingTab uses integrations) |

### Tier 1 — New modules, high value, fit existing data (recommended next build)

| # | Tab | What it does | New tables (or reuse) | Roles | Sync across workspaces |
|---|---|---|---|---|---|
| T1.1 | **Reports Center** | Consolidated P&L by division, GST summary, commission reports, AR aging, scheduled PDF/CSV exports (reuse `pdf.ts`) | reuse all; `report_schedules` (new) | super_admin, manager | same numbers everywhere; audit-logged exports |
| T1.0 | **Growth Metrics** ✅ DONE | MoM revenue growth, new clients, lead→client conversion, division revenue + growth, ARPU, referral share, retention, repeat business, pipeline growth — `GET /api/analytics/growth` + console tab | reuse analytics tables | super_admin (console) | same numbers everywhere; 2-min auto-refresh |
| T1.2 | **Universities & Programs** | University DB (already have `universities`), intake deadlines, commission rates, program catalog, deadline alerts | `universities` + `intake_deadlines` (new) | super_admin, manager, counselor | deadlines → staff alerts; visible in Study Abroad portal |
| T1.3 | **Embassy & Slot Tracker** | Embassy slot booking, appointment tracking, slot reminders for visa/attestation | `embassy_slots` (new) | super_admin, manager, coordinator | slot status → staff alerts + client portal updates |
| T1.4 | **Vendor & Supplier Desk** | Supplier register (Siza Global etc.), rate cards, turnaround tracking, PO, vendor performance | `suppliers`, `supplier_rates`, `purchase_orders` (new) | super_admin, manager | rate cards feed attestation quote engine; turnaround → alerts |
| T1.5 | **WhatsApp Messaging Center** | WhatsApp templates, broadcast, delivery stats (mirror of email tracking; `messagingWebhooks` exists) | `whatsapp_templates`, reuse `webhookEvents` | super_admin, manager, counselor | delivery events → engagement panels in Marketing Hub |
| T1.6 | **Payroll & Staff Finance** | Monthly payroll from `statutoryRegisters` (PT/PF/ESI), salary TDS, payslips, payout statements | `payroll_runs`, `payslips` (new) | super_admin | payslips visible to staff in Team Hub; TDS feeds Taxes tab |
| T1.7 | **Knowledge Base & SOPs** | Country guides, embassy requirements, SOPs, counsellor guide (already a doc) | `kb_articles` (new) | all (read), super_admin/manager (write) | KB searchable from every division portal |

### Tier 1.5 — VISIBILITY HUB ✅ BUILT (one module roof: SEO + AEO/GEO + GA4 + GBP + Search Console + Reviews + Attribution + Reports)

**Name rationale:** every sub-module is a "visibility" surface — search visibility (SEO), AI visibility (AEO/GEO),
local visibility (Google Business Profile), reputation visibility (reviews) — and GA4 + attribution measure how
that visibility converts into leads. One roof, seven sub-tabs, one nav entry.

**Critical finding:** the public site (`/`, `/study-abroad`, `/visa-services`, `/umrah-travel`, `/attestation`, `/recruitment`)
is a client-side SPA with **zero SEO infrastructure** — no meta/OG tags, no sitemap, no robots.txt, no JSON-LD,
no GA. It is currently invisible to Google, Bing and AI crawlers. 2026 research (Google Search Central June 2026,
OpenLens/SISTRIX, Conductor AEO benchmarks): Google says AEO/GEO is "still SEO" — llms.txt and AI-only schema do
NOT help Google; what matters is (1) complete Google Business Profile, (2) clean crawlability + semantic HTML,
(3) schema-marked services, (4) reviews + citations, (5) answer-first quotable content, (6) Search Console
AI-performance reports. Modules below operationalize exactly that.

| # | Module | What it does | New tables / infra | Roles | Sync note |
|---|---|---|---|---|---|
| V1 | **SEO Hub** ✅ | Auto `sitemap.xml` + `robots.txt` (AI crawlers allowed: Google-Extended, OAI-SearchBot, PerplexityBot, ClaudeBot); per-page meta/OG/JSON-LD manager (LocalBusiness, Service, FAQPage, BreadcrumbList); page audit (title/meta/schema validity); keyword tracker | `seo_pages`, `seo_keywords` (new); API-served sitemap/robots | super_admin, manager | sitemap regenerates on route change; audit alerts |
| V2 | **Google Analytics (GA4)** ✅ | GA4 Measurement ID config; event tracking (lead form, payment, portal); traffic dashboard (sessions, users, channels, top pages, conversions) | `app_settings` (GA id); `webhookEvents` reuse | super_admin, manager | events flow from public site + portal |
| V3 | **Google Business Profile Manager** ✅ | Profile completeness score (the #1 AI Overviews signal); review monitoring → staff alerts; GBP posts scheduler; insights (calls/directions/views) | `gbp_profile`, `gbp_reviews`, `gbp_posts` (new) | super_admin, manager | new review → staff alert + Inbox thread |
| V4 | **AEO / Answer Engine Monitor** ✅ | Prompt-based citation checks across ChatGPT, Perplexity, Google AI Overviews, Gemini, Claude, Grok (BYOK Gemini runs the checks); brand mention score per engine; answer-first content library (200–400 word quotable passages, named stats); content gap suggestions | `aeo_checks`, `aeo_mentions`, `aeo_passages` (new) | super_admin, manager | weekly scheduled checks → alerts on drops |
| V5 | **Search Console** ✅ | Queries/impressions/CTR/position; indexing issues; AI Overviews + AI Mode performance (June 2026 reports) | OAuth + `seo_keywords` reuse | super_admin | keyword data feeds SEO Hub |
| V6 | **Reviews & Reputation** ✅ | Google + Trustpilot + directory review intake; sentiment; response-draft workflow; NPS tie-in (T2.3) | `reviews` (new) | super_admin, manager, receptionist | review → staff alert; response → client comms |
| V7 | **Lead Attribution** ✅ | UTM capture on public site → `leadSource` mapping (field exists!); channel ROI (cost per lead per channel); source → client conversion | reuse `clients.leadSource`; `utm_events` (new) | super_admin, manager | attribution visible on every client record |

**2026 evidence notes:** AI Overviews fire on ~22% of US queries (SISTRIX 2026); complete GBP is the single
highest-leverage local AI signal; Google explicitly disavows llms.txt / AI-only schema / chunking / AI-voice
rewrites (June 2026 Search Central) — so V1+V3+V5 are the real levers, V4 measures the outcome.

### Tier 3 — 2026 ERP & Automation research additions (Odoo 2026, ERP Research 13-module framework, WhatsApp 2026 guides)

| # | Module | What it does | Why (2026 evidence) |
|---|---|---|---|
| E1 | **WhatsApp AI Agent** | Auto-replies, lead qualification, booking/quote flows, order-status answers, human escalation triggers (sentiment/value/confidence) on the official WhatsApp Business API | 200M+ companies on WA API; 98% open rate vs ~5% email; up to 70% support-cost reduction; 44% of SMBs saw sales lift in 3 months — THE channel for Indian B2C |
| E2 | **Bank Reconciliation** | Upload bank statement → AI-assisted match vs payments (Razorpay + manual), flags anomalies | AI-assisted reconciliation is a 2026 ERP baseline; catches missed payments |
| E3 | **Expense Management** | Reimbursements, petty cash, travel expenses, approval flow | feeds P&L; 2026 ERP standard (was T2.4 — promoted) |
| E4 | **Inventory & Occupancy** | Umrah seats/hotel allotments, occupancy heatmap (Makkah/Madinah pressure), document stock | UmrahCore's occupancy heatmap "paid for itself in one season" |
| E5 | **Attendance & Leave** | Staff check-in/out, leave requests, approval, feeds payroll | HR module baseline; payroll (T1.6) needs it |
| E6 | **AI Copilot** | Natural-language queries ("show me sales by division this quarter"), auto-summaries, draft emails, anomaly detection on transactions | Odoo 2026 "Ask AI" pattern; 30% faster decisions, up to 40% cost savings |
| E7 | **Scheduled Reports** ✅ | Report distribution on schedule (PDF/CSV to email), report subscriptions | "Scheduled report distribution" is a 2026 ERP reporting feature |
| E8 | **Mobile pass** ✅ | Core workflows usable on phones (staff + owner) | mobile access is baseline, not premium, in 2026 |

### Tier 2 — Advanced (later phases)

| # | Tab | What it does | Notes |
|---|---|---|---|
| T2.1 | **AI Copilot** | BYOK Gemini insights: revenue anomalies, funnel bottlenecks, auto-draft replies, document checks | leverages existing BYOK setup; high wow |
| T2.2 | **Branch & Multi-location** | Offices, counters, per-branch staff & targets | needed when scaling beyond one office |
| T2.3 | **Feedback & NPS** | Post-service surveys, NPS tracking per division | feeds Dashboard quality KPIs |
| T2.4 | **Expense Management** | Reimbursements, petty cash, travel expenses | feeds P&L in Reports Center |
| T2.5 | **Appointment Calendar** | Counselor appointment scheduling, reminders | complements Inbox |
| T2.6 | **Asset Management** | Laptops, office assets, warranty tracking | low priority |

---

## 4. Sync Architecture (how every tab stays consistent across workspaces)

OpusOS already has the right primitives — every new tab must follow the same contract:

1. **Single source of truth:** all tabs read/write the same D1 tables. No per-workspace copies.
2. **Nav visibility:** add the tab to `NAV_SECTIONS` with a `roles` array; `allowedNavFor()` already filters by role + `userDivisions`. Superadmin sees everything; staff see only their role/division slice.
3. **RBAC permission codes:** each new tab gets permission codes (e.g. `reports:read`, `vendors:manage`) in `PERMISSION_SEED` so custom roles can be granted granular access.
4. **Cross-workspace notifications:** state changes emit `staff_alerts` (severity + link) → Live Activity bell in every workspace; e.g. slot booked, supplier turnaround exceeded, payroll run complete.
5. **Audit trail:** every export/state change logs to `audit_log` (already enforced for compliance exports).
6. **Client/partner portals:** read-only views of the same tables (e.g. slot status in client portal, commission ledger in partner portal) — no duplication.
7. **Division scoping:** division-scoped tabs (Universities, Embassy Slots) filter by `userDivisions`; company-wide tabs (Reports, Payroll) are manager+.

---

## 5. Phased Roadmap

| Phase | Scope | Effort |
|---|---|---|
| **Phase 0 (done)** | Console audit: added Marketing / Infra / Performance / Boards / Growth Metrics buttons; dropped Team Hub + Agreements/Transit/Integrations tabs | ✅ committed |
| **Phase 1** | T1.1 Reports Center (reuse analytics + pdf.ts) · T1.2 Universities & Programs · T1.3 Embassy & Slot Tracker | ~1 week |
| **Phase 1.5** | V1 SEO Hub (foundation — site is currently invisible) · V7 Lead Attribution (reuses leadSource) · V4 AEO Monitor (BYOK Gemini) | ~1 week |
| **Phase 2** | V2 GA4 · V3 GBP Manager · V5 Search Console · V6 Reviews & Reputation | ~1 week |
| **Phase 2** | T1.4 Vendor & Supplier Desk · T1.5 WhatsApp Messaging Center · T1.6 Payroll & Staff Finance | ~1 week |
| **Phase 3** | T1.7 Knowledge Base · E1 WhatsApp AI Agent · E6 AI Copilot · E2 Bank Reconciliation | ~2 weeks |
| **Phase 4** | E3 Expenses · E4 Inventory & Occupancy · E5 Attendance & Leave · E7 Scheduled Reports · E8 Mobile pass · T2.x (branch, NPS, calendar, assets) | ongoing |

**Recommended immediate action:** Phase 0 (promote hidden tabs) — it's free value; the modules are already built and tested.
Then T1.1 Reports Center, since the analytics backend (revenue/funnels/stale-clients) and PDF export (`lib/pdf.ts`) already exist.