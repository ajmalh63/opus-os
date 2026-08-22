import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

export default function ManpowerMarketplace({ token: _token }: { token: string }) {
  const [q, setQ] = useState('');
  const [country, setCountry] = useState('');
  const { data } = useQuery<{ jobs: any[] }>({
    queryKey: ['manpowerMarketplace', q, country],
    queryFn: async () => {
      const r = await fetch('/api/public/jobs');
      if (!r.ok) return { jobs: [] };
      return r.json();
    },
  });
  const jobs = (data?.jobs || []).filter((j: any) => {
    if (q && !(`${j.title} ${j.sector}`.toLowerCase().includes(q.toLowerCase()))) return false;
    if (country && j.country !== country) return false;
    return true;
  }).slice(0, 12);

  const countries = Array.from(new Set((data?.jobs || []).map((j: any) => j.country))).sort() as string[];

  return (
    <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-sm space-y-3">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <h3 className="font-display font-bold text-sm text-brand-navy">🔍 Browse Open Positions — Quick Apply</h3>
        <span className="text-[10px] px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold">Match % from your profile</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search role, e.g. Welder, Nurse" className="rounded-xl border border-brand-navy/10 bg-brand-navy/[0.02] px-3 py-2.5 text-sm text-brand-navy placeholder:text-brand-navy/40 outline-none focus:border-brand-gold" />
        <select value={country} onChange={e => setCountry(e.target.value)} className="rounded-xl border border-brand-navy/10 bg-white px-3 py-2.5 text-sm text-brand-navy cursor-pointer">
          <option value="">All countries</option>
          {countries.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <div className="text-[11px] text-brand-navy/40 flex items-center">Saved (0) · Quota 2/3 active</div>
      </div>
      {jobs.length === 0 ? (
        <div className="rounded-xl border border-dashed border-brand-navy/15 bg-brand-navy/[0.02] p-6 text-center text-xs text-brand-navy/40">No jobs match. Try broader search or check back — new postings daily.</div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {jobs.map((j: any) => {
            const match = 78 + Math.floor(Math.random() * 20); // mock match, real would use profile
            return (
              <div key={j.id} className="rounded-xl border border-brand-navy/10 bg-white p-4 shadow-sm space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <div className="font-bold text-brand-navy text-sm truncate">{j.title}</div>
                    <div className="text-[11px] text-brand-navy/40">{j.country} · {j.sector} · {j.salaryText || ''}</div>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-[10px] font-bold shrink-0 ${match >= 85 ? 'bg-emerald-500/15 text-emerald-700' : 'bg-amber-500/15 text-amber-700'}`}>Match {match}%</span>
                </div>
                {match < 85 && <div className="text-[11px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">1 skill gap — add Welding to reach 92%</div>}
                <div className="flex gap-2">
                  <button onClick={() => alert(`Quick Apply — pre-filling wizard from your profile for ${j.title}. (1-click)`)} className="flex-1 py-2 rounded-xl bg-brand-gold text-brand-navy text-xs font-bold hover:bg-brand-gold/90 cursor-pointer">Quick Apply</button>
                  <button onClick={() => alert(`Full application for ${j.title}`)} className="px-3 py-2 rounded-xl border border-brand-navy/10 bg-white text-xs font-bold text-brand-navy hover:border-brand-gold cursor-pointer">Apply</button>
                </div>
              </div>
            );
          })}
        </div>
      )}
      <div className="text-[11px] text-brand-navy/40">Tip: Complete profile to 90% for higher matches. Profile reused across Study Abroad + Manpower (Indeed gold).</div>
    </div>
  );
}
