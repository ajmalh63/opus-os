import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../db/client.js';
import { getAuth } from '../auth.js';
import { clients, engagements, consents, documents, communications, users, studyAbroadApplications } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { auditEvent } from '../middleware/audit.js';
import { sendNotification } from '../infra/notify.js';
import { guardUpload, sha256Hex } from '../infra/uploadGuard.js';
import { ensurePipelineStages } from '../db/seed.js';

export const clientsRouter = new Hono<{ Bindings: { DB: D1Database; BUCKET: R2Bucket; BETTER_AUTH_SECRET: string }; Variables: { user?: { id?: string; role?: string } | null } }>();

const clientIdParamSchema = z.object({
  id: z.string().regex(/^OP-2026-\d{4}$/, { message: "Invalid Client ID format" })
});

// Intent override (Wave 4): managers/owner correct the client's primary
// interest — the human loop that fixes planner skips without losing consent.
const intentSchema = z.object({
  primaryDivision: z.enum(['study-abroad', 'visa', 'umrah', 'attestation', 'manpower']),
  intentDivisions: z.array(z.enum(['study-abroad', 'visa', 'umrah', 'attestation', 'manpower'])).optional(),
});

clientsRouter.patch('/:id/intent', async (c) => {
  const user = (c.get('user') as any) || {};
  if (user.role !== 'super_admin' && user.role !== 'manager') {
    return c.json({ error: 'Only manager+ can set primary interest' }, 403);
  }
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const id = c.req.param('id');
  const parsed = intentSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: 'Invalid intent payload', details: parsed.error.format() }, 400);
  try {
    const row = await db.select().from(clients).where(eq(clients.id, id)).get();
    if (!row) return c.json({ error: 'Client not found' }, 404);
    const mergedDivisions = parsed.data.intentDivisions
      ? Array.from(new Set([...parsed.data.intentDivisions, parsed.data.primaryDivision]))
      : [parsed.data.primaryDivision];
    await db.update(clients).set({
      primaryDivision: parsed.data.primaryDivision,
      intentDivisions: JSON.stringify(mergedDivisions),
      updatedAt: Math.floor(Date.now() / 1000),
    }).where(eq(clients.id, id));
    await auditEvent(c, { action: 'PRIMARY_INTENT_UPDATED', entityName: 'clients', entityId: id, afterState: { primaryDivision: parsed.data.primaryDivision, by: user.id } });
    return c.json({ success: true, id, primaryDivision: parsed.data.primaryDivision });
  } catch (e: any) {
    return c.json({ error: 'Intent update failed', details: e.message }, 500);
  }
});

const maskPassportNumber = (passport: string | null): string | null => {
  if (!passport) return null;
  if (passport.length <= 4) return "****";
  return passport.substring(0, 2) + "*".repeat(passport.length - 4) + passport.substring(passport.length - 2);
};

clientsRouter.get('/:id', async (c) => {
  const paramResult = clientIdParamSchema.safeParse(c.req.param());
  if (!paramResult.success) {
    return c.json({
      error: "Invalid request parameters",
      details: paramResult.error.format()
    }, 400);
  }

  const id = paramResult.data.id;
  
  if (!c.env || !c.env.DB) {
    return c.json({
      error: "DB not available"
    }, 500);
  }

  const db = getDb(c.env.DB);

  try {
    const clientRecord = await db.select().from(clients).where(eq(clients.id, id)).get();
    
    if (!clientRecord) {
      return c.json({ error: "Client not found" }, 404);
    }

    // Mask sensitive PII data before returning
    const maskedClient = {
      ...clientRecord,
      passportNumber: maskPassportNumber(clientRecord.passportNumber)
    };

    // Get engagements
    const activeEngagements = await db.select().from(engagements).where(eq(engagements.clientId, id));
    
    // Get consents
    const clientConsents = await db.select().from(consents).where(eq(consents.clientId, id));

    // Get documents
    const clientDocs = await db.select().from(documents).where(eq(documents.clientId, id));

    // Get timeline
    const clientTimeline = await db.select().from(communications).where(eq(communications.clientId, id));

    return c.json({
      ...maskedClient,
      engagements: activeEngagements, // preserve raw integer paise
      consents: clientConsents,
      documents: clientDocs,
      timeline: clientTimeline
    });

  } catch (error: any) {
    return c.json({
      error: "Failed to fetch client data",
      details: error.message
    }, 500);
  }
});

const signUploadPath = async (secret: string, clientId: string, filename: string, expires: number): Promise<string> => {
  // Fail-closed (A-4): no hardcoded fallback secret
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

// Constant-time hex compare (Workers has no timingSafeEqual)
const timingSafeEqualHex = (a: string, b: string): boolean => {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= (a.charCodeAt(i) ^ b.charCodeAt(i));
  return diff === 0;
};

clientsRouter.get('/:id/documents/presigned', async (c) => {
  const id = c.req.param('id');
  const filename = c.req.query('filename');
  if (!filename) {
    return c.json({ error: "Missing filename parameter" }, 400);
  }

  const expires = Math.floor(Date.now() / 1000) + 900;
  const secret = c.env.BETTER_AUTH_SECRET;
  const signature = await signUploadPath(secret, id, filename, expires);

  const presignedUrl = `/api/clients/${id}/documents/upload?filename=${encodeURIComponent(filename)}&expires=${expires}&signature=${signature}`;

  return c.json({
    success: true,
    url: presignedUrl,
    expires
  });
});

clientsRouter.put('/:id/documents/upload', async (c) => {
  const id = c.req.param('id');
  const filename = c.req.query('filename');
  const expiresStr = c.req.query('expires');
  const signature = c.req.query('signature');

  if (!filename || !expiresStr || !signature) {
    return c.json({ error: "Missing required upload parameters" }, 400);
  }

  const expires = Number(expiresStr);
  if (Math.floor(Date.now() / 1000) > expires) {
    return c.json({ error: "Upload URL has expired" }, 400);
  }

  const secret = c.env.BETTER_AUTH_SECRET;
  const expectedSig = await signUploadPath(secret, id, filename, expires);
  if (!timingSafeEqualHex(signature, expectedSig)) {
    return c.json({ error: "Invalid upload signature" }, 400);
  }

  if (!c.env || !c.env.DB) {
    return c.json({ error: "DB not available" }, 500);
  }

  const db = getDb(c.env.DB);
  const fileBody = await c.req.arrayBuffer();
  const bytes = new Uint8Array(fileBody);

  // OWASP upload hardening: allowlist + size cap + magic-byte sniff (staff vault).
  const guard = guardUpload('document', filename, bytes.byteLength, bytes);
  if (!guard.ok) return c.json({ error: guard.error }, (guard.status || 400) as any);
  const safeName = guard.safeName!;
  const mimeType = guard.mimeType!;
  const digest = await sha256Hex(bytes);

  try {
    const r2Key = `${crypto.randomUUID()}-${safeName}`;
    if (c.env.BUCKET) {
      await c.env.BUCKET.put(r2Key, fileBody, { httpMetadata: { contentType: mimeType } });
    }

    const existingDocs = await db
      .select()
      .from(documents)
      .where(and(eq(documents.clientId, id), eq(documents.fileName, safeName)))
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
      clientId: id,
      fileName: safeName,
      r2Key,
      version,
      status: 'pending',
      uploadedAt: Math.floor(Date.now() / 1000),
      sizeBytes: bytes.byteLength,
      mimeType,
      sha256: digest,
      uploadedBy: (c.get('user')?.id) || 'staff'
    });

    // Audit trail: document versions are evidence-class (vault integrity).
    await auditEvent(c, {
      action: 'DOC_UPLOAD',
      entityName: 'documents',
      entityId: docId,
      afterState: { clientId: id, fileName: safeName, r2Key, version, status: 'pending' },
    });

    return c.json({
      success: true,
      id: docId,
      fileName: safeName,
      version,
      status: 'pending',
      uploadedAt: Math.floor(Date.now() / 1000),
      message: "Document uploaded and version-controlled successfully."
    });

  } catch (error: any) {
    return c.json({ error: "Document upload transaction failed", details: error.message }, 500);
  }
});

clientsRouter.get('/:id/sharing-eligibility', async (c) => {
  const id = c.req.param('id');

  if (!c.env || !c.env.DB) {
    return c.json({ error: "DB not available" }, 500);
  }

  const db = getDb(c.env.DB);

  try {
    const clientConsents = await db.select().from(consents).where(eq(consents.clientId, id)).all();

    const hasCore = clientConsents.some(cons => cons.consentType === 'core-processing' && cons.status === 'granted');
    const hasManpowerRetain = clientConsents.some(cons => cons.consentType === 'manpower-retain' && cons.status === 'granted');
    const hasUniversitySharing = clientConsents.some(cons => cons.consentType === 'university-sharing' && cons.status === 'granted');

    const reasons: string[] = [];
    if (!hasCore) {
      reasons.push("Missing core data-processing consent.");
    }

    const engagementsList = await db.select().from(engagements).where(eq(engagements.clientId, id)).all();
    const isManpower = engagementsList.some(e => e.division === 'manpower');
    const isStudyAbroad = engagementsList.some(e => e.division === 'study-abroad');

    if (isManpower && !hasManpowerRetain) {
      reasons.push("Missing explicit consent to retain candidate CV for future opportunities.");
    }

    if (isStudyAbroad && !hasUniversitySharing) {
      reasons.push("Missing explicit consent to share student profile details with foreign universities.");
    }

    const eligible = reasons.length === 0;

    return c.json({
      success: true,
      eligible,
      reasons,
      consents: clientConsents
    });

  } catch (error: any) {
    return c.json({ error: "Eligibility check transaction failed", details: error.message }, 500);
  }
});

// POST /api/clients/:id/communications — staff logs an outbound/inbound comm
// onto the client timeline (wireframe: Client360 "Send message" is currently a
// client-side stub; this is the real persistence). Sender resolved from session.
const commSchema = z.object({
  channel: z.enum(['whatsapp', 'email', 'system', 'note']),
  direction: z.enum(['outgoing', 'internal']).default('outgoing'),
  subject: z.string().max(200).optional(),
  body: z.string().min(1).max(5000),
});
clientsRouter.post('/:id/communications', async (c) => {
  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const paramResult = clientIdParamSchema.safeParse(c.req.param());
  if (!paramResult.success) return c.json({ error: "Invalid Client ID format" }, 400);
  const parsed = commSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "Invalid payload", details: parsed.error.flatten() }, 400);

  const db = getDb(c.env.DB);
  try {
    const client = await db.select().from(clients).where(eq(clients.id, paramResult.data.id)).get();
    if (!client) return c.json({ error: "Client not found" }, 404);

    // Resolve sender from the session (cookie) — same resolution as RBAC.
    const auth = getAuth(c.env);
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    const senderId = (session?.user as any)?.id || null;

    const id = crypto.randomUUID();
    await db.insert(communications).values({
      id,
      clientId: paramResult.data.id,
      senderId,
      channel: parsed.data.channel,
      direction: parsed.data.direction,
      subject: parsed.data.subject || null,
      body: parsed.data.body,
      createdAt: Math.floor(Date.now() / 1000),
    });
    return c.json({ success: true, id, message: "Communication logged to timeline." });
  } catch (error: any) {
    return c.json({ error: "Communication log failed", details: error.message }, 500);
  }
});

// PATCH /api/clients/:id/documents/:docId/status — staff approves/rejects a
// client-uploaded document. Syncs the study-abroad application checklist
// (filename convention {key}-{appId8}-{original} from the portal upload).
const docStatusSchema = z.object({
  status: z.enum(['verified', 'rejected']),
  note: z.string().max(500).optional(),
});
clientsRouter.patch('/:id/documents/:docId/status', async (c) => {
  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const paramResult = clientIdParamSchema.safeParse(c.req.param());
  if (!paramResult.success) return c.json({ error: "Invalid Client ID format" }, 400);
  const parsed = docStatusSchema.safeParse(await c.req.json().catch(() => ({})));
  if (!parsed.success) return c.json({ error: "Invalid payload", details: parsed.error.flatten() }, 400);

  const db = getDb(c.env.DB);
  const now = Math.floor(Date.now() / 1000);
  try {
    const doc = await db.select().from(documents).where(eq(documents.id, c.req.param('docId'))).get();
    if (!doc) return c.json({ error: "Document not found" }, 404);
    if (doc.clientId !== paramResult.data.id) return c.json({ error: "Document does not belong to this client" }, 403);

    await db.update(documents).set({ status: parsed.data.status, verifiedAt: parsed.data.status === 'verified' ? now : null }).where(eq(documents.id, doc.id));

    // Sync the study-abroad application checklist: {key}-{appId8}-{original}
    const match = doc.fileName.match(/^([a-z_]+)-([a-zA-Z0-9]{8})-/);
    if (match) {
      const docKey = match[1];
      const appIdPrefix = match[2];
      const apps = await db.select().from(studyAbroadApplications).where(eq(studyAbroadApplications.clientId, paramResult.data.id)).all();
      const app = apps.find(a => a.id.startsWith(appIdPrefix));
      if (app) {
        let checklist: Record<string, string> = {};
        try { checklist = JSON.parse(app.docsChecklistJson || '{}'); } catch { /* tolerate */ }
        checklist[docKey] = parsed.data.status === 'verified' ? 'verified' : 'missing';
        await db.update(studyAbroadApplications).set({ docsChecklistJson: JSON.stringify(checklist), updatedAt: now }).where(eq(studyAbroadApplications.id, app.id));
      }
    }

    await auditEvent(c as any, { action: 'DOC_REVIEW', entityName: 'documents', entityId: doc.id, afterState: { status: parsed.data.status, note: parsed.data.note } }).catch(() => {});
    if (parsed.data.status === 'verified') {
      const client = await db.select().from(clients).where(eq(clients.id, paramResult.data.id)).get();
      if (client?.email) {
        await sendNotification(c.env as any, db, {
          channel: 'email', to: client.email,
          subject: 'Document verified ✓',
          body: `Your document "${doc.fileName}" has been verified by our team.`
        }).catch(() => {});
      }
    }
    return c.json({ success: true, message: `Document ${parsed.data.status}.` });
  } catch (error: any) {
    return c.json({ error: "Document review failed", details: error.message }, 500);
  }
});

// GET /api/clients/:id/documents/:docId/download — staff fetches a client's file
// (scoped to the clientId in the path — ownership enforced server-side).
clientsRouter.get('/:id/documents/:docId/download', async (c) => {
  if (!c.env?.DB) return c.json({ error: "DB not available" }, 500);
  const paramResult = clientIdParamSchema.safeParse(c.req.param());
  if (!paramResult.success) return c.json({ error: "Invalid Client ID format" }, 400);
  const db = getDb(c.env.DB);
  try {
    const doc = await db.select().from(documents).where(eq(documents.id, c.req.param('docId'))).get();
    if (!doc) return c.json({ error: "Document not found" }, 404);
    if (doc.clientId !== paramResult.data.id) return c.json({ error: "Document does not belong to this client" }, 403);
    const bucket = (c.env as any).BUCKET;
    if (!bucket) return c.json({ error: "Storage not configured" }, 500);
    const obj = await bucket.get(doc.r2Key);
    if (!obj) return c.json({ error: "File missing in storage" }, 404);
    return new Response(obj.body, {
      headers: {
        'Content-Type': doc.mimeType || 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${doc.fileName.replace(/"/g, '')}"`,
        'X-Content-Type-Options': 'nosniff',
        'Cache-Control': 'private, no-store'
      }
    });
  } catch (error: any) {
    return c.json({ error: "Download failed", details: error.message }, 500);
  }
});

clientsRouter.get('/', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  try {
    const list = await db.select().from(clients).all();
    return c.json({ clients: list });
  } catch (error: any) {
    return c.json({ error: 'Failed to fetch clients list', details: error.message }, 500);
  }
});

clientsRouter.post('/', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const body = await c.req.json().catch(() => ({})) as {
    name: string;
    phone: string;
    email: string;
    primaryDivision?: string;
    highestQualification?: string;
    intakeContext?: string;
  };

  if (!body.name || !body.phone || !body.email) {
    return c.json({ error: 'Missing required fields: name, phone, email' }, 400);
  }

  const token = `OP-2026-${Math.floor(1000 + Math.random() * 9000)}`;
  const now = Math.floor(Date.now() / 1000);
  try {
    const dup = await db.select().from(clients).where(eq(clients.phone, body.phone)).get();
    if (dup) {
      return c.json({ error: 'A client with this phone number already exists', code: 'duplicate_phone', existingClientId: dup.id }, 409);
    }

    await db.insert(clients).values({
      id: token,
      name: body.name,
      phone: body.phone,
      email: body.email,
      primaryDivision: body.primaryDivision || 'study-abroad',
      highestQualification: body.highestQualification || 'undergrad',
      intakeContext: body.intakeContext || null,
      status: 'active',
      createdAt: now,
      updatedAt: now
    });

    // Auto-initialize default engagement for the primary division (self-heal)
    await ensurePipelineStages(db);
    const engagementId = crypto.randomUUID();
    await db.insert(engagements).values({
      id: engagementId,
      clientId: token,
      division: (body.primaryDivision || 'study-abroad') as 'study-abroad' | 'visa' | 'umrah' | 'attestation' | 'manpower',
      title: `${(body.primaryDivision || 'study-abroad').toUpperCase()} Application`,
      stageKey: 'lead',
      outstandingBalance: 0,
      status: 'active',
      createdAt: now,
      updatedAt: now
    });

    return c.json({ success: true, client: { id: token, name: body.name, phone: body.phone, email: body.email, primaryDivision: body.primaryDivision } });
  } catch (error: any) {
    return c.json({ error: 'Failed to create client', details: error.message }, 500);
  }
});

clientsRouter.post('/:id/engagements', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const clientId = c.req.param('id');
  const body = await c.req.json().catch(() => ({})) as { division?: string };

  try {
    const clientRecord = await db.select().from(clients).where(eq(clients.id, clientId)).get();
    if (!clientRecord) {
      return c.json({ error: 'Client not found' }, 404);
    }

    const division = (body.division || clientRecord.primaryDivision || 'study-abroad') as 'study-abroad' | 'visa' | 'umrah' | 'attestation' | 'manpower';

    // Verify if an active engagement already exists for this division
    const existing = await db.select().from(engagements).where(
      and(eq(engagements.clientId, clientId), eq(engagements.division, division))
    ).get();

    if (existing) {
      return c.json({ success: true, message: 'Active engagement already exists', engagement: existing });
    }

    await ensurePipelineStages(db);
    const engagementId = crypto.randomUUID();
    const now = Math.floor(Date.now() / 1000);
    
    const newEngagement = {
      id: engagementId,
      clientId,
      division,
      title: `${division.toUpperCase()} Application`,
      stageKey: 'lead',
      outstandingBalance: 0,
      status: 'active',
      createdAt: now,
      updatedAt: now
    };

    await db.insert(engagements).values(newEngagement);

    return c.json({ success: true, message: 'Engagement initialized successfully', engagement: newEngagement });
  } catch (error: any) {
    return c.json({ error: 'Failed to initialize engagement', details: error.message }, 500);
  }
});

clientsRouter.patch('/:id', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({})) as {
    name?: string;
    email?: string;
    phone?: string;
    highestQualification?: string;
    intakeContext?: string;
    notes?: string;
  };

  try {
    const row = await db.select().from(clients).where(eq(clients.id, id)).get();
    if (!row) return c.json({ error: 'Client not found' }, 404);

    const updateFields: any = {
      updatedAt: Math.floor(Date.now() / 1000)
    };
    if (body.name !== undefined) updateFields.name = body.name;
    if (body.email !== undefined) updateFields.email = body.email;
    if (body.phone !== undefined) updateFields.phone = body.phone;
    if (body.highestQualification !== undefined) updateFields.highestQualification = body.highestQualification;
    if (body.intakeContext !== undefined) updateFields.intakeContext = body.intakeContext;
    if (body.notes !== undefined) updateFields.notes = body.notes;

    await db.update(clients).set(updateFields).where(eq(clients.id, id));
    return c.json({ success: true, id });
  } catch (error: any) {
    return c.json({ error: 'Failed to update client details', details: error.message }, 500);
  }
});

clientsRouter.patch('/:id/status', async (c) => {
  const user = (c.get('user') as any) || {};
  if (user.role !== 'super_admin' && user.role !== 'manager') {
    return c.json({ error: 'Only manager+ can update client status' }, 403);
  }
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({})) as { status?: 'active' | 'blocked' };
  if (!body.status || !['active', 'blocked'].includes(body.status)) {
    return c.json({ error: 'Invalid status' }, 400);
  }
  try {
    const row = await db.select().from(clients).where(eq(clients.id, id)).get();
    if (!row) return c.json({ error: 'Client not found' }, 404);
    await db.update(clients).set({
      status: body.status,
      updatedAt: Math.floor(Date.now() / 1000),
    }).where(eq(clients.id, id));
    await auditEvent(c, { action: 'CLIENT_STATUS_UPDATED', entityName: 'clients', entityId: id, afterState: { status: body.status, by: user.id } });
    return c.json({ success: true, id, status: body.status });
  } catch (e: any) {
    return c.json({ error: 'Status update failed', details: e.message }, 500);
  }
});



