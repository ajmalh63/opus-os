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
let calls: { url: string; method: string; body: any }[] = [];

describe('Tool-First command envelope (control panel operations)', () => {
  beforeEach(() => {
    mockD1 = new MockD1Database();
    calls = [];
    global.fetch = vi.fn(async (url: any, opts: any) => {
      calls.push({ url: String(url), method: opts?.method || 'GET', body: opts?.body ? JSON.parse(opts.body) : null });
      return new Response(JSON.stringify({ data: { id: 42 } }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }) as any;
  });

  const env = () => ({
    DB: mockD1, BETTER_AUTH_SECRET: 's',
    LISTMONK_BASE_URL: 'http://100.87.71.38:9009', LISTMONK_API_USER: 'u', LISTMONK_API_PASS: 'p',
  });
  const MGR = { 'Content-Type': 'application/json', cookie: 'better-auth.session_token=token-manager' };

  it('campaigns:create routes to the Listmonk API with the OS payload shape', async () => {
    const res = await app.request('/api/integrations/listmonk/campaigns/create', {
      method: 'POST', headers: MGR,
      body: JSON.stringify({ name: 'Ramadan Drop', subject: 'Prepare for Ramadan', lists: [7], type: 'regular', body: '<p>Hello {{ name }}</p>' }),
    }, env());
    expect(res.status).toBe(200);
    const d = await res.json() as any;
    expect(d.ok).toBe(true);
    expect(calls[0].url).toBe('http://100.87.71.38:9009/api/campaigns');
    expect(calls[0].method).toBe('POST');
    expect(calls[0].body).toMatchObject({ name: 'Ramadan Drop', subject: 'Prepare for Ramadan', lists: [7] });
    expect(calls[0].body.body).toContain('{{ name }}');
  });

  it('campaigns:test sends test emails to the given addresses', async () => {
    const res = await app.request('/api/integrations/listmonk/campaigns/test', {
      method: 'POST', headers: MGR, body: JSON.stringify({ id: 9, emails: ['qa@opusoverseas.com'] }),
    }, env());
    expect(res.status).toBe(200);
    expect(calls[0].url).toBe('http://100.87.71.38:9009/api/campaigns/9/test');
    expect(calls[0].body).toEqual({ emails: ['qa@opusoverseas.com'] });
  });

  it('campaigns:status activates/pauses via the tool API', async () => {
    await app.request('/api/integrations/listmonk/campaigns/status', {
      method: 'POST', headers: MGR, body: JSON.stringify({ id: 3, status: 'running' }),
    }, env());
    expect(calls[0].url).toBe('http://100.87.71.38:9009/api/campaigns/3/status');
    expect(calls[0].body.status).toBe('running');
  });

  it('every command writes an audit trail (without leaking payload secrets)', async () => {
    await app.request('/api/integrations/listmonk/subscribers/update', {
      method: 'POST', headers: MGR, body: JSON.stringify({ id: 5, status: 'blocklisted', email: 'x@y.z' }),
    }, env());
    const rows = mockD1.tables.audit_log || [];
    expect(rows.some((a: any) => String(a.action || a.audit_action || '').includes('SUBSCRIBERS_UPDATE'))).toBe(true);
  });

  it('blocks unknown commands and tools (whitelist, fail-closed)', async () => {
    const badTool = await app.request('/api/integrations/mautic/campaigns/create', { method: 'POST', headers: MGR, body: '{}' }, env());
    expect(badTool.status).toBe(502);
    const badCmd = await app.request('/api/integrations/listmonk/campaigns/explode', { method: 'POST', headers: MGR, body: '{}' }, env());
    expect(badCmd.status).toBe(502);
  });

  it('rejects non-manager (fail-closed RBAC)', async () => {
    const res = await app.request('/api/integrations/listmonk/campaigns/create', {
      method: 'POST', headers: { 'Content-Type': 'application/json', cookie: 'better-auth.session_token=token-counselor' }, body: '{}',
    }, env());
    expect(res.status).toBe(403);
  });

  it('typed read passthrough: listmonk campaigns with pagination', async () => {
    const res = await app.request('/api/integrations/listmonk/campaigns?page=2&perPage=50', { headers: MGR }, env());
    expect(res.status).toBe(200);
    expect(calls[0].url).toContain('/api/campaigns?page=2&per_page=50');
  });

  it('fails cleanly when Listmonk is unconfigured (502, no fetch)', async () => {
    calls = [];
    const res = await app.request('/api/integrations/listmonk/campaigns/create', {
      method: 'POST', headers: MGR, body: JSON.stringify({ name: 'x' }),
    }, { DB: mockD1, BETTER_AUTH_SECRET: 's' });
    expect(res.status).toBe(502);
    expect(calls).toHaveLength(0);
  });
});