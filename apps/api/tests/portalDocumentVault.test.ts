import { describe, it, expect, vi, beforeEach } from 'vitest';
import { portalRouter } from '../src/routes/portal.js';
import { MockD1Database } from './mockDb.js';

describe('Document Vault 30-Day Lifecycle Retention & Storage Purge Engine', () => {
  let mockD1: MockD1Database;
  const mockBucket: any = {
    put: vi.fn().mockResolvedValue({}),
    get: vi.fn().mockResolvedValue({
      body: new Uint8Array([1, 2, 3]),
      httpEtag: '"123"',
      writeHttpMetadata: vi.fn(),
    }),
    delete: vi.fn().mockResolvedValue({}),
  };

  const mockEnv: any = {
    DB: undefined,
    BUCKET: mockBucket,
    BETTER_AUTH_SECRET: 'test_secret_vault_123',
  };

  const now = Math.floor(Date.now() / 1000);

  beforeEach(() => {
    mockD1 = new MockD1Database();
    mockEnv.DB = mockD1;
    vi.clearAllMocks();

    mockD1.tables.clients = [
      {
        id: 'client-vault-1',
        portal_token: 'OP-2026-VAULT-1',
        name: 'Fatima Zahra',
        email: 'fatima@example.com',
        created_at: now - 60 * 86400,
        updated_at: now,
      },
    ];

    mockD1.tables.documents = [
      {
        id: 'doc-1',
        client_id: 'client-vault-1',
        file_name: 'passport_front_back.pdf',
        r2_key: 'vault/general/client_vault_1/passport.pdf',
        version: 'v1.0',
        status: 'verified',
        size_bytes: 1048576, // 1 MB
        mime_type: 'application/pdf',
        sha256: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855',
        uploaded_at: now - 10 * 86400,
        verified_at: now - 8 * 86400,
      },
      {
        id: 'doc-2',
        client_id: 'client-vault-1',
        file_name: 'degree_transcript.pdf',
        r2_key: 'vault/study_abroad/client_vault_1/transcript.pdf',
        version: 'v1.0',
        status: 'pending',
        size_bytes: 2097152, // 2 MB
        mime_type: 'application/pdf',
        sha256: 'f4c8996fb92427ae41e4649b934ca495991b7852b855e3b0c44298fc1c149afb',
        uploaded_at: now - 5 * 86400,
        verified_at: null,
      },
      {
        id: 'doc-custom-1',
        client_id: 'client-vault-1',
        file_name: 'experience_letter_infosys.pdf',
        doc_label: '3 Years Experience Letter - Infosys',
        r2_key: 'vault/manpower/client_vault_1/experience.pdf',
        version: 'v1.0',
        status: 'verified',
        size_bytes: 524288, // 0.5 MB
        mime_type: 'application/pdf',
        sha256: 'a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2',
        uploaded_at: now - 3 * 86400,
        verified_at: now - 1 * 86400,
      },
    ];

    mockD1.tables.engagements = [
      {
        id: 'eng-1',
        client_id: 'client-vault-1',
        division: 'study-abroad',
        stage_key: 'documents',
        status: 'active',
        created_at: now - 30 * 86400,
        updated_at: now - 2 * 86400,
      },
    ];
  });

  it('GET /vault returns live 50MB storage usage, mapped slots, and customDocuments list', async () => {
    const req = new Request('http://localhost/vault', {
      method: 'GET',
      headers: { 'x-portal-token': 'OP-2026-VAULT-1' },
    });

    const res = await portalRouter.fetch(req, mockEnv);
    const json: any = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.storage.usedMb).toBe(3.5); // 1MB + 2MB + 0.5MB = 3.5MB
    expect(json.storage.maxMb).toBe(50);
    expect(json.storage.percentUsed).toBe(7); // 3.5/50 = 7%
    expect(json.lifecycle.retentionStatus).toBe('active_journey');
    expect(json.slots.passport).toBeTruthy();
    expect(json.slots.academics).toBeTruthy();

    // Verify customDocuments list
    expect(json.customDocuments).toHaveLength(1);
    expect(json.customDocuments[0].id).toBe('doc-custom-1');
    expect(json.customDocuments[0].docLabel).toBe('3 Years Experience Letter - Infosys');
  });

  it('DELETE /documents/:id allows client to delete a specific custom document and free R2 storage', async () => {
    const req = new Request('http://localhost/documents/doc-custom-1', {
      method: 'DELETE',
      headers: { 'x-portal-token': 'OP-2026-VAULT-1' },
    });

    const res = await portalRouter.fetch(req, mockEnv);
    const json: any = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(mockBucket.delete).toHaveBeenCalledWith('vault/manpower/client_vault_1/experience.pdf');

    // Verify document was removed from D1
    const doc = mockD1.tables.documents.find((d: any) => d.id === 'doc-custom-1');
    expect(doc).toBeUndefined();
  });

  it('calculates 30-day grace period countdown when all client applications are completed', async () => {
    // Mark engagement as complete 5 days ago
    mockD1.tables.engagements[0].stage_key = 'complete';
    mockD1.tables.engagements[0].status = 'closed';
    mockD1.tables.engagements[0].updated_at = now - 5 * 86400; // Completed 5 days ago

    const req = new Request('http://localhost/vault', {
      method: 'GET',
      headers: { 'x-portal-token': 'OP-2026-VAULT-1' },
    });

    const res = await portalRouter.fetch(req, mockEnv);
    const json: any = await res.json();

    expect(res.status).toBe(200);
    expect(json.lifecycle.retentionStatus).toBe('grace_period');
    expect(json.lifecycle.hasActiveJourneys).toBe(false);
    expect(json.lifecycle.graceDaysLeft).toBeLessThanOrEqual(25);
    expect(json.lifecycle.graceDaysLeft).toBeGreaterThan(0);
  });

  it('POST /vault/purge-voluntary allows client to release storage early while retaining legal hash metadata', async () => {
    const req = new Request('http://localhost/vault/purge-voluntary', {
      method: 'POST',
      headers: { 'x-portal-token': 'OP-2026-VAULT-1' },
    });

    const res = await portalRouter.fetch(req, mockEnv);
    const json: any = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.purgedCount).toBe(3);
    expect(mockBucket.delete).toHaveBeenCalledTimes(3);

    // Verify R2 keys were purged in D1
    const doc1 = mockD1.tables.documents.find((d: any) => d.id === 'doc-1');
    expect(doc1.r2_key).toContain('purged-');
    // Ensure SHA-256 legal hash is still preserved
    expect(doc1.sha256).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  });

  it('POST /vault/cleanup-expired auto-purges files for journeys completed over 30 days ago', async () => {
    // Completed 35 days ago (> 30 days retention policy)
    mockD1.tables.engagements[0].stage_key = 'complete';
    mockD1.tables.engagements[0].status = 'closed';
    mockD1.tables.engagements[0].updated_at = now - 35 * 86400;

    const req = new Request('http://localhost/vault/cleanup-expired', {
      method: 'POST',
    });

    const res = await portalRouter.fetch(req, mockEnv);
    const json: any = await res.json();

    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.totalPurgedDocs).toBe(3);
    expect(json.purgedClientsCount).toBe(1);
    expect(mockBucket.delete).toHaveBeenCalledTimes(3);
  });
});
