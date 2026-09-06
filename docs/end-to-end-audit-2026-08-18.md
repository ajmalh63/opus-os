# End-to-End Audit — Opus OS (2026-08-18)

Scope: full monorepo (apps/api · apps/app · packages/shared · scripts · CI). Four parallel
audit agents (route-sync, navigation, dead-code, backend-security) + manual verification of
every finding. **All fixes verified: 86 test files / 557 tests green, typecheck + build clean.**

---

## 1. CRITICAL — fixed

| # | Finding | Fix |
|---|---------|-----|
| C1 | **Public partner signup created a `counselor` (staff) better-auth user** — after email verification the attacker held a session passing every staff RBAC allowlist (`/api/clients`, `/api/kanban`, `/api/tasks`, `/api/inbox`, `/api/teamhub`, …) | Added `partner` role to the users enum (no DB CHECK exists → no migration needed; verified in 0000 migration SQL) and signup now creates `role: 'partner'` — matches **no** staff allowlist → 403 everywhere (`routes/partner.ts:127`, `db/schema.ts:14`) |
| C2 | **Client "token" `OP-2026-XXXX` (9,000 guessable values) is the portal credential** — enumeration = full PII dossier (documents, consents, payments, agreements) | Hardened the attack surface: rate limits on `/api/public/portal` (30/5min), `/api/public/portal/{visa,manpower,umrah}` (40/5min), `/api/public/portal/agreements` (30/15min) + existing turnstile on umrah book. Full token redesign (per-client secret) is a schema+backfill change — tracked in PENDING-CONFIGS |
| C3 | **Agreement OTP generated with `Math.random()`** (predictable) + no throttling | CSPRNG via `crypto.getRandomValues` + rate limit on the e-sign router (`routes/agreements.ts`, `index.ts`) |
| C4 | **Hardcoded secrets in committed `wrangler.toml [vars]`** — `ADMIN_PASSWORD`, `OPENWA_API_KEY` (real-looking VPS key), `AUTOMATION_TOKEN`, `WA_WEBHOOK_SECRET` | Removed from `[vars]`; values live in gitignored `.dev.vars` (local) / `wrangler secret put` (prod). `bootstrap-admin` already gated (rate-limited + 409 once a verified super_admin exists) |
| C5 | **Public visibility/analytics endpoints RBAC-gated** — UTM capture, GA4 events, GA4 config all 401'd for anonymous visitors → conversion tracking dead on every public page | Split `visibilityPublicRouter` (POST /utm, POST /ga4/events, GET /ga4/config) and mounted it **before** the RBAC gate (`index.ts:311`). Added 4 regression tests (`tests/visibilityPublic.test.ts`) — also exposed a mockDb gap (`utm_events`/`ga_events` tables missing) |

## 2. HIGH — fixed

| # | Finding | Fix |
|---|---------|-----|
| H1 | **`/go/:ref/:type/:id` partner deep links had no FE route** — copied links landed on home, attribution silently dropped; "every click is tracked" was false | New `pages/GoRedirectPage.tsx` + route in `App.tsx`: calls backend (click tracking), follows the 302 via `redirect: 'manual'`, SPA-navigates to the target with `?ref=` preserved |
| H2 | **Dead anchor `#counselor-form`** on StudyAbroadRoiCalculator (primary conversion CTA = no-op) | Now links to `/lead-form` with partner-ref forwarding (`leadFormHref()` helper in `config/booking.ts`) |
| H3 | **"Sign Up on Opus OS" → `/login`** (sign-in page) on PublicHome + AboutUs | → `/signup` |
| H4 | **Funnel modal "Book 1-on-1" sent Umrah/Attestation users to the study-abroad cal.com scheduler** (contradicted StickyCallBar's consultation/transactional split) | Modal now gates via `isConsultationDivision()`: consultation → cal.com; transactional → "Request Detailed Quote" → lead form |
| H5 | **ChatWidget default = `http://127.0.0.1:3200`** (LAN IP; mixed-content-blocked on HTTPS → live chat silently dead) | Env-only (`VITE_CHATWOOT_BASE_URL`); widget disabled when unset |
| H6 | **TeamHub Durable Object had zero auth** — reachable via its own workers.dev URL; anyone could read/spoof room messages | Worker→DO calls now carry `X-TeamHub-Auth: HMAC-SHA256(BETTER_AUTH_SECRET, roomId)`; DO verifies with constant-time compare → 401 otherwise |
| H7 | **`myIncentiveView` parsed cookies for hardcoded test tokens** (`token-counselor`→`counselor-1`, else `'me'`) — real sessions queried `employeeId='me'` | Uses `c.get('user').id` from RBAC session (`routes/incentives.ts`) |
| H8 | **Razorpay refunds stored negative amounts** → `recomputeBalance` double-errored (balance never restored) | `Math.abs()` at insert (`routes/razorpay.ts`) |
| H9 | **Two divergent GST algorithms** — payments.ts (GST-inclusive, tested) vs transactions.ts (tax-on-top) → same invoice, different GSTR-1 splits | Unified `computeGst` to GST-inclusive (taxable = round(amount/1.18), GST = amount − taxable) — matches the tested payments behavior |
| H10 | **Manual payment entries inserted as `draft` but immediately adjusted `outstandingBalance`** → next recompute silently snapped the balance back | Manual ledger entries now insert `status: 'confirmed'` (`routes/payments.ts:111`) |
| H11 | **Commission matured on ALL payment rows** (summed invoices/charges/refunds) and overwrote `paid` rows back to `matured` | Realized money = receipts (confirmed/synced/paid) − refunds; never regresses a paid ledger row (`routes/agreements.ts`) |
| H12 | **`/charge` allowed any staff to charge any client any amount** (no division scope) | Division-scope gate for counselor/coordinator (mirrors auto-confirm gate) + existing amount bounds (`routes/transactions.ts`) |
| H13 | **Counselors could list the entire client PII directory** (`GET /api/clients` unscoped) | List now scoped to the counselor's assigned divisions via engagement rows (`routes/clients.ts:435`) |
| H14 | **46× `details: error.message` leaks in 500 responses** (SQL errors, internal paths to clients) across razorpay/transactions/payments/agreements/partner/incentives/clients | Stripped from all 500-class responses (4xx validation details preserved — the one test asserting `details` is a 400) |
| H15 | **Cal.com webhook rate limit registered after the route mount** → never fired | Moved before the mount (`index.ts:134`) |

## 3. MEDIUM — fixed

- **"Track Case Status" → login** (HeroCarousel): relabeled "Login to View Case" (honest, matches JobTicker pattern)
- **"DPDP Consent" → generic lead form** (ClientPortal footer): now "Privacy & DPDP" → `/privacy`
- **Dual support desks**: ClientPortal `+91 98765 43210` + PublicService `support@` unified to canonical Footer/ContactPage values (`+91 98765 00001`, `hello@opusoverseas.com`)
- **Ref forwarding**: division-page lead CTAs (StudyAbroad/Umrah/Attestation) now preserve `?ref=` attribution
- **SMTP stub claimed "Report queued"** when delivery never happens (`visibility.ts:454`): honest `saved_no_delivery` status
- **Stale smoke script**: `/workspaces/{performance,marketing,campaigns,infra}` (all NotFoundModule) → real routes `/finance/performance`, `/marketing/funnel`, `/marketing/campaigns`, `/finance/infra`

## 4. Dead code — removed

- Components (0 importers, verified): `FloatingConversionBar`, `PartnerThrive`, `StaffTools`, `LiveConsularRadar`
- `apps/api/src/infra/kv.ts` (whole module unreferenced; KV binding kept for future wiring)
- `scripts/fix-turnstile.mjs` (hardcoded Windows path, one-off)
- Deps: `playwright` (root — scripts use `playwright-core`), `iconv-lite` (app — zero imports); lockfile re-synced

**Kept deliberately** (verified alive or contract surface): all 5 `tools/*` widgets (mounted on division pages — the dead-code agent was wrong here), `PublicService.tsx` (documented intent in docs/division-availability.md), shared zod `*Input` exports (API contract), `logInfo/logWarn` type exports.

## 5. Verified clean (no action)

- **All 395 FE API call sites resolve to a registered backend route** — zero 404s, zero method mismatches, zero casing/slash mismatches
- **All 50 wouter routes + 4 redirects resolve** to existing components
- No `href="#"` dead buttons, no malformed URLs, no `eval`/`new Function`/`dangerouslySetInnerHTML`, no raw-SQL interpolation
- All static assets referenced exist in `public/`

## 6. Remaining recommendations (tracked, not silently changed)

1. **Client-token redesign** (C2): replace `OP-2026-XXXX` with per-client random secrets + hashed lookup. Schema + backfill + portal URL change — needs a release decision.
2. **`disableOriginCheck: true`** in better-auth (`auth.ts:102`): re-evaluate once the prod origin is fixed (Cloudflare domain onboarding).
3. **`wrangler secret put`** for prod: `BETTER_AUTH_SECRET`, `ADMIN_PASSWORD`, `OPENWA_API_KEY`, `AUTOMATION_TOKEN`, `WA_WEBHOOK_SECRET`, `TURNSTILE_SECRET_KEY` (mock key in vars disables bot protection if deployed as-is).
4. **Cal.com webhook secret**: user is setting it now (HMAC enforcement activates once saved in the Consultations panel).
5. **Manpower cal.com event type** doesn't exist (`manpower-consultation` 404) — create it in cal.com or remove from `DIVISION_BOOKING_URLS`.
6. **27 dead backend endpoints** (admin runtime-logs, notifications, import, rbac user-assignment, marketing interactions, incentives rules PATCH, manpower resume-parse, india-post label/track, etc.) — inventory bloat only; kept because they're tested and may be wired by pending configs.
7. **`timingSafeEqualHex` duplicated 6×** — centralize into `services/paymentLinks.ts` on next refactor.
8. **Rate-limit identity stores raw session-token cookie in D1** — hash the identity column on next schema change.

## Verification

```
pnpm -r typecheck   → all 3 workspaces pass
pnpm --filter app build → clean
vitest run          → 86 files / 557 tests passed (553 baseline + 4 new visibility regression tests)
```
---

## 7. Addendum — Forms → CRM sync audit (2026-08-18, evening pass)

Audited all **52 forms** across the app. Every client-facing submit now lands in
the CRM (clients + engagements + communications, deduped by phone):

| Form | Submit → | CRM rows |
|---|---|---|
| PublicLeadForm, FunnelModal | `POST /api/public/leads` | client + engagement + comms (+referral via refCode) |
| Attestation / Umrah / Visa / Recruitment / Contact / PublicService | `POST /api/public/leads` | client + engagement + comms (+DPDP consents, Turnstile) |
| VisaRiskDiagnostic | `POST /api/public/leads/express` | client + engagement + comms |
| BookingModal | `POST /api/cal/public/book` | cal.com booking + local `bookings` row + audit |
| ClientPortal (lookup/claim/consent) | `POST /api/public/portal/*` | server-backed portal session + consents |
| Partner signup/login | partner API | partners row + apiToken |

**Gaps fixed this pass:**
1. **ApplicationReadinessAuditor (home page)** faked a 450ms result and
   persisted NOTHING → now captures name + WhatsApp → express lead with the
   audit score/context in `intakeContext` → CRM client + engagement + portal
   tracking link (dedupe by phone).
2. **Division-page inline forms dropped `?ref=` partner attribution** (only
   PublicLeadForm + funnel modal forwarded it) → all 4 pages now forward
   `refCode` so partner referrals credit in the CRM on submit.
3. **Remaining direct cal.com links** (Footer, AboutUs, StudyAbroad pre-footer
   band, RoiCalculator "Book Financial Review", VisaRiskDiagnostic) now open
   the gated BookingModal instead of the raw cal.com page.

Verification: 87 test files / 566 tests green, typecheck (3 workspaces) + build clean.
