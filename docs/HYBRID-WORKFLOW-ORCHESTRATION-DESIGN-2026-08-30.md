# Hybrid Workflow Orchestration — Opus OS × Cloudflare Workflows
**Date:** 2026-08-30 | **Skills:** `workflow-orchestration-patterns`, `saga-orchestration`, `cloud-architect` (Temporal + Cloudflare Workflows GA) | **Research:** Temporal Durable Execution, Cloudflare Workflows Rules (2025 GA, `waitForEvent`), Saga/Compensation, Strangler Fig | **Status:** Design (ready to scaffold)

## 0. Gold Standard Verdict (Research 2026-08-30)

**Hybrid is the enterprise gold standard — not all-in-Opus, not all-in-Cloudflare.**
- **Temporal (July 2026):** *“Don’t build state machines from scratch — use Durable Execution. But don’t put everything in a workflow — simple services should stay services.”* Workflows = `step.do` for external calls, `step.sleep/waitForEvent` for human approvals, determinism + idempotency + retries. Simple CRUD → direct API.
- **Cloudflare Workflows GA (2025-04-07):** `step.do` (retryable), `step.sleep/sleepUntil` (days), `step.waitForEvent` (human/bot), state persisted per-step in SQLite-DO, CPU-only billing (waits free), `waitForEvent` replaces polling. Rules: **granular steps (1 binding/call per step), idempotent, no state outside steps, deterministic names, await every step.**
- **Strangler Fig (Fowler):** Keep Opus D1 as *System of Record* (ACID, RBAC, audit, DPDP), add Workflows as *System of Orchestration* that **calls Opus APIs** via `serviceTokenMiddleware`. Migrate incrementally, never big-bang delete.

**Your 0 Workflows today is an advantage** — you can design hybrid from scratch with zero legacy Workflows to migrate.

---

## 1. Decision Framework — Keep in Opus vs Move to Workflows

| Keep in Opus (in-app, D1 transaction) | Move to Cloudflare Workflows (durable) |
|---|---|
| **Synchronous 2-5 state, <1min, ACID + audit:** Kanban `board/move` WIP check, `engagements` lifecycle, `payments` paise/GST, `documents` R2 presign | **Long-running per-entity (hours→days), cross-system, sleep/wait:** Nurture per-student `sleepUntil(offerDeadline)`, Visa deadline cascade, Tours 72h hold + refund, Attestation chain, Manpower 6-country pipeline |
| **RBAC + DPDP + hash-chain critical:** every write must be `auditEvent` + `redactPayload` | **Needs automatic retry + backoff + exactly-once:** embassy portal flakey, Wafid poll, India Post tracking |
| **Cost-free, `pnpm test 730` deterministic** | **Costs per step+CPU+storage (1GB free till 2025-09-15)**, but eliminates 5 Cron scans |

**Rule:** If it needs `sleepUntil` >5m, `waitForEvent` (human/webhook), or retries across services → **Workflow**. If it needs ACID + immediate `403`/`200` → **Opus**.

---

## 2. Architecture — Hybrid Strangler

```
Opus D1 (System of Record) ──always source of truth──
  ↑ D1 ACID + audit_log GENESIS + RBAC + DPDP consent
  │ (no Workflow ever writes business data directly)
Hono API (Opus) — System of Engagement
  ↑ serviceTokenMiddleware (HMAC, fail-closed) + isRateLimited per-entity
  │  POST /api/workflows/nurture/start  → creates Workflow instance per clientId
  │  POST /api/workflows/nurture/event  → staff clicks “Accepted” → step.waitForEvent
Cloudflare Workflows (System of Orchestration) — 5 Workflows, one per use case
  step.do("d1-insert", {retries: 3}) → step.sleepUntil → step.waitForEvent → step.do("notify via infra/notify")
  └── infra/notify.ts (Listmonk/Titan + OpenWA) — single notification spine, DPDP-gated
```

**Data flow:** Workflow **never** bypasses Opus. It calls Opus service endpoint with `Authorization: Bearer <WORKFLOWS_SERVICE_TOKEN>` (stored `wrangler secret put WORKFLOWS_SERVICE_TOKEN`). Opus does the D1 write + audit + SyncHub `publish` → portal sees it via existing 20-channel `SyncHub` (no second pub/sub).

**Observability:** Workflow per-instance logs + `audit_log` rows → single `opuso-ops` Grafana (existing `runtimeLogs` + Workflows dashboard). Versioning via `workflow.get_version()` or new Workflow type for breaking changes.

---

## 3. Per-Workflow Brainstorm (3 ideas → Chosen Hybrid)

### 3.1 Study Abroad Offer Nurture — *replaces `workflowExpiry.ts` + 6h Cron + nurture loop*

| Idea | Pros | Cons |
|---|---|---|
| A) **Keep Cron** (current) — scan `study_abroad_applications` daily, send due touches | Simple, already works | Polls 500 students daily, misses exact deadline, no human wait |
| B) **All-in-Workflow** — Workflow owns DB | Durable sleep exact | Loses Opus audit/RBAC, vendor lock |
| **C) Hybrid (chosen)** — Workflow per *student* orchestrates, Opus owns D1 | Event-driven per-student `sleepUntil(offer.acceptanceDeadline)`, `waitForEvent("offer-decision")` from staff portal, idempotent `enroll` | Requires service token, but keeps audit |

**Design:**
```ts
export class NurtureWorkflow {
  async run(event: {clientId, offerDeadline}, step) {
    await step.do("create 14d follow-up task", () => callOpus("/api/tasks", {clientId: event.clientId, title: "Decision follow-up"}), {retries: {limit:3, delay: "5s", backoff:"exponential"}});
    await step.sleepUntil("until deadline", event.offerDeadline); // durable, no Cron
    await step.do("nudge deposit", () => callOpus("/api/notify", {to: event.clientId, channel:"whatsapp", template:"deposit_reminder"}));
    const decision = await step.waitForEvent("offer-decision", {timeout: "14 days"}); // staff clicks Accepted/Declined in StudyAbroadPortal
    if (decision.type === "accepted") await step.do("create visa prep task", () => callOpus("/api/tasks", {title:"Visa prep"}));
  }
}
```
**Saga compensation:** If `nudge` fails, no compensating needed (idempotent notify). If student withdraws, Workflow receives `withdraw` event → `compensate` deletes pending tasks.

### 3.2 Visa Deadline Cascade (V1-V7) — *replaces daily `visa_deadlines` scan*

**Idea C hybrid:** Per-booking Workflow: `biometricsAt → sleepUntil → step.do("mark overdue + audit") → waitForEvent("biometricsMet") → medicalAt …` Auto-overdue flag replaces batch `SELECT dueAt`.

### 3.3 Tours/Umrah 72h Hold — *replaces self-heal hold*

**Idea C:** `create Razorpay link (paise)` → `waitForEvent("payment.captured", timeout 72h)` → if captured → `bookedSeats++` + `audit`; else `release + refund paise` with `step.do` retries (exactly-once via idempotency key `bookingId`).

### 3.4 Attestation Chain (HRD→MEA→Embassy) — *each courier hop*

`step.do("dispatch to HRD") → step.sleep("2 days") → step.do("poll DTDC") → step.sleep → waitForEvent("delivery-proof" from India Post webhook)`. Staff sees timeline; client sees masked status.

### 3.5 Manpower 6-Country Pipeline — *new `manpower_workflows` table*

Per-candidate Workflow walks `manpower_workflows.stagesJson` for `country` (e.g., `qatar: ["sourcing","qvc","moi","deployment"]`). Each stage `waitForEvent("gamca-fit")` from Wafid poll activity (not Cron). **Blind-bridge** preserved because Workflow calls Opus `POST /api/employer-demands/:id` which masks rate.

---

## 4. Implementation Blueprint — Strangler Fig (Additive, 0 Deletion)

**Phase 0 — Scaffolding (1 day, no business impact):**
- `wrangler.toml`: `[[workflows]] name="opus-nurture" class_name="NurtureWorkflow"` ×5 (nurture, visa, tours, attestation, manpower) + `WORKFLOWS_SERVICE_TOKEN` secret (`wrangler secret put`)
- `apps/api/src/workflows/nurture.ts` (and 4 siblings) — 30 lines each, `step.do` idempotent + `step.sleepUntil` + `waitForEvent`
- `apps/api/src/routes/workflows.ts` — `POST /api/workflows/:name/start` + `POST /:name/event/:type` (serviceTokenMiddleware, not RBAC — machine lane) → `await env.WORKFLOWS.create(instanceId, payload)`
- `app_settings` flag `workflows_enabled = "nurture,visa"` (feature flag) — existing Cron stays until flag proves 30 days.

**Phase 1 — Nurture + Visa (Week 1, highest ROI):**
- Keep `workflowExpiry.ts` + `nurture` Cron as **fallback** (if Workflows fail-closed, Cron still runs). Gate new instances: `if (await getAppSetting("workflows_enabled").includes("nurture")) createWorkflow else enqueueLegacy`.
- Frontend: no change — staff already clicks “Accepted” in `StudyAbroadPortal`; we just add `POST /workflows/nurture/event/offer-decision` in that click handler.

**Phase 2 — Tours + Attestation (Week 2):**
- Replace self-heal `reservedUntil` check with `waitForEvent("payment.captured")` + auto-compensation refund.

**Phase 3 — Retire Crons (Week 4, after 30d Workflows success):**
- Delete `cron/workflowExpiry.ts` 6h poll and reduce `triggers.crons` from 5 to 3.

**Idempotency & Safety (Workflows Rules):**
- Every `step.do` uses deterministic name (`"create task ${clientId}"`) + idempotency key `bookingId`/`clientId` (D1 unique constraint).
- No `Date.now()`/`Math.random()` outside steps — use `step.sleepUntil` deterministic.
- `step.do` returns <1MiB; large doc → store R2 key, pass reference.
- Versioning: `workflow.get_version("v2")` for breaking change, or new workflow name `opus-nurture-v2`.

**Testing:**
- `pnpm test` → add `workflows/nurture.test.ts` (time-skipping: `workflow.sleepUntil` mocked, `waitForEvent` signaled, D1 + audit asserted) — keeps 730→750 green.
- `wrangler dev --local` → Workflows run in workerd with SQLite.

**Observability:**
- Workflows dashboard: per-instance logs, retries, sleeps. Plus `runtimeLogs` table already in Opus → single Grafana.

---

## 5. Cost & Risk

- **Cost:** Workflows CPU per step ~5ms (waits free), storage 1GB free till 2025-09-15, then ~$5/GB. Your 5 Crons currently burn 5 invocations/day scanning 500 rows each; Workflows burn ~1 invocation per student + sleeps (cheaper at scale, exact).
- **Risk if all-in-Cloudflare (not hybrid):** lose `audit_log` chain of custody, DPDP consent gating in `consents`, RBAC division scoping — all must be reimplemented in Workflows (anti-pattern). Hybrid keeps them in Opus.
- **Rollback:** `workflows_enabled` flag → `false` instantly reverts to Cron ( <1 min ), no migration.

---

## 6. Roadmap — To 10/10

| Week | Deliverable | Verification |
|---|---|---|
| 1 | Scaffolding + Nurture + Visa Workflows (hybrid) | `pnpm test 750`, `instances` dashboard shows sleeps, Cron still runs as fallback |
| 2 | Tours + Attestation Workflows | `72h hold` via `waitForEvent`, refund idempotent, courier poll via `step.do` |
| 3 | Manpower 6-country + blind-bridge | `manpower_workflows` seeded, per-candidate Workflow walks country stages |
| 4 | Retire Crons, add Grafana `workflow_success` SLO | 0 Cron for these flows, `typecheck 0`, `build` clean |

---

**Next step:** Reply `scaffold hybrid workflows` and I’ll create `apps/api/src/workflows/*` + `wrangler.toml` workflows + `routes/workflows.ts` + feature flag — additive, no deletion, staff-only HITL preserved, client portal still thin.
