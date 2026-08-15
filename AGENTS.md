# AGENTS.md — OpusOS Project Guidelines & Rules

Welcome! This is the living specification and rulebook for AI agents working on **OpusOS** (Business Operating System for Opus Overseas). All agents must strictly adhere to the technical stack, development rules, commands, and workflow loops described below.

---

## 1. Core Technology Stack

**Canonical project path:** `C:\Opus OS` (copied from OneDrive; the OneDrive copy is a frozen backup). Work only in `C:\Opus OS`.

| Layer | Technology |
|---|---|
| Frontend | React 19 + Vite SPA (`apps/app`), served via Cloudflare Static Assets |
| Styling | Tailwind CSS v4 (`@theme` tokens: brand-navy `#0a2d50`, brand-gold `#d7a019`, brand-cream `#FAF8F4`, brand-blue, brand-gold-hover, brand-gray, brand-textLight; utilities `.clay-card`, `.glass-pill`, `.hero-orb`, `.film-grain`, `.gold-dot`, `.lead-form-wrap`) |
| Backend | Hono API on Cloudflare Workers · `apps/api` |
| Database | Cloudflare D1 (SQLite), migrations in `apps/api/migrations` |
| ORM | Drizzle (`pnpm --filter api db:generate` → migration SQL, NEVER hand-written) |
| Auth | **Better Auth v1.6.26** (D1 adapter; password + email-OTP verification + TOTP 2FA; `apps/api/src/auth.ts`) |
| Money | **Integer paise everywhere**; ₹ formatting only at UI boundary |
| Validation | Zod schemas in `packages/shared/src` — never ad-hoc in handlers |
| Workspaces | `apps/app` · `apps/api` · `packages/shared` |

---

## 2. Non-Negotiable Rules

### User Approval Gate
- **Strict User Approval:** No action (including executing commands, editing code files, creating new files, defining/spawning subagents, or proceeding with any task execution steps) should be taken by the AI agent unless explicitly approved by the user.

### Local-First
- Dev runs locally (`pnpm wrangler dev --port 8787 --ip 0.0.0.0` + `pnpm dev` in app on 5173). No remote Cloudflare deploys until explicitly told.
- **Detached startup (persistent):** use `Start-Process cmd /c '... > log 2>&1'` from PowerShell. Start-Job/background jobs DIE when the shell exits. Restart pattern that works:
  ```
  apps/api:    pnpm exec wrangler dev --port 8787 --ip 0.0.0.0 --local
  apps/app:    pnpm dev --host 127.0.0.1 --port 5173
  ```
- Apply migrations to local D1 before first request: `npx wrangler d1 migrations apply DB --local`.

### 10ms CPU Budget
- Heavy work (AI, PDF, email) must go async (Queues / Cron). Keep handlers to DB + JSON.

### Money = paise integers. Never floats for amounts.

### Zod validation in shared package for every body/query.

### Secrets
- Secrets go in `wrangler secret put`, **never** in `[vars]` (except dev-only placeholders like `OPENWA_API_KEY`/`ADMIN_PASSWORD` which are marked DEV ONLY). **No hardcoded fallback secrets** — fail closed (503) when a required secret is missing.

---

## 3. Development & Testing Commands

```bash
cd C:\Opus OS
pnpm install --frozen-lockfile
pnpm typecheck          # tsc --noEmit across all workspaces
pnpm test               # vitest, 122+ tests
pnpm --filter app build
cd apps/api && pnpm run db:generate   # incremental Drizzle migration
```

---

## 4. The 4-Layer ACE Loop Framework Protocol

**Micro (2–10s):** after any edit → `pnpm test` → fix → retest.
**Meso (5–30min):** Plan-First (present plan + files before coding), Review-Diff (summarize + get approval), Checkpoint Commits.
**Macro (1–4h):** Spec-first; reset handoff file if context degrades; compound AGENTS.md.
**Meta:** continuously document.

---

## 5. Coding Conventions

- Explicit null for DB, undefined for optional frontend fields.
- Error shape `{ error: string, details?: any }`; zod 400s return `{ error, details }`.
- Migrations via `drizzle-kit`; never hand-write.
- No excessive comments; no new deps without approval.

---

## 6. Module Map (current state — what exists where)

### Auth gateway (`apps/api/src/routes/auth.ts`, `middleware/rbac.ts`, `lib/session.tsx`)
- Real accounts via Better Auth sign-up/sign-in; **staff created only by owner** (`POST /api/admin/register-staff` → routes through `auth.api.signUpEmail` to avoid scrypt drift).
- Bootstrap owner: `POST /api/auth/bootstrap-admin` (env ADMIN_EMAIL/ADMIN_PASSWORD) — **recreates** if none; owner logs in at `/login`.
- `GET /api/auth/me` session self-describe; `AuthGuard` protects workspace routes; nav shows live user chip; **no hardcoded `token-admin` cookies anywhere** (removed previously — re-check if re-added).
- 2FA: `src/components/TwoFactorSetup.tsx`, TOTP + backup codes. Uses `better-auth/crypto` hashPassword — mutate user through `auth.api` never manual hashes in prod paths.

### Funnel & marketing (`leads.ts`, `marketing.ts`, `nurture.ts`, `public.ts`)
- Public lead intake POST `/api/public/leads` (rate-limited, self-heals pipeline_stages, auto-scoring, SLA task, referral↔commission).
- `/api/marketing/funnel`, `/partners`, `/experiments`, `/stale/:id/reactivate`, `/nurture/plan|due|:id/send`.
- Artifact endpoints: `/api/public/jobs`, `/umrah/departures`, `/attestation/chains`, `/match/eligibility`.

### Umrah division (Phase 3 — COMPLETE 2026-08-14)
- **Inventory**: `umrah_packages` (60 cols: flight/hotels/visa/transport/duration/pricing/content; wholesale vs retail paise; `soloAvailable`+`soloSupplementPaise`; **family pricing** `childWithBedPricePaise`/`childNoBedPricePaise`/`infantPricePaise` — null = adult rate). Staff CRUD in `routes/umrah.ts`; client browse in `routes/portalUmrah.ts`.
- **Calendar**: `group_departures` (capacity 30, `packageId`, `endDate` for trip ranges, `departureCity`). Staff announce via calendar; client/partner see availability (aggregate only — who-booked is staff-only via manifest).
- **Booking model (party)**: one booking = one **party** (`paxCount` + `booking_passengers` rows: name/dob/passport/category/specialNeeds; passport masked at API boundary via `lib/umrahParty.ts`). ₹500×pax non-refundable advance → seats `held` → Razorpay order → `verify-advance` → `reserved` 3 days (`reserveHoldHours`=72) → balance online (`pay-balance`/`verify-balance`) or office (`confirm-office`). Pricing per person by category (adult / child_with_bed / child_no_bed / infant), solo supplement only for pax=1 & solo, **group discount wired** (`groupDiscountPct` ≥ `groupDiscountMinPax`). Capacity & advance scale by pax; self-heal releases pax-count seats (held>24h / reserved>72h, no cron). Waitlist = whole party when pax > available.
- **Coming Soon switch**: `app_settings` key `umrah_inventory_enabled` — gates client/partner surfaces until owner flips it.
- **Partner**: catalog `departure` (fixed) + `umrah_package` types; `/go` links; commission plans support `umrah_package`.
- **Frontend**: `UmrahCalendar.tsx` (reusable, staff/client/partner modes), `UmrahPortal.tsx` (Packages tab + calendar + party manifest w/ travellers + CSV), `UmrahClientSection.tsx` (browse→party builder→book→tracker), ClientPortal 🕋 tab.
- **Tests**: `umrahPackages.test.ts`, `umrahPortalBooking.test.ts` (incl. solo supplement), `umrahFamilyBooking.test.ts` (party pax/capacity/advance/child pricing/group discount/waitlist/masking). Plan: `docs/umrah-division-plan.md` §13.

### Messaging (OpenWA / Chatwoot / inbox)
- `src/infra/messaging.ts` — `sendWhatsApp` (OpenWA 0.14.2: `X-API-Key` + `/api/sessions/{id}/messages/send-text` with `{chatId, text}`; or Meta Cloud API).
- Webhooks: `/api/webhooks/wa` (HMAC-SHA256 body or plaintext secret header; both timing-safe), `/api/webhooks/chatwoot` → land in `conversations`.
- **Staff Inbox:** `GET /api/inbox`, `/api/inbox/:id/thread`, `POST /api/inbox/:id/reply` — frontend `apps/app/src/pages/Inbox.tsx` (route `/inbox`, staff only). Chatwoot widget mounts on public pages (`ChatWidget.tsx` — IMPORTANT: boot via `window.chatwootSDK.run({websiteToken, baseUrl})`; never reference `window.ChatwootSDK` capital).
- PENDING-CONFIGS: OpenWA webhook registration on VPS still 500s (session/webhook DB split); Cal.diy needs wizard click to finish SSG.

### ERPNext (back-office)
- `src/infra/erpnext.ts` (Frappe REST v2, `token api_key:secret` auth), `routes/erpnext.ts` (owner-only `/api/erpnext/*`: health, `payments/:id/sync`, sync-log, sync/pending retry).
- One-way sync payments→Sales Invoice, `erpnext_sync_log` table, migration `0015`.
- Env: ERPNEXT_BASE_URL/API_KEY/API_SECRET.

### Compliance / audit
- `auditLog` written everywhere critical: PAYMENT_ENTER, AGREEMENT_SIGNED, DOC_UPLOAD, STAFF_SCOPE_UPDATE, LEAD_CREATED, CONSENT_GRANTED, STAGE_CHANGE. Use `middleware/audit.ts` helpers (fail-open).
- Oracle VPS: everything bound to loopback/Tailscale only; DOCKER-USER chain drops public except SSH + tailscale0.

### Retro-Funnel front-end
- Hero carousel with 5 live artifacts; clay/glass design; GSAP via `src/lib/motion.ts` helpers.

---

## 6. Live List of Past Mistakes & Architectural Invariants

- **Provider drift:** never hash passwords manually in route/worker paths (`better-auth/crypto` `hashPassword` produced hashes that failed BetterAuth verify in Worker runtime — went through signUpEmail instead). In prod code, **staff/owner creation → `auth.api.signUpEmail()`**.
- **FK fresh-DB boot:** `engagements.stage_key → pipeline_stages.key`; empty stages breaks lead intake — always call `ensurePipelineStages(db)` before writing an engagement (self-heal exists in `leads.ts`).
- **`timestamp` mode columns** in D1 + Better Auth: users/sessions/accounts/verifications use `integer(... { mode: 'timestamp' })`, insert `new Date()` not epoch in app code.
- **Ownership/owner ceiling:** owner-only for `/api/admin/*` and `/api/infrastructure/*`; counselor blocked from payments/marketing/compliance/incentives. Don't loosen.
- **Public surfaces:** `/api/public/*` unrestricted; webhooks need secret/HMAC (403 if missing) — never plaintext compare.
- **Money:** amounts integer paise; GST split helper returns paise.
- **BELOW ALL:** if a change contradicts this file, the file wins until partner updates it.

---

## 7. Pending / Future Work (session index)

- **OpenWA webhook registration** (VPS) — check FK split sqlite (openwa.sqlite vs main.sqlite).
- **Cal.diy** wizard completion + booking URL in `VITE_BOOKING_URL`.
- **AI integration plan** — see `OPUSAI-INTEGRATION-PLAN.md` (not implemented).
- **CI**: `.github/workflows/ci.yml` runs typecheck+test+build on push.

*Doc updated 2026-08-08 (Meta loop).*