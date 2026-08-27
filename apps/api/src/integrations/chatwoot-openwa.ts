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
    const url = env.CHATWOOT_BASE_URL;
    if (!url || !env.CHATWOOT_API_TOKEN) {
      return { ...base, status: { state: 'unconfigured', label: this.label, summary: 'CHATWOOT_BASE_URL / CHATWOOT_API_TOKEN not set' }, metrics: {}, items: [] };
    }
    const accountId = env.CHATWOOT_ACCOUNT_ID || '1';
    try {
      const res = await fetch(`${url.replace(/\/$/, '')}/api/v1/accounts/${accountId}/conversations?page=1`, {
        headers: { api_access_token: env.CHATWOOT_API_TOKEN || '' },
        signal: AbortSignal.timeout(5000),
      }).catch(() => null);
      if (!res) throw new Error('connection timeout or refused');
      if (!res.ok) {
        const summary = res.status === 530
          ? 'Cloudflare Tunnel Offline (HTTP 530)'
          : res.status === 401 || res.status === 403
          ? `Auth Failed (${res.status})`
          : `HTTP ${res.status}`;
        return {
          ...base,
          status: { state: 'error', label: this.label, summary },
          metrics: { httpStatus: res.status },
          items: [],
        };
      }
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
      const summary = String(e?.message).includes('530')
        ? 'Cloudflare Tunnel Offline (HTTP 530)'
        : `fetch failed: ${e?.message || 'unknown'}`;
      return { ...base, status: { state: 'error', label: this.label, summary }, metrics: {}, items: [] };
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
      const summary = ok
        ? 'gateway reachable'
        : res.status === 530
        ? 'Cloudflare Tunnel Offline (HTTP 530)'
        : `HTTP ${res.status}`;
      return {
        ...base,
        status: { state: ok ? 'ok' : 'error', label: this.label, summary },
        metrics: { httpStatus: res.status }, items: [],
      };
    } catch (e: any) {
      const summary = String(e?.message).includes('530')
        ? 'Cloudflare Tunnel Offline (HTTP 530)'
        : `unreachable: ${e?.message || 'unknown'}`;
      return { ...base, status: { state: 'error', label: this.label, summary }, metrics: {}, items: [] };
    }
  },
};
