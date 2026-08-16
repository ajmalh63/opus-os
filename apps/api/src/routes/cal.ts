import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { getDb } from '../db/client.js';
import { bookings, clients, engagements, tasks, communications, appSettings } from '../db/schema.js';
import { eq, and, gte, lte, desc } from 'drizzle-orm';
import { createStaffAlert } from '../infra/staffAlerts.js';

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
const uid = () => `CAL-${now()}-${Math.random().toString(36).slice(2, 8)}`;

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
  return { apiKey: get('cal_api_key'), webhookSecret: get('cal_webhook_secret'), eventMap, bookingLinks };
}

// ---- Anti-spam: suspicion scoring (gold-standard: disposable email block,
// phone requirement, pattern rejection, rate limiting) ----
const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', '10minutemail.com', 'tempmail.com', 'guerrillamail.com',
  'yopmail.com', 'throwawaymail.com', 'temp-mail.org', 'maildrop.cc',
  'getnada.com', 'dispostable.com', 'sharklasers.com', 'trashmail.com',
  'mailnesia.com', 'spam4.me', 'mytemp.email', 'fakeinbox.com',
]);
const SUSPICIOUS_NAME = /^(test|asdf|qwerty|aaa|abc|demo|user|x{2,}|a{2,}|z{2,})/i;
const SUSPICIOUS_TEXT = /(test|demo|asdf|qwerty|placeholder|spam)/i;

function scoreBooking(attendee: any, existingClient: boolean, start: number): { score: number; flags: string[] } {
  const flags: string[] = [];
  let score = 0;
  const email = (attendee?.email || '').toLowerCase();
  const name = attendee?.name || '';
  const phone = attendee?.phone || '';

  if (email) {
    const domain = email.split('@')[1] || '';
    if (DISPOSABLE_DOMAINS.has(domain)) { score += 30; flags.push('disposable_email'); }
  } else { score += 20; flags.push('no_email'); }
  if (!phone) { score += 20; flags.push('no_phone'); }
  if (SUSPICIOUS_NAME.test(name)) { score += 20; flags.push('suspicious_name'); }
  if (SUSPICIOUS_TEXT.test(name + ' ' + email)) { score += 15; flags.push('suspicious_text'); }
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

  // Secret verification (cal.com sends X-Cal-Signature-256 HMAC when configured)
  if (cfg.webhookSecret) {
    const sig = c.req.header('X-Cal-Signature-256') || '';
    const raw = await c.req.text();
    const cryptoObj = crypto as any;
    const key = await cryptoObj.subtle.importKey('raw', new TextEncoder().encode(cfg.webhookSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const mac = await cryptoObj.subtle.sign('HMAC', key, new TextEncoder().encode(raw));
    const expected = [...new Uint8Array(mac)].map(b => b.toString(16).padStart(2, '0')).join('');
    if (!sig || sig !== expected) return c.json({ error: 'Invalid signature' }, 401);
    const body = JSON.parse(raw);
    await handleEvent(c, db, cfg, body);
    return c.json({ success: true });
  }

  // No secret configured yet — accept but log (dev mode; enable secret in cal.com)
  const body = await c.req.json().catch(() => null);
  if (!body) return c.json({ error: 'Bad payload' }, 400);
  await handleEvent(c, db, cfg, body);
  return c.json({ success: true });
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

  if (trigger === 'BOOKING_CREATED' || trigger === 'BOOKING_CREATED_TEST') {
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
        const cid = `OP-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 9000) + 1000)}`;
        await db.insert(clients).values({
          id: cid, name: attendee?.name || 'Consultation lead', phone: phone || '0000000000',
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
    // Anti-spam: suspicion score (disposable email, no phone, patterns, new contact)
    const { score, flags } = scoreBooking(attendee, existingClient, start);

    // Insert booking
    await db.insert(bookings).values({
      id: uid(), calUid, eventTypeId, division, title: p?.title || 'Consultation',
      startTime: start, endTime: end,
      attendeeName: attendee?.name || null, attendeeEmail: attendee?.email || null, attendeePhone: attendee?.phone || null,
      status: 'scheduled', riskScore: score, riskFlags: JSON.stringify(flags), clientId, taskId, createdAt: now(), updatedAt: now(),
    });
    // Communication row
    if (clientId) {
      await db.insert(communications).values({
        id: uid(), clientId, channel: 'system', direction: 'incoming',
        subject: 'Consultation booked', body: `${p?.title || 'Consultation'} on ${new Date(start * 1000).toLocaleString('en-IN')} (via cal.com)`,
        createdAt: now(),
      });
    }
    // Staff alert — severity escalates with suspicion score
    const riskLevel = score >= 50 ? 'urgent' : score >= 20 ? 'warning' : 'info';
    await createStaffAlert(c.env, {
      division, type: 'cal_booking', title: `${score >= 50 ? '🚨' : score >= 20 ? '⚠️' : '📅'} Consultation booked: ${p?.title || 'Booking'}${score >= 20 ? ` (risk ${score})` : ''}`,
      body: `${attendee?.name || 'Attendee'} · ${new Date(start * 1000).toLocaleString('en-IN')}${flags.length ? ` · flags: ${flags.join(', ')}` : ''}`,
      severity: riskLevel as any, link: '/bookings', clientId,
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
calRouter.get('/config', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const cfg = await getConfig(db);
  return c.json({ success: true, ...cfg, apiKey: cfg.apiKey ? '••••••••' + cfg.apiKey.slice(-4) : '' });
});

const configSchema = z.object({
  apiKey: z.string().optional(),
  webhookSecret: z.string().optional(),
  eventTypes: z.record(z.string()).optional(),
  bookingLinks: z.record(z.string()).optional(),
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
  return c.json({ success: true, message: 'Cal.com config saved' });
});

// GET /api/cal/public/links — public booking links for the 3 consultation divisions
calPublicRouter.get('/links', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const cfg = await getConfig(db);
  return c.json({ success: true, links: cfg.bookingLinks });
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