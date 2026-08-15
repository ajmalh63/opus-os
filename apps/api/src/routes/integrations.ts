// Tool-First unified surface (Wave 3): one contract, many tools.
// GET /api/integrations/status  — every tool adapter snapshot (ok/unconfigured/error + metrics)
// GET /api/integrations/live    — near-real-time event timeline: adapter feeds +
//                                 the A-3 webhook event log (Listmonk deliveries, Razorpay, …)

import { Hono } from 'hono';
import { getDb } from '../db/client.js';
import { listmonkAdapter, listmonkRecentEvents } from '../integrations/listmonk.js';
import { mauticAdapter } from '../integrations/mautic.js';
import { chatwootAdapter, openwaAdapter } from '../integrations/chatwoot-openwa.js';
import { executeToolCommand, readToolResource } from '../integrations/commands.js';
import { auditEvent } from '../middleware/audit.js';
import type { ToolEnv } from '../integrations/types.js';

type IntBindings = { DB: D1Database; [k: string]: unknown };

export const integrationsRouter = new Hono<{ Bindings: IntBindings; Variables: { user?: { id?: string; role?: string } | null } }>();

integrationsRouter.get('/status', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const env = c.env as unknown as ToolEnv;
  try {
    const snapshots = await Promise.all([
      listmonkAdapter.snapshot(env),
      mauticAdapter.snapshot(env),
      chatwootAdapter.snapshot(env),
      openwaAdapter.snapshot(env),
    ]);
    return c.json({ ok: true, generatedAt: Math.floor(Date.now() / 1000), tools: snapshots });
  } catch (e: any) {
    return c.json({ error: 'Integrations status failed', details: e?.message }, 500);
  }
});

integrationsRouter.get('/live', async (c) => {
  if (!c.env?.DB) return c.json({ error: 'DB not available' }, 500);
  const db = getDb(c.env.DB);
  const env = c.env as unknown as ToolEnv;
  try {
    const [listmonkEvents, toolSnaps] = await Promise.all([
      listmonkRecentEvents(db),
      Promise.all([
        listmonkAdapter.snapshot(env),
        mauticAdapter.snapshot(env),
        chatwootAdapter.snapshot(env),
        openwaAdapter.snapshot(env),
      ]),
    ]);
    const feed = [
      ...toolSnaps.flatMap((s) => s.items),
      ...listmonkEvents,
    ].sort((a, b) => (b.at || 0) - (a.at || 0)).slice(0, 50);
    return c.json({ ok: true, generatedAt: Math.floor(Date.now() / 1000), tools: toolSnaps, feed });
  } catch (e: any) {
    return c.json({ error: 'Live feed failed', details: e?.message }, 500);
  }
});

// GET /api/integrations/:tool/:resource — typed read passthrough for the
// control-panel views (whitelisted resources, paged).
integrationsRouter.get('/:tool/:resource', async (c) => {
  const env = c.env as unknown as ToolEnv;
  const res = await readToolResource(env, c.req.param('tool'), c.req.param('resource'), c.req.query() as Record<string, string>);
  return res.ok ? c.json(res.result) : c.json({ error: res.error }, 502);
});

// POST /api/integrations/:tool/:resource/:action — command envelope.
// RBAC (manager+) at mount; every command is audited (Tool-First control plane).
integrationsRouter.post('/:tool/:resource/:action', async (c) => {
  const env = c.env as unknown as ToolEnv;
  const user = c.get('user') as any;
  const payload = await c.req.json().catch(() => ({}));
  const tool = c.req.param('tool');
  const resource = c.req.param('resource');
  const action = c.req.param('action');
  const res = await executeToolCommand(env, tool, resource, action, payload);
  try {
    await auditEvent(c, {
      action: `TOOL_${tool.toUpperCase()}_${resource.toUpperCase()}_${action.toUpperCase()}`,
      entityName: `${tool}.${resource}`,
      entityId: String((payload as any)?.id || (payload as any)?.email || '-'),
      afterState: { by: user?.id, payload: Object.keys(payload || {}).filter((k) => !/pass|secret|token/i.test(k)) },
    });
  } catch { /* audit is best-effort */ }
  return res.ok ? c.json({ ok: true, result: res.result }) : c.json({ ok: false, error: res.error }, 502);
});