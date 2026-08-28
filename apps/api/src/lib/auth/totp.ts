// RFC 6238 Time-Based One-Time Password (TOTP) Implementation using Native WebCrypto
// Zero runtime dependencies, 100% compatible with Google Authenticator, Microsoft Authenticator & Apple Passwords.

const BASE32_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

/**
 * Encodes a Uint8Array into a Base32 string.
 */
export function base32Encode(buffer: Uint8Array): string {
  let bits = 0;
  let value = 0;
  let output = '';

  for (let i = 0; i < buffer.byteLength; i++) {
    value = (value << 8) | buffer[i];
    bits += 8;

    while (bits >= 5) {
      output += BASE32_CHARS[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }

  if (bits > 0) {
    output += BASE32_CHARS[(value << (5 - bits)) & 31];
  }

  return output;
}

/**
 * Decodes a Base32 string into a Uint8Array.
 */
export function base32Decode(input: string): Uint8Array {
  const cleanInput = input.toUpperCase().replace(/=+$/, '').replace(/\s+/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];

  for (let i = 0; i < cleanInput.length; i++) {
    const val = BASE32_CHARS.indexOf(cleanInput[i]);
    if (val === -1) continue;

    value = (value << 5) | val;
    bits += 5;

    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }

  return new Uint8Array(bytes);
}

/**
 * Generates a cryptographically random Base32 TOTP secret (20 bytes / 160 bits).
 */
export function generateTotpSecret(bytes = 20): string {
  const arr = new Uint8Array(bytes);
  crypto.getRandomValues(arr);
  return base32Encode(arr);
}

/**
 * Computes the 6-digit TOTP code for a secret at a given counter step.
 */
export async function computeTotp(secretBase32: string, timeStep: number): Promise<string> {
  const keyBytes = base32Decode(secretBase32);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes.buffer as ArrayBuffer,
    { name: 'HMAC', hash: { name: 'SHA-1' } },
    false,
    ['sign']
  );

  // Counter is 8-byte big-endian integer
  const counterBuffer = new ArrayBuffer(8);
  const counterView = new DataView(counterBuffer);
  counterView.setBigUint64(0, BigInt(timeStep), false);

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, counterBuffer);
  const sigBytes = new Uint8Array(signature);

  // Dynamic truncation (RFC 4226)
  const offset = sigBytes[sigBytes.length - 1] & 0x0f;
  const binary =
    ((sigBytes[offset] & 0x7f) << 24) |
    ((sigBytes[offset + 1] & 0xff) << 16) |
    ((sigBytes[offset + 2] & 0xff) << 8) |
    (sigBytes[offset + 3] & 0xff);

  const otp = (binary % 1_000_000).toString().padStart(6, '0');
  return otp;
}

/**
 * Verifies a 6-digit TOTP token against a Base32 secret with a sliding time window (±1 step / 30s).
 */
export async function verifyTotp(
  token: string,
  secretBase32: string,
  timeWindow = 1,
  currentTimeMs = Date.now()
): Promise<boolean> {
  if (!token || token.length !== 6 || !secretBase32) return false;

  const currentStep = Math.floor(currentTimeMs / 1000 / 30);

  for (let i = -timeWindow; i <= timeWindow; i++) {
    const step = currentStep + i;
    const expectedOtp = await computeTotp(secretBase32, step);
    if (token === expectedOtp) {
      return true;
    }
  }

  return false;
}

/**
 * Generates single-use backup recovery codes.
 */
export async function generateBackupCodes(count = 8): Promise<{ plaintext: string[]; hashed: string[] }> {
  const plaintext: string[] = [];
  const hashed: string[] = [];

  for (let i = 0; i < count; i++) {
    const bytes = new Uint8Array(5);
    crypto.getRandomValues(bytes);
    const code = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
    plaintext.push(code);

    const enc = new TextEncoder().encode(code);
    const hash = await crypto.subtle.digest('SHA-256', enc);
    hashed.push(Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, '0')).join(''));
  }

  return { plaintext, hashed };
}
