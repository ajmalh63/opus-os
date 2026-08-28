import { useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import gsap from 'gsap';
const API = (import.meta as any).env?.VITE_API_URL || 'https://opusos-api.ajmalsn63.workers.dev';

// A-5: session-driven auth — read the live better-auth cookie; no forged admin token.


interface FunnelStage { stage: string; count: number; reachedStage: number; conversionRate: number; }
interface StaleLead { clientId: string; name: string; phone: string; division: string; stageKey: string; ageDays: number; lastTouchAt: number | null; outstandingBalance: number; }
interface PartnerAttr { clientId: string; partnerId: string; partnerName: string; referralCode: string | null; converted: boolean; commissionRate: number; commissionStatus: string; commissionPaise: number; }
interface FunnelData {
  totalLeads: number; customers: number; leadToCustomer: number; staleCount: number;
  funnel: FunnelStage[]; velocity: Record<string, number>; stale: StaleLead[];
  partnerAttribution: PartnerAttr[];
}
interface PartnerRow { partnerId: string; name: string; referralCode: string | null; status: string; referrals: number; converted: number; conversionRate: number; commissionPaise: number; commissionPendingCount: number; }
interface ExperimentRow {
  key: string; name: string; hypothesis: string; primaryMetric: string;
  baselineRate: number; mde: number; variantA: string; variantB: string;
  status: string; startedAt: number | null;
  variants: { A: { assigned: number; converted: number; rate: number }; B: { assigned: number; converted: number; rate: number } };
}

const STAGE_LABELS: Record<string, string> = {
  lead: 'Lead', qualified: 'Qualified', documents: 'Documents', processing: 'Processing', complete: 'Complete'
};

const inr = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { style: 'currency', currency: 'INR' })}`.replace('₹₹', '₹');

export default function FunnelTab() {
  const rootRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const { data, isLoading, isError } = useQuery<FunnelData>({
    queryKey: ['funnelOverview'],
    queryFn: async () => { const r = await fetch(`${API}/api/marketing/funnel`, { credentials: 'include' }); if (!r.ok) throw new Error('load failed'); return r.json(); }
  });

  const { data: partnerData } = useQuery<{ partners: PartnerRow[] }>({
    queryKey: ['affiliateLeaderboard'],
    queryFn: async () => { const r = await fetch(`${API}/api/marketing/partners`, { credentials: 'include' }); if (!r.ok) throw new Error('load failed'); return r.json(); }
  });

  const reactivate = useMutation({
    mutationFn: async (clientId: string) => {
      const r = await fetch(`${API}/api/marketing/stale/${clientId}/reactivate`, { method: 'POST', });
      if (!r.ok) { const e = await r.json().catch(() => null); throw new Error(e?.error || 'Reactivation failed'); }
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['funnelOverview'] }); },
    onError: (e: any) => console.error((e as Error).message),
  });

  const { data: expData } = useQuery<{ experiments?: ExperimentRow[] }>({
    queryKey: ['experiments'],
    queryFn: async () => { const r = await fetch(`${API}/api/marketing/experiments`, { credentials: 'include' }); if (!r.ok) throw new Error('load failed'); return r.json(); }
  });

  useEffect(() => {
    if (!data) return;
    const kpis = [data.totalLeads, data.customers, data.customers, data.leadToCustomer];
    const ctx = gsap.context(() => {
      gsap.fromTo('.kpi-num', { innerText: 0 }, {
        innerText: (i: number) => (i === 3 ? kpis[3] : kpis[i]),
        snap: { innerText: 1 }, duration: 1.2, ease: 'power2.out', stagger: 0.12
      });
      gsap.from('.funnel-bar', { width: 0, duration: 0.9, ease: 'power3.out', stagger: 0.08 });
      gsap.from('.panel-entrance', { y: 20, opacity: 0, duration: 0.7, ease: 'power3.out', stagger: 0.1 });
    }, rootRef);
    return () => ctx.revert();
  }, [data]);

  if (isLoading) return <div className="p-12 text-center text-xs text-brand-navy/40">Crunching funnel metrics...</div>;
  if (isError || !data) {
    return (
      <div className="p-12 text-center text-xs text-rose-600 bg-rose-50 border border-rose-200/50 rounded-lg">
        Failed to load funnel analytics. Check super-admin credentials.
      </div>
    );
  }

  const engaged = (data.funnel || []).filter(s => s.stage !== 'lead').reduce((a, s) => a + s.count, 0);
  const partners = partnerData?.partners || [];

  return (
    <div ref={rootRef} className="space-y-6">
      {/* Header */}
      <div className="flex items-end justify-between">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="gold-dot" />
            <h2 className="font-display text-xl font-bold text-brand-navy">Sales Funnel</h2>
          </div>
          <p className="text-xs text-brand-navy/40 mt-1">Lead to Customer conversion across all divisions. Generated {new Date((data as any).generatedAt * 1000).toLocaleString()}</p>
        </div>
        {data.staleCount > 0 && (
          <span className="text-[13px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full bg-rose-50 border border-rose-200/60 text-rose-700">
            {data.staleCount} stale lead{data.staleCount > 1 ? 's' : ''} need attention
          </span>
        )}
      </div>

      {/* KPI band */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: 'Total Leads', value: data.totalLeads, suffix: '' },
          { label: 'Engaged Pipeline', value: engaged, suffix: '' },
          { label: 'Signed Customers', value: data.customers, suffix: '' },
          { label: 'Lead -> Customer', value: data.leadToCustomer, suffix: '%' },
        ].map((kpi) => (
          <div key={kpi.label} className="panel-entrance rounded-2xl border border-brand-navy/10 bg-white p-5 shadow-[0_16px_40px_-22px_rgba(3,8,20,0.8)]">
            <p className="text-[13px] font-bold uppercase tracking-[0.18em] text-brand-gold">{kpi.label}</p>
            <p className="kpi-num font-display font-bold text-2xl md:text-3xl text-brand-gold mt-2">
              0{kpi.suffix}
            </p>
          </div>
        ))}
      </div>

      {/* Stage bars + velocity */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="panel-entrance lg:col-span-2 rounded-2xl border border-brand-navy/10 bg-white p-6 shadow-[0_16px_40px_-22px_rgba(3,8,20,0.8)]">
          <h3 className="text-[13px] font-bold uppercase tracking-[0.18em] text-brand-gold mb-5">Pipeline Stages</h3>
          <div className="space-y-4">
            {data.funnel.map((s) => {
              const rate = Math.min(100, Math.max(0, s.conversionRate));
              return (
                <div key={s.stage}>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-brand-navy/70 font-semibold">{STAGE_LABELS[s.stage] || s.stage}</span>
                    <span className="text-brand-navy/40">
                      {s.count} active · <span className="text-brand-gold">{s.conversionRate}%</span> of leads
                    </span>
                  </div>
                  <div className="h-2.5 rounded-full bg-white overflow-hidden">
                    <div className="funnel-bar h-full rounded-full bg-gradient-to-r from-brand-gold to-brand-gold-hover" style={{ width: `${rate}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="panel-entrance rounded-2xl border border-brand-navy/10 bg-white p-6 shadow-[0_16px_40px_-22px_rgba(3,8,20,0.8)]">
          <h3 className="text-[13px] font-bold uppercase tracking-[0.18em] text-brand-gold mb-5">Avg Days in Stage</h3>
          <div className="space-y-3">
            {data.funnel.map((s) => (
              <div key={s.stage} className="flex items-center justify-between">
                <span className="text-xs text-brand-navy/40">{STAGE_LABELS[s.stage] || s.stage}</span>
                <span className="text-sm font-display font-bold text-brand-navy">{data.velocity?.[s.stage] ?? 0}d</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Stale recovery queue */}
      <div className="panel-entrance rounded-2xl border border-brand-navy/10 bg-white overflow-hidden shadow-[0_16px_40px_-22px_rgba(3,8,20,0.8)]">
        <div className="px-6 py-4 border-b border-brand-navy/[0.08] flex items-center justify-between">
          <h3 className="text-[13px] font-bold uppercase tracking-[0.18em] text-brand-gold">Stale Lead Recovery Queue</h3>
          <span className="text-[13px] text-brand-navy/40">Untouched &gt; 7 days</span>
        </div>
        {data.stale.length === 0 ? (
          <p className="p-8 text-center text-xs text-brand-navy/40">No stale leads — follow-up discipline is on point.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-brand-navy/[0.04] border-b border-brand-navy/[0.08] text-[13px] text-brand-gold uppercase tracking-wider font-semibold">
                  <th className="p-4">Client</th>
                  <th className="p-4">Division</th>
                  <th className="p-4">Stage</th>
                  <th className="p-4">Age</th>
                  <th className="p-4">Outstanding</th>
                  <th className="p-4">Action</th>
                </tr>
              </thead>
              <tbody>
                {data.stale.map((s) => (
                  <tr key={s.clientId} className="border-b border-brand-navy/[0.08] last:border-0 hover:bg-brand-navy/[0.04]">
                    <td className="p-4">
                      <p className="text-brand-navy font-semibold">{s.name}</p>
                      <p className="text-[13px] text-brand-navy/40">{s.phone} · {s.clientId}</p>
                    </td>
                    <td className="p-4 text-brand-navy/40 capitalize">{s.division.replace('-', ' ')}</td>
                    <td className="p-4"><span className="text-[13px] uppercase font-bold px-2 py-1 rounded-full bg-brand-navy/[0.06] border border-brand-navy/10 text-brand-navy/70">{s.stageKey}</span></td>
                    <td className={`p-4 font-bold ${s.ageDays > 14 ? 'text-rose-600' : 'text-amber-700'}`}>{s.ageDays}d</td>
                    <td className="p-4 text-brand-navy">{inr(s.outstandingBalance)}</td>
                    <td className="p-4">
                      <button
                        onClick={() => reactivate.mutate(s.clientId)}
                        disabled={reactivate.isPending}
                        className="text-[13px] font-bold uppercase tracking-wider px-3 py-1.5 rounded-full bg-brand-gold/10 border border-brand-gold/40 text-brand-gold hover:bg-brand-gold hover:text-brand-navy transition-all disabled:opacity-40"
                      >
                        {reactivate.isPending ? '-' : 'Reactivate'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Affiliate leaderboard */}
      <div className="panel-entrance rounded-2xl border border-brand-navy/10 bg-white overflow-hidden shadow-[0_16px_40px_-22px_rgba(3,8,20,0.8)]">
        <div className="px-6 py-4 border-b border-brand-navy/[0.08] flex items-center justify-between">
          <h3 className="text-[13px] font-bold uppercase tracking-[0.18em] text-brand-gold">Partner Affiliate Leaderboard</h3>
          <span className="text-[13px] text-brand-navy/40">Section 39 · commission</span>
        </div>
        {partners.length === 0 ? (
          <p className="p-8 text-center text-xs text-brand-navy/40">No partners registered yet — share your affiliate link to start.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-brand-navy/[0.04] border-b border-brand-navy/[0.08] text-[13px] text-brand-gold uppercase tracking-wider font-semibold">
                  <th className="p-4">Partner</th>
                  <th className="p-4">Code</th>
                  <th className="p-4">Referrals</th>
                  <th className="p-4">Converted</th>
                  <th className="p-4">Conv %</th>
                  <th className="p-4">Commission</th>
                </tr>
              </thead>
              <tbody>
                {partners.map((p) => (
                  <tr key={p.partnerId} className="border-b border-brand-navy/[0.08] last:border-0 hover:bg-brand-navy/[0.04]">
                    <td className="p-4 text-brand-navy font-semibold">{p.name}</td>
                    <td className="p-4"><span className="text-[13px] font-bold px-2 py-1 rounded-full bg-brand-gold/10 border border-brand-gold/40 text-brand-gold">{p.referralCode || '—'}</span></td>
                    <td className="p-4 text-brand-navy">{p.referrals}</td>
                    <td className="p-4 text-brand-navy">{p.converted}</td>
                    <td className="p-4 text-brand-navy">{p.conversionRate}%</td>
                    <td className="p-4 text-brand-gold font-bold">{inr(p.commissionPaise)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* A/B experiments (Funnel#5) */}
      <div className="panel-entrance rounded-2xl border border-brand-navy/10 bg-white overflow-hidden shadow-[0_16px_40px_-22px_rgba(3,8,20,0.8)]">
        <div className="px-6 py-4 border-b border-brand-navy/[0.08] flex items-center justify-between">
          <h3 className="text-[13px] font-bold uppercase tracking-[0.18em] text-brand-gold">A/B Experiments</h3>
          <span className="text-[13px] text-brand-navy/40">locked hypothesis · no peeking</span>
        </div>
        {!expData || !expData.experiments || expData.experiments.length === 0 ? (
          <p className="p-8 text-center text-xs text-brand-navy/40">No experiments yet. Create one with a locked hypothesis + baseline + MDE.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-brand-navy/[0.04] border-b border-brand-navy/[0.08] text-[13px] text-brand-gold uppercase tracking-wider font-semibold">
                  <th className="p-4">Experiment</th>
                  <th className="p-4">Status</th>
                  <th className="p-4">Variant A</th>
                  <th className="p-4">Variant B</th>
                  <th className="p-4">Primary Metric</th>
                </tr>
              </thead>
              <tbody>
                {expData.experiments.map((e) => (
                  <tr key={e.key} className="border-b border-brand-navy/[0.08] last:border-0 hover:bg-brand-navy/[0.04]">
                    <td className="p-4">
                      <p className="text-brand-navy font-semibold">{e.name}</p>
                      <p className="text-[13px] text-brand-navy/40 max-w-md">{e.hypothesis}</p>
                    </td>
                    <td className="p-4">
                      <span className={`text-[13px] font-bold uppercase px-2 py-1 rounded-full ${e.status === 'active' ? 'bg-emerald-500/10 text-emerald-700 border border-emerald-500/30' : 'bg-brand-navy/[0.06] text-brand-navy/70'}`}>
                        {e.status}
                      </span>
                    </td>
                    <td className="p-4">
                      <p className="text-brand-navy">{e.variantA}</p>
                      <p className="text-[13px] text-brand-gold">{e.variants.A.assigned} assigned · {e.variants.A.rate}% {e.primaryMetric}</p>
                    </td>
                    <td className="p-4">
                      <p className="text-brand-navy">{e.variantB}</p>
                      <p className="text-[13px] text-brand-gold">{e.variants.B.assigned} assigned · {e.variants.B.rate}% {e.primaryMetric}</p>
                    </td>
                    <td className="p-4 text-brand-navy/40">{e.primaryMetric}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
