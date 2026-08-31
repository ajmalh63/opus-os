import { Context, Next } from 'hono';
import { getDb } from '../db/client.js';
import { idempotencyKeys } from '../db/schema.js';
import { eq } from 'drizzle-orm';

const TTL_24_HOURS = 86400;

export function idempotency() {
  return async (c: Context<{ Bindings: { DB: D1Database } }>, next: Next) => {
    // Only apply idempotency to mutating HTTP methods
    if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(c.req.method)) {
      return next();
    }

    const idempotencyKey = c.req.header('idempotency-key') || c.req.header('x-idempotency-key');
    if (!idempotencyKey) {
      return next();
    }

    if (!c.env?.DB) return next();
    const db = getDb(c.env.DB);
    const now = Math.floor(Date.now() / 1000);
    const apiKeyId = c.get('apiKey')?.id || null;
    const requestPath = c.req.path;

    // Read the body from a CLONE of the raw request. Reading the original
    // stream (c.req.text()) would consume it, breaking downstream handlers
    // that call c.req.json() (the cause of the 500s on POST /api/auth/otp/send).
    let bodyText = '';
    try {
      const cloned = c.req.raw.clone();
      bodyText = await cloned.text();
    } catch {
      bodyText = '';
    }

    const hashBuf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(bodyText));
    const requestHash = Array.from(new Uint8Array(hashBuf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    // Check existing key in DB
    const existing = await db.select().from(idempotencyKeys).where(eq(idempotencyKeys.key, idempotencyKey)).get();

    if (existing) {
      // Key expired
      if (existing.expiresAt < now) {
        await db.delete(idempotencyKeys).where(eq(idempotencyKeys.key, idempotencyKey)).execute();
      } else {
        // Conflict: Key re-used for different payload
        if (existing.requestHash !== requestHash) {
          return c.json(
            {
              error: 'Conflict',
              message: 'Idempotency key was previously used with a different request payload or path.',
              code: 'IDEMPOTENCY_CONFLICT',
            },
            409,
          );
        }

        // Return cached idempotent response
        c.header('X-Idempotent-Replay', 'true');
        c.status(existing.responseStatus as any);
        try {
          return c.json(JSON.parse(existing.responseBody));
        } catch {
          return c.text(existing.responseBody);
        }
      }
    }

    // Execute route handler
    await next();

    // Capture and cache successful responses
    const status = c.res.status;
    if (status >= 200 && status < 300) {
      try {
        const clonedRes = c.res.clone();
        const responseBody = await clonedRes.text();

        c.executionCtx?.waitUntil(
          db
            .insert(idempotencyKeys)
            .values({
              key: idempotencyKey,
              apiKeyId,
              requestPath,
              requestHash,
              responseStatus: status,
              responseBody,
              createdAt: now,
              expiresAt: now + TTL_24_HOURS,
            })
            .execute()
            .catch(() => {}),
        );
      } catch {
        /* fail-open */
      }
    }
  };
}
