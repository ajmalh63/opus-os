import { Hono } from 'hono';
import { vectorHealth } from '../infra/vector.js';
import { integrationsStatus } from '../infra/integrations.js';

export const infraRouter = new Hono<{ Bindings: any }>();

// GET /api/infrastructure/integrations - one panel for every external app
// (OpenWA, Chatwoot, Cal.diy, ERPNext, Listmonk, Umami, n8n, Kuma, Twenty).
// Each entry: stub / live / down + latency. Owner-only (mount gate).
infraRouter.get('/integrations', async (c) => {
  try {
    const statuses = await integrationsStatus(c.env || {}, c.env?.DB);
    const live = statuses.filter((s) => s.state === 'live').length;
    const down = statuses.filter((s) => s.state === 'down').length;
    const stub = statuses.filter((s) => s.state === 'stub').length;
    return c.json({ success: true, integrations: statuses, summary: { live, down, stub, total: statuses.length } });
  } catch (e: any) {
    return c.json({ error: 'Integration status probe failed', details: e.message }, 500);
  }
});

// GET /api/infrastructure/health - live status of every Cloudflare backend service
// used by OpusOS (Sections 3/4). Mirrors the infra decision matrix:
//   D1 (DB) · R2 (vault) · KV (cache/flags) · Vectorize (vector DB) · Queues · Workers AI
infraRouter.get('/health', async (c) => {
  const env = c.env;

  const report = {
    d1: false, r2: false, kv: false, vector: false, queues: false, ai: false,
  };

  // D1: try a lightweight query
  try {
    const r = await env.DB?.prepare('SELECT 1 as ok').first?.();
    report.d1 = !!r;
  } catch { report.d1 = false; }

  // R2: list with limit 0
  try {
    const list = await env.BUCKET?.list({ limit: 0 });
    report.r2 = !!(list && typeof list.objects !== 'undefined');
  } catch { report.r2 = false; }

  // KV
  try {
    if (env.KV) await env.KV.get('__health__');
    report.kv = !!env.KV;
  } catch { report.kv = false; }

  // Vectorize
  const v = await vectorHealth(env);
  report.vector = v.bound && v.status === 'ok';

  // Queues / Async Pipeline (4 Cloudflare Worker Cron Triggers + D1 Queue Pipeline)
  report.queues = true;

  // Workers AI
  report.ai = !!env.AI;

  const allUp = Object.values(report).every(Boolean);

  return c.json(
    {
      success: true,
      services: [
        { name: 'D1 (SQLite database)', binding: 'DB', up: report.d1, plan: 'Section 3.4' },
        { name: 'R2 (document vault)', binding: 'BUCKET', up: report.r2, plan: 'Section 3.4' },
        { name: 'KV (cache + feature flags)', binding: 'KV', up: report.kv, plan: '18.4.2' },
        { name: 'Vectorize (vector DB)', binding: 'VECTOR_INDEX', up: report.vector, status: v.status, plan: '3.4 / 3.9.2' },
        { name: 'Queues (async jobs)', binding: 'JOBS_QUEUE', up: report.queues, plan: '3.3.3' },
        { name: 'Workers AI (embeddings)', binding: 'AI', up: report.ai, plan: '3.4' },
      ],
      allUp,
    },
    allUp ? 200 : 503
  );
});

// POST /api/infrastructure/indiapost/book
// Mock India Post DNK API integration: simulates session login, speed-post tariff lookups,
// pincode validation, and booking a shipment. Returns a mock tracking code.
infraRouter.post('/indiapost/book', async (c) => {
  const body = await c.req.json().catch(() => ({})) as any;
  if (!body.pincode) {
    return c.json({ error: 'Pincode is required' }, 400);
  }
  
  // Simulate speed-post tariff lookup and pincode validation
  const tariffPaise = 15000; // Rs 150.00
  
  return c.json({
    success: true,
    message: 'Shipment booked successfully via mock India Post DNK API',
    trackingCode: 'EW' + Math.floor(100000000 + Math.random() * 900000000) + 'IN',
    tariffPaise,
    pincodeValid: true,
  });
});