import type { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRevealRoot } from '../lib/reveal';


const rs = (n?: number) => `₹${((n || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const DIV_LABELS: Record<string, string> = {
  'study-abroad': 'Study Abroad', attestation: 'Attestation', umrah: 'Umrah',
  visa: 'Visa', manpower: 'Manpower', other: 'Other',
};

function GrowthCard({ label, value, sub, tone = 'navy' }: { label: string; value: string; sub?: ReactNode; tone?: 'navy' | 'gold' | 'green' | 'red' }) {
  const tones: Record<string, string> = {
    navy: 'text-brand-navy', gold: 'text-brand-gold', green: 'text-emerald-700', red: 'text-rose-600',
  };
  return (
    <div className="rounded-2xl border border-brand-navy/10 bg-white p-4 shadow-[0_20px_40px_-20px_rgba(10,45,80,0.15)]">
      <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-brand-navy/40">{label}</div>
      <div className={`mt-1.5 font-display font-extrabold text-xl ${tones[tone]}`}>{value}</div>
      {sub && <div className="mt-1 text-[10px] text-brand-navy/40">{sub}</div>}
    </div>
  );
}

function Delta({ pct, suffix = '' }: { pct: number; suffix?: string }) {
  const up = pct >= 0;
  return (
    <span className={`inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[9px] font-bold ${up ? 'bg-emerald-500/15 text-emerald-700' : 'bg-rose-500/15 text-rose-600'}`}>
      {up ? '▲' : '▼'} {Math.abs(pct)}%{suffix}
    </span>
  );
}

function Bar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.max(4, Math.round((value / max) * 100)) : 0;
  return (
    <div>
      <div className="flex justify-between text-[10px] mb-1">
        <span className="font-bold text-brand-navy">{label}</span>
        <span className="text-brand-navy/40 font-mono">{rs(value)}</span>
      </div>
      <div className="h-2.5 rounded-full bg-brand-navy/[0.06] overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export default function GrowthMetricsTab() {
  const rootRef = useRevealRoot<HTMLDivElement>();
  const { data, isLoading, isError, refetch } = useQuery<any>({
    queryKey: ['growthMetrics'],
    queryFn: async () => {
      const r = await fetch('/api/analytics/growth', { credentials: 'include' });
      if (!r.ok) throw new Error('growth');
      return r.json();
    },
    refetchInterval: 120000,
  });

  if (isLoading) return <div className="p-10 text-center text-xs text-brand-navy/50">Loading growth metrics…</div>;
  if (isError || !data?.success) return (
    <div className="p-10 text-center">
      <p className="text-xs text-rose-600 mb-3">Growth metrics unavailable.</p>
      <button onClick={() => refetch()} className="bg-brand-gold text-brand-navy px-4 py-2 rounded text-xs font-bold cursor-pointer">Retry</button>
    </div>
  );

  const g = data;
  const divs = Object.entries(g.divisions || {}).sort((a: any, b: any) => b[1].thisMonth - a[1].thisMonth);
  const maxDiv = Math.max(1, ...divs.map((d: any) => d[1].thisMonth));

  return (
    <div ref={rootRef} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="gold-dot" />
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-gold">Growth</span>
          </div>
          <h2 className="font-display font-bold text-base text-brand-navy">Business Growth Metrics</h2>
        </div>
        <button onClick={() => refetch()} className="border border-brand-navy/15 bg-brand-navy/[0.04] text-brand-navy hover:border-brand-gold/50 px-4 py-2 rounded text-xs font-bold transition cursor-pointer">↻ Refresh</button>
      </div>

      {/* Revenue + clients */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <GrowthCard label="Revenue this month" value={rs(g.revenue.thisMonth)} sub={<Delta pct={g.revenue.momGrowthPct} />} tone="gold" />
        <GrowthCard label="Revenue last month" value={rs(g.revenue.lastMonth)} />
        <GrowthCard label="New clients (MoM)" value={String(g.clients.newThis)} sub={<Delta pct={g.clients.newGrowthPct} />} tone={g.clients.newGrowthPct >= 0 ? 'green' : 'red'} />
        <GrowthCard label="Total clients" value={String(g.clients.total)} />
      </div>

      {/* Health metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <GrowthCard label="Lead → client" value={`${g.conversion.conversionPct}%`} sub={`${g.conversion.sourced} sourced leads`} />
        <GrowthCard label="ARPU (lifetime)" value={rs(g.arpu)} sub="revenue per client" />
        <GrowthCard label="Referral share" value={`${g.referrals.referralPct}%`} sub={`${g.referrals.count} referred clients`} tone="green" />
        <GrowthCard label="Retention (30d)" value={`${g.retention.retentionPct}%`} sub={`${g.retention.active} active clients`} tone={g.retention.retentionPct >= 50 ? 'green' : 'red'} />
      </div>

      {/* Pipeline + repeat */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <GrowthCard label="Pipeline value" value={rs(g.pipeline.value)} sub={<Delta pct={g.pipeline.growthPct} />} tone="gold" />
        <GrowthCard label="Repeat business" value={`${g.repeat.repeatPct}%`} sub={`${g.repeat.count} clients with 2+ engagements`} />
      </div>

      {/* Division revenue bars */}
      <div className="reveal rounded-2xl border border-brand-navy/10 bg-white p-5 space-y-4">
        <div className="flex items-center gap-2">
          <span className="gold-dot" />
          <h3 className="font-display font-bold text-sm text-brand-navy">Division Revenue — this month vs last</h3>
        </div>
        <div className="space-y-3">
          {divs.map(([key, d]: any) => (
            <div key={key}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-bold text-brand-navy">{DIV_LABELS[key] || key}</span>
                <span className="flex items-center gap-2">
                  <span className="text-[9px] text-brand-navy/40 font-mono">last {rs(d.lastMonth)}</span>
                  <Delta pct={d.growthPct} />
                </span>
              </div>
              <Bar label="" value={d.thisMonth} max={maxDiv} color="bg-brand-gold" />
            </div>
          ))}
          {divs.length === 0 && <p className="text-[10px] text-brand-navy/40 text-center py-3">No paid revenue recorded yet.</p>}
        </div>
      </div>
    </div>
  );
}