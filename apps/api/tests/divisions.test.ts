import { describe, it, expect, beforeEach, vi } from 'vitest';
import app from '../src/index.js';
import { MockD1Database } from './mockDb.js';
import { getDb } from '../src/db/client.js';
import {
  getDivisionsEnabled,
  isDivisionEnabled,
  seedDivisionsEnabled,
  DIVISION_KEYS,
} from '../src/lib/divisions.js';

vi.mock('../src/auth.js', () => {
  return {
    getAuth: (env: any) => {
      return {
        api: {
          getSession: async (options: any) => {
            const cookieHeader = options?.headers?.get('cookie') || '';
            const match = cookieHeader.match(/better-auth\.session_token=([^;]+)/);
            const token = match ? match[1] : null;

            if (token === 'token-admin') {
              return {
                user: {
                  id: 'admin-1',
                  name: 'Admin User',
                  email: 'admin@test.com',
                  role: 'super_admin',
                  userDivisions: JSON.stringify(['study-abroad', 'visa', 'umrah', 'attestation', 'manpower']),
                },
                session: { id: 'session-admin', token, userId: 'admin-1' },
              };
            }
            if (token === 'token-counselor') {
              return {
                user: {
                  id: 'counselor-1',
                  name: 'Counselor One',
                  email: 'counselor@test.com',
                  role: 'counselor',
                  userDivisions: JSON.stringify(['study-abroad']),
                },
                session: { id: 'session-counselor', token, userId: 'counselor-1' },
              };
            }
            return null;
          },
        },
      };
    },
  };
});

describe('Division availability gating (Phase A)', () => {
  let mockD1: MockD1Database;

  const env = () => ({
    DB: mockD1,
    BETTER_AUTH_SECRET: 'test-secret',
    TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA',
    ENVIRONMENT: 'development',
  });

  const adminGet = () =>
    app.request('/api/admin/divisions', { headers: { Cookie: 'better-auth.session_token=token-admin' } }, env());

  const adminPost = (enabled: Record<string, boolean>) =>
    app.request(
      '/api/admin/divisions',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Cookie: 'better-auth.session_token=token-admin' },
        body: JSON.stringify({ enabled }),
      },
      env()
    );

  beforeEach(() => {
    mockD1 = new MockD1Database();
    mockD1.tables.users.push({
      id: 'admin-1', name: 'Admin User', email: 'admin@test.com', email_verified: 1,
      role: 'super_admin',
      user_divisions: JSON.stringify(['study-abroad', 'visa', 'umrah', 'attestation', 'manpower']),
      created_at: 1, updated_at: 1,
    });
    mockD1.tables.users.push({
      id: 'counselor-1', name: 'Counselor One', email: 'counselor@test.com', email_verified: 1,
      role: 'counselor',
      user_divisions: JSON.stringify(['study-abroad']),
      created_at: 1, updated_at: 1,
    });
    mockD1.tables.users.push({
      id: 'c-coun-1', name: 'Lead Counselor', email: 'lc@t.com', emailVerified: 1, image: null,
      passwordHash: 'x', twoFactorEnabled: 0,
      userDivisions: JSON.stringify(['study-abroad']), role: 'counselor', created_at: 1, updated_at: 1,
    });
  });

  describe('lib defaults', () => {
    it('returns owner defaults when no app_settings row exists', async () => {
      const map = await getDivisionsEnabled(env() as any);
      expect(map['study-abroad']).toBe(true);
      expect(map.visa).toBe(false);
      expect(map.umrah).toBe(false);
      expect(map.attestation).toBe(false);
      expect(map.manpower).toBe(false);
    });

    it('isDivisionEnabled follows the defaults', async () => {
      expect(await isDivisionEnabled(env() as any, 'study-abroad')).toBe(true);
      expect(await isDivisionEnabled(env() as any, 'visa')).toBe(false);
    });

    it('merges stored JSON over defaults (missing keys inherit default)', async () => {
      mockD1.tables.app_settings.push({
        key: 'divisions_enabled', value: JSON.stringify({ visa: true }), updated_at: 1000,
      });
      const map = await getDivisionsEnabled(env() as any);
      expect(map.visa).toBe(true);
      expect(map['study-abroad']).toBe(true);
      expect(map.manpower).toBe(false);
    });

    it('seedDivisionsEnabled is idempotent (call twice → single row)', async () => {
      const db = getDb(mockD1 as any);
      await seedDivisionsEnabled(db);
      await seedDivisionsEnabled(db);
      expect(mockD1.tables.app_settings.length).toBe(1);
      expect(mockD1.tables.app_settings[0].key).toBe('divisions_enabled');
      expect(JSON.parse(mockD1.tables.app_settings[0].value).visa).toBe(false);
    });
  });

  describe('GET /api/public/divisions', () => {
    it('returns { enabled, list } with the default map, no auth', async () => {
      const res = await app.request('/api/public/divisions', {}, env());
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.enabled['study-abroad']).toBe(true);
      expect(data.enabled.visa).toBe(false);
      expect(data.list).toEqual([...DIVISION_KEYS]);
    });
  });

  describe('admin divisions endpoints', () => {
    it('GET /api/admin/divisions → 401 without session', async () => {
      const res = await app.request('/api/admin/divisions', {}, env());
      expect(res.status).toBe(401);
    });

    it('GET /api/admin/divisions → 403 for counselor', async () => {
      const res = await app.request(
        '/api/admin/divisions',
        { headers: { Cookie: 'better-auth.session_token=token-counselor' } },
        env()
      );
      expect(res.status).toBe(403);
    });

    it('GET /api/admin/divisions → 200 for owner with enabled/list/updatedAt', async () => {
      mockD1.tables.app_settings.push({
        key: 'divisions_enabled',
        value: JSON.stringify({ 'study-abroad': true, visa: false, umrah: false, attestation: false, manpower: false }),
        updated_at: 1234,
      });
      const res = await adminGet();
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.enabled['study-abroad']).toBe(true);
      expect(data.enabled.visa).toBe(false);
      expect(data.list).toEqual([...DIVISION_KEYS]);
      expect(data.updatedAt).toBe(1234);
    });

    it('owner toggles visa true → 200, app_settings row updated, DIVISION_TOGGLED audited', async () => {
      const res = await adminPost({ 'study-abroad': true, visa: true, umrah: false, attestation: false, manpower: false });
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.enabled.visa).toBe(true);

      const row = mockD1.tables.app_settings.find((r: any) => r.key === 'divisions_enabled');
      expect(row).toBeTruthy();
      expect(JSON.parse(row.value).visa).toBe(true);

      const audit = mockD1.tables.audit_log.find((r: any) => r.action === 'DIVISION_TOGGLED');
      expect(audit).toBeTruthy();
      expect(audit.entity_name).toBe('app_settings');
      expect(audit.entity_id).toBe('divisions_enabled');
      expect(audit.category).toBe('config');
      const before = JSON.parse(audit.before_state);
      const after = JSON.parse(audit.after_state);
      expect(before.visa).toBe(false);
      expect(after.visa).toBe(true);
    });

    it('rejects unknown division keys with 400 and writes nothing', async () => {
      const res = await adminPost({ nope: true });
      expect(res.status).toBe(400);
      expect(mockD1.tables.app_settings.length).toBe(0);
    });

    it('POST /api/admin/divisions → 403 for counselor', async () => {
      const res = await app.request(
        '/api/admin/divisions',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Cookie: 'better-auth.session_token=token-counselor' },
          body: JSON.stringify({ enabled: { visa: true } }),
        },
        env()
      );
      expect(res.status).toBe(403);
    });
  });

  describe('leads enforcement', () => {
    const leadBody = (division: string) => ({
      name: 'Test Lead',
      phone: '+91 98765 43210',
      email: 'test@example.com',
      highestQualification: 'undergrad',
      division,
      consents: { coreProcessing: true, whatsappUpdates: true, marketingCampaigns: true },
      dynamicContext: { targetCountry: 'US', intakeSeason: 'Fall 2027' },
    });

    const submitLead = (division: string) =>
      app.request(
        '/api/public/leads',
        { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(leadBody(division)) },
        env()
      );

    it('409 DIVISION_DISABLED for disabled division and no client row created', async () => {
      const res = await submitLead('visa');
      expect(res.status).toBe(409);
      const data = (await res.json()) as any;
      expect(data.code).toBe('DIVISION_DISABLED');
      expect(data.error).toBe('This service is not accepting leads yet');
      expect(mockD1.tables.clients.length).toBe(0);
    });

    it('200 for enabled study-abroad division', async () => {
      const res = await submitLead('study-abroad');
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.success).toBe(true);
      expect(mockD1.tables.clients.length).toBe(1);
    });
  });

  describe('catalog filtering', () => {
    beforeEach(() => {
      mockD1.tables.universities.push({
        id: 'u1', name: 'University of Toronto', country: 'Canada',
        min_gpa: 7, ielts_min: 6.5, budget_lpa_min: 20, intake: 'Fall 2027', created_at: 1,
      });
      mockD1.tables.visa_products.push({
        id: 'vp1', country: 'Dubai', visa_type: 'UAE 30 Days Single Entry', entry_type: 'Single Entry',
        processing_time: '3-4 Days', fee_paise: 720000, status: 'active', created_at: 1, updated_at: 1,
      });
      mockD1.tables.job_postings.push({
        id: 'job-1', title: 'Staff Nurse', country: 'UAE', sector: 'healthcare',
        salary_text: '₹18-25 LPA', collar: 'white_collar', tier: 'public', status: 'open', created_at: 1,
      });
      mockD1.tables.group_departures.push({
        id: 'dep-1', package_tier: 'standard', departure_date: 1767225600,
        capacity: 30, booked_seats: 5, price: 4500000, booking_fee: 50000, status: 'open', created_at: 1,
      });
    });

    it('only study-abroad/university items when other divisions disabled', async () => {
      const res = await app.request('/api/public/catalog', {}, env());
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.items.map((i: any) => i.type).sort()).toEqual(['university']);
    });

    it('disabled inventory appears after owner enables divisions', async () => {
      const res = await adminPost({ 'study-abroad': true, visa: true, umrah: true, attestation: false, manpower: true });
      expect(res.status).toBe(200);
      const catalog = await app.request('/api/public/catalog', {}, env());
      const data = (await catalog.json()) as any;
      const types = data.items.map((i: any) => i.type).sort();
      expect(types).toEqual(['departure', 'job', 'university', 'visa']);
    });
  });

  describe('artifact gating', () => {
    beforeEach(() => {
      mockD1.tables.job_postings.push({
        id: 'job-1', title: 'Staff Nurse', country: 'UAE', sector: 'healthcare',
        salary_text: '₹18-25 LPA', collar: 'white_collar', tier: 'public', status: 'open', created_at: 1,
      });
    });

    it('GET /api/public/jobs returns empty jobs array when manpower disabled', async () => {
      const res = await app.request('/api/public/jobs', {}, env());
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.jobs).toEqual([]);
    });

    it('GET /api/public/jobs returns jobs when manpower enabled', async () => {
      await adminPost({ 'study-abroad': true, visa: true, umrah: true, attestation: true, manpower: true });
      const res = await app.request('/api/public/jobs', {}, env());
      expect(res.status).toBe(200);
      const data = (await res.json()) as any;
      expect(data.jobs.length).toBe(1);
    });

    it('GET /api/public/match/eligibility → 404 DIVISION_DISABLED when study-abroad disabled', async () => {
      await adminPost({ 'study-abroad': false, visa: false, umrah: false, attestation: false, manpower: false });
      const res = await app.request(
        '/api/public/match/eligibility',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.77' },
          body: JSON.stringify({ gpa: 7.5, ielts: 6.5, budget: 22, country: 'Canada' }),
        },
        env()
      );
      expect(res.status).toBe(404);
      const data = (await res.json()) as any;
      expect(data.code).toBe('DIVISION_DISABLED');
    });
  });
});
