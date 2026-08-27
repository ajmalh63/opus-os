import { useQuery } from '@tanstack/react-query';

export function CommissionPerformance({ partnerId, token }: { partnerId: string, token: string }) {
  const { data: ledger } = useQuery<any>({
    queryKey: ['partnerLedger', partnerId],
    queryFn: async () => {
      const r = await fetch(`/api/partner/${partnerId}/ledger`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!r.ok) return { ledger: [] };
      return r.json();
    },
    enabled: !!partnerId,
    refetchInterval: 30000,
  });
  const { data: perf } = useQuery<any>({
    queryKey: ['partnerPerformance', partnerId],
    queryFn: async () => {
      const r = await fetch(`/api/partner/${partnerId}/performance`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!r.ok) return { performance: {} };
      return r.json();
    },
    enabled: !!partnerId,
    refetchInterval: 30000,
  });
  return (
    <div className="grid md:grid-cols-2 gap-4">
      <div className="rounded-2xl border border-brand-navy/10 bg-white p-4">
        <div className="text-xs font-bold text-brand-navy mb-2">Commission Ledger — Auto (tier boost)</div>
        <div className="text-sm text-brand-navy/60">Collected ₹{((ledger?.totalCollected||0)/100).toLocaleString('en-IN')} • Pending ₹{((ledger?.pending||0)/100).toLocaleString('en-IN')}</div>
        <div className="mt-2 space-y-1 max-h-40 overflow-y-auto">
          {(ledger?.ledger||[]).slice(0,5).map((l:any)=> (
            <div key={l.id} className="flex justify-between text-xs border-b border-brand-navy/5 py-1">
              <span>{l.label}</span>
              <span className={l.status==='paid'?'text-emerald-600':'text-amber-600'}>₹{(l.amount/100).toLocaleString('en-IN')} • {l.status}</span>
            </div>
          ))}
        </div>
      </div>
      <div className="rounded-2xl border border-brand-navy/10 bg-white p-4">
        <div className="text-xs font-bold text-brand-navy mb-2">Performance — Real-time</div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div className="p-2 rounded bg-brand-navy/[0.04]"><div className="text-lg font-bold">{perf?.performance?.bookings||0}</div><div className="text-xs uppercase">Bookings</div></div>
          <div className="p-2 rounded bg-emerald-50"><div className="text-lg font-bold">{perf?.performance?.conversion||0}%</div><div className="text-xs uppercase">Conversion</div></div>
          <div className="p-2 rounded bg-amber-50"><div className="text-lg font-bold">{perf?.performance?.overdue||0}</div><div className="text-xs uppercase">Overdue</div></div>
        </div>
        <div className="text-[13px] text-brand-navy/40 mt-2">Referrals {perf?.performance?.referrals||0} • live via partner:{partnerId}:commissions</div>
      </div>
    </div>
  );
}
