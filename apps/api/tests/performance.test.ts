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

describe('Staff performance scorecard (manager+)', () => {
  beforeEach(() => {
    mockD1 = new MockD1Database();
    const now = Math.floor(Date.now() / 1000);
    const day = 86400;

    mockD1.tables.users.push(
      { id: 'u-1', name: 'Ravi', email: 'r@t.com', emailVerified: 1, image: null, passwordHash: 'x', twoFactorEnabled: 0, userDivisions: JSON.stringify(['study-abroad']), role: 'counselor', created_at: 1, updated_at: 1 },
      { id: 'u-2', name: 'Sara', email: 's@t.com', emailVerified: 1, image: null, passwordHash: 'x', twoFactorEnabled: 0, userDivisions: JSON.stringify(['visa', 'umrah']), role: 'counselor', created_at: 1, updated_at: 1 },
    );
    // Ravi: 2 done in window (1 today, on-time; 1 late), 1 open overdue, 1 urgent open
    mockD1.tables.tasks.push(
      { id: 't1', client_id: 'OP-2026-1001', engagement_id: null, assignee_id: 'u-1', title: 'Docs intake', description: null, priority: 'high', status: 'done', due_date: now, recurrence: 'none', created_at: now - 4 * 3600, updated_at: now, completed_at: now - 1 * 3600 },
      { id: 't2', client_id: null, engagement_id: null, assignee_id: 'u-1', title: 'Call summary', description: null, priority: 'medium', status: 'done', due_date: now - 2 * day, recurrence: 'none', created_at: now - 3 * day, updated_at: now, completed_at: now - 1 * day }, // completed AFTER due — late
      { id: 't3', client_id: null, engagement_id: null, assignee_id: 'u-1', title: 'Passport copy', description: null, priority: 'high', status: 'open', due_date: now - day, recurrence: 'none', created_at: now - 2 * day, updated_at: now, completed_at: null }, // overdue open
      { id: 't4', client_id: null, engagement_id: null, assignee_id: 'u-1', title: 'Urgent escalation', description: null, priority: 'urgent', status: 'open', due_date: null, recurrence: 'none', created_at: now, updated_at: now, completed_at: null },
      // Sara: 1 done in window (on-time), 1 in_progress
      { id: 't5', client_id: null, engagement_id: null, assignee_id: 'u-2', title: 'Visa checklist', description: null, priority: 'low', status: 'done', due_date: now, recurrence: 'none', created_at: now - 6 * 3600, updated_at: now, completed_at: now - 2 * 3600 },
      { id: 't6', client_id: null, engagement_id: null, assignee_id: 'u-2', title: 'GCC docs', description: null, priority: 'medium', status: 'in_progress', due_date: now + day, recurrence: 'none', created_at: now - 3600, updated_at: now, completed_at: null },
    );
    // Approval queue: 1 draft invoice + 1 sent agreement
    mockD1.tables.payments.push({ id: 'p1', client_id: 'OP-2026-1001', engagement_id: 'eng', amount: 2500000, type: 'invoice', milestone_name: 'Escrow 1', method: null, reference_number: null, taxable_amount: null, cgst: null, sgst: null, igst: null, is_interstate: 0, invoice_date: null, due_date: null, gst_rate: 18, customer_gstin: null, razorpay_link_id: null, razorpay_short_url: null, link_status: 'none', razorpay_payment_id: null, status: 'draft', entered_by: 'u-1', confirmed_by: null, confirmed_at: null, erp_doc_name: null, created_at: now - 3600 });
    mockD1.tables.agreement_templates.push({ id: 'at1', name: 'Standard', content: 'c', version: 1, created_at: 1 });
    mockD1.tables.agreements.push({ id: 'ag1', client_id: 'OP-2026-1001', template_id: 'at1', status: 'sent', content: 'c', esign_method: null, ip_address: null, user_agent: null, sha256_hash: null, signed_at: null, created_at: now - 3600 });
  });

  const env = () => ({ DB: mockD1, BETTER_AUTH_SECRET: 's' });

  it('manager sees the balanced scorecard: headlines, roster, queues', async () => {
    const res = await app.request('/api/performance?days=30', { headers: { cookie: 'better-auth.session_token=token-manager' } }, env());
    expect(res.status).toBe(200);
    const d = await res.json() as any;

    // headlines (BAN row)
    expect(d.headlines.ticketsOpen).toBe(3);          // t3, t4, t6
    expect(d.headlines.overdue).toBe(1);              // t3 only
    expect(d.headlines.doneInRange).toBe(3);          // t1 t2 t5
    expect(d.headlines.doneToday).toBe(2);            // t1, t5
    expect(d.headlines.avgCycleHours).toBeGreaterThan(0); // median of cycles
    // 3 done; on-time: t1 ✓ (<=now), t2 ✗ late, t5 ✓ => 66.7 -> rounded 66.7
    expect(d.headlines.onTimeRate).toBe(66.7);
    expect(d.headlines.approvalQueue).toBe(2);        // 1 draft invoice + 1 sent agreement

    // roster per staff
    const ravi = d.roster.find((r: any) => r.userId === 'u-1');
    expect(ravi.doneToday).toBe(1);
    expect(ravi.doneRange).toBe(2);
    expect(ravi.doneTotal).toBe(2);
    expect(ravi.onTimeRate).toBe(50);                 // t1 on-time of t1,t2
    expect(ravi.overdue).toBe(1);
    expect(ravi.urgentOpen).toBe(1);
    expect(ravi.open).toBe(2);
    const sara = d.roster.find((r: any) => r.userId === 'u-2');
    expect(sara.doneToday).toBe(1);
    expect(sara.onTimeRate).toBe(100);
    expect(sara.inProgress).toBe(1);

    // trend has one bucket (min(14,30)) with today's done
    expect(d.trend[d.trend.length - 1].done).toBe(2);

    // artifact queues
    expect(d.artifacts.approval).toHaveLength(2);
    expect(d.artifacts.overdue[0].id).toBe('t3');
    expect(d.artifacts.overdue[0].daysLate).toBeGreaterThanOrEqual(1);
    expect(d.artifacts.recentDone.some((r: any) => r.id === 't1')).toBe(true);
  });

  it('excludes the owner (super_admin) from the roster — staff scorecard', async () => {
    mockD1.tables.users.push({ id: 'admin-1', name: 'Owner', email: 'o@t.com', emailVerified: 1, image: null, passwordHash: 'x', twoFactorEnabled: 0, userDivisions: '[]', role: 'super_admin', created_at: 1, updated_at: 1 });
    const res = await app.request('/api/performance', { headers: { cookie: 'better-auth.session_token=token-admin' } }, env());
    const d = await res.json() as any;
    expect(d.roster.some((r: any) => r.role === 'super_admin')).toBe(false);
  });

  it('rejects non-manager staff (fail-closed)', async () => {
    const res = await app.request('/api/performance', { headers: { cookie: 'better-auth.session_token=token-counselor' } }, env());
    expect(res.status).toBe(403);
  });

  it('supports 7d and 90d windows', async () => {
    const d7 = await app.request('/api/performance?days=7', { headers: { cookie: 'better-auth.session_token=token-manager' } }, env());
    const d90 = await app.request('/api/performance?days=90', { headers: { cookie: 'better-auth.session_token=token-manager' } }, env());
    expect((await d7.json() as any).windowDays).toBe(7);
    expect((await d90.json() as any).windowDays).toBe(90);
  });
});