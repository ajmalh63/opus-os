import { describe, it, expect, vi } from 'vitest';
import { enqueueJob } from '../src/lib/queue/producer.js';

describe('Cloudflare Queues Pipeline', () => {
  it('enqueues jobs into Cloudflare Queue binding', async () => {
    const sentMessages: any[] = [];
    const mockQueue = {
      send: vi.fn(async (msg: any) => {
        sentMessages.push(msg);
      }),
    } as any;

    const result = await enqueueJob(mockQueue, 'DISPATCH_TRANSACTIONAL_EMAIL', {
      to: 'student@example.com',
      template: 'verify',
    });

    expect(result.enqueued).toBe(true);
    expect(result.jobId).toMatch(/^job_[a-z0-9]+/);
    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0].type).toBe('DISPATCH_TRANSACTIONAL_EMAIL');
    expect(sentMessages[0].payload.to).toBe('student@example.com');
  });

  it('handles unconfigured queue gracefully without throwing', async () => {
    const result = await enqueueJob(undefined, 'SYNC_ERPNEXT_PAYMENT', { paymentId: 'pay-123' });
    expect(result.enqueued).toBe(false);
    expect(result.jobId).toBeTruthy();
  });
});
