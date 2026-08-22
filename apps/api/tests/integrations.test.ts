import { describe, it, expect, beforeEach, vi } from 'vitest';
import app from '../src/index.js';
import { MockD1Database } from './mockDb.js';

vi.mock('../src/auth.js', () => ({
  getAuth: () => ({
    api: {
      getSession: async (options: any) => {
        const token = (options?.headers?.get('cookie') || '').match(/better-auth\.session_token=([^;]+)/)?.[1] || null;
        const users: Record<string, any> = {
          'token-manager': { id: 'mgr-1', name: 'M', email: 'm@t.com', role: 'manager', userDivisions: JSON.stringify([]) },
          'token-counselor': { id: 'c-1', name: 'C', email: 'c@t.com', role: 'counselor', userDivisions: JSON.stringify([]) },
        };
        const u = users[token || ''];
        return u ? { user: u, session: { id: 's', token, userId: u.id } } : null;
      }
    }
  })
}));

let mockD1: MockD1Database;

describe('Tool-First integrations (status + live feed)', () => {
  beforeEach(() => {
    mockD1 = new MockD1Database();
    const now = Math.floor(Date.now() / 1000);
    // A-3 event log with recent Listmonk deliveries (the normalized feed source)
    mockD1.tables.webhook_events.push(
      { id: 'listmonk:bounce:one@x.com', event: 'listmonk.bounce', entity_id: 'one@x.com', signature: 's', received_at: now - 60, processed: 1, detail: 'suppressed: hard_bounce' },
      { id: 'listmonk:unsubscribe:two@x.com', event: 'listmonk.unsubscribe', entity_id: 'two@x.com', signature: 's', received_at: now - 300, processed: 1, detail: 'suppressed: unsubscribed' },
    );
  });

  const env = () => ({ DB: mockD1, BETTER_AUTH_SECRET: 's' });

  it('status: every tool reports unconfigured until envs are set (fail-open informational)', async () => {
    const res = await app.request('/api/integrations/status', { headers: { cookie: 'better-auth.session_token=token-manager' } }, env());
    expect(res.status).toBe(200);
    const d = await res.json() as any;
    const states = d.tools.map((t: any) => t.status.state);
    expect(states).toEqual(['unconfigured', 'unconfigured', 'unconfigured', 'unconfigured']);
    expect(d.tools.map((t: any) => t.tool).sort()).toEqual(['chatwoot', 'listmonk', 'mautic', 'openwa']);
  });

  it('status: configured-but-unreachable tools surface as error with summary', async () => {
    global.fetch = vi.fn(async () => new Response('{}', { status: 500 })) as any;
    const res = await app.request('/api/integrations/status', {
      headers: { cookie: 'better-auth.session_token=token-manager' },
    }, { DB: mockD1, BETTER_AUTH_SECRET: 's', LISTMONK_BASE_URL: 'https://listmonk.opusoverseas.com', LISTMONK_API_USER: 'u', LISTMONK_API_PASS: 'p' });
    const d = await res.json() as any;
    const lm = d.tools.find((t: any) => t.tool === 'listmonk');
    expect(lm.status.state).toBe('error');
    expect(lm.status.summary).toContain('fetch failed');
  });

  it('live: recent A-3 webhook events appear in the unified feed (near-real-time)', async () => {
    const res = await app.request('/api/integrations/live', { headers: { cookie: 'better-auth.session_token=token-manager' } }, env());
    const d = await res.json() as any;
    expect(d.ok).toBe(true);
    const listmonkEvents = d.feed.filter((f: any) => f.tool === 'listmonk' && f.kind === 'event');
    expect(listmonkEvents.length).toBe(2);
    expect(listmonkEvents[0].id).toBe('listmonk:bounce:one@x.com');
    expect(d.feed[0].at).toBeGreaterThanOrEqual(d.feed[d.feed.length - 1].at); // sorted desc
  });

  it('rejects non-manager (fail-closed)', async () => {
    const res = await app.request('/api/integrations/status', { headers: { cookie: 'better-auth.session_token=token-counselor' } }, env());
    expect(res.status).toBe(403);
  });
});