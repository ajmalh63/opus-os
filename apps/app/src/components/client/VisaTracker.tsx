import { useQuery } from '@tanstack/react-query';

export function VisaTracker({ bookingId, token }: { bookingId: string, token: string }) {
  const { data, isLoading } = useQuery<any>({
    queryKey: ['visaTracker', bookingId],
    queryFn: async () => {
      const r = await fetch(`/api/visa/tracker/${bookingId}`, { headers: token ? { 'X-Portal-Token': token } : {} });
      if (!r.ok) return null;
      return r.json();
    },
    enabled: !!bookingId,
    refetchInterval: 30000,
  });
  if (isLoading) return <div className="text-[11px] text-brand-navy/40">Loading tracker…</div>;
  const t = data?.tracker;
  if (!t) return <div className="text-[11px] text-brand-navy/40">No tracker — select a visa booking.</div>;
  return (
    <div className="rounded-2xl border border-brand-navy/10 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-bold text-brand-navy">Visa Tracker — Anxiety-grade</div>
        <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-700">Checked {new Date(t.checkedAt*1000).toLocaleTimeString('en-IN')}</span>
      </div>
      <div className="p-3 rounded-xl bg-brand-navy text-white">
        <div className="text-[10px] uppercase tracking-wide opacity-60">Official status</div>
        <div className="text-sm font-bold">{t.officialStatus}</div>
        <div className="text-xs opacity-80 mt-1">{t.plainExplainer}</div>
      </div>
      <div className="space-y-1">
        {t.timeline?.map((x:any)=> (
          <div key={x.type} className="flex items-center justify-between p-2 rounded-lg border border-brand-navy/10 text-xs">
            <span className="font-bold">{x.type}</span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded ${x.status==='overdue'?'bg-red-100 text-red-700':'bg-emerald-50 text-emerald-700'}`}>{x.status} • {new Date(x.dueAt*1000).toLocaleDateString('en-IN')}</span>
          </div>
        ))}
      </div>
      <p className="text-[10px] text-brand-navy/40">Mirrors official source — never the authority. Change-only alerts, not noise.</p>
    </div>
  );
}
