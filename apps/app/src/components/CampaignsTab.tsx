import { useQuery } from '@tanstack/react-query';
import { useRevealRoot } from '../lib/reveal';

// Campaigns — INFORMATIONAL dashboard (Tool-First strategy, Wave 3).
// Operations live in best-of-breed tools (Listmonk email, Mautic journeys,
// Chatwoot conversations, OpenWA WhatsApp). The OS is the FACE: unified
// status cards + near-real-time event feed + legacy OS-defined catalog.
// No create/edit here — definitions happen in the tools.

interface ToolStatus { state: 'ok' | 'unconfigured' | 'error'; label: string; summary: string }
interface ToolSnapshot {
  tool: string; label: string; status: ToolStatus; fetchedAt: number;
  metrics: Record<string, number | string | null>;
  items: { tool: string; kind: string; id: string; title: string; detail: string | null; at: number }[];
}
interface LiveData {
  tools: ToolSnapshot[];
  feed: { tool: string; kind: string; id: string; title: string; detail: string | null; at: number }[];
}

const STATE_STYLE: Record<string, string> = {
  ok: 'bg-emerald-500/15 text-emerald-700',
  unconfigured: 'bg-brand-navy/[0.06] text-brand-navy/50',
  error: 'bg-rose-500/15 text-rose-700',
};
const KIND_STYLE: Record<string, string> = {
  campaign: 'bg-brand-gold/15 text-brand-gold',
  journey: 'bg-violet-900/60 text-violet-200',
  conversation: 'bg-emerald-900/60 text-emerald-700',
  event: 'bg-slate-500/15 text-brand-navy/50',
};
const STATE_LABEL: Record<string, string> = { ok: 'Connected', unconfigured: 'Not configured', error: 'Error' };

function relTime(at: number) {
  const s = Math.floor(Date.now() / 1000) - at;
  if (s < 90) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function CampaignsTab() {
  const rootRef = useRevealRoot<HTMLDivElement>();
  const { data: live, isLoading, isError } = useQuery<LiveData>({
    queryKey: ['integrationsLive'],
    queryFn: async () => {
      const r = await fetch('/api/integrations/live');
      if (!r.ok) throw new Error('integrations');
      return r.json();
    },
  });
  const { data: catalog } = useQuery<{ campaigns: any[] }>({
    queryKey: ['adminCampaignsRead'],
    queryFn: async () => {
      const r = await fetch('/api/admin/campaigns');
      if (!r.ok) throw new Error('catalog');
      return r.json();
    },
  });

  if (isLoading) return <div className="p-12 text-center text-xs text-brand-navy/40">Loading tool feeds…</div>;
  if (isError || !live) {
    return <div className="p-12 text-center text-xs text-rose-600 bg-rose-50 border border-rose-200/50 rounded-lg">Failed to load integrations. Manager+ session required.</div>;
  }

  return (
    <div ref={rootRef} className="space-y-6 p-6">
      <div>
        <div className="flex items-center gap-2.5">
          <span className="gold-dot" />
          <h2 className="font-display text-base font-extrabold text-brand-navy">Campaigns — tool-first control board</h2>
        </div>
        <p className="text-[11px] text-brand-navy/40">Operations run in the connected tools (Listmonk · Mautic · Chatwoot · OpenWA). This board is informational: live status, metrics and a near-real-time event feed.</p>
      </div>

      {/* Tool status cards */}
      <section className="reveal grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {live.tools.map((t) => (
          <div key={t.tool} className={`rounded-2xl border p-4 shadow-[0_16px_30px_-18px_rgba(10,45,80,0.10)] transition-all duration-300 ${t.status.state === 'ok' ? 'border-emerald-500/30 bg-white hover:border-emerald-400/50' : t.status.state === 'error' ? 'border-rose-500/30 bg-white hover:border-rose-400/50' : 'border-brand-navy/10 bg-white hover:border-brand-gold/40'}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-display text-sm font-extrabold text-brand-navy">{t.label}</span>
              <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${STATE_STYLE[t.status.state] || STATE_STYLE.unconfigured}`}>
                {STATE_LABEL[t.status.state] || t.status.state}
              </span>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-brand-navy/40">{t.status.summary}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {Object.entries(t.metrics).map(([k, v]) => (
                <span key={k} className="rounded bg-brand-navy/[0.05] px-1.5 py-0.5 font-mono text-[10px] text-brand-navy/40">{k}: {v ?? '—'}</span>
              ))}
            </div>
            <div className="mt-2.5 space-y-1">
              {t.items.slice(0, 3).map((i) => (
                <div key={`${i.kind}-${i.id}`} className="flex items-center gap-1.5 text-[10px]">
                  <span className={`rounded px-1 py-0.5 font-bold uppercase ${KIND_STYLE[i.kind] || KIND_STYLE.event}`}>{i.kind}</span>
                  <span className="truncate text-brand-navy/40">{i.title}</span>
                </div>
              ))}
              {t.items.length === 0 && <div className="text-[10px] text-brand-navy/50">No items reported.</div>}
            </div>
          </div>
        ))}
      </section>

      <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        {/* Live feed */}
        <section className="reveal xl:col-span-2 rounded-2xl border border-brand-navy/10 bg-white p-4 shadow-[0_20px_40px_-15px_rgba(10,45,80,0.10)]">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-gold">Live event feed · {live.feed.length} items</div>
          <div className="mt-3 max-h-[26rem] space-y-1 overflow-y-auto pr-1">
            {live.feed.map((f) => (
              <div key={`${f.tool}-${f.kind}-${f.id}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] hover:bg-brand-gold/5">
                <span className={`w-16 shrink-0 rounded px-1 py-0.5 text-center font-bold uppercase ${STATE_STYLE.ok}`}>{f.tool}</span>
                <span className={`shrink-0 rounded px-1 py-0.5 font-bold uppercase ${KIND_STYLE[f.kind] || KIND_STYLE.event}`}>{f.kind}</span>
                <span className="min-w-0 flex-1 truncate text-brand-navy/70">{f.title}</span>
                {f.detail && <span className="hidden truncate text-[10px] text-brand-navy/50 md:block md:max-w-[16rem]">{f.detail}</span>}
                <span className="shrink-0 text-[10px] text-brand-navy/50">{relTime(f.at)}</span>
              </div>
            ))}
            {live.feed.length === 0 && <div className="py-8 text-center text-[11px] text-brand-navy/50">No tool events yet — connect a tool and deliveries will appear here.</div>}
          </div>
        </section>

        {/* Legacy OS-defined catalog (read-only) */}
        <section className="reveal rounded-2xl border border-brand-navy/10 bg-white p-4 shadow-[0_20px_40px_-15px_rgba(10,45,80,0.10)]">
          <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-gold">OS-defined journeys · {catalog?.campaigns?.length || 0}</div>
          <div className="mt-3 space-y-2">
            {(catalog?.campaigns || []).map((c: any) => (
              <div key={c.id} className="rounded-lg border border-brand-navy/10 px-2.5 py-2">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-[11px] font-semibold text-brand-navy">{c.name || c.key}</span>
                  <span className={`rounded px-1 py-0.5 text-[9px] font-bold uppercase ${STATE_STYLE[c.status === 'active' ? 'ok' : 'unconfigured']}`}>{c.status}</span>
                </div>
                <div className="mt-0.5 text-[10px] text-brand-navy/40">{c.division} · {c.touches?.length || 0} nodes</div>
              </div>
            ))}
            {(!catalog?.campaigns || catalog.campaigns.length === 0) && (
              <div className="py-6 text-center text-[11px] text-brand-navy/50">Catalog empty — journeys are defined in Mautic/Listmonk.</div>
            )}
          </div>
          <p className="mt-3 text-[10px] leading-relaxed text-brand-navy/50">Read-only legacy surface. New journeys: create in Mautic (automation) / Listmonk (email) — they surface here automatically via adapters.</p>
        </section>
      </div>
    </div>
  );
}