import { describe, it, expect, beforeEach } from 'vitest';
import app from '../src/index.js';
import { MockD1Database } from './mockDb.js';

vi.mock('../src/auth.js', () => ({
  getAuth: () => ({ api: { getSession: async () => null } }),
}));
import { vi } from 'vitest';

// Wave 3 — Listmonk webhook consumer: DPDP-aligned email hygiene.
const SECRET = 'lm-secret';

function post(path: string, body: any, env: any) {
  return app.request(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Webhook-Secret': SECRET },
    body: JSON.stringify(body),
  }, env);
}

describe('Listmonk webhook consumer', () => {
  let mockD1: MockD1Database;

  beforeEach(() => {
    mockD1 = new MockD1Database();
    mockD1.tables.clients.push({ id: 'OP-2026-1001', portal_token: 'OP-2026-1001', name: 'Client One', phone: '+91 98765 12345', email: 'one@example.com', highest_qualification: 'undergrad', lead_source: 'website', intake_context: null, created_at: 0, updated_at: 0 });
  });

  const env = () => ({ DB: mockD1, LISTMONK_WEBHOOK_SECRET: SECRET });

  it('fail-closed: 503 when the secret is unconfigured', async () => {
    const res = await app.request('/api/webhooks/listmonk', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' }, { DB: mockD1 });
    expect(res.status).toBe(503);
  });

  it('rejects a bad secret (401)', async () => {
    const res = await app.request('/api/webhooks/listmonk', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Webhook-Secret': 'wrong' }, body: '{}' }, env());
    expect(res.status).toBe(401);
  });

  it('hard bounce → suppressed immediately + delivery logged', async () => {
    const res = await post('/api/webhooks/listmonk', {
      event: 'bounce',
      data: { Subscriber: { email: 'One@Example.COM' }, Bounce: { type: 'hard', description: '550 5.1.1' } },
    }, env());
    expect(res.status).toBe(200);

    const row = mockD1.tables.listmonk_suppressions.find((s) => s.email === 'one@example.com');
    expect(row).toBeTruthy();
    expect(row.suppressed).toBeTruthy();
    expect(row.reason).toBe('hard_bounce');
    // A-3: delivery logged
    expect(mockD1.tables.webhook_events.some((e) => e.id === 'listmonk:bounce:one@example.com')).toBe(true);
  });

  it('soft bounces suppress on the 3rd (1→not, 2→not, 3→suppressed)', async () => {
    for (let i = 1; i <= 2; i++) {
      await post('/api/webhooks/listmonk', { event: 'bounce', data: { Subscriber: { email: 'softy@example.com' }, Bounce: { type: 'soft', description: '451' } } }, env());
    }
    let row = mockD1.tables.listmonk_suppressions.find((s) => s.email === 'softy@example.com');
    expect(row.softCount).toBe(2);
    expect(row.suppressed).toBeFalsy();

    await post('/api/webhooks/listmonk', { event: 'bounce', data: { Subscriber: { email: 'softy@example.com' }, Bounce: { type: 'soft', description: '451' } } }, env());
    row = mockD1.tables.listmonk_suppressions.find((s) => s.email === 'softy@example.com');
    expect(row.softCount).toBe(3);
    expect(row.suppressed).toBeTruthy();
    expect(row.reason).toBe('soft_bounce_3x');
  });

  it('unsubscribe → suppressed (DPDP intent of record)', async () => {
    await post('/api/webhooks/listmonk', { event: 'unsubscribe', data: { Subscriber: { email: 'bye@example.com' } } }, env());
    const row = mockD1.tables.listmonk_suppressions.find((s) => s.email === 'bye@example.com');
    expect(row.suppressed).toBeTruthy();
    expect(row.reason).toBe('unsubscribed');
  });

  it('re-subscribe clears the suppression (suppressed=false, reason reset)', async () => {
    await post('/api/webhooks/listmonk', { event: 'unsubscribe', data: { Subscriber: { email: 'back@example.com' } } }, env());
    await post('/api/webhooks/listmonk', { event: 'subscribe', data: { Subscriber: { email: 'back@example.com' } } }, env());
    const row = mockD1.tables.listmonk_suppressions.find((s) => s.email === 'back@example.com');
    expect(row).toBeTruthy();
    expect(row.suppressed).toBeFalsy();
    expect(row.reason).toBeNull();
  });

  it('nurture/due excludes email-channel touches for suppressed subscribers', async () => {
    const now = Math.floor(Date.now() / 1000);
    mockD1.tables.nurture_touches.push(
      { id: 't-1', client_id: 'OP-2026-1001', channel: 'email', stage: 'value', body: 'hi', due_at: now - 10, status: 'scheduled', created_at: 0, engagement_id: null, campaign_id: null, sent_at: null },
      { id: 't-2', client_id: 'OP-2026-1001', channel: 'whatsapp', stage: 'value', body: 'hi', due_at: now - 10, status: 'scheduled', created_at: 0, engagement_id: null, campaign_id: null, sent_at: null },
    );
    mockD1.tables.listmonk_suppressions.push({ email: 'one@example.com', suppressed: 1, reason: 'hard_bounce', soft_count: 0, created_at: now, updated_at: now });

    const res = await app.request('/api/automation/nurture/due', {
      headers: { 'X-Service-Token': 'dev-automation-token-change-me' },
    }, { DB: mockD1, AUTOMATION_TOKEN: 'dev-automation-token-change-me' });
    const data = await res.json() as any;
    const ids = data.touches.map((t: any) => t.id);
    expect(ids).toEqual(['t-2']); // email touch suppressed, whatsapp stays
  });
});