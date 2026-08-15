import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { createShipmentSchema } from '@opusos/shared';
import { getDb } from '../db/client.js';
import { transitShipments, clients } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { auditEvent } from '../middleware/audit.js';

export const transitRouter = new Hono<{ Bindings: { DB: D1Database } }>();

transitRouter.get('/shipments', async (c) => {
  const clientId = c.req.query('clientId');
  if (!clientId) return c.json({ error: "clientId is required" }, 400);
  if (!c.env || !c.env.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  try {
    const list = await db.select().from(transitShipments).where(eq(transitShipments.clientId, clientId)).all();
    return c.json({ success: true, shipments: list });
  } catch (error: any) {
    return c.json({ error: "Failed to fetch shipments", details: error.message }, 500);
  }
});

// GET /api/transit/shipments/:id
transitRouter.get('/shipments/:id', async (c) => {
  const id = c.req.param('id');

  if (!c.env || !c.env.DB) {
    return c.json({ error: "DB not available" }, 500);
  }

  const db = getDb(c.env.DB);

  try {
    const shipment = await db.select().from(transitShipments).where(eq(transitShipments.id, id)).get();
    if (!shipment) {
      return c.json({ error: "Shipment not found" }, 404);
    }
    return c.json({ shipment });
  } catch (error: any) {
    return c.json({ error: "Failed to fetch shipment details", details: error.message }, 500);
  }
});

// POST /api/transit/shipments
transitRouter.post('/shipments', zValidator('json', createShipmentSchema), async (c) => {
  const data = c.req.valid('json');

  if (!c.env || !c.env.DB) {
    return c.json({ error: "DB not available" }, 500);
  }

  const db = getDb(c.env.DB);

  try {
    const clientRecord = await db.select().from(clients).where(eq(clients.id, data.clientId)).get();
    if (!clientRecord) {
      return c.json({ error: "Client not found" }, 404);
    }

    const id = crypto.randomUUID();
    const estDelivery = Math.floor(Date.now() / 1000) + 5 * 86400; // 5 days from now

    await db.insert(transitShipments).values({
      id,
      clientId: data.clientId,
      courierPartner: data.courierPartner,
      trackingNumber: data.trackingNumber,
      status: 'pickup',
      shippingAddress: data.shippingAddress,
      estimatedDelivery: estDelivery,
      createdAt: Math.floor(Date.now() / 1000),
      updatedAt: Math.floor(Date.now() / 1000)
    });

    return c.json({ success: true, id, trackingNumber: data.trackingNumber, message: "Transit shipment created successfully." });
  } catch (error: any) {
    return c.json({ error: "Failed to create shipment", details: error.message }, 500);
  }
});

// GET /api/transit/shipments/:id/track (Live courier partner mock status events)
transitRouter.get('/shipments/:id/track', async (c) => {
  const id = c.req.param('id');

  if (!c.env || !c.env.DB) {
    return c.json({ error: "DB not available" }, 500);
  }

  const db = getDb(c.env.DB);

  try {
    const shipment = await db.select().from(transitShipments).where(eq(transitShipments.id, id)).get();
    if (!shipment) {
      return c.json({ error: "Shipment not found" }, 404);
    }

    // Mock courier progress events based on partner and tracking number
    const partnerName = shipment.courierPartner === 'blue-dart' ? 'Blue Dart Express' : 'DTDC Courier';
    const events = [
      { status: 'pickup', timestamp: shipment.createdAt, location: "Hyderabad Hub", description: `Shipment received and processing at ${partnerName} facility.` },
      { status: 'in_transit', timestamp: shipment.createdAt + 3600 * 12, location: "Bangalore Sorting Centre", description: "In transit to delivery hub." }
    ];

    if (shipment.status === 'delivered') {
      events.push({
        status: 'delivered',
        timestamp: shipment.updatedAt,
        location: "Destination Address",
        description: "Package successfully delivered and signed by consignee."
      });
    }

    return c.json({
      success: true,
      partner: partnerName,
      trackingNumber: shipment.trackingNumber,
      currentStatus: shipment.status,
      estimatedDelivery: shipment.estimatedDelivery,
      events
    });

  } catch (error: any) {
    return c.json({ error: "Failed to retrieve tracking info", details: error.message }, 500);
  }
});

// POST /api/transit/shipments/:id/sync-carrier (Mock sync to logistics partner)
transitRouter.post('/shipments/:id/sync-carrier', async (c) => {
  const id = c.req.param('id');
  if (!c.env || !c.env.DB) {
    return c.json({ error: "DB not available" }, 500);
  }
  const db = getDb(c.env.DB);
  try {
    const shipment = await db.select().from(transitShipments).where(eq(transitShipments.id, id)).get();
    if (!shipment) {
      return c.json({ error: "Shipment not found" }, 404);
    }

    let nextStatus: 'pickup' | 'in_transit' | 'delivered' = 'in_transit';
    if (shipment.status === 'pickup') {
      nextStatus = 'in_transit';
    } else if (shipment.status === 'in_transit') {
      nextStatus = 'delivered';
    } else {
      nextStatus = 'delivered';
    }

    const now = Math.floor(Date.now() / 1000);
    await db.update(transitShipments).set({
      status: nextStatus,
      updatedAt: now
    }).where(eq(transitShipments.id, id));

    await auditEvent(c as any, {
      action: 'STAGE_CHANGE',
      entityName: 'transit_shipments',
      entityId: id,
      afterState: { id, oldStatus: shipment.status, newStatus: nextStatus }
    }).catch(() => {});

    return c.json({
      success: true,
      id,
      oldStatus: shipment.status,
      newStatus: nextStatus,
      message: `Carrier synced successfully. Status updated to ${nextStatus}.`
    });
  } catch (error: any) {
    return c.json({ error: "Sync failed", details: error.message }, 500);
  }
});
