import { Hono } from 'hono';
import { getDb } from '../../db/client.js';
import { payments, clients } from '../../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { apiKeyAuth } from '../../middleware/apiKeyAuth.js';
import { idempotency } from '../../middleware/idempotency.js';

export const v1PaymentsRouter = new Hono<{ Bindings: { DB: D1Database } }>();

// GET /api/v1/payments — Query Invoices & Payment Ledger
v1PaymentsRouter.get('/', apiKeyAuth(['payments:read']), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB unavailable' }, 500);
  const db = getDb(c.env.DB);
  const clientId = c.req.query('clientId');
  const status = c.req.query('status');

  try {
    let rows: any[] = [];
    if (clientId) {
      rows = await db
        .select()
        .from(payments)
        .where(eq(payments.clientId, clientId))
        .orderBy(desc(payments.createdAt))
        .all();
    } else {
      rows = await db.select().from(payments).orderBy(desc(payments.createdAt)).limit(50).all();
    }

    if (status) {
      rows = rows.filter((p: any) => p.status === status);
    }

    return c.json({
      success: true,
      data: rows.map((p: any) => ({
        id: p.id,
        clientId: p.clientId,
        amountPaise: p.amount,
        type: p.type,
        milestoneName: p.milestoneName,
        method: p.method,
        status: p.status,
        razorpayPaymentId: p.razorpayPaymentId,
        razorpayShortUrl: p.razorpayShortUrl,
        createdAt: p.createdAt,
      })),
      count: rows.length,
    });
  } catch (err: any) {
    return c.json({ error: 'Failed to retrieve payments', details: err.message }, 500);
  }
});
