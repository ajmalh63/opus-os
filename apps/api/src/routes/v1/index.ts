import { Hono } from 'hono';
import { v1LeadsRouter } from './leads.js';
import { v1ClientsRouter } from './clients.js';
import { v1StudyAbroadRouter } from './studyAbroad.js';
import { v1VisasRouter } from './visas.js';
import { v1UmrahRouter } from './umrah.js';
import { v1AttestationRouter } from './attestation.js';
import { v1WebhooksRouter } from './webhooks.js';
import { v1ApiKeysRouter } from './apiKeys.js';

export const v1ApiRouter = new Hono<{ Bindings: { DB: D1Database } }>();

// Mount sub-routers
v1ApiRouter.route('/leads', v1LeadsRouter);
v1ApiRouter.route('/clients', v1ClientsRouter);
v1ApiRouter.route('/study-abroad', v1StudyAbroadRouter);
v1ApiRouter.route('/visas', v1VisasRouter);
v1ApiRouter.route('/umrah', v1UmrahRouter);
v1ApiRouter.route('/attestation', v1AttestationRouter);
v1ApiRouter.route('/webhooks', v1WebhooksRouter);
v1ApiRouter.route('/keys', v1ApiKeysRouter);

// OpenAPI 3.1 Specification JSON
v1ApiRouter.get('/openapi.json', (c) => {
  return c.json({
    openapi: '3.1.0',
    info: {
      title: 'Opus OS Enterprise REST API',
      version: '1.0.0',
      description:
        'Official REST API and Outbound Webhook platform for Opus Overseas (Admissions, Visas, Sacred Umrah, Attestation, and Recruitment).',
      contact: { name: 'Opus Overseas API Support', email: 'info@opusoverseas.com' },
    },
    servers: [{ url: 'https://app.opusoverseas.com/api/v1', description: 'Production API Gateway' }],
    security: [{ ApiKeyAuth: [] }],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'opus_live_sk_...',
          description: 'Authenticate with your scoped Opus OS API Key in the Authorization header.',
        },
      },
    },
    paths: {
      '/leads': {
        get: { summary: 'List leads with filtering and pagination', tags: ['CRM & Leads'] },
        post: { summary: 'Create new lead with idempotency support', tags: ['CRM & Leads'] },
      },
      '/clients/{id}': {
        get: { summary: 'Get Client 360 profile and application history', tags: ['CRM & Leads'] },
      },
      '/clients/{id}/stage': {
        patch: { summary: 'Advance client pipeline stage', tags: ['CRM & Leads'] },
      },
      '/study-abroad/match': {
        post: { summary: 'Live university profile match engine', tags: ['Study Abroad'] },
      },
      '/study-abroad/applications': {
        get: { summary: 'List study abroad applications', tags: ['Study Abroad'] },
        post: { summary: 'Submit new university application snapshot', tags: ['Study Abroad'] },
      },
      '/visas/applications': {
        get: { summary: 'List visa applications', tags: ['Visas & Immigration'] },
      },
      '/visas/applications/{id}/status': {
        patch: { summary: 'Update visa application status', tags: ['Visas & Immigration'] },
      },
      '/umrah/packages': {
        get: { summary: 'List active Umrah packages with room tiers', tags: ['Umrah Travel'] },
      },
      '/umrah/departures': {
        get: { summary: 'List scheduled group departures and seat availability', tags: ['Umrah Travel'] },
      },
      '/umrah/bookings': {
        post: { summary: 'Create party booking and hold seats', tags: ['Umrah Travel'] },
      },
      '/attestation/rate-cards': {
        get: { summary: 'List indicative rate cards by destination country', tags: ['Attestation'] },
      },
      '/attestation/orders': {
        post: { summary: 'Create certificate attestation order', tags: ['Attestation'] },
      },
      '/webhooks': {
        get: { summary: 'List active outbound webhook subscriptions', tags: ['Webhooks'] },
        post: { summary: 'Create new webhook subscription with HMAC signing', tags: ['Webhooks'] },
      },
    },
  });
});

// Interactive Scalar API Documentation UI
v1ApiRouter.get('/docs', (c) => {
  return c.html(`
<!DOCTYPE html>
<html>
<head>
  <title>Opus OS REST API Reference</title>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220%22><text y=%2226%22 font-size=%2226%22>🌐</text></svg>">
</head>
<body>
  <script
    id="api-reference"
    data-url="/api/v1/openapi.json"
    data-configuration='{"theme":"purple","darkMode":true,"layout":"modern"}'
    src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"
  ></script>
</body>
</html>
  `);
});
