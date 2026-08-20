// Phase 4 — audit monitoring & alerting (scheduled cron + on-demand).
// Runs three independent checks every interval:
//   1. Chain integrity — re-verify the tamper-evident hash chain over ALL
//      audit_log rows (byte-identical logic to scripts/audit-chain-verify.mjs
//      via lib/auditChain.ts). A break means someone edited/deleted/reordered
//      a past row — the single most serious audit event.
//   2. Denied-access spike — >50 ACCESS_DENIED events in the last hour is a
//      likely intrusion attempt (scanner flood / credential stuffing).
//   3. Audit write failures — >10 audit.write runtime_log rows in 24h means
//      the audit pipeline itself is degrading (the canary the writer feeds:
//      middleware/audit.ts logs every failed write under source='audit.write').
// FAIL-OPEN: the monitor must never crash the cron — every alert send is
// best-effort (try/catch + allSettled) and the whole run wraps in try/catch.

import { eq } from 'drizzle-orm';
import { getDb } from '../db/client.js';
import { auditLog, runtimeLogs } from '../db/schema.js';
import { verifyChain } from '../lib/auditChain.js';
import { sendNotification } from '../infra/notify.js';
import { createStaffAlert } from '../infra/staffAlerts.js';

export interface AuditMonitorEnv {
  DB?: D1Database;
  OPS_TELEGRAM_CHAT_ID?: string;
  TELEGRAM_BOT_TOKEN?: string;
}

export interface AuditMonitorResult {
  checked: boolean;
  alerts: string[]; // alert bodies; empty = healthy
  reason?: string; // set when checked=false (fail-open error)
}

const DENIED_WINDOW_SECONDS = 3600;
const DENIED_THRESHOLD = 50;
const WRITE_FAIL_WINDOW_SECONDS = 86400;
const WRITE_FAIL_THRESHOLD = 10;

// Drizzle returns camelCase props on real D1; the test MockD1Database returns
// snake_case. Read either so the monitor is deterministic in both worlds.
function tsOf(row: Record<string, any>): number {
  const v = row.createdAt ?? row.created_at;
  return Number(v ?? 0);
}

// drizzle-orm/d1 remaps SELECT rows to schema property names (camelCase:
// actorId, recordHash, prevHash, afterState...). verifyChain and its
// buildPayload twin expect the raw snake_case column names (actor_id,
// record_hash, ...) — map back before verification.
function toSnakeRow(r: Record<string, any>): Record<string, any> {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(r)) {
    out[k.replace(/([A-Z])/g, (m) => '_' + m.toLowerCase())] = v;
  }
  return out;
}

export async function runAuditMonitor(env: AuditMonitorEnv): Promise<AuditMonitorResult> {
  if (!env?.DB) return { checked: false, alerts: [], reason: 'no DB binding configured' };

  const db = getDb(env.DB);
  const now = Math.floor(Date.now() / 1000);
  const alerts: string[] = [];

  try {
    // One full scan feeds both the chain check and the denied-spike check.
    const rows = (await db.select().from(auditLog).all()) as any[];

    // 1. Chain integrity — a broken chain outranks everything else.
    const chain = await verifyChain(rows.map(toSnakeRow));
    if (!chain.valid) {
      const body = `Audit chain verification FAILED: ${chain.reason} (firstBreak index ${chain.firstBreak}). Run scripts/audit-chain-verify.mjs immediately.`;
      alerts.push(body);
      await bestEffort([
        sendNotification(env as any, db, { channel: 'telegram', to: 'ops', subject: 'Audit chain BROKEN', body }),
        createStaffAlert(env as any, { division: 'ops', type: 'audit_chain_break', title: 'Audit chain BROKEN', body, severity: 'urgent' }),
      ]);
    }

    // 2. Denied-access spike (brute-force / scanner flood signal).
    const deniedCutoff = now - DENIED_WINDOW_SECONDS;
    const deniedCount = rows.filter((r) => r.action === 'ACCESS_DENIED' && tsOf(r) >= deniedCutoff).length;
    if (deniedCount > DENIED_THRESHOLD) {
      const body = `ACCESS_DENIED spike: ${deniedCount} denials in the last hour (> ${DENIED_THRESHOLD}). Possible intrusion attempt.`;
      alerts.push(body);
      await bestEffort([
        sendNotification(env as any, db, { channel: 'telegram', to: 'ops', subject: 'ACCESS_DENIED spike', body }),
        createStaffAlert(env as any, { division: 'ops', type: 'audit_denied_spike', title: 'ACCESS_DENIED spike', body, severity: 'warning' }),
      ]);
    }

    // 3. Audit write failures (canary fed by middleware/audit.ts logRuntime).
    const writeRows = (await db.select().from(runtimeLogs).where(eq(runtimeLogs.source, 'audit.write')).all()) as any[];
    const writeCutoff = now - WRITE_FAIL_WINDOW_SECONDS;
    const writeFailCount = writeRows.filter((r) => tsOf(r) >= writeCutoff).length;
    if (writeFailCount > WRITE_FAIL_THRESHOLD) {
      const body = `Audit write failures: ${writeFailCount} audit.write errors in the last 24h (> ${WRITE_FAIL_THRESHOLD}). Audit pipeline degraded.`;
      alerts.push(body);
      await bestEffort([
        sendNotification(env as any, db, { channel: 'telegram', to: 'ops', subject: 'Audit write failures', body }),
      ]);
    }

    return { checked: true, alerts };
  } catch (e: any) {
    return { checked: false, alerts: [], reason: e?.message || String(e) };
  }
}

// Alert dispatch must never crash the cron (fail-open).
async function bestEffort(promises: Array<Promise<unknown>>): Promise<void> {
  await Promise.allSettled(promises.map((p) => Promise.resolve(p).catch(() => null)));
}
