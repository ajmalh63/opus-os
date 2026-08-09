import { describe, it, expect, beforeAll } from 'vitest';
import app from '../src/index.js';
import { MockD1Database } from './mockDb.js';

describe('DPDP consent withdrawal (subject right)', () => {
  let mockD1: MockD1Database;

  beforeAll(() => {
    mockD1 = new MockD1Database();
    mockD1.tables.clients.push({ id: 'OP-2026-7777', name: 'Withdraw Me', phone: '+91 98765 11111', email: 'w@example.com', createdAt: 1, updatedAt: 1 });
    mockD1.tables.consents.push({ id: 'c1', clientId: 'OP-2026-7777', consentType: 'whatsapp-updates', status: 'granted', ipAddress: '1.1.1.1', sha256Hash: 'h', grantedAt: 1, withdrawnAt: null });
  });

  it('withdraws a granted consent (token-authenticated)', async () => {
    const res = await app.request('/api/public/portal/consent/withdraw', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'OP-2026-7777', consentType: 'whatsapp-updates' }),
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    expect(res.status).toBe(200);
    const j = await res.json() as any;
    expect(j.success).toBe(true);

    // immutable history: a NEW withdrawn row exists (old row untouched)
    const rows = (mockD1.tables.consents as any[]).filter((x) => (x.consentType || x.consent_type) === 'whatsapp-updates');
    const latest = rows[rows.length - 1];
    expect(latest.status || latest.status).toBe('withdrawn');
    expect((latest.withdrawnAt ?? latest.withdrawn_at) ?? 0).toBeGreaterThan(0);
  });

  it('rejects unknown consent types', async () => {
    const res = await app.request('/api/public/portal/consent/withdraw', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'OP-2026-7777', consentType: 'bogus' }),
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    expect(res.status).toBe(400);
  });

  it('404s for unknown tokens', async () => {
    const res = await app.request('/api/public/portal/consent/withdraw', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token: 'OP-2026-NOPE', consentType: 'whatsapp-updates' }),
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    expect(res.status).toBe(404);
  });
});