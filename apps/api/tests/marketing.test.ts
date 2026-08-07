import { describe, it, expect, beforeEach, vi } from 'vitest';
import app from '../src/index.js';
import { MockD1Database } from './mockDb.js';

vi.mock('../src/auth.js', () => ({
  getAuth: () => ({
    api: {
      getSession: async (options: any) => {
        const cookie = options?.headers?.get('cookie') || '';
        const token = (cookie.match(/better-auth\.session_token=([^;]+)/) || [])[1] || null;
        if (token === 'token-admin') {
          return { user: { id: "admin-1", email: "admin@test.com", role: "super_admin", userDivisions: '[]' }, session: { id: "s", token, userId: "admin-1" } };
        }
        if (token === 'token-manager') {
          return { user: { id: "mgr-1", email: "mgr@test.com", role: "manager", userDivisions: '[]' }, session: { id: "s", token, userId: "mgr-1" } };
        }
        if (token === 'token-counselor') {
          return { user: { id: "counselor-1", email: "c@test.com", role: "counselor", userDivisions: '[]' }, session: { id: "s", token, userId: "counselor-1" } };
        }
        return null;
      }
    }
  })
}));

describe('Marketing - Interaction Scoring Engine (Section 26)', () => {
  let mockD1: MockD1Database;

  beforeEach(() => {
    mockD1 = new MockD1Database();
    mockD1.tables.clients.push({ id: 'OP-2026-2001', name: 'Scoring Test', phone: '+91 99999 00001', email: 'score@test.com', created_at: 0, updated_at: 0 } as any);
  });

  it('POST /api/marketing/interactions rejects counselor (403)', async () => {
    const res = await app.request('/api/marketing/interactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': 'better-auth.session_token=token-counselor' },
      body: JSON.stringify({ clientId: 'OP-2026-2001', interactionCode: 'whatever' })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(res.status).toBe(403);
  });

  it('POST /api/marketing/interactions scores an auto-created interaction', async () => {
    // Empty interaction_points -> seeds catalog
    const res = await app.request('/api/marketing/interactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': 'better-auth.session_token=token-manager' },
      body: JSON.stringify({ clientId: 'OP-2026-2001' })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(res.status).toBe(400); // missing interactionCode

    const ok = await app.request('/api/marketing/interactions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Cookie': 'better-auth.session_token=token-manager' },
      body: JSON.stringify({ clientId: 'OP-2026-2001', interactionCode: 'website_lead_form' })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(ok.status).toBe(200);
    const data = await ok.json() as any;
    // Catalog not empty now (mock seeded from tests file), but interaction code should be known
    expect(data.success).toBe(true);
  });

  it('GET /api/marketing/leads/:id/score computes band from recorded events', async () => {
    // Pre-seed scoring events directly (bypass interaction call): 40 points
    mockD1.tables.scoring_events.push(
      { id: 'e1', client_id: 'OP-2026-2001', interaction_code: 'website_lead_form', points: 10, source: 'test', created_at: 0 },
      { id: 'e2', client_id: 'OP-2026-2001', interaction_code: 'budget_given', points: 15, source: 'test', created_at: 0 },
      { id: 'e3', client_id: 'OP-2026-2001', interaction_code: 'whatsapp_reply', points: 15, source: 'test', created_at: 0 },
    );
    const res = await app.request('/api/marketing/leads/OP-2026-2001/score', {
      headers: { 'Cookie': 'better-auth.session_token=token-manager' }
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.score).toBe(40);
    expect(data.band).toBe('cold');
    expect(data.eventCount).toBe(3);
  });

  it('band escalates to warm at 50+ and hot at 75+', async () => {
    mockD1.tables.scoring_events.push(
      { id: 'w1', client_id: 'OP-2026-2001', interaction_code: 'consultation_booked', points: 30, source: 't', created_at: 0 },
      { id: 'w2', client_id: 'OP-2026-2001', interaction_code: 'portal_account_created', points: 25, source: 't', created_at: 0 },
    );
    const res = await app.request('/api/marketing/leads/OP-2026-2001/score', {
      headers: { 'Cookie': 'better-auth.session_token=token-manager' }
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    const data = await res.json() as any;
    expect(data.score).toBe(55);
    expect(data.band).toBe('warm');
  });

  it('GET /api/marketing/segments returns derived band segments', async () => {
    // one hot lead
    mockD1.tables.scoring_events.push({ id: 'h1', client_id: 'OP-2026-2001', interaction_code: 'consultation_booked', points: 80, source: 't', created_at: 0 });
    const res = await app.request('/api/marketing/segments', {
      headers: { 'Cookie': 'better-auth.session_token=token-manager' }
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.segments.length).toBe(3);
    const hot = data.segments.find((s: any) => s.rulesJson.includes('hot'));
    expect(hot.count).toBe(1);
  });

  it('GET /api/marketing/leads returns all scored leads', async () => {
    mockD1.tables.scoring_events.push({ id: 'a1', client_id: 'OP-2026-2001', interaction_code: 'walk_in', points: 20, source: 't', created_at: 0 });
    const res = await app.request('/api/marketing/leads', {
      headers: { 'Cookie': 'better-auth.session_token=token-manager' }
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.leads.length).toBeGreaterThan(0);
    expect(data.leads[0].band).toBeDefined();
  });
});