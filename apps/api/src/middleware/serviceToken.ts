// Service-token middleware for the automation lane (n8n spine, Wave 2).
// Dedicated, scoped, fail-closed: only routes mounted under /api/automation
// accept this token. Never used to widen RBAC surfaces.
// Source of truth: AGENTS.md "10 ms CPU budget" + TOOL-STRATEGIES.md (n8n = glue).

import type { MiddlewareHandler } from 'hono';

export type AutomationEnv = {
  AUTOMATION_TOKEN?: string;
};

export const serviceTokenMiddleware: MiddlewareHandler<{ Bindings: AutomationEnv }> = async (c, next) => {
  const expected = c.env?.AUTOMATION_TOKEN;
  if (!expected) {
    // fail-closed: no token configured ⇒ automation is OFF
    return c.json({ error: 'automation disabled' }, 503);
  }
  const got = c.req.header('X-Service-Token') || c.req.header('Authorization')?.replace(/^Bearer\s+/i, '');
  if (!got) return c.json({ error: 'unauthorized' }, 401);
  // timing-safe compare
  const a = Buffer.from(got);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !a.equals(b)) {
    return c.json({ error: 'unauthorized' }, 401);
  }
  await next();
};