import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from '../lib/session';

// Transactions module — the unified billing surface for EVERY internal account.
// Draft entry by all staff; confirm/void only for super_admin/manager.
// Money is integer paise end-to-end.

const AUTH = {
  get Cookie() {
    const s = document.cookie.split(';').map((p: string) => p.trim()).find((p: string) => p.startsWith('better-auth.session_token='));
    return s || '';
  }
} as Record<string, string>;

interface Tx {
  id: string; clientId: string; clientName: string; engagementId: string;
  amount: number; type: 'invoice' | 'charge' | 'receipt' | 'refund';
  milestoneName: string; method: string | null; referenceNumber: string | null;
  taxableAmount: number | null; cgst: number | null; sgst: number | null; igst: number | null;
  invoiceDate: number | null; dueDate: number | null; gstRate: number;
  customerGstin: string | null;
  status: 'draft' | 'confirmed' | 'synced' | 'paid' | 'void';
  enteredBy: string | null; confirmedBy: string | null; createdAt: number;
}
interface EngBrief { id: string; clientId: string; division: string; title: string; }

const rs = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

const STATUS_STYLE: Record<string, string> = {
  draft: 'bg-slate-500/15 text-slate-600',
  confirmed: 'bg-sky-500/15 text-sky-700',
  synced: 'bg-violet-500/15 text-violet-700',
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
  const [statusFilter, setStatusFilter] = useState('');
  const [mineOnly, setMineOnly] = useState(false);
  const [toast, setToast] = useState('');

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
    queryFn: async () => { const r = await fetch('/api/transactions/clients-brief', { headers: AUTH }).catch(() => null); return r ? r.json() : { clients: [], engagements: [] }; },
  });

  const { data: txData } = useQuery<{ transactions: Tx[] }>({
    queryKey: ['transactions', statusFilter, mineOnly],
    queryFn: async () => {
      const q = new URLSearchParams();
      if (statusFilter) q.set('status', statusFilter);
      if (mineOnly) q.set('mine', '1');
      const r = await fetch(`/api/transactions?${q}`, { headers: AUTH });
      if (!r.ok) throw new Error('tx');
      return r.json();
    },
  });

  const createDraft = useMutation({
    mutationFn: async () => {
      const r = await fetch('/api/transactions/entries', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...AUTH },
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
      const r = await fetch(`/api/transactions/${id}/confirm`, { method: 'POST', headers: AUTH });
      if (!r.ok) { const e = await r.json().catch(() => null); throw new Error(e?.error || 'confirm failed'); }
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['transactions'] }); setToast('Entry confirmed — balance applied.'); setTimeout(() => setToast(''), 4000); },
  });

  const voidTx = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/transactions/${id}/void`, { method: 'POST', headers: AUTH });
      if (!r.ok) { const e = await r.json().catch(() => null); throw new Error(e?.error || 'void failed'); }
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['transactions'] }); setToast('Entry voided.'); setTimeout(() => setToast(''), 4000); },
  });

  const rows = txData?.transactions || [];
  const clients = clientsData?.clients || [];

  // Owner/manager: counselor auto-confirm settings (business_profile)
  const { data: profileData } = useQuery<{ profile?: { autoConfirmEnabled?: boolean | number; autoConfirmThresholdPaise?: number } }>({
    queryKey: ['billingProfile'],
    queryFn: async () => { const r = await fetch('/api/compliance/business-profile', { headers: AUTH }); if (!r.ok) throw new Error('profile'); return r.json(); },
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
      const r = await fetch('/api/compliance/business-profile', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...AUTH },
        body: JSON.stringify({ autoConfirmEnabled: autoConfirm, autoConfirmThresholdPaise: Math.round(thresholdRs * 100) }),
      });
      if (!r.ok) throw new Error('save');
      return r.json();
    },
    onSuccess: () => { setToast('Auto-confirm settings saved.'); setTimeout(() => setToast(''), 4000); },
  });

  return (
    <div className="min-h-full space-y-6">
      {toast && <div className="fixed right-4 top-4 z-50 rounded-lg bg-brand-navy px-4 py-2 text-xs font-bold text-white shadow-xl">{toast}</div>}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-gold">Billing</p>
          <h1 className="mt-1 font-display text-2xl font-extrabold tracking-tight text-brand-navy">Transactions</h1>
          <p className="mt-1 text-sm text-slate-500">
            Every invoice, charge, receipt and refund in one ledger. Entries are drafts until {isMoneyManager ? 'you confirm' : 'a manager confirms'}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border border-brand-navy/15 bg-white px-3 py-2 text-xs text-brand-navy">
            <option value="">All statuses</option>
            <option value="draft">Draft</option>
            <option value="confirmed">Confirmed</option>
            <option value="synced">Synced to ERP</option>
            <option value="paid">Paid</option>
            <option value="void">Void</option>
          </select>
          <label className="flex items-center gap-1.5 text-[11px] text-slate-600">
            <input type="checkbox" checked={mineOnly} onChange={(e) => setMineOnly(e.target.checked)} className="accent-brand-gold" /> Mine only
          </label>
        </div>
      </div>

      {/* Enter billing (all staff) */}
      <section className="rounded-2xl border border-brand-navy/10 bg-white p-6 shadow-[0_20px_40px_-20px_rgba(10,45,80,0.12)]">
        <h3 className="font-display text-sm font-bold text-brand-navy">Enter billing entry</h3>
        <p className="mt-0.5 text-[10px] text-slate-500 mt-1">Saved as a draft — a manager confirms before it affects the client's balance.</p>
        {!isMoneyManager && type === 'invoice' && (
          <div className="mt-3 rounded-xl border border-emerald-500/40 bg-emerald-50 p-3 text-[11px] text-emerald-800">
            <span className="font-bold">Counselor auto-confirm:</span> invoices within your division scope are confirmed and synced to ERP instantly; anything above the owner's threshold goes to a manager for approval.
          </div>
        )}
        <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-3">
          <div>
            <label className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-brand-gold">Client</label>
            <select value={clientId} onChange={(e) => setClientId(e.target.value)} className="w-full rounded-lg border border-brand-navy/15 bg-slate-50 px-3 py-2 text-xs text-brand-navy">
              <option value="">Select client</option>
              {clients.map((c) => <option key={c.id} value={c.id}>{c.name} ({c.id})</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-brand-gold">Engagement</label>
            <select value={engagementId} onChange={(e) => setEngagementId(e.target.value)} className="w-full rounded-lg border border-brand-navy/15 bg-slate-50 px-3 py-2 text-xs text-brand-navy">
              <option value="">Select engagement</option>
              {(clientsData?.engagements || []).filter((e) => e.clientId === clientId).map((e) => (
                <option key={e.id} value={e.id}>{e.title || e.id} · {e.division}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-brand-gold">Entry type</label>
            <select value={type} onChange={(e) => setType(e.target.value as any)} className="w-full rounded-lg border border-brand-navy/15 bg-slate-50 px-3 py-2 text-xs text-brand-navy">
              <option value="invoice">Invoice (+balance)</option>
              <option value="charge">Charge (+balance)</option>
              <option value="receipt">Receipt (−balance)</option>
              <option value="refund">Refund (+balance)</option>
            </select>
          </div>
          <div>
            <label className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-brand-gold">Amount (₹)</label>
            <input type="number" min={0} value={amountPaise / 100} onChange={(e) => setAmountPaise(Math.round(parseFloat(e.target.value || '0') * 100))} className="w-full rounded-lg border border-brand-navy/15 bg-slate-50 px-3 py-2 text-xs text-brand-navy" />
          </div>
          <div>
            <label className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-brand-gold">Milestone / item</label>
            <input value={milestoneName} onChange={(e) => setMilestoneName(e.target.value)} placeholder="e.g. Visa processing fee" className="w-full rounded-lg border border-brand-navy/15 bg-slate-50 px-3 py-2 text-xs text-brand-navy" />
          </div>
          <div>
            <label className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-brand-gold">Method · Interstate</label>
            <div className="flex gap-2">
              <select value={method} onChange={(e) => setMethod(e.target.value)} className="flex-1 rounded-lg border border-brand-navy/15 bg-slate-50 px-3 py-2 text-xs text-brand-navy">
                <option value="upi">UPI</option><option value="bank_transfer">Bank</option><option value="cash">Cash</option>
              </select>
              <input type="checkbox" checked={isInterstate} onChange={(e) => setIsInterstate(e.target.checked)} title="Interstate (IGST)" className="accent-brand-gold" />
            </div>
          </div>
          <div>
            <label className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-brand-gold">Invoice date</label>
            <input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} className="w-full rounded-lg border border-brand-navy/15 bg-slate-50 px-3 py-2 text-xs text-brand-navy" />
          </div>
          <div>
            <label className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-brand-gold">Due date</label>
            <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="w-full rounded-lg border border-brand-navy/15 bg-slate-50 px-3 py-2 text-xs text-brand-navy" />
          </div>
          <div>
            <label className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-brand-gold">GST rate %</label>
            <input type="number" min={0} max={100} value={gstRate} onChange={(e) => setGstRate(Number(e.target.value) || 0)} className="w-full rounded-lg border border-brand-navy/15 bg-slate-50 px-3 py-2 text-xs text-brand-navy" />
          </div>
          <div>
            <label className="mb-1 block text-[9px] font-bold uppercase tracking-wider text-brand-gold">Customer GSTIN (15 chars)</label>
            <input value={customerGstin} onChange={(e) => setCustomerGstin(e.target.value.toUpperCase())} placeholder="22AAAAA0000A1Z5" maxLength={15} className="w-full rounded-lg border border-brand-navy/15 bg-slate-50 px-3 py-2 font-mono text-xs text-brand-navy" />
          </div>
        </div>
        <button onClick={() => createDraft.mutate()} disabled={createDraft.isPending || !clientId || amountPaise <= 0}
          className="mt-4 rounded-full bg-brand-navy px-6 py-2.5 text-[11px] font-bold uppercase tracking-wider text-white transition hover:bg-brand-gold hover:text-brand-navy disabled:opacity-40">
          {createDraft.isPending ? 'Saving…' : 'Save as draft'}
        </button>
      </section>

      {/* Owner/manager: auto-confirm policy for counselors */}
      {isMoneyManager && (
        <section className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-brand-navy/10 bg-white p-6 shadow-[0_20px_40px_-20px_rgba(10,45,80,0.12)]">
          <div>
            <h3 className="font-display text-sm font-bold text-brand-navy">Counselor auto-confirm policy</h3>
            <p className="mt-0.5 text-[10px] text-slate-500">When enabled, counselors' invoices within their division scope and under the threshold confirm + sync to ERP instantly; above it, they wait for your approval.</p>
          </div>
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 text-xs font-semibold text-brand-navy">
              <input type="checkbox" checked={autoConfirm} onChange={(e) => setAutoConfirm(e.target.checked)} className="h-4 w-4 accent-brand-gold" />
              Auto-confirm
            </label>
            <label className="flex items-center gap-2 text-xs font-semibold text-brand-navy">
              Threshold (₹)
              <input type="number" min={0} value={thresholdRs} onChange={(e) => setThresholdRs(Number(e.target.value) || 0)} className="w-28 rounded-lg border border-brand-navy/15 bg-slate-50 px-3 py-2 text-xs text-brand-navy" />
            </label>
            <button onClick={() => saveProfile.mutate()} disabled={saveProfile.isPending} className="rounded-full bg-brand-gold px-5 py-2.5 text-[11px] font-bold uppercase tracking-wider text-brand-navy hover:bg-brand-1 disabled:opacity-40">
              {saveProfile.isPending ? 'Saving…' : 'Save policy'}
            </button>
          </div>
        </section>
      )}

      {/* Ledger */}
      <section className="overflow-x-auto rounded-2xl border border-brand-navy/10 bg-white shadow-[0_20px_40px_-20px_rgba(10,45,80,0.12)]">
        <table className="w-full text-left text-xs">
          <thead>
            <tr className="border-b border-brand-navy/10 bg-[#FAF8F4] text-[10px] uppercase tracking-wider text-slate-500">
              <th className="px-5 py-3">Client</th>
              <th className="px-5 py-3">Type</th>
              <th className="px-5 py-3">Item</th>
              <th className="px-5 py-3">Amount</th>
              <th className="px-5 py-3">GST</th>
              <th className="px-5 py-3">Status</th>
              <th className="px-5 py-3">By</th>
              <th className="px-5 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={8} className="px-5 py-10 text-center text-slate-400">No transactions yet — enter your first billing entry above.</td></tr>}
            {rows.map((t) => (
              <tr key={t.id} className="border-b border-brand-navy/5 last:border-0 hover:bg-brand-gold/5">
                <td className="px-5 py-3.5">
                  <div className="font-semibold text-brand-navy">{t.clientName}</div>
                  <div className="font-mono text-[9px] text-slate-400">{t.clientId}</div>
                </td>
                <td className="px-5 py-3.5"><span className="rounded-full bg-brand-navy/5 px-2 py-0.5 text-[9px] font-bold uppercase text-slate-600">{TYPE_LABEL[t.type] || t.type}</span></td>
                <td className="px-5 py-3.5 text-slate-700">{t.milestoneName}</td>
                <td className="px-5 py-3.5 font-mono font-bold text-brand-navy">{rs(t.amount)}</td>
                <td className="px-5 py-3.5 text-[10px] text-slate-500">
                  {t.taxableAmount != null ? `${t.gstRate}% · net ${rs(t.taxableAmount)} · CGST ${rs(t.cgst || 0)} · SGST ${rs(t.sgst || 0)}${t.igst ? ` · IGST ${rs(t.igst)}` : ''}` : '—'}
                  <span className="block">
                    {t.invoiceDate ? new Date(t.invoiceDate * 1000).toLocaleDateString() : ''}
                    {t.dueDate ? ` → due ${new Date(t.dueDate * 1000).toLocaleDateString()}` : ''}
                    {t.customerGstin ? ` · ${t.customerGstin}` : ''}
                  </span>
                </td>
                <td className="px-5 py-3.5"><span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${STATUS_STYLE[t.status] || STATUS_STYLE.draft}`}>{t.status}</span></td>
                <td className="px-5 py-3.5 text-[10px] text-slate-500">{t.enteredBy ? t.enteredBy.slice(0, 8) : '—'}</td>
                <td className="px-5 py-3.5">
                  {isMoneyManager && t.status === 'draft' && (
                    <span className="flex gap-1.5">
                      <button onClick={() => confirmTx.mutate(t.id)} className="rounded-full border border-emerald-500/40 px-2.5 py-1 text-[9px] font-bold uppercase text-emerald-700 hover:bg-emerald-600 hover:text-white">Confirm</button>
                      <button onClick={() => voidTx.mutate(t.id)} className="rounded-full border border-rose-500/40 px-2.5 py-1 text-[9px] font-bold uppercase text-rose-700 hover:bg-rose-600 hover:text-white">Void</button>
                    </span>
                  )}
                  {isMoneyManager && t.status === 'confirmed' && (
                    <button onClick={() => voidTx.mutate(t.id)} className="rounded-full border border-rose-500/40 px-2.5 py-1 text-[9px] font-bold uppercase text-rose-700 hover:bg-rose-600 hover:text-white">Void</button>
                  )}
                  {!isMoneyManager && t.status === 'draft' && <span className="text-[9px] text-slate-400">awaiting confirm</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}