// Chatwoot & OpenWA — read feeds (near-real-time pull). Both tools run on the
// VPS; status is informational until their read endpoints are exercised.
// Chatwoot: REST API with account scoped conversations/agent-less reads.
// OpenWA: nightly uploads via REST (files API) — represented as status only.

import type { ToolAdapter, ToolEnv, ToolSnapshot } from './types.js';

export const chatwootAdapter: ToolAdapter = {
  name: 'chatwoot',
  label: 'Chatwoot — unified inbox',
  async snapshot(env: ToolEnv): Promise<ToolSnapshot> {
    const base = { tool: 'chatwoot', label: this.label, fetchedAt: Math.floor(Date.now() / 1000) };
    if (!env.CHATWOOT_BASE_URL && !env.CHATWOOT_BASE_URL) {
      return { ...base, status: { state: 'unconfigured', label: this.label, summary: 'CHATWOOT_BASE_URL / CHATWOOT_API_TOKEN not set' }, metrics: {}, items: [] };
    }
    try {
      const url = (env.CHATWOOT_BASE_URL || env.CHATWOOT_BASE_URL)!;
      const res = await fetch(`${url}/api/v1/accounts/:account_id/conversations?page=1`, {
        headers: { api_access_token: env.CHATWOOT_API_TOKEN || '' },
      }).catch(() => null);
      if (!res) throw new Error('fetch failed');
      const json: any = await res.json().catch(() => ({}));
      const convs = Array.isArray(json?.payload || json?.conversations) ? (json.payload || json.conversations) : [];
      return {
        ...base,
        status: { state: 'ok', label: this.label, summary: `${convs.length} recent conversations` },
        metrics: { conversations: convs.length },
        items: convs.slice(0, 10).map((c: any) => ({
          tool: 'chatwoot', kind: 'conversation', id: String(c.id || '?'),
          title: (c.messages || []).map((m: any) => m.content).filter(Boolean).join(' ').slice(0, 60) || 'conversation',
          detail: `status: ${c.status || 'unknown'}`, at: Math.floor(Date.now() / 1000),
        })),
      };
    } catch (e: any) {
      return { ...base, status: { state: 'error', label: this.label, summary: `fetch failed: ${e?.message || 'unknown'}` }, metrics: {}, items: [] };
    }
  },
};

export const openwaAdapter: ToolAdapter = {
  name: 'openwa',
  label: 'OpenWA — WhatsApp gateway',
  async snapshot(env: ToolEnv): Promise<ToolSnapshot> {
    const base = { tool: 'openwa', label: this.label, fetchedAt: Math.floor(Date.now() / 1000) };
    const url = env.OPENWA_BASE_URL || env.OPENWA_API_URL;
    if (!url) {
      return { ...base, status: { state: 'unconfigured', label: this.label, summary: 'OPENWA_API_URL not set — production lane = Meta Cloud API later' }, metrics: {}, items: [] };
    }
    try {
      const res = await fetch(`${url.replace(/\/$/, '')}/api/health`, { signal: AbortSignal.timeout(4000) });
      const ok = res.ok;
      return {
        ...base,
        status: { state: ok ? 'ok' : 'error', label: this.label, summary: ok ? 'gateway reachable' : `HTTP ${res.status}` },
        metrics: { httpStatus: res.status }, items: [],
      };
    } catch (e: any) {
      return { ...base, status: { state: 'error', label: this.label, summary: `unreachable: ${e?.message || 'unknown'}` }, metrics: {}, items: [] };
    }
  },
};
