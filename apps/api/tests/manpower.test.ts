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
                  userDivisions: JSON.stringify(["manpower"])
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

describe('Manpower Candidates Hub & Workers AI Resume Parser Tests', () => {
  let mockD1: MockD1Database;

  beforeAll(() => {
    mockD1 = new MockD1Database();

    // Seed mock clients and engagements for screening pool tests
    mockD1.tables.clients.push({
      id: "OP-2026-6001",
      name: "Priya Patel",
      phone: "+91 97979 54321",
      email: "priya.patel@example.com",
      highestQualification: "undergrad",
      created_at: 0,
      updated_at: 0
    });

    mockD1.tables.engagements.push({
      id: "eng-manpower-1",
      client_id: "OP-2026-6001",
      division: "manpower",
      title: "Frontend Developer",
      stage_key: "lead",
      outstanding_balance: 0,
      status: "active",
      created_at: 0,
      updated_at: 0
    });
  });

  it('GET /api/manpower/candidates should return 401 Unauthorized without session token', async () => {
    const res = await app.request('/api/manpower/candidates', {}, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    expect(res.status).toBe(401);
  });

  it('POST /api/manpower/resume/parse should extract fields using workers mock logic (mocked flag set)', async () => {
    const formData = new FormData();
    formData.append('resume', new Blob(['fake-resume-pdf-content'], { type: 'application/pdf' }), 'priya_patel_resume.pdf');

    const res = await app.request('/api/manpower/resume/parse', {
      method: 'POST',
      headers: {
        'Cookie': 'better-auth.session_token=token-counselor'
      },
      body: formData
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret', MANPOWER_AI: 'mock' });

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);
    expect(data.mocked).toBe(true);
    expect(data.parsedData.name).toBe("Priya Patel");
    expect(data.parsedData.email).toBe("priya.patel@example.com");
    expect(data.parsedData.skills).toContain("React");
    // candidate key must be present in mock responses too (frontend contract)
    expect(data.candidate.name).toBe("Priya Patel");
  });

  it('POST /api/manpower/resume/parse should return 501 (fail loud, no fake data) when MANPOWER_AI=real without AI implementation', async () => {
    const formData = new FormData();
    formData.append('resume', new Blob(['fake-resume-pdf-content'], { type: 'application/pdf' }), 'aditya_verma_resume.pdf');

    const res = await app.request('/api/manpower/resume/parse', {
      method: 'POST',
      headers: {
        'Cookie': 'better-auth.session_token=token-counselor'
      },
      body: formData
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret', MANPOWER_AI: 'real' });

    expect(res.status).toBe(501);
    const data = await res.json() as any;
    expect(data.error).toContain('MANPOWER_AI=real');
    expect(data.success).toBeUndefined();
    expect(data.mocked).toBeUndefined();
    expect(data.candidate).toBeUndefined();
    expect(data.parsedData).toBeUndefined();
  });

  it('GET /api/manpower/candidates should retrieve all manpower division candidates', async () => {
    const res = await app.request('/api/manpower/candidates', {
      headers: {
        'Cookie': 'better-auth.session_token=token-counselor'
      }
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.candidates.length).toBeGreaterThan(0);
    expect(data.candidates[0].name).toBe("Priya Patel");
  });
});
