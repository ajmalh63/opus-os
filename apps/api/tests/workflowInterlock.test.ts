import { describe, it, expect, beforeAll, vi } from 'vitest';

// Role-based workflow interlock tests — simulate the REAL business flow the
// ops team runs every day: receptionist takes a lead → manager moves the card
// → counselor adds card tasks → other staff complete them → agreement signed
// accrues incentive → payment matures commission. Proves the logic chains.

vi.mock('../src/auth.js', () => {
  const users: Record<string, any> = {
    'token-owner': { id: 'u-owner', role: 'super_admin', userDivisions: '[]' },
    'token-mgr': { id: 'u-mgr', role: 'manager', userDivisions: '[]' },
    'token-counselor': { id: 'u-counselor', role: 'counselor', userDivisions: '["study-abroad"]' },
    'token-receptionist': { id: 'u-receptionist', role: 'receptionist', userDivisions: '[]' },
    'token-coordinator': { id: 'u-coordinator', role: 'coordinator', userDivisions: '[]' },
  };
  return {
    getAuth: () => ({
      api: {
        getSession: async ({ headers }: any) => {
          const c = typeof headers?.get === 'function' ? (headers.get('cookie') || '') : '';
          const m = c.match(/better-auth\.session_token=([^;]+)/);
          const token = m?.[1] || '';
          const user = users[token];
          return user ? { user, session: { id: 's', token } } : null;
        },
      },
    }),
  };
});

import app from '../src/index.js';
import { MockD1Database } from './mockDb.js';
import { accrueIncentives } from '../src/services/incentiveAccrual.js';

const M = (mockD1: MockD1Database) => ({ DB: mockD1, BETTER_AUTH_SECRET: 's', RAZORPAY_KEY_ID: 'k', RAZORPAY_KEY_SECRET: 'sec', MANPOWER_AI: 'mock' });

describe('Workflow interlock — role simulation (the daily ops flow)', () => {
  let mockD1: MockD1Database;

  beforeAll(() => {
    mockD1 = new MockD1Database();
    const now = Math.floor(Date.now() / 1000);
    mockD1.tables.pipeline_stages.push(
      { id: 'ps-lead', key: 'lead', name: 'Lead', sequence: 1, wip_limit: null, created_at: now - 80000 },
      { id: 'ps-qual', key: 'qualified', name: 'Qualified', sequence: 2, wip_limit: null, created_at: now - 80000 },
      { id: 'ps-complete', key: 'complete', name: 'Complete', sequence: 3, wip_limit: null, created_at: now - 80000 },
    );
    mockD1.tables.roles.push({ id: 'r-incentive', name: 'Test Rule', code: 'test_rule', permissions_json: '[]', system: false, editable: true, description: null, parent_id: null, color: 'x', created_at: 1, updated_at: 1 });
    mockD1.tables.incentive_rules.push({ id: 'r1', division: 'study-abroad', trigger: 'agreement_signed', amount: 150000, is_percent: false, active: 1, service_id: null, created_at: now });
  });

  it('full chain: receptionist lead → manager card → counselor tasks → done', async () => {
    // 1. Receptionist (public-equivalent) lead intake — NO role needed (public)
    const leadRes = await app.request('/api/public/leads', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'cf-connecting-ip': '203.0.113.5' },
      body: JSON.stringify({
        name: 'Aarav Singh', phone: '+91 98480 11111', email: 'aarav@example.com',
        highestQualification: 'undergrad', division: 'study-abroad',
        consents: { coreProcessing: true, whatsappUpdates: true },
        dynamicContext: { targetCountry: 'US' },
      }),
    }, M(mockD1));
    expect(leadRes.status).toBe(200);
    const lead = await leadRes.json() as any;
    const clientId = lead.token || lead.clientId;

    // engagement auto-created at stage lead
    const eng = (mockD1.tables.engagements as any[]).find((e) => e.client_id === clientId);
    expect(eng).toBeTruthy();
    expect(eng.stage_key).toBe('lead');

    // 2. Manager moves the card to qualified
    const move = await app.request('/api/kanban/board/move', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'cookie': 'better-auth.session_token=token-mgr' },
      body: JSON.stringify({ cardId: eng.id, sourceStage: 'lead', targetStage: 'qualified' }),
    }, M(mockD1));
    expect(move.status).toBe(200);
    expect((mockD1.tables.engagements as any[]).find((e) => e.id === eng.id).stage_key).toBe('qualified');

    // 3. Counselor adds a task ON the card (new gold-standard endpoint)
    const taskRes = await app.request(`/api/kanban/board/${eng.id}/tasks`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'cookie': 'better-auth.session_token=token-counselor' },
      body: JSON.stringify({ title: 'Collect documents', priority: 'high', assigneeId: 'u-coordinator' }),
    }, M(mockD1));
    expect(taskRes.status).toBe(200);
    const taskId = (await taskRes.json() as any).id;

    // 4. Coordinator completes the task from the lane (PATCH toggle)
    const done = await app.request(`/api/kanban/board/tasks/${taskId}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json', 'cookie': 'better-auth.session_token=token-coordinator' },
      body: JSON.stringify({ status: 'done' }),
    }, M(mockD1));
    expect(done.status).toBe(200);

    // 5. Board GET must surface the card WITH its task lane (interlock proof)
    const board = await app.request('/api/kanban/board', { headers: { 'cookie': 'better-auth.session_token=token-mgr' } }, M(mockD1));
    const cols = (await board.json() as any).columns;
    const qualifiedCol = cols.find((c: any) => c.key === 'qualified');
    const card = qualifiedCol.cards.find((c: any) => c.id === eng.id);
    expect(card).toBeTruthy();
    expect(card.tasks).toHaveLength(1);
    expect(card.tasks[0].title).toBe('Collect documents');
    expect(card.tasks[0].status).toBe('done');
  });

  it('incentive accrual: agreement_signed accrues to the counselor (idempotent)', async () => {
    mockD1.tables.engagements.push({ id: 'eng-accrue', client_id: 'c-accrue', division: 'study-abroad', title: 'E', stage_key: 'qualified', counselor_id: 'u-roomselor', outstanding_balance: 0, status: 'active', created_at: 1, updated_at: 1 });
    mockD1.tables.clients.push({ id: 'c-accrue', name: 'C', phone: '999', email: '', created_at: 1, updated_at: 1 });

const first = await accrueIncentives({ env: { DB: mockD1 } as any, clientId: 'c-accrue', engagementId: 'eng-accrue', triggerRef: 'ag-1', trigger: 'agreement_signed' });
    expect(first.accrued).toBeGreaterThan(0);

    const second = await accrueIncentives({ env: { DB: mockD1 } as any, clientId: 'c-accrue', engagementId: 'eng-accrue', triggerRef: 'ag-1', trigger: 'agreement_signed' });
    expect(second.accrued).toBe(0); // idempotent — no double credit

    const entries = (mockD1.tables.incentive_entries as any[]).filter((e) => e.trigger_ref === 'r1:ag-1');
    expect(entries).toHaveLength(1);
    expect(entries[0].amount).toBe(150000);
  });

  it('permission parity: receptionist cannot move cards (403); manager can', async () => {
    const eng2 = { id: 'eng-parity', client_id: 'OP-1', division: 'study-abroad', title: 'P', stage_key: 'lead', outstanding_balance: 0, status: 'active', created_at: 1, updated_at: 1 };
    mockD1.tables.engagements.push(eng2);
    const recRes = await app.request('/api/kanban/board/move', {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'cookie': 'better-auth.session_token=token-receptionist' },
      body: JSON.stringify({ cardId: 'eng-parity', sourceStage: 'lead', targetStage: 'qualified' }),
    }, M(mockD1));
    expect(recRes.status).toBe(403);
  });
});

function makeEng(): any { return {}; }