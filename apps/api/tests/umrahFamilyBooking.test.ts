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

describe('Umrah Family & Group Booking (multi-passenger party)', () => {
  let mockD1: MockD1Database;
  const now = Math.floor(Date.now() / 1000);

  const familyPassengers = [
    { name: 'Ahmed Khan', dob: '1985-04-12', passportNumber: 'N1234567', category: 'adult' },
    { name: 'Fatima Khan', dob: '1988-09-01', passportNumber: 'N7654321', category: 'adult' },
    { name: 'Ali Khan', dob: '2015-06-20', category: 'child_with_bed' },
    { name: 'Ayesha Khan', dob: '2018-01-15', category: 'child_with_bed' }
  ];

  beforeAll(() => {
    mockD1 = new MockD1Database();
    mockD1.tables.app_settings.push({ key: 'divisions_enabled', value: JSON.stringify({ 'study-abroad': true, visa: true, umrah: true, attestation: true, manpower: true }), updated_at: 1 });
    mockD1.tables.app_settings.push({ key: 'umrah_inventory_enabled', value: 'true', updated_at: now });
    mockD1.tables.clients.push(
      { id: 'OP-2026-9101', portal_token: 'OP-2026-9101', name: 'Ahmed Khan', phone: '+91 99999 11111', email: 'ahmed@test.com', created_at: now, updated_at: now },
      { id: 'OP-2026-9102', name: 'Solo Traveller', phone: '+91 99999 22222', email: 'solo@test.com', created_at: now, updated_at: now }
    );
    mockD1.tables.engagements.push(
      { id: 'eng-9101', client_id: 'OP-2026-9101', division: 'umrah', title: 'Umrah', stage_key: 'lead', outstanding_balance: 0, status: 'active', created_at: now, updated_at: now },
      { id: 'eng-9102', client_id: 'OP-2026-9102', division: 'umrah', title: 'Umrah', stage_key: 'lead', outstanding_balance: 0, status: 'active', created_at: now, updated_at: now }
    );
    mockD1.tables.umrah_packages.push({
      id: 'pkg-fam-1', name: 'Standard 10-Night Umrah', tier: 'standard', total_days: 10, makkah_nights: 6, madinah_nights: 4,
      flight_type: 'direct', airline: 'Saudia', departure_city: 'Hyderabad', arrival_airport: 'Jeddah (JED)',
      baggage_allowance: '30 kg + 7 kg', flight_class: 'economy', zamzam_included: 1,
      makkah_hotel: 'Swissotel Makkah', makkah_hotel_stars: 4, makkah_distance_meters: 350, makkah_walk_minutes: 5, makkah_haram_view: 'partial',
      madinah_hotel: 'Anwar Al Madinah', madinah_hotel_stars: 4, madinah_distance_meters: 300, madinah_walk_minutes: 4, madinah_haram_view: 'none',
      room_sharing: 'quad', meals_plan: 'half_board', shuttle_service: 1,
      airport_transfer: 1, intercity_transport: 'private_car', ziyarat_tours: 1, group_leader: 1, guide_language: 'Telugu / Urdu / Hindi',
      visa_included: 1, ksa_insurance: 1, visa_lead_days: 21,
      wholesale_price_paise: 11000000, retail_price_paise: 15000000, advance_fee_paise: 50000, reserve_hold_hours: 72,
      balance_due_days_before: 30, installment_available: 0, group_discount_pct: null, group_discount_min_pax: null,
      child_with_bed_price_paise: 11000000, child_no_bed_price_paise: 8000000, infant_price_paise: 2000000,
      solo_available: 1, solo_supplement_paise: 2500000,
      description: 'Family friendly', inclusions_json: '["Visa","Hotel"]', exclusions_json: '[]', documents_json: '["Passport"]',
      itinerary_json: '[]', terms_json: '["Advance non-refundable"]', special_needs: null, supplier_ref: null,
      cover_image_key: null, featured: 0, status: 'open', created_at: now, updated_at: now
    });
    mockD1.tables.group_departures.push(
      { id: 'dep-fam-1', package_id: 'pkg-fam-1', package_tier: 'standard', departure_date: now + 30 * 86400,
        departure_city: 'Hyderabad', capacity: 30, booked_seats: 0, price: 15000000, booking_fee: 50000,
        status: 'open', created_at: now },
      { id: 'dep-fam-full', package_id: 'pkg-fam-1', package_tier: 'standard', departure_date: now + 45 * 86400,
        departure_city: 'Hyderabad', capacity: 30, booked_seats: 29, price: 15000000, booking_fee: 50000,
        status: 'open', created_at: now }
    );
  });

  const bookFamily = (depId = 'dep-fam-1', token = 'OP-2026-9101', extra: any = {}) => {
    global.fetch = vi.fn(async (url: any) => {
      if (String(url).includes('/orders')) {
        return new Response(JSON.stringify({ id: 'order_fam_1', amount: 200000, currency: 'INR' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('{}', { status: 404 });
    }) as any;
    return app.request(`/api/public/portal/umrah/departures/${depId}/book?token=${token}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ departureId: depId, occupancy: 'shared', roomConfig: 'quad', passengers: familyPassengers, ...extra })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x', RAZORPAY_KEY_ID: 'rzp_test_key', RAZORPAY_KEY_SECRET: 'sec' });
  };

  it('books a family of 4 as ONE party: pax math, capacity, advance, balance', async () => {
    const res = await bookFamily();
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);
    expect(data.status).toBe('held');
    expect(data.pax_count).toBe(4);
    expect(data.room_config).toBe('quad');
    // per person: 2 adults @ 15000000 + 2 children @ 11000000 = 52000000
    expect(data.party_total_paise).toBe(52000000);
    expect(data.per_person_paise).toEqual({ adult: 15000000, childWithBed: 11000000, childNoBed: 8000000, infant: 2000000 });
    // advance = 4 × ₹500
    expect(data.advance_fee_paise).toBe(200000);
    // balance = 52000000 − 200000
    expect(data.balance_paise).toBe(51800000);
    expect(data.passengers.length).toBe(4);

    // Capacity: bookedSeats += pax (4), not 1
    const dep = mockD1.tables.group_departures.find((d: any) => d.id === 'dep-fam-1');
    expect(dep?.booked_seats).toBe(4);

    // Passengers persisted
    const passengers = mockD1.tables.booking_passengers.filter((p: any) => p.booking_id === data.bookingId);
    expect(passengers.length).toBe(4);
    expect(passengers.map((p: any) => p.category).sort()).toEqual(['adult', 'adult', 'child_with_bed', 'child_with_bed']);
    expect(passengers[0].name).toBe('Ahmed Khan');
  });

  it('falls back to adult rate when child prices are not set on the package', async () => {
    const pkg = mockD1.tables.umrah_packages.find((p: any) => p.id === 'pkg-fam-1');
    pkg.child_with_bed_price_paise = null;
    pkg.child_no_bed_price_paise = null;
    pkg.infant_price_paise = null;

    const res = await bookFamily('dep-fam-1', 'OP-2026-9101');
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    // all 4 at adult rate 15000000 = 60000000
    expect(data.party_total_paise).toBe(60000000);
    expect(data.per_person_paise.childWithBed).toBe(15000000);
    expect(data.per_person_paise.infant).toBe(15000000);
  });

  it('applies the group discount when pax >= groupDiscountMinPax', async () => {
    const pkg = mockD1.tables.umrah_packages.find((p: any) => p.id === 'pkg-fam-1');
    pkg.child_with_bed_price_paise = 11000000;
    pkg.group_discount_pct = 5;
    pkg.group_discount_min_pax = 4;

    const res = await bookFamily('dep-fam-1', 'OP-2026-9101');
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    // 52000000 × 0.95 = 49400000
    expect(data.party_total_paise).toBe(49400000);
    expect(data.balance_paise).toBe(49400000 - 200000);
  });

  it('waitlists the WHOLE party when pax > available seats (no payment, no seat increment)', async () => {
    const res = await bookFamily('dep-fam-full', 'OP-2026-9101');
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.status).toBe('waitlist');
    expect(data.message).toContain('waiting list');
    // no Razorpay order created
    expect(global.fetch).not.toHaveBeenCalled();
    // capacity unchanged
    const dep = mockD1.tables.group_departures.find((d: any) => d.id === 'dep-fam-full');
    expect(dep?.booked_seats).toBe(29);
  });

  it('rejects a party with no adult (industry: at least 1 adult per room)', async () => {
    const res = await bookFamily('dep-fam-1', 'OP-2026-9101', {
      passengers: [
        { name: 'Ali Khan', dob: '2015-06-20', category: 'child_with_bed' },
        { name: 'Ayesha Khan', dob: '2018-01-15', category: 'child_with_bed' }
      ]
    });
    expect(res.status).toBe(400);
  });

  it('rejects more than 30 passengers (capacity ceiling)', async () => {
    const many = Array.from({ length: 31 }, (_, i) => ({ name: `Pax ${i}`, category: 'adult' as const }));
    const res = await bookFamily('dep-fam-1', 'OP-2026-9101', { passengers: many });
    expect(res.status).toBe(400);
  });

  it('solo traveller (pax=1, occupancy=solo) still gets the supplement — regression', async () => {
    global.fetch = vi.fn(async (url: any) => {
      if (String(url).includes('/orders')) {
        return new Response(JSON.stringify({ id: 'order_solo2', amount: 50000, currency: 'INR' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      }
      return new Response('{}', { status: 404 });
    }) as any;
    const res = await app.request('/api/public/portal/umrah/departures/dep-fam-1/book?token=OP-2026-9102', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ departureId: 'dep-fam-1', occupancy: 'solo', passengers: [{ name: 'Solo Traveller', category: 'adult' }] })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x', RAZORPAY_KEY_ID: 'rzp_test_key', RAZORPAY_KEY_SECRET: 'sec' });

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.pax_count).toBe(1);
    expect(data.occupancy).toBe('solo');
    // 15000000 + 2500000 supplement − 50000 advance
    expect(data.balance_paise).toBe(17450000);
  });

  it('verify-advance records the ledger at pax × fee (₹2000 for a family of 4)', async () => {
    const booking = mockD1.tables.seat_bookings.find((b: any) => b.client_id === 'OP-2026-9101');
    expect(booking).toBeTruthy();
    expect(booking?.pax_count).toBe(4);

    const signature = await rzrSignature('order_fam_1', 'pay_fam_1', 'sec');
    const res = await app.request(`/api/public/portal/umrah/bookings/${booking.id}/verify-advance`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId: booking.id, razorpay_order_id: 'order_fam_1', razorpay_payment_id: 'pay_fam_1', razorpay_signature: signature })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x', RAZORPAY_KEY_SECRET: 'sec' });

    expect(res.status).toBe(200);
    const payment = mockD1.tables.payments.find((p: any) => p.client_id === 'OP-2026-9101');
    expect(payment).toBeTruthy();
    expect(payment?.amount).toBe(200000); // 4 × ₹500
  });

  it('GET my-bookings returns the party with passengers and per-person breakdown', async () => {
    const res = await app.request('/api/public/portal/umrah/my-bookings?token=OP-2026-9101', {}, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    const b = data.bookings.find((x: any) => x.clientId === 'OP-2026-9101') || data.bookings[0];
    expect(b.paxCount).toBe(4);
    expect(b.roomConfig).toBe('quad');
    expect(b.passengers.length).toBe(4);
    // passport masked at the API boundary (first 2 + last 2)
    expect(b.passengers[0].passportNumber).toBe('N1••••67');
    expect(b.passengers[0].passportNumber).not.toBe('N1234567');
    expect(b.partyTotalPaise).toBe(49400000); // group discount applied at booking time
  });

  it('staff manifest lists every passenger per booking', async () => {
    const res = await app.request('/api/umrah/departures/dep-fam-1/manifest', {
      headers: { cookie: 'better-auth.session_token=token-counselor' }
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    const row = data.manifest.find((m: any) => m.clientId === 'OP-2026-9101');
    expect(row).toBeTruthy();
    expect(row.paxCount).toBe(4);
    expect(row.passengers.length).toBe(4);
    expect(row.passengers.map((p: any) => p.category).sort()).toEqual(['adult', 'adult', 'child_with_bed', 'child_with_bed']);
  });
});