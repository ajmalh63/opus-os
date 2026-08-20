import { describe, it, expect, beforeAll, vi } from 'vitest';
import app from '../src/index.js';
import { MockD1Database } from './mockDb.js';

vi.mock('../src/auth.js', () => {
  return {
    getAuth: (env: any) => {
      return {
        api: {
          getSession: async (options: any) => {
            const cookieHeader = options?.headers?.get('cookie') || '';
            const match = cookieHeader.match(/better-auth\.session_token=([^;]+)/);
            const token = match ? match[1] : null;
            if (token === 'token-counselor') {
              return {
                user: { id: 'counselor-1', name: 'Counselor', email: 'c@test.com', role: 'counselor', userDivisions: JSON.stringify(['umrah']) },
                session: { id: 's1', token, userId: 'counselor-1' }
              };
            }
            return null;
          }
        }
      };
    }
  };
});

// Compute the Razorpay HMAC-SHA256 signature (order_id|payment_id) — same as the route.
async function rzrSignature(orderId: string, paymentId: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const keyData = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', keyData, enc.encode(`${orderId}|${paymentId}`));
  return Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

describe('Umrah Client Portal Booking (₹500 advance → 3-day hold)', () => {
  let mockD1: MockD1Database;
  const now = Math.floor(Date.now() / 1000);

  beforeAll(() => {
    mockD1 = new MockD1Database();
    mockD1.tables.app_settings.push({ key: 'divisions_enabled', value: JSON.stringify({ 'study-abroad': true, visa: true, umrah: true, attestation: true, manpower: true }), updated_at: 1 });
    mockD1.tables.app_settings.push({ key: 'umrah_inventory_enabled', value: 'true', updated_at: now });
    mockD1.tables.clients.push(
      { id: 'OP-2026-9001', name: 'Client One', phone: '+91 99999 11111', email: 'c1@test.com', created_at: now, updated_at: now },
      { id: 'OP-2026-9002', name: 'Client Two', phone: '+91 99999 22222', email: 'c2@test.com', created_at: now, updated_at: now }
    );
    mockD1.tables.engagements.push(
      { id: 'eng-9001', client_id: 'OP-2026-9001', division: 'umrah', title: 'Umrah', stage_key: 'lead', outstanding_balance: 0, status: 'active', created_at: now, updated_at: now }
    );
    mockD1.tables.umrah_packages.push({
      id: 'pkg-eco-1', name: 'Economy 7-Night Umrah', tier: 'economy', total_days: 7, makkah_nights: 4, madinah_nights: 3,
      flight_type: 'one_stop', airline: 'IndiGo', departure_city: 'Hyderabad', arrival_airport: 'Jeddah (JED)',
      baggage_allowance: '30 kg + 7 kg', flight_class: 'economy', zamzam_included: 1,
      makkah_hotel: 'Emaar Al Khalil', makkah_hotel_stars: 3, makkah_distance_meters: 650, makkah_walk_minutes: 8, makkah_haram_view: 'none',
      madinah_hotel: 'Elaf Taiba', madinah_hotel_stars: 3, madinah_distance_meters: 450, madinah_walk_minutes: 5, madinah_haram_view: 'none',
      room_sharing: 'quad', meals_plan: 'breakfast', shuttle_service: 0,
      airport_transfer: 1, intercity_transport: 'group_bus', ziyarat_tours: 1, group_leader: 0, guide_language: 'Telugu / Urdu',
      visa_included: 1, ksa_insurance: 1, visa_lead_days: 21,
      wholesale_price_paise: 9000000, retail_price_paise: 12500000, advance_fee_paise: 50000, reserve_hold_hours: 72,
      balance_due_days_before: 30, installment_available: 0, group_discount_pct: null, group_discount_min_pax: null,
      description: 'Budget-friendly', inclusions_json: '["Visa","Hotel"]', exclusions_json: '["PCR"]', documents_json: '["Passport"]',
      itinerary_json: '[]', terms_json: '["Advance non-refundable"]', special_needs: null, supplier_ref: null,
      cover_image_key: null, featured: 0, status: 'open', created_at: now, updated_at: now
    });
    mockD1.tables.group_departures.push({
      id: 'dep-eco-1', package_id: 'pkg-eco-1', package_tier: 'economy', departure_date: now + 30 * 86400,
      departure_city: 'Hyderabad', capacity: 30, booked_seats: 0, price: 12500000, booking_fee: 50000,
      status: 'open', created_at: now
    });
  });

  it('GET /api/public/portal/umrah/packages returns open packages when enabled', async () => {
    const res = await app.request('/api/public/portal/umrah/packages', {}, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.comingSoon).toBe(false);
    expect(data.enabled).toBe(true);
    expect(data.packages.length).toBe(1);
    expect(data.packages[0].name).toBe('Economy 7-Night Umrah');
  });

  it('GET /api/public/portal/umrah/calendar returns availability (30 capacity, 0 filled)', async () => {
    const res = await app.request('/api/public/portal/umrah/calendar', {}, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.days.length).toBe(1);
    expect(data.days[0].capacity).toBe(30);
    expect(data.days[0].available).toBe(30);
    expect(data.days[0].advanceFeePaise).toBe(50000);
  });

  it('POST /api/public/portal/umrah/departures/:id/book creates held booking + ₹500 Razorpay order', async () => {
    global.fetch = vi.fn(async (url: any) => {
      if (String(url).includes('/orders')) {
        return new Response(JSON.stringify({ id: 'order_adv_1', amount: 50000, currency: 'INR' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('{}', { status: 404 });
    }) as any;

    const res = await app.request('/api/public/portal/umrah/departures/dep-eco-1/book?token=OP-2026-9001', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ departureId: 'dep-eco-1' })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x', RAZORPAY_KEY_ID: 'rzp_test_key', RAZORPAY_KEY_SECRET: 'sec' });

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);
    expect(data.status).toBe('held');
    expect(data.advance_fee_paise).toBe(50000);
    expect(data.advance_non_refundable).toBe(true);
    expect(data.reserve_hold_hours).toBe(72);
    expect(data.balance_paise).toBe(12450000); // 12500000 - 50000
    expect(data.order_id).toBe('order_adv_1');

    // Seat counted immediately (prevents oversell)
    const dep = mockD1.tables.group_departures.find((d: any) => d.id === 'dep-eco-1');
    expect(dep?.booked_seats).toBe(1);
  });

  it('POST /api/public/portal/umrah/bookings/:id/verify-advance reserves seat for 3 days', async () => {
    const booking = mockD1.tables.seat_bookings.find((b: any) => b.client_id === 'OP-2026-9001');
    expect(booking).toBeTruthy();
    expect(booking?.status).toBe('held');

    const signature = await rzrSignature('order_adv_1', 'pay_adv_1', 'sec');
    const res = await app.request(`/api/public/portal/umrah/bookings/${booking.id}/verify-advance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId: booking.id, razorpay_order_id: 'order_adv_1', razorpay_payment_id: 'pay_adv_1', razorpay_signature: signature })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x', RAZORPAY_KEY_SECRET: 'sec' });

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.status).toBe('reserved');
    expect(data.reservedUntil).toBeGreaterThan(now);
    expect(data.reservedUntil).toBeLessThanOrEqual(now + 72 * 3600 + 5);

    const updated = mockD1.tables.seat_bookings.find((b: any) => b.id === booking.id);
    expect(updated?.advance_paid).toBe(1);
    expect(updated?.status).toBe('reserved');
    expect(updated?.reserved_until).toBe(data.reservedUntil);

    // Payment ledger entry for the advance
    const payment = mockD1.tables.payments.find((p: any) => p.client_id === 'OP-2026-9001');
    expect(payment).toBeTruthy();
    expect(payment?.amount).toBe(50000);
    expect(payment?.method).toBe('online');
  });

  it('POST verify-advance rejects a bad signature with 403', async () => {
    const booking = mockD1.tables.seat_bookings.find((b: any) => b.client_id === 'OP-2026-9001');
    const res = await app.request(`/api/public/portal/umrah/bookings/${booking.id}/verify-advance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId: booking.id, razorpay_order_id: 'order_adv_1', razorpay_payment_id: 'pay_adv_1', razorpay_signature: 'deadbeef' })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x', RAZORPAY_KEY_SECRET: 'sec' });
    expect(res.status).toBe(403);
  });

  it('GET /api/public/portal/umrah/my-bookings returns the tracker with balance due', async () => {
    const res = await app.request('/api/public/portal/umrah/my-bookings?token=OP-2026-9001', {}, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.bookings.length).toBe(1);
    const b = data.bookings[0];
    expect(b.status).toBe('reserved');
    expect(b.advancePaid).toBe(true);
    expect(b.balance_due).toBe(12450000);
    expect(b.package?.name).toBe('Economy 7-Night Umrah');
  });

  it('POST book with occupancy=solo adds the supplement to the balance', async () => {
    // Mark the package solo-available with a ₹20,000 supplement
    const pkg = mockD1.tables.umrah_packages.find((p: any) => p.id === 'pkg-eco-1');
    pkg.solo_available = 1;
    pkg.solo_supplement_paise = 2000000;

    global.fetch = vi.fn(async (url: any) => {
      if (String(url).includes('/orders')) {
        return new Response(JSON.stringify({ id: 'order_solo_1', amount: 50000, currency: 'INR' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('{}', { status: 404 });
    }) as any;

    const res = await app.request('/api/public/portal/umrah/departures/dep-eco-1/book?token=OP-2026-9002', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ departureId: 'dep-eco-1', occupancy: 'solo' })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x', RAZORPAY_KEY_ID: 'rzp_test_key', RAZORPAY_KEY_SECRET: 'sec' });

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.occupancy).toBe('solo');
    expect(data.solo_supplement_paise).toBe(2000000);
    // balance = retail(12500000) + supplement(2000000) - advance(50000) = 14450000
    expect(data.balance_paise).toBe(14450000);

    const booking = mockD1.tables.seat_bookings.find((b: any) => b.client_id === 'OP-2026-9002');
    expect(booking?.occupancy).toBe('solo');
  });

  it('Coming Soon gate: disabled inventory returns comingSoon=true', async () => {
    const mock2 = new MockD1Database();
    mock2.tables.app_settings.push({ key: 'divisions_enabled', value: JSON.stringify({ 'study-abroad': true, visa: true, umrah: true, attestation: true, manpower: true }), updated_at: 1 });
    mock2.tables.app_settings.push({ key: 'umrah_inventory_enabled', value: 'false', updated_at: now });
    const res = await app.request('/api/public/portal/umrah/packages', {}, { DB: mock2, BETTER_AUTH_SECRET: 'x' });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.comingSoon).toBe(true);
    expect(data.packages.length).toBe(0);
  });
});
