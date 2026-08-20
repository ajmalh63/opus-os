import { describe, it, expect, beforeEach, vi } from 'vitest';
import app from '../src/index.js';
import { MockD1Database } from './mockDb.js';
import { verifyChain } from '../../../scripts/audit-chain-verify.mjs';
import { redactPayload, categoryForAction } from '../src/middleware/audit.js';

vi.mock('../src/auth.js', () => ({
  getAuth: () => ({
    api: {
      getSession: async (options: any) => {
        const cookie = options?.headers?.get('cookie') || '';
        const token = (cookie.match(/better-auth\.session_token=([^;]+)/) || [])[1] || null;
        if (token === 'token-admin') {
          return { user: { id: 'admin-1', email: 'admin@test.com', role: 'super_admin', userDivisions: '[]' }, session: { id: 's', token, userId: 'admin-1' } };
        }
        return null;
      },
    },
  }),
}));

describe('Gold-standard audit chain (v1.1 — docs/audit-logging-gold-standard.md)', () => {
  let mockD1: MockD1Database;

  beforeEach(() => {
    mockD1 = new MockD1Database();
  });

  async function writeRule(extraHeaders: Record<string, string> = {}) {
    return app.request('/api/incentives/rules', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': 'better-auth.session_token=token-admin', ...extraHeaders },
      body: JSON.stringify({ division: 'umrah', trigger: 'milestone_paid', amount: 50000 }),
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
  }

  it('first event: GENESIS prev_hash + 64-hex record_hash + v1.1 metadata', async () => {
    const res = await writeRule({ 'CF-Ray': 'ray-123' });
    expect(res.status).toBe(200);
    const row = (mockD1.tables.audit_log as any[])[0];
    expect(row.prev_hash).toBe('GENESIS');
    expect(row.record_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(row.schema_version).toBe('1.1');
    expect(row.category).toBe('money'); // INCENTIVE_RULE_CREATED → money
    expect(row.actor_type).toBe('user');
    expect(row.result).toBe('success');
    expect(row.request_id).toBe('ray-123');
  });

  it('second event chains to the first (prev_hash = first record_hash)', async () => {
    await writeRule();
    await writeRule();
    const rows = mockD1.tables.audit_log as any[];
    expect(rows.length).toBe(2);
    expect(rows[1].prev_hash).toBe(rows[0].record_hash);
    expect(rows[1].record_hash).not.toBe(rows[0].record_hash);
  });

  it('verifyChain: valid chain passes; tampered middle row breaks at the next row', async () => {
    await writeRule();
    await writeRule();
    await writeRule();
    const rows = mockD1.tables.audit_log as any[];

    const ok = verifyChain(rows);
    expect(ok.valid).toBe(true);
    expect(ok.total).toBe(3);

    // Tamper: rewrite the middle row's after_state (simulates a DBA edit).
    // The break is detected AT the tampered row — its record_hash no longer
    // matches the recomputed hash of its own (modified) payload.
    rows[1].after_state = JSON.stringify({ amount: 999999 });
    const broken = verifyChain(rows);
    expect(broken.valid).toBe(false);
    expect(broken.firstBreak).toBe(1);
  });

  it('verifyChain detects deletion (gap in the chain)', async () => {
    await writeRule();
    await writeRule();
    await writeRule();
    const rows = mockD1.tables.audit_log as any[];
    rows.splice(1, 1); // delete middle row
    const broken = verifyChain(rows);
    expect(broken.valid).toBe(false);
  });

  it('redactPayload strips sensitive keys recursively', () => {
    const out = redactPayload({
      name: 'X',
      password: 'hunter2',
      nested: { apiToken: 'tok-abc', bankAccount: '50100123456789', ok: 1 },
      list: [{ passportNumber: 'P1234567' }, { fine: true }],
    }) as any;
    expect(out.password).toBe('[REDACTED]');
    expect(out.nested.apiToken).toBe('[REDACTED]');
    expect(out.nested.bankAccount).toBe('[REDACTED]');
    expect(out.nested.ok).toBe(1);
    expect(out.list[0].passportNumber).toBe('[REDACTED]');
    expect(out.list[1].fine).toBe(true);
  });

  it('categoryForAction maps the known taxonomy', () => {
    expect(categoryForAction('PAYMENT_ENTER')).toBe('money');
    expect(categoryForAction('AGREEMENT_SIGNED')).toBe('compliance');
    expect(categoryForAction('LEAD_CREATED')).toBe('lead');
    expect(categoryForAction('DOC_UPLOAD')).toBe('document');
    expect(categoryForAction('PARTNER_REGISTERED')).toBe('partner');
    expect(categoryForAction('STAGE_CHANGE')).toBe('workflow');
    expect(categoryForAction('NURTURE_DISPATCHED')).toBe('communication');
    expect(categoryForAction('SETTINGS_UPDATED')).toBe('config');
    expect(categoryForAction('TWO_FACTOR_ENABLED')).toBe('auth');
    expect(categoryForAction('ACCESS_DENIED')).toBe('access');
    expect(categoryForAction('HEARTBEAT')).toBe('system');
  });

  it('auditSystem (cron) writes actor_type=system with a chained hash', async () => {
    mockD1.tables.clients.push({ id: 'OP-2026-8001', portal_token: 'OP-2026-8001', name: 'X', phone: '+91 98765 43210', email: 'x@b.c', created_at: 1, updated_at: 1 });
    mockD1.tables.nurture_touches.push({
      id: 'nt-cron', client_id: 'OP-2026-8001', engagement_id: 'eng-8001', channel: 'whatsapp',
      stage: 'value', body: 'Hi {{name}}!', due_at: 1, status: 'scheduled', created_at: 1, sent_at: null,
    });
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ messageId: 'WA-CRON' }), { status: 200, headers: { 'Content-Type': 'application/json' } })));
    const env = { DB: mockD1, OPENWA_BASE_URL: 'http://wa:2785', OPENWA_API_KEY: 'k', OPENWA_SESSION_ID: 'main' };
    await (app as any).scheduled(null, env, {});

    const row = (mockD1.tables.audit_log as any[]).find((l: any) => l.action === 'NURTURE_DISPATCHED');
    expect(row).toBeTruthy();
    expect(row.actor_type).toBe('system');
    expect(row.auth_method).toBe('none');
    expect(row.category).toBe('communication');
    expect(row.prev_hash).toBe('GENESIS'); // first audit row in this DB
    expect(row.record_hash).toMatch(/^[0-9a-f]{64}$/);
    vi.unstubAllGlobals();
  });
});