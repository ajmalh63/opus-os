import { Hono } from 'hono';
import { submitUrlForGoogleIndexing, GoogleServiceAccountCredentials, IndexingNotificationType } from '../lib/googleIndexing.js';

export const indexingRouter = new Hono<{ Bindings: any }>();

function parseGcpCredentials(env: any): GoogleServiceAccountCredentials | undefined {
  if (env.GCP_SERVICE_ACCOUNT_EMAIL && env.GCP_SERVICE_ACCOUNT_PRIVATE_KEY) {
    return {
      client_email: env.GCP_SERVICE_ACCOUNT_EMAIL,
      private_key: env.GCP_SERVICE_ACCOUNT_PRIVATE_KEY.replace(/\\n/g, '\n'),
    };
  }
  if (env.GCP_SERVICE_ACCOUNT_JSON) {
    try {
      const parsed = JSON.parse(env.GCP_SERVICE_ACCOUNT_JSON);
      return {
        client_email: parsed.client_email,
        private_key: parsed.private_key,
      };
    } catch {
      return undefined;
    }
  }
  return undefined;
}

// Public Core URLs for Instant Indexing
const CORE_PUBLIC_ROUTES = [
  'https://opusoverseas.com/',
  'https://opusoverseas.com/study-abroad',
  'https://opusoverseas.com/visa-services',
  'https://opusoverseas.com/tours-travels',
  'https://opusoverseas.com/attestation',
  'https://opusoverseas.com/recruitment',
  'https://opusoverseas.com/lead-form',
];

// POST /api/indexing/publish - Submit specific URLs to Google Instant Indexing API
indexingRouter.post('/publish', async (c) => {
  const credentials = parseGcpCredentials(c.env);
  if (!credentials) {
    return c.json({ error: 'GCP Service Account credentials not configured in environment' }, 400);
  }

  const body = await c.req.json().catch(() => ({}));
  const urls: string[] = Array.isArray(body.urls) ? body.urls : (body.url ? [body.url] : []);
  const type: IndexingNotificationType = body.type === 'URL_DELETED' ? 'URL_DELETED' : 'URL_UPDATED';

  if (urls.length === 0) {
    return c.json({ error: 'No URLs provided for indexing' }, 400);
  }

  const results = await Promise.all(
    urls.map((url) => submitUrlForGoogleIndexing(url, type, credentials))
  );

  return c.json({
    success: true,
    total: results.length,
    submitted: results.filter((r) => r.status === 'submitted').length,
    failed: results.filter((r) => r.status === 'failed').length,
    results,
  });
});

// POST /api/indexing/submit-core - Submit all core division pages
indexingRouter.post('/submit-core', async (c) => {
  const credentials = parseGcpCredentials(c.env);
  if (!credentials) {
    return c.json({ error: 'GCP Service Account credentials not configured' }, 400);
  }

  const results = await Promise.all(
    CORE_PUBLIC_ROUTES.map((url) => submitUrlForGoogleIndexing(url, 'URL_UPDATED', credentials))
  );

  return c.json({
    success: true,
    message: 'Core public URLs submitted to Google Instant Indexing API',
    total: results.length,
    results,
  });
});

// GET /api/indexing/status - Check if Google Indexing service is configured
indexingRouter.get('/status', async (c) => {
  const credentials = parseGcpCredentials(c.env);
  return c.json({
    configured: !!credentials,
    client_email: credentials?.client_email || null,
    quota: '200 URLs/day (100% Free via Google Indexing API v3)',
  });
});
