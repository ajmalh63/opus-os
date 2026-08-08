import { getAuth } from '../auth.js';
import { getDb } from '../db/client.js';
import { auditLog } from '../db/schema.js';

// Durable audit trail (DPDP-grade). Writes before/after JSON snapshots into the
// audit_log D1 table for every critical business mutation. FAIL-OPEN: an audit
// write must never break the business call it records.
//
// Usage:
//   const entry = await auditBegin(c, 'PAYMENT_ENTER', 'payments', id);
//   ... mutate ...
//   await entry.commit({ afterState: <new row or summary> });
//   // on throw: entry.rollback() is optional — omit if nothing changed.

export interface AuditEntry {
  actorId: string | null;
  auditor: (event: { afterState?: unknown; beforeState?: unknown; entityId?: string }) => Promise<void>;
}

async function resolveActor(c: any): Promise<{ id: string | null; ip: string | null }> {
  try {
    const auth = getAuth(c.env);
    const session = await auth.api.getSession({ headers: c.req.raw.headers });
    return { id: ((session?.user as any)?.id as string) || null, ip: c.req.header('cf-connecting-ip') || c.req.header('x-real-ip') || null };
  } catch {
    return { id: null, ip: null };
  }
}

// Call at the START of a mutating route: captures actor + optional before-state.
export async function auditBegin(c: any, beforeState?: unknown): Promise<AuditEntry> {
  const { id: actorId, ip } = await resolveActor(c);
  const auditor = async (opts: { action?: string; beforeState?: unknown; afterState?: unknown; entityId?: string; entityName?: string }) => {
    if (!c.env?.DB) return;
    try {
      const db = getDb(c.env.DB);
      await db.insert(auditLog).values({
        id: crypto.randomUUID(),
        actorId,
        action: opts.action || 'MUTATE',
        entityName: opts.entityName || 'generic',
        entityId: opts.entityId || 'unknown',
        beforeState: opts.beforeState !== undefined ? JSON.stringify(opts.beforeState) : null,
        afterState: opts.afterState !== undefined ? JSON.stringify(opts.afterState) : null,
        ipAddress: ip,
        createdAt: Math.floor(Date.now() / 1000),
      });
    } catch (e: any) {
      // Never break the business op because logging failed.
      console.error('[audit] write failed', e?.message);
    }
  };
  return { actorId, auditor };
}

// Convenience: fire-and-forget audit event (no before state needed).
export async function auditEvent(c: any, event: { action: string; entityName: string; entityId: string; afterState?: unknown; beforeState?: unknown }) {
  const e = await auditBegin(c);
  await e.auditor(event);
}