import { describe, it, expect, vi } from 'vitest';
import { sendNotification } from '../src/infra/notify.js';

// Minimal fake DB recording inserted rows (mimics Drizzle run() interface).
function fakeDb() {
  const inserted: any[] = [];
  return {
    inserted,
    insert() {
      return { values: (v: any) => ({ run: async () => { inserted.push(v); return { success: true }; } }) };
    },
  };
}

describe('Notification engine (§7.6)', () => {
  const env = { WA_PROVIDER: 'openwa', OPENWA_BASE_URL: 'http://wa:2785', OPENWA_API_KEY: 'k', OPENWA_SESSION_ID: 'main' } as any;

  it('whatsapp send persists a sent log row (OpenWA mocked)', async () => {
    const db = fakeDb();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({ messageId: 'WA-x1' }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    })));
    const res = await sendNotification(env, db as any, { channel: 'whatsapp', to: '+91 98765 43210', body: 'Hi!', clientId: 'OP-1' });
    expect(res.ok).toBe(true);
    expect(res.provider).toBe('openwa');
    expect(res.notificationId).toBeTruthy();
    expect(db.inserted).toHaveLength(1);
    const row = db.inserted[0];
    expect(row.status).toBe('sent');
    expect(row.channel).toBe('whatsapp');
    expect(row.clientId).toBe('OP-1');
    expect(row.sentAt).toBeGreaterThan(0);
  });

  it('email without EMAIL binding stubs as sent + logged', async () => {
    const db = fakeDb();
    const res = await sendNotification({} as any, db as any, { channel: 'email', to: 'a@b.com', subject: 'Test', body: 'Body' });
    expect(res.ok).toBe(true);
    expect(res.provider).toBe('stub-email');
    const row = db.inserted[0];
    expect(row.status).toBe('sent');
    expect(row.subject).toBe('Test');
  });

  it('sms is unprovisioned → failed + logged', async () => {
    const db = fakeDb();
    const res = await sendNotification({} as any, db as any, { channel: 'sms', to: '+91 90000 00000', body: 'otp' });
    expect(res.ok).toBe(false);
    expect(res.reason).toContain('SMS adapter not configured');
    const row = db.inserted[0];
    expect(row.status).toBe('failed');
    expect(row.error).toBeTruthy();
  });

  it('whatsapp provider failure → failed log row', async () => {
    const db = fakeDb();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('err', { status: 400 })));
    const res = await sendNotification(env, db as any, { channel: 'whatsapp', to: '+91 98765 43210', body: 'x' });
    expect(res.ok).toBe(false);
    const row = db.inserted[0];
    expect(row.status).toBe('failed');
    expect(row.sentAt).toBeNull();
  });
});