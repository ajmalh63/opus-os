import { Hono } from 'hono';
import { safeExecutionCtx } from '../../lib/webhookDispatcher.js';
import { getDb } from '../../db/client.js';
import { bookings } from '../../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { apiKeyAuth } from '../../middleware/apiKeyAuth.js';
import { idempotency } from '../../middleware/idempotency.js';
import { auditEvent } from '../../middleware/audit.js';
import { dispatchWebhook } from '../../infra/webhookDispatcher.js';

export const v1BookingsRouter = new Hono<{ Bindings: { DB: D1Database } }>();

const now = () => Math.floor(Date.now() / 1000);

// GET /api/v1/bookings — List consultation bookings
v1BookingsRouter.get('/', apiKeyAuth(['bookings:read']), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB unavailable' }, 500);
  const db = getDb(c.env.DB);
  const division = c.req.query('division');
  const status = c.req.query('status');

  try {
    const rows = await db.select().from(bookings).orderBy(desc(bookings.startTime)).limit(50).all();

    let filtered = rows;
    if (division) filtered = filtered.filter((b) => b.division === division);
    if (status) filtered = filtered.filter((b) => b.status === status);

    return c.json({
      success: true,
      data: filtered.map((b: any) => ({
        id: b.id,
        calUid: b.calUid,
        division: b.division,
        title: b.title,
        attendeeName: b.attendeeName,
        attendeeEmail: b.attendeeEmail,
        attendeePhone: b.attendeePhone,
        startTime: b.startTime,
        endTime: b.endTime,
        status: b.status,
        verified: b.verified,
        createdAt: b.createdAt,
      })),
      count: filtered.length,
    });
  } catch (err: any) {
    return c.json({ error: 'Failed to retrieve bookings', details: err.message }, 500);
  }
});

// PATCH /api/v1/bookings/:id/status — Update Booking Status (e.g. completed, no_show)
v1BookingsRouter.patch('/:id/status', apiKeyAuth(['bookings:write']), idempotency(), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB unavailable' }, 500);
  const db = getDb(c.env.DB);
  const id = c.req.param('id') || '';
  const body = await c.req.json().catch(() => ({}));
  const status = body.status;

  if (!status) return c.json({ error: 'Validation Error', message: 'status is required.' }, 400);

  try {
    const booking = await db.select().from(bookings).where(eq(bookings.id, id)).get();
    if (!booking) return c.json({ error: 'Not Found', message: `Booking '${id}' not found.` }, 404);

    await db.update(bookings).set({ status, updatedAt: now() }).where(eq(bookings.id, id)).execute();

    safeExecutionCtx(c)?.waitUntil(
      Promise.all([
        auditEvent(c, {
          action: 'BOOKING_STATUS_CHANGED',
          entityName: 'bookings',
          entityId: id,
          result: 'success',
          category: 'workflow',
          actorType: 'service',
          authMethod: 'service_token',
          beforeState: { status: booking.status },
          afterState: { status },
        }),
        dispatchWebhook(c.env, 'booking.status_changed', {
          bookingId: id,
          attendeeName: booking.attendeeName,
          previousStatus: booking.status,
          newStatus: status,
          updatedAt: now(),
        }),
      ]),
    );

    return c.json({
      success: true,
      data: { id, previousStatus: booking.status, newStatus: status, updatedAt: now() },
    });
  } catch (err: any) {
    return c.json({ error: 'Failed to update booking status', details: err.message }, 500);
  }
});
