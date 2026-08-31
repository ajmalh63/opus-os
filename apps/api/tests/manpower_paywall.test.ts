import { describe, it, expect, beforeAll } from 'vitest';
import app from '../src/index.js';
import { MockD1Database } from './mockDb.js';
import { seedMembershipPlans } from '../src/routes/portalManpower.js';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../src/db/schema.js';

const FULL_FORM = {
  personal: { fullName: 'Imran Shaikh', dob: '1992-03-03', gender: 'male', maritalStatus: 'single', nationality: 'Indian', currentCity: 'Nagpur', currentState: 'Maharashtra', languages: ['English'] },
  contact: { phone: '+91 99999 12345', email: 'imran@example.com', alternatePhone: '', emergencyContact: 'Brother', emergencyPhone: '+91 99999 54321' },
  passport: { hasPassport: true, passportNumber: 'M7654321', issueDate: '2021-01-01', expiryDate: '2031-01-01' },
  experience: { totalYears: 4, currentRole: 'Electrician', currentEmployer: 'Tata', skills: ['Electrical'], willingToTravel: true, availableFrom: '2026-10-01' },
  education: { highestQualification: 'ITI', institution: 'ITI Nagpur', fieldOfStudy: 'Electrical' },
  salary: { currentSalaryPaise: 2500000, expectedSalaryPaise: 4500000, noticePeriodDays: 15 },
  medical: { selfDeclaredFit: true, hasChronicCondition: false },
  additional: { tradeCertifications: ['ITI'], drivingLicense: '', references: '' },
};

describe('Manpower ₹100 Candidate Pass paywall — unified server-side gate', () => {
  let mockD1: MockD1Database;
  const now = Math.floor(Date.now() / 1000);

  beforeAll(() => {
    mockD1 = new MockD1Database();
    mockD1.tables.app_settings.push({ key: 'divisions_enabled', value: JSON.stringify({ 'study-abroad': true, visa: true, umrah: true, attestation: true, manpower: true }), updated_at: 1 });

    mockD1.tables.clients.push({ id: 'OP-PASS', portal_token: 'OP-PASS', name: 'Pass Holder', phone: '1', email: 'pass@x.com', exclusive_member: 1, exclusive_expires_at: now + 86400 * 36500, exclusive_plan: 'candidate-pass', created_at: 0, updated_at: 0 } as any);
    mockD1.tables.clients.push({ id: 'OP-NOPASS', portal_token: 'OP-NOPASS', name: 'No Pass', phone: '2', email: 'no@x.com', exclusive_member: 0, created_at: 0, updated_at: 0 } as any);
    // Expired pass — must be treated as a non-member
    mockD1.tables.clients.push({ id: 'OP-EXPIRED', portal_token: 'OP-EXPIRED', name: 'Expired', phone: '3', email: 'exp@x.com', exclusive_member: 1, exclusive_expires_at: now - 86400, created_at: 0, updated_at: 0 } as any);

    mockD1.tables.job_postings.push({ id: 'pw-job-1', title: 'Welder', country: 'Qatar', sector: 'Construction', salary_text: 'QR 2500', collar: 'blue_collar', tier: 'public', status: 'open', employer: 'Alpha LLC', created_at: 0 } as any);
    mockD1.tables.job_postings.push({ id: 'pw-job-2', title: 'Nurse', country: 'Saudi Arabia', sector: 'Healthcare', salary_text: 'SAR 3800', collar: 'white_collar', tier: 'public', status: 'open', employer: 'Beta Care', created_at: 0 } as any);
  });

  it('POST /applications: non-member applying to ANY job → 403 MEMBERSHIP_REQUIRED', async () => {
    for (const jobId of ['pw-job-1', 'pw-job-2']) {
      const res = await app.request('/api/public/portal/manpower/applications', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'OP-NOPASS', jobId, formJson: FULL_FORM }),
      }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
      expect(res.status).toBe(403);
      const data = await res.json() as any;
      expect(data.code).toBe('MEMBERSHIP_REQUIRED');
      expect(data.planKey).toBe('candidate-pass');
    }
  });

  it('POST /applications: expired pass holders are treated as non-members (403)', async () => {
    const res = await app.request('/api/public/portal/manpower/applications', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'OP-EXPIRED', jobId: 'pw-job-1', formJson: FULL_FORM }),
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    expect(res.status).toBe(403);
    const data = await res.json() as any;
    expect(data.code).toBe('MEMBERSHIP_REQUIRED');
  });

  it('POST /applications: active pass holder passes the gate and the application is created', async () => {
    const res = await app.request('/api/public/portal/manpower/applications', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'OP-PASS', jobId: 'pw-job-2', formJson: FULL_FORM }),
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);
    const row = (mockD1.tables.manpower_deployments as any[]).find((d) => d.job_id === 'pw-job-2');
    expect(row).toBeTruthy();
    expect(row.selection_status).toBe('applied');
  });

  it('GET /jobs: non-members see all open jobs with locked:true and employer masked', async () => {
    const res = await app.request('/api/public/portal/manpower/jobs?token=OP-NOPASS', {}, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    const ids = data.jobs.map((j: any) => j.id).sort();
    expect(ids).toEqual(['pw-job-1', 'pw-job-2']);
    for (const j of data.jobs) {
      expect(j.locked).toBe(true);
      expect(j.employer).toBeNull();
      expect(j.exclusive).toBeUndefined();
    }
  });

  it('GET /jobs: pass holders see locked:false with the full employer data', async () => {
    const res = await app.request('/api/public/portal/manpower/jobs?token=OP-PASS', {}, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    const data = await res.json() as any;
    const j1 = data.jobs.find((j: any) => j.id === 'pw-job-1');
    expect(j1.locked).toBe(false);
    expect(j1.employer).toBe('Alpha LLC');
  });

  it('GET /membership: only the candidate-pass plan is offered (enabled: true, comingSoon: false)', async () => {
    const res = await app.request('/api/public/portal/manpower/membership?token=OP-NOPASS', {}, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);
    expect(data.enabled).toBe(true);
    expect(data.comingSoon).toBe(false);
    expect(data.membership.isMember).toBe(false);
    expect(data.plans.length).toBe(1);
    expect(data.plans[0].key).toBe('candidate-pass');
    expect(data.plans[0].pricePaise).toBe(10000);
    expect(data.plans[0].durationDays).toBe(36500);
  });

  it('seedMembershipPlans seeds ONLY the candidate-pass plan and is idempotent', async () => {
    const db = drizzle(mockD1 as any, { schema });
    await seedMembershipPlans(db);
    await seedMembershipPlans(db); // second run must not duplicate
    const plans = (mockD1.tables.membership_plans as any[]).filter((p) => p.active);
    expect(plans.length).toBe(1);
    expect(plans[0].key).toBe('candidate-pass');
    expect(plans[0].price_paise).toBe(10000);
  });
});

