# OpusOS — Sidebar-First Navigation (Admin Modules to the Workspace)

> **Status:** IMPLEMENTED (2026-08-17) — Phases A/B/C complete + orchestration polish · 544 tests green
> **Basis:** SaaSUI sidebar UX patterns 2026 · DesignPixil SaaS nav rules (5–8 items before grouping; group by intent; icons+labels; active state) · NN/g IA · impeccable (icon consistency, no duplicate affordances)

## 1. Research summary

| Rule | Application |
|---|---|
| Group by task/frequency, not org chart | Marketing / Finance & Ops / Security & Program sections in the sidebar — the same groups the user already approved in Admin Desk |
| 5–8 primary items before grouping | Super_admin would have ~22 items → grouping is mandatory, sections with quiet labels |
| Icons supplement labels; one consistent set; distinct per item | Fix the Flow Analytics / Visibility Hub duplicate icon; give every new item its own icon |
| Unmistakable active state + collapse + command palette | Already in the shell (gold active, collapsible, ⌘K) — preserved |
| Role-aware nav | `roles` per item already filters by role; owner-only items stay owner-only |
| Admin long-tail at the bottom | People (Admin Desk) sits last — administrative, not daily work |

## 2. Target IA (super_admin sidebar)

```
OVERVIEW        Dashboard · Inbox · Clients · Pipeline · Divisions
OPERATIONS      Billing & GST · Flow Analytics · Visibility Hub · Consultations · Agreements
MARKETING       Sales Funnel · Leads & Segments · Marketing · Campaigns
FINANCE & OPS   Compliance · Performance · Growth Metrics · Infra Health
SECURITY & PROGRAM  Security Logs · Division Availability · Partners
PEOPLE          Admin Desk (Staff Directory · Onboard · Roles · Alerts)
```

- **Routes**: `/marketing/funnel` · `/marketing/leads-segments` · `/marketing/journeys` · `/marketing/campaigns` · `/finance/compliance` · `/finance/performance` · `/finance/growth-metrics` · `/finance/infra` · `/security/audit` · `/security/divisions` · `/security/partners` · `/control` (People)
- **Legacy redirects**: `/taxes` → `/finance/compliance` · `/audit` → `/security/audit`
- **Naming**: "Division Availability" (not "Divisions") to avoid colliding with the Overview Divisions hub
- **AdminConsole shrinks to People**: directory · onboard · roles · alerts (4 tabs, group label kept)

## 3. Icons (one consistent stroke set — new paths)

| Item | Icon | Status |
|---|---|---|
| Visibility Hub | eye | NEW (fixes duplicate with Flow Analytics) |
| Sales Funnel | funnel | exists |
| Leads & Segments | users | NEW |
| Marketing | megaphone | NEW |
| Campaigns | flag | exists |
| Compliance | shield | exists |
| Performance | chart-bar | NEW |
| Growth Metrics | trending-up | NEW |
| Infra Health | server | exists |
| Security Logs | audit (clipboard-check) | exists |
| Division Availability | toggle | NEW |
| Partners | partner | exists |

## 4. Subagent split (no file overlap)

| Agent | Files | Deliverable |
|---|---|---|
| Orchestrator | `AdminConsole.tsx` (extract) → NEW `components/SecurityLogs.tsx` + `components/DivisionsPanel.tsx` | mechanical extraction, AdminConsole keeps working |
| A | `WorkspaceShell.tsx` | NAV_SECTIONS restructure + new icons + remove adminDeskOnlyKeys filter (taxes/audit return to sidebar under their groups) |
| B | `App.tsx` | 11 module routes + imports + legacy redirects |
| C | `AdminConsole.tsx` | remove 11 tabs, keep People group, drop unused imports |

## 5. Verification

`pnpm -r typecheck` · `pnpm --filter app build` · full backend suite (544) · manual IA matrix. User does browser testing.

## 6. Implementation log (2026-08-17)

- **Orchestrator**: extracted `components/DivisionsPanel.tsx` (clean cut from AdminConsole, self-contained with its own inline toast) — AdminConsole kept compiling throughout.
- **Phase C — AdminConsole → People console**: shrunk 1150 → 549 lines; only directory/onboard/roles/alerts remain (single People group). Extracted the full audit view into `components/SecurityLogs.tsx` (587 lines, zero props, own AUTH + inline toast, byte-identical verify-chain/export/filters/detail-modal).
- **Phase A — WorkspaceShell**: NAV_SECTIONS restructured to 6 sections (Overview / Operations / Marketing / Finance & Ops / Security & Program / People); `adminDeskOnlyKeys` filter removed (taxes/audit back in the sidebar under their groups — no longer duplicates); 6 new icons (eye, users, megaphone, chart, trending, toggle) in the same stroke set; **Visibility Hub now uses the eye icon** (duplicate with Flow Analytics fixed).
- **Phase B — App.tsx**: 11 module routes (`/marketing/*`, `/finance/*`, `/security/*`) + legacy redirects `/taxes` → `/finance/compliance`, `/audit` → `/security/audit`; removed a duplicate `/control` route.
- **Orchestration polish**: DivisionsPanel made fully self-contained (own toast) — the sidebar route no longer passes a no-op prop.
- **Gate**: 544/544 tests · typecheck clean · app build clean · audit-chain self-test + mojibake gate green.

## 7. Duplicate-shell audit & fix (2026-08-17 — user report)

**Reported**: the same tab bar ("Flow Analytics | Sales Funnel | Division Funnels | Staff Performance") appeared in multiple sections.

**Root cause**: `FlowAnalytics.tsx` was a mega-component embedding `FunnelTab` and `PerformanceTab` as internal sub-tabs — the exact same components now mounted at `/marketing/funnel` and `/finance/performance`. Two shells for the same content.

**Fix** (one view per module): removed the Sales Funnel + Staff Performance sub-tabs from FlowAnalytics; it now shows only its flow-domain views (Flow Analytics CFD/throughput/Monte Carlo + Division Funnels). FunnelTab/PerformanceTab imports dropped.

**Full sweep** (every module component checked for embedded imports): only FlowAnalytics had the duplicate. Remaining internal tab bars are legitimate sub-views of their own modules — KanbanBoard (Clients Pipeline / Staff Tasks Board), MarketingTab (tool feeds), PartnerAdminPanel (partners/tiers/plans/analytics) — none duplicate a sidebar destination.

## 8. Campaigns merge (2026-08-17 — user report)

**Reported**: `/marketing/journeys` has an internal "Campaigns" tab AND the sidebar has a "Campaigns" item — same label, two destinations.

**Audit**: they were DIFFERENT — MarketingTab's Campaigns tab = **Listmonk email campaign operations** (create/activate/pause/test/delete via `/api/integrations/listmonk/campaigns`); sidebar CampaignsTab = **informational control board** (tool status + live feed + read-only OS catalog). Same label, different domains → confusing.

**Fix (merge into ONE Campaigns module)**: the sidebar Campaigns page is now the single campaigns destination with three sections — tool-first control board (status + feed) · **Email campaigns (Listmonk operations)** · OS journey catalog. MarketingTab's internal "Campaigns" tab removed (it keeps Overview/Templates/Audiences/Suppression).

## 9. Listmonk shape crash fix (2026-08-17 — user report)

**Reported**: `rows.map is not a function` at `ListmonkCampaigns` — the merged campaigns view crashed on the Listmonk response.

**Root cause**: the merged code (inherited from MarketingTab) assumed `data.data` is the array. Listmonk paged endpoints can return the array directly, under `data`, `results`, `campaigns`, or `data.results` depending on version — a truthy non-array `data` crashed `.map`.

**Fix**: added a defensive `asArray()` normalizer (handles array / `data` / `results` / `campaigns` / `templates` / `lists` / `bounces` / `data.results`; falls back to `[]`) and applied it to all 4 fragile sites — CampaignsTab ListmonkCampaigns + MarketingTab Templates/Audiences/Suppression. Never trust a third-party API shape; never crash on it.

## 10. Marketing tool views — gold-standard shells (2026-08-17 — user report)

**Reported**: Templates tab lists templates but has no detail view, no create option; Audiences/Suppression need feature checks.

**Research basis**: RedDrill template manager (usage tracking, placeholder detection, live preview, audit), IntelliBuddies template drawer (create/edit/clone lifecycle), UI-Patterns live-preview, Subframe detail-drawer.

**Implemented (MarketingTab.tsx, all backend commands already existed):**
- **Templates — full management shell**: "+ New template" create form (name/subject/body/placeholders/set-as-default) · click a template → expandable detail panel with **usage tracking** ("Used by N campaigns" — template_id join on the campaigns feed, names + statuses), **placeholder detection** ({{ tokens }} as chips), **sandboxed live preview** (iframe `sandbox=""` — template HTML cannot escape), **edit** (prefilled → `templates:update`), **delete** with confirm · inline toast notifications (no browser alerts).
- **Audiences — subscriber drill-down**: click a list → expandable panel with **subscriber list** (paged, list-scoped `subscribers:list?listId=`) + **add subscriber** inline (`subscribers:create` with `lists:[id]`) · keep create/delete.
- **Suppression — type filter**: All/Hard/Soft filter pills with live counts; read-only proof layer stays (OS suppression registry remains the authoritative send gate).