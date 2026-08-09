import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

// §16.4.5 Flow Analytics — CFD (cumulative flow) + throughput + Monte Carlo
// forecast of days-to-clear current WIP. Manager+ surface.

const AUTH = {
  get Cookie() {
    const s = document.cookie.split(';').map((p: string) => p.trim()).find((p: string) => p.startsWith('better-auth.session_token='));
    return s || '';
  }
} as Record<string, string>;

interface CFD { date: string; counts: Record<string, number>; }
interface FlowAnalytics {
  windowDays: number;
  cfd: CFD[];
  throughputPerDay: { date: string; completed: number }[];
  leadTimeAvgDays: number;
  wipToday: number;
  monteCarlo: { samples: number; p50: number; p75: number; p90: number };
}

const COLORS = ['#0a2d50', '#d7a019', '#0f766e', '#7c3aed', '#b91c1c'];

export default function FlowAnalytics() {
  const [days, setDays] = useState(30);

  const { data, isLoading, isError } = useQuery<{ analytics: FlowAnalytics }>({
    queryKey: ['flowAnalytics', days],
    queryFn: async () => {
      const r = await fetch(`/api/kanban/analytics?days=${days}`, { headers: AUTH });
      if (!r.ok) throw new Error('load failed');
      return r.json();
    },
  });

  const stages = data ? Array.from(new Set(data.analytics.cfd.flatMap((d) => Object.keys(d.counts)))) : [];

  return (
    <div className="min-h-full space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-gold">Operational</p>
          <h1 className="mt-1 font-display text-2xl font-extrabold tracking-tight text-brand-navy">Flow Analytics</h1>
          <p className="mt-1 text-sm text-slate-500">Cumulative flow + throughput + Monte Carlo forecast (manager/owner).</p>
        </div>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="rounded-lg border border-brand-navy/15 bg-white px-3 py-2 text-xs text-brand-navy">
          <option value={7}>7 days</option>
          <option value={14}>14 days</option>
          <option value={30}>30 days</option>
          <option value={60}>60 days</option>
          <option value={90}>90 days</option>
        </select>
      </div>

      {isLoading && <div className="h-64 animate-pulse rounded-2xl border border-brand-navy/10 bg-brand-navy/5" />}
      {isError && <div className="rounded-2xl border border-rose-300/70 bg-rose-50 p-6 text-sm text-rose-700">Failed to load flow analytics — manager/owner access required.</div>}

      {!isLoading && !isError && data && (
        <>
          {/* KPIs */}
          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {[
              { label: 'WIP today', value: String(data.analytics.wipToday) },
              { label: 'Avg lead time', value: `${data.analytics.leadTimeAvgDays}d` },
              { label: 'Forecast p50', value: `${data.analytics.monteCarlo.p50}d` },
              { label: 'Forecast p90', value: `${data.analytics.monteCarlo.p90}d` },
            ].map((k) => (
              <div key={k.label} className="rounded-xl border border-brand-navy/10 bg-white p-4 shadow-[0_16px_40px_-20px_rgba(10,45,80,0.14)]">
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{k.label}</p>
                <p className="mt-2 font-display text-2xl font-extrabold text-brand-navy">{k.value}</p>
              </div>
            ))}
          </div>

          {/* CFD */}
          <div className="rounded-2xl border border-brand-navy/10 bg-white p-6 shadow-[0_20px_40px_-20px_rgba(10,45,80,0.12)]">
            <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-brand-navy">Cumulative Flow Diagram</h3>
            <div className="flex flex-wrap gap-3 pb-3">
              {stages.map((s, i) => (
                <span key={s} className="inline-flex items-center gap-1.5 text-[10px] text-slate-600">
                  <span className="h-2.5 w-2.5 rounded-sm" style={{ background: COLORS[i % COLORS.length] }} />
                  {s}
                </span>
              ))}
            </div>
            <div className="flex h-44 items-end gap-[2px]">
              {data.analytics.cfd.map((d) => {
                const max = Math.max(1, ...stages.map((s) => d.counts[s] || 0));
                return (
                  <div key={d.date} className="flex flex-1 flex-col justify-end" title={d.date}>
                    {stages.map((s, i) => {
                      const h = ((d.counts[s] || 0) / max) * 100;
                      return <div key={s} style={{ height: `${h}%`, background: COLORS[i % COLORS.length] }} className="w-full" />;
                    })}
                  </div>
                );
              })}
            </div>
            <p className="mt-3 text-[10px] text-slate-400">{data.analytics.cfd.length} days · stacked per-stage cumulative cards</p>
          </div>

          {/* Monte Carlo + throughput */}
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="rounded-2xl border border-brand-navy/10 bg-white p-6 shadow-[0_20px_40px_-20px_rgba(10,45,80,0.12)]">
              <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-brand-navy">Monte Carlo — days to clear WIP</h3>
              <div className="space-y-3">
                {[['p50', data.analytics.monteCarlo.p50], ['p75', data.analytics.monteCarlo.p75], ['p90', data.analytics.monteCarlo.p90]].map(([k, v]) => (
                  <div key={k as string}>
                    <div className="mb-1 flex justify-between text-[11px]">
                      <span className="font-semibold text-slate-600">{k as string}</span>
                      <span className="font-mono text-slate-500">{v as number}d</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-brand-navy/5">
                      <div className={`h-full rounded-full ${k === 'p90' ? 'bg-rose-500' : k === 'p75' ? 'bg-brand-gold' : 'bg-emerald-600'}`} style={{ width: `${Math.min(100, (v as number) / 30 * 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-4 text-[10px] text-slate-400">Simulated from {data.analytics.monteCarlo.samples} draws using observed daily completion rates.</p>
            </div>

            <div className="rounded-2xl border border-brand-navy/10 bg-white p-6 shadow-[0_20px_40px_-20px_rgba(10,45,80,0.12)]">
              <h3 className="mb-4 text-xs font-bold uppercase tracking-wider text-brand-navy">Throughput (completions / day)</h3>
              <div className="flex h-40 items-end gap-[2px]">
                {data.analytics.throughputPerDay.map((t) => (
                  <div key={t.date} className="group relative flex-1" title={`${t.date}: ${t.completed}`}>
                    <div className="w-full rounded-t bg-gradient-to-t from-brand-navy to-brand-gold" style={{ height: `${Math.min(100, (t.completed || 0) * 20)}%` }} />
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[10px] text-slate-400">Cards arriving into the final stage each day.</p>
            </div>
          </div>
        </>
      )}
    </div>
  );
}