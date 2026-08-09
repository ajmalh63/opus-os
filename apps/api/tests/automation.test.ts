import { describe, it, expect, beforeAll, afterEach, vi } from 'vitest';
import app from '../src/index.js';
import { MockD1Database } from './mockDb.js';

describe('Automation lane (n8n spine, /api/automation)', () => {
  let mockD1: MockD1Database;
  const TOKEN = 'test-token-123';
  const WA_ENV = {
    WA_PROVIDER: 'openwa',
    OPENWA_BASE_URL: 'http://wa:2785',
    OPENWA_API_KEY: 'k',
    OPENWA_SESSION_ID: 'main',
  };

  beforeAll(() => {
    mockD1 = new MockD1Database();
    mockD1.tables.clients.push({ id: 'OP-2026-8001', name: 'X', phone: '+91 98765 43210', email: 'x@b.c', intake_context: JSON.stringify({ targetCountry: 'US' }), created_at: 1, updated_at: 1 });
    mockD1.tables.nurture_touches.push({
      id: 'nt-1', client_id: 'OP-2026-8001', engagement_id: 'eng-8001', channel: 'whatsapp',
      stage: 'value', body: 'Hi {{name}}! US deadlines soon for {{targetCountry}}.', due_at: 1000, status: 'scheduled', created_at: 1, sent_at: null,
    });
    mockD1.tables.nurture_touches.push({
      id: 'nt-2', client_id: 'OP-2026-8001', engagement_id: 'eng-8001', channel: 'whatsapp',
      stage: 'case_study', body: 'A recent case...', due_at: 999999999, status: 'scheduled', created_at: 1, sent_at: null,
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it('fail-closed: no AUTOMATION_TOKEN configured → 503', async () => {
    const res = await app.request('/api/automation/health', {}, { DB: mockD1 });
    expect(res.status).toBe(503);
  });

  it('rejects requests without the service token → 401', async () => {
    const res = await app.request('/api/automation/health', {}, { DB: mockD1, AUTOMATION_TOKEN: TOKEN });
    expect(res.status).toBe(401);
  });

  it('rejects a wrong token → 401', async () => {
    const res = await app.request('/api/automation/health', { headers: { 'X-Service-Token': 'wrong' } }, { DB: mockD1, AUTOMATION_TOKEN: TOKEN });
    expect(res.status).toBe(401);
  });

  it('accepts a valid token → 200 with due touch count', async () => {
    const res = await app.request('/api/automation/health?now=99999', { headers: { 'X-Service-Token': TOKEN } }, { DB: mockD1, AUTOMATION_TOKEN: TOKEN });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.ok).toBe(true);
    expect(data.dueNurtureTouches).toBe(1); // only nt-1 is due (due_at 1000 <= 99999)
  });

  it('nurture/due returns only scheduled-and-due rows', async () => {
    const res = await app.request('/api/automation/nurture/due?now=99999', { headers: { 'X-Service-Token': TOKEN } }, { DB: mockD1, AUTOMATION_TOKEN: TOKEN });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.touches).toHaveLength(1);
    expect(data.touches[0].id).toBe('nt-1');
  });

  it('nurture/:id/send dispatches via WhatsApp provider: personalises, sends, records communication + marks sent', async () => {
    const sendMock = vi.fn(async (url: string, init?: any) => {
      const body = JSON.parse((init as any).body);
      expect(body.chatId).toBe('+91 98765 43210@c.us');
      expect(body.text).toContain('Hi X! US deadlines soon for US.');
      return new Response(JSON.stringify({ messageId: 'WA-1' }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });
    vi.stubGlobal('fetch', sendMock);

    const res = await app.request('/api/automation/nurture/nt-1/send', { method: 'POST', headers: { 'X-Service-Token': TOKEN } }, { DB: mockD1, AUTOMATION_TOKEN: TOKEN, ...WA_ENV });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.status).toBe('sent');
    expect(data.provider).toBe('openwa');

    const row = (mockD1.tables.nurture_touches as any[]).find(t => t.id === 'nt-1');
    expect(row.status).toBe('sent');
    expect(row.sent_at).toBeGreaterThan(0);
    const comm = (mockD1.tables.communications as any[]).find(m => m.body?.includes('US deadlines'));
    expect(comm).toBeTruthy();
    expect(comm.direction).toBe('outgoing');
    expect(comm.channel).toBe('whatsapp');

    // idempotent second call → no re-send
    const sendCalls = sendMock.mock.calls.length;
    const res2 = await app.request('/api/automation/nurture/nt-1/send', { method: 'POST', headers: { 'X-Service-Token': TOKEN } }, { DB: mockD1, AUTOMATION_TOKEN: TOKEN, ...WA_ENV });
    expect(res2.status).toBe(200);
    expect(sendMock.mock.calls.length).toBe(sendCalls);
  });

  it('nurture/:id/send provider failure → 502, touch stays scheduled (retriable)', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ error: 'banned' }), { status: 400, headers: { 'Content-Type': 'application/json' } })));
    const res = await app.request('/api/automation/nurture/nt-2/send', { method: 'POST', headers: { 'X-Service-Token': TOKEN } }, { DB: mockD1, AUTOMATION_TOKEN: TOKEN, ...WA_ENV });
    expect(res.status).toBe(502);
    const row = (mockD1.tables.nurture_touches as any[]).find(t => t.id === 'nt-2');
    expect(row.status).toBe('scheduled');
  });

  it('nurture/:id/send on missing row → 404', async () => {
    const res = await app.request('/api/automation/nurture/nt-nope/send', { method: 'POST', headers: { 'X-Service-Token': TOKEN } }, { DB: mockD1, AUTOMATION_TOKEN: TOKEN });
    expect(res.status).toBe(404);
  });
});