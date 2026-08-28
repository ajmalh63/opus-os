import { useQuery } from '@tanstack/react-query';
const API = (import.meta as any).env?.VITE_API_URL || 'https://opusos-api.ajmalsn63.workers.dev';

export function PortalCalendar({ token }: { token: string }) {
  const { data } = useQuery<any>({
    queryKey: ['portalCalendar', token],
    queryFn: async () => {
      const r = await fetch(`${API}/api/public/portal/calendar`, { headers: token ? { 'X-Portal-Token': token } : {} });
      if (!r.ok) return { deadlines: [], schedules: [], tasks: [] };
      return r.json();
    },
    enabled: !!token,
    refetchInterval: 30000,
  });
  const deadlines: any[] = data?.deadlines || [];
  const schedules: any[] = data?.schedules || [];
  const tasks: any[] = data?.tasks || [];
  if (!deadlines.length && !schedules.length && !tasks.length) return <div className="rounded-2xl border border-brand-navy/10 bg-white p-4 text-xs text-brand-navy/40">No upcoming deadlines — you’re on track.</div>;
  return (
    <div className="rounded-2xl border border-brand-navy/10 bg-white p-4 space-y-3">
      <div className="flex items-center justify-between">
        <div className="text-xs font-bold text-brand-navy">Upcoming — Next 7 Days</div>
        <a href={`/api/public/portal/calendar.ics?token=${encodeURIComponent(token)}`} className="text-[13px] font-bold underline">Add to Calendar (.ics)</a>
      </div>
      <div className="space-y-1.5">
        {deadlines.slice(0,5).map((d:any)=> (
          <div key={d.id} className={`flex items-center justify-between p-2 rounded-xl border text-xs ${d.status==='overdue'?'bg-red-50 border-red-200 text-red-700':'bg-white border-brand-navy/10'}`}>
            <span className="font-bold">{d.type}</span>
            <span className="text-[13px]">{new Date(d.dueAt*1000).toLocaleDateString('en-IN')} {d.status==='overdue' && '• Overdue'}</span>
          </div>
        ))}
        {schedules.slice(0,3).map((s:any)=> (
          <div key={s.id} className="flex items-center justify-between p-2 rounded-xl border border-brand-navy/10 bg-amber-50 text-xs">
            <span>{s.label} — ₹{(s.amount/100).toLocaleString('en-IN')}</span>
            <span className="text-[13px]">{s.status} • {new Date(s.dueAt*1000).toLocaleDateString('en-IN')}</span>
          </div>
        ))}
        {tasks.slice(0,3).map((t:any)=> (
          <div key={t.id} className="p-2 rounded-xl border border-brand-navy/10 bg-white text-xs">
            <div className="font-bold">{t.title}</div>
            <div className="text-[13px] text-brand-navy/50">{t.status} • {t.priority}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
