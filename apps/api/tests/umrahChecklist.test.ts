import { describe, it, expect, beforeAll, vi } from 'vitest';
import app from '../src/index.js';
import { MockD1Database } from './mockDb.js';

// Mock auth module
vi.mock('../src/auth.js', () => {
  return {
    getAuth: (env: any) => {
      const users: Record<string, any> = {
        'token-counselor': { id: 'counselor-1', name: 'Counselor One', email: 'c1@test.com', role: 'counselor', userDivisions: JSON.stringify(['umrah']), twoFactorEnabled: false },
      };
      return {
        api: { getSession: async ({ headers }: any) => {
          const cookie = typeof headers?.get === 'function' ? (headers.get('cookie') || '') : (headers?.['cookie'] || '');
          const match = cookie.match(/better-auth\.session_token=([^;]+)/);
          const token = match?.[1] || '';
          const user = users[token];
          if (!user) return null;
          return { user, session: { id: 's-' + token, token, userId: user.id } };
        } },
      };
    },
  };
});

describe('Umrah Group Departure & Checklist Workflow Tests', () => {
  let mockD1: MockD1Database;

  beforeAll(() => {
    mockD1 = new MockD1Database();

    // Seed mock departure
    mockD1.tables.group_departures.push({
      id: "dep-umrah-1",
      package_tier: "premium",
      departure_date: "2026-12-01",
      capacity: 30,
      booked_seats: 1,
      price: 15000000,
      booking_fee: 2500000,
      status: "open",
      created_at: 0
    });

    // Seed mock booking
    mockD1.tables.seat_bookings.push({
      id: "booking-1",
      departure_id: "dep-umrah-1",
      client_id: "client-123",
      status: "confirmed",
      created_at: 0
    });
  });

  it('PATCH /api/umrah/departures/:id/status updates status & cancels bookings when cancelled', async () => {
    const res = await app.request(
      '/api/umrah/departures/dep-umrah-1/status',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'cookie': 'better-auth.session_token=token-counselor' },
        body: JSON.stringify({ status: 'cancelled' })
      },
      { DB: mockD1 }
    );
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);

    expect(mockD1.tables.group_departures[0].status).toBe('cancelled');
    expect(mockD1.tables.seat_bookings[0].status).toBe('cancelled');
  });

  it('GET /api/umrah/checklists self-heals & creates default checklist row', async () => {
    const res = await app.request(
      '/api/umrah/checklists?bookingId=booking-1',
      { headers: { 'cookie': 'better-auth.session_token=token-counselor' } },
      { DB: mockD1 }
    );
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);
    expect(data.checklist.bookingId).toBe('booking-1');
    expect(data.checklist.passportScanned).toBe(false);

    expect(mockD1.tables.umrah_checklists.length).toBe(1);
  });

  it('PATCH /api/umrah/checklists/:id updates documents checkmarks', async () => {
    const checklistId = mockD1.tables.umrah_checklists[0].id;
    const res = await app.request(
      `/api/umrah/checklists/${checklistId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'cookie': 'better-auth.session_token=token-counselor' },
        body: JSON.stringify({ passportScanned: true, visaIssued: true })
      },
      { DB: mockD1 }
    );
    expect(res.status).toBe(200);
    expect(Boolean(mockD1.tables.umrah_checklists[0].passport_scanned)).toBe(true);
    expect(Boolean(mockD1.tables.umrah_checklists[0].visa_issued)).toBe(true);
  });

  it('PATCH /api/umrah/checklists/:id schedules travel kit dispatch task when all 4 checkmarks are complete', async () => {
    const checklistId = mockD1.tables.umrah_checklists[0].id;
    const res = await app.request(
      `/api/umrah/checklists/${checklistId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'cookie': 'better-auth.session_token=token-counselor' },
        body: JSON.stringify({ vaccineCertificate: true, ticketIssued: true })
      },
      { DB: mockD1 }
    );
    expect(res.status).toBe(200);

    // Verify task is scheduled
    expect(mockD1.tables.tasks.some(t => t.title === 'Dispatch Umrah Travel Kit & Guidelines')).toBe(true);
  });

  it('GET /api/umrah/bookings retrieves client seat bookings', async () => {
    const res = await app.request(
      '/api/umrah/bookings?clientId=client-123',
      { headers: { 'cookie': 'better-auth.session_token=token-counselor' } },
      { DB: mockD1 }
    );
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);
    expect(data.bookings.length).toBe(1);
    expect(data.bookings[0].packageTier).toBe('premium');
  });
});
