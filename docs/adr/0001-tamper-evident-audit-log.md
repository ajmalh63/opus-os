# ADR-0001: Tamper-Evident Audit Log

## Status

Accepted (2026-08-17)

## Context

OpusOS audits via a D1 `audit_log` table — 94+ `auditEvent` call sites across 33 files, ~40 action
types, fail-open writes, super_admin-only viewer (`/control?tab=audit`). The 2026-08-17 gap analysis
against OWASP APTS AR-010/AR-012/AR-015 and SOC 2 TSC CC6.1/CC7.2/CC7.3/CC8.1 found the system
cannot:

- **prove tamper-evidence** — a DBA with D1 access can edit `audit_log` undetectably (APTS-AR-012);
- **log failures/denials** — no rows for 403s, failed HMAC/payment-verification (SOC 2 CC6.1);
- **classify events** — no category / actor_type / result / data_classification fields (OCSF);
- **guarantee PII redaction** in payloads (APTS-AR-015, GDPR/DPDP minimization);
- **retain & archive** — unbounded D1 growth, no WORM archive, no auditor evidence packages (SOC 2);
- **verify chain integrity** — no tooling existed to detect modification/deletion/reordering.

Owner decisions made 2026-08-17 (owner deferred mechanics to engineering; approved retention and
rate-limit caps): 7-year R2 archive + 15-month D1 hot window, archive job now + Object Lock at
production, denial caps 20/hr and 10/hr, 11-category taxonomy.

## Decision Drivers

* **Must** detect tampering with audit rows (APTS-AR-012) — append-only log, hash-chained, verified periodically.
* **Must** log failed auth/access attempts (SOC 2 CC6.1) without enabling scanner-driven log floods.
* **Must** retain 15 months min (SOC 2 Type II window + buffer) and ~7 years archive (Indian GST/Income-tax norms).
* **Must** redact PII at the write boundary — payloads are evidence, not data stores.
* **Must not** break existing action strings, UI filters, tests, or historical rows.
* **Should** run identically in local dev (`wrangler dev`) and prod Workers — one code path.
* **Should** reuse existing infra (rate limiter, staff alerts, notify/Telegram, R2) — no new services.

## Considered Options

### Option A — D1 triggers compute the hash
- **Pros:** enforced at the database layer; zero per-write code.
- **Cons:** D1 trigger support in migrations is unreliable (error 7500, multiline failures — verified via Cloudflare community/issue tracker); behavior differs between local and prod bindings; a failed trigger can silently skip rows and orphan the chain. **REJECTED.**

### Option B — Hash chaining in code at the write boundary (chosen)
- `record_hash = SHA-256(prev_hash + canonicalize(event))` computed in `middleware/audit.ts`;
  `prev_hash` read from the last row (indexed `created_at`); genesis row uses `'GENESIS'`.
- **Pros:** portable, deterministic, unit-testable (genesis/continuity/tamper/deletion cases);
  identical in dev and prod; composes with the existing fail-open write path.
- **Cons:** relies on code convention that no UPDATE/DELETE ever runs (already true; the chain
  verifier detects any violation).

### Option C — Full taxonomy rewrite (pure OCSF event classes / renamed actions)
- **Pros:** cleanest schema end-state.
- **Cons:** breaks UI filters, tests, and all historical rows for marginal queryability gain.
  **REJECTED** — keep `action` as the human-readable verb; add OCSF-aligned structured columns.

### Option D — Unbounded failure/denial logging
- **Cons:** scanner floods would bloat D1 and drown real signals. **REJECTED** — bounded buckets.

### Option E — D1-only retention
- **Cons:** unbounded growth, no WORM guarantee, no auditor-facing evidence package.
  **REJECTED** — tiered storage (hot D1 + cold R2 + export).

## Decision

1. **Tamper-evidence:** SHA-256 hash chaining computed **in code at the write boundary**
   (`middleware/audit.ts`), not via D1 triggers. Genesis row: `prev_hash = 'GENESIS'`.
   Append-only enforced by convention (no UPDATE/DELETE on `audit_log` anywhere) + chain verifier;
   optional hardening via a single-line `RAISE(ABORT)` trigger applied with
   `wrangler d1 execute --command` at prod bootstrap (never inside migration files).
2. **Schema:** keep existing UPPER_SNAKE action strings; add OCSF-aligned metadata columns —
   `category` (11: auth/access/money/compliance/document/lead/partner/config/communication/workflow/system),
   `actor_type` (user/system/partner/service/public), `result` (success/denied/error),
   `auth_method`, `data_classification` (public/internal/confidential/restricted),
   `request_id` (cf-ray-derived), `schema_version` (1.1), `prev_hash`, `record_hash`.
3. **Bounded failure logging:** RBAC 401/403 exits → `ACCESS_DENIED` (result denied, category
   access), bounded **20/hr per (identity, action)**; webhook HMAC/secret failures →
   `WEBHOOK_REJECTED` (actor service); failed payment verification → `PAYMENT_VERIFY_FAILED` /
   `UMRAH_ADVANCE_VERIFY_FAILED` / `UMRAH_BALANCE_VERIFY_FAILED` (category money) — all bounded
   **10/hr per bucket**. Bounding reuses the extracted `isRateLimited` core counter in
   `middleware/rateLimit.ts`.
4. **PII redaction at write boundary:** shared `redactPayload()` helper strips or `[REDACTED]`s
   known sensitive keys (`password`, `apiToken`, `bankAccount`, `passportNumber`, `sha256Hash`,
   `secret`, `token`, `panNumber` full value — keep last-4) from before/after state before
   serialization.
5. **Tiered retention:** D1 hot window 15 months. Monthly cron (`cron/auditArchive.ts`) exports
   rows to R2 `audit-archive/YYYY-MM.jsonl` with a signed manifest (chain-head hash + row count +
   file SHA-256). R2 bucket uses **Object Lock compliance mode (WORM)** for the retention period
   (set at bucket creation on the real CF account). `GET /api/admin/audit/export?from&to&format=csv|json`
   (super_admin only) produces auditor evidence packages (rows + chain-verification report).
6. **Verification:** weekly chain-verify cron → staff alert (Telegram, reuses OPS_TELEGRAM_CHAT_ID)
   on break; on-demand runs; verification report included in every evidence export. Anomaly alerts
   on denied-access spikes and audit-write failure rates (reuse `infra/staffAlerts.ts`).
7. **CI gate:** `node scripts/audit-chain-verify.mjs --self-test` in `.github/workflows/ci.yml` —
   a regression that breaks chaining fails the pipeline.

## Rationale

- Code-level chaining is the only option reliable across local and prod D1 (triggers fail in
  migrations with error 7500), testable, and portable — it strengthens the existing fail-open
  write path instead of fighting it (APTS-AR-012).
- Additive columns preserve every existing consumer (UI filters, tests, historical rows) while
  delivering OCSF-grade queryability — filter by category/result/actor_type without a rewrite.
- Bounds satisfy SOC 2 CC6.1 ("log failed auth/access attempts") without scanner-flood risk;
  caps explicitly approved by the owner.
- Redaction at the write boundary implements data minimization at the point of record creation —
  audit payloads become evidence, not data stores (APTS-AR-015, DPDP).
- 15-month hot + 7-year WORM matches SOC 2 Type II observation window and Indian tax record norms;
  R2 cost is negligible at this volume (~$0.015/GB/mo).
- Periodic verification is what makes the tamper-evidence claim auditable (APTS-AR-012:
  "verify chain integrity weekly and on archive").

## Consequences

### Positive
- Tampered/deleted/reordered rows are detectable with first-break index; reports are evidence-grade.
- Compliance claims (SOC 2 CC6.1/CC7.2/CC7.3/CC8.1, OWASP APTS) become demonstrable, not asserted.
- Failures/denials are queryable by category/result/actor for anomaly analysis.
- Auditors receive a self-contained export package (rows + chain report) — no D1 access needed.
- No breaking change to existing action strings, UI, tests, or history.

### Negative
- Each audit write now costs an extra chain-head read + SHA-256 (~µs at this volume; lookup is
  indexed on `created_at`).
- Append-only is convention-enforced in code: a future UPDATE/DELETE is *detected* (verifier/CI)
  but not *prevented* at the DB layer until the RAISE(ABORT) trigger is applied at prod.
- Pre-0071 rows need the idempotent backfill script before verification passes end-to-end.
- WORM must be enabled at bucket creation on the prod CF account — cannot be turned on later.

### Risks
- A write path bypassing `middleware/audit.ts` would produce a chain gap — mitigated by the CI
  self-test gate and weekly verification surfacing the first-break index.
- Rate-limit buckets may drop legitimate events during a genuine burst — accepted; caps approved
  by owner (20/hr denials, 10/hr webhook/verify per bucket).

## Implementation Notes

- Migration `0071_chief_reavers.sql` (drizzle-kit generated; standalone sqlite indexes
  `audit_log_created_idx` / `audit_log_category_idx` appended manually — drizzle-kit 0.31 does
  not emit them; documented in the migration).
- `middleware/audit.ts`: `canonicalize()` (sorted keys, stable JSON), `getChainHead()` (fallback
  `'GENESIS'`), `redactPayload()`, `resolveActor()` (actor_type from session / partner route
  hint / automation lane / cron), `requestId` from cf-ray.
- `scripts/audit-chain-verify.mjs` — CLI + importable by tests, `--self-test` wired into CI.
- `scripts/backfill-audit-chain.mjs` — idempotent backfill for pre-0071 rows (see runbook in the
  design doc).
- Crons (being wired): monthly R2 archive, weekly chain verify, anomaly alerts.
- Admin surfaces (pending): `GET /api/admin/audit/export`; AdminConsole Security Logs tab
  (category/result/actor_type chips + filter + "Verify chain" owner-only button).
- Full design + rollout runbook: `docs/audit-logging-gold-standard.md` (phases 1–2 IMPLEMENTED,
  3–5 pending). Conflict rule: where the design doc disagrees with `AGENTS.md`, AGENTS.md wins.

## Related Decisions

- `docs/audit-logging-gold-standard.md` — the full design this ADR summarizes (ADR-form per Phase 5 §15).
- `AGENTS.md` — Module Map ("Compliance / audit") and invariants list updated in-step (2026-08-17).
- Deferred (out of scope): RFC 3161 trusted timestamps (APTS-AR-013), per-row Ed25519 signatures,
  OpenTelemetry audit export, SIEM ingestion — revisit at Cloudflare production phase.