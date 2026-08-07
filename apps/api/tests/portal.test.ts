import { describe, it, expect, beforeAll, vi } from 'vitest';
import app from '../src/index.js';
import { MockD1Database } from './mockDb.js';

vi.mock('../src/auth.js', () => {
  return {
    getAuth: (env: any) => {
      return {
        api: {
          getSession: async (options: any) => {
            const cookieHeader = options?.headers?.get('cookie') || '';
            const match = cookieHeader.match(/better-auth\.session_token=([^;]+)/);
            const token = match ? match[1] : null;

            if (token === 'token-counselor') {
              return {
                user: {
                  id: "counselor-1",
                  name: "Counselor One",
                  email: "counselor@test.com",
                  role: "counselor",
                  userDivisions: JSON.stringify(["study-abroad"])
                },
                session: {
                  id: "session-counselor",
                  token,
                  userId: "counselor-1"
                }
              };
            }
            return null;
          }
        }
      };
    }
  };
});

describe('Public Client Portal & Partner Referral Tracking Integration Tests', () => {
  let mockD1: MockD1Database;

  beforeAll(() => {
    mockD1 = new MockD1Database();

    // Seed mock client, engagement, and consents for public lookup test
    mockD1.tables.clients.push({
      id: "OP-2026-5555",
      name: "Suresh Kumar",
      phone: "+91 99999 44444",
      email: "suresh@test.com",
      created_at: 0,
      updated_at: 0
    });

    mockD1.tables.engagements.push({
      id: "eng-suresh-1",
      client_id: "OP-2026-5555",
      division: "study-abroad",
      title: "German Masters Application",
      stage_key: "lead",
      outstanding_balance: 0,
      status: "active",
      created_at: 0,
      updated_at: 0
    });

    mockD1.tables.consents.push({
      id: "c-suresh",
      client_id: "OP-2026-5555",
      consent_type: "core-processing",
      status: "granted",
      ip_address: "127.0.0.1",
      sha256_hash: "sha-hash-1",
      granted_at: 0
    });
  });

  it('GET /api/public/portal/lookup should return public status details without session authentication', async () => {
    const res = await app.request('/api/public/portal/lookup?token=OP-2026-5555', {}, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);
    expect(data.client.name).toBe("Suresh Kumar");
    expect(data.engagements[0].title).toBe("German Masters Application");
    expect(data.consents[0].consentType).toBe("core-processing");
  });

  it('POST /api/public/partners should register partner with KYC and return masked PAN', async () => {
    const res = await app.request('/api/public/partners', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: "Hyderabad Consultants Agency",
        panNumber: "ABCDE1234F",
        bankAccount: "50100123456789",
        ifscCode: "HDFC0000001"
      })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);
    expect(data.partnerId).toBeDefined();
    expect(data.maskedPan).toBe("******234F");

    // Verify DB stores masked PAN (no plaintext PII at rest)
    const partner = mockD1.tables.partners.find(p => p.id === data.partnerId);
    expect(partner).toBeDefined();
    expect(partner.pan_number).not.toBe("ABCDE1234F");
    expect(partner.pan_number).toBe("******234F");
  });

  it('POST /api/partners/referrals should link client referral to partner', async () => {
    // Register Hyderabad partner in database
    const partnerId = " Hyderabad-Partner-UUID";
    mockD1.tables.partners.push({
      id: partnerId,
      name: "Hyderabad Consultants",
      pan_number: "encrypted-pan",
      bank_account: "bank-acc",
      ifsc_code: "ifsc",
      status: "active",
      created_at: 0
    });

    const res = await app.request('/api/public/partners/referrals', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        partnerId: partnerId,
        clientId: "OP-2026-5555",
        commissionRate: 8
      })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);
    expect(data.referralId).toBeDefined();

    // Verify referral record insertion
    const ref = mockD1.tables.referrals.find(r => r.id === data.referralId);
    expect(ref).toBeDefined();
    expect(ref.partner_id).toBe(partnerId);
    expect(ref.client_id).toBe("OP-2026-5555");
    expect(ref.commission_rate).toBe(8);
  });
});
