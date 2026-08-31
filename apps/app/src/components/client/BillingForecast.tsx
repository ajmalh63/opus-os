import { useQuery } from '@tanstack/react-query';
const API = (import.meta as any).env?.VITE_API_URL || '';

export function BillingForecast({
  token,
  clientId,
  onPayNow,
}: {
  token: string;
  clientId: string;
  onPayNow?: () => void;
}) {
  const { data } = useQuery<any>({
    queryKey: ['billingForecast', clientId],
    queryFn: async () => {
      const p = new URLSearchParams();
      if (clientId) p.set('clientId', clientId);
      const r = await fetch(`${API}/api/ledger/forecast?${p.toString()}`, {
        headers: token ? { 'X-Portal-Token': token } : {},
      });
      if (!r.ok) return { forecast: { totalDue: 0, items: [] } };
      return r.json();
    },
    enabled: !!clientId,
    refetchInterval: 30000,
  });

  const f = data?.forecast;
  if (!f || f.totalDue === undefined) return null;

  const totalDueRupees = Math.round(f.totalDue / 100);

  return (
    <div className="rounded-2xl border border-brand-gold/30 bg-gradient-to-r from-amber-50/80 via-white to-amber-50/40 p-4 sm:p-5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4 shadow-xs">
      <div className="space-y-1">
        <div className="flex items-center gap-2">
          <span className="text-base">💳</span>
          <span className="text-xs font-bold text-brand-navy uppercase tracking-wide">
            Financial Ledger & Milestone Settlement
          </span>
          {totalDueRupees > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-amber-100 border border-amber-300 text-amber-900 font-bold text-[13px]">
              Payment Due
            </span>
          )}
        </div>
        <p className="text-xs text-slate-600">
          {totalDueRupees > 0
            ? `${f.count || 1} milestone installment(s) scheduled • Transparent processing with zero hidden fees`
            : 'All currently due milestone settlements are cleared and verified.'}
        </p>
      </div>

      <div className="flex items-center gap-4 w-full md:w-auto justify-between md:justify-end border-t md:border-t-0 pt-3 md:pt-0 border-brand-navy/10">
        <div className="text-left md:text-right">
          <div className="text-[13px] text-brand-navy/60 font-semibold uppercase tracking-wider">
            {totalDueRupees > 0 ? 'Amount Payable' : 'Account Balance'}
          </div>
          <div className="text-lg sm:text-xl font-bold font-mono text-brand-navy">
            ₹{totalDueRupees.toLocaleString('en-IN')}
          </div>
        </div>

        {totalDueRupees > 0 && onPayNow && (
          <button
            type="button"
            onClick={onPayNow}
            className="rounded-xl bg-brand-navy hover:bg-brand-gold hover:text-brand-navy text-white text-xs font-bold px-4 py-2.5 transition-all shadow-xs cursor-pointer shrink-0"
          >
            Pay Balance Now →
          </button>
        )}
      </div>
    </div>
  );
}
