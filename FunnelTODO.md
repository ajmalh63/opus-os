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

## Not yet built (next sessions)

1. ~~**15-min speed-to-lead SLA task**~~ ✅ DONE (leads.ts)
2. **Stale-lead recovery action** — convert the funnel `stale` queue into an auto task /
   re-nurture sequence (WhatsApp/email template) instead of just listing them.
3. **FunnelTab UI** in AdminConsole — stage bars, conversion %, stale queue, velocity,
   affiliate leaderboard with GSAP entrance. Backend endpoints already exist.
4. **WhatsApp-centric messaging** — the business runs on WhatsApp; add click-to-chat CTA
   + WhatsApp-consented nurture into the funnel flow (ensures DPDP-compliant).
5. **A/B tests** — subject lines / lead form variants via `ab-test-setup` skill.

## Design references
- Lead Lifecycle / scoring / routing: `skills/revops` (MQL → SQL → Opportunity → Customer)
- Nurture cadence: `skills/email-sequence`, `skills/cold-email`
- CRO: `skills/page-cro`, `skills/form-cro`, `skills/popup-cro`
- Research: 2026 study-abroad India funnels (destination-intent pages, WhatsApp-first,
  credibility before first call), Forrester nurture stats (20% more opps), Lead Connect
  speed-to-lead (5min 21x / 30min −10x / 24h cold).