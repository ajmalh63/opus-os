import { Hono } from 'hono';
import { v1LeadsRouter } from './leads.js';
import { v1ClientsRouter } from './clients.js';
import { v1StudyAbroadRouter } from './studyAbroad.js';
import { v1VisasRouter } from './visas.js';
import { v1UmrahRouter } from './umrah.js';
import { v1AttestationRouter } from './attestation.js';
import { v1RecruitmentRouter } from './recruitment.js';
import { v1BookingsRouter } from './bookings.js';
import { v1PaymentsRouter } from './payments.js';
import { v1DocumentsRouter } from './documents.js';
import { v1PartnersRouter } from './partners.js';
import { v1MessagesRouter } from './messages.js';
import { v1WebhooksRouter } from './webhooks.js';
import { v1ApiKeysRouter } from './apiKeys.js';

export const v1ApiRouter = new Hono<{
  Bindings: {
    DB: D1Database;
    OPENWA_BASE_URL?: string;
    OPENWA_API_KEY?: string;
  };
}>();

// Mount all 12 division & utility sub-routers
v1ApiRouter.route('/leads', v1LeadsRouter);
v1ApiRouter.route('/clients', v1ClientsRouter);
v1ApiRouter.route('/study-abroad', v1StudyAbroadRouter);
v1ApiRouter.route('/visas', v1VisasRouter);
v1ApiRouter.route('/umrah', v1UmrahRouter);
v1ApiRouter.route('/attestation', v1AttestationRouter);
v1ApiRouter.route('/recruitment', v1RecruitmentRouter);
v1ApiRouter.route('/bookings', v1BookingsRouter);
v1ApiRouter.route('/payments', v1PaymentsRouter);
v1ApiRouter.route('/documents', v1DocumentsRouter);
v1ApiRouter.route('/partners', v1PartnersRouter);
v1ApiRouter.route('/messages', v1MessagesRouter);
v1ApiRouter.route('/webhooks', v1WebhooksRouter);
v1ApiRouter.route('/keys', v1ApiKeysRouter);

// Comprehensive OpenAPI 3.1 Specification JSON
v1ApiRouter.get('/openapi.json', (c) => {
  return c.json({
    openapi: '3.1.0',
    info: {
      title: 'Opus OS Complete Enterprise REST API',
      version: '1.0.0',
      description:
        'Official REST API covering 100% of Opus OS applications: Admissions, Visas, Sacred Umrah, Attestation, Recruitment, Client 360, Appointments, Payments, Documents, Affiliates, Messaging, and Webhooks.',
      contact: { name: 'Opus Overseas API Desk', email: 'info@opusoverseas.com' },
    },
    servers: [{ url: 'https://app.opusoverseas.com/api/v1', description: 'Production Gateway' }],
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
        get: { summary: 'Get Client 360 profile and history', tags: ['CRM & Leads'] },
      },
      '/clients/{id}/stage': {
        patch: { summary: 'Advance client pipeline stage', tags: ['CRM & Leads'] },
      },
      '/study-abroad/match': {
        post: { summary: 'Live university profile match engine', tags: ['Study Abroad'] },
      },
      '/study-abroad/applications': {
        get: { summary: 'List university applications', tags: ['Study Abroad'] },
        post: { summary: 'Submit application snapshot', tags: ['Study Abroad'] },
      },
      '/visas/applications': {
        get: { summary: 'List visa applications', tags: ['Visas & Immigration'] },
      },
      '/visas/applications/{id}/status': {
        patch: { summary: 'Update visa application status', tags: ['Visas & Immigration'] },
      },
      '/umrah/packages': {
        get: { summary: 'List Umrah packages with room tiers', tags: ['Umrah Pilgrimage'] },
      },
      '/umrah/departures': {
        get: { summary: 'List group departure seat availability', tags: ['Umrah Pilgrimage'] },
      },
      '/umrah/bookings': {
        post: { summary: 'Create party booking and hold seats', tags: ['Umrah Pilgrimage'] },
      },
      '/attestation/rate-cards': {
        get: { summary: 'List indicative rate cards by destination country', tags: ['Attestation'] },
      },
      '/attestation/orders': {
        post: { summary: 'Create certificate attestation order', tags: ['Attestation'] },
      },
      '/recruitment/jobs': {
        get: { summary: 'List open overseas job demands', tags: ['Recruitment & Manpower'] },
        post: { summary: 'Create overseas job posting', tags: ['Recruitment & Manpower'] },
      },
      '/recruitment/deployments': {
        get: { summary: 'List candidate applications and deployments with algorithmic triage and VAS status', tags: ['Recruitment & Manpower'] },
      },
      '/recruitment/match': {
        post: { summary: 'Execute deterministic 4-pillar candidate match scoring engine', tags: ['Recruitment & Manpower'] },
      },
      '/recruitment/vas-plans': {
        get: { summary: 'List career acceleration add-on services and SLA commitments', tags: ['Recruitment & Manpower'] },
      },
      '/bookings': {
        get: { summary: 'List Cal.com consultation appointments', tags: ['Appointments'] },
      },
      '/payments': {
        get: { summary: 'Query payment ledger and invoices', tags: ['Finance & Payments'] },
      },
      '/documents': {
        get: { summary: 'List vault documents for a client', tags: ['Document Vault'] },
      },
      '/documents/{id}/verify': {
        patch: { summary: 'Mark document verified or rejected', tags: ['Document Vault'] },
      },
      '/partners': {
        get: { summary: 'List active affiliates & referral codes', tags: ['Partner Network'] },
      },
      '/messages/whatsapp': {
        post: { summary: 'Send outbound WhatsApp message via OpenWA', tags: ['Messaging'] },
      },
      '/webhooks': {
        get: { summary: 'List outbound webhook subscriptions', tags: ['Webhooks'] },
        post: { summary: 'Subscribe endpoint with HMAC signing', tags: ['Webhooks'] },
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
  <title>Opus OS Complete REST API Reference</title>
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
