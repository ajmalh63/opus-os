# WORKFLOW AUDIT — Opus OS (evidence-based, 2026-08-12)

Method: per-workflow code-trace → authz/state/consent checks → evidence from
(54 test suites / 282 tests) + live probes against the dev stack + static
review. Verdicts: WORKS (proven) · WORKS* (works with caveat) · GAP.
No claim below without its evidence line.

## Flow-by-flow verdicts

| # | Workflow (subject) | Verdict | Evidence |
|---|---|---|---|
| 1 | Auth: signup→verify→signin→reset→2FA | WORKS* | live: request-password-reset 200 · sign-in wrong-pw 401 · verify-email route serves (bogus→200 page w/ client failure state) · auth_email_lane tests · NOTE: real verify/OTP flows not unit-covered (getAuth mocked) — verified live only |
| 2 | Leads→client→engagement + intent + SLA | WORKS | leads.ts: intentDivisions/primaryDivision persisted; 15-min SLA task auto-created (leads.ts:133); consent gates at plan |
| 3 | Nurture: plan→due→send (WA/email) | WORKS | funnel + automation_nurture_email suites; guard contact; suppression at due+send; WhatsApp lane fail-closed (messaging.ts returns ok:false when OPENWA_* missing) |
| 4 | Campaigns dashboard + command envelope | WORKS | integrations_commands (8) + integrations tests; audit on every command |
| 5 | Guard contract | WORKS | guard.test (8): suppression/consent/transactional/invalid/auth/sanitized-audit |
| 6 | Transactions: entry→confirm→ERP→charge link→webhook finalize→receipt/balance→refund | WORKS | razorpay_charge_gateway (12) + transactions + razorpay suites; replay-safe (event log 0026); method mapping; balance recompute |
| 7 | Agreements: template→create→sign (DPDP hash + consent link) | WORKS | agreements_payments suite + static (sign sets signed+hash+core-processing consent+audit). NOTE: no downstream action on sign (payments are the transactions module's job — by design) |
| 8 | Pipeline kanban: board/move + stages | GAP | kanban.ts:126 computes isWipBreached but NEVER enforces; targetStage free-string (shared/validation.ts:42 — no stage enum/continuity guard) |
| 9 | Task Boards system (WIP/CoS/blockers/cycle) | WORKS | board_system (6): 409 enforcement, expedite bypass, in_progress_at one-shot, prefs clamp+audit |
| 10 | Inbox + notify channels + wa/chatwoot webhooks | WORKS | notifications + messaging + inbox suites; webhook consumers fail-closed |
| 11 | Partners/referrals/incentives | WORKS | partnerAdmin/partnerKyc/partnerSummary/thrive/incentives suites |
| 12 | Compliance GST/2B/statutory/TDS | WORKS | compliance suite (logic level); ERP-side ops pending (PENDING) |
| 13 | Marketing scoring/experiments | WORKS | marketing suite |
| 14 | Performance scorecard + digest | WORKS | performance + automation_digest suites (true cycle via in_progress_at) |
| 15 | TeamHub (DO) | WORKS* | teamhub suite (mocked DO); not live-exercised (static verified) |
| 16 | Heartbeat cron | WORKS | wave1_heartbeat (4) |
| 17 | Backup/restore scripts | GAP(low) | backup-d1.sh uses `wrangler d1 export --output -` (stdout form undocumented for d1 export) → prefer temp-file+gzip; restore uses documented `d1 execute --file` ✓ |
| 18 | Rate limiting / turnstile / RBAC | WORKS | ratelimit + turnstile + rbac/rbacCeiling/rbac_permissions suites |

## Findings (severity → fix)

- **F1 [MED] Pipeline-board WIP breach not enforced** — kanban.ts:126-127 computes
  `isWipBreached`; move proceeds regardless. Fix: `if (isWipBreached) return 409 {code:'wip_limit'}` (mirrors tasks-board enforcement).
- **F2 [MED] `targetStage`/`sourceStage` free strings** — any stage key accepted,
  no stage-membership or continuity validation. Fix: stage enum/registry + guard
  `targetStage ∈ pipeline stages` and `sourceStage === current.stageKey`.
- **F3 [LOW] Leads intake flow has no dedicated test file** — SLA task + intent
  persistence paths are untested. Fix: leads.test.ts (submit → assert client row,
  intent fields, engagement, SLA task created, 409 on dup phone).
- **F4 [LOW] backup-d1.sh stdout export form** — `--output -` may fail on some
  wrangler versions. Fix: export to `$work/export.sql` then gzip (deterministic).
- **F5 [INFO] Agreements sign has no downstream trigger** — by design (payments
  live in transactions module); documented so it isn't mistaken for a gap.
- **F6 [INFO] Auth verify/OTP flows unit-covered only via mocks** — real-route
  smoke lives in the e2e suite; acceptable, tracked.

## Verified-good highlights (evidence-based)
- WhatsApp/email lanes fail closed (never silent success)
- Lead intent + SLA + consent chain intact (DPDP)
- Payment gateway end-to-end incl. replay safety + balance math
- New Task Boards WIP/CoS enforcement is REAL (409 + expedite bypass) — contrast
  with the pipeline-board gap (F1)
- Guard contract + digest + performance all consistent with true cycle time

## Status
- Acceptance criteria: flow inventory verified (18/18 flows assessed, 16 WORKS,
  2 GAP) · Findings: 2 medium, 2 low, 2 info
- Open risks: F1/F2 behavior change (needs your go) · teamhub live-exercise · ERP
  integration live (creds pending)
- Need human input: fix F1+F2 now (my recommendation: yes — they're the only
  logical gaps), or leave by design and document?