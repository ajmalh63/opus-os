import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { Hono } from 'hono';
import { infraRouter } from '../src/routes/infra.js';
import { MockD1Database } from './mockDb.js';

describe('Infra Router — Docker Overview & Operational Actions', () => {
  let app: Hono<any>;
  let mockD1: MockD1Database;

  beforeEach(() => {
    mockD1 = new MockD1Database();
    app = new Hono();
    app.route('/api/infrastructure', infraRouter);
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('GET /api/infrastructure/docker-overview returns live status when env is configured', async () => {
    (fetch as any)
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'sess_1', name: 'main', status: 'connected', phone: '+919154123456' }]), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify([{ id: 'chat-flow', name: 'Chat Flow', status: 'enabled' }]), { status: 200 }));

    const res = await app.request('/api/infrastructure/docker-overview', {
      method: 'GET',
    }, {
      DB: mockD1 as any,
      OPENWA_BASE_URL: 'https://wa.opusoverseas.com',
      OPENWA_API_KEY: 'test_key',
      ERPNEXT_BASE_URL: 'https://books.opusoverseas.com',
      LISTMONK_BASE_URL: 'https://listmonk.opusoverseas.com',
      CHATWOOT_BASE_URL: 'https://chat.opusoverseas.com',
      UMAMI_BASE_URL: 'https://analytics.opusoverseas.com',
      KUMA_BASE_URL: 'https://status.opusoverseas.com',
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.success).toBe(true);
    expect(data.overview.openwa.state).toBe('live');
    expect(data.overview.openwa.session.phone).toBe('+919154123456');
    expect(data.overview.listmonk.templates).toBe(13);
    expect(data.overview.chatwoot.state).toBe('live');
  });

  it('POST /api/infrastructure/openwa/action test_send dispatches WhatsApp message', async () => {
    (fetch as any).mockResolvedValueOnce(new Response(JSON.stringify({ messageId: 'msg_123' }), { status: 200 }));

    const res = await app.request('/api/infrastructure/openwa/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'test_send',
        to: '+919876543210',
        text: 'Test message',
        humanize: false,
      }),
    }, {
      OPENWA_BASE_URL: 'https://wa.opusoverseas.com',
      OPENWA_API_KEY: 'test_key',
      OPENWA_SESSION_ID: 'main',
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.success).toBe(true);
    expect(data.result.remoteId).toBe('msg_123');
  });

  it('POST /api/infrastructure/listmonk/action test_email dispatches transactional email', async () => {
    (fetch as any).mockResolvedValueOnce(new Response(JSON.stringify({ id: 101 }), { status: 200 }));

    const res = await app.request('/api/infrastructure/listmonk/action', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'test_email',
        email: 'test@example.com',
        kind: 'verify',
      }),
    }, {
      LISTMONK_BASE_URL: 'https://listmonk.opusoverseas.com',
      LISTMONK_API_USER: 'admin',
      LISTMONK_API_PASS: 'pass',
    });

    expect(res.status).toBe(200);
    const data = (await res.json()) as any;
    expect(data.success).toBe(true);
  });
});
