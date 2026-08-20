import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRevealRoot } from '../lib/reveal';


const DIV_LABELS: Record<string, string> = {
  'study-abroad': 'Study Abroad', visa: 'Visa', umrah: 'Umrah', attestation: 'Attestation', manpower: 'Manpower',
};

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    draft: 'bg-brand-navy/[0.06] text-brand-navy/50',
    sent: 'bg-blue-500/15 text-blue-700',
    signed: 'bg-emerald-500/15 text-emerald-700',
    active: 'bg-emerald-500/15 text-emerald-700',
    terminated: 'bg-rose-500/15 text-rose-600',
  };
  return <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${map[status] || 'bg-brand-navy/[0.06] text-brand-navy/50'}`}>{status}</span>;
}

export default function AgreementsTab() {
  const rootRef = useRevealRoot<HTMLDivElement>();
  const qc = useQueryClient();
  const [view, setView] = useState<'agreements' | 'templates'>('agreements');
  const [tplForm, setTplForm] = useState({ name: '', division: 'study-abroad', clausesJson: '' });
  const [agrForm, setAgrForm] = useState({ clientId: '', templateId: '' });

  const { data: agreements } = useQuery<any>({ queryKey: ['agreements'], queryFn: async () => (await fetch('/api/agreements', { credentials: 'include' })).json() });
  const { data: templates } = useQuery<any>({ queryKey: ['agreementTemplates'], queryFn: async () => (await fetch('/api/agreements/templates', { credentials: 'include' })).json() });
  const { data: clients } = useQuery<any>({ queryKey: ['clientsList'], queryFn: async () => (await fetch('/api/clients', { credentials: 'include' })).json() });

  const createTpl = useMutation({
    mutationFn: async () => {
      const r = await fetch('/api/agreements/templates', { method: 'POST', headers: { 'Content-Type': 'application/json', }, body: JSON.stringify(tplForm) });
      if (!r.ok) throw new Error('tpl');
      return r.json();
    },
    onSuccess: (d) => { alert(d.message || 'Template created'); setTplForm({ name: '', division: 'study-abroad', clausesJson: '' }); qc.invalidateQueries({ queryKey: ['agreementTemplates'] }); },
    onError: () => alert('Create failed'),
  });
  const createAgr = useMutation({
    mutationFn: async () => {
      const r = await fetch('/api/agreements', { method: 'POST', headers: { 'Content-Type': 'application/json', }, body: JSON.stringify(agrForm) });
      if (!r.ok) throw new Error('agr');
      return r.json();
    },
    onSuccess: (d) => { alert(d.message || 'Agreement created'); setAgrForm({ clientId: '', templateId: '' }); qc.invalidateQueries({ queryKey: ['agreements'] }); },
    onError: () => alert('Create failed'),
  });
  const signAgr = useMutation({
    mutationFn: async ({ id, method }: { id: string; method: string }) => {
      const r = await fetch(`/api/agreements/${id}/sign`, { method: 'POST', headers: { 'Content-Type': 'application/json', }, body: JSON.stringify({ esignMethod: method }) });
      if (!r.ok) throw new Error('sign');
      return r.json();
    },
    onSuccess: (d) => { alert(d.message || 'Signed'); qc.invalidateQueries({ queryKey: ['agreements'] }); },
    onError: () => alert('Sign failed'),
  });

  const clientName = (id: string) => {
    const c = (clients?.clients || clients?.data || []).find((x: any) => x.id === id);
    return c?.name || id;
  };

  return (
    <div ref={rootRef} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="gold-dot" />
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-gold">Agreements</span>
          </div>
          <h2 className="font-display font-bold text-base text-brand-navy">Client Service Agreements — clause library, templates, e-sign</h2>
        </div>
        <div className="flex gap-1 rounded-full border border-brand-navy/15 bg-brand-navy/[0.04] p-1 text-[10px] font-bold uppercase">
          <button onClick={() => setView('agreements')} className={`px-3 py-1.5 rounded-full transition-all cursor-pointer ${view === 'agreements' ? 'bg-brand-gold text-brand-navy' : 'text-brand-navy/50 hover:text-brand-navy'}`}>Agreements</button>
          <button onClick={() => setView('templates')} className={`px-3 py-1.5 rounded-full transition-all cursor-pointer ${view === 'templates' ? 'bg-brand-gold text-brand-navy' : 'text-brand-navy/50 hover:text-brand-navy'}`}>Templates</button>
        </div>
      </div>

      {view === 'agreements' && (
        <>
          {/* Create agreement */}
          <div className="reveal rounded-2xl border border-brand-navy/10 bg-white p-5 space-y-3">
            <div className="flex items-center gap-2">
              <span className="gold-dot" />
              <h3 className="font-display font-bold text-sm text-brand-navy">Create Agreement</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              <select value={agrForm.clientId} onChange={e => setAgrForm({ ...agrForm, clientId: e.target.value })} className="bg-white border border-brand-navy/10 rounded px-2 py-2 text-xs text-brand-navy">
                <option value="">Select client…</option>
                {(clients?.clients || clients?.data || []).map((c: any) => <option key={c.id} value={c.id} className="bg-white">{c.name} ({c.id})</option>)}
              </select>
              <select value={agrForm.templateId} onChange={e => setAgrForm({ ...agrForm, templateId: e.target.value })} className="bg-white border border-brand-navy/10 rounded px-2 py-2 text-xs text-brand-navy">
                <option value="">Select template…</option>
                {(templates?.templates || []).map((t: any) => <option key={t.id} value={t.id} className="bg-white">{t.name} ({DIV_LABELS[t.division] || t.division})</option>)}
              </select>
              <button onClick={() => createAgr.mutate()} disabled={!agrForm.clientId || !agrForm.templateId} className="bg-brand-gold hover:bg-brand-gold/90 text-brand-navy px-4 py-2 rounded text-xs font-bold disabled:opacity-40 cursor-pointer">+ Create</button>
            </div>
          </div>

          {/* Agreements list */}
          <div className="reveal rounded-2xl border border-brand-navy/10 bg-white p-5 space-y-3">
            <div className="flex items-center gap-2">
              <span className="gold-dot" />
              <h3 className="font-display font-bold text-sm text-brand-navy">All Agreements ({agreements?.agreements?.length || 0})</h3>
            </div>
            <div className="space-y-1.5">
              {(agreements?.agreements || []).map((a: any) => (
                <div key={a.id} className="flex justify-between items-center bg-brand-navy/[0.06] border border-brand-navy/10 rounded px-3 py-2 text-xs">
                  <div>
                    <span className="text-brand-navy font-semibold">{clientName(a.clientId)}</span>
                    <span className="text-brand-navy/40"> · {a.templateId} · {a.esignMethod || 'no e-sign'}</span>
                    {a.signedAt && <span className="text-emerald-700"> · signed {new Date(a.signedAt * 1000).toLocaleDateString()}</span>}
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={a.status} />
                    {['draft', 'sent'].includes(a.status) && (
                      <select onChange={e => signAgr.mutate({ id: a.id, method: e.target.value })} defaultValue="" className="border border-brand-navy/15 rounded px-2 py-1 text-[9px] font-bold text-brand-navy cursor-pointer">
                        <option value="" disabled className="bg-white">Sign…</option>
                        <option value="aadhaar" className="bg-white">Aadhaar</option>
                        <option value="otp" className="bg-white">OTP</option>
                        <option value="wet_ink" className="bg-white">Wet ink</option>
                      </select>
                    )}
                  </div>
                </div>
              ))}
              {(agreements?.agreements || []).length === 0 && <p className="text-[10px] text-brand-navy/40 text-center py-2">No agreements yet — create one above.</p>}
            </div>
          </div>
        </>
      )}

      {view === 'templates' && (
        <>
          {/* Create template */}
          <div className="reveal rounded-2xl border border-brand-navy/10 bg-white p-5 space-y-3">
            <div className="flex items-center gap-2">
              <span className="gold-dot" />
              <h3 className="font-display font-bold text-sm text-brand-navy">Create Template</h3>
            </div>
            <div className="flex flex-wrap gap-2">
              <input value={tplForm.name} onChange={e => setTplForm({ ...tplForm, name: e.target.value })} placeholder="Template name" className="w-44 bg-white border border-brand-navy/10 rounded px-2 py-2 text-xs text-brand-navy placeholder:text-brand-navy/40" />
              <select value={tplForm.division} onChange={e => setTplForm({ ...tplForm, division: e.target.value })} className="bg-white border border-brand-navy/10 rounded px-2 py-2 text-xs text-brand-navy">
                {Object.entries(DIV_LABELS).map(([k, v]) => <option key={k} value={k} className="bg-white">{v}</option>)}
              </select>
              <input value={tplForm.clausesJson} onChange={e => setTplForm({ ...tplForm, clausesJson: e.target.value })} placeholder='Clauses JSON e.g. ["clause-1","clause-2"]' className="flex-1 min-w-[200px] bg-white border border-brand-navy/10 rounded px-2 py-2 text-xs text-brand-navy placeholder:text-brand-navy/40" />
              <button onClick={() => createTpl.mutate()} disabled={!tplForm.name || !tplForm.clausesJson} className="bg-brand-gold hover:bg-brand-gold/90 text-brand-navy px-4 py-2 rounded text-xs font-bold disabled:opacity-40 cursor-pointer">+ Create</button>
            </div>
          </div>

          {/* Templates list */}
          <div className="reveal rounded-2xl border border-brand-navy/10 bg-white p-5 space-y-3">
            <div className="flex items-center gap-2">
              <span className="gold-dot" />
              <h3 className="font-display font-bold text-sm text-brand-navy">Templates ({templates?.templates?.length || 0})</h3>
            </div>
            <div className="space-y-1.5">
              {(templates?.templates || []).map((t: any) => (
                <div key={t.id} className="flex justify-between items-center bg-brand-navy/[0.06] border border-brand-navy/10 rounded px-3 py-2 text-xs">
                  <span className="text-brand-navy font-semibold">{t.name} <span className="text-brand-navy/40"> · {DIV_LABELS[t.division] || t.division} · v{t.version}</span></span>
                  <span className="text-brand-navy/40 font-mono text-[10px]">{t.clausesJson}</span>
                </div>
              ))}
              {(templates?.templates || []).length === 0 && <p className="text-[10px] text-brand-navy/40 text-center py-2">No templates yet — create one above.</p>}
            </div>
          </div>
        </>
      )}
    </div>
  );
}