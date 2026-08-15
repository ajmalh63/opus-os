import { describe, it, expect, beforeAll } from 'vitest';
import app from '../src/index.js';
import { MockD1Database } from './mockDb.js';

const FULL_FORM = {
  personal: { fullName: 'Zeeshan Ali', dob: '1990-05-05', gender: 'male', maritalStatus: 'single', nationality: 'Indian', currentCity: 'Hyderabad', currentState: 'Telangana', languages: ['English', 'Hindi'] },
  contact: { phone: '+91 88888 77777', email: 'zeeshan@example.com', alternatePhone: '', emergencyContact: 'Father', emergencyPhone: '+91 88888 66666' },
  passport: { hasPassport: true, passportNumber: 'N1234567', issueDate: '2020-01-01', expiryDate: '2030-01-01' },
  experience: { totalYears: 5, currentRole: 'Welder', currentEmployer: 'L&T', skills: ['Welding', 'Fabrication'], willingToTravel: true, availableFrom: '2026-09-01' },
  education: { highestQualification: 'ITI Fitter', institution: 'ITI Hyderabad', fieldOfStudy: 'Mechanical' },
  salary: { currentSalaryPaise: 3000000, expectedSalaryPaise: 5000000, noticePeriodDays: 30 },
  medical: { selfDeclaredFit: true, hasChronicCondition: false },
  additional: { tradeCertifications: ['ITI Fitter'], drivingLicense: 'LMV', references: 'Available on request' },
};

describe('Manpower Client Portal (Phase 2) — jobs browse + apply', () => {
  let mockD1: MockD1Database;

  beforeAll(() => {
    mockD1 = new MockD1Database();

    mockD1.tables.clients.push({
      id: 'OP-2026-9101',
      name: 'Zeeshan Ali',
      phone: '+91 88888 77777',
      email: 'zeeshan@example.com',
      created_at: 0,
      updated_at: 0,
    } as any);

    mockD1.tables.job_postings.push({
      id: 'job-public-1',
      title: 'Senior Welder',
      country: 'UAE',
      sector: 'Construction',
      salary_text: 'AED 2,500',
      collar: 'blue_collar',
      tier: 'public',
      status: 'open',
      description: 'Welder for logistics depot',
      employer: 'Al Marwan LLC',
      benefits_json: '["Accommodation", "Food"]',
      requirements_json: '["ITI Fitter", "2+ yrs"]',
      vacancies: 5,
      experience_years_min: 2,
      trade_category: 'Construction',
      visa_provided: 1,
      medical_required: 1,
      featured: 0,
      created_at: 0,
    } as any);

    mockD1.tables.job_postings.push({
      id: 'job-secret-1',
      title: 'Confidential Operator',
      country: 'Qatar',
      sector: 'Oil & Gas',
      salary_text: 'QAR 4,000',
      collar: 'blue_collar',
      tier: 'secret',
      status: 'open',
      created_at: 0,
    } as any);

    mockD1.tables.job_postings.push({
      id: 'job-filled-1',
      title: 'Closed Role',
      country: 'UAE',
      sector: 'Construction',
      salary_text: 'AED 1,000',
      collar: 'blue_collar',
      tier: 'public',
      status: 'filled',
      created_at: 0,
    } as any);
  });

  it('GET /api/public/portal/manpower/jobs returns only public open jobs', async () => {
    const res = await app.request('/api/public/portal/manpower/jobs', {}, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);
    expect(data.jobs.length).toBe(1);
    expect(data.jobs[0].id).toBe('job-public-1');
    expect(data.jobs[0].benefits).toEqual(['Accommodation', 'Food']);
    expect(data.jobs[0].requirements).toEqual(['ITI Fitter', '2+ yrs']);
    expect(data.jobs[0].employer).toBe('Al Marwan LLC');
  });

  it('POST /applications rejects an incomplete form with missing sections', async () => {
    const res = await app.request('/api/public/portal/manpower/applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'OP-2026-9101', jobId: 'job-public-1', formJson: { personal: { fullName: 'Z' } } }),
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    expect(res.status).toBe(400);
    const data = await res.json() as any;
    expect(data.code).toBe('incomplete_form');
    expect(data.missingSections).toContain('contact');
  });

  it('POST /applications creates an applied deployment and records the form + resume', async () => {
    const res = await app.request('/api/public/portal/manpower/applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'OP-2026-9101', jobId: 'job-public-1', formJson: FULL_FORM, resumeKey: 'resumes/x.pdf' }),
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);

    const row = (mockD1.tables.manpower_deployments as any[]).find((d) => d.id === data.id);
    expect(row).toBeTruthy();
    expect(row.selection_status).toBe('applied');
    expect(row.resume_key).toBe('resumes/x.pdf');
    expect(JSON.parse(row.form_json).personal.fullName).toBe('Zeeshan Ali');
    expect(row.applied_at).toBeTruthy();
  });

  it('POST /applications is idempotent per (client, job)', async () => {
    const res = await app.request('/api/public/portal/manpower/applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'OP-2026-9101', jobId: 'job-public-1', formJson: FULL_FORM }),
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.duplicate).toBe(true);
  });

it('POST /applications blocks secret jobs from client self-apply (non-member)', async () => {
    const res = await app.request('/api/public/portal/manpower/applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'OP-2026-9101', jobId: 'job-secret-1', formJson: FULL_FORM }),
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    expect(res.status).toBe(403);
  });

  it('GET /applications?token= returns the joined application with job title', async () => {
    const res = await app.request('/api/public/portal/manpower/applications?token=OP-2026-9101', {}, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.applications.length).toBe(1);
    expect(data.applications[0].jobTitle).toBe('Senior Welder');
    expect(data.applications[0].jobCountry).toBe('UAE');
    expect(data.applications[0].formJson.personal.fullName).toBe('Zeeshan Ali');
  });
});
