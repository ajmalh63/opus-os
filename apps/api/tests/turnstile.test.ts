import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import app from '../src/index.js';
import { MockD1Database } from './mockDb.js';

describe('Turnstile bot protection (public write surfaces)', () => {
  let mockD1: MockD1Database;

  beforeAll(() => {
    mockD1 = new MockD1Database();
  });

  afterEach(() => vi.unstubAllGlobals());

  const leadBody = () => JSON.stringify({
    name: 'Test Lead', 
    phone: `+91 98765 ${43000 + Math.floor(Math.random() * 9000)}`, 
    email: `test${Math.floor(Math.random() * 99999)}@example.com`,
    highestQualification: 'undergrad', 
    division: 'study-abroad',
    consents: { coreProcessing: true, whatsappUpdates: true, marketingCampaigns: true },
    dynamicContext: { targetCountry: 'US', intakeSeason: 'Fall 2027' },
  });

  it('dev mock key (1x) allows public leads without a token', async () => {
    const res = await app.request('/api/public/leads', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: leadBody(),
    }, { DB: mockD1, TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA', ENVIRONMENT: 'development' });
    expect(res.status).toBe(200);
  });

  it('mock fail key (2x) blocks the request with 403', async () => {
    const res = await app.request('/api/public/leads', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: leadBody(),
    }, { DB: mockD1, TURNSTILE_SECRET_KEY: '2x00000000000000000000AB', ENVIRONMENT: 'development' });
    expect(res.status).toBe(403);
    const j = await res.json() as any;
    expect(j.error.code).toBe('BOT_BLOCKED');
  });

  it('real secret without token -> 403', async () => {
    const res = await app.request('/api/public/leads', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: leadBody(),
    }, { DB: mockD1, TURNSTILE_SECRET_KEY: '0x4AA0000000000000000000000000000', ENVIRONMENT: 'production' });
    expect(res.status).toBe(403);
  });

  it('real secret + valid siteverify token -> passes (siteverify mocked)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })));
    const res = await app.request('/api/public/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'cf-turnstile-response': 'tok-abc' },
      body: leadBody(),
    }, { DB: mockD1, TURNSTILE_SECRET_KEY: '0x4AA0000000000000000000000000000', ENVIRONMENT: 'production' });
    expect(res.status).toBe(200);
  });

  it('real secret + failed siteverify -> 403', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ success: false, 'error-codes': ['invalid-input-response'] }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })));
    const res = await app.request('/api/public/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'cf-turnstile-response': 'tok-bad' },
      body: leadBody(),
    }, { DB: mockD1, TURNSTILE_SECRET_KEY: '0x4AA0000000000000000000000000000', ENVIRONMENT: 'production' });
    expect(res.status).toBe(403);
  });

  it('partner signup is also Turnstile-guarded', async () => {
    const res = await app.request('/api/public/partners', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'P', panNumber: 'ABCDE1234F', bankAccount: '111', ifscCode: 'SBIN0000001' }),
    }, { DB: mockD1, TURNSTILE_SECRET_KEY: '2x00000000000000000000AB', ENVIRONMENT: 'development' });
    expect(res.status).toBe(403);
  });
});
