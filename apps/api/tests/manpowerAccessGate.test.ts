import { describe, it, expect, vi, beforeEach } from 'vitest';
import { portalManpowerRouter, seedMembershipPlans } from '../src/routes/portalManpower.js';
import { MockD1Database } from './mockDb.js';
import { drizzle } from 'drizzle-orm/d1';
import * as schema from '../src/db/schema.js';

describe('Manpower Candidate Verification Gate (₹100 Pass)', () => {
  let mockD1: MockD1Database;
  const mockEnv: any = {
    DB: undefined,
    BETTER_AUTH_SECRET: 'test_auth_secret_key_123',
    RAZORPAY_KEY_ID: 'rzp_test_12345',
    RAZORPAY_KEY_SECRET: 'rzp_secret_67890',
  };

  beforeEach(() => {
    mockD1 = new MockD1Database();
    mockEnv.DB = mockD1;
    vi.stubGlobal('fetch', vi.fn());
  });

  it('seeds the canonical ₹100 (10000 paise) Lifetime Candidate Pass plan', async () => {
    const db = drizzle(mockD1 as any, { schema });
    await seedMembershipPlans(db);
    const pass = mockD1.tables.membership_plans?.find((p: any) => p.key === 'candidate-pass');
    expect(pass).toBeTruthy();
    expect(pass.name).toBe('Candidate Verification Pass');
    expect(pass.price_paise).toBe(10000); // Integer ₹100
    expect(pass.duration_days).toBe(36500); // Lifetime
    expect(pass.tier).toBe('verified_candidate');
  });

  it('blocks unverified candidates from generating R2 resume upload tickets', async () => {
    // Setup unverified client
    mockD1.tables.clients.push({
      id: 'client-unverified-1',
      name: 'John Doe',
      portal_token: 'client-unverified-1',
      exclusive_member: false,
      exclusive_expires_at: null,
      created_at: 0,
      updated_at: 0,
    });

    const req = new Request('http://localhost/resume/presigned?filename=resume.pdf', {
      method: 'POST',
      headers: {
        'x-portal-token': 'client-unverified-1',
      },
    });

    const res = await portalManpowerRouter.fetch(req, mockEnv);
    const json: any = await res.json();

    expect(res.status).toBe(403);
    expect(json.code).toBe('CANDIDATE_PASS_REQUIRED');
    expect(json.error).toContain('Candidate Verification Pass');
  });

  it('allows verified candidates with pass to generate R2 resume upload tickets', async () => {
    const now = Math.floor(Date.now() / 1000);
    // Setup verified client
    mockD1.tables.clients.push({
      id: 'client-verified-1',
      name: 'Jane Doe',
      portal_token: 'client-verified-1',
      exclusive_member: true,
      exclusive_expires_at: now + 36500 * 86400,
      created_at: 0,
      updated_at: 0,
    });

    const req = new Request('http://localhost/resume/presigned?filename=my_cv.pdf', {
      method: 'POST',
      headers: {
        'x-portal-token': 'client-verified-1',
      },
    });

    const res = await portalManpowerRouter.fetch(req, mockEnv);
    const json: any = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.url).toContain('/api/public/portal/manpower/resume/upload');
    expect(json.filename).toBe('my_cv.pdf');
  });
});
