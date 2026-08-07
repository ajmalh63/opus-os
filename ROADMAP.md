# OpusOS End-to-End Autonomous Build Roadmap

## Phase 0: Auth & Middleware Foundation
- [x] Implement Better Auth v1 routes (`apps/api/src/routes/auth.ts`) with D1 SQLite adapter.
- [x] Implement RBAC middleware (`apps/api/src/middleware/rbac.ts`) supporting division scoping.
- [x] Run `pnpm --filter api exec drizzle-kit generate:sqlite` to update local D1 migrations.
- [x] Ensure all unit tests in `apps/api/tests/auth.test.ts` pass.

## Phase 1: Core Operations & React 19 Frontend
- [x] Scaffold the React 19 SPA in `apps/app` matching interactive wireframe templates (`public-lead-form.html`, `client-360.html`, `kanban-board.html`).
- [x] Wire React Router / Wouter routes for Public Lead Form, Client 360, and Kanban Board.
- [x] Integrate TanStack Query in `apps/app` to fetch and mutate data against `apps/api` endpoints.
- [x] Implement real-time HTML5 drag-and-drop on Kanban columns enforcing WIP limits.
- [x] Implement Document Vault file upload interface generating R2 presigned URLs.

## Phase 1.5 & 2: Advanced Operations, Money & DPDP Legal Engine
- [x] Build Service Agreement engine with eSign signature capture and SHA-256 consent hashing.
- [x] Build Indian GST Rule 46 compliant billing module (storing integer paise, auto CGST/SGST vs IGST split).
- [x] Implement automated milestone payment escalation state machine (7/14/30-day triggers).
- [x] Enforce DPDP candidate resume retention and per-employer consent verification gates.

## Phase 3 & 4: Umrah, Attestation & Manpower Divisions
- [x] Implement Umrah package builder and group departure calendar.
- [x] Build Attestation transit tracking module with Blue Dart / DTDC courier integration.
- [x] Build Manpower candidate recruitment hub and Workers AI resume parser.

## Phase 4.6 & 5: Public Client Portal & Partner Program
- [x] Build self-service Client Portal ("My Journey" dashboard) with token lookup.
- [x] Implement Partner Referral Tracking and Commission Ledger.
- [x] Ensure all local Vitest test suites compile and pass 100%.