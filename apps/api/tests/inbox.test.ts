import { describe, it, expect, beforeAll, vi } from 'vitest';
import app from '../src/index.js';
import { MockD1Database } from './mockDb.js';

vi.mock('../src/auth.js', () => {
  return {
    getAuth: () => ({
      api: {
        getSession: async (options: any) => {
          const cookieHeader = options?.headers?.get('cookie') || '';
          const token = (cookieHeader.match(/better-auth\.session_token=([^;]+)/) || [])[1] || null;
          if (token === 'token-counselor') {
            return {
              user: { id: 'u-counselor', name: 'QA Counselor', email: 'c@t.com', role: 'counselor', userDivisions: '["study-abroad"]' },
              session: { id: 's-1', token, userId: 'u-counselor' },
            };
          }
          return null;
        },
      },
    }),
  };
});

describe('Staff unified inbox (OpenWA/Chatwoot surface)', () => {
  let mockD1: MockD1Database;

  beforeAll(() => {
    mockD1 = new MockD1Database();
    mockD1.tables.conversations.push(
      { id: 'conv-1', channel: 'whatsapp', remote_id: 'whatsapp:919876543201', contactKey: '919876543201', contactName: 'Ayesha', lastMessage: 'Is my visa ready?', lastMessageAt: 1754150000, unread: 2, status: 'open', createdAt: 1754150000 },
      { id: 'conv-2', channel: 'webchat', remote_id: 'webchat:web-1', contactKey: 'web-1', contactName: 'Web Visitor', lastMessage: 'Hi, pricing?', lastMessageAt: 1754151000, unread: 0, status: 'open', createdAt: 1754151000 }
    );
mockD1.tables.communications.push(
      { id: 'msg-1', clientId: null, senderId: null, channel: 'whatsapp', direction: 'incoming', subject: 'whatsapp:919876543201', body: 'Is my visa ready?', createdAt: 1754150000 }
    );
  });

  it('GET /api/inbox lists conversations with unread total', async () => {
    const res = await app.request('/api/inbox', {
      headers: { 'Cookie': 'better-auth.session_token=token-counselor' },
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.conversations.length).toBe(2);
    expect(data.unreadTotal).toBe(2);
    expect(data.conversations[0].contactName).toBe('Ayesha');
  });

  it('GET /api/inbox/:id/thread returns messages and clears unread', async () => {
    const res = await app.request('/api/inbox/conv-1/thread', {
      headers: { 'Cookie': 'better-auth.session_token=token-counselor' },
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.messages.length).toBe(1);
    expect(data.messages[0].direction).toBe('incoming');

    const conv = mockD1.tables.conversations.find((c: any) => c.id === 'conv-1');
    expect(conv.unread).toBe(0);
  });

  it('POST /api/inbox/:id/reply logs outgoing thread message (gateway dispatch attempted)', async () => {
    const res = await app.request('/api/inbox/conv-1/reply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': 'better-auth.session_token=token-counselor' },
      body: JSON.stringify({ body: 'Your visa is in final processing â€” expect an update tomorrow.' }),
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret', WA_PROVIDER: 'openwa', OPENWA_BASE_URL: 'inval.d:1' });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);

    const msgs = mockD1.tables.communications as any[];
const reply = msgs.find((m) => m.body.includes('final processing'));
    expect(reply).toBeTruthy();
    expect(reply.direction).toBe('outgoing');
    expect(reply.subject).toBe('whatsapp:919876543201');
    expect([reply.sender_id, reply.senderId]).toContain('u-counselor');

    const conv = mockD1.tables.conversations.find((c: any) => c.id === 'conv-1');
    expect(conv.lastMessage).toContain('final processing');
  });
});


