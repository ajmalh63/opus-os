import { describe, it, expect, beforeEach, vi } from 'vitest';
import app from '../src/index.js';
import { MockD1Database } from './mockDb.js';

vi.mock('../src/auth.js', () => ({
  getAuth: () => ({
    api: {
      getSession: async (options: any) => {
        const cookie = options?.headers?.get('cookie') || '';
        const token = (cookie.match(/better-auth\.session_token=([^;]+)/) || [])[1] || null;
        if (token === 'token-manager') {
          return { user: { id: 'mgr-1', email: 'm@t.com', role: 'manager', userDivisions: '[]' }, session: { id: 's', token, userId: 'mgr-1' } };
        }
        return null;
      },
    },
  }),
}));

// Cal.com config contract: GET returns the saved state (masked secrets + map
// under eventMap), POST returns a server-authoritative `saved` summary so the
// UI can confirm exactly what persisted — no more empty forms after "saved".
describe('Cal.com configuration — saved-state contract', () => {
  let mockD1: MockD1Database;
  const ENV = () => ({ DB: mockD1, BETTER_AUTH_SECRET: 'x' });

  beforeEach(() => {
    mockD1 = new MockD1Database();
  });

  it('GET /api/cal/config returns the full shape with masked api key and updatedAt', async () => {
    mockD1.tables.app_settings.push(
      { key: 'cal_api_key', value: 'cal_live_abcdef123456', updated_at: 111 },
      { key: 'cal_notify_email', value: 'ops@opusoverseas.com', updated_at: 222 },
    );
    const res = await app.request('/api/cal/config', {
      headers: { Cookie: 'better-auth.session_token=token-manager' },
    }, ENV());
    expect(res.status).toBe(200);
    const j = await res.json() as any;
    expect(j.success).toBe(true);
    expect(j.apiKey).toBe('••••••••3456'); // masked, never the raw key
    expect(j.webhookSecret).toBe('');
    expect(j.eventMap).toBeTruthy(); // default event map when unset
    expect(j.bookingLinks).toEqual({});
    expect(j.notifyEmail).toBe('ops@opusoverseas.com');
    expect(j.updatedAt).toBe(222); // max updated_at of the cal_* keys
  });

  it('POST /api/cal/config persists and returns a `saved` summary (masked + confirmation data)', async () => {
    const res = await app.request('/api/cal/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: 'better-auth.session_token=token-manager' },
      body: JSON.stringify({
        apiKey: 'cal_live_abcdef123456',
        webhookSecret: 'whsec_xyz',
        eventTypes: { 'study-abroad': '123', visa: '456' },
        bookingLinks: { 'study-abroad': 'https://cal.com/x/sa' },
        notifyEmail: 'ops@opusoverseas.com',
        notifyWhatsapp: '+919876543210',
      }),
    }, ENV());
    expect(res.status).toBe(200);
    const j = await res.json() as any;
    expect(j.success).toBe(true);
    expect(j.saved.apiKey).toBe('••••••••3456');
    expect(j.saved.webhookSecret).toBe('••••••••_xyz');
    expect(j.saved.eventTypes).toEqual({ 'study-abroad': '123', visa: '456', manpower: '' }); // saved over default map
    expect(j.saved.bookingLinks).toEqual({ 'study-abroad': 'https://cal.com/x/sa' });
    expect(j.saved.notifyEmail).toBe('ops@opusoverseas.com');
    expect(j.saved.notifyWhatsapp).toBe('+919876543210');
    expect(typeof j.updatedAt).toBe('number');

    // Persisted: a follow-up GET sees the same state (eventMap naming on read-back)
    const get = await app.request('/api/cal/config', {
      headers: { Cookie: 'better-auth.session_token=token-manager' },
    }, ENV());
    const gj = await get.json() as any;
    expect(gj.notifyWhatsapp).toBe('+919876543210');
    expect(gj.eventMap).toEqual({ 'study-abroad': '123', visa: '456', manpower: '' });
  });

  it('POST with only some fields preserves the others (no wipe)', async () => {
    mockD1.tables.app_settings.push({ key: 'cal_api_key', value: 'cal_live_keepme', updated_at: 1 });
    const res = await app.request('/api/cal/config', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Cookie: 'better-auth.session_token=token-manager' },
      body: JSON.stringify({ notifyEmail: 'new@opusoverseas.com' }),
    }, ENV());
    const j = await res.json() as any;
    expect(j.saved.apiKey).toBe('••••••••epme'); // existing key still there
    expect(j.saved.notifyEmail).toBe('new@opusoverseas.com');
    expect(j.saved.webhookSecret).toBe('');
  });

  it('cal config routes reject without a session (401)', async () => {
    const res = await app.request('/api/cal/config', {}, ENV());
    expect(res.status).toBe(401);
  });
});