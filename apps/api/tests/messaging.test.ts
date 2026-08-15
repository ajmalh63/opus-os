import { describe, it, expect, beforeAll } from 'vitest';
import app from '../src/index.js';
import { MockD1Database } from './mockDb.js';

describe('Unified messaging (PENDING-CONFIGS #1/#3)', () => {
  let mockD1: MockD1Database;

  beforeAll(() => {
    mockD1 = new MockD1Database();
  });

  it('wa webhook rejects missing secret and accepts valid one', async () => {
    const denied = await app.request('/api/webhooks/wa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-wa-signature': 'wrong' },
      body: JSON.stringify({ from: '919876500001', text: 'hello' }),
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x', WA_WEBHOOK_SECRET: 'whsec-1' });
    expect(denied.status).toBe(403);

    const ok = await app.request('/api/webhooks/wa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-webhook-secret': 'whsec-1' },
      body: JSON.stringify({ from: '919876500001', text: 'hello from wa' }),
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x', WA_WEBHOOK_SECRET: 'whsec-1' });
    expect(ok.status).toBe(200);
    const data = await ok.json() as any;
    expect(data.ok).toBe(true);
    expect(data.count).toBe(1);

    const conv = (mockD1.tables.conversations as any[]).find((c) => c.contact_key === '919876500001');
    expect(conv).toBeTruthy();
    expect(conv.last_message).toBe('hello from wa');
    expect(conv.unread).toBe(1);
  });

  it('wa webhook increments unread on subsequent messages (single conversation)', async () => {
    const res = await app.request('/api/webhooks/wa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-webhook-secret': 'whsec-1' },
      body: JSON.stringify({ from: '919876500001', text: 'second msg' }),
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x', WA_WEBHOOK_SECRET: 'whsec-1' });
    expect(res.status).toBe(200);

    const conv = (mockD1.tables.conversations as any[]).filter((c) => c.contact_key === '919876500001');
    expect(conv.length).toBe(1);
    expect(conv[0].unread).toBe(2);
    expect(conv[0].last_message).toBe('second msg');
  });

  it('chatwoot webhook creates a conversation from sender metadata', async () => {
    const res = await app.request('/api/webhooks/chatwoot', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-webhook-secret': 'whsec-1' },
      body: JSON.stringify({
        event: 'message_created',
        conversation: { meta: { sender: { phone_number: '+919812345678', name: 'Ravi' } } },
        message: { content: 'Need visa help' },
      }),
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x', WA_WEBHOOK_SECRET: 'whsec-1' });
    expect(res.status).toBe(200);

    const conv = (mockD1.tables.conversations as any[]).find((c) => c.contact_name === 'Ravi');
    expect(conv).toBeTruthy();
    expect(conv.last_message).toBe('Need visa help');
    expect(conv.channel).toBe('whatsapp');
  });

  it('wa webhook accepts an OpenWA-style HMAC-SHA256 body signature (x-wa-signature)', async () => {
    const body = JSON.stringify({ id: 'sim-1', sessionId: 'main', event: 'message.received', data: { from: '919876500001', message: { body: 'hmac test' } } });
    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey('raw', enc.encode('whsec-1'), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(body));
    const hex = Array.from(new Uint8Array(sig)).map((b) => b.toString(16).padStart(2, '0')).join('');

    const res = await app.request('/api/webhooks/wa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-wa-signature': hex },
      body,
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x', WA_WEBHOOK_SECRET: 'whsec-1' });
    expect(res.status).toBe(200);

    // Tampered body must be rejected
    const bad = await app.request('/api/webhooks/wa', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-wa-signature': hex.slice(0, 10) },
      body,
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x', WA_WEBHOOK_SECRET: 'whsec-1' });
    expect(bad.status).toBe(403);
  });
});