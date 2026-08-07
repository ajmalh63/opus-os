import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { createDepartureSchema, bookSeatSchema } from '@opusos/shared';
import { getDb } from '../db/client.js';
import { groupDepartures, seatBookings, clients } from '../db/schema.js';
import { eq } from 'drizzle-orm';

export const umrahRouter = new Hono<{ Bindings: { DB: D1Database } }>();

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

// POST /api/umrah/departures (Create departure)
umrahRouter.post('/departures', zValidator('json', createDepartureSchema), async (c) => {
  const data = c.req.valid('json');

  if (!c.env || !c.env.DB) {
    return c.json({ error: "DB not available" }, 500);
  }

  const db = getDb(c.env.DB);

  try {
    const id = crypto.randomUUID();
    await db.insert(groupDepartures).values({
      id,
      packageTier: data.packageTier,
      departureDate: data.departureDate,
      capacity: 30,
      bookedSeats: 0,
      price: data.price,
      bookingFee: data.bookingFee,
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
    await db.insert(seatBookings).values({
      id: bookingId,
      departureId,
      clientId: data.clientId,
      status,
      createdAt: Math.floor(Date.now() / 1000)
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

    return c.json({
      success: true,
      bookingId,
      status,
      message: hasSeats 
        ? "Seat booked and confirmed." 
        : "Departure full. Added to waiting list."
    });

  } catch (error: any) {
    return c.json({ error: "Booking transaction failed", details: error.message }, 500);
  }
});
