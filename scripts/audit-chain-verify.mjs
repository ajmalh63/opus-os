#!/usr/bin/env node
// Gold-standard audit chain verifier (OWASP APTS-AR-012).
//
// Walks audit_log rows and recomputes the SHA-256 hash chain written by
// middleware/audit.ts:
//   record_hash(n) = SHA-256(prev_hash(n) + canonicalize(payload(n)))
//   prev_hash(0)   = 'GENESIS'
//
// Detects: modification of any field, deletion of rows, reordering.
//
// Usage:
//   node scripts/audit-chain-verify.mjs <audit-export.json|jsonl> [--json]
//   node scripts/audit-chain-verify.mjs --self-test
//
// Export source (local dev):
//   npx wrangler d1 export DB --local --table audit_log --output audit.json
//
// IMPORTANT: canonicalize() and buildPayload() MUST stay byte-identical with
// the TypeScript implementation in apps/api/src/middleware/audit.ts. The test
// suite (tests/auditChain.test.ts) cross-checks both sides — if they drift,
// verifyChain fails on a legitimately-written chain.

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

export function sha256Hex(input) {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

// Deterministic serialization: sorted keys, stable JSON. MUST match audit.ts.
export function canonicalize(obj) {
  if (obj === null || obj === undefined) return 'null';
  if (typeof obj !== 'object') return JSON.stringify(obj);
  if (Array.isArray(obj)) return '[' + obj.map(canonicalize).join(',') + ']';
  const keys = Object.keys(obj).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonicalize(obj[k])).join(',') + '}';
}

// Reconstruct the exact payload the writer hashed. MUST match audit.ts.
export function buildPayload(row) {
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

// rows: array of audit_log rows (snake_case columns). Sorted by created_at ASC
// (stable — ties keep input order, matching SQLite rowid order).
export function verifyChain(rows) {
  const sorted = [...rows].sort((a, b) => (a.created_at ?? 0) - (b.created_at ?? 0));

  let prev = 'GENESIS';
  let preChain = 0;
  for (let i = 0; i < sorted.length; i++) {
    const row = sorted[i];
    // Rows written before the v1.1 migration have no record_hash — they are
    // pre-chain rows (backfill script assigns hashes; until then they are
    // reported, not treated as breaks).
    if (!row.record_hash) {
      preChain++;
      continue;
    }
    if (row.prev_hash !== prev) {
      return { valid: false, total: sorted.length, preChain, firstBreak: i, reason: `prev_hash mismatch at index ${i}: expected ${prev}, got ${row.prev_hash}` };
    }
    const expected = sha256Hex(prev + canonicalize(buildPayload(row)));
    if (expected !== row.record_hash) {
      return { valid: false, total: sorted.length, preChain, firstBreak: i, reason: `record_hash mismatch at index ${i}: expected ${expected}, got ${row.record_hash}` };
    }
    prev = row.record_hash;
  }
  return { valid: true, total: sorted.length, preChain, firstBreak: null, reason: null };
}

function selfTest() {
  const mk = (i, prev, after) => ({
    id: `e${i}`, actor_id: null, action: 'TEST', entity_name: 'test', entity_id: `x${i}`,
    before_state: null, after_state: JSON.stringify({ n: i, after }), ip_address: null,
    created_at: 1000 + i, category: 'system', actor_type: 'system', result: 'success',
    auth_method: 'none', data_classification: 'internal', request_id: null,
    schema_version: '1.1', prev_hash: prev, record_hash: null,
  });
  const rows = [];
  let prev = 'GENESIS';
  for (let i = 0; i < 5; i++) {
    const row = mk(i, prev, i);
    row.record_hash = sha256Hex(prev + canonicalize(buildPayload(row)));
    prev = row.record_hash;
    rows.push(row);
  }
  const ok = verifyChain(rows);
  if (!ok.valid) throw new Error(`self-test: valid chain reported invalid: ${ok.reason}`);

  rows[2].after_state = JSON.stringify({ n: 2, after: 'TAMPERED' });
  const broken = verifyChain(rows);
  if (broken.valid) throw new Error('self-test: tampered chain reported valid');
  if (broken.firstBreak !== 2) throw new Error(`self-test: expected break at 2 (the tampered row), got ${broken.firstBreak}`);

  console.log('self-test OK: valid chain passes, tampered chain detected at index 2');
  return 0;
}

function loadRows(file) {
  const raw = readFileSync(file, 'utf8').trim();
  if (raw.startsWith('[')) return JSON.parse(raw);
  // JSONL
  return raw.split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

// ---- CLI (runs only when invoked directly, not when imported by tests) ----
const isDirectRun = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;

if (isDirectRun) {
  const args = process.argv.slice(2);
  if (args.includes('--self-test')) {
    process.exit(selfTest());
  }

  const file = args.find((a) => !a.startsWith('--'));
  if (!file) {
    console.error('Usage: node scripts/audit-chain-verify.mjs <audit-export.json|jsonl> [--json]');
    console.error('       node scripts/audit-chain-verify.mjs --self-test');
    process.exit(2);
  }

  const result = verifyChain(loadRows(file));
  if (args.includes('--json')) {
    console.log(JSON.stringify(result, null, 2));
  } else if (result.valid) {
    console.log(`✓ chain valid: ${result.total} rows${result.preChain ? ` (${result.preChain} pre-chain)` : ''}`);
  } else {
    console.error(`✗ chain BROKEN: ${result.reason}`);
  }
  process.exit(result.valid ? 0 : 1);
}