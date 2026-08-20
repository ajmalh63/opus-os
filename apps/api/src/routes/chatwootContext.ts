import { Hono } from 'hono';
import { getDb } from '../db/client.js';
import { clients, engagements, tasks, studyAbroadApplications, attestationApplications, bookings, communications } from '../db/schema.js';
import { eq, or, desc } from 'drizzle-orm';
import { newPortalToken } from '../lib/clientToken.js';
import { auditEvent } from '../middleware/audit.js';

export const chatwootContextRouter = new Hono<{ Bindings: { DB: D1Database } }>();

const now = () => Math.floor(Date.now() / 1000);
const uid = () => `CW-${now()}-${crypto.randomUUID().slice(0, 8)}`;

const CAL_BOOKING_LINKS: Record<string, string> = {
  'study-abroad': 'https://cal.com/opus.overseas/study-abroad-consultation',
  'visa': 'https://cal.com/opus.overseas/visa-consultation',
  'manpower': 'https://cal.com/opus.overseas/manpower-screening',
};

// GET /api/public/chatwoot/context?email=...&phone=...
chatwootContextRouter.get('/context', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB unavailable' }, 500);
  const db = getDb(c.env.DB);

  const email = (c.req.query('email') || '').trim().toLowerCase();
  const rawPhone = (c.req.query('phone') || '').trim();
  const cleanPhone = rawPhone.replace(/\D/g, '');

  if (!email && !cleanPhone) {
    return c.json({
      found: false,
      client: null,
      bookingLinks: CAL_BOOKING_LINKS,
      message: 'Provide contact email or phone number',
    });
  }

  try {
    // 1. Search Client in CRM
    let client: any = null;
    if (email) {
      client = await db.select().from(clients).where(eq(clients.email, email)).get();
    }
    if (!client && cleanPhone) {
      const allClients = await db.select().from(clients).all();
      client = allClients.find((cl: any) => cl.phone && cl.phone.replace(/\D/g, '').includes(cleanPhone.slice(-10)));
    }

    if (!client) {
      // Build pre-filled booking URLs for unsynced contact
      const prefilledBookingLinks: Record<string, string> = {};
      for (const [k, url] of Object.entries(CAL_BOOKING_LINKS)) {
        const u = new URL(url);
        if (email) u.searchParams.set('email', email);
        if (rawPhone) u.searchParams.set('phone', rawPhone);
        prefilledBookingLinks[k] = u.toString();
      }

      return c.json({
        found: false,
        client: null,
        bookingLinks: prefilledBookingLinks,
        message: 'No existing client record found in Opus OS CRM.',
      });
    }

    // 2. Fetch Active Engagements
    const clientEngagements = await db
      .select()
      .from(engagements)
      .where(eq(engagements.clientId, client.id))
      .orderBy(desc(engagements.createdAt))
      .all();

    // 3. Fetch Tasks
    const clientTasks = await db
      .select()
      .from(tasks)
      .where(eq(tasks.clientId, client.id))
      .orderBy(desc(tasks.createdAt))
      .all();

    // 4. Fetch Division-Specific Records
    const studyAbroadApps = await db
      .select()
      .from(studyAbroadApplications)
      .where(eq(studyAbroadApplications.clientId, client.id))
      .all();

    const attestationApps = await db
      .select()
      .from(attestationApplications)
      .where(eq(attestationApplications.clientId, client.id))
      .all();

    const clientBookings = await db
      .select()
      .from(bookings)
      .where(or(eq(bookings.clientId, client.id), eq(bookings.attendeeEmail, client.email)))
      .all();

    // 5. Generate Prefilled Links & URLs
    const portalUrl = client.portalToken
      ? `https://app.opusoverseas.com/portal?token=${client.portalToken}`
      : null;

    const prefilledBookingLinks: Record<string, string> = {};
    for (const [k, url] of Object.entries(CAL_BOOKING_LINKS)) {
      const u = new URL(url);
      if (client.name) u.searchParams.set('name', client.name);
      if (client.email) u.searchParams.set('email', client.email);
      if (client.phone) u.searchParams.set('phone', client.phone);
      prefilledBookingLinks[k] = u.toString();
    }

    return c.json({
      found: true,
      client: {
        id: client.id,
        name: client.name,
        email: client.email,
        phone: client.phone,
        primaryDivision: client.primaryDivision,
        status: client.status,
        createdAt: client.createdAt,
        portalToken: client.portalToken,
      },
      portalUrl,
      engagements: clientEngagements.map((e: any) => ({
        id: e.id,
        division: e.division,
        title: e.title,
        stageKey: e.stageKey,
        status: e.status,
      })),
      tasks: clientTasks.map((t: any) => ({
        id: t.id,
        title: t.title,
        status: t.status,
        priority: t.priority,
        dueDate: t.dueDate,
      })),
      studyAbroadApplications: studyAbroadApps.map((a: any) => ({
        id: a.id,
        universityName: a.universityName,
        programName: a.programName,
        targetCountry: a.targetCountry,
        targetIntake: a.targetIntake,
        status: a.status,
      })),
      attestationApplications: attestationApps.map((a: any) => ({
        id: a.id,
        documentType: a.documentType,
        targetCountry: a.targetCountry,
        stage: a.stage,
      })),
      bookings: clientBookings.map((b: any) => ({
        id: b.id,
        title: b.title,
        startTime: b.startTime,
        status: b.status,
      })),
      bookingLinks: prefilledBookingLinks,
    });
  } catch (err: any) {
    return c.json({ error: 'Failed to retrieve contact context', details: err.message }, 500);
  }
});

// POST /api/public/chatwoot/quick-lead — 1-click create lead from Chatwoot sidebar
chatwootContextRouter.post('/quick-lead', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB unavailable' }, 500);
  const db = getDb(c.env.DB);
  const body = await c.req.json().catch(() => ({}));

  const name = (body.name || '').trim();
  const email = (body.email || '').trim().toLowerCase();
  const phone = (body.phone || '').trim();
  const division = body.division || 'study-abroad';

  if (!name || (!email && !phone)) {
    return c.json({ error: 'Name and either email or phone are required.' }, 400);
  }

  try {
    const cid = `OP-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
    const portalToken = newPortalToken();

    await db.insert(clients).values({
      id: cid,
      portalToken,
      name,
      email: email || `${phone.replace(/\D/g, '')}@lead.opusoverseas.com`,
      phone: phone || '0000000000',
      primaryDivision: division,
      leadSource: 'chatwoot-sidebar',
      status: 'active',
      createdAt: now(),
      updatedAt: now(),
    });

    const eid = uid();
    await db.insert(engagements).values({
      id: eid,
      clientId: cid,
      division,
      title: `Consultation (${division})`,
      stageKey: 'lead',
      status: 'active',
      outstandingBalance: 0,
      createdAt: now(),
      updatedAt: now(),
    });

    await auditEvent(c, {
      action: 'LEAD_CREATED',
      entityName: 'clients',
      entityId: cid,
      result: 'success',
      category: 'lead',
      actorType: 'user',
      authMethod: 'session',
      afterState: { name, email, phone, division, source: 'chatwoot-sidebar' },
    });

    return c.json({
      success: true,
      clientId: cid,
      portalUrl: `https://app.opusoverseas.com/portal?token=${portalToken}`,
    });
  } catch (err: any) {
    return c.json({ error: 'Failed to create lead', details: err.message }, 500);
  }
});
