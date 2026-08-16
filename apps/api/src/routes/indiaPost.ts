import { Hono } from 'hono';
import { z } from 'zod';
import { zValidator } from '@hono/zod-validator';
import { getDb } from '../db/client.js';
import { transitShipments, clients, businessProfile } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { auditEvent } from '../middleware/audit.js';
import { logError } from '../infra/runtimeLog.js';

// ============================================================
// INDIA POST API — document shipping for the Attestation division.
// Proxies the VPS FastAPI wrapper (india-post-api :9888) which holds the
// real India Post credentials. Endpoints: auth, tariff, booking (domestic/
// international), labels, tracking, pincode search, webhook events.
// Mounted at /api/india-post (staff, division-scoped).
// ============================================================

export const indiaPostRouter = new Hono<{ Bindings: { DB: D1Database; INDIA_POST_BASE_URL?: string; INDIA_POST_API_KEY?: string; INDIA_POST_CUSTOMER_ID?: string; INDIA_POST_CONTRACT_ID?: string }; Variables: { user: any; session: any } }>();

const now = () => Math.floor(Date.now() / 1000);
const uid = () => `IP-${now()}-${crypto.randomUUID().slice(0, 8)}`;

function base(env: any): string {
  return (env.INDIA_POST_BASE_URL || 'http://100.87.71.38:9888').replace(/\/$/, '');
}
function headers(env: any): Record<string, string> {
  return { 'Content-Type': 'application/json', 'x-api-key': env.INDIA_POST_API_KEY || '' };
}

// ============================================================
// PINCODE SEARCH — autocomplete for sender/receiver addresses
// ============================================================
indiaPostRouter.get('/pincode', async (c) => {
  const pincode = c.req.query('pincode') || '';
  if (!/^\d{6}$/.test(pincode)) return c.json({ error: 'Pincode must be 6 digits' }, 400);
  try {
    const r = await fetch(`${base(c.env)}/api/v1/pincode/search?pincode=${pincode}&limit=5`, { headers: headers(c.env) });
    const d = await r.json() as any;
    return c.json({ success: true, offices: d?.data || [] });
  } catch (e: any) {
    logError(c.env, 'india-post.pincode', e?.message || 'pincode failed');
    return c.json({ error: 'Pincode lookup failed' }, 502);
  }
});

// ============================================================
// TARIFF — live cost preview (weight slabs × distance zones + GST)
// ============================================================
indiaPostRouter.get('/tariff', async (c) => {
  const source = c.req.query('source') || '';
  const destination = c.req.query('destination') || '';
  const weight = c.req.query('weight') || '';
  const articleType = c.req.query('articleType') || 'parcel';
  if (!/^\d{6}$/.test(source) || !/^\d{6}$/.test(destination)) return c.json({ error: 'Pincodes must be 6 digits' }, 400);
  const w = Number(weight);
  if (!w || w < 1 || w > 35000 || !Number.isInteger(w)) return c.json({ error: 'Weight must be a whole number between 1 and 35000 grams' }, 400);
  try {
    const ep = articleType === 'speed-post' ? 'speed-post' : 'parcel';
    const r = await fetch(`${base(c.env)}/api/v1/tariff/${ep}?source_pincode=${source}&destination_pincode=${destination}&weight=${w}`, { headers: headers(c.env) });
    const d = await r.json() as any;
    if (!r.ok) return c.json({ error: d?.detail || 'Tariff failed' }, 502);
    return c.json({ success: true, tariff: d });
  } catch (e: any) {
    logError(c.env, 'india-post.tariff', e?.message || 'tariff failed');
    return c.json({ error: 'Tariff lookup failed' }, 502);
  }
});

// ============================================================
// BOOK DOMESTIC — create shipment + transit record
// ============================================================
const bookSchema = z.object({
  clientId: z.string().min(1),
  articleType: z.enum(['SP', 'PARCEL']).default('SP'),
  physicalWeight: z.number().int().min(1).max(35000),
  length: z.number().optional(),
  breadth: z.number().optional(),
  height: z.number().optional(),
  // Sender (defaults to business profile)
  senderName: z.string().optional(),
  senderCompany: z.string().optional(),
  senderAddLine1: z.string().optional(),
  senderCity: z.string().optional(),
  senderState: z.string().optional(),
  senderPincode: z.string().optional(),
  senderMobile: z.string().optional(),
  // Receiver (the supplier)
  receiverName: z.string().min(1),
  receiverCompany: z.string().optional(),
  receiverAddLine1: z.string().min(1),
  receiverAddLine2: z.string().optional(),
  receiverCity: z.string().min(1),
  receiverState: z.string().optional(),
  receiverPincode: z.string().min(6).max(6),
  receiverMobile: z.string().min(1),
  receiverEmail: z.string().optional(),
  // Add-ons
  insuranceValue: z.number().optional(),
  codValue: z.number().optional(),
  acknowledgement: z.boolean().optional(),
  deliveryInstruction: z.string().optional(),
});

indiaPostRouter.post('/book', zValidator('json', bookSchema), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const body = c.req.valid('json');

  // Load business profile for sender defaults
  const prof = await db.select().from(businessProfile).where(eq(businessProfile.id, 'main')).get();
  const sender = {
    sender_name: body.senderName || prof?.legalName || 'Opus Overseas',
    sender_company: body.senderCompany || prof?.legalName || '',
    sender_add_line_1: body.senderAddLine1 || prof?.address || '',
    sender_city: body.senderCity || '',
    sender_state: body.senderState || prof?.stateName || '',
    sender_pincode: body.senderPincode || '',
    sender_mobile_no: body.senderMobile || '',
  };

  const article = {
    bulk_customer_id: Number(c.env.INDIA_POST_CUSTOMER_ID || 1935811159),
    contract_id: Number(c.env.INDIA_POST_CONTRACT_ID || 41585456),
    barcode_no: `EE${String(now()).slice(-9)}IN`, // 13 chars: EE + 9 digits + IN
    pickup_or_dropoff: 'DROPOFF',
    drop_off_pincode: body.receiverPincode,
    article_type: body.articleType,
    physical_weight: body.physicalWeight,
    ...(body.length ? { length: body.length } : {}),
    ...(body.breadth ? { breadth_diameter: body.breadth } : {}),
    ...(body.height ? { height: body.height } : {}),
    ...sender,
    receiver_name: body.receiverName,
    receiver_company: body.receiverCompany || '',
    receiver_add_line_1: body.receiverAddLine1,
    receiver_add_line_2: body.receiverAddLine2 || '',
    receiver_city: body.receiverCity,
    receiver_state: body.receiverState || '',
    receiver_pincode: body.receiverPincode,
    receiver_mobile_no: body.receiverMobile,
    receiver_emailid: body.receiverEmail || '',
    ...(body.insuranceValue ? { insurance_type: 'I', value_of_insurance: body.insuranceValue } : {}),
    ...(body.codValue ? { codr_cod: 'C', value_for_codr_cod: body.codValue } : {}),
    ...(body.acknowledgement ? { ack: 'Y' } : {}),
    ...(body.deliveryInstruction ? { delivery_instruction: body.deliveryInstruction } : {}),
  };

  try {
    const r = await fetch(`${base(c.env)}/api/v1/booking/domestic`, {
      method: 'POST', headers: headers(c.env),
      body: JSON.stringify({ articles: [article] }),
    });
    const d = await r.json() as any;
    if (!r.ok) {
      logError(c.env, 'india-post.book', `booking failed: ${JSON.stringify(d).slice(0, 300)}`);
      return c.json({ error: d?.detail || 'Booking failed' }, 502);
    }

    // Extract barcode + tariff from response (handle error_articles)
    const errs = d?.error_articles || [];
    if (errs.length > 0) {
      logError(c.env, 'india-post.book', `booking rejected: ${errs[0]?.errors?.join('; ') || 'unknown'}`);
      return c.json({ success: false, error: errs[0]?.errors?.join('; ') || 'Booking rejected by India Post', batchId: d?.batch_id }, 422);
    }
    const booked = d?.data?.articles?.[0] || d?.data || {};
    const barcode = booked?.barcode_no || booked?.article_number || article.barcode_no;
    const tariff = booked?.tariff || d?.data?.tariff || 0;

    // Create transit shipment record
    const shipmentId = uid();
    await db.insert(transitShipments).values({
      id: shipmentId,
      clientId: body.clientId,
      courierPartner: 'india-post',
      trackingNumber: barcode,
      status: 'pickup',
      shippingAddress: `${body.receiverAddLine1}, ${body.receiverCity} ${body.receiverPincode}`,
      articleType: body.articleType,
      weightGrams: body.physicalWeight,
      tariffPaise: Math.round((tariff || 0) * 100),
      rawJson: JSON.stringify(d).slice(0, 3000),
      createdAt: now(),
      updatedAt: now(),
    });

    await auditEvent(c as any, { action: 'INDIA_POST_BOOK', entityName: 'transit_shipment', entityId: shipmentId, afterState: { barcode, tariff } });
    return c.json({ success: true, shipmentId, barcode, tariff, response: d });
  } catch (e: any) {
    logError(c.env, 'india-post.book', e?.message || 'booking failed');
    return c.json({ error: 'Booking failed' }, 502);
  }
});

// ============================================================
// TRACK — single barcode
// ============================================================
indiaPostRouter.get('/track/:barcode', async (c) => {
  const barcode = c.req.param('barcode');
  try {
    const r = await fetch(`${base(c.env)}/api/v1/tracking/${encodeURIComponent(barcode)}`, { headers: headers(c.env) });
    const d = await r.json() as any;
    if (!r.ok) return c.json({ error: d?.detail || 'Tracking failed' }, 502);
    return c.json({ success: true, tracking: d });
  } catch (e: any) {
    logError(c.env, 'india-post.track', e?.message || 'tracking failed');
    return c.json({ error: 'Tracking failed' }, 502);
  }
});

// ============================================================
// LABEL — download label for a booked barcode
// ============================================================
indiaPostRouter.get('/label/:barcode', async (c) => {
  const barcode = c.req.param('barcode');
  try {
    const r = await fetch(`${base(c.env)}/api/v1/label/domestic`, {
      method: 'POST', headers: headers(c.env),
      body: JSON.stringify({ barcode_no: barcode }),
    });
    const d = await r.json() as any;
    if (!r.ok) return c.json({ error: d?.detail || 'Label failed' }, 502);
    return c.json({ success: true, label: d });
  } catch (e: any) {
    logError(c.env, 'india-post.label', e?.message || 'label failed');
    return c.json({ error: 'Label failed' }, 502);
  }
});