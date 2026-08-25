# Opus Overseas — Real Portal Redesign Strategy (Client & Partner)
**Status: Dummy prototypes deleted (reports/opus-portals/* removed, preview 5174 stopped). This doc is the executable plan to retrofit your *actual* code.**

*Repo:* `/media/cordial/New Volume/Opus OS` • *Dev:* `5173` (Vite) + `8787` (Wrangler) • *Stack:* React 19 + Vite 6 + Tailwind 4 + Hono + D1/R2

---

## 0) What was wrong before (audit vs research)

**Research truth (17 sources):** Client = anxious/high-stakes (needs *relief*, not info) • Partner = busy/ROI-hungry (needs 30s answer, portal fatigue 5-10 vendors). Both need data freshness > comprehensiveness. Top-left bias, F (mobile) / Z (desktop), 80% left attention, thumb-zone bottom.

|  | Current `ClientDashboardHub.tsx` | Current `PartnerDashboardHub.tsx` |
|---|---|---|
| **Hero** | Dark luxury banner (pretty but generic) • No Pending Action, no Trust Strip at top | 4 metrics cards only • No Earnings Hero with Withdraw, no tier ring |
| **Progress** | 5-col Kanban covers *everything* at once → cognitive overload. No sticky Endowed Progress (2/12 pre-filled). | 5-col Kanban still dense • No Goal-Gradient, no streak/badge loop |
| **Trust** | Metrics strip shows totals but no `Updated 2m ago • Source: VFS` • No social proof at hesitation point | No live sync badge, no `90-day cookie` explicit |
| **Money** | Paid totals buried in card • No transparent Paid/Due/Balance bar | Totals exist but scattered • No single `₹1,24,000 Available` hero |
| **Navigation** | 5-col desktop = 20% viewport per column → crowded on 1366px. Mobile will stack to 1 column with huge scroll (no bottom tab, no thumb CTA) | Same grid issue • No stage-based Resource Center |
| **Search** | Global search missing in portal • No fuzzy (“receipt”→“invoice”) | Same |
| **Empty/error** | No empty vault / upload fail >10MB states | No zero-referral empty state coaching |
| **Language/A11y** | No visible language toggle • No 44px targets audit | Same |

> **Briidge/Swooche rule broken:** *Fewer fields always current > comprehensive stale.* Your dashboards try to show *all* divisions at once → risk of stale tiles.

---

## 1) Strategy: Two Skins, One Engine, Four Placements

**Design Read:**
- **Client — *Calm Counter*:** `trust-first` • `DIAL 6/4/3` • Cream `#FAF8F4` + Ink `#0A2D50` + Amber `#D7A019` • IBM Plex + Montserrat • Airy, left-aligned, reassurance at every step.
- **Partner — *Cockpit*:** `enterprise B2B` • `DIAL 7/5/7` • Slate `#070C18` header + Lime `#CEFF00` for money • JetBrains Mono for numbers • Dense but scannable, gamified.

**Placement Law (UEyes 20k, NNg):**
- **Desktop (1440, 12-col):** Header 64h (Logo 16pad left, Search center, Live badge + Avatar right) → Trust Strip 36h *directly under header* → Pending Banner (F top) → Sticky Progress 52h → 8/4 main (80% left). Primary CTA at Z endpoint (bottom-right of hero card).
- **Mobile (390, 1-col):** Header 56h minimal → Sticky Progress 36h → Stack single column → Sticky Bottom CTA 16px above Bottom Tab 64h (`Home | Docs | Pay | Help` client / `Home | Deals | Assets | Earnings | More` partner) in thumb arc. Tables → cards. Touch targets ≥44px.

---

## 2) Client Portal — Retrofit Plan (`ClientPortal.tsx` + `ClientDashboardHub.tsx`)

**Files to touch:**
- `apps/app/src/pages/ClientPortal.tsx` — keep data fetch, inject new shell
- `apps/app/src/components/ClientDashboardHub.tsx` — major refactor (or split)
- `apps/app/src/components/artifacts/*`, `apps/app/src/pages/divisions/*` — keep, but surface via 8/4
- New components (create under `components/client/`):
  - `TrustStrip.tsx` — `Live • 12,438 visas • 4.8★ • Updated 2m ago • Source: VFS | Govt Approved`
  - `PendingActionBanner.tsx` — amber, `Upload Passport • Due 3d • 2 min • Slot till 28 Aug` → `Upload now →`
  - `JourneyStepper.tsx` — sticky, endowed 4 steps `✓ Application Done | 2 Documents ◉ | 3 Verification | 4 Visa` + `72%` bar + `You are 25% faster than avg`
  - `ChecklistRelief.tsx` — 5 items, each tick animates progress, `3/5 done • Keep momentum` (GSAP scale 1.02)
  - `DocumentVaultCards.tsx` — preview, read receipt `Viewed 10:42`, fail state `>10MB compress`
  - `MoneyTransparencyCard.tsx` — `₹1,84,500 Total | Paid ₹90k ✓ | Due ₹34k (15 Sep) | Balance ₹60k` with bar
  - `CounsellorReassurance.tsx` — avatar, `Ammar 4.9★ • Mal/Hi/Ar • 7m avg reply`, FAQ surfaced *in context*
  - `SocialProofAtHesitation.tsx` — `84 students flew last month` + quote card next to checklist, not footer
- `apps/app/src/index.css` — add tokens `--color-cream`, verify `--color-brand-cream` already `#FAF8F4`

**IA change (critical):**
Before: `Hero → 4 metrics → 5-col Kanban (all)` → user scans everything.
After: `TrustStrip → Pending Banner → Sticky Stepper → 8-col: Timeline vertical (left border dashed) + Vault/Money | 4-col sticky: Checklist + Social Proof + Support`. Divisions cards become `Instant Application Desk` secondary, not primary.

**Mobile (new):**
- Collapse 5-col Kanban → single-column vertical stepper (your existing columns become steps, not grid). Reveal via GSAP `whileInView` once.
- Bottom sticky CTA + bottom tab (currently missing). Header language toggle stays visible.

**Psych levers placed:**
- **Completion Bias:** Endowed progress (Step1 ✓) + checklist dopamine + `2/12 pre-filled` copy.
- **Loss Aversion (ethical):** `Slot reserved till 28 Aug` — not fake `Only 1 left!` (which drops trust 3.64→2.87).
- **Social Proof:** At checklist, peer similarity.

---

## 3) Partner Portal — Retrofit Plan (`PartnerDashboard.tsx` + `PartnerDashboardHub.tsx`)

**Files to touch:**
- `apps/app/src/pages/PartnerDashboard.tsx` — keep auth/KYC/query logic, replace layout below `PartnerDashboardHub`
- `apps/app/src/components/PartnerDashboardHub.tsx` — major refactor
- New components (`components/partner/`):
  - `EarningsHero.tsx` — `₹1,24,000 Available to withdraw` + `Withdraw to UPI/Bank →` + tier ring 72% SVG (Gold→Platinum) + `₹38k Pending | ₹1.02L Paid`
  - `NextBestActionCard.tsx` — AI: `Claim ₹10k SPIF: Register 2 deals for Riyadh Uni by Fri` + one button
  - `StreakBadge.tsx` — `🔥 7 days • Closer • 3 logins to Elite`
  - `PipelineKanban.tsx` — keep but trim to 3 cols desktop (New Leads | Deals | Closed Won) + filter `Leads/Deals/₹`. Add `At risk: 48h untouched` pulse.
  - `ResourceStageTabs.tsx` — tabs `Prospecting | Qualifying | Closing | Servicing` + cards `1-pager • 2-min video • Calculator` + `Top 10 Most Used | Recently Viewed | Favorites | Did you mean?`
  - `IncentiveWidgets.tsx` — `Points 4,320 | Gold | MDF ₹45k` + `72% to Platinum • +15% commission` bar
  - `Leaderboard.tsx` — `1 Riyas ₹3.8L | 2 Rahman ₹3.2L (You +12%)`
- `apps/app/src/pages/PartnerDashboard.tsx` already has `DIVISIONS` + `SWIPE_TEMPLATES` + `catalog` — wire to new `ResourceStageTabs` and expose `utmCampaign` + `deepLinkFor` visibly.

**IA change:**
Before: `4 metrics → 5-col Kanban → Share Link + Referral form`
After: `Earnings Hero (8/4 with NextBestAction) → 8-col Pipeline + Resource Stage | 4-col sticky Incentives/Leaderboard/MDF`. Universal search `⌘K` + program switcher drawer in header.

**Mobile:**
- Same earnings hero stack vertical, `Withdraw` sticky above bottom tab `Home|Deals|Assets|Earnings|More`. Pipeline → cards, not 5-col grid.

**Psych levers:**
- **Goal Gradient:** Tier ring 72% + `1,680 pts to Platinum` — effort ↑ near goal.
- **Status & Progress:** Live badge `Last deal 14m ago`, streak, leaderboard.
- **Choice Architecture:** Resource organized by *sales stage* (not file type) → finds in <30s.

---

## 4) Missing Crucial — My Additions (synced for both)

1. **Stale-data kill switch:** If `clicks/total` sync >24h, show `Sync paused • Call manager` banner (don't show stale numbers). One stale figure destroys trust forever (Briidge).
2. **Language toggle (generic, config-driven):** `<LanguagePill languages={['EN','HI','AR']} />` — defaults to `EN` only if no config is provided. No hardcoded market assumption; add languages only when you specify them.
3. **Fuzzy search:** Global `globalSearch` with synonym map `receipt→invoice`, `John's email→contact` + typo tolerance, filters by division/status. Partner: add `Did you mean SOP template?`
4. **Empty & Error states:** Vault empty → `No messages yet • Counsellor replies in 2h` + illustration. Upload fail → `File >10MB • Try compress` (red). Zero referrals → coaching `Create 1st Division Link`.
5. **Offline & Performance:** Target FCP <1.5s, bundle <200KB, works on 2GB Android / 3G. Add `Offline banner • Retrying…` (your users on prepaid data).
6. **A11y & Trust:** 4.5:1 contrast, 44px min tap, focus rings, `prefers-reduced-motion` (GSAP `once:true`), GDPR row-level filtering + `Export my data` CTA, DPA notice in TrustStrip.
7. **Audit trail:** Document vault shows `Viewed/Downloaded at` + masked bank/UPI + encrypted `256-bit` badge.

---

## 5) Phased Execution (4 weeks, no dummy pages)

**Week 1 — Trust & Progress (highest lift):**
- Client: Add `TrustStrip`, `PendingActionBanner`, `JourneyStepper` (sticky, endowed). Partner: Add `EarningsHero` + Tier Ring.
- Metrics: `updated 2m ago` live, fake static `12,438` → real `totalPaid`/`verifiedDocs` + `Intl.NumberFormat`.

**Week 2 — Placement & Navigation:**
- Refactor Client 5-col → 8/4 (Timeline left, Checklist sticky right). Refactor Partner 5-col → 3-col Pipeline + Stage Tabs. Add `Bottom Tab` + `Sticky CTA` for mobile. Collapse grids: `md:grid-cols-5` → `grid-cols-1 lg:grid-cols-12`.

**Week 3 — Persuasion & Resources:**
- Client: `ChecklistRelief` animation, `SocialProofAtHesitation`, `MoneyTransparencyCard`. Partner: `NextBestActionCard`, `ResourceStageTabs` (wire to `catalog` query), `Leaderboard` + streak.

**Week 4 — Polish & A11y:**
- Fuzzy search, language pill, empty/error states, offline banner, focus audit, `prefers-reduced-motion`, bundle audit, run `pnpm -r typecheck`.

---

## 6) How to Run / Verify

```bash
# dev (already running)
# Client portal: http://127.0.0.1:5173/portal  (needs /api/auth/me session or ?token=...)
# Partner portal: http://127.0.0.1:5173/partner
# API: http://127.0.0.1:8787/api/health

# typecheck after edits
cd "/media/cordial/New Volume/Opus OS" && pnpm -r typecheck

# visual regression on mobile
# Test 390px: open DevTools → Device Toolbar → check thumb CTAs reachable one-handed
```

## 7) Definition of Done

- [ ] TrustStrip directly under header on both portals
- [ ] Sticky progress (endowed) visible without scroll
- [ ] Pending/NextBestAction banner at F top (single primary CTA)
- [ ] 8/4 desktop, 1-col mobile with bottom tab + thumb CTA ≤80px from bottom
- [ ] Checklist / Resource stage completes in <30s, with live sync badge
- [ ] Empty/error/offline/ language states handled
- [ ] Lighthouse mobile performance >90, a11y >95, no stale-data display

---
*Ready to start Week 1 patches — shall I open a branch and begin with `TrustStrip` + `JourneyStepper` on `ClientDashboardHub.tsx`?*
