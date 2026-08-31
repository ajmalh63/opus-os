import { describe, it, expect, beforeEach } from 'vitest';
import app from '../src/index.js';
import { MockD1Database } from './mockDb.js';

describe('Enterprise Security & Perimeter Penetration Battery', () => {
  let mockD1: MockD1Database;
  const clientAToken = 'portal-tok-client-aaa';
  const clientBToken = 'portal-tok-client-bbb';
  const clientAId = 'cli_sec_aaa';
  const clientBId = 'cli_sec_bbb';

  beforeEach(() => {
    mockD1 = new MockD1Database();

    // Client A
    mockD1.tables.clients.push({
      id: clientAId,
      name: 'Alice Johnson',
      email: 'alice@example.com',
      portal_token: clientAToken,
      status: 'active',
      created_at: Date.now(),
      updated_at: Date.now(),
    });

    // Client B
    mockD1.tables.clients.push({
      id: clientBId,
      name: 'Bob Smith',
      email: 'bob@example.com',
      portal_token: clientBToken,
      status: 'active',
      created_at: Date.now(),
      updated_at: Date.now(),
    });

    // Client A Agreement
    mockD1.tables.agreements.push({
      id: 'agr_secret_aaa',
      client_id: clientAId,
      status: 'draft',
      created_at: Date.now(),
      updated_at: Date.now(),
    });

    // Client A Document
    mockD1.tables.documents.push({
      id: 'doc_passport_aaa',
      client_id: clientAId,
      type: 'passport',
      file_path: 'documents/cli_sec_aaa/passport.pdf',
      file_size_bytes: 1048576,
      created_at: Date.now(),
    });
  });

  // =========================================================================
  // 1. Cross-Tenant IDOR Attack Simulation
  // =========================================================================
  it('1. IDOR Guard: Client B cannot view or access Client A documents or agreements', async () => {
    // Client B attempts to fetch Client A's agreement by ID with Client B's token
    const resAgr = await app.request('/api/public/portal/agreements/agr_secret_aaa', {
      headers: { 'X-Portal-Token': clientBToken },
    }, { DB: mockD1 });
    expect(resAgr.status).not.toBe(200);

    // Client B attempts to fetch Client A's document download link
    const resDoc = await app.request('/api/public/portal/documents/doc_passport_aaa/download', {
      headers: { 'X-Portal-Token': clientBToken },
    }, { DB: mockD1 });
    expect(resDoc.status).not.toBe(200);
  });

  // =========================================================================
  // 2. Unauthenticated Portal Access Rejection
  // =========================================================================
  it('2. Auth Boundary: Rejects requests missing valid X-Portal-Token with 400/401/403/404', async () => {
    const resNoToken = await app.request('/api/public/portal/documents/presigned', {
      method: 'GET',
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect([400, 401, 403, 404]).toContain(resNoToken.status);

    const resFakeToken = await app.request('/api/public/portal/documents/presigned?token=fake_tok&filename=passport.pdf', {
      method: 'GET',
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect([400, 401, 403, 404]).toContain(resFakeToken.status);
  });

  // =========================================================================
  // 3. Document Vault Presigned URL & Boundary Checks
  // =========================================================================
  it('3. Vault Presigned URL: Generates signed URL for valid client and rejects invalid token', async () => {
    const resValid = await app.request(`/api/public/portal/documents/presigned?token=${clientAToken}&filename=passport.pdf&division=visa&label=Passport`, {
      method: 'GET',
    }, {
      DB: mockD1,
      BETTER_AUTH_SECRET: 'test_auth_secret_enterprise',
    });

    expect(resValid.status).toBe(200);
    const data = await resValid.json() as any;
    expect(data.url).toBeTruthy();

    const resInvalid = await app.request('/api/public/portal/documents/presigned?token=fake_tok&filename=passport.pdf&division=visa', {
      method: 'GET',
    }, {
      DB: mockD1,
      BETTER_AUTH_SECRET: 'test_auth_secret_enterprise',
    });
    expect([400, 401, 403, 404]).toContain(resInvalid.status);
  });
});
