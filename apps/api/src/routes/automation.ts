// Automation lane (n8n spine, Wave 2).
// Mounted at /api/automation; gated by serviceTokenMiddleware (fail-closed).
// Exposes exactly what the 5 n8n workflows need — nothing human-facing, no
// RBAC routes. Read-only + one idempotent write (kill/retry) per workflow.

import { Hono } from 'hono';
import { getDb } from '../db/client.js';
import { nurtureTouches, erpnextSyncLog, clients, communications, consents, payments, engagements, listmonkSuppressions, tasks } from '../db/schema.js';
import { and, eq, lte } from 'drizzle-orm';
import { erpHealth, erpUpsert } from '../infra/erpnext.js';
import { sendNotification } from '../infra/notify.js';
import { getListmonkTemplateId } from '../infra/listmonk.js';
import { nurtureTouchTemplate } from '../infra/emailTemplates.js';
import { auditEvent } from '../middleware/audit.js';

type Body = {
  DB: D1Database; AUTOMATION_TOKEN?: string;
  ERPNEXT_BASE_URL?: string; ERPNEXT_API_KEY?: string; ERPNEXT_API_SECRET?: string;
  WA_PROVIDER?: 'openwa' | 'meta';
  OPENWA_BASE_URL?: string; OPENWA_API_KEY?: string; OPENWA_SESSION_ID?: string;
  META_WHATSAPP_PHONE_ID?: string; META_WHATSAPP_TOKEN?: string;
};

export const automationRouter = new Hono<{ Bindings: Body }>();

// GET /api/automation/health — what n8n polls (per the 5-workflow spine)
automationRouter.get('/health', async (c) => {
  let erp = 'unknown';
  if (c.env.ERPNEXT_BASE_URL) {
    const r = await erpHealth(c.env as any);
    erp = r.ok ? 'up' : 'down';
  }
  const db = getDb(c.env.DB);
  const now = Number(c.req.query('now')) || Math.floor(Date.now() / 1000);
  const due = await db.select({ id: nurtureTouches.id }).from(nurtureTouches)
    .where(and(eq(nurtureTouches.status, 'scheduled'), lte(nurtureTouches.dueAt, now))).all().catch(() => []);
  return c.json({ ok: true, services: { db: 'up', erp, automation: 'up' }, dueNurtureTouches: due.length });
});

// GET /api/automation/nurture/due — provider-consumer pull (workflow: nurture-due).
// Email-channel touches for suppressed subscribers (DPDP: hard bounce,
// 3× soft, unsubscribe, complaint) are excluded — suppression wins over sends.
automationRouter.get('/nurture/due', async (c) => {
  const db = getDb(c.env.DB);
  const now = Number(c.req.query('now')) || Math.floor(Date.now() / 1000);
  let rows = await db.select().from(nurtureTouches)
    .where(and(eq(nurtureTouches.status, 'scheduled'), lte(nurtureTouches.dueAt, now))).all();
  try {
    const { getSuppressedEmails } = await import('./listmonkWebhooks.js');
    const suppressed = await getSuppressedEmails(db);
    if (suppressed.size > 0) {
      const clientRows = await db.select().from(clients).all();
      const emailOf = new Map(clientRows.map((cl: any) => [cl.id, (cl.email || '').toLowerCase()]));
      rows = rows.filter((t) => t.channel !== 'email' || !suppressed.has(emailOf.get(t.clientId) || ''));
    }
  } catch { /* suppression is best-effort; never block the lane */ }
  return c.json({ touches: rows });
});

// POST /api/automation/nurture/:id/send — dispatch a due touch for real:
// personalizes the campaign body, sends via WhatsApp provider (OpenWA/Meta),
// records a communication + audit, then marks the touch sent. Idempotent:
// already-sent touches return without re-sending. On provider failure the
// touch stays 'scheduled' so the n8n retry keeps polling.
automationRouter.post('/nurture/:id/send', async (c) => {
  const db = getDb(c.env.DB);
  const id = c.req.param('id');
  const now = Math.floor(Date.now() / 1000);

  const found = await db.select().from(nurtureTouches).where(eq(nurtureTouches.id, id)).all();
  if (found.length === 0) return c.json({ error: 'not found' }, 404);
  const touch = found[0];
  if (touch.status === 'sent') return c.json({ id, status: 'sent' });

  const client = await db.select().from(clients).where(eq(clients.id, touch.clientId)).get();
  if (!client) return c.json({ error: 'client not found', touchId: id }, 404);
  const isEmail = touch.channel === 'email';
  if (isEmail && !client.email) return c.json({ error: 'client has no email', touchId: id }, 400);
  if (!isEmail && !client.phone) return c.json({ error: 'client has no phone', touchId: id }, 400);

  // DPDP re-check at SEND time (gold standard): the touch was planned under an
  // earlier consent; if the client withdrew it since, we must not send. The
  // touch is flipped to 'skipped' so the poller stops retrying.
  const consentType = isEmail ? 'marketing-campaigns' : 'whatsapp-updates';
  const liveConsent = await db.select().from(consents)
    .where(and(eq(consents.clientId, touch.clientId), eq(consents.consentType, consentType as any), eq(consents.status, 'granted')))
    .all();
  if (liveConsent.length === 0) {
    await db.update(nurtureTouches).set({ status: 'skipped', sentAt: now }).where(eq(nurtureTouches.id, id)).run();
    return c.json({ id, status: 'skipped', reason: 'consent withdrawn since planning' });
  }

  // DPDP suppression re-check for email (hard bounce / 3× soft / unsubscribe
  // may have landed between the due-poll and this send) — suppression wins.
  if (isEmail) {
    try {
      const { getSuppressedEmails } = await import('./listmonkWebhooks.js');
      const suppressed = await getSuppressedEmails(db);
      if (suppressed.has((client.email || '').toLowerCase())) {
        await db.update(nurtureTouches).set({ status: 'skipped', sentAt: now }).where(eq(nurtureTouches.id, id)).run();
        return c.json({ id, status: 'skipped', reason: 'subscriber suppressed at send time' });
      }
    } catch { /* best-effort */ }
  }

  // Personalisation: {{name}} + any dynamicContext keys (targetCountry, sector, …)
  let context: Record<string, any> = {};
  try { context = client.intakeContext ? JSON.parse(client.intakeContext) : {}; } catch { /* keep {} */ }
  const body = touch.body
    .replace(/\{\{\s*name\s*\}\}/g, client.name || 'there')
    .replace(/\{\{\s*(\w+)\s*\}\}/g, (_, k) => String(context[k] ?? `{{${k}}}`));

  const headingMap: Record<string, string> = { value: 'Insights for Your Journey — Opus Overseas', case_study: 'Success Story — Opus Overseas', offer: 'Your Next Step with Opus Overseas', final: 'Final Reminder — Opus Overseas' };
  const nurtureHeading = headingMap[touch.stage] || `Update — ${touch.stage}`;
  const nurtureSubject = nurtureHeading;
  const nurtureHtml = isEmail ? nurtureTouchTemplate({ leadName: client.name || 'there', heading: nurtureHeading, messageBody: body }).html : body;
  const nurtureData = isEmail ? { Heading: nurtureHeading, LeadName: client.name || 'there', MessageBody: body, Subject: nurtureSubject } : undefined;
  const res = await sendNotification(c.env as any, db as any, isEmail
    ? { channel: 'email', to: client.email, subject: nurtureSubject, body: nurtureHtml, templateId: getListmonkTemplateId(c.env as any, 'nurtureTouch'), data: nurtureData, clientId: client.id }
    : { channel: 'whatsapp', to: client.phone, body, clientId: client.id });
  if (!res.ok) {
    return c.json({ error: 'send failed', reason: res.reason || 'unknown', touchId: id }, 502);
  }

  // Durable record of the outbound message + audit — then flip the touch.
  await db.insert(communications).values({
    id: crypto.randomUUID(),
    clientId: client.id,
    senderId: null,
    channel: touch.channel,
    direction: 'outgoing',
    subject: touch.channel === 'email' ? nurtureSubject : `nurture:${touch.campaignId || 'default'}:${touch.stage}`,
    body,
    createdAt: now,
  }).catch(() => {});
  await auditEvent(c, { action: 'NURTURE_DISPATCHED', entityName: 'nurture_touches', entityId: id, actorType: 'service', authMethod: 'service_token', afterState: { clientId: client.id, stage: touch.stage, provider: res.provider, remoteId: res.remoteId } });
  await db.update(nurtureTouches).set({ status: 'sent', sentAt: now }).where(eq(nurtureTouches.id, id)).run();
  return c.json({ id, status: 'sent', provider: res.provider, remoteId: res.remoteId });
});

// GET /api/automation/erp/sync-log — n8n polls failed rows for alerting
automationRouter.get('/erp/sync-log', async (c) => {
  const db = getDb(c.env.DB);
  const rows = await db.select().from(erpnextSyncLog).all();
  const list = rows.sort((a: any, b: any) => (b.createdAt || 0) - (a.createdAt || 0)).slice(0, 50)
    .map((r: any) => ({ id: r.id, entityId: r.entityId, doctype: r.doctype, status: r.status, error: r.error, attempts: r.attempts }));
  return c.json({ entries: list });
});

// POST /api/automation/erp/sync/pending — n8n retries failed rows (bounded)
automationRouter.post('/erp/sync/pending', async (c) => {
  const db = getDb(c.env.DB);
  const rows = (await db.select().from(erpnextSyncLog).all())
    .filter((r: any) => r.status === 'pending' || r.status === 'failed');
  let pushed = 0, failed = 0;
  const now = Math.floor(Date.now() / 1000);
  for (const r of rows.slice(0, 25)) {
    const payload = JSON.parse(r.payloadJson || '{}') as Record<string, any>;
    const res = await erpUpsert(c.env as any, r.doctype, payload);
    if (res.ok) {
      await db.update(erpnextSyncLog)
        .set({ status: 'synced', attempts: (r.attempts || 0) + 1, erpDocName: (res.data as any)?.name || r.entityId, syncedAt: now, error: null })
        .where(eq(erpnextSyncLog.id, r.id));
      pushed++;
    } else {
      await db.update(erpnextSyncLog)
        .set({ status: 'failed', attempts: (r.attempts || 0) + 1, error: res.message || 'ERPNext push failed' })
        .where(eq(erpnextSyncLog.id, r.id));
      failed++;
    }
  }
  return c.json({ success: true, pushed, failed, total: rows.length });
});

// GET /api/automation/digest/weekly?days=7 — owner ops digest (Wave 4).
// Decisions-first (analytics-tracking skill): a tight KPI set with exceptions
// flagged. One source of truth for the n8n 06-owner-weekly-digest workflow.
automationRouter.get('/digest/weekly', async (c) => {
  const db = getDb(c.env.DB);
  const now = Math.floor(Date.now() / 1000);
  const days = Math.min(90, Math.max(1, Number(c.req.query('days')) || 7));
  const since = now - days * 86400;

  const [touches, erpRows, payRows, clientRows, engRows, supRows, taskRows] = await Promise.all([
    db.select().from(nurtureTouches).all().catch(() => []),
    db.select().from(erpnextSyncLog).all().catch(() => []),
    db.select().from(payments).all().catch(() => []),
    db.select().from(clients).all().catch(() => []),
    db.select().from(engagements).all().catch(() => []),
    db.select().from(listmonkSuppressions).all().catch(() => []),
    db.select().from(tasks).all().catch(() => []),
  ]);

  const sent = touches.filter((t) => t.status === 'sent' && Number(t.sentAt || 0) >= since).length;
  const skipped = touches.filter((t) => t.status === 'skipped' && Number(t.sentAt || 0) >= since).length;
  const dueNow = touches.filter((t) => t.status === 'scheduled' && Number(t.dueAt || 0) <= now).length;

  const erpFailed = erpRows.filter((r) => (r.status === 'failed' || r.status === 'pending') && Number(r.createdAt || 0) >= since);
  const erpSamples = erpFailed.slice(0, 3).map((r) => String(r.error || r.status).slice(0, 120));

  const liveLinks = payRows.filter((r) => r.linkStatus === 'created' && r.status !== 'paid' && r.status !== 'void');
  const staleLinks = liveLinks.filter((r) => now - Number(r.createdAt || 0) >= 5 * 86400).length;

  const receivables = engRows.reduce((sum, e) => sum + Number(e.outstandingBalance || 0), 0);
  const negativeBals = engRows.filter((e) => Number(e.outstandingBalance || 0) < 0).length;

  const newLeads = clientRows.filter((cl) => Number(cl.createdAt || 0) >= since).length;
  const suppressed = supRows.filter((s) => s.suppressed).length;

  // Kanban flow insight (Phase 3): true cycle p85 + blocked count from the
  // task engine — the feedback loop that boringly improves delivery.
  const doneFlow = taskRows.filter((t) => t.status === 'done' && Number(t.completedAt || 0) >= since)
    .map((t) => Number(t.completedAt) - Number(t.inProgressAt || t.createdAt)).filter((v) => v > 0).sort((a, b) => a - b);
  const cycleP85 = doneFlow.length ? Math.round(doneFlow[Math.min(doneFlow.length - 1, Math.ceil(0.85 * doneFlow.length) - 1)] / 3600 * 10) / 10 : null;
  const blockedCount = taskRows.filter((t) => t.status !== 'done' && t.status !== 'cancelled' && !!t.blockedReason).length;

  const flagged: string[] = [];
  if (erpFailed.length > 0) flagged.push(`ERP sync failures: ${erpFailed.length}`);
  if (staleLinks > 0) flagged.push(`stale payment links (â‰¥5d): ${staleLinks}`);
  if (negativeBals > 0) flagged.push(`negative engagement balances: ${negativeBals}`);
  if (blockedCount > 0) flagged.push(`blocked board tasks: ${blockedCount}`);

const markdown = [
    `📊 OpusOS Ops Digest — last ${days}d`,
    `🕐 ${new Date(now * 1000).toISOString().slice(0, 16).replace('T', ' ')} UTC`,
    `🧲 Leads: ${newLeads}`,
    `💌 Nurture: ${sent} sent · ${skipped} skipped · ${dueNow} due now`,
    `🚫 Suppressed subscribers: ${suppressed}`,
    `🏦 Receivables: ₹${(receivables / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}${negativeBals > 0 ? ' ⚠️' : ''}`,
    `⛓ Payment links: ${liveLinks.length} outstanding (${staleLinks} stale ≥5d${staleLinks > 0 ? ' ⚠️' : ''})`,
    `🔄 ERP sync: ${erpFailed.length} failed in window${erpFailed.length > 0 ? ' ⚠️' : ''}`,
    `📋 Kanban flow: cycle p85 ${cycleP85 != null ? `${cycleP85}h` : '—'} · ${blockedCount} blocked${blockedCount > 0 ? ' ⚠️' : ''}`,
    ...(erpSamples.map((e) => `   · ${e}`)),
    ...(flagged.length > 0 ? ['', `⚠️ Needs attention: ${flagged.join(' · ')}`] : ['', '✅ All clear.']),
  ].join('\n');

  return c.json({
    ok: true, windowDays: days, generatedAt: now,
    summary: {
      leads: newLeads,
      nurture: { sent, skipped, dueNow },
      suppressed,
      receivables: { totalPaise: receivables, negativeCount: negativeBals },
      links: { outstanding: liveLinks.length, stale: staleLinks },
      erp: { failed: erpFailed.length, samples: erpSamples },
    },
    markdown,
  });
});

// POST /api/automation/guard/check — GUARD CONTRACT (send verdict).
// Tools (n8n/Listmonk/Mautic workflows) ask "may I send to X?" before
// delivering: the OS vetoes suppressed contacts and marketing sends lacking
// live consent (privacy-by-design, DPDP intent of record). Fail-closed:
// malformed contact â†’ block; OS-unknown contact â†’ informational allow.
// Auth: X-Service-Token (tools) — audit stores verdict/channel/purpose only
// (no raw contact: data minimization).
automationRouter.post('/guard/check', async (c) => {
  const db = getDb(c.env.DB);
  const body: any = await c.req.json().catch(() => ({}));
  const channel = body.channel === 'whatsapp' ? 'whatsapp' as const : 'email' as const;
  const purpose = body.purpose === 'transactional' ? 'transactional' as const : 'marketing' as const;
  const to = typeof body.to === 'string' ? body.to : '';
  const clientId = typeof body.clientId === 'string' ? body.clientId : undefined;
  const { runGuard } = await import('../lib/guard.js');
  const result = await runGuard(db, { channel, to, clientId, purpose });
  try {
    const { auditEvent } = await import('../middleware/audit.js');
    await auditEvent(c, {
      action: `GUARD_${result.verdict.toUpperCase()}`,
      entityName: 'guard',
      entityId: clientId || '<external>',
      afterState: { channel, purpose, reason: result.reason },
    });
  } catch { /* audit best-effort */ }
  return c.json({ ok: true, verdict: result.verdict, reason: result.reason, checks: result.checks });
});
