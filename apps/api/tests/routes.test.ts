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

            if (token === 'mock-session-token-123') {
              return {
                user: {
                  id: "user-counselor-1",
                  name: "Rahul Counselor",
                  email: "counselor@test.com",
                  role: "counselor",
                  userDivisions: JSON.stringify(["study-abroad", "visa"])
                },
                session: {
                  id: "session-123",
                  token,
                  userId: "user-counselor-1"
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


describe('API Route Shell Integration & Validation Tests', () => {
  let mockD1: MockD1Database;

  beforeAll(() => {
    mockD1 = new MockD1Database();

    // Seed pipeline stages
    mockD1.tables.pipeline_stages.push(
      { id: '1', key: 'lead', name: 'Lead Intake', sequence: 1, wip_limit: null, created_at: 0 },
      { id: '2', key: 'qualified', name: 'Qualified', sequence: 2, wip_limit: null, created_at: 0 },
      { id: '3', key: 'documents', name: 'Documents', sequence: 3, wip_limit: null, created_at: 0 },
      { id: '4', key: 'processing', name: 'Processing', sequence: 4, wip_limit: 1, created_at: 0 }, // WIP limit 1
      { id: '5', key: 'complete', name: 'Complete', sequence: 5, wip_limit: null, created_at: 0 }
    );

    // Seed a mock user (counselor) for RBAC division check
    mockD1.tables.users.push({
      id: "user-counselor-1",
      name: "Rahul Counselor",
      email: "counselor@test.com",
      email_verified: 1,
      role: "counselor",
      user_divisions: JSON.stringify(["study-abroad", "visa"]),
      created_at: 0,
      updated_at: 0
    });

    // Seed a mock session for Better Auth
    mockD1.tables.sessions.push({
      id: "session-123",
      user_id: "user-counselor-1",
      token: "mock-session-token-123",
      expires_at: (Math.floor(Date.now() / 1000) + 3600 * 24) * 1000,
      ip_address: "127.0.0.1",
      user_agent: "test-agent",
      created_at: 0,
      updated_at: 0
    });
  });

  it('POST /api/public/leads should reject invalid payload input format', async () => {
    const invalidPayload = {
      name: "R", // min 2 chars
      phone: "9876543210", // wrong format (must be +91 XXXXX XXXXX)
      email: "not-an-email",
      highestQualification: "highschool",
      division: "study-abroad",
      consents: {
        coreProcessing: false
      }
    };

    const res = await app.request('/api/public/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(invalidPayload)
    }, { DB: mockD1 });

    expect(res.status).toBe(400);
    const json = await res.json() as any;
    expect(json.success).toBe(false);
    expect(json.error.name).toBe("ZodError");
  });

  it('POST /api/public/leads should accept valid payload and insert records in D1', async () => {
    const validPayload = {
      name: "Rahul Sharma",
      phone: "+91 98765 43210",
      email: "rahul.sharma@example.com",
      highestQualification: "undergrad",
      division: "study-abroad",
      consents: {
        coreProcessing: true,
        whatsappUpdates: true,
        marketingCampaigns: false
      },
      dynamicContext: {
        targetCountry: "us",
        intakeSeason: "Fall 2027"
      }
    };

    const res = await app.request('/api/public/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(validPayload)
    }, { DB: mockD1 });

    expect(res.status).toBe(200);
    const json = await res.json() as any;
    expect(json.success).toBe(true);
    expect(json.token).toBeDefined();
    expect(json.token.startsWith("OP-2026-")).toBe(true);

    // Verify insertion in mock database
    const clientRow = mockD1.tables.clients.find(c => c.id === json.token);
    expect(clientRow).toBeDefined();
    expect(clientRow.name).toBe("Rahul Sharma");
    expect(clientRow.highest_qualification).toBe("undergrad");

    const consentRow = mockD1.tables.consents.find(c => c.client_id === json.token && c.consent_type === 'core-processing');
    expect(consentRow).toBeDefined();

    const engagementRow = mockD1.tables.engagements.find(e => e.client_id === json.token);
    expect(engagementRow).toBeDefined();
    expect(engagementRow.division).toBe("study-abroad");
  });

  it('GET /api/clients/:id should retrieve Client 360 data correctly', async () => {
    const client = mockD1.tables.clients.find(c => c.name === 'Rahul Sharma');
    expect(client).toBeDefined();

    const res = await app.request(`/api/clients/${client.id}`, {
      headers: {
        'Cookie': 'better-auth.session_token=mock-session-token-123'
      }
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    
    expect(data.name).toBe("Rahul Sharma");
    expect(data.engagements).toHaveLength(1);
    expect(data.consents).toHaveLength(2); // core-processing + whatsapp-updates
    expect(data.documents).toHaveLength(0);
  });

  it('POST /api/kanban/board/move should update card position and trigger WIP warnings', async () => {
    const engagement = mockD1.tables.engagements[0];
    expect(engagement).toBeDefined();

    // 1. Move to "qualified" (WIP limit is null, so it shouldn't breach)
    const movePayload1 = {
      cardId: engagement.id,
      sourceStage: "lead",
      targetStage: "qualified"
    };

    const res1 = await app.request('/api/kanban/board/move', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Cookie': 'better-auth.session_token=mock-session-token-123'
      },
      body: JSON.stringify(movePayload1)
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });

    expect(res1.status).toBe(200);
    const json1 = await res1.json() as any;
    expect(json1.success).toBe(true);
    expect(json1.wipLimitBreached).toBe(false);

    expect(engagement.stage_key).toBe("qualified");

    // 2. Move to "processing" (WIP limit is 1. Currently 0 active cards in processing, moving 1 should not breach).
    const movePayload2 = {
      cardId: engagement.id,
      sourceStage: "qualified",
      targetStage: "processing"
    };

    const res2 = await app.request('/api/kanban/board/move', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Cookie': 'better-auth.session_token=mock-session-token-123'
      },
      body: JSON.stringify(movePayload2)
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });

    expect(res2.status).toBe(200);
    const json2 = await res2.json() as any;
    expect(json2.success).toBe(true);
    expect(json2.wipLimitBreached).toBe(false);

    // 3. Create a second client and engagement card, and try to move it to "processing". Should trigger WIP breach warning.
    const client2Token = "OP-2026-9999";
    mockD1.tables.clients.push({ id: client2Token, name: 'Test Client 2', phone: '+91 99999 99999', email: 'test2@example.com', created_at: 0, updated_at: 0 });
    const card2Id = "card-2-uuid";
    mockD1.tables.engagements.push({ id: card2Id, client_id: client2Token, division: 'visa', title: 'Visa App', stage_key: 'qualified', outstanding_balance: 0, status: 'active', created_at: 0, updated_at: 0 });

    const movePayload3 = {
      cardId: card2Id,
      sourceStage: "qualified",
      targetStage: "processing"
    };

    const res3 = await app.request('/api/kanban/board/move', {
      method: 'POST',
      headers: { 
        'Content-Type': 'application/json',
        'Cookie': 'better-auth.session_token=mock-session-token-123'
      },
      body: JSON.stringify(movePayload3)
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });

    expect(res3.status).toBe(200);
    const json3 = await res3.json() as any;
    expect(json3.success).toBe(true);
    expect(json3.wipLimitBreached).toBe(true); // BREACHED!
    expect(json3.currentCount).toBe(2);
    expect(json3.limit).toBe(1);

    const card2 = mockD1.tables.engagements.find(e => e.id === card2Id);
    expect(card2?.stage_key).toBe("processing");

    // Check audit log
    const auditRecord = mockD1.tables.audit_log.find(a => a.entity_id === card2Id);
    expect(auditRecord).toBeDefined();
    expect(auditRecord.action).toBe("STAGE_CHANGE");
  });
});
