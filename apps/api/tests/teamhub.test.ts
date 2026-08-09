import { describe, it, expect, beforeAll, vi } from 'vitest';

vi.mock('../src/auth.js', () => ({
  getAuth: () => ({
    api: {
      getSession: async ({ headers }: any) => {
        const c = typeof headers?.get === 'function' ? (headers.get('cookie') || '') : '';
        const m = c.match(/better-auth\.session_token=([^;]+)/);
        return m ? { user: { id: 'u1', role: 'super_admin', userDivisions: '[]' }, session: {} } : null;
      },
    },
  }),
}));

import app from '../src/index.js';
import { MockD1Database } from './mockDb.js';

describe('Team Hub (§5.5)', () => {
  let mockD1: MockD1Database;
  beforeAll(() => { mockD1 = new MockD1Database(); });

  it('messages require the TEAM_HUB binding (503 without DO)', async () => {
    const res = await app.request('/api/teamhub/rooms/ops/messages', {
      headers: { cookie: 'better-auth.session_token=token-admin' },
    }, { DB: mockD1, BETTER_AUTH_SECRET: 's' });
    expect(res.status).toBe(503);
  });

  it('files listing degrades to empty without BUCKET', async () => {
    const res = await app.request('/api/teamhub/files', {
      headers: { cookie: 'better-auth.session_token=token-admin' },
    }, { DB: mockD1, BETTER_AUTH_SECRET: 's' });
    expect(res.status).toBe(200);
    const j = await res.json() as any;
    expect(j.files).toEqual([]);
  });

  it('denies non-staff (no session) → 401', async () => {
    const res = await app.request('/api/teamhub/files', {}, { DB: mockD1, BETTER_AUTH_SECRET: 's' });
    expect(res.status).toBe(401);
  });
});