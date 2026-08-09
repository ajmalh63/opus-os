import { describe, it, expect, vi } from 'vitest';

vi.mock('../src/auth.js', () => ({
  getAuth: () => ({
    api: {
      getSession: async ({ headers }: any) => {
        const c = typeof headers?.get === 'function' ? (headers.get('cookie') || '') : '';
        const m = c.match(/better-auth\.session_token=([^;]+)/);
        return m && m[1] === 'token-owner' ? { user: { id: 'u', role: 'super_admin', userDivisions: '[]' }, session: {} } : null;
      },
    },
  }),
}));

import app from '../src/index.js';
import { MockD1Database } from './mockDb.js';
import { listmonkHealth, listmonkSendTransactional, listmonkUpsertSubscriber } from '../src/infra/listmonk.js';
import { integrationsStatus } from '../src/infra/integrations.js';

const LM = { LISTMONK_BASE_URL: 'http://listmonk:9009', LISTMONK_API_USER: 'u', LISTMONK_API_PASS: 'p' };

describe('Listmonk adapter (Wave 1 email engine)', () => {
  it('health: stub when unconfigured', async () => {
    const h = await listmonkHealth({});
    expect(h.configured).toBe(false);
    expect(h.ok).toBe(false);
  });

  it('health: reaches /api/health when configured', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } })));
    const h = await listmonkHealth(LM);
    expect(h.configured).toBe(true);
    expect(h.ok).toBe(true);
  });

  it('tx send: stub-oks when configured=false; posts to /api/tx when live', async () => {
    const stubRes = await listmonkSendTransactional({}, 'a@b.com', 'Test', '<p>hi</p>');
    expect(stubRes.provider).toBe('stub-email');
    expect(stubRes.ok).toBe(true);

    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 7 }), { status: 200, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const live = await listmonkSendTransactional(LM, 'a@b.com', 'Test', '<p>hi</p>', { ref: 'x' });
    expect(live.provider).toBe('listmonk');
    expect(live.ok).toBe(true);
    const called = fetchMock.mock.calls[0];
    expect(String(called[0])).toContain('/api/tx');
    expect(JSON.parse((called[1] as any).body).subscriber_email).toBe('a@b.com');
  });

  it('upsert subscriber targets /api/subscribers', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: 3 }), { status: 201, headers: { 'Content-Type': 'application/json' } }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await listmonkUpsertSubscriber(LM, 'a@b.com', { name: 'A' }, [1]);
    expect(r.id).toBe(3);
    expect(String(fetchMock.mock.calls[0][0])).toContain('/api/subscribers');
  });
});

describe('Integration registry', () => {
  it('reports stub for unconfigured apps, live for reachable ones', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('ok', { status: 200 })));
    const env = { OPENWA_BASE_URL: 'http://wa', CHATWOOT_BASE_URL: 'http://cw', ERPNext_BASE_URL: '' };
    const rows = await integrationsStatus({ OPENWA_BASE_URL: 'http://wa' });
    expect(rows.find((r) => r.key === 'openwa')?.state).toBe('live');
    expect(rows.find((r) => r.key === 'chatwoot')?.state).toBe('stub');
  });

  it('GET /api/infrastructure/integrations returns the panel (owner)', async () => {
    const mockD1 = new MockD1Database();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('ok', { status: 200 })));
    const res = await app.request('/api/infrastructure/integrations', {
      headers: { cookie: 'better-auth.session_token=token-owner' },
    }, { DB: mockD1, BETTER_AUTH_SECRET: 's', OPENWA_BASE_URL: 'http://wa' });
    expect(res.status).toBe(200);
    const j = await res.json() as any;
    expect(j.success).toBe(true);
    expect(j.summary.total).toBeGreaterThanOrEqual(9);
    const openwa = j.integrations.find((i: any) => i.key === 'openwa');
    expect(openwa.state).toBe('live');
  });
});