// Tool-First command envelope (Phase 1): the OS control panel operates the
// backend tools through their VPC APIs. Every command: RBAC gate → adapter
// execute → audit → normalized result. Tool quirks stay inside the executors;
// the UI only ever sees { ok, result } / { ok:false, error }.

import type { ToolEnv } from './types.js';

export type CommandResult = { ok: true; result: any } | { ok: false; error: string };

function listmonkAuth(env: ToolEnv): string | null {
  if (!env.LISTMONK_BASE_URL || !env.LISTMONK_API_USER || !env.LISTMONK_API_PASS) return null;
  return 'Basic ' + btoa(`${env.LISTMONK_API_USER}:${env.LISTMONK_API_PASS}`);
}

async function lmFetch(base: string, path: string, method: string, auth: string, body?: unknown): Promise<CommandResult> {
  try {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: { Authorization: auth, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: `${res.status}: ${(json as any)?.error || JSON.stringify(json).slice(0, 160)}` };
    return { ok: true, result: json };
  } catch (e: any) {
    return { ok: false, error: `request failed: ${e?.message || 'unknown'}` };
  }
}

// ── Listmonk executors (resource → action map; whitelisted, no wildcards) ──
async function listmonkCommand(env: ToolEnv, resource: string, action: string, payload: any): Promise<CommandResult> {
  const auth = listmonkAuth(env);
  if (!auth) return { ok: false, error: 'LISTMONK_* envs not set' };
  const base = env.LISTMONK_BASE_URL!;
  const p = payload || {};

  switch (`${resource}:${action}`) {
    // Campaigns
    case 'campaigns:list': return lmFetch(base, `/api/campaigns?page=${p.page || 1}&per_page=${p.perPage || 20}`, 'GET', auth);
    case 'campaigns:create': return lmFetch(base, '/api/campaigns', 'POST', auth, {
      name: p.name, subject: p.subject, lists: p.lists || [], type: p.type || 'regular',
      from_email: p.fromEmail, body: p.body, altbody: p.altbody, send_at: p.sendAt, tags: p.tags,
    });
    case 'campaigns:update': return lmFetch(base, `/api/campaigns/${p.id}`, 'PUT', auth, {
      name: p.name, subject: p.subject, lists: p.lists, type: p.type,
      from_email: p.fromEmail, body: p.body, altbody: p.altbody, send_at: p.sendAt, tags: p.tags,
    });
    case 'campaigns:status': return lmFetch(base, `/api/campaigns/${p.id}/status`, 'POST', auth, { status: p.status });
    case 'campaigns:test': return lmFetch(base, `/api/campaigns/${p.id}/test`, 'POST', auth, { emails: p.emails || [] });
    case 'campaigns:delete': return lmFetch(base, `/api/campaigns/${p.id}`, 'DELETE', auth);
    // Templates
    case 'templates:list': return lmFetch(base, `/api/templates?page=${p.page || 1}&per_page=${p.perPage || 20}`, 'GET', auth);
    case 'templates:create': return lmFetch(base, '/api/templates', 'POST', auth, { name: p.name, body: p.body, subject: p.subject, is_default: !!p.isDefault });
    case 'templates:update': return lmFetch(base, `/api/templates/${p.id}`, 'PUT', auth, { name: p.name, body: p.body, subject: p.subject, is_default: !!p.isDefault });
    case 'templates:delete': return lmFetch(base, `/api/templates/${p.id}`, 'DELETE', auth);
    // Lists (audiences)
    case 'lists:list': return lmFetch(base, `/api/lists?page=${p.page || 1}&per_page=${p.perPage || 20}`, 'GET', auth);
    case 'lists:create': return lmFetch(base, '/api/lists', 'POST', auth, { name: p.name, type: p.type || 'public', optin: p.optin || 'single', tags: p.tags });
    case 'lists:update': return lmFetch(base, `/api/lists/${p.id}`, 'PUT', auth, { name: p.name, type: p.type, optin: p.optin, tags: p.tags });
    case 'lists:delete': return lmFetch(base, `/api/lists/${p.id}`, 'DELETE', auth);
    // Subscribers
    case 'subscribers:list': return lmFetch(base, `/api/subscribers?list_id=${p.listId || ''}&page=${p.page || 1}&per_page=${p.perPage || 20}`, 'GET', auth);
    case 'subscribers:create': return lmFetch(base, '/api/subscribers', 'POST', auth, { email: p.email, name: p.name, status: p.status || 'enabled', lists: p.lists || [] });
    case 'subscribers:update': return lmFetch(base, `/api/subscribers/${p.id}`, 'PUT', auth, { status: p.status, name: p.name, lists: p.lists });
    case 'subscribers:delete': return lmFetch(base, `/api/subscribers/${p.id}`, 'DELETE', auth);
    // Bounces (suppression evidence, read-only)
    case 'bounces:list': return lmFetch(base, `/api/bounces?campaign_id=${p.campaignId || ''}&page=${p.page || 1}&per_page=${p.perPage || 20}`, 'GET', auth);
    default: return { ok: false, error: `unknown listmonk command: ${resource}:${action}` };
  }
}

// Tool executors for future tools slot in here; unknown tools → error.
export async function executeToolCommand(env: ToolEnv, tool: string, resource: string, action: string, payload: any): Promise<CommandResult> {
  switch (tool) {
    case 'listmonk': return listmonkCommand(env, resource, action, payload);
    default: return { ok: false, error: `unknown tool: ${tool}` };
  }
}

// Read passthrough for control-panel views (paged, whitelisted resources).
export async function readToolResource(env: ToolEnv, tool: string, resource: string, query: Record<string, string>): Promise<CommandResult> {
  switch (tool) {
    case 'listmonk': {
      const auth = listmonkAuth(env);
      if (!auth) return { ok: false, error: 'LISTMONK_* envs not set' };
      const allowed = ['campaigns', 'templates', 'lists', 'subscribers', 'bounces'];
      if (!allowed.includes(resource)) return { ok: false, error: `unknown listmonk resource: ${resource}` };
      const q = new URLSearchParams({ page: query.page || '1', per_page: query.perPage || '20' });
      if (query.listId) q.set('list_id', query.listId);
      if (query.campaignId) q.set('campaign_id', query.campaignId);
      return lmFetch(env.LISTMONK_BASE_URL!, `/api/${resource}?${q}`, 'GET', auth);
    }
    default: return { ok: false, error: `unknown tool: ${tool}` };
  }
}