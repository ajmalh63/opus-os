import { resolveClientByToken } from '../lib/clientToken.js';
import { Hono } from 'hono';

function getPortalToken(c: any): string | undefined {
  const headerToken = c.req.header('x-portal-token') || c.req.header('X-Portal-Token') || c.req.header('authorization')?.replace(/^Bearer\s+/i, '');
  if (headerToken) return headerToken.trim();
  const queryToken = (c.req.query('token') as string | undefined) || '';
  if (queryToken) return queryToken.trim();
  return undefined;
}
import { getDb } from '../db/client.js';
import { clients, visaApplications, visaProducts, documents, tasks } from '../db/schema.js';
import { eq, desc, or } from 'drizzle-orm';
import { auditEvent } from '../middleware/audit.js';
import { createStaffAlert } from '../infra/staffAlerts.js';
import { isDivisionEnabled } from '../lib/divisions.js';
import { VISA_FORM_SECTIONS, visaFormSchema, missingVisaSections } from '../validation/visaForm.js';

// Client-portal Visa services (Visa Phase-1, spec section 3).
// Auth: client-id TOKEN — the token IS the client.id (same pattern as
// portal.ts /lookup & /documents). Mounted at /api/public/portal/visa.

export const portalVisaRouter = new Hono<{ Bindings: { DB: D1Database; BETTER_AUTH_SECRET: string } }>();

const BLOCKED_EDIT_STATUSES = ['granted', 'rejected', 'delivered', 'cancelled'];

function safeParseArray(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

// GET /api/public/portal/visa/products — active visa product inventory
portalVisaRouter.get('/products', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  // Division availability (kill-switch): catalog hidden when visa is OFF.
  if (!(await isDivisionEnabled(c.env, 'visa'))) return c.json({ success: true, products: [] });
  const db = getDb(c.env.DB);
  try {
    const list = await db.select().from(visaProducts).where(eq(visaProducts.status, 'active')).all();
    const products = list.map((p) => ({
      id: p.id,
      country: p.country,
      visaType: p.visaType,
      entryType: p.entryType,
      processingTime: p.processingTime,
      feePaise: p.feePaise,
      requiredDocs: safeParseArray(p.requiredDocsJson),
    }));
    return c.json({ success: true, products });
  } catch (error: any) {
    return c.json({ error: 'Failed to fetch visa products' }, 500);
  }
});

// GET /api/public/portal/visa/applications?token= — this client's applications
portalVisaRouter.get('/applications', async (c) => {
  const token = getPortalToken(c) || '';
  if (!token) return c.json({ error: 'Token is required' }, 400);
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  try {
    const client = await resolveClientByToken(db, token);
    if (!client) return c.json({ error: 'Client not found for token' }, 404);

    const apps = await db.select().from(visaApplications)
      .where(or(
        eq(visaApplications.clientId, client.id),
        eq(visaApplications.clientId, client.portalToken || client.id),
        eq(visaApplications.clientId, token)
      ))
      .orderBy(desc(visaApplications.createdAt))
      .all();
    const docs = await db.select().from(documents).where(or(
      eq(documents.clientId, client.id),
      eq(documents.clientId, token)
    )).all();

    const applications = [];
    for (const app of apps) {
      const matchedProds = await db.select().from(visaProducts).where(eq(visaProducts.country, app.country)).all();
      const product = matchedProds.find((p) => p.visaType.toLowerCase() === app.visaType.toLowerCase()) || matchedProds[0];
      const requiredDocs = safeParseArray(product?.requiredDocsJson);

      const matchedDocs = docs
        .filter((d) =>
          requiredDocs.some((docName: string) =>
            d.fileName.toLowerCase().includes(docName.toLowerCase().replace(/\s+/g, '_')) ||
            d.fileName.toLowerCase().includes(docName.toLowerCase())
          )
        )
        .map((d) => ({
          id: d.id,
          fileName: d.fileName,
          version: d.version,
          status: d.status,
          uploadedAt: d.uploadedAt,
          verifiedAt: d.verifiedAt,
        }));

      applications.push({
        id: app.id,
        country: app.country,
        visaType: app.visaType,
        status: app.status,
        appointmentDate: app.appointmentDate,
        appointmentLocation: app.appointmentLocation,
        notes: app.notes,
        formJson: app.formJson ? JSON.parse(app.formJson) : null,
        submittedAt: app.submittedAt,
        decisionAt: app.decisionAt,
        rejectionReason: app.rejectionReason,
        deliveredAt: app.deliveredAt,
        createdAt: app.createdAt,
        updatedAt: app.updatedAt,
        requiredDocs,
        documents: matchedDocs,
      });
    }
    return c.json({ success: true, applications });
  } catch (error: any) {
    return c.json({ error: 'Failed to fetch visa applications' }, 500);
  }
});

// POST /api/public/portal/visa/applications — create draft (idempotent per product)
portalVisaRouter.post('/applications', async (c) => {
  // Division availability: new intake blocked when visa is OFF.
  if (!(await isDivisionEnabled(c.env, 'visa'))) {
    return c.json({ error: 'This service is not accepting applications yet', code: 'DIVISION_DISABLED' }, 409);
  }
  const body = await c.req.json().catch(() => ({})) as { token?: string; country?: string; visaProductId?: string };
  const { token, visaProductId } = body;
  if (!token) return c.json({ error: 'Token is required' }, 400);
  if (!visaProductId) return c.json({ error: 'visaProductId is required' }, 400);
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const now = Math.floor(Date.now() / 1000);

  try {
    const client = await resolveClientByToken(db, token);
    if (!client) return c.json({ error: 'Client not found for token' }, 404);

    const product = await db.select().from(visaProducts).where(eq(visaProducts.id, visaProductId)).get();
    if (!product) return c.json({ error: 'Visa product not found' }, 404);
    if (product.status !== 'active') return c.json({ error: 'Visa product is not active' }, 400);

    // Idempotent per product: a client's existing draft for the same product is returned.
    const existingDrafts = await db.select().from(visaApplications)
      .where(or(
        eq(visaApplications.clientId, client.id),
        eq(visaApplications.clientId, client.portalToken || client.id),
        eq(visaApplications.clientId, token)
      ))
      .all();
    const existing = existingDrafts.find(
      (a) => a.status === 'draft' && a.country === product.country && a.visaType === product.visaType
    );
    if (existing) {
      return c.json({ success: true, id: existing.id, message: 'Draft already exists.', draft: true });
    }

    const id = crypto.randomUUID();
    await db.insert(visaApplications).values({
      id,
      clientId: client.id,
      country: product.country,
      visaType: product.visaType,
      status: 'draft',
      agreedToTerms: false,
      createdAt: now,
      updatedAt: now,
    });

    await auditEvent(c as any, {
      action: 'VISA_DRAFT_CREATED',
      entityName: 'visa_applications',
      entityId: id,
      afterState: { id, clientId: client.id, country: product.country, visaType: product.visaType, status: 'draft' },
    }).catch(() => {});

    return c.json({ success: true, id, message: 'Visa application draft created.' });
  } catch (error: any) {
    return c.json({ error: 'Failed to create visa application' }, 500);
  }
});

// PUT /api/public/portal/visa/applications/:id — merge partial form sections
portalVisaRouter.put('/applications/:id', async (c) => {
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({})) as { token?: string; formJson?: any };
  const { token, formJson } = body;
  if (!token) return c.json({ error: 'Token is required' }, 400);
  if (!formJson || typeof formJson !== 'object' || Array.isArray(formJson)) {
    return c.json({ error: 'formJson object is required' }, 400);
  }
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);

  try {
    const client = await resolveClientByToken(db, token);
    if (!client) return c.json({ error: 'Client not found for token' }, 404);

    const entry = await db.select().from(visaApplications).where(eq(visaApplications.id, id)).get();
    if (!entry) return c.json({ error: 'Visa application not found' }, 404);
    if (entry.clientId !== client.id && entry.clientId !== client.portalToken && entry.clientId !== token) {
      return c.json({ error: 'Not your application' }, 403);
    }
    if (BLOCKED_EDIT_STATUSES.includes(entry.status)) {
      return c.json({ error: `Cannot edit an application in status ${entry.status}` }, 403);
    }

    // Validate provided sections against their subsection schemas.
    for (const key of Object.keys(formJson)) {
      if (!(VISA_FORM_SECTIONS as readonly string[]).includes(key)) continue;
      const sectionSchema = visaFormSchema.shape[key as keyof typeof visaFormSchema.shape];
      const parsed = sectionSchema.safeParse(formJson[key]);
      if (!parsed.success) {
        return c.json({ error: `Invalid data in section "${key}": ${parsed.error.issues.map((i) => i.message).join('; ')}` }, 400);
      }
      formJson[key] = parsed.data;
    }

    let merged: Record<string, any> = {};
    try {
      merged = entry.formJson ? JSON.parse(entry.formJson) : {};
    } catch {
      merged = {};
    }
    for (const key of Object.keys(formJson)) {
      if ((VISA_FORM_SECTIONS as readonly string[]).includes(key)) merged[key] = formJson[key];
    }

    const now = Math.floor(Date.now() / 1000);
    await db.update(visaApplications)
      .set({ formJson: JSON.stringify(merged), updatedAt: now })
      .where(eq(visaApplications.id, id));

    await auditEvent(c as any, {
      action: 'VISA_FORM_UPDATED',
      entityName: 'visa_applications',
      entityId: id,
      afterState: { id, sections: Object.keys(formJson).filter((k) => (VISA_FORM_SECTIONS as readonly string[]).includes(k)) },
    }).catch(() => {});

    return c.json({ success: true, id, message: 'Application form updated.' });
  } catch (error: any) {
    return c.json({ error: 'Failed to update application form' }, 500);
  }
});

// POST /api/public/portal/visa/applications/:id/submit — require full form + terms
portalVisaRouter.post('/applications/:id/submit', async (c) => {
  // Division availability: submitting a new application is intake — blocked when OFF.
  if (!(await isDivisionEnabled(c.env, 'visa'))) {
    return c.json({ error: 'This service is not accepting applications yet', code: 'DIVISION_DISABLED' }, 409);
  }
  const id = c.req.param('id');
  const body = await c.req.json().catch(() => ({})) as { token?: string; agreedToTerms?: boolean };
  const { token, agreedToTerms } = body;
  if (!token) return c.json({ error: 'Token is required' }, 400);
  if (agreedToTerms !== true) return c.json({ error: 'agreedToTerms must be true to submit' }, 400);
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const now = Math.floor(Date.now() / 1000);

  try {
    const client = await resolveClientByToken(db, token);
    if (!client) return c.json({ error: 'Client not found for token' }, 404);

    const entry = await db.select().from(visaApplications).where(eq(visaApplications.id, id)).get();
    if (!entry) return c.json({ error: 'Visa application not found' }, 404);
    if (entry.clientId !== client.id && entry.clientId !== client.portalToken && entry.clientId !== token) {
      return c.json({ error: 'Not your application' }, 403);
    }
    if (BLOCKED_EDIT_STATUSES.includes(entry.status)) {
      return c.json({ error: `Cannot submit an application in status ${entry.status}` }, 403);
    }

    let merged: Record<string, any> = {};
    try {
      merged = entry.formJson ? JSON.parse(entry.formJson) : {};
    } catch {
      merged = {};
    }
    const missing = missingVisaSections(merged);
    if (missing.length > 0) {
      return c.json({
        success: false,
        error: `Application form incomplete. Missing sections: ${missing.join(', ')}`,
        missingSections: missing,
      }, 400);
    }

    await db.update(visaApplications)
      .set({ status: 'submitted', submittedAt: now, agreedToTerms: true, updatedAt: now })
      .where(eq(visaApplications.id, id));

    await db.insert(tasks).values({
      id: crypto.randomUUID(),
      clientId: entry.clientId,
      title: `Review visa application (${entry.country} ${entry.visaType})`,
      description: `Client submitted a completed visa application for ${entry.country} (${entry.visaType}). Application ID: ${id}`,
      priority: 'high',
      status: 'open',
      cos: 'expedite',
      dueDate: now + 24 * 3600,
      createdAt: now,
      updatedAt: now,
    });

    await auditEvent(c as any, {
      action: 'VISA_SUBMITTED',
      entityName: 'visa_applications',
      entityId: id,
      afterState: { id, status: 'submitted', submittedAt: now, agreedToTerms: true },
    }).catch(() => {});

    await createStaffAlert(c.env as any, { division: 'visa', type: 'visa_application', title: `Visa application submitted: ${entry.country}`, body: `${entry.visaType} — ${entry.clientId}`, clientId: entry.clientId, payload: { country: entry.country, visaType: entry.visaType } });
return c.json({ success: true, id, message: 'Visa application submitted for review.' });
  } catch (error: any) {
    return c.json({ error: 'Failed to submit visa application',  }, 500);
  }
});