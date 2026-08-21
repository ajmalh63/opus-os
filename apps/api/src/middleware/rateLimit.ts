// Rate limiting middleware (Sections 18.2.1 / 38.3).
//
// Strategy (free-tier-safe, verified 2026):
//   1. PRIMARY — in-app D1 sliding-window counters via Drizzle (this file).
//      D1 free = 5M rows read/day, so a few counters per user-min is negligible.
//   2. SECONDARY — Cloudflare WAF rate-limiting rules at the edge
//      (INFRASTRUCTURE.md has the snippet). Free tier ~5 custom rules.
//   3. TERTIARY — Turnstile on public forms.
//
// Bucket key = hash(bucket | windowStart | identity); authed -> session token,
// else IP.

import { getDb } from '../db/client.js';
import { rateLimit as rateLimitTable } from '../db/schema.js';
import { eq, and, sql } from 'drizzle-orm';

export interface RateLimitRule {
  bucket: string;
  windowSeconds: number;
  limit: number;
}

const RULES: Record<string, RateLimitRule[]> = {
  auth: [
    { bucket: 'otp', windowSeconds: 300, limit: 5 },
    { bucket: 'login', windowSeconds: 300, limit: 8 },
  ],
  'public:leads': [{ bucket: 'lead-form', windowSeconds: 3600, limit: 5 }],
  'public:portal': [{ bucket: 'lookup', windowSeconds: 3600, limit: 10 }],
  'public:partners': [{ bucket: 'partner-signup', windowSeconds: 3600, limit: 8 }],
  'public:visibility': [
    { bucket: 'utm-capture', windowSeconds: 3600, limit: 60 },
    { bucket: 'ga-events', windowSeconds: 3600, limit: 120 },
  ],
  'webhooks:cal': [{ bucket: 'cal-webhook', windowSeconds: 3600, limit: 120 }],
};

function hashKey(mat: string[]): string {
  const s = mat.join('|');
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) >>> 0;
  return 'rl:' + h.toString(36);
}

/**
 * Core counter: increments the sliding-window counter for (rule, identity) and
 * returns { over, count }. Fail-open on infra errors (over=false).
 * Used by the middleware below and by bounded audit writes (audit.ts).
 */
export async function isRateLimited(env: any, rule: RateLimitRule, identity: string, opts?: { failClosed?: boolean }): Promise<{ over: boolean; count: number }> {
  if (!env?.DB) return { over: false, count: 0 };
  const db = getDb(env.DB);
  const now = Math.floor(Date.now() / 1000);
  const windowStart = Math.floor(now / rule.windowSeconds) * rule.windowSeconds;
  const key = hashKey([rule.bucket, String(windowStart), identity]);
  try {
    await db.insert(rateLimitTable).values({ key, bucket: rule.bucket, windowStart, identity, count: 1 })
      .onConflictDoUpdate({ target: rateLimitTable.key, set: { count: sql`${rateLimitTable.count} + 1` } })
      .run();
    const row = await db.select({ count: rateLimitTable.count }).from(rateLimitTable).where(eq(rateLimitTable.key, key)).get();
    const count = Number(row?.count) || 1;
    return { over: count > rule.limit, count };
  } catch (e: any) {
    console.error('rateLimit error', e?.message);
    if (opts?.failClosed && ['otp', 'login', 'otp-verify', 'login-fail', 'otp-send'].includes(rule.bucket)) {
      return { over: true, count: 0 };
    }
    return { over: false, count: 0 };
  }
}

/** Middleware factory: enforce a single rate-limit rule on this route. */
export function rateLimit(rule: RateLimitRule) {
  return async (c: any, next: any) => {
    if (!c.env || !c.env.DB) return c.json({ error: "DB not available" }, 500);

    const now = Math.floor(Date.now() / 1000);
    const windowStart = Math.floor(now / rule.windowSeconds) * rule.windowSeconds;

    // Identity for rate limiting: verified session user id (set by
    // rbacMiddleware) OR the real client IP. NEVER a client-supplied cookie
    // value — an attacker could mint unlimited fresh buckets by rotating it.
    const sessionUser = (c.get('user') as any) || null;
    const ip = c.req.header('cf-connecting-ip') || 'anon';
    const identity = sessionUser?.id ? `u:${sessionUser.id}` : `ip:${ip}`;

    const { over, count } = await isRateLimited(c.env, rule, identity);

    if (over) {
      const retryAfter = Math.max(1, windowStart + rule.windowSeconds - now);
      c.header('Retry-After', String(retryAfter));
      c.header('X-RateLimit-Limit', String(rule.limit));
      c.header('X-RateLimit-Remaining', '0');
      return c.json({ error: `Rate limit exceeded (${rule.bucket}). Try again in ${retryAfter}s.` }, 429);
    }

    c.header('X-RateLimit-Limit', String(rule.limit));
    c.header('X-RateLimit-Remaining', String(Math.max(0, rule.limit - count)));

    await next();
  };
}

/** Return all rules for a named group (router applies each). */
export function rateLimitGroup(group: keyof typeof RULES): RateLimitRule[] {
  return RULES[group] || [];
}

/**
 * Clear all counters for (bucket, identity) — used to reset the failed-login
 * lockout counter on a successful sign-in. Fail-open.
 */
export async function clearRateLimit(env: any, bucket: string, identity: string): Promise<void> {
  if (!env?.DB) return;
  try {
    const db = getDb(env.DB);
    await db.delete(rateLimitTable)
      .where(and(eq(rateLimitTable.bucket, bucket), eq(rateLimitTable.identity, identity)))
      .run();
  } catch (e: any) {
    console.error('clearRateLimit error', e?.message);
  }
}
