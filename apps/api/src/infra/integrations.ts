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

async function probeHttp(url: string, opts: { auth?: string; timeoutMs?: number } = {}): Promise<{ ok: boolean; latencyMs?: number; status?: number }> {
  const started = Date.now();
  try {
    const res = await fetch(url, {
      headers: opts.auth ? { Authorization: opts.auth } : {},
      signal: AbortSignal.timeout(opts.timeoutMs || 4000),
    });
    return { ok: res.ok || [401, 403, 405].includes(res.status), latencyMs: Date.now() - started, status: res.status };
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

  // OpenWA (WhatsApp)
  if (env.OPENWA_BASE_URL) {
    const p = await probeHttp(`${env.OPENWA_BASE_URL.replace(/\/$/, '')}/api/health`, { auth: env.OPENWA_API_KEY ? `Bearer ${env.OPENWA_API_KEY}` : undefined });
    out.push({ key: 'openwa', name: 'OpenWA (WhatsApp)', kind: 'messaging', state: p.ok ? 'live' : 'down', latencyMs: p.latencyMs });
  } else {
    out.push({ key: 'openwa', name: 'OpenWA (WhatsApp)', kind: 'messaging', state: 'stub', detail: 'not configured' });
  }

  // Chatwoot (inbox)
  if (env.CHATWOOT_BASE_URL) {
    const p = await probeHttp(`${env.CHATWOOT_BASE_URL.replace(/\/$/, '')}/health`);
    out.push({ key: 'chatwoot', name: 'Chatwoot (Inbox)', kind: 'messaging', state: p.ok ? 'live' : 'down', latencyMs: p.latencyMs });
  } else {
    out.push({ key: 'chatwoot', name: 'Chatwoot (Inbox)', kind: 'messaging', state: 'stub' });
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
    // Legacy self-hosted Cal.diy instance (tailnet) — kept only as a fallback probe
    const p = await probeHttp(`${env.CAL_BASE_URL.replace(/\/$/, '')}/`);
    out.push({ key: 'calcom', name: 'Cal.com (Bookings)', kind: 'scheduling', state: p.ok ? 'live' : 'down', latencyMs: p.latencyMs, detail: 'legacy self-hosted probe — set cal_api_key for cloud status' });
  } else {
    out.push({ key: 'calcom', name: 'Cal.com (Bookings)', kind: 'scheduling', state: 'stub', detail: 'API key not set — Consultations → Cal.com Configuration' });
  }

  // ERPNext (books)
  if (env.ERPNEXT_BASE_URL) {
    const p = await probeHttp(`${env.ERPNEXT_BASE_URL.replace(/\/$/, '')}/api/method/ping`, { auth: env.ERPNEXT_API_KEY ? `token ${env.ERPNEXT_API_KEY}:${env.ERPNEXT_API_SECRET}` : undefined });
    out.push({ key: 'erpnext', name: 'ERPNext (Books)', kind: 'books', state: p.ok ? 'live' : 'down', latencyMs: p.latencyMs });
  } else {
    out.push({ key: 'erpnext', name: 'ERPNext (Books)', kind: 'books', state: 'stub' });
  }

  // Listmonk (email)
  if (env.LISTMONK_BASE_URL) {
    const p = await probeHttp(`${env.LISTMONK_BASE_URL.replace(/\/$/, '')}/subscription/form`, {});
    out.push({ key: 'listmonk', name: 'Listmonk (Email)', kind: 'email', state: p.ok ? 'live' : 'down', latencyMs: p.latencyMs });
  } else {
    out.push({ key: 'listmonk', name: 'Listmonk (Email)', kind: 'email', state: 'stub' });
  }

  // Umami (analytics — frontend tracker; reachability probe only)
  if (env.UMAMI_BASE_URL) {
    const p = await probeHttp(`${env.UMAMI_BASE_URL.replace(/\/$/, '')}/`);
    out.push({ key: 'umami', name: 'Umami (Analytics)', kind: 'analytics', state: p.ok ? 'live' : 'down', latencyMs: p.latencyMs });
  } else {
    out.push({ key: 'umami', name: 'Umami (Analytics)', kind: 'analytics', state: 'stub' });
  }

  // n8n (automation)
  if (env.N8N_BASE_URL) {
    const p = await probeHttp(`${env.N8N_BASE_URL.replace(/\/$/, '')}/healthz`);
    out.push({ key: 'n8n', name: 'n8n (Automation)', kind: 'automation', state: p.ok ? 'live' : 'down', latencyMs: p.latencyMs });
  } else {
    out.push({ key: 'n8n', name: 'n8n (Automation)', kind: 'automation', state: 'stub' });
  }

  // Uptime Kuma (monitoring)
  if (env.KUMA_BASE_URL) {
    const p = await probeHttp(`${env.KUMA_BASE_URL.replace(/\/$/, '')}/`);
    out.push({ key: 'kuma', name: 'Uptime Kuma (Monitoring)', kind: 'monitoring', state: p.ok ? 'live' : 'down', latencyMs: p.latencyMs });
  } else {
    out.push({ key: 'kuma', name: 'Uptime Kuma (Monitoring)', kind: 'monitoring', state: 'stub' });
  }

  // Twenty (CRM — optional shelf)
  if (env.TWENTY_BASE_URL) {
    const p = await probeHttp(`${env.TWENTY_BASE_URL.replace(/\/$/, '')}/`);
    out.push({ key: 'twenty', name: 'Twenty (CRM — shelved)', kind: 'crm', state: p.ok ? 'live' : 'down', latencyMs: p.latencyMs });
  } else {
    out.push({ key: 'twenty', name: 'Twenty (CRM — shelved)', kind: 'crm', state: 'stub' });
  }

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