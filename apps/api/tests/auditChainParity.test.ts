import { describe, it, expect } from 'vitest';
import { verifyChain as verifyTs, canonicalize as canonTs, buildPayload as payloadTs } from '../src/lib/auditChain.js';
import { verifyChain as verifyJs, canonicalize as canonJs, buildPayload as payloadJs } from '../../../scripts/audit-chain-verify.mjs';

// Parity gate: the TS server-side verifier and the .mjs CLI verifier must
// agree byte-for-byte on the same rows (canonicalize + payload + chain walk).
// If either drifts, this test fails — protecting the audit chain's integrity
// guarantees across both implementations.

function makeRows() {
  const mk = (i: number, prev: string, after: unknown): Record<string, any> => ({
    id: `e${i}`, actor_id: i === 0 ? null : 'u1', action: 'TEST', entity_name: 'test', entity_id: `x${i}`,
    before_state: null, after_state: JSON.stringify({ n: i, after }), ip_address: '1.2.3.4',
    created_at: 1000 + i, category: 'system', actor_type: 'system', result: 'success',
    auth_method: 'none', data_classification: 'internal', request_id: 'ray-1',
    schema_version: '1.1', prev_hash: prev, record_hash: null,
  });
  const rows: any[] = [];
  let prev = 'GENESIS';
  for (let i = 0; i < 4; i++) {
    const row = mk(i, prev, i);
    row.record_hash = 'x'.repeat(64); // placeholder; replaced below via TS hash
    rows.push(row);
    prev = row.record_hash;
  }
  return rows;
}

describe('Audit chain parity (TS lib vs .mjs script)', () => {
  it('canonicalize is byte-identical', () => {
    const obj = { b: 1, a: [1, { d: null, c: 'x' }], z: undefined };
    expect(canonTs(obj)).toBe(canonJs(obj));
  });

  it('buildPayload is byte-identical', () => {
    const row = makeRows()[1];
    expect(JSON.stringify(payloadTs(row))).toBe(JSON.stringify(payloadJs(row)));
  });

  it('verifyChain agrees on a valid chain and on tampering', async () => {
    const rows = makeRows();
    // Compute real hashes with the TS implementation, then verify with both.
    let prev = 'GENESIS';
    for (const row of rows) {
      row.prev_hash = prev;
      row.record_hash = await (await import('../src/lib/auditChain.js')).sha256Hex(prev + canonTs(payloadTs(row)));
      prev = row.record_hash;
    }
    const tsOk = await verifyTs(rows);
    const jsOk = verifyJs(rows);
    expect(tsOk.valid).toBe(true);
    expect(jsOk.valid).toBe(true);

    rows[2].after_state = JSON.stringify({ n: 2, after: 'TAMPERED' });
    const tsBroken = await verifyTs(rows);
    const jsBroken = verifyJs(rows);
    expect(tsBroken.valid).toBe(false);
    expect(jsBroken.valid).toBe(false);
    expect(tsBroken.firstBreak).toBe(jsBroken.firstBreak);
    expect(tsBroken.firstBreak).toBe(2);
  });
});