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

            if (token === 'token-coordinator') {
              return {
                user: {
                  id: "coordinator-1",
                  name: "Coordinator One",
                  email: "coordinator@test.com",
                  role: "coordinator",
                  userDivisions: JSON.stringify(["attestation"])
                },
                session: {
                  id: "session-coordinator",
                  token,
                  userId: "coordinator-1"
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

describe('Attestation Transit Courier Tracking Integration Tests', () => {
  let mockD1: MockD1Database;

  beforeAll(() => {
    mockD1 = new MockD1Database();

    // Seed mock client
    mockD1.tables.clients.push({
      id: "OP-2026-7001",
      portal_token: "OP-2026-7001",
      name: "Attestation Client",
      phone: "+91 99999 66666",
      email: "attest@test.com",
      created_at: 0,
      updated_at: 0
    });
  });

  it('GET /api/transit/shipments/:id should return 401 Unauthorized without session token', async () => {
    const res = await app.request('/api/transit/shipments/shipment-123', {}, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    expect(res.status).toBe(401);
  });

  it('POST /api/transit/shipments should schedule shipment and store details in database', async () => {
    const res = await app.request('/api/transit/shipments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': 'better-auth.session_token=token-coordinator'
      },
      body: JSON.stringify({
        clientId: "OP-2026-7001",
        courierPartner: "blue-dart",
        trackingNumber: "777888999",
        shippingAddress: "Flat 101, Elite Residency, Hyderabad, India"
      })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);
    expect(data.id).toBeDefined();

    // Verify insertion
    const shipment = mockD1.tables.transit_shipments.find(s => s.id === data.id);
    expect(shipment).toBeDefined();
    expect(shipment.tracking_number).toBe("777888999");
    expect(shipment.courier_partner).toBe("blue-dart");
  });

  it('GET /api/transit/shipments/:id/track should return live status progress events', async () => {
    // Seed a shipment in transit
    mockD1.tables.transit_shipments.push({
      id: "ship-transit-123",
      client_id: "OP-2026-7001",
      courier_partner: "dtdc",
      tracking_number: "DTDC112233",
      status: "in_transit",
      shipping_address: "Address 2",
      estimated_delivery: Math.floor(Date.now() / 1000) + 3 * 86400,
      created_at: Math.floor(Date.now() / 1000) - 3600 * 24,
      updated_at: Math.floor(Date.now() / 1000) - 3600 * 12
    });

    const res = await app.request('/api/transit/shipments/ship-transit-123/track', {
      headers: {
        'Cookie': 'better-auth.session_token=token-coordinator'
      }
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);
    expect(data.partner).toBe("DTDC Courier");
    expect(data.trackingNumber).toBe("DTDC112233");
    expect(data.currentStatus).toBe("in_transit");
    expect(data.events.length).toBeGreaterThan(0);
  });
});
