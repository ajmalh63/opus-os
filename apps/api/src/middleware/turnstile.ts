import { createMiddleware } from 'hono/factory';

// Real Cloudflare Turnstile verification (plan §18.2.2).
//  - Token comes from the client as `cf-turnstile-response` (form field or header).
//  - Siteverify is called against Cloudflare's API with the secret key.
//  - Mock test keys (1x.../2x...) are honored locally: 1x = always pass (dev),
//    2x = always fail (test-failure path). In production the REAL secret key
//    must be set via `wrangler secret put TURNSTILE_SECRET_KEY`.
export const turnstileVerify = createMiddleware<{
  Bindings: { TURNSTILE_SECRET_KEY?: string };
}>(async (c, next) => {
  const secret = c.env?.TURNSTILE_SECRET_KEY;
  const token = c.req.header('cf-turnstile-response') || c.req.header('cf-turnstile-token') || '';

  // No secret configured → fail-closed ONLY when explicitly production;
  // otherwise (dev/test without env) allow to keep local flows working.
  if (!secret) {
    const envName = (c.env as any)?.ENVIRONMENT;
    if (envName !== 'production') return next();
    return c.json({ error: { code: 'TURNSTILE_UNCONFIGURED', message: 'Bot check not configured' } }, 503);
  }

  // Mock keys (documented Cloudflare test keys) — EXACT match only, never a
  // prefix match (a real secret starting with '1x' would silently disable the check).
  if (secret === '1x0000000000000000000000000000000AA') return next(); // always-pass mock
  if (secret === '2x0000000000000000000000000000000AA') {
    return c.json({ error: { code: 'BOT_BLOCKED', message: 'Bot check failed' } }, 403);
  }

  if (!token) return c.json({ error: { code: 'BOT_BLOCKED', message: 'Missing bot check token' } }, 403);

  try {
    const res = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret, response: token }),
    });
    const data: any = await res.json();
    if (data?.success !== true) {
      return c.json({ error: { code: 'BOT_BLOCKED', message: 'Bot check failed' } }, 403);
    }
    return next();
  } catch {
    return c.json({ error: { code: 'TURNSTILE_ERROR', message: 'Bot check unavailable' } }, 503);
  }
});