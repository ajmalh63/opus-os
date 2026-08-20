// Mautic Webhook Receiver (Two-Way Sync between Mautic & Opus OS)
// Receives lead score changes, form submissions, and asset downloads from Mautic.

import { Hono } from 'hono';
import { getDb } from '../db/client.js';
import { clients, tasks, auditLog } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { createStaffAlert } from '../infra/staffAlerts.js';
import { auditBounded } from '../middleware/audit.js';

export const mauticWebhookRouter = new Hono<{ Bindings: { DB: D1Database } }>();

mauticWebhookRouter.post('/', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);

  let body: any = null;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: 'Invalid JSON' }, 400);
  }

  // 1. Points Change / Tier Promotion
  if (body?.['mautic.lead_points_change']) {
    for (const item of body['mautic.lead_points_change']) {
      const lead = item?.lead;
      const email = lead?.fields?.core?.email?.value || lead?.email;
      const points = lead?.points || item?.points?.new_points;
      if (email && typeof points === 'number') {
        const existing = await db.select().from(clients).where(eq(clients.email, email.toLowerCase())).get();
        if (existing && points >= 50) {
          await createStaffAlert(c.env, {
            division: (existing.primaryDivision as any) || 'study-abroad',
            type: 'mautic_hot_tier',
            title: `🔥 Lead promoted to Hot VIP Tier: ${existing.name || email}`,
            body: `Score reached ${points} pts in Mautic — follow up immediately.`,
            severity: 'urgent',
            link: '/crm',
          });
        }
      }
    }
  }

  // 2. Form On Submit
  if (body?.['mautic.form_on_submit']) {
    for (const item of body['mautic.form_on_submit']) {
      const form = item?.form;
      const lead = item?.lead;
      const email = lead?.fields?.core?.email?.value || lead?.email;
      const name = lead?.fields?.core?.firstname?.value || lead?.name || 'Mautic Lead';
      const phone = lead?.fields?.core?.phone?.value || lead?.phone;

      if (email) {
        let client = await db.select().from(clients).where(eq(clients.email, email.toLowerCase())).get();
        if (!client) {
          const cid = `OP-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
          await db.insert(clients).values({
            id: cid,
            portalToken: crypto.randomUUID(),
            name,
            email: email.toLowerCase(),
            phone: phone || '0000000000',
            leadSource: 'mautic_form',
            primaryDivision: 'study-abroad',
            status: 'active',
            createdAt: Math.floor(Date.now() / 1000),
            updatedAt: Math.floor(Date.now() / 1000),
          });
          client = { id: cid } as any;
        }

        // Create Task for Counselor
        await db.insert(tasks).values({
          id: crypto.randomUUID(),
          clientId: client?.id || null,
          title: `Form Lead: ${form?.name || 'Mautic Form'} (${name})`,
          description: `Lead submitted form "${form?.name}" · Email: ${email} · Phone: ${phone || 'N/A'}`,
          priority: 'high',
          status: 'open',
          dueDate: Math.floor(Date.now() / 1000) + 1800,
          createdAt: Math.floor(Date.now() / 1000),
          updatedAt: Math.floor(Date.now() / 1000),
        });
      }
    }
  }

  // 3. Asset Download
  if (body?.['mautic.asset_on_download']) {
    for (const item of body['mautic.asset_on_download']) {
      const asset = item?.asset;
      const lead = item?.lead;
      const email = lead?.fields?.core?.email?.value || lead?.email;
      if (email && asset?.title) {
        await auditBounded(c, {
          action: 'ASSET_DOWNLOADED',
          entityName: 'marketing',
          entityId: email,
          result: 'success',
          category: 'business',
          actorType: 'public',
          authMethod: 'none',
          afterState: { assetTitle: asset.title, email },
        }, 'webhook');
      }
    }
  }

  return c.json({ success: true, processed: true });
});
