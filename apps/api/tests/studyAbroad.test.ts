import { describe, it, expect, beforeAll, vi } from 'vitest';
import app from '../src/index.js';
import { MockD1Database } from './mockDb.js';

// Mock auth module
vi.mock('../src/auth.js', () => {
  return {
    getAuth: (env: any) => {
      const users: Record<string, any> = {
        'token-counselor': { id: 'counselor-1', name: 'Counselor One', email: 'c1@test.com', role: 'counselor', userDivisions: JSON.stringify(['study-abroad']), twoFactorEnabled: false },
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

describe('Study Abroad Counseling & Shortlisting Workflow Tests', () => {
  let mockD1: MockD1Database;

  beforeAll(() => {
    mockD1 = new MockD1Database();

    // Seed mock client
    mockD1.tables.clients.push({
      id: "OP-2026-1001",
      name: "Aditya Roy",
      phone: "+91 98765 43210",
      email: "aditya.roy@example.com",
      highestQualification: "undergrad",
      intake_context: JSON.stringify({ gpa: 8.2, ielts: 7.5, budgetLpa: 15.0 }),
      created_at: 0,
      updated_at: 0
    });

    // Seed mock universities
    mockD1.tables.universities.push(
      {
        id: "uni-1",
        name: "University of Munich",
        country: "Germany",
        min_gpa: 7.5,
        ielts_min: 6.5,
        budget_lpa_min: 5.0,
        intake: "Winter 2027",
        created_at: 0
      },
      {
        id: "uni-2",
        name: "Stanford University",
        country: "USA",
        min_gpa: 9.0, // High GPA threshold, should not match Aditya (8.2)
        ielts_min: 7.5,
        budget_lpa_min: 40.0, // High budget threshold
        intake: "Fall 2027",
        created_at: 0
      }
    );

    mockD1.tables.engagements.push({
      id: "eng-sa-1",
      client_id: "OP-2026-1001",
      division: "study-abroad",
      title: "Germany Masters Intake",
      stage_key: "qualified",
      outstanding_balance: 0,
      status: "active",
      created_at: 0,
      updated_at: 0
    });
  });

  it('GET /api/study-abroad/universities/match returns matched universities only', async () => {
    const res = await app.request(
      '/api/study-abroad/universities/match?clientId=OP-2026-1001',
      { headers: { 'cookie': 'better-auth.session_token=token-counselor' } },
      { DB: mockD1 }
    );
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);
    expect(data.matches.length).toBe(1);
    expect(data.matches[0].name).toBe("University of Munich");
  });

  it('POST /api/study-abroad/shortlist creates shortlist entry', async () => {
    const res = await app.request(
      '/api/study-abroad/shortlist',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'cookie': 'better-auth.session_token=token-counselor' },
        body: JSON.stringify({ clientId: 'OP-2026-1001', universityId: 'uni-1', notes: 'Top Priority' })
      },
      { DB: mockD1 }
    );
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);
    expect(data.id).toBeDefined();

    // Verify it is in database
    expect(mockD1.tables.study_abroad_shortlists.length).toBe(1);
    expect(mockD1.tables.study_abroad_shortlists[0].notes).toBe('Top Priority');
  });

  it('GET /api/study-abroad/shortlist retrieves shortlist with university names', async () => {
    const res = await app.request(
      '/api/study-abroad/shortlist?clientId=OP-2026-1001',
      { headers: { 'cookie': 'better-auth.session_token=token-counselor' } },
      { DB: mockD1 }
    );
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);
    expect(data.shortlist.length).toBe(1);
    expect(data.shortlist[0].universityName).toBe("University of Munich");
  });

  it('PATCH /api/study-abroad/shortlist/:id/status (applied) schedules follow-up task', async () => {
    const entryId = mockD1.tables.study_abroad_shortlists[0].id;
    const res = await app.request(
      `/api/study-abroad/shortlist/${entryId}/status`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'cookie': 'better-auth.session_token=token-counselor' },
        body: JSON.stringify({ status: 'applied' })
      },
      { DB: mockD1 }
    );
    expect(res.status).toBe(200);

    // Verify a follow-up task is scheduled
    expect(mockD1.tables.tasks.some(t => t.title.includes('University Decision Follow-up'))).toBe(true);
  });

  it('PATCH /api/study-abroad/shortlist/:id/status (admitted) schedules visa prep and advances stage', async () => {
    const entryId = mockD1.tables.study_abroad_shortlists[0].id;
    const res = await app.request(
      `/api/study-abroad/shortlist/${entryId}/status`,
      {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'cookie': 'better-auth.session_token=token-counselor' },
        body: JSON.stringify({ status: 'admitted' })
      },
      { DB: mockD1 }
    );
    expect(res.status).toBe(200);

    // Verify a visa task is scheduled
    expect(mockD1.tables.tasks.some(t => t.title.includes('Visa Documentation Checklist'))).toBe(true);
    
    // Verify engagement stage key transitioned to processing
    const eng = mockD1.tables.engagements.find(e => e.id === 'eng-sa-1');
    expect(eng.stage_key).toBe('processing');
  });
});
