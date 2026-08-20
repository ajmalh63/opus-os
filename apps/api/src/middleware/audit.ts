import { getAuth } from '../auth.js';
import { getDb } from '../db/client.js';
import { auditLog } from '../db/schema.js';
import { desc, sql } from 'drizzle-orm';
import { isRateLimited } from './rateLimit.js';
import { logRuntime } from '../infra/runtimeLog.js';

// Durable, tamper-evident audit trail (DPDP-grade, OWASP APTS-AR-012).
// Writes before/after JSON snapshots into the audit_log D1 table for every
// critical business mutation, chained cryptographically:
//   record_hash(n) = SHA-256(prev_hash(n) + canonicalize(payload(n)))
//   prev_hash(0)   = 'GENESIS'
// Any modification/deletion/reordering of a past row breaks the chain —
// detectable by scripts/audit-chain-verify.mjs (weekly cron + on demand).
// FAIL-OPEN: an audit write must never break the business call it records.
//
// Usage:
//   const entry = await auditBegin(c, 'PAYMENT_ENTER', 'payments', id);
//   ... mutate ...
//   await entry.commit({ afterState: <new row or summary> });
//   // on throw: entry.rollback() is optional — omit if nothing changed.
//
// v1.1 metadata (docs/audit-logging-gold-standard.md): category, actorType,
// result, authMethod, dataClassification, requestId, schemaVersion.

export const AUDIT_SCHEMA_VERSION = '1.1';

export interface AuditEventInput {
  action: string;
  entityName: string;
  entityId: string;
  afterState?: unknown;
  beforeState?: unknown;
  category?: string; // explicit override; else derived from action
  result?: 'success' | 'denied' | 'error';
  actorType?: 'user' | 'system' | 'partner' | 'service' | 'public';
  authMethod?: 'session' | 'partner_token' | 'service_token' | 'hmac' | 'secret' | 'none';
  dataClassification?: 'public' | 'internal' | 'confidential' | 'restricted';
  redactKeys?: string[]; // extra sensitive keys to redact in before/after state
}

export interface AuditEntry {
  actorId: string | null;
  auditor: (event: { afterState?: unknown; beforeState?: unknown; entityId?: string }) => Promise<void>;
}

// ---------------------------------------------------------------------------
// Canonical serialization — MUST stay byte-identical with
// scripts/audit-chain-verify.mjs (canonicalize). The test suite cross-checks.
// ---------------------------------------------------------------------------
export function canonicalize(obj: unknown): string {
  if (obj === null || obj === undefined) return 'null';
  if (typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(canonicalize).join(',') + ']';
  const keys = Object.keys(obj as any).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalize((obj as any)[k])).join(',') + '}';
}

async function sha256Hex(input: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(input));
  return Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// ---------------------------------------------------------------------------
// PII redaction (APTS-AR-015 / DPDP minimization): sensitive keys are replaced
// with [REDACTED] recursively before state is serialized into the audit row.
// ---------------------------------------------------------------------------
const DEFAULT_SENSITIVE_KEYS = new Set([
  'password', 'passwordHash', 'apiToken', 'bankAccount', 'passportNumber',
  'sha256Hash', 'secret', 'authorization', 'accessToken', 'refreshToken',
  'idToken', 'otp', 'totpSecret', 'backupCodes',
]);

export function redactPayload(payload: unknown, extraKeys?: string[]): unknown {
  if (payload === null || payload === undefined) return payload;
  if (typeof payload !== 'object') return payload;
  const sensitive = new Set([...DEFAULT_SENSITIVE_KEYS, ...(extraKeys || [])]);
  const walk = (node: any): any => {
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === 'object') {
      const out: Record<string, any> = {};
      for (const [k, v] of Object.entries(node)) {
        out[k] = sensitive.has(k) ? '[REDACTED]' : walk(v);
      }
      return out;
    }
    return node;
  };
  return walk(payload);
}

// ---------------------------------------------------------------------------
// Category taxonomy (OCSF-aligned): derived from the action string unless an
// explicit category is passed. Order matters — most specific prefixes first.
// ---------------------------------------------------------------------------
const CATEGORY_BY_PREFIX: Array<[string, string]> = [
  ['PAYMENT', 'money'], ['INCENTIVE', 'money'], ['PAYOUT', 'money'], ['COMMISSION', 'money'],
  ['REFUND', 'money'], ['TRANSACTION', 'money'], ['MEMBERSHIP_PLAN', 'money'],
  ['MEMBERSHIP_GRANTED', 'money'], ['UMRAH_ADVANCE', 'money'], ['UMRAH_BALANCE', 'money'],
  ['AGREEMENT', 'compliance'], ['CONSENT', 'compliance'], ['COMPLIANCE', 'compliance'],
  ['TDS', 'compliance'], ['TCS', 'compliance'], ['GST', 'compliance'],
  ['DOC_', 'document'], ['UPLOAD', 'document'],
  ['LEAD', 'lead'],
  ['PARTNER', 'partner'], ['REFERRAL', 'partner'],
  ['SETTINGS', 'config'], ['BOARD_PREFS', 'config'], ['SEO_', 'config'], ['REPORT_', 'config'],
  ['TIER_SAVED', 'config'], ['PRICE_BANDS', 'config'], ['RATE_CARD', 'config'],
  ['UMRAH_PACKAGE', 'config'], ['VISA_PRODUCT', 'config'],
  ['NURTURE', 'communication'], ['MESSAGE', 'communication'], ['INBOX', 'communication'],
  ['BOOKING', 'communication'],
  ['BOOTSTRAP', 'auth'], ['TWO_FACTOR', 'auth'], ['LOGIN', 'auth'], ['SIGNUP', 'auth'], ['SESSION', 'auth'],
  ['ACCESS_DENIED', 'access'], ['STAFF_SCOPE', 'access'], ['OWNER_PERMS', 'access'], ['RBAC', 'access'],
  ['STAGE_CHANGE', 'workflow'], ['VISA_', 'workflow'], ['OFFER_', 'workflow'],
  ['PROFILE_UPDATED', 'workflow'], ['PRIMARY_INTENT', 'workflow'], ['STUDY_ABROAD', 'workflow'],
  ['ATTESTATION', 'workflow'], ['UMRAH_BOOKING', 'workflow'], ['UMRAH_DEPARTURE', 'workflow'],
  ['HEARTBEAT', 'system'], ['ARCHIVE', 'system'], ['CRON', 'system'],
];

export function categoryForAction(action: string): string {
  const upper = action.toUpperCase();
  for (const [prefix, category] of CATEGORY_BY_PREFIX) {
    if (upper.startsWith(prefix)) return category;
  }
  return 'system';
}

// ---------------------------------------------------------------------------
// Chain head: last record_hash (or 'GENESIS' for an empty log).
// ---------------------------------------------------------------------------
async function getChainHead(db: ReturnType<typeof getDb>): Promise<string> {
  try {
    const row = await db
      .select({ recordHash: auditLog.recordHash })
      .from(auditLog)
      .orderBy(desc(auditLog.createdAt), sql`rowid desc`)
      .limit(1)
      .get();
    return row?.recordHash || 'GENESIS';
  } catch {
    return 'GENESIS'; // fail-open: never block the business op on chain lookup
  }
}

// ---------------------------------------------------------------------------
// Core write path (shared by auditEvent / auditSystem).
// ---------------------------------------------------------------------------
async function writeAudit(
  env: { DB?: D1Database },
  event: AuditEventInput,
  ctx: { actorId: string | null; ip: string | null; actorType: string; authMethod: string; requestId: string }
): Promise<void> {
  if (!env?.DB) return;
  try {
    const db = getDb(env.DB);
    const prevHash = await getChainHead(db);
    const createdAt = Math.floor(Date.now() / 1000);
    const category = event.category || categoryForAction(event.action);
    const result = event.result || 'success';
    const actorType = event.actorType || ctx.actorType;
    const authMethod = event.authMethod || ctx.authMethod;
    const dataClassification = event.dataClassification || 'internal';
    const beforeState = event.beforeState !== undefined ? JSON.stringify(redactPayload(event.beforeState, event.redactKeys)) : null;
    const afterState = event.afterState !== undefined ? JSON.stringify(redactPayload(event.afterState, event.redactKeys)) : null;

    const payload = {
      actorId: ctx.actorId,
      action: event.action,
      entityName: event.entityName,
      entityId: event.entityId,
      beforeState,
      afterState,
      ipAddress: ctx.ip,
      createdAt,
      category,
      actorType,
      result,
      authMethod,
      dataClassification,
      requestId: ctx.requestId,
      schemaVersion: AUDIT_SCHEMA_VERSION,
    };
    const recordHash = await sha256Hex(prevHash + canonicalize(payload));

    await db.insert(auditLog).values({
      id: crypto.randomUUID(),
      actorId: ctx.actorId,
      action: event.action,
      entityName: event.entityName,
      entityId: event.entityId,
      beforeState,
      afterState,
      ipAddress: ctx.ip,
      createdAt,
      category,
      actorType,
      result,
      authMethod,
      dataClassification,
      requestId: ctx.requestId,
      schemaVersion: AUDIT_SCHEMA_VERSION,
      prevHash,
      recordHash,
    });
  } catch (e: any) {
    // Never break the business op because logging failed.
    console.error('[audit] write failed', e?.message);
    // Canary for the audit-monitor cron (source='audit.write' failures are
    // counted and alerted on within 24h).
    void logRuntime(env as any, 'error', 'audit.write', 'audit write failed', { message: e?.message });
  }
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
    await writeAudit(
      c.env,
      {
        action: opts.action || 'MUTATE',
        entityName: opts.entityName || 'generic',
        entityId: opts.entityId || 'unknown',
        beforeState: opts.beforeState !== undefined ? opts.beforeState : beforeState,
        afterState: opts.afterState,
      },
      { actorId, ip, actorType: actorId ? 'user' : 'public', authMethod: actorId ? 'session' : 'none', requestId: c.req?.header?.('cf-ray') || crypto.randomUUID() }
    );
  };
  return { actorId, auditor };
}

// Convenience: fire-and-forget audit event (no before state needed).
export async function auditEvent(c: any, event: AuditEventInput) {
  const { id: actorId, ip } = await resolveActor(c);
  await writeAudit(
    c.env,
    event,
    { actorId, ip, actorType: actorId ? 'user' : 'public', authMethod: actorId ? 'session' : 'none', requestId: c.req?.header?.('cf-ray') || crypto.randomUUID() }
  );
}

// System-context audit (cron / scheduled handlers / machine lanes): no request
// context to resolve an actor from — actorId stays null, IP stays null.
// Same fail-open guarantee as auditEvent.
export async function auditSystem(env: { DB?: D1Database }, event: AuditEventInput) {
  await writeAudit(env, event, { actorId: null, ip: null, actorType: 'system', authMethod: 'none', requestId: crypto.randomUUID() });
}

// Bounded audit for high-frequency rejection paths (RBAC denials, webhook HMAC
// failures, payment-verify failures): rate-limited per (bucket, identity) so
// scanner floods never bloat the audit log. SOC 2 CC6.1 — failures ARE logged,
// but bounded. Fail-open: audit must never change the request outcome.
const DENIAL_BUCKET = { windowSeconds: 3600, limit: 20 };
const WEBHOOK_BUCKET = { windowSeconds: 3600, limit: 10 };

export async function auditBounded(c: any, event: AuditEventInput, kind: 'denial' | 'webhook' | 'verify' = 'denial', identity?: string) {
  try {
    const cookie = c.req?.header?.('cookie') || '';
    const token = (cookie.match(/better-auth\.session_token=([^;]+)/) || [])[1] || '';
    const ip = c.req?.header?.('cf-connecting-ip') || c.req?.header?.('x-real-ip') || 'anon';
    const id = identity || token || ip;
    const rule = kind === 'denial' ? { bucket: 'audit-denied', ...DENIAL_BUCKET } : { bucket: 'audit-webhook', ...WEBHOOK_BUCKET };
    const { over } = await isRateLimited(c.env, rule, `${id}|${event.action}`);
    if (over) return;
    await auditEvent(c, event);
  } catch { /* fail-open */ }
}