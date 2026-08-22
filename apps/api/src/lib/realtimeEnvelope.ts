// realtimeEnvelope.ts — Versioned sync event envelope (gold-standard: versioned, idempotent, auditable)
import { z } from 'zod';

export const syncEventSchema = z.object({
  v: z.literal(1).default(1),
  id: z.string().uuid(), // crypto.randomUUID() — dedupe key in DO SQLite
  channel: z.string().min(3).max(200), // e.g. departure:dep_123:inventory — validated against allowlist in Worker
  type: z.string().min(3).max(64), // INVENTORY_UPDATED | BOOKING_CREATED | DOCUMENT_VERIFIED | COMMISSION_MATURED
  payload: z.unknown(),
  ts: z.number().int().positive(), // Date.now() ms
  auditId: z.string().optional(), // audit_log.id for gap recovery via audit chain
});

export type SyncEvent = z.infer<typeof syncEventSchema>;

export const syncSubscribeSchema = z.object({
  route: z.enum(['SUBSCRIBE', 'UNSUBSCRIBE', 'PING']),
  channels: z.array(z.string().min(3).max(200)).max(20).optional(),
  since: z.number().int().optional(), // last ts seen — for replay gap
});

export type SyncSubscribeMsg = z.infer<typeof syncSubscribeSchema>;

// Batch envelope — reduces WS context switches (CF best practice: batch 50/50ms)
export const syncBatchSchema = z.array(syncEventSchema).max(50);
export type SyncBatch = z.infer<typeof syncBatchSchema>;
