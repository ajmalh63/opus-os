import { describe, it, expect } from 'vitest';
import { Hono } from 'hono';
import { v1ApiRouter } from '../src/routes/v1/index.js';
import { generateApiKey, hashApiKey } from '../src/middleware/apiKeyAuth.js';

describe('Opus OS Enterprise REST API Platform (v1)', () => {
  it('generates high-entropy cryptographically secure API keys with prefixes', async () => {
    const { plaintext, prefix } = generateApiKey('live');
    expect(plaintext.startsWith('opus_live_sk_')).toBe(true);
    expect(prefix.startsWith('opus_live_sk_')).toBe(true);
    expect(plaintext.length).toBeGreaterThan(40);

    const hash1 = await hashApiKey(plaintext);
    const hash2 = await hashApiKey(plaintext);
    expect(hash1).toBe(hash2);
    expect(hash1.length).toBe(64); // SHA-256 hex string
  });

  it('serves OpenAPI 3.1 specification at /openapi.json', async () => {
    const app = new Hono();
    app.route('/api/v1', v1ApiRouter);

    const res = await app.request('/api/v1/openapi.json');
    expect(res.status).toBe(200);

    const spec = (await res.json()) as any;
    expect(spec.openapi).toBe('3.1.0');
    expect(spec.info.title).toContain('Opus OS');
    expect(spec.paths['/leads']).toBeDefined();
    expect(spec.paths['/study-abroad/match']).toBeDefined();
    expect(spec.paths['/umrah/bookings']).toBeDefined();
  });

  it('serves interactive Scalar API documentation at /docs', async () => {
    const app = new Hono();
    app.route('/api/v1', v1ApiRouter);

    const res = await app.request('/api/v1/docs');
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('@scalar/api-reference');
    expect(html).toContain('/api/v1/openapi.json');
  });

  it('rejects unauthorized requests with standard 401 response shape', async () => {
    const app = new Hono();
    app.route('/api/v1', v1ApiRouter);

    const res = await app.request('/api/v1/leads');
    expect(res.status).toBe(401);

    const data = (await res.json()) as any;
    expect(data.error).toBe('Unauthorized');
    expect(data.code).toBe('UNAUTHORIZED_API_KEY');
  });
});
