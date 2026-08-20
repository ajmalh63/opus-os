import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRevealRoot } from '../lib/reveal';


interface RosterRow {
  userId: string; name: string; role: string; divisionCount: number;
  doneTotal: number; doneToday: number; doneWeek: number; doneRange: number;
  avgCycleHours: number | null; onTimeRate: number | null;
  open: number; inProgress: number; overdue: number; urgentOpen: number;
}
interface PerformanceData {
  windowDays: number; generatedAt: number;
  headlines: { ticketsOpen: number; overdue: number; doneToday: number; doneInRange: number; avgCycleHours: number | null; onTimeRate: number | null; approvalQueue: number; activeStaff: number };
  roster: RosterRow[];
  trend: { day: number; done: number }[];
  artifacts: {
    approval: { kind: string; id: string; label: string; amountPaise: number | null }[];
    overdue: { id: string; title: string; assignee: string; priority: string; dueDate: number; daysLate: number }[];
    recentDone: { id: string; title: string; assignee: string; priority: string; completedAt: number; cycleHours: number | null }[];
  };
}

const PRIORITY_STYLE: Record<string, string> = {
  urgent: 'bg-rose-500/15 text-rose-700', high: 'bg-amber-500/15 text-amber-700',
  medium: 'bg-slate-500/15 text-slate-300', low: 'bg-emerald-500/15 text-emerald-700',
};
const ROLE_LABEL: Record<string, string> = { counselor: 'Counselor', manager: 'Manager', receptionist: 'Receptionist', coordinator: 'Coordinator' };

export default function PerformanceTab() {
  const [range, setRange] = useState('30');
  const [sortKey, setSortKey] = useState<keyof RosterRow>('doneRange');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const rootRef = useRevealRoot<HTMLDivElement>();

  const { data, isLoading, isError } = useQuery<PerformanceData>({
    queryKey: ['performance', range],
    queryFn: async () => {
      const r = await fetch(`/api/performance?days=${range}`, { credentials: 'include' });
      if (!r.ok) throw new Error('performance');
      return r.json();
    },
  });

  const roster = useMemo(() => {
    if (!data) return [];
    const rows = [...data.roster];
    rows.sort((a, b) => {
      const av = a[sortKey]; const bv = b[sortKey];
      if (av == null && bv == null) return 0;
      if (av == null) return 1; if (bv == null) return -1;
      const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
      return sortDir === 'asc' ? cmp : -cmp;
    });
    return rows;
  }, [data, sortKey, sortDir]);

  const toggleSort = (k: keyof RosterRow) => {
    if (k === sortKey) setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    else { setSortKey(k); setSortDir('desc'); }
  };
  const thSort = (k: keyof RosterRow, label: string) => (
    <th onClick={() => toggleSort(k)} className={`cursor-pointer select-none px-3 py-2.5 text-[10px] font-bold uppercase tracking-wider ${sortKey === k ? 'text-brand-gold' : 'text-brand-navy/40'} hover:text-brand-gold`}>
      {label}{sortKey === k ? (sortDir === 'desc' ? ' ▼' : ' ▲') : ''}
    </th>
  );

  if (isLoading) return <div className="p-12 text-center text-xs text-brand-navy/40">Loading scorecard…</div>;
  if (isError || !data) {
    return <div className="p-12 text-center text-xs text-rose-700 bg-rose-50 border border-rose-200/50 rounded-lg">Failed to load performance. Manager+ session required.</div>;
  }

  const h = data.headlines;
  const maxTrend = Math.max(1, ...data.trend.map((t) => t.done));
  const topLoad = [...data.roster].sort((a, b) => b.open - a.open).slice(0, 3);

  const BAN = ({ label, value, sub, tone = '' }: { label: string; value: string | number; sub?: string; tone?: string }) => (
    <div className={`rounded-2xl border border-brand-navy/10 bg-white p-4 shadow-[0_16px_30px_-18px_rgba(10,45,80,0.10)] transition-all duration-300 hover:border-brand-gold/40 ${tone}`}>
      <div className="text-[9px] font-bold uppercase tracking-widest text-brand-navy/40">{label}</div>
      <div className="mt-1 font-display text-2xl font-extrabold text-brand-navy">{value}</div>
      {sub && <div className="mt-0.5 text-[10px] text-brand-navy/40">{sub}</div>}
    </div>
  );

  return (
    <div ref={rootRef} className="space-y-6 p-6">
      <div className="reveal flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="gold-dot" />
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-gold">Performance</p>
          </div>
          <h2 className="mt-2 font-display text-sm font-bold text-brand-navy">Staff Performance</h2>
          <p className="mt-1 text-[11px] text-brand-navy/40">Balanced scorecard: output × on-time quality × workload · every number is live from task/approval records.</p>
        </div>
        <div className="flex rounded-full border border-brand-navy/15 bg-brand-navy/[0.04] p-0.5 text-[10px] font-bold uppercase">
          {[['7', '7d'], ['30', '30d'], ['90', '90d']].map(([v, l]) => (
            <button key={v} onClick={() => setRange(v)} className={`rounded-full px-3 py-1.5 transition ${range === v ? 'bg-brand-gold text-brand-navy' : 'text-brand-navy/50 hover:text-brand-gold'}`}>{l}</button>
          ))}
        </div>
      </div>

      <section className="reveal grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <BAN label="Open tickets" value={h.ticketsOpen} sub={`${h.activeStaff} staff active`} />
        <BAN label="Overdue" value={h.overdue} tone={h.overdue > 0 ? 'ring-2 ring-rose-400/40' : ''} sub={h.overdue > 0 ? '⚠ needs owner+action' : 'all on schedule'} />
        <BAN label="Done today" value={h.doneToday} sub={`${h.doneInRange} in window`} />
        <BAN label="Done in window" value={h.doneInRange} sub={`last ${data.windowDays} days`} />
        <BAN label="Median cycle" value={h.avgCycleHours != null ? `${h.avgCycleHours}h` : '—'} sub="created → done" />
        <BAN label="On-time rate" value={h.onTimeRate != null ? `${h.onTimeRate}%` : '—'} tone={(h.onTimeRate ?? 100) < 70 ? 'ring-2 ring-rose-400/40' : ''} sub="SLA adherence" />
      </section>
      {h.approvalQueue > 0 && (
        <div className="reveal flex items-center gap-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-4 py-2.5 text-[11px] font-bold text-amber-700">
          ◆ {h.approvalQueue} item(s) awaiting approval — invoices/charges to confirm, agreements to sign (see queue below)
        </div>
      )}

      <div className="reveal grid grid-cols-1 gap-6 xl:grid-cols-3">
        <section className="xl:col-span-2 overflow-x-auto rounded-2xl border border-brand-navy/10 bg-white shadow-[0_20px_40px_-15px_rgba(10,45,80,0.10)]">
          <table className="w-full text-left text-xs">
            <thead className="bg-brand-navy/[0.04] border-b border-brand-navy/[0.08] text-[10px] uppercase tracking-wider text-brand-gold">
              <tr>
                <th className="px-3 py-2.5 font-bold">Staff</th>
                {thSort('doneToday', 'Today')}{thSort('doneWeek', 'Week')}{thSort('doneRange', 'Window')}
                {thSort('avgCycleHours', 'Cycle')}{thSort('onTimeRate', 'On-time')}
                {thSort('open', 'Open')}{thSort('overdue', 'Late')}{thSort('urgentOpen', 'Urgent')}
              </tr>
            </thead>
            <tbody>
              {roster.map((r) => (
                <tr key={r.userId} className="border-b border-brand-navy/[0.08] last:border-0 hover:bg-brand-navy/[0.04]">
                  <td className="px-3 py-2.5">
                    <div className="font-semibold text-brand-navy">{r.name}</div>
                    <div className="text-[9px] uppercase tracking-wider text-brand-navy/50">{ROLE_LABEL[r.role] || r.role}{r.divisionCount > 0 ? ` · ${r.divisionCount} div` : ''}</div>
                  </td>
                  <td className="px-3 py-2.5 font-bold text-brand-navy">{r.doneToday}</td>
                  <td className="px-3 py-2.5 text-brand-navy/70">{r.doneWeek}</td>
                  <td className="px-3 py-2.5 text-brand-navy/70">{r.doneRange}<span className="text-[9px] text-brand-navy/50">/{r.doneTotal}</span></td>
                  <td className="px-3 py-2.5 text-brand-navy/40">{r.avgCycleHours != null ? `${r.avgCycleHours}h` : '—'}</td>
                  <td className="px-3 py-2.5">
                    <span className={`rounded px-1.5 py-0.5 text-[10px] font-bold ${(r.onTimeRate ?? 100) >= 80 ? 'bg-emerald-500/15 text-emerald-700' : (r.onTimeRate ?? 100) >= 60 ? 'bg-amber-500/15 text-amber-700' : 'bg-rose-500/15 text-rose-700'}`}>
                      {r.onTimeRate != null ? `${r.onTimeRate}%` : '—'}
                    </span>
                  </td>
                  <td className="px-3 py-2.5 text-brand-navy/70">{r.open}<span className="text-[9px] text-brand-navy/50"> ({r.inProgress} prog)</span></td>
                  <td className="px-3 py-2.5"><span className={`font-bold ${r.overdue > 0 ? 'text-rose-600' : 'text-brand-navy/40'}`}>{r.overdue}</span></td>
                  <td className="px-3 py-2.5"><span className={`font-bold ${r.urgentOpen > 0 ? 'text-rose-600' : 'text-brand-navy/40'}`}>{r.urgentOpen}</span></td>
                </tr>
              ))}
              {roster.length === 0 && <tr><td colSpan={9} className="px-3 py-10 text-center text-brand-navy/50">No staff tasks yet — assign work and it appears here.</td></tr>}
            </tbody>
          </table>
        </section>

        <section className="space-y-4">
          <div className="rounded-2xl border border-brand-navy/10 bg-white p-4 shadow-[0_20px_40px_-15px_rgba(10,45,80,0.10)]">
            <div className="text-[10px] font-bold uppercase tracking-widest text-brand-navy/40">Throughput · daily completions</div>
            <div className="mt-3 flex h-20 items-end gap-1">
              {data.trend.map((t) => (
                <div key={t.day} title={`${new Date(t.day * 1000).toLocaleDateString()}: ${t.done}`}
                  className="flex-1 rounded-t bg-brand-gold/60 transition hover:bg-brand-gold"
                  style={{ height: `${Math.max(6, (t.done / maxTrend) * 100)}%` }} />
              ))}
            </div>
            <div className="mt-1 flex justify-between text-[9px] text-brand-navy/50">
              <span>{new Date((data.trend[0]?.day || 0) * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
              <span>{new Date((data.trend[data.trend.length - 1]?.day || 0) * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}</span>
            </div>
          </div>
          <div className="rounded-2xl border border-brand-navy/10 bg-white p-4 shadow-[0_20px_40px_-15px_rgba(10,45,80,0.10)]">
            <div className="text-[10px] font-bold uppercase tracking-widest text-brand-navy/40">Highest current load</div>
            <div className="mt-3 space-y-2.5">
              {topLoad.map((r) => {
                const maxOpen = Math.max(1, ...data.roster.map((x) => x.open));
                return (
                  <div key={r.userId}>
                    <div className="flex justify-between text-[11px]">
                      <span className="font-semibold text-brand-navy">{r.name}</span>
                      <span className="text-brand-navy/40">{r.open} open{r.overdue > 0 ? <span className="text-rose-600"> · {r.overdue} late</span> : null}</span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-white">
                      <div className={`h-1.5 rounded-full ${r.overdue > 0 ? 'bg-rose-500' : 'bg-brand-gold'}`} style={{ width: `${(r.open / maxOpen) * 100}%` }} />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </div>

      {/* Live artifact queues — evidence behind the numbers */}
      <section className="reveal grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/10 p-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-amber-700">Awaiting approval ({data.artifacts.approval.length})</div>
          <div className="mt-2.5 space-y-1.5">
            {data.artifacts.approval.map((a) => (
              <div key={`${a.kind}-${a.id}`} className="flex items-center justify-between gap-2 rounded-lg bg-brand-navy/[0.04] px-2.5 py-1.5 text-[11px]">
                <span className="truncate text-brand-navy/70"><span className={`mr-1 rounded px-1 py-0.5 text-[9px] font-bold uppercase ${a.kind === 'payment' ? 'bg-brand-gold/15 text-brand-gold' : 'bg-violet-500/15 text-violet-300'}`}>{a.kind}</span>{a.label}</span>
                {a.amountPaise != null && <span className="shrink-0 font-mono font-bold text-brand-navy">{(a.amountPaise / 100).toLocaleString('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })}</span>}
              </div>
            ))}
            {data.artifacts.approval.length === 0 && <div className="py-4 text-center text-[11px] text-brand-navy/50">Queue clear — nothing waits on a decision.</div>}
          </div>
        </div>
        <div className="rounded-2xl border border-rose-500/30 bg-rose-500/10 p-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-rose-700">Overdue ({data.artifacts.overdue.length})</div>
          <div className="mt-2.5 space-y-1.5">
            {data.artifacts.overdue.map((o) => (
              <div key={o.id} className="rounded-lg bg-brand-navy/[0.04] px-2.5 py-1.5 text-[11px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-semibold text-brand-navy">{o.title}</span>
                  <span className={`shrink-0 rounded px-1 py-0.5 text-[9px] font-bold uppercase ${PRIORITY_STYLE[o.priority] || PRIORITY_STYLE.medium}`}>{o.priority}</span>
                </div>
                <div className="mt-0.5 flex justify-between text-[10px] text-brand-navy/40">
                  <span>{o.assignee}</span>
                  <span className="font-bold text-rose-600">{o.daysLate}d late</span>
                </div>
              </div>
            ))}
            {data.artifacts.overdue.length === 0 && <div className="py-4 text-center text-[11px] text-brand-navy/50">Nothing overdue 🎉</div>}
          </div>
        </div>
        <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4">
          <div className="text-[10px] font-bold uppercase tracking-widest text-emerald-700">Recently done ({data.artifacts.recentDone.length})</div>
          <div className="mt-2.5 space-y-1.5">
            {data.artifacts.recentDone.map((d) => (
              <div key={d.id} className="rounded-lg bg-brand-navy/[0.04] px-2.5 py-1.5 text-[11px]">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate font-semibold text-brand-navy">{d.title}</span>
                  <span className="shrink-0 text-[9px] text-brand-navy/50">{d.cycleHours != null ? `${d.cycleHours}h` : '—'}</span>
                </div>
                <div className="mt-0.5 text-[10px] text-brand-navy/40">{d.assignee} · {new Date((d.completedAt || 0) * 1000).toLocaleDateString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</div>
              </div>
            ))}
            {data.artifacts.recentDone.length === 0 && <div className="py-4 text-center text-[11px] text-brand-navy/50">Nothing completed in this window yet.</div>}
          </div>
        </div>
      </section>
    </div>
  );
}