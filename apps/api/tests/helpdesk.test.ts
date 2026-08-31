import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { helpdeskRouter, portalTicketsRouter, partnerTicketsRouter, calculateSlaTarget } from '../src/routes/helpdesk.js';
import { MockD1Database } from './mockDb.js';

describe('Helpdesk & Multi-Workspace Ticketing System (ITIL v4 Gold Standard)', () => {
  let mockDb: MockD1Database;
  let app: Hono<{ Bindings: { DB: any; BETTER_AUTH_SECRET: string } }>;

  const CLIENT_A_ID = 'client_test_101';
  const CLIENT_A_TOKEN = 'portal_token_client_a';
  const CLIENT_B_ID = 'client_test_102';
  const CLIENT_B_TOKEN = 'portal_token_client_b';

  const PARTNER_A_ID = 'partner_test_201';
  const PARTNER_A_TOKEN = 'partner_secret_token_a';

  beforeEach(() => {
    mockDb = new MockD1Database();

    // Seed mock clients
    mockDb.tables.clients.push({
      id: CLIENT_A_ID,
      name: 'Sarah Connor',
      email: 'sarah@example.com',
      phone: '+919876543210',
      portalToken: CLIENT_A_TOKEN,
      status: 'active',
      createdAt: Math.floor(Date.now() / 1000),
      updatedAt: Math.floor(Date.now() / 1000),
    });

    mockDb.tables.clients.push({
      id: CLIENT_B_ID,
      name: 'John Connor',
      email: 'john@example.com',
      phone: '+919876543211',
      portalToken: CLIENT_B_TOKEN,
      status: 'active',
      createdAt: Math.floor(Date.now() / 1000),
      updatedAt: Math.floor(Date.now() / 1000),
    });

    // Seed mock partner
    mockDb.tables.partners.push({
      id: PARTNER_A_ID,
      name: 'Global Edu Partners',
      email: 'partner@globaledu.com',
      phone: '+919876543220',
      apiToken: PARTNER_A_TOKEN,
      status: 'active',
      createdAt: Math.floor(Date.now() / 1000),
      updatedAt: Math.floor(Date.now() / 1000),
    });

    app = new Hono<{ Bindings: { DB: any; BETTER_AUTH_SECRET: string } }>();
    app.route('/api/helpdesk', helpdeskRouter);
    app.route('/api/public/portal/tickets', portalTicketsRouter);
    app.route('/api/partner', partnerTicketsRouter);
  });

  it('1. SLA calculation returns accurate target timestamps based on priority', () => {
    const now = 1700000000;
    const urgent = calculateSlaTarget('urgent', now);
    expect(urgent.remainingSeconds).toBe(2 * 3600);
    expect(urgent.slaDueAt).toBe(now + 2 * 3600);

    const high = calculateSlaTarget('high', now);
    expect(high.remainingSeconds).toBe(6 * 3600);

    const medium = calculateSlaTarget('medium', now);
    expect(medium.remainingSeconds).toBe(24 * 3600);

    const low = calculateSlaTarget('low', now);
    expect(low.remainingSeconds).toBe(48 * 3600);
  });

  it('2. Client can raise a support ticket and auto-generate ticket number & initial message', async () => {
    const res = await app.request('/api/public/portal/tickets', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Portal-Token': CLIENT_A_TOKEN,
      },
      body: JSON.stringify({
        division: 'study-abroad',
        category: 'application_status',
        priority: 'urgent',
        subject: 'Urgent Offer Letter Delay for University of Oxford',
        description: 'I have not received my CAS number yet and the deadline is tomorrow.',
      }),
    }, { DB: mockDb as any, BETTER_AUTH_SECRET: 'test_secret' });

    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.success).toBe(true);
    expect(body.ticketNumber).toBeDefined();

    expect(mockDb.tables.support_tickets.length).toBe(1);
    const ticket = mockDb.tables.support_tickets[0];
    expect(ticket.clientId).toBe(CLIENT_A_ID);
    expect(ticket.priority).toBe('urgent');
    expect(ticket.status).toBe('open');

    // Check initial message created
    expect(mockDb.tables.ticket_messages.length).toBe(1);
    expect(mockDb.tables.ticket_messages[0].ticketId).toBe(ticket.id);
    expect(mockDb.tables.ticket_messages[0].senderType).toBe('client');
  });

  it('3. Client portal returns only tickets belonging to that client (Zero Cross-Tenant Leakage)', async () => {
    // Insert ticket for Client A
    mockDb.tables.support_tickets.push({
      id: 'tick_a_1',
      ticketNumber: 'HD-1001',
      source: 'client',
      clientId: CLIENT_A_ID,
      creatorName: 'Sarah Connor',
      division: 'study-abroad',
      category: 'application_status',
      subject: 'Client A Query',
      description: 'Desc A',
      priority: 'high',
      status: 'open',
      createdAt: Math.floor(Date.now() / 1000),
      updatedAt: Math.floor(Date.now() / 1000),
    });

    // Insert ticket for Client B
    mockDb.tables.support_tickets.push({
      id: 'tick_b_1',
      ticketNumber: 'HD-1002',
      source: 'client',
      clientId: CLIENT_B_ID,
      creatorName: 'John Connor',
      division: 'visa',
      category: 'visa_query',
      subject: 'Client B Query',
      description: 'Desc B',
      priority: 'medium',
      status: 'in_progress',
      createdAt: Math.floor(Date.now() / 1000),
      updatedAt: Math.floor(Date.now() / 1000),
    });

    const res = await app.request('/api/public/portal/tickets', {
      method: 'GET',
      headers: { 'X-Portal-Token': CLIENT_A_TOKEN },
    }, { DB: mockDb as any, BETTER_AUTH_SECRET: 'test_secret' });

    expect(res.status).toBe(200);
    const body: any = await res.json();
    expect(body.tickets.length).toBe(1);
    expect(body.tickets[0].id).toBe('tick_a_1');
    expect(body.tickets[0].subject).toBe('Client A Query');
  });

  it('4. Strict Internal Staff Note Isolation (Clients cannot see internal notes)', async () => {
    const ticketId = 'tick_iso_1';
    mockDb.tables.support_tickets.push({
      id: ticketId,
      ticketNumber: 'HD-1003',
      source: 'client',
      clientId: CLIENT_A_ID,
      creatorName: 'Sarah Connor',
      division: 'study-abroad',
      category: 'application_status',
      subject: 'Isolation Test Ticket',
      description: 'Public inquiry',
      priority: 'medium',
      status: 'in_progress',
      createdAt: Math.floor(Date.now() / 1000),
      updatedAt: Math.floor(Date.now() / 1000),
    });

    // Message 1: Public client message
    mockDb.tables.ticket_messages.push({
      id: 'msg_1',
      ticketId,
      senderType: 'client',
      senderId: CLIENT_A_ID,
      senderName: 'Sarah',
      message: 'Hello support team',
      isInternalNote: false,
      createdAt: 1000,
    });

    // Message 2: Public staff response
    mockDb.tables.ticket_messages.push({
      id: 'msg_2',
      ticketId,
      senderType: 'staff',
      senderId: 'staff_1',
      senderName: 'Counselor Desk',
      message: 'We are checking your documents with Oxford.',
      isInternalNote: false,
      createdAt: 2000,
    });

    // Message 3: PRIVATE INTERNAL STAFF NOTE
    mockDb.tables.ticket_messages.push({
      id: 'msg_3_secret',
      ticketId,
      senderType: 'staff',
      senderId: 'staff_1',
      senderName: 'Manager Alex',
      message: 'INTERNAL NOTE: Oxford admissions email bounced. Check with regional director before replying.',
      isInternalNote: true,
      createdAt: 3000,
    });

    // 1. Staff queries ticket detail -> Sees all 3 messages
    const staffRes = await app.request(`/api/helpdesk/tickets/${ticketId}`, {
      method: 'GET',
    }, { DB: mockDb as any, BETTER_AUTH_SECRET: 'test_secret' });
    expect(staffRes.status).toBe(200);
    const staffBody: any = await staffRes.json();
    expect(staffBody.messages.length).toBe(3);

    // 2. Client queries ticket detail -> STRICT FIREWALL: Only gets 2 non-internal messages
    const clientRes = await app.request(`/api/public/portal/tickets/${ticketId}`, {
      method: 'GET',
      headers: { 'X-Portal-Token': CLIENT_A_TOKEN },
    }, { DB: mockDb as any, BETTER_AUTH_SECRET: 'test_secret' });
    expect(clientRes.status).toBe(200);
    const clientBody: any = await clientRes.json();
    expect(clientBody.messages.length).toBe(2);
    expect(clientBody.messages.some((m: any) => m.isInternalNote === true)).toBe(false);
    expect(clientBody.messages.some((m: any) => m.message.includes('Oxford admissions email bounced'))).toBe(false);
  });

  it('5. Dynamic SLA Pausing on waiting_on_user and automatic resuming on client reply', async () => {
    const ticketId = 'tick_sla_1';
    const now = Math.floor(Date.now() / 1000);
    const slaDue = now + 7200; // 2 hours remaining

    mockDb.tables.support_tickets.push({
      id: ticketId,
      ticketNumber: 'HD-1004',
      source: 'client',
      clientId: CLIENT_A_ID,
      creatorName: 'Sarah Connor',
      division: 'study-abroad',
      category: 'document_issue',
      subject: 'Missing Transcript',
      description: 'I submitted my files.',
      priority: 'urgent',
      status: 'in_progress',
      slaDueAt: slaDue,
      slaRemainingSeconds: 7200,
      createdAt: now,
      updatedAt: now,
    });

    // Step 1: Staff moves status to 'waiting_on_user' (Pause the Clock)
    const pauseRes = await app.request(`/api/helpdesk/tickets/${ticketId}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        status: 'waiting_on_user',
        note: 'Awaiting semester 6 marksheet from applicant',
      }),
    }, { DB: mockDb as any, BETTER_AUTH_SECRET: 'test_secret' });
    expect(pauseRes.status).toBe(200);

    const ticketAfterPause = mockDb.tables.support_tickets.find((t) => t.id === ticketId);
    expect(ticketAfterPause.status).toBe('waiting_on_user');
    expect(ticketAfterPause.slaPausedAt).toBeDefined();

    // Step 2: Client replies with the requested details -> Status flips back to 'in_progress' and SLA resumes
    const replyRes = await app.request(`/api/public/portal/tickets/${ticketId}/messages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Portal-Token': CLIENT_A_TOKEN,
      },
      body: JSON.stringify({
        message: 'I have uploaded the semester 6 marksheet to the vault.',
      }),
    }, { DB: mockDb as any, BETTER_AUTH_SECRET: 'test_secret' });
    expect(replyRes.status).toBe(200);

    const ticketAfterReply = mockDb.tables.support_tickets.find((t) => t.id === ticketId);
    expect(ticketAfterReply.status).toBe('in_progress');
    expect(ticketAfterReply.slaPausedAt).toBeNull();
    expect(ticketAfterReply.slaDueAt).toBeGreaterThan(now);
  });

  it('6. Client can submit CSAT 5-star feedback upon resolution', async () => {
    const ticketId = 'tick_csat_1';
    mockDb.tables.support_tickets.push({
      id: ticketId,
      ticketNumber: 'HD-1005',
      source: 'client',
      clientId: CLIENT_A_ID,
      creatorName: 'Sarah Connor',
      division: 'billing',
      category: 'payment_billing',
      subject: 'GST Invoice request',
      description: 'Need GST invoice copy',
      priority: 'low',
      status: 'resolved',
      createdAt: Math.floor(Date.now() / 1000),
      updatedAt: Math.floor(Date.now() / 1000),
    });

    const res = await app.request(`/api/public/portal/tickets/${ticketId}/satisfaction`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Portal-Token': CLIENT_A_TOKEN,
      },
      body: JSON.stringify({
        rating: 5,
        feedback: 'Super fast turnaround by the finance team!',
      }),
    }, { DB: mockDb as any, BETTER_AUTH_SECRET: 'test_secret' });

    expect(res.status).toBe(200);
    const updated = mockDb.tables.support_tickets.find((t) => t.id === ticketId);
    expect(updated.satisfactionRating).toBe(5);
    expect(updated.satisfactionFeedback).toBe('Super fast turnaround by the finance team!');
  });

  it('7. Partner can create and manage partner escalation tickets with bearer auth', async () => {
    // 1. Unauthorized attempt without token
    const unauthRes = await app.request(`/api/partner/${PARTNER_A_ID}/tickets`, {
      method: 'GET',
    }, { DB: mockDb as any, BETTER_AUTH_SECRET: 'test_secret' });
    expect(unauthRes.status).toBe(401);

    // 2. Authorized create ticket
    const createRes = await app.request(`/api/partner/${PARTNER_A_ID}/tickets`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${PARTNER_A_TOKEN}`,
      },
      body: JSON.stringify({
        division: 'general',
        category: 'commission_payout',
        priority: 'high',
        subject: 'August Batch Payout Reconciliation',
        description: 'Please verify commission for Oxford referral #402',
      }),
    }, { DB: mockDb as any, BETTER_AUTH_SECRET: 'test_secret' });

    expect(createRes.status).toBe(200);
    const body: any = await createRes.json();
    expect(body.success).toBe(true);

    const partnerTickets = mockDb.tables.support_tickets.filter((t) => t.partnerId === PARTNER_A_ID);
    expect(partnerTickets.length).toBe(1);
    expect(partnerTickets[0].source).toBe('partner');
    expect(partnerTickets[0].priority).toBe('high');
  });
});
