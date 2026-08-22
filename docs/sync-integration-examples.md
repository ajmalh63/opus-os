# Sync Integration Examples — Publish After D1 Commit (Fire-and-Forget)

> Pattern: **D1 transaction → commit OK → `ctx.waitUntil(publishSyncEvent)`** — never roll back on publish fail (WS is notification only).  
> Each example shows the *single line* to add after your existing `auditEvent` call.

## 1. Umrah departure inventory (highest value — shared atom)

**File:** `apps/api/src/routes/portalUmrah.ts` → after `seatBookings` insert & `groupDepartures` update

```ts
import { publishSyncEvent } from '../routes/sync.js';

// inside POST /departures/:id/book handler, after db.transaction succeeds:
if (booking && departure) {
  c.executionCtx?.waitUntil?.(
    publishSyncEvent(c.env as any, {
      channel: `departure:${departureId}:inventory`,
      type: 'INVENTORY_UPDATED',
      payload: { departureId, bookedSeats: departure.bookedSeats + paxCount, available: departure.capacity - (departure.bookedSeats + paxCount), paxCount },
      auditId: (c as any)._auditId,
    }, c.executionCtx)
  );
  // also notify client private atom
  c.executionCtx?.waitUntil?.(
    publishSyncEvent(c.env as any, {
      channel: `client:${clientId}:bookings`,
      type: 'BOOKING_CREATED',
      payload: { bookingId: booking.id, departureId, paxCount, status: 'held' },
    }, c.executionCtx)
  );
}
```

**Frontend (`apps/app/src/pages/divisions/UmrahPortal.tsx` + `UmrahClientSection.tsx`):**

```ts
import { createSyncClient } from '../../lib/syncClient';
const sync = createSyncClient({
  plane: 'client', token: portalToken,
  channels: [`departure:${departureId}:inventory`],
  enabled: import.meta.env.VITE_SYNC_ENABLED !== 'false',
  onEvent: (e) => { if (e.type==='INVENTORY_UPDATED') qc.invalidateQueries({queryKey:['departures']}) }
});
```

## 2. Partner commissions — `partner:{id}:commissions`

**File:** `apps/api/src/routes/payments.ts` or `commissionLedger` maturity cron

```ts
await publishSyncEvent(c.env as any, {
  channel: `partner:${partnerId}:commissions`,
  type: 'COMMISSION_MATURED',
  payload: { ledgerId, amount: 50000, status:'matured' },
}, c.executionCtx);
// staff also sees it:
await publishSyncEvent(c.env as any, {
  channel: `staff:partner:${partnerId}:commissions`,
  type: 'COMMISSION_MATURED',
  payload: { partnerId, ledgerId },
}, c.executionCtx);
```

**Partner Dashboard (`PartnerDashboard.tsx`):** `channels: [\`partner:${partnerId}:commissions\`, \`partner:${partnerId}:referrals\`]`

## 3. Staff pipeline — `staff:division:umrah:pipeline`

**File:** `apps/api/src/routes/kanban.ts` after `stageKey` update

```ts
await publishSyncEvent(c.env as any, {
  channel: `staff:division:${division}:pipeline`,
  type: 'STAGE_CHANGED',
  payload: { clientId, engagementId, from: sourceStage, to: targetStage },
}, c.executionCtx);
```

**Workspace (`WorkspaceShell.tsx`):**

```ts
const staffSync = createSyncClient({
  plane:'staff',
  channels: ['staff:global:alerts', 'staff:division:umrah:pipeline', 'staff:division:visa:pipeline'],
  onEvent: (e)=> { if(e.type==='STAGE_CHANGED') qc.invalidateQueries({queryKey:['kanban']}) }
});
```

## 4. Documents — `client:{id}:documents`

**File:** `apps/api/src/routes/clients.ts` after `documents` status `pending→verified`

```ts
await publishSyncEvent(c.env as any, {
  channel: `client:${clientId}:documents`,
  type: 'DOCUMENT_VERIFIED',
  payload: { documentId, fileName, status:'verified' },
}, c.executionCtx);
```

## 5. Catalog — `public:catalog:*` (for hero ticks)

**File:** `apps/api/src/routes/public.ts` after new `jobPostings` insert (admin)

```ts
await publishSyncEvent(c.env as any, {
  channel: 'public:catalog:jobs',
  type: 'CATALOG_UPDATED',
  payload: { count: 42 },
}, c.executionCtx);
```

---

## Frontend wiring checklist (all behind flag)

- Staff: `WorkspaceShell.tsx` — one WS, `staff:global:alerts` + viewed division channels. Invalidate `kanban`, `clients`, `inbox`.
- Client: `ClientPortal.tsx` — WS `client:{id}:*` + `departure:*` for viewed dates. Invalidate `portal`, `departures`.
- Partner: `PartnerDashboardHub.tsx` — WS `partner:{id}:*` + `public:catalog:*`. Invalidate `partnerAnalytics`, `commissions`.
- All keep existing `GET` fallbacks; WS is progressive enhancement. On `4401/4403` → clear token & show re-login toast.

