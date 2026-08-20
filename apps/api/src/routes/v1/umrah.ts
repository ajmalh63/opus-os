import { Hono } from 'hono';
import { getDb } from '../../db/client.js';
import { umrahPackages, groupDepartures, seatBookings, bookingPassengers, clients } from '../../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { apiKeyAuth } from '../../middleware/apiKeyAuth.js';
import { idempotency } from '../../middleware/idempotency.js';
import { auditEvent } from '../../middleware/audit.js';
import { dispatchWebhook } from '../../infra/webhookDispatcher.js';

export const v1UmrahRouter = new Hono<{ Bindings: { DB: D1Database } }>();

const now = () => Math.floor(Date.now() / 1000);
const uid = () => `UB-${now()}-${crypto.randomUUID().slice(0, 8)}`;

// GET /api/v1/umrah/packages — List Packages
v1UmrahRouter.get('/packages', apiKeyAuth(['umrah:read']), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB unavailable' }, 500);
  const db = getDb(c.env.DB);

  try {
    const rows = await db
      .select()
      .from(umrahPackages)
      .orderBy(desc(umrahPackages.createdAt))
      .all();

    return c.json({
      success: true,
      data: rows.map((p: any) => ({
        id: p.id,
        name: p.name,
        tier: p.tier,
        totalDays: p.totalDays,
        makkahHotel: p.makkahHotel,
        madinahHotel: p.madinahHotel,
        departureCity: p.departureCity,
        airline: p.airline,
        soloAvailable: p.soloAvailable,
      })),
      count: rows.length,
    });
  } catch (err: any) {
    return c.json({ error: 'Failed to retrieve Umrah packages', details: err.message }, 500);
  }
});

// GET /api/v1/umrah/departures — List Live Group Departures
v1UmrahRouter.get('/departures', apiKeyAuth(['umrah:read']), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB unavailable' }, 500);
  const db = getDb(c.env.DB);

  try {
    const rows = await db
      .select()
      .from(groupDepartures)
      .where(eq(groupDepartures.status, 'open'))
      .orderBy(groupDepartures.departureDate)
      .all();

    return c.json({
      success: true,
      data: rows.map((d: any) => ({
        id: d.id,
        packageId: d.packageId,
        title: d.title,
        departureDate: d.departureDate,
        endDate: d.endDate,
        departureCity: d.departureCity,
        airline: d.airline,
        capacity: d.capacity,
        bookedSeats: d.bookedSeats,
        availableSeats: Math.max(0, d.capacity - d.bookedSeats),
        status: d.status,
      })),
      count: rows.length,
    });
  } catch (err: any) {
    return c.json({ error: 'Failed to retrieve group departures', details: err.message }, 500);
  }
});

// POST /api/v1/umrah/bookings — Create Party Booking & Hold Seats
v1UmrahRouter.post('/bookings', apiKeyAuth(['umrah:write']), idempotency(), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB unavailable' }, 500);
  const db = getDb(c.env.DB);
  const body = await c.req.json().catch(() => ({}));

  const clientId = (body.clientId || '').trim();
  const departureId = (body.departureId || '').trim();
  const roomConfig = body.roomConfig || 'quad';
  const passengers = Array.isArray(body.passengers) ? body.passengers : [];
  const paxCount = passengers.length || Number(body.paxCount) || 1;

  if (!clientId || !departureId) {
    return c.json({ error: 'Validation Error', message: 'clientId and departureId are required.' }, 400);
  }

  try {
    const dep = await db.select().from(groupDepartures).where(eq(groupDepartures.id, departureId)).get();
    if (!dep) return c.json({ error: 'Not Found', message: `Group departure '${departureId}' not found.` }, 404);

    const availableSeats = dep.capacity - dep.bookedSeats;
    if (availableSeats < paxCount) {
      return c.json(
        {
          error: 'Capacity Exceeded',
          message: `Only ${availableSeats} seats remaining on this departure. Requested: ${paxCount}.`,
          code: 'SEATS_UNAVAILABLE',
        },
        400,
      );
    }

    const bookingId = uid();
    const advanceDuePaise = 50000 * paxCount; // ₹500 advance per pax

    await db.insert(seatBookings).values({
      id: bookingId,
      clientId,
      departureId,
      roomConfig,
      paxCount,
      advancePaid: false,
      balancePaid: false,
      status: 'held',
      reservedUntil: now() + 86400, // 24-hour hold
      createdAt: now(),
      updatedAt: now(),
    });

    // Update booked seats on departure
    await db
      .update(groupDepartures)
      .set({ bookedSeats: dep.bookedSeats + paxCount })
      .where(eq(groupDepartures.id, departureId))
      .execute();

    // Insert passengers
    for (let i = 0; i < passengers.length; i++) {
      const p = passengers[i];
      await db.insert(bookingPassengers).values({
        id: `PAX-${now()}-${crypto.randomUUID().slice(0, 6)}`,
        bookingId,
        name: p.name || `Passenger ${i + 1}`,
        category: p.category || 'adult',
        createdAt: now(),
      });
    }

    c.executionCtx?.waitUntil(
      Promise.all([
        auditEvent(c, {
          action: 'UMRAH_SEATS_HELD',
          entityName: 'seat_bookings',
          entityId: bookingId,
          result: 'success',
          category: 'workflow',
          actorType: 'service',
          authMethod: 'service_token',
          afterState: { clientId, departureId, paxCount, advanceDuePaise },
        }),
        dispatchWebhook(c.env, 'umrah.booking_created', {
          bookingId,
          clientId,
          departureId,
          paxCount,
          status: 'held',
          advanceDuePaise,
          createdAt: now(),
        }),
      ]),
    );

    return c.json(
      {
        success: true,
        data: {
          id: bookingId,
          clientId,
          departureId,
          paxCount,
          roomConfig,
          status: 'held',
          advanceDuePaise,
          reservedUntil: now() + 86400,
          createdAt: now(),
        },
      },
      201,
    );
  } catch (err: any) {
    return c.json({ error: 'Failed to create Umrah booking', details: err.message }, 500);
  }
});
