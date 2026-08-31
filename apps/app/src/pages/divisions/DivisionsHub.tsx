import { useLocation } from 'wouter';
import { useSession } from '../../lib/session';
import { useRevealRoot } from '../../lib/reveal';
import { useQuery } from '@tanstack/react-query';
const API = (import.meta as any).env?.VITE_API_URL || '';

const AUTH = {
  get Authorization() {
    return 'Bearer ' + (typeof window !== 'undefined' ? localStorage.getItem('opus_token') || '' : '');
  }
};

export default function DivisionsHub() {
  const rootRef = useRevealRoot<HTMLDivElement>();
  const [, setLocation] = useLocation();
  const { me } = useSession();

  const divisions = [
    {
      key: 'study-abroad',
      label: 'Study Abroad Desk',
      category: 'Higher Education',
      desc: 'Overseas admissions, AI SOP synthesis, 35+ country applications, and university snapshots.',
      icon: '🎓',
      accentColor: 'from-blue-600/20 via-blue-500/10 to-transparent',
      borderColor: 'border-blue-500/30',
      badgeBg: 'bg-blue-500/10 text-blue-700 border-blue-500/20'
    },
    {
      key: 'visa',
      label: 'Visa Preparation Desk',
      category: 'Immigration & Slots',
      desc: 'Embassy slot appointments, document checklists, visa catalog products, and mock interviews.',
      icon: '🛂',
      accentColor: 'from-emerald-600/20 via-emerald-500/10 to-transparent',
      borderColor: 'border-emerald-500/30',
      badgeBg: 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20'
    },
    {
      key: 'attestation',
      label: 'Document Attestation Desk',
      category: 'Legalization & MEA',
      desc: 'MEA apostille chains, state HRD verification, embassy legalizations, and postal tracking.',
      icon: '📜',
      accentColor: 'from-amber-600/20 via-amber-500/10 to-transparent',
      borderColor: 'border-amber-500/30',
      badgeBg: 'bg-amber-500/10 text-amber-700 border-amber-500/20'
    },
    {
      key: 'umrah',
      label: 'Tours & Travels Desk',
      category: 'Holidays & Pilgrimage Operations',
      desc: 'Umrah pilgrimages, international holidays, domestic getaways, and group departures.',
      icon: '🧳',
      accentColor: 'from-purple-600/20 via-purple-500/10 to-transparent',
      borderColor: 'border-purple-500/30',
      badgeBg: 'bg-purple-500/10 text-purple-700 border-purple-500/20'
    },
    {
      key: 'manpower',
      label: 'Manpower Sourcing Hub',
      category: 'Corporate Recruitment',
      desc: 'Gulf deployment pipelines, candidate trade testing, medical clearances, and job offers.',
      icon: '👷',
      accentColor: 'from-sky-600/20 via-sky-500/10 to-transparent',
      borderColor: 'border-sky-500/30',
      badgeBg: 'bg-sky-500/10 text-sky-700 border-sky-500/20'
    }
  ];

  const visible = me?.role === 'super_admin' 
    ? divisions 
    : divisions.filter(d => me?.userDivisions?.includes(d.key));

  // Live stats per division
  const { data: statsData } = useQuery<any>({
    queryKey: ['divisionsStats'],
    queryFn: async () => {
      const r = await fetch(`${API}/api/tasks/divisions-stats`, { headers: { ...AUTH } });
      if (!r.ok) throw new Error('stats');
      return r.json();
    },
    refetchInterval: 30000
  });
  const stats = statsData?.stats || {};

  // Live division availability state
  const { data: divData } = useQuery<{ enabled: Record<string, boolean> }>({
    queryKey: ['publicDivisions'],
    queryFn: async () => {
      const r = await fetch(`${API}/api/public/divisions`);
      if (!r.ok) return { enabled: { 'study-abroad': true } };
      return r.json();
    },
    staleTime: 30000
  });
  const enabledMap = divData?.enabled || { 'study-abroad': true };
  const activeCount = Object.values(enabledMap).filter(Boolean).length;

  return (
    <div ref={rootRef} className="space-y-8 font-sans">
      {/* Header with operational status banner */}
      <div className="reveal flex flex-wrap items-center justify-between gap-4 border-b border-brand-navy/10 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="h-2 w-2 rounded-full bg-brand-gold shadow-[0_0_8px_rgba(215,160,25,0.8)] animate-pulse" />
            <span className="text-[13px] font-extrabold uppercase tracking-[0.2em] text-brand-gold">Operations Architecture</span>
          </div>
          <h1 className="font-display text-2xl font-black text-brand-navy tracking-tight">Business Division Desks</h1>
          <p className="text-xs text-brand-textLight mt-0.5">Specialized department command centers for admissions, visas, legalizations, and pilgrimage.</p>
        </div>
        <div className="flex items-center gap-2 rounded-2xl bg-white/80 border border-brand-navy/15 px-4 py-2 text-xs font-bold text-brand-navy shadow-xs backdrop-blur-md">
          <span className={`h-2 w-2 rounded-full ${activeCount > 0 ? 'bg-emerald-500 animate-pulse' : 'bg-rose-500'}`} />
          <span>{activeCount} / {divisions.length} Operational Desks Live</span>
        </div>
      </div>

      {/* Grid of Elevated Division Launch Cards */}
      <div className="reveal grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {visible.map((d) => {
          const isLive = enabledMap[d.key] === true;
          return (
          <div
            key={d.key}
            onClick={() => setLocation(`/divisions/${d.key}`)}
            className="group relative flex flex-col justify-between rounded-2xl border border-brand-navy/15 bg-white p-6 shadow-sm hover:shadow-xl hover:border-brand-gold/60 transition-all duration-300 cursor-pointer overflow-hidden backdrop-blur-sm"
          >
            {/* Top gradient glow overlay */}
            <div className={`absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r ${d.accentColor} group-hover:h-2 transition-all duration-300`} />

            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="grid h-14 w-14 place-items-center rounded-2xl bg-[#FAF8F4] border border-brand-navy/10 text-3xl shadow-inner group-hover:scale-105 group-hover:rotate-2 transition-all duration-300">
                  {d.icon}
                </div>
                <div className="flex items-center gap-1.5">
                  <span className={`rounded-full border px-2.5 py-0.5 text-xs font-extrabold uppercase tracking-wider ${
                    isLive ? 'bg-emerald-500/10 text-emerald-700 border-emerald-500/20' : 'bg-slate-100 text-slate-500 border-slate-200'
                  }`}>
                    {isLive ? '● Live' : '○ Closed'}
                  </span>
                  <span className={`rounded-full border px-3 py-1 text-[13px] font-extrabold uppercase tracking-wider ${d.badgeBg}`}>
                    {d.category}
                  </span>
                </div>
              </div>

              <div>
                <h3 className="font-display text-lg font-black text-brand-navy group-hover:text-brand-gold transition-colors">
                  {d.label}
                </h3>
                <p className="text-xs text-brand-textLight leading-relaxed mt-1 line-clamp-2">
                  {d.desc}
                </p>
              </div>

              {/* Live Metric Pills */}
              <div className="flex flex-wrap items-center gap-2 pt-2">
                {(() => {
                  const st = stats[d.key];
                  const items: [string, number][] = [];
                  if (st?.applications !== undefined) items.push(['📄 Apps', st.applications]);
                  if (st?.bookings !== undefined) items.push(['🕋 Bookings', st.bookings]);
                  if (st?.deployments !== undefined) items.push(['👷 Deployments', st.deployments]);
                  if (st?.quoteRequests !== undefined) items.push(['📨 Quotes', st.quoteRequests]);
                  if (st?.inProgress !== undefined) items.push(['🔄 In Progress', st.inProgress]);

                  if (items.length === 0) {
                    return (
                      <span className="rounded-lg bg-brand-navy/[0.04] border border-brand-navy/10 px-2.5 py-1 text-[13px] font-bold text-brand-navy/60">
                        ⚡ Active Pipeline
                      </span>
                    );
                  }

                  return items.map(([label, n]) => (
                    <span
                      key={label}
                      className="rounded-lg bg-brand-navy/[0.04] border border-brand-navy/15 px-2.5 py-1 text-[13px] font-black text-brand-navy"
                    >
                      {label}: <span className="text-brand-gold">{n}</span>
                    </span>
                  ));
                })()}
              </div>
            </div>

            {/* Bottom Premium Action Button */}
            <div className="mt-6 pt-4 border-t border-brand-navy/10">
              <div className="w-full py-2.5 px-4 rounded-xl bg-brand-navy group-hover:bg-gradient-to-r group-hover:from-brand-gold group-hover:to-amber-500 group-hover:text-brand-navy text-white text-xs font-black uppercase tracking-wider flex items-center justify-between transition-all duration-300 shadow-xs">
                <span>Launch Division Desk</span>
                <span className="transform group-hover:translate-x-1 transition-transform">→</span>
              </div>
            </div>
          </div>
          );
        })}

        {visible.length === 0 && (
          <div className="col-span-full py-16 text-center rounded-2xl border border-dashed border-brand-navy/20 bg-white p-8">
            <p className="text-sm font-bold text-brand-navy">No Business Divisions Accessible</p>
            <p className="text-xs text-brand-textLight mt-1">Please contact your workspace administrator to assign division privileges.</p>
          </div>
        )}
      </div>
    </div>
  );
}
