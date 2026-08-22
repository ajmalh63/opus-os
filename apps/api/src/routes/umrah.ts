import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { createDepartureSchema, bookSeatSchema, createUmrahPackageSchema, updateUmrahPackageSchema, confirmUmrahOfficeSchema } from '@opusos/shared';
import { getDb } from '../db/client.js';
import { groupDepartures, seatBookings, bookingPassengers, clients, engagements, payments, umrahChecklists, tasks, umrahPackages, appSettings } from '../db/schema.js';
import { eq, and, gte, lte, desc, sql, inArray } from 'drizzle-orm';
import { auditEvent } from '../middleware/audit.js';
import { createStaffAlert } from '../infra/staffAlerts.js';
import { publishSyncEvent } from './sync.js';
import { serializePassenger } from '../lib/umrahParty.js';

export const umrahRouter = new Hono<{ Bindings: { DB: D1Database } }>();

// ─── Self-heal: release expired holds/reservations so the calendar stays
// honest without a cron. held (advance unpaid) expires after 24h; reserved
// (advance paid) expires at reservedUntil (default 72h / 3 days).
async function releaseExpiredHolds(db: any, now: number): Promise<number> {
  // Two simple queries (held > 24h unpaid; reserved past reservedUntil) — the
  // mock D1 understands eq/lte; a single IN/OR query would not.
  const heldExpired = await db.select().from(seatBookings)
    .where(and(eq(seatBookings.status, 'held'), lte(seatBookings.createdAt, now - 24 * 3600))).all();
  const reservedExpired = await db.select().from(seatBookings)
    .where(and(eq(seatBookings.status, 'reserved'), lte(seatBookings.reservedUntil, now))).all();
  const expired = [...heldExpired, ...reservedExpired];
  let released = 0;
  for (const b of expired) {
    await db.update(seatBookings).set({ status: 'cancelled', updatedAt: now }).where(eq(seatBookings.id, b.id));
    const dep = await db.select().from(groupDepartures).where(eq(groupDepartures.id, b.departureId)).get();
    if (dep && dep.bookedSeats > 0) {
      const released = Math.max(0, (b.paxCount ?? 1));
      await db.update(groupDepartures).set({ bookedSeats: Math.max(0, dep.bookedSeats - released) }).where(eq(groupDepartures.id, dep.id));
    }
    released++;
  }
  return released;
}

// ─── PACKAGE INVENTORY (Phase 3) ───

// GET /api/umrah/packages — all packages + departure counts + fill stats
umrahRouter.get('/packages', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  try {
    const pkgs = await db.select().from(umrahPackages).orderBy(desc(umrahPackages.createdAt)).all();
    const deps = await db.select().from(groupDepartures).all();
    const list = pkgs.map(p => {
      const pkgDeps = deps.filter(d => d.packageId === p.id);
      const openDeps = pkgDeps.filter(d => d.status === 'open');
      return {
        ...p,
        departureCount: pkgDeps.length,
        openDepartureCount: openDeps.length,
        totalSeats: openDeps.reduce((s, d) => s + d.capacity, 0),
        filledSeats: openDeps.reduce((s, d) => s + d.bookedSeats, 0),
      };
    });
    return c.json({ success: true, packages: list });
  } catch (e: any) {
    return c.json({ error: 'Failed to fetch packages', details: e?.message }, 500);
  }
});

// POST /api/umrah/packages — create inventory package
umrahRouter.post('/packages', zValidator('json', createUmrahPackageSchema), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const data = c.req.valid('json');
  const now = Math.floor(Date.now() / 1000);
  try {
    const id = crypto.randomUUID();
    await db.insert(umrahPackages).values({ ...data, id, createdAt: now, updatedAt: now });
    await auditEvent(c as any, { action: 'UMRAH_PACKAGE_CREATED', entityName: 'umrah_packages', entityId: id, afterState: { name: data.name, tier: data.tier, retailPricePaise: data.retailPricePaise } }).catch(() => {});
    return c.json({ success: true, id, message: 'Umrah package created.' });
  } catch (e: any) {
    return c.json({ error: 'Package creation failed', details: e?.message }, 500);
  }
});

// GET /api/umrah/packages/:id — detail
umrahRouter.get('/packages/:id', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  try {
    const pkg = await db.select().from(umrahPackages).where(eq(umrahPackages.id, c.req.param('id'))).get();
    if (!pkg) return c.json({ error: 'Package not found' }, 404);
    const deps = await db.select().from(groupDepartures).where(eq(groupDepartures.packageId, pkg.id)).orderBy(groupDepartures.departureDate).all();
    return c.json({ success: true, package: pkg, departures: deps });
  } catch (e: any) {
    return c.json({ error: 'Package fetch failed', details: e?.message }, 500);
  }
});

// PATCH /api/umrah/packages/:id — update inventory fields
umrahRouter.patch('/packages/:id', zValidator('json', updateUmrahPackageSchema), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const data = c.req.valid('json');
  const now = Math.floor(Date.now() / 1000);
  try {
    const existing = await db.select().from(umrahPackages).where(eq(umrahPackages.id, c.req.param('id'))).get();
    if (!existing) return c.json({ error: 'Package not found' }, 404);
    await db.update(umrahPackages).set({ ...data, updatedAt: now }).where(eq(umrahPackages.id, existing.id));
    await auditEvent(c as any, { action: 'UMRAH_PACKAGE_UPDATED', entityName: 'umrah_packages', entityId: existing.id, afterState: { name: data.name ?? existing.name } }).catch(() => {});
    return c.json({ success: true, message: 'Package updated.' });
  } catch (e: any) {
    return c.json({ error: 'Package update failed', details: e?.message }, 500);
  }
});

// PATCH /api/umrah/packages/:id/status — lifecycle draft/open/paused/closed/archived
umrahRouter.patch('/packages/:id/status', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { status?: 'draft' | 'open' | 'paused' | 'closed' | 'archived' };
  if (!body.status) return c.json({ error: 'status is required' }, 400);
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const now = Math.floor(Date.now() / 1000);
  try {
    const pkg = await db.select().from(umrahPackages).where(eq(umrahPackages.id, c.req.param('id'))).get();
    if (!pkg) return c.json({ error: 'Package not found' }, 404);
    await db.update(umrahPackages).set({ status: body.status, updatedAt: now }).where(eq(umrahPackages.id, pkg.id));
    await auditEvent(c as any, { action: 'UMRAH_PACKAGE_STATUS', entityName: 'umrah_packages', entityId: pkg.id, beforeState: { status: pkg.status }, afterState: { status: body.status } }).catch(() => {});
    return c.json({ success: true, message: `Package status → ${body.status}.` });
  } catch (e: any) {
    return c.json({ error: 'Status update failed', details: e?.message }, 500);
  }
});

// POST /api/umrah/packages/:id/departures — announce a date for this package
// (capacity 30 default; price/bookingFee fall back to package retail/advance).
umrahRouter.post('/packages/:id/departures', zValidator('json', createDepartureSchema), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const data = c.req.valid('json');
  const now = Math.floor(Date.now() / 1000);
  try {
    const pkg = await db.select().from(umrahPackages).where(eq(umrahPackages.id, c.req.param('id'))).get();
    if (!pkg) return c.json({ error: 'Package not found' }, 404);
    const id = crypto.randomUUID();
    await db.insert(groupDepartures).values({
      id,
      packageId: pkg.id,
      packageTier: pkg.tier,
      departureDate: data.departureDate,
      endDate: data.endDate || null,
      departureCity: data.departureCity || pkg.departureCity || null,
      capacity: data.capacity ?? 30,
      bookedSeats: 0,
      price: data.price ?? pkg.retailPricePaise,
      bookingFee: data.bookingFee ?? pkg.advanceFeePaise,
      status: 'open',
      createdAt: now
    });
    await auditEvent(c as any, { action: 'UMRAH_DEPARTURE_ANNOUNCED', entityName: 'group_departures', entityId: id, afterState: { packageId: pkg.id, date: data.departureDate, capacity: data.capacity ?? 30 } }).catch(() => {});
    return c.json({ success: true, id, message: `Departure announced for ${new Date(data.departureDate * 1000).toLocaleDateString()} (capacity ${data.capacity ?? 30}).` });
  } catch (e: any) {
    return c.json({ error: 'Departure announcement failed', details: e?.message }, 500);
  }
});

// GET /api/umrah/departures/calendar?month=YYYY-MM — availability per announced
// date (capacity 30 groups). Self-heals expired holds before computing.
umrahRouter.get('/departures/calendar', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const month = c.req.query('month'); // YYYY-MM
  const now = Math.floor(Date.now() / 1000);
  try {
    await releaseExpiredHolds(db, now);
    let start = 0, end = Number.MAX_SAFE_INTEGER;
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      const [y, m] = month.split('-').map(Number);
      start = Math.floor(Date.UTC(y, m - 1, 1) / 1000);
      end = Math.floor(Date.UTC(y, m, 1) / 1000) - 1;
    }
    const deps = await db.select().from(groupDepartures)
      .where(and(gte(groupDepartures.departureDate, start), lte(groupDepartures.departureDate, end)))
      .orderBy(groupDepartures.departureDate).all();
    const pkgIds = [...new Set(deps.map(d => d.packageId).filter(Boolean))] as string[];
    const pkgs = pkgIds.length ? await db.select().from(umrahPackages).where(inArray(umrahPackages.id, pkgIds)).all() : [];
    const days = deps.map(d => {
      const pkg = pkgs.find(p => p.id === d.packageId);
      const available = Math.max(0, d.capacity - d.bookedSeats);
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
        available,
        fillPct: d.capacity ? Math.round((d.bookedSeats / d.capacity) * 100) : 0,
        status: d.status,
        pricePaise: d.price,
        advanceFeePaise: d.bookingFee,
        retailPricePaise: pkg?.retailPricePaise ?? d.price,
        soloAvailable: !!pkg?.soloAvailable,
        soloSupplementPaise: pkg?.soloSupplementPaise ?? 0,
      };
    });
    return c.json({ success: true, month: month || null, days, released: 0 });
  } catch (e: any) {
    return c.json({ error: 'Calendar fetch failed', details: e?.message }, 500);
  }
});

// GET /api/umrah/settings — umrah_inventory_enabled (Coming Soon master switch)
umrahRouter.get('/settings', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  try {
    const row = await db.select().from(appSettings).where(eq(appSettings.key, 'umrah_inventory_enabled')).get();
    return c.json({ success: true, enabled: row?.value === 'true' });
  } catch (e: any) {
    return c.json({ error: 'Settings fetch failed', details: e?.message }, 500);
  }
});

// POST /api/umrah/settings — toggle inventory live/coming-soon (owner/manager)
umrahRouter.post('/settings', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { enabled?: boolean };
  if (typeof body.enabled !== 'boolean') return c.json({ error: 'enabled (boolean) is required' }, 400);
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const now = Math.floor(Date.now() / 1000);
  try {
    await db.insert(appSettings).values({ key: 'umrah_inventory_enabled', value: String(body.enabled), updatedAt: now })
      .onConflictDoUpdate({ target: appSettings.key, set: { value: String(body.enabled), updatedAt: now } });
    await auditEvent(c as any, { action: 'SETTINGS_UPDATED', entityName: 'app_settings', entityId: 'umrah_inventory_enabled', afterState: { value: body.enabled } }).catch(() => {});
    return c.json({ success: true, enabled: body.enabled, message: body.enabled ? 'Umrah inventory is LIVE.' : 'Umrah inventory is Coming Soon.' });
  } catch (e: any) {
    return c.json({ error: 'Settings update failed', details: e?.message }, 500);
  }
});

// POST /api/umrah/bookings/:id/confirm-office — staff marks balance settled at
// office (cash/UPI/bank). Records a payments ledger entry + audit + alert.
umrahRouter.post('/bookings/:id/confirm-office', zValidator('json', confirmUmrahOfficeSchema), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const data = c.req.valid('json');
  const now = Math.floor(Date.now() / 1000);
  try {
    const booking = await db.select().from(seatBookings).where(eq(seatBookings.id, data.bookingId)).get();
    if (!booking) return c.json({ error: 'Booking not found' }, 404);
    if (booking.status === 'cancelled') return c.json({ error: 'Booking is cancelled' }, 409);
    if (booking.balancePaid) return c.json({ error: 'Balance already settled' }, 409);

    await db.update(seatBookings).set({ balancePaid: true, status: 'confirmed', updatedAt: now }).where(eq(seatBookings.id, booking.id));

    // Payments ledger entry (integer paise) — resolve client engagement.
    const clientEngagement = await db.select().from(engagements).where(eq(engagements.clientId, booking.clientId)).get();
    if (clientEngagement) {
      await db.insert(payments).values({
        id: crypto.randomUUID(),
        clientId: booking.clientId,
        engagementId: clientEngagement.id,
        amount: data.amountPaise,
        type: 'charge',
        milestoneName: `Umrah balance (office) — booking ${booking.id.slice(0, 8)}`,
        method: data.method,
        referenceNumber: data.referenceNumber || booking.id,
        createdAt: now
      });
    }
    try { await publishSyncEvent(c.env as any, { channel: `client:${booking.clientId}:bookings`, type: 'BOOKING_CONFIRMED', payload: { bookingId: booking.id } }, (c as any).executionCtx); } catch {}
     await auditEvent(c as any, { action: 'UMRAH_BALANCE_OFFICE', entityName: 'seat_bookings', entityId: booking.id, afterState: { amountPaise: data.amountPaise, method: data.method } }).catch(() => {});
    await createStaffAlert(c.env as any, { division: 'umrah', type: 'booking_balance', title: 'Umrah balance settled (office)', body: `Booking ${booking.id.slice(0, 8)} — ₹${(data.amountPaise / 100).toFixed(2)} via ${data.method}`, clientId: booking.clientId, payload: { bookingId: booking.id, amountPaise: data.amountPaise } });
    return c.json({ success: true, message: 'Balance settled. Booking confirmed.' });
  } catch (e: any) {
    return c.json({ error: 'Office confirmation failed', details: e?.message }, 500);
  }
});

// POST /api/umrah/bookings/:id/release — staff releases a hold/reservation
umrahRouter.post('/bookings/:id/release', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const now = Math.floor(Date.now() / 1000);
  try {
    const booking = await db.select().from(seatBookings).where(eq(seatBookings.id, c.req.param('id'))).get();
    if (!booking) return c.json({ error: 'Booking not found' }, 404);
    if (booking.status === 'cancelled') return c.json({ error: 'Already cancelled' }, 409);
    await db.update(seatBookings).set({ status: 'cancelled', updatedAt: now }).where(eq(seatBookings.id, booking.id));
    const dep = await db.select().from(groupDepartures).where(eq(groupDepartures.id, booking.departureId)).get();
    if (dep && dep.bookedSeats > 0) {
      const released = Math.max(0, (booking.paxCount ?? 1));
      await db.update(groupDepartures).set({ bookedSeats: Math.max(0, dep.bookedSeats - released) }).where(eq(groupDepartures.id, dep.id));
    }
    await auditEvent(c as any, { action: 'UMRAH_BOOKING_RELEASED', entityName: 'seat_bookings', entityId: booking.id, afterState: { releasedBy: 'staff', paxCount: booking.paxCount ?? 1 } }).catch(() => {});
    return c.json({ success: true, message: 'Booking released. Seat returned to inventory.' });
  } catch (e: any) {
    return c.json({ error: 'Release failed', details: e?.message }, 500);
  }
});

// GET /api/umrah/departures
umrahRouter.get('/departures', async (c) => {
  if (!c.env || !c.env.DB) {
    return c.json({ error: "DB not available" }, 500);
  }

  const db = getDb(c.env.DB);

  try {
    const list = await db.select().from(groupDepartures).all();
    return c.json({ departures: list });
  } catch (error: any) {
    return c.json({ error: "Failed to fetch group departures", details: error.message }, 500);
  }
});

// GET /api/umrah/bookings
umrahRouter.get('/bookings', async (c) => {
  const clientId = c.req.query('clientId');
  if (!clientId) {
    return c.json({ error: "clientId is required" }, 400);
  }

  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);

  try {
    const list = await db.select()
      .from(seatBookings)
      .where(eq(seatBookings.clientId, clientId))
      .all();

    // Join manually with departures
    const departuresList = await db.select().from(groupDepartures).all();
    const joined = list.map(booking => {
      const dep = departuresList.find(d => d.id === booking.departureId);
      return {
        ...booking,
        departureDate: dep?.departureDate || 0,
        packageTier: dep?.packageTier || 'standard'
      };
    });

    return c.json({ success: true, bookings: joined });
  } catch (error: any) {
    return c.json({ error: "Failed to fetch bookings", details: error.message }, 500);
  }
});

// POST /api/umrah/departures (Create departure — standalone or for a package)
umrahRouter.post('/departures', zValidator('json', createDepartureSchema), async (c) => {
  const data = c.req.valid('json');

  if (!c.env || !c.env.DB) {
    return c.json({ error: "DB not available" }, 500);
  }

  const db = getDb(c.env.DB);

  try {
    const id = crypto.randomUUID();
    // When a packageId is given, inherit tier/city/price/advance from the package.
    let tier = data.packageTier;
    let city: string | null = data.departureCity || null;
    let price = data.price;
    let fee = data.bookingFee;
    if (data.packageId) {
      const pkg = await db.select().from(umrahPackages).where(eq(umrahPackages.id, data.packageId)).get();
      if (pkg) {
        tier = pkg.tier;
        city = city || pkg.departureCity || null;
        price = data.price ?? pkg.retailPricePaise;
        fee = data.bookingFee ?? pkg.advanceFeePaise;
      }
    }
    await db.insert(groupDepartures).values({
      id,
      packageId: data.packageId || null,
      packageTier: tier,
      departureDate: data.departureDate,
      endDate: data.endDate || null,
      departureCity: city,
      capacity: data.capacity ?? 30,
      bookedSeats: 0,
      price,
      bookingFee: fee,
      status: 'open',
      createdAt: Math.floor(Date.now() / 1000)
    });

    return c.json({ success: true, id, message: "Umrah group departure scheduled successfully." });
  } catch (error: any) {
    return c.json({ error: "Departure scheduling failed", details: error.message }, 500);
  }
});

// POST /api/umrah/departures/:id/book (Book a seat)
umrahRouter.post('/departures/:id/book', zValidator('json', bookSeatSchema), async (c) => {
  const departureId = c.req.param('id');
  const data = c.req.valid('json');

  if (!c.env || !c.env.DB) {
    return c.json({ error: "DB not available" }, 500);
  }

  const db = getDb(c.env.DB);

  try {
    // 1. Fetch departure & client
    const dep = await db.select().from(groupDepartures).where(eq(groupDepartures.id, departureId)).get();
    if (!dep) {
      return c.json({ error: "Group departure not found" }, 404);
    }

    const clientRecord = await db.select().from(clients).where(eq(clients.id, data.clientId)).get();
    if (!clientRecord) {
      return c.json({ error: "Client not found" }, 404);
    }

    // 2. Check seats and allocate
    const hasSeats = dep.bookedSeats < dep.capacity;
    const status = hasSeats ? 'confirmed' : 'waitlist';

// 3. Insert booking record
    const bookingId = crypto.randomUUID();
    const nowTs = Math.floor(Date.now() / 1000);
    await db.insert(seatBookings).values({
      id: bookingId,
      departureId,
      clientId: data.clientId,
      status,
      advancePaid: false,
      balancePaid: false,
      createdAt: nowTs,
      updatedAt: nowTs
    });

    // 4. Update booked seats count if confirmed
    if (hasSeats) {
      await db
        .update(groupDepartures)
        .set({
          bookedSeats: dep.bookedSeats + 1
        })
        .where(eq(groupDepartures.id, departureId));
    }

    // 5. Create payment ledger entry for the booking fee (int paise, stored on
    //    the departure) so the seat fee is charged/tracked in the ledger.
    //    payments.engagementId is NOT NULL but the book payload only carries
    //    clientId, so resolve the client's primary engagement; if the client
    //    has none, skip the charge gracefully (seat booking still succeeds).
    const clientEngagement = await db
      .select()
      .from(engagements)
      .where(eq(engagements.clientId, data.clientId))
      .get();

    let paymentId: string | null = null;
    if (clientEngagement) {
      paymentId = crypto.randomUUID();
      await db.insert(payments).values({
        id: paymentId,
        clientId: data.clientId,
        engagementId: clientEngagement.id,
        amount: dep.bookingFee,
        type: 'charge',
        milestoneName: `Umrah seat booking ${departureId}`,
        method: 'bank_transfer',
        referenceNumber: bookingId,
        createdAt: Math.floor(Date.now() / 1000)
      });
    }

    return c.json({
      success: true,
      bookingId,
      status,
      ...(paymentId ? { paymentId } : {}),
      message: hasSeats 
        ? "Seat booked and confirmed." 
        : "Departure full. Added to waiting list."
    });

  } catch (error: any) {
    return c.json({ error: "Booking transaction failed", details: error.message }, 500);
  }
});

// 4. PATCH /api/umrah/departures/:id/status — Manage departure status
umrahRouter.patch('/departures/:id/status', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({})) as { status?: 'open' | 'confirmed' | 'cancelled' };
  const { status } = body;
  if (!status) {
    return c.json({ error: "status is required" }, 400);
  }

  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);

  try {
    const dep = await db.select().from(groupDepartures).where(eq(groupDepartures.id, id)).get();
    if (!dep) {
      return c.json({ error: "Departure not found" }, 404);
    }

    await db.update(groupDepartures)
      .set({ status })
      .where(eq(groupDepartures.id, id));

    // If cancelled, cancel all linked bookings
    if (status === 'cancelled') {
      await db.update(seatBookings)
        .set({ status: 'cancelled' })
        .where(eq(seatBookings.departureId, id));
    }

    return c.json({ success: true, message: `Departure status updated to ${status}.` });
  } catch (error: any) {
    return c.json({ error: "Failed to update status", details: error.message }, 500);
  }
});

// GET /api/umrah/departures/:id/manifest — full passenger manifest for a
// departure: each confirmed/hold/waitlist booking joined with the client's
// name + latest checklist flags (passport/visa/vaccine/ticket). Powers the
// Umrah portal Group Departures Manifest tab with real data.
umrahRouter.get('/departures/:id/manifest', async (c) => {
  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  const departureId = c.req.param('id');

  try {
    const dep = await db.select().from(groupDepartures).where(eq(groupDepartures.id, departureId)).get();
    if (!dep) return c.json({ error: "Group departure not found" }, 404);

    const bookings = await db.select().from(seatBookings).where(eq(seatBookings.departureId, departureId)).all();
    if (bookings.length === 0) {
      return c.json({ success: true, departure: dep, manifest: [] });
    }

    const clientIds = bookings.map(b => b.clientId);
    const allClients = await db.select().from(clients).all();
    const allChecklists = await db.select().from(umrahChecklists).all();
    const allPassengers = await db.select().from(bookingPassengers).all();

    const manifest = bookings.map(bk => {
      const client = allClients.find(cc => cc.id === bk.clientId);
      const checklist = allChecklists.find(cc => cc.bookingId === bk.id);
      const passengers = allPassengers.filter(pp => pp.bookingId === bk.id).map(serializePassenger);
      return {
        bookingId: bk.id,
        status: bk.status,
        occupancy: bk.occupancy || 'shared',
        paxCount: bk.paxCount ?? 1,
        roomConfig: bk.roomConfig ?? null,
        passengers,
        clientId: bk.clientId,
        name: client?.name || bk.clientId,
        phone: client?.phone || null,
        checklistId: checklist?.id || null,
        passportScanned: !!checklist?.passportScanned,
        visaIssued: !!checklist?.visaIssued,
        vaccineCertificate: !!checklist?.vaccineCertificate,
        ticketIssued: !!checklist?.ticketIssued,
      };
    });

    return c.json({ success: true, departure: dep, manifest });
  } catch (error: any) {
    return c.json({ error: "Manifest fetch failed", details: error.message }, 500);
  }
});

// 5. GET /api/umrah/checklists — Retrieve or create default checklist for passenger seat booking
umrahRouter.get('/checklists', async (c) => {
  const bookingId = c.req.query('bookingId');
  if (!bookingId) {
    return c.json({ error: "bookingId is required" }, 400);
  }

  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  const now = Math.floor(Date.now() / 1000);

  try {
    let checklist = await db.select().from(umrahChecklists).where(eq(umrahChecklists.bookingId, bookingId)).get();
    if (!checklist) {
      // Self-heal/Bootstrap default row
      const id = crypto.randomUUID();
      await db.insert(umrahChecklists).values({
        id,
        bookingId,
        passportScanned: false,
        visaIssued: false,
        vaccineCertificate: false,
        ticketIssued: false,
        notes: null,
        updatedAt: now
      });
      checklist = await db.select().from(umrahChecklists).where(eq(umrahChecklists.id, id)).get();
    }
    return c.json({ success: true, checklist });
  } catch (error: any) {
    return c.json({ error: "Failed to fetch checklist", details: error.message }, 500);
  }
});

// 6. PATCH /api/umrah/checklists/:id — Update checklists and check for dispatch task trigger
umrahRouter.patch('/checklists/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({})) as {
    passportScanned?: boolean;
    visaIssued?: boolean;
    vaccineCertificate?: boolean;
    ticketIssued?: boolean;
    notes?: string;
  };

  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  const now = Math.floor(Date.now() / 1000);

  try {
    const entry = await db.select().from(umrahChecklists).where(eq(umrahChecklists.id, id)).get();
    if (!entry) {
      return c.json({ error: "Checklist record not found" }, 404);
    }

    const updateFields: any = {
      updatedAt: now
    };
    if (body.passportScanned !== undefined) updateFields.passportScanned = body.passportScanned;
    if (body.visaIssued !== undefined) updateFields.visaIssued = body.visaIssued;
    if (body.vaccineCertificate !== undefined) updateFields.vaccineCertificate = body.vaccineCertificate;
    if (body.ticketIssued !== undefined) updateFields.ticketIssued = body.ticketIssued;
    if (body.notes !== undefined) updateFields.notes = body.notes;

    await db.update(umrahChecklists).set(updateFields).where(eq(umrahChecklists.id, id));

    const updated = { ...entry, ...updateFields };

    // If all checklist items are verified, schedule the dispatcher task
    if (updated.passportScanned && updated.visaIssued && updated.vaccineCertificate && updated.ticketIssued) {
      // Find the booking & client
      const booking = await db.select().from(seatBookings).where(eq(seatBookings.id, entry.bookingId)).get();
      if (booking) {
        // Schedule final guidelines task
        const taskId = crypto.randomUUID();
        await db.insert(tasks).values({
          id: taskId,
          clientId: booking.clientId,
          title: `Dispatch Umrah Travel Kit & Guidelines`,
          description: `All documents verified for booking ID ${booking.id}. Deliver flight ticket, visa copies, and travel safety guide.`,
          priority: 'medium',
          status: 'open',
          cos: 'standard',
          dueDate: now + 24 * 3600, // 1 day deadline
          createdAt: now,
          updatedAt: now
        });
      }
    }

    return c.json({ success: true, message: "Checklist updated successfully." });
  } catch (error: any) {
    return c.json({ error: "Failed to update checklist", details: error.message }, 500);
  }
});
