import { describe, it, expect, beforeEach } from 'vitest';
import app from '../src/index.js';
import { MockD1Database } from './mockDb.js';

describe('Enterprise Real-Time Sync & WebSocket Fabric Battery', () => {
  let mockD1: MockD1Database;
  const clientToken = 'tok-sync-client-001';
  const partnerApiKey = 'apk_partner_sync_001';

  beforeEach(() => {
    mockD1 = new MockD1Database();

    // Client
    mockD1.tables.clients.push({
      id: 'cli_sync_001',
      name: 'Simran Kaur',
      portal_token: clientToken,
      portalToken: clientToken,
      status: 'active',
      created_at: Date.now(),
      updated_at: Date.now(),
    });

    // Partner
    mockD1.tables.partners.push({
      id: 'part_sync_001',
      name: 'Apex Global Partners',
      api_token: partnerApiKey,
      apiToken: partnerApiKey,
      status: 'active',
      created_at: Date.now(),
      updated_at: Date.now(),
    });
  });

  it('1. Sync WebSocket Handshake: Resolves Partner identity from ?api_token query param', async () => {
    const res = await app.request(`/api/sync/ws?api_token=${partnerApiKey}&channels=partner:part_sync_001:stats`, {
      headers: {
        Upgrade: 'websocket',
        Connection: 'Upgrade',
      },
    }, {
      DB: mockD1,
      BETTER_AUTH_SECRET: 'test_sync_secret',
      SYNC_HUB: {
        idFromName: () => 'mock-sync-hub-id',
        get: () => ({
          fetch: async () => new Response(JSON.stringify({ upgraded: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        }),
      } as any,
    });

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.upgraded).toBe(true);
  });

  it('2. Sync WebSocket Handshake: Resolves Client identity from ?token query param', async () => {
    const res = await app.request(`/api/sync/ws?token=${clientToken}&channels=client:cli_sync_001:bookings`, {
      headers: {
        Upgrade: 'websocket',
        Connection: 'Upgrade',
      },
    }, {
      DB: mockD1,
      BETTER_AUTH_SECRET: 'test_sync_secret',
      SYNC_HUB: {
        idFromName: () => 'mock-sync-hub-id',
        get: () => ({
          fetch: async () => new Response(JSON.stringify({ upgraded: true }), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          }),
        }),
      } as any,
    });

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.upgraded).toBe(true);
  });

  it('3. Sync WebSocket Handshake: Rejects connection when Upgrade header is missing', async () => {
    const res = await app.request(`/api/sync/ws?token=${clientToken}&channels=client:cli_sync_001:bookings`, {
      method: 'GET',
    }, {
      DB: mockD1,
      BETTER_AUTH_SECRET: 'test_sync_secret',
      SYNC_HUB: {} as any,
    });

    expect(res.status).toBe(400); // 400 Expected websocket
  });
});
