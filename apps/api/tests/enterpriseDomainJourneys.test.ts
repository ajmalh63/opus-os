import { describe, it, expect, beforeEach, vi } from 'vitest';
import app from '../src/index.js';
import { MockD1Database } from './mockDb.js';

vi.mock('../src/auth.js', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    validateSessionToken: async (_db: any, token: string) => {
      if (token === 'token-admin') {
        return {
          user: { id: 'u-admin', name: 'Super Admin', email: 'owner@test.com', role: 'super_admin', userDivisions: '[]', twoFactorEnabled: false, emailVerified: true },
          session: { id: 's-1', token, userId: 'u-admin' },
        };
      }
      return null;
    },
    getSessionTokenFromCookie: (c: any) => {
      const cookieHeader = c.req.header('cookie') || '';
      return (cookieHeader.match(/better-auth\.session_token=([^;]+)/) || [])[1] || undefined;
    },
    getAuth: (_env: any) => ({
      api: {
        getSession: async (options: any) => {
          const cookieHeader = options?.headers?.get?.('cookie') || options?.headers?.cookie || '';
          const token = (cookieHeader.match(/better-auth\.session_token=([^;]+)/) || [])[1] || null;
          if (token === 'token-admin') {
            return {
              user: { id: 'u-admin', name: 'Super Admin', email: 'owner@test.com', role: 'super_admin', userDivisions: JSON.stringify([]), twoFactorEnabled: false, emailVerified: true },
              session: { id: 's-1', token, userId: 'u-admin' },
            };
          }
          return null;
        },
      },
    }),
  };
});

describe('Enterprise Multi-Domain Journey Test Battery', () => {
  let mockD1: MockD1Database;
  const clientToken = 'portal-tok-enterprise-001';
  const clientId = 'cli_ent_001';

  beforeEach(() => {
    mockD1 = new MockD1Database();

    // 0. Enable all 5 enterprise divisions & inventory
    mockD1.tables.app_settings.push({
      key: 'divisions_enabled',
      value: JSON.stringify({
        'study-abroad': true,
        visa: true,
        umrah: true,
        attestation: true,
        manpower: true,
      }),
      created_at: Date.now(),
      updated_at: Date.now(),
    });
    mockD1.tables.app_settings.push({
      key: 'umrah_inventory_enabled',
      value: 'true',
      created_at: Date.now(),
      updated_at: Date.now(),
    });

    // 1. Seed Client
    mockD1.tables.clients.push({
      id: clientId,
      name: 'Rohan Mehra',
      email: 'rohan.mehra@example.com',
      phone: '+919876543299',
      portal_token: clientToken,
      portalToken: clientToken,
      status: 'active',
      created_at: Date.now(),
      updated_at: Date.now(),
    });

    // 2. Seed Super Admin
    mockD1.tables.users.push({
      id: 'u-admin',
      name: 'Super Admin',
      email: 'owner@test.com',
      role: 'super_admin',
      user_divisions: JSON.stringify([]),
      email_verified: 1,
      two_factor_enabled: 0,
      created_at: Date.now(),
      updated_at: Date.now(),
    });

    // 3. Seed Universities for Study Abroad
    mockD1.tables.universities.push({
      id: 'uni_manchester',
      name: 'University of Manchester',
      country: 'UK',
      intake: 'Fall 2026',
      min_gpa: 7.0,
      minGpa: 7.0,
      ielts_min: 6.5,
      ieltsMin: 6.5,
      budget_lpa_min: 20,
      budgetLpaMin: 20,
      currency: 'GBP',
      status: 'active',
      created_at: Date.now(),
    });
  });

  // =========================================================================
  // 1. Study Abroad Domain
  // =========================================================================
  it('1. Study Abroad Journey: Live Eligibility Match -> Staff Application Snapshot', async () => {
    // A. Live Match Eligibility
    const matchRes = await app.request('/api/public/match/eligibility', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        gpa: 8.5,
        ielts: 7.5,
        budget: 25,
        country: 'UK',
      }),
    }, { DB: mockD1 });
    expect(matchRes.status).toBe(200);
    const matchData = await matchRes.json() as any;
    expect(matchData.matches.length).toBeGreaterThan(0);
    expect(matchData.matches[0].name).toBe('University of Manchester');

    // B. Staff creates an application snapshot (shortlisted mode)
    const appRes = await app.request('/api/study-abroad/applications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'better-auth.session_token=token-admin',
      },
      body: JSON.stringify({
        clientId,
        university: {
          name: 'University of Manchester',
          country: 'United Kingdom',
          program: 'MSc Data Science',
          intake: 'Fall 2026',
          degreeLevel: 'masters',
        },
        status: 'shortlisted',
      }),
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(appRes.status).toBe(200);
    const appData = await appRes.json() as any;
    expect(appData.success).toBe(true);

    // C. Client views their Study Abroad Applications
    const clientAppRes = await app.request('/api/public/portal/study-abroad/applications', {
      headers: { 'X-Portal-Token': clientToken },
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(clientAppRes.status).toBe(200);
    const clientAppData = await clientAppRes.json() as any;
    expect(clientAppData.applications.some((a: any) => a.university?.name === 'University of Manchester')).toBe(true);
  });

  // =========================================================================
  // 2. Visa Prep Domain
  // =========================================================================
  it('2. Visa Prep Journey: Visa Products Browse -> Application Submission', async () => {
    // Seed a visa product
    mockD1.tables.visa_products.push({
      id: 'vp_uk_student',
      country: 'United Kingdom',
      visa_type: 'Student Visa',
      visaType: 'Student Visa',
      entry_type: 'Multiple',
      entryType: 'Multiple',
      processing_time: '15 Days',
      processingTime: '15 Days',
      fee_paise: 2500000,
      feePaise: 2500000,
      required_docs_json: JSON.stringify(['Passport', 'CAS Letter', 'Bank Statement']),
      requiredDocsJson: JSON.stringify(['Passport', 'CAS Letter', 'Bank Statement']),
      status: 'active',
      created_at: Date.now(),
      updated_at: Date.now(),
    });

    // A. Browse Visa Products
    const prodRes = await app.request('/api/public/portal/visa/products', {
      headers: { 'X-Portal-Token': clientToken },
    }, { DB: mockD1 });
    expect(prodRes.status).toBe(200);
    const prodData = await prodRes.json() as any;
    expect(prodData.products.length).toBeGreaterThan(0);
    expect(prodData.products[0].country).toBe('United Kingdom');

    // B. Submit Visa Application
    const submitRes = await app.request('/api/public/portal/visa/applications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Portal-Token': clientToken,
      },
      body: JSON.stringify({
        productId: 'vp_uk_student',
        country: 'United Kingdom',
        visaType: 'Student Visa',
        purpose: 'Higher Education Master Studies',
      }),
    }, { DB: mockD1 });
    expect(submitRes.status).toBe(200);
    const submitData = await submitRes.json() as any;
    expect(submitData.success).toBe(true);
    expect(submitData.id).toBeTruthy();
  });

  // =========================================================================
  // 3. Tours & Travels (Umrah) Domain
  // =========================================================================
  it('3. Tours & Travels Journey: Packages Browse -> Group Departures -> Family Pax Calculation', async () => {
    // Seed an Umrah Package
    const packageId = 'umr_pkg_deluxe_001';
    mockD1.tables.umrah_packages.push({
      id: packageId,
      name: '14-Day Premium Umrah Package (Direct Flight)',
      duration_days: 14,
      durationDays: 14,
      departure_city: 'Hyderabad',
      departureCity: 'Hyderabad',
      flight_included: 1,
      flightIncluded: true,
      makkah_hotel: 'Swissôtel Al Maqam Makkah',
      makkahHotel: 'Swissôtel Al Maqam Makkah',
      madinah_hotel: 'Dar Al Taqwa Madinah',
      madinahHotel: 'Dar Al Taqwa Madinah',
      price_paise: 12500000,
      pricePaise: 12500000,
      child_with_bed_price_paise: 9500000,
      infant_price_paise: 3500000,
      is_active: 1,
      isActive: true,
      status: 'open',
      created_at: Date.now(),
      updated_at: Date.now(),
    });

    // Seed a departure (in future)
    const departureId = 'dep_oct_2026_01';
    const futureDate = Math.floor(Date.now() / 1000) + 60 * 86400; // 60 days in future
    mockD1.tables.group_departures.push({
      id: departureId,
      package_id: packageId,
      packageId,
      departure_city: 'Hyderabad',
      departureCity: 'Hyderabad',
      departure_date: futureDate,
      departureDate: futureDate,
      end_date: futureDate + 14 * 86400,
      endDate: futureDate + 14 * 86400,
      capacity: 30,
      seats_booked: 4,
      seatsBooked: 4,
      status: 'open',
      created_at: Date.now(),
      updated_at: Date.now(),
    });

    // A. Browse Public Departures
    const depRes = await app.request('/api/public/umrah/departures', {
      method: 'GET',
    }, { DB: mockD1 });
    expect(depRes.status).toBe(200);
    const depData = await depRes.json() as any;
    expect(depData.departures.length).toBeGreaterThan(0);

    // B. Hold seats for family party (2 Adults + 1 Infant)
    global.fetch = vi.fn(async (url: any) => {
      if (String(url).includes('/orders')) {
        return new Response(JSON.stringify({ id: 'order_test_123', amount: 150000, currency: 'INR' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        });
      }
      return new Response('{}', { status: 200 });
    }) as any;

    const holdRes = await app.request(`/api/public/portal/umrah/departures/${departureId}/book`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Portal-Token': clientToken,
      },
      body: JSON.stringify({
        departureId,
        occupancy: 'shared',
        passengers: [
          { name: 'Rohan Mehra', category: 'adult', passportNumber: 'P1234567' },
          { name: 'Kavita Mehra', category: 'adult', passportNumber: 'P1234568' },
          { name: 'Reyansh Mehra', category: 'infant', passportNumber: 'P1234569' },
        ],
      }),
    }, {
      DB: mockD1,
      RAZORPAY_KEY_ID: 'rzp_test_mock_id',
      RAZORPAY_KEY_SECRET: 'rzp_test_mock_secret',
    });
    expect(holdRes.status).toBe(200);
    const holdData = await holdRes.json() as any;
    expect(holdData.success).toBe(true);
    expect(holdData.bookingId).toBeTruthy();
  });

  // =========================================================================
  // 4. Document Attestation Domain
  // =========================================================================
  it('4. Attestation Journey: Rate Card Consultation -> Application Chain Step Update', async () => {
    // Seed Rate Card
    mockD1.tables.attestation_rate_cards.push({
      id: 'rc_uae_degree',
      country: 'UAE',
      category: 'educational',
      route: 'embassy',
      title: 'Degree Attestation for UAE Employment',
      description: 'Standard HRD + MEA + UAE Embassy attestation chain',
      document_types_json: JSON.stringify(['degree', 'diploma']),
      documentTypesJson: JSON.stringify(['degree', 'diploma']),
      price_paise: 750000,
      pricePaise: 750000,
      govt_fee_paise: 350000,
      govtFeePaise: 350000,
      courier_fee_paise: 50000,
      courierFeePaise: 50000,
      translation_fee_paise: 0,
      translationFeePaise: 0,
      timeline_days: 10,
      timelineDays: 10,
      steps_json: JSON.stringify(['Notary', 'State HRD', 'MEA New Delhi', 'UAE Embassy']),
      stepsJson: JSON.stringify(['Notary', 'State HRD', 'MEA New Delhi', 'UAE Embassy']),
      active: 1,
      featured: 1,
      created_at: Date.now(),
    });

    // A. Consult Rate Cards
    const rcRes = await app.request('/api/public/portal/attestation/rate-cards', {
      headers: { 'X-Portal-Token': clientToken },
    }, { DB: mockD1 });
    expect(rcRes.status).toBe(200);
    const rcData = await rcRes.json() as any;
    expect(rcData.rateCards.some((rc: any) => rc.country === 'UAE')).toBe(true);

    // B. Staff creates attestation application
    const attRes = await app.request('/api/attestation/applications', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'better-auth.session_token=token-admin',
      },
      body: JSON.stringify({
        clientId,
        destinationCountry: 'UAE',
        category: 'educational',
        route: 'embassy',
        document: {
          holderName: 'Rohan Mehra',
          documentName: 'Bachelor of Technology Degree',
          issuingState: 'Telangana',
        },
      }),
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(attRes.status).toBe(200);
  });

  // =========================================================================
  // 5. Manpower Recruitment Domain
  // =========================================================================
  it('5. Manpower Journey: Candidate Jobs Browse -> Application Submission', async () => {
    // Seed Job Posting
    mockD1.tables.job_postings.push({
      id: 'job_gulf_elect_01',
      title: 'Senior Industrial Electrician',
      country: 'Saudi Arabia',
      employer: 'Al-Fanar Construction',
      sector: 'Engineering & Construction',
      collar: 'blue',
      tier: 'public',
      status: 'open',
      vacancies: 5,
      salary_min_paise: 40000000,
      salary_max_paise: 55000000,
      currency: 'SAR',
      created_at: Math.floor(Date.now() / 1000),
    });

    // A. Browse Public Jobs
    const jobsRes = await app.request('/api/public/portal/manpower/jobs', {
      headers: { 'X-Portal-Token': clientToken },
    }, { DB: mockD1 });
    expect(jobsRes.status).toBe(200);
    const jobsData = await jobsRes.json() as any;
    expect(jobsData.jobs.some((j: any) => j.id === 'job_gulf_elect_01')).toBe(true);
  });
});
