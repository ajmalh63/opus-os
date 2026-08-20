import { describe, it, expect, beforeEach, vi } from 'vitest';
import app from '../src/index.js';
import { MockD1Database } from './mockDb.js';

vi.mock('../src/auth.js', () => ({
  getAuth: () => ({
    api: {
      getSession: async (options: any) => {
        const token = (options?.headers?.get('cookie') || '').match(/better-auth\.session_token=([^;]+)/)?.[1] || null;
        const users: Record<string, any> = {
          'token-admin': { id: 'admin-1', name: 'O', email: 'o@t.com', role: 'super_admin', userDivisions: JSON.stringify([]) },
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

describe('Campaign catalog (informational) + intent override', () => {
  beforeEach(() => {
    mockD1 = new MockD1Database();
  });

  const env = () => ({ DB: mockD1, BETTER_AUTH_SECRET: 's' });
  const ADMIN = { cookie: 'better-auth.session_token=token-admin' };

  function seedCampaign(id: string, key: string, division: string, eligibility: any, touches: { seq: number; day: number; stage: string; channel: string; body: string }[]) {
    const now = Math.floor(Date.now() / 1000);
    mockD1.tables.campaigns.push({ id, key, name: key, description: null, division, eligibility_json: JSON.stringify(eligibility), status: 'active', created_at: now, updated_at: now });
    touches.forEach((t, i) => mockD1.tables.campaign_touches.push({ id: `${id}-t${i}`, campaign_id: id, seq: t.seq, day: t.day, stage: t.stage, channel: t.channel, body: t.body, created_at: now }));
  }

  it('GET catalog lists seeded journeys with their channel-aware plans (read-only)', async () => {
    seedCampaign('c-1', 'visa-gcc', 'visa', { visaCategory: ['work visa'] }, [
      { seq: 1, day: 0, stage: 'value', channel: 'email', body: 'Hi {{name}}, how to start' },
      { seq: 2, day: 3, stage: 'offer', channel: 'whatsapp', body: '{{visaCategory}} checklist next' },
    ]);

    const list = await app.request('/api/admin/campaigns', { headers: ADMIN }, env());
    expect(list.status).toBe(200);
    const c = (await list.json() as any).campaigns[0];
    expect(c.key).toBe('visa-gcc');
    expect(c.touches.map((t: any) => t.channel)).toEqual(['email', 'whatsapp']);

    // informational: no create/update surface exists anymore (Tool-First)
    const create = await app.request('/api/admin/campaigns', { method: 'POST', headers: { ...ADMIN, 'Content-Type': 'application/json' }, body: '{}' }, env());
    expect([404, 405]).toContain(create.status);
  });

  it('planner respects per-channel nodes from a seeded journey (email + whatsapp)', async () => {
    seedCampaign('c-2', 'visa-gcc2', 'visa', { visaCategory: ['work visa'] }, [
      { seq: 1, day: 0, stage: 'value', channel: 'email', body: 'Hi {{name}}' },
      { seq: 2, day: 3, stage: 'offer', channel: 'whatsapp', body: 'checklist' },
    ]);
    mockD1.tables.clients.push({ id: 'OP-2026-1001', portal_token: 'OP-2026-1001', name: 'Via', phone: '1', email: 'a@b.c', createdAt: 1, updatedAt: 1, primaryDivision: 'visa', intakeContext: JSON.stringify({ visaCategory: 'work visa' }) });
    mockD1.tables.consents.push({ id: 'ck', clientId: 'OP-2026-1001', consentType: 'whatsapp-updates', status: 'granted', ipAddress: 'x', sha256Hash: 'h', grantedAt: 1 });

    const plan = await app.request('/api/marketing/nurture/plan', {
      method: 'POST', headers: { 'Content-Type': 'application/json', cookie: 'better-auth.session_token=token-manager' },
      body: JSON.stringify({ clientId: 'OP-2026-1001' }),
    }, env());
    expect((await plan.json() as any).status).toBe('planned');
    const channels = mockD1.tables.nurture_touches.map((t: any) => t.channel).sort();
    expect(channels).toEqual(['email', 'whatsapp']);
  });

  it('intent override: manager sets primary interest; counselor is denied; invalid division rejected', async () => {
    mockD1.tables.clients.push({ id: 'OP-2026-1001', portal_token: 'OP-2026-1001', name: 'C', phone: '1', email: 'a@b.c', createdAt: 1, updatedAt: 1, primaryDivision: null });

    const mgr = await app.request('/api/clients/OP-2026-1001/intent', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', cookie: 'better-auth.session_token=token-manager' },
      body: JSON.stringify({ primaryDivision: 'attestation' }),
    }, env());
    expect(mgr.status).toBe(200);
    const row = mockD1.tables.clients.find((cl: any) => cl.id === 'OP-2026-1001');
    expect(row.primary_division ?? row.primaryDivision).toBe('attestation');
    expect(String(row.intent_divisions ?? row.intentDivisions)).toContain('attestation');

    const counselor = await app.request('/api/clients/OP-2026-1001/intent', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', cookie: 'better-auth.session_token=token-counselor' },
      body: JSON.stringify({ primaryDivision: 'visa' }),
    }, env());
    expect(counselor.status).toBe(403);

    const bad = await app.request('/api/clients/OP-2026-1001/intent', {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', cookie: 'better-auth.session_token=token-manager' },
      body: JSON.stringify({ primaryDivision: 'nope' }),
    }, env());
    expect(bad.status).toBe(400);
  });
});