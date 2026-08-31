import { describe, it, expect } from 'vitest';
import {
  generateR2Key,
  createPresignedUploadTicket,
  verifyPresignedUploadTicket,
  putR2Object,
  getR2Object,
  deleteR2Object,
} from '../src/lib/storage/r2.js';

describe('Cloudflare R2 Document Vault', () => {
  const SECRET = 'test_r2_signing_secret_key_2026';

  it('generates partitioned and sanitized R2 object keys', () => {
    const key = generateR2Key('Study-Abroad', 'OP-2026-1001', 'Passport Scan (Final).PDF');
    expect(key).toMatch(/^vault\/study_abroad\/OP-2026-1001\/\d+_[a-z0-9]+_passport_scan__final_.pdf$/);
  });

  it('creates and verifies valid HMAC presigned upload tickets', async () => {
    const ticketInfo = await createPresignedUploadTicket(
      SECRET,
      'OP-2026-8899',
      'visa',
      'bank_statement.pdf',
      'application/pdf',
      15
    );

    expect(ticketInfo.ticket).toBeTruthy();
    expect(ticketInfo.r2Key).toContain('vault/visa/OP-2026-8899/');

    const verification = await verifyPresignedUploadTicket(SECRET, ticketInfo.ticket);
    expect(verification.valid).toBe(true);
    expect(verification.data?.clientId).toBe('OP-2026-8899');
    expect(verification.data?.division).toBe('visa');
    expect(verification.data?.fileName).toBe('bank_statement.pdf');
    expect(verification.data?.mimeType).toBe('application/pdf');
  });

  it('rejects tampered or forged presigned upload tickets', async () => {
    const ticketInfo = await createPresignedUploadTicket(
      SECRET,
      'OP-2026-8899',
      'visa',
      'bank_statement.pdf',
      'application/pdf',
      15
    );

    // Tamper with ticket string
    const tampered = ticketInfo.ticket.slice(0, -4) + 'abcd';
    const result = await verifyPresignedUploadTicket(SECRET, tampered);
    expect(result.valid).toBe(false);

    // Verify with incorrect secret
    const wrongSecret = await verifyPresignedUploadTicket('wrong_secret_key', ticketInfo.ticket);
    expect(wrongSecret.valid).toBe(false);
  });

  it('gracefully handles missing R2 bucket bindings', async () => {
    const putResult = await putR2Object(undefined, 'test/key', 'data', { mimeType: 'text/plain' });
    expect(putResult.ok).toBe(false);
    expect(putResult.error).toContain('unconfigured');

    const getResult = await getR2Object(undefined, 'test/key');
    expect(getResult).toBeNull();

    const delResult = await deleteR2Object(undefined, 'test/key');
    expect(delResult).toBe(false);
  });
});
