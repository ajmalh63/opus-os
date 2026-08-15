import { describe, it, expect, beforeEach, vi } from 'vitest';
import app from '../src/index.js';
import { MockD1Database } from './mockDb.js';

vi.mock('../src/auth.js', () => ({
  getAuth: () => ({ api: { getSession: async () => null } }),
}));

const TOKEN = 'dev-automation-token-change-me';
let mockD1: MockD1Database;

describe('Nurture email lane (Wave 3)', () => {
  const ENV = () => ({
    DB: mockD1, AUTOMATION_TOKEN: TOKEN,
    LISTMONK_BASE_URL: 'http://100.87.71.38:9009',
    LISTMONK_API_USER: 'admin@opusoverseas.com',
    LISTMONK_API_PASS: 'pw',
  });

  beforeEach(() => {
    mockD1 = new MockD1Database();
    const now = Math.floor(Date.now() / 1000);
    mockD1.tables.clients.push({
      id: 'OP-2026-1001', name: 'Client One', phone: '+91 98765 12345', email: 'one@example.com',
      highest_qualification: 'undergrad', lead_source: 'website', intake_context: JSON.stringify({ targetCountry: 'Canada' }),
      created_at: now - 86400, updated_at: now,
    });
    mockD1.tables.consents.push({
      id: 'c1', client_id: 'OP-2026-1001', consent_type: 'marketing-campaigns', status: 'granted',
      ip_address: '127.0.0.1', sha256_hash: 'x', granted_at: now - 86400, withdrawn_at: null,
    });
    mockD1.tables.nurture_touches.push({
      id: 't-email', client_id: 'OP-2026-1001', channel: 'email', stage: 'case_study',
      body: 'Hi {{name}}, here is the {{targetCountry}} case study.', campaign_id: null,
      due_at: now - 10, status: 'scheduled', sent_at: null, created_at: now - 86400, engagement_id: null,
    });
  });

  const mockListmonk = () => {
    const txBodies: any[] = [];
    global.fetch = vi.fn(async (url: any, opts: any) => {
      const u = String(url);
      if (u.includes('/api/subscribers')) return new Response(JSON.stringify({ data: { id: 7 } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
      if (u.includes('/api/tx')) { txBodies.push(JSON.parse(opts?.body || '{}')); return new Response(JSON.stringify({ data: { id: 99 } }), { status: 200, headers: { 'Content-Type': 'application/json' } }); }
      return new Response('{}', { status: 404 });
    }) as any;
    return txBodies;
  };

  it('email touch → dispatched through Listmonk /api/tx, personalized, marked sent', async () => {
    const txBodies = mockListmonk();
    const res = await app.request('/api/automation/nurture/t-email/send', { method: 'POST', headers: { 'X-Service-Token': TOKEN } }, ENV());
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.status).toBe('sent');
    expect(data.provider).toBe('listmonk');

    // /api/tx contract: subscriber + subject + personalized body
    expect(txBodies).toHaveLength(1);
    expect(txBodies[0].subscriber_email).toBe('one@example.com');
    expect(txBodies[0].headers.subject).toBe('nurture:default:case_study');
    expect(txBodies[0].template_body).toContain('Hi Client One, here is the Canada case study.');

    // durable records: communications row (channel email) + touch flipped
    const comm = mockD1.tables.communications.find((c) => c.channel === 'email');
    expect(comm).toBeTruthy();
    expect(comm.body).toContain('Canada');
    expect(mockD1.tables.nurture_touches.find((t) => t.id === 't-email').status).toBe('sent');
    expect(mockD1.tables.notifications.some((n) => n.channel === 'email' && n.to === 'one@example.com' && n.status === 'sent')).toBe(true);
  });

  it('withdrawn marketing consent → skipped, nothing sent', async () => {
    mockD1.tables.consents[0].status = 'withdrawn';
    const fn = vi.fn(async () => new Response('{}', { status: 404 })) as any;
    global.fetch = fn;
    const res = await app.request('/api/automation/nurture/t-email/send', { method: 'POST', headers: { 'X-Service-Token': TOKEN } }, ENV());
    const data = await res.json() as any;
    expect(data.status).toBe('skipped');
    expect(data.reason).toContain('consent');
    expect(mockD1.tables.nurture_touches.find((t) => t.id === 't-email').status).toBe('skipped');
    expect(fn).not.toHaveBeenCalled();
  });

  it('suppressed subscriber at send time → skipped, nothing sent', async () => {
    const now = Math.floor(Date.now() / 1000);
    mockD1.tables.listmonk_suppressions.push({ email: 'one@example.com', suppressed: 1, reason: 'hard_bounce', soft_count: 0, created_at: now, updated_at: now });
    const fn = vi.fn(async () => new Response('{}', { status: 404 })) as any;
    global.fetch = fn;
    const res = await app.request('/api/automation/nurture/t-email/send', { method: 'POST', headers: { 'X-Service-Token': TOKEN } }, ENV());
    const data = await res.json() as any;
    expect(data.status).toBe('skipped');
    expect(data.reason).toContain('suppressed');
    expect(fn).not.toHaveBeenCalled();
  });

  it('client without email → 400, touch stays scheduled', async () => {
    mockD1.tables.clients[0].email = null;
    const res = await app.request('/api/automation/nurture/t-email/send', { method: 'POST', headers: { 'X-Service-Token': TOKEN } }, ENV());
    expect(res.status).toBe(400);
    expect(mockD1.tables.nurture_touches.find((t) => t.id === 't-email').status).toBe('scheduled');
  });
});