import { useQuery } from '@tanstack/react-query';

export function BookingTower({ partnerId, token }: { partnerId: string, token: string }) {
  const { data } = useQuery<any>({
    queryKey: ['partnerBookings', partnerId],
    queryFn: async () => {
      const r = await fetch(`/api/partner/${partnerId}/bookings`, { headers: token ? { Authorization: `Bearer ${token}` } : {} });
      if (!r.ok) return { bookings: [] };
      return r.json();
    },
    enabled: !!partnerId,
    refetchInterval: 30000,
  });
  const bookings: any[] = data?.bookings || [];
  return (
    <div className="rounded-2xl border border-brand-navy/10 bg-white p-4">
      <div className="text-xs font-bold text-brand-navy mb-2">Booking Tower — Real-time (sub-agent visibility)</div>
      {bookings.length===0 ? <div className="text-[11px] text-brand-navy/40 py-4 text-center">No bookings yet — referrals become bookings after payment.</div> : (
        <div className="space-y-1.5">
          {bookings.slice(0,6).map((b:any)=> (
            <div key={b.id} className="flex items-center justify-between p-2 rounded-lg border border-brand-navy/10 text-xs">
              <span className="font-bold truncate max-w-[180px]">{b.title || b.id}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-brand-navy/10">{b.division} • {b.stageKey}</span>
            </div>
          ))}
        </div>
      )}
      <div className="text-[10px] text-brand-navy/30 mt-2">{bookings.length} total • live via partner:{partnerId}:bookings</div>
    </div>
  );
}
