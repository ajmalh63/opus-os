import { describe, it, expect, beforeEach, vi } from 'vitest';
import app from '../src/index.js';
import { MockD1Database } from './mockDb.js';

vi.mock('../src/auth.js', () => ({
  getAuth: () => ({
    api: {
      getSession: async (options: any) => {
        const cookie = options?.headers?.get('cookie') || '';
        const token = (cookie.match(/better-auth\.session_token=([^;]+)/) || [])[1] || null;
        if (token === 'token-admin') {
          return { user: { id: 'admin-1', email: 'a@t.com', role: 'super_admin', userDivisions: '[]' }, session: { id: 's', token, userId: 'admin-1' } };
        }
        return null;
      },
    },
  }),
}));

// Kill-switch semantics: disabled division → NEW intake blocked + catalogs
// hidden, but EXISTING journeys (trackers, payment completion) keep working.
describe('Division gating — client portal intake + partner /go redirects', () => {
  let mockD1: MockD1Database;
  const ENV = () => ({ DB: mockD1, BETTER_AUTH_SECRET: 'x' });

  beforeEach(() => {
    mockD1 = new MockD1Database();
    // Default state: only study-abroad enabled (owner's business state).
    mockD1.tables.app_settings.push({
      key: 'divisions_enabled',
      value: JSON.stringify({ 'study-abroad': true, visa: false, umrah: false, attestation: false, manpower: false }),
      updated_at: 1,
    });
  });

  // ---- Visa portal ----
  it('visa OFF: catalog empty, create blocked 409, existing tracker still works', async () => {
    const products = await app.request('/api/public/portal/visa/products', {}, ENV());
    expect(products.status).toBe(200);
    expect(((await products.json()) as any).products ?? []).toHaveLength(0);

    const create = await app.request('/api/public/portal/visa/applications', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
    }, ENV());
    expect(create.status).toBe(409);
    expect(((await create.json()) as any).code).toBe('DIVISION_DISABLED');

    // Tracker for an existing application is NOT gated (existing journeys preserved)
    mockD1.tables.clients.push({ id: 'OP-1', portal_token: 'OP-1', name: 'Client', phone: '+91 90000 00000', email: 'c@x.io', created_at: 1, updated_at: 1 } as any);
    mockD1.tables.visa_applications.push({ id: 'va-1', client_id: 'OP-1', country: 'US', visa_type: 'F1', status: 'submitted', created_at: 1, updated_at: 1 } as any);
    const tracker = await app.request('/api/public/portal/visa/applications?token=OP-1', {}, ENV());
    expect(tracker.status).toBe(200);
  });

  // ---- Manpower portal ----
  it('manpower OFF: jobs empty, apply blocked 409, applications tracker works', async () => {
    const jobs = await app.request('/api/public/portal/manpower/jobs', {}, ENV());
    expect(jobs.status).toBe(200);
    expect(((await jobs.json()) as any).jobs ?? []).toHaveLength(0);

    const apply = await app.request('/api/public/portal/manpower/applications', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
    }, ENV());
    expect(apply.status).toBe(409);
    expect(((await apply.json()) as any).code).toBe('DIVISION_DISABLED');

    mockD1.tables.manpower_deployments.push({ id: 'md-1', client_id: 'OP-1', job_id: 'j-1', selection_status: 'applied', medical_status: 'pending', visa_status: 'pending', flight_status: 'pending', updated_at: 1 } as any);
    const tracker = await app.request('/api/public/portal/manpower/applications?token=OP-1', {}, ENV());
    expect(tracker.status).toBe(200);
  });

  // ---- Umrah portal ----
  it('umrah OFF: packages empty, booking blocked 409, payment completion NOT gated', async () => {
    const pkgs = await app.request('/api/public/portal/umrah/packages', {}, ENV());
    expect(pkgs.status).toBe(200);
    expect(((await pkgs.json()) as any).packages ?? []).toHaveLength(0);

    const book = await app.request('/api/public/portal/umrah/departures/d-1/book', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
    }, ENV());
    expect(book.status).toBe(409);
    expect(((await book.json()) as any).code).toBe('DIVISION_DISABLED');

    // verify-advance completes an EXISTING booking — must NOT be gated.
    // (No Razorpay secret → 503; bad signature → 403. Either proves it passed the gate.)
    const verify = await app.request('/api/public/portal/umrah/bookings/b-1/verify-advance', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ bookingId: 'b-1', razorpay_order_id: 'o', razorpay_payment_id: 'p', razorpay_signature: 'x' }),
    }, { DB: mockD1, RAZORPAY_KEY_SECRET: 'sec' });
    expect(verify.status).not.toBe(409);
  });

  // ---- Attestation portal ----
  it('attestation OFF: rate cards empty, create blocked 409, pickup NOT gated', async () => {
    const cards = await app.request('/api/public/portal/attestation/rate-cards', {}, ENV());
    expect(cards.status).toBe(200);
    expect(((await cards.json()) as any).rateCards ?? []).toHaveLength(0);

    const create = await app.request('/api/public/portal/attestation/applications', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
    }, ENV());
    expect(create.status).toBe(409);
    expect(((await create.json()) as any).code).toBe('DIVISION_DISABLED');

    mockD1.tables.attestation_applications.push({ id: 'aa-1', client_id: 'OP-1', document_type: 'degree', destination_country: 'UAE', current_step: 'hrd', status: 'pending', stage: 'quote_requested', document_status: 'missing', payment_status: 'unpaid', paid_amount_paise: 0, urgency: 'normal', created_at: 1, updated_at: 1 } as any);
    const pickup = await app.request('/api/public/portal/attestation/applications/aa-1/pickup', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({}),
    }, ENV());
    expect(pickup.status).not.toBe(409);
  });

  // ---- /go partner redirects ----
  it('/go to a disabled division: click counted, redirect lands on the coming-soon page', async () => {
    const now = Math.floor(Date.now() / 1000);
    mockD1.tables.partners.push({ id: 'p-1', name: 'Agency', panNumber: '******1234F', bank_account: '1', ifsc_code: 'SBIN0000001', status: 'active', referral_code: 'OPUS-X', api_token: 't', created_at: now });
    mockD1.tables.partner_links.push({ id: 'pl-1', partner_id: 'p-1', catalog_type: 'visa', catalog_item_id: 'v-1', title: 'US Visa', price_paise: 0, clicks: 0, created_at: now, last_clicked_at: null });

    const res = await app.request('/go/OPUS-X/visa/v-1', {}, ENV());
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('/visa-services'); // coming-soon page
    const link = (mockD1.tables.partner_links as any[])[0];
    expect(link.clicks).toBe(1); // click still tracked
  });

  it('/go to an enabled division: normal redirect', async () => {
    const now = Math.floor(Date.now() / 1000);
    mockD1.tables.partners.push({ id: 'p-2', name: 'Agency', panNumber: '******1234F', bank_account: '1', ifsc_code: 'SBIN0000001', status: 'active', referral_code: 'OPUS-Y', api_token: 't', created_at: now });
    mockD1.tables.partner_links.push({ id: 'pl-2', partner_id: 'p-2', catalog_type: 'university', catalog_item_id: 'u-1', title: 'Melbourne', price_paise: 0, clicks: 0, created_at: now, last_clicked_at: null });

    const res = await app.request('/go/OPUS-Y/university/u-1', {}, ENV());
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toContain('/study-abroad');
  });
});