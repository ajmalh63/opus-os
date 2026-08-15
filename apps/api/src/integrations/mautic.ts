// Mautic adapter — informational read of the Mautic automation engine on the
// VPS (docker). OAuth2 client-credentials → campaign + contact + segment
// snapshots into the unified dashboard. No OS writes (operations live in
// Mautic; the OS guard layer is enforced via its webhooks when we wire the
// send-time contract later).
//
// Setup (once): Mautic → Settings → API Credentials → New client →
// grant "Client credentials" → copy Client ID/Secret into MAUTIC_* envs.

import type { ToolAdapter, ToolEnv, ToolFeedItem, ToolSnapshot } from './types.js';

interface MauticToken { access_token: string; expires_in: number; }

async function mauticToken(env: ToolEnv): Promise<{ token: string | null; reason?: string }> {
  if (!env.MAUTIC_URL || !env.MAUTIC_CLIENT_ID || !env.MAUTIC_CLIENT_SECRET) {
    return { token: null, reason: 'MAUTIC_URL / MAUTIC_CLIENT_ID / MAUTIC_CLIENT_SECRET not set' };
  }
  try {
    const res = await fetch(`${env.MAUTIC_URL}/oauth/v2/token`, {
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
    return { token: json.access_token };
  } catch (e: any) {
    return { token: null, reason: `request failed: ${e?.message || 'unknown'}` };
  }
}

export const mauticAdapter: ToolAdapter = {
  name: 'mautic',
  label: 'Mautic — automation engine',
  async snapshot(env: ToolEnv): Promise<ToolSnapshot> {
    const base = { tool: 'mautic', label: this.label, fetchedAt: Math.floor(Date.now() / 1000) };
    const { token, reason } = await mauticToken(env);
    if (!token) {
      return { ...base, status: { state: 'unconfigured', label: this.label, summary: reason || 'unconfigured' }, metrics: {}, items: [] };
    }
    try {
      const [camps, conts, segs] = await Promise.all([
        fetch(`${env.MAUTIC_URL}/api/campaigns?limit=10`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${env.MAUTIC_URL}/api/contacts?limit=1`, { headers: { Authorization: `Bearer ${token}` } }),
        fetch(`${env.MAUTIC_URL}/api/segments?limit=1`, { headers: { Authorization: `Bearer ${token}` } }),
      ]);
      const cj: any = await camps.json().catch(() => ({ total: null, campaigns: [] }));
      const oj: any = await conts.json().catch(() => ({ total: null }));
      const sj: any = await segs.json().catch(() => ({ total: null }));
      const items: ToolFeedItem[] = (cj.campaigns || []).map((c: any) => ({
        tool: 'mautic', kind: 'journey', id: String(c.id), title: c.name || `Campaign ${c.id}`,
        detail: `published: ${!!c.isPublished} · events: ${(c.events || []).length}`, at: Math.floor(Date.now() / 1000),
      }));
      return {
        ...base,
        status: { state: 'ok', label: this.label, summary: `${items.length} campaigns · ${oj.total ?? '?'} contacts` },
        metrics: { campaigns: items.length, contacts: oj.total ?? null, segments: sj.total ?? null },
        items,
      };
    } catch (e: any) {
      return { ...base, status: { state: 'error', label: this.label, summary: `fetch failed: ${e?.message || 'unknown'}` }, metrics: {}, items: [] };
    }
  },
};