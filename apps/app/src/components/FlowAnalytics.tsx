import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import FunnelTab from './FunnelTab.js';
import PerformanceTab from './PerformanceTab.js';
import { useRevealRoot } from '../lib/reveal';

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
  const [activeSubTab, setActiveSubTab] = useState<'flow' | 'funnel' | 'performance' | 'divisions'>('flow');
  const rootRef = useRevealRoot<HTMLDivElement>();

  const { data: funnelsData } = useQuery<any>({
    queryKey: ['divisionFunnels'],
    queryFn: async () => {
      const r = await fetch('/api/analytics/funnels', { headers: AUTH });
      if (!r.ok) throw new Error('funnels');
      return r.json();
    },
  });

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
    <div ref={rootRef} className="min-h-full space-y-6 text-brand-navy">
      <header className="reveal border-b border-brand-navy/10 pb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-gold">Analytics & Performance</p>
          <h1 className="mt-1 font-display text-2xl font-extrabold tracking-tight text-brand-navy">Business Intelligence</h1>
        </div>
        
        <div className="flex bg-brand-navy/[0.05] rounded-lg p-0.5 border border-brand-navy/10 text-[11px] font-bold">
          <button
            onClick={() => setActiveSubTab('flow')}
            className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${activeSubTab === 'flow' ? 'bg-brand-gold text-brand-navy shadow-xs font-extrabold' : 'text-brand-navy/50 hover:text-brand-navy'}`}
          >
            Flow Analytics
          </button>
          <button
            onClick={() => setActiveSubTab('funnel')}
            className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${activeSubTab === 'funnel' ? 'bg-brand-gold text-brand-navy shadow-xs font-extrabold' : 'text-brand-navy/50 hover:text-brand-navy'}`}
          >
            Sales Funnel
          </button>
          <button
            onClick={() => setActiveSubTab('divisions')}
            className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${activeSubTab === 'divisions' ? 'bg-brand-gold text-brand-navy shadow-xs font-extrabold' : 'text-brand-navy/50 hover:text-brand-navy'}`}
          >
            Division Funnels
          </button>
          <button
            onClick={() => setActiveSubTab('performance')}
            className={`px-3 py-1.5 rounded-md transition-all cursor-pointer ${activeSubTab === 'performance' ? 'bg-brand-gold text-brand-navy shadow-xs font-extrabold' : 'text-brand-navy/50 hover:text-brand-navy'}`}
          >
            Staff Performance
          </button>
        </div>
      </header>

      {activeSubTab === 'divisions' && (
        <div className="space-y-6">
          {funnelsData?.funnels && Object.entries(funnelsData.funnels).map(([division, f]: [string, any]) => (
            <div key={division} className="reveal rounded-2xl border border-brand-navy/10 bg-white p-5 shadow-sm">
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display font-bold text-brand-navy text-sm capitalize">{division.replace('-', ' ')}</h3>
                <span className="text-[10px] text-brand-navy/40 font-bold">Avg {f.avgDays} days to advance</span>
              </div>
              <div className="space-y-2">
                {f.counts.map((c: any) => {
                  const pct = f.counts[0].count > 0 ? Math.round((c.count / f.counts[0].count) * 100) : 0;
                  return (
                    <div key={c.stage} className="flex items-center gap-2">
                      <span className="w-32 shrink-0 text-[10px] font-bold text-brand-navy/60 capitalize truncate">{c.stage.replace(/_/g, ' ')}</span>
                      <div className="flex-1 h-5 rounded bg-brand-navy/[0.04] overflow-hidden">
                        <div className="h-full bg-brand-gold/70 flex items-center justify-end px-1.5" style={{ width: `${Math.max(4, pct)}%` }}>
                          <span className="text-[8px] font-bold text-brand-navy">{c.count}</span>
                        </div>
                      </div>
                      <span className="w-10 shrink-0 text-right text-[9px] text-brand-navy/40 font-bold">{pct}%</span>
                    </div>
                  );
                })}
              </div>
              <div className="flex flex-wrap gap-1.5 mt-3">
                {f.conversions.map((cv: any, i: number) => (
                  <span key={i} className="bg-brand-navy/[0.05] text-brand-navy/60 rounded px-1.5 py-0.5 text-[9px] font-bold border border-brand-navy/10">
                    {cv.from.replace(/_/g, ' ')} → {cv.to.replace(/_/g, ' ')}: <b className="text-brand-gold">{cv.pct}%</b>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {activeSubTab === 'funnel' && <FunnelTab />}
      {activeSubTab === 'performance' && <PerformanceTab />}

      {activeSubTab === 'flow' && (
        <>
          <div className="flex justify-end">
            <select value={days} onChange={(e) => setDays(Number(e.target.value))} className="rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-xs text-brand-navy cursor-pointer focus:border-brand-gold focus:outline-none">
              <option value={7} className="bg-white">7 days</option>
              <option value={14} className="bg-white">14 days</option>
              <option value={30} className="bg-white">30 days</option>
              <option value={60} className="bg-white">60 days</option>
              <option value={90} className="bg-white">90 days</option>
            </select>
          </div>

          {isLoading && <div className="h-64 animate-pulse rounded-2xl border border-brand-navy/10 bg-brand-navy/[0.05]" />}
          {isError && <div className="rounded-2xl border border-rose-400/30 bg-rose-500/10 p-6 text-sm text-rose-700">Failed to load flow analytics — manager/owner access required.</div>}

          {!isLoading && !isError && data && (
            <>
              {/* KPIs */}
              <div className="reveal grid grid-cols-2 gap-4 md:grid-cols-4">
                {[
                  { label: 'WIP today', value: String(data.analytics.wipToday) },
                  { label: 'Avg lead time', value: `${data.analytics.leadTimeAvgDays}d` },
                  { label: 'Forecast p50', value: `${data.analytics.monteCarlo.p50}d` },
                  { label: 'Forecast p90', value: `${data.analytics.monteCarlo.p90}d` },
                ].map((k) => (
                  <div key={k.label} className="rounded-xl border border-brand-navy/10 bg-white p-4 shadow-[0_16px_40px_-20px_rgba(10,45,80,0.10)]">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-brand-navy/40">{k.label}</p>
                    <p className="mt-2 font-display text-2xl font-extrabold text-brand-navy">{k.value}</p>
                  </div>
                ))}
              </div>

              {/* CFD */}
              <div className="reveal rounded-2xl border border-brand-navy/10 bg-white p-6 shadow-[0_20px_40px_-20px_rgba(10,45,80,0.10)]">
                <h3 className="mb-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-brand-gold"><span className="gold-dot" />Cumulative Flow Diagram</h3>
                <div className="flex flex-wrap gap-3 pb-3">
                  {stages.map((s, i) => (
                    <span key={s} className="inline-flex items-center gap-1.5 text-[10px] text-brand-navy/70">
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
                <p className="mt-3 text-[10px] text-brand-navy/50">{data.analytics.cfd.length} days · stacked per-stage cumulative cards</p>
              </div>

              {/* Monte Carlo + throughput */}
              <div className="reveal grid grid-cols-1 gap-4 lg:grid-cols-2">
                <div className="rounded-2xl border border-brand-navy/10 bg-white p-6 shadow-[0_20px_40px_-20px_rgba(10,45,80,0.10)]">
                  <h3 className="mb-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-brand-gold"><span className="gold-dot" />Monte Carlo — days to clear WIP</h3>
                  <div className="space-y-3">
                    {[['p50', data.analytics.monteCarlo.p50], ['p75', data.analytics.monteCarlo.p75], ['p90', data.analytics.monteCarlo.p90]].map(([k, v]) => (
                      <div key={k as string}>
                        <div className="mb-1 flex justify-between text-[11px]">
                          <span className="font-semibold text-brand-navy/70">{k as string}</span>
                          <span className="font-mono text-brand-navy/50">{v as number}d</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-brand-navy/[0.05]">
                          <div className={`h-full rounded-full ${k === 'p90' ? 'bg-rose-500' : k === 'p75' ? 'bg-brand-gold' : 'bg-emerald-600'}`} style={{ width: `${Math.min(100, (v as number) / 30 * 100)}%` }} />
                        </div>
                      </div>
                    ))}
                  </div>
                  <p className="mt-4 text-[10px] text-brand-navy/50">Simulated from {data.analytics.monteCarlo.samples} draws using observed daily completion rates.</p>
                </div>

                <div className="rounded-2xl border border-brand-navy/10 bg-white p-6 shadow-[0_20px_40px_-20px_rgba(10,45,80,0.10)]">
                  <h3 className="mb-4 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.18em] text-brand-gold"><span className="gold-dot" />Throughput (completions / day)</h3>
                  <div className="flex h-40 items-end gap-[2px]">
                    {data.analytics.throughputPerDay.map((t) => (
                      <div key={t.date} className="group relative flex-1" title={`${t.date}: ${t.completed}`}>
                        <div className="w-full rounded-t bg-gradient-to-t from-brand-navy to-brand-gold" style={{ height: `${Math.min(100, (t.completed || 0) * 20)}%` }} />
                      </div>
                    ))}
                  </div>
                  <p className="mt-3 text-[10px] text-brand-navy/50">Cards arriving into the final stage each day.</p>
                </div>
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}
