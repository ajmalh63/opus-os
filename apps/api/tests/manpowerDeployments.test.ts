import { describe, it, expect, beforeAll, vi } from 'vitest';
import app from '../src/index.js';
import { MockD1Database } from './mockDb.js';

// Mock auth module
vi.mock('../src/auth.js', () => {
  return {
    getAuth: (env: any) => {
      const users: Record<string, any> = {
        'token-counselor': { id: 'counselor-1', name: 'Counselor One', email: 'c1@test.com', role: 'counselor', userDivisions: JSON.stringify(['manpower']), twoFactorEnabled: false },
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

describe('Manpower Deployments Workflow Tests', () => {
  let mockD1: MockD1Database;

  beforeAll(() => {
    mockD1 = new MockD1Database();

    // Seed mock database tables
    mockD1.tables.clients.push({
      id: 'candidate-99',
      portal_token: 'candidate-99',
      name: 'Zeeshan Ali',
      phone: '+91 88888 77777',
      email: 'zeeshan@example.com',
      createdAt: Date.now(),
      updatedAt: Date.now()
    });

    mockD1.tables.job_postings.push({
      id: 'job-101',
      title: 'Senior Welder',
      country: 'UAE',
      description: 'Welder for logistics depot',
      createdAt: Date.now()
    });
  });

  it('POST /api/manpower/deployments creates new deployment record', async () => {
    const res = await app.request(
      '/api/manpower/deployments',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'cookie': 'better-auth.session_token=token-counselor' },
        body: JSON.stringify({ clientId: 'candidate-99', jobId: 'job-101' })
      },
      { DB: mockD1 }
    );
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);
    expect(mockD1.tables.manpower_deployments.length).toBe(1);
    expect(mockD1.tables.manpower_deployments[0].job_id).toBe('job-101');
    expect(mockD1.tables.manpower_deployments[0].selection_status).toBe('applied');
  });

  it('GET /api/manpower/deployments retrieves candidate deployments with job details', async () => {
    const res = await app.request(
      '/api/manpower/deployments?clientId=candidate-99',
      { headers: { 'cookie': 'better-auth.session_token=token-counselor' } },
      { DB: mockD1 }
    );
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);
    expect(data.deployments.length).toBe(1);
    expect(data.deployments[0].jobTitle).toBe('Senior Welder');
    expect(data.deployments[0].jobCountry).toBe('UAE');
  });

  it('PATCH /api/manpower/deployments/:id triggers automation tasks on status shifts', async () => {
    const depId = mockD1.tables.manpower_deployments[0].id;

    // Shift to selected -> schedules medical check task
    let res = await app.request(
      `/api/manpower/deployments/${depId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'cookie': 'better-auth.session_token=token-counselor' },
        body: JSON.stringify({ selectionStatus: 'selected' })
      },
      { DB: mockD1 }
    );
    expect(res.status).toBe(200);
    expect(mockD1.tables.tasks.length).toBe(1);
    expect(mockD1.tables.tasks[0].title).toContain('Initiate Medical Diagnostics');

    // Shift to medically fit -> schedules visa slot task
    res = await app.request(
      `/api/manpower/deployments/${depId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'cookie': 'better-auth.session_token=token-counselor' },
        body: JSON.stringify({ medicalStatus: 'fit' })
      },
      { DB: mockD1 }
    );
    expect(res.status).toBe(200);
    expect(mockD1.tables.tasks.length).toBe(2);
    expect(mockD1.tables.tasks[1].title).toContain('Schedule Visa slot booking');

    // Shift to deployed -> schedules commission review task
    res = await app.request(
      `/api/manpower/deployments/${depId}`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'cookie': 'better-auth.session_token=token-counselor' },
        body: JSON.stringify({ flightStatus: 'deployed' })
      },
      { DB: mockD1 }
    );
    expect(res.status).toBe(200);
    expect(mockD1.tables.tasks.length).toBe(3);
    expect(mockD1.tables.tasks[2].title).toContain('Deploy Payout Coordinator Commission');
  });
});
