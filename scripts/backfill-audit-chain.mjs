#!/usr/bin/env node
// One-time backfill: assigns SHA-256 chain hashes to audit_log rows written
// before migration 0071 (v1.1 hash chaining). Run ONCE after applying 0071:
//
//   npx wrangler d1 export DB --local --table audit_log --output audit.json
//   node scripts/backfill-audit-chain.mjs audit.json
//
// Output: audit-backfilled.json — import back into D1 with:
//   wrangler d1 execute DB --local --file audit-backfilled.sql
// (the script also emits the SQL UPDATE statements).
//
// Notes:
// - Chaining is recomputed in createdAt order (ties keep export order = rowid).
// - Rows that already have a record_hash are left untouched (idempotent).
// - This is a documented one-time migration event (docs/audit-logging-gold-
//   standard.md §4 Phase 1); after backfill the chain is continuous from the
//   very first audit row.

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { canonicalize, buildPayload, sha256Hex } from './audit-chain-verify.mjs';

function loadRows(file) {
  const raw = readFileSync(file, 'utf8').trim();
  if (raw.startsWith('[')) return JSON.parse(raw);
  return raw.split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/backfill-audit-chain.mjs <audit-export.json|jsonl> [--dry-run]');
  process.exit(2);
}

const rows = loadRows(file);
const sorted = [...rows].sort((a, b) => (a.created_at ?? 0) - (b.created_at ?? 0));

let prev = 'GENESIS';
let updated = 0;
const statements = [];

for (const row of sorted) {
  if (row.record_hash) {
    // Already chained — continue the chain from it (idempotent re-run).
    prev = row.record_hash;
    continue;
  }
  const payload = { ...buildPayload(row), schemaVersion: row.schema_version ?? '1.0' };
  // Pre-v1.1 rows have no v1.1 metadata columns; hash what exists. buildPayload
  // already defaults missing fields to null — the writer used the same shape.
  const recordHash = sha256Hex(prev + canonicalize(buildPayload(row)));
  row.prev_hash = prev;
  row.record_hash = recordHash;
  row.schema_version = row.schema_version ?? '1.0';
  prev = recordHash;
  updated++;
  const id = String(row.id).replace(/'/g, "''");
  statements.push(`UPDATE audit_log SET prev_hash = '${row.prev_hash}', record_hash = '${recordHash}', schema_version = '${row.schema_version}' WHERE id = '${id}';`);
}

console.log(`rows: ${rows.length} | backfilled: ${updated} | chain head: ${prev.slice(0, 12)}…`);

if (!process.argv.includes('--dry-run')) {
  writeFileSync('audit-backfilled.sql', statements.join('\n') + '\n', 'utf8');
  writeFileSync('audit-backfilled.json', JSON.stringify(sorted, null, 2), 'utf8');
  console.log('wrote audit-backfilled.sql + audit-backfilled.json');
}
