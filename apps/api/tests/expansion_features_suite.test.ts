import { describe, it, expect, beforeAll, vi } from 'vitest';
import app from '../src/index.js';
import { MockD1Database } from './mockDb.js';

// Mock auth module
vi.mock('../src/auth.js', () => {
  return {
    getAuth: (env: any) => {
      const users: Record<string, any> = {
        'token-admin': { id: 'owner-1', name: 'Owner', email: 'owner@opusoverseas.com', role: 'super_admin', userDivisions: JSON.stringify([]), twoFactorEnabled: false },
        'token-counselor': { id: 'counselor-1', name: 'Counselor One', email: 'c1@test.com', role: 'counselor', userDivisions: JSON.stringify(['manpower', 'visa']), twoFactorEnabled: false },
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

describe('Solutions Architecture Expansion Workflows Suite', () => {
  let mockD1: MockD1Database;
  let mockBucket: any;

  beforeAll(() => {
    mockD1 = new MockD1Database();
    
    // Seed initial data
    mockD1.tables.clients.push({
      id: "OP-2026-9001",
      portal_token: "OP-2026-9001",
      name: "Suresh Kumar",
      phone: "+91 99999 88888",
      email: "suresh@example.com",
      highestQualification: "postgrad",
      created_at: 0,
      updated_at: 0
    });

    mockD1.tables.engagements.push({
      id: "eng-manpower-9",
      client_id: "OP-2026-9001",
      division: "manpower",
      title: "Backend Engineer Roles",
      stage_key: "lead",
      outstanding_balance: 0,
      status: "active",
      created_at: 0,
      updated_at: 0
    });

    mockD1.tables.transit_shipments.push({
      id: "ship-1",
      client_id: "OP-2026-9001",
      courier_partner: "blue-dart",
      tracking_number: "BD-12345",
      status: "pickup",
      shipping_address: "Address",
      estimated_delivery: 0,
      created_at: 100,
      updated_at: 100
    });

    // Mock R2 Bucket
    mockBucket = {
      put: async () => {}
    };
  });

  // 1. Document Upload
  it('GET /api/public/portal/documents/presigned returns signed upload path', async () => {
    const res = await app.request('/api/public/portal/documents/presigned?token=OP-2026-9001&filename=passport.pdf', {}, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret-change-me' });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);
    expect(data.url).toContain('/api/public/portal/documents/upload');
  });

  it('PUT /api/public/portal/documents/upload uploads to R2 and inserts task', async () => {
    // Generate valid signature
    const expires = Math.floor(Date.now() / 1000) + 900;
    const encoder = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      encoder.encode('test-secret-change-me'),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const dataStr = `OP-2026-9001:passport.pdf:${expires}`;
    const signatureBuffer = await crypto.subtle.sign('HMAC', key, encoder.encode(dataStr));
    const signature = Array.from(new Uint8Array(signatureBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

    const res = await app.request(
      `/api/public/portal/documents/upload?token=OP-2026-9001&filename=passport.pdf&expires=${expires}&signature=${signature}`,
      { method: 'PUT', body: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]) },
      { DB: mockD1, BUCKET: mockBucket, BETTER_AUTH_SECRET: 'test-secret-change-me' }
    );
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);

    // Verify task is inserted
    expect(mockD1.tables.tasks.length).toBeGreaterThan(0);
    expect(mockD1.tables.tasks.some(t => t.title.includes('Verify uploaded document'))).toBe(true);
  });

  // 2. Transit Courier Sync
  it('POST /api/transit/shipments/:id/sync-carrier transitions status', async () => {
    const res = await app.request(
      '/api/transit/shipments/ship-1/sync-carrier',
      { method: 'POST', headers: { 'cookie': 'better-auth.session_token=token-counselor' } },
      { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret-change-me' }
    );
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);
    expect(data.oldStatus).toBe('pickup');
    expect(data.newStatus).toBe('in_transit');
  });

  // 3. Manpower Interviews
  it('POST /api/manpower/interviews/invite generates booking invitation', async () => {
    const res = await app.request(
      '/api/manpower/interviews/invite',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'cookie': 'better-auth.session_token=token-counselor' },
        body: JSON.stringify({ clientId: 'OP-2026-9001' })
      },
      { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret-change-me' }
    );
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);
    expect(data.inviteLink).toContain('opus-owner/consultation');
  });

  it('POST /api/manpower/interviews/confirm updates stage and creates task', async () => {
    const res = await app.request(
      '/api/manpower/interviews/confirm',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'cookie': 'better-auth.session_token=token-counselor' },
        body: JSON.stringify({ clientId: 'OP-2026-9001', slotEpoch: 1780000000 })
      },
      { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret-change-me' }
    );
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);
    
    // Verify task is scheduled
    expect(mockD1.tables.tasks.some(t => t.title.includes('Client Interview'))).toBe(true);
    // Verify engagement stage transitioned to processing
    const eng = mockD1.tables.engagements.find(e => e.id === 'eng-manpower-9');
    expect(eng.stage_key).toBe('processing');
  });

  // 4. Compliance Anonymization (super_admin only)
  it('POST /api/compliance/clients/:id/anonymize rejects counselor role', async () => {
    const res = await app.request(
      '/api/compliance/clients/OP-2026-9001/anonymize',
      { method: 'POST', headers: { 'cookie': 'better-auth.session_token=token-counselor' } },
      { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret-change-me' }
    );
    expect(res.status).toBe(403);
  });

  it('POST /api/compliance/clients/:id/anonymize performs anonymization for super_admin', async () => {
    const res = await app.request(
      '/api/compliance/clients/OP-2026-9001/anonymize',
      { method: 'POST', headers: { 'cookie': 'better-auth.session_token=token-admin' } },
      { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret-change-me' }
    );
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);

    // Verify fields are anonymized
    const client = mockD1.tables.clients.find(c => c.id === 'OP-2026-9001');
    expect(client.name).toBe('Deleted Candidate');
    expect(client.email).toBe('deleted@opusoverseas.com');
  });
});
