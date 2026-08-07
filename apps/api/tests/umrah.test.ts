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
                user: {
                  id: "counselor-1",
                  name: "Counselor One",
                  email: "counselor@test.com",
                  role: "counselor",
                  userDivisions: JSON.stringify(["umrah"])
                },
                session: {
                  id: "session-counselor",
                  token,
                  userId: "counselor-1"
                }
              };
            }
            return null;
          }
        }
      };
    }
  };
});

describe('Umrah Group Departure Capacity & Booking Integration Tests', () => {
  let mockD1: MockD1Database;

  beforeAll(() => {
    mockD1 = new MockD1Database();

    // Seed mock clients
    mockD1.tables.clients.push(
      { id: "OP-2026-8001", name: "Pilgrim One", phone: "+91 99999 88888", email: "p1@test.com", created_at: 0, updated_at: 0 },
      { id: "OP-2026-8002", name: "Pilgrim Two", phone: "+91 99999 77777", email: "p2@test.com", created_at: 0, updated_at: 0 }
    );

    // Seed a scheduled departure with 29 booked seats (capacity = 30)
    mockD1.tables.group_departures.push({
      id: "dep-almost-full",
      package_tier: "standard",
      departure_date: Math.floor(Date.now() / 1000) + 30 * 86400,
      capacity: 30,
      booked_seats: 29, // 29 booked
      price: 15000000, // 1.5 Lakh INR in paise
      booking_fee: 1000000, // 10k INR booking fee
      status: "open",
      created_at: 0
    });
  });

  it('GET /api/umrah/departures should return 401 Unauthorized without session token', async () => {
    const res = await app.request('/api/umrah/departures', {}, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    expect(res.status).toBe(401);
  });

  it('POST /api/umrah/departures/:id/book should confirm seat booking and increment booked_seats if under capacity', async () => {
    const res = await app.request('/api/umrah/departures/dep-almost-full/book', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': 'better-auth.session_token=token-counselor'
      },
      body: JSON.stringify({
        clientId: "OP-2026-8001"
      })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);
    expect(data.status).toBe('confirmed'); // Confirmed booking!

    // Verify database booked_seats incremented to 30
    const dep = mockD1.tables.group_departures.find(d => d.id === 'dep-almost-full');
    expect(dep?.booked_seats).toBe(30);
  });

  it('POST /api/umrah/departures/:id/book should place pilgrim on waitlist if capacity is full', async () => {
    // Departure booked_seats is now 30/30
    const res = await app.request('/api/umrah/departures/dep-almost-full/book', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': 'better-auth.session_token=token-counselor'
      },
      body: JSON.stringify({
        clientId: "OP-2026-8002"
      })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);
    expect(data.status).toBe('waitlist'); // WAITLISTED!

    // Verify database booked_seats stayed at 30 (prevented overbooking!)
    const dep = mockD1.tables.group_departures.find(d => d.id === 'dep-almost-full');
    expect(dep?.booked_seats).toBe(30);
  });
});
