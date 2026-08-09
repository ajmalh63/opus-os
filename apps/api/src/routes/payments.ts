import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { createPaymentSchema } from '@opusos/shared';
import { getDb } from '../db/client.js';
import { payments, engagements, milestones, clients, businessProfile } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { auditEvent } from '../middleware/audit.js';

export const paymentsRouter = new Hono<{ Bindings: { DB: D1Database } }>();

// GET /api/payments/client/:clientId
paymentsRouter.get('/client/:clientId', async (c) => {
  const clientId = c.req.param('clientId');
  if (!c.env || !c.env.DB) {
    return c.json({ error: "DB not available" }, 500);
  }

  const db = getDb(c.env.DB);

  try {
    const list = await db.select().from(payments).where(eq(payments.clientId, clientId)).all();
    return c.json({ payments: list });
  } catch (error: any) {
    return c.json({ error: "Failed to fetch payments", details: error.message }, 500);
  }
});

// GET /api/payments/engagement/:engagementId
paymentsRouter.get('/engagement/:engagementId', async (c) => {
  const engagementId = c.req.param('engagementId');
  if (!c.env || !c.env.DB) {
    return c.json({ error: "DB not available" }, 500);
  }

  const db = getDb(c.env.DB);

  try {
    const list = await db.select().from(payments).where(eq(payments.engagementId, engagementId)).all();
    return c.json({ payments: list });
  } catch (error: any) {
    return c.json({ error: "Failed to fetch payments", details: error.message }, 500);
  }
});

// POST /api/payments (Create Payment Ledger Entry & Adjust Outstanding Balance)
paymentsRouter.post('/', zValidator('json', createPaymentSchema), async (c) => {
  const data = c.req.valid('json');

  if (!c.env || !c.env.DB) {
    return c.json({ error: "DB not available" }, 500);
  }

  const db = getDb(c.env.DB);

  try {
    // 1. Fetch referenced engagement
    const eng = await db.select().from(engagements).where(eq(engagements.id, data.engagementId)).get();
    if (!eng) {
      return c.json({ error: "Engagement not found" }, 404);
    }

    // 2. Compute GST if invoice/charge
    let gstInfo = {
      taxableAmount: null as number | null,
      cgst: null as number | null,
      sgst: null as number | null,
      igst: null as number | null,
      isInterstate: null as boolean | null
    };

    if (data.type === 'invoice' || data.type === 'charge') {
      const isInter = !!data.isInterstate;
      const taxable = Math.round(data.amount / 1.18);
      const gstTotal = data.amount - taxable;
      
      if (isInter) {
        gstInfo = {
          taxableAmount: taxable,
          cgst: 0,
          sgst: 0,
          igst: gstTotal,
          isInterstate: true
        };
      } else {
        const cgst = Math.floor(gstTotal / 2);
        const sgst = gstTotal - cgst;
        gstInfo = {
          taxableAmount: taxable,
          cgst,
          sgst,
          igst: 0,
          isInterstate: false
        };
      }
    }

    // 3. Insert payment ledger row (amount is strictly integer paise!)
    const paymentId = crypto.randomUUID();
    await db.insert(payments).values({
      id: paymentId,
      clientId: data.clientId,
      engagementId: data.engagementId,
      amount: data.amount,
      type: data.type,
      milestoneName: data.milestoneName,
      method: data.method,
      referenceNumber: data.referenceNumber,
      taxableAmount: gstInfo.taxableAmount,
      cgst: gstInfo.cgst,
      sgst: gstInfo.sgst,
      igst: gstInfo.igst,
      isInterstate: gstInfo.isInterstate,
      createdAt: Math.floor(Date.now() / 1000)
    });

    // 4. Compute balance adjustment
    // Outstanding = Charges/Invoices - Receipts + Refunds
    let adjustment = 0;
    if (data.type === 'invoice' || data.type === 'charge') {
      adjustment = data.amount;
    } else if (data.type === 'receipt') {
      adjustment = -data.amount;
    } else if (data.type === 'refund') {
      adjustment = data.amount;
    }

    const newBalance = eng.outstandingBalance + adjustment;

    // 4. Update outstanding balance in engagements
    await db
      .update(engagements)
      .set({
        outstandingBalance: newBalance,
        updatedAt: Math.floor(Date.now() / 1000)
      })
      .where(eq(engagements.id, data.engagementId));

    // Audit trail (DPDP): ledger entry + balance transition are regulatory facts.
    await auditEvent(c, {
      action: 'PAYMENT_ENTER',
      entityName: 'payments',
      entityId: paymentId,
      afterState: {
        clientId: data.clientId, engagementId: data.engagementId,
        amount: data.amount, type: data.type, method: data.method,
        newBalance, gst: { cgst: gstInfo.cgst, sgst: gstInfo.sgst, igst: gstInfo.igst },
      },
    });

    return c.json({
      success: true,
      id: paymentId,
      adjustedBalance: newBalance,
      message: "Payment entry successfully processed in ledger."
    });

  } catch (error: any) {
    return c.json({ error: "Payment processing transaction failed", details: error.message }, 500);
  }
});

paymentsRouter.get('/milestones', async (c) => {
  if (!c.env || !c.env.DB) {
    return c.json({ error: "DB not available" }, 500);
  }

  const db = getDb(c.env.DB);

  try {
    const list = await db.select().from(milestones).all();
    return c.json({ milestones: list });
  } catch (error: any) {
    return c.json({ error: "Failed to fetch milestones", details: error.message }, 500);
  }
});

paymentsRouter.post('/milestones/evaluate-escalations', async (c) => {
  if (!c.env || !c.env.DB) {
    return c.json({ error: "DB not available" }, 500);
  }

  const db = getDb(c.env.DB);
  const now = Math.floor(Date.now() / 1000);

  try {
    const pendingMilestones = await db
      .select()
      .from(milestones)
      .where(eq(milestones.status, 'pending'))
      .all();

    let updatedCount = 0;
    const updates = [];

    for (const m of pendingMilestones) {
      if (now <= m.dueDate) continue;

      const secondsOverdue = now - m.dueDate;
      const daysOverdue = Math.floor(secondsOverdue / 86400);

      let newLevel: 'none' | 'yellow' | 'orange' | 'red' | 'hold' = 'none';
      if (daysOverdue >= 30) {
        newLevel = 'hold';
      } else if (daysOverdue >= 14) {
        newLevel = 'orange';
      } else if (daysOverdue >= 7) {
        newLevel = 'yellow';
      }

      if (newLevel !== m.overdueLevel) {
        await db
          .update(milestones)
          .set({
            overdueLevel: newLevel,
            updatedAt: now
          })
          .where(eq(milestones.id, m.id));

        updates.push({
          id: m.id,
          label: m.label,
          daysOverdue,
          oldLevel: m.overdueLevel,
          newLevel
        });
        updatedCount++;
      }
    }

    return c.json({
      success: true,
      evaluatedCount: pendingMilestones.length,
      updatedCount,
      updates
    });

  } catch (error: any) {
    return c.json({ error: "Escalation evaluation transaction failed", details: error.message }, 500);
  }
});


