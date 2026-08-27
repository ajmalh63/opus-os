// Unified integration registry (Wave 1): one source of truth for every
// external app OpusOS talks to. Each entry has a lightweight probe; the
// registry is exposed at /api/infrastructure/integrations (owner) and powers
// the infra panel + Kuma-style checks. State: stub (not configured) → live
// (probe ok) → down (probe failed).

export interface IntegrationStatus {
  key: string;
  name: string;
  kind: 'messaging' | 'email' | 'analytics' | 'books' | 'scheduling' | 'automation' | 'monitoring' | 'crm';
  state: 'stub' | 'live' | 'down';
  detail?: string;
  latencyMs?: number;
}

type Env = Record<string, any>;

async function probeHttp(url: string, opts: { auth?: string; timeoutMs?: number } = {}): Promise<{ ok: boolean; latencyMs?: number; status?: number; authFailed?: boolean }> {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      headers: opts.auth ? { Authorization: opts.auth } : {},
      signal: AbortSignal.timeout(opts.timeoutMs || 8000),
    });
    const authFailed = [401, 403].includes(res.status);
    // Do NOT mark 401/403 as live — surface auth failure to caller (audit H1/M1)
    const ok = res.ok || res.status === 405;
    return { ok, latencyMs: Date.now() - started, status: res.status, authFailed };
  } catch {
    return { ok: false, latencyMs: Date.now() - started };
  }
}

import { appSettings } from '../db/schema.js';
import { getDb } from '../db/client.js';

// Strict probe for cal.com cloud: 401 = INVALID API KEY (down), not "service
// up but unauthenticated" like the lenient probeHttp treats it.
async function probeCal(apiKey: string): Promise<{ ok: boolean; latencyMs?: number; status?: number }> {
  const started = Date.now();
  try {
    const res = await fetch('https://api.cal.com/v2/event-types?limit=1', {
      headers: { Authorization: `Bearer ${apiKey}`, 'cal-api-version': '2024-06-14', Accept: 'application/json' },
      signal: AbortSignal.timeout(4000),
    });
    return { ok: res.ok, latencyMs: Date.now() - started, status: res.status };
  } catch {
    return { ok: false, latencyMs: Date.now() - started };
  }
}

export async function integrationsStatus(env: Env, db?: any): Promise<IntegrationStatus[]> {
  const out: IntegrationStatus[] = [];
  const probes: Promise<IntegrationStatus>[] = [];

  // OpenWA (WhatsApp) — strict: 401 = auth fail, not live
  if (env.OPENWA_BASE_URL) {
    probes.push((async () => {
      const p = await probeHttp(`${env.OPENWA_BASE_URL.replace(/\/$/, '')}/api/health`, { auth: env.OPENWA_API_KEY ? `Bearer ${env.OPENWA_API_KEY}` : undefined });
      const detail = p.authFailed ? 'auth failed — check OPENWA_API_KEY' : undefined;
      return { key: 'openwa', name: 'OpenWA (WhatsApp)', kind: 'messaging' as any, state: (p.ok ? 'live' : 'down') as any, latencyMs: p.latencyMs, detail, ...(p.authFailed ? { status: p.status } as any : {}) };
    })());
  } else {
    probes.push(Promise.resolve({ key: 'openwa', name: 'OpenWA (WhatsApp)', kind: 'messaging' as any, state: 'stub' as any, detail: 'not configured' }));
  }

  // Chatwoot (inbox)
  if (env.CHATWOOT_BASE_URL) {
    probes.push(probeHttp(`${env.CHATWOOT_BASE_URL.replace(/\/$/, '')}/health`).then((p) => ({ key: 'chatwoot', name: 'Chatwoot (Inbox)', kind: 'messaging' as any, state: (p.ok ? 'live' : 'down') as any, latencyMs: p.latencyMs })));
  } else {
    probes.push(Promise.resolve({ key: 'chatwoot', name: 'Chatwoot (Inbox)', kind: 'messaging' as any, state: 'stub' as any }));
  }

  // Cal.com cloud (bookings) — status comes from the ACTUAL integration config
  // (D1 app_settings: cal_api_key / cal_webhook_secret / cal_event_types), not
  // a legacy self-hosted URL probe. Config is set in Consultations → Cal.com
  // Configuration (super_admin/manager).
  let calApiKey = '', calWebhookSecret = '', calEventTypes: Record<string, string> = {};
  if (db) {
    try {
      // db may be the raw D1 binding (no .select) or a drizzle wrapper — normalize.
      const client = (db as any).select ? db : getDb(db as any);
      const rows = await client.select().from(appSettings).all();
      const get = (k: string) => rows.find((r: any) => r.key === k)?.value || '';
      calApiKey = get('cal_api_key');
      calWebhookSecret = get('cal_webhook_secret');
      try { calEventTypes = get('cal_event_types') ? JSON.parse(get('cal_event_types')) : {}; } catch { calEventTypes = {}; }
    } catch { /* keep defaults */ }
  }
  // Cal.com — sequential (needs DB rows first)
  if (calApiKey) {
    const p = await probeCal(calApiKey);
    const mapped = Object.keys(calEventTypes).length;
    out.push({
      key: 'calcom', name: 'Cal.com (Bookings)', kind: 'scheduling',
      state: p.ok ? 'live' : 'down', latencyMs: p.latencyMs,
      detail: p.ok
        ? `${mapped} event type(s) mapped · webhook secret ${calWebhookSecret ? 'set' : 'MISSING (dev mode)'}`
        : p.status === 401 || p.status === 403 ? 'API key rejected by cal.com (invalid/expired)' : 'cal.com API unreachable',
    });
  } else if (env.CAL_BASE_URL) {
    const p = await probeHttp(`${env.CAL_BASE_URL.replace(/\/$/, '')}/`);
    out.push({ key: 'calcom', name: 'Cal.com (Bookings)', kind: 'scheduling', state: p.ok ? 'live' : 'down', latencyMs: p.latencyMs, detail: 'legacy self-hosted probe — set cal_api_key for cloud status' });
  } else {
    out.push({ key: 'calcom', name: 'Cal.com (Bookings)', kind: 'scheduling', state: 'stub', detail: 'API key not set — Consultations → Cal.com Configuration' });
  }

  // Collect already-awaited (chatwoot/openwa issued above, cal done) — now parallelize remaining 7
  const first = await Promise.all(probes);
  out.push(...first);

  const tail = await Promise.all([
    env.ERPNEXT_BASE_URL ? probeHttp(`${env.ERPNEXT_BASE_URL.replace(/\/$/, '')}/api/method/ping`, { auth: env.ERPNEXT_API_KEY ? `token ${env.ERPNEXT_API_KEY}:${env.ERPNEXT_API_SECRET}` : undefined }).then((p) => ({ key:'erpnext', name:'ERPNext (Books)', kind:'books' as any, state:(p.ok?'live':'down') as any, latencyMs:p.latencyMs, detail: p.authFailed ? 'auth failed — check ERPNEXT_API_KEY' : undefined })) : Promise.resolve({ key:'erpnext', name:'ERPNext (Books)', kind:'books' as any, state:'stub' as any }),
    env.LISTMONK_BASE_URL ? probeHttp(`${env.LISTMONK_BASE_URL.replace(/\/$/, '')}/subscription/form`).then((p)=> ({key:'listmonk', name:'Listmonk (Email)', kind:'email' as any, state:(p.ok?'live':'down') as any, latencyMs:p.latencyMs})) : Promise.resolve({key:'listmonk', name:'Listmonk (Email)', kind:'email' as any, state:'stub' as any}),
    env.UMAMI_BASE_URL ? probeHttp(`${env.UMAMI_BASE_URL.replace(/\/$/, '')}/`).then((p)=> ({key:'umami', name:'Umami (Analytics)', kind:'analytics' as any, state:(p.ok?'live':'down') as any, latencyMs:p.latencyMs})) : Promise.resolve({key:'umami', name:'Umami (Analytics)', kind:'analytics' as any, state:'stub' as any}),
    env.N8N_BASE_URL ? probeHttp(`${env.N8N_BASE_URL.replace(/\/$/, '')}/healthz`).then((p)=> ({key:'n8n', name:'n8n (Automation)', kind:'automation' as any, state:(p.ok?'live':'down') as any, latencyMs:p.latencyMs})) : Promise.resolve({key:'n8n', name:'n8n (Automation)', kind:'automation' as any, state:'stub' as any}),
    env.KUMA_BASE_URL ? probeHttp(`${env.KUMA_BASE_URL.replace(/\/$/, '')}/`).then((p)=> ({key:'kuma', name:'Uptime Kuma (Monitoring)', kind:'monitoring' as any, state:(p.ok?'live':'down') as any, latencyMs:p.latencyMs})) : Promise.resolve({key:'kuma', name:'Uptime Kuma (Monitoring)', kind:'monitoring' as any, state:'stub' as any}),
    env.TWENTY_BASE_URL ? probeHttp(`${env.TWENTY_BASE_URL.replace(/\/$/, '')}/`).then((p)=> ({key:'twenty', name:'Twenty (CRM — shelved)', kind:'crm' as any, state:(p.ok?'live':'down') as any, latencyMs:p.latencyMs})) : Promise.resolve({key:'twenty', name:'Twenty (CRM — shelved)', kind:'crm' as any, state:'stub' as any}),
    // Extended fleet (tunnel-native, not in original registry — added 2026-08-26 audit)
    env.NOCODB_BASE_URL ? probeHttp(`${env.NOCODB_BASE_URL.replace(/\/$/, '')}/`).then((p)=> ({key:'nocodb', name:'NocoDB (Ops Tables)', kind:'automation' as any, state:(p.ok?'live':'down') as any, latencyMs:p.latencyMs})) : Promise.resolve({key:'nocodb', name:'NocoDB (Ops Tables)', kind:'automation' as any, state:'stub' as any}),
    env.POSTIZ_BASE_URL ? probeHttp(`${env.POSTIZ_BASE_URL.replace(/\/$/, '')}/`).then((p)=> ({key:'postiz', name:'Postiz (Social Composer)', kind:'automation' as any, state:(p.ok?'live':'down') as any, latencyMs:p.latencyMs})) : Promise.resolve({key:'postiz', name:'Postiz (Social Composer)', kind:'automation' as any, state:'stub' as any}),
    env.MAUTIC_URL ? probeHttp(`${env.MAUTIC_URL.replace(/\/$/, '')}/`).then((p)=> ({key:'mautic', name:'Mautic (Nurture)', kind:'email' as any, state:(p.ok?'live':'down') as any, latencyMs:p.latencyMs})) : Promise.resolve({key:'mautic', name:'Mautic (Nurture)', kind:'email' as any, state:'stub' as any}),
    env.INDIA_POST_BASE_URL ? probeHttp(`${env.INDIA_POST_BASE_URL.replace(/\/$/, '')}/health`).then((p)=> ({key:'indiapost', name:'India Post DNK (Logistics)', kind:'automation' as any, state:(p.ok?'live':'down') as any, latencyMs:p.latencyMs})) : Promise.resolve({key:'indiapost', name:'India Post DNK (Logistics)', kind:'automation' as any, state:'stub' as any}),
  ]);
  out.push(...(tail as any[]));

  return out;
}

// Export the currently-configured subset (for Uptime Kuma + infra panel).
export function configuredKeys(env: Env): string[] {
  return [
    env.OPENWA_BASE_URL && 'openwa',
    env.CHATWOOT_BASE_URL && 'chatwoot',
    'calcom',
    env.ERPNEXT_BASE_URL && 'erpnext',
    env.LISTMONK_BASE_URL && 'listmonk',
    env.UMAMI_BASE_URL && 'umami',
    env.N8N_BASE_URL && 'n8n',
    env.KUMA_BASE_URL && 'kuma',
    env.TWENTY_BASE_URL && 'twenty',
  ].filter(Boolean) as string[];
}