import { describe, it, expect } from 'vitest';
import { clampPageSize, encodeCursor, decodeCursor, paginate } from '../src/lib/paginate.js';

describe('P1-1 paginate helper (AIP-158)', () => {
  it('clampPageSize: default when missing/invalid, coerced when above max', () => {
    expect(clampPageSize(undefined, 200, 500)).toBe(200);
    expect(clampPageSize('abc', 200, 500)).toBe(200);
    expect(clampPageSize('0', 200, 500)).toBe(200);
    expect(clampPageSize('-5', 200, 500)).toBe(200);
    expect(clampPageSize('50', 200, 500)).toBe(50);
    expect(clampPageSize('99999', 200, 500)).toBe(500); // coerced, not rejected
  });

  it('cursor: opaque, round-trips, invalid tokens reset to page 1', () => {
    const token = encodeCursor(250);
    expect(token.startsWith('cur1_')).toBe(true);
    expect(decodeCursor(token)).toBe(250);
    expect(decodeCursor('garbage')).toBeNull();
    expect(decodeCursor(undefined)).toBeNull();
    expect(decodeCursor('cur1_!!!not-base64!!!')).toBeNull();
  });

  it('paginate: first page has nextPageToken when more rows exist; last page omits it', () => {
    const q = new Map<string, string>();
    const p1 = paginate(q, 550, { defaultSize: 200, maxPage: 500 });
    expect(p1.limit).toBe(200);
    expect(p1.offset).toBe(0);
    expect(p1.nextPageToken).toBeTruthy();

    const p2 = paginate(new Map([['pageToken', p1.nextPageToken!], ['limit', '500']]), 550, { defaultSize: 200, maxPage: 500 });
    expect(p2.offset).toBe(200);
    expect(p2.limit).toBe(500);
    expect(p2.nextPageToken).toBeUndefined(); // end of results — AIP-158 end signal
  });

  it('tokens carry no authorization semantics (opaque base64 of offset only)', () => {
    expect(decodeCursor(encodeCursor(0))).toBe(0);
    const t = encodeCursor(42);
    expect(t).not.toContain('42'); // not plaintext
  });
});
