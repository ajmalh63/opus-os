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
  if (isLoading) return <div className="text-xs text-brand-navy/60">Loading tracker…</div>;
  const t = data?.tracker;
  if (!t) return <div className="text-xs text-brand-navy/60">No tracker — select a visa booking.</div>;
  return (
    <div className="rounded-2xl border border-brand-navy/10 bg-white p-5 space-y-3.5">
      <div className="flex items-center justify-between">
        <div className="text-sm font-bold text-brand-navy">Visa Tracker — Anxiety-grade</div>
        <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-700">Checked {new Date(t.checkedAt*1000).toLocaleTimeString('en-IN')}</span>
      </div>
      <div className="p-4 rounded-xl bg-brand-navy text-white">
        <div className="text-xs uppercase font-bold tracking-wide opacity-70">Official status</div>
        <div className="text-base font-bold mt-0.5">{t.officialStatus}</div>
        <div className="text-xs sm:text-sm opacity-90 mt-1">{t.plainExplainer}</div>
      </div>
      <div className="space-y-1.5">
        {t.timeline?.map((x:any)=> (
          <div key={x.type} className="flex items-center justify-between p-2.5 rounded-xl border border-brand-navy/10 text-xs sm:text-sm">
            <span className="font-bold">{x.type}</span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded ${x.status==='overdue'?'bg-red-100 text-red-700':'bg-emerald-50 text-emerald-700'}`}>{x.status} • {new Date(x.dueAt*1000).toLocaleDateString('en-IN')}</span>
          </div>
        ))}
      </div>
      <p className="text-xs text-brand-navy/50">Mirrors official source — never the authority. Change-only alerts, not noise.</p>
    </div>
  );
}
