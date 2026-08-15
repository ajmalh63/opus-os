import { describe, it, expect } from 'vitest';
import { sanitizeFilename, guardUpload, extOf, sniffMime, sha256Hex, contentDispositionFor } from '../src/infra/uploadGuard.js';

const enc = (s: string) => new Uint8Array([...s].map((c) => c.charCodeAt(0)));
const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x34]);
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const jpg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const php = enc('<?php echo "hi";');

describe('uploadGuard — OWASP file-upload hardening', () => {
  it('sanitizeFilename strips paths, illegal chars, and leading dots', () => {
    expect(sanitizeFilename('../../etc/passwd.pdf')).toBe('passwd.pdf');
    expect(sanitizeFilename('..hidden.pdf')).toBe('hidden.pdf');
    expect(sanitizeFilename('a<b>c:d?e.pdf')).toBe('abcde.pdf');
    expect(sanitizeFilename('...')).toBeNull();
    expect(sanitizeFilename('')).toBeNull();
  });

  it('rejects disallowed extensions (allowlist only)', () => {
    expect(guardUpload('document', 'evil.exe', 100, enc('x')).ok).toBe(false);
    expect(guardUpload('document', 'shell.php', 100, php).ok).toBe(false);
    expect(guardUpload('document', 'vector.svg', 100, enc('<svg>')).ok).toBe(false);
    expect(guardUpload('resume', 'resume.zip', 100, enc('x')).ok).toBe(false);
  });

  it('rejects double-extension bypass (.jpg.php)', () => {
    const r = guardUpload('document', 'photo.jpg.php', php.length, php);
    expect(r.ok).toBe(false); // ext resolves to .php → not allowed
  });

  it('rejects oversize uploads', () => {
    const big = new Uint8Array(11 * 1024 * 1024);
    const r = guardUpload('document', 'big.pdf', big.length, big);
    expect(r.ok).toBe(false);
    expect(r.status).toBe(413);
  });

  it('rejects a .pdf whose magic bytes are not PDF (spoofed extension)', () => {
    const r = guardUpload('document', 'notreally.pdf', png.length, png);
    expect(r.ok).toBe(false);
    expect(r.error).toContain('does not match');
  });

  it('rejects a .jpg carrying non-image content', () => {
    const r = guardUpload('document', 'fake.jpg', php.length, php);
    expect(r.ok).toBe(false);
  });

  it('accepts a real PDF', () => {
    const r = guardUpload('document', 'passport.pdf', pdf.length, pdf);
    expect(r.ok).toBe(true);
    expect(r.mimeType).toBe('application/pdf');
    expect(r.ext).toBe('.pdf');
  });

  it('accepts a real PNG and a DOCX (zip container)', () => {
    expect(guardUpload('document', 'photo.png', png.length, png).ok).toBe(true);
    const docx = new Uint8Array([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);
    const r = guardUpload('resume', 'cv.docx', docx.length, docx);
    expect(r.ok).toBe(true);
    expect(r.mimeType).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
  });

  it('extOf returns lowercase extension only', () => {
    expect(extOf('A.PDF')).toBe('.pdf');
    expect(extOf('noext')).toBe('');
  });

  it('sniffMime returns null for unknown content', () => {
    expect(sniffMime(enc('random'), 'x.pdf')).toBeNull();
    expect(sniffMime(png, 'x.png')).toBe('image/png');
  });

  it('contentDispositionFor forces attachment for non-renderable types', () => {
    expect(contentDispositionFor('.docx', 'a.docx')).toContain('attachment');
    expect(contentDispositionFor('.pdf', 'a.pdf')).toContain('inline');
  });

  it('sha256Hex produces a 64-char hex digest', async () => {
    const d = await sha256Hex(pdf);
    expect(d).toMatch(/^[0-9a-f]{64}$/);
  });
});
