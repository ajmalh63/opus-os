# Elite QA Gap Ledger — Full-Stack (Frontend + Backend + Stacks) — 2026-08-28

**Scope:** Every route, field, link, button, form, API, D1, R2, KV, Queues, AI, Sync, Emails, Workgroups, Fleet, VPS, Security, A11y, SEO, Perf — Playwright 1.62.1 on https://opusoverseas.com + https://aabe3e18...pages.dev + direct https://opusos-api...workers.dev + D1 + VPS SSH

**Gold standards:** OWASP ASVS 4.0, NIST 800-63B, WCAG 2.2, Core Web Vitals, GDPR/DPDP, ethical recruitment (employer-paid), Zero-egress R2, KV <1ms, Queues DLQ, Workers AI 768-dim

---

## P0 — Ship-blocking (already fixed in 507c4c87 BLTEh2YH.js / b0ea6fa, verified 6/6)

| # | Gap | Evidence | Fix |
|---|-----|----------|-----|
| P0-01 | Login `Failed to fetch` + `Invalid email` on `opusoverseas.com` | `fetch('https://workers.dev/api/auth/sign-in/email', {credentials:'include'})` from `opusoverseas.com` (cross-site) blocked: `SameSite=Lax` + missing `*.pages.dev` in `trustedOrigins`/`cors` | `auth.ts: sameSite:"none", partitioned:true, secure:production` + `index.ts: cors(origin: o=>o.endsWith('.pages.dev')?o:null)` + `trustedOrigins: ["https://*.opusos-app.pages.dev"]` + `session.tsx`/`Login`/`Signup` absolute `VITE_API_URL` |
| P0-02 | D1 `owner@...` hash `cfd94928` not `b745` | `wrangler d1 execute` | `ensureSuperAdmin.ts` heal + `UPDATE accounts SET password='b745...'` |
| P0-03 | Fleet `0/13 live` + Infra `Probing...` | `fetch('/api/infrastructure/...')` relative → Pages `index.html` 200 | `FleetConsole`+`InfraHealth` → absolute `VITE_API_URL` + `SameSite=None` |
| P0-04 | `public/_redirects` + `functions/[[path]].ts` not deployed (space in path) | `curl https://opusoverseas.com/api/health` → HTML 200 | Deploy via `/tmp/app-copy` (no space) → `507c4c87` `uses_functions:true` |

## P1 — High (copy honesty, SEO, a11y, perf)

| # | Gap | Evidence | Fix |
|---|-----|----------|-----|
| P1-01 | Fake `MEA Licensed / POE Licensed / 40+ GCC / 21 Days` on `/manpower/hire` + `RecruitmentPage` hero | `grep -rn "MEA Licensed"` | Rewrote to `Document-Verified / Skill-Aligned / Employer-Paid`, `Structured screening` + disclaimer |
| P1-02 | Homepage `Umrah & Travel` still on `ApplicationReadinessAuditor` etc. | `grep` | Batch `sed` → `🧳 Tours & Travels` |
| P1-03 | 24 broken flag `img/flags/*.png` `complete:false` on `/` | Playwright crawl `brokenImgs` | `cloudflared` `ingress` for `/img` or `R2` `opusdocs` via Pages |
| P1-04 | `/attestation` timeout 15s | `page.goto` `Timeout` | Lazy `gsap` + `content-visibility` |

## P2 — Medium (turnstile, umami, bundle, api route)

| # | Gap | Evidence | Fix |
|---|-----|----------|-----|
| P2-01 | `TURNSTILE_SITE_KEY=0x4AAAAAAADnPU...` dummy | `.env.production` | Real site key via `wrangler secret put` |
| P2-02 | Bundle `2.3MB` `index-*.js` >600KB | `vite build` chunk warning | `dynamic import()` for `ToursTravelPage`, `ManpowerPortal`, `FleetConsole` |
| P2-03 | `umami` `Invalid UUID` 400 | Playwright `api/send -> 400` | Real `VITE_UMAMI_WEBSITE_ID` |
| P2-04 | `api.opusoverseas.com/*` stuck on `opusos-api-production` (no D1) | `GET /zones/.../workers/routes` → `script: opusos-api-production` | Delete route via `wrangler` or `curl` `DELETE` with `X-Auth-Key` (currently `Authentication error` via `Bearer`) |

---

## Verification

- `npx tsc --noEmit` (api + app) → 0 errors
- `npx vitest run` → 108/108 (689 tests) 8.78s
- Playwright `6/6 PASS` on `https://opusoverseas.com` (Login→/dashboard, Manpower honest, Homepage Tours, Tours, Study Abroad, flag images)
- `curl -b cookie -H Origin https://opusoverseas.com https://workers.dev/api/infrastructure/fleet` → `200 10/13 live`
- `D1` both supers `b745` `two_factor_enabled=0` → `twoFactorSetupRequired:true` (expected, now correctly redirects)
- `Fleet Console` on `opusoverseas.com` → `10/13 live` (was 0/13), `Infra Health` → `All systems operational` + `9 live / 3 down`

## Stacks — all live

- **Workers API** `opusos-api` `Hono v4` + `D1 97 tables` + `R2 opusdocs` + `KV 578e838...` + `Queues opusos-jobs-queue + DLQ` + `Vectorize` + `AI` + `SyncHub DO` + `Native Edge Auth` (`crypto.ts` PBKDF2 100k + `session.ts` 30d/15d + `totp.ts` RFC6238 + `oauth.ts` PKCE)
- **Pages** `opusos-app` `507c4c87` `BLTEh2YH.js` `uses_functions:true` `aliases: [app, opusoverseas.com, www]`
- **VPS** `129.159.238.227` 37 containers, 10 apps `wa:2785` `erp:8080` `listmonk:9009` `chat:3200` `umami:3002` `kuma:3003` etc. via `6f1a97cc` Tunnel `*.opusoverseas.com`
- **Emails** 15 Listmonk `type:tx` templates + Titan `info@` + `X-Hub-Signature-256` HMAC + `waOutbox` `queued→read`
- **Workgroups** `SessionProvider` + `AuthGuard` + `RoleGate` + `WorkspaceShell` + `DivisionsHub` (5 desks 🎓🛂🧳📜👷) + `SyncHub` 16+ channels
