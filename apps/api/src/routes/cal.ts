import { newPortalToken } from '../lib/clientToken.js';
import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { getDb } from '../db/client.js';
import { bookings, clients, engagements, tasks, communications, appSettings } from '../db/schema.js';
import { eq, and, gte, lte, desc, inArray } from 'drizzle-orm';
import { createStaffAlert } from '../infra/staffAlerts.js';
import { sendNotification } from '../infra/notify.js';
import { notifications } from '../db/schema.js';
import { auditBounded } from '../middleware/audit.js';
import { calGetSlots, calCreateBooking, calCancelBooking } from '../lib/calApi.js';
import { mauticSyncContact } from '../infra/mautic.js';

// ============================================================
// CAL.COM — consultation scheduling for the 3 consultation-led
// divisions (study-abroad, visa, manpower). Attestation + Umrah
// are transactional and intentionally excluded (see strategy doc).
//
//  - POST /api/webhooks/cal  (public, secret-verified) — booking lifecycle
//  - GET/POST /api/cal/config (manager+) — api key, webhook secret, event map
//  - GET /api/cal/bookings    (staff, division-scoped)
// ============================================================

export const calWebhookRouter = new Hono<{ Bindings: { DB: D1Database } }>();
export const calPublicRouter = new Hono<{ Bindings: { DB: D1Database } }>();
export const calRouter = new Hono<{ Bindings: { DB: D1Database }; Variables: { user: any; session: any } }>();

const now = () => Math.floor(Date.now() / 1000);
const uid = () => `CAL-${now()}-${crypto.randomUUID().slice(0, 8)}`;

// Division ↔ event type map (seeded via config; fallback for dev)
const DEFAULT_EVENT_MAP: Record<string, string> = {
  'study-abroad': '', visa: '', manpower: '',
};

async function getConfig(db: any) {
  const rows = await db.select().from(appSettings).all();
  const get = (k: string) => rows.find((r: any) => r.key === k)?.value || '';
  let eventMap = DEFAULT_EVENT_MAP;
  try { if (get('cal_event_types')) eventMap = { ...eventMap, ...JSON.parse(get('cal_event_types')) }; } catch { /* ignore */ }
  let bookingLinks: Record<string, string> = {};
  try { if (get('cal_booking_links')) bookingLinks = JSON.parse(get('cal_booking_links')); } catch { /* ignore */ }
  return {
    apiKey: get('cal_api_key'), webhookSecret: get('cal_webhook_secret'),
    // Dual-key rotation: previous secret stays valid during the overlap window
    // so a rotation never breaks webhook delivery (see cron/secretRotation.ts).
    webhookSecretPrev: get('cal_webhook_secret_prev'), eventMap, bookingLinks,
    notifyEmail: get('cal_notify_email'), notifyWhatsapp: get('cal_notify_whatsapp'),
  };
}

// ---- Email verification: MX-record check via Cloudflare DNS-over-HTTPS.
// Catches nonexistent domains (asdf@nonexistent.com) that pass format checks.
// Workers can't do raw DNS; the 1.1.1.1 DoH JSON API is the infrastructure path.
async function hasMxRecord(domain: string): Promise<boolean> {
  if (domain === 'example.com' || domain === 'test.com' || domain === 'opusoverseas.com') return true;
  try {
    const r = await fetch(`https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=MX`, {
      headers: { accept: 'application/dns-json' },
    });
    if (!r.ok) return true; // fail-open: don't block on DNS outage
    const d = await r.json() as any;
    return (d?.Answer || []).length > 0;
  } catch {
    return true; // fail-open
  }
}

// ---- Anti-spam: suspicion scoring (gold-standard: disposable email block,
// phone requirement, pattern rejection, rate limiting) ----
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', '10minutemail.com', 'tempmail.com', 'guerrillamail.com',
  'yopmail.com', 'throwawaymail.com', 'temp-mail.org', 'maildrop.cc',
  'getnada.com', 'dispostable.com', 'sharklasers.com', 'trashmail.com',
  'mailnesia.com', 'spam4.me', 'mytemp.email', 'fakeinbox.com',
  'generator.email', 'tempail.com', 'mohmal.com', 'disposablemail.com'
]);
const SUSPICIOUS_NAME = /^(test|asdf|qwerty|aaa|abc|demo|user|x{2,}|a{2,}|z{2,})/i;
const SUSPICIOUS_TEXT = /(test|demo|asdf|qwerty|placeholder|spam)/i;
const FAKE_PHONE_PATTERN = /^(\+?\d{1,4})?\s*(\d)\2{7,}$|^(\+?\d{1,4})?\s*(0000000000|1111111111)$/;

async function scoreBooking(attendee: any, existingClient: boolean, start: number): Promise<{ score: number; flags: string[] }> {
  const flags: string[] = [];
  let score = 0;
  const email = (attendee?.email || '').toLowerCase();
  const name = (attendee?.name || '').trim();
  const phone = (attendee?.phone || '').trim();

  if (email) {
    const domain = email.split('@')[1] || '';
    if (DISPOSABLE_DOMAINS.has(domain)) { score += 40; flags.push('disposable_email'); }
    else if (!(await hasMxRecord(domain))) { score += 30; flags.push('no_mx_record'); }
  } else { score += 20; flags.push('no_email'); }
  
  if (!phone) { 
    score += 20; flags.push('no_phone'); 
  } else if (FAKE_PHONE_PATTERN.test(phone.replace(/\s+/g, ''))) {
    score += 40; flags.push('fake_phone_pattern');
  }

  if (SUSPICIOUS_NAME.test(name)) { score += 25; flags.push('suspicious_name'); }
  if (SUSPICIOUS_TEXT.test(name + ' ' + email)) { score += 20; flags.push('suspicious_text'); }
  if (!existingClient) { score += 10; flags.push('new_contact'); }
  if (start - Math.floor(Date.now() / 1000) < 2 * 3600) { score += 10; flags.push('last_minute'); }
  return { score, flags };
}

// ============================================================
// WEBHOOK — booking lifecycle (public, secret-verified)
// ============================================================
calWebhookRouter.post('/cal', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const cfg = await getConfig(db);

  // Secret verification (cal.com sends X-Cal-Signature-256 HMAC when configured).
  // DUAL-KEY: accept the CURRENT secret or the PREVIOUS one (overlap window
  // after rotation) — otherwise rotating the secret would break webhooks until
  // cal.com's copy is updated.
  if (cfg.webhookSecret) {
    const sig = c.req.header('X-Cal-Signature-256') || '';
    const raw = await c.req.text();
    const cryptoObj = crypto as any;
    const candidates = [cfg.webhookSecret, cfg.webhookSecretPrev].filter(Boolean);
    let expected = '';
    for (const secret of candidates) {
      const key = await cryptoObj.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
      const mac = await cryptoObj.subtle.sign('HMAC', key, new TextEncoder().encode(raw));
      const hex = [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, '0')).join('');
      // timing-safe accumulate: if any candidate matches, expected = that hex
      if (sig.length === hex.length) {
        let diff = 0;
        for (let i = 0; i < hex.length; i++) diff |= sig.charCodeAt(i) ^ hex.charCodeAt(i);
        if (diff === 0) { expected = hex; break; }
      }
    }
    // Timing-safe comparison (Cloudflare gold standard): hash both to fixed size,
    // compare in constant time — never direct string equality on secrets.
    const [sigHash, expHash] = await Promise.all([
      cryptoObj.subtle.digest('SHA-256', new TextEncoder().encode(sig || '')),
      cryptoObj.subtle.digest('SHA-256', new TextEncoder().encode(expected)),
    ]);
    const sigBytes = new Uint8Array(sigHash);
    const expBytes = new Uint8Array(expHash);
    let diff = sigBytes.length ^ expBytes.length;
    for (let i = 0; i < Math.min(sigBytes.length, expBytes.length); i++) diff |= sigBytes[i] ^ expBytes[i];
    if (diff !== 0) {
      await auditBounded(c, {
        action: 'WEBHOOK_REJECTED',
        entityName: 'webhooks',
        entityId: 'cal',
        result: 'error',
        category: 'access',
        actorType: 'service',
        authMethod: 'hmac',
        afterState: { source: 'cal' },
      }, 'webhook');
      return c.json({ error: 'Invalid signature' }, 401);
    }
    const body = JSON.parse(raw);
    await handleEvent(c, db, cfg, body);
    return c.json({ success: true });
  }

  // Fail-closed: without the webhook secret ANY caller could forge bookings,
  // clients, tasks and staff alerts. Require it (set in Consultations → Cal.com
  // Configuration → Webhook secret, matching the cal.com webhook settings).
  await auditBounded(c, {
    action: 'WEBHOOK_REJECTED', entityName: 'webhooks', entityId: 'cal',
    result: 'denied', category: 'access', actorType: 'service', authMethod: 'none',
    afterState: { source: 'cal', reason: 'secret_not_configured' },
  }, 'webhook');
  return c.json({ error: 'Webhook secret not configured — set cal_webhook_secret first' }, 503);
});

async function handleEvent(c: any, db: any, cfg: any, body: any) {
  const trigger = body?.triggerEvent || '';
  const p = body?.payload || {};
  const calUid = p?.uid || '';
  if (!calUid) return;

  const eventTypeId = String(p?.eventType?.id ?? p?.eventTypeId ?? '');
  // Map event type → division (reverse lookup)
  const division = Object.entries(cfg.eventMap).find(([, v]) => String(v) === eventTypeId)?.[0] || 'study-abroad';
  // Only the 3 consultation divisions
  if (!['study-abroad', 'visa', 'manpower'].includes(division)) return;

  const attendee = p?.attendees?.[0] || p?.attendee || {};
  const start = p?.startTime ? Math.floor(new Date(p.startTime).getTime() / 1000) : now();
  const end = p?.endTime ? Math.floor(new Date(p.endTime).getTime() / 1000) : start + 1800;

  const existing = await db.select().from(bookings).where(eq(bookings.calUid, calUid)).get();

  if (trigger === 'BOOKING_CREATED' || trigger === 'BOOKING_CREATED_TEST' || trigger === 'BOOKING_REQUESTED') {
    if (existing) return; // dedupe replay
    // Rate limit: max 3 bookings per email/phone per day (anti-flood)
    const email = attendee?.email || '';
    const phone = attendee?.phone || '';
    const dayAgo = now() - 86400;
    const recent = await db.select().from(bookings).where(gte(bookings.createdAt, dayAgo)).all();
    const sameContact = recent.filter((b: any) => (email && b.attendeeEmail === email) || (phone && b.attendeePhone === phone));
    if (sameContact.length >= 3) {
      await createStaffAlert(c.env, {
        division, type: 'cal_flood', title: `🚫 Booking flood blocked: ${attendee?.email || attendee?.phone || 'unknown'}`,
        body: `${sameContact.length} bookings in 24h — rate limit hit.`,
        severity: 'urgent', link: '/bookings',
      });
      return;
    }
    // Upsert client by email/phone
    let clientId: string | null = null;
    let existingClient = false;
    if (email || phone) {
      const found = await db.select().from(clients).where(eq(clients.email, email)).get()
        || (phone ? await db.select().from(clients).where(eq(clients.phone, phone)).get() : null);
      if (found) {
        clientId = found.id;
        existingClient = true;
      } else if (email) {
        const cid = `OP-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`; // display id
        const portalToken = newPortalToken();
        await db.insert(clients).values({
          id: cid, portalToken, name: attendee?.name || 'Consultation lead', phone: phone || '0000000000',
          email: email || 'pending@cal.com', leadSource: 'cal.com', primaryDivision: division,
          status: 'active', createdAt: now(), updatedAt: now(),
        });
        clientId = cid;
      }
    }
    // Create engagement
    let engagementId: string | null = null;
    if (clientId) {
      const eid = uid();
      await db.insert(engagements).values({
        id: eid, clientId, division, title: `${p?.title || 'Consultation'} (${division})`,
        stageKey: 'lead', status: 'active',
        outstandingBalance: 0, createdAt: now(), updatedAt: now(),
      });
      engagementId = eid;
    }
    // Create task
    const taskId = uid();
    await db.insert(tasks).values({
      id: taskId, clientId, engagementId, title: `Consultation: ${p?.title || 'Booking'} (${division})`,
      description: `${attendee?.name || 'Attendee'} · ${start ? new Date(start * 1000).toLocaleString('en-IN') : ''} · ${attendee?.email || ''}`,
      priority: 'medium', status: 'open', dueDate: start, createdAt: now(), updatedAt: now(),
    });
    const { score, flags } = await scoreBooking(attendee, existingClient, start);

    // Auto-Defense: If suspicion score >= 50 (fake email, disposable domain, fake phone), auto-cancel on Cal.com
    if (score >= 50 && cfg.apiKey) {
      calCancelBooking(cfg.apiKey, calUid, `Spam defense: security policy violation (${flags.join(', ')})`).catch(() => {});
      await auditBounded(c, {
        action: 'SPAM_BOOKING_AUTO_CANCELLED',
        entityName: 'bookings',
        entityId: calUid,
        result: 'success',
        category: 'access',
        actorType: 'system',
        authMethod: 'hmac',
        afterState: { calUid, email, phone, score, flags }
      }, 'webhook');
    }

    // Insert booking — pending when Requires Confirmation is active (BOOKING_REQUESTED)
    const isPending = trigger === 'BOOKING_REQUESTED';
    await db.insert(bookings).values({
      id: uid(), calUid, eventTypeId, division, title: p?.title || 'Consultation',
      startTime: start, endTime: end,
      attendeeName: attendee?.name || null, attendeeEmail: attendee?.email || null, attendeePhone: attendee?.phone || null,
      status: score >= 50 ? 'cancelled' : isPending ? 'pending' : 'scheduled', riskScore: score, riskFlags: JSON.stringify(flags), clientId, taskId, createdAt: now(), updatedAt: now(),
    });
    // Communication row
    if (clientId) {
      await db.insert(communications).values({
        id: uid(), clientId, channel: 'system', direction: 'incoming',
        subject: 'Consultation booked', body: `${p?.title || 'Consultation'} on ${new Date(start * 1000).toLocaleString('en-IN')} (via cal.com)`,
        createdAt: now(),
      });
    }
    // Staff alert — severity escalates with suspicion score; pending needs approval
    const riskLevel = score >= 50 ? 'urgent' : score >= 20 ? 'warning' : 'info';
    await createStaffAlert(c.env, {
      division, type: 'cal_booking', title: `${score >= 50 ? '🚨 [SPAM CANCELLED]' : score >= 20 ? '⚠️' : '📅'} ${isPending ? '⏳ Pending approval' : 'Consultation booked'}: ${p?.title || 'Booking'}${score >= 20 ? ` (risk ${score})` : ''}`,
      body: `${attendee?.name || 'Attendee'} · ${new Date(start * 1000).toLocaleString('en-IN')}${flags.length ? ` · flags: ${flags.join(', ')}` : ''}${score >= 50 ? ' · auto-cancelled on Cal.com' : isPending ? ' · approve in cal.com' : ''}`,
      severity: riskLevel as any, link: '/bookings', clientId,
    });

    // Out-of-band notifications for PENDING bookings: email + WhatsApp
    if (isPending) {
      const when = new Date(start * 1000).toLocaleString('en-IN');
      const msg = `⏳ PENDING consultation: ${p?.title || 'Booking'} (${division})\n${attendee?.name || 'Attendee'} · ${when}\n${attendee?.email || ''}${attendee?.phone ? ' · ' + attendee.phone : ''}${flags.length ? '\nFlags: ' + flags.join(', ') : ''}\nApprove in cal.com → OS Consultations tab`;
      if (cfg.notifyEmail) {
        await sendNotification(c.env as any, { insert: () => ({}) } as any, {
          channel: 'email', to: cfg.notifyEmail,
          subject: `⏳ Pending consultation: ${p?.title || 'Booking'} (${division})`,
          body: msg,
        }).catch(() => {});
      }
      if (cfg.notifyWhatsapp) {
        await sendNotification(c.env as any, { insert: () => ({}) } as any, {
          channel: 'whatsapp', to: cfg.notifyWhatsapp, body: msg,
        }).catch(() => {});
      }
    }
  }

  if (trigger === 'BOOKING_CONFIRMED' && existing) {
    await db.update(bookings).set({ status: 'scheduled', updatedAt: now() }).where(eq(bookings.calUid, calUid));
    if (existing.taskId) await db.update(tasks).set({ status: 'open', updatedAt: now() }).where(eq(tasks.id, existing.taskId));
    await createStaffAlert(c.env, {
      division: existing.division, type: 'cal_confirmed', title: `✅ Consultation approved: ${existing.title}`,
      body: `${existing.attendeeName || 'Attendee'} · ${new Date(existing.startTime * 1000).toLocaleString('en-IN')}`,
      severity: 'info', link: '/bookings', clientId: existing.clientId,
    });
  }

  if (trigger === 'BOOKING_REJECTED' && existing) {
    await db.update(bookings).set({ status: 'rejected', updatedAt: now() }).where(eq(bookings.calUid, calUid));
    if (existing.taskId) await db.update(tasks).set({ status: 'cancelled', updatedAt: now() }).where(eq(tasks.id, existing.taskId));
    await createStaffAlert(c.env, {
      division: existing.division, type: 'cal_rejected', title: `🚫 Consultation rejected: ${existing.title}`,
      body: `${existing.attendeeName || 'Attendee'} — not approved.`,
      severity: 'warning', link: '/bookings', clientId: existing.clientId,
    });
  }

  if (trigger === 'BOOKING_CANCELLED' && existing) {
    await db.update(bookings).set({ status: 'cancelled', updatedAt: now() }).where(eq(bookings.calUid, calUid));
    if (existing.taskId) await db.update(tasks).set({ status: 'cancelled', updatedAt: now() }).where(eq(tasks.id, existing.taskId));
    await createStaffAlert(c.env, {
      division: existing.division, type: 'cal_cancel', title: `❌ Consultation cancelled: ${existing.title}`,
      body: `${existing.attendeeName || 'Attendee'} · ${new Date(existing.startTime * 1000).toLocaleString('en-IN')}`,
      severity: 'warning', link: '/bookings', clientId: existing.clientId,
    });
  }

  if (trigger === 'BOOKING_RESCHEDULED' && existing) {
    await db.update(bookings).set({ startTime: start, endTime: end, status: 'rescheduled', updatedAt: now() }).where(eq(bookings.calUid, calUid));
    if (existing.taskId) await db.update(tasks).set({ dueDate: start, updatedAt: now() }).where(eq(tasks.id, existing.taskId));
    await createStaffAlert(c.env, {
      division: existing.division, type: 'cal_reschedule', title: `🔄 Consultation rescheduled: ${existing.title}`,
      body: `New time: ${new Date(start * 1000).toLocaleString('en-IN')}`,
      severity: 'info', link: '/bookings', clientId: existing.clientId,
    });
  }

  if (trigger === 'MEETING_ENDED' && existing) {
    await db.update(bookings).set({ status: 'completed', updatedAt: now() }).where(eq(bookings.calUid, calUid));
    if (existing.taskId) await db.update(tasks).set({ status: 'done', completedAt: now(), updatedAt: now() }).where(eq(tasks.id, existing.taskId));
    // Follow-up task
    const followUp = uid();
    await db.insert(tasks).values({
      id: followUp, clientId: existing.clientId, engagementId: null,
      title: `Follow-up after consultation: ${existing.title}`,
      description: 'Send the promised materials / shortlist / next steps within 24h.',
      priority: 'medium', status: 'open', dueDate: now() + 86400, createdAt: now(), updatedAt: now(),
    });
  }
}

// ============================================================
// CONFIG (manager+)
// ============================================================
const CAL_CONFIG_KEYS = ['cal_api_key', 'cal_webhook_secret', 'cal_event_types', 'cal_booking_links', 'cal_notify_email', 'cal_notify_whatsapp'];

const maskSecret = (s: string) => (s ? '••••••••' + s.slice(-4) : '');

async function configUpdatedAt(db: any): Promise<number | null> {
  const rows = await db.select({ updatedAt: appSettings.updatedAt }).from(appSettings).where(inArray(appSettings.key, CAL_CONFIG_KEYS)).all();
  const ts = rows.map((r: any) => Number(r.updatedAt) || 0);
  return ts.length ? Math.max(...ts) : null;
}

calRouter.get('/config', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const cfg = await getConfig(db);
  const updatedAt = await configUpdatedAt(db);
  return c.json({ success: true, ...cfg, apiKey: maskSecret(cfg.apiKey), updatedAt });
});

const configSchema = z.object({
  apiKey: z.string().optional(),
  webhookSecret: z.string().optional(),
  eventTypes: z.record(z.string()).optional(),
  bookingLinks: z.record(z.string()).optional(),
  notifyEmail: z.string().optional(),
  notifyWhatsapp: z.string().optional(),
});

calRouter.post('/config', zValidator('json', configSchema), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const body = c.req.valid('json');
  const upsert = async (key: string, value: string) => {
    const existing = await db.select().from(appSettings).where(eq(appSettings.key, key)).get();
    if (existing) await db.update(appSettings).set({ value, updatedAt: now() }).where(eq(appSettings.key, key));
    else await db.insert(appSettings).values({ key, value, updatedAt: now() });
  };
  if (body.apiKey) await upsert('cal_api_key', body.apiKey);
  if (body.webhookSecret) await upsert('cal_webhook_secret', body.webhookSecret);
  if (body.eventTypes) await upsert('cal_event_types', JSON.stringify(body.eventTypes));
  if (body.bookingLinks) await upsert('cal_booking_links', JSON.stringify(body.bookingLinks));
  if (body.notifyEmail) await upsert('cal_notify_email', body.notifyEmail);
  if (body.notifyWhatsapp) await upsert('cal_notify_whatsapp', body.notifyWhatsapp);
  // Server-authoritative confirmation: return exactly what is now stored
  // (masked secrets + maps), so the UI can show the user a real saved summary.
  const after = await getConfig(db);
  const updatedAt = await configUpdatedAt(db);
  return c.json({
    success: true,
    message: 'Cal.com config saved',
    saved: {
      apiKey: maskSecret(after.apiKey),
      webhookSecret: maskSecret(after.webhookSecret),
      eventTypes: after.eventMap,
      bookingLinks: after.bookingLinks,
      notifyEmail: after.notifyEmail,
      notifyWhatsapp: after.notifyWhatsapp,
    },
    updatedAt,
  });
});

// GET /api/cal/public/links — public booking links for the 3 consultation divisions
calPublicRouter.get('/links', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const cfg = await getConfig(db);
  return c.json({ success: true, links: cfg.bookingLinks });
});

// ============================================================
// PUBLIC BOOKING API (gold-standard anti-spam funnel)
// ------------------------------------------------------------
// The raw cal.com booking page is a spammer's dream: no bot gate, no rate
// limit, no lead validation — they can book every slot. These endpoints keep
// booking INSIDE the OS where Turnstile + rate limits + suspicion scoring +
// flood limits apply BEFORE a slot is locked. When no cal.com API key is
// configured they degrade gracefully (503 no_api_key) and the FE falls back
// to the direct cal.com link.
// ============================================================

// GET /api/cal/public/slots?division=study-abroad&start=...&end=...&timeZone=...
calPublicRouter.get('/slots', zValidator('query', z.object({
  division: z.enum(['study-abroad', 'visa', 'manpower']),
  start: z.string().min(1),
  end: z.string().min(1),
  timeZone: z.string().min(1).max(64).default('Asia/Kolkata'),
})), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const cfg = await getConfig(db);
  const q = c.req.valid('query');
  const eventTypeId = cfg.eventMap[q.division];
  if (!eventTypeId) {
    return c.json({ success: false, reason: 'no_event_type', message: 'No cal.com event type configured for this division yet' }, 503);
  }
  const res = await calGetSlots(cfg.apiKey, eventTypeId, q.start, q.end, q.timeZone);
  if (!res.ok) {
    return c.json({ success: false, reason: res.reason, message: res.message }, res.reason === 'no_api_key' ? 503 : 502);
  }
  return c.json({ success: true, slots: res.slots });
});

// POST /api/cal/public/book — server-side booking creation.
// Gates (in order): honeypot → Turnstile (middleware) → rate limit (middleware)
// → zod validation → suspicion score → flood limit → cal.com API.
calPublicRouter.post('/book', zValidator('json', z.object({
  division: z.enum(['study-abroad', 'visa', 'manpower']),
  start: z.string().min(1), // ISO-8601 UTC
  name: z.string().min(2).max(120),
  email: z.string().email().max(200),
  phone: z.string().regex(/^[0-9+\- ]{7,20}$/).optional().or(z.literal('')),
  timeZone: z.string().min(1).max(64).default('Asia/Kolkata'),
  // Qualification intent fields (with 'Other' write-in support)
  destination: z.string().max(120).optional(),
  intake: z.string().max(120).optional(),
  visaCategory: z.string().max(120).optional(),
  trade: z.string().max(120).optional(),
  customDetail: z.string().max(300).optional(),
  // Honeypot: hidden field bots fill; humans never see it. Silently accept.
  website: z.string().max(500).optional(),
})), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const body = c.req.valid('json');

  // 1. Honeypot — bots that fill the hidden field get a fake success.
  if (body.website) {
    await auditBounded(c, { action: 'BOT_TRAPPED', entityName: 'bookings', entityId: 'honeypot', result: 'denied', category: 'access', actorType: 'public', authMethod: 'none', afterState: { source: 'cal-book-honeypot' } }, 'webhook');
    return c.json({ success: true, booking: { uid: 'trapped', status: 'scheduled' } });
  }

  const cfg = await getConfig(db);
  const eventTypeId = cfg.eventMap[body.division];
  if (!eventTypeId) {
    return c.json({ success: false, reason: 'no_event_type', message: 'No cal.com event type configured for this division yet' }, 503);
  }

  // 2. Suspicion scoring (disposable email / MX check / no phone / suspicious name / new contact).
  const startTs = Math.floor(new Date(body.start).getTime() / 1000);
  if (!Number.isFinite(startTs) || startTs < Math.floor(Date.now() / 1000) - 3600) {
    return c.json({ success: false, reason: 'invalid_slot', message: 'Invalid booking time' }, 400);
  }
  const existingClient = !!(await db.select().from(clients).where(eq(clients.email, body.email.toLowerCase())).get());
  const { score, flags } = await scoreBooking(
    { email: body.email, name: body.name, phone: body.phone || '' },
    existingClient, startTs,
  );
  if (score >= 50) {
    await auditBounded(c, { action: 'BOOKING_REJECTED', entityName: 'bookings', entityId: 'score', result: 'denied', category: 'access', actorType: 'public', authMethod: 'secret', afterState: { division: body.division, score, flags } }, 'webhook');
    return c.json({ success: false, reason: 'suspicious', message: 'We could not verify your details. Please contact us directly to book.' }, 403);
  }

  // 3. Flood limit: max 2 bookings per email/phone per day (strict anti-flood).
  const dayAgo = now() - 86400;
  const recent = await db.select().from(bookings).where(gte(bookings.createdAt, dayAgo)).all();
  const sameContact = recent.filter((b: any) =>
    (body.email && b.attendeeEmail === body.email.toLowerCase()) ||
    (body.phone && b.attendeePhone === body.phone));
  if (sameContact.length >= 2) {
    await createStaffAlert(c.env, {
      division: body.division, type: 'cal_flood', title: `🚫 Booking flood blocked: ${body.email}`,
      body: `${sameContact.length} bookings in 24h — rate limit hit via public API.`,
      severity: 'urgent', link: '/bookings',
    });
    return c.json({ success: false, reason: 'flood_limit', message: 'A consultation is already registered for this contact. Our counselor will contact you shortly.' }, 429);
  }

  // 4. Qualification summary for CRM Context
  const intentSummary = [
    body.destination ? `Destination: ${body.destination}` : null,
    body.intake ? `Intake: ${body.intake}` : null,
    body.visaCategory ? `Visa: ${body.visaCategory}` : null,
    body.trade ? `Trade: ${body.trade}` : null,
    body.customDetail ? `Details: ${body.customDetail}` : null,
  ].filter(Boolean).join(' | ');

  // 5. Create the booking server-side via cal.com API v2.
  const res = await calCreateBooking(cfg.apiKey, {
    eventTypeId,
    start: body.start,
    attendee: {
      name: body.name,
      email: body.email.toLowerCase(),
      timeZone: body.timeZone,
      phoneNumber: body.phone || undefined,
    },
    metadata: {
      source: 'opusos-public-api',
      division: body.division,
      riskScore: score,
      qualification: intentSummary || undefined,
      destination: body.destination,
      intake: body.intake,
      visaCategory: body.visaCategory,
      trade: body.trade,
      customDetail: body.customDetail,
    },
  });
  if (!res.ok) {
    return c.json({ success: false, reason: res.reason, message: res.message }, res.reason === 'no_api_key' ? 503 : 502);
  }

  // 6. Upsert CRM Client & Engagement immediately
  let clientId: string | null = null;
  const existing = await db.select().from(clients).where(eq(clients.email, body.email.toLowerCase())).get()
    || (body.phone ? await db.select().from(clients).where(eq(clients.phone, body.phone)).get() : null);
  if (existing) {
    clientId = existing.id;
  } else {
    const cid = `OP-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
    const portalToken = newPortalToken();
    await db.insert(clients).values({
      id: cid,
      portalToken,
      name: body.name,
      phone: body.phone || '0000000000',
      email: body.email.toLowerCase(),
      leadSource: 'cal.com-public-api',
      primaryDivision: body.division,
      status: 'active',
      createdAt: now(),
      updatedAt: now(),
    });
    clientId = cid;
  }

  // 7. Create Task & Local Booking Row
  const taskId = uid();
  await db.insert(tasks).values({
    id: taskId,
    clientId,
    title: `Consultation: ${body.division} with ${body.name}`,
    description: `${body.name} · ${new Date(startTs * 1000).toLocaleString('en-IN')}${intentSummary ? ` · ${intentSummary}` : ''} · ${body.email} · ${body.phone || 'No phone'}`,
    priority: score >= 20 ? 'high' : 'medium',
    status: 'open',
    dueDate: startTs,
    createdAt: now(),
    updatedAt: now(),
  });

  const endTs = res.end ? Math.floor(new Date(res.end).getTime() / 1000) : startTs + 1800;
  const bookingId = uid();
  await db.insert(bookings).values({
    id: bookingId,
    calUid: res.uid || bookingId,
    eventTypeId,
    division: body.division,
    title: `${body.division} consultation`,
    startTime: startTs,
    endTime: endTs,
    attendeeName: body.name,
    attendeeEmail: body.email.toLowerCase(),
    attendeePhone: body.phone || null,
    status: res.status === 'pending' ? 'pending' : 'scheduled',
    riskScore: score,
    riskFlags: JSON.stringify(flags),
    clientId,
    taskId,
    createdAt: now(),
    updatedAt: now(),
  });

  await auditBounded(c, {
    action: 'BOOKING_CREATED',
    entityName: 'bookings',
    entityId: bookingId,
    result: 'success',
    category: 'business',
    actorType: 'public',
    authMethod: 'secret',
    afterState: { division: body.division, start: body.start, score, flags, qualification: intentSummary },
  }, 'webhook');

  // Sync to Mautic (Async / Fail-Open): Consultation bookings award 50 points -> Hot Tier VIP Journey
  mauticSyncContact(c.env as any, {
    email: body.email,
    firstname: body.name,
    phone: body.phone || undefined,
    points: 50,
    division: body.division,
    tags: [body.division, 'consultation-booked', 'hot'],
  }).catch(() => {});

  return c.json({
    success: true,
    booking: { id: bookingId, uid: res.uid, start: res.start, end: res.end, status: res.status || 'scheduled' },
  });
});

// POST /api/cal/bookings/:id/verify — staff marks a booking as verified genuine
calRouter.post('/bookings/:id/verify', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const id = c.req.param('id');
  await db.update(bookings).set({ verified: true, updatedAt: now() }).where(eq(bookings.id, id));
  return c.json({ success: true, message: 'Booking verified' });
});

// ============================================================
// BOOKINGS (staff, division-scoped)
// ============================================================
calRouter.get('/bookings', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const me = (c.get('user') as any) || {};
  let divisions: string[] = [];
  try { divisions = JSON.parse(me?.userDivisions || '[]'); } catch { divisions = []; }
  const role = me?.role || '';
  const isManager = ['super_admin', 'manager'].includes(role);

  const rows = await db.select().from(bookings).orderBy(desc(bookings.startTime)).all();
  const filtered = isManager || divisions.length === 0 ? rows : rows.filter(b => divisions.includes(b.division));

  const nowTs = now();
  const today = filtered.filter(b => b.status === 'scheduled' && b.startTime >= nowTs - 3600 && b.startTime < nowTs + 86400);
  const upcoming = filtered.filter(b => b.status === 'scheduled' && b.startTime >= nowTs + 86400);
  const past = filtered.filter(b => b.status !== 'scheduled' || b.startTime < nowTs - 3600).slice(0, 50);

  return c.json({
    success: true,
    today, upcoming, past,
    counts: {
      today: today.length, upcoming: upcoming.length,
      cancelled: filtered.filter(b => b.status === 'cancelled').length,
      completed: filtered.filter(b => b.status === 'completed').length,
    },
  });
});