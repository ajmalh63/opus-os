# OpusOS — Division Availability Switch (Business Operations Gating)

> **Status:** IMPLEMENTED (2026-08-17) — Phases A/B/C complete, orchestrated + verified · 534 tests green
> **Basis:** Feature-flag gold standards 2026 (server-side evaluation mandatory; DB-driven flags for this scale; kill-switch pattern) · Coming-soon page best practices (keep the page for SEO, no lead capture) · Repo's existing `app_settings` pattern (`umrah_inventory_enabled`)

## 1. Research summary

| Standard | Practice |
|---|---|
| **Server-side evaluation** | Never gate only in the UI — APIs must enforce too (listed #1 anti-pattern: "gating only in the UI") |
| **DB-driven flags** | For <10 flags, a flag store + helper beats LaunchDarkly/Flagsmith (0.5–1 day build; under 1ms eval with caching) |
| **Kill-switch semantics** | Division OFF = business kill switch: intake stops everywhere, existing data untouched |
| **Coming-soon pages** | Keep the page (SEO value), branded "coming soon" state, NO lead capture on disabled divisions — capture only what you can serve |
| **Flag hygiene** | Central registry, one evaluation helper, audited changes (who toggled what) |

## 2. Design

### Backend
- **Single source of truth**: `app_settings` key `divisions_enabled` = JSON `{ "study-abroad": true, "visa": false, "umrah": false, "attestation": false, "manpower": false }` (owner's stated business state; missing row → these defaults, idempotently seeded).
- **`apps/api/src/lib/divisions.ts`**: `DIVISION_KEYS`, `DEFAULT_DIVISIONS_ENABLED`, `getDivisionsEnabled(env)`, `isDivisionEnabled(env, key)`, `seedDivisionsEnabled(db)` (upsert if missing).
- **Endpoints**:
  - `GET /api/public/divisions` → `{ enabled: {...}, list: ['study-abroad', ...] }` — public, drives ALL frontends
  - `GET /api/admin/divisions` → same + last-updated (owner)
  - `POST /api/admin/divisions` body `{ enabled: {...} }` → upsert, **audited** `DIVISION_TOGGLED` (category config, before/after)
- **Enforcement (server-side — mandatory)**:
  - `POST /api/public/leads`: disabled division → **409 `DIVISION_DISABLED`**
  - Partner `GET /catalog`: exclude disabled divisions' inventory (visa/jobs/umrah/departures)
  - Artifacts: `/api/public/jobs`, `/umrah/departures`, `/attestation/chains` → empty when division off; `/match/eligibility` gated too
- **Seed**: `seedDivisionsEnabled` wired into `/api/health` (idempotent, like tiers/creatives).

### Frontend
- **`apps/app/src/lib/divisions.ts`** (orchestrator-owned): `useDivisions()` hook (TanStack Query on `/api/public/divisions`, 60s stale/120s refetch) → `isEnabled(key)`; **defaults to enabled when unknown** (no flash of coming-soon for existing users while loading).
- **Public** (`PublicService.tsx`): disabled division → branded **Coming Soon** state (navy hero + LiveWallpaper + film-grain + orbs, "This service is coming soon", CTA to Study Abroad + contact) — NO lead form.
- **PublicHome**: disabled division cards get a "Coming soon" badge (still visible for SEO/awareness, not clickable into lead forms).
- **PublicLeadForm**: division dropdown limited to enabled divisions (server still enforces).
- **Client portal**: tabs filtered to enabled divisions.
- **Workspace shell + DivisionsHub**: disabled divisions hidden from nav; hub cards greyed with "Off" chip (staff data untouched).
- **AdminConsole**: new **Divisions** tab — one clay-card toggle per division (brand DNA: gold switch, GSAP fade-in, audit note "changes are logged").

## 3. Subagent split (no file overlap)

| Agent | Files | Deliverable |
|---|---|---|
| A — backend | `src/lib/divisions.ts`(api), `routes/public.ts`, `routes/admin.ts`, `routes/leads.ts`, `routes/partnerThrive.ts`, `index.ts`(health seed), `tests/divisions.test.ts` | lib + endpoints + enforcement + seed + tests |
| B — public FE | `PublicService.tsx`, `PublicHome.tsx`, `PublicLeadForm.tsx` | coming-soon states + badge + dropdown filter |
| C — portal/workspace/admin FE | `ClientPortal.tsx`, `WorkspaceShell.tsx`, `DivisionsHub.tsx`, `AdminConsole.tsx` | tab/nav filtering + Divisions admin tab |

## 4. Verification

Per phase: TDD tests → targeted vitest → `pnpm -r typecheck` → `pnpm --filter app build` → full suite. Orchestrator runs final gate (516+ tests expected).

## 5. Implementation log (2026-08-17)

- **No migration needed** — reuses the existing `app_settings` table (`divisions_enabled` JSON key).
- **Subagent A — backend** (`src/lib/divisions.ts` + routes + 18 tests): defaults `{study-abroad:true, visa/umrah/attestation/manpower:false}` (owner's business state), `GET /api/public/divisions`, admin `GET/POST /api/admin/divisions` (audited `DIVISION_TOGGLED` with before/after), enforcement: leads 409 `DIVISION_DISABLED`, partner `/catalog` filtered, artifacts (jobs/departures/chains/eligibility) gated, `seedDivisionsEnabled` wired into `/api/health`.
- **Subagent B — public FE**: `PublicService.tsx` branded **Coming Soon** state (navy + LiveWallpaper + film-grain + orbs + CTAs, no lead form, zero-flash default-on while loading, GSAP via motion.ts), `PublicHome.tsx` disabled cards greyed with pulsing gold "Coming soon" chip (SEO-preserving), `PublicLeadForm.tsx` dropdown filtered + 409 DIVISION_DISABLED error handling.
- **Subagent C — portal/workspace/admin FE**: `ClientPortal.tsx` tabs filtered (Journey always, effective-tab fallback), `WorkspaceShell.tsx` division nav gated, `DivisionsHub.tsx` disabled cards greyed + "Off" chip (staff data untouched), `AdminConsole.tsx` **new Divisions tab** — 5 clay-card toggles (gold switch, `role="switch"`), optimistic updates with rollback, audit note, GSAP stagger entrance.
- **Orchestrator**: shared `useDivisions()` hook (default-on while unknown); seeded all-divisions-enabled in `tests/public.test.ts` + `tests/thrive.test.ts` fixtures (their intent is artifact/catalog mechanics; gating has its own suite).
- **Gate**: 534/534 tests (82 files) · typecheck clean · app build clean · audit-chain self-test green · mojibake gate clean.

## 6. Gap-audit follow-up (2026-08-17 — re-verification pass)

The user challenged the completeness claim. Three real gaps found and fixed (kill-switch semantics: NEW intake stops, EXISTING journeys preserved):

1. **Client-facing portal APIs were NOT gated** (the classic UI-only anti-pattern). Fixed in `portalVisa.ts`, `portalManpower.ts`, `portalUmrah.ts`, `attestationApps.ts`:
   - Catalog browse (products/jobs/packages/calendar/price-bands/rate-cards) → empty when division OFF
   - New-intake mutations (create application / apply / book / membership order+verify / submit) → **409 `DIVISION_DISABLED`** (gate middleware runs BEFORE zod validation so even malformed bodies get 409)
   - Existing-journey operations (trackers, payment completion verify-advance/pay-balance, document uploads, pickup) → **NOT gated** — clients with in-flight work are never orphaned
   - Umrah browse gates now check BOTH the new division switch and the legacy `umrah_inventory_enabled` (staff master switch kept working)
2. **Partner `/go` redirects** — verified correct as-is: redirect lands on the division page which renders the branded coming-soon state; click still tracked. Added regression tests.
3. **HeroCarousel** — 5 artifact slides now filtered by division availability (key-based artifact switching, active-index clamping, default-on while loading); a disabled division's slide (jobs ticker, departures, chains) no longer renders an empty widget.

**Test fixtures**: 6 existing portal suites (attestationApps, manpowerPortal, membership, umrahFamilyBooking, umrahPortalBooking, visaPortal) seeded all-divisions-enabled — their intent is division mechanics; gating has its own suite.

**Final gate: 540/540 tests (83 files) · typecheck clean · app build clean · audit-chain self-test green · mojibake gate clean.**
