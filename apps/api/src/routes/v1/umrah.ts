import { Hono } from 'hono';
import { safeExecutionCtx } from '../../lib/webhookDispatcher.js';
import { getDb } from '../../db/client.js';
import { umrahPackages, groupDepartures, seatBookings, bookingPassengers, clients, waOutbox, appSettings } from '../../db/schema.js';
import { eq, desc, and } from 'drizzle-orm';
import { computePartyPrice } from '../../lib/umrahParty.js';
import { apiKeyAuth } from '../../middleware/apiKeyAuth.js';
import { idempotency } from '../../middleware/idempotency.js';
import { auditEvent } from '../../middleware/audit.js';
import { dispatchWebhook } from '../../infra/webhookDispatcher.js';

export const v1UmrahRouter = new Hono<{ Bindings: { DB: D1Database } }>();

const now = () => Math.floor(Date.now() / 1000);
const uid = () => `UB-${now()}-${crypto.randomUUID().slice(0, 8)}`;

// GET /api/v1/umrah/packages — List Packages
v1UmrahRouter.get('/packages', apiKeyAuth(['umrah:read']), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB unavailable' }, 500);
  const db = getDb(c.env.DB);

  try {
    const rows = await db
      .select()
      .from(umrahPackages)
      .orderBy(desc(umrahPackages.createdAt))
      .all();

    return c.json({
      success: true,
      data: rows.map((p: any) => ({
        id: p.id,
        name: p.name,
        tier: p.tier,
        totalDays: p.totalDays,
        makkahHotel: p.makkahHotel,
        madinahHotel: p.madinahHotel,
        departureCity: p.departureCity,
        airline: p.airline,
        soloAvailable: p.soloAvailable,
      })),
      count: rows.length,
    });
  } catch (err: any) {
    return c.json({ error: 'Failed to retrieve Umrah packages', details: err.message }, 500);
  }
});

// GET /api/v1/umrah/departures — List Live Group Departures
v1UmrahRouter.get('/departures', apiKeyAuth(['umrah:read']), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB unavailable' }, 500);
  const db = getDb(c.env.DB);

  try {
    const rows = await db
      .select()
      .from(groupDepartures)
      .where(eq(groupDepartures.status, 'open'))
      .orderBy(groupDepartures.departureDate)
      .all();

    return c.json({
      success: true,
      data: rows.map((d: any) => ({
        id: d.id,
        packageId: d.packageId,
        title: d.title,
        departureDate: d.departureDate,
        endDate: d.endDate,
        departureCity: d.departureCity,
        airline: d.airline,
        capacity: d.capacity,
        bookedSeats: d.bookedSeats,
        availableSeats: Math.max(0, d.capacity - d.bookedSeats),
        status: d.status,
      })),
      count: rows.length,
    });
  } catch (err: any) {
    return c.json({ error: 'Failed to retrieve group departures', details: err.message }, 500);
  }
});

// POST /api/v1/tours/quote — Dispatch official Pax & Rooming quotation on WhatsApp (Utility, waOutbox)
// Alias: also available as POST /api/v1/umrah/quote (backward compat). Scope tours:write (umrah:write alias).
v1UmrahRouter.post('/quote', apiKeyAuth(['tours:write']), idempotency(), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB unavailable' }, 500);
  const db = getDb(c.env.DB);
  const body = await c.req.json().catch(() => ({}));
  const toPhoneRaw = (body.phone || body.toPhone || '').trim();
  const toName = (body.name || 'Valued Traveller').trim();
  const packageId = (body.packageId || '').trim();
  const departureId = (body.departureId || '').trim();
  const paxCount = Number(body.paxCount || body.passengers?.length || 1);
  const occupancy = body.occupancy === 'solo' ? 'solo' : 'shared';
  const roomConfig = body.roomConfig || 'quad';
  if (!toPhoneRaw) return c.json({ error: 'Validation Error', message: 'phone is required.' }, 400);
  const toPhone = toPhoneRaw.replace(/\s+/g, '').replace(/^0/, '');
  const normalizedPhone = toPhone.startsWith('+') ? toPhone : `+91${toPhone.replace(/^\+91/, '')}`;
  try {
    let pkg: any = null, dep: any = null;
    if (packageId) pkg = await db.select().from(umrahPackages).where(eq(umrahPackages.id, packageId)).get();
    if (departureId) dep = await db.select().from(groupDepartures).where(eq(groupDepartures.id, departureId)).get();
    if (!pkg && dep?.packageId) pkg = await db.select().from(umrahPackages).where(eq(umrahPackages.id, dep.packageId)).get();
    const passengers = Array.isArray(body.passengers) && body.passengers.length ? body.passengers : Array.from({ length: paxCount }, (_, i) => ({ name: i === 0 ? toName : `Traveller ${i+1}`, category: 'adult' }));
    const depPrice = dep?.price ?? pkg?.retailPricePaise ?? body.totalPaise ?? 0;
    const price = pkg || dep ? computePartyPrice(depPrice, passengers as any, occupancy as any, pkg) : { totalPaise: Number(body.totalPaise) || 0, perPersonPaise: null, soloSupplementPaise: 0, groupDiscountPct: 0 } as any;
    const totalPaise = (price as any).totalPaise ?? (Number(body.totalPaise) || 0);
    const perPersonPaise = (price as any).perPersonPaise ?? null;
    const soloSupplementPaise = (price as any).soloSupplementPaise ?? 0;
    const groupDiscountPct = (price as any).groupDiscountPct ?? 0;
    const advancePerPax = dep?.bookingFee ?? pkg?.advanceFeePaise ?? 50000;
    const totalAdvance = advancePerPax * paxCount;
    const balance = Math.max(0, totalPaise - totalAdvance);
    const fmt = (p: number) => `₹${(p/100).toLocaleString('en-IN')}`;
    const lines = [
      `As-salamu Alaykum ${toName} 🧳`,
      ``,
      `*Tours & Travels — Official Quotation*`,
      pkg ? `Package: *${pkg.name}* (${pkg.tier})` : null,
      dep ? `Departure: ${new Date(dep.departureDate*1000).toLocaleDateString('en-IN')} — ${dep.departureCity || pkg?.departureCity || 'Hyderabad'}` : null,
      `Pax: *${paxCount}* (${occupancy}, ${roomConfig})${groupDiscountPct ? ` — ${groupDiscountPct}% group saving` : ''}`,
      `Total: *${fmt(totalPaise)}*${perPersonPaise ? ` (${Object.entries(perPersonPaise).map(([k,v]: any) => `${k}: ${fmt(v as number)}`).join(' | ')})` : ''}`,
      soloSupplementPaise ? `Solo supplement: ${fmt(soloSupplementPaise)}` : null,
      `Advance (non-refundable): ${fmt(totalAdvance)} — holds seats 72h`,
      `Balance: ${fmt(balance)} (pay online or at office)`,
      ``,
      `Reply *YES* to reserve or call +91 90000 00000 — Opus Overseas, Nizamabad — Tours & Travels Desk 🧳`,
    ].filter(Boolean).join('\n');
    const now = Math.floor(Date.now()/1000);
    const waId = `wa_${now}_${crypto.randomUUID().slice(0,8)}`;
    // Resolve clientId if phone matches existing client (for portal sync)
    let clientId: string | null = null;
    try {
      const hit = await db.select().from(clients).where(eq(clients.phone, normalizedPhone)).get() as any;
      if (hit?.id) clientId = hit.id;
    } catch {}
    await db.insert(waOutbox).values({
      id: waId,
      clientId,
      toPhone: normalizedPhone,
      direction: 'outbound',
      type: 'template',
      templateName: 'tours_quotation_v1',
      body: lines,
      status: 'queued',
      category: 'utility',
      createdAt: now,
      updatedAt: now,
    } as any);
    let waResult: any = { queued: true };
    try {
      const base = (c.env as any).OPENWA_BASE_URL || 'https://wa.opusoverseas.com';
      const key = (c.env as any).OPENWA_API_KEY || '';
      const sess = (c.env as any).OPENWA_SESSION_ID || 'main';
      if (base) {
        const r = await fetch(`${(base as string).replace(/\/$/, '')}/api/sessions/${encodeURIComponent(sess)}/messages/send-text`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...(key ? { 'X-API-Key': key } : {}) },
          body: JSON.stringify({ chatId: `${normalizedPhone.replace(/^\+/, '')}@c.us`, text: lines }),
        }).catch(() => null) as any;
        if (r?.ok) {
          const j = await r.json().catch(() => ({})) as any;
          waResult = { ok: true, remoteId: j?.messageId || j?.id };
          await db.update(waOutbox).set({ status: 'sent', wamid: j?.wamid || j?.messageId || null, updatedAt: Math.floor(Date.now()/1000) }).where(eq(waOutbox.id, waId));
        }
      }
    } catch {}
    safeExecutionCtx(c)?.waitUntil(Promise.all([
      auditEvent(c, { action: 'TOURS_QUOTE_SENT', entityName: 'wa_outbox', entityId: waId, result: 'success', category: 'workflow', actorType: 'service', authMethod: 'service_token', afterState: { toPhone: normalizedPhone, paxCount, totalPaise, packageId, departureId } }),
      dispatchWebhook(c.env, 'tours.quote_sent', { waId, toPhone: normalizedPhone, paxCount, totalPaise, packageId, departureId, clientId }),
    ]));
    return c.json({ success: true, data: { waId, toPhone: normalizedPhone, totalPaise, balance, advance: totalAdvance, paxCount, occupancy, roomConfig, waResult } }, 201);
  } catch (err: any) {
    return c.json({ error: 'Failed to dispatch quotation', details: err.message }, 500);
  }
});

// POST /api/v1/umrah/bookings — Create Party Booking & Hold Seats
v1UmrahRouter.post('/bookings', apiKeyAuth(['umrah:write']), idempotency(), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB unavailable' }, 500);
  const db = getDb(c.env.DB);
  const body = await c.req.json().catch(() => ({}));

  const clientId = (body.clientId || '').trim();
  const departureId = (body.departureId || '').trim();
  const roomConfig = body.roomConfig || 'quad';
  const passengers = Array.isArray(body.passengers) ? body.passengers : [];
  const paxCount = passengers.length || Number(body.paxCount) || 1;

  if (!clientId || !departureId) {
    return c.json({ error: 'Validation Error', message: 'clientId and departureId are required.' }, 400);
  }

  try {
    const dep = await db.select().from(groupDepartures).where(eq(groupDepartures.id, departureId)).get();
    if (!dep) return c.json({ error: 'Not Found', message: `Group departure '${departureId}' not found.` }, 404);

    const availableSeats = dep.capacity - dep.bookedSeats;
    if (availableSeats < paxCount) {
      return c.json(
        {
          error: 'Capacity Exceeded',
          message: `Only ${availableSeats} seats remaining on this departure. Requested: ${paxCount}.`,
          code: 'SEATS_UNAVAILABLE',
        },
        400,
      );
    }

    const bookingId = uid();
    const advanceDuePaise = 50000 * paxCount; // ₹500 advance per pax

    await db.insert(seatBookings).values({
      id: bookingId,
      clientId,
      departureId,
      roomConfig,
      paxCount,
      advancePaid: false,
      balancePaid: false,
      status: 'held',
      reservedUntil: now() + 86400, // 24-hour hold
      createdAt: now(),
      updatedAt: now(),
    });

    // Update booked seats on departure
    await db
      .update(groupDepartures)
      .set({ bookedSeats: dep.bookedSeats + paxCount })
      .where(eq(groupDepartures.id, departureId))
      .execute();

    // Insert passengers
    for (let i = 0; i < passengers.length; i++) {
      const p = passengers[i];
      await db.insert(bookingPassengers).values({
        id: `PAX-${now()}-${crypto.randomUUID().slice(0, 6)}`,
        bookingId,
        name: p.name || `Passenger ${i + 1}`,
        category: p.category || 'adult',
        createdAt: now(),
      });
    }

    safeExecutionCtx(c)?.waitUntil(
      Promise.all([
        auditEvent(c, {
          action: 'UMRAH_SEATS_HELD',
          entityName: 'seat_bookings',
          entityId: bookingId,
          result: 'success',
          category: 'workflow',
          actorType: 'service',
          authMethod: 'service_token',
          afterState: { clientId, departureId, paxCount, advanceDuePaise },
        }),
        dispatchWebhook(c.env, 'umrah.booking_created', {
          bookingId,
          clientId,
          departureId,
          paxCount,
          status: 'held',
          advanceDuePaise,
          createdAt: now(),
        }),
      ]),
    );

    return c.json(
      {
        success: true,
        data: {
          id: bookingId,
          clientId,
          departureId,
          paxCount,
          roomConfig,
          status: 'held',
          advanceDuePaise,
          reservedUntil: now() + 86400,
          createdAt: now(),
        },
      },
      201,
    );
  } catch (err: any) {
    return c.json({ error: 'Failed to create Umrah booking', details: err.message }, 500);
  }
});
