import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// Partner Command Center (owner, Thrive-equivalent) — 4 tabs:
//  Partners (registry + approve/block) · Tiers (ladder editor) ·
//  Commissions (per inventory type/item/partner rates) · Analytics (progress).

const AUTH = {
  get Cookie() {
    const s = document.cookie.split(';').map((p: string) => p.trim()).find((p: string) => p.startsWith('better-auth.session_token='));
    return s || '';
  }
} as Record<string, string>;

interface PartnerRow { id: string; name: string; panNumber: string; status: string; referralCode: string | null; }
interface AnalyticsRow {
  id: string; name: string; status: string; referralCode: string | null;
  points: number; tier: string; tierName: string; tierBoost: number; nextTier: string | null;
  clicks: number; linkCount: number; referrals: number; earnedPaise: number; paidPaise: number; joinedAt: number;
}
interface TierRow { id: string; key: string; name: string; minPoints: number; commissionBoostPct: number; perksJson: string; color: string; order: number; }
interface PlanRow { id: string; partnerId: string | null; catalogType: string; catalogItemId: string | null; ratePct: number; }
interface PayoutRow { id: string; partnerId: string; partnerName: string; amountPaise: number; status: 'requested' | 'approved' | 'paid' | 'rejected'; note: string | null; requestedAt: number; resolvedAt: number | null; }

const rs = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const TIER_COLORS: Record<string, string> = { bronze: '#b87333', silver: '#8b8b8b', gold: '#d7a019', platinum: '#5b6b8a' };

export default function PartnerAdminPanel() {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'partners' | 'tiers' | 'plans' | 'analytics' | 'payouts'>('partners');
  const [toast, setToast] = useState('');

  const flash = (m: string) => { setToast(m); setTimeout(() => setToast(''), 4000); };

  const { data: registry } = useQuery<{ partners: PartnerRow[] }>({
    queryKey: ['adminPartners'],
    queryFn: async () => { const r = await fetch('/api/admin/partners', { headers: AUTH }); if (!r.ok) throw new Error('registry'); return r.json(); },
  });

  const { data: analytics } = useQuery<{ analytics: AnalyticsRow[] }>({
    queryKey: ['adminPartnerAnalytics'],
    queryFn: async () => { const r = await fetch('/api/admin/partners/analytics', { headers: AUTH }); if (!r.ok) throw new Error('analytics'); return r.json(); },
  });

  const { data: tiers } = useQuery<{ tiers: TierRow[] }>({
    queryKey: ['adminPartnerTiers'],
    queryFn: async () => { const r = await fetch('/api/admin/partners/tiers', { headers: AUTH }); if (!r.ok) throw new Error('tiers'); return r.json(); },
  });

  const { data: plans } = useQuery<{ plans: PlanRow[]; partners: { id: string; name: string }[] }>({
    queryKey: ['adminCommissionPlans'],
    queryFn: async () => { const r = await fetch('/api/admin/partners/plans', { headers: AUTH }); if (!r.ok) throw new Error('plans'); return r.json(); },
  });

  const setStatus = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const r = await fetch(`/api/admin/partners/${id}/status`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...AUTH }, body: JSON.stringify({ status }) });
      if (!r.ok) throw new Error('status');
      return r.json();
    },
    onSuccess: (d) => { flash(d.message || 'Updated'); queryClient.invalidateQueries({ queryKey: ['adminPartners'] }); },
  });

  // tier editor form
  const [tierForm, setTierForm] = useState({ id: '', key: '', name: '', minPoints: 0, commissionBoostPct: 0, perksJson: '[]', color: '#d7a019', order: 1 });
  const saveTier = useMutation({
    mutationFn: async () => {
      const r = await fetch('/api/admin/partners/tiers', { method: 'POST', headers: { 'Content-Type': 'application/json', ...AUTH }, body: JSON.stringify(tierForm) });
      if (!r.ok) throw new Error('tier');
      return r.json();
    },
    onSuccess: (d) => { flash(d.message); queryClient.invalidateQueries({ queryKey: ['adminPartnerTiers'] }); queryClient.invalidateQueries({ queryKey: ['adminPartnerAnalytics'] }); },
    onError: (e: any) => flash((e as Error).message),
  });

  // commission plan form
  const [planForm, setPlanForm] = useState({ partnerId: '', catalogType: '*', catalogItemId: '', ratePct: 5 });
  const savePlan = useMutation({
    mutationFn: async () => {
      const r = await fetch('/api/admin/partners/plans', { method: 'POST', headers: { 'Content-Type': 'application/json', ...AUTH }, body: JSON.stringify({ ...planForm, partnerId: planForm.partnerId || null, catalogItemId: planForm.catalogItemId || null }) });
      if (!r.ok) throw new Error('plan');
      return r.json();
    },
    onSuccess: (d) => { flash(d.message); queryClient.invalidateQueries({ queryKey: ['adminCommissionPlans'] }); },
    onError: (e: any) => flash((e as Error).message),
  });
  const delPlan = useMutation({
    mutationFn: async (id: string) => { const r = await fetch(`/api/admin/partners/plans/${id}`, { method: 'DELETE', headers: AUTH }); if (!r.ok) throw new Error('del'); return r.json(); },
    onSuccess: () => { flash('Plan removed'); queryClient.invalidateQueries({ queryKey: ['adminCommissionPlans'] }); },
  });

  const { data: payouts } = useQuery<{ payouts: PayoutRow[] }>({
    queryKey: ['adminPartnerPayouts'],
    queryFn: async () => { const r = await fetch('/api/admin/partners/payouts', { headers: AUTH }); if (!r.ok) throw new Error('payouts'); return r.json(); },
  });

  const resolvePayout = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const r = await fetch(`/api/admin/partners/payouts/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json', ...AUTH }, body: JSON.stringify({ status }) });
      if (!r.ok) throw new Error('payout');
      return r.json();
    },
    onSuccess: (d) => { flash(d.message || 'Payout updated'); queryClient.invalidateQueries({ queryKey: ['adminPartnerPayouts'] }); },
  });

  const tabs: { id: typeof tab; label: string }[] = [
    { id: 'partners', label: 'Partners' },
    { id: 'tiers', label: 'Tiers' },
    { id: 'plans', label: 'Commissions' },
    { id: 'analytics', label: 'Analytics' },
    { id: 'payouts', label: 'Payouts' },
  ];

  return (
    <div className="space-y-6">
      {toast && <div className="fixed right-4 top-4 z-50 rounded-lg bg-brand-navy px-4 py-2 text-xs font-bold text-white shadow-xl">{toast}</div>}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-gold">Partner Program</p>
          <h2 className="mt-1 font-display text-xl font-extrabold tracking-tight text-brand-navy">Partner Command Center</h2>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {tabs.map((t) => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={`rounded-full px-4 py-2 text-[11px] font-bold transition-all ${tab === t.id ? 'bg-brand-navy text-white' : 'border border-brand-navy/15 text-slate-600 hover:border-brand-gold hover:text-brand-gold'}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* PARTNERS TAB */}
      {tab === 'partners' && (
        <div className="overflow-x-auto rounded-2xl border border-brand-navy/10 bg-white shadow-[0_20px_40px_-20px_rgba(10,45,80,0.12)]">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-brand-navy/10 bg-[#FAF8F4] text-[10px] uppercase tracking-wider text-slate-500">
                <th className="px-5 py-3">Partner</th>
                <th className="px-5 py-3">PAN (masked)</th>
                <th className="px-5 py-3">Code</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {(registry?.partners || []).map((p) => (
                <tr key={p.id} className="border-b border-brand-navy/5 last:border-0 hover:bg-brand-gold/5">
                  <td className="px-5 py-3.5 font-semibold text-brand-navy">{p.name}</td>
                  <td className="px-5 py-3.5 font-mono text-slate-500">{p.panNumber}</td>
                  <td className="px-5 py-3.5"><span className="rounded-full border border-brand-gold/40 bg-brand-gold/10 px-2 py-0.5 font-mono text-[10px] text-brand-gold">{p.referralCode || '—'}</span></td>
                  <td className="px-5 py-3.5">
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${p.status === 'active' ? 'bg-emerald-500/15 text-emerald-700' : 'bg-rose-500/15 text-rose-700'}`}>{p.status}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    {p.status === 'active'
                      ? <button onClick={() => setStatus.mutate({ id: p.id, status: 'blocked' })} className="rounded-full border border-rose-500/40 px-3 py-1 text-[9px] font-bold uppercase text-rose-700 hover:bg-rose-600 hover:text-white">Block</button>
                      : <button onClick={() => setStatus.mutate({ id: p.id, status: 'active' })} className="rounded-full border border-emerald-500/40 px-3 py-1 text-[9px] font-bold uppercase text-emerald-700 hover:bg-emerald-600 hover:text-white">Approve</button>}
                  </td>
                </tr>
              ))}
              {(registry?.partners || []).length === 0 && <tr><td colSpan={5} className="px-5 py-10 text-center text-slate-400">No partners yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* TIERS TAB */}
      {tab === 'tiers' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="rounded-2xl border border-brand-navy/10 bg-white p-6 shadow-[0_20px_40px_-20px_rgba(10,45,80,0.12)] lg:col-span-2">
            <h3 className="font-display text-sm font-bold text-brand-navy">VIP ladder</h3>
            <p className="mt-1 text-[10px] text-slate-500">Tiers qualify on loyalty points (lifetime commissions + activity). Boost applies on top of the commission rate.</p>
            <div className="mt-4 space-y-3">
              {(tiers?.tiers || []).map((t) => (
                <div key={t.id} className="flex items-center justify-between gap-3 rounded-xl border border-brand-navy/10 bg-[#FAF8F4] p-4">
                  <div className="flex items-center gap-3">
                    <span className="grid h-10 w-10 place-items-center rounded-xl font-display text-sm font-extrabold uppercase text-white" style={{ background: TIER_COLORS[t.key] || t.color }}>{t.key[0]}</span>
                    <div>
                      <div className="text-xs font-bold text-brand-navy">{t.name}</div>
                      <div className="text-[10px] text-slate-500">≥ {(t.minPoints / 100).toLocaleString('en-IN')} pts · +{t.commissionBoostPct}% boost</div>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => setTierForm({ id: t.id, key: t.key, name: t.name, minPoints: t.minPoints, commissionBoostPct: t.commissionBoostPct, perksJson: t.perksJson, color: t.color, order: t.order })}
                      className="rounded-full border border-brand-navy/15 px-3 py-1 text-[9px] font-bold uppercase text-brand-navy hover:border-brand-gold hover:text-brand-gold">Edit</button>
                  </div>
                </div>
              ))}
              {(tiers?.tiers || []).length === 0 && <p className="py-8 text-center text-xs text-slate-400">Ladder seeds on first health check — add tiers below.</p>}
            </div>
          </div>
          <div className="rounded-2xl border border-brand-navy/10 bg-white p-6 shadow-[0_20px_40px_-20px_rgba(10,45,80,0.12)]">
            <h3 className="font-display text-sm font-bold text-brand-navy">{tierForm.id ? 'Edit tier' : 'New tier'}</h3>
            <div className="mt-4 space-y-3">
              {([
                ['key', 'Key (bronze)', tierForm.key, (v: string) => setTierForm({ ...tierForm, key: v })],
                ['name', 'Name', tierForm.name, (v: string) => setTierForm({ ...tierForm, name: v })],
                ['minPoints', 'Min points (₹-equivalents)', String(tierForm.minPoints), (v: string) => setTierForm({ ...tierForm, minPoints: Number(v) || 0 })],
                ['commissionBoostPct', 'Commission boost %', String(tierForm.commissionBoostPct), (v: string) => setTierForm({ ...tierForm, commissionBoostPct: Number(v) || 0 })],
                ['order', 'Order', String(tierForm.order), (v: string) => setTierForm({ ...tierForm, order: Number(v) || 1 })],
              ] as [string, string, string, (v: string) => void][]).map(([k, label, val, set]) => (
                <div key={k}>
                  <label className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-brand-gold">{label}</label>
                  <input value={val} onChange={(e) => set(e.target.value)} className="w-full rounded-lg border border-brand-navy/15 bg-slate-50 px-3 py-2 text-xs text-brand-navy focus:border-brand-gold focus:outline-none" />
                </div>
              ))}
              <div>
                <label className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-brand-gold">Perks JSON</label>
                <input value={tierForm.perksJson} onChange={(e) => setTierForm({ ...tierForm, perksJson: e.target.value })} className="w-full rounded-lg border border-brand-navy/15 bg-slate-50 px-3 py-2 font-mono text-[10px] text-brand-navy focus:border-brand-gold focus:outline-none" />
              </div>
              <div className="flex gap-2">
                <button onClick={() => saveTier.mutate()} disabled={saveTier.isPending} className="flex-1 rounded-full bg-brand-navy py-2.5 text-[10px] font-bold uppercase tracking-wider text-white hover:bg-brand-gold hover:text-brand-navy disabled:opacity-40">
                  {saveTier.isPending ? 'Saving…' : tierForm.id ? 'Update tier' : 'Add tier'}
                </button>
                {tierForm.id && <button onClick={() => setTierForm({ id: '', key: '', name: '', minPoints: 0, commissionBoostPct: 0, perksJson: '[]', color: '#d7a019', order: 1 })} className="rounded-full border border-brand-navy/15 px-4 py-2.5 text-[10px] font-bold text-slate-500 hover:text-brand-navy">Clear</button>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* COMMISSIONS TAB */}
      {tab === 'plans' && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <div className="rounded-2xl border border-brand-navy/10 bg-white p-6 shadow-[0_20px_40px_-20px_rgba(10,45,80,0.12)] lg:col-span-2">
            <h3 className="font-display text-sm font-bold text-brand-navy">Commission plans</h3>
            <p className="mt-1 text-[10px] text-slate-500">Resolution order: partner+item → partner+type → global+item → global+type → 5% default.</p>
            <div className="mt-4 space-y-2">
              {(plans?.plans || []).map((p) => (
                <div key={p.id} className="flex items-center justify-between gap-3 rounded-xl border border-brand-navy/10 bg-[#FAF8F4] px-4 py-3 text-xs">
                  <span className="text-brand-navy">
                    <span className="font-bold">{p.partnerId ? 'Partner-specific' : 'Global'}</span>
                    <span className="text-slate-500"> · {p.catalogType}{p.catalogItemId ? ` / ${p.catalogItemId}` : ''}</span>
                  </span>
                  <span className="flex items-center gap-3">
                    <span className="font-mono font-bold text-brand-gold">{p.ratePct}%</span>
                    <button onClick={() => delPlan.mutate(p.id)} className="rounded-full border border-rose-500/40 px-2.5 py-0.5 text-[9px] font-bold uppercase text-rose-700 hover:bg-rose-600 hover:text-white">Remove</button>
                  </span>
                </div>
              ))}
              {(plans?.plans || []).length === 0 && <p className="py-8 text-center text-xs text-slate-400">No custom plans — partners earn the 5% default. Add rates below.</p>}
            </div>
          </div>
          <div className="rounded-2xl border border-brand-navy/10 bg-white p-6 shadow-[0_20px_40px_-20px_rgba(10,45,80,0.12)]">
            <h3 className="font-display text-sm font-bold text-brand-navy">Set a commission</h3>
            <div className="mt-4 space-y-3">
              <div>
                <label className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-brand-gold">Partner (blank = global)</label>
                <select value={planForm.partnerId} onChange={(e) => setPlanForm({ ...planForm, partnerId: e.target.value })} className="w-full rounded-lg border border-brand-navy/15 bg-slate-50 px-3 py-2 text-xs text-brand-navy focus:border-brand-gold focus:outline-none">
                  <option value="">— All partners (global) —</option>
                  {(plans?.partners || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-brand-gold">Inventory type</label>
                <select value={planForm.catalogType} onChange={(e) => setPlanForm({ ...planForm, catalogType: e.target.value })} className="w-full rounded-lg border border-brand-navy/15 bg-slate-50 px-3 py-2 text-xs text-brand-navy focus:border-brand-gold focus:outline-none">
                  <option value="*">All types</option>
                  <option value="university">Universities</option>
                  <option value="departure">Umrah departures</option>
                  <option value="job">Jobs</option>
                  <option value="attestation">Attestation</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-brand-gold">Item ID (blank = whole type)</label>
                <input value={planForm.catalogItemId} onChange={(e) => setPlanForm({ ...planForm, catalogItemId: e.target.value })} placeholder="e.g. uni-1" className="w-full rounded-lg border border-brand-navy/15 bg-slate-50 px-3 py-2 text-xs text-brand-navy focus:border-brand-gold focus:outline-none" />
              </div>
              <div>
                <label className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-brand-gold">Rate %</label>
                <input type="number" min={0} max={100} value={planForm.ratePct} onChange={(e) => setPlanForm({ ...planForm, ratePct: Number(e.target.value) || 0 })} className="w-full rounded-lg border border-brand-navy/15 bg-slate-50 px-3 py-2 text-xs text-brand-navy focus:border-brand-gold focus:outline-none" />
              </div>
              <button onClick={() => savePlan.mutate()} disabled={savePlan.isPending} className="w-full rounded-full bg-brand-gold py-2.5 text-[10px] font-bold uppercase tracking-wider text-brand-navy hover:bg-brand-1 disabled:opacity-40">
                {savePlan.isPending ? 'Saving…' : 'Save commission plan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ANALYTICS TAB */}
      {tab === 'analytics' && (
        <div className="overflow-x-auto rounded-2xl border border-brand-navy/10 bg-white shadow-[0_20px_40px_-20px_rgba(10,45,80,0.12)]">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-brand-navy/10 bg-[#FAF8F4] text-[10px] uppercase tracking-wider text-slate-500">
                <th className="px-5 py-3">Partner</th>
                <th className="px-5 py-3">Tier</th>
                <th className="px-5 py-3">Points</th>
                <th className="px-5 py-3">Clicks</th>
                <th className="px-5 py-3">Links</th>
                <th className="px-5 py-3">Referrals</th>
                <th className="px-5 py-3">Earned</th>
                <th className="px-5 py-3">Paid</th>
              </tr>
            </thead>
            <tbody>
              {(analytics?.analytics || []).map((a) => (
                <tr key={a.id} className="border-b border-brand-navy/5 last:border-0 hover:bg-brand-gold/5">
                  <td className="px-5 py-3.5">
                    <div className="font-semibold text-brand-navy">{a.name}</div>
                    <div className="text-[9px] text-slate-400">{a.status} · {a.referralCode}</div>
                  </td>
                  <td className="px-5 py-3.5">
                    <span className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[9px] font-bold uppercase" style={{ background: `${TIER_COLORS[a.tier] || '#d7a019'}22`, color: TIER_COLORS[a.tier] || '#d7a019' }}>
                      {a.tierName}{a.tierBoost ? ` +${a.tierBoost}%` : ''}
                    </span>
                    {a.nextTier && <span className="ml-1 text-[9px] text-slate-400">→ {a.nextTier}</span>}
                  </td>
                  <td className="px-5 py-3.5 font-mono font-bold text-brand-gold">{a.points.toLocaleString()}</td>
                  <td className="px-5 py-3.5 text-slate-700">{a.clicks.toLocaleString()}</td>
                  <td className="px-5 py-3.5 text-slate-700">{a.linkCount}</td>
                  <td className="px-5 py-3.5 text-slate-700">{a.referrals}</td>
                  <td className="px-5 py-3.5 font-semibold text-emerald-700">{rs(a.earnedPaise)}</td>
                  <td className="px-5 py-3.5 text-sky-700">{rs(a.paidPaise)}</td>
                </tr>
              ))}
              {(analytics?.analytics || []).length === 0 && <tr><td colSpan={8} className="px-5 py-10 text-center text-slate-400">No partner activity yet.</td></tr>}
            </tbody>
          </table>
        </div>
      )}

      {/* PAYOUTS TAB */}
      {tab === 'payouts' && (
        <div className="overflow-x-auto rounded-2xl border border-brand-navy/10 bg-white shadow-[0_20px_40px_-20px_rgba(10,45,80,0.12)]">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-brand-navy/10 bg-[#FAF8F4] text-[10px] uppercase tracking-wider text-slate-500">
                <th className="px-5 py-3">Partner</th>
                <th className="px-5 py-3">Amount</th>
                <th className="px-5 py-3">Requested</th>
                <th className="px-5 py-3">Status</th>
                <th className="px-5 py-3">Action</th>
              </tr>
            </thead>
            <tbody>
              {(payouts?.payouts || []).map((p) => (
                <tr key={p.id} className="border-b border-brand-navy/5 last:border-0 hover:bg-brand-gold/5">
                  <td className="px-5 py-3.5 font-semibold text-brand-navy">{p.partnerName}</td>
                  <td className="px-5 py-3.5 font-mono font-bold text-brand-gold">{rs(p.amountPaise)}</td>
                  <td className="px-5 py-3.5 text-slate-500">{new Date(p.requestedAt * 1000).toLocaleDateString()}</td>
                  <td className="px-5 py-3.5">
                    <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${p.status === 'paid' ? 'bg-emerald-500/15 text-emerald-700' : p.status === 'requested' ? 'bg-amber-500/15 text-amber-700' : p.status === 'rejected' ? 'bg-rose-500/15 text-rose-700' : 'bg-sky-500/15 text-sky-700'}`}>{p.status}</span>
                  </td>
                  <td className="px-5 py-3.5">
                    {p.status === 'requested' && (
                      <span className="flex gap-2">
                        <button onClick={() => resolvePayout.mutate({ id: p.id, status: 'paid' })} className="rounded-full border border-emerald-500/40 px-3 py-1 text-[9px] font-bold uppercase text-emerald-700 hover:bg-emerald-600 hover:text-white">Pay</button>
                        <button onClick={() => resolvePayout.mutate({ id: p.id, status: 'rejected' })} className="rounded-full border border-rose-500/40 px-3 py-1 text-[9px] font-bold uppercase text-rose-700 hover:bg-rose-600 hover:text-white">Reject</button>
                      </span>
                    )}
                  </td>
                </tr>
              ))}
              {(payouts?.payouts || []).length === 0 && <tr><td colSpan={5} className="px-5 py-10 text-center text-slate-400">No payout requests yet — partners request them from their workspace.</td></tr>}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}