import { describe, it, expect, beforeAll, vi } from 'vitest';
import app from '../src/index.js';
import { MockD1Database } from './mockDb.js';

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

const FULL_FORM = {
  applicant: { fullName: 'Rohit Sharma', dob: '1990-01-01', gender: 'male', maritalStatus: 'single', nationality: 'Indian' },
  passport: { number: 'N1234567', issueDate: '2020-01-01', expiryDate: '2030-01-01', placeOfIssue: 'Hyderabad', countryOfIssue: 'India', hasPreviousPassport: false },
  contact: { address: 'MG Road', city: 'Hyderabad', state: 'Telangana', pincode: '500001', emergencyContact: 'Suresh', emergencyPhone: '9999999999' },
  employment: { status: 'salaried', employerName: 'Acme Corp', designation: 'Engineer', yearsEmployed: 5, monthlyIncome: 800000 },
  travel: { purpose: 'tourism', intendedArrival: '2026-12-01', intendedDeparture: '2026-12-15', accommodation: 'hotel', accommodationName: 'Marriott', returnTicketBooked: true, hasCompanions: false, companions: 0 },
  financial: { fundingSource: 'salary', employmentLetterAvailable: true, itrFiled: true },
  visaHistory: { hasUsUkSchengen: false, previousCountries: [], everRejected: false, everOverstayed: false },
};

describe('Visa Client Portal (Phase 1) — draft wizard, submit, staff interlock', () => {
  let mockD1: MockD1Database;
  let appId = '';

  beforeAll(() => {
    mockD1 = new MockD1Database();
    mockD1.tables.app_settings.push({ key: 'divisions_enabled', value: JSON.stringify({ 'study-abroad': true, visa: true, umrah: true, attestation: true, manpower: true }), updated_at: 1 });

    mockD1.tables.clients.push({
      id: "OP-2026-9001",
      portal_token: "OP-2026-9001",
      name: "Rohit Sharma",
      phone: "+91 99999 90001",
      email: "rohit.portal@example.com",
      created_at: 0,
      updated_at: 0
    });

    mockD1.tables.visa_products.push({
      id: 'p-dubai-30',
      country: 'Dubai 🇦🇪',
      visa_type: 'UAE 30 Days Single Entry (Without Insurance)',
      entry_type: 'Single Entry',
      processing_time: '3-4 Days',
      fee_paise: 720000,
      required_docs_json: '["Passport scan", "Photo", "Return ticket"]',
      status: 'active',
      created_at: 0,
      updated_at: 0
    });

    mockD1.tables.engagements.push({
      id: "eng-visa-9001",
      client_id: "OP-2026-9001",
      division: "visa",
      title: "Dubai Visa Processing",
      stage_key: "qualified",
      outstanding_balance: 0,
      status: "active",
      created_at: 0,
      updated_at: 0
    });
  });

  it('GET /api/public/portal/visa/products returns active products with parsed requiredDocs', async () => {
    const res = await app.request('/api/public/portal/visa/products', {}, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);
    expect(data.products.length).toBe(1);
    expect(data.products[0].visaType).toBe('UAE 30 Days Single Entry (Without Insurance)');
    expect(Array.isArray(data.products[0].requiredDocs)).toBe(true);
    expect(data.products[0].requiredDocs).toContain('Passport scan');
  });

  it('POST /api/public/portal/visa/applications creates a draft and is idempotent per product', async () => {
    const body = { token: 'OP-2026-9001', country: 'Dubai 🇦🇪', visaProductId: 'p-dubai-30' };
    const res = await app.request('/api/public/portal/visa/applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);
    expect(data.id).toBeDefined();
    appId = data.id;
    expect(mockD1.tables.visa_applications.length).toBe(1);
    expect(mockD1.tables.visa_applications[0].status).toBe('draft');
    expect(mockD1.tables.visa_applications[0].visa_type).toBe('UAE 30 Days Single Entry (Without Insurance)');

    // Idempotent: second create returns the same draft, no new row
    const res2 = await app.request('/api/public/portal/visa/applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    const data2 = await res2.json() as any;
    expect(res2.status).toBe(200);
    expect(data2.id).toBe(appId);
    expect(mockD1.tables.visa_applications.length).toBe(1);
  });

  it('PUT merges partial form sections; GET returns merged formJson + matched docs', async () => {
    const res = await app.request(`/api/public/portal/visa/applications/${appId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'OP-2026-9001', formJson: { applicant: FULL_FORM.applicant } })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    expect(res.status).toBe(200);

    const res2 = await app.request(`/api/public/portal/visa/applications/${appId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'OP-2026-9001', formJson: { contact: FULL_FORM.contact } })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    expect(res2.status).toBe(200);

    const list = await app.request('/api/public/portal/visa/applications?token=OP-2026-9001', {}, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    expect(list.status).toBe(200);
    const data = await list.json() as any;
    expect(data.applications.length).toBe(1);
    expect(data.applications[0].formJson.applicant.fullName).toBe('Rohit Sharma');
    expect(data.applications[0].formJson.contact.city).toBe('Hyderabad');
    expect(Array.isArray(data.applications[0].requiredDocs)).toBe(true);
    expect(data.applications[0].documents).toEqual([]);

    // PUT blocked once the application is no longer editable
    mockD1.tables.visa_applications[0].status = 'rejected';
    const blocked = await app.request(`/api/public/portal/visa/applications/${appId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'OP-2026-9001', formJson: { applicant: FULL_FORM.applicant } })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    expect(blocked.status).toBe(403);
    mockD1.tables.visa_applications[0].status = 'draft';
  });

  it('submit fails with a 400 listing missing sections while the form is incomplete', async () => {
    const res = await app.request(`/api/public/portal/visa/applications/${appId}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'OP-2026-9001', agreedToTerms: true })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });

    expect(res.status).toBe(400);
    const data = await res.json() as any;
    expect(data.missingSections).toEqual(['passport', 'employment', 'travel', 'financial', 'visaHistory']);
  });

  it('full form submit succeeds, sets submittedAt and creates the review task', async () => {
    for (const section of ['passport', 'employment', 'travel', 'financial', 'visaHistory']) {
      const res = await app.request(`/api/public/portal/visa/applications/${appId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: 'OP-2026-9001', formJson: { [section]: FULL_FORM[section as keyof typeof FULL_FORM] } })
      }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
      expect(res.status).toBe(200);
    }

    const res = await app.request(`/api/public/portal/visa/applications/${appId}/submit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'OP-2026-9001', agreedToTerms: true })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });

    expect(res.status).toBe(200);
    const row = mockD1.tables.visa_applications[0];
    expect(row.status).toBe('submitted');
    expect(row.submitted_at).toBeGreaterThan(0);
    expect(row.agreed_to_terms).toBeTruthy();

    const task = mockD1.tables.tasks.find((t) => t.title === 'Review visa application (Dubai 🇦🇪 UAE 30 Days Single Entry (Without Insurance))');
    expect(task).toBeDefined();
    expect(task.priority).toBe('high');
    expect(task.cos).toBe('expedite');
    expect(task.client_id).toBe('OP-2026-9001');
    expect(task.due_date).toBe(row.submitted_at + 24 * 3600);
  });

  it('staff interlock unchanged: grant without verified docs → 400 unverified_documents', async () => {
    const create = await app.request('/api/visa/applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'cookie': 'better-auth.session_token=token-counselor' },
      body: JSON.stringify({ clientId: 'OP-2026-9001', country: 'Dubai 🇦🇪', visaType: 'UAE 30 Days Single Entry (Without Insurance)' })
    }, { DB: mockD1 });
    const created = await create.json() as any;
    expect(created.success).toBe(true);
    const entryId = created.id;

    // slot_booked (allowed from document_prep) → grant blocked: docs missing/unverified
    const slot = await app.request(`/api/visa/applications/${entryId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'cookie': 'better-auth.session_token=token-counselor' },
      body: JSON.stringify({ status: 'slot_booked' })
    }, { DB: mockD1 });
    expect(slot.status).toBe(200);

    const grant = await app.request(`/api/visa/applications/${entryId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'cookie': 'better-auth.session_token=token-counselor' },
      body: JSON.stringify({ status: 'granted' })
    }, { DB: mockD1 });
    expect(grant.status).toBe(400);
    const grantData = await grant.json() as any;
    expect(grantData.code).toBe('unverified_documents');

    // No-state-jump rule: grant from document_prep is blocked even with overrideDocs
    const create2 = await app.request('/api/visa/applications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'cookie': 'better-auth.session_token=token-counselor' },
      body: JSON.stringify({ clientId: 'OP-2026-9001', country: 'Dubai 🇦🇪', visaType: 'UAE 30 Days Single Entry (Without Insurance)' })
    }, { DB: mockD1 });
    const created2 = await create2.json() as any;
    const jump = await app.request(`/api/visa/applications/${created2.id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'cookie': 'better-auth.session_token=token-counselor' },
      body: JSON.stringify({ status: 'granted', overrideDocs: true })
    }, { DB: mockD1 });
    expect(jump.status).toBe(400);
  });

  it('rejected requires rejectionReason; delivered stamps deliveredAt', async () => {
    // submitted in test #5, still in submitted state
    const noReason = await app.request(`/api/visa/applications/${appId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'cookie': 'better-auth.session_token=token-counselor' },
      body: JSON.stringify({ status: 'rejected' })
    }, { DB: mockD1 });
    expect(noReason.status).toBe(400);

    const reject = await app.request(`/api/visa/applications/${appId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'cookie': 'better-auth.session_token=token-counselor' },
      body: JSON.stringify({ status: 'rejected', rejectionReason: 'Incomplete bank statements' })
    }, { DB: mockD1 });
    expect(reject.status).toBe(200);
    let row = mockD1.tables.visa_applications.find((a) => a.id === appId);
    expect(row.status).toBe('rejected');
    expect(row.rejection_reason).toBe('Incomplete bank statements');
    expect(row.decision_at).toBeGreaterThan(0);

    const deliver = await app.request(`/api/visa/applications/${appId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'cookie': 'better-auth.session_token=token-counselor' },
      body: JSON.stringify({ status: 'delivered' })
    }, { DB: mockD1 });
    expect(deliver.status).toBe(200);
    row = mockD1.tables.visa_applications.find((a) => a.id === appId);
    expect(row.status).toBe('delivered');
    expect(row.delivered_at).toBeGreaterThan(0);

    // cancelled is only allowed from draft/submitted/document_prep
    const cancel = await app.request(`/api/visa/applications/${appId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json', 'cookie': 'better-auth.session_token=token-counselor' },
      body: JSON.stringify({ status: 'cancelled' })
    }, { DB: mockD1 });
    expect(cancel.status).toBe(400);
  });

  it('staff GET /applications supports q filter and exposes clientName/formJson/status fields', async () => {
    const res = await app.request('/api/visa/applications?q=rohit', {
      headers: { 'cookie': 'better-auth.session_token=token-counselor' }
    }, { DB: mockD1 });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);
    expect(data.applications.length).toBe(3);
    const appRow = data.applications.find((a: any) => a.id === appId);
    expect(appRow.clientName).toBe('Rohit Sharma');
    expect(appRow.clientToken).toBe('OP-2026-9001');
    expect(appRow.formJson).toBeDefined();
    expect(appRow.submittedAt).toBeGreaterThan(0);
    expect(appRow.rejectionReason).toBe('Incomplete bank statements');
    expect(appRow.deliveredAt).toBeGreaterThan(0);
    expect(appRow.clientId).toBe('OP-2026-9001');

    const statusFilter = await app.request('/api/visa/applications?status=delivered', {
      headers: { 'cookie': 'better-auth.session_token=token-counselor' }
    }, { DB: mockD1 });
    const statusData = await statusFilter.json() as any;
    expect(statusData.applications.every((a: any) => a.status === 'delivered')).toBe(true);
  });
});