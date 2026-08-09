import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';

// A-5: session-driven auth ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â read the live better-auth cookie; no forged admin token.
const AUTH = {
  get Cookie() {
    const s = document.cookie.split(';').map(p => p.trim()).find(p => p.startsWith('better-auth.session_token='));
    return s || '';
  }
} as Record<string, string>;
const nowPeriod = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
const rs = (n?: number) => `ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¹${((n || 0) / 100).toFixed(2)}`;

export default function ComplianceTab() {
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
  const runG3 = async () => { const d = await r3(); if (d.data?.computed) { dl(`GSTR3B-${period}.json`, d.data.data); flash(`GSTR-3B: out ${rs(d.data.computed.outputTax)} Ãƒâ€šÃ‚Â· net ${rs(d.data.computed.netPayable)}`); } else flash('GSTR-3B failed', false); };

  const [rec, setRec] = useState<any>(null);
  const on2b = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    try { const r = await fetch('/api/compliance/reconcile-2b', { method: 'POST', headers: { 'Content-Type': 'application/json', ...AUTH }, body: JSON.stringify({ period, gstr2b: JSON.parse(await f.text()) }) }); const d = await r.json(); if (!r.ok) throw new Error(d?.error); setRec(d); flash(`2B: ${d.summary.matched} matched Ãƒâ€šÃ‚Â· ${d.summary.mismatched} mismatch Ãƒâ€šÃ‚Â· ${d.summary.booksOnly} books-only Ãƒâ€šÃ‚Â· ${d.summary.twoBOnly} 2B-only`); } catch (er: any) { flash(er.message, false); } e.target.value = '';
  };

  const { data: reg, refetch: refetchReg } = useQuery<any>({ queryKey: ['tdstcs', period], queryFn: async () => (await fetch(`/api/compliance/tds-tcs?period=${period}`, { headers: AUTH })).json() });
  const [v, setV] = useState(''); const [sec, setSec] = useState('194J'); const [g, setG] = useState(''); const [t, setT] = useState('');
  const addTds = useMutation({ mutationFn: async () => { const r = await fetch('/api/compliance/tds', { method: 'POST', headers: { 'Content-Type': 'application/json', ...AUTH }, body: JSON.stringify({ vendorName: v, section: sec, code: sec === '194J' ? '1027' : sec === '194C' ? '1026' : '1028', grossAmount: Math.round(parseFloat(g || '0') * 100), tdsAmount: Math.round(parseFloat(t || '0') * 100), period }) }); if (!r.ok) throw new Error('TDS'); return r.json(); }, onSuccess: (d) => { flash(d.message || 'TDS recorded'); setV(''); setG(''); setT(''); refetchReg(); }, onError: (e: any) => flash(e.message, false) });

  return (
    <div className="space-y-6">
      {msg && <div className={`p-3 rounded-lg text-xs font-semibold ${msg.ok ? 'bg-emerald-950/40 border border-emerald-800 text-emerald-400' : 'bg-rose-950/40 border border-rose-800 text-rose-400'}`}>{msg.t}</div>}

      <div className="flex items-center justify-between">
        <h2 className="font-display font-bold text-base text-brand-navy">GST & Statutory Compliance Workbench (Section 14.5)</h2>
        <input type="month" value={period} onChange={e => setPeriod(e.target.value)} className="bg-white border border-brand-navy/10 rounded px-3 py-2 text-xs text-brand-navy" />
      </div>

      {/* Profile */}
      <div className="bg-[#1C2541]/40 border border-brand-navy/10 rounded-xl p-5 flex flex-wrap items-end gap-3 text-xs">
        <div>
          <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1">Legal name</label>
          <div className="bg-white border border-brand-navy/10 rounded px-3 py-2 text-brand-navy">{prof?.profile?.legalName || 'ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â'}</div>
        </div>
        <div>
          <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1">GSTIN</label>
          <input value={gstin || prof?.profile?.gstin || ''} onChange={e => setGstin(e.target.value)} placeholder="GSTIN" className="bg-white border border-brand-navy/10 rounded px-3 py-2 text-brand-navy w-52" />
        </div>
        <div>
          <label className="text-[10px] text-slate-500 font-bold uppercase block mb-1">State</label>
          <div className="bg-white border border-brand-navy/10 rounded px-3 py-2 text-brand-navy">{prof?.profile?.stateName || 'ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â'}</div>
        </div>
        <button onClick={() => saveProfile.mutate()} className="self-end bg-brand-gold hover:bg-brand-goldHover text-brand-navy px-4 py-2 rounded text-xs font-bold">Save</button>
      </div>

      {/* GSTR-1 / 3B */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <div className="bg-[#1E1F41]/40 border border-brand-navy/10 rounded-xl p-5 space-y-3">
          <h3 className="font-display font-bold text-sm text-brand-navy">GSTR-1 Export</h3>
          <p className="text-[10px] text-slate-500">GSTN offline-tool JSON v1.7 ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â B2B, B2C, HSN, credit notes, doc summary.</p>
          <button onClick={runG1} disabled={f1} className="bg-brand-gold hover:bg-brand-goldHover text-brand-navy px-5 py-2.5 rounded text-xs font-bold disabled:opacity-40">{f1 ? 'Building...' : 'Export GSTR-1 JSON'}</button>
          {g1?.stats && <div className="text-[10px] text-emerald-400">{g1.stats.b2bInvoices} B2B Ãƒâ€šÃ‚Â· {g1.stats.b2cLines} B2C Ãƒâ€šÃ‚Â· {g1.stats.hsnLines} HSN</div>}
        </div>
        <div className="bg-[#1E1F41]/40 border border-brand-navy/10 rounded-xl p-5 space-y-3">
          <h3 className="font-display font-bold text-sm text-brand-navy">GSTR-3B Computation</h3>
          <p className="text-[10px] text-slate-500">Output tax, ITC from purchases, net payable ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Â from D1.</p>
          <button onClick={runG3} disabled={f3} className="bg-brand-gold hover:bg-brand-goldHover text-brand-navy px-5 py-2.5 rounded text-xs font-bold disabled:opacity-40">{f3 ? 'Computing...' : 'Export GSTR-3B JSON'}</button>
          {g3?.computed && (
            <div className="grid grid-cols-3 gap-2 text-[10px]">
              <div className="bg-white rounded p-2"><span className="text-slate-500 block">Output</span><b className="text-brand-navy">{rs(g3.computed.outputTax)}</b></div>
              <div className="bg-white rounded p-2"><span className="text-slate-500 block">ITC</span><b className="text-emerald-300">{rs(g3.computed.inputItc)}</b></div>
              <div className="bg-white rounded p-2"><span className="text-slate-500 block">Net</span><b className="text-brand-warning">{rs(g3.computed.netPayable)}</b></div>
            </div>
          )}
        </div>
      </div>

      {/* 2B */}
      <div className="bg-[#1E1F41]/40 border border-brand-navy/10 rounded-xl p-5 space-y-3">
        <h3 className="font-display font-bold text-sm text-brand-navy">GSTR-2B Reconciliation</h3>
        <p className="text-[10px] text-slate-500">Import gst.gov.in 2B JSON ÃƒÂ¢Ã¢â‚¬Â Ã¢â‚¬â„¢ auto-match vs D1 purchase invoices.</p>
        <label className="inline-block bg-brand-gold hover:bg-brand-goldHover text-brand-navy px-5 py-2.5 rounded text-xs font-bold cursor-pointer">Import 2B JSON<input type="file" accept=".json" onChange={on2b} className="hidden" /></label>
        {rec && (
          <div className="grid grid-cols-4 gap-2 text-[10px]">
            <div className="bg-emerald-950/40 border border-emerald-800 rounded-lg p-2 text-center"><b className="text-emerald-300">{rec.summary.matched}</b><span className="text-slate-500 block">Matched</span></div>
            <div className="bg-amber-950/40 border border-amber-800 rounded-lg p-2 text-center"><b className="text-amber-300">{rec.summary.mismatched}</b><span className="text-slate-500 block">Mismatch</span></div>
            <div className="bg-rose-950/40 border border-rose-800 rounded-lg p-2 text-center"><b className="text-rose-300">{rec.summary.twoBOnly}</b><span className="text-slate-500 block">2B-only</span></div>
            <div className="bg-white border border-brand-navy/10 rounded-lg p-2 text-center"><b className="text-brand-navy">{rec.summary.booksOnly}</b><span className="text-slate-500 block">Books-only</span></div>
          </div>
        )}
      </div>

      {/* TDS */}
      <div className="bg-[#1E1F41]/40 border border-brand-navy/10 rounded-xl p-5 space-y-4">
        <h3 className="font-display font-bold text-sm text-brand-gold">TDS Register (new codes 1026ÃƒÂ¢Ã¢â€šÂ¬Ã¢â‚¬Å“1028)</h3>
        <form onSubmit={(e) => { e.preventDefault(); if (v.trim() && g) addTds.mutate(); }} className="flex flex-wrap gap-2 text-xs">
          <input value={v} onChange={e => setV(e.target.value)} placeholder="Vendor / payee" className="w-44 bg-white border border-brand-navy/10 rounded px-2 py-2 text-brand-navy placeholder-slate-400" />
          <select value={sec} onChange={e => setSec(e.target.value)} className="bg-white border border-brand-navy/10 rounded px-2 py-2 text-brand-navy"><option value="194J">194J</option><option value="194C">194C</option><option value="194H">194H</option></select>
          <input type="number" value={g} onChange={e => setG(e.target.value)} placeholder="Gross ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¹" className="w-24 bg-white border border-brand-navy/10 rounded px-2 py-2 text-brand-navy placeholder-slate-400" />
          <input type="number" value={t} onChange={e => setT(e.target.value)} placeholder="TDS ÃƒÂ¢Ã¢â‚¬Å¡Ã‚Â¹" className="w-24 bg-white border border-brand-navy/10 rounded px-2 py-2 text-brand-navy placeholder-slate-400" />
          <button type="submit" className="bg-brand-gold hover:bg-brand-goldHover text-brand-navy px-4 py-2 rounded text-xs font-bold">Add TDS</button>
        </form>
        <div className="space-y-1.5">
          {reg?.tds?.map((r: any) => (
            <div key={r.id} className="flex justify-between items-center bg-white border border-brand-navy/10 rounded px-3 py-2 text-xs">
              <span className="text-brand-navy font-semibold">{r.vendor_name} <span className="text-slate-500">Ãƒâ€šÃ‚Â· {r.section} Ãƒâ€šÃ‚Â· code {r.code}</span></span>
              <span className="text-brand-gold font-mono">{rs(r.tds_amount)}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
