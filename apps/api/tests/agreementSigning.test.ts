import { describe, it, expect, beforeAll, vi } from 'vitest';
import app from '../src/index.js';
import { MockD1Database } from './mockDb.js';
import { seedAgreementLibrary } from '../src/db/seed.js';
import { getDb } from '../src/db/client.js';

// Staff session mock (manager) for the staff sign-path test; portal routes are
// token-based (no session) so these return null without a staff cookie.
vi.mock('../src/auth.js', () => {
  return {
    getAuth: (env: any) => {
      return {
        api: {
          getSession: async (options: any) => {
            const cookieHeader = options?.headers?.get('cookie') || '';
            const match = cookieHeader.match(/better-auth\.session_token=([^;]+)/);
            const token = match ? match[1] : null;

            if (token === 'token-manager') {
              return {
                user: {
                  id: "manager-1",
                  name: "Manager One",
                  email: "manager@test.com",
                  role: "manager",
                  userDivisions: JSON.stringify([])
                },
                session: {
                  id: "session-manager",
                  token,
                  userId: "manager-1"
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

describe('Agreement template library seed (Phase A §2)', () => {
  it('seedAgreementLibrary seeds clause library + 10 templates and is idempotent', async () => {
    const mockD1 = new MockD1Database();
    const db = getDb(mockD1 as any);

    await seedAgreementLibrary(db);

    const clauses = mockD1.tables.clause_library as any[];
    const templates = mockD1.tables.agreement_templates as any[];

    expect(clauses.length).toBeGreaterThan(20);
    expect(templates.length).toBe(10);

    // Mandatory G1 present with division 'general'
    const g1 = clauses.find((c) => c.clause_id === 'G1');
    expect(g1).toBeDefined();
    expect(g1.division).toBe('general');
    expect(g1.mandatory).toBeTruthy();

    // Every template references the 8 general clauseIds + its own division set
    const generalIds = ['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8'];
    for (const t of templates) {
      const ids = JSON.parse(t.clauses_json) as string[];
      for (const g of generalIds) expect(ids).toContain(g);
    }
    const saTemplate = templates.find((t) => t.division === 'study-abroad');
    expect(JSON.parse(saTemplate.clauses_json)).toEqual(expect.arrayContaining(['SA1', 'SA7']));

    // Idempotency: second call must not duplicate
    const clauseCount = clauses.length;
    const templateCount = templates.length;
    await seedAgreementLibrary(db);
    expect((mockD1.tables.clause_library as any[]).length).toBe(clauseCount);
    expect((mockD1.tables.agreement_templates as any[]).length).toBe(templateCount);
  });
});

describe('Client self-service agreement e-sign (Phase A §3)', () => {
  let mockD1: MockD1Database;

  const CLIENT_A = 'OP-2026-7777'; // owner of seeded drafts
  const CLIENT_B = 'OP-2026-8888'; // other client (no agreements / no ownership)

  beforeAll(() => {
    mockD1 = new MockD1Database();

    mockD1.tables.users.push({
      id: 'manager-1', name: 'Manager One', email: 'manager@test.com',
      email_verified: 1, role: 'manager', user_divisions: JSON.stringify([]),
      created_at: 0, updated_at: 0
    });

    mockD1.tables.clients.push({
      id: CLIENT_A,
      portal_token: CLIENT_A, name: 'Priya Sharma', phone: '+91 98765 11111',
      email: 'priya@test.com', created_at: 0, updated_at: 0
    });
    mockD1.tables.clients.push({
      id: CLIENT_B,
      portal_token: CLIENT_B, name: 'Divya Reddy', phone: '+91 98765 22222',
      email: 'divya@test.com', created_at: 0, updated_at: 0
    });

    mockD1.tables.agreement_templates.push({
      id: 'tmpl-portal-1', name: 'Study Abroad — Full Service Agreement',
      division: 'study-abroad',
      clauses_json: JSON.stringify(['G1', 'G2', 'G3', 'G4', 'G5', 'G6', 'G7', 'G8', 'SA1', 'SA7']),
      version: 'v1.0', created_at: 0
    });
  });

  const seedDraft = (id: string, clientId: string, content = 'SERVICE AGREEMENT CONTENT TEXT') => {
    mockD1.tables.agreements.push({
      id, client_id: clientId, template_id: 'tmpl-portal-1',
      status: 'draft', content, created_at: 0
    });
  };

  it('GET portal agreements: token with no agreements returns an empty list', async () => {
    const res = await app.request(`/api/public/portal/agreements?token=${CLIENT_B}`, {}, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.agreements).toEqual([]);
  });

  it('GET portal agreements: returns the client\'s agreements with content', async () => {
    seedDraft('ag-portal-list-1', CLIENT_A);
    const res = await app.request(`/api/public/portal/agreements?token=${CLIENT_A}`, {}, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.agreements.length).toBe(1);
    expect(data.agreements[0].id).toBe('ag-portal-list-1');
    expect(data.agreements[0].templateId).toBe('tmpl-portal-1');
    expect(data.agreements[0].status).toBe('draft');
    expect(data.agreements[0].content).toContain('SERVICE AGREEMENT');
    // Not the other client's agreement
    const other = await app.request(`/api/public/portal/agreements?token=${CLIENT_B}`, {}, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    expect(((await other.json()) as any).agreements).toEqual([]);
  });

  it('POST request-otp: creates verification row + email notification; unknown token → 404', async () => {
    seedDraft('ag-otp-req-1', CLIENT_A);
    const res = await app.request(`/api/public/portal/agreements/ag-otp-req-1/request-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: CLIENT_A })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);

    const notifications = mockD1.tables.notifications as any[];
    const n = notifications.find((x) => x.channel === 'email' && x.to === 'priya@test.com');
    expect(n).toBeDefined();
    expect(n.subject).toContain('sign your agreement');
    expect(n.body).toMatch(/\d{6}/);

    const verifications = mockD1.tables.verifications as any[];
    const v = verifications.find((x) => x.identifier === 'agreement-otp:ag-otp-req-1');
    expect(v).toBeDefined();
    // SECURITY: OTP is stored as a SHA-256 hash (64 hex), never plaintext
    expect(String(v.value)).toMatch(/^[0-9a-f]{64}$/);
    expect(String(v.value)).not.toMatch(/^\d{6}$/);
    const expRaw = v.expires_at;
    const expiresMs = expRaw instanceof Date ? expRaw.getTime() : Number(expRaw) * 1000;
    expect(expiresMs).toBeGreaterThan(Date.now());

    // Wrong token → 404
    const bad = await app.request(`/api/public/portal/agreements/ag-otp-req-1/request-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'OP-UNKNOWN-0000' })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    expect(bad.status).toBe(404);
  });

  it('POST sign (typed): signs, captures 64-hex sha256Hash + signedAt, audits AGREEMENT_SIGNED; second sign → 409', async () => {
    seedDraft('ag-typed-1', CLIENT_A);
    // OTP is now REQUIRED for every sign method — seed a hashed code
    mockD1.tables.verifications.push({
      id: 'v-ag-typed-1', identifier: 'agreement-otp:ag-typed-1',
      value: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08', // sha256('test')
      expires_at: new Date(Date.now() + 600000), created_at: new Date(), updated_at: new Date(), attempts: 0,
    } as any);
    const res = await app.request(`/api/public/portal/agreements/ag-typed-1/sign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'user-agent': 'Vitest/Agents' },
      body: JSON.stringify({ token: CLIENT_A, esignMethod: 'typed', signatureData: 'Priya Sharma', otp: 'test' })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);
    expect(data.signedAt).toBeGreaterThan(0);
    expect(data.hash).toMatch(/^[0-9a-f]{64}$/);

    const agreement = mockD1.tables.agreements.find((a) => a.id === 'ag-typed-1');
    expect(agreement.status).toBe('signed');
    expect(agreement.esign_method).toBe('typed');
    expect(agreement.sha256_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(agreement.signed_at).toBeGreaterThan(0);
    expect(agreement.ip_address).toBeTruthy();

    const audit = mockD1.tables.audit_log as any[];
    const entry = audit.find((a) => a.action === 'AGREEMENT_SIGNED' && a.entity_id === 'ag-typed-1');
    expect(entry).toBeDefined();
    expect(entry.category).toBe('compliance');
    expect(entry.after_state).toContain(CLIENT_A);
    expect(entry.after_state).toContain('typed');

    // Second sign → 409
    const again = await app.request(`/api/public/portal/agreements/ag-typed-1/sign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: CLIENT_A, esignMethod: 'typed', signatureData: 'Priya Sharma', otp: 'test' })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    expect(again.status).toBe(409);
  });

  it('POST sign (wet_ink): signs with canvas signatureData', async () => {
    seedDraft('ag-wet-1', CLIENT_A);
    // OTP is now REQUIRED for every sign method — seed a hashed code
    mockD1.tables.verifications.push({
      id: 'v-ag-wet-1', identifier: 'agreement-otp:ag-wet-1',
      value: '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08', // sha256('test')
      expires_at: new Date(Date.now() + 600000), created_at: new Date(), updated_at: new Date(), attempts: 0,
    } as any);
    const res = await app.request(`/api/public/portal/agreements/ag-wet-1/sign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: CLIENT_A, esignMethod: 'wet_ink', signatureData: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUg==', otp: 'test' })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    expect(res.status).toBe(200);
    const agreement = mockD1.tables.agreements.find((a) => a.id === 'ag-wet-1');
    expect(agreement.status).toBe('signed');
    expect(agreement.esign_method).toBe('wet_ink');
  });

  it('POST sign (otp): wrong otp → 400; correct otp → signed and verification row consumed', async () => {
    seedDraft('ag-otp-1', CLIENT_A);

    await app.request(`/api/public/portal/agreements/ag-otp-1/request-otp`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: CLIENT_A })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });

    const v = (mockD1.tables.verifications as any[]).find((x) => x.identifier === 'agreement-otp:ag-otp-1');
    expect(v).toBeDefined();
    // value is hashed at rest — pin the row to sha256('test') and use the plaintext
    v.value = '9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08';
    const otp = 'test';

    const wrong = await app.request(`/api/public/portal/agreements/ag-otp-1/sign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: CLIENT_A, esignMethod: 'otp', otp: '000000' })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    expect(wrong.status).toBe(400);

    const ok = await app.request(`/api/public/portal/agreements/ag-otp-1/sign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: CLIENT_A, esignMethod: 'otp', otp })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    expect(ok.status).toBe(200);

    const agreement = mockD1.tables.agreements.find((a) => a.id === 'ag-otp-1');
    expect(agreement.status).toBe('signed');
    expect(agreement.esign_method).toBe('otp');

    // Verification row consumed (deleted after use)
    const remaining = (mockD1.tables.verifications as any[]).filter((x) => x.identifier === 'agreement-otp:ag-otp-1');
    expect(remaining.length).toBe(0);
  });

  it('POST sign: other client\'s token on someone else\'s agreement → 404', async () => {
    seedDraft('ag-owner-1', CLIENT_A);
    const res = await app.request(`/api/public/portal/agreements/ag-owner-1/sign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: CLIENT_B, esignMethod: 'typed', signatureData: 'Divya Reddy' })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    expect(res.status).toBe(404);
  });

  it('staff sign endpoint still works with esignMethod typed (token-manager)', async () => {
    seedDraft('ag-staff-typed-1', CLIENT_A);
    const res = await app.request(`/api/agreements/ag-staff-typed-1/sign`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cookie': 'better-auth.session_token=token-manager'
      },
      body: JSON.stringify({ esignMethod: 'typed', signatureData: 'Priya Sharma', otp: 'test' })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);
    expect(data.sha256Hash).toMatch(/^[0-9a-f]{64}$/);
    const agreement = mockD1.tables.agreements.find((a) => a.id === 'ag-staff-typed-1');
    expect(agreement.status).toBe('signed');
    expect(agreement.esign_method).toBe('typed');
  });
});