import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { createTemplateSchema, createAgreementSchema, signAgreementSchema } from '@opusos/shared';
import { getDb } from '../db/client.js';
import { agreements, agreementTemplates, clauseLibrary, clients, consents, referrals, commissionLedger, payments, engagements } from '../db/schema.js';
import { eq, inArray } from 'drizzle-orm';
import { pickCounselorForDivision, createAssignmentTask } from '../services/leadAssignment.js';
import { auditEvent } from '../middleware/audit.js';

export const agreementsRouter = new Hono<{ Bindings: { DB: D1Database } }>();

// GET /api/agreements/templates
agreementsRouter.get('/templates', async (c) => {
  if (!c.env || !c.env.DB) {
    return c.json({ error: "DB not available" }, 500);
  }

  const db = getDb(c.env.DB);

  try {
    const list = await db.select().from(agreementTemplates).all();
    return c.json({ templates: list });
  } catch (error: any) {
    return c.json({ error: "Failed to fetch templates", details: error.message }, 500);
  }
});

// POST /api/agreements/templates
agreementsRouter.post('/templates', zValidator('json', createTemplateSchema), async (c) => {
  const data = c.req.valid('json');

  if (!c.env || !c.env.DB) {
    return c.json({ error: "DB not available" }, 500);
  }

  const db = getDb(c.env.DB);

  try {
    const id = crypto.randomUUID();
    await db.insert(agreementTemplates).values({
      id,
      name: data.name,
      division: data.division,
      clausesJson: data.clausesJson,
      version: 'v1.0',
      createdAt: Math.floor(Date.now() / 1000)
    });

    return c.json({ success: true, id, message: "Agreement template created successfully." });
  } catch (error: any) {
    return c.json({ error: "Template creation failed", details: error.message }, 500);
  }
});

// GET /api/agreements
agreementsRouter.get('/', async (c) => {
  if (!c.env || !c.env.DB) {
    return c.json({ error: "DB not available" }, 500);
  }

  const db = getDb(c.env.DB);

  try {
    const list = await db.select().from(agreements).all();
    return c.json({ agreements: list });
  } catch (error: any) {
    return c.json({ error: "Failed to fetch agreements", details: error.message }, 500);
  }
});

// POST /api/agreements (Create Draft from Template)
agreementsRouter.post('/', zValidator('json', createAgreementSchema), async (c) => {
  const data = c.req.valid('json');

  if (!c.env || !c.env.DB) {
    return c.json({ error: "DB not available" }, 500);
  }

  const db = getDb(c.env.DB);

  try {
    // 1. Fetch Client & Template
    const clientRecord = await db.select().from(clients).where(eq(clients.id, data.clientId)).get();
    if (!clientRecord) {
      return c.json({ error: "Client not found" }, 404);
    }

    const template = await db.select().from(agreementTemplates).where(eq(agreementTemplates.id, data.templateId)).get();
    if (!template) {
      return c.json({ error: "Template not found" }, 404);
    }

    // 2. Parse Clause IDs and Fetch Clause text
    const clauseIds: string[] = JSON.parse(template.clausesJson);
    if (!Array.isArray(clauseIds) || clauseIds.length === 0) {
      return c.json({ error: "Template contains no clauses" }, 400);
    }

    const matchedClauses = await db
      .select()
      .from(clauseLibrary)
      .where(inArray(clauseLibrary.clauseId, clauseIds))
      .all();

    // 3. Check for mandatory clauses matching division
    const mandatoryClauses = await db
      .select()
      .from(clauseLibrary)
      .where(eq(clauseLibrary.mandatory, true))
      .all();

    const missingMandatory = mandatoryClauses.filter(mc => {
      // If it matches general or template's division, it is required
      if (mc.division !== 'general' && mc.division !== template.division) return false;
      return !clauseIds.includes(mc.clauseId);
    });

    if (missingMandatory.length > 0) {
      return c.json({ 
        error: "Mandatory clauses missing", 
        details: missingMandatory.map(m => m.clauseId) 
      }, 400);
    }

    // Sort matched clauses in original order specified in template
    matchedClauses.sort((a, b) => clauseIds.indexOf(a.clauseId) - clauseIds.indexOf(b.clauseId));

    // 4. Assemble content
    let content = `SERVICE AGREEMENT\n\nParties: Opus Overseas & ${clientRecord.name}\n\n`;
    matchedClauses.forEach((c, idx) => {
      content += `Clause ${idx + 1}: ${c.title}\n${c.body}\n\n`;
    });

    // 5. Save agreement draft
    const agreementId = crypto.randomUUID();
    await db.insert(agreements).values({
      id: agreementId,
      clientId: data.clientId,
      templateId: data.templateId,
      status: 'draft',
      content,
      createdAt: Math.floor(Date.now() / 1000)
    });

    return c.json({ 
      success: true, 
      id: agreementId, 
      content, 
      message: "Agreement draft generated successfully." 
    });

  } catch (error: any) {
    return c.json({ error: "Failed to generate agreement draft", details: error.message }, 500);
  }
});

// POST /api/agreements/:id/sign (eSign capture & DPDP hash logging)
agreementsRouter.post('/:id/sign', zValidator('json', signAgreementSchema), async (c) => {
  const agreementId = c.req.param('id');
  const data = c.req.valid('json');

  if (!c.env || !c.env.DB) {
    return c.json({ error: "DB not available" }, 500);
  }

  const db = getDb(c.env.DB);

  try {
    const agreement = await db.select().from(agreements).where(eq(agreements.id, agreementId)).get();
    if (!agreement) {
      return c.json({ error: "Agreement not found" }, 404);
    }

    if (agreement.status === 'signed') {
      return c.json({ error: "Agreement already signed" }, 400);
    }

    const ipAddress = c.req.header('x-real-ip') || c.req.header('cf-connecting-ip') || '127.0.0.1';
    const userAgent = c.req.header('user-agent') || 'Unknown device';

    // SHA-256 Hashing Helper for DPDP evidentiary audit trail
    const msgBuffer = new TextEncoder().encode(agreement.content);
    const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const sha256Hash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    // 1. Update agreement state to signed
    await db
      .update(agreements)
      .set({
        status: 'signed',
        esignMethod: data.esignMethod,
        ipAddress,
        userAgent,
        sha256Hash,
        signedAt: Math.floor(Date.now() / 1000)
      })
      .where(eq(agreements.id, agreementId));

    // 2. Insert plain English legal consent link in consents table
    const consentNotice = `OpusOS Consent Notice v1.0: Consent to terms and legal bounds of signed Service Agreement ID ${agreementId} with hash checksum ${sha256Hash}.`;
    
    // Hash notice
    const noticeBuffer = new TextEncoder().encode(consentNotice);
    const noticeHashBuffer = await crypto.subtle.digest('SHA-256', noticeBuffer);
    const noticeHashArray = Array.from(new Uint8Array(noticeHashBuffer));
    const noticeHash = noticeHashArray.map(b => b.toString(16).padStart(2, '0')).join('');

    await db.insert(consents).values({
      id: crypto.randomUUID(),
      clientId: agreement.clientId,
      consentType: 'core-processing',
      status: 'granted',
      ipAddress,
      sha256Hash: noticeHash,
      grantedAt: Math.floor(Date.now() / 1000)
    });

    // 3. Partner affiliate interlock (Section 39): if this client came via a partner
    // referral, mature the commission now that they are a signed customer.
    // Commission = referral.commissionRate % of total realized payments (paise, int math).
    try {
      const referral = await db.select().from(referrals).where(eq(referrals.clientId, agreement.clientId)).get();
      if (referral) {
        const paidRows = await db.select().from(payments).where(eq(payments.clientId, agreement.clientId)).all();
        const paidPaise = paidRows.reduce((a: number, p: any) => a + Number(p.amount || 0), 0);
        const commissionPaise = Math.floor((paidPaise * (referral.commissionRate || 5)) / 100);
        await db.update(commissionLedger)
          .set({ amount: commissionPaise, status: 'matured' })
          .where(eq(commissionLedger.referralId, referral.id));
      }
    } catch (refErr: any) {
      // Commission maturation must never block agreement signing.
      console.error('referral commission maturation failed', refErr?.message);
    }

    // Interlock: agreement signed → handover task for the ops team (funnel loop
    // close: customer boundary reached; kick off delivery stage). Fail-open.
    try {
      const eng = await db.select().from(engagements).where(eq(engagements.clientId, agreement.clientId)).get();
      const assignee = await pickCounselorForDivision(db, eng?.division || 'study-abroad');
      const handoverId = crypto.randomUUID();
      await createAssignmentTask(db, {
        taskId: handoverId,
        clientId: agreement.clientId,
        engagementId: eng?.id || null,
        assigneeId: assignee,
        title: `🤝 Handover: ${agreement.clientId} signed agreement`,
        description: `Agreement ${agreement.id} signed (${data.esignMethod}). Begin delivery: collect outstanding balance, assign case owner, open vault stage.`,
        priority: 'high',
        dueInSeconds: 2 * 86400,
        now: Math.floor(Date.now() / 1000),
      });
    } catch (handErr: any) {
      console.error('agreement handover task failed', handErr?.message);
    }

    // Audit trail (DPDP): agreement execution is a legal evidence event.
    await auditEvent(c, {
      action: 'AGREEMENT_SIGNED',
      entityName: 'agreements',
      entityId: agreement.id,
      afterState: {
        clientId: agreement.clientId, esignMethod: data.esignMethod,
        signedAt: Math.floor(Date.now() / 1000),
      },
    });

    return c.json({
      success: true,
      sha256Hash,
      message: "Agreement executed and logged with DPDP evidence trail."
    });

  } catch (error: any) {
    return c.json({ error: "Failed to sign agreement", details: error.message }, 500);
  }
});
