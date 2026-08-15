import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { useRevealRoot } from '../lib/reveal';

// A-5: session-driven auth —- read the live better-auth cookie; no forged admin token.
const AUTH = {
  get Cookie() {
    const s = document.cookie.split(';').map(p => p.trim()).find(p => p.startsWith('better-auth.session_token='));
    return s || '';
  }
} as Record<string, string>;
const nowPeriod = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const rs = (n?: number) => `₹${((n || 0) / 100).toFixed(2)}`;

export default function ComplianceTab() {
  const rootRef = useRevealRoot<HTMLDivElement>();
  const [period, setPeriod] = useState(nowPeriod());
  const [msg, setMsg] = useState<{ t: string; ok: boolean } | null>(null);
  const flash = (t: string, ok = true) => { setMsg({ t, ok }); setTimeout(() => setMsg(null), 5000); };

  const { data: prof } = useQuery<any>({ queryKey: ['cmpProfile'], queryFn: async () => (await fetch('/api/compliance/business-profile', { headers: AUTH })).json() });
  const [gstin, setGstin] = useState('');
  const saveProfile = useMutation({ mutationFn: async () => { const r = await fetch('/api/compliance/business-profile', { method: 'POST', headers: { 'Content-Type': 'application/json', ...AUTH }, body: JSON.stringify({ gstin }) }); if (!r.ok) throw new Error('save'); return r.json(); }, onSuccess: (d) => flash(d.message || 'Saved'), onError: (e: any) => flash(e.message, false) });

  const dl = (name: string, data: any) => { const b = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = name; a.click(); URL.revokeObjectURL(u); };

  const { data: g1, refetch: r1, isFetching: f1 } = useQuery<any>({ queryKey: ['gstr1', period], queryFn: async () => (await fetch(`/api/compliance/gstr1?period=${period}`, { headers: AUTH })).json(), enabled: false });
  const { data: g3, refetch: r3, isFetching: f3 } = useQuery<any>({ queryKey: ['gstr3b', period], queryFn: async () => (await fetch(`/api/compliance/gstr3b?period=${period}`, { headers: AUTH })).json(), enabled: false });

  const runG1 = async () => { const d = await r1(); if (d.data?.stats) { dl(`GSTR1-${period}.json`, d.data.data); flash(`GSTR-1 exported: ${d.data.stats.b2bInvoices} B2B, ${d.data.stats.b2cLines} B2C`); } else flash('GSTR-1 failed', false); };
  const runG3 = async () => { const d = await r3(); if (d.data?.computed) { dl(`GSTR3B-${period}.json`, d.data.data); flash(`GSTR-3B: out ${rs(d.data.computed.outputTax)} · net ${rs(d.data.computed.netPayable)}`); } else flash('GSTR-3B failed', false); };

const [rec, setRec] = useState<any>(null);
  const on2b = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    try { const r = await fetch('/api/compliance/reconcile-2b', { method: 'POST', headers: { 'Content-Type': 'application/json', ...AUTH }, body: JSON.stringify({ period, gstr2b: JSON.parse(await f.text()) }) }); const d = await r.json(); if (!r.ok) throw new Error(d?.error); setRec(d); flash(`2B: ${d.summary.matched} matched · ${d.summary.mismatched} mismatch · ${d.summary.booksOnly} books-only · ${d.summary.twoBOnly} 2B-only`); } catch (er: any) { flash(er.message, false); } e.target.value = '';
  };

  // ---- Employer statutory registers (§14.5.4) ----
  const [sType, setSType] = useState('pt');
  const [sEmp, setSEmp] = useState('');
  const [sWage, setSWage] = useState('');
  const [sDed, setSDed] = useState('');
  const [sEmpShare, setSEmpShare] = useState('');
  const { data: stat, refetch: refetchStat } = useQuery<any>({
    queryKey: ['statutory', period],
    queryFn: async () => (await fetch(`/api/compliance/statutory?month=${period}`, { headers: AUTH })).json(),
  });
  const statRows = stat?.registers || [];
  const statSummary = stat?.summary;
  const addStatutory = useMutation({
    mutationFn: async () => {
      const r = await fetch('/api/compliance/statutory', {
        method: 'POST', headers: { 'Content-Type': 'application/json', ...AUTH },
        body: JSON.stringify({ entries: [{
          month: period, type: sType, employeeName: sEmp,
          wageAmount: Math.round(parseFloat(sWage || '0') * 100),
          deductionPaise: Math.round(parseFloat(sDed || '0') * 100),
          employerShare: Math.round(parseFloat(sEmpShare || '0') * 100),
        }] }),
      });
      if (!r.ok) { const e = await r.json().catch(() => null); throw new Error(e?.error || 'Add failed'); }
      return r.json();
    },
    onSuccess: (d) => { flash(d.message || 'Entry added'); setSEmp(''); setSWage(''); setSDed(''); setSEmpShare(''); refetchStat(); },
    onError: (e: any) => flash(e.message, false),
  });
  const markPaid = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/compliance/statutory/${id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json', ...AUTH },
        body: JSON.stringify({ status: 'paid' }),
      });
      if (!r.ok) { const e = await r.json().catch(() => null); throw new Error(e?.error || 'Update failed'); }
      return r.json();
    },
    onSuccess: (d) => { flash(d.message || 'Marked paid'); refetchStat(); },
    onError: (e: any) => flash(e.message, false),
  });

  // ---- Compliance calendar (§14.5.6) + CA export (§6) ----
  const { data: cal, refetch: refetchCal, isFetching: isFetchingCal } = useQuery<any>({
    queryKey: ['complianceCalendar'],
    queryFn: async () => (await fetch('/api/compliance/calendar', { headers: AUTH })).json(),
  });
  const calItems = cal?.calendar || [];
  const runCalendar = () => { refetchCal(); };
  const [isExporting, setIsExporting] = useState(false);
  const runExport = async () => {
    setIsExporting(true);
    try {
      const r = await fetch(`/api/compliance/export?period=${period}`, { headers: AUTH });
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d?.error || 'Export failed');
      dl(`CA-PACK-${period}.json`, d.pack);
      flash(`CA pack exported (${period}) — logged to audit.`);
    } catch (er: any) { flash(er.message, false); }
    setIsExporting(false);
  };

  const { data: reg, refetch: refetchReg } = useQuery<any>({ queryKey: ['tdstcs', period], queryFn: async () => (await fetch(`/api/compliance/tds-tcs?period=${period}`, { headers: AUTH })).json() });
  const [v, setV] = useState(''); const [sec, setSec] = useState('194J'); const [g, setG] = useState(''); const [t, setT] = useState('');
  const addTds = useMutation({ mutationFn: async () => { const r = await fetch('/api/compliance/tds', { method: 'POST', headers: { 'Content-Type': 'application/json', ...AUTH }, body: JSON.stringify({ vendorName: v, section: sec, code: sec === '194J' ? '1027' : sec === '194C' ? '1026' : '1028', grossAmount: Math.round(parseFloat(g || '0') * 100), tdsAmount: Math.round(parseFloat(t || '0') * 100), period }) }); if (!r.ok) throw new Error('TDS'); return r.json(); }, onSuccess: (d) => { flash(d.message || 'TDS recorded'); setV(''); setG(''); setT(''); refetchReg(); }, onError: (e: any) => flash(e.message, false) });

  return (
    <div ref={rootRef} className="space-y-6">
      {msg && <div className={`p-3 rounded-lg text-xs font-semibold ${msg.ok ? 'bg-emerald-50 border border-emerald-200 text-emerald-700' : 'bg-rose-50 border border-rose-200 text-rose-600'}`}>{msg.t}</div>}

      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="gold-dot" />
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-gold">Compliance</span>
          </div>
          <h2 className="font-display font-bold text-base text-brand-navy">GST & Statutory Compliance Workbench (Section 14.5)</h2>
        </div>
        <input type="month" value={period} onChange={e => setPeriod(e.target.value)} className="bg-white border border-brand-navy/10 rounded px-3 py-2 text-xs text-brand-navy" />
      </div>

      {/* Profile */}
      <div className="reveal rounded-2xl border border-brand-navy/10 bg-white p-5 flex flex-wrap items-end gap-3 text-xs">
        <div>
          <label className="text-[10px] text-brand-navy/40 font-bold uppercase block mb-1">Legal name</label>
          <div className="bg-white border border-brand-navy/10 rounded px-3 py-2 text-brand-navy">{prof?.profile?.legalName || '—-'}</div>
        </div>
        <div>
          <label className="text-[10px] text-brand-navy/40 font-bold uppercase block mb-1">GSTIN</label>
          <input value={gstin || prof?.profile?.gstin || ''} onChange={e => setGstin(e.target.value)} placeholder="GSTIN" className="bg-white border border-brand-navy/10 rounded px-3 py-2 text-brand-navy placeholder:text-brand-navy/40 w-52" />
        </div>
        <div>
          <label className="text-[10px] text-brand-navy/40 font-bold uppercase block mb-1">State</label>
          <div className="bg-white border border-brand-navy/10 rounded px-3 py-2 text-brand-navy">{prof?.profile?.stateName || '—-'}</div>
        </div>
        <button onClick={() => saveProfile.mutate()} className="self-end bg-brand-gold hover:bg-brand-gold/90 text-brand-navy px-4 py-2 rounded text-xs font-bold">Save</button>
      </div>

      {/* GSTR-1 / 3B */}
      <div className="reveal grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-2xl border border-brand-navy/10 bg-white p-5 space-y-3">
          <div className="flex items-center gap-2">
            <span className="gold-dot" />
            <h3 className="font-display font-bold text-sm text-brand-navy">GSTR-1 Export</h3>
          </div>
          <p className="text-[10px] text-brand-navy/40">GSTN offline-tool JSON v1.7 —- B2B, B2C, HSN, credit notes, doc summary.</p>
          <button onClick={runG1} disabled={f1} className="bg-brand-gold hover:bg-brand-gold/90 text-brand-navy px-5 py-2.5 rounded text-xs font-bold disabled:opacity-40">{f1 ? 'Building...' : 'Export GSTR-1 JSON'}</button>
          {g1?.stats && <div className="text-[10px] text-emerald-700">{g1.stats.b2bInvoices} B2B · {g1.stats.b2cLines} B2C · {g1.stats.hsnLines} HSN</div>}
        </div>
        <div className="rounded-2xl border border-brand-navy/10 bg-white p-5 space-y-3">
          <div className="flex items-center gap-2">
            <span className="gold-dot" />
            <h3 className="font-display font-bold text-sm text-brand-navy">GSTR-3B Computation</h3>
          </div>
          <p className="text-[10px] text-brand-navy/40">Output tax, ITC from purchases, net payable —- from D1.</p>
          <button onClick={runG3} disabled={f3} className="bg-brand-gold hover:bg-brand-gold/90 text-brand-navy px-5 py-2.5 rounded text-xs font-bold disabled:opacity-40">{f3 ? 'Computing...' : 'Export GSTR-3B JSON'}</button>
          {g3?.computed && (
            <div className="grid grid-cols-3 gap-2 text-[10px]">
              <div className="bg-brand-navy/[0.06] rounded p-2"><span className="text-brand-navy/40 block">Output</span><b className="text-brand-navy">{rs(g3.computed.outputTax)}</b></div>
              <div className="bg-brand-navy/[0.06] rounded p-2"><span className="text-brand-navy/40 block">ITC</span><b className="text-emerald-700">{rs(g3.computed.inputItc)}</b></div>
              <div className="bg-brand-navy/[0.06] rounded p-2"><span className="text-brand-navy/40 block">Net</span><b className="text-brand-warning">{rs(g3.computed.netPayable)}</b></div>
            </div>
          )}
        </div>
      </div>

      {/* 2B */}
      <div className="reveal rounded-2xl border border-brand-navy/10 bg-white p-5 space-y-3">
        <div className="flex items-center gap-2">
          <span className="gold-dot" />
          <h3 className="font-display font-bold text-sm text-brand-navy">GSTR-2B Reconciliation</h3>
        </div>
        <p className="text-[10px] text-brand-navy/40">Import gst.gov.in 2B JSON ₹ ’ auto-match vs D1 purchase invoices.</p>
        <label className="inline-block bg-brand-gold hover:bg-brand-gold/90 text-brand-navy px-5 py-2.5 rounded text-xs font-bold cursor-pointer">Import 2B JSON<input type="file" accept=".json" onChange={on2b} className="hidden" /></label>
        {rec && (
          <div className="grid grid-cols-4 gap-2 text-[10px]">
            <div className="bg-emerald-50 border border-emerald-200 rounded-lg p-2 text-center"><b className="text-emerald-700">{rec.summary.matched}</b><span className="text-brand-navy/40 block">Matched</span></div>
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-2 text-center"><b className="text-amber-700">{rec.summary.mismatched}</b><span className="text-brand-navy/40 block">Mismatch</span></div>
            <div className="bg-rose-50 border border-rose-200 rounded-lg p-2 text-center"><b className="text-rose-700">{rec.summary.twoBOnly}</b><span className="text-brand-navy/40 block">2B-only</span></div>
            <div className="bg-brand-navy/[0.06] border border-brand-navy/10 rounded-lg p-2 text-center"><b className="text-brand-navy">{rec.summary.booksOnly}</b><span className="text-brand-navy/40 block">Books-only</span></div>
          </div>
        )}
      </div>

      {/* TDS */}
      <div className="reveal rounded-2xl border border-brand-navy/10 bg-white p-5 space-y-4">
        <div className="flex items-center gap-2">
          <span className="gold-dot" />
          <h3 className="font-display font-bold text-sm text-brand-gold">TDS Register (new codes 10261028)</h3>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); if (v.trim() && g) addTds.mutate(); }} className="flex flex-wrap gap-2 text-xs">
          <input value={v} onChange={e => setV(e.target.value)} placeholder="Vendor / payee" className="w-44 bg-white border border-brand-navy/10 rounded px-2 py-2 text-brand-navy placeholder:text-brand-navy/40" />
          <select value={sec} onChange={e => setSec(e.target.value)} className="bg-white border border-brand-navy/10 rounded px-2 py-2 text-brand-navy"><option value="194J" className="bg-white">194J</option><option value="194C" className="bg-white">194C</option><option value="194H" className="bg-white">194H</option></select>
          <input type="number" value={g} onChange={e => setG(e.target.value)} placeholder="Gross ₹" className="w-24 bg-white border border-brand-navy/10 rounded px-2 py-2 text-brand-navy placeholder:text-brand-navy/40" />
          <input type="number" value={t} onChange={e => setT(e.target.value)} placeholder="TDS ₹" className="w-24 bg-white border border-brand-navy/10 rounded px-2 py-2 text-brand-navy placeholder:text-brand-navy/40" />
          <button type="submit" className="bg-brand-gold hover:bg-brand-gold/90 text-brand-navy px-4 py-2 rounded text-xs font-bold">Add TDS</button>
        </form>
        <div className="space-y-1.5">
          {reg?.tds?.map((r: any) => (
            <div key={r.id} className="flex justify-between items-center bg-brand-navy/[0.06] border border-brand-navy/10 rounded px-3 py-2 text-xs">
              <span className="text-brand-navy font-semibold">{r.vendor_name} <span className="text-brand-navy/40"> · {r.section} · code {r.code}</span></span>
              <span className="text-brand-gold font-mono">{rs(r.tds_amount)}</span>
            </div>
          ))}
        </div>
      </div>

      {/* EMPLOYER COMPLIANCE REGISTERS (§14.5.4) — PT / LWF / PF / ESI */}
      <div className="reveal rounded-2xl border border-brand-navy/10 bg-white p-5 space-y-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="gold-dot" />
            <h3 className="font-display font-bold text-sm text-brand-navy">Employer Compliance Registers</h3>
          </div>
          <p className="text-xs text-brand-navy/40 mt-0.5">Professional Tax, LWF, PF &amp; ESI per month (paise). Statutory due-dates auto-flag overdue by period.</p>
        </div>

        {/* Add entry */}
        <form onSubmit={(e) => { e.preventDefault(); addStatutory.mutate(); }} className="flex flex-wrap gap-2 items-center">
          <select value={sType} onChange={e => setSType(e.target.value)} className="bg-white border border-brand-navy/10 rounded px-2 py-2 text-xs text-brand-navy">
            <option value="pt" className="bg-white">PT (Professional Tax)</option>
            <option value="lwf" className="bg-white">LWF</option>
            <option value="pf" className="bg-white">PF</option>
            <option value="esi" className="bg-white">ESI</option>
          </select>
          <input value={sEmp} onChange={e => setSEmp(e.target.value)} placeholder="Employee name" className="w-40 bg-white border border-brand-navy/10 rounded px-2 py-2 text-xs text-brand-navy placeholder:text-brand-navy/40" />
          <input type="number" value={sWage} onChange={e => setSWage(e.target.value)} placeholder="Wage ₹" className="w-24 bg-white border border-brand-navy/10 rounded px-2 py-2 text-xs text-brand-navy placeholder:text-brand-navy/40" />
          <input type="number" value={sDed} onChange={e => setSDed(e.target.value)} placeholder="Deduct ₹" className="w-24 bg-white border border-brand-navy/10 rounded px-2 py-2 text-xs text-brand-navy placeholder:text-brand-navy/40" />
          <input type="number" value={sEmpShare} onChange={e => setSEmpShare(e.target.value)} placeholder="Employer ₹" className="w-24 bg-white border border-brand-navy/10 rounded px-2 py-2 text-xs text-brand-navy placeholder:text-brand-navy/40" />
          <button type="submit" className="bg-brand-gold hover:bg-brand-gold/90 text-brand-navy px-4 py-2 rounded text-xs font-bold">Add entry</button>
        </form>

        {/* Summary chips */}
        {statSummary && (
          <div className="flex flex-wrap gap-3 text-[10px]">
            {Object.entries(statSummary).map(([k, v]: any) => (
              <span key={k} className="rounded-full border border-brand-navy/10 bg-brand-navy/[0.06] px-3 py-1 text-brand-navy/40">
                {k.toUpperCase()}: {v.rows.length} rows · ₹{(v.totalDeduction / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })} · {v.paid} paid / {v.pending} pending
              </span>
            ))}
          </div>
        )}

        {/* entries */}
        {statRows.length === 0 ? (
          <p className="text-[10px] text-brand-navy/40 text-center py-3">No statutory entries yet for this period — add employee deductions above.</p>
        ) : (
          <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
            {statRows.map((r: any) => (
              <div key={r.id} className="flex justify-between items-center bg-brand-navy/[0.06] border border-brand-navy/10 rounded px-3 py-2 text-xs">
                <span className="text-brand-navy font-semibold">{r.employeeName || r.employee_name} <span className="text-brand-navy/40"> · {(r.type || '').toUpperCase()} · {r.month}</span></span>
                <span className="flex items-center gap-2">
                  <span className="text-brand-gold font-mono">₹{((r.deductionPaise ?? r.deduction_paise ?? 0) / 100).toFixed(0)}</span>
                  {(r.status === 'pending' || r.status === 'overdue') && (
                    <button onClick={() => markPaid.mutate(r.id)} className="cursor-pointer rounded-full border border-emerald-600/40 px-2 py-0.5 text-[9px] font-bold uppercase text-emerald-700 hover:bg-emerald-600 hover:text-white transition">Paid</button>
                  )}
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${r.status === 'paid' ? 'bg-emerald-500/15 text-emerald-700' : 'bg-amber-500/15 text-amber-700'}`}>{r.status}</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* COMPLIANCE CALENDAR + CA EXPORT (§14.5.6 / §6) */}
      <div className="reveal grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="rounded-2xl border border-brand-navy/10 bg-white p-5 space-y-3">
          <div className="flex items-center gap-2">
            <span className="gold-dot" />
            <h3 className="font-display font-bold text-sm text-brand-navy">Statutory Calendar</h3>
          </div>
          <p className="text-[10px] text-brand-navy/40">Next 3 months of GST / TDS / PF / ESI / LWF deadlines vs live books.</p>
          {(() => {
            const overdue = calItems.filter((i: any) => i.status === 'overdue');
            const dueSoon = calItems.filter((i: any) => i.status === 'due');
            if (overdue.length === 0 && dueSoon.length === 0) return null;
            return (
              <div className="space-y-1.5">
                {overdue.length > 0 && (
                  <div className="rounded-lg border border-rose-200 bg-rose-50/70 p-2.5 text-[10px] text-rose-700">
                    <b>🔴 {overdue.length} overdue:</b> {overdue.map((i: any) => i.label).join(' · ')}
                  </div>
                )}
                {dueSoon.length > 0 && (
                  <div className="rounded-lg border border-amber-200 bg-amber-50/70 p-2.5 text-[10px] text-amber-700">
                    <b>🟡 {dueSoon.length} due soon:</b> {dueSoon.map((i: any) => `${i.label} (${i.date})`).join(' · ')}
                  </div>
                )}
              </div>
            );
          })()}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {calItems.map((item: any) => {
              const badge = item.status === 'clear'
                ? 'bg-emerald-500/15 text-emerald-700'
                : item.status === 'overdue'
                  ? 'bg-rose-500/15 text-rose-700'
                  : 'bg-amber-500/15 text-amber-700';
              const label = item.status === 'clear' ? 'Clear' : item.status === 'overdue' ? 'Overdue' : 'Due';
              return (
                <div key={`${item.key}-${item.date}`} className="flex justify-between items-center bg-brand-navy/[0.06] border border-brand-navy/10 rounded px-3 py-2 text-xs">
                  <span className="text-brand-navy font-semibold">{item.label}</span>
                  <span className="flex items-center gap-2">
                    <span className="font-mono text-brand-navy/40">{item.date}</span>
                    <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${badge}`}>{label}</span>
                  </span>
                </div>
              );
            })}
          </div>
          {calItems.length === 0 && <p className="text-[10px] text-brand-navy/40 text-center py-2">Calendar loading…</p>}
        </div>

        <div className="rounded-2xl border border-brand-navy/10 bg-white p-5 space-y-3">
          <div className="flex items-center gap-2">
            <span className="gold-dot" />
            <h3 className="font-display font-bold text-sm text-brand-navy">CA Export Center</h3>
          </div>
          <p className="text-[10px] text-brand-navy/40">One-click statutory pack (GST outward + purchases, TDS/TCS, statutory registers, profile).</p>
          <div className="flex flex-wrap gap-2">
            <button onClick={runCalendar} disabled={isFetchingCal} className="bg-brand-gold hover:bg-brand-gold/90 text-brand-navy px-4 py-2 rounded text-xs font-bold disabled:opacity-50">
              {isFetchingCal ? 'Loading…' : 'Refresh Calendar'}
            </button>
            <button onClick={runExport} disabled={isExporting} className="border border-brand-navy/15 bg-brand-navy/[0.04] text-brand-navy hover:border-brand-gold/50 px-4 py-2 rounded text-xs font-bold disabled:opacity-50 transition">
              {isExporting ? 'Packing…' : `Export CA Pack (${period})`}
            </button>
          </div>
          <div className="rounded-xl bg-white border border-brand-navy/10 p-3 text-[10px] text-brand-navy/40 leading-relaxed">
            The pack is a single JSON envelope covering:<br/>
            <code className="font-mono">gst.outwardPayments · gst.purchaseInvoices · statutory · tds · tcs · businessProfile</code><br/>
            Hand it to the CA; each export is written to the audit trail.
          </div>
        </div>
      </div>
    </div>
  );
}
