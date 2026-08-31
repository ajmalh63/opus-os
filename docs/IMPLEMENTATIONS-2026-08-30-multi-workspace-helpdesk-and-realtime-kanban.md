# Helpdesk & Multi-Workspace Real-Time Kanban Module Implementation (2026 ITIL v4 Gold Standard)

**Date**: 2026-08-30  
**Status**: Production-Ready / Fully Verified  
**Coverage**: 113/113 Test Suites Passing (714/714 Tests), Full Typecheck Clean, Vite SPA Build Clean  

---

## 1. Overview & Business Objective

OpusOS now includes a unified, multi-workspace Helpdesk & Support Ticketing system that seamlessly bridges:
1. **Client Portal** (`/portal` -> Helpdesk tab `portalTab === 'helpdesk'`): Self-service issue reporting, category selection, live ticket timeline, real-time message exchange, resolution confirmation, and 1–5 star CSAT feedback.
2. **Partner Portal** (`/partner` -> Helpdesk tab `tab === 'helpdesk'`): Partner escalation desk for commission reconciliation, urgent VIP bookings, and affiliate inquiries.
3. **Superadmin & Staff Command Center** (`/helpdesk` route): 5-column Kanban triage desk (`open`, `in_progress`, `waiting_on_user`, `resolved`, `closed`), dynamic SLA compliance tracking, automated assignee routing, macro canned responses, and dual composer with internal staff note firewalling.

---

## 2. ITIL v4 Gold Standard Capabilities

### A. Dynamic SLA & "Pause-the-Clock" Engine
- **Target Times by Priority**:
  - `urgent`: 2 hours (Expedite class of service)
  - `high`: 6 hours
  - `medium`: 24 hours
  - `low`: 48 hours
- **Pause-the-Clock on `waiting_on_user`**:
  - When staff requires information from the applicant/partner and transitions the ticket to `waiting_on_user`, the SLA countdown freezes:
    $$\text{slaRemainingSeconds} = \max(0, \text{slaDueAt} - \text{now})$$
  - When the client or partner submits a reply, the system automatically flips the status back to `in_progress` and extends `slaDueAt` by the exact preserved remaining time:
    $$\text{slaDueAt} = \text{now} + \text{slaRemainingSeconds}$$

### B. Strict Internal Staff Note Firewall
- Support team members can write private yellow internal notes (`isInternalNote = true`) to coordinate internally.
- All Client (`/api/public/portal/tickets/*`) and Partner (`/api/partner/:id/tickets/*`) endpoints strictly filter out internal notes at the database level (`where: eq(ticketMessages.isInternalNote, false)`).

### C. Real-Time Multi-Plane WebSocket Synchronization
Powered by `SyncHub` Durable Objects:
- `staff:global:tickets`: Broadcasts ticket intake, triage transitions, status shifts, staff assignment, and message dispatch.
- `client:{clientId}:tickets`: Broadcasts immediate updates to the client's open ticket board and active thread.
- `partner:{partnerId}:tickets`: Broadcasts updates to the partner's escalation desk.

---

## 3. Database Schema & Migration

### Schema Tables (`apps/api/src/db/schema.ts` & migration `0079_wild_ben_urich.sql`):
1. **`support_tickets`** (28 columns):
   - `id`, `ticketNumber` (`HD-1001` format), `source` (`client` | `partner` | `internal`)
   - `clientId`, `partnerId`, `createdById`, `creatorName`, `creatorEmail`, `creatorPhone`
   - `division` (`study-abroad` | `visa` | `umrah` | `attestation` | `manpower` | `billing` | `general`)
   - `category`, `subject`, `description`, `priority` (`urgent` | `high` | `medium` | `low`)
   - `status` (`open` | `in_progress` | `waiting_on_user` | `resolved` | `closed`)
   - `assigneeId`, `slaDueAt`, `slaPausedAt`, `slaRemainingSeconds`, `firstResponseAt`, `resolvedAt`, `closedAt`
   - `satisfactionRating` (1–5), `satisfactionFeedback`, `attachmentsJson`, `metadataJson`
   - `createdAt`, `updatedAt`
2. **`ticket_messages`** (9 columns):
   - `id`, `ticketId`, `senderType` (`client` | `partner` | `staff` | `system`)
   - `senderId`, `senderName`, `message`, `isInternalNote`, `attachmentsJson`, `createdAt`

---

## 4. API Endpoints

| Endpoint | Method | Plane | Role / Auth | Description |
|---|---|---|---|---|
| `/api/helpdesk/tickets` | GET | Staff | `super_admin`, `counselor+` | 5-Column Kanban grouping, SLA breach calculation, metrics |
| `/api/helpdesk/tickets/:id` | GET | Staff | `super_admin`, `counselor+` | Ticket details + all public & internal staff notes |
| `/api/helpdesk/tickets/:id/status` | PATCH | Staff | `super_admin`, `counselor+` | Status transition with ITIL v4 SLA pause/resume |
| `/api/helpdesk/tickets/:id/assign` | PATCH | Staff | `super_admin`, `counselor+` | Assign counselor to ticket |
| `/api/helpdesk/tickets/:id/messages` | POST | Staff | `super_admin`, `counselor+` | Post reply or internal yellow note (`isInternalNote: true`) |
| `/api/helpdesk/analytics` | GET | Staff | `super_admin`, `manager` | SLA compliance %, CSAT averages, category distribution |
| `/api/public/portal/tickets` | GET | Client | `X-Portal-Token` | 3-Stage Kanban (`active`, `awaiting_user`, `resolved`) |
| `/api/public/portal/tickets/:id` | GET | Client | `X-Portal-Token` | Client ticket thread (internal notes strictly omitted) |
| `/api/public/portal/tickets` | POST | Client | `X-Portal-Token` | Intake ticket, creates triage task, broadcasts real-time sync |
| `/api/public/portal/tickets/:id/messages` | POST | Client | `X-Portal-Token` | Client replies, auto-resumes paused SLA if waiting |
| `/api/public/portal/tickets/:id/satisfaction` | POST | Client | `X-Portal-Token` | 1–5 star rating + feedback review |
| `/api/public/portal/tickets/:id/close` | POST | Client | `X-Portal-Token` | Client confirms resolution and closes ticket |
| `/api/partner/:id/tickets` | GET | Partner | Bearer Token / Session | Partner tickets & 3-stage Kanban |
| `/api/partner/:id/tickets/:ticketId` | GET | Partner | Bearer Token / Session | Partner ticket thread |
| `/api/partner/:id/tickets` | POST | Partner | Bearer Token / Session | Partner raises escalation |
| `/api/partner/:id/tickets/:ticketId/messages` | POST | Partner | Bearer Token / Session | Partner sends message |

---

## 5. Verification Results

- **Typecheck**: `pnpm typecheck` passed with 0 errors across `@opusos/shared`, `@opusos/api`, and `@opusos/app`.
- **Vitest Suite**: `pnpm test` completed in 9.23s with **113/113 test files passing** and **714/714 tests passing**.
- **SPA Build**: `pnpm --filter app build` generated production assets cleanly in 3.02s.
