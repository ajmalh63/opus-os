// Server-side audit chain verification (OWASP APTS-AR-012).
//
// TypeScript twin of scripts/audit-chain-verify.mjs — used by the admin
// verify-chain endpoint and the weekly monitor cron. MUST stay byte-identical
// with the .mjs implementation; tests/auditChainParity.test.ts cross-checks
// both sides on the same rows.

export function sha256Hex(input: string): Promise<string> {
  return crypto.subtle.digest('SHA-256', new TextEncoder().encode(input)).then((buf) =>
    Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('')
  );
}

// Deterministic serialization: sorted keys, stable JSON. MUST match audit.ts
// and scripts/audit-chain-verify.mjs.
export function canonicalize(obj: unknown): string {
  if (obj === null || obj === undefined) return 'null';
  if (typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(canonicalize).join(',') + ']';
  const keys = Object.keys(obj as any).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalize((obj as any)[k])).join(',') + '}';
}

// Reconstruct the exact payload the writer hashed. MUST match audit.ts.
export function buildPayload(row: Record<string, any>): Record<string, unknown> {
  return {
    actorId: row.actor_id ?? null,
    action: row.action,
    entityName: row.entity_name,
    entityId: row.entity_id,
    beforeState: row.before_state ?? null,
    afterState: row.after_state ?? null,
    ipAddress: row.ip_address ?? null,
    createdAt: row.created_at,
    category: row.category ?? null,
    actorType: row.actor_type ?? null,
    result: row.result ?? null,
    authMethod: row.auth_method ?? null,
    dataClassification: row.data_classification ?? null,
    requestId: row.request_id ?? null,
    schemaVersion: row.schema_version ?? null,
  };
}

export interface ChainVerificationResult {
  valid: boolean;
  total: number;
  preChain: number;
  firstBreak: number | null;
  reason: string | null;
}

// rows: audit_log rows (snake_case columns), any order — sorted by created_at
// ASC (stable; ties keep input order, matching SQLite rowid order).
export async function verifyChain(rows: Array<Record<string, any>>): Promise<ChainVerificationResult> {
  const sorted = [...rows].sort((a, b) => (a.created_at ?? 0) - (b.created_at ?? 0));

  let prev = 'GENESIS';
  let preChain = 0;
  for (let i = 0; i < sorted.length; i++) {
    const row = sorted[i];
    if (!row.record_hash) {
      preChain++;
      continue;
    }
    if (row.prev_hash !== prev) {
      return { valid: false, total: sorted.length, preChain, firstBreak: i, reason: `prev_hash mismatch at index ${i}: expected ${prev}, got ${row.prev_hash}` };
    }
    const expected = await sha256Hex(prev + canonicalize(buildPayload(row)));
    if (expected !== row.record_hash) {
      return { valid: false, total: sorted.length, preChain, firstBreak: i, reason: `record_hash mismatch at index ${i}: expected ${expected}, got ${row.record_hash}` };
    }
    prev = row.record_hash;
  }
  return { valid: true, total: sorted.length, preChain, firstBreak: null, reason: null };
}