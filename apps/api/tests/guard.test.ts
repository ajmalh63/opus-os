import { describe, it, expect, beforeEach } from 'vitest';
import app from '../src/index.js';
import { MockD1Database } from './mockDb.js';

vi.mock('../src/auth.js', () => ({
  getAuth: () => ({ api: { getSession: async () => null } }),
}));
import { vi } from 'vitest';

// Guard Contract — the OS send verdict (privacy-by-design, fail-closed).
const TOKEN = 'dev-automation-token-change-me';
let mockD1: MockD1Database;

describe('Guard contract (/api/automation/guard/check)', () => {
  beforeEach(() => {
    mockD1 = new MockD1Database();
    const now = Math.floor(Date.now() / 1000);
    mockD1.tables.clients.push({ id: 'OP-2026-1001', name: 'Client One', phone: '+91 98765 12345', email: 'one@example.com', highest_qualification: 'undergrad', lead_source: 'website', intake_context: null, created_at: now, updated_at: now });
  });

  const env = () => ({ DB: mockD1, AUTOMATION_TOKEN: TOKEN });
  const call = (body: any) => app.request('/api/automation/guard/check', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Service-Token': TOKEN },
    body: JSON.stringify(body),
  }, env());

  it('blocks fired email contacts (hard bounce) — suppression vetoes both purposes', async () => {
    const now = Math.floor(Date.now() / 1000);
    mockD1.tables.listmonk_suppressions.push({ email: 'one@example.com', suppressed: 1, reason: 'hard_bounce', soft_count: 0, created_at: now, updated_at: now });
    for (const purpose of ['marketing', 'transactional']) {
      const res = await call({ channel: 'email', to: 'one@example.com', purpose });
      const d = await res.json() as any;
      expect(res.status).toBe(200);
      expect(d.verdict).toBe('block');
      expect(d.reason).toContain('suppressed');
      expect(d.checks.find((ch: any) => ch.name === 'suppression').passed).toBe(false);
    }
  });

  it('blocks marketing email without live consent (privacy as default)', async () => {
    const res = await call({ channel: 'email', to: 'one@example.com', purpose: 'marketing' });
    const d = await res.json() as any;
    expect(d.verdict).toBe('block');
    expect(d.reason).toContain('consent');
  });

  it('allows marketing email with live consent; blocks when withdrawn', async () => {
    const now = Math.floor(Date.now() / 1000);
    mockD1.tables.consents.push({ id: 'c1', client_id: 'OP-2026-1001', consent_type: 'marketing-campaigns', status: 'granted', ip_address: 'x', sha256_hash: 'h', granted_at: now, withdrawn_at: null });
    let d = await (await call({ channel: 'email', to: 'one@example.com' })).json() as any;
    expect(d.verdict).toBe('allow');

    mockD1.tables.consents[0].status = 'withdrawn';
    mockD1.tables.consents[0].withdrawn_at = now + 1;
    d = await (await call({ channel: 'email', to: 'one@example.com' })).json() as any;
    expect(d.verdict).toBe('block');
    expect(d.reason).toContain('consent');
  });

  it('whatsapp: consent-gated with whatsapp-updates; blocked without', async () => {
    const now = Math.floor(Date.now() / 1000);
    mockD1.tables.consents.push({ id: 'c2', client_id: 'OP-2026-1001', consent_type: 'whatsapp-updates', status: 'granted', ip_address: 'x', sha256_hash: 'h', granted_at: now, withdrawn_at: null });
    let d = await (await call({ channel: 'whatsapp', to: '+91 98765 12345' })).json() as any;
    expect(d.verdict).toBe('allow');

    mockD1.tables.consents[0].status = 'withdrawn';
    d = await (await call({ channel: 'whatsapp', to: '+91 98765 12345' })).json() as any;
    expect(d.verdict).toBe('block');
  });

  it('transactional bypasses consent but not validity/suppression', async () => {
    const d = await (await call({ channel: 'email', to: 'one@example.com', purpose: 'transactional' })).json() as any;
    expect(d.verdict).toBe('allow'); // suppression empty + transactional → allow
    expect(d.checks.find((ch: any) => ch.name === 'consent').detail).toBe('transactional_purpose_bypass');

    const bad = await (await call({ channel: 'email', to: 'not-an-email' })).json() as any;
    expect(bad.verdict).toBe('block');
    expect(bad.reason).toBe('invalid_contact');
  });

  it('OS-unknown contacts are informational allow (no OS knowledge = no veto)', async () => {
    const d = await (await call({ channel: 'email', to: 'stranger@external.com' })).json() as any;
    expect(d.verdict).toBe('allow');
    expect(d.reason).toBe('no_os_profile');
  });

  it('fail-closed auth: no service token → 401; wrong token → 401', async () => {
    const noAuth = await app.request('/api/automation/guard/check', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }, env());
    expect(noAuth.status).toBe(401);
    const wrongAuth = await app.request('/api/automation/guard/check', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Service-Token': 'wrong' }, body: '{}' }, env());
    expect(wrongAuth.status).toBe(401);
  });

  it('every verdict writes an audit record (sanitized: no raw contact)', async () => {
    await call({ channel: 'email', to: 'one@example.com', purpose: 'marketing' });
    const audit = mockD1.tables.audit_log.find((a: any) => String(a.action || '').startsWith('GUARD_'));
    expect(audit).toBeTruthy();
    const state = JSON.stringify(audit.after_state || audit.afterState || '');
    expect(state).not.toContain('one@example.com');
    expect(state).toContain('consent');
  });
});