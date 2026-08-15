import { describe, it, expect, beforeEach, vi } from 'vitest';
import app from '../src/index.js';
import { MockD1Database } from './mockDb.js';

vi.mock('../src/auth.js', () => ({
  getAuth: () => ({ api: { getSession: async () => null } }),
}));
// F3 (Workflow Audit 2026-08-12): leads intake flow end-to-end — division
// intent persisted, engagement created, 15-min SLA task auto-created,
// duplicates rejected.
let mockD1: MockD1Database;

describe('Leads intake flow (division intent + SLA)', () => {
  beforeEach(() => {
    mockD1 = new MockD1Database();
    // a counselor for division routing (SLA assignment picker)
    mockD1.tables.users.push({ id: 'c-coun-1', name: 'Counselor One', email: 'c1@t.com', emailVerified: 1, image: null, passwordHash: 'x', twoFactorEnabled: 0, userDivisions: JSON.stringify(['study-abroad']), role: 'counselor', created_at: 1, updated_at: 1 });
  });

  const env = () => ({ DB: mockD1, TURNSTILE_SECRET_KEY: '1x0000000000000000000000000000000AA', ENVIRONMENT: 'development' });
  const leadBody = {
    name: 'Test Lead', phone: '+91 98765 43210', email: 'test@example.com',
    highestQualification: 'undergrad', division: 'study-abroad',
    consents: { coreProcessing: true, whatsappUpdates: true, marketingCampaigns: true },
    dynamicContext: { targetCountry: 'US', intakeSeason: 'Fall 2027' },
  };
  const submit = (body: any) => app.request('/api/public/leads', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }, env());

  it('creates client with declared intent + active engagement at stage lead', async () => {
    const res = await submit(leadBody);
    expect(res.status).toBe(200);
    const client = mockD1.tables.clients.find((c: any) => c.phone === '+91 98765 43210');
    expect(client).toBeTruthy();
    expect(client.primary_division ?? client.primaryDivision).toBe('study-abroad');
    expect(String(client.intent_divisions ?? client.intentDivisions)).toContain('study-abroad');
    const eng = mockD1.tables.engagements.find((e: any) => e.client_id === client.id);
    expect(eng).toBeTruthy();
    expect(eng.stage_key).toBe('lead');
    expect(eng.division).toBe('study-abroad');
  });

  it('auto-creates the 15-minute SLA follow-up task on intake', async () => {
    const res = await submit(leadBody);
    expect(res.status).toBe(200);
    const now = Math.floor(Date.now() / 1000);
    const sla = mockD1.tables.tasks.find((t: any) => t.title && String(t.title).toLowerCase().includes('reach out'));
    expect(sla).toBeTruthy();
    expect(sla.assignee_id).toBeTruthy(); // routed to a counselor (division)
    expect(sla.due_date).toBeLessThanOrEqual(now + 900); // 15 min SLA
    expect(sla.due_date).toBeGreaterThanOrEqual(now + 600);
  });

  it('rejects duplicate phone numbers (409)', async () => {
    await submit(leadBody);
    const dup = await submit({ ...leadBody, email: 'other@example.com' });
    expect(dup.status).toBe(409);
  });

  it('persists dynamic context (targetCountry) for campaign eligibility', async () => {
    await submit(leadBody);
    const client = mockD1.tables.clients.find((c: any) => c.phone === '+91 98765 43210');
    const ctx = JSON.parse(client.intake_context);
    expect(ctx.targetCountry).toBe('US');
  });
});