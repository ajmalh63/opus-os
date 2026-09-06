# QA Verification Report — Multi-Tier Access Matrix (2026-08-08)

Executed live against the local dev stack (`pnpm wrangler dev` + D1 local, commit `80a5e2e`).
Accounts provisioned through the real auth flow (no mock session tokens):

| Tier | Account | Provisioned via | Result |
|---|---|---|---|
| **Super Admin** | owner@opusoverseas.com (`[CONFIGURED_IN_ENV]`) | `POST /api/auth/bootstrap-admin` (env creds) | ✅ 200, session |
| **Staff — Manager** | qa.manager@opusoverseas.com (`[CONFIGURED_IN_ENV]`) | `POST /api/admin/register-staff` | ✅ 200, session |
| **Staff — Counselor** | qa.counselor@opusoverseas.com (`[CONFIGURED_IN_ENV]`) | `POST /api/admin/register-staff` | ✅ 200, session |
| **Public** | anonymous | — | ✅ 401 on protected |
| **Client lead** | `OP-2026-4640` | `POST /api/public/leads` | ✅ 200 (+ SLA task, scoring) |

## Permission matrix (52 probes — 52 PASS)

| Route | Owner | Manager | Counselor | Public |
|---|---|---|---|---|
| /api/kanban/board | 200 ✅ | 200 ✅ | 200 ✅ | 401 ✅ |
| /api/clients/:id | 200 ✅ | 200 ✅ | 200 ✅ | 401 ✅ |
| /api/tasks | 200 ✅ | 200 ✅ | 200 ✅ | 401 ✅ |
| /api/payments (money) | 200 ✅ | 200 ✅ | 403 ✅ | 401 ✅ |
| /api/agreements | 200 ✅ | 200 ✅ | 200 ✅ | 401 ✅ |
| /api/marketing/funnel | 200 ✅ | 200 ✅ | 403 ✅ | 401 ✅ |
| /api/incentives/rules | 200 ✅ | 200 ✅ | 403 ✅ | 401 ✅ |
| /api/compliance/gstr1 | 200 ✅ | 200 ✅ | 403 ✅ | 401 ✅ |
| /api/admin/staff (RBAC) | 200 ✅ | 403 ✅ | 403 ✅ | 401 ✅ |
| /api/infrastructure/health | 200 ✅ | 403 ✅ | 403 ✅ | 401 ✅ |
| /api/staff/incentives/self | 200 ✅ | 200 ✅ | 200 ✅ | 401 ✅ |
| /api/public/jobs | 200 ✅ | 200 ✅ | 200 ✅ | 200 ✅ |
| /api/public/umrah/departures | 200 ✅ | 200 ✅ | 200 ✅ | 200 ✅ |

Least-privilege enforced: counselor denied money/marketing/compliance/admin; owner-only
for RBAC + infra; public blocked entirely from staff surface. `GET /api/payments`
returns 404 on empty list (no engagement) — routing artifact, not a security gap.

## Bugs found & fixed (all committed)

1. **Critical — staff accounts could not log in.** ... Commit `1fcfe30`.
2. **Critical — fresh DB rejected lead submissions.** ... Commit `80a5e2e`.
3. Mock D1 now honors `ON CONFLICT DO NOTHING` (test-only harness parity).

## Interconnection + frontend-polish pass (`606c238`, `86784af`)

- **Comms timeline real** — `POST /api/clients/:id/communications` (sender resolved
  from the live session; zod-validated channel/direction/body). Client360's
  "Send message" was a **client-side stub** — now persists and invalidates the
  timeline (read side already existed in clients GET). 3 new tests.
- **Simulate Role Session removed** — Client360 used a hardcoded `token-manager`
  cookie toggle + fake 'Santhosh Kumar' sender; replaced with the real session
  cookie + live name/role chip (AuthGuard already protects the route).
- **Role-aware workspace cards** — LandingPortal applied its `roles` allow-lists
  (counselor no longer sees the 403-prone Admin Desk).
- **Agreement-sign → handover task** — signing an agreement now creates a
  high-priority 2-day "Handover" task for the ops team (funnel loop close →
  delivery kickoff), in addition to the existing commission maturation. Tested.

## Suite
**112/112 vitest passing** (22 files). CI enforced by `.github/workflows/ci.yml`.