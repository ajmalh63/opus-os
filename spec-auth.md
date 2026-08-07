# Spec: Better Auth Integration & RBAC Middleware (Phase 0 Final)

## Objective
Integrate Better Auth v1 with D1/Drizzle bindings, create the catch-all auth route handler, and enforce RBAC middleware for protected `/api/*` endpoints.

## Scope
IN:
1. Drizzle schema additions for Better Auth (`user`, `session`, `account`, `verification`).
2. Catch-all Hono route handler at `apps/api/src/routes/auth.ts` mounted under `/api/auth/*`.
3. RBAC middleware (`apps/api/src/middleware/rbac.ts`) that validates session cookies and checks user division permissions (`user_divisions`).
4. Vitest integration test verifying that unauthenticated requests to `/api/clients/:id` return HTTP 401 Unauthorized.

OUT:
- Frontend login UI forms (handled in Phase 1 React SPA).

## Success Criteria
- Better Auth migrates tables cleanly into local D1 SQLite.
- All unit and integration tests in `apps/api/tests/auth.test.ts` pass (`pnpm test`).
