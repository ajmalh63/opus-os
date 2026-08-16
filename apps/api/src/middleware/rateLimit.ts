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
import { eq, sql } from 'drizzle-orm';

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

/** Middleware factory: enforce a single rate-limit rule on this route. */
export function rateLimit(rule: RateLimitRule) {
  return async (c: any, next: any) => {
    if (!c.env || !c.env.DB) return c.json({ error: "DB not available" }, 500);

    const db = getDb(c.env.DB);
    const now = Math.floor(Date.now() / 1000);
    const windowStart = Math.floor(now / rule.windowSeconds) * rule.windowSeconds;

    const authHdr = c.req.header('cookie') || '';
    const userMatch = authHdr.match(/better-auth\.session_token=([^;]+)/);
    const ip = c.req.header('cf-connecting-ip') || 'anon';
    const identity = userMatch ? (userMatch[1] || 'user') : ip;

    const key = hashKey([rule.bucket, String(windowStart), identity]);

    try {
      // Upsert: insert 1, else increment count atomically (ON CONFLICT DO UPDATE).
      await db.insert(rateLimitTable).values({ key, bucket: rule.bucket, windowStart, identity, count: 1 })
        .onConflictDoUpdate({ target: rateLimitTable.key, set: { count: sql`${rateLimitTable.count} + 1` } })
        .run();

      const row = await db.select({ count: rateLimitTable.count }).from(rateLimitTable).where(eq(rateLimitTable.key, key)).get();
      const count = Number(row?.count) || 1;

      if (count > rule.limit) {
        const retryAfter = Math.max(1, windowStart + rule.windowSeconds - now);
        c.header('Retry-After', String(retryAfter));
        c.header('X-RateLimit-Limit', String(rule.limit));
        c.header('X-RateLimit-Remaining', '0');
        return c.json({ error: `Rate limit exceeded (${rule.bucket}). Try again in ${retryAfter}s.` }, 429);
      }

      c.header('X-RateLimit-Limit', String(rule.limit));
      c.header('X-RateLimit-Remaining', String(Math.max(0, rule.limit - count)));
    } catch (e: any) {
      // Fail-open on infra error — never block a user because a counter hiccupped.
      console.error('rateLimit error', e?.message);
    }

    await next();
  };
}

/** Return all rules for a named group (router applies each). */
export function rateLimitGroup(group: keyof typeof RULES): RateLimitRule[] {
  return RULES[group] || [];
}
