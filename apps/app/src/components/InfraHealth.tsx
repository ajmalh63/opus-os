import { useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const AUTH = {
  get Cookie() {
    const s = document.cookie.split(';').map((p: string) => p.trim()).find((p: string) => p.startsWith('better-auth.session_token='));
    return s || '';
  }
} as Record<string, string>;

interface ServiceRow {
  name: string;
  binding: string;
  up: boolean;
  status?: string | null;
  plan: string;
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
          ? 'border-emerald-200/70 bg-white/80 shadow-[0_16px_40px_-20px_rgba(10,90,50,0.14)]'
          : 'border-rose-300/70 bg-rose-50/80 shadow-[0_16px_40px_-16px_rgba(190,40,40,0.16)]'
      }`}
    >
      <div className="tile-ring pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full border-2 border-emerald-400/40" aria-hidden="true" />
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[13px] font-bold text-brand-navy">{s.name}</div>
          <code className="mt-1 inline-block rounded bg-brand-navy/5 px-1.5 py-0.5 font-mono text-[10px] text-slate-500">{s.binding}</code>
        </div>
        <span className="relative mt-0.5 flex h-2.5 w-2.5 shrink-0">
          {s.up && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />}
          <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${s.up ? 'bg-emerald-500' : 'bg-rose-500'}`} />
        </span>
      </div>
      <div className="mt-4 flex items-baseline justify-between">
        <span className={`text-xs font-bold uppercase tracking-wider ${s.up ? 'text-emerald-700' : 'text-rose-600'}`}>
          {s.up ? (STATUS_LABEL[s.status || 'ok'] ?? 'Live') : 'Down'}
        </span>
        <span className="text-[10px] text-slate-400">{s.plan}</span>
      </div>
    </div>
  );
}

export default function InfraHealth() {
  const rootRef = useRef<HTMLDivElement>(null);

  const { data, isLoading, isError, refetch } = useQuery<HealthReport>({
    queryKey: ['infraHealth'],
    queryFn: async () => {
      const r = await fetch('/api/infrastructure/health', { headers: AUTH });
      if (!r.ok) throw new Error('infra');
      return r.json();
    },
    refetchInterval: 30_000, // live artifact: auto-refresh 30s
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
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-gold">Systems</p>
          <h1 className="mt-1 font-display text-2xl font-extrabold tracking-tight text-brand-navy">Infrastructure Health</h1>
          <p className="mt-1 text-sm text-slate-500">Live status of every Cloudflare backend OpusOS depends on. Refreshes every 30s.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-[11px] font-bold ${data?.allUp ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
            <span className={`h-2 w-2 animate-pulse rounded-full ${data?.allUp ? 'bg-emerald-500' : 'bg-rose-500'}`} />
            {data ? (data.allUp ? 'All systems operational' : `${upCount}/${services.length} up`) : 'Probing...'}
          </span>
          <button
            onClick={() => refetch()}
            className="cursor-pointer rounded-full border border-brand-navy/15 px-3 py-1.5 text-[11px] font-semibold text-brand-navy transition-all hover:border-brand-gold hover:text-brand-gold active:scale-[0.98]"
          >
            Refresh
          </button>
        </div>
      </div>

      {isLoading && (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-32 animate-pulse rounded-2xl border border-brand-navy/10 bg-brand-navy/5" />
          ))}
        </div>
      )}

      {isError && (
        <div className="rounded-2xl border border-rose-300/70 bg-rose-50/80 p-6 text-sm text-rose-700">
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

      {/* Ops note */}
      <div className="rounded-2xl border border-brand-navy/10 bg-white/70 p-4 text-[11px] leading-relaxed text-slate-500 backdrop-blur">
        Uptime and alerting for these services are mirrored into Uptime Kuma on the VPS once the tailnet monitor is wired.
        Schedules, backup and dispatch jobs use the automation lane (<code className="font-mono text-brand-gold">/api/automation</code>).
      </div>
    </div>
  );
}