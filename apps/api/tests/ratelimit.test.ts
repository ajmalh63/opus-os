import { describe, it, expect, beforeAll, vi } from 'vitest';
import app from '../src/index.js';
import { MockD1Database } from './mockDb.js';

vi.mock('../src/auth.js', () => {
  return {
    getAuth: (env: any) => {
      return {
        api: {
          getSession: async () => null
        }
      };
    }
  };
});

const validLead = {
  name: "Priya Reddy",
  phone: "+91 99999 88888",
  email: "priya.reddy@example.com",
  highestQualification: "undergrad",
  division: "study-abroad",
  consents: {
    coreProcessing: true,
    whatsappUpdates: true,
    marketingCampaigns: false
  }
};

describe('Rate limiting (Section 18.2.1 / 18.2.2)', () => {
  let mockD1: MockD1Database;

  beforeAll(() => {
    mockD1 = new MockD1Database();
  });

  it('lead form allows up to 5 submissions/hour then returns 429 with Retry-After', async () => {
    for (let i = 1; i <= 5; i++) {
      const res = await app.request('/api/public/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.7' },
        body: JSON.stringify({ ...validLead, phone: `+91 99999 ${88000 + i}` })
      }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
      expect(res.status).toBe(200);
    }

    const blocked = await app.request('/api/public/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.7' },
      body: JSON.stringify(validLead)
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });

    expect(blocked.status).toBe(429);
    expect(blocked.headers.get('Retry-After')).toBeTruthy();
    expect(blocked.headers.get('X-RateLimit-Limit')).toBe('5');
  });

  it('different IP buckets are independent', async () => {
    const res = await app.request('/api/public/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '198.51.100.42' },
      body: JSON.stringify({ ...validLead, phone: '+91 99999 77001' })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    expect(res.status).toBe(200);
  });

  it('public portal lookup is rate limited separately', async () => {
    const mk = (i: number) => app.request(`/api/public/portal/lookup?token=OP-${i}`, {}, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });

    let status = 0;
    for (let i = 1; i <= 3; i++) {
      status = (await mk(i)).status;
      expect(status).not.toBe(429);
    }
  });
});
