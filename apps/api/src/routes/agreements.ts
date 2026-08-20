import { auditBounded } from '../middleware/audit.js';
import { resolveClientByToken } from '../lib/clientToken.js';
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { createTemplateSchema, createAgreementSchema, signAgreementSchema } from '@opusos/shared';
import { getDb } from '../db/client.js';
import { agreements, agreementTemplates, clauseLibrary, clients, consents, referrals, commissionLedger, payments, engagements, verifications } from '../db/schema.js';
import { eq, inArray } from 'drizzle-orm';
import { pickCounselorForDivision, createAssignmentTask } from '../services/leadAssignment.js';
import { auditEvent } from '../middleware/audit.js';
import { sendNotification } from '../infra/notify.js';
import { accrueIncentives } from '../services/incentiveAccrual.js';
import { accruePartnerPoints } from '../services/partnerLoyalty.js';

export const agreementsRouter = new Hono<{ Bindings: { DB: D1Database } }>();

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

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
    return c.json({ error: "Failed to fetch templates",  }, 500);
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
    return c.json({ error: "Template creation failed",  }, 500);
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
    return c.json({ error: "Failed to fetch agreements",  }, 500);
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

    // Dispatch instant WhatsApp e-Sign link via Chatwoot & OpenWA (Async / Fail-open)
    try {
      if (clientRecord.phone) {
        const { dispatchUnifiedWhatsApp } = await import('../infra/chatwootBridge.js');
        dispatchUnifiedWhatsApp(c.env as any, {
          phone: clientRecord.phone,
          name: clientRecord.name,
          email: clientRecord.email || undefined,
          templateKey: 'AGREEMENT_SIGN_LINK',
          variables: {
            name: clientRecord.name,
            division: template.division || 'Opus Overseas Advisory',
            signUrl: `https://opusoverseas.com/sign/${agreementId}`,
            expiresInHours: '48',
          },
          division: template.division || 'general',
          tags: ['agreement-sent', 'esign-pending'],
        }).catch(() => {});
      }
    } catch { /* fail-open */ }

    return c.json({ 
      success: true, 
      id: agreementId, 
      content, 
      message: "Agreement draft generated successfully." 
    });

  } catch (error: any) {
    return c.json({ error: "Failed to generate agreement draft",  }, 500);
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
    await auditEvent(c, {
      action: 'CONSENT_GRANTED', entityName: 'consents', entityId: agreement.clientId,
      afterState: { clientId: agreement.clientId, consentType: 'core-processing', via: 'agreement-sign', status: 'granted' },
    });

    // 3. Partner affiliate interlock (Section 39): if this client came via a partner
    // referral, mature the commission now that they are a signed customer.
    // Commission = referral.commissionRate % of total realized payments (paise, int math).
    try {
      const referral = await db.select().from(referrals).where(eq(referrals.clientId, agreement.clientId)).get();
      if (referral) {
        const paidRows = await db.select().from(payments).where(eq(payments.clientId, agreement.clientId)).all();
        // Realized money = receipts (confirmed/synced/paid) minus refunds — never
        // sum invoices/charges (owed, not received) or refunds (money out).
        const realizedPaise = paidRows.reduce((a: number, p: any) => {
          if (p.type !== 'receipt' && p.type !== 'refund') return a;
          if (!['confirmed', 'synced', 'paid'].includes(p.status)) return a;
          const amt = Number(p.amount || 0);
          return p.type === 'refund' ? a - Math.abs(amt) : a + amt;
        }, 0);
        const commissionPaise = Math.max(0, Math.floor((realizedPaise * (referral.commissionRate || 5)) / 100));
        const ledgerRow = await db.select().from(commissionLedger).where(eq(commissionLedger.referralId, referral.id)).get();
        // Never regress an already-paid commission; only mature pending rows.
        if (ledgerRow && ledgerRow.status !== 'paid') {
          await db.update(commissionLedger)
            .set({ amount: commissionPaise, status: 'matured' })
            .where(eq(commissionLedger.referralId, referral.id));
        }
        // Thrive: client_signed loyalty points for the referring partner
        await accruePartnerPoints({ env: c.env as any, partnerId: referral.partnerId, reason: 'client_signed', referenceKey: agreement.id }).catch(() => {});
      }
    } catch (refErr: any) {
      // Commission maturation must never block agreement signing.
      console.error('referral commission maturation failed', refErr?.message);
    }

    // Interlock: incentive accrual on agreement_signed (plan §29.4) — the
    // assigned counselor earns when the customer boundary is reached. Idempotent.
    try {
      const engRow = await db.select().from(engagements).where(eq(engagements.clientId, agreement.clientId)).get();
      const result = await accrueIncentives({
        env: c.env as any,
        clientId: agreement.clientId,
        engagementId: engRow?.id || null,
        triggerRef: agreement.id,
        trigger: 'agreement_signed',
      });
      if (result.accrued > 0) console.log(`incentives accrued: ${result.accrued} (agreement ${agreement.id})`);
    } catch (incErr: any) {
      console.error('incentive accrual failed', incErr?.message);
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
        title: `Handover: ${agreement.clientId} signed agreement`,
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

    // §7.6 Transactional email — signed-agreement summary to the client
    // (fail-open; dev stub channel, prod CF Email binding).
    try {
      const client = await db.select().from(clients).where(eq(clients.id, agreement.clientId)).get();
      if (client?.email) {
        await sendNotification(c.env as any, db as any, {
          channel: 'email',
          to: client.email,
          subject: `Your service agreement is signed — ${agreement.id}`,
          body: `Hi ${client.name}, your service agreement (${agreement.id}) with Opus Overseas has been executed via ${data.esignMethod}. We are starting delivery. Thank you — Opus Overseas.`,
          clientId: client.id,
        });
      }
    } catch (emailErr: any) {
      console.error('agreement email failed', emailErr?.message);
    }

    // Conversion Goal Exit Engine: Immediately suppress prospecting drips and promote in Mautic + Chatwoot
    try {
      const eng = await db.select().from(engagements).where(eq(engagements.clientId, agreement.clientId)).get();
      const { handleLeadConversionGoal } = await import('../services/conversionGoals.js');
      handleLeadConversionGoal(c.env, {
        clientId: agreement.clientId,
        division: eng?.division || 'study-abroad',
        goalType: 'AGREEMENT_SIGNED',
        details: { agreementId: agreement.id },
      }, c).catch(() => {});
    } catch { /* fail-open */ }

    return c.json({
      success: true,
      sha256Hash,
      message: "Agreement executed and logged with DPDP evidence trail."
    });

  } catch (error: any) {
    return c.json({ error: "Failed to sign agreement",  }, 500);
  }
});

// ===================================================================
// CLIENT SELF-SERVICE e-SIGN (design doc §3) — token-based, no session.
// Mounted at /api/public/portal/agreements by index.ts. Legal methods:
// typed name, drawn signature (wet_ink), or email OTP. Aadhaar removed.
// ===================================================================
export const portalAgreementsRouter = new Hono<{ Bindings: { DB: D1Database } }>();

const OTP_IDENTIFIER_PREFIX = 'agreement-otp:';
const OTP_TTL_SECONDS = 600; // 10-minute expiry

// GET /api/public/portal/agreements?token=OP-2026-XXXX
// This client's agreements (status draft|sent|signed) with full content.
portalAgreementsRouter.get('/', async (c) => {
  const token = c.req.query('token');
  if (!token) return c.json({ error: 'Token query parameter is required.' }, 400);
  if (!c.env || !c.env.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);

  try {
    const client = await resolveClientByToken(db, token);
    if (!client) return c.json({ error: 'Client not found matching token.' }, 404);

    const rows = await db.select().from(agreements).where(eq(agreements.clientId, token)).all();
    const visible = rows.filter((a) => ['draft', 'sent', 'signed'].includes(a.status));
    return c.json({
      agreements: visible.map((a) => ({
        id: a.id,
        templateId: a.templateId,
        status: a.status,
        esignMethod: a.esignMethod,
        signedAt: a.signedAt,
        createdAt: a.createdAt,
        content: a.content,
      })),
    });
  } catch (error: any) {
    return c.json({ error: 'Failed to fetch agreements',  }, 500);
  }
});

// POST /api/public/portal/agreements/:id/request-otp   body: { token }
// Ownership check → 6-digit code in verifications (10-min expiry) → email.
portalAgreementsRouter.post('/:id/request-otp', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { token?: string };
  const token = body.token || c.req.query('token');
  if (!token) return c.json({ error: 'Token is required' }, 400);
  if (!c.env || !c.env.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);

  try {
    const client = await resolveClientByToken(db, token);
    if (!client) return c.json({ error: 'Client not found for token' }, 404);

    const agreementId = c.req.param('id');
    const agreement = await db.select().from(agreements).where(eq(agreements.id, agreementId)).get();
    if (!agreement) return c.json({ error: 'Agreement not found' }, 404);
    if (agreement.clientId !== token) return c.json({ error: 'Agreement not found' }, 404);
    if (agreement.status !== 'draft' && agreement.status !== 'sent') {
      return c.json({ error: 'Agreement already signed' }, 409);
    }

    // CSPRNG 6-digit code (Math.random is predictable — brute-forceable).
    const code = String(100000 + (crypto.getRandomValues(new Uint32Array(1))[0] % 900000));
    // Store only the SHA-256 hash of the code (never the plaintext OTP at rest),
    // and invalidate any previous code for this agreement (one live code at a time).
    const codeHash = await sha256Hex(code);
    const now = new Date();
    await db.delete(verifications).where(eq(verifications.identifier, `${OTP_IDENTIFIER_PREFIX}${agreementId}`)).catch(() => {});
    await db.insert(verifications).values({
      id: crypto.randomUUID(),
      identifier: `${OTP_IDENTIFIER_PREFIX}${agreementId}`,
      value: codeHash,
      expiresAt: new Date(now.getTime() + OTP_TTL_SECONDS * 1000),
      createdAt: now,
      updatedAt: now,
    });

    // Fail-open: an email failure must never block the OTP flow.
    try {
      await sendNotification(c.env as any, db as any, {
        channel: 'email',
        to: client.email,
        subject: 'Opus Overseas — sign your agreement',
        body: `Dear ${client.name}, your one-time verification code to sign your service agreement (${agreementId}) is ${code}. The code is valid for 10 minutes. If you did not request this, please contact Opus Overseas immediately.`,
        clientId: client.id,
      });
    } catch (emailErr: any) {
      console.error('OTP email failed', emailErr?.message);
    }

    return c.json({ success: true, message: 'OTP sent to your registered email.' });
  } catch (error: any) {
    return c.json({ error: 'Failed to send OTP',  }, 500);
  }
});

// POST /api/public/portal/agreements/:id/sign
// body: { token, esignMethod: typed|otp|wet_ink, signatureData?, otp? }
const portalSignSchema = signAgreementSchema.extend({ token: z.string().min(1) });

portalAgreementsRouter.post('/:id/sign', zValidator('json', portalSignSchema), async (c) => {
  const agreementId = c.req.param('id');
  const data = c.req.valid('json');

  if (!c.env || !c.env.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);

  try {
    // 1. Ownership — token resolves to the client record.
    const client = await resolveClientByToken(db, data.token);
    if (!client) return c.json({ error: 'Client not found for token' }, 404);

    const agreement = await db.select().from(agreements).where(eq(agreements.id, agreementId)).get();
    if (!agreement) return c.json({ error: 'Agreement not found' }, 404);
    if (agreement.clientId !== client.id) return c.json({ error: 'Agreement not found' }, 404);

    // 2. Status gate — only draft|sent may be signed (409 once executed).
    if (agreement.status !== 'draft' && agreement.status !== 'sent') {
      return c.json({ error: 'Agreement already signed' }, 409);
    }

    const now = Math.floor(Date.now() / 1000);

    // 3. Per-method verification — OTP is REQUIRED for every sign method
    // (token alone proves nothing: OP-XXXX ids were brute-forceable; the OTP
    // proves possession of the client's email). Attempts are capped per
    // agreement — identity-independent, so IP rotation can't defeat it.
    if (!data.otp) return c.json({ error: 'OTP is required to sign (sent to your registered email)' }, 400);
    if (data.esignMethod === 'typed' && (!data.signatureData || data.signatureData.trim().length === 0)) {
      return c.json({ error: 'Typed signature (your full name) is required' }, 400);
    }
    if (data.esignMethod === 'wet_ink' && (!data.signatureData || data.signatureData.trim().length === 0)) {
      return c.json({ error: 'Drawn signature is required' }, 400);
    }
    const identifier = `${OTP_IDENTIFIER_PREFIX}${agreementId}`;
    const verification = await db
      .select()
      .from(verifications)
      .where(eq(verifications.identifier, identifier))
      .get();
    const expRaw = (verification as any)?.expiresAt;
    const expiresMs = expRaw instanceof Date ? expRaw.getTime() : Number(expRaw) * 1000;
    const expired = !verification || !expiresMs || expiresMs <= Date.now();
    const otpAttempts = Number((verification as any)?.attempts || 0);
    if (expired || otpAttempts >= 5) {
      await auditBounded(c, {
        action: 'SIGN_OTP_LOCKED', entityName: 'agreements', entityId: agreementId,
        result: 'denied', category: 'access', actorType: 'public', authMethod: 'secret',
        afterState: { reason: expired ? 'expired' : 'attempts_exhausted' },
      }, 'webhook');
      return c.json({ error: 'Verification code expired or too many attempts — request a new code' }, 429);
    }
    const providedHash = await sha256Hex(String(data.otp || ''));
    if (verification.value !== providedHash) {
      // Constant-time-ish compare + count the failed attempt.
      await db.update(verifications)
        .set({ attempts: otpAttempts + 1, updatedAt: new Date() })
        .where(eq(verifications.identifier, identifier)).catch(() => {});
      return c.json({ error: 'Invalid or expired OTP' }, 400);
    }
    // One-time use — consume the verification row.
    await db.delete(verifications).where(eq(verifications.identifier, identifier));

    // 4. Capture evidence: IP, user-agent, SHA-256 of the signed content.
    const ipAddress = c.req.header('cf-connecting-ip') || c.req.header('x-real-ip') || '127.0.0.1';
    const userAgent = c.req.header('user-agent') || 'Unknown device';
    const hash = await sha256Hex(agreement.content);

    // 5. Execute.
    await db
      .update(agreements)
      .set({
        status: 'signed',
        esignMethod: data.esignMethod,
        ipAddress,
        userAgent,
        sha256Hash: hash,
        signedAt: now,
      })
      .where(eq(agreements.id, agreementId));

    // 6. DPDP audit trail (category compliance).
    await auditEvent(c, {
      action: 'AGREEMENT_SIGNED',
      entityName: 'agreements',
      entityId: agreement.id,
      category: 'compliance',
      afterState: { clientId: agreement.clientId, method: data.esignMethod, hash },
    });

    return c.json({ success: true, signedAt: now, hash });
  } catch (error: any) {
    return c.json({ error: 'Failed to sign agreement',  }, 500);
  }
});
