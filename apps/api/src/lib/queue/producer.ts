/**
 * Cloudflare Queues Type-Safe Job Producer
 * Dispatches non-blocking async tasks off the critical HTTP path.
 */

export type QueueJobType =
  | 'DISPATCH_TRANSACTIONAL_EMAIL'
  | 'DISPATCH_WHATSAPP_MESSAGE'
  | 'GENERATE_PDF_INVOICE'
  | 'SYNC_ERPNEXT_PAYMENT'
  | 'ARCHIVE_AUDIT_RECORD';

export interface QueueJob<T = any> {
  id: string;
  type: QueueJobType;
  payload: T;
  enqueuedAt: string;
  attempts?: number;
}

/**
 * Enqueues a job into Cloudflare Queues with sub-millisecond overhead.
 * If queue binding is unconfigured (e.g. unit tests / local dev), returns gracefully.
 */
export async function enqueueJob<T>(
  queue: Queue<QueueJob<T>> | undefined,
  type: QueueJobType,
  payload: T
): Promise<{ enqueued: boolean; jobId: string }> {
  const jobId = 'job_' + crypto.randomUUID().slice(0, 12);
  const job: QueueJob<T> = {
    id: jobId,
    type,
    payload,
    enqueuedAt: new Date().toISOString(),
    attempts: 0,
  };

  if (!queue) {
    return { enqueued: false, jobId };
  }

  try {
    await queue.send(job);
    return { enqueued: true, jobId };
  } catch (err: any) {
    console.error(`[queue-producer] Failed to enqueue job ${type}:`, err?.message);
    return { enqueued: false, jobId };
  }
}
