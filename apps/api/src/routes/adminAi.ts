import { Hono } from 'hono';
import { getDb } from '../db/client.js';
import {
  getAiGovernanceSettings,
  saveAiGovernanceSettings,
  APPROVED_AI_MODELS,
} from '../lib/aiGovernance.js';
import { auditEvent } from '../middleware/audit.js';

export const adminAiRouter = new Hono<{ Bindings: any }>();

// GET /api/admin/ai/config - Fetch AI governance settings and complete model catalog
adminAiRouter.get('/config', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const settings = await getAiGovernanceSettings(db);

  return c.json({
    success: true,
    settings,
    models: APPROVED_AI_MODELS,
    bound: !!c.env?.AI,
  });
});

// PUT /api/admin/ai/config - Superadmin updates models, feature switches, and aggressive caching rules
adminAiRouter.put('/config', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const body = await c.req.json().catch(() => ({}));

  const updated = await saveAiGovernanceSettings(db, body);

  await auditEvent(c, {
    action: 'AI_GOVERNANCE_CONFIG_UPDATED',
    entityName: 'ai_governance',
    entityId: 'settings',
    afterState: { settings: updated },
  });

  return c.json({
    success: true,
    message: 'AI Governance configuration updated successfully.',
    settings: updated,
  });
});

// POST /api/admin/ai/test - Single Model Probe
adminAiRouter.post('/test', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const model = body.model || '@cf/meta/llama-3.3-70b-instruct-fp8-fast';
  const prompt = body.prompt || 'Respond with a confirmation message confirming Cloudflare Workers AI edge execution for Opus Overseas.';

  const ai = c.env?.AI;
  if (!ai) {
    return c.json(
      {
        success: false,
        error: 'Workers AI binding (env.AI) is not active in this environment.',
        model,
      },
      503
    );
  }

  const startMs = Date.now();
  try {
    const res = await ai.run(model, {
      prompt,
      max_tokens: 250,
    });
    const latencyMs = Date.now() - startMs;

    return c.json({
      success: true,
      model,
      latencyMs,
      output: res?.response || res,
    });
  } catch (err: any) {
    return c.json(
      {
        success: false,
        model,
        error: err.message || 'Model execution failed',
        latencyMs: Date.now() - startMs,
      },
      500
    );
  }
});

// POST /api/admin/ai/batch-test - Batch Prompt Execution Benchmark
adminAiRouter.post('/batch-test', async (c) => {
  const body = await c.req.json().catch(() => ({}));
  const model = body.model || '@cf/meta/llama-3.1-8b-instruct';
  const prompts: string[] = body.prompts || [
    'Evaluate admission chances for UK MSc Data Science with 70% in B.Tech.',
    'Evaluate admission chances for Germany MS Informatics with 80% in B.Tech and A2 German.',
    'Evaluate admission chances for US MS Computer Science with 3.4 GPA and 315 GRE.',
  ];

  const ai = c.env?.AI;
  if (!ai) {
    return c.json({
      success: true,
      mode: 'mock-batch',
      total: prompts.length,
      latencyMs: 15,
      results: prompts.map((p, idx) => ({ id: idx + 1, prompt: p, output: `[Simulated edge evaluation for query: ${p}]` })),
    });
  }

  const startMs = Date.now();
  const results = await Promise.allSettled(
    prompts.map(async (prompt, idx) => {
      const res = await ai.run(model, { prompt, max_tokens: 150 });
      return { id: idx + 1, prompt, output: res?.response || res };
    })
  );

  const latencyMs = Date.now() - startMs;

  return c.json({
    success: true,
    total: prompts.length,
    latencyMs,
    avgLatencyPerPromptMs: Math.round(latencyMs / prompts.length),
    results: results.map((r, idx) =>
      r.status === 'fulfilled' ? r.value : { id: idx + 1, prompt: prompts[idx], error: (r as any).reason?.message }
    ),
  });
});
