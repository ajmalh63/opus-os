import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);


interface ServiceRow {
  name: string;
  binding: string;
  up: boolean;
  status?: string | null;
  plan: string;
}

interface IntegrationRow {
  key: string;
  name: string;
  kind: string;
  state: 'stub' | 'live' | 'down';
  detail?: string;
  latencyMs?: number;
}

interface HealthReport {
  services: ServiceRow[];
  allUp: boolean;
}

const STATUS_LABEL: Record<string, string> = { ok: 'Healthy', degraded: 'Degraded', down: 'Down' };

// Live operational tile - glass surface, breathing status dot, GSAP pulse
// ring on the unhealthy one. Mirrors the homepage's live artifact language.
function ServiceTile({ s, i }: { s: ServiceRow; i: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!s.up || !ref.current) return;
    // gentle breathing halo on healthy tiles (GPU-safe: transform/opacity only)
    const ctx = gsap.context(() => {
      gsap.fromTo(ref.current!.querySelector('.tile-ring'),
        { scale: 0.9, opacity: 0.6 },
        { scale: 1.15, opacity: 0, duration: 2.2, repeat: -1, ease: 'power1.out', delay: i * 0.18 });
    }, ref);
    return () => ctx.revert();
  }, [s.up, i]);

  return (
    <div
      ref={ref}
      className={`relative overflow-hidden rounded-2xl border p-5 backdrop-blur transition-all duration-300 ${
        s.up
          ? 'border-emerald-500/40 bg-white shadow-[0_16px_40px_-20px_rgba(10,45,80,0.10)]'
          : 'border-rose-500/40 bg-rose-500/10 shadow-[0_16px_40px_-16px_rgba(10,45,80,0.10)]'
      }`}
    >
      <div className="tile-ring pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full border-2 border-emerald-400/40" aria-hidden="true" />
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[13px] font-bold text-brand-navy">{s.name}</div>
          <code className="mt-1 inline-block rounded bg-brand-navy/[0.05] px-1.5 py-0.5 font-mono text-[10px] text-brand-navy/50">{s.binding}</code>
        </div>
        <span className="relative mt-0.5 flex h-2.5 w-2.5 shrink-0">
          {s.up && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />}
          <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${s.up ? 'bg-emerald-500' : 'bg-rose-500'}`} />
        </span>
      </div>
      <div className="mt-4 flex items-baseline justify-between">
        <span className={`text-xs font-bold uppercase tracking-wider ${s.up ? 'text-emerald-700' : 'text-rose-700'}`}>
          {s.up ? (STATUS_LABEL[s.status || 'ok'] ?? 'Live') : 'Down'}
        </span>
        <span className="text-[10px] text-brand-navy/50">{s.plan}</span>
      </div>
    </div>
  );
}

export default function InfraHealth() {
  const rootRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, isError, refetch } = useQuery<HealthReport>({
    queryKey: ['infraHealth'],
    queryFn: async () => {
      const r = await fetch('/api/infrastructure/health', { credentials: 'include' });
      const json = await r.json().catch(() => null);
      if (json && Array.isArray(json.services)) {
        return json;
      }
      if (!r.ok) throw new Error('infra');
      return json;
    },
    refetchInterval: 30_000, // live artifact: auto-refresh 30s
  });

  // Wave 1: one panel for every external integration (stub/live/down + latency)
  const { data: intData } = useQuery<{ integrations: IntegrationRow[]; summary: { live: number; down: number; stub: number; total: number } }>({
    queryKey: ['infraIntegrations'],
    queryFn: async () => {
      const r = await fetch('/api/infrastructure/integrations', { credentials: 'include' });
      if (!r.ok) throw new Error('integrations');
      return r.json();
    },
    refetchInterval: 60_000,
  });

  useEffect(() => {
    if (!data) return;
    const ctx = gsap.context(() => {
      gsap.from('.tile-in', { y: 24, opacity: 0, duration: 0.6, stagger: 0.08, ease: 'power3.out' });
      ScrollTrigger.refresh();
    }, rootRef);
    return () => ctx.revert();
  }, [data]);

  const services = data?.services || [];
  const upCount = services.filter((s) => s.up).length;

  return (
    <div ref={rootRef} className="min-h-full space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="gold-dot" />
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-gold">Systems</p>
          </div>
          <h1 className="mt-1 font-display text-2xl font-extrabold tracking-tight text-brand-navy">Infrastructure Health</h1>
          <p className="mt-1 text-sm text-brand-navy/40">Live status of every Cloudflare backend OpusOS depends on. Refreshes every 30s.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-bold ${data?.allUp ? 'bg-emerald-500/10 text-emerald-700' : 'bg-rose-500/10 text-rose-700'}`}>
            <span className={`h-2 w-2 animate-pulse rounded-full ${data?.allUp ? 'bg-emerald-500' : 'bg-rose-500'}`} />
            {data ? (data.allUp ? 'All systems operational' : `${upCount}/${services.length} up`) : 'Probing...'}
          </span>
          <button
            onClick={() => refetch()}
            className="cursor-pointer rounded-full border border-brand-navy/15 bg-brand-navy/[0.04] px-3 py-1.5 text-[11px] font-semibold text-brand-navy/70 transition-all hover:border-brand-gold/50 hover:text-brand-gold active:scale-[0.98]"
          >
            Refresh
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl border border-brand-navy/10 bg-brand-navy/[0.05]" />
          ))}
        </div>
      )}

      {isError && (
        <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-6 text-sm text-rose-700">
          Failed to reach the health probe — check that the API is running and you have owner access.
        </div>
      )}

      {!isLoading && !isError && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {services.map((s, i) => (
            <div key={s.binding} className="tile-in">
              <ServiceTile s={s} i={i} />
            </div>
          ))}
        </div>
      )}

      {/* Wave 1: external integrations panel (stub → live → down) */}
      {intData && (
        <section className="rounded-2xl border border-brand-navy/10 bg-white p-6 shadow-[0_20px_40px_-20px_rgba(10,45,80,0.10)]">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-sm font-bold text-brand-navy">External Integrations</h3>
              <p className="mt-0.5 text-[10px] text-brand-navy/40">Every app OpusOS talks to — probe status + latency. Stub = credentials not yet configured.</p>
            </div>
            <div className="flex gap-2 text-[10px] font-bold">
              <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-emerald-700">{intData.summary.live} live</span>
              <span className="rounded-full bg-rose-500/10 px-2.5 py-1 text-rose-700">{intData.summary.down} down</span>
              <span className="rounded-full bg-brand-navy/[0.06] px-2.5 py-1 text-brand-navy/50">{intData.summary.stub} stub</span>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
            {intData.integrations.map((it) => {
              const badge = it.state === 'live' ? 'bg-emerald-500/15 text-emerald-700'
                : it.state === 'down' ? 'bg-rose-500/15 text-rose-700'
                : 'bg-brand-navy/[0.06] text-brand-navy/50';
              const dot = it.state === 'live' ? 'bg-emerald-500' : it.state === 'down' ? 'bg-rose-500' : 'bg-white/30';
              return (
                <div key={it.key} className="flex items-center justify-between rounded-xl border border-brand-navy/10 bg-brand-navy/[0.04] px-3.5 py-2.5 text-xs">
                  <span className="flex items-center gap-2 font-semibold text-brand-navy">
                    <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
                    {it.name}
                  </span>
                  <span className="flex items-center gap-2">
                    {it.latencyMs != null && <span className="font-mono text-[9px] text-brand-navy/50">{it.latencyMs}ms</span>}
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${badge}`}>{it.state}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* Ops note */}
      <div className="rounded-2xl border border-brand-navy/10 bg-brand-navy/[0.04] p-4 text-[11px] leading-relaxed text-brand-navy/50 backdrop-blur">
        Uptime and alerting for these services are mirrored into Uptime Kuma on the VPS once the tailnet monitor is wired.
        Schedules, backup and dispatch jobs use the automation lane (<code className="font-mono text-brand-gold">/api/automation</code>).
      </div>
    </div>
  );
}