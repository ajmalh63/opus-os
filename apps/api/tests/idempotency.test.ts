// Regression tests for the idempotency middleware body-consumption bug.
//
// The middleware used to call `await c.req.text()` on the ORIGINAL request,
// consuming the body stream. Any downstream handler that then called
// `c.req.json()` failed, producing 500s (e.g. POST /api/auth/otp/send).
// The fix clones the raw request before reading, so the handler still sees
// a readable body stream.
//
// The middleware is mounted on a minimal Hono app (per repo convention for
// middleware-level tests) whose handler reads the JSON body — exactly the
// code path that broke in production.
import { describe, it, expect, beforeEach } from 'vitest';
import { Hono } from 'hono';
import { idempotency } from '../src/middleware/idempotency.js';
import { MockD1Database } from './mockDb.js';

type Env = { Bindings: { DB: D1Database } };

// Minimal ExecutionContext stand-in so `c.executionCtx.waitUntil(...)` works
// under node-based vitest (workerd provides this in production).
function makeExecCtx() {
  const pending: Promise<unknown>[] = [];
  return {
    pending,
    executionCtx: {
      waitUntil: (p: Promise<unknown>) => pending.push(p),
      passThroughOnException: () => {},
    },
  };
}

function buildApp() {
  const app = new Hono<Env>();
  app.use('/api/*', idempotency());
  app.post('/api/test/echo', async (c) => {
    const body = await c.req.json(); // would throw if middleware consumed the body
    return c.json({ ok: true, received: body });
  });
  return app;
}

describe('Idempotency middleware (body-clone fix)', () => {
  let mockD1: MockD1Database;
  let app: ReturnType<typeof buildApp>;
  let exec: ReturnType<typeof makeExecCtx>;

  beforeEach(() => {
    mockD1 = new MockD1Database();
    app = buildApp();
    exec = makeExecCtx();
  });

  const post = (key: string, body: string) =>
    app.request(
      '/api/test/echo',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': key },
        body,
      },
      { DB: mockD1 as unknown as D1Database },
      exec.executionCtx as unknown as ExecutionContext,
    );

  // Flush waitUntil callbacks so the idempotency row is deterministically
  // inserted before the next request (replay / conflict assertions).
  const flush = async () => await Promise.all(exec.pending.map((p) => p.catch(() => {})));

  it('handler reading c.req.json() succeeds when Idempotency-Key is present', async () => {
    const res = await post('key-ok-1', JSON.stringify({ a: 1 }));
    await flush();

    expect(res.status).toBe(200);
    const json = await res.json();
    expect(json).toEqual({ ok: true, received: { a: 1 } });
    expect(res.headers.get('X-Idempotent-Replay')).toBeNull();
  });

  it('replays the cached response for the same key + body', async () => {
    const first = await post('key-replay-1', JSON.stringify({ a: 2 }));
    await flush();
    expect(first.status).toBe(200);
    expect(await first.json()).toEqual({ ok: true, received: { a: 2 } });

    const second = await post('key-replay-1', JSON.stringify({ a: 2 }));
    await flush();

    expect(second.status).toBe(200);
    expect(second.headers.get('X-Idempotent-Replay')).toBe('true');
    expect(await second.json()).toEqual({ ok: true, received: { a: 2 } });
  });

  it('returns 409 when the same key is reused with a different body', async () => {
    const first = await post('key-conflict-1', JSON.stringify({ a: 3 }));
    await flush();
    expect(first.status).toBe(200);

    const second = await post('key-conflict-1', JSON.stringify({ a: 999 }));
    await flush();

    expect(second.status).toBe(409);
    const json = (await second.json()) as { code: string };
    expect(json.code).toBe('IDEMPOTENCY_CONFLICT');
  });

  it('requests without an Idempotency-Key pass through untouched', async () => {
    const res = await app.request(
      '/api/test/echo',
      { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ a: 4 }) },
      { DB: mockD1 as unknown as D1Database },
    );
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, received: { a: 4 } });
  });
});
