import { Hono } from 'hono';
import { zValidator } from '@hono/zod-validator';
import { leadIntakeSchema } from '@opusos/shared';
import { getDb } from '../db/client.js';
import { clients, consents, engagements } from '../db/schema.js';
import { and, eq } from 'drizzle-orm';
import { rateLimit } from '../middleware/rateLimit.js';

export const leadsRouter = new Hono<{ Bindings: { DB: D1Database } }>();

// Public lead-intake spam protection (Section 18.2.2): 5 submissions / hour / IP.
leadsRouter.use('/', rateLimit({ bucket: 'lead-form', windowSeconds: 3600, limit: 5 }));

leadsRouter.post('/', zValidator('json', leadIntakeSchema), async (c) => {
  const data = c.req.valid('json');
  
  if (!c.env || !c.env.DB) {
    return c.json({
      success: true,
      token: "OP-2026-MOCK",
      message: "Lead validated. DB not available."
    });
  }

  const db = getDb(c.env.DB);
  const token = `OP-2026-${Math.floor(1000 + Math.random() * 9000)}`;

  try {
    // Insert client
    await db.insert(clients).values({
      id: token,
      name: data.name,
      phone: data.phone,
      email: data.email,
      highestQualification: data.highestQualification,
      createdAt: Math.floor(Date.now() / 1000),
      updatedAt: Math.floor(Date.now() / 1000)
    });

    const ipAddress = c.req.header('x-real-ip') || c.req.header('cf-connecting-ip') || '127.0.0.1';
    
    // DPDP-2023 Consent Notice Hashing Helper
    const sha256 = async (message: string): Promise<string> => {
      const msgBuffer = new TextEncoder().encode(message);
      const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
      const hashArray = Array.from(new Uint8Array(hashBuffer));
      return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    };

    const CORE_PROCESSING_NOTICE = "OpusOS Consent Notice v1.0: Core processing of client application data for admissions, visa processing, and division-specific onboarding under DPDP-2023 guidelines.";
    const WHATSAPP_UPDATES_NOTICE = "OpusOS Consent Notice v1.0: Consent to receive updates, reminders, notifications, and communications via WhatsApp messenger.";

    const coreNoticeHash = await sha256(CORE_PROCESSING_NOTICE);
    const whatsappNoticeHash = await sha256(WHATSAPP_UPDATES_NOTICE);

    // Insert core-processing consent
    await db.insert(consents).values({
      id: crypto.randomUUID(),
      clientId: token,
      consentType: 'core-processing',
      status: 'granted',
      ipAddress,
      sha256Hash: coreNoticeHash,
      grantedAt: Math.floor(Date.now() / 1000)
    });

    // Insert whatsapp updates consent
    if (data.consents.whatsappUpdates) {
      await db.insert(consents).values({
        id: crypto.randomUUID(),
        clientId: token,
        consentType: 'whatsapp-updates',
        status: 'granted',
        ipAddress,
        sha256Hash: whatsappNoticeHash,
        grantedAt: Math.floor(Date.now() / 1000)
      });
    }

    // Insert engagement
    await db.insert(engagements).values({
      id: crypto.randomUUID(),
      clientId: token,
      division: data.division,
      title: `${data.division.toUpperCase()} Application`,
      stageKey: 'lead',
      outstandingBalance: 0,
      status: 'active',
      createdAt: Math.floor(Date.now() / 1000),
      updatedAt: Math.floor(Date.now() / 1000)
    });

    return c.json({
      success: true,
      token,
      message: "Lead captured and tracking token provisioned."
    });
  } catch (error: any) {
    return c.json({
      error: "Database insertion failed",
      details: error.message
    }, 500);
  }
});

leadsRouter.get('/status', async (c) => {
  const phone = c.req.query('phone');
  const token = c.req.query('token');

  if (!phone || !token) {
    return c.json({ error: "Missing phone or token parameters" }, 400);
  }

  if (!c.env || !c.env.DB) {
    return c.json({ error: "DB not available" }, 500);
  }

  const db = getDb(c.env.DB);

  try {
    const clientRecord = await db.select().from(clients).where(and(eq(clients.id, token), eq(clients.phone, phone))).get();

    if (!clientRecord) {
      return c.json({ error: "No matching application found" }, 404);
    }

    const activeEngagements = await db.select().from(engagements).where(eq(engagements.clientId, token));

    return c.json({
      success: true,
      name: clientRecord.name,
      token: clientRecord.id,
      engagements: activeEngagements
    });
  } catch (error: any) {
    return c.json({ error: "Failed to fetch status", details: error.message }, 500);
  }
});

