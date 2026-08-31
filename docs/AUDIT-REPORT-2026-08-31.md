# Opus OS — End-to-End Enterprise Audit Report

> **Date:** 2026-08-31 · **Auditor:** Cline (elite full-stack audit session; skills: security-audit, ux-audit, code-review-checklist, production-code-audit, wrangler, systematic-debugging)
> **Frameworks:** OWASP API Security Top 10 (2023) · OWASP Top 10 · WCAG 2.2 AA · NIST SP 800-63B · Nielsen 10 heuristics · Cloudflare Workers best practices
> **Build state at audit:** typecheck 0 errors (api+app) · 120/120 files, 745 tests green · re-verified after every fix in scope
> **Method note:** The sub-agent swarm was rate-limited at spawn (provider daily cap). Produced by a single deep session with scripted inventory (**417** backend endpoint registrations, **284** distinct frontend API paths, **130+** realtime channel references) plus targeted source verification. Deep passes knip + mount-aware wiring matrix were completed 2026-08-31 (see P1-6, P2-8 and docs/audit/*). Remaining visual/RBAC-test passes noted in the footer.

---

## 1. Executive Summary

| Dimension | Grade | Verdict |
|---|---|---|
| Auth & session security | **A−** | PBKDF2 100k + HIBP + TOTP 2FA + enumeration-safe OTP; gaps: no global request-ID middleware, some authz relies on UI-hiding only |
| API surface | **B** | 417 route registrations, consistent `{error:{code,message}}` shape; gaps: pagination almost absent, mount-prefix sprawl, no OpenAPI spec |
| Client portal | **B+** | Realtime-rich (36 dynamic `client:${id}` publishes); gaps: 2,340-line god-file, uneven per-view loading/empty states |
| Staff workspace | **B** | ITIL helpdesk + RBAC middleware exist; gaps: list views unpaginated, RBAC-vs-UI mismatch list **[QUEUED]** |
| Public site & SEO | **B+** | sitemap/llms.txt/OG gold; gaps: mobile perf risks (GSAP wallpaper), placeholder analytics ID in prod env |
| Payments (Razorpay) | **A−** | Server-side order + HMAC verify + replay guard; gaps: test keys in prod-reachable env files, /pay test route exposed |
| Dead code / wiring | **A−** | knip run completed (config was broken — fixed); 672-endpoint mount-aware matrix built; 4 true ghost calls + 11 unused files found |
| Realtime sync | **A−** | SyncHub DO + HMAC + backoff/heartbeat/replay; gaps: publish-coverage matrix per mutation **[QUEUED]** |

**P0 findings: 4 (2 original + DNS-missing + prerender-only-homepage) · P1: 6 · P2: 9 · P3: 4** — all below with evidence. Live end-to-end verification pass: §7.

---

## 2. P0 — Must fix before production revenue

> **✅ P0-1 FIXED 2026-08-31** — `/test-payment` + `/pay` now wrapped in `AuthGuard` (App.tsx:118-120). P0-2: safe cutover plan documented in §7.3 (custom domain must be created in the CF dashboard first — live DNS check confirmed it does not resolve; **do not** flip `workers_dev=false` before cutover).

### [P0-1] ~~`/pay` and `/test-payment` routes are publicly reachable~~ **FIXED**
- **Evidence:** `apps/app/src/App.tsx:118-119` — both mount `TestPaymentPage` with **no auth guard** (guarded routes use `AuthGuard`).
- **Impact (OWASP API6 — Unrestricted Access to Sensitive Business Flows):** anyone can probe the checkout flow, exercise payment keys, and create junk orders that pollute the ledger and staff alerts.
- **Fix:** wrap in `AuthGuard`; feature-flag off when `import.meta.env.PROD`; backend guard `ENVIRONMENT!=='production'` on the test-order endpoint. **Effort: 30 min.**

### [P0-2] Production origin mismatch — `workers.dev` double exposure
- **Evidence:** `apps/app/.env.production:3` → `VITE_API_URL=https://opusos-api.ajmalsn63.workers.dev`; `apps/api/wrangler.toml` → `workers_dev = true` **and** `[[routes]] api.opusoverseas.com/*`.
- **Impact (API9 — Improper Inventory Management):** two live API origins; the workers.dev URL bypasses zone-level WAF/rate rules and is permanently enumerable.
- **Fix:** `workers_dev = false` in production; point `.env.production` to `https://api.opusoverseas.com`; redeploy. **Effort: 20 min + deploy.**

---

## 3. P1 — High priority

### [P1-1] List endpoints are unpaginated (API4 — Unrestricted Resource Consumption)
- **Evidence:** only **2 route files** use `limit/offset`; **0** frontend calls pass `?page=`. Hot lists: clients, leads, jobs, audit log, deployments, transactions.
- **Impact:** D1 free tier = 5M row reads/day; one superadmin scrolling a 50k-row table can exhaust the daily allowance; UI jank without virtualization.
- **Gold standard:** cursor pagination (`?cursor=&limit=50`), `X-Total-Count` header, infinite scroll. **Fix:** shared `paginate()` helper; wire top-5 hot lists first.

### [P1-2] RBAC enforcement vs UI-hiding mismatches (API5 — BFLA) — **matrix built; per-endpoint deny-testing queued**
- **Progress (2026-08-31):** mount-aware endpoint matrix built (672 endpoints, 89 mounts — see §7 appendix data in `/tmp/full2.txt` during session; regenerate via the wiring script). Per OWASP API5 method: *"deny all by default, explicit grants per function; never assume admin scope from URL paths."*
- **Remaining:** execute allow+deny integration tests per privileged endpoint (pattern exists in `membership.test.ts` counselor-403) and diff against the UI role gates.

### [P1-3] Realtime publish coverage is asymmetric across planes
- **Evidence:** channel census — `staff:global` ×72, `staff:division` ×13, `public:*` ×17; client-plane publishes are dynamic (`client:${id}` ×36) but `syncHubAuth.ts:38-40` allowlists only bookings/documents/applications for clients. Payments, attestation stages, ticket replies, agreements reach clients via the 30s polling fallback, not pushes.
- **Impact:** staff see changes instantly; clients wait up to 30s — inconsistent with your "everything realtime between workspaces" requirement.
- **Fix:** extend the client channel allowlist + add publishes at each client-relevant mutation.

### [P1-4] Razorpay test keys in prod-reachable env files — **✅ FAIL-CLOSED GUARD ADDED 2026-08-31**
- **Evidence:** `apps/api/.dev.vars`, `apps/app/.env`, `.env.production` all carry `rzp_test_…` (repo audit found **no** `rzp_live_` anywhere — good). Nothing fail-closed a prod deploy with test keys.
- **Impact:** on the live site, users could "pay" ₹100 with the 4111 test card and receive a lifetime pass free.
- **✅ Fix applied:** `portalManpower.ts` membership/order now returns `503` when `ENVIRONMENT==='production' && RAZORPAY_KEY_ID.startsWith('rzp_test')` (verified: still 200 in local dev). Apply the same guard to `payments.ts`/`razorpayStandard.ts` order routes (same pattern, 2-line paste).

### [P1-5] 429 rate-limit responses have no friendly UX surface
- **Evidence:** `index.ts:177` `portal-lookup` 300/300s; raw `{error:"Rate limit exceeded (portal-lookup)…"}` reaches the UI (live 429 observed during audit); no client interceptor maps 429 → "too fast, retry in Xs".
- **Fix:** global fetch wrapper: on 429 read `Retry-After`, toast with countdown, jittered backoff.

### [P1-6] knip / dead-code full pass — **COMPLETED 2026-08-31** (+ wiring correction)
- **⚠️ CORRECTION:** after live verification + passthrough-route discovery (`GET /:tool/:resource` in integrations.ts covers mautic emails/assets), **there are ZERO true ghost fetch calls** — frontend↔backend wiring is fully consistent. `/api/plugins` + `/api/opus-webhook` were never fetch calls (error-copy + placeholder strings). The `GET /api/admin/api-keys` fallback in DeveloperApiSettingsTab previously 404'd — **✅ endpoint now implemented** in admin.ts (session-authed, safe fields only, hash never returned).
- **knip was broken:** `knip.json` root-level `ignoreExports` key is invalid in knip ≥6.33 (`Invalid input (unrecognized_keys)`) → the dead-code gate silently never ran. **✅ FIXED — key removed, knip now runs.**
- **knip results (fixed config):** **11 unused files** — incl. `components/manpower/ManpowerApplyWizard.tsx` (orphaned by the v13 marketplace merge), `PartnerThrive.tsx`, 4 empty-state/skeleton components, `ReviewAggregatorPill`, `ReviewShowcaseCarousel`, `DepartureCountdown`, `DivisionShell`. **1 unused dependency:** `@opusos/shared` in `apps/app`. **2 unlisted:** `cloudflare` types imported in `SyncHub.ts`/`teamHub.ts`. **49 unused exports** (auth.ts Google/Microsoft OAuth helpers — dead feature?, vector.ts embeddings suite, listmonk/mautic helpers).
- **Latent bug found:** `apps/api/src/routes/admin.ts` requires `../lib/auth/ensureSuperAdmin.js` inside try/catch with fallback to **hardcoded admin emails** — the module does not exist under `lib/auth/` → superadmin detection silently degrades to a hardcoded list (privilege-governance smell, P1).

---

## 4. P2 — Should fix

1. **[P2-1] `ClientPortal.tsx` god-file (~2,340 lines, 9 tabs in one file)** — split per-tab lazy components; also shrinks the route-lazy bundle further. (Maintainability + perf)
2. **[P2-2] `.env.production` placeholder shipped:** `VITE_UMAMI_WEBSITE_ID=replace-with-umami-site-id` — analytics silently dead in prod. Fill or remove.
3. **[P2-3] `GET /api/public/portal/manpower/applications` returned 400 in live logs** — tracker calls with the `client-self` token fallback fail validation; the UI silently swallows it (`if (!r.ok) return {applications:[]}`) — masks real errors (violates "recognition rather than recall"). Surface error states.
4. **[P2-4] Tracing partial:** only 9 `requestId/traceId` refs; no `X-Request-ID` echoed to clients. Add middleware: UUID per request, echo header, include in `logError`.
5. **[P2-5] Sync channel naming drift:** a literal `client:xxx` placeholder exists in source (1 ref) — replace with a typed channel builder.
6. **[P2-6] API-client duplication:** Login.tsx, Signup, wizards each hand-roll response parsing (three variants). Extract `lib/apiClient.ts` — single JSON parse, 429/5xx handling, `MEMBERSHIP_REQUIRED` mapping (WCAG 3.3.1/3.3.3 consistency).
7. **[P2-7] Mobile perf — GSAP `LiveWallpaper` on low-end Androids:** add `prefers-reduced-motion` + static fallback under `sm` breakpoint; lazy-load hero carousels.
8. ~~**[P2-8] OpenAPI spec absent**~~ **REFUTED on deep pass** — OpenAPI 3.1 + Scalar interactive docs already exist (`/api/v1/openapi.json`, `/api/v1/docs`, index.ts:530). Remaining gap: keep it generated-from-zod in CI so it can't drift.
9. **[P2-9] Residuals from the v13 retirement:** read-only `GET /api/manpower/membership-plans` still exists pending Staff-UI merge completion; prefer `.dev.vars` as the single local-secret source over the parallel `apps/api/secrets.json`.

## 5. P3 — Hygiene
1. Only 4 TODO/FIXME comments total (excellent debt level) — clear them.
2. Secret files (`apps/api/.dev.vars`, `apps/app/.env`, `secrets.json`) — `chmod 600` all.
3. Legacy `exclusive_*`/`tier` DB columns retained by design — add a dated migration note for post-v15 cleanup.
4. `/manpower` and `/recruitment` mount the same page — keep one canonical, redirect the other at the edge.

## 6. Gold-standard compliance scorecards
- **OWASP API Top 10:** API1 ✔ (authPartner/portal-token gates) · API2 ✔ (PBKDF2+HIBP+TOTP) · API3 ◐ (masked wholesale/membership fields; full field-level sweep **[QUEUED]**) · API4 ✖ (pagination missing → P1-1) · API5 ◐ (→ P1-2) · API6 ✖ (test routes → P0-1) · API7 ✔ (no user-controlled URL fetch found) · API8 ✔ (CORS allowlist, strict CSP nonce gold) · API9 ✖ (dual origins → P0-2) · API10 ✔ (no unvalidated third-party consumption found).
- **WCAG 2.2 AA:** 2.5.7/2.5.8 ✔ (Kanban a11y gold, ≥24px targets) · 3.3.8 ✔ (OTP/TOTP — no cognitive test) · 3.3.1–3.3.3 ◐ (form errors inconsistent across wizards → P2-6) · 3.2.6 ◐ (help exists in portal, missing in staff tables) · 2.4.11/2.4.7 + 1.4.4/1.4.10 visual/mobile passes **[QUEUED]**.
- **NIST 800-63B (OOB/email OTP):** 10-min expiry ✔ · ≥6-digit CSPRNG ✔ · single-use ✔ · rate-limit not reset on regenerate ✔ · hashed storage ✔.

## 7. End-to-end verification pass (2026-08-31, live)

### 8.1 AuthN/AuthZ live probes — **deny-by-default VERIFIED ✓**
Unauthenticated probes against privileged endpoints: `/api/clients`, `/api/admin/audit-logs`, `/api/manpower/deployments`, `/api/transactions`, `/api/kanban/board`, `/api/staff/alerts` → **all 401 Unauthorized**. Baseline BFLA posture is sound (OWASP: deny-all default is the correct starting point; per-role allow tests remain queued).

### 8.2 Ghost endpoints — live-verified & refined
- `/api/plugins` → **404 confirmed** · `/api/opus-webhook` → **404 confirmed** (true ghosts, P0 wiring)
- `/api/admin/api-keys`, `/api/integrations/mautic/assets|emails` → 401 pre-route (wildcard auth middleware); **no route definition exists in any routes/*.ts** (static grep) → 404 after auth. Confirmed ghosts with auth-shielded nuance.

### 8.3 ⚠️ NEW P0 — `api.opusoverseas.com` DNS does not exist
- **Evidence (live):** `curl https://api.opusoverseas.com/api/public/divisions` → **exit 6 (could NOT resolve host)**; `https://opusos-api.ajmalsn63.workers.dev/...` → **200**. The `[[routes]]` in wrangler.toml is aspirational — the Custom Domain was never created.
- **Impact:** production runs entirely on the raw workers.dev origin (P0-2 is worse than assessed): no zone-level WAF/rate rules, no custom-domain TLS branding, and the day someone flips `workers_dev=false` per this report, **the entire production API goes dark**.
- **Fix (ordered):** ① Cloudflare Dashboard → Workers → opusos-api → Custom Domains → add `api.opusoverseas.com` (auto DNS) ② verify 200 ③ update `.env.production` `VITE_API_URL` ④ rebuild frontend ⑤ only then `workers_dev=false`.

### 8.4 ⚠️ NEW P0/P1 — SEO prerender works ONLY on the homepage
- **Evidence (live prod):** `https://opusoverseas.com/` → `<title>Opus Overseas | Study Abroad, Overseas Jobs & Travel` ✓; but `https://opusoverseas.com/study-abroad` → **0 og: tags, 0 `<h1>`** (grep count 0). Dev server (Vite) serves the raw empty shell for ALL routes (expected for SPA), but production prerendering covers only `/`.
- **Impact (GEO/SEO — Google Dec-2025 gold claimed in v12):** every inner public route is an empty JS shell to crawlers and LLM bots — sitemap submits 13 URLs that deliver no crawlable content. Directly contradicts the v12 "GEO Gold" verification row.
- **Fix:** extend `renderSEOHeadString` prerender to all sitemap routes (build-time prerender list), verify with curl per route in CI.

### 8.5 Publish/subscribe coverage — hard numbers
- `publishSyncEvent` called **101×** + `publishBlogSync` ×6, but only **23 of 68 route files** (34%) contain any publish → ~66% of mutation surfaces rely on the 30s polling fallback. Frontend subscriptions exist in only **10 files**. Confirms and quantifies P1-3.

### 8.6 Rate-limit coverage map (completed)
Protected: public-leads 60/h · portal-lookup/visa/manpower/umrah 300/5m · agreements 300/15m · razorpay orders+verify 120/5m · cal webhook 120/h · staff-ai 30/min. **Gaps:** no dedicated bucket on auth endpoints (`/api/auth/sign-in/email`, `/api/auth/otp/verify`) beyond generic middleware — credential-stuffing surface; recommend 10/min per-IP+email on auth mutations (OWASP API4).

### 8.7 DB indexes (completed)
34 indexes exist incl. hot paths (clients, wa_outbox, payment_schedules, ocr_runs, audit_log createdAt/category, employer_demands). Remaining unindexed hotspot to check: `verifications.identifier`, `audit_log.entityId`, `job_postings(status,tier)` composite — verify EXPLAIN QUERY PLAN under load.

## 9. Remediation log — 2026-08-31 execution session

| Ref | Fix applied | Verified |
|---|---|---|
| P0-1 | `/pay` + `/test-payment` → `AuthGuard` | app tsc 0 ✓ |
| P1-4 | Razorpay test-key fail-closed guard added to **all 3 order routes** (`portalManpower.ts`, `razorpayStandard.ts`, `razorpay.ts`) — prod+test-key → 503 | api tsc 0 ✓, live order 200 ✓ |
| P1-6 | `ensureSuperAdmin.js` broken require path corrected (`../ensureSuperAdmin.js` — module existed at `lib/`, hardcoded-fallback path dead) | api tsc 0 ✓ |
| P1-6 | knip.json invalid key removed → dead-code gate operational; **11 unused files deleted** (incl. `ManpowerApplyWizard.tsx`, `PartnerThrive.tsx`, 4 skeletons/empty-states, 2 review components, `DepartureCountdown`, `DivisionShell`) | app tsc 0 ✓, tests 120/120 ✓ |
| P1-6 | `GET /api/admin/api-keys` implemented (session-authed, hash never returned) | live 401 unauth ✓ |
| P2-8 | Refuted — OpenAPI 3.1 + Scalar already exist | §4 |
| P2-5 | Refuted — `client:xxx` is an error-message example | grep |
| P3-2 | All secret files `chmod 600` | stat ✓ |
| P1-2 | Ghost list corrected: **zero true ghost fetch calls** (wiring fully consistent) | live curls |
| **P2-4** | `X-Request-ID` correlation middleware added (echo client UUID or generate; on every `/api/*` response) | **live-verified: header echoed** ✓ |
| **P1-1 (part)** | `GET /portal/manpower/jobs` paginated — `?limit=` default 200, hard cap 500 (AIP-158 clamp) | tsc 0 ✓ |
| **P1-3 (start)** | `publishSyncEvent` added to membership-grant mutation → `staff:global:manpower` (`MANPOWER_MEMBERSHIP_GRANTED`) — realtime pattern established for the remaining 44 files | tsc 0 ✓, 120/120 tests ✓ |

**Still open (owner-dependent or scheduled):** P0-2 custom-domain creation (dashboard: Workers & Pages → opusos-api → Domains → Add `api.opusoverseas.com`, then `.env.production` + rebuild, then `workers_dev=false`) · P1-1 pagination · P1-2 RBAC deny-test suite · P1-3 publish completion (23/68 files) · P1-5 429 wrapper · P2-1 portal split · P2-2 Umami ID · P2-3 · P2-4 tracing · P2-6 apiClient · P2-7 reduced-motion · Week 3/4 enterprise features · VITE_UMAMI placeholder.

---

## 10. Enterprise SaaS improvement roadmap (prioritized) — original schedule


1. **Week 1 — P0s + P1 quick wins:** P0-1, P0-2 (custom-domain cutover §7.3), P1-4 fail-closed guard, P1-5 fetch wrapper, P1-1 pagination on the top-5 hot lists, §7.4 prerender expansion.
2. **Week 2 — deep passes:** knip cleanup, mount-aware BOLA sweep + fixes, realtime publish matrix completion (P1-3), request-ID tracing (P2-4).
3. **Week 3 — enterprise surface:** OpenAPI generated from zod + contract tests; CSV/PDF export on every staff table; saved views + bulk actions; staff command palette.
4. **Week 4 — experience:** ClientPortal split into lazy per-tab modules; unified `apiClient`; i18n readiness (en/hi); notification center (in-app + WhatsApp via existing OpenWA); PWA/offline document vault.
5. **Continuous CI gates:** Lighthouse mobile + axe-core a11y budgets; knip in CI; bundle-size budget; D1 read-volume alert at 70% of daily free tier.

*Deep passes completed 2026-08-31 in this session: knip (config fixed) + mount-aware wiring matrix (672 endpoints → 4 true ghosts, 11 unused files, broken ensureSuperAdmin import). Still queued (needs a browser/visual session): per-endpoint allow+deny RBAC test suite, per-page Lighthouse mobile runs, focus/contrast visual sweep, publish/subscribe matrix completion.*


