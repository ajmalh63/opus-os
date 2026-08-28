import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from '../lib/session';
import { useRevealRoot } from '../lib/reveal';
import InvoiceErpLedgerWidget from './dashboard/InvoiceErpLedgerWidget';
const API = (import.meta as any).env?.VITE_API_URL || 'https://opusos-api.ajmalsn63.workers.dev';

// Transactions module — the unified billing surface for EVERY internal account.
// Draft entry by all staff; confirm/void only for super_admin/manager.
// Money is integer paise end-to-end.


interface Tx {
  id: string; clientId: string; clientName: string; engagementId: string;
  amount: number; type: 'invoice' | 'charge' | 'receipt' | 'refund';
  milestoneName: string; method: string | null; referenceNumber: string | null;
  taxableAmount: number | null; cgst: number | null; sgst: number | null; igst: number | null;
  invoiceDate: number | null; dueDate: number | null; gstRate: number;
  customerGstin: string | null;
  razorpayLinkId: string | null; razorpayShortUrl: string | null;
  linkStatus: 'none' | 'created' | 'paid' | 'cancelled' | 'expired' | string;
  razorpayPaymentId: string | null;
  status: 'draft' | 'confirmed' | 'synced' | 'paid' | 'void';
  enteredBy: string | null; confirmedBy: string | null; createdAt: number;
}
interface EngBrief { id: string; clientId: string; division: string; title: string; }

const rs = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-slate-500/15 text-slate-300',
  confirmed: 'bg-sky-500/15 text-sky-300',
  synced: 'bg-violet-500/15 text-violet-300',
  paid: 'bg-emerald-500/15 text-emerald-700',
  void: 'bg-rose-500/15 text-rose-700',
};
const TYPE_LABEL: Record<string, string> = {
  invoice: 'Invoice', charge: 'Charge', receipt: 'Receipt', refund: 'Refund',
};

export default function TransactionsTab() {
  const queryClient = useQueryClient();
  const { me } = useSession();
  const isMoneyManager = me?.role === 'super_admin' || me?.role === 'manager';
  const rootRef = useRevealRoot<HTMLDivElement>();
  const [statusFilter, setStatusFilter] = useState('');
  const [mineOnly, setMineOnly] = useState(false);
  const [linkFilter, setLinkFilter] = useState('');
  const [toast, setToast] = useState('');

  // AR aging strip (manager+)
  const { data: revenueData } = useQuery<any>({
    queryKey: ['revenueSummary'],
    queryFn: async () => {
      const r = await fetch(`${API}/api/analytics/revenue`);
      if (!r.ok) return null;
      return r.json();
    },
    refetchInterval: 60000
  });
  const INR = (p: number) => '₹' + (p / 100).toLocaleString('en-IN');

  // entry form
  const [clientId, setClientId] = useState('');
  const [engagementId, setEngagementId] = useState('');
  const [type, setType] = useState<'invoice' | 'charge' | 'receipt' | 'refund'>('invoice');
  const [amountPaise, setAmountPaise] = useState(0);
  const [milestoneName, setMilestoneName] = useState('');
  const [method, setMethod] = useState('upi');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [isInterstate, setIsInterstate] = useState(false);
  const [invoiceDate, setInvoiceDate] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [gstRate, setGstRate] = useState(18);
  const [customerGstin, setCustomerGstin] = useState('');

  const { data: clientsData } = useQuery<{ clients: any[]; engagements: EngBrief[] }>({
    queryKey: ['txClients'],
    queryFn: async () => { const r = await fetch(`${API}/api/transactions/clients-brief`, { credentials: 'include' }).catch(() => null); return r ? r.json() : { clients: [], engagements: [] }; },
  });

  const { data: txData } = useQuery<{ transactions: Tx[] }>({
    queryKey: ['transactions', statusFilter, mineOnly, linkFilter],
    queryFn: async () => {
      const q = new URLSearchParams();
      if (statusFilter) q.set('status', statusFilter);
      if (mineOnly) q.set('mine', '1');
      if (linkFilter) q.set('linkStatus', linkFilter);
      const r = await fetch(`${API}/api/transactions?${q}`, { credentials: 'include' });
      if (!r.ok) throw new Error('tx');
      return r.json();
    },
  });

  const createDraft = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${API}/api/transactions/entries`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', },
        body: JSON.stringify({
          clientId, engagementId, type, amount: amountPaise, milestoneName, method, referenceNumber, isInterstate,
          invoiceDate: invoiceDate ? Math.floor(new Date(invoiceDate).getTime() / 1000) : undefined,
          dueDate: dueDate ? Math.floor(new Date(dueDate).getTime() / 1000) : undefined,
          gstRate, customerGstin: customerGstin.trim() || undefined,
        }),
      });
      if (!r.ok) { const e = await r.json().catch(() => null); throw new Error(e?.error || 'entry failed'); }
      return r.json();
    },
    onSuccess: (d) => {
      setToast((d.message || 'Saved') + (d.autoConfirmed ? ' (auto-confirmed + synced)' : ''));
      setTimeout(() => setToast(''), 5000);
      setMilestoneName(''); setAmountPaise(0); setReferenceNumber(''); setInvoiceDate(''); setDueDate(''); setCustomerGstin('');
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
    onError: (e: any) => { setToast((e as Error).message); setTimeout(() => setToast(''), 4000); },
  });

  const confirmTx = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`${API}/api/transactions/${id}/confirm`, { method: 'POST', });
      if (!r.ok) { const e = await r.json().catch(() => null); throw new Error(e?.error || 'confirm failed'); }
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['transactions'] }); setToast('Entry confirmed — balance applied.'); setTimeout(() => setToast(''), 4000); },
  });

  const voidTx = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`${API}/api/transactions/${id}/void`, { method: 'POST', });
      if (!r.ok) { const e = await r.json().catch(() => null); throw new Error(e?.error || 'void failed'); }
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['transactions'] }); setToast('Entry voided.'); setTimeout(() => setToast(''), 4000); },
  });

  // Razorpay Payment Link — any staff can charge any amount from a draft/confirmed entry
  const chargeLink = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`${API}/api/transactions/${id}/payment-link`, { method: 'POST', });
      if (!r.ok) { const e = await r.json().catch(() => null); throw new Error(e?.error || 'link failed'); }
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
      setToast('Payment link created — copy it and send to the customer.');
      setTimeout(() => setToast(''), 5000);
    },
    onError: (e: any) => { setToast((e as Error).message); setTimeout(() => setToast(''), 5000); },
  });

  const copyUrl = (url: string) => {
    try { navigator.clipboard.writeText(url); } catch { /* fallback */ }
    setToast('Payment link copied — paste it in WhatsApp/email.'); setTimeout(() => setToast(''), 4000);
  };

  // ══ FREE-FORM RAZORPAY GATEWAY ══
  // "Charge customer" — ANY amount, ANY client, ANY staff. Creates the
  // charge entry + payment link in one step; balance moves when paid.
  const [chargeOpen, setChargeOpen] = useState(false);
  const [chargeClientId, setChargeClientId] = useState('');
  const [chargeAmount, setChargeAmount] = useState('');
  const [chargeDesc, setChargeDesc] = useState('');
  const [chargeResult, setChargeResult] = useState<{ shortUrl?: string; entryId?: string } | null>(null);
  const openCharge = () => { setChargeOpen(true); setChargeResult(null); setChargeAmount(''); setChargeDesc(''); setChargeClientId(''); };
  const chargeEngLabel = (clientsData?.engagements || []).filter((e) => e.clientId === chargeClientId)[0]?.title || '';
  const chargeAny = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${API}/api/transactions/charge`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', },
        body: JSON.stringify({ clientId: chargeClientId || undefined, amount: parseFloat(chargeAmount || '0'), description: chargeDesc.trim() }),
      });
      if (!r.ok) { const e = await r.json().catch(() => null); throw new Error(e?.error || 'charge failed'); }
      return r.json();
    },
    onSuccess: (d) => {
      setChargeResult({ shortUrl: d.shortUrl, entryId: d.entryId });
      setToast(d.message || 'Charge link created'); setTimeout(() => setToast(''), 5000);
      queryClient.invalidateQueries({ queryKey: ['transactions'] });
    },
    onError: (e: any) => { setToast((e as Error).message); setTimeout(() => setToast(''), 5000); },
  });

  // Link lifecycle (dunning): cancel live links, renew expired/cancelled.
  const cancelLinkTx = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`${API}/api/transactions/${id}/payment-link/cancel`, { method: 'POST', });
      if (!r.ok) { const e = await r.json().catch(() => null); throw new Error(e?.error || 'cancel failed'); }
      return r.json();
    },
    onSuccess: (d) => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] }); queryClient.invalidateQueries({ queryKey: ['linkSummary'] });
      setToast((d as any).already ? 'Link was already cancelled.' : 'Link cancelled at Razorpay.'); setTimeout(() => setToast(''), 4000);
    },
    onError: (e: any) => { setToast((e as Error).message); setTimeout(() => setToast(''), 4000); },
  });
  const renewLink = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`${API}/api/transactions/${id}/payment-link/renew`, { method: 'POST', });
      if (!r.ok) { const e = await r.json().catch(() => null); throw new Error(e?.error || 'renew failed'); }
      return r.json();
    },
    onSuccess: (d) => {
      queryClient.invalidateQueries({ queryKey: ['transactions'] }); queryClient.invalidateQueries({ queryKey: ['linkSummary'] });
      setToast((d as any).message || 'Fresh link created.'); setTimeout(() => setToast(''), 5000);
    },
    onError: (e: any) => { setToast((e as Error).message); setTimeout(() => setToast(''), 5000); },
  });

  // Dunning chip: outstanding links + aging buckets (3d remind / 5d stale)
  const { data: linkSum } = useQuery<{ outstanding: number; remindDue: number; stale: number }>({
    queryKey: ['linkSummary'],
    queryFn: async () => { const r = await fetch(`${API}/api/transactions/links-summary`, { credentials: 'include' }).catch(() => null); return r ? r.json() : { outstanding: 0, remindDue: 0, stale: 0 }; },
  });
  const ageDays = (t: { createdAt: number }) => Math.max(0, Math.floor((Date.now() / 1000 - t.createdAt) / 86400));
  const ageClass = (d: number) => d >= 5 ? 'bg-rose-500/15 text-rose-700' : d >= 3 ? 'bg-amber-500/15 text-amber-700' : 'bg-slate-500/15 text-brand-navy/50';

  const rows = txData?.transactions || [];
  const clients = clientsData?.clients || [];

  // Owner/manager: counselor auto-confirm settings (business_profile)
  const { data: profileData } = useQuery<{ profile?: { autoConfirmEnabled?: boolean | number; autoConfirmThresholdPaise?: number } }>({
    queryKey: ['billingProfile'],
    queryFn: async () => { const r = await fetch(`${API}/api/compliance/business-profile`, { credentials: 'include' }); if (!r.ok) throw new Error('profile'); return r.json(); },
    enabled: isMoneyManager,
  });
  const [autoConfirm, setAutoConfirm] = useState(false);
  const [thresholdRs, setThresholdRs] = useState(0);
  const [profileLoaded, setProfileLoaded] = useState(false);
  if (isMoneyManager && profileData?.profile && !profileLoaded) {
    setAutoConfirm(Number(profileData.profile.autoConfirmEnabled) === 1);
    setThresholdRs((profileData.profile.autoConfirmThresholdPaise || 0) / 100);
    setProfileLoaded(true);
  }
  const saveProfile = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${API}/api/compliance/business-profile`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', },
        body: JSON.stringify({ autoConfirmEnabled: autoConfirm, autoConfirmThresholdPaise: Math.round(thresholdRs * 100) }),
      });
      if (!r.ok) throw new Error('save');
      return r.json();
    },
    onSuccess: () => { setToast('Auto-confirm settings saved.'); setTimeout(() => setToast(''), 4000); },
  });

  return (
    <div ref={rootRef} className="min-h-full space-y-6 text-brand-navy">
      {toast && <div className="fixed right-4 top-4 z-50 rounded-lg border border-brand-navy/10 bg-white px-4 py-2 text-xs font-bold text-brand-navy shadow-xl backdrop-blur-sm">{toast}</div>}

      {revenueData && (
        <div className="reveal grid grid-cols-2 md:grid-cols-6 gap-3">
          <div className="rounded-xl border border-brand-navy/10 bg-white p-3 shadow-sm"><div className="text-xs font-bold uppercase tracking-widest text-brand-navy/40">Collected (month)</div><div className="font-display font-extrabold text-emerald-700 text-lg mt-0.5">{INR(revenueData.month.collectedPaise)}</div></div>
          <div className="rounded-xl border border-brand-navy/10 bg-white p-3 shadow-sm"><div className="text-xs font-bold uppercase tracking-widest text-brand-navy/40">Current AR</div><div className="font-display font-extrabold text-brand-navy text-lg mt-0.5">{INR(revenueData.arAging.current)}</div></div>
          <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-3 shadow-sm"><div className="text-xs font-bold uppercase tracking-widest text-amber-700">30–60d</div><div className="font-display font-extrabold text-amber-700 text-lg mt-0.5">{INR(revenueData.arAging.d30 + revenueData.arAging.d60)}</div></div>
          <div className="rounded-xl border border-rose-200 bg-rose-50/50 p-3 shadow-sm"><div className="text-xs font-bold uppercase tracking-widest text-rose-600">60–90d</div><div className="font-display font-extrabold text-rose-600 text-lg mt-0.5">{INR(revenueData.arAging.d90)}</div></div>
          <div className="rounded-xl border border-rose-300 bg-rose-100/60 p-3 shadow-sm"><div className="text-xs font-bold uppercase tracking-widest text-rose-700">Overdue &gt;90d</div><div className="font-display font-extrabold text-rose-700 text-lg mt-0.5">{INR(revenueData.arAging.overdue)}</div></div>
          <div className="rounded-xl border border-brand-gold/30 bg-brand-gold/[0.06] p-3 shadow-sm"><div className="text-xs font-bold uppercase tracking-widest text-brand-gold">30-day forecast</div><div className="font-display font-extrabold text-brand-gold text-lg mt-0.5">{INR(revenueData.forecast.d30)}</div></div>
        </div>
      )}

      {/* Official Invoices & ERPNext Books Sync Component */}
      <div className="reveal">
        <InvoiceErpLedgerWidget />
      </div>

      <div className="reveal flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.18em] text-brand-gold">Billing</p>
          <h1 className="mt-1 font-display text-2xl font-extrabold tracking-tight text-brand-navy">Transactions</h1>
          <p className="mt-1 text-sm text-brand-navy/40">
            Every invoice, charge, receipt and refund in one ledger. Entries are drafts until {isMoneyManager ? 'you confirm' : 'a manager confirms'}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {linkSum && linkSum.outstanding > 0 && (
            <button
              onClick={() => setLinkFilter(linkFilter === 'created' ? '' : 'created')}
              className={`flex items-center gap-1.5 rounded-full px-3 py-2 text-[13px] font-extrabold uppercase tracking-wide transition ${linkFilter === 'created' ? 'bg-brand-1 text-brand-navy' : 'bg-amber-500/15 text-amber-700 hover:bg-amber-500/30'}`}
            >
              ⧉ {linkSum.outstanding} outstanding
              {linkSum.remindDue > 0 && <span className="opacity-70">· {linkSum.remindDue} remind</span>}
              {linkSum.stale > 0 && <span className="opacity-90">· {linkSum.stale} stale</span>}
            </button>
          )}
          <button onClick={openCharge} className="rounded-full bg-brand-gold px-4 py-2 text-sm font-extrabold uppercase tracking-wide text-brand-navy transition hover:bg-brand-gold/90">
            Charge customer
          </button>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-xs text-brand-navy focus:border-brand-gold focus:outline-none">
            <option value="" className="bg-white">All statuses</option>
            <option value="draft" className="bg-white">Draft</option>
            <option value="confirmed" className="bg-white">Confirmed</option>
            <option value="synced" className="bg-white">Synced to ERP</option>
            <option value="paid" className="bg-white">Paid</option>
            <option value="void" className="bg-white">Void</option>
          </select>
          <select value={linkFilter} onChange={(e) => setLinkFilter(e.target.value)} className="rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-xs text-brand-navy focus:border-brand-gold focus:outline-none">
            <option value="" className="bg-white">All links</option>
            <option value="created" className="bg-white">Outstanding (live)</option>
            <option value="cancelled" className="bg-white">Cancelled</option>
            <option value="expired" className="bg-white">Expired</option>
          </select>
          <label className="flex items-center gap-1.5 text-sm text-brand-navy/70">
            <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} className="accent-brand-gold" /> Mine only
          </label>
        </div>
      </div>

      {/* Enter billing (all staff) */}
      <section className="reveal rounded-2xl border border-brand-navy/10 bg-white p-6 shadow-[0_20px_40px_-20px_rgba(10,45,80,0.10)]">
        <h3 className="font-display text-sm font-bold text-brand-navy">Enter billing entry</h3>
        <p className="mt-0.5 text-[13px] text-brand-navy/40 mt-1">Saved as a draft — a manager confirms before it affects the client's balance.</p>
        {!isMoneyManager && type === 'invoice' && (
          <div className="mt-3 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-700">
            <span className="font-bold">Counselor auto-confirm:</span> invoices within your division scope are confirmed and synced to ERP instantly; anything above the owner's threshold goes to a manager for approval.
          </div>
        )}
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-brand-gold">Client</label>
            <select value={clientId} onChange={(e) => setClientId(e.target.value)} className="w-full rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-xs text-brand-navy focus:border-brand-gold focus:outline-none">
              <option value="" className="bg-white">Select client</option>
              {clients.map((c) => <option key={c.id} value={c.id} className="bg-white">{c.name} ({c.id})</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-brand-gold">Engagement</label>
            <select value={engagementId} onChange={(e) => setEngagementId(e.target.value)} className="w-full rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-xs text-brand-navy focus:border-brand-gold focus:outline-none">
              <option value="" className="bg-white">Select engagement</option>
              {(clientsData?.engagements || []).filter((e) => e.clientId === clientId).map((e) => (
                <option key={e.id} value={e.id} className="bg-white">{e.title || e.id} · {e.division}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-brand-gold">Entry type</label>
            <select value={type} onChange={(e) => setType(e.target.value as any)} className="w-full rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-xs text-brand-navy focus:border-brand-gold focus:outline-none">
              <option value="invoice" className="bg-white">Invoice (+balance)</option>
              <option value="charge" className="bg-white">Charge (+balance)</option>
              <option value="receipt" className="bg-white">Receipt (−balance)</option>
              <option value="refund" className="bg-white">Refund (+balance)</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-brand-gold">Amount (₹)</label>
            <input type="number" min={0} value={amountPaise / 100} onChange={(e) => setAmountPaise(Math.round(parseFloat(e.target.value || '0') * 100))} className="w-full rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-xs text-brand-navy placeholder:text-brand-navy/40 focus:border-brand-gold focus:outline-none" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-brand-gold">Milestone / item</label>
            <input value={milestoneName} onChange={(e) => setMilestoneName(e.target.value)} placeholder="e.g. Visa processing fee" className="w-full rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-xs text-brand-navy placeholder:text-brand-navy/40 focus:border-brand-gold focus:outline-none" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-brand-gold">Method · Interstate</label>
            <div className="flex gap-2">
              <select value={method} onChange={(e) => setMethod(e.target.value)} className="flex-1 rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-xs text-brand-navy focus:border-brand-gold focus:outline-none">
                <option value="upi" className="bg-white">UPI</option><option value="bank_transfer" className="bg-white">Bank</option><option value="cash" className="bg-white">Cash</option>
              </select>
              <input type="checkbox" checked={isInterstate} onChange={(e) => setIsInterstate(e.target.checked)} title="Interstate (IGST)" className="accent-brand-gold" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-brand-gold">Invoice date</label>
            <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className="w-full rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-xs text-brand-navy placeholder:text-brand-navy/40 focus:border-brand-gold focus:outline-none" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-brand-gold">Due date</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-xs text-brand-navy placeholder:text-brand-navy/40 focus:border-brand-gold focus:outline-none" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-brand-gold">GST rate %</label>
            <input type="number" min={0} max={100} value={gstRate} onChange={(e) => setGstRate(Number(e.target.value) || 0)} className="w-full rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-xs text-brand-navy placeholder:text-brand-navy/40 focus:border-brand-gold focus:outline-none" />
          </div>
          <div>
            <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-brand-gold">Customer GSTIN (15 chars)</label>
            <input value={customerGstin} onChange={(e) => setCustomerGstin(e.target.value.toUpperCase())} placeholder="22AAAAA0000A1Z5" maxLength={15} className="w-full rounded-lg border border-brand-navy/10 bg-white px-3 py-2 font-mono text-xs text-brand-navy placeholder:text-brand-navy/40 focus:border-brand-gold focus:outline-none" />
          </div>
        </div>
        <button onClick={() => createDraft.mutate()} disabled={createDraft.isPending || !clientId || amountPaise <= 0}
          className="mt-4 rounded-full bg-brand-gold px-6 py-2.5 text-sm font-bold uppercase tracking-wider text-brand-navy transition hover:bg-brand-gold/90 disabled:opacity-40">
          {createDraft.isPending ? 'Saving…' : 'Save as draft'}
        </button>
      </section>

      {/* Owner/manager: auto-confirm policy for counselors */}
      {isMoneyManager && (
        <section className="reveal flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-brand-navy/10 bg-white p-6 shadow-[0_20px_40px_-20px_rgba(10,45,80,0.10)]">
          <div>
            <h3 className="font-display text-sm font-bold text-brand-navy">Counselor auto-confirm policy</h3>
            <p className="mt-0.5 text-[13px] text-brand-navy/40">When enabled, counselors' invoices within their division scope and under the threshold confirm + sync to ERP instantly; above it, they wait for your approval.</p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-xs font-semibold text-brand-navy">
              <input type="checkbox" checked={autoConfirm} onChange={(e) => setAutoConfirm(e.target.checked)} className="h-4 w-4 accent-brand-gold" />
              Auto-confirm
            </label>
            <label className="flex items-center gap-2 text-xs font-semibold text-brand-navy">
              Threshold (₹)
              <input type="number" min={0} value={thresholdRs} onChange={(e) => setThresholdRs(Number(e.target.value) || 0)} className="w-28 rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-xs text-brand-navy placeholder:text-brand-navy/40 focus:border-brand-gold focus:outline-none" />
            </label>
            <button onClick={() => saveProfile.mutate()} disabled={saveProfile.isPending} className="rounded-full bg-brand-gold px-5 py-2.5 text-sm font-bold uppercase tracking-wider text-brand-navy hover:bg-brand-gold/90 disabled:opacity-40">
              {saveProfile.isPending ? 'Saving…' : 'Save policy'}
            </button>
          </div>
        </section>
      )}

      {/* Ledger */}
      <section className="reveal overflow-x-auto rounded-2xl border border-brand-navy/10 bg-white shadow-[0_20px_40px_-20px_rgba(10,45,80,0.10)]">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-brand-navy/[0.08] bg-brand-navy/[0.04] text-[13px] uppercase tracking-wider text-brand-gold">
              <th className="px-5 py-3">Client</th>
              <th className="px-5 py-3">Type</th>
              <th className="px-5 py-3">Item</th>
              <th className="px-5 py-3">Amount</th>
              <th className="px-5 py-3">GST</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">Charge</th>
              <th className="px-5 py-3">By</th>
              <th className="px-5 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={8} className="px-5 py-10 text-center text-brand-navy/50">No transactions yet — enter your first billing entry above.</td></tr>}
            {rows.map((t) => (
              <tr key={t.id} className="border-b border-brand-navy/[0.08] last:border-0 hover:bg-brand-navy/[0.04]">
                <td className="px-5 py-3.5">
                  <div className="font-semibold text-brand-navy">{t.clientName}</div>
                  <div className="font-mono text-xs text-brand-navy/50">{t.clientId}</div>
                </td>
                <td className="px-5 py-3.5"><span className="rounded-full border border-brand-navy/10 bg-brand-navy/[0.06] px-2 py-0.5 text-xs font-bold uppercase text-brand-navy/70">{TYPE_LABEL[t.type] || t.type}</span></td>
                <td className="px-5 py-3.5 text-brand-navy/70">{t.milestoneName}</td>
                <td className="px-5 py-3.5 font-mono font-bold text-brand-navy">{rs(t.amount)}</td>
                <td className="px-5 py-3.5 text-[13px] text-brand-navy/50">
                  {t.taxableAmount != null ? `${t.gstRate}% · net ${rs(t.taxableAmount)} · CGST ${rs(t.cgst || 0)} · SGST ${rs(t.sgst || 0)}${t.igst ? ` · IGST ${rs(t.igst)}` : ''}` : '—'}
                  <span className="block">
                    {t.invoiceDate ? new Date(t.invoiceDate * 1000).toLocaleDateString() : ''}
                    {t.dueDate ? ` → due ${new Date(t.dueDate * 1000).toLocaleDateString()}` : ''}
                    {t.customerGstin ? ` · ${t.customerGstin}` : ''}
                  </span>
                </td>
                <td className="px-5 py-3.5"><span className={`rounded-full px-2 py-0.5 text-xs font-bold uppercase ${STATUS_STYLE[t.status] || STATUS_STYLE.draft}`}>{t.status}</span></td>
                <td className="px-5 py-3.5">
                  {(t.type === 'invoice' || t.type === 'charge') && t.status !== 'paid' && t.status !== 'void' && (
                    t.linkStatus === 'none' ? (
                      <button onClick={() => chargeLink.mutate(t.id)} disabled={chargeLink.isPending}
                        className="rounded-full bg-brand-gold px-2.5 py-1 text-xs font-bold uppercase text-brand-navy transition hover:bg-brand-gold/90 disabled:opacity-40">
                        {chargeLink.isPending ? '…' : 'Charge'}
                      </button>
                    ) : (
                      <span className="flex flex-col gap-1">
                        <span className="flex flex-wrap items-center gap-1.5">
                          {t.linkStatus === 'created' && (
                            <button onClick={() => cancelLinkTx.mutate(t.id)} disabled={cancelLinkTx.isPending} className="rounded-full border border-rose-500/40 px-2 py-0.5 text-xs font-bold uppercase text-rose-700 hover:bg-rose-600 hover:text-white">cancel</button>
                          )}
                          {(t.linkStatus === 'cancelled' || t.linkStatus === 'expired') && (
                            <button onClick={() => renewLink.mutate(t.id)} disabled={renewLink.isPending} className="rounded-full border border-amber-500/50 px-2 py-0.5 text-xs font-bold uppercase text-amber-700 hover:bg-amber-500 hover:text-white">renew</button>
                          )}
                          <span className={`rounded-full px-2 py-0.5 text-xs font-bold uppercase ${t.linkStatus === 'paid' ? 'bg-emerald-500/15 text-emerald-700' : t.linkStatus === 'cancelled' || t.linkStatus === 'expired' ? 'bg-rose-500/15 text-rose-700' : 'bg-amber-500/15 text-amber-700'}`}>
                            {t.linkStatus}{t.razorpayPaymentId ? ` · ${t.razorpayPaymentId.slice(0, 10)}` : ''}
                          </span>
                          {t.linkStatus === 'created' && (
                            <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${ageClass(ageDays(t))}`}>{ageDays(t)}d</span>
                          )}
                        </span>
                        {t.razorpayShortUrl && t.linkStatus !== 'paid' && (
                          <span className="flex gap-1.5">
                            <button onClick={() => copyUrl(t.razorpayShortUrl!)} className="text-xs font-bold text-brand-gold hover:underline">copy</button>
                            <a href={t.razorpayShortUrl} target="_blank" rel="noopener noreferrer" className="text-xs font-bold text-emerald-700 hover:underline">view</a>
                          </span>
                        )}
                      </span>
                    )
                  )}
                </td>
                <td className="px-5 py-3.5 text-[13px] text-brand-navy/50">{t.enteredBy ? t.enteredBy.slice(0, 8) : '—'}</td>
                <td className="px-5 py-3.5">
                  {isMoneyManager && t.status === 'draft' && (
                    <span className="flex gap-1.5">
                      <button onClick={() => confirmTx.mutate(t.id)} className="rounded-full border border-emerald-500/40 px-2.5 py-1 text-xs font-bold uppercase text-emerald-700 hover:bg-emerald-600 hover:text-white">Confirm</button>
                      <button onClick={() => voidTx.mutate(t.id)} className="rounded-full border border-rose-500/40 px-2.5 py-1 text-xs font-bold uppercase text-rose-700 hover:bg-rose-600 hover:text-white">Void</button>
                    </span>
                  )}
                  {isMoneyManager && t.status === 'confirmed' && (
                    <button onClick={() => voidTx.mutate(t.id)} className="rounded-full border border-rose-500/40 px-2.5 py-1 text-xs font-bold uppercase text-rose-700 hover:bg-rose-600 hover:text-white">Void</button>
                  )}
                  {!isMoneyManager && t.status === 'draft' && <span className="text-xs text-brand-navy/50">awaiting confirm</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {/* Charge customer — free-form Razorpay gateway (any staff) */}
      {chargeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm" onClick={() => setChargeOpen(false)}>
          <div className="w-full max-w-md rounded-2xl border border-brand-navy/10 bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between">
              <h3 className="font-display text-sm font-extrabold text-brand-navy">Charge a customer</h3>
              <button onClick={() => setChargeOpen(false)} className="text-brand-navy/50 hover:text-brand-navy">✕</button>
            </div>
            <p className="mt-1 text-[13px] leading-relaxed text-brand-navy/40">
              Any amount, any client — a Razorpay payment link is created instantly and this ledger gets a <span className="font-bold">Charge</span> entry. Money applies to the client's balance only when they pay.
            </p>

            {!chargeResult ? (
              <div className="mt-4 space-y-3">
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-brand-gold">Client</label>
                  <select value={chargeClientId} onChange={(e) => setChargeClientId(e.target.value)} className="w-full rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-xs text-brand-navy focus:border-brand-gold focus:outline-none">
                    <option value="" className="bg-white">Select client</option>
                    {clients.map((c) => <option key={c.id} value={c.id} className="bg-white">{c.name} ({c.id})</option>)}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-brand-gold">Amount (₹)</label>
                  <input type="number" min={1} step={1} value={chargeAmount} onChange={(e) => setChargeAmount(e.target.value)} placeholder="e.g. 25000" className="w-full rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-xs text-brand-navy placeholder:text-brand-navy/40 focus:border-brand-gold focus:outline-none" />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-brand-gold">What's it for</label>
                  <input value={chargeDesc} onChange={(e) => setChargeDesc(e.target.value)} placeholder="e.g. University application fee" className="w-full rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-xs text-brand-navy placeholder:text-brand-navy/40 focus:border-brand-gold focus:outline-none" />
                </div>
                {chargeClientId && <p className="text-[13px] text-brand-navy/50">Attached to engagement: <span className="font-semibold">{chargeEngLabel || '(auto — first active)'}</span></p>}
                <button
                  onClick={() => chargeAny.mutate()}
                  disabled={!chargeClientId || !chargeAmount || Number(chargeAmount) < 1 || chargeAny.isPending}
                  className="w-full rounded-full bg-brand-gold px-4 py-2.5 text-sm font-extrabold uppercase tracking-wide text-brand-navy transition hover:bg-brand-gold/90 disabled:opacity-40"
                >
                  {chargeAny.isPending ? 'Creating link…' : 'Create payment link'}
                </button>
              </div>
            ) : (
              <div className="mt-4 rounded-xl border border-emerald-500/30 bg-emerald-500/10 p-4">
                <p className="text-sm font-bold text-emerald-700">Link created — send it to the customer.</p>
                <div className="mt-2 flex items-center gap-2 rounded-lg bg-brand-navy/[0.04] p-2 ring-1 ring-emerald-500/30">
                  <span className="flex-1 truncate font-mono text-[13px] text-brand-navy/70">{chargeResult.shortUrl}</span>
                  <button onClick={() => copyUrl(chargeResult.shortUrl!)} className="text-[13px] font-bold text-brand-gold hover:underline">Copy</button>
                </div>
                <div className="mt-3 flex gap-2">
                  <a href={`https://wa.me/?text=${encodeURIComponent('Please pay via this link: ' + chargeResult.shortUrl)}`} target="_blank" rel="noopener noreferrer" className="flex-1 rounded-full bg-emerald-600 px-3 py-2 text-center text-[13px] font-bold uppercase text-white transition hover:bg-emerald-700">WhatsApp</a>
                  <a href={chargeResult.shortUrl} target="_blank" rel="noopener noreferrer" className="flex-1 rounded-full border border-brand-navy/15 bg-brand-navy/[0.04] px-3 py-2 text-center text-[13px] font-bold uppercase text-brand-navy transition hover:border-brand-gold/50">Open link</a>
                </div>
                <button onClick={() => { setChargeResult(null); setChargeAmount(''); setChargeDesc(''); setChargeClientId(''); }} className="mt-3 w-full text-[13px] font-bold text-brand-navy/50 hover:text-brand-gold">New charge</button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}