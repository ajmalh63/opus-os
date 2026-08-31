import { describe, it, expect, beforeAll, vi } from 'vitest';
import app from '../src/index.js';
import { MockD1Database } from './mockDb.js';

vi.mock('../src/auth.js', async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    validateSessionToken: async (_db: any, token: string) => {
      if (token === 'token-admin') {
        return {
          user: { id: 'u-admin', name: 'Super Admin', email: 'owner@test.com', role: 'super_admin', userDivisions: '[]', twoFactorEnabled: false, emailVerified: true },
          session: { id: 's-1', token, userId: 'u-admin' },
        };
      }
      return null;
    },
    getSessionTokenFromCookie: (c: any) => {
      const cookieHeader = c.req.header('cookie') || '';
      return (cookieHeader.match(/better-auth\.session_token=([^;]+)/) || [])[1] || undefined;
    },
    getAuth: (_env: any) => ({
      api: {
        getSession: async (options: any) => {
          const cookieHeader = options?.headers?.get?.('cookie') || options?.headers?.cookie || '';
          const token = (cookieHeader.match(/better-auth\.session_token=([^;]+)/) || [])[1] || null;
          if (token === 'token-admin') {
            return {
              user: { id: 'u-admin', name: 'Super Admin', email: 'owner@test.com', role: 'super_admin', userDivisions: JSON.stringify([]), twoFactorEnabled: false, emailVerified: true },
              session: { id: 's-1', token, userId: 'u-admin' },
            };
          }
          return null;
        },
      },
    }),
  };
});

describe('Multi-Workspace Helpdesk & Realtime Cross-Plane Audit', () => {
  let mockD1: MockD1Database;
  const clientTokenA = 'portal-tok-client-alpha';
  const clientTokenB = 'portal-tok-client-beta';
  const partnerApiTokenA = 'opus_part_alpha_token_123';
  const partnerApiTokenB = 'opus_part_beta_token_456';
  let clientAId: string;
  let clientBId: string;
  let partnerAId: string;
  let partnerBId: string;

  beforeAll(async () => {
    mockD1 = new MockD1Database();

    // 1. Seed Client A
    clientAId = 'cli_alpha_001';
    mockD1.tables.clients.push({
      id: clientAId,
      name: 'Alpha Applicant',
      email: 'alpha@applicant.com',
      phone: '+919876543210',
      portal_token: clientTokenA,
      status: 'active',
      created_at: Date.now(),
      updated_at: Date.now(),
    });

    // 2. Seed Client B
    clientBId = 'cli_beta_002';
    mockD1.tables.clients.push({
      id: clientBId,
      name: 'Beta Applicant',
      email: 'beta@applicant.com',
      phone: '+919876543211',
      portal_token: clientTokenB,
      status: 'active',
      created_at: Date.now(),
      updated_at: Date.now(),
    });

    // 3. Seed Partner A
    partnerAId = 'part_alpha_001';
    mockD1.tables.partners.push({
      id: partnerAId,
      name: 'Alpha Agency Partner',
      email: 'partner.alpha@agency.com',
      phone: '+919876543212',
      pan_number: 'ABCDE1234F',
      bank_account: '123456789',
      ifsc_code: 'HDFC0001234',
      api_token: partnerApiTokenA,
      status: 'active',
      tier: 'gold',
      created_at: Date.now(),
      updated_at: Date.now(),
    });

    // 4. Seed Partner B
    partnerBId = 'part_beta_002';
    mockD1.tables.partners.push({
      id: partnerBId,
      name: 'Beta Agency Partner',
      email: 'partner.beta@agency.com',
      phone: '+919876543213',
      pan_number: 'ABCDE1234G',
      bank_account: '123456780',
      ifsc_code: 'HDFC0001234',
      api_token: partnerApiTokenB,
      status: 'active',
      tier: 'silver',
      created_at: Date.now(),
      updated_at: Date.now(),
    });

    // 5. Seed Staff Superadmin Session User
    mockD1.tables.users.push({
      id: 'u-admin',
      name: 'Super Admin',
      email: 'owner@test.com',
      role: 'super_admin',
      user_divisions: JSON.stringify([]),
      email_verified: 1,
      two_factor_enabled: 0,
      created_at: Date.now(),
      updated_at: Date.now(),
    });
  });

  // =========================================================================
  // 1. Complete End-to-End Client Lifecycle with Dynamic SLA & Firewalling
  // =========================================================================
  it('E2E Client Ticket Flow: Intake -> Staff Triage -> Internal Note Firewall -> SLA Pause -> Auto-Resume -> CSAT', async () => {
    // A. Client A raises an Urgent Ticket
    const intakeRes = await app.request('/api/public/portal/tickets', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Portal-Token': clientTokenA,
      },
      body: JSON.stringify({
        division: 'study-abroad',
        category: 'visa_query',
        subject: 'CAS Letter Urgently Required for University of Leeds',
        description: 'My visa appointment is in 4 days and I need the updated CAS letter.',
        priority: 'urgent',
      }),
    }, { DB: mockD1 });

    expect(intakeRes.status).toBe(200);
    const intakeData = await intakeRes.json() as any;
    expect(intakeData.success).toBe(true);
    expect(intakeData.ticketNumber).toMatch(/^HD-\d+$/);
    const ticketId = intakeData.ticketId;
    expect(ticketId).toBeTruthy();

    // Verify SLA calculation: Urgent = 2 hours (approx 7200 seconds)
    const storedTicket = mockD1.tables.support_tickets.find((t: any) => t.id === ticketId);
    expect(storedTicket).toBeTruthy();
    expect(storedTicket.client_id).toBe(clientAId);
    expect(storedTicket.priority).toBe('urgent');
    expect(storedTicket.sla_due_at).toBeGreaterThan(Math.floor(Date.now() / 1000) + 7000);

    // Verify staff alert was auto-created in tasks / notifications
    const task = mockD1.tables.tasks?.find((t: any) => t.title?.includes(storedTicket.ticket_number));
    expect(task).toBeTruthy();

    // B. Staff views ticket on 5-column Kanban Desk
    const staffKanbanRes = await app.request('/api/helpdesk/tickets', {
      headers: { Cookie: 'better-auth.session_token=token-admin' },
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(staffKanbanRes.status).toBe(200);
    const staffKanban = await staffKanbanRes.json() as any;
    expect(staffKanban.kanban.open.some((t: any) => t.id === ticketId)).toBe(true);

    // C. Staff assigns ticket to counselor
    const assignRes = await app.request(`/api/helpdesk/tickets/${ticketId}/assign`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'better-auth.session_token=token-admin',
      },
      body: JSON.stringify({ assigneeId: 'u-admin' }),
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(assignRes.status).toBe(200);
    const afterAssign = mockD1.tables.support_tickets.find((t: any) => t.id === ticketId);
    expect(afterAssign.assignee_id).toBe('u-admin');

    // D. Staff adds a Private Yellow Internal Note
    const internalNoteRes = await app.request(`/api/helpdesk/tickets/${ticketId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'better-auth.session_token=token-admin',
      },
      body: JSON.stringify({
        message: 'Checked with University admissions — CAS will be released today by 4 PM.',
        isInternalNote: true,
      }),
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(internalNoteRes.status).toBe(200);

    // E. Staff also adds a Public Message asking applicant for passport scan copy
    const publicMsgRes = await app.request(`/api/helpdesk/tickets/${ticketId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'better-auth.session_token=token-admin',
      },
      body: JSON.stringify({
        message: 'Please provide your updated passport front page scan.',
        isInternalNote: false,
      }),
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(publicMsgRes.status).toBe(200);

    // F. FIREWALL AUDIT: Client A checks the thread
    const clientThreadRes = await app.request(`/api/public/portal/tickets/${ticketId}`, {
      headers: { 'X-Portal-Token': clientTokenA },
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(clientThreadRes.status).toBe(200);
    const clientThread = await clientThreadRes.json() as any;
    // Client MUST see the public message
    expect(clientThread.messages.some((m: any) => m.message.includes('updated passport front page scan'))).toBe(true);
    // Client MUST NEVER see the internal note
    expect(clientThread.messages.some((m: any) => m.message.includes('Checked with University admissions'))).toBe(false);
    expect(clientThread.messages.every((m: any) => m.isInternalNote === false || m.is_internal_note === 0)).toBe(true);

    // G. ITIL v4 SLA PAUSE: Staff changes status to 'waiting_on_user'
    const pauseRes = await app.request(`/api/helpdesk/tickets/${ticketId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'better-auth.session_token=token-admin',
      },
      body: JSON.stringify({ status: 'waiting_on_user' }),
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(pauseRes.status).toBe(200);

    const pausedTicket = mockD1.tables.support_tickets.find((t: any) => t.id === ticketId);
    expect(pausedTicket.status).toBe('waiting_on_user');
    expect(pausedTicket.sla_paused_at).toBeTruthy();
    expect(pausedTicket.sla_remaining_seconds).toBeGreaterThan(0);

    // Check Client 3-Stage Kanban: Ticket should appear in awaiting_user
    const clientBoardRes = await app.request('/api/public/portal/tickets', {
      headers: { 'X-Portal-Token': clientTokenA },
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    const clientBoard = await clientBoardRes.json() as any;
    expect(clientBoard.kanban.awaiting_user.some((t: any) => t.id === ticketId)).toBe(true);

    // H. ITIL v4 AUTO-RESUME: Client A replies with the document confirmation
    const clientReplyRes = await app.request(`/api/public/portal/tickets/${ticketId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Portal-Token': clientTokenA,
      },
      body: JSON.stringify({ message: 'Uploaded my passport scan to the Document Vault.' }),
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(clientReplyRes.status).toBe(200);

    // The ticket must automatically un-pause and move back to in_progress with extended slaDueAt
    const resumedTicket = mockD1.tables.support_tickets.find((t: any) => t.id === ticketId);
    expect(resumedTicket.status).toBe('in_progress');
    expect(resumedTicket.sla_paused_at).toBeNull();
    expect(resumedTicket.sla_due_at).toBeGreaterThan(Math.floor(Date.now() / 1000));

    // I. Staff resolves ticket
    const resolveRes = await app.request(`/api/helpdesk/tickets/${ticketId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        Cookie: 'better-auth.session_token=token-admin',
      },
      body: JSON.stringify({ status: 'resolved' }),
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(resolveRes.status).toBe(200);

    // J. Client confirms and rates satisfaction (5 Stars)
    const csatRes = await app.request(`/api/public/portal/tickets/${ticketId}/satisfaction`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Portal-Token': clientTokenA,
      },
      body: JSON.stringify({
        rating: 5,
        feedback: 'Outstanding support and rapid resolution within 2 hours!',
      }),
    }, { DB: mockD1, BETTER_AUTH_SECRET: 'x' });
    expect(csatRes.status).toBe(200);

    const closedTicket = mockD1.tables.support_tickets.find((t: any) => t.id === ticketId);
    expect(closedTicket.satisfaction_rating).toBe(5);
    expect(closedTicket.satisfaction_feedback).toBe('Outstanding support and rapid resolution within 2 hours!');
  });

  // =========================================================================
  // 2. Partner Escalations & Multi-Plane Tenant Isolation
  // =========================================================================
  it('Partner Escalation Flow and Cross-Tenant IDOR Guard', async () => {
    // A. Partner A raises an escalation
    const partRes = await app.request(`/api/partner/${partnerAId}/tickets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${partnerApiTokenA}`,
      },
      body: JSON.stringify({
        division: 'umrah',
        category: 'commission_payout',
        subject: 'Commission payout query for August departures',
        description: 'Please review commission batch #2026-08 for 12 pilgrims.',
        priority: 'high',
      }),
    }, { DB: mockD1 });
    expect(partRes.status).toBe(200);
    const partData = await partRes.json() as any;
    const ticketId = partData.ticketId;
    expect(ticketId).toBeTruthy();

    // B. Partner A can view their ticket and 3-stage board
    const partBoardRes = await app.request(`/api/partner/${partnerAId}/tickets`, {
      headers: { Authorization: `Bearer ${partnerApiTokenA}` },
    }, { DB: mockD1 });
    expect(partBoardRes.status).toBe(200);
    const partBoard = await partBoardRes.json() as any;
    expect(partBoard.tickets.some((t: any) => t.id === ticketId)).toBe(true);

    // C. IDOR TEST 1: Partner B CANNOT view Partner A's ticket
    const idorRes1 = await app.request(`/api/partner/${partnerBId}/tickets/${ticketId}`, {
      headers: { Authorization: `Bearer ${partnerApiTokenB}` },
    }, { DB: mockD1 });
    expect(idorRes1.status).toBe(404);

    // D. IDOR TEST 2: Client B CANNOT view Client A's or Partner A's tickets
    const idorRes2 = await app.request(`/api/public/portal/tickets/${ticketId}`, {
      headers: { 'X-Portal-Token': clientTokenB },
    }, { DB: mockD1 });
    expect(idorRes2.status).toBe(404);

    // E. Unauthenticated caller CANNOT access Staff Command Center API
    const unauthStaffRes = await app.request('/api/helpdesk/tickets');
    expect([401, 403]).toContain(unauthStaffRes.status);
  });
});
