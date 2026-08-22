# Sync Modals Audit — All Workspaces (2026-08-22)

**Scope:** 88 D1 models + 15 UI modals. Workspaces: Staff (superadmin+all staff roles), Client, Partner. SyncHub fabric: Hibernatable DO + tenant-prefixed channels.

## Executive Summary
- **Total models:** 88 tables
- **Sync-relevant:** 47 (53%)
- **Currently wired (Phase 1-3):** 7 channels, 18 publish sites (portalUmrah 6, partner 4, agreements 4, clients 3, umrah 1)
- **Needs dev:** 40 models have NO publish yet
- **TeamHub invariant:** stays internal-only

## Workspace Matrix (Gold Standard)

| Workspace | Auth | Channels it SUBSCRIBEs | Publishes? |
|-----------|------|------------------------|------------|
| Staff | BetterAuth session + rbacMiddleware | staff:global:alerts, staff:division:{*}:pipeline, departure:*:inventory, staff:client:{id}:*, public:catalog:* | No (Worker only) |
| Client | portalToken (128-bit) ?token= | client:{id}:bookings/documents/applications/ledger, departure:*:inventory, public:catalog:* | No |
| Partner | Bearer api_token | partner:{id}:commissions/referrals/inventory, departure:*:inventory, public:catalog:* | No |

**Rule:** Worker is only writer (D1 commit → publishSyncEvent → DO fan-out). Browsers SUBSCRIBE/PING only.

## Full Model Inventory — Sync Decision

### Legend
- **P0** = must be realtime (<1s, overbooking/money leak)
- **P1** = should be realtime (<5s, ops efficiency)
- **P2** = nice (delay ok)
- **Wired** = publish exists, **Gap** = needs dev

#### 1. Core CRM
| Model | UI Modal | Staff | Client | Partner | Status | Channel | Priority |
|-------|----------|-------|--------|---------|--------|---------|----------|
| clients | Client360, ClientPortal list | R/W | R (own) | R via referral | Wired via bookings | client:{id}:bookings | P0 |
| engagements | KanbanBoard | R/W | R (own) | - | Gap | staff:division:{div}:pipeline | P1 |
| pipelineStages | Kanban columns | R/W | - | - | Not needed (static) | - | P2 |

#### 2. Umrah (Phase 1 DONE)
| umrahPackages | UmrahPortal Packages tab, UmrahClientSection browse | R/W | R (open only) | R (open) | Wired public:catalog:umrah | public:catalog:umrah | P0 |
| groupDepartures | UmrahCalendar (reusable staff/client/partner), BookingModal departure picker | R/W | R live badges | R live badges | Wired departure:{id}:inventory | departure:{id}:inventory | P0 |
| seatBookings | BookingModal → party builder → tracker, UmrahPortal manifest | R/W | R/W (own) | - | Wired 6 sites | client:{id}:bookings + departure:{id}:inventory | P0 |
| bookingPassengers | party manifest travellers | R | R (own) masked | - | Wired via bookings | same | P0 |
| umrahChecklists | UmrahPortal manifest checklist | R/W | - | - | Gap | staff:division:umrah:pipeline | P1 |

#### 3. Study Abroad
| studyAbroadApplications | StudyAbroadApplicationModal, StudyAbroadPortal Kanban, StudyAbroadClientSection | R/W | R (own) | - | Gap | client:{id}:applications + staff:division:study-abroad:pipeline | P0 |
| candidateProfiles | StudentProfileWizard (4-step, DPDP consent) | R/W | R/W (own) | - | Gap | client:{id}:applications | P1 |
| studyAbroadShortlists (legacy) | - | - | - | - | Not needed (drop) | - | - |

#### 4. Visa
| visaApplications | VisaPrepPortal, visa wizard | R/W | R (own) | - | Gap | client:{id}:applications | P0 |
| visaMockInterviews | Mock interview scheduler | R/W | R (own) | - | Gap | client:{id}:applications | P1 |
| visaProducts | Visa catalog (60+ products) | R/W | R (public) | R (public) | Gap | public:catalog:visa | P1 |

#### 5. Attestation
| attestationApplications | AttestationPortal chain timeline | R/W | R (own) | - | Gap | client:{id}:applications + staff:division:attestation:pipeline | P0 |
| attestationRateCards | rate card editor + client disclaimer | R/W | R (indicative) | - | Gap (partner disabled by design) | staff:division:attestation:pipeline | P1 |
| attestationChains | AttestationChain artifact | R | R | - | Not needed (static) | - | - |

#### 6. Manpower/Recruitment
| jobPostings | RecruitmentPage JobTicker, ManpowerPortal | R/W | R (public/secret tier) | R (public) | Wired public:catalog:jobs (via umrah pattern) | public:catalog:jobs | P0 |
| manpowerDeployments | Manpower deployments | R/W | R (own) | - | Gap | client:{id}:applications | P0 |
| bookings (generic) | BookingsTab | R/W | - | - | Gap | staff:global:alerts | P1 |

#### 7. Partner Ecosystem
| partners | PartnerDashboardHub, PartnerAdminPanel | R/W | - | R (own) | Wired staff:global:alerts | staff:global:alerts | P0 |
| referrals | Partner referrals log | R | - | R/W (own) | Wired partner:{id}:referrals | partner:{id}:referrals | P0 |
| commissionLedger | Partner commissions ledger | R/W | - | R (own) | Wired partner:{id}:commissions | partner:{id}:commissions | P0 |
| commissionPlans / partnerPoints/Tiers/Links | PartnerThrive catalog/links | R/W | - | R/W | Gap | partner:{id}:loyalty | P1 |
| payoutRequests | Payouts tab | R/W | - | R/W | Gap | partner:{id}:commissions | P0 |
| partnerCreatives | Creative library banners | R/W | - | R | Gap | public:catalog:partner | P1 |

#### 8. Commerce (Money = paise)
| payments | TransactionsTab, payments ledger | R/W | R (own) | - | Gap | client:{id}:ledger + staff:global:alerts | P0 |
| milestones | Payment escalation | R/W | R (own) | - | Gap | client:{id}:ledger | P1 |
| incentiveEntries / payoutStatements | Incentives tab, staff self-view | R/W | - | - | Gap | staff:global:alerts | P1 |
| purchaseInvoices/tdsRecords/tcsRecords | Compliance GST workbench | R/W | - | - | Not realtime (batch) | - | P2 |

#### 9. Documents & Communications
| documents | Document Vault, AiOcrPanel, Client360 docs | R/W verifiedAt | R/W (own) scanStatus | - | Wired client:{id}:documents + staff:global:alerts | client:{id}:documents | P0 |
| communications / conversations | Inbox (OpenWA+Chatwoot), TeamHub file drive | R/W | R (own thread) | - | Gap | client:{id}:timeline / staff:global:alerts | P0 |
| notifications / staffAlerts | AlertsVisibility, useStaffAlerts, staffAlerts | R | R (own) | - | Gap (already staffAlerts table, not yet published) | staff:global:alerts + client:{id}:alerts | P0 |
| webhookEvents / listmonkSuppressions | - | - | - | - | Not needed | - | - |

#### 10. Governance & App
| auditLog (tamper-evident) | Audit export + Verify chain | R | - | - | Not published (chain verify weekly cron, not realtime) | - | P2 |
| tasks / boardPrefs | BoardsTab, KanbanBoard | R/W | R (own) | - | Gap (scaffold added) | staff:global:alerts | P1 |
| consents | DPDP consent wizard | R/W | R (own) | - | Gap | client:{id}:bookings | P1 |
| permissions/roles/userRoles | RolesTab, RBAC suite | R/W | - | - | Gap (rare change, not realtime) | staff:global:alerts | P2 |
| appSettings / businessProfile | DivisionControls, AiGovernanceTab | R/W | R (feature flag) | R | Gap | public:catalog:* | P1 |
| seoPages/utmEvents/gaEvents etc. | VisibilityHub | R/W | - | - | Not needed (batch) | - | P2 |
| apiKeys / outboundWebhooks / idempotencyKeys | DeveloperApiSettingsTab | R/W | - | R (own) | Gap | - | P2 |

### UI Modals — Sync Needs

| UI Modal | Where | Workspaces | Sync Need | Channel |
|----------|-------|------------|-----------|---------|
| BookingModal (consultation Cal.com) | StickyCallBar, FunnelTab, public pages | Staff+Client | P1 — slots live (Cal.com) already 3-tier hardened, no WS needed | - |
| UmrahCalendar + party manifest | UmrahPortal, UmrahClientSection, ClientPortal 🕋 | All 3 | P0 — already wired | departure:{id}:inventory |
| StudyAbroadApplicationModal + StudentProfileWizard | StudyAbroadPortal, ClientPortal 🎓 | Staff+Client | P0 — needs dev | client:{id}:applications |
| Agreement signing modal (typed/otp/wet_ink) | AgreementsTab + portal /sign/{id} | Staff+Client | P1 — already wired (AGREEMENT_SIGNED) | client:{id}:bookings |
| Document upload modal + presigned | Client360 Vault | Staff+Client | P0 — wired (DOCUMENT_VERIFIED) | client:{id}:documents |
| Task create / Board | BoardsTab | Staff | P1 — scaffold, needs kanban stage publish | staff:division:{div}:pipeline |
| Partner referral modal | PartnerDashboardHub | Partner+Staff | P0 — wired | partner:{id}:referrals |
| Incentives / Payout modal | Incentives tab, Partner payouts | Staff+Partner | P1 — needs commission matured (wired) + payout approved gap | partner:{id}:commissions |

## Brainstorm — Ideas for Each Workspace

### Staff (needs most real-time)
- **Live inventory heatmap:** All departure fillPct badges pulse on INVENTORY_UPDATED without refresh — prevents overbooking at 30 cap
- **Pipeline Kanban live move:** When counselor drags `engagements.stageKey`, other staff see card glide live (P1 — currently poll 30s)
- **Inbox live:** `conversations` new WhatsApp/webchat message → `staff:global:alerts` toast + Inbox badge (P0 for response SLA)
- **Document verification live:** Staff verifies passport → client vault instantly shows “Verified ✓” (wired)
- **Alert fabric:** `staffAlerts` already creates rows, now also WS → `AlertsVisibility` bell + sound `booking-alert.wav` (existing public/sounds)

### Client
- **Booking tracker live:** `held(24h) → reserved(72h) → confirmed` transitions push via `client:{id}:bookings` — no manual refresh, show countdown live
- **Document status live:** Upload → pending→clean/flagged/verified via same channel — critical for visa/Umrah checklists
- **Application Kanban mirror:** Student sees `studyAbroadApplications` status move `shortlisted→submitted→offer_letter` live (needs dev)
- **Ledger live:** Payment `confirmed → synced` via `client:{id}:ledger` (needs dev)

### Partner
- **Rupee ticks live:** `COMMISSION_MATURED` already wired — partner sees ₹ pending→matured live without refresh
- **Referral log live:** New referral appears in PartnerDashboard referrals table live (wired)
- **Inventory for /go links:** Partner promoting `umrah_package` via `/go` needs same `departure:{id}:inventory` so they never share sold-out link (wired)

## What Needs To Be Developed (Gaps)

**P0 gaps (build next):**
1. `studyAbroadApplications` / `visaApplications` / `attestationApplications` status publish (after `db.update(...).set({status})` in their routes — 3 lines each, copy portalUmrah pattern)
2. `payments` ledger `client:{id}:ledger` on `PAYMENT_CONFIRMED` (payments.ts)
3. `conversations` inbox new message → `staff:global:alerts` + `client:{id}:timeline`
4. `staffAlerts` table itself — publish after `createStaffAlert()` helper (centralize one publish there to cover all alerts)
5. `jobPostings` public catalog publish (already via umrah pattern, add for manpower)

**P1 gaps:**
- `engagements` Kanban STAGE_CHANGE (kanban.ts already scaffold, needs 1 real publish after commit)
- `tasks` create/done (boards) — 1 line after `tasks` insert
- `agreements` already wired, but `incentiveEntries` after `accrueIncentives` could also publish to staff

**P2 (batch ok):** auditLog, seo, purchaseInvoices, appSettings toggles

## Verification — Current vs Plan

- **Channels wired:** 7 distinct (`departure:*:inventory`, `client:*:bookings`, `client:*:documents`, `partner:*:referrals`, `partner:*:commissions`, `staff:global:alerts`, `public:catalog:umrah`)
- **Publish sites:** 18 (portalUmrah 6, partner 4, agreements 4, clients 3, umrah 1) — verified `grep publishSyncEvent`
- **Frontend WS:** 3 workspaces wired behind `VITE_SYNC_ENABLED` with TanStack invalidations
- **Tests:** 647/647 green (including 5 syncHub harness)
- **Next:** Fill 5 P0 gaps above (each <5 lines, copy existing pattern), then Phase 4 observability (analyticsEngine counter `sync_publish_total` + Logpush)

