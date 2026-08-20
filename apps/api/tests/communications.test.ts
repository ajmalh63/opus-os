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
          if (token === 'token-manager') {
            return {
              user: { id: 'u-mgr', name: 'QA Manager', email: 'm@t.com', role: 'manager', userDivisions: '[]' },
              session: { id: 's-1', token, userId: 'u-mgr' },
            };
          }
          return null;
        },
      },
    }),
  };
});

describe('Client communications timeline (interconnect: Client360 send-message)', () => {
  let mockD1: MockD1Database;

  beforeAll(() => {
    mockD1 = new MockD1Database();
    mockD1.tables.clients.push({
      id: 'OP-2026-7001',
      portal_token: 'OP-2026-7001', name: 'Timeline Client', phone: '1', email: 't@x.com',
      created_at: 1, updated_at: 1,
    });
    mockD1.tables.engagements.push({
      id: 'eng-1', client_id: 'OP-2026-7001', division: 'study-abroad', title: 'US',
      stage_key: 'lead', status: 'active', created_at: 1, updated_at: 1, outstanding_balance: 0,
    });
  });

  it('POST /api/clients/:id/communications persists an outgoing timeline entry (no more stub)', async () => {
    const res = await app.request('/api/clients/OP-2026-7001/communications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': 'better-auth.session_token=token-manager' },
      body: JSON.stringify({ channel: 'whatsapp', direction: 'outgoing', subject: 'Visa docs', body: 'Sent blocked-account confirmation guide.' }),
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.success).toBe(true);
    expect(data.id).toBeTruthy();

    const row = mockD1.tables.communications.find((c: any) => c.id === data.id);
    expect(row).toBeTruthy();
    expect(row.client_id).toBe('OP-2026-7001');
    expect(row.sender_id).toBe('u-mgr'); // resolved from session, not hardcoded
    expect(row.channel).toBe('whatsapp');
    expect(row.body).toContain('blocked-account');
  });

  it('validates payload and 404s on unknown client', async () => {
    const bad = await app.request('/api/clients/OP-2026-7001/communications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': 'better-auth.session_token=token-manager' },
      body: JSON.stringify({ channel: 'nope', body: '' }),
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(bad.status).toBe(400);

    const nf = await app.request('/api/clients/OP-2026-9999/communications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': 'better-auth.session_token=token-manager' },
      body: JSON.stringify({ channel: 'note', body: 'hi' }),
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(nf.status).toBe(404);
  });

  it('existing client GET returns the new timeline entry (read path wired)', async () => {
    const res = await app.request('/api/clients/OP-2026-7001', {
      headers: { 'Cookie': 'better-auth.session_token=token-manager' },
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(res.status).toBe(200);
    const body = await res.json() as any;
    const timeline = Array.isArray(body.timeline) ? body.timeline : [];
    expect(timeline.length).toBeGreaterThanOrEqual(1);
  });
});