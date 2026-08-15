import { Hono } from 'hono';
import { getDb } from '../db/client.js';
import { clients, attestationApplications, engagements, tasks } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { auditEvent } from '../middleware/audit.js';

export const attestationRouter = new Hono<{ Bindings: { DB: D1Database } }>();

// 1. GET /api/attestation/applications — Retrieve attestation application records for a client
attestationRouter.get('/applications', async (c) => {
  const clientId = c.req.query('clientId');
  if (!clientId) {
    return c.json({ error: "clientId is required" }, 400);
  }

  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);

  try {
    const list = await db.select()
      .from(attestationApplications)
      .where(eq(attestationApplications.clientId, clientId))
      .all();
    return c.json({ success: true, applications: list });
  } catch (error: any) {
    return c.json({ error: "Failed to fetch attestation applications", details: error.message }, 500);
  }
});

// 2. POST /api/attestation/applications — Create a new attestation application record
attestationRouter.post('/applications', async (c) => {
  const body = await c.req.json().catch(() => ({})) as {
    clientId?: string;
    documentType?: 'degree' | 'diploma' | 'birth_certificate' | 'marriage_certificate' | 'pcc';
    destinationCountry?: string;
    notes?: string;
  };
  const { clientId, documentType, destinationCountry, notes } = body;
  if (!clientId || !documentType || !destinationCountry) {
    return c.json({ error: "Missing required fields: clientId, documentType, destinationCountry" }, 400);
  }

  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  const now = Math.floor(Date.now() / 1000);

  try {
    const id = crypto.randomUUID();
    await db.insert(attestationApplications).values({
      id,
      clientId,
      documentType,
      destinationCountry,
      currentStep: 'hrd',
      status: 'pending',
      notes: notes || null,
      createdAt: now,
      updatedAt: now
    });

    await auditEvent(c as any, {
      action: 'ATTESTATION_CREATE',
      entityName: 'attestation_applications',
      entityId: id,
      afterState: { id, clientId, documentType, destinationCountry }
    }).catch(() => {});

    return c.json({ success: true, id, message: "Attestation application initiated." });
  } catch (error: any) {
    return c.json({ error: "Failed to initiate attestation", details: error.message }, 500);
  }
});

// 3. PATCH /api/attestation/applications/:id — Update step / status
attestationRouter.patch('/applications/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({})) as {
    currentStep?: 'hrd' | 'mea' | 'embassy' | 'apostille';
    status?: 'pending' | 'in_transit' | 'in_progress' | 'completed' | 'rejected';
    notes?: string;
  };

  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  const now = Math.floor(Date.now() / 1000);

  try {
    const existing = await db.select().from(attestationApplications).where(eq(attestationApplications.id, id)).get();
    if (!existing) {
      return c.json({ error: "Attestation application not found" }, 404);
    }

    const updates: any = { updatedAt: now };
    if (body.currentStep !== undefined) updates.currentStep = body.currentStep;
    if (body.status !== undefined) updates.status = body.status;
    if (body.notes !== undefined) updates.notes = body.notes;

    await db.update(attestationApplications).set(updates).where(eq(attestationApplications.id, id));

    // Automation: When status changes to 'completed', auto-schedule dispatch staff Task within 24h
    if (body.status === 'completed' && existing.status !== 'completed') {
      const taskId = crypto.randomUUID();
      const client = await db.select().from(clients).where(eq(clients.id, existing.clientId)).get();
      const clientName = client?.name || existing.clientId;

      // Find attestation active engagement
      const engs = await db.select().from(engagements).where(eq(engagements.clientId, existing.clientId)).all();
      const attestationEng = engs.find(e => e.division === 'attestation');

      await db.insert(tasks).values({
        id: taskId,
        clientId: existing.clientId,
        engagementId: attestationEng?.id || null,
        title: `Dispatch Legalized Documents: ${clientName}`,
        description: `Attestation complete for ${existing.documentType} targeting ${existing.destinationCountry}. Prepare package for courier dispatch.`,
        priority: 'high',
        status: 'open',
        dueDate: now + (24 * 3600), // 24 hours
        createdAt: now,
        updatedAt: now
      });

      // Update engagement stage to completed if exists
      if (attestationEng) {
        await db.update(engagements)
          .set({ stageKey: 'completed', updatedAt: now })
          .where(eq(engagements.id, attestationEng.id));
      }
    }

    await auditEvent(c as any, {
      action: 'ATTESTATION_UPDATE',
      entityName: 'attestation_applications',
      entityId: id,
      afterState: updates
    }).catch(() => {});

    return c.json({ success: true, message: "Attestation application updated successfully." });
  } catch (error: any) {
    return c.json({ error: "Failed to update attestation", details: error.message }, 500);
  }
});
