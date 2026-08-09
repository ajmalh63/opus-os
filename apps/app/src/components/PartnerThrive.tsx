import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// Zoho Thrive-style partner workspace surfaces:
//  - VIP tier card + points progress to next tier
//  - My Inventory: browse the public catalog, create share links, copy them
//  - Performance strip: clicks, links, tier commission boost

interface CatalogItem { type: string; id: string; title: string; pricePaise: number; meta?: any; }
interface PartnerLink { id: string; catalogType: string; catalogItemId: string; title: string; pricePaise: number; clicks: number; createdAt: number; lastClickedAt: number | null; }
interface ThriveSummary {
  ref: string | null;
  tier: { key: string; name: string; minPoints: number; boostPct: number; perks: string[]; color: string } | null;
  nextTier: { key: string; name: string; minPoints: number } | null;
  totalPoints: number;
  progressPct: number;
  totalClicks: number;
  linkCount: number;
}
interface PayoutRow { id: string; partnerId: string; amountPaise: number; status: 'requested' | 'approved' | 'paid' | 'rejected'; note: string | null; requestedAt: number; resolvedAt: number | null; }

const rs = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const TYPES: Record<string, string> = { university: 'Universities', departure: 'Umrah Departures', job: 'Job Openings', attestation: 'Attestation' };

export default function PartnerThrive({ partnerId, token, maturedPaise = 0, onNotice }: { partnerId: string; token: string; maturedPaise?: number; onNotice?: (msg: string, ok?: boolean) => void }) {
  const queryClient = useQueryClient();
  const [activeType, setActiveType] = useState('university');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const notice = onNotice || ((m: string, _ok?: boolean) => alert(m));

  const AUTH = { Authorization: `Bearer ${token}` };

  const { data: catalog } = useQuery<{ items: CatalogItem[] }>({
    queryKey: ['partnerCatalog'],
    queryFn: async () => { const r = await fetch('/api/public/catalog', { headers: AUTH }); if (!r.ok) throw new Error('catalog'); return r.json(); },
  });

  const { data: thrive } = useQuery<ThriveSummary>({
    queryKey: ['partnerThrive', partnerId],
    queryFn: async () => { const r = await fetch(`/api/public/partners/${partnerId}/thrive`, { headers: AUTH }); if (!r.ok) throw new Error('thrive'); return r.json(); },
  });

  const { data: links } = useQuery<{ links: PartnerLink[] }>({
    queryKey: ['partnerLinks', partnerId],
    queryFn: async () => { const r = await fetch(`/api/public/partners/${partnerId}/links`, { headers: AUTH }); if (!r.ok) throw new Error('links'); return r.json(); },
  });

  const { data: payouts } = useQuery<{ payouts: PayoutRow[] }>({
    queryKey: ['partnerPayouts', partnerId],
    queryFn: async () => { const r = await fetch(`/api/public/partners/${partnerId}/payouts`, { headers: AUTH }); if (!r.ok) throw new Error('payouts'); return r.json(); },
  });

  const requestPayout = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/public/partners/${partnerId}/payouts`, { method: 'POST', headers: { ...AUTH, 'Content-Type': 'application/json' } });
      if (!r.ok) { const e = await r.json().catch(() => null); throw new Error(e?.error || 'Request failed'); }
      return r.json();
    },
    onSuccess: (d) => { queryClient.invalidateQueries({ queryKey: ['partnerPayouts', partnerId] }); notice(d.message || 'Payout requested'); },
    onError: (e: any) => notice((e as Error).message, false),
  });

  const createLink = useMutation({
    mutationFn: async (item: CatalogItem) => {
      const r = await fetch(`/api/public/partners/${partnerId}/links`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...AUTH },
        body: JSON.stringify({ catalogType: item.type, catalogItemId: item.id, title: item.title, pricePaise: item.pricePaise || 0 }),
      });
      if (!r.ok) throw new Error('create link');
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['partnerLinks', partnerId] }); queryClient.invalidateQueries({ queryKey: ['partnerThrive', partnerId] }); },
  });

  const copy = async (link: string, id: string) => {
    try { await navigator.clipboard.writeText(`${location.origin}${link}`); } catch { /* fallback */ }
    setCopiedId(id); setTimeout(() => setCopiedId(null), 2000);
  };

  const items = (catalog?.items || []).filter((i) => i.type === activeType);
  const myLinks = links?.links || [];
  const tier = thrive?.tier;
  const next = thrive?.nextTier;

  return (
    <div className="space-y-8">
      {/* VIP TIER CARD — Thrive's tier + progress pattern */}
      <section className="relative overflow-hidden rounded-[2rem] border border-brand-navy/10 bg-white p-8 shadow-[0_24px_60px_-30px_rgba(10,45,80,0.25)]">
        <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-brand-gold/10 blur-3xl" aria-hidden="true" />
        <div className="relative z-10 flex flex-wrap items-center justify-between gap-6">
          <div className="flex items-center gap-5">
            <span className="grid h-16 w-16 place-items-center rounded-2xl font-display text-lg font-extrabold uppercase text-white" style={{ background: tier?.color || '#b87333' }}>
              {tier?.key?.[0] || 'B'}
            </span>
            <div>
              <div className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-gold">Loyalty tier</div>
              <h2 className="mt-1 font-display text-2xl font-extrabold tracking-tight">{tier?.name || 'Bronze Partner'}</h2>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {(tier?.perks || []).map((p) => (
                  <span key={p} className="rounded-full border border-brand-gold/40 bg-brand-gold/10 px-2 py-0.5 text-[9px] font-bold text-brand-navy/70">{p}</span>
                ))}
              </div>
            </div>
          </div>
          <div className="text-right">
            <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Loyalty points</div>
            <div className="font-display text-3xl font-extrabold text-brand-gold">{(thrive?.totalPoints || 0).toLocaleString()}</div>
            <div className="mt-1 text-[10px] text-slate-400">{tier?.boostPct ? `+${tier.boostPct}% commission boost` : 'Standard commission'}</div>
          </div>
        </div>
        <div className="relative z-10 mt-6">
          <div className="mb-1.5 flex justify-between text-[11px]">
            <span className="font-semibold text-slate-600">{tier?.name || 'Bronze'}</span>
            <span className="text-slate-500">{next ? `Next: ${next.name} (${(next.minPoints / 100).toLocaleString('en-IN')} points)` : 'Highest tier reached'}</span>
          </div>
          <div className="h-3 overflow-hidden rounded-full bg-brand-navy/5">
            <div className="h-full rounded-full bg-gradient-to-r from-brand-navy to-brand-gold transition-[width] duration-700" style={{ width: `${thrive?.progressPct || 0}%` }} />
          </div>
        </div>
      </section>

      {/* PERFORMANCE STRIP */}
      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {[
          { label: 'Total points', v: (thrive?.totalPoints || 0).toLocaleString() },
          { label: 'Share links', v: String(thrive?.linkCount || 0) },
          { label: 'Link clicks', v: (thrive?.totalClicks || 0).toLocaleString() },
          { label: 'Tier boost', v: tier?.boostPct ? `+${tier.boostPct}%` : '—' },
        ].map((k) => (
          <div key={k.label} className="rounded-2xl border border-brand-navy/10 bg-white p-5 shadow-[0_16px_40px_-20px_rgba(10,45,80,0.14)]">
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{k.label}</p>
            <p className="mt-2 font-display text-2xl font-extrabold text-brand-navy">{k.v}</p>
          </div>
        ))}
      </section>

      {/* PAYOUT SELF-SERVICE — request payment of the matured balance */}
      <section className="flex flex-wrap items-center justify-between gap-4 rounded-[2rem] border border-brand-navy/10 bg-white p-6 shadow-[0_20px_40px_-20px_rgba(10,45,80,0.12)]">
        <div>
          <h3 className="font-display text-sm font-bold text-brand-navy">Payouts</h3>
          <p className="mt-0.5 text-[10px] text-brand-navy/50">Request your earned balance — the owner approves and it is bank-transferred on the payout cycle.</p>
          <div className="mt-1.5 flex items-center gap-2">
            <span className="font-display text-lg font-extrabold text-emerald-700">{rs(maturedPaise)}</span>
            <span className="text-[10px] text-slate-400">matured, ready to request</span>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          {(payouts?.payouts || []).filter((p) => p.status === 'requested').length === 0 ? (
            <button onClick={() => requestPayout.mutate()} disabled={requestPayout.isPending || maturedPaise <= 0}
              className="rounded-full bg-emerald-600 px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-emerald-500 active:scale-[0.97] disabled:opacity-40">
              {requestPayout.isPending ? 'Requesting…' : 'Request payout'}
            </button>
          ) : (
            <span className="rounded-full border border-amber-500/50 bg-amber-500/10 px-4 py-2 text-[11px] font-bold uppercase tracking-wider text-amber-700">Payout pending approval</span>
          )}
        </div>
        {(payouts?.payouts || []).length > 0 && (
          <div className="w-full space-y-1.5 border-t border-brand-navy/10 pt-3">
            {(payouts?.payouts || []).slice(0, 4).map((p) => (
              <div key={p.id} className="flex items-center justify-between text-[11px]">
                <span className="text-slate-500">{new Date(p.requestedAt * 1000).toLocaleDateString()}</span>
                <span className="font-mono font-bold text-brand-navy">{rs(p.amountPaise)}</span>
                <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${p.status === 'paid' ? 'bg-emerald-500/15 text-emerald-700' : p.status === 'requested' ? 'bg-amber-500/15 text-amber-700' : p.status === 'rejected' ? 'bg-rose-500/15 text-rose-700' : 'bg-sky-500/15 text-sky-700'}`}>{p.status}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* MY INVENTORY — browse catalog, create + copy share links */}
      <section className="rounded-[2rem] border border-brand-navy/10 bg-white shadow-[0_20px_40px_-20px_rgba(10,45,80,0.12)]">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-brand-navy/10 px-6 py-4">
          <div>
            <h3 className="font-display text-sm font-bold">My Inventory</h3>
            <p className="text-[10px] text-brand-navy/50">Browse Opus inventory and share items — every click is tracked to you.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {Object.entries(TYPES).map(([k, label]) => (
              <button key={k} onClick={() => setActiveType(k)}
                className={`rounded-full px-3 py-1.5 text-[11px] font-bold transition-all ${activeType === k ? 'bg-brand-navy text-white' : 'border border-brand-navy/15 text-slate-600 hover:border-brand-gold hover:text-brand-gold'}`}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 p-6 md:grid-cols-2">
          {items.length === 0 && <p className="col-span-full py-10 text-center text-xs text-slate-400">No {TYPES[activeType]?.toLowerCase()} in the catalog yet — publish inventory on your side and it appears here instantly.</p>}
          {items.map((item) => {
            const existing = myLinks.find((l) => l.catalogType === item.type && l.catalogItemId === item.id);
            const ref = thrive?.ref;
            const linkPath = existing && ref ? `/go/${ref}/${item.type}/${item.id}` : null;
            return (
              <div key={`${item.type}-${item.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-brand-navy/10 bg-[#FAF8F4] p-4">
                <div className="min-w-0">
                  <div className="truncate text-xs font-bold text-brand-navy">{item.title}</div>
                  <div className="mt-0.5 text-[10px] text-slate-500">
                    {item.meta?.country || item.meta?.date || ''} {item.pricePaise > 0 ? `· ${rs(item.pricePaise)}` : ''} {existing ? `· ${existing.clicks} clicks` : ''}
                  </div>
                </div>
                {existing && linkPath ? (
                  <button onClick={() => copy(linkPath, existing.id)}
                    className="shrink-0 rounded-full border border-brand-gold/50 bg-brand-gold/10 px-3.5 py-2 text-[10px] font-bold uppercase tracking-wider text-brand-gold transition hover:bg-brand-gold hover:text-brand-navy">
                    {copiedId === existing.id ? 'Copied!' : 'Copy link'}
                  </button>
                ) : (
                  <button onClick={() => createLink.mutate(item)} disabled={createLink.isPending}
                    className="shrink-0 rounded-full bg-brand-navy px-3.5 py-2 text-[10px] font-bold uppercase tracking-wider text-white transition hover:bg-brand-gold hover:text-brand-navy disabled:opacity-40">
                    {createLink.isPending ? '…' : 'Create link'}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}