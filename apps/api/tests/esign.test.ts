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
                user: { id: "counselor-1", name: "Counselor", email: "c@test.com", role: "counselor", userDivisions: JSON.stringify([]) },
                session: { id: "s-c", token, userId: "counselor-1" }
              };
            }
            return null;
          }
        }
      };
    }
  };
});

const ENV = {
  DB: null as any,
  BETTER_AUTH_SECRET: 'test-secret',
  ESIGN_PROVIDER: 'surepass',
  ESIGN_SALT: 'salt-test-123',
  ESIGN_BASE_URL: 'https://esign-client.surepass.io/'
};

describe('Aadhaar eSign (Section 11 — CCA/IT-Act-2000, provider-agnostic)', () => {
  let mockD1: MockD1Database;

  beforeAll(() => {
    mockD1 = new MockD1Database();
    ENV.DB = mockD1;

    mockD1.tables.clients.push({ id: "OP-2026-7001", name: "Test Client", email: "c@test.com", created_at: 1, updated_at: 1 });
    mockD1.tables.agreement_templates.push({ id: "tmpl-7001", name: "Service Agreement", division: "attestation", clauses_json: "[]", version: "v1.0", created_at: 1 });
    mockD1.tables.agreements.push({ id: "ag-7001", client_id: "OP-2026-7001", template_id: "tpl-7001", status: "draft", content: "AGREEMENT CONTENT", created_at: 1 });
  });

  it('init fails closed when provider not configured', async () => {
    const ev = { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' } as any;
    const res = await app.request('/api/agreements/ag-7001/esign/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'cookie': 'better-auth.session_token=token-counselor' },
      body: JSON.stringify({ esignMethod: 'aadhaar' })
    }, ev);
    expect(res.status).toBe(503);
  });

  it('init issues a hash-signed requestId and marks agreement pending', async () => {
    const res = await app.request('/api/agreements/ag-7001/esign/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'cookie': 'better-auth.session_token=token-counselor' },
      body: JSON.stringify({ esignMethod: 'aadhaar', signerDocFingerprint: 'last4-1234' })
    }, ENV);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);
    expect(data.requestId).toMatch(/^op-ag-7001-/);
    expect(data.esignUrl).toContain('esign-client.surepass.io');
    expect(data.esignUrl).toContain(encodeURIComponent(data.requestId));

    const ag = mockD1.tables.agreements.find((a: any) => a.id === 'ag-7001');
    expect(ag.esign_status).toBe('pending');
    expect(ag.esign_token).toBe(data.requestId);
    expect(ag.esign_method).toBe('aadhaar');
  });

  it('rejects a forged callback (bad signature / wrong requestId)', async () => {
    const ag = mockD1.tables.agreements.find((a: any) => a.id === 'ag-7001');
    const badSig = await app.request('/api/public/esign/callback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agreementId: 'ag-7001', requestId: ag.esign_token, status: 'signed', signature: 'deadbeef' })
    }, ENV);
    expect(badSig.status).toBe(400);

    const wrongReq = await app.request('/api/public/esign/callback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agreementId: 'ag-7001', requestId: 'forged-request', status: 'signed', signature: 'abc123' })
    }, ENV);
    expect(wrongReq.status).toBe(401);
  });

  it('accepts a valid provider callback, finalizes as signed, records DPDP consent', async () => {
    const ag = mockD1.tables.agreements.find((a: any) => a.id === 'ag-7001');
    const signature = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`ag-7001|${ag.esign_token}|signed|salt-test-123`));
    const sigHex = Array.from(new Uint8Array(signature)).map(b => b.toString(16).padStart(2, '0')).join('');

    const res = await app.request('/api/public/esign/callback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agreementId: 'ag-7001', requestId: ag.esign_token, status: 'signed', signature: sigHex, signedDocKey: 'r2/signed/ag-7001.pdf' })
    }, ENV);
    expect(res.status).toBe(200);

    const updated = mockD1.tables.agreements.find((a: any) => a.id === 'ag-7001');
    expect(updated.status).toBe('signed');
    expect(updated.esign_status).toBe('signed');
    expect(updated.esign_signed_doc_key).toBe('r2/signed/ag-7001.pdf');
    expect(updated.sha256_hash).toBeTruthy();
    expect(updated.signed_at).toBeTruthy();

    const consentSaved = mockD1.tables.consents.some((cc: any) => cc.client_id === 'OP-2026-7001' && cc.status === 'granted');
    expect(consentSaved).toBe(true);
  });

  it('does not double-sign (replay-safe) and mirrors a failed/refused provider status', async () => {
    const again = await app.request('/api/public/esign/callback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agreementId: 'ag-7001', requestId: 'anything', status: 'signed', signature: 'x', signedDocKey: 'r2/x.pdf' })
    }, ENV);
    expect(again.status).toBe(200); // already signed -> acknowledged

    mockD1.tables.agreements.push({
      id: "ag-7002", client_id: "OP-2026-7001", template_id: "tpl-7001", status: "draft", content: "SECOND", created_at: 1
    });
    const init = await app.request('/api/agreements/ag-7002/esign/init', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'cookie': 'better-auth.session_token=token-counselor' },
      body: JSON.stringify({ esignMethod: 'otp' })
    }, ENV);
    const initData = await init.json() as any;

    const refuseSig = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`ag-7002|${initData.requestId}|refused|salt-test-123`));
    const refuseHex = Array.from(new Uint8Array(refuseSig)).map(b => b.toString(16).padStart(2, '0')).join('');
    const refuse = await app.request('/api/public/esign/callback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agreementId: 'ag-7002', requestId: initData.requestId, status: 'refused', signature: refuseHex })
    }, ENV);
    expect(refuse.status).toBe(200);
    const refused = mockD1.tables.agreements.find((a: any) => a.id === 'ag-7002');
    expect(refused.esign_status).toBe('refused');
    expect(refused.status).toBe('draft'); // not finalized
  });

  it('status endpoint reports esign state', async () => {
    const res = await app.request('/api/agreements/ag-7002/esign/status', {
      headers: { 'cookie': 'better-auth.session_token=token-counselor' }
    }, ENV);
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.esignStatus).toBe('refused');
  });
});