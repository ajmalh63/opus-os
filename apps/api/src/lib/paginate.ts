/**
 * Shared pagination helper — P1-1 remediation (Google AIP-158, researched 2026-08-31).
 *
 * Conventions:
 * - `limit` query param: optional; coerced into [1, maxPage]. Never trust the client.
 * - `pageToken`: opaque base64 offset cursor. Tokens carry NO authorization —
 *   every request is authz-checked as usual (AIP-158 mandate).
 * - Response includes `nextPageToken` only when another page exists
 *   (omission signals end-of-results).
 */
const CURSOR_PREFIX = 'cur1_'; // versioned so future keyset cursors can coexist

export function clampPageSize(raw: string | undefined, def: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 1) return def;
  return Math.min(Math.floor(n), max); // AIP-158: values above max are coerced, not rejected
}

export function encodeCursor(offset: number): string {
  return CURSOR_PREFIX + Buffer.from(String(offset)).toString('base64');
}

export function decodeCursor(token: string | undefined): number | null {
  if (!token || !token.startsWith(CURSOR_PREFIX)) return null;
  try {
    const n = Number(Buffer.from(token.slice(CURSOR_PREFIX.length), 'base64').toString('utf8'));
    return Number.isFinite(n) && n >= 0 ? n : null;
  } catch {
    return null; // invalid/expired token = start over from page 1 (AIP-158 permits)
  }
}

/**
 * Paginate a Drizzle-style select: returns clamped limit + effective offset and
 * builds the AIP-158 response tail ({nextPageToken} only when more rows exist).
 */
type QueryBag = URLSearchParams | Map<string, string> | Record<string, string | undefined>;

export function paginate(
  query: QueryBag,
  fullCount: number,
  opts: { defaultSize?: number; maxPage?: number } = {},
) {
  const defaultSize = opts.defaultSize ?? 200;
  const maxPage = opts.maxPage ?? 1000;
  const get = (k: string): string | undefined =>
    query instanceof URLSearchParams ? query.get(k) ?? undefined
    : query instanceof Map ? query.get(k)
    : query[k];
  const limit = clampPageSize(get('limit'), defaultSize, maxPage);
  const offset = decodeCursor(get('pageToken')) ?? 0;
  const end = offset + limit;
  return {
    limit,
    offset,
    nextPageToken: end < fullCount ? encodeCursor(end) : undefined,
  };
}
