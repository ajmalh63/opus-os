import { resolveClientByToken } from '../lib/clientToken.js';
import { Hono } from 'hono';
import { getDb } from '../db/client.js';
import { getAuth } from '../auth.js';
import { clients, engagements, consents, documents, payments, experiments, experimentAssignments, tasks, visaApplications, visaMockInterviews, referrals, pipelineStages, users } from '../db/schema.js';
import { accruePartnerPoints } from '../services/partnerLoyalty.js';
import { accrueIncentives } from '../services/incentiveAccrual.js';
import { sendNotification } from '../infra/notify.js';
import { getListmonkTemplateId } from '../infra/listmonk.js';
import { paymentReceiptTemplate } from '../infra/emailTemplates.js';
import { ensurePipelineStages } from '../db/seed.js';
import { eq, and } from 'drizzle-orm';
import { rateLimit } from '../middleware/rateLimit.js';
import { auditEvent } from '../middleware/audit.js';
import { publishSyncEvent } from './sync.js';
import { createStaffAlert } from '../infra/staffAlerts.js';
import { guardUpload, sha256Hex } from '../infra/uploadGuard.js';

export const portalRouter = new Hono<{ Bindings: { DB: D1Database; BETTER_AUTH_SECRET: string; BETTER_AUTH_URL?: string; RAZORPAY_KEY_ID?: string; RAZORPAY_KEY_SECRET?: string } }>();

// Anti-abuse on the public journey lookup (Section 18.2.2): 10 lookups / hour / IP.
portalRouter.use('/lookup', rateLimit({ bucket: 'lookup', windowSeconds: 3600, limit: 10 }));
portalRouter.use('/consent/withdraw', rateLimit({ bucket: 'consent-withdraw', windowSeconds: 3600, limit: 10 }));

function buildJourney(client: any, engs: any[], cons: any[], docs: any[], pays: any[], visaApps: any[] = [], visaMocks: any[] = [], counselor: any = null) {
  return {
    success: true,
    client: {
      id: client.id,
      name: client.name,
      email: client.email,
      portalToken: client.portalToken || client.id,
      createdAt: client.createdAt,
      intakeContext: client.intakeContext
    },
    assignedCounselor: counselor ? {
      name: counselor.name,
      role: counselor.role === 'super_admin' ? 'Senior Advisory Lead' : (counselor.role || 'Senior Counselor'),
      email: counselor.email,
    } : {
      name: 'Central Opus Advisory Desk',
      role: 'Dedicated Lead · Hyderabad HQ',
      email: 'counselors@opusoverseas.com',
    },
    engagements: engs,
    consents: cons.map((x: any) => ({ consentType: x.consentType, status: x.status, grantedAt: x.grantedAt })),
    documents: docs.map((x: any) => ({
      id: x.id, fileName: x.fileName, version: x.version, status: x.status, uploadedAt: x.uploadedAt
    })),
    payments: pays.map((x: any) => ({
      id: x.id, amount: x.amount, type: x.type, milestoneName: x.milestoneName,
      method: x.method, referenceNumber: x.referenceNumber, createdAt: x.createdAt
    })),
    visaApplications: visaApps,
    visaMockInterviews: visaMocks
  };
}

// POST /api/public/portal/consent/withdraw  — DPDP subject-right action.
// Token-authenticated: the client withdraws a previously granted consent type.
// Writes a 'withdrawn' row (immutable history) + audit; only affects future
// outreach — nurture planning already gates on granted-only rows.
portalRouter.post('/consent/withdraw', async (c) => {
  const body = await c.req.json().catch(() => ({})) as { token?: string; consentType?: string };
  const token = body.token || c.req.query('token');
  const consentType = body.consentType;

  if (!token) return c.json({ error: 'Token is required' }, 400);
  if (!consentType) return c.json({ error: 'consentType is required' }, 400);

  const VALID = ['core-processing', 'university-sharing', 'whatsapp-updates', 'marketing-campaigns', 'manpower-retain'];
  if (!VALID.includes(consentType)) return c.json({ error: 'Unknown consent type' }, 400);

  if (!c.env || !c.env.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);

  try {
    const client = await resolveClientByToken(db, token);
    if (!client) return c.json({ error: 'Client not found for token' }, 404);

    const now = Math.floor(Date.now() / 1000);
    await db.insert(consents).values({
      id: crypto.randomUUID(),
      clientId: token,
      consentType: consentType as any,
      status: 'withdrawn',
      ipAddress: c.req.header('x-real-ip') || c.req.header('cf-connecting-ip') || '127.0.0.1',
      sha256Hash: 'withdraw-' + crypto.randomUUID().slice(0, 8),
      grantedAt: now,
      withdrawnAt: now,
    });
    await auditEvent(c, {
      action: 'CONSENT_WITHDRAWN', entityName: 'consents', entityId: token,
      afterState: { clientId: token, consentType, status: 'withdrawn', withdrawnAt: now },
    });
    return c.json({ success: true, message: `Consent '${consentType}' withdrawn. Non-core outreach to this contact is now suppressed.` });
  } catch (error: any) {
    return c.json({ error: 'Consent withdrawal failed',  }, 500);
  }
});

// GET /api/public/portal/lookup?token=OP-2026-X (Public token-based journey lookup, Section 25)
portalRouter.get('/lookup', async (c) => {
  const token = c.req.query('token');

  if (!token) {
    return c.json({ error: "Token query parameter is required." }, 400);
  }
  if (!c.env || !c.env.DB) {
    return c.json({ error: "DB not available" }, 500);
  }

  const db = getDb(c.env.DB);

  try {
    const client = await resolveClientByToken(db, token);
    if (!client) {
      return c.json({ error: "Client not found matching token." }, 404);
    }
    if (client.status === 'blocked') {
      return c.json({ error: "Access Denied: This client has been blocked by system administrator." }, 403);
    }

    const activeEngagements = await db.select().from(engagements).where(eq(engagements.clientId, token)).all();
    const clientConsents = await db.select().from(consents).where(eq(consents.clientId, token)).all();
    const clientDocs = await db.select().from(documents).where(eq(documents.clientId, token)).all();
    const clientPayments = await db.select().from(payments).where(eq(payments.clientId, token)).all();
    const clientVisaApps = await db.select().from(visaApplications).where(eq(visaApplications.clientId, token)).all();
    const clientVisaMocks = await db.select().from(visaMockInterviews).where(eq(visaMockInterviews.clientId, token)).all();

    return c.json(buildJourney(client, activeEngagements, clientConsents, clientDocs, clientPayments, clientVisaApps, clientVisaMocks));
  } catch (error: any) {
    return c.json({ error: "Portal lookup transaction failed",  }, 500);
  }
});

// GET /api/public/portal/session (Authenticated My Journey - Section 25.4)
// Resolves the logged-in user (Better Auth session) to their client record(s) by email.
portalRouter.get('/session', async (c) => {
  if (!c.env || !c.env.DB) {
    return c.json({ error: "DB not available" }, 500);
  }

  const db = getDb(c.env.DB);
  const auth = getAuth(c.env);
  const sessionResult = await auth.api.getSession({ headers: c.req.raw.headers });

  if (!sessionResult?.user) {
    return c.json({ error: "Not authenticated. Please sign in." }, 401);
  }

  try {
    const user = sessionResult.user;
    let clientList = await db.select().from(clients).where(eq(clients.email, user.email)).all();

    if (clientList.some(c => c.status === 'blocked')) {
      return c.json({ error: "Access Denied: Your account has been blocked by system administrator." }, 403);
    }

    // Self-heal: ensure authenticated client account has a client record & portal token
    if (clientList.length === 0) {
      const newId = `OP-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
      const pToken = crypto.randomUUID().replace(/-/g, '');
      const now = Math.floor(Date.now() / 1000);
      const newClient = {
        id: newId,
        name: user.name || user.email.split('@')[0],
        email: user.email,
        phone: '',
        portalToken: pToken,
        status: 'active',
        createdAt: now,
        updatedAt: now,
      };
      await db.insert(clients).values(newClient).catch(() => {});
      clientList = [newClient as any];
    }

    const allUsers = await db.select().from(users).all();
    const userById = new Map(allUsers.map((u: any) => [u.id, u]));

    const journeys = [];
    for (const client of clientList) {
      const engs = await db.select().from(engagements).where(eq(engagements.clientId, client.id)).all();
      const cons = await db.select().from(consents).where(eq(consents.clientId, client.id)).all();
      const docs = await db.select().from(documents).where(eq(documents.clientId, client.id)).all();
      const pays = await db.select().from(payments).where(eq(payments.clientId, client.id)).all();
      const visaApps = await db.select().from(visaApplications).where(eq(visaApplications.clientId, client.id)).all();
      const visaMocks = await db.select().from(visaMockInterviews).where(eq(visaMockInterviews.clientId, client.id)).all();
      
      const counselorId = engs.find((e: any) => e.counselorId)?.counselorId;
      const assignedCounselor = counselorId ? userById.get(counselorId) : (allUsers.find((u: any) => u.role === 'counselor' || u.role === 'manager' || u.role === 'super_admin') || null);

      journeys.push(buildJourney(client, engs, cons, docs, pays, visaApps, visaMocks, assignedCounselor));
    }

    return c.json({ success: true, authenticated: true, email: user.email, journeys });
  } catch (error: any) {
    return c.json({ error: "Portal session transaction failed",  }, 500);
  }
});

// POST /api/public/portal/claim (Link a journey token to the authenticated account, Section 25.7)
// Body: { token, phone } - verifies phone matches the client record, then links email.
portalRouter.post('/claim', async (c) => {
  if (!c.env || !c.env.DB) {
    return c.json({ error: "DB not available" }, 500);
  }

  const db = getDb(c.env.DB);
  const auth = getAuth(c.env);
  const sessionResult = await auth.api.getSession({ headers: c.req.raw.headers });

  if (!sessionResult?.user) {
    return c.json({ error: "Not authenticated. Please sign in." }, 401);
  }

  try {
    const body = await c.req.json();
    const token = String(body.token || '').trim();
    const phone = String(body.phone || '').trim();

    if (!token || !phone) {
      return c.json({ error: "Missing required fields: token, phone" }, 400);
    }

    const client = await resolveClientByToken(db, token);
    if (!client) {
      return c.json({ error: "Client not found matching token." }, 404);
    }

    // Verify phone matches the client record (ownership proof)
    const normalizedTokenPhone = phone.replace(/\s+/g, '');
    const normalizedClientPhone = (client.phone || '').replace(/\s+/g, '');
    if (normalizedTokenPhone !== normalizedClientPhone) {
      return c.json({ error: "Phone number does not match the journey token." }, 403);
    }

    // Link: bind the session to the client. SECURITY: never overwrite the
    // client's email from an unverified claim — an attacker with a token+phone
    // could redirect ALL OTP emails (incl. agreement-sign codes) to their own
    // mailbox. Only bind when the emails match or the client has no email yet.
    const sessionEmail = String(sessionResult.user.email || '').toLowerCase();
    const clientEmail = String(client.email || '').toLowerCase();
    if (clientEmail && clientEmail !== sessionEmail) {
      return c.json({ error: "This journey is linked to a different email. Contact support to update it." }, 403);
    }
    if (!clientEmail) {
      await db
        .update(clients)
        .set({ email: sessionResult.user.email, updatedAt: Math.floor(Date.now() / 1000) })
        .where(eq(clients.id, client.id));
    }

    const engs = await db.select().from(engagements).where(eq(engagements.clientId, token)).all();
    const cons = await db.select().from(consents).where(eq(consents.clientId, token)).all();
    const docs = await db.select().from(documents).where(eq(documents.clientId, token)).all();
    const pays = await db.select().from(payments).where(eq(payments.clientId, token)).all();

    return c.json({
      success: true,
      message: "Journey linked to your account.",
      journey: buildJourney(client, engs, cons, docs, pays)
    });
  } catch (error: any) {
    return c.json({ error: "Portal claim transaction failed",  }, 500);
  }
});

// GET /api/public/experiments/:key/variant?clientId=
// Deterministic A/B assignment for a client (sticky — first call wins). Returns
// 'none' if the experiment isn't active or no clientId given. Public: called by
// the lead form BEFORE a client record exists, so it accepts clientId lazily.
portalRouter.get('/experiments/:key/variant', async (c) => {
  if (!c.env || !c.env.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  const key = c.req.param('key');
  const clientId = c.req.query('clientId');
  const now = Math.floor(Date.now() / 1000);
  try {
    const exp = await db.select().from(experiments).where(eq(experiments.key, key)).get();
    if (!exp) return c.json({ success: true, variant: 'none' });
    if (exp.status !== 'active') return c.json({ success: true, variant: 'none' });

    if (clientId) {
      const existing = await db.select().from(experimentAssignments)
        .where(and(eq(experimentAssignments.experimentKey, key), eq(experimentAssignments.clientId, clientId)))
        .get();
      if (existing) return c.json({ success: true, key, experimentId: exp.id, variant: existing.variant, sticky: true });

      const variant = (exp.id.charCodeAt(0) + (clientId.length || 0)) % 2 === 0 ? 'A' : 'B';
      await db.insert(experimentAssignments).values({
        id: crypto.randomUUID(),
        experimentKey: key,
        clientId,
        variant,
        createdAt: now,
      });
      return c.json({ success: true, key, experimentId: exp.id, variant, sticky: false });
    }

    return c.json({ success: true, key, experimentId: exp.id, variant: 'none', message: 'Pass clientId to lock in an assignment.' });
  } catch (error: any) {
    return c.json({ error: "Variant lookup failed",  }, 500);
  }
});

// Helper for signing upload URLs
const signUploadPath = async (secret: string, clientId: string, filename: string, expires: number): Promise<string> => {
  if (!secret) throw new Error("BETTER_AUTH_SECRET not configured — cannot sign upload URL");
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const data = `${clientId}:${filename}:${expires}`;
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
};

// GET /api/public/portal/documents/presigned
portalRouter.get('/documents/presigned', async (c) => {
  const token = c.req.query('token');
  const filename = c.req.query('filename');
  if (!token || !filename) {
    return c.json({ error: "Missing token or filename" }, 400);
  }
  if (!c.env || !c.env.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  try {
    const client = await resolveClientByToken(db, token);
    if (!client) return c.json({ error: "Client not found matching token" }, 404);

    const expires = Math.floor(Date.now() / 1000) + 900;
    const secret = c.env.BETTER_AUTH_SECRET;
    const signature = await signUploadPath(secret, token, filename, expires);

    const presignedUrl = `/api/public/portal/documents/upload?token=${token}&filename=${encodeURIComponent(filename)}&expires=${expires}&signature=${signature}`;
    return c.json({ success: true, url: presignedUrl, expires });
  } catch (error: any) {
    return c.json({ error: "Presigned URL generation failed",  }, 500);
  }
});

// PUT /api/public/portal/documents/upload
portalRouter.put('/documents/upload', async (c) => {
  const token = c.req.query('token');
  const filename = c.req.query('filename');
  const expiresStr = c.req.query('expires');
  const signature = c.req.query('signature');

  if (!token || !filename || !expiresStr || !signature) {
    return c.json({ error: "Missing upload parameters" }, 400);
  }

  const expires = Number(expiresStr);
  if (Math.floor(Date.now() / 1000) > expires) {
    return c.json({ error: "Upload URL has expired" }, 400);
  }

  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const secret = c.env.BETTER_AUTH_SECRET;
  if (!secret) return c.json({ error: "BETTER_AUTH_SECRET not configured" }, 500);

  const expectedSig = await signUploadPath(secret, token, filename, expires);

  // Constant-time compare
  let diff = 0;
  if (signature.length !== expectedSig.length) return c.json({ error: "Invalid upload signature" }, 400);
  for (let i = 0; i < signature.length; i++) {
    diff |= (signature.charCodeAt(i) ^ expectedSig.charCodeAt(i));
  }
  if (diff !== 0) return c.json({ error: "Invalid upload signature" }, 400);

  const db = getDb(c.env.DB);
  const fileBody = await c.req.arrayBuffer();
  const bytes = new Uint8Array(fileBody);

  // OWASP upload hardening: allowlist + size cap + magic-byte sniff (client self-upload).
  const guard = guardUpload('document', filename, bytes.byteLength, bytes);
  if (!guard.ok) return c.json({ error: guard.error }, (guard.status || 400) as any);
  const safeName = guard.safeName!;
  const mimeType = guard.mimeType!;
  const digest = await sha256Hex(bytes);

  try {
    const r2Key = `${crypto.randomUUID()}-${safeName}`;
    const bucket = (c.env as any).BUCKET;
    if (bucket) {
      await bucket.put(r2Key, fileBody, { httpMetadata: { contentType: mimeType } });
    }

    const existingDocs = await db
      .select()
      .from(documents)
      .where(and(eq(documents.clientId, token), eq(documents.fileName, safeName)))
      .all();

    let version = "v1.0";
    if (existingDocs.length > 0) {
      const versions = existingDocs.map(d => {
        const match = d.version.match(/v(\d+)\.(\d+)/);
        return match ? parseFloat(`${match[1]}.${match[2]}`) : 1.0;
      });
      const maxVer = Math.max(...versions);
      version = `v${(maxVer + 1.0).toFixed(1)}`;
    }

    const docId = crypto.randomUUID();
    await db.insert(documents).values({
      id: docId,
      clientId: token,
      fileName: safeName,
      r2Key,
      version,
      status: 'pending',
      uploadedAt: Math.floor(Date.now() / 1000),
      sizeBytes: bytes.byteLength,
      mimeType,
      sha256: digest,
      uploadedBy: 'client'
    });

    // Automatically create a document verification task
    const engs = await db.select().from(engagements).where(eq(engagements.clientId, token)).all();
    const primaryEng = engs[0];
    if (primaryEng) {
      await db.insert(tasks).values({
        id: crypto.randomUUID(),
        clientId: token,
        engagementId: primaryEng.id,
        assigneeId: null,
        title: `Verify uploaded document: ${safeName}`,
        description: `Client ${token} uploaded ${safeName} (${version}) via public portal. Please review.`,
        priority: 'medium',
        status: 'open',
        cos: 'standard',
        createdAt: Math.floor(Date.now() / 1000),
        updatedAt: Math.floor(Date.now() / 1000)
      }).catch(() => {});
    }

    await auditEvent(c as any, {
      action: 'DOC_UPLOAD',
      entityName: 'documents',
      entityId: docId,
      afterState: { clientId: token, fileName: safeName, version, status: 'pending' }
    }).catch(() => {});
    try { await publishSyncEvent(c.env as any, { channel: `client:${token}:documents`, type: 'DOCUMENT_UPLOADED', payload: { documentId: docId, fileName: safeName, version } }, (c as any).executionCtx); await publishSyncEvent(c.env as any, { channel: `staff:global:alerts`, type: 'DOCUMENT_UPLOADED', payload: { documentId: docId, clientId: token, fileName: safeName } }, (c as any).executionCtx); } catch {}

    await createStaffAlert(c.env as any, { division: 'visa', type: 'document_upload', title: `Document uploaded: ${safeName}`, body: `Client ${token} uploaded ${safeName} (${version})`, clientId: token, payload: { fileName: safeName, version } });
    return c.json({ success: true, docId, version, message: "Document uploaded successfully." });
  } catch (error: any) {
    return c.json({ error: "Upload failed",  }, 500);
  }
});

// POST /api/public/portal/visa/inquiry — Client custom country visa inquiry request
portalRouter.post('/visa/inquiry', async (c) => {
  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  const body = await c.req.json().catch(() => ({})) as {
    clientId: string;
    country: string;
    visaType: string;
    notes?: string;
    email?: string;
    agencyName?: string;
    registeredMobile?: string;
    agreedToTerms?: boolean;
  };

  if (!body.clientId || !body.country || !body.visaType) {
    return c.json({ error: "Missing required fields: clientId, country, visaType" }, 400);
  }

  const now = Math.floor(Date.now() / 1000);
  const id = crypto.randomUUID();
  try {
    // 1. Create visa applications record
    await db.insert(visaApplications).values({
      id,
      clientId: body.clientId,
      country: body.country,
      visaType: body.visaType,
      appointmentDate: null,
      appointmentLocation: null,
      status: 'document_prep',
      notes: body.notes || null,
      email: body.email || null,
      agencyName: body.agencyName || null,
      registeredMobile: body.registeredMobile || null,
      agreedToTerms: body.agreedToTerms || false,
      createdAt: now,
      updatedAt: now
    });

    // 2. Insert a staff reminder task for the inquiry
    const taskId = crypto.randomUUID();
    await db.insert(tasks).values({
      id: taskId,
      clientId: body.clientId,
      title: `Review Public Visa Inquiry: ${body.country}`,
      description: `Client requested visa processing support for ${body.country} (${body.visaType}). Custom notes: ${body.notes || 'none'}`,
      priority: 'medium',
      status: 'open',
      cos: 'standard',
      createdAt: now,
      updatedAt: now
    });

    await createStaffAlert(c.env as any, { division: 'visa', type: 'visa_inquiry', title: `Visa inquiry: ${body.country}`, body: `${body.visaType}${body.notes ? ' — ' + body.notes : ''}`, clientId: body.clientId, payload: { country: body.country, visaType: body.visaType, email: body.email, mobile: body.registeredMobile } });
    return c.json({ success: true, id, message: "Visa inquiry registered successfully." });
  } catch (error: any) {
    return c.json({ error: "Failed to submit visa inquiry",  }, 500);
  }
});

// POST /api/public/portal/payments/order — Initialize Razorpay order for Client Portal
portalRouter.post('/payments/order', async (c) => {
  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  const body = await c.req.json().catch(() => ({})) as {
    clientId: string;
    country: string;
    amountPaise: number;
  };

  const { clientId, country, amountPaise } = body;
  if (!clientId || !country || !amountPaise) {
    return c.json({ error: "Missing required fields: clientId, country, amountPaise" }, 400);
  }

  const now = Math.floor(Date.now() / 1000);

  try {
    if (!c.env.RAZORPAY_KEY_ID || !c.env.RAZORPAY_KEY_SECRET) {
      return c.json({ error: "Razorpay not configured — set RAZORPAY_KEY_ID/RAZORPAY_KEY_SECRET" }, 503);
    }

    // 1. Ensure visa engagement exists to track payment ledger history
    let eng = await db.select().from(engagements).where(and(eq(engagements.clientId, clientId), eq(engagements.division, 'visa'))).get() as any;
    if (!eng) {
      const engId = crypto.randomUUID();
      // Ensure stages exist
      await ensurePipelineStages(db);
      await db.insert(engagements).values({
        id: engId,
        clientId,
        division: 'visa',
        title: `${country} Visa Processing`,
        stageKey: 'processing',
        outstandingBalance: amountPaise,
        status: 'active',
        createdAt: now,
        updatedAt: now
      });
      eng = { id: engId, outstandingBalance: amountPaise } as any;
    }

    // 2. Create Razorpay order
    const authString = 'Basic ' + btoa(`${c.env.RAZORPAY_KEY_ID}:${c.env.RAZORPAY_KEY_SECRET}`);
    const rzRes = await fetch('https://api.razorpay.com/v1/orders', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': authString,
      },
      body: JSON.stringify({
        amount: amountPaise,
        currency: 'INR',
        receipt: `${clientId}_${Date.now().toString(36)}`,
        notes: { engagementId: eng.id, clientId, country },
        partial_payment: false,
      }),
    });

    if (!rzRes.ok) {
      const rzErr = await rzRes.text().catch(() => '');
      return c.json({ error: 'Razorpay order creation failed', details: rzErr }, 502);
    }

    const order = (await rzRes.json()) as { id: string; amount: number; currency: string; [k: string]: any };

    return c.json({
      success: true,
      order,
      amount_paise: amountPaise,
      currency: 'INR',
      key: c.env.RAZORPAY_KEY_ID,
      order_id: order.id,
      clientId,
      engagementId: eng.id,
    });
  } catch (error: any) {
    return c.json({ error: "Failed to initialize order",  }, 500);
  }
});

// Helper functions for signature verification
function timingSafeEqualHex(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a.charCodeAt(i) ^ b.charCodeAt(i));
  return diff === 0;
}

async function verifySignature(orderId: string, paymentId: string, signature: string, secret: string): Promise<boolean> {
  const body = `${orderId}|${paymentId}`;
  const enc = new TextEncoder();
  const keyData = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', keyData, enc.encode(body));
  const hex = Array.from(new Uint8Array(sig)).map(b => b.toString(16).padStart(2, '0')).join('');
  return timingSafeEqualHex(hex, signature);
}

// POST /api/public/portal/payments/verify — Authoritative payment verification for Client Portal
portalRouter.post('/payments/verify', async (c) => {
  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const db = getDb(c.env.DB);
  const body = await c.req.json().catch(() => ({})) as {
    clientId: string;
    engagementId: string;
    razorpay_order_id: string;
    razorpay_payment_id: string;
    razorpay_signature: string;
    milestoneName?: string;
  };

  const { clientId, engagementId, razorpay_order_id, razorpay_payment_id, razorpay_signature, milestoneName } = body;
  if (!clientId || !engagementId || !razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
    return c.json({ error: "Missing required verification fields" }, 400);
  }

  const secret = c.env.RAZORPAY_KEY_SECRET;
  if (!secret || !c.env.RAZORPAY_KEY_ID) {
    return c.json({ error: "Razorpay not configured" }, 503);
  }

  try {
    const ok = await verifySignature(razorpay_order_id, razorpay_payment_id, razorpay_signature, secret);
    if (!ok) return c.json({ error: "Signature mismatch" }, 403);

    // SECURITY: bind the order to the claimed client/engagement. The HMAC only
    // covers order|payment — without this check a payer could replay their own
    // valid signature against ANY victim's clientId/engagementId and credit
    // their ledger (cross-client balance forgery).
    const authString = 'Basic ' + btoa(`${c.env.RAZORPAY_KEY_ID}:${c.env.RAZORPAY_KEY_SECRET}`);
    const orderRes = await fetch(`https://api.razorpay.com/v1/orders/${razorpay_order_id}`, {
      headers: { 'Authorization': authString },
    });
    const orderInfo = (orderRes.ok ? await orderRes.json() : {}) as { notes?: Record<string, string>; status?: string };
    const orderNotes = orderInfo.notes || {};
    if (orderNotes.clientId !== clientId || orderNotes.engagementId !== engagementId) {
      return c.json({ error: "Order does not match the claimed client/engagement" }, 403);
    }

    // Idempotency: verify no duplicate recording
    const existing = await db.select().from(payments).where(eq(payments.referenceNumber, razorpay_payment_id)).get();
    if (existing) {
      return c.json({ success: true, id: existing.id, razorpay_payment_id, verified: true, message: "Payment already recorded." });
    }

    // Call Razorpay API to confirm capture
    const payAuth = 'Basic ' + btoa(`${c.env.RAZORPAY_KEY_ID}:${c.env.RAZORPAY_KEY_SECRET}`);
    const rzRes = await fetch(`https://api.razorpay.com/v1/payments/${razorpay_payment_id}`, {
      headers: { 'Authorization': payAuth },
    });
    const paymentInfo = (rzRes.ok ? await rzRes.json() : {}) as { status?: string; amount?: number };
    const captured = paymentInfo?.status === 'captured';

    if (!captured) return c.json({ error: "Payment not captured by gateway" }, 402);

    const now = Math.floor(Date.now() / 1000);
    const paymentId = crypto.randomUUID();
    const invoiceAmount = paymentInfo.amount ?? 0;

    const eng = await db.select().from(engagements).where(eq(engagements.id, engagementId)).get();
    if (!eng) return c.json({ error: "Engagement not found" }, 404);

    // Record payment in database ledger
    await db.insert(payments).values({
      id: paymentId,
      clientId,
      engagementId,
      amount: invoiceAmount,
      type: 'receipt',
      milestoneName: milestoneName || 'Visa Fee Payment',
      method: 'upi',
      referenceNumber: razorpay_payment_id,
      createdAt: now,
    });

    // Update engagement balance
    await db.update(engagements)
      .set({ outstandingBalance: Math.max(0, eng.outstandingBalance - invoiceAmount), updatedAt: now })
      .where(eq(engagements.id, engagementId));

    // ACCRUE LOYALTY POINTS / INCENTIVES IF APPLICABLE
    try {
      const ref = await db.select().from(referrals).where(eq(referrals.clientId, clientId)).get();
      if (ref?.partnerId) {
        await accruePartnerPoints({ env: c.env as any, partnerId: ref.partnerId, reason: 'milestone_paid', referenceKey: razorpay_payment_id, amountPaise: invoiceAmount }).catch(() => {});
      }
    } catch {}

    try {
      await accrueIncentives({
        env: c.env as any,
        clientId,
        engagementId,
        triggerRef: razorpay_payment_id,
        trigger: 'milestone_paid',
        triggerAmountPaise: invoiceAmount,
      }).catch(() => {});
    } catch {}

    // Send receipt email notification — professional template with per-kind Listmonk routing
    try {
      const client = await db.select().from(clients).where(eq(clients.id, clientId)).get();
      if (client?.email) {
        const { subject, html } = paymentReceiptTemplate({
          clientName: client.name || 'Valued Client',
          amountPaise: invoiceAmount,
          milestoneName: milestoneName || 'Visa Fee',
          paymentId: razorpay_payment_id,
        });
        const amt = `₹${(invoiceAmount / 100).toLocaleString('en-IN')}`;
        const dateStr = new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
        await sendNotification(c.env as any, db as any, {
          channel: 'email',
          to: client.email,
          subject, body: html,
          templateId: getListmonkTemplateId(c.env as any, 'paymentReceipt'),
          data: { ClientName: client.name || 'Valued Client', Amount: amt, MilestoneName: milestoneName || 'Visa Fee', PaymentId: razorpay_payment_id, DateStr: dateStr, StatusText: 'Verified & Confirmed ✓', PortalUrl: 'https://opusoverseas.com/login', Subject: subject },
          clientId,
        }).catch(() => {});
      }
    } catch {}

    await createStaffAlert(c.env as any, { division: eng.division || 'visa', type: 'visa_sale', title: `Payment received: ₹${(invoiceAmount / 100).toLocaleString('en-IN')}`, body: `${milestoneName || 'Visa Fee'} — ${clientId}`, clientId, payload: { amount: invoiceAmount, milestone: milestoneName, paymentId: razorpay_payment_id } });
    return c.json({ success: true, id: paymentId, razorpay_payment_id, verified: true, message: "Payment verified & recorded." });
  } catch (error: any) {
    return c.json({ error: "Verification failed",  }, 500);
  }
});
