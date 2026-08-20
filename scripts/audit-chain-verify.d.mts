// Type declarations for scripts/audit-chain-verify.mjs (used by tests).
// MUST mirror the runtime exports — see scripts/audit-chain-verify.mjs.

export function sha256Hex(input: string): string;

export function canonicalize(obj: unknown): string;

export function buildPayload(row: Record<string, any>): Record<string, unknown>;

export interface ChainVerificationResult {
  valid: boolean;
  total: number;
  preChain: number;
  firstBreak: number | null;
  reason: string | null;
}

export function verifyChain(rows: Array<Record<string, any>>): ChainVerificationResult;
