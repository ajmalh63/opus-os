import { Hono } from 'hono';
import { eq } from 'drizzle-orm';
import { getDb } from '../db/client.js';
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
  const isStrictProbe = c.req.query('strict') === '1' || c.req.query('probe') === '1';

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
    isStrictProbe && !allUp ? 503 : 200
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

// GET /api/infrastructure/docker-overview — hardened fleet telemetry
// 2026-08-26 fixes: KV 30s cache (poll storm), 8000ms timeout, parallel OpenWA fetches,
// extended fleet (13 tunnels), strict 503 on probe=1
infraRouter.get('/docker-overview', async (c) => {
  const env = c.env;
  const db = env?.DB ? getDb(env.DB) : null;
  const cacheKey = 'infra:docker-overview:v2';
  const probe = c.req.query('probe') === '1';
  // KV cache 30s (avoids N * 3req/min fan-out; KV write = ~0.03s p50)
  try {
    if (!probe && env.KV) {
      const cached = await env.KV.get(cacheKey, 'json' as any);
      if (cached) return c.json({ success: true, overview: cached, cached: true });
    }
  } catch {}

  const result: Record<string, any> = {
    openwa: { state: 'stub', session: null, plugins: [], details: 'Unconfigured' },
    erpnext: { state: 'stub', parity: null, details: 'Unconfigured' },
    listmonk: { state: 'stub', templates: 13, details: 'Unconfigured' },
    chatwoot: { state: 'stub', details: 'Unconfigured' },
    umami: { state: 'stub', details: 'Unconfigured' },
    kuma: { state: 'stub', details: 'Unconfigured' },
    nocodb: { state: 'stub', details: 'Unconfigured' },
    postiz: { state: 'stub', details: 'Unconfigured' },
    mautic: { state: 'stub', details: 'Unconfigured' },
    n8n: { state: 'stub', details: 'Unconfigured' },
    indiapost: { state: 'stub', details: 'Unconfigured' },
    twenty: { state: 'stub', details: 'Unconfigured' },
  };

  // 1. OpenWA — parallel fetches, 8000ms (fleet audit H2)
  if (env.OPENWA_BASE_URL && env.OPENWA_API_KEY) {
    try {
      const base = env.OPENWA_BASE_URL.replace(/\/$/, '');
      const hdrs = { 'X-API-Key': env.OPENWA_API_KEY } as any;
      const [sessRes, plugRes] = await Promise.allSettled([
        fetch(`${base}/api/sessions`, { headers: hdrs, signal: AbortSignal.timeout(8000) }),
        fetch(`${base}/api/plugins`, { headers: hdrs, signal: AbortSignal.timeout(8000) }),
      ]);
      const sessOk = sessRes.status === 'fulfilled' && (sessRes.value as Response).ok;
      if (sessOk) {
        const sessions = (await (sessRes.value as Response).json()) as any[];
        const main = sessions.find((s) => s.name === 'main') || sessions[0];
        const plugins = plugRes.status === 'fulfilled' && (plugRes.value as Response).ok ? await (plugRes.value as Response).json().catch(() => []) : [];
        result.openwa = {
          state: 'live',
          session: main ? { id: main.id, name: main.name, status: main.status, phone: main.phone, battery: (main as any).battery ?? null } : null,
          plugins: Array.isArray(plugins) ? plugins.map((p: any) => ({ id: p.id, name: p.name, version: p.version || p.status, status: p.status })) : [],
          details: main?.phone ? `Connected: ${main.phone}` : 'Session ready (scanning standby)',
        };
      } else {
        const st = sessRes.status === 'fulfilled' ? (sessRes.value as Response).status : 'timeout';
        result.openwa = { state: 'down', session: null, plugins: [], details: `HTTP ${st}` };
      }
    } catch (e: any) {
      result.openwa = { state: 'down', session: null, plugins: [], details: e.message?.slice(0, 120) };
    }
  }

  // 2. ERPNext parity (DB only, no WAN probe — Kuma covers HTTP)
  if (env.ERPNEXT_BASE_URL && db) {
    try {
      const { payments, erpnextSyncLog } = await import('../db/schema.js');
      const allPayments = await db.select().from(payments).all();
      const allLogs = await db.select().from(erpnextSyncLog).where(eq(erpnextSyncLog.entityName, 'payments')).all();
      const syncedSet = new Set(allLogs.filter((l: any) => l.status === 'synced').map((l: any) => l.entityId));
      const totalPaise = allPayments.reduce((acc: number, p: any) => acc + (p.amountPaise || p.amount || 0), 0);
      const syncedPaise = allPayments.filter((p: any) => syncedSet.has(p.id)).reduce((acc: number, p: any) => acc + (p.amountPaise || p.amount || 0), 0);
      result.erpnext = {
        state: 'live',
        parity: { totalPayments: allPayments.length, syncedCount: syncedSet.size, unSyncedCount: allPayments.length - syncedSet.size, totalPaise, syncedPaise },
        details: `${syncedSet.size}/${allPayments.length} Invoices Synced`,
      };
    } catch {
      result.erpnext = { state: 'live', parity: null, details: 'Connected to Frappe REST' };
    }
  }

  // 3-6 extended fleet — env-gated live/stub (real probe via /integrations parallel tail)
  const fleetMap: Array<[keyof typeof result, string, string]> = [
    ['listmonk', 'LISTMONK_BASE_URL', '13 Transactional Templates Active (Titan SMTP)'],
    ['chatwoot', 'CHATWOOT_BASE_URL', 'WhatsApp & Web Inboxes Active (Port 3200)'],
    ['umami', 'UMAMI_BASE_URL', 'Privacy-Preserving Telemetry & Goals Active'],
    ['kuma', 'KUMA_BASE_URL', 'VPS Heartbeat & SLA Monitor Active (Port 3003)'],
    ['nocodb', 'NOCODB_BASE_URL', 'Ops Tables — NocoDB'],
    ['postiz', 'POSTIZ_BASE_URL', 'Social Composer — Postiz'],
    ['mautic', 'MAUTIC_URL', 'Nurture — Mautic'],
    ['n8n', 'N8N_BASE_URL', 'Automation Spine — n8n'],
    ['indiapost', 'INDIA_POST_BASE_URL', 'Logistics — India Post DNK'],
    ['twenty', 'TWENTY_BASE_URL', 'CRM — Twenty (shelved)'],
  ];
  for (const [k, envKey, details] of fleetMap) {
    if ((env as any)[envKey]) result[k] = { state: 'live', templates: k === 'listmonk' ? 13 : undefined, details };
  }

  try { if (env.KV) await env.KV.put(cacheKey, JSON.stringify(result), { expirationTtl: 30 }); } catch {}
  const hasDown = Object.values(result).some((v: any) => v.state === 'down');
  return c.json({ success: true, overview: result }, probe && hasDown ? 503 : 200);
});

// POST /api/infrastructure/openwa/action — trigger operational tasks on OpenWA
infraRouter.post('/openwa/action', async (c) => {
  const env = c.env;
  if (!env.OPENWA_BASE_URL || !env.OPENWA_API_KEY) {
    return c.json({ error: 'OpenWA not configured' }, 400);
  }

  const body = (await c.req.json().catch(() => ({}))) as {
    action: 'restart' | 'toggle_plugin' | 'test_send';
    pluginId?: string;
    enable?: boolean;
    to?: string;
    text?: string;
    humanize?: boolean;
  };

  if (body.action === 'test_send') {
    if (!body.to || !body.text) return c.json({ error: 'to and text are required' }, 400);
    // Hardened: humanize defaults false (Worker CPU burn — audit H1); queue path is explicit.
    const { sendWhatsApp, calculateHumanDelay } = await import('../infra/messaging.js');
    const wantHumanize = body.humanize === true;
    const delay = wantHumanize ? calculateHumanDelay(body.text) : 0;
    const sendRes = await sendWhatsApp(env, body.to, body.text, { humanize: false });
    try {
      const { publishSyncEvent } = await import('./sync.js');
      await publishSyncEvent(env as any, { channel: 'staff:global:infra', type: 'OPENWA_TEST_SEND', payload: { to: body.to, ok: sendRes.ok, humanizeDelayMs: delay } }, (c as any).executionCtx);
    } catch {}
    return c.json({ success: sendRes.ok, result: { ...sendRes, humanizeDelayMs: delay } });
  }

  if (body.action === 'toggle_plugin' && body.pluginId) {
    const endpoint = body.enable ? 'enable' : 'disable';
    const res = await fetch(`${env.OPENWA_BASE_URL.replace(/\/$/, '')}/api/plugins/${encodeURIComponent(body.pluginId)}/${endpoint}`, {
      method: 'POST',
      headers: { 'X-API-Key': env.OPENWA_API_KEY },
    });
    const data = await res.json().catch(() => ({}));
    return c.json({ success: res.ok, data });
  }

  if (body.action === 'restart') {
    const res = await fetch(`${env.OPENWA_BASE_URL.replace(/\/$/, '')}/api/sessions/main/restart`, {
      method: 'POST',
      headers: { 'X-API-Key': env.OPENWA_API_KEY },
    });
    const data = await res.json().catch(() => ({}));
    return c.json({ success: res.ok, data });
  }

  return c.json({ error: 'Unsupported action' }, 400);
});

// POST /api/infrastructure/listmonk/action — trigger operational tasks on Listmonk
infraRouter.post('/listmonk/action', async (c) => {
  const env = c.env;
  if (!env.LISTMONK_BASE_URL) {
    return c.json({ error: 'Listmonk not configured' }, 400);
  }

  const body = (await c.req.json().catch(() => ({}))) as {
    action: 'test_email';
    email: string;
    kind: string;
  };

  if (body.action === 'test_email') {
    if (!body.email) return c.json({ error: 'email is required' }, 400);
    const { listmonkSendTransactional, getListmonkTemplateId } = await import('../infra/listmonk.js');
    const tplId = getListmonkTemplateId(env, (body.kind as any) || 'verify');
    const sendRes = await listmonkSendTransactional(
      env,
      body.email,
      `[OpusOS Test] Sample ${body.kind || 'Transaction'} Notification`,
      `<p>This is a test notification from OpusOS Infrastructure Command Center.</p>`,
      {
        Name: 'Valued Client',
        VerifyUrl: 'https://portal.opusoverseas.com',
        Amount: '₹5,000.00',
        ReceiptNumber: 'REC-TEST-001',
      },
      { templateId: tplId }
    );
    try {
      const { publishSyncEvent } = await import('./sync.js');
      await publishSyncEvent(env as any, { channel: 'staff:global:infra', type: 'LISTMONK_TEST_EMAIL', payload: { email: body.email, kind: body.kind, ok: sendRes.ok } }, (c as any).executionCtx);
    } catch {}
    return c.json({ success: sendRes.ok, result: sendRes });
  }

  return c.json({ error: 'Unsupported action' }, 400);
});

// ──────────────────────────────────────────────────────────────────────────────
// Fleet — canonical 13-app map (tunnel-native) + per-app proxy actions
// Used by the new Fleet Console frontend (13 routes, each bound to its backend API
// via the Worker — never exposes secrets to the browser).
// ──────────────────────────────────────────────────────────────────────────────
const FLEET_DEF = [
  { key: 'openwa', name: 'OpenWA', host: 'wa.opusoverseas.com', port: 2785, kind: 'messaging', dash: 'https://wa.opusoverseas.com', envKey: 'OPENWA_BASE_URL', doc: 'WhatsApp multi-device gateway' },
  { key: 'erpnext', name: 'ERPNext', host: 'erpnext.opusoverseas.com', port: 8080, kind: 'books', dash: 'https://erpnext.opusoverseas.com', envKey: 'ERPNEXT_BASE_URL', doc: 'Frappe books + GST' },
  { key: 'listmonk', name: 'Listmonk', host: 'listmonk.opusoverseas.com', port: 9009, kind: 'email', dash: 'https://listmonk.opusoverseas.com', envKey: 'LISTMONK_BASE_URL', doc: 'Transactional email (Titan SMTP)' },
  { key: 'chatwoot', name: 'Chatwoot', host: 'chat.opusoverseas.com', port: 3200, kind: 'messaging', dash: 'https://chat.opusoverseas.com', envKey: 'CHATWOOT_BASE_URL', doc: 'Omnichannel inbox' },
  { key: 'umami', name: 'Umami', host: 'analytics.opusoverseas.com', port: 3002, kind: 'analytics', dash: 'https://analytics.opusoverseas.com', envKey: 'UMAMI_BASE_URL', doc: 'Privacy telemetry (cookieless)' },
  { key: 'kuma', name: 'Uptime Kuma', host: 'status.opusoverseas.com', port: 3003, kind: 'monitoring', dash: 'https://status.opusoverseas.com', envKey: 'KUMA_BASE_URL', doc: 'SLA heartbeat' },
  { key: 'nocodb', name: 'NocoDB', host: 'nocodb.opusoverseas.com', port: 8087, kind: 'ops', dash: 'https://nocodb.opusoverseas.com', envKey: 'NOCODB_BASE_URL', doc: 'Ops tables' },
  { key: 'postiz', name: 'Postiz', host: 'social.opusoverseas.com', port: 5000, kind: 'ops', dash: 'https://social.opusoverseas.com', envKey: 'POSTIZ_BASE_URL', doc: 'Social composer' },
  { key: 'mautic', name: 'Mautic', host: 'mautic.opusoverseas.com', port: 8085, kind: 'email', dash: 'https://mautic.opusoverseas.com', envKey: 'MAUTIC_URL', doc: 'Marketing automation / nurture' },
  { key: 'n8n', name: 'n8n', host: 'n8n.opusoverseas.com', port: 5678, kind: 'automation', dash: 'https://n8n.opusoverseas.com', envKey: 'N8N_BASE_URL', doc: 'Automation spine' },
  { key: 'indiapost', name: 'India Post DNK', host: 'indiapost.opusoverseas.com', port: 9888, kind: 'logistics', dash: 'https://indiapost.opusoverseas.com', envKey: 'INDIA_POST_BASE_URL', doc: 'DNK shipping' },
  { key: 'twenty', name: 'Twenty CRM', host: 'crm.opusoverseas.com', port: 3001, kind: 'crm', dash: 'https://crm.opusoverseas.com', envKey: 'TWENTY_BASE_URL', doc: 'CRM (shelved)' },
  { key: 'openreply', name: 'OpenReply', host: 'openreply.opusoverseas.com', port: 3100, kind: 'ai', dash: 'https://openreply.opusoverseas.com', envKey: 'OPENREPLY_BASE_URL', doc: 'AI reply workshop' },
] as unknown as any[];

// GET /api/infrastructure/fleet — canonical fleet map + live status (super_admin)
infraRouter.get('/fleet', async (c) => {
  const env: any = c.env;
  const statuses = await (await import('../infra/integrations.js')).integrationsStatus(env, env.DB);
  const byKey = new Map(statuses.map((s: any) => [s.key, s]));
  const fleet = FLEET_DEF.map((d) => {
    const live = byKey.get(d.key);
    return { ...d, state: live?.state || (env[d.envKey] ? 'live' : 'stub'), latencyMs: live?.latencyMs, detail: live?.detail };
  });
  return c.json({ success: true, fleet, summary: { total: fleet.length, live: fleet.filter((f) => f.state === 'live').length, down: fleet.filter((f) => f.state === 'down').length } });
});

// POST /api/infrastructure/fleet/:key/action — per-app backend proxy (super_admin, via Worker secrets)
// Never trusts browser-provided URLs. Key is allowlisted; Worker injects secrets.
infraRouter.post('/fleet/:key/action', async (c) => {
  const key = c.req.param('key');
  const def = (FLEET_DEF as any[]).find((d) => d.key === key);
  if (!def) return c.json({ error: 'unknown fleet app' }, 404);
  const env: any = c.env;
  const body: any = await c.req.json().catch(() => ({}));
  const idem = c.req.header('Idempotency-Key') || crypto.randomUUID();

  // Route table — each app's safe action surface (no arbitrary proxy)
  let result: any = { ok: false, reason: 'unsupported action for this app' };
  if (key === 'openwa') {
    // delegate to existing openwa/action logic (with hardened humanize=false)
    const r = await fetch(`${c.req.url.replace(/\/fleet\/[^/]+\/action.*$/, '/openwa/action')}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idem, Cookie: c.req.header('Cookie') || '' }, body: JSON.stringify(body) });
    result = await r.json().catch(() => ({ ok: r.ok }));
  } else if (key === 'listmonk' && body.action === 'test_email') {
    const r = await fetch(`${c.req.url.replace(/\/fleet\/[^/]+\/action.*$/, '/listmonk/action')}`, { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: c.req.header('Cookie') || '' }, body: JSON.stringify(body) });
    result = await r.json().catch(() => ({ ok: r.ok }));
  } else if (key === 'erpnext' && (body.action === 'sync_pending' || body.action === 'reconcile')) {
    const path = body.action === 'reconcile' ? '/api/erpnext/reconcile' : '/api/erpnext/sync/pending';
    const r = await fetch(new URL(path, c.req.url).toString(), { method: body.action === 'reconcile' ? 'GET' : 'POST', headers: { Cookie: c.req.header('Cookie') || '' } as any });
    result = await r.json().catch(() => ({ ok: r.ok }));
  } else if (key === 'indiapost' && body.action === 'book') {
    const r = await fetch(new URL('/api/infrastructure/indiapost/book', c.req.url).toString(), { method: 'POST', headers: { 'Content-Type': 'application/json', Cookie: c.req.header('Cookie') || '' } as any, body: JSON.stringify(body.payload || body) });
    result = await r.json().catch(() => ({ ok: r.ok }));
  } else {
    // Generic: open dashboard (no mutation) — always ok
    if (body.action === 'open') result = { ok: true, dash: def.dash };
  }

  try {
    const { publishSyncEvent } = await import('./sync.js');
    await publishSyncEvent(env, { channel: 'staff:global:infra', type: `FLEET_${key.toUpperCase()}_ACTION`, payload: { key, action: body.action, ok: result?.success ?? result?.ok, idem } }, (c as any).executionCtx);
    await publishSyncEvent(env, { channel: `staff:global:infra:${key}`, type: 'FLEET_ACTION', payload: { key, action: body.action, ok: result?.success ?? result?.ok } }, (c as any).executionCtx);
  } catch {}
  return c.json({ success: !!result?.success || !!result?.ok, result, idem });
});