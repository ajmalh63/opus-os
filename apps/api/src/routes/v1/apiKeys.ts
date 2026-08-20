import { Hono } from 'hono';
import { getDb } from '../../db/client.js';
import { apiKeys } from '../../db/schema.js';
import { eq, desc } from 'drizzle-orm';
import { generateApiKey, hashApiKey, apiKeyAuth } from '../../middleware/apiKeyAuth.js';
import { auditEvent } from '../../middleware/audit.js';

export const v1ApiKeysRouter = new Hono<{ Bindings: { DB: D1Database } }>();

const now = () => Math.floor(Date.now() / 1000);
const uid = () => `ak_${now()}_${crypto.randomUUID().slice(0, 8)}`;

const AVAILABLE_SCOPES = [
  'leads:read',
  'leads:write',
  'clients:read',
  'clients:write',
  'study-abroad:read',
  'study-abroad:write',
  'visa:read',
  'visa:write',
  'umrah:read',
  'umrah:write',
  'attestation:read',
  'attestation:write',
  'webhooks:manage',
  '*',
];

// GET /api/v1/keys — List all API keys (masked)
v1ApiKeysRouter.get('/', apiKeyAuth(['*']), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB unavailable' }, 500);
  const db = getDb(c.env.DB);

  try {
    const rows = await db.select().from(apiKeys).orderBy(desc(apiKeys.createdAt)).all();

    return c.json({
      success: true,
      data: rows.map((r: any) => ({
        id: r.id,
        name: r.name,
        keyPrefix: `${r.keyPrefix}...`,
        scopes: typeof r.scopes === 'string' ? JSON.parse(r.scopes) : r.scopes,
        rateLimitPerMinute: r.rateLimitPerMinute,
        lastUsedAt: r.lastUsedAt,
        expiresAt: r.expiresAt,
        isRevoked: r.isRevoked,
        createdAt: r.createdAt,
      })),
      count: rows.length,
      availableScopes: AVAILABLE_SCOPES,
    });
  } catch (err: any) {
    return c.json({ error: 'Failed to retrieve API keys', details: err.message }, 500);
  }
});

// POST /api/v1/keys — Generate new API Key (plaintext returned ONCE)
v1ApiKeysRouter.post('/', apiKeyAuth(['*']), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB unavailable' }, 500);
  const db = getDb(c.env.DB);
  const body = await c.req.json().catch(() => ({}));

  const name = (body.name || 'External API Key').trim();
  const environment = body.environment === 'test' ? 'test' : 'live';
  const scopes = Array.isArray(body.scopes) && body.scopes.length > 0 ? body.scopes : ['*'];
  const rateLimitPerMinute = Number(body.rateLimitPerMinute) || 120;
  const expiresInDays = Number(body.expiresInDays) || 0;
  const expiresAt = expiresInDays > 0 ? now() + expiresInDays * 86400 : null;

  try {
    const { plaintext, prefix } = generateApiKey(environment);
    const keyHash = await hashApiKey(plaintext);
    const id = uid();

    await db.insert(apiKeys).values({
      id,
      name,
      keyPrefix: prefix,
      keyHash,
      scopes: JSON.stringify(scopes),
      rateLimitPerMinute,
      expiresAt,
      isRevoked: false,
      createdBy: 'super_admin',
      createdAt: now(),
      updatedAt: now(),
    });

    c.executionCtx?.waitUntil(
      auditEvent(c, {
        action: 'API_KEY_CREATED',
        entityName: 'api_keys',
        entityId: id,
        result: 'success',
        category: 'auth',
        actorType: 'service',
        authMethod: 'service_token',
        afterState: { name, prefix, scopes, rateLimitPerMinute, expiresAt },
      }),
    );

    return c.json(
      {
        success: true,
        message: 'API Key generated successfully. Save this key now — it will not be shown again.',
        data: {
          id,
          name,
          apiKey: plaintext, // RETURNED ONLY ONCE
          keyPrefix: `${prefix}...`,
          scopes,
          rateLimitPerMinute,
          expiresAt,
          createdAt: now(),
        },
      },
      201,
    );
  } catch (err: any) {
    return c.json({ error: 'Failed to generate API key', details: err.message }, 500);
  }
});

// DELETE /api/v1/keys/:id — Revoke API Key
v1ApiKeysRouter.delete('/:id', apiKeyAuth(['*']), async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB unavailable' }, 500);
  const db = getDb(c.env.DB);
  const id = c.req.param('id') || '';

  try {
    const key = await db.select().from(apiKeys).where(eq(apiKeys.id, id)).get();
    if (!key) return c.json({ error: 'Not Found', message: `API Key '${id}' not found.` }, 404);

    await db.update(apiKeys).set({ isRevoked: true, updatedAt: now() }).where(eq(apiKeys.id, id)).execute();

    c.executionCtx?.waitUntil(
      auditEvent(c, {
        action: 'API_KEY_REVOKED',
        entityName: 'api_keys',
        entityId: id,
        result: 'success',
        category: 'auth',
        actorType: 'service',
        authMethod: 'service_token',
        afterState: { name: key.name, isRevoked: true },
      }),
    );

    return c.json({ success: true, message: `API Key '${id}' revoked successfully.` });
  } catch (err: any) {
    return c.json({ error: 'Failed to revoke API key', details: err.message }, 500);
  }
});
