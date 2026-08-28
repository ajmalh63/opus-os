import { describe, it, expect, beforeEach } from 'vitest';
import { hashPassword, verifyPassword, generateRandomToken, hashToken } from '../src/lib/auth/crypto.js';
import { generateTotpSecret, computeTotp, verifyTotp, generateBackupCodes } from '../src/lib/auth/totp.js';
import { createSession, validateSessionToken, invalidateSession } from '../src/lib/auth/session.js';
import { ensureSuperadmin, CANONICAL_ADMIN_EMAIL, ALL_DIVISIONS } from '../src/lib/auth/bootstrap.js';
import { MockD1Database } from './mockDb.js';
import { getDb } from '../src/db/client.js';
import { users } from '../src/db/schema.js';
import { eq } from 'drizzle-orm';

describe('Native Edge Auth — Cryptographic Primitives', () => {
  it('hashes and verifies passwords using NIST PBKDF2-HMAC-SHA256', async () => {
    const password = 'SuperSecretPassword#2026';
    const hash = await hashPassword(password);

    expect(hash).toMatch(/^pbkdf2:sha256:100000:[a-f0-9]{32}:[a-f0-9]{64}$/);

    const isValid = await verifyPassword(password, hash);
    expect(isValid).toBe(true);

    const isInvalid = await verifyPassword('WrongPassword123', hash);
    expect(isInvalid).toBe(false);
  });

  it('generates cryptographically secure random tokens and hashes', async () => {
    const token1 = generateRandomToken(32);
    const token2 = generateRandomToken(32);

    expect(token1.length).toBe(64); // 32 bytes = 64 hex chars
    expect(token2.length).toBe(64);
    expect(token1).not.toBe(token2);

    const hash = await hashToken(token1);
    expect(hash.length).toBe(64);
  });
});

describe('Native Edge Auth — RFC 6238 TOTP Engine', () => {
  it('generates and verifies 6-digit TOTP tokens accurately', async () => {
    const secret = generateTotpSecret();
    expect(secret).toMatch(/^[A-Z2-7]+$/);

    const now = Date.now();
    const currentStep = Math.floor(now / 1000 / 30);
    const otp = await computeTotp(secret, currentStep);

    expect(otp).toMatch(/^[0-9]{6}$/);

    const isValid = await verifyTotp(otp, secret, 1, now);
    expect(isValid).toBe(true);

    const isWrongValid = await verifyTotp('000000', secret, 1, now);
    expect(isWrongValid).toBe(false);
  });

  it('generates and hashes single-use backup recovery codes', async () => {
    const { plaintext, hashed } = await generateBackupCodes(8);

    expect(plaintext.length).toBe(8);
    expect(hashed.length).toBe(8);

    for (let i = 0; i < plaintext.length; i++) {
      const code = plaintext[i];
      const codeHash = await hashToken(code);
      expect(codeHash).toBe(hashed[i]);
    }
  });
});

describe('Native Edge Auth — D1 Session Management & Permanent Superadmin', () => {
  let db: any;
  let mockEnv: any;

  beforeEach(() => {
    const d1 = new MockD1Database();
    db = getDb(d1 as any);
    mockEnv = {
      DB: d1,
      ADMIN_EMAIL: CANONICAL_ADMIN_EMAIL,
      ADMIN_PASSWORD: 'OpusAdminPassword2026!',
    };
  });

  it('self-heals and guarantees permanent superadmin account creation in D1', async () => {
    const result = await ensureSuperadmin(db, mockEnv);
    expect(result.email).toBe(CANONICAL_ADMIN_EMAIL);
    expect(result.repaired).toBe(true);

    // Verify user in D1
    const [adminUser] = await db.select().from(users).where(eq(users.email, CANONICAL_ADMIN_EMAIL));
    expect(adminUser).toBeDefined();
    expect(adminUser.role).toBe('super_admin');
    expect(adminUser.emailVerified).toBe(true);
    expect(adminUser.userDivisions).toBe(ALL_DIVISIONS);

    const isPasswordCorrect = await verifyPassword('OpusAdminPassword2026!', adminUser.passwordHash);
    expect(isPasswordCorrect).toBe(true);

    // Second call is idempotent (no-op repair)
    const secondCall = await ensureSuperadmin(db, mockEnv);
    expect(secondCall.repaired).toBe(false);
  });

  it('creates, validates, and invalidates session tokens in D1', async () => {
    const admin = await ensureSuperadmin(db, mockEnv);

    // Create session
    const { session, token } = await createSession(db, admin.id, '1.2.3.4', 'Mozilla/5.0');
    expect(session.userId).toBe(admin.id);
    expect(token).toBeDefined();

    // Validate session
    const validated = await validateSessionToken(db, token);
    expect(validated).not.toBeNull();
    expect(validated?.user.id).toBe(admin.id);
    expect(validated?.user.role).toBe('super_admin');
    expect(validated?.user.userDivisions).toEqual(['study_abroad', 'visa', 'umrah', 'attestation', 'manpower']);

    // Invalidate session
    await invalidateSession(db, token);

    // Re-validation must fail
    const revalidated = await validateSessionToken(db, token);
    expect(revalidated).toBeNull();
  });
});
