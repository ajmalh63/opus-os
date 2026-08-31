/**
 * Native Cloudflare R2 Document Vault (S3-compatible, Zero Egress Fees)
 * Manages encrypted client document storage (passports, certificates, signed agreements, invoices).
 */

export interface DocumentUploadTicket {
  ticket: string;
  r2Key: string;
  clientId: string;
  division: string;
  fileName: string;
  mimeType: string;
  expiresAt: number;
}

export interface DocumentMetadata {
  clientId: string;
  division: string;
  originalName: string;
  mimeType: string;
  uploadedBy: string;
  scanStatus: 'clean' | 'pending' | 'flagged';
  uploadedAt: string;
}

/**
 * Generates an immutable, partitioned R2 object key.
 * Format: `vault/{division}/{clientId}/{timestamp}_{random}_{sanitizedFileName}`
 */
export function generateR2Key(division: string, clientId: string, originalFileName: string): string {
  const sanitized = originalFileName.toLowerCase().replace(/[^a-z0-9._-]/g, '_');
  const timestamp = Date.now();
  const random = crypto.randomUUID().slice(0, 8);
  const safeDiv = (division || 'general').toLowerCase().replace(/-/g, '_').replace(/[^a-z0-9_]/g, '_');
  const safeClient = (clientId || 'anonymous').replace(/[^a-zA-Z0-9_-]/g, '_');
  return `vault/${safeDiv}/${safeClient}/${timestamp}_${random}_${sanitized}`;
}

/**
 * Generates an HMAC-signed presigned upload ticket for direct browser uploads.
 */
export async function createPresignedUploadTicket(
  secret: string,
  clientId: string,
  division: string,
  fileName: string,
  mimeType: string,
  expiryMinutes = 15
): Promise<DocumentUploadTicket> {
  const r2Key = generateR2Key(division, clientId, fileName);
  const expiresAt = Math.floor(Date.now() / 1000) + expiryMinutes * 60;
  
  const payload = `${clientId}|${division}|${fileName}|${mimeType}|${r2Key}|${expiresAt}`;
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  );
  
  const signature = await crypto.subtle.sign('HMAC', key, enc.encode(payload));
  const sigHex = Array.from(new Uint8Array(signature), (b) => b.toString(16).padStart(2, '0')).join('');
  const ticket = btoa(`${payload}::${sigHex}`).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  return {
    ticket,
    r2Key,
    clientId,
    division,
    fileName,
    mimeType,
    expiresAt,
  };
}

/**
 * Verifies a presigned upload ticket and validates timestamp and signature.
 */
export async function verifyPresignedUploadTicket(
  secret: string,
  ticket: string
): Promise<{ valid: boolean; data?: { clientId: string; division: string; fileName: string; mimeType: string; r2Key: string; expiresAt: number } }> {
  try {
    const raw = atob(ticket.replace(/-/g, '+').replace(/_/g, '/'));
    const [payload, sigHex] = raw.split('::');
    if (!payload || !sigHex) return { valid: false };

    const [clientId, division, fileName, mimeType, r2Key, expiresAtStr] = payload.split('|');
    const expiresAt = parseInt(expiresAtStr, 10);
    const now = Math.floor(Date.now() / 1000);

    if (now > expiresAt) {
      return { valid: false }; // Expired ticket
    }

    const enc = new TextEncoder();
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(secret),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['verify']
    );

    const sigBytes = new Uint8Array(sigHex.match(/.{1,2}/g)?.map((byte) => parseInt(byte, 16)) || []);
    const isValid = await crypto.subtle.verify('HMAC', key, sigBytes, enc.encode(payload));

    if (!isValid) return { valid: false };

    return {
      valid: true,
      data: { clientId, division, fileName, mimeType, r2Key, expiresAt },
    };
  } catch {
    return { valid: false };
  }
}

/**
 * Uploads an object directly to Cloudflare R2 bucket with custom metadata.
 */
export async function putR2Object(
  bucket: R2Bucket | undefined,
  key: string,
  value: ReadableStream | ArrayBuffer | string,
  options: {
    mimeType: string;
    customMetadata?: Record<string, string>;
  }
): Promise<{ ok: boolean; size?: number; etag?: string; error?: string }> {
  if (!bucket) {
    return { ok: false, error: 'R2 BUCKET binding is unconfigured' };
  }

  try {
    const obj = await bucket.put(key, value, {
      httpMetadata: { contentType: options.mimeType },
      customMetadata: options.customMetadata,
    });

    return {
      ok: true,
      size: obj.size,
      etag: obj.etag,
    };
  } catch (err: any) {
    return { ok: false, error: err?.message || 'R2 Put failed' };
  }
}

/**
 * Retrieves an object from Cloudflare R2.
 */
export async function getR2Object(
  bucket: R2Bucket | undefined,
  key: string
): Promise<R2ObjectBody | null> {
  if (!bucket) return null;
  try {
    return await bucket.get(key);
  } catch {
    return null;
  }
}

/**
 * Deletes an object from Cloudflare R2.
 */
export async function deleteR2Object(
  bucket: R2Bucket | undefined,
  key: string
): Promise<boolean> {
  if (!bucket) return false;
  try {
    await bucket.delete(key);
    return true;
  } catch {
    return false;
  }
}
