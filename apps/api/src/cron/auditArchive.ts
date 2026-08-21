// Phase 3 — monthly audit log archival to R2 (tamper-evident export).
// Every previous-month audit_log row is shipped to BUCKET as
// audit-archive/YYYY-MM.jsonl + a manifest (rowCount, chainHead, fileSha256).
// Idempotent via app_settings.audit_archive_last_month — once a month is
// archived, later runs in the same calendar month skip. FAIL-OPEN: the cron
// must never throw; every failure returns { archived: false, reason }.

import { eq } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { auditLog, appSettings } from '../db/schema.js';
import { sha256Hex } from '../lib/auditChain.js';

export interface AuditArchiveEnv {
  DB?: D1Database;
  BUCKET?: { put(key: string, value: string): Promise<unknown> };
}

export interface AuditArchiveResult {
  archived: boolean;
  month: string;
  rows: number;
  reason?: string;
}

const SETTING_KEY = 'audit_archive_last_month';

// Drizzle returns camelCase props on real D1; MockD1Database stores snake_case.
// Emit snake_case columns as stored in audit_log for the JSONL archive.
const AUDIT_COLUMNS = [
  'id', 'actor_id', 'action', 'entity_name', 'entity_id', 'before_state',
  'after_state', 'ip_address', 'created_at', 'category', 'actor_type',
  'result', 'auth_method', 'data_classification', 'request_id',
  'schema_version', 'prev_hash', 'record_hash',
];

function toSnakeRow(row: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const col of AUDIT_COLUMNS) {
    const camel = col.replace(/_([a-z])/g, (g) => g[1].toUpperCase());
    out[col] = row[col] ?? row[camel] ?? null;
  }
  return out;
}

function tsOf(row: Record<string, any>): number {
  return Number(row.created_at ?? row.createdAt ?? 0);
}

function utcMonthKey(now = new Date()): string {
  return `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
}

function prevMonthKey(now = new Date()): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

export async function runAuditArchive(env: AuditArchiveEnv): Promise<AuditArchiveResult> {
  const month = prevMonthKey();
  if (!env?.DB) return { archived: false, month, rows: 0, reason: 'no-db' };
  if (!env.BUCKET) return { archived: false, month, rows: 0, reason: 'no-bucket' };

  const db = getDb(env.DB);
  try {
    // Idempotency gate: a month is archived at most once.
    const setting = await db.select().from(appSettings).where(eq(appSettings.key, SETTING_KEY)).get();
    if (setting?.value === month) {
      return { archived: false, month, rows: 0, reason: 'already-archived' };
    }

    // Previous months only: created_at < start of current UTC month.
    const startOfMonth = Math.floor(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1) / 1000);
    const all = await db.select().from(auditLog).all();
    const rows = all
      .map(toSnakeRow)
      .filter((r) => tsOf(r) < startOfMonth)
      .sort((a, b) => tsOf(a) - tsOf(b)); // created_at ASC — chain order

    const jsonl = rows.map((r) => JSON.stringify(r)).join('\n');
    const chainHead = rows.length > 0 ? rows[rows.length - 1].record_hash || 'GENESIS' : 'GENESIS';
    const fileSha256 = await sha256Hex(jsonl);

    await env.BUCKET.put(`audit-archive/${month}.jsonl`, jsonl);
    await env.BUCKET.put(
      `audit-archive/${month}.manifest.json`,
      JSON.stringify({ month, exportedAt: Math.floor(Date.now() / 1000), rowCount: rows.length, chainHead, fileSha256 })
    );

    const now = Math.floor(Date.now() / 1000);
    const existing = await db.select().from(appSettings).where(eq(appSettings.key, SETTING_KEY)).get();
    if (existing) {
      await db.update(appSettings).set({ value: month, updatedAt: now }).where(eq(appSettings.key, SETTING_KEY));
    } else {
      await db.insert(appSettings).values({ key: SETTING_KEY, value: month, updatedAt: now });
    }

    return { archived: true, month, rows: rows.length };
  } catch (e: any) {
    return { archived: false, month, rows: 0, reason: e?.message || String(e) };
  }
}
