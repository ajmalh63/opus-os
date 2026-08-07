import { describe, it, expect, beforeAll, vi } from 'vitest';
import app from '../src/index.js';
import { MockD1Database } from './mockDb.js';

vi.mock('../src/auth.js', () => {
  return {
    getAuth: (env: any) => {
      return {
        api: {
          getSession: async (options: any) => {
            const cookieHeader = options?.headers?.get('cookie') || '';
            const match = cookieHeader.match(/better-auth\.session_token=([^;]+)/);
            const token = match ? match[1] : null;
            if (token === 'token-counselor') {
              return {
                user: { id: "counselor-1", name: "Counselor", email: "c@test.com", role: "counselor", userDivisions: JSON.stringify([]) },
                session: { id: "s-c", token, userId: "counselor-1" }
              };
            }
            if (token === 'token-manager') {
              return {
                user: { id: "mgr-1", name: "Manager", email: "m@test.com", role: "manager", userDivisions: JSON.stringify([]) },
                session: { id: "s-m", token, userId: "mgr-1" }
              };
            }
            return null;
          }
        }
      };
    }
  };
});

const leadPayload = (over: any = {}) => ({
  name: "Anita Desai",
  phone: "+91 98480 12345",
  email: "anita.desai@example.com",
  highestQualification: "undergrad",
  division: "study-abroad",
  leadSource: "website",
  consents: { coreProcessing: true, whatsappUpdates: true, marketingCampaigns: false },
  ...over
});

describe('Marketing automation interlock â€” funnel + partner affiliate (Sections 26/39)', () => {
  let mockD1: MockD1Database;

  beforeAll(() => {
    mockD1 = new MockD1Database();
    // Affiliate partner with referral code
    mockD1.tables.partners.push({
      id: "p-100", name: "Ravi Agents", panNumber: "******1234", bankAccount: "000000", ifscCode: "HDFC0000001",
      status: "active", referralCode: "OPUS-RAVI", createdAt: 1
    });
    // Seed interaction point catalog entries used at intake
    mockD1.tables.interaction_points.push(
      { code: 'website_lead_form', points: 10, description: 'Website lead form submitted' },
      { code: 'destination_specified', points: 10, description: 'Target country specified' },
      { code: 'budget_given', points: 15, description: 'Budget provided' },
      { code: 'intake_started', points: 5, description: 'Intake season specified' },
      { code: 'partner_referral', points: 15, description: 'Referral from partner' }
    );
  });

  it('intake with dynamicContext auto-scores intent signals (destination/budget/intake)', async () => {    const res = await app.request('/api/public/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.50' },
      body: JSON.stringify(leadPayload({
        dynamicContext: { targetCountry: 'Germany', budget: '15-25L', intakeSeason: 'Fall 2027' }
      }))
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.points_awarded).toBe(40); // 10 + 10 + 15 + 5

    const client = mockD1.tables.clients.find((cl: any) => cl.id === data.token);
    expect(client).toBeTruthy();
    expect(client.lead_source).toBe('website');
    expect(JSON.parse(client.intake_context).targetCountry).toBe('Germany');

    const codes = mockD1.tables.scoring_events.filter((e: any) => e.client_id === data.token).map((e: any) => e.interaction_code);
    expect(codes).toContain('website_lead_form');
    expect(codes).toContain('destination_specified');
    expect(codes).toContain('budget_given');
    expect(codes).toContain('intake_started');
  });

  it('intake with refCode creates referral + UNMATURED commission + partner_referral score', async () => {
    const res = await app.request('/api/public/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.51' },
      body: JSON.stringify(leadPayload({ refCode: 'OPUS-RAVI' }))
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });

    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.referredPartnerId).toBe('p-100');
    expect(data.referralId).toBeTruthy();

    const referral = mockD1.tables.referrals.find((r: any) => r.id === data.referralId);
    expect(referral).toBeTruthy();
    expect(referral.partner_id).toBe('p-100');

    const ledger = mockD1.tables.commission_ledger.find((l: any) => l.referral_id === data.referralId);
    expect(ledger).toBeTruthy();
    expect(ledger.status).toBe('unmatured');
    expect(ledger.amount).toBe(0);

    const codes = mockD1.tables.scoring_events.filter((e: any) => e.client_id === data.token).map((e: any) => e.interaction_code);
    expect(codes).toContain('partner_referral');
  });

  it('unknown refCode is ignored gracefully (no referral, no crash)', async () => {
    const res = await app.request('/api/public/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.52' },
      body: JSON.stringify(leadPayload({ refCode: 'NOPE-99' }))
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.referralId).toBeNull();
  });

  it('funnel endpoint reports stage counts, conversion, stale queue + partner attribution', async () => {
    // Seed engagements across stages + a signed agreement for a referred client
    mockD1.tables.engagements.push(
      { id: 'eng-1', clientId: 'C-1', division: 'study-abroad', title: 'US', stageKey: 'lead', status: 'active', createdAt: 1, updatedAt: 1, outstandingBalance: 0 },
      { id: 'eng-2', clientId: 'C-2', division: 'visa', title: 'Visa', stageKey: 'qualified', status: 'active', createdAt: 2, updatedAt: 2, outstandingBalance: 0 },
      { id: 'eng-3', clientId: 'C-3', division: 'umrah', title: 'Umrah', stageKey: 'complete', status: 'active', createdAt: 3, updatedAt: 3, outstandingBalance: 0 },
      // stale lead (>7 days, untouched)
      { id: 'eng-4', clientId: 'C-4', division: 'study-abroad', title: 'Stale', stageKey: 'lead', status: 'active', createdAt: 1, updatedAt: 1, outstandingBalance: 0 }
    );
    mockD1.tables.clients.push({ id: 'C-1', name: 'One', phone: '1', email: 'a@b.c', createdAt: 1, updatedAt: 1 });
    mockD1.tables.clients.push({ id: 'C-4', name: 'Stale Guy', phone: '4', email: 's@b.c', createdAt: 1, updatedAt: 1 });
    mockD1.tables.agreements.push({ id: 'ag-1', clientId: 'C-3', templateId: 't1', status: 'signed', content: 'x', createdAt: 3 });
    mockD1.tables.referrals.push({ id: 'ref-1', partnerId: 'p-100', clientId: 'C-3', commissionRate: 5, createdAt: 3 });
    mockD1.tables.commission_ledger.push({ id: 'led-1', referralId: 'ref-1', amount: 25000, status: 'matured', createdAt: 3 });

    const res = await app.request('/api/marketing/funnel', {
      headers: { 'cookie': 'better-auth.session_token=token-manager' }
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    expect(res.status).toBe(200);
    const data = await res.json() as any;

    // totalLeads includes engagements created by the intake tests earlier in this file
    expect(data.totalLeads).toBeGreaterThanOrEqual(4);
    expect(data.customers).toBe(1);
    const leadStage = data.funnel.find((f: any) => f.stage === 'lead');
    expect(leadStage.count).toBeGreaterThanOrEqual(2);

    // Stale queue catches C-4 (untouched lead)
    expect(data.stale.length).toBeGreaterThan(0);
    expect(data.stale.some((s: any) => s.clientId === 'C-4')).toBe(true);

    // Partner attribution: C-3 referred + converted
    const attr = data.partnerAttribution.find((a: any) => a.clientId === 'C-3');
    expect(attr).toBeTruthy();
    expect(attr.converted).toBe(true);
    expect(attr.partnerName).toBe('Ravi Agents');
    expect(attr.commissionStatus).toBe('matured');
    expect(attr.commissionPaise).toBe(25000);
  });

  it('partners leaderboard aggregates referrals / conversions / matured commission', async () => {
    const res = await app.request('/api/marketing/partners', {
      headers: { 'cookie': 'better-auth.session_token=token-manager' }
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.partners.length).toBeGreaterThan(0);
    const ravi = data.partners.find((p: any) => p.partnerId === 'p-100');
    expect(ravi).toBeTruthy();
    expect(ravi.referralCode).toBe('OPUS-RAVI');
    expect(ravi.converted).toBe(1);
    expect(ravi.commissionPaise).toBe(25000);
  });

  it('signing a referred agreement matures commission at rate% of realized payments', async () => {
    mockD1.tables.clients.push({ id: 'C-5', name: 'Referred Five', phone: '5', email: 'r5@b.c', createdAt: 1, updatedAt: 1 });
    mockD1.tables.engagements.push({ id: 'eng-5', clientId: 'C-5', division: 'attestation', title: 'Attest', stageKey: 'qualified', status: 'active', createdAt: 1, updatedAt: 1, outstandingBalance: 0 });
    mockD1.tables.agreements.push({ id: 'ag-5', clientId: 'C-5', templateId: 't1', status: 'draft', content: 'PAID CLIENT AGREEMENT', createdAt: 1 });
    mockD1.tables.referrals.push({ id: 'ref-5', partnerId: 'p-100', clientId: 'C-5', commissionRate: 5, createdAt: 1 });
    mockD1.tables.commission_ledger.push({ id: 'led-5', referralId: 'ref-5', amount: 0, status: 'unmatured', createdAt: 1 });
    mockD1.tables.payments.push({ id: 'pay-5', clientId: 'C-5', engagementId: 'eng-5', amount: 100000, type: 'receipt', milestoneName: 'm1', createdAt: 1 });

    const res = await app.request('/api/agreements/ag-5/sign', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'cookie': 'better-auth.session_token=token-counselor' },
      body: JSON.stringify({ esignMethod: 'wet_ink' })
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'test-secret' });
    expect(res.status).toBe(200);

    const ledger = mockD1.tables.commission_ledger.find((l: any) => l.id === 'led-5');
    expect(ledger.status).toBe('matured');
    expect(ledger.amount).toBe(5000); // 5% of â‚¹1000 (100000 paise)
  });

  it('intake creates a 15-min SLA task routed round-robin to a division-matched counselor', async () => {
    let mock2 = new MockD1Database();
    // Two counselors: one study-abroad only, one all-divisions
    mock2.tables.users.push(
      { id: 'counc-a', name: 'A', email: 'a@o.com', role: 'counselor', userDivisions: '["study-abroad"]', email_verified: 1, created_at: 1, updated_at: 1 },
      { id: 'counc-b', name: 'B', email: 'b@o.com', role: 'counselor', userDivisions: '[]', email_verified: 1, created_at: 1, updated_at: 1 },
      { id: 'mgr-z', name: 'Z Mgr', email: 'z@o.com', role: 'manager', userDivisions: '[]', email_verified: 1, created_at: 1, updated_at: 1 }
    );

    const res = await app.request('/api/public/leads', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.60' },
      body: JSON.stringify(leadPayload({
        division: 'study-abroad',
        dynamicContext: { targetCountry: 'US', budget: '20-30L' }
      }))
    }, { DB: mock2, BETTER_AUTH_SECRET: 'test-secret' });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.slaTaskId).toBeTruthy();

    const task = mock2.tables.tasks.find((t: any) => t.id === data.slaTaskId);
    expect(task).toBeTruthy();
    expect(task.priority).toBe('high');
    expect(task.status).toBe('open');
    expect(task.due_date - Math.floor(Date.now() / 1000)).toBeLessThanOrEqual(15 * 60 + 2);
    expect(task.assignee_id).toBeTruthy();
    // Both counselors match study-abroad; assignment must be one of them, not the manager
    expect(['counc-a', 'counc-b']).toContain(task.assignee_id);
  });

  it('reactivate creates a 24h re-engagement task + logs stale_reactivated scoring', async () => {
    let mock3 = new MockD1Database();
    mock3.tables.users.push(
      { id: 'counc-a', name: 'A', email: 'a@o.com', role: 'counselor', userDivisions: '["study-abroad"]', email_verified: 1, created_at: 1, updated_at: 1 }
    );
    mock3.tables.clients.push({ id: 'C-STALE', name: 'Stale Sam', phone: '999', email: 's@b.c', createdAt: 1, updatedAt: 1 });
    mock3.tables.engagements.push({ id: 'eng-stale', clientId: 'C-STALE', division: 'study-abroad', title: 'US', stageKey: 'lead', status: 'active', createdAt: 1, updatedAt: 1, outstandingBalance: 0 });

    const res = await app.request('/api/marketing/stale/C-STALE/reactivate', {
      method: 'POST',
      headers: { 'cookie': 'better-auth.session_token=token-manager' }
    }, { DB: mock3, BETTER_AUTH_SECRET: 'test-secret' });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.taskId).toBeTruthy();
    expect(data.assigneeId).toBe('counc-a');

    const task = mock3.tables.tasks.find((t: any) => t.id === data.taskId);
    expect(task).toBeTruthy();
    expect(task.priority).toBe('high');
    expect(task.status).toBe('open');
    expect(task.assignee_id).toBe('counc-a');
    const dueIn = task.due_date - Math.floor(Date.now() / 1000);
    expect(dueIn).toBeGreaterThan(23 * 3600);
    expect(dueIn).toBeLessThanOrEqual(24 * 3600 + 2);

    const event = mock3.tables.scoring_events.find((e: any) => e.client_id === 'C-STALE' && e.interaction_code === 'stale_reactivated');
    expect(event).toBeTruthy();
    expect(event.points).toBe(5);
  });

  it('reactivate on unknown client returns 404', async () => {
    let mock4 = new MockD1Database();
    const res = await app.request('/api/marketing/stale/NOPE-999/reactivate', {
      method: 'POST',
      headers: { 'cookie': 'better-auth.session_token=token-manager' }
    }, { DB: mock4, BETTER_AUTH_SECRET: 'test-secret' });
    expect(res.status).toBe(404);
  });

  it('reactivated lead exits the stale queue in the funnel view', async () => {
    let mock5 = new MockD1Database();
    mock5.tables.users.push(
      { id: 'counc-a', name: 'A', email: 'a@o.com', role: 'counselor', userDivisions: '[]', email_verified: 1, created_at: 1, updated_at: 1 }
    );
    mock5.tables.clients.push({ id: 'C-STALE2', name: 'Stale Two', phone: '888', email: 's2@b.c', createdAt: 1, updatedAt: 1 });
    mock5.tables.engagements.push({ id: 'eng-stale2', clientId: 'C-STALE2', division: 'visa', title: 'Visa', stageKey: 'lead', status: 'active', createdAt: 1, updatedAt: 1, outstandingBalance: 0 });

    await app.request('/api/marketing/stale/C-STALE2/reactivate', {
      method: 'POST',
      headers: { 'cookie': 'better-auth.session_token=token-manager' }
    }, { DB: mock5, BETTER_AUTH_SECRET: 'test-secret' });

    const funnel = await app.request('/api/marketing/funnel', {
      headers: { 'cookie': 'better-auth.session_token=token-manager' }
    }, { DB: mock5, BETTER_AUTH_SECRET: 'test-secret' });
    const fd = await funnel.json() as any;
    expect(fd.stale.some((s: any) => s.clientId === 'C-STALE2')).toBe(false);
  });

  it('nurture plan creates a 4-stage WhatsApp sequence only when consent granted', async () => {
    let mock6 = new MockD1Database();
    mock6.tables.clients.push({ id: 'C-N1', name: 'Nurture One', phone: '1', email: 'n1@b.c', createdAt: 1, updatedAt: 1 });
    mock6.tables.consents.push({ id: 'c1', clientId: 'C-N1', consentType: 'whatsapp-updates', status: 'granted', ipAddress: 'x', sha256Hash: 'h', grantedAt: 1 });

    const res = await app.request('/api/marketing/nurture/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'cookie': 'better-auth.session_token=token-manager' },
      body: JSON.stringify({ clientId: 'C-N1' })
    }, { DB: mock6, BETTER_AUTH_SECRET: 'test-secret' });
    expect(res.status).toBe(200);
    const data = await res.json() as any;
    expect(data.status).toBe('planned');
    expect(data.count).toBe(4);

    const touches = mock6.tables.nurture_touches.filter((t: any) => t.client_id === 'C-N1');
    expect(touches.length).toBe(4);
    expect(touches.every((t: any) => t.channel === 'whatsapp')).toBe(true);
    expect(touches.map((t: any) => t.stage)).toEqual(expect.arrayContaining(['value', 'case_study', 'offer', 'final']));

    const due = await app.request('/api/marketing/nurture/due?now=' + (Math.floor(Date.now() / 1000) + 1), {
      headers: { 'cookie': 'better-auth.session_token=token-manager' }
    }, { DB: mock6, BETTER_AUTH_SECRET: 'test-secret' });
    const dueData = await due.json() as any;
    expect(dueData.touches.length).toBe(4);

    const mark = await app.request(`/api/marketing/nurture/${touches[0].id}/send`, {
      method: 'POST',
      headers: { 'cookie': 'better-auth.session_token=token-manager' }
    }, { DB: mock6, BETTER_AUTH_SECRET: 'test-secret' });
    expect(mark.status).toBe(200);
    expect(mock6.tables.nurture_touches.find((t: any) => t.id === touches[0].id).status).toBe('sent');
  });

  it('nurture plan is skipped without WhatsApp consent (DPDP-safe)', async () => {
    let mock7 = new MockD1Database();
    mock7.tables.clients.push({ id: 'C-N2', name: 'No Consent', phone: '2', email: 'n2@b.c', createdAt: 1, updatedAt: 1 });
    const res = await app.request('/api/marketing/nurture/plan', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'cookie': 'better-auth.session_token=token-manager' },
      body: JSON.stringify({ clientId: 'C-N2' })
    }, { DB: mock7, BETTER_AUTH_SECRET: 'test-secret' });
    const data = await res.json() as any;
    expect(data.status).toBe('skipped');
    expect(mock7.tables.nurture_touches.length).toBe(0);
  });

  it('experiment creation enforces the hypothesis gate; active experiment assigns sticky variants', async () => {
    let mock8 = new MockD1Database();
    const bad = await app.request('/api/marketing/experiments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'cookie': 'better-auth.session_token=token-manager' },
      body: JSON.stringify({ key: 'lead-cta', name: 'T' })
    }, { DB: mock8, BETTER_AUTH_SECRET: 'test-secret' });
    expect(bad.status).toBe(400);

    const ok = await app.request('/api/marketing/experiments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'cookie': 'better-auth.session_token=token-manager' },
      body: JSON.stringify({
        key: 'lead-cta', name: 'Lead CTA', hypothesis: 'WhatsApp-first heading lifts lead->customer conversion',
        primaryMetric: 'lead_to_customer', baselineRate: 0.12, mde: 0.05,
        variantA: 'control', variantB: 'whatsapp-first'
      })
    }, { DB: mock8, BETTER_AUTH_SECRET: 'test-secret' });
    expect(ok.status).toBe(200);

    const act = await app.request('/api/marketing/experiments/lead-cta/activate', {
      method: 'POST',
      headers: { 'cookie': 'better-auth.session_token=token-manager' }
    }, { DB: mock8, BETTER_AUTH_SECRET: 'test-secret' });
    expect(act.status).toBe(200);

    const v1 = await app.request('/api/public/portal/experiments/lead-cta/variant?clientId=C-X1', {}, { DB: mock8, BETTER_AUTH_SECRET: 'test-secret' });
    const v1d = await v1.json() as any;
    expect(['A', 'B']).toContain(v1d.variant);
    expect(v1d.sticky).toBe(false);

    const v2 = await app.request('/api/public/portal/experiments/lead-cta/variant?clientId=C-X1', {}, { DB: mock8, BETTER_AUTH_SECRET: 'test-secret' });
    const v2d = await v2.json() as any;
    expect(v2d.variant).toBe(v1d.variant);
    expect(v2d.sticky).toBe(true);

    const inactive = await app.request('/api/public/portal/experiments/nope/variant?clientId=C-X1', {}, { DB: mock8, BETTER_AUTH_SECRET: 'test-secret' });
    expect((await inactive.json() as any).variant).toBe('none');
  });
});
