// File-upload guard — OWASP File Upload Cheat Sheet (defense-in-depth):
//  1. Extension ALLOWLIST (business-critical types only), validated AFTER decoding.
//  2. Filename safety: strip paths/control chars, cap length, no leading dots.
//  3. Size caps per class (documents vs resumes).
//  4. Content-type not trusted — magic-byte (file signature) sniffing instead.
//  5. App-generated storage keys (never the user filename) — enforced at call sites.
//  6. Integrity: SHA-256 recorded for evidence-class vault rows.

export const DOC_EXTENSIONS = ['.pdf', '.png', '.jpg', '.jpeg', '.webp', '.doc', '.docx'] as const;
export const RESUME_EXTENSIONS = ['.pdf', '.doc', '.docx', '.txt'] as const;
export const MAX_DOC_BYTES = 10 * 1024 * 1024;   // 10 MB (certificates, passports, statements)
export const MAX_RESUME_BYTES = 5 * 1024 * 1024;  // 5 MB (resumes/CVs)
const MAX_NAME_CHARS = 180;

export type UploadKind = 'document' | 'resume';

export interface UploadGuardResult {
  ok: boolean;
  error?: string;
  status?: number;
  ext?: string;       // lowercase extension incl. dot
  safeName?: string;  // sanitized filename
  mimeType?: string;  // sniffed / inferred MIME
}

// Sanitize a user-supplied filename: strip any path components, control chars,
// and Windows/Unix-illegal characters; forbid hidden/leading-dot names and
// empty results. Keeps one extension. Returns null when nothing usable remains.
export function sanitizeFilename(name: string): string | null {
  if (!name) return null;
  // Take only the basename (kills path traversal) and strip control chars + illegal chars.
  let base = name.replace(/\\/g, '/').split('/').pop() || '';
  // eslint-disable-next-line no-control-regex
  base = base.replace(/[\x00-\x1f\x7f<>:"/\\|?*]/g, '').trim();
  base = base.replace(/^\.+/, ''); // strip leading dots (hidden files)
  base = base.slice(0, MAX_NAME_CHARS);
  base = base.replace(/\.+$/, ''); // strip trailing dots
  if (!base) return null;
  return base;
}

export function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  if (i <= 0) return '';
  return name.slice(i).toLowerCase();
}

// Magic-byte sniffing. `bytes` should be at least the first ~16 bytes.
// Returns a safe MIME type or null. Falls back to extension mapping only for
// text-based (doc/docx) where magic bytes are less reliable.
const MIME_BY_EXT: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.txt': 'text/plain',
};

export function sniffMime(bytes: Uint8Array, filename: string): string | null {
  const ext = extOf(filename);
  // WEBP: 'RIFF' .... 'WEBP'
  if (bytes.length >= 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46
    && bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50) return 'image/webp';
  if (bytes.length >= 4) {
    if (bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46) return 'application/pdf'; // %PDF
    if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return 'image/png'; // PNG
    if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg'; // JPEG
    if (bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04) {
      return ext === '.docx' ? MIME_BY_EXT['.docx'] : 'application/zip'; // ZIP (docx/zip)
    }
    if (bytes.length >= 8 && bytes[0] === 0xd0 && bytes[1] === 0xcf && bytes[2] === 0x11 && bytes[3] === 0xe0
      && bytes[4] === 0xa1 && bytes[5] === 0xb1 && bytes[6] === 0x1a && bytes[7] === 0xe1) return 'application/msword'; // OLE (doc)
  }
  return null; // no recognized signature
}

// Validate a candidate upload. Rejects on: unknown/disallowed extension,
// filename that sanitizes to nothing, oversize, or — for formats we can verify
// by magic bytes (pdf/png/jpeg/webp) — a content signature that contradicts
// the declared extension.
export function guardUpload(kind: UploadKind, filename: string, size: number, bytes: Uint8Array): UploadGuardResult {
  const allowed = kind === 'resume' ? RESUME_EXTENSIONS : DOC_EXTENSIONS;
  const maxBytes = kind === 'resume' ? MAX_RESUME_BYTES : MAX_DOC_BYTES;

  const safeName = sanitizeFilename(filename);
  if (!safeName) return { ok: false, error: 'Invalid filename.', status: 400 };

  const ext = extOf(safeName);
  if (!ext || !(allowed as readonly string[]).includes(ext)) {
    return { ok: false, error: `File type '${ext || '(none)'}' is not allowed. Accepted: ${(allowed as readonly string[]).join(', ')}`, status: 400 };
  }

  if (!Number.isFinite(size) || size <= 0) return { ok: false, error: 'Empty file.', status: 400 };
  if (size > maxBytes) {
    const mb = Math.round(maxBytes / (1024 * 1024));
    return { ok: false, error: `File exceeds ${mb} MB limit.`, status: 413 };
  }

  const sniffed = sniffMime(bytes, safeName);
  const VERIFIABLE = new Set(['.pdf', '.png', '.jpg', '.jpeg', '.webp']);

  let mimeType: string;
  if (VERIFIABLE.has(ext)) {
    const expected = MIME_BY_EXT[ext];
    if (sniffed !== expected) {
      return { ok: false, error: `File content does not match its '${ext}' extension.`, status: 400 };
    }
    mimeType = expected;
  } else {
    // doc/docx/txt — signature may be absent; trust the extension (or a sniffed zip/ole hit).
    mimeType = sniffed || MIME_BY_EXT[ext] || 'application/octet-stream';
  }

  return { ok: true, ext, safeName, mimeType };
}

// SHA-256 hex digest (WebCrypto) for evidence-class integrity.
export async function sha256Hex(bytes: ArrayBuffer | Uint8Array): Promise<string> {
  const data = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const digest = await crypto.subtle.digest('SHA-256', data as unknown as BufferSource);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Content-Disposition policy: inline only for safe, browser-renderable types;
// attachment for everything else (prevents MIME-sniffing XSS).
export function contentDispositionFor(ext: string, safeName: string): string {
  const inlineTypes: readonly string[] = ['.pdf', '.png', '.jpg', '.jpeg', '.webp'];
  const disposition = inlineTypes.includes(ext) ? 'inline' : 'attachment';
  return `${disposition}; filename="${encodeURIComponent(safeName)}"`;
}
