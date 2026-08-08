# OpusAI — Cloudflare AI Integration Blueprint

> **Status:** Proposed · Target: employee-facing AI across all 5 divisions
> **Owner:** Opus Overseas Engineering (Dev)
> **Version:** v1.0 · Date: 2026-08-08

---

## 0. Objective

Give every OpusOverseas employee an AI co-worker that works *inside* OpusOS —
per-division assistants that draft, extract, classify, match and answer — while
respecting three hard rules: (a) Cloudflare Workers **10 ms CPU budget**
(heavy work goes through Queues), (b) **integer money** untouched by AI, and
(c) **no hallucination liability** — every AI output is a draft the staff
member approves before it becomes data or is sent.

## 1. Foundation (prerequisite to everything)

| Piece | Detail | Files |
|---|---|---|
| **Workers AI binding** | `[ai] binding = "AI"` in `wrangler.toml` (plus dev/preview ids) | `apps/api/wrangler.toml` |
| **AI client** | `src/infra/ai.ts` — model router, `aiRun()`, short-prompt helpers, error envelopes | `apps/api/src/infra/ai.ts` |
| **Async barrier** | Long generations go through the existing `JOBS_QUEUE` producer + a `job_results` table (poll by id); short classifications stay synchronous | `apps/api/src/infra/ai.ts`, queues wiring |
| **KV prompt cache** | Deterministic outputs (skeletons, chains, clause text) cached by key → up to 1k writes/day budget | KV binding |
| **Audit interlock** | Every AI call records `{ userId, division, model, prompt-hash, tokens, latency, outcome }` in `audit_log` | schema + `src/infra/ai.ts` |

## 2. Division integration map

### 2.1 Study Abroad
- **Eligibility Checker (public hero artifact):** upgrade the static rule engine →
  `@cf/meta/llama-3.3-70b-instruct` reasoning + vector university match (768-d
  `bge-base-en-v1.5` already bound) → personalized 3-university shortlist with
  profile-fit summary. Rule engine remains the fallback.
- **SOP mentor (Client360):** staff pastes student's draft → AI "admissions-reader"
  critique (structure, flow, quantification, differentiation) → inline draft diff.
  Async via Queue.
- **University shortlist:** natural-language query → vector top-8 + per-uni fit
  reason (sync).

### 2.2 Visa
- **Case Q&A:** "where is case OP-2026-1234 stuck?" → structured D1 lookup +
  LLM-formatted answer with cited case id (async).
- **Interview mock:** division-specific mock Q&A; scores readiness; flags missing
  documents (sync, short turns).

### 2.3 Umrah & Travel
- **Departure selling assistant:** family-size/date matching against live
  `group_departures` bands (rules + vector of packages; zero money fields passed
  to model).
- **Itinerary FAQ:** hosted-KB retrieval answers from owned content (vector, sync).

### 2.4 Attestation
- **Chain explainer:** "what do I need for UAE degree attestation?" → steps +
  fees + timeline from `attestation_chains` in plain words (sync extraction + copy).
- **Document vision validation:** classify doc type + detect attached seals
  (vision model `@cf/meta/llama-3.2-11b-vision-instruct`) — async.

### 2.5 Manpower
- **Resume parser → REAL:** retire the fail-closed `MANPOWER_AI=mock` placeholder;
  Workers AI extraction → structured `{ name, skills[], sector, experience }`
  in a Queue consumer (10 ms CPU rule).
- **CV ↔ job fit score:** parsed candidate vs `job_postings` → employability %
  + gaps (async).

### 2.6 Shared (CS, all divisions)
- **Draft follow-up / WhatsApp:** "cold lead, missed call" → 2 tone options
  (warm / firm) rendered inline in StaffTools; DPDP-safe: draft-only, manual send.
- **Compliance assist:** GSTR fuzzy field completion from past invoices (vector).
- **Inbox reply suggest:** inbound WhatsApp `conversations` row → suggested reply (async).

## 3. Cross-cutting rules (locked)

1. **Async > sync** — generation through Queues + result poll; sync only for
   sub-100-token classifications. Never block a request past the CPU budget.
2. **Suggested, never automatic** — outputs are drafts; staff approves save/send.
3. **Fail-dedicated fallbacks** — model errors return the rule/logic result with a
   friendly note; eligibility already mirrors this.
4. **Cost guardrail** — per-division daily token caps via KV counters; model
   classes: tiny (draft/classify) vs large (SOP/analysis) chosen by endpoint.
5. **Audit everything** — AI row in `audit_log` per call for compliance confidence.

## 4. Env / config additions

```
wrangler.toml:
  [ai] binding = "AI"
  [vars]
    AI_MODEL_DRAFT     = "@cf/meta/llama-3.3-70b-instruct"
    AI_MODEL_FAST      = "@cf/meta/llama-3.1-8b-instruct"
    AI_MODEL_VISION    = "@cf/meta/llama-3.2-11b-vision-instruct"
    AI_MAX_TOKENS_DAY  = "400000"
```
Secrets (never `[vars]`) for any provider keys if Models-router used later.

## 5. Build order

- **Phase 1:** `[ai]` binding + `infra/ai.ts` + Queue consumer scaffold +
  **real manpower resume parser** (kills the mock) + **SOP draft API** (Client360).
- **Phase 2:** Visa case Q&A + eligibility vector upgrade + audit logging row.
- **Phase 3:** Vision attestation validation, nurture drafts, inbox suggest.

## 6. Open questions for stakeholders

1. Which **models** fit the budget (Models catalog) — confirm `llama-3.3-70b`
   preset or a lighter config?
2. Should AI access be **role/division gated** (counselor SOP-only, admin-all)?
3. Acceptable **latency budget** before Queue-backed async UX is required per page
   (2 s inline vs 5 s async)?
4. **RBAC + audit**: confirm append-only audit_log retention (365 d) and per-user
   AI usage reports for the owner.

---

*Document mirrors discussion on 2026-08-08 session; not yet implemented (pending
stakeholder sign-off on §6).*