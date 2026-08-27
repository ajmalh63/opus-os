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
                user: { id: 'counselor-1', name: 'Counselor', email: 'c@test.com', role: 'counselor', userDivisions: JSON.stringify(['study-abroad']) },
                session: { id: 's1', token, userId: 'counselor-1' }
              };
            }
            return null;
          }
        }
      };
    }
  };
});

describe('Study Abroad Applications (snapshot model)', () => {
  let mockD1: MockD1Database;
  const now = Math.floor(Date.now() / 1000);

  const uniSnapshot = {
    name: 'University of Toronto', country: 'Canada', city: 'Toronto',
    website: 'https://utoronto.ca', portalUrl: 'https://apply.utoronto.ca', portalUsername: 'agent-ops',
    program: 'MSc Computer Science', degreeLevel: 'masters', intake: 'Fall 2027',
    deadline: now + 60 * 86400, applicationFeePaise: 1250000,
    minGpa: 7.5, minEnglishScore: 6.5, englishTest: 'IELTS', greRequired: false,
    tuitionLpaMin: 18, tuitionLpaMax: 24, scholarshipsJson: '["Entrance Scholarship"]',
    notes: 'Apply via portal'
  };

  beforeAll(() => {
    mockD1 = new MockD1Database();
    mockD1.tables.clients.push({
      id: 'OP-2026-9201',
      portal_token: 'OP-2026-9201', name: 'Saurabh Sen', phone: '+91 99999 33333', email: 'saurabh@test.com',
      highest_qualification: 'undergrad', intake_context: JSON.stringify({
        cgpa: 8.2, englishTest: 'IELTS', englishScore: 7.0, targetIntake: 'Fall 2027',
        targetCountry: 'Canada', tuitionBudget: 25, preferredCourse: 'Computer Science',
        degreeName: 'B.Tech', universitySharingConsent: true, pct10th: 88, pct12th: 91
      }),
      created_at: now, updated_at: now
    });
    // Gate booking — scheduled future session (required for docs_ready→submitted)
    mockD1.tables.bookings.push({
      id: 'book-gate-1', client_id: 'OP-2026-9201', division: 'study-abroad',
      attendee_email: 'saurabh@test.com', title: 'Admissions Strategy Call',
      start_time: now + 86400, end_time: now + 86400 + 1800, status: 'scheduled',
      created_at: now
    });
    mockD1.tables.engagements.push(
      { id: 'eng-9201', client_id: 'OP-2026-9201', division: 'study-abroad', title: 'Masters Applications', stage_key: 'lead', outstanding_balance: 0, status: 'active', created_at: now, updated_at: now }
    );
  });

  const staffHeaders = { cookie: 'better-auth.session_token=token-counselor' };

  it('POST /api/study-abroad/applications creates an application from the modal snapshot', async () => {
    const res = await app.request('/api/study-abroad/applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...staffHeaders },
      body: JSON.stringify({ clientId: 'OP-2026-9201', university: uniSnapshot })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);
    const row = mockD1.tables.study_abroad_applications.find((a: any) => a.id === data.id);
    expect(row).toBeTruthy();
    expect(row.client_id).toBe('OP-2026-9201');
    expect(row.status).toBe('shortlisted');
    const snap = JSON.parse(row.university_json);
    expect(snap.name).toBe('University of Toronto');
    expect(snap.intake).toBe('Fall 2027');
  });

  it('POST rejects a snapshot without university name or program (zod)', async () => {
    const res = await app.request('/api/study-abroad/applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...staffHeaders },
      body: JSON.stringify({ clientId: 'OP-2026-9201', university: { name: 'X', country: 'Canada', program: '', intake: 'Fall 2027' } })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(res.status).toBe(400);
  });

  it('GET /api/study-abroad/applications lists applications with live match tier', async () => {
    const res = await app.request('/api/study-abroad/applications?clientId=OP-2026-9201', { headers: staffHeaders }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.applications.length).toBe(1);
    const a = data.applications[0];
    expect(a.university.name).toBe('University of Toronto');
    // profile CGPA 8.2 ≥ 7.5, IELTS 7.0 ≥ 6.5, budget 25 ≥ 24, country matches → match
    expect(a.match.tier).toBe('match');
    expect(a.match.score).toBeGreaterThanOrEqual(50);
  });

  it('PATCH status enforces no-jump rules (shortlisted → enrolled = 409)', async () => {
    const appRow = mockD1.tables.study_abroad_applications[0];
    const res = await app.request(`/api/study-abroad/applications/${appRow.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...staffHeaders },
      body: JSON.stringify({ status: 'enrolled' })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(res.status).toBe(409);
    expect((await res.json() as any).code).toBe('invalid_transition');
  });

  it('PATCH status shortlisted → docs_ready → submitted works and auto-creates a 14-day follow-up task', async () => {
    const appRow = mockD1.tables.study_abroad_applications[0];
    const r1 = await app.request(`/api/study-abroad/applications/${appRow.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...staffHeaders },
      body: JSON.stringify({ status: 'docs_ready' })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(r1.status).toBe(200);

    const r2 = await app.request(`/api/study-abroad/applications/${appRow.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...staffHeaders },
      body: JSON.stringify({ status: 'submitted' })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(r2.status).toBe(200);

    const updated = mockD1.tables.study_abroad_applications.find((a: any) => a.id === appRow.id);
    expect(updated.status).toBe('submitted');
    expect(updated.submitted_at).toBeTruthy();

    const task = mockD1.tables.tasks.find((t: any) => t.title.includes('Decision Follow-up'));
    expect(task).toBeTruthy();
    expect(task.due_date).toBeGreaterThan(now + 13 * 86400);
  });

  it('PATCH offer records offer letter, conditions, deadlines and creates acceptance task', async () => {
    const appRow = mockD1.tables.study_abroad_applications[0];
    const res = await app.request(`/api/study-abroad/applications/${appRow.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...staffHeaders },
      body: JSON.stringify({ status: 'under_review' })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(res.status).toBe(200);

    const offerRes = await app.request(`/api/study-abroad/applications/${appRow.id}/offer`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...staffHeaders },
      body: JSON.stringify({
        offerLetterKey: 'offers/toronto-msc.pdf', offerType: 'conditional',
        offerConditions: ['Final transcript ≥ 7.5', 'IELTS ≥ 7.0'],
        acceptanceDeadline: now + 21 * 86400, depositAmountPaise: 5000000, depositDeadline: now + 30 * 86400
      })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(offerRes.status).toBe(200);

    const statusRes = await app.request(`/api/study-abroad/applications/${appRow.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...staffHeaders },
      body: JSON.stringify({ status: 'offer_letter' })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(statusRes.status).toBe(200);

    const updated = mockD1.tables.study_abroad_applications.find((a: any) => a.id === appRow.id);
    expect(updated.offer_letter_key).toBe('offers/toronto-msc.pdf');
    expect(updated.offer_type).toBe('conditional');
    expect(updated.offer_decision).toBe('pending');
    expect(updated.deposit_amount_paise).toBe(5000000);

    const task = mockD1.tables.tasks.find((t: any) => t.title.includes('Acceptance'));
    expect(task).toBeTruthy();
    expect(task.due_date).toBe(now + 21 * 86400);
  });

  it('PATCH docs updates the per-application checklist', async () => {
    const appRow = mockD1.tables.study_abroad_applications[0];
    const res = await app.request(`/api/study-abroad/applications/${appRow.id}/docs`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', ...staffHeaders },
      body: JSON.stringify({ docs: { transcript: 'verified', sop: 'received', ielts: 'missing' } })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(res.status).toBe(200);
    const updated = mockD1.tables.study_abroad_applications.find((a: any) => a.id === appRow.id);
    const checklist = JSON.parse(updated.docs_checklist_json);
    expect(checklist.transcript).toBe('verified');
    expect(checklist.sop).toBe('received');
    expect(checklist.ielts).toBe('missing');
  });

  it('GET /api/study-abroad/applications/pipeline aggregates counts, stuck, decisions pending, deadlines', async () => {
    // second application stuck in shortlisted (old updatedAt)
    mockD1.tables.study_abroad_applications.push({
      id: 'app-stuck', client_id: 'OP-2026-9201', university_json: JSON.stringify({ ...uniSnapshot, name: 'McGill', program: 'MEng' }),
      status: 'shortlisted', docs_checklist_json: '{}', offer_conditions_json: '[]', offer_decision: 'pending',
      created_at: now - 20 * 86400, updated_at: now - 10 * 86400
    });
    const res = await app.request('/api/study-abroad/applications/pipeline', { headers: staffHeaders }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.counts.shortlisted).toBe(1);
    expect(data.counts.offer_letter).toBe(1);
    // stuck: app-stuck (10 days old) — 1 stuck
    expect(data.stuck.length).toBe(1);
    expect(data.stuck[0].id).toBe('app-stuck');
    // decisions pending: the offer_letter app with offerDecision pending
    expect(data.decisionsPending.length).toBe(1);
    // deadlines soon: acceptance deadline within 7 days? (21 days out → no)
    expect(data.deadlinesSoon.length).toBe(0);
  });

  it('GET /api/public/portal/study-abroad/applications returns the student tracker', async () => {
    const res = await app.request('/api/public/portal/study-abroad/applications?token=OP-2026-9201', {}, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.applications.length).toBe(2);
    const a = data.applications.find((x: any) => x.id === 'app-stuck');
    expect(a.university.name).toBe('McGill');
    expect(a.status).toBe('shortlisted');
  });

  it('POST /api/public/portal/study-abroad/applications/:id/accept-offer records decision + deposit task', async () => {
    const appRow = mockD1.tables.study_abroad_applications.find((a: any) => a.id !== 'app-stuck');
    const res = await app.request(`/api/public/portal/study-abroad/applications/${appRow.id}/accept-offer?token=OP-2026-9201`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ decision: 'accepted' })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(res.status).toBe(200);
    const updated = mockD1.tables.study_abroad_applications.find((a: any) => a.id === appRow.id);
    expect(updated.offer_decision).toBe('accepted');
    const task = mockD1.tables.tasks.find((t: any) => t.title.includes('Deposit'));
    expect(task).toBeTruthy();
  });
});