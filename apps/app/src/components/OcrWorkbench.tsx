import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';

const API = (import.meta as any).env?.VITE_API_URL || '';

export default function OcrWorkbench({ clientId, clientName, showToast }: { clientId: string; clientName: string; showToast: (m: string)=>void }) {
  const [docId, setDocId] = useState('');
  const [line1, setLine1] = useState('');
  const [line2, setLine2] = useState('');
  const [vizSurname, setVizSurname] = useState('');
  const [result, setResult] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  // List documents for this client (for picker)
  const { data: docsData } = useQuery<any>({
    queryKey: ['ocrDocs', clientId],
    queryFn: async () => {
      const r = await fetch(`${API}/api/clients/${clientId}`, { credentials: 'include' });
      if(!r.ok) throw new Error('load');
      const j = await r.json();
      return j.documents || j.documentsData || [];
    },
    enabled: !!clientId,
  });
  const docs: any[] = Array.isArray(docsData) ? docsData : (docsData?.documents || []);
  // Fallback: also fetch via vault endpoint? Use documents array from Client360 context would be better but we fetch here

  const run = async () => {
    if(!docId) { showToast('Select a document first'); return; }
    if(!line1 || !line2) { showToast('Paste both MRZ lines (2×44)'); return; }
    setBusy(true);
    try {
      const r = await fetch(`${API}/api/staff/ocr/run`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ documentId: docId, mrzLine1: line1, mrzLine2: line2, vizFields: vizSurname ? { surname: vizSurname } : undefined }),
      });
      const j = await r.json();
      if(!r.ok) throw new Error(j.error || 'OCR failed');
      setResult(j);
      showToast(j.valid ? 'OCR: MRZ valid — staff can confirm' : 'OCR: MRZ issues — manual review required');
    } catch(e:any){ showToast(`OCR error: ${e.message}`); }
    setBusy(false);
  };

  const confirm = async (verify: boolean) => {
    if(!docId) return;
    setBusy(true);
    try {
      const r = await fetch(`${API}/api/staff/ocr/confirm`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ documentId: docId, patchedFields: { surname: vizSurname, confirmedName: clientName }, markVerified: verify }),
      });
      const j = await r.json();
      if(!r.ok) throw new Error(j.error || 'confirm failed');
      showToast(verify ? 'Document marked verified (HITL confirm)' : 'OCR confirmation saved — awaiting verify');
      setResult((prev:any)=> ({...prev, confirmed: j}));
    } catch(e:any){ showToast(`Confirm failed: ${e.message}`); }
    setBusy(false);
  };

  return (
    <div className="flex flex-col gap-6">
      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 text-xs text-amber-800">
        <b>Staff-only Workbench</b> — OCR at staff level only (per owner constraint). Client portal never sees MRZ, signals, or raw hash. All runs are audit-logged <code>OCR_RAN</code> with hash-chain. HITL confirm required before verified.
      </div>

      <div className="bg-white p-5 rounded-xl border border-brand-navy/10 shadow flex flex-col gap-4">
        <h3 className="font-display font-bold text-sm text-brand-navy">1 — Select Document (from Vault)</h3>
        <select value={docId} onChange={e=>setDocId(e.target.value)} className="w-full text-xs p-2.5 rounded bg-white border border-brand-navy/10">
          <option value="">— choose document R2 —</option>
          {(docs||[]).slice(0,20).map((d:any)=> <option key={d.id} value={d.id}>{d.fileName} — {d.id.slice(0,8)} — {d.status}</option>)}
        </select>
        <div className="text-[11px] text-brand-navy/40">Vault docs for client {clientId.slice(0,8)}… — staff picks the passport scan uploaded by client.</div>

        <h4 className="font-bold text-xs text-brand-navy mt-2">2 — Paste MRZ (ICAO 9303 TD3 2×44) — extracted via staff-side OCR (Tesseract/Workers AI) and pasted here for server validation</h4>
        <input value={line1} onChange={e=>setLine1(e.target.value.toUpperCase())} placeholder="P<IND… (44 chars) line 1" className="w-full font-mono text-xs p-2 rounded bg-slate-50 border border-brand-navy/10" maxLength={44} />
        <input value={line2} onChange={e=>setLine2(e.target.value.toUpperCase())} placeholder="PassportNo + checks (44 chars) line 2" className="w-full font-mono text-xs p-2 rounded bg-slate-50 border border-brand-navy/10" maxLength={44} />
        <input value={vizSurname} onChange={e=>setVizSurname(e.target.value)} placeholder="VIZ surname for cross-check (optional)" className="w-full text-xs p-2 rounded bg-white border border-brand-navy/10" />
        <div className="flex gap-2">
          <button onClick={run} disabled={busy} className="bg-brand-navy text-white px-4 py-2 rounded text-xs font-bold disabled:opacity-40">{busy ? 'Running…' : 'Run MRZ Validation (ICAO 7-3-1)'}</button>
          <button onClick={()=>{ setLine1(''); setLine2(''); setResult(null); }} className="border border-brand-navy/15 px-4 py-2 rounded text-xs">Clear</button>
        </div>
        {result && (
          <div className={`rounded-lg border p-3 text-xs ${result.valid ? 'bg-emerald-50 border-emerald-200 text-emerald-800' : 'bg-amber-50 border-amber-300 text-amber-900'}`}>
            <div className="font-bold">{result.valid ? '✓ MRZ VALID — composite pass' : '⚠ Manual review required'} — {result.status}</div>
            <div className="mt-2 grid grid-cols-2 gap-2 font-mono text-[11px]">
              <div>Document: {result.parsed?.passportNumber} {result.parsed?.passportNumberCheck}</div>
              <div>DOB: {result.parsed?.dob} check {result.parsed?.dobCheck}</div>
              <div>Expiry: {result.parsed?.expiry} check {result.parsed?.expiryCheck}</div>
              <div>Composite: {result.compositePass ? 'PASS' : 'FAIL'}</div>
            </div>
            <div className="mt-2 space-y-1">
              {result.signals?.map((s:any)=> (
                <div key={s.name} className={`px-2 py-1 rounded border text-[11px] ${s.pass ? 'bg-white border-emerald-200' : 'bg-white border-amber-300'}`}>
                  <b>{s.name}</b>: {s.pass ? 'PASS' : 'FAIL'} — {s.note} <span className="opacity-60">({Math.round(s.confidence*100)}%)</span>
                </div>
              ))}
            </div>
            <div className="mt-2 font-mono text-[10px] opacity-60 break-all">rawHash: {result.rawHash} · runId: {result.runId}</div>
          </div>
        )}
      </div>

      <div className="bg-white p-5 rounded-xl border border-brand-navy/10 shadow flex flex-col gap-3">
        <h3 className="font-bold text-sm text-brand-navy">3 — HITL Confirm (writes verified)</h3>
        <p className="text-xs text-brand-navy/50">Staff edits above if needed, then confirms. Client portal will see only <code>verified</code> badge, never MRZ/signals/rawHash.</p>
        <div className="flex gap-2">
          <button onClick={()=>confirm(false)} disabled={busy || !result} className="bg-white border border-brand-navy/20 px-4 py-2 rounded text-xs font-bold disabled:opacity-40">Save confirmation (no verify)</button>
          <button onClick={()=>confirm(true)} disabled={busy || !result || !result.valid} className="bg-emerald-600 text-white px-4 py-2 rounded text-xs font-bold disabled:opacity-40">Confirm & Mark Verified</button>
        </div>
      </div>
    </div>
  );
}
