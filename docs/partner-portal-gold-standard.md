# OpusOS — Gold-Standard Partner Portal Design

> **Status:** IMPLEMENTED (2026-08-17) — Phases A/B/C complete, orchestrated + verified · 516 tests green
> **Basis:** Track360 operator guide 2026 · Zoho Thrive · Impact/ShareASale/PartnerStack patterns · NIST/SOC2 (audit) · GSAP official patterns · design-taste anti-slop rules

## 1. Research summary — what gold-standard partner portals do

| Standard | Practice |
|---|---|
| **Activation window** | Partners who create their first link within 48h are 3–5× more likely to stay active → portal must guide login → first tracking link in **<5 minutes** (prominent link CTA + guided checklist) |
| **Real-time reporting** | Clicks, referrals, commissions visible near-real-time, not batch |
| **Commission transparency** | Per-referral breakdown with the **math** (rate × basis), never just totals; status timeline per referral (lead → signed → milestone → matured → paid) — keeps dispute rate <2% |
| **Self-service payouts** | Balance, payment method, threshold, history — no support tickets |
| **Creative library** | Pre-approved banners/text links partners can copy — compliance control + activation |
| **Click analytics** | Per-link clicks with recency — partners optimize campaigns |
| **White-label branding** | Portal carries the brand (nav, colors, motion, effects) — partners associate revenue with YOUR brand |
| **Tier gamification** | Bronze→Platinum with visible progress + perks (exists: partnerTiers) |
| **KPIs** | Time-to-first-click <48h · activation >40% · login 3+/week · tickets <0.5/partner/mo |

## 2. Gap analysis — current OpusOS partner portal

**Exists (keep/improve):** KYC registration with account option · session/token auth · summary (totals + referrals) · link generator with `/go` click tracking · tier/points system · payout requests · public catalog (visa/jobs/umrah/departures) · admin approve/block.

**Missing (this design):**
1. **Activation onboarding** — welcome + checklist (create link → first click → first referral → account email)
2. **Click analytics** — per-link stats endpoint + UI
3. **Referral transparency** — per-referral breakdown with timeline derived from real data (clients/engagements/payments/commissionLedger)
4. **Creative library** — `partner_creatives` table + admin CRUD + public GET (pre-approved materials)
5. **Payout config** — payment method/detail/threshold (partners table columns) + email notifications (requested/approved/paid) via notify.ts
6. **Brand DNA sync** — brand tokens (brand-cream, clay-card, glass-pill, film-grain, hero-orb), Nav + Footer + LiveWallpaper, `lib/motion.ts` helpers (fadeUp/staggerReveal/countUp), GSAP gold patterns (transform-only, matchMedia reduced-motion), mobile-first grid collapse, tabbed layout
7. **Real-time refresh** — TanStack refetchInterval (30–60s) on key queries

## 3. Schema changes (orchestrator-owned, to avoid migration races)

- **`partner_creatives`** table: id, title, type (banner|text), size (e.g. 728x90), url (target path), imageKey (R2, nullable), active (bool), createdAt, updatedAt. Seed 4 text creatives.
- **`partners`** +3 columns: payoutMethod (bank|upi|null), payoutDetail (text), payoutThresholdPaise (int default 0).

## 4. API contracts

| Endpoint | Purpose |
|---|---|
| `GET /api/public/partners/:id/onboarding` | `{ steps: [{key: account\|link\|click\|referral, done, label, hint}], doneCount, totalCount }` |
| `GET /api/public/partners/:id/clicks` | `{ totalClicks, links: [{id,title,catalogType,catalogItemId,clicks,lastClickedAt,createdAt}] }` |
| `GET /api/public/partners/:id/referral-detail` | `{ referrals: [{referralId, clientId, clientName, commissionRate, amountPaise, status, createdAt, timeline: [{label, at, state}]}] }` |
| `GET /api/public/partners/:id/creatives` | `{ creatives: [{id,title,type,size,url,imageKey,active}] }` (active only) |
| `POST /api/public/partners/:id/payout-config` | body `{payoutMethod?, payoutDetail?, payoutThresholdPaise?}` → updated partner |
| `POST /api/admin/partners/creatives` + `DELETE /api/admin/partners/creatives/:id` | owner-managed library |

Payout email notifications: on request → partner email; on approve/paid (partnerAdmin) → partner email. Reuse `infra/notify.ts` (email channel).

## 5. Frontend design (PartnerDashboard → tabbed portal)

Tabs: **Overview** (KPI cards + activation checklist + tier progress + copy-link CTA) · **Links** (generator + click analytics) · **Referrals** (transparency table + timeline) · **Payouts** (config + history) · **Creatives** (library). Brand DNA: bg-brand-cream, Nav, Footer, LiveWallpaper hero band, film-grain, hero-orb, clay-card/glass-pill, motion.ts helpers, GSAP matchMedia + prefers-reduced-motion, refetchInterval 45s, mobile collapse.

## 6. Verification

Per phase: TDD tests → `npx vitest run <files>` → `pnpm -r typecheck` → `pnpm --filter app build` → full suite (500+ tests). Orchestrator runs final gate.

## 7. Implementation log (2026-08-17)

- **Migration 0072**: `partner_creatives` table + `partners` payout columns (orchestrator-owned, no races).
- **Subagent A — partnerThrive.ts** (+221): `GET /:id/clicks`, `GET /:id/referral-detail` (5-step timeline from real data), `GET /:id/creatives` (active only), `POST /:id/payout-config` (audited), `GET /:id/onboarding` (activation checklist), payout-request email via notify. Tests: `tests/partnerAnalytics.test.ts` (9).
- **Subagent B — partnerAdmin.ts + seed.ts**: creative CRUD (audited CREATIVE_CREATED/UPDATED/DELETED), payout approve/paid emails, `seedPartnerCreatives` (idempotent, 4 text creatives). Tests: `tests/partnerAdminCreatives.test.ts` (9).
- **Subagent C — PartnerDashboard.tsx** (525→1298 lines): 5-tab portal (Overview/Links/Referrals/Payouts/Creatives), activation checklist, click analytics, referral timeline transparency, payout config + threshold gate, creative library with copy buttons, refetchInterval 45s, full brand DNA (tokens, clay-card/glass-pill/film-grain/hero-orb, Nav+Footer+LiveWallpaper, motion.ts helpers, GSAP reduced-motion, mobile collapse).
- **Orchestrator**: wired `seedPartnerCreatives` into `/api/health` (idempotent); fixed hermetic test env in auditMonitor.test.ts (stub-telegram path — no real network); seed type fix.
- **Gate**: 516/516 tests · typecheck clean · app build clean · audit-chain self-test green · mojibake gate clean.
