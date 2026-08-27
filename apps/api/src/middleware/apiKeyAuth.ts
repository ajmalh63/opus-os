import { Context, Next } from 'hono';
import { getDb } from '../db/client.js';
import { apiKeys } from '../db/schema.js';
import { eq } from 'drizzle-orm';
import { isRateLimited } from './rateLimit.js';

export interface AuthenticatedApiKey {
  id: string;
  name: string;
  keyPrefix: string;
  scopes: string[];
  rateLimitPerMinute: number;
}

declare module 'hono' {
  interface ContextVariableMap {
    apiKey?: AuthenticatedApiKey;
    apiCaller?: { id: string; type: 'api_key'; scopes: string[] };
  }
}

// Cryptographically secure SHA-256 hash
export async function hashApiKey(key: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

// Generate new random high-entropy API key
export function generateApiKey(environment: 'live' | 'test' = 'live'): { plaintext: string; prefix: string } {
  const entropy = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '');
  const plaintext = `opus_${environment}_sk_${entropy}`;
  const prefix = `opus_${environment}_sk_${entropy.slice(0, 8)}`;
  return { plaintext, prefix };
}

// API Key Authentication Middleware (OWASP API2:2023 & APTS-AR-012)
export function apiKeyAuth(requiredScopes: string[] = []) {
  return async (c: Context<{ Bindings: { DB: D1Database } }>, next: Next) => {
    const authHeader = c.req.header('authorization') || '';
    const match = authHeader.match(/^Bearer\s+(opus_(?:live|test)_sk_[a-zA-Z0-9]+)$/);

    if (!match) {
      return c.json(
        {
          error: 'Unauthorized',
          message: 'Missing or malformed API key. Provide Authorization: Bearer opus_live_sk_...',
          code: 'UNAUTHORIZED_API_KEY',
        },
        401,
      );
    }

    const plaintext = match[1];
    const keyHash = await hashApiKey(plaintext);

    if (!c.env?.DB) {
      return c.json({ error: 'Database service unavailable' }, 503);
    }

    const db = getDb(c.env.DB);
    const keyRow = await db.select().from(apiKeys).where(eq(apiKeys.keyHash, keyHash)).get();

    if (!keyRow) {
      return c.json(
        {
          error: 'Unauthorized',
          message: 'Invalid API key provided.',
          code: 'INVALID_API_KEY',
        },
        401,
      );
    }

    if (keyRow.isRevoked) {
      return c.json(
        {
          error: 'Unauthorized',
          message: 'This API key has been revoked.',
          code: 'REVOKED_API_KEY',
        },
        401,
      );
    }

    const now = Math.floor(Date.now() / 1000);
    if (keyRow.expiresAt && keyRow.expiresAt < now) {
      return c.json(
        {
          error: 'Unauthorized',
          message: 'This API key has expired.',
          code: 'EXPIRED_API_KEY',
        },
        401,
      );
    }

    // Parse scopes
    let grantedScopes: string[] = [];
    try {
      grantedScopes = typeof keyRow.scopes === 'string' ? JSON.parse(keyRow.scopes) : keyRow.scopes;
    } catch {
      grantedScopes = [];
    }

    // Scope verification (wildcard '*' grants everything) — with umrah↔tours alias (v8 Tours consolidation, backward compat)
    const SCOPE_ALIAS: Record<string, string> = {
      'umrah:read': 'tours:read',
      'tours:read': 'umrah:read',
      'umrah:write': 'tours:write',
      'tours:write': 'umrah:write',
    };
    const hasWildcard = grantedScopes.includes('*');
    if (!hasWildcard && requiredScopes.length > 0) {
      const hasAllRequired = requiredScopes.every((req) => grantedScopes.includes(req) || (SCOPE_ALIAS[req] ? grantedScopes.includes(SCOPE_ALIAS[req]) : false));
      if (!hasAllRequired) {
        return c.json(
          {
            error: 'Forbidden',
            message: `Insufficient permissions. Required scope(s): [${requiredScopes.join(', ')}]. Granted: [${grantedScopes.join(', ')}] (umrah↔tours alias)`,
            code: 'INSUFFICIENT_SCOPE',
          },
          403,
        );
      }
    }

    // Token-Bucket Rate Limiter per API Key
    const limit = keyRow.rateLimitPerMinute || 120;
    const rateCheck = await isRateLimited(c.env, { bucket: 'apikey', windowSeconds: 60, limit }, keyRow.id);
    if (rateCheck.over) {
      c.header('Retry-After', '60');
      return c.json(
        {
          error: 'Too Many Requests',
          message: `API rate limit of ${limit} requests/minute exceeded for this key.`,
          code: 'RATE_LIMIT_EXCEEDED',
        },
        429,
      );
    }

    // Update lastUsedAt asynchronously (fail-open)
    c.executionCtx?.waitUntil(
      db.update(apiKeys).set({ lastUsedAt: now }).where(eq(apiKeys.id, keyRow.id)).execute().catch(() => {}),
    );

    // Attach to context
    c.set('apiKey', {
      id: keyRow.id,
      name: keyRow.name,
      keyPrefix: keyRow.keyPrefix,
      scopes: grantedScopes,
      rateLimitPerMinute: limit,
    });

    c.set('apiCaller', {
      id: keyRow.id,
      type: 'api_key',
      scopes: grantedScopes,
    });

    await next();
  };
}
