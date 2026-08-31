import { describe, it, expect, beforeAll, vi } from 'vitest';
import app from '../src/index.js';
import { MockD1Database } from './mockDb.js';

vi.mock('../src/auth.js', () => {
  return {
    getAuth: (env: any) => {
      const users: Record<string, any> = {
        'token-admin': { id: 'admin-1', name: 'Admin', email: 'a@test.com', role: 'super_admin', userDivisions: JSON.stringify(['manpower']), twoFactorEnabled: false },
        'token-counselor': { id: 'counselor-1', name: 'Counselor', email: 'c@test.com', role: 'counselor', userDivisions: JSON.stringify(['manpower']), twoFactorEnabled: false },
      };
      return {
        api: { getSession: async ({ headers }: any) => {
          const cookie = typeof headers?.get === 'function' ? (headers.get('cookie') || '') : (headers?.['cookie'] || '');
          const match = cookie.match(/better-auth\.session_token=([^;]+)/);
          const token = match?.[1] || '';
          const user = users[token];
          if (!user) return null;
          return { session: { token, userId: user.id }, user };
        } },
      };
    },
  };
});

const FULL_FORM = {
  personal: { fullName: 'Zeeshan Ali', dob: '1990-05-05', gender: 'male', maritalStatus: 'single', nationality: 'Indian', currentCity: 'Hyderabad', currentState: 'Telangana', languages: ['English'] },
  contact: { phone: '+91 88888 77777', email: 'z@example.com', alternatePhone: '', emergencyContact: 'F', emergencyPhone: '+91 88888 66666' },
  passport: { hasPassport: true, passportNumber: 'N1234567', issueDate: '2020-01-01', expiryDate: '2030-01-01' },
  experience: { totalYears: 5, currentRole: 'Welder', currentEmployer: 'L&T', skills: ['Welding'], willingToTravel: true, availableFrom: '2026-09-01' },
  education: { highestQualification: 'ITI', institution: 'ITI', fieldOfStudy: 'Mech' },
  salary: { currentSalaryPaise: 3000000, expectedSalaryPaise: 5000000, noticePeriodDays: 30 },
  medical: { selfDeclaredFit: true, hasChronicCondition: false },
  additional: { tradeCertifications: ['ITI'], drivingLicense: 'LMV', references: '' },
};

describe('Candidate Pass (Manpower) — paywall gating + admin plans', () => {
  let mockD1: MockD1Database;
  const now = Math.floor(Date.now() / 1000);

  beforeAll(() => {
    mockD1 = new MockD1Database();
    mockD1.tables.app_settings.push({ key: 'divisions_enabled', value: JSON.stringify({ 'study-abroad': true, visa: true, umrah: true, attestation: true, manpower: true }), updated_at: 1 });

    mockD1.tables.clients.push({ id: 'OP-MEMBER', portal_token: 'OP-MEMBER', name: 'Member', phone: '1', email: 'm@x.com', exclusive_member: 1, exclusive_expires_at: now + 86400 * 36500, exclusive_plan: 'candidate-pass', created_at: 0, updated_at: 0 } as any);
    mockD1.tables.clients.push({ id: 'OP-FREE', portal_token: 'OP-FREE', name: 'Free', phone: '2', email: 'f@x.com', exclusive_member: 0, created_at: 0, updated_at: 0 } as any);

    mockD1.tables.job_postings.push({ id: 'job-pub', title: 'Public Welder', country: 'UAE', sector: 'Construction', salary_text: 'AED 2500', collar: 'blue_collar', tier: 'public', status: 'open', employer: 'Gulf Contracting LLC', created_at: 0 } as any);
    mockD1.tables.job_postings.push({ id: 'job-sec', title: 'Confidential Operator', country: 'Qatar', sector: 'Oil & Gas', salary_text: 'QAR 4000', collar: 'blue_collar', tier: 'public', status: 'open', employer: 'Confidential Employer', created_at: 0 } as any);

    // Legacy discontinued plan row — must never surface in the paywall response.
    mockD1.tables.membership_plans.push({ id: 'plan-1', key: 'exclusive-30', name: 'Exclusive 30 Days', description: '30 days', price_paise: 49900, duration_days: 30, tier: 'basic', perks_json: '["Secret jobs"]', active: 1, sort_order: 1, created_at: 0, updated_at: 0 } as any);
  });

  it('GET /jobs returns ALL open jobs; employer masked + locked for non-members', async () => {
    const res = await app.request('/api/public/portal/manpower/jobs?token=OP-FREE', {}, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    const data = await res.json() as any;
    expect(data.jobs.length).toBe(2);
    for (const j of data.jobs) {
      expect(j.locked).toBe(true);
      expect(j.employer).toBeNull();
    }
  });

  it('GET /jobs returns full data (unlocked, employer visible) for Candidate Pass holders', async () => {
    const res = await app.request('/api/public/portal/manpower/jobs?token=OP-MEMBER', {}, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    const data = await res.json() as any;
    expect(data.jobs.length).toBe(2);
    const pub = data.jobs.find((j: any) => j.id === 'job-pub');
    expect(pub.locked).toBe(false);
    expect(pub.employer).toBe('Gulf Contracting LLC');
  });

  it('POST /applications blocks ALL jobs for non-members (403 MEMBERSHIP_REQUIRED)', async () => {
    const res = await app.request('/api/public/portal/manpower/applications', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'OP-FREE', jobId: 'job-pub', formJson: FULL_FORM }),
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    expect(res.status).toBe(403);
    const data = await res.json() as any;
    expect(data.code).toBe('MEMBERSHIP_REQUIRED');
    expect(data.planKey).toBe('candidate-pass');
    expect(data.error).toContain('Candidate Pass');
  });

  it('POST /applications allows jobs for members (paywall gate passed)', async () => {
    const res = await app.request('/api/public/portal/manpower/applications', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'OP-MEMBER', jobId: 'job-sec', formJson: FULL_FORM, resumeKey: 'resumes/x.pdf' }),
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    expect(res.status).toBe(200);
    const row = (mockD1.tables.manpower_deployments as any[]).find((d) => d.job_id === 'job-sec');
    expect(row).toBeTruthy();
    expect(row.resume_key).toBe('resumes/x.pdf');
  });

  it('GET /membership returns status + ONLY the candidate-pass plan (enabled, not coming soon)', async () => {
    const res = await app.request('/api/public/portal/manpower/membership?token=OP-MEMBER', {}, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    const data = await res.json() as any;
    expect(data.membership.isMember).toBe(true);
    expect(data.enabled).toBe(true);
    expect(data.comingSoon).toBe(false);
    expect(data.plans.length).toBe(1);
    expect(data.plans[0].key).toBe('candidate-pass');
    expect(data.plans[0].pricePaise).toBe(10000);
    expect(data.plans.some((p: any) => p.key === 'exclusive-30')).toBe(false);
  });

  it('GET /membership-plans is superadmin-only (403 for counselor)', async () => {
    const res = await app.request('/api/manpower/membership-plans', { headers: { 'cookie': 'better-auth.session_token=token-counselor' } }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    expect(res.status).toBe(403);
  });

  it('POST /membership-plans is discontinued (404)', async () => {
    const res = await app.request('/api/manpower/membership-plans', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'cookie': 'better-auth.session_token=token-admin' },
      body: JSON.stringify({ key: 'exclusive-90', name: 'Exclusive 90 Days', pricePaise: 129900, durationDays: 90, tier: 'pro', perks: ['Secret jobs', 'Priority'] }),
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    expect(res.status).toBe(404);
    expect((mockD1.tables.membership_plans as any[]).some((p) => p.key === 'exclusive-90')).toBe(false);
  });

  it('PATCH /clients/:id/membership grants the Candidate Pass by default (superadmin)', async () => {
    const res = await app.request('/api/manpower/clients/OP-FREE/membership', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', 'cookie': 'better-auth.session_token=token-admin' },
      body: JSON.stringify({ exclusiveMember: true }),
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    expect(res.status).toBe(200);
    const client = (mockD1.tables.clients as any[]).find((c) => c.id === 'OP-FREE');
    expect(client.exclusive_member).toBe(1);
    expect(client.exclusive_plan).toBe('candidate-pass');
    expect(client.exclusive_expires_at).toBeGreaterThan(now);
  });
});
