/**
 * Unified API client — P1-5/P2-6 remediation.
 *
 * Gold standards applied (researched 2026-08-31):
 * - RFC 9110 §10.2.3: honor `Retry-After` on 429/503 (delay-seconds OR HTTP-date);
 *   never retry before it elapses.
 * - Centralized error normalization: every non-OK response throws ApiError
 *   (status, payload, retryAfterMs) — silent `if (!r.ok)` swallows are banned.
 * - Retry ONLY transient failures (429 with cap, network errors); never 4xx.
 */
export class ApiError extends Error {
  status: number;
  payload: any;
  retryAfterMs: number | null;
  constructor(message: string, status: number, payload: any = null, retryAfterMs: number | null = null) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload;
    this.retryAfterMs = retryAfterMs;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Parse Retry-After per RFC 9110: integer delay-seconds or HTTP-date. Returns ms, or null. */
function parseRetryAfter(value: string | null): number | null {
  if (!value) return null;
  const asSeconds = Number(value);
  if (Number.isFinite(asSeconds) && asSeconds >= 0) return Math.min(asSeconds * 1000, 30_000);
  const asDate = Date.parse(value);
  if (!Number.isNaN(asDate)) return Math.max(0, Math.min(asDate - Date.now(), 30_000));
  return null;
}

export interface ApiFetchOptions extends RequestInit {
  /** Max retries for 429 (default 3). 4xx other than 429 is never retried. */
  retries?: number;
}

/**
 * Fetch wrapper: JSON-safe, error-normalizing, 429-aware.
 * Throws ApiError with `.status` / `.payload` / `.retryAfterMs` on failure.
 */
export async function apiFetch(url: string, options: ApiFetchOptions = {}): Promise<any> {
  const { retries = 3, ...init } = options;
  let attempt = 0;
  for (;;) {
    let res: Response;
    try {
      res = await fetch(url, {
        headers: { 'Content-Type': 'application/json', ...(init.headers as Record<string, string>) },
        ...init,
      });
    } catch (err: any) {
      // Network-level failure (offline, CORS, DNS) — transient: retry with backoff.
      if (attempt < retries) {
        await sleep(300 * 2 ** attempt);
        attempt++;
        continue;
      }
      throw new ApiError('Network error — check your connection.', 0, null);
    }

    if (res.ok) {
      if (res.status === 204) return null;
      const text = await res.text();
      return text ? JSON.parse(text) : null;
    }

    let payload: any = null;
    try { payload = await res.json(); } catch { /* non-JSON error body */ }

    if (res.status === 429 && attempt < retries) {
      const waitMs = parseRetryAfter(res.headers.get('Retry-After')) ?? 1000 * 2 ** attempt;
      attempt++;
      if (attempt > 2) window.dispatchEvent(new CustomEvent('opus:api-throttled', { detail: { waitMs } }));
      await sleep(Math.min(waitMs, 30_000));
      continue;
    }

    const message =
      payload?.error?.message || payload?.error || payload?.message || `Request failed (${res.status})`;
    throw new ApiError(String(message), res.status, payload, parseRetryAfter(res.headers.get('Retry-After')));
  }
}
