# OpusOS — Navigation Shell Audit & IA Consolidation

> **Status:** IMPLEMENTED (2026-08-17) — Phases A/B complete + orchestration fixes · 540 tests green
> **Basis:** Nielsen Norman Group IA study guide · Enterprise BI dashboard navigation best practices 2026 · UX navigation patterns (Eleken 2026) · clean-code (single responsibility)

## 1. Research summary — gold-standard navigation IA

| Principle | Practice |
|---|---|
| **One entry point per function** | Never two nav paths to the same content — duplicates fragment trust and hide the canonical surface |
| **Structure around workflows** | Group by user task (People / Marketing / Finance / Security), not internal categories |
| **Support scanning** | Grouped sections + clear labels; 15 flat tabs is a scan failure |
| **Consistent labels** | No vague/duplicate names ("Growth" vs "Growth Metrics" vs "Flow Analytics") |
| **Role-aware** | Super-admin gets the full hierarchy; managers get only what they can use |

## 2. Audit findings — every shell, every user level

### Staff workspace shell (sidebar) — duplicates found
| Sidebar item | Duplicates with | Fix |
|---|---|---|
| **Security Logs** (`/audit` → AuditView) | Admin Desk → **Audit** tab (same audit logs; Admin Desk's is richer — includes Runtime viewer) | Remove sidebar item **for super_admin only** (Admin Desk is canonical) |
| **Taxes & Compliance** (`/taxes` → ComplianceTab) | Admin Desk → **Compliance** tab (same component) | Remove sidebar item **for super_admin only** (managers keep it — Admin Desk is super_admin-only) |

### WorkspaceRouter (`/workspaces/:slug`) — 9 duplicate module mounts
`audit, funnel, campaigns, growth, compliance, roles, infra, marketing, performance` are mounted BOTH at `/workspaces/:slug` AND as AdminConsole tabs (same components). AdminConsole is the canonical admin surface → **remove the 9 mounts** from WorkspaceRouter. Keep: `flow` (sidebar Analytics), `transactions` (sidebar Billing), `teamhub`, `boards` (standalone, not in AdminConsole).

### AdminConsole (Admin Desk) — 15 flat tabs, fragmented domains
- Marketing domain split across 4 tabs: **Funnel · Marketing · Campaigns · Growth** (Growth also contains **staff incentives** — a people-domain concern misplaced in marketing)
- 3 analytics-ish names: **Flow Analytics** (sidebar) · **Growth Metrics** · **Performance** · **Growth** — confusing
- Fix: **section grouping** in the tab bar (People / Marketing / Finance & Ops / Security & Program) + **move incentives** from GrowthTab → PerformanceTab + **rename** Growth → "Leads & Segments"

### LandingPortal — broken link
"Admin Control Desk" card links `to: '/admin'` — the route is `/control`. Fix.

### Client portal — ✅ no duplicates (Journey + 5 distinct division tabs)
### Partner portal — ✅ no duplicates (Overview/Links/Referrals/Payouts/Creatives)

## 3. Target IA

**Sidebar (super_admin):** Overview (Dashboard, Inbox, Clients, Pipeline, Divisions) · Operations (Billing & GST, Flow Analytics, Visibility Hub, Consultations, Agreements, Admin Desk) — Taxes & Compliance and Security Logs now live ONLY in Admin Desk (single entry).

**Admin Desk tab groups:**
- **People**: Directory · Onboard · Roles · Alerts
- **Marketing**: Funnel · Leads & Segments (was Growth) · Marketing · Campaigns
- **Finance & Ops**: Compliance · Performance (+ Incentives & Payouts) · Growth Metrics · Infra
- **Security & Program**: Audit · Divisions · Partners

## 4. Subagent split (no file overlap)

| Agent | Files | Deliverable |
|---|---|---|
| A | `WorkspaceShell.tsx`, `WorkspaceRouter.tsx`, `LandingPortal.tsx` | sidebar dedup (super_admin), remove 9 duplicate module mounts, fix /admin link |
| B | `AdminConsole.tsx`, `GrowthTab.tsx`, `PerformanceTab.tsx` | tab-bar section grouping, rename Growth→Leads & Segments, move incentives to Performance |

## 5. Verification

Typecheck + build (no frontend test infra) + full backend suite (540 tests) + manual IA matrix check. Orchestrator runs final gate.

## 6. Implementation log (2026-08-17)

- **Subagent A — shell dedup**: `WorkspaceShell.tsx` — super_admin sidebar now hides `taxes` + `audit` (single entry via Admin Desk; managers keep sidebar Taxes). `WorkspaceRouter.tsx` — removed 9 duplicate module mounts (audit/funnel/campaigns/growth/compliance/roles/infra/marketing/performance) + dead AuditView/AUTH code; kept flow/transactions/teamhub/boards. `LandingPortal.tsx` — fixed broken `/admin` → `/control`.
- **Subagent B — Admin Desk IA**: `AdminConsole.tsx` — data-driven grouped tab bar (People / Marketing / Finance & Ops / Security & Program), Growth renamed **"Leads & Segments"**, horizontal scroll. `GrowthTab.tsx` — incentives domain removed (now purely marketing). `PerformanceTab.tsx` — "Incentives & Payouts" section added (people domain).
- **Orchestrator integration fixes** (cross-agent gap caught at the gate): `App.tsx` `/taxes` now renders `ComplianceTab` directly (managers' sidebar link kept working after the router-module removal) and `/audit` redirects to `/control?tab=audit` (canonical, richer surface). A transient typecheck error between the two agents resolved itself (cross-agent race).
- **IA matrix after consolidation**:
  - **Super_admin sidebar**: Dashboard · Inbox · Clients · Pipeline · Divisions · Billing & GST · Flow Analytics · Visibility Hub · Consultations · Agreements · Admin Desk (11 items, zero duplicates)
  - **Admin Desk**: 4 groups × 15 tabs, every module mounted ONCE
  - **Managers**: sidebar without Admin Desk — Taxes & Compliance preserved via direct route
  - **Client portal**: Journey + 5 division tabs — verified no duplicates
  - **Partner portal**: Overview/Links/Referrals/Payouts/Creatives — verified no duplicates
- **Gate**: 540/540 tests · typecheck clean · app build clean.

## 7. Admin Desk tab-bar bugfix (2026-08-17 — user report)

**Reported**: group labels (People / Marketing / Finance & Ops / Security & Program) appeared as broken tabs.

**Root cause**: agent B's grouping rendered the muted section labels INLINE in the same row as the tab buttons — visually indistinguishable from disabled tab buttons (clicking them did nothing).

**Fix** (gold-standard grouped-tab pattern): each group is now a **column** — the muted tiny-caps label sits ABOVE its own buttons (`aria-hidden`, `select-none`), so headers can never be mistaken for tabs; buttons keep gold underline active/hover affordance; the bar scrolls horizontally on narrow screens.

**Browser-verified end-to-end** (real login as owner on local stack):
- Grouped bar renders: labels above their button groups ✓
- Tab clicks switch content: Leads & Segments (Audience Temperature, **no incentives**), Performance (Staff Performance + **Incentives & Payouts**) ✓
- `/audit` → `/control?tab=audit` deep-link lands on the Audit tab with all action filters + Verify Chain / Export CSV ✓
- (The "not working" tabs in the user's original tab were stale HMR state; a fresh tab rendered correctly.)
- Stack torn down after verification.