import { describe, it, expect, beforeEach, vi } from 'vitest';
import { handleLeadConversionGoal } from '../src/services/conversionGoals.js';
import { runSmartChannelSwitcher, runPipelineStallRecovery } from '../src/services/channelSwitcher.js';
import { MockD1Database } from './mockDb.js';

describe('Conversion Goal Exit Engine & Smart Channel Switcher', () => {
  let mockD1: MockD1Database;

  beforeEach(() => {
    mockD1 = new MockD1Database();
    mockD1.tables.clients.push({
      id: 'OP-2026-9001',
      portal_token: 'OP-2026-9001',
      name: 'Conversion Test User',
      phone: '+919876543210',
      email: 'convert@test.com',
      status: 'active',
      created_at: Math.floor(Date.now() / 1000),
      updated_at: Math.floor(Date.now() / 1000),
    } as any);

    // Schedule 2 prospecting nurture touches
    mockD1.tables.nurture_touches.push(
      {
        id: 'touch-1',
        client_id: 'OP-2026-9001',
        channel: 'email',
        stage: 'value',
        body: 'Explore UK Universities',
        due_at: Math.floor(Date.now() / 1000) + 86400,
        status: 'scheduled',
        created_at: Math.floor(Date.now() / 1000),
      } as any,
      {
        id: 'touch-2',
        client_id: 'OP-2026-9001',
        channel: 'whatsapp',
        stage: 'offer',
        body: 'Claim 48h Waiver',
        due_at: Math.floor(Date.now() / 1000) + 172800,
        status: 'scheduled',
        created_at: Math.floor(Date.now() / 1000),
      } as any
    );
  });

  it('handleLeadConversionGoal immediately suppresses all scheduled prospecting touches', async () => {
    const res = await handleLeadConversionGoal(
      { DB: mockD1 },
      {
        clientId: 'OP-2026-9001',
        division: 'study-abroad',
        goalType: 'PAYMENT_CONFIRMED',
        amountPaise: 5000000,
      }
    );

    expect(res.success).toBe(true);
    expect(res.suppressedTouches).toBe(2);
  });

  it('runSmartChannelSwitcher identifies stale email touches and triggers escalation', async () => {
    const threeDaysAgo = Math.floor(Date.now() / 1000) - 259200;
    mockD1.tables.nurture_touches.push({
      id: 'touch-stale',
      client_id: 'OP-2026-9001',
      channel: 'email',
      stage: 'case_study',
      body: 'Scholarship announcement',
      due_at: threeDaysAgo,
      sent_at: threeDaysAgo,
      status: 'sent',
      created_at: threeDaysAgo,
    } as any);

    const res = await runSmartChannelSwitcher({ DB: mockD1 });
    expect(res.escalatedCount).toBeGreaterThanOrEqual(1);
  });

  it('runPipelineStallRecovery nudges applications stalled >5 days', async () => {
    const sixDaysAgo = Math.floor(Date.now() / 1000) - 518400;
    mockD1.tables.tasks.push({
      id: 'task-stalled-1',
      client_id: 'OP-2026-9001',
      title: 'Collect IELTS scorecard',
      status: 'open',
      created_at: sixDaysAgo,
    } as any);

    const res = await runPipelineStallRecovery({ DB: mockD1 });
    expect(res.stalledNudgesCount).toBe(1);
  });
});
