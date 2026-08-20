import { describe, it, expect, beforeEach } from 'vitest';
import app from '../src/index.js';
import { MockD1Database } from './mockDb.js';

// Dual-key webhook acceptance: after rotation the PREVIOUS secret must still
// verify until the provider (cal.com) syncs the new one.
async function sign(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

describe('Cal.com webhook — dual-key verification after rotation', () => {
  let mockD1: MockD1Database;

  beforeEach(() => {
    mockD1 = new MockD1Database();
    mockD1.tables.app_settings.push(
      { key: 'cal_webhook_secret', value: 'whsec_new_after_rotation', updated_at: 1 },
      { key: 'cal_webhook_secret_prev', value: 'whsec_old_before_rotation', updated_at: 1 },
    );
  });

  const payload = JSON.stringify({
    triggerEvent: 'BOOKING_CREATED_TEST',
    payload: { uid: 'dual-key-test-1', eventType: { id: 6684819 }, title: 'T', startTime: '2030-01-01T10:00:00Z', endTime: '2030-01-01T10:30:00Z', attendees: [{ name: 'X', email: 'x@example.com', phone: '+911234567890' }] },
  });

  it('accepts a webhook signed with the NEW (current) secret', async () => {
    const sig = await sign('whsec_new_after_rotation', payload);
    const res = await app.request('/api/webhooks/cal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Cal-Signature-256': sig },
      body: payload,
    }, { DB: mockD1, BETTER_AUTH_SECRET: 's' });
    expect(res.status).toBe(200);
  });

  it('accepts a webhook signed with the OLD (previous) secret during the overlap window', async () => {
    const sig = await sign('whsec_old_before_rotation', payload);
    const res = await app.request('/api/webhooks/cal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Cal-Signature-256': sig },
      body: payload,
    }, { DB: mockD1, BETTER_AUTH_SECRET: 's' });
    expect(res.status).toBe(200);
  });

  it('rejects a forged signature', async () => {
    const res = await app.request('/api/webhooks/cal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Cal-Signature-256': 'deadbeef'.repeat(8) },
      body: payload,
    }, { DB: mockD1, BETTER_AUTH_SECRET: 's' });
    expect(res.status).toBe(401);
  });

  it('fail-closed when no secret is configured', async () => {
    mockD1.tables.app_settings = mockD1.tables.app_settings.filter((r: any) => !r.key.startsWith('cal_webhook_secret'));
    const res = await app.request('/api/webhooks/cal', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: payload,
    }, { DB: mockD1, BETTER_AUTH_SECRET: 's' });
    expect(res.status).toBe(503);
  });
});
