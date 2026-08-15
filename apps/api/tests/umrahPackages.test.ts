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
            if (token === 'token-manager') {
              return {
                user: { id: 'manager-1', name: 'Manager', email: 'm@test.com', role: 'manager', userDivisions: JSON.stringify(['umrah']) },
                session: { id: 's1', token, userId: 'manager-1' }
              };
            }
            return null;
          }
        }
      };
    }
  };
});

describe('Umrah Package Inventory (Phase 3)', () => {
  let mockD1: MockD1Database;
  const now = Math.floor(Date.now() / 1000);

  beforeAll(() => {
    mockD1 = new MockD1Database();
    mockD1.tables.app_settings.push({ key: 'umrah_inventory_enabled', value: 'true', updated_at: now });
  });

  it('POST /api/umrah/packages creates a package with paise pricing', async () => {
    const res = await app.request('/api/umrah/packages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': 'better-auth.session_token=token-manager' },
      body: JSON.stringify({
        name: 'Economy 7-Night Umrah — Hyderabad',
        tier: 'economy',
        totalDays: 7,
        makkahNights: 4,
        madinahNights: 3,
        flightType: 'one_stop',
        airline: 'IndiGo',
        departureCity: 'Hyderabad',
        arrivalAirport: 'Jeddah (JED)',
        baggageAllowance: '30 kg + 7 kg hand',
        makkahHotel: 'Emaar Al Khalil',
        makkahHotelStars: 3,
        makkahDistanceMeters: 650,
        makkahWalkMinutes: 8,
        madinahHotel: 'Elaf Taiba',
        madinahHotelStars: 3,
        madinahDistanceMeters: 450,
        madinahWalkMinutes: 5,
        roomSharing: 'quad',
        mealsPlan: 'breakfast',
        wholesalePricePaise: 9000000,
        retailPricePaise: 12500000,
        advanceFeePaise: 50000,
        reserveHoldHours: 72,
        status: 'draft'
      })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);
    expect(data.id).toBeTruthy();

    const pkg = mockD1.tables.umrah_packages.find((p: any) => p.id === data.id);
    expect(pkg).toBeTruthy();
    expect(pkg?.retail_price_paise).toBe(12500000);
    expect(pkg?.advance_fee_paise).toBe(50000);
    expect(pkg?.reserve_hold_hours).toBe(72);
    expect(pkg?.makkah_distance_meters).toBe(650);
  });

  it('GET /api/umrah/packages lists packages with departure stats', async () => {
    const res = await app.request('/api/umrah/packages', {
      headers: { 'Cookie': 'better-auth.session_token=token-manager' }
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);
    expect(Array.isArray(data.packages)).toBe(true);
    expect(data.packages.length).toBe(1);
  });

  it('PATCH /api/umrah/packages/:id/status publishes a draft package', async () => {
    const pkg = mockD1.tables.umrah_packages[0];
    const res = await app.request(`/api/umrah/packages/${pkg.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'Cookie': 'better-auth.session_token=token-manager' },
      body: JSON.stringify({ status: 'open' })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    expect(res.status).toBe(200);
    const updated = mockD1.tables.umrah_packages.find((p: any) => p.id === pkg.id);
    expect(updated?.status).toBe('open');
  });

  it('POST /api/umrah/packages/:id/departures announces a date with capacity 30', async () => {
    const pkg = mockD1.tables.umrah_packages[0];
    const res = await app.request(`/api/umrah/packages/${pkg.id}/departures`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': 'better-auth.session_token=token-manager' },
      body: JSON.stringify({
        packageTier: 'economy',
        departureDate: now + 30 * 86400,
        price: 12500000,
        bookingFee: 50000,
        capacity: 30
      })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    expect(res.status).toBe(200);
    const dep = mockD1.tables.group_departures.find((d: any) => d.package_id === pkg.id);
    expect(dep).toBeTruthy();
    expect(dep?.capacity).toBe(30);
    expect(dep?.package_tier).toBe('economy');
  });

  it('GET /api/umrah/departures/calendar returns availability per date', async () => {
    const res = await app.request('/api/umrah/departures/calendar', {
      headers: { 'Cookie': 'better-auth.session_token=token-manager' }
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);
    expect(Array.isArray(data.days)).toBe(true);
    if (data.days.length > 0) {
      expect(data.days[0]).toHaveProperty('available');
      expect(data.days[0]).toHaveProperty('capacity');
      expect(data.days[0]).toHaveProperty('fillPct');
    }
  });

  it('POST /api/umrah/settings toggles the Coming Soon switch', async () => {
    const res = await app.request('/api/umrah/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': 'better-auth.session_token=token-manager' },
      body: JSON.stringify({ enabled: false })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.enabled).toBe(false);
    const row = mockD1.tables.app_settings.find((s: any) => s.key === 'umrah_inventory_enabled');
    expect(row?.value).toBe('false');
  });
});
