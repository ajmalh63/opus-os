// Listmonk adapter — reference implementation of the Tool-First contract.
// READ: campaign list + subscriber/bounce counts + recent deliveries from our
// own webhook_events log (the A-3 store is the normalized event feed).
// The guard (consent+suppression verdict before send) stays in the OS lane —
// the existing /api/webhooks/listmonk consumer + nurture lane already enforce it.

import type { ToolAdapter, ToolEnv, ToolFeedItem, ToolSnapshot } from './types.js';

const DAY = 86400;

async function listmonkAuth(env: ToolEnv): Promise<string | null> {
  if (!env.LISTMONK_BASE_URL || !env.LISTMONK_API_USER || !env.LISTMONK_API_PASS) return null;
  return 'Basic ' + btoa(`${env.LISTMONK_API_USER}:${env.LISTMONK_API_PASS}`);
}

export const listmonkAdapter: ToolAdapter = {
  name: 'listmonk',
  label: 'Listmonk — email engine',
  async snapshot(env: ToolEnv): Promise<ToolSnapshot> {
    const base = { tool: 'listmonk', label: this.label, fetchedAt: Math.floor(Date.now() / 1000) };
    if (!env.LISTMONK_BASE_URL) {
      return { ...base, status: { state: 'unconfigured', label: this.label, summary: 'LISTMONK_* envs not set' }, metrics: {}, items: [] };
    }
    const url = env.LISTMONK_BASE_URL;
    const auth = await listmonkAuth(env);
    if (!auth) {
      try {
        const probe = await fetch(`${url.replace(/\/$/, '')}/`, { signal: AbortSignal.timeout(4000) });
        const ok = probe.status < 500;
        return {
          ...base,
          status: { state: ok ? 'ok' : 'error', label: this.label, summary: ok ? 'email engine reachable' : `HTTP ${probe.status}` },
          metrics: { httpStatus: probe.status },
          items: [],
        };
      } catch (e: any) {
        return { ...base, status: { state: 'error', label: this.label, summary: `fetch failed: ${e?.message || 'unknown'}` }, metrics: {}, items: [] };
      }
    }

    try {
      const [campRes, subRes, bncRes] = await Promise.all([
        fetch(`${url}/api/campaigns?page=1&per_page=8`, { headers: { Authorization: auth } }),
        fetch(`${url}/api/subscribers?page=1&per_page=1`, { headers: { Authorization: auth } }),
        fetch(`${url}/api/bounces?page=1&per_page=1`, { headers: { Authorization: auth } }),
      ]);
      if (!campRes.ok || !subRes.ok || !bncRes.ok) {
        const bad = [campRes, subRes, bncRes].find((r) => !r.ok);
        throw new Error(`fetch failed: HTTP ${bad?.status} from Listmonk`);
      }
      const camps: any = await campRes.json().catch(() => ({ data: [] }));
      const subs: any = await subRes.json().catch(() => ({ data: { total: null } }));
      const bnc: any = await bncRes.json().catch(() => ({ data: { total: null } }));
      const items: ToolFeedItem[] = (camps.data || []).map((c: any) => ({
        tool: 'listmonk', kind: 'campaign', id: String(c.id), title: c.name || `Campaign ${c.id}`,
        detail: `${c.status || 'unknown'} · sent ${c.sends || 0} · ${c.to_send ?? 0} queued`, at: c.updated_at || Math.floor(Date.now() / 1000),
      }));
      return {
        ...base,
        status: { state: 'ok', label: this.label, summary: `${items.length} campaigns · ${subs.data?.total ?? 0} subscribers` },
        metrics: { campaigns: items.length, subscribers: subs.data?.total ?? 0, bounces: bnc.data?.total ?? 0 },
        items,
      };
    } catch (e: any) {
      return { ...base, status: { state: 'error', label: this.label, summary: `fetch failed: ${e?.message || 'unknown'}` }, metrics: {}, items: [] };
    }
  },
};

// Recent Listmonk deliveries from the A-3 event log (near-real-time feed).
export async function listmonkRecentEvents(db: any, sinceSeconds: number = 7 * DAY): Promise<ToolFeedItem[]> {
  const rows = await db.select().from((await import('../db/schema.js')).webhookEvents).all().catch(() => []);
  const now = Math.floor(Date.now() / 1000);
  return rows
    .filter((r: any) => String(r.event || '').startsWith('listmonk.') && now - Number(r.receivedAt || 0) <= sinceSeconds)
    .sort((a: any, b: any) => Number(b.receivedAt || 0) - Number(a.receivedAt || 0))
    .slice(0, 20)
    .map((r: any) => ({
      tool: 'listmonk', kind: 'event', id: r.id, title: r.event || 'listmonk event',
      detail: `${r.detail || '—'} · ${r.entityId || ''}`, at: Number(r.receivedAt || 0),
    }));
}
