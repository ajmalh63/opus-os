import { Hono } from 'hono';
import { z } from 'zod';
import { getDb } from '../db/client.js';
import { clients, engagements, consents, documents, communications, users } from '../db/schema.js';
import { eq, and } from 'drizzle-orm';

export const clientsRouter = new Hono<{ Bindings: { DB: D1Database; BUCKET: R2Bucket; BETTER_AUTH_SECRET: string } }>();

const clientIdParamSchema = z.object({
  id: z.string().regex(/^OP-2026-\d{4}$/, { message: "Invalid Client ID format" })
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
  const encoder = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret || 'default-secret-key-32-chars-long-minimum'),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  const data = `${clientId}:${filename}:${expires}`;
  const signature = await crypto.subtle.sign('HMAC', key, encoder.encode(data));
  return Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');
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
  if (signature !== expectedSig) {
    return c.json({ error: "Invalid upload signature" }, 400);
  }

  if (!c.env || !c.env.DB) {
    return c.json({ error: "DB not available" }, 500);
  }

  const db = getDb(c.env.DB);
  const fileBody = await c.req.arrayBuffer();

  try {
    const r2Key = `${crypto.randomUUID()}-${filename}`;
    if (c.env.BUCKET) {
      await c.env.BUCKET.put(r2Key, fileBody);
    }

    const existingDocs = await db
      .select()
      .from(documents)
      .where(and(eq(documents.clientId, id), eq(documents.fileName, filename)))
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
      fileName: filename,
      r2Key,
      version,
      status: 'pending',
      uploadedAt: Math.floor(Date.now() / 1000)
    });

    return c.json({
      success: true,
      id: docId,
      fileName: filename,
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


