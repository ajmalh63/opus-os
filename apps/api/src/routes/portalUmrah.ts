import { resolveClientByToken } from '../lib/clientToken.js';
import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { getDb } from '../db/client.js';
import { clients, groupDepartures, seatBookings, bookingPassengers, umrahPackages, appSettings, engagements, payments } from '../db/schema.js';
import { eq, and, gte, lte, inArray, sql } from 'drizzle-orm';
import { auditEvent, auditBounded } from '../middleware/audit.js';
import { createStaffAlert } from '../infra/staffAlerts.js';
import { isDivisionEnabled } from '../lib/divisions.js';
import { bookUmrahSlotSchema, verifyUmrahAdvanceSchema, payUmrahBalanceSchema } from '@opusos/shared';
import { computePartyPrice, partyAdvancePaise, serializePassenger, type PartyPassenger } from '../lib/umrahParty.js';

// Client self-service Umrah surface (token = client.id).
// Mounted at /api/public/portal/umrah.
// Booking model (gold standard): ₹500 non-refundable advance → slot reserved
// for 3 days (72h) → balance online (Razorpay) or at office (staff confirms).
export const portalUmrahRouter = new Hono<{
  Bindings: { DB: D1Database; RAZORPAY_KEY_ID?: string; RAZORPAY_KEY_SECRET?: string }
}>();

const RZR_BASE = 'https://api.razorpay.com/v1';

function basicAuth(c: { env: { RAZORPAY_KEY_ID?: string; RAZORPAY_KEY_SECRET?: string } }): string {
  const key = c.env.RAZORPAY_KEY_ID;
  const secret = c.env.RAZORPAY_KEY_SECRET;
  if (!key || !secret) throw new Error('Razorpay credentials not configured');
  return 'Basic ' + btoa(`${key}:${secret}`);
}

function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a.charCodeAt(i) ^ b.charCodeAt(i));
  return diff === 0;
}

async function verifySignature(orderId: string, paymentId: string, signature: string, secret: string): Promise<boolean> {
  const body = `${orderId}|${paymentId}`;
  const enc = new TextEncoder();
  const keyData = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', keyData, enc.encode(body));
  const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
  return timingSafeEqualHex(hex, signature);
}

// Coming Soon gate: inventory is visible only when the owner flips the switch.
async function inventoryEnabled(db: any): Promise<boolean> {
  const row = await db.select().from(appSettings).where(eq(appSettings.key, 'umrah_inventory_enabled')).get();
  return row?.value === 'true';
}

// Self-heal expired holds (held > 24h unpaid, reserved past reservedUntil).
async function releaseExpiredHolds(db: any, now: number): Promise<void> {
  // Two simple queries (held > 24h unpaid; reserved past reservedUntil) — the
  // mock D1 understands eq/lte; a single IN/OR query would not.
  const heldExpired = await db.select().from(seatBookings)
    .where(and(eq(seatBookings.status, 'held'), lte(seatBookings.createdAt, now - 24 * 3600))).all();
  const reservedExpired = await db.select().from(seatBookings)
    .where(and(eq(seatBookings.status, 'reserved'), lte(seatBookings.reservedUntil, now))).all();
  const expired = [...heldExpired, ...reservedExpired];
  for (const b of expired) {
    await db.update(seatBookings).set({ status: 'cancelled', updatedAt: now }).where(eq(seatBookings.id, b.id));
    const dep = await db.select().from(groupDepartures).where(eq(groupDepartures.id, b.departureId)).get();
    if (dep && dep.bookedSeats > 0) {
      const released = Math.max(0, (b.paxCount ?? 1));
      await db.update(groupDepartures).set({ bookedSeats: Math.max(0, dep.bookedSeats - released) }).where(eq(groupDepartures.id, dep.id));
    }
  }
}

// Load passengers for a set of bookings (used by tracker + balance math).
async function passengersForBookings(db: any, bookingIds: string[]): Promise<Map<string, any[]>> {
  const map = new Map<string, any[]>();
  if (!bookingIds.length) return map;
  const all = await db.select().from(bookingPassengers).all();
  for (const id of bookingIds) map.set(id, all.filter((p: any) => p.bookingId === id));
  return map;
}

// Party total for a booking (mirrors the price computed at booking time).
function partyTotalForBooking(
  dep: any,
  pkg: any,
  booking: { occupancy?: string | null; paxCount?: number | null; roomConfig?: string | null },
  passengers: any[]
): { totalPaise: number; perPersonPaise: any; soloSupplementPaise: number; groupDiscountPct: number } {
  const adultPrice = dep?.price ?? pkg?.retailPricePaise ?? 0;
  const list: PartyPassenger[] = passengers.length
    ? passengers
    : [{ name: 'Primary traveller', category: 'adult' }];
  const price = computePartyPrice(adultPrice, list, booking.occupancy === 'solo' ? 'solo' : 'shared', pkg);
  return { totalPaise: price.totalPaise, perPersonPaise: price.perPersonPaise, soloSupplementPaise: price.soloSupplementPaise, groupDiscountPct: price.groupDiscountPct };
}

// GET /api/public/portal/umrah/packages — open packages (Coming Soon gate)
portalUmrahRouter.get('/packages', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  try {
    const enabled = (await isDivisionEnabled(c.env, 'umrah')) && (await inventoryEnabled(db));
    if (!enabled) return c.json({ success: true, comingSoon: true, enabled: false, packages: [] });
    const pkgs = await db.select().from(umrahPackages).where(eq(umrahPackages.status, 'open')).all();
    const deps = await db.select().from(groupDepartures).where(eq(groupDepartures.status, 'open')).all();
    const list = pkgs.map(p => {
      const pkgDeps = deps.filter(d => d.packageId === p.id);
      return {
        ...p,
        upcomingDepartures: pkgDeps.filter(d => d.departureDate * 1000 > Date.now()).length,
        nextDeparture: pkgDeps.filter(d => d.departureDate * 1000 > Date.now()).sort((a, b) => a.departureDate - b.departureDate)[0]?.departureDate || null,
      };
    });
    return c.json({ success: true, comingSoon: false, enabled: true, packages: list });
  } catch (e: any) {
    return c.json({ error: 'Packages fetch failed', details: e?.message }, 500);
  }
});

// GET /api/public/portal/umrah/packages/:id — detail + open departures
portalUmrahRouter.get('/packages/:id', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  try {
    const enabled = (await isDivisionEnabled(c.env, 'umrah')) && (await inventoryEnabled(db));
    if (!enabled) return c.json({ success: true, comingSoon: true, enabled: false });
    const pkg = await db.select().from(umrahPackages).where(and(eq(umrahPackages.id, c.req.param('id')), eq(umrahPackages.status, 'open'))).get();
    if (!pkg) return c.json({ error: 'Package not found' }, 404);
    const deps = await db.select().from(groupDepartures)
      .where(and(eq(groupDepartures.packageId, pkg.id), eq(groupDepartures.status, 'open'), gte(groupDepartures.departureDate, Math.floor(Date.now() / 1000))))
      .orderBy(groupDepartures.departureDate).all();
    return c.json({ success: true, package: pkg, departures: deps.map(d => ({ ...d, available: Math.max(0, d.capacity - d.bookedSeats) })) });
  } catch (e: any) {
    return c.json({ error: 'Package fetch failed', details: e?.message }, 500);
  }
});

// GET /api/public/portal/umrah/calendar — announced dates + availability
// (capacity 30 groups; available vs filled visible to clients)
portalUmrahRouter.get('/calendar', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const now = Math.floor(Date.now() / 1000);
  try {
    const enabled = (await isDivisionEnabled(c.env, 'umrah')) && (await inventoryEnabled(db));
    if (!enabled) return c.json({ success: true, comingSoon: true, enabled: false, days: [] });
    await releaseExpiredHolds(db, now);
    const deps = await db.select().from(groupDepartures)
      .where(and(eq(groupDepartures.status, 'open'), gte(groupDepartures.departureDate, now)))
      .orderBy(groupDepartures.departureDate).all();
    const pkgIds = [...new Set(deps.map(d => d.packageId).filter(Boolean))] as string[];
    const pkgs = pkgIds.length ? await db.select().from(umrahPackages).where(inArray(umrahPackages.id, pkgIds)).all() : [];
    const days = deps.map(d => {
      const pkg = pkgs.find(p => p.id === d.packageId);
      return {
        id: d.id,
        date: d.departureDate,
        endDate: d.endDate || null,
        packageId: d.packageId,
        packageName: pkg?.name || null,
        tier: d.packageTier,
        departureCity: d.departureCity || pkg?.departureCity || null,
        capacity: d.capacity,
        bookedSeats: d.bookedSeats,
        available: Math.max(0, d.capacity - d.bookedSeats),
        fillPct: d.capacity ? Math.round((d.bookedSeats / d.capacity) * 100) : 0,
        pricePaise: d.price,
        advanceFeePaise: d.bookingFee,
        retailPricePaise: pkg?.retailPricePaise ?? d.price,
        soloAvailable: !!pkg?.soloAvailable,
        soloSupplementPaise: pkg?.soloSupplementPaise ?? 0,
      };
    });
    return c.json({ success: true, comingSoon: false, enabled: true, days });
  } catch (e: any) {
    return c.json({ error: 'Calendar fetch failed', details: e?.message }, 500);
  }
});

// POST /api/public/portal/umrah/departures/:id/book — token-auth party booking.
// One booking = one party (N passengers). Creates a HELD booking + Razorpay
// order for pax × ₹500 advance. Once paid (verify-advance) the party's seats
// are RESERVED for 3 days (72h). Capacity & pricing scale by pax.
// Division-availability gate middleware: runs BEFORE zod validation so the
// 409 fires even for malformed bodies (kill-switch semantics).
const umrahIntakeGate = async (c: any, next: any) => {
  if (!(await isDivisionEnabled(c.env, 'umrah'))) {
    return c.json({ error: 'This service is not accepting bookings yet', code: 'DIVISION_DISABLED' }, 409);
  }
  await next();
};

portalUmrahRouter.post('/departures/:id/book', umrahIntakeGate, zValidator('json', bookUmrahSlotSchema), async (c) => {
  const body = c.req.valid('json');
  const token = c.req.query('token');
  if (!token) return c.json({ error: 'token is required' }, 400);
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  if (!c.env.RAZORPAY_KEY_ID || !c.env.RAZORPAY_KEY_SECRET) {
    return c.json({ error: 'Razorpay not configured — set RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET' }, 503);
  }
  const db = getDb(c.env.DB);
  const now = Math.floor(Date.now() / 1000);
  try {
    const enabled = (await isDivisionEnabled(c.env, 'umrah')) && (await inventoryEnabled(db));
    if (!enabled) return c.json({ error: 'Umrah inventory is coming soon' }, 409);
    const client = await resolveClientByToken(db, token);
    if (!client) return c.json({ error: 'Client not found for token' }, 404);

    const dep = await db.select().from(groupDepartures).where(eq(groupDepartures.id, body.departureId)).get();
    if (!dep) return c.json({ error: 'Departure not found' }, 404);
    if (dep.status !== 'open') return c.json({ error: 'Departure is not open for booking' }, 409);
    if (dep.departureDate < now) return c.json({ error: 'Departure date has passed' }, 409);

    const pkg = dep.packageId ? await db.select().from(umrahPackages).where(eq(umrahPackages.id, dep.packageId)).get() : null;
    if (pkg && pkg.status !== 'open') return c.json({ error: 'Package is not open' }, 409);

    // Party: default = the token client as a single adult (backwards compatible).
    const passengers: PartyPassenger[] = body.passengers?.length
      ? body.passengers
      : [{ name: client.name || 'Primary traveller', category: 'adult' }];
    const pax = passengers.length;
    const occupancy = body.occupancy === 'solo' ? 'solo' : 'shared';

    // Gold-standard pricing: per person by category + solo supplement + group discount.
    const price = computePartyPrice(dep.price, passengers, occupancy, pkg);
    const advancePaise = partyAdvancePaise(pax, dep.bookingFee ?? 50000);
    const balancePaise = Math.max(0, price.totalPaise - advancePaise);

    const hasSeats = dep.bookedSeats + pax <= dep.capacity;
    const bookingId = crypto.randomUUID();
    await db.insert(seatBookings).values({
      id: bookingId,
      departureId: dep.id,
      clientId: token,
      status: hasSeats ? 'held' : 'waitlist',
      advancePaid: false,
      balancePaid: false,
      occupancy,
      paxCount: pax,
      roomConfig: body.roomConfig ?? null,
      createdAt: now,
      updatedAt: now
    });

    // Persist every passenger (industry: passenger records linked to the party booking).
    for (const p of passengers) {
      await db.insert(bookingPassengers).values({
        id: crypto.randomUUID(),
        bookingId,
        name: p.name,
        dob: p.dob ?? null,
        passportNumber: p.passportNumber ?? null,
        category: p.category,
        specialNeeds: p.specialNeeds ?? null,
        createdAt: now
      });
    }

    // Seats count toward inventory immediately (prevents oversell); released
    // automatically if the advance is never paid (24h) or hold expires (72h).
    if (hasSeats) {
      await db.update(groupDepartures).set({ bookedSeats: dep.bookedSeats + pax }).where(eq(groupDepartures.id, dep.id));
    }

    await auditEvent(c as any, { action: 'UMRAH_BOOKING_CREATED', entityName: 'seat_bookings', entityId: bookingId, afterState: { clientId: token, departureId: dep.id, status: hasSeats ? 'held' : 'waitlist', paxCount: pax } }).catch(() => {});

    if (!hasSeats) {
      return c.json({ success: true, bookingId, status: 'waitlist', pax_count: pax, message: `Departure has only ${Math.max(0, dep.capacity - dep.bookedSeats)} seat(s) left for your party of ${pax} — added to the waiting list. We will contact you if seats open.` });
    }

    // Razorpay order for the party advance (pax × ₹500 default).
    const rzRes = await fetch(`${RZR_BASE}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': basicAuth(c) },
      body: JSON.stringify({
        amount: advancePaise,
        currency: 'INR',
        receipt: `umrah_adv_${bookingId.slice(0, 12)}`,
        notes: { clientId: token, bookingId, departureId: dep.id, kind: 'umrah_advance', paxCount: pax },
        partial_payment: false,
      }),
    });
    if (!rzRes.ok) {
      const rzErr = await rzRes.text().catch(() => '');
      return c.json({ error: 'Razorpay order creation failed', details: rzErr }, 502);
    }
    const order = (await rzRes.json()) as { id: string; amount: number; currency: string };
    const reserveHoldHours = pkg?.reserveHoldHours ?? 72;

    return c.json({
      success: true,
      bookingId,
      status: 'held',
      order_id: order.id,
      amount_paise: order.amount,
      currency: order.currency,
      key: c.env.RAZORPAY_KEY_ID,
      pax_count: pax,
      room_config: body.roomConfig ?? null,
      occupancy,
      passengers: passengers.map(serializePassenger),
      party_total_paise: price.totalPaise,
      per_person_paise: price.perPersonPaise,
      solo_supplement_paise: price.soloSupplementPaise,
      group_discount_pct: price.groupDiscountPct,
      advance_fee_paise: advancePaise,
      advance_non_refundable: true,
      reserve_hold_hours: reserveHoldHours,
      reserved_until_hint: new Date((now + reserveHoldHours * 3600) * 1000).toISOString(),
      balance_paise: balancePaise,
      balance_due_hint: `Pay the remaining ₹${(balancePaise / 100).toFixed(2)} online or at our office before departure.`,
      message: `Pay the non-refundable advance of ₹${(advancePaise / 100).toFixed(2)} (${pax} × ₹${((dep.bookingFee ?? 50000) / 100).toFixed(0)}) to reserve ${pax} seat(s) for ${reserveHoldHours / 24} days.`,
    });
  } catch (e: any) {
    return c.json({ error: 'Booking failed', details: e?.message }, 500);
  }
});

// POST /api/public/portal/umrah/bookings/:id/verify-advance — Razorpay
// signature verify → seat RESERVED for 3 days + ledger + staff alert.
portalUmrahRouter.post('/bookings/:id/verify-advance', zValidator('json', verifyUmrahAdvanceSchema), async (c) => {
  const body = c.req.valid('json');
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const secret = c.env.RAZORPAY_KEY_SECRET;
  if (!secret) return c.json({ error: 'Razorpay not configured' }, 503);
  const db = getDb(c.env.DB);
  const now = Math.floor(Date.now() / 1000);
  try {
    const ok = await verifySignature(body.razorpay_order_id, body.razorpay_payment_id, body.razorpay_signature, secret);
    if (!ok) {
      await auditBounded(c, {
        action: 'UMRAH_ADVANCE_VERIFY_FAILED',
        entityName: 'seat_bookings',
        entityId: body.bookingId,
        result: 'error',
        category: 'money',
        afterState: { bookingId: body.bookingId, orderId: body.razorpay_order_id },
      }, 'verify');
      return c.json({ error: 'Signature mismatch — payment not confirmed' }, 403);
    }

    const booking = await db.select().from(seatBookings).where(eq(seatBookings.id, body.bookingId)).get();
    if (!booking) return c.json({ error: 'Booking not found' }, 404);
    if (booking.status === 'cancelled') return c.json({ error: 'Booking was released' }, 409);
    if (booking.advancePaid) return c.json({ success: true, message: 'Advance already confirmed.' });

    const dep = await db.select().from(groupDepartures).where(eq(groupDepartures.id, booking.departureId)).get();
    const pkg = dep?.packageId ? await db.select().from(umrahPackages).where(eq(umrahPackages.id, dep.packageId)).get() : null;
    const holdHours = pkg?.reserveHoldHours ?? 72;
    const reservedUntil = now + holdHours * 3600;

    await db.update(seatBookings).set({
      status: 'reserved',
      advancePaid: true,
      reservedUntil,
      advancePaymentId: body.razorpay_payment_id,
      updatedAt: now
    }).where(eq(seatBookings.id, booking.id));

    // Payments ledger entry (integer paise) — pax × booking fee for the party.
    const clientEngagement = await db.select().from(engagements).where(eq(engagements.clientId, booking.clientId)).get();
    if (clientEngagement) {
      const pax = booking.paxCount ?? 1;
      await db.insert(payments).values({
        id: crypto.randomUUID(),
        clientId: booking.clientId,
        engagementId: clientEngagement.id,
        amount: (dep?.bookingFee ?? 50000) * pax,
        type: 'charge',
        milestoneName: `Umrah advance (non-refundable) — ${pax} pax, booking ${booking.id.slice(0, 8)}`,
        method: 'online',
        referenceNumber: body.razorpay_payment_id,
        createdAt: now
      });
    }

    await auditEvent(c as any, { action: 'UMRAH_ADVANCE_PAID', entityName: 'seat_bookings', entityId: booking.id, afterState: { paymentId: body.razorpay_payment_id, reservedUntil, paxCount: booking.paxCount ?? 1 } }).catch(() => {});
    await createStaffAlert(c.env as any, { division: 'umrah', type: 'booking_advance', title: 'Umrah advance paid — party reserved', body: `Booking ${booking.id.slice(0, 8)} (${booking.paxCount ?? 1} pax) reserved until ${new Date(reservedUntil * 1000).toLocaleString()}`, clientId: booking.clientId, payload: { bookingId: booking.id, reservedUntil, paxCount: booking.paxCount ?? 1 } });

    // Party balance: total party price − advance already paid.
    const passengers = await passengersForBookings(db, [booking.id]);
    const party = partyTotalForBooking(dep, pkg, booking, passengers.get(booking.id) || []);
    const advancePaid = partyAdvancePaise(booking.paxCount ?? 1, dep?.bookingFee ?? 50000);
    const balancePaise = Math.max(0, party.totalPaise - advancePaid);

    return c.json({
      success: true,
      message: `Advance confirmed. Your ${booking.paxCount ?? 1} seat(s) are reserved until ${new Date(reservedUntil * 1000).toLocaleString()} (${holdHours / 24} days).`,
      status: 'reserved',
      reservedUntil,
      occupancy: booking.occupancy || 'shared',
      pax_count: booking.paxCount ?? 1,
      party_total_paise: party.totalPaise,
      balance_paise: balancePaise,
    });
  } catch (e: any) {
    return c.json({ error: 'Advance verification failed', details: e?.message }, 500);
  }
});

// POST /api/public/portal/umrah/bookings/:id/pay-balance — Razorpay order for
// the remaining balance (retail − advance). Requires advance already paid.
portalUmrahRouter.post('/bookings/:id/pay-balance', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  if (!c.env.RAZORPAY_KEY_ID || !c.env.RAZORPAY_KEY_SECRET) {
    return c.json({ error: 'Razorpay not configured' }, 503);
  }
  const db = getDb(c.env.DB);
  try {
    const booking = await db.select().from(seatBookings).where(eq(seatBookings.id, c.req.param('id'))).get();
    if (!booking) return c.json({ error: 'Booking not found' }, 404);
    if (!booking.advancePaid) return c.json({ error: 'Pay the advance first to reserve your seat' }, 409);
    if (booking.balancePaid) return c.json({ error: 'Balance already settled' }, 409);
    if (booking.status === 'cancelled') return c.json({ error: 'Booking was released' }, 409);

    const dep = await db.select().from(groupDepartures).where(eq(groupDepartures.id, booking.departureId)).get();
    if (!dep) return c.json({ error: 'Departure not found' }, 404);
    const pkgB = dep.packageId ? await db.select().from(umrahPackages).where(eq(umrahPackages.id, dep.packageId)).get() : null;
    // Party balance: total party price − advance already paid.
    const passengers = await passengersForBookings(db, [booking.id]);
    const party = partyTotalForBooking(dep, pkgB, booking, passengers.get(booking.id) || []);
    const advancePaid = partyAdvancePaise(booking.paxCount ?? 1, dep.bookingFee ?? 50000);
    const balancePaise = Math.max(0, party.totalPaise - advancePaid);

    const rzRes = await fetch(`${RZR_BASE}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': basicAuth(c) },
      body: JSON.stringify({
        amount: balancePaise,
        currency: 'INR',
        receipt: `umrah_bal_${booking.id.slice(0, 12)}`,
        notes: { clientId: booking.clientId, bookingId: booking.id, departureId: dep.id, kind: 'umrah_balance' },
        partial_payment: false,
      }),
    });
    if (!rzRes.ok) {
      const rzErr = await rzRes.text().catch(() => '');
      return c.json({ error: 'Razorpay order creation failed', details: rzErr }, 502);
    }
    const order = (await rzRes.json()) as { id: string; amount: number; currency: string };
    return c.json({ success: true, order_id: order.id, amount_paise: order.amount, currency: order.currency, key: c.env.RAZORPAY_KEY_ID, bookingId: booking.id });
  } catch (e: any) {
    return c.json({ error: 'Balance order failed', details: e?.message }, 500);
  }
});

// POST /api/public/portal/umrah/bookings/:id/verify-balance — confirm balance
portalUmrahRouter.post('/bookings/:id/verify-balance', zValidator('json', payUmrahBalanceSchema), async (c) => {
  const body = c.req.valid('json');
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const secret = c.env.RAZORPAY_KEY_SECRET;
  if (!secret) return c.json({ error: 'Razorpay not configured' }, 503);
  const db = getDb(c.env.DB);
  const now = Math.floor(Date.now() / 1000);
  try {
    const ok = await verifySignature(body.razorpay_order_id, body.razorpay_payment_id, body.razorpay_signature, secret);
    if (!ok) {
      await auditBounded(c, {
        action: 'UMRAH_BALANCE_VERIFY_FAILED',
        entityName: 'seat_bookings',
        entityId: body.bookingId,
        result: 'error',
        category: 'money',
        afterState: { bookingId: body.bookingId, orderId: body.razorpay_order_id },
      }, 'verify');
      return c.json({ error: 'Signature mismatch — payment not confirmed' }, 403);
    }

    const booking = await db.select().from(seatBookings).where(eq(seatBookings.id, body.bookingId)).get();
    if (!booking) return c.json({ error: 'Booking not found' }, 404);
    if (booking.balancePaid) return c.json({ success: true, message: 'Balance already settled.' });
    if (booking.status === 'cancelled') return c.json({ error: 'Booking was released' }, 409);

    const dep = await db.select().from(groupDepartures).where(eq(groupDepartures.id, booking.departureId)).get();
    const pkgV = dep?.packageId ? await db.select().from(umrahPackages).where(eq(umrahPackages.id, dep.packageId)).get() : null;
    const passengers = await passengersForBookings(db, [booking.id]);
    const party = partyTotalForBooking(dep, pkgV, booking, passengers.get(booking.id) || []);
    const advancePaid = partyAdvancePaise(booking.paxCount ?? 1, dep?.bookingFee ?? 50000);
    const balancePaise = Math.max(0, party.totalPaise - advancePaid);

    await db.update(seatBookings).set({ balancePaid: true, status: 'confirmed', balancePaymentId: body.razorpay_payment_id, updatedAt: now }).where(eq(seatBookings.id, booking.id));

    const clientEngagement = await db.select().from(engagements).where(eq(engagements.clientId, booking.clientId)).get();
    if (clientEngagement) {
      await db.insert(payments).values({
        id: crypto.randomUUID(),
        clientId: booking.clientId,
        engagementId: clientEngagement.id,
        amount: balancePaise,
        type: 'charge',
        milestoneName: `Umrah balance (online) — ${booking.paxCount ?? 1} pax, booking ${booking.id.slice(0, 8)}`,
        method: 'online',
        referenceNumber: body.razorpay_payment_id,
        createdAt: now
      });
    }

    await auditEvent(c as any, { action: 'UMRAH_BALANCE_PAID', entityName: 'seat_bookings', entityId: booking.id, afterState: { paymentId: body.razorpay_payment_id } }).catch(() => {});
    await createStaffAlert(c.env as any, { division: 'umrah', type: 'booking_confirmed', title: 'Umrah booking confirmed (balance paid)', body: `Booking ${booking.id.slice(0, 8)} fully paid online`, clientId: booking.clientId, payload: { bookingId: booking.id } });

    return c.json({ success: true, message: 'Balance received. Your booking is confirmed. May Allah accept your Umrah.', status: 'confirmed' });
  } catch (e: any) {
    return c.json({ error: 'Balance verification failed', details: e?.message }, 500);
  }
});

// GET /api/public/portal/umrah/my-bookings?token= — this client's tracker
portalUmrahRouter.get('/my-bookings', async (c) => {
  const token = c.req.query('token');
  if (!token) return c.json({ error: 'token is required' }, 400);
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const now = Math.floor(Date.now() / 1000);
  try {
    await releaseExpiredHolds(db, now);
    const bookings = await db.select().from(seatBookings).where(eq(seatBookings.clientId, token)).orderBy(sql`${seatBookings.createdAt} DESC`).all();
    const depIds = [...new Set(bookings.map(b => b.departureId))];
    const deps = depIds.length ? await db.select().from(groupDepartures).where(inArray(groupDepartures.id, depIds)).all() : [];
    const pkgIds = [...new Set(deps.map(d => d.packageId).filter(Boolean))] as string[];
    const pkgs = pkgIds.length ? await db.select().from(umrahPackages).where(inArray(umrahPackages.id, pkgIds)).all() : [];
    const passengers = await passengersForBookings(db, bookings.map(b => b.id));

    const list = bookings.map(b => {
      const dep = deps.find(d => d.id === b.departureId);
      const pkg = pkgs.find(p => p.id === dep?.packageId);
      const advancePaise = partyAdvancePaise(b.paxCount ?? 1, dep?.bookingFee ?? 0);
      const party = partyTotalForBooking(dep, pkg, b, passengers.get(b.id) || []);
      const balancePaise = Math.max(0, party.totalPaise - advancePaise);
      return {
        id: b.id,
        status: b.status,
        occupancy: b.occupancy || 'shared',
        paxCount: b.paxCount ?? 1,
        roomConfig: b.roomConfig ?? null,
        passengers: (passengers.get(b.id) || []).map(serializePassenger),
        partyTotalPaise: party.totalPaise,
        perPersonPaise: party.perPersonPaise,
        soloSupplementPaise: party.soloSupplementPaise,
        groupDiscountPct: party.groupDiscountPct,
        advancePaid: b.advancePaid,
        balancePaid: b.balancePaid,
        reservedUntil: b.reservedUntil,
        createdAt: b.createdAt,
        departure: dep ? {
          id: dep.id,
          date: dep.departureDate,
          city: dep.departureCity || pkg?.departureCity || null,
          capacity: dep.capacity,
          bookedSeats: dep.bookedSeats,
          available: Math.max(0, dep.capacity - dep.bookedSeats),
          status: dep.status,
        } : null,
        package: pkg ? { id: pkg.id, name: pkg.name, tier: pkg.tier, retailPricePaise: pkg.retailPricePaise } : null,
        advance_fee_paise: advancePaise,
        balance_paise: balancePaise,
        balance_due: !b.balancePaid && b.advancePaid ? balancePaise : 0,
        hold_expired: (b.status === 'held' && b.createdAt < now - 24 * 3600) || (b.status === 'reserved' && b.reservedUntil && b.reservedUntil < now),
      };
    });
    return c.json({ success: true, bookings: list });
  } catch (e: any) {
    return c.json({ error: 'Bookings fetch failed', details: e?.message }, 500);
  }
});