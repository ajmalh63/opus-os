import { describe, it, expect, beforeAll, vi } from 'vitest';
import app from '../src/index.js';
import { MockD1Database } from './mockDb.js';

// Mock auth module
vi.mock('../src/auth.js', () => {
  return {
    getAuth: (env: any) => {
      const users: Record<string, any> = {
        'token-counselor': { id: 'counselor-1', name: 'Counselor One', email: 'c1@test.com', role: 'counselor', userDivisions: JSON.stringify(['attestation']), twoFactorEnabled: false },
      };
      return {
        api: { getSession: async ({ headers }: any) => {
          const cookie = typeof headers?.get === 'function' ? (headers.get('cookie') || '') : (headers?.['cookie'] || '');
          const match = cookie.match(/better-auth\.session_token=([^;]+)/);
          const token = match ? match[1] : null;
          const user = token ? users[token] : null;
          return user ? { session: { token, userId: user.id }, user } : null;
        } },
      };
    },
  };
});

describe('Attestation Applications Workflow Tests', () => {
  let mockD1: MockD1Database;

  beforeAll(() => {
    mockD1 = new MockD1Database();

    // Seed mock database tables
    mockD1.tables.clients.push({
      id: 'client-789',
      name: 'John Doe',
      phone: '+91 99999 88888',
      email: 'john.doe@example.com',
      createdAt: Date.now(),
      updatedAt: Date.now()
    });

    mockD1.tables.engagements.push({
      id: 'eng-attestation',
      clientId: 'client-789',
      division: 'attestation',
      status: 'active',
      stageKey: 'initiated',
      createdAt: Date.now(),
      updatedAt: Date.now()
    });
  });

  it('POST /api/attestation/applications creates new attestation record', async () => {
    const res = await app.request(
      '/api/attestation/applications',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'cookie': 'better-auth.session_token=token-counselor' },
        body: JSON.stringify({ clientId: 'client-789', documentType: 'degree', destinationCountry: 'Saudi Arabia', notes: 'Urgent attestation' })
      },
      { DB: mockD1 }
    );
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);
    expect(mockD1.tables.attestation_applications.length).toBe(1);
    expect(mockD1.tables.attestation_applications[0].document_type).toBe('degree');
    expect(mockD1.tables.attestation_applications[0].current_step).toBe('hrd');
    expect(mockD1.tables.attestation_applications[0].status).toBe('pending');
  });

  it('GET /api/attestation/applications retrieves client applications', async () => {
    const res = await app.request(
      '/api/attestation/applications?clientId=client-789',
      { headers: { 'cookie': 'better-auth.session_token=token-counselor' } },
      { DB: mockD1 }
    );
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);
    expect(data.applications.length).toBe(1);
    expect(data.applications[0].documentType).toBe('degree');
  });

  it('PATCH /api/attestation/applications/:id updates step and status, creates task when completed', async () => {
    const appId = mockD1.tables.attestation_applications[0].id;
    const res = await app.request(
      `/api/attestation/applications/${appId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'cookie': 'better-auth.session_token=token-counselor' },
        body: JSON.stringify({ currentStep: 'mea', status: 'completed' })
      },
      { DB: mockD1 }
    );
    expect(res.status).toBe(200);
    expect(mockD1.tables.attestation_applications[0].status).toBe('completed');
    expect(mockD1.tables.attestation_applications[0].current_step).toBe('mea');

    // Auto-scheduled dispatch task verify
    expect(mockD1.tables.tasks.length).toBe(1);
    expect(mockD1.tables.tasks[0].title).toContain('Dispatch Legalized Documents');
  });
});
