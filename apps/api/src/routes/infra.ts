import { Hono } from 'hono';
import { vectorHealth } from '../infra/vector.js';

export const infraRouter = new Hono<{ Bindings: any }>();

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

  // Queues (binding present)
  report.queues = !!env.JOBS_QUEUE;

  // Workers AI
  report.ai = !!env.AI;

  const allUp = Object.values(report).every(Boolean);

  return c.json({
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
  });
});