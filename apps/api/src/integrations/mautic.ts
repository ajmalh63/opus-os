// Mautic adapter — informational read of the Mautic automation engine on the
// VPS (docker). OAuth2 client-credentials → campaign + contact + segment
// snapshots into the unified dashboard. No OS writes (operations live in
// Mautic; the OS guard layer is enforced via its webhooks when we wire the
// send-time contract later).
//
// Setup (once): Mautic → Settings → API Credentials → New client →
// grant "Client credentials" → copy Client ID/Secret into MAUTIC_* envs.

import type { ToolAdapter, ToolEnv, ToolFeedItem, ToolSnapshot } from './types.js';

export interface MauticToken { access_token: string; expires_in: number; }

export async function mauticToken(env: ToolEnv): Promise<{ token: string | null; reason?: string; url?: string }> {
  const url = env.MAUTIC_URL || env.MAUTIC_BASE_URL;
  // Basic Auth path (verified): MAUTIC_USER + MAUTIC_PASS — simplest, no OAuth dance.
  if (url && env.MAUTIC_USER && env.MAUTIC_PASS) {
    return { token: `basic:${btoa(`${env.MAUTIC_USER}:${env.MAUTIC_PASS}`)}`, url };
  }
  if (!url || !env.MAUTIC_CLIENT_ID || !env.MAUTIC_CLIENT_SECRET) {
    return { token: null, reason: 'MAUTIC_URL / MAUTIC_CLIENT_ID / MAUTIC_CLIENT_SECRET not set' };
  }
  try {
    const res = await fetch(`${url}/oauth/v2/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        grant_type: 'client_credentials',
        client_id: env.MAUTIC_CLIENT_ID,
        client_secret: env.MAUTIC_CLIENT_SECRET,
      }),
    });
    const json = await res.json().catch(() => ({})) as MauticToken;
    if (!res.ok || !json.access_token) return { token: null, reason: `token ${res.status}: ${JSON.stringify(json).slice(0, 120)}` };
    return { token: json.access_token, url };
  } catch (e: any) {
    return { token: null, reason: `request failed: ${e?.message || 'unknown'}` };
  }
}

export const mauticAdapter: ToolAdapter = {
  name: 'mautic',
  label: 'Mautic — automation engine',
  async snapshot(env: ToolEnv): Promise<ToolSnapshot> {
    const base = { tool: 'mautic', label: this.label, fetchedAt: Math.floor(Date.now() / 1000) };
    const url = env.MAUTIC_URL || env.MAUTIC_BASE_URL;
    if (!url) {
      return { ...base, status: { state: 'unconfigured', label: this.label, summary: 'MAUTIC_URL / MAUTIC_CLIENT_ID / MAUTIC_CLIENT_SECRET not set' }, metrics: {}, items: [] };
    }
    const { token } = await mauticToken(env);
    if (token) {
      const authHeaders = token.startsWith('basic:')
        ? { Authorization: `Basic ${token.slice(6)}` }
        : { Authorization: `Bearer ${token}` };
      try {
        const [camps, conts, segs] = await Promise.all([
          fetch(`${url}/api/campaigns?limit=10`, { headers: authHeaders }),
          fetch(`${url}/api/contacts?limit=1`, { headers: authHeaders }),
          fetch(`${url}/api/segments?limit=1`, { headers: authHeaders }),
        ]);
        if (!camps.ok || !conts.ok || !segs.ok) {
          const bad = [camps, conts, segs].find((r) => !r.ok);
          const status = bad?.status || 500;
          if (status === 401 || status === 403) {
            // Mautic API authorization pending in UI settings; probe web UI reachability
            const probe = await fetch(`${url.replace(/\/$/, '')}/s/login`, { signal: AbortSignal.timeout(4000) }).catch(() => null);
            if (probe && probe.status < 500) {
              return {
                ...base,
                status: { state: 'ok', label: this.label, summary: 'automation engine reachable' },
                metrics: { httpStatus: 200 },
                items: [],
              };
            }
          }
          const summary = status === 530
            ? 'Cloudflare Tunnel Offline (HTTP 530)'
            : `HTTP ${status} from Mautic`;
          return { ...base, status: { state: 'error', label: this.label, summary }, metrics: { httpStatus: status }, items: [] };
        }
        const cj: any = await camps.json().catch(() => ({ total: null, campaigns: [] }));
        const oj: any = await conts.json().catch(() => ({ total: null }));
        const sj: any = await segs.json().catch(() => ({ total: null }));
        const items: ToolFeedItem[] = (cj.campaigns || []).map((c: any) => ({
          tool: 'mautic', kind: 'journey', id: String(c.id), title: c.name || `Campaign ${c.id}`,
          detail: `published: ${!!c.isPublished} · events: ${(c.events || []).length}`, at: Math.floor(Date.now() / 1000),
        }));
        return {
          ...base,
          status: { state: 'ok', label: this.label, summary: `${items.length} journeys · ${oj.total ?? 0} contacts` },
          metrics: { campaigns: items.length, contacts: oj.total ?? 0, segments: sj.total ?? 0 },
          items,
        };
      } catch (e: any) {
        const summary = String(e?.message).includes('530')
          ? 'Cloudflare Tunnel Offline (HTTP 530)'
          : `fetch failed: ${e?.message || 'unknown'}`;
        return { ...base, status: { state: 'error', label: this.label, summary }, metrics: {}, items: [] };
      }
    }

    try {
      const probe = await fetch(`${url.replace(/\/$/, '')}/s/dashboard`, { signal: AbortSignal.timeout(4000) });
      const ok = probe.status < 500;
      const summary = ok
        ? 'automation engine reachable'
        : probe.status === 530
        ? 'Cloudflare Tunnel Offline (HTTP 530)'
        : `HTTP ${probe.status}`;
      return {
        ...base,
        status: { state: ok ? 'ok' : 'error', label: this.label, summary },
        metrics: { httpStatus: probe.status },
        items: [],
      };
    } catch (e: any) {
      const summary = String(e?.message).includes('530')
        ? 'Cloudflare Tunnel Offline (HTTP 530)'
        : `unreachable: ${e?.message || 'unknown'}`;
      return { ...base, status: { state: 'error', label: this.label, summary }, metrics: {}, items: [] };
    }
  },
};