import { describe, it, expect, beforeEach } from 'vitest';
import { MockD1Database } from './mockDb.js';
import { runAuditMonitor } from '../src/cron/auditMonitor.js';
import { buildPayload, canonicalize, sha256Hex } from '../src/lib/auditChain.js';

describe('Phase 4 — audit monitor cron (monitoring & alerting)', () => {
  let mockD1: MockD1Database;

  beforeEach(() => {
    mockD1 = new MockD1Database();
  });

  // Hermetic test env: telegram creds are deliberately NOT set — sendTelegram
  // takes the stub-ok path (repo convention) so tests never touch the network.
  function env(over: Record<string, any> = {}) {
    return { DB: mockD1 as any, ...over };
  }

  async function seedAuditRow(row: Record<string, any>) {
    (mockD1.tables.audit_log as any[]).push(row);
  }

  // Hash a row exactly like src/middleware/audit.ts does:
  // record_hash = SHA-256(prev_hash + canonicalize(buildPayload(row)))
  async function hashRow(row: Record<string, any>): Promise<string> {
    const prev = row.prev_hash || 'GENESIS';
    return sha256Hex(prev + canonicalize(buildPayload(row)));
  }

  function baseAuditRow(over: Record<string, any> = {}): Record<string, any> {
    return {
      id: 'a-x', actor_id: null, action: 'CUSTOMER_CREATED', entity_name: 'clients',
      entity_id: 'OP-1', before_state: null, after_state: '{"name":"X"}',
      ip_address: '1.1.1.1', created_at: 100, category: 'lead', actor_type: 'system',
      result: 'success', auth_method: 'none', data_classification: 'internal',
      request_id: 'req-1', schema_version: '1.1', prev_hash: null, record_hash: null,
      ...over,
    };
  }

  it('healthy: empty audit log → checked=true, alerts=[], no notifications/staff alerts persisted', async () => {
    const res = await runAuditMonitor(env());
    expect(res.checked).toBe(true);
    expect(res.alerts).toEqual([]);
    expect(mockD1.tables.notifications).toHaveLength(0);
    expect(mockD1.tables.staff_alerts).toHaveLength(0);
  });

  it('broken chain: tampered row → chain alert + telegram notification + urgent staff alert', async () => {
    const row1 = baseAuditRow({ id: 'a-1', created_at: 100 });
    row1.record_hash = await hashRow(row1);
    const row2 = baseAuditRow({ id: 'a-2', created_at: 200, prev_hash: row1.record_hash });
    row2.record_hash = await hashRow(row2);
    await seedAuditRow(row1);
    await seedAuditRow(row2);

    row1.after_state = '{"name":"TAMPERED"}'; // simulate a DBA edit

    const res = await runAuditMonitor(env());
    expect(res.checked).toBe(true);
    expect(res.alerts.length).toBeGreaterThan(0);
    expect(res.alerts[0].toLowerCase()).toContain('chain');

    const n = (mockD1.tables.notifications as any[]).find((x) => x.channel === 'telegram');
    expect(n).toBeTruthy();
    expect(n.subject).toBe('Audit chain BROKEN');
    expect(n.body).toContain('Audit chain verification FAILED');

    const alert = (mockD1.tables.staff_alerts as any[])[0];
    expect(alert).toBeTruthy();
    expect(alert.type).toBe('audit_chain_break');
    expect(alert.severity).toBe('urgent');
    expect(alert.division).toBe('ops');
    expect(alert.body).toContain('scripts/audit-chain-verify.mjs');
  });

  it('denied spike: 51 ACCESS_DENIED in the last hour → telegram + staff alert with the count', async () => {
    const now = Math.floor(Date.now() / 1000);
    for (let i = 0; i < 51; i++) {
      await seedAuditRow(baseAuditRow({
        id: `d-${i}`, action: 'ACCESS_DENIED', entity_name: 'clients', entity_id: 'OP-1',
        before_state: null, after_state: null, created_at: now, category: 'access',
        actor_type: 'public', result: 'denied', auth_method: 'none', request_id: `r-${i}`,
        prev_hash: null, record_hash: null,
      }));
    }
    const res = await runAuditMonitor(env());
    expect(res.checked).toBe(true);
    const alert = res.alerts.find((a) => a.includes('ACCESS_DENIED'));
    expect(alert).toBeTruthy();
    expect(alert).toContain('51');

    const n = (mockD1.tables.notifications as any[]).find((x) => x.channel === 'telegram');
    expect(n).toBeTruthy();
    expect(n.body).toContain('51');
    expect((mockD1.tables.staff_alerts as any[]).length).toBeGreaterThan(0);
  });

  it('denied under threshold: 5 ACCESS_DENIED rows → no alert, nothing persisted', async () => {
    const now = Math.floor(Date.now() / 1000);
    for (let i = 0; i < 5; i++) {
      await seedAuditRow(baseAuditRow({
        id: `d-${i}`, action: 'ACCESS_DENIED', created_at: now, category: 'access',
        actor_type: 'public', result: 'denied', prev_hash: null, record_hash: null,
      }));
    }
    const res = await runAuditMonitor(env());
    expect(res.checked).toBe(true);
    expect(res.alerts).toEqual([]);
    expect(mockD1.tables.notifications).toHaveLength(0);
    expect(mockD1.tables.staff_alerts).toHaveLength(0);
  });

  it('audit write failures: 11 recent audit.write runtime logs → telegram alert with the count', async () => {
    (mockD1.tables as any).runtime_logs = [];
    const now = Math.floor(Date.now() / 1000);
    for (let i = 0; i < 11; i++) {
      (mockD1.tables as any).runtime_logs.push({
        id: `rl-${i}`, level: 'error', source: 'audit.write', message: 'audit write failed', detail: null, created_at: now,
      });
    }
    const res = await runAuditMonitor(env());
    expect(res.checked).toBe(true);
    const alert = res.alerts.find((a) => a.toLowerCase().includes('audit write'));
    expect(alert).toBeTruthy();
    expect(alert).toContain('11');
    const n = (mockD1.tables.notifications as any[]).find((x) => x.channel === 'telegram');
    expect(n).toBeTruthy();
    expect(n.subject).toBe('Audit write failures');
  });

  it('audit write failures under threshold: 3 rows → no alert', async () => {
    (mockD1.tables as any).runtime_logs = [];
    const now = Math.floor(Date.now() / 1000);
    for (let i = 0; i < 3; i++) {
      (mockD1.tables as any).runtime_logs.push({
        id: `rl-${i}`, level: 'error', source: 'audit.write', message: 'audit write failed', detail: null, created_at: now,
      });
    }
    const res = await runAuditMonitor(env());
    expect(res.checked).toBe(true);
    expect(res.alerts).toEqual([]);
    expect(mockD1.tables.notifications).toHaveLength(0);
  });

  it('fail-open: env without DB → checked=false with reason, never throws', async () => {
    const res = await runAuditMonitor({} as any);
    expect(res.checked).toBe(false);
    expect(res.alerts).toEqual([]);
    expect(res.reason).toBeTruthy();
  });

  it('fail-open: DB query error → checked=false with reason, never throws', async () => {
    const broken = new MockD1Database();
    broken.prepare = (() => { throw new Error('d1 exploded'); }) as any;
    const res = await runAuditMonitor({ DB: broken as any });
    expect(res.checked).toBe(false);
    expect(res.reason).toBeTruthy();
  });
});
