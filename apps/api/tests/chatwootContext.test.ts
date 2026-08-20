import { describe, it, expect, beforeEach, vi } from 'vitest';
import app from '../src/index.js';
import { MockD1Database } from './mockDb.js';

vi.mock('../src/auth.js', () => ({
  getAuth: () => ({
    api: {
      getSession: async () => null,
    },
  }),
}));

describe('Chatwoot Live CRM Context Router', () => {
  let mockD1: MockD1Database;
  const ENV = () => ({
    DB: mockD1,
    BETTER_AUTH_SECRET: 'test-secret',
  });

  beforeEach(() => {
    mockD1 = new MockD1Database();
  });

  it('returns found: false when contact email/phone is not in CRM', async () => {
    const res = await app.request('/api/public/chatwoot/context?email=nonexistent@example.com', {}, ENV());
    expect(res.status).toBe(200);
    const json = (await res.json()) as any;
    expect(json.found).toBe(false);
    expect(json.bookingLinks).toBeDefined();
    expect(json.bookingLinks['study-abroad']).toContain('cal.com');
  });

  it('allows 1-click lead creation from Chatwoot sidebar and immediately locates contact', async () => {
    const createRes = await app.request(
      '/api/public/chatwoot/quick-lead',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: 'Amina Khatun',
          email: 'amina.khatun@example.com',
          phone: '+919876543210',
          division: 'study-abroad',
        }),
      },
      ENV(),
    );

    expect(createRes.status).toBe(200);
    const createJson = (await createRes.json()) as any;
    expect(createJson.success).toBe(true);
    expect(createJson.clientId).toBeDefined();
    expect(createJson.portalUrl).toContain('portal?token=');

    // Query context again
    const fetchRes = await app.request('/api/public/chatwoot/context?email=amina.khatun@example.com', {}, ENV());
    expect(fetchRes.status).toBe(200);
    const fetchJson = (await fetchRes.json()) as any;
    expect(fetchJson.found).toBe(true);
    expect(fetchJson.client.name).toBe('Amina Khatun');
    expect(fetchJson.client.primaryDivision).toBe('study-abroad');
    expect(fetchJson.engagements.length).toBeGreaterThan(0);
    expect(fetchJson.bookingLinks['study-abroad']).toContain('email=amina.khatun%40example.com');
  });
});
