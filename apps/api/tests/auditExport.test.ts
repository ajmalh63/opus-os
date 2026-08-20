import { describe, it, expect, beforeEach, vi } from 'vitest';
import app from '../src/index.js';
import { MockD1Database } from './mockDb.js';
import { runAuditArchive } from '../src/cron/auditArchive.js';
import { buildPayload, canonicalize, sha256Hex } from '../src/lib/auditChain.js';

vi.mock('../src/auth.js', () => {
  return {
    getAuth: (env: any) => {
      return {
        api: {
          getSession: async (options: any) => {
            const cookieHeader = options?.headers?.get('cookie') || '';
            const match = cookieHeader.match(/better-auth\.session_token=([^;]+)/);
            const token = match ? match[1] : null;

            if (token === 'token-admin') {
              return {
                user: {
                  id: "admin-1",
                  name: "Admin User",
                  email: "admin@test.com",
                  role: "super_admin",
                  userDivisions: JSON.stringify(["study-abroad", "visa", "umrah", "attestation", "manpower"])
                },
                session: {
                  id: "session-admin",
                  token,
                  userId: "admin-1"
                }
              };
            }
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

function utcMonth(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

describe('Phase 3 — audit chain verification & export endpoints', () => {
  let mockD1: MockD1Database;

  beforeEach(() => {
    mockD1 = new MockD1Database();
  });

  function baseAuditRow(over: Record<string, any> = {}): Record<string, any> {
    return {
      id: 'a-x', actor_id: null, action: 'CUSTOMER_CREATED', entity_name: 'clients',
      entity_id: 'OP-1', before_state: null, after_state: '{"name":"X"}',
      ip_address: '1.1.1.1', created_at: 1000, category: 'lead', actor_type: 'system',
      result: 'success', auth_method: 'none', data_classification: 'internal',
      request_id: 'req-1', schema_version: '1.1', prev_hash: null, record_hash: null,
      ...over,
    };
  }

  async function hashRow(row: Record<string, any>): Promise<string> {
    const prev = row.prev_hash || 'GENESIS';
    return sha256Hex(prev + canonicalize(buildPayload(row)));
  }

  // Seed n rows forming a VALID hash chain (prev_hash/record_hash computed like
  // src/middleware/audit.ts: record_hash = SHA-256(prev_hash + canonicalize(payload))).
  async function seedChain(n: number, over: Record<string, any> = {}): Promise<string[]> {
    const rows = mockD1.tables.audit_log as any[];
    let prev = 'GENESIS';
    const hashes: string[] = [];
    for (let i = 0; i < n; i++) {
      const row = baseAuditRow({ id: `a-${i}`, created_at: 1000 + i, prev_hash: prev, ...over });
      row.record_hash = await hashRow(row);
      rows.push(row);
      hashes.push(row.record_hash);
      prev = row.record_hash;
    }
    return hashes;
  }

  const admin = { headers: { 'Cookie': 'better-auth.session_token=token-admin' } };
  const counselor = { headers: { 'Cookie': 'better-auth.session_token=token-counselor' } };

  it('GET /api/admin/audit/verify-chain returns 401 without a session', async () => {
    const res = await app.request('/api/admin/audit/verify-chain', {}, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    expect(res.status).toBe(401);
  });

  it('GET /api/admin/audit/verify-chain returns 403 for counselor role', async () => {
    const res = await app.request('/api/admin/audit/verify-chain', counselor, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    expect(res.status).toBe(403);
  });

  it('GET /api/admin/audit/verify-chain returns valid:true for an untampered chain', async () => {
    await seedChain(2);
    const res = await app.request('/api/admin/audit/verify-chain', admin, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.valid).toBe(true);
    expect(data.total).toBe(2);
    expect(data.firstBreak).toBeNull();
    expect(data.reason).toBeNull();
  });

  it('GET /api/admin/audit/verify-chain flags a tampered middle row', async () => {
    await seedChain(3);
    (mockD1.tables.audit_log as any[])[1].after_state = '{"name":"TAMPERED"}';
    const res = await app.request('/api/admin/audit/verify-chain', admin, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.valid).toBe(false);
    expect(data.firstBreak).toBe(1);
    expect(data.reason).toContain('record_hash mismatch');
  });

  it('GET /api/admin/audit/verify-chain returns 500 { error } on DB failure', async () => {
    const broken = new MockD1Database();
    broken.prepare = (() => { throw new Error('d1 exploded'); }) as any;
    const res = await app.request('/api/admin/audit/verify-chain', admin, { DB: broken, BETTER_AUTH_SECRET: 'test-secret' });
    expect(res.status).toBe(500);
    const data = await res.json() as any;
    expect(data.error).toBeTruthy();
  });

  it('GET /api/admin/audit/export returns 401/403 ceilings', async () => {
    const anon = await app.request('/api/admin/audit/export', {}, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    expect(anon.status).toBe(401);
    const forbidden = await app.request('/api/admin/audit/export', counselor, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    expect(forbidden.status).toBe(403);
  });

  it('GET /api/admin/audit/export?format=json returns logs (newest first) + full-chain result', async () => {
    await seedChain(3);
    const res = await app.request('/api/admin/audit/export?format=json', admin, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.logs.length).toBe(3);
    expect(data.logs[0].created_at).toBeGreaterThanOrEqual(data.logs[1].created_at);
    expect(data.chain.valid).toBe(true);
    expect(data.chain.total).toBe(3);
  });

  it('GET /api/admin/audit/export?format=csv returns text/csv with header + valid chain comment', async () => {
    const hashes = await seedChain(2);
    const res = await app.request('/api/admin/audit/export?format=csv', admin, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/csv');
    expect(res.headers.get('content-disposition')).toContain('attachment; filename="audit-export.csv"');
    const body = await res.text();
    expect(body.split('\n')[0]).toBe('id,created_at,actor_id,action,entity_name,entity_id,category,actor_type,result,auth_method,ip_address,request_id,schema_version,prev_hash,record_hash,before_state,after_state');
    expect(body).toContain(hashes[0]);
    expect(body).toContain(hashes[1]);
    expect(body).toContain('# chain: valid');
  });

  it('GET /api/admin/audit/export?format=csv appends a BROKEN chain comment after tampering', async () => {
    await seedChain(2);
    (mockD1.tables.audit_log as any[])[0].after_state = '{"name":"TAMPERED"}';
    const res = await app.request('/api/admin/audit/export?format=csv', admin, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toContain('# chain: BROKEN');
  });

  it('GET /api/admin/audit/export from/to filters by epoch range; chain still covers the full log', async () => {
    await seedChain(3);
    const res = await app.request('/api/admin/audit/export?format=json&from=1001&to=1001', admin, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.logs.length).toBe(1);
    expect(data.logs[0].created_at).toBe(1001);
    expect(data.chain.total).toBe(3);
    expect(data.chain.valid).toBe(true);

    const all = await app.request('/api/admin/audit/export?format=json', admin, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    const allData = await all.json() as any;
    expect(allData.logs.length).toBe(3);
  });

  it('GET /api/admin/audit/export CSV escapes quotes/commas in state fields', async () => {
    await seedChain(1, { after_state: '{"note":"x,y"}' });
    const res = await app.request('/api/admin/audit/export?format=csv', admin, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    const body = await res.text();
    const dataLine = body.split('\n')[1];
    // Each `"` doubled + field wrapped in quotes; commas stay literal.
    expect(dataLine).toContain('"{""note"":""x,y""}"');
  });
});

describe('Phase 3 — audit archive cron (runAuditArchive)', () => {
  let mockD1: MockD1Database;

  beforeEach(() => {
    mockD1 = new MockD1Database();
  });

  function baseAuditRow(over: Record<string, any> = {}): Record<string, any> {
    return {
      id: 'a-x', actor_id: null, action: 'CUSTOMER_CREATED', entity_name: 'clients',
      entity_id: 'OP-1', before_state: null, after_state: '{"name":"X"}',
      ip_address: '1.1.1.1', created_at: 1700000000, category: 'lead', actor_type: 'system',
      result: 'success', auth_method: 'none', data_classification: 'internal',
      request_id: 'req-1', schema_version: '1.1', prev_hash: null, record_hash: null,
      ...over,
    };
  }

  async function hashRow(row: Record<string, any>): Promise<string> {
    const prev = row.prev_hash || 'GENESIS';
    return sha256Hex(prev + canonicalize(buildPayload(row)));
  }

  // Previous-month rows (created_at well before the current UTC month).
  async function seedOldRows(n: number): Promise<string[]> {
    const rows = mockD1.tables.audit_log as any[];
    let prev = 'GENESIS';
    const hashes: string[] = [];
    for (let i = 0; i < n; i++) {
      const row = baseAuditRow({ id: `a-${i}`, created_at: 1700000000 + i, prev_hash: prev });
      row.record_hash = await hashRow(row);
      rows.push(row);
      hashes.push(row.record_hash);
      prev = row.record_hash;
    }
    return hashes;
  }

  it('archives previous-month rows: writes jsonl + manifest with rowCount/chainHead/fileSha256', async () => {
    const hashes = await seedOldRows(2);
    const put = vi.fn().mockResolvedValue({});
    const res = await runAuditArchive({ DB: mockD1 as any, BUCKET: { put } });

    expect(res.archived).toBe(true);
    expect(res.month).toBe(utcMonth());
    expect(res.rows).toBe(2);
    expect(put).toHaveBeenCalledTimes(2);

    const month = utcMonth();
    const jsonlCall = put.mock.calls.find((c) => String(c[0]).endsWith(`${month}.jsonl`));
    const manifestCall = put.mock.calls.find((c) => String(c[0]).endsWith(`${month}.manifest.json`));
    expect(jsonlCall).toBeTruthy();
    expect(manifestCall).toBeTruthy();

    const jsonl = String(jsonlCall![1]);
    const lines = jsonl.trim().split('\n');
    expect(lines.length).toBe(2);
    const first = JSON.parse(lines[0]);
    expect(first.actor_id).toBeNull();
    expect(first.action).toBe('CUSTOMER_CREATED');
    expect(first.prev_hash).toBe('GENESIS');
    expect(first.record_hash).toBe(hashes[0]);

    const manifest = JSON.parse(String(manifestCall![1]));
    expect(manifest.month).toBe(month);
    expect(manifest.exportedAt).toBeTruthy();
    expect(manifest.rowCount).toBe(2);
    expect(manifest.chainHead).toBe(hashes[1]);
    expect(manifest.fileSha256).toMatch(/^[0-9a-f]{64}$/);
    expect(manifest.fileSha256).toBe(await sha256Hex(jsonl));

    const setting = (mockD1.tables.app_settings as any[]).find((s) => s.key === 'audit_archive_last_month');
    expect(setting).toBeTruthy();
    expect(setting.value).toBe(month);
  });

  it('is idempotent: second run in the same month skips and does not call put again', async () => {
    await seedOldRows(2);
    const put = vi.fn().mockResolvedValue({});
    const env = { DB: mockD1 as any, BUCKET: { put } };

    const first = await runAuditArchive(env);
    expect(first.archived).toBe(true);
    expect(put).toHaveBeenCalledTimes(2);

    const second = await runAuditArchive(env);
    expect(second.archived).toBe(false);
    expect(second.reason).toBe('already-archived');
    expect(second.month).toBe(utcMonth());
    expect(put).toHaveBeenCalledTimes(2);
  });

  it('skips immediately when app_settings already has the current month', async () => {
    const put = vi.fn().mockResolvedValue({});
    (mockD1.tables.app_settings as any[]).push({ key: 'audit_archive_last_month', value: utcMonth(), updated_at: 0 });
    const res = await runAuditArchive({ DB: mockD1 as any, BUCKET: { put } });
    expect(res.archived).toBe(false);
    expect(res.reason).toBe('already-archived');
    expect(put).not.toHaveBeenCalled();
  });

  it('fail-open: missing BUCKET → skip with reason no-bucket', async () => {
    const res = await runAuditArchive({ DB: mockD1 as any } as any);
    expect(res.archived).toBe(false);
    expect(res.reason).toBe('no-bucket');
  });

  it('fail-open: missing DB → skip with reason, never throws', async () => {
    const res = await runAuditArchive({} as any);
    expect(res.archived).toBe(false);
    expect(res.reason).toBeTruthy();
  });

  it('fail-open: DB query error → skip with reason, never throws', async () => {
    const broken = new MockD1Database();
    broken.prepare = (() => { throw new Error('d1 exploded'); }) as any;
    const put = vi.fn().mockResolvedValue({});
    const res = await runAuditArchive({ DB: broken as any, BUCKET: { put } });
    expect(res.archived).toBe(false);
    expect(res.reason).toBeTruthy();
  });

  it('empty previous-month log still archives (rowCount 0, chainHead GENESIS)', async () => {
    const put = vi.fn().mockResolvedValue({});
    const res = await runAuditArchive({ DB: mockD1 as any, BUCKET: { put } });
    expect(res.archived).toBe(true);
    expect(res.rows).toBe(0);
    const month = utcMonth();
    const manifestCall = put.mock.calls.find((c) => String(c[0]).endsWith(`${month}.manifest.json`));
    const manifest = JSON.parse(String(manifestCall![1]));
    expect(manifest.rowCount).toBe(0);
    expect(manifest.chainHead).toBe('GENESIS');
  });
});
