# OpusOS — Gold-Standard Audit Logging Design

> **Status:** Phases 1–5 IMPLEMENTED (2026-08-17) — complete
> **Date:** 2026-08-17
> **Basis:** OWASP APTS AR-010/AR-012/AR-015 · SOC 2 TSC CC6.1/CC7.2/CC7.3/CC8.1 · OCSF (Open Cybersecurity Schema Framework) · GitLab audit-event schema · Cloudflare Workers observability stack (Logpush / R2 Object Lock / Analytics Engine)
> **Conflict rule:** where this doc disagrees with `AGENTS.md`, AGENTS.md wins until the owner updates it.

---

## 1. Why this design exists

OpusOS already has a solid audit foundation: `audit_log` D1 table, 94+ `auditEvent` call sites across 33 files, ~40 action types, fail-open writes, super_admin-only viewer (`/control?tab=audit`). The gap analysis (2026-08-17) found and fixed 11 missing audit sites (incentives, partner KYC/referrals, payout requests, auth bootstrap, 2FA enable/disable, cron nurture dispatch).

What the current system **cannot** yet do — and what industry gold standards require:

| Gap | Standard |
|---|---|
| No tamper-evidence — a DBA with D1 access can edit `audit_log` undetectably | OWASP APTS-AR-012: hash-chained append-only log, verify weekly |
| No failure/denied-event logging (403s, failed verifications) | SOC 2 CC6.1: log failed auth/access attempts |
| No actor-type taxonomy (user/system/partner/service) | OCSF `actor.type`; SOC 2 "service accounts map to owning teams" |
| No result/outcome field (success/denied/error) | OCSF `outcome`; SOC 2 mandatory field set |
| No data-classification on events | OCSF `data_classification`; APTS-AR-015 evidence classification |
| No PII redaction guarantee in payloads | APTS-AR-015; GDPR/DPDP data minimization |
| No retention/archive (D1 grows unbounded; no evidence export) | SOC 2: 15-month minimum (Type II window + buffer); tiered storage |
| No chain-integrity verification tooling | APTS-AR-012: "verify chain integrity weekly and on archive" |
| No correlation id (request_id) across logs | OpenTelemetry trace correlation |

---

## 2. Design decisions (ADR-style)

### D1. Tamper-evidence = SHA-256 hash chaining (in-code), not DB triggers
- **Decision:** `record_hash = SHA-256(prev_hash + canonical(event))` computed in `middleware/audit.ts` at write time; `prev_hash` read from the last row (indexed `created_at`). Genesis row uses `prev_hash = 'GENESIS'`.
- **Why not D1 triggers:** D1 trigger support in migrations is unreliable (error 7500, multiline failures — verified via Cloudflare community/issue tracker). Code-level chaining is portable, testable, and works identically in local dev and prod.
- **Append-only enforcement:** code convention (no UPDATE/DELETE on `audit_log` anywhere — already true) + `scripts/verify-audit-chain.mjs` that detects modification/deletion/reordering. Optional hardening: single-line `CREATE TRIGGER ... RAISE(ABORT)` applied via `wrangler d1 execute --command` (not in migration files).

### D2. Keep existing action strings; add structured metadata columns
- **Decision:** keep the existing UPPER_SNAKE action taxonomy (e.g. `PAYMENT_ENTER`, `AGREEMENT_SIGNED`) — renaming would break UI filters, tests, and historical data. Add: `category` (auth/access/money/compliance/document/lead/partner/config/communication), `actor_type` (user/system/partner/service), `result` (success/denied/error), `auth_method`, `data_classification`, `request_id`, `schema_version`, `prev_hash`, `record_hash`.
- **Why:** OCSF-style structured fields give queryability (filter by category/result) without a disruptive taxonomy rewrite. The action string remains the human-readable verb.

### D3. Log failures and denials (bounded)
- **Decision:** audit denied access (RBAC 403s) and failed security events (HMAC failures, failed payment verification, failed 2FA) as `result: 'denied'|'error'` events.
- **Bounding:** denial events are rate-limited (e.g. 20/hr per actor+route bucket) to prevent log flooding from scanners — reuses `middleware/rateLimit.ts`.

### D4. PII redaction at the write boundary
- **Decision:** `auditEvent`/`auditSystem` accept a `redactKeys` hint; a shared `redactPayload()` helper (in `middleware/audit.ts`) strips/`[REDACTED]`s known sensitive keys (`password`, `apiToken`, `bankAccount`, `passportNumber`, `sha256Hash`, `secret`, `token`, `panNumber` full value — keep last-4) from before/after state before serialization.
- **Why:** APTS-AR-015 + DPDP data minimization; audit payloads are evidence, not data stores.

### D5. Retention: hot D1 + cold R2 (WORM) + evidence export
- **Decision:** D1 keeps the queryable window (target 15 months). A monthly cron job exports `audit_log` rows to R2 (`audit-archive/YYYY-MM.jsonl`) with a signed manifest (chain head hash + row count + SHA-256 of the file). R2 bucket uses **Object Lock compliance mode** (WORM) for the retention period. `GET /api/admin/audit/export?from&to&format=csv|json` produces auditor evidence packages (rows + chain-verification report).
- **Why:** SOC 2 retention (observation window + buffer), tiered storage pattern, and the pending F2 item (D1→R2 export) gets a concrete first consumer.

### D6. Chain verification: weekly cron + on-demand + export-time
- **Decision:** `scripts/verify-audit-chain.mjs` (runs against `wrangler d1 export` or the D1 HTTP API) walks the chain, recomputes hashes, reports first-break index + reason. Wired to: (a) weekly cron → Telegram/staff alert on break, (b) evidence export (included in the package), (c) manual run.
- **Why:** APTS-AR-012 explicitly requires periodic verification; the most common failure mode is chain gaps from operational discontinuity.

### D7. Correlation: request_id
- **Decision:** `middleware/audit.ts` derives `request_id` from `cf-ray` header (or generates one per request) and stamps audit rows + `runtime_logs` rows so an investigation can join audit → runtime → notifications for one request.

---

## 3. Target schema (migration sketch — generated via drizzle-kit, never hand-written)

```ts
// additions to audit_log (existing columns untouched)
category: text('category'),            // auth|access|money|compliance|document|lead|partner|config|communication
actorType: text('actor_type'),         // user|system|partner|service
result: text('result'),                // success|denied|error
authMethod: text('auth_method'),       // session|partner_token|service_token|none
dataClassification: text('data_classification'), // public|internal|confidential|restricted
requestId: text('request_id'),
schemaVersion: text('schema_version').notNull().default('1.1'),
prevHash: text('prev_hash'),
recordHash: text('record_hash'),
```

Index: `CREATE INDEX idx_audit_log_created ON audit_log(created_at)` (chain head lookup) + `idx_audit_log_category` (filtering).

---

## 4. Implementation phases (each phase = tests green + typecheck + build)

### Phase 1 — Integrity core ✅ IMPLEMENTED (2026-08-17)
- Migration `0071_chief_reavers.sql`: v1.1 columns + `audit_log_created_idx` / `audit_log_category_idx`
  (note: drizzle-kit 0.31 does not emit standalone sqlite indexes — appended manually, documented in the migration).
- `middleware/audit.ts`: SHA-256 hash chaining (`record_hash = SHA-256(prev_hash + canonicalize(payload))`,
  `prev_hash='GENESIS'`), PII redaction (`redactPayload`), category taxonomy (`categoryForAction`),
  `actorType` (user/system/partner/service/public), `result`, `authMethod`, `requestId` (cf-ray), `schemaVersion` 1.1.
  Call sites upgraded with actor hints: partner referral/payout (`partner`), automation lane (`service`), cron (`system`).
- `scripts/audit-chain-verify.mjs` — chain verifier (CLI + importable by tests) with `--self-test`.
- `scripts/backfill-audit-chain.mjs` — one-time backfill for pre-0071 rows (idempotent; run per §Runbook below).
- Tests `tests/auditChain.test.ts` (7): genesis, continuity, tamper detection, deletion detection,
  redaction, category taxonomy, system actor. Mock D1 gained ORDER BY/LIMIT support (exposed + fixed a stale inbox ordering assertion).
- CI gate: `node scripts/audit-chain-verify.mjs --self-test` in `.github/workflows/ci.yml`.
- **451 tests green · typecheck clean · app build clean.**

### Phase 2 — Failure & denial logging ✅ IMPLEMENTED (2026-08-17) — SOC 2 CC6.1
- `middleware/rbac.ts`: every 401/403 exit writes `ACCESS_DENIED` (result `denied`, category `access`,
  actor from session or null) — bounded 20/hr per (identity, action) via `auditBounded`.
- Webhook verifiers (razorpay, cal, wa, chatwoot, listmonk): HMAC/secret failure → `WEBHOOK_REJECTED`
  (result `error`, actorType `service`, authMethod `hmac`/`secret`) — bounded 10/hr.
- Payment verification: razorpay `/verify` → `PAYMENT_VERIFY_FAILED`; umrah `verify-advance`/`verify-balance`
  → `UMRAH_ADVANCE_VERIFY_FAILED` / `UMRAH_BALANCE_VERIFY_FAILED` (category `money`) — bounded 10/hr.
- `middleware/rateLimit.ts`: extracted `isRateLimited(env, rule, identity)` core counter (middleware
  behavior unchanged — headers preserved); `auditBounded` in audit.ts reuses it.
- Auth hardening (2026-08-17): sign-in intercept adds `LOGIN_FAILED` (bounded, category auth) on every
  failed attempt + `LOGIN_SUCCESS` (super_admin only) — account lockout (5 fails/15 min per email,
  `clearRateLimit` on success) and enforced 2FA onboarding for super_admin (see authSecurity tests).
- Tests `tests/auditDenied.test.ts` (8): 403 actor, 401 null-actor, 20/hr bounding, razorpay webhook,
  razorpay verify, umrah advance, listmonk, wa. Fixed stale admin.test.ts positional assertion
  (real ACCESS_DENIED rows now sort above the seeded row — presence asserted instead).
- **459 tests green · typecheck clean · app build clean.**

### Phase 3 — Retention, archive & evidence export ✅ IMPLEMENTED (2026-08-17)
- `GET /api/admin/audit/verify-chain` — server-side chain verification (TS lib `src/lib/auditChain.ts`,
  parity-tested against the .mjs CLI verifier via `tests/auditChainParity.test.ts`).
- `GET /api/admin/audit/export?from&to&format=csv|json` — evidence packages: JSON `{logs, chain}` or
  RFC-4180 CSV with trailing chain verdict; super_admin only.
- `cron/auditArchive.ts` — monthly JSONL export to R2 (`audit-archive/YYYY-MM.jsonl`) + signed manifest
  (`{month, exportedAt, rowCount, chainHead, fileSha256}`), idempotent via `app_settings.audit_archive_last_month`.
- Tests `tests/auditExport.test.ts` (18). Wired into the scheduled handler (cron `0 3 1 * *`).

### Phase 4 — Monitoring & alerting ✅ IMPLEMENTED (2026-08-17)
- `cron/auditMonitor.ts` — weekly (cron `0 4 * * 1`): chain integrity (alert if broken, urgent staff
  alert + Telegram), denied-access spike (>50/hr → alert), audit-write failures (>10/day via new
  `audit.write` runtime log in `middleware/audit.ts` catch path). Fail-open throughout.
- Tests `tests/auditMonitor.test.ts` (8). Alerts reuse `infra/notify.ts` (telegram) + `infra/staffAlerts.ts`.

### Phase 5 — Docs & UI ✅ IMPLEMENTED (2026-08-17)
- ADR: `docs/adr/0001-tamper-evident-audit-log.md` (MADR) + `docs/adr/README.md` index.
- UI (`AdminConsole.tsx`): v1.1 fields in the log table, Category/Actor-type/Result filter dropdowns,
  result chips (success/error/denied), **Verify Chain** button with inline verdict, **Export CSV** button
  (fetch-with-AUTH → blob download, codebase pattern).
- `AGENTS.md`: audit section rewritten (3 bullets) + new invariant ("Audit integrity: append-only +
  hash-chained — never UPDATE/DELETE; verify with scripts/audit-chain-verify.mjs").
- **488 tests green (77 files) · typecheck clean · app build clean · verifier self-test green.**

### Phase 5 — Remaining follow-ups (out of scope, noted)
- `scripts/mojibake-gate.mjs` hardcodes `C:\Opus OS` (Windows canonical path) — fails on any non-Windows
  box, including GitHub Actions CI. Pre-existing; should take the repo root as an argument.

---

## 5. Test & verification plan (per phase)

- TDD: write failing tests first per phase (repo convention — 77 test files, 488 green).
- `pnpm --filter api test` (targeted files) + `pnpm -r typecheck` + `pnpm --filter app build` after each phase.
- Chain verifier self-test: `node scripts/audit-chain-verify.mjs --self-test` (builds a known chain, tampers, asserts detection).
- CI: `verify-audit-chain --self-test` gate in `.github/workflows/ci.yml` (added Phase 1).

---

## 6. Out of scope (deferred)

- RFC 3161 trusted timestamps (APTS-AR-013) — needs an accredited TSA; revisit at Cloudflare production phase.
- Per-row digital signatures (Ed25519) — key management on Workers; hash chaining covers the integrity bar for this stage.
- OpenTelemetry export of audit events — revisit when the OTLP pipeline (Logpush/OTel) is configured at production phase.
- SIEM ingestion — no SIEM in the stack today; R2 archive is the long-term store.

---

## 7. Owner decisions (made 2026-08-17 — owner deferred to engineering judgment)

1. **Retention: 7 years** archive (R2, WORM) + 15-month D1 hot window. Matches Indian tax record norms
   (GST/Income-tax 6–8 years); R2 cost is negligible at this volume (~$0.015/GB/mo).
2. **Archive job now, Object Lock at production** — the job is account-independent; WORM is a
   bucket-creation flag on the real CF account (create `opusos-audit` with Object Lock compliance mode).
3. **Denial-logging caps approved:** 20/hr/actor+route for ACCESS_DENIED, 10/hr/bucket for webhook failures.
4. **Taxonomy: 11 categories** — auth, access, money, compliance, document, lead, partner, config,
   communication, **workflow** (division state machines), **system** (cron/archive).

## 8. Runbook — Phase 1 rollout (prod)

1. Apply migration: `pnpm --filter api db:migrate` (or `wrangler d1 migrations apply opusos-db`).
2. Backfill existing rows: `wrangler d1 export opusos-db --table audit_log --output audit.json` →
   `node scripts/backfill-audit-chain.mjs audit.json` → `wrangler d1 execute opusos-db --file audit-backfilled.sql`.
3. Verify: `wrangler d1 export opusos-db --table audit_log --output audit-now.json` →
   `node scripts/audit-chain-verify.mjs audit-now.json` → expect `✓ chain valid`.
4. Schedule weekly verification (Phase 4 wires the alert; until then run manually or via n8n).