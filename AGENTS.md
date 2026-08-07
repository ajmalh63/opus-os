# AGENTS.md — OpusOS Project Guidelines & Rules

Welcome! This is the living specification and rulebook for AI agents working on **OpusOS** (Business Operating System for Opus Overseas). All agents must strictly adhere to the technical stack, development rules, commands, and workflow loops described below.

---

## 1. Core Technology Stack

The stack is locked for production-ready Cloudflare-native deployment:

- **Frontend:** React 19 + Vite (Single Page Application, served via Cloudflare Static Assets)
- **Styling:** Tailwind CSS v4
- **Backend:** Hono API framework running on Cloudflare Workers
- **Database:** Cloudflare D1 (SQLite)
- **ORM:** Drizzle ORM (type-safe query building and automated migrations)
- **Authentication:** Better Auth v1 (using D1 database adapter, email OTP/password, and revocable sessions)
- **Monorepo Structure (pnpm workspaces):**
  - `app/` — React frontend application
  - `api/` — Hono API backend
  - `shared/` — Common schemas, Zod validators, and TypeScript types

---

## 2. Non-Negotiable Rules

To ensure compliance with the Cloudflare Workers free tier limits, standard financial/software practices, and our development environment, the following constraints are non-negotiable:

### Strict Local-First Rule
- All development, testing, and database execution **MUST** run on a local dev server (`pnpm wrangler dev` with local D1 SQLite bindings).
- **Do NOT** attempt to deploy to Cloudflare or push remote branches until explicitly instructed.

### Execution Sequence
Every feature implementation must strictly follow this workflow order:
1. **Wireframes:** Build interactive HTML/React mockups/wireframes to align on UX/UI design first.
2. **Scaffolding:** Set up the basic layout, component containers, routing, and directory structure.
3. **API & Schema Scaffolding:** Create database schemas, migration files, Hono route shells, and validation schemas.
4. **Feature Logic:** Implement the core frontend and backend business logic.
5. **Local Testing:** Validate the entire implementation locally.

### 10ms CPU Budget Enforcement
- Cloudflare Workers Free Tier enforces a **10ms CPU limit** per request.
- Request handlers must remain extremely lightweight (e.g., direct DB queries, session lookups, JSON responses).
- **Heavy operations** (such as PDF generation, AI calls, and transactional email sends) **MUST** be offloaded to Cloudflare Queues (asynchronous consumers) or Cron Triggers.
- Ensure that network/database requests do not perform blocking CPU operations in the request thread.

### Integer Paise for Financial Calculations
- Floating-point arithmetic (e.g., JavaScript `number` decimals) is strictly prohibited for money fields to avoid rounding issues.
- All financial metrics, payments, collections, commissions, invoices, and prices must be stored and computed as **integers representing paise** (1 INR = 100 paise).
- Convert values at the input/output boundaries (e.g., formatting to Rupees `₹X.YY` only in the user interface).

### Strict Zod Validation & Shared Types
- Every API endpoint that accepts request body payloads or query parameters must validate inputs using Zod.
- Schemas must be defined in the `shared/` workspace package to ensure absolute type synchronicity between the React frontend (`app`) and the Hono API (`api`).
- Do not define ad-hoc validation schemas directly in route handlers.

---

## 3. Development & Testing Commands

Agents must use the following commands exactly when running local development or test suites:

- **Local Development Server:**
  ```bash
  pnpm wrangler dev
  ```
  *(Launches the Cloudflare wrangler environment locally with D1/R2 mock storage bindings)*

- **Running the Test Suite:**
  ```bash
  pnpm test
  ```
  *(Executes Vitest/Playwright test suites across workspaces)*

---

## 4. The 4-Layer ACE Loop Framework Protocol

We build and iterate using the **Architecture of Cyclical Execution (ACE)** framework. Before you perform any work, locate yourself within these four nested loops:

### 1. The Micro Loop (Think ➔ Act ➔ Observe ➔ Correct)
- **Timescale:** 2–10 seconds.
- **Rule:** Never write code and declare it done without testing. After making a code modification, immediately execute tests (`pnpm test`), analyze errors (compile/runtime/test failures), and correct the codebase until all tests pass.

### 2. The Meso Loop (Plan ➔ Execute ➔ Test ➔ Review)
- **Timescale:** 5–30 minutes.
- **Rule (Plan First):** Before editing files, present your step-by-step implementation plan. List the exact files to be changed, the approach, and any potential side effects. Do not start coding until the human partner approves the plan.
- **Rule (Review Diff):** Once coding is finished and tests pass, summarize the code changes clearly and present the git diff for human review. Commit changes with a clean message upon approval (Checkpoint Commits).

### 3. The Macro Loop (Spec ➔ Ship ➔ Reset ➔ Compound)
- **Timescale:** 1–4 hours.
- **Rule (Spec-First):** Do not write code without a structured specification (What, Why, Scope, and Success Criteria).
- **Rule (Context Management):** If you notice your suggestions degrading, you are repeating yourself, or context is saturated (approaching 3 hours of session time), halt and reset the session. Write a brief handoff file summarizing completed items, current state, and next steps before clearing context.
- **Rule (Compound):** Update this `AGENTS.md` file immediately if any new developer conventions, rules, or recurring mistakes are identified during a session.

### 4. The Meta Loop (Do ➔ Document ➔ Improve ➔ Compose)
- **Timescale:** Continuous.
- **Rule:** Refine rules and documentation iteratively so that each session builds upon the last, reducing execution friction over time.

---

## 5. Coding Conventions

- **Null/Undefined:** Prefer explicit `null` for database models (matching D1/SQL nullable columns) and `undefined` for optional frontend fields.
- **Imports:** Use explicit ES Modules import patterns. Do not import full libraries if named imports are available.
- **Errors:** Handled at Hono middleware level. Return consistent JSON objects: `{ error: string, details?: any }`.
- **Database Migrations:** All schema changes must go through Drizzle kit migration generation (`pnpm drizzle-kit generate` or equivalent wrangler migration script) and never be applied manually.

---

## 6. Live List of Past Mistakes & Architectural Invariants

*(To be compiled and expanded by agents as the project proceeds — Meta Loop)*

- **No Third-Party DBs:** All relational data must reside inside Cloudflare D1. No external postgres or mongo providers.
- **No Unapproved Packages:** Check with the human partner before installing new npm packages.
