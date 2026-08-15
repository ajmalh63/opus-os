import { describe, it, expect, beforeAll, vi } from 'vitest';
import app from '../src/index.js';
import { MockD1Database } from './mockDb.js';

// Mock auth module
vi.mock('../src/auth.js', () => {
  return {
    getAuth: (env: any) => {
      const users: Record<string, any> = {
        'token-counselor': { id: 'counselor-1', name: 'Counselor One', email: 'c1@test.com', role: 'counselor', userDivisions: JSON.stringify(['visa']), twoFactorEnabled: false },
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

describe('Visa Counseling, Booking, and Mock Interview Workflow Tests', () => {
  let mockD1: MockD1Database;

  beforeAll(() => {
    mockD1 = new MockD1Database();

    // Seed mock client
    mockD1.tables.clients.push({
      id: "OP-2026-2001",
      name: "Rohit Sharma",
      phone: "+91 99999 88888",
      email: "rohit.sharma@example.com",
      highestQualification: "undergrad",
      created_at: 0,
      updated_at: 0
    });

    mockD1.tables.engagements.push({
      id: "eng-visa-1",
      client_id: "OP-2026-2001",
      division: "visa",
      title: "USA Student Visa Assistance",
      stage_key: "qualified",
      outstanding_balance: 0,
      status: "active",
      created_at: 0,
      updated_at: 0
    });
  });

  it('POST /api/visa/applications creates application', async () => {
    const res = await app.request(
      '/api/visa/applications',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'cookie': 'better-auth.session_token=token-counselor' },
        body: JSON.stringify({ clientId: 'OP-2026-2001', country: 'USA', visaType: 'F1 Student' })
      },
      { DB: mockD1 }
    );
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);
    expect(data.id).toBeDefined();

    expect(mockD1.tables.visa_applications.length).toBe(1);
    expect(mockD1.tables.visa_applications[0].country).toBe('USA');
  });

  it('GET /api/visa/applications retrieves application', async () => {
    const res = await app.request(
      '/api/visa/applications?clientId=OP-2026-2001',
      { headers: { 'cookie': 'better-auth.session_token=token-counselor' } },
      { DB: mockD1 }
    );
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);
    expect(data.applications.length).toBe(1);
  });

  it('PATCH /api/visa/applications/:id/status (slot_booked) creates task', async () => {
    const entryId = mockD1.tables.visa_applications[0].id;
    const res = await app.request(
      `/api/visa/applications/${entryId}/status`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'cookie': 'better-auth.session_token=token-counselor' },
        body: JSON.stringify({ status: 'slot_booked', appointmentDate: Math.floor(Date.now() / 1000) + 5 * 24 * 3600, appointmentLocation: 'Mumbai VFS' })
      },
      { DB: mockD1 }
    );
    expect(res.status).toBe(200);

    // Verify task is created
    expect(mockD1.tables.tasks.some(t => t.title.includes('Pre-Visa Submission Document Audit'))).toBe(true);
  });

  it('PATCH /api/visa/applications/:id/status (granted) completes engagement', async () => {
    const entryId = mockD1.tables.visa_applications[0].id;
    const res = await app.request(
      `/api/visa/applications/${entryId}/status`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'cookie': 'better-auth.session_token=token-counselor' },
        body: JSON.stringify({ status: 'granted', overrideDocs: true })
      },
      { DB: mockD1 }
    );
    expect(res.status).toBe(200);

    const eng = mockD1.tables.engagements.find(e => e.id === 'eng-visa-1');
    expect(eng.status).toBe('closed');
    expect(eng.stage_key).toBe('completed');
  });

  it('POST /api/visa/mock-interviews schedules mock session & task', async () => {
    const res = await app.request(
      '/api/visa/mock-interviews',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'cookie': 'better-auth.session_token=token-counselor' },
        body: JSON.stringify({ clientId: 'OP-2026-2001', scheduledAt: Math.floor(Date.now() / 1000) + 3600 })
      },
      { DB: mockD1 }
    );
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);

    expect(mockD1.tables.visa_mock_interviews.length).toBe(1);
    expect(mockD1.tables.tasks.some(t => t.title === 'Conduct Visa Mock Interview')).toBe(true);
  });

  it('PATCH /api/visa/mock-interviews/:id/complete resolves task & mock log', async () => {
    const mockId = mockD1.tables.visa_mock_interviews[0].id;
    const res = await app.request(
      `/api/visa/mock-interviews/${mockId}/complete`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'cookie': 'better-auth.session_token=token-counselor' },
        body: JSON.stringify({ score: 8, feedback: 'Rohit did amazing. Good communication.' })
      },
      { DB: mockD1 }
    );
    expect(res.status).toBe(200);

    expect(mockD1.tables.visa_mock_interviews[0].status).toBe('completed');
    expect(mockD1.tables.visa_mock_interviews[0].score).toBe(8);

    const task = mockD1.tables.tasks.find(t => t.title === 'Conduct Visa Mock Interview');
    expect(task.status).toBe('done');
  });

  it('PATCH /api/visa/documents/:id/status updates document status', async () => {
    // Add mock document row
    mockD1.tables.documents.push({
      id: 'doc-visa-1',
      client_id: 'OP-2026-2001',
      file_name: 'Dubai-Passport_scan-rohit.pdf',
      r2_key: 'r2-key-1',
      version: 'v1.0',
      status: 'pending',
      courier_status: 'not_applicable',
      uploaded_at: Math.floor(Date.now() / 1000)
    });

    const res = await app.request(
      '/api/visa/documents/doc-visa-1/status',
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'cookie': 'better-auth.session_token=token-counselor' },
        body: JSON.stringify({ status: 'verified' })
      },
      { DB: mockD1 }
    );
    expect(res.status).toBe(200);
    expect(mockD1.tables.documents[0].status).toBe('verified');
  });
});
