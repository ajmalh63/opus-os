import { describe, it, expect, vi, beforeEach } from 'vitest';
import { portalRouter } from '../src/routes/portal.js';
import { MockD1Database } from './mockDb.js';

describe('Realtime Client Onboarding & CRM Sync API', () => {
  let mockD1: MockD1Database;
  const mockEnv: any = {
    DB: undefined,
    BETTER_AUTH_SECRET: 'test_auth_secret_12345',
  };

  const testClient = {
    id: 'cl-onboard-test-1',
    portal_token: 'OP-2026-TEST-1',
    name: 'Amina Al-Mansoor',
    email: 'amina@example.com',
    phone: '',
    city: '',
    dob: null,
    highest_qualification: null,
    passport_number: null,
    passport_expiry: null,
    primary_division: null,
    intent_divisions: null,
    intake_context: null,
    created_at: Math.floor(Date.now() / 1000),
    updated_at: Math.floor(Date.now() / 1000),
  };

  beforeEach(() => {
    mockD1 = new MockD1Database();
    mockEnv.DB = mockD1;
    mockD1.tables.clients = [{ ...testClient }];
    mockD1.tables.documents = [];
    mockD1.tables.visa_deadlines = [];
    mockD1.tables.payments = [];
    mockD1.tables.payment_schedules = [];
  });

  it('GET /onboarding/profile returns profile data and 20% initial progress (welcome step done)', async () => {
    const req = new Request('http://localhost/onboarding/profile', {
      method: 'GET',
      headers: {
        'x-portal-token': 'OP-2026-TEST-1',
      },
    });

    const res = await portalRouter.fetch(req, mockEnv);
    const json: any = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.client.name).toBe('Amina Al-Mansoor');
    expect(json.onboarding.pct).toBe(20); // 1 out of 5 steps
    expect(json.onboarding.steps.find((s: any) => s.key === 'welcome').done).toBe(true);
    expect(json.onboarding.steps.find((s: any) => s.key === 'profile').done).toBe(false);
  });

  it('POST /onboarding/save-step saves Step 1 (Profile) and advances progress to 40%', async () => {
    const req = new Request('http://localhost/onboarding/save-step', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-portal-token': 'OP-2026-TEST-1',
      },
      body: JSON.stringify({
        step: 'profile',
        data: {
          name: 'Amina Al-Mansoor',
          phone: '+919876543210',
          city: 'Calicut',
          state: 'Kerala',
          dob: '2001-05-15',
          gender: 'female',
        },
      }),
    });

    const res = await portalRouter.fetch(req, mockEnv);
    const json: any = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.onboarding.pct).toBe(40); // welcome + profile = 2 / 5 = 40%

    // Verify DB update
    const updated = mockD1.tables.clients.find((c: any) => c.id === 'cl-onboard-test-1');
    expect(updated.phone).toBe('+919876543210');
    expect(updated.city).toBe('Calicut');
  });

  it('POST /onboarding/save-step saves Step 2 (Passport) and advances progress to 60%', async () => {
    // First save profile
    const profileReq = new Request('http://localhost/onboarding/save-step', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-portal-token': 'OP-2026-TEST-1' },
      body: JSON.stringify({
        step: 'profile',
        data: { name: 'Amina Al-Mansoor', phone: '+919876543210', city: 'Calicut' },
      }),
    });
    await portalRouter.fetch(profileReq, mockEnv);

    // Save passport
    const passReq = new Request('http://localhost/onboarding/save-step', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-portal-token': 'OP-2026-TEST-1' },
      body: JSON.stringify({
        step: 'passport',
        data: {
          status: 'valid',
          passportNumber: 'Z9876543',
          passportExpiry: '2032-12-31',
          placeOfIssue: 'RPO Kozhikode',
        },
      }),
    });

    const res = await portalRouter.fetch(passReq, mockEnv);
    const json: any = await res.json();

    expect(res.status).toBe(200);
    expect(json.onboarding.pct).toBe(60); // welcome + profile + passport = 3 / 5 = 60%

    const updated = mockD1.tables.clients.find((c: any) => c.id === 'cl-onboard-test-1');
    expect(updated.passport_number).toBe('Z9876543');
    expect(updated.passport_expiry).toBe('2032-12-31');
  });

  it('Completes all steps sequentially reaching 100% Onboarding', async () => {
    // 1. Profile
    await portalRouter.fetch(
      new Request('http://localhost/onboarding/save-step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-portal-token': 'OP-2026-TEST-1' },
        body: JSON.stringify({
          step: 'profile',
          data: { name: 'Amina', phone: '+919876543210', city: 'Calicut' },
        }),
      }),
      mockEnv
    );

    // 2. Passport
    await portalRouter.fetch(
      new Request('http://localhost/onboarding/save-step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-portal-token': 'OP-2026-TEST-1' },
        body: JSON.stringify({
          step: 'passport',
          data: { status: 'valid', passportNumber: 'Z1234567', passportExpiry: '2030-01-01' },
        }),
      }),
      mockEnv
    );

    // 3. Education
    await portalRouter.fetch(
      new Request('http://localhost/onboarding/save-step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-portal-token': 'OP-2026-TEST-1' },
        body: JSON.stringify({
          step: 'education',
          data: { highestQualification: "Bachelor's Degree", degree: 'B.Tech CS', university: 'Calicut Univ' },
        }),
      }),
      mockEnv
    );

    // 4. Intent
    const finalRes = await portalRouter.fetch(
      new Request('http://localhost/onboarding/save-step', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-portal-token': 'OP-2026-TEST-1' },
        body: JSON.stringify({
          step: 'intent',
          data: { primaryDivision: 'study-abroad', targetCountry: 'United Kingdom', targetIntake: 'Fall 2026' },
        }),
      }),
      mockEnv
    );

    const json: any = await finalRes.json();
    expect(json.success).toBe(true);
    expect(json.onboarding.pct).toBe(100);

    // Verify GET /dashboard returns completed onboarding
    const dashRes = await portalRouter.fetch(
      new Request('http://localhost/dashboard', {
        method: 'GET',
        headers: { 'x-portal-token': 'OP-2026-TEST-1' },
      }),
      mockEnv
    );
    const dashJson: any = await dashRes.json();
    expect(dashJson.onboarding.pct).toBe(100);
  });
});
