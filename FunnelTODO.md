# Funnel & Marketing Automation — Roadmap

Built (this set, committed):
- Lead intake now persists `leadSource` + `dynamicContext` (intake_context JSON) and
  **auto-scores intent signals** (`website_lead_form` +10, `destination_specified` +10,
  `budget_given` +15, `intake_started` +5) at submission.
- **Partner affiliate interlock**: lead form accepts `?ref=OPUS-XX` → creates `referrals`
  row + UNMATURED `commissionLedger` + `partner_referral` (+15) score. Matures on sign.
- `GET /api/marketing/funnel` — stage counts, cumulative conversion %, velocity (days/stage),
  stale-lead recovery queue (7-day no-contact), partner attribution on converted customers.
- `GET /api/marketing/partners` — affiliate leaderboard (referrals → converted → commission).
- Agreement sign → matures referred commission at `commissionRate%` of realized payments.
- **15-min speed-to-lead SLA task** on every lead: round-robin to the least-loaded
  counselor allowed for the lead's division (empty user_divisions = all divisions).
- **Stale-lead reactivation**: `POST /api/marketing/stale/:clientId/reactivate` → 24h
  high-priority re-engagement task (shared `services/leadAssignment.ts`) + `stale_reactivated`
  scoring event that exits the lead from the stale queue. Action button in FunnelTab.
- **WhatsApp re-nurture engine (Funnel#4)**: DPDP-gated (whatsapp-updates consent) 4-stage
  sequence (`value→case_study→offer→final` across Day0/3/5/12) via `nurture_touches` +
  `GET /api/marketing/nurture/due` (consumer poll) + `POST /:id/send`. wa.me CTA on
  PublicHome hero + PublicLeadForm.
- **A/B experiment harness (Funnel#5, ab-test-setup skill)**: gated CRUD (hypothesis /
  primaryMetric / baselineRate / MDE required before create), public sticky variant
  assignment, per-variant stats in FunnelTab. No uncommitted experiment is force-launched.

## Not yet built (next sessions)

1. ~~**15-min speed-to-lead SLA task**~~ ✅
2. ~~**Stale-lead recovery action**~~ ✅
3. ~~**FunnelTab UI**~~ ✅
4. ~~**WhatsApp-centric messaging**~~ ✅ (engine + wa.me; actual dispatch needs Listmonk/OpenWA consumer on Oracle VPC)
5. ~~**A/B tests**~~ ✅ (harness built; launch a real experiment once traffic + a locked hypothesis exist)

## Design references
- Lead Lifecycle / scoring / routing: `skills/revops` (MQL → SQL → Opportunity → Customer)
- Nurture cadence: `skills/email-sequence`, `skills/cold-email`
- CRO: `skills/page-cro`, `skills/form-cro`, `skills/popup-cro`
- Research: 2026 study-abroad India funnels (destination-intent pages, WhatsApp-first,
  credibility before first call), Forrester nurture stats (20% more opps), Lead Connect
  speed-to-lead (5min 21x / 30min −10x / 24h cold).