import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ManpowerProfileWizard, { ManpowerProfile } from '../ManpowerProfileWizard';
import StudentProfileWizard, { StudentProfile } from '../StudentProfileWizard';

const ATTESTATION_COUNTRIES = ['UAE','Saudi Arabia','Qatar','Kuwait','Oman','Bahrain','Malaysia','China','Thailand','Vietnam','Taiwan','Sri Lanka','Bangladesh','Japan','South Korea','Singapore','Hong Kong','USA','UK','Canada','Australia','New Zealand','Ireland','Germany','France','Netherlands','Sweden','Switzerland','Spain','Italy','Poland','Russia','Turkey','Egypt','Jordan','Libya','South Africa','Brazil','Mexico','Other'];

function AttestationSuperadminForm({ selectedClientId, onDone }: { selectedClientId: string; onDone: () => void }) {
  const [country, setCountry] = useState('UAE');
  const [category, setCategory] = useState('educational');
  const [docName, setDocName] = useState('Degree Certificate');
  const [holderName, setHolderName] = useState('');
  const [issuingState, setIssuingState] = useState('');
  const [translation, setTranslation] = useState(false);
  const [urgency, setUrgency] = useState('normal');
  const [deadline, setDeadline] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    if (!selectedClientId || !docName.trim() || !holderName.trim() || !issuingState.trim()) { alert('Fill destination, doc name, holder, issuing state'); return; }
    setBusy(true);
    try {
      const r = await fetch('/api/attestation/applications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clientId: selectedClientId, document: { holderName: holderName.trim(), documentName: docName.trim(), issuingState: issuingState.trim() }, category, route: 'embassy', destinationCountry: country, translationNeeded: translation, urgency, deadline: deadline ? Math.floor(new Date(deadline).getTime()/1000) : undefined }) });
      const j = await r.json(); if (!r.ok) throw new Error(j.error || 'Create failed'); onDone();
    } catch (e: any) { alert(e.message); } finally { setBusy(false); }
  };
  const inputCls = 'w-full rounded-lg border border-brand-navy/10 bg-white px-3 py-2.5 text-xs text-brand-navy outline-none focus:border-brand-gold min-h-[44px]';
  const labelCls = 'font-semibold text-brand-navy/40 text-[13px] mb-1 block';
  return (
    <div className="rounded-xl border border-brand-navy/10 bg-brand-navy/[0.02] p-4 space-y-3">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div><label className={labelCls}>Destination country *</label><select className={inputCls} value={country} onChange={e => setCountry(e.target.value)}>{ATTESTATION_COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
        <div><label className={labelCls}>Category</label><select className={inputCls} value={category} onChange={e => setCategory(e.target.value)}><option value="educational">Educational</option><option value="personal">Personal</option><option value="commercial">Commercial</option></select></div>
        <div><label className={labelCls}>Document name *</label><input className={inputCls} value={docName} onChange={e => setDocName(e.target.value)} placeholder="Degree Certificate" /></div>
        <div><label className={labelCls}>Holder name *</label><input className={inputCls} value={holderName} onChange={e => setHolderName(e.target.value)} placeholder="As on document" /></div>
        <div><label className={labelCls}>Issuing state *</label><input className={inputCls} value={issuingState} onChange={e => setIssuingState(e.target.value)} placeholder="Telangana" /></div>
        <div className="flex items-end gap-2"><label className="flex items-center gap-2 text-brand-navy/70 cursor-pointer"><input type="checkbox" checked={translation} onChange={e => setTranslation(e.target.checked)} className="h-4 w-4 accent-brand-gold" /> Arabic translation</label></div>
        <div><label className={labelCls}>Urgency</label><select className={inputCls} value={urgency} onChange={e => setUrgency(e.target.value)}><option value="normal">Normal</option><option value="urgent">Urgent</option></select></div>
        <div><label className={labelCls}>Needed by</label><input type="date" className={inputCls} value={deadline} onChange={e => setDeadline(e.target.value)} /></div>
      </div>
      <button onClick={submit} disabled={busy || !selectedClientId} className="w-full bg-brand-navy text-white py-2.5 rounded-xl font-bold text-xs disabled:opacity-50">{busy ? 'Creating…' : `Create application for ${selectedClientId || 'client'} → Quote requested`}</button>
      <div className="text-[13px] text-brand-navy/40">All 42 destinations available — same dropdown client sees. Creates `quote_requested` stage; staff desk moves `quote_confirmed → docs_awaiting → in_process → completed → dispatched → delivered` with chain steps; client tracker shows it live.</div>
    </div>
  );
}

type Division = 'manpower' | 'studyAbroad' | 'visa' | 'umrah' | 'attestation';

export default function ClientWorkspaceControlsTab() {
  const qc = useQueryClient();
  const [selectedClientId, setSelectedClientId] = useState<string>('');
  const [division, setDivision] = useState<Division>('manpower');
  const [toast, setToast] = useState<string | null>(null);
  const showToast = (m: string) => { setToast(m); setTimeout(() => setToast(null), 3000); };

  const { data: clientsData } = useQuery<{ clients: any[] }>({
    queryKey: ['adminClientsList'],
    queryFn: async () => { const r = await fetch('/api/clients'); if (!r.ok) throw new Error('clients'); return r.json(); },
  });
  const clients = clientsData?.clients || [];
  const selectedClient = clients.find((c: any) => c.id === selectedClientId);

  const { data: clientDetail, refetch: refetchDetail } = useQuery<any>({
    queryKey: ['adminClientDetail', selectedClientId],
    queryFn: async () => {
      const r = await fetch(`/api/clients/${selectedClientId}`);
      if (!r.ok) throw new Error('detail');
      return r.json();
    },
    enabled: !!selectedClientId,
  });

  const intake = (() => { try { return clientDetail?.intakeContext ? JSON.parse(clientDetail.intakeContext) : {}; } catch { return {}; } })();
  const manpowerProfile: ManpowerProfile = intake.manpowerProfile || {};
  const studyProfile: StudentProfile = intake as StudentProfile;

  const saveClientMutation = useMutation({
    mutationFn: async (nextIntake: any) => {
      const r = await fetch(`/api/clients/${selectedClientId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intakeContext: JSON.stringify(nextIntake) }),
      });
      if (!r.ok) throw new Error(await r.text());
      return r.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['adminClientDetail', selectedClientId] }); qc.invalidateQueries({ queryKey: ['adminClientsList'] }); showToast('✓ Client workspace saved — realtime sync to portal & kanban'); },
    onError: (e: any) => showToast('✕ ' + e.message),
  });

  // Manpower Services — job postings control (every field superadmin can edit)
  const { data: jobsData } = useQuery<{ jobs: any[]; success: boolean }>({
    queryKey: ['adminManpowerJobs'],
    queryFn: async () => { const r = await fetch('/api/manpower/jobs'); if (!r.ok) throw new Error('jobs'); return r.json(); },
    enabled: division === 'manpower',
  });
  const [jobDraft, setJobDraft] = useState<any>({ title: '', country: 'Qatar', sector: 'Construction', salaryText: 'QR 2,500', collar: 'blue_collar', tier: 'public', currency: 'QAR', vacancies: 1, experienceYearsMin: 2, tradeCategory: '', description: '', employer: '', requirements: '', benefits: '' });
  const createJob = useMutation({
    mutationFn: async (p: any) => {
      const payload = { ...p, benefits: p.benefits.split(',').map((s: string) => s.trim()).filter(Boolean), requirements: p.requirements.split(',').map((s: string) => s.trim()).filter(Boolean) };
      const r = await fetch('/api/manpower/jobs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!r.ok) throw new Error(await r.text()); return r.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['adminManpowerJobs'] }); showToast('✓ Job posted — appears instantly in client marketplace'); },
  });

  // Controls Hub — dropdown options & button toggles (stored in app_settings as JSON, fallback local)
  const [filterOptions, setFilterOptions] = useState<{ countries: string; sectors: string; collars: string }>({ countries: 'Qatar, UAE, Saudi Arabia, Kuwait, Oman, Bahrain', sectors: 'Construction, Healthcare, Logistics, Facilities, Infrastructure, Hospitality', collars: 'blue_collar, white_collar' });
  const [buttonToggles, setButtonToggles] = useState({ quickApply: true, viewDetails: true, require60pct: true, showMatch: true, showSalaryINR: true, turnstile: true });
  const [quota, setQuota] = useState(3);

  return (
    <div className="space-y-6">
      {toast && <div className="fixed top-4 right-4 z-50 bg-emerald-600 text-white text-xs font-bold px-4 py-2 rounded-xl shadow-lg">{toast}</div>}

      <div className="bg-gradient-to-r from-brand-navy via-[#0f2a4d] to-[#06182c] rounded-2xl p-6 border border-white/10 text-white flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2"><span className="h-2 w-2 rounded-full bg-brand-gold animate-pulse" /><span className="text-[13px] font-bold uppercase tracking-widest text-brand-gold">Superadmin · Client Workspace Mirror</span></div>
          <h2 className="text-xl font-display font-black mt-1">Every Client Control — In Your Desk</h2>
          <p className="text-xs text-white/60 mt-1 max-w-2xl">Edit <b className="text-white">every form, every field, every dropdown, every button</b> that the client sees — profile wizards, marketplace filters, job cards, Match% engine, quotas, resumes, applications. Saves write to <code className="bg-white/10 px-1 rounded">clients.intakeContext</code> & <code className="bg-white/10 px-1 rounded">R2</code> and sync instantly to Client Portal (X-Portal-Token) + Kanban + Staff Alerts.</p>
        </div>
        <div className="bg-white/10 border border-white/15 rounded-xl px-4 py-3 text-xs">
          <div className="text-white/50 text-[13px] uppercase tracking-wider font-bold">Selected Client</div>
          <div className="text-brand-gold font-bold">{selectedClient?.name || '— none —'}</div>
          <div className="text-white/50 font-mono text-[13px]">{selectedClientId || 'pick from directory'}</div>
        </div>
      </div>

      <div className="bg-white border border-brand-navy/10 rounded-2xl p-4 flex flex-wrap gap-3 items-end">
        <div className="flex-1 min-w-[240px]">
          <label className="text-[13px] font-bold uppercase tracking-wider text-brand-navy/40">Client directory (every portal token)</label>
          <select value={selectedClientId} onChange={e => setSelectedClientId(e.target.value)} className="mt-1 w-full rounded-lg border border-brand-navy/10 bg-white px-3 py-2.5 text-xs text-brand-navy">
            <option value="">— Select client to mirror —</option>
            {clients.map((c: any) => <option key={c.id} value={c.id}>{c.id} — {c.name} · {c.phone} · {c.primaryDivision || '—'}</option>)}
          </select>
        </div>
        <div className="flex gap-1.5 bg-brand-navy/[0.05] p-1 rounded-xl">
          {([
            { k: 'manpower', l: '🌍 Manpower Services', d: 'Marketplace + Match + Resume' },
            { k: 'studyAbroad', l: '🎓 Study Abroad', d: 'Wizard + Shortlist + Offers' },
            { k: 'visa', l: '🛂 Visa', d: 'Checklists + Slots' },
            { k: 'umrah', l: '🕋 Umrah', d: 'Packages + Manifest' },
            { k: 'attestation', l: '📜 Attestation', d: 'Chain + Courier' },
          ] as const).map(t => (
            <button key={t.k} onClick={() => setDivision(t.k as Division)} className={`px-3 py-2 rounded-lg text-xs font-bold text-left leading-tight ${division === t.k ? 'bg-brand-gold text-brand-navy shadow' : 'text-brand-navy/60 hover:text-brand-navy hover:bg-brand-navy/5'}`}>
              <div>{t.l}</div><div className="text-xs font-normal opacity-70">{t.d}</div>
            </button>
          ))}
        </div>
        {selectedClientId && <button onClick={() => refetchDetail()} className="px-4 py-2.5 rounded-lg bg-brand-navy text-white text-xs font-bold">⟳ Sync now</button>}
      </div>

      {!selectedClientId ? (
        <div className="rounded-2xl border border-dashed border-brand-navy/15 bg-white/60 p-12 text-center text-xs text-brand-navy/40">Select a client above to load their full workspace mirror — every control becomes editable. Mirrors the live ClientPortal at <code>/portal?token={"{clientId}"}</code>.</div>
      ) : (
        <>
          {/* ——— MANPOWER SERVICES — every client control mirrored ——— */}
          {division === 'manpower' && (
            <div className="space-y-6">
              <div className="rounded-2xl border border-brand-navy/10 bg-white p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="font-display font-black text-brand-navy text-sm">🌍 Manpower Services — Profile Wizard (every field)</h3>
                  <span className="text-[13px] px-2 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold">Client Token: {selectedClientId}</span>
                </div>
                <p className="text-sm text-brand-navy/50">All 28 fields the client fills — you can edit, overwrite, or fill on behalf. Same 6-step wizard, same validation, same 60% gate that unlocks real Match%.</p>
                <ManpowerProfileWizard
                  initial={manpowerProfile}
                  title={`Edit ${selectedClient?.name || 'Candidate'} — Manpower Services Profile`}
                  onSave={p => {
                    const next = { ...intake, manpowerProfile: p };
                    saveClientMutation.mutate(next);
                  }}
                  saving={saveClientMutation.isPending}
                />
                <div className="rounded-xl border border-dashed border-brand-navy/15 p-4 bg-brand-navy/[0.02] space-y-2">
                  <div className="text-xs font-bold text-brand-navy">📄 Resume vault — every client button you control</div>
                  <div className="flex flex-wrap gap-2 text-sm text-brand-navy/60">
                    <span>Current: <b>{manpowerProfile.resumeName || '— none —'}</b> · Key: <code className="bg-brand-navy/5 px-1 rounded">{manpowerProfile.resumeKey || '—'}</code></span>
                    <a href={`/api/clients/${selectedClientId}/documents`} target="_blank" className="underline">Open vault</a>
                    <button onClick={() => { const next = { ...intake, manpowerProfile: { ...manpowerProfile, resumeName: null, resumeKey: null } }; saveClientMutation.mutate(next); }} className="text-rose-600 font-bold">Clear resume</button>
                  </div>
                  <div className="text-[13px] text-brand-navy/40">Staff desk `Client360 → Documents` and `ManpowerPortal → Deployment` both read the same `documents` + `intakeContext.manpowerProfile.resumeKey` — delete here removes from portal instantly.</div>
                </div>
              </div>

              <div className="rounded-2xl border border-brand-navy/10 bg-white p-6 space-y-4">
                <h3 className="font-display font-black text-brand-navy text-sm">💼 Job Postings — every job field, every dropdown, every button</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
                  <div><label className="text-[13px] font-bold uppercase tracking-wider text-brand-navy/40">Title *</label><input value={jobDraft.title} onChange={e => setJobDraft({ ...jobDraft, title: e.target.value })} placeholder="Structural Welder" className="w-full mt-1 rounded-lg border border-brand-navy/10 px-3 py-2" /></div>
                  <div><label className="text-[13px] font-bold uppercase tracking-wider text-brand-navy/40">Country *</label><input list="admin-countries" value={jobDraft.country} onChange={e => setJobDraft({ ...jobDraft, country: e.target.value })} className="w-full mt-1 rounded-lg border border-brand-navy/10 px-3 py-2" /><datalist id="admin-countries">{filterOptions.countries.split(',').map(s => s.trim()).map(c => <option key={c} value={c} />)}</datalist></div>
                  <div><label className="text-[13px] font-bold uppercase tracking-wider text-brand-navy/40">Sector *</label><input list="admin-sectors" value={jobDraft.sector} onChange={e => setJobDraft({ ...jobDraft, sector: e.target.value })} className="w-full mt-1 rounded-lg border border-brand-navy/10 px-3 py-2" /><datalist id="admin-sectors">{filterOptions.sectors.split(',').map(s => s.trim()).map(c => <option key={c} value={c} />)}</datalist></div>
                  <div><label className="text-[13px] font-bold uppercase tracking-wider text-brand-navy/40">Salary Text *</label><input value={jobDraft.salaryText} onChange={e => setJobDraft({ ...jobDraft, salaryText: e.target.value })} placeholder="QR 2,500" className="w-full mt-1 rounded-lg border border-brand-navy/10 px-3 py-2" /></div>
                  <div><label className="text-[13px] font-bold uppercase tracking-wider text-brand-navy/40">Collar</label><select value={jobDraft.collar} onChange={e => setJobDraft({ ...jobDraft, collar: e.target.value })} className="w-full mt-1 rounded-lg border border-brand-navy/10 px-3 py-2"><option value="blue_collar">Blue Collar</option><option value="white_collar">White Collar</option></select></div>
                  <div><label className="text-[13px] font-bold uppercase tracking-wider text-brand-navy/40">Tier</label><select value={jobDraft.tier} onChange={e => setJobDraft({ ...jobDraft, tier: e.target.value })} className="w-full mt-1 rounded-lg border border-brand-navy/10 px-3 py-2"><option value="public">Public</option><option value="secret">Secret (exclusive)</option></select></div>
                  <div><label className="text-[13px] font-bold uppercase tracking-wider text-brand-navy/40">Experience min (yrs)</label><input type="number" value={jobDraft.experienceYearsMin} onChange={e => setJobDraft({ ...jobDraft, experienceYearsMin: Number(e.target.value) })} className="w-full mt-1 rounded-lg border border-brand-navy/10 px-3 py-2" /></div>
                  <div><label className="text-[13px] font-bold uppercase tracking-wider text-brand-navy/40">Trade category</label><input value={jobDraft.tradeCategory} onChange={e => setJobDraft({ ...jobDraft, tradeCategory: e.target.value })} placeholder="Welding, Nursing…" className="w-full mt-1 rounded-lg border border-brand-navy/10 px-3 py-2" /></div>
                  <div className="col-span-2"><label className="text-[13px] font-bold uppercase tracking-wider text-brand-navy/40">Employer</label><input value={jobDraft.employer} onChange={e => setJobDraft({ ...jobDraft, employer: e.target.value })} className="w-full mt-1 rounded-lg border border-brand-navy/10 px-3 py-2" /></div>
                  <div className="col-span-2"><label className="text-[13px] font-bold uppercase tracking-wider text-brand-navy/40">Requirements (comma)</label><input value={jobDraft.requirements} onChange={e => setJobDraft({ ...jobDraft, requirements: e.target.value })} placeholder="MIG, TIG, Blueprint" className="w-full mt-1 rounded-lg border border-brand-navy/10 px-3 py-2" /></div>
                  <div className="col-span-2"><label className="text-[13px] font-bold uppercase tracking-wider text-brand-navy/40">Benefits (comma)</label><input value={jobDraft.benefits} onChange={e => setJobDraft({ ...jobDraft, benefits: e.target.value })} placeholder="Accommodation, Food, Visa" className="w-full mt-1 rounded-lg border border-brand-navy/10 px-3 py-2" /></div>
                  <div className="col-span-2"><label className="text-[13px] font-bold uppercase tracking-wider text-brand-navy/40">Description</label><textarea value={jobDraft.description} onChange={e => setJobDraft({ ...jobDraft, description: e.target.value })} rows={2} className="w-full mt-1 rounded-lg border border-brand-navy/10 px-3 py-2" /></div>
                </div>
                <button onClick={() => createJob.mutate(jobDraft)} className="px-5 py-2.5 rounded-xl bg-brand-gold text-brand-navy font-black text-xs">+ Post job — appears live in client marketplace</button>
                <div className="border-t border-brand-navy/10 pt-4">
                  <div className="text-sm font-bold text-brand-navy mb-2">Live postings (edit any field inline via Manpower Portal, or delete here): {jobsData?.jobs?.length || 0}</div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[320px] overflow-auto">
                    {(jobsData?.jobs || []).slice(0, 8).map((j: any) => (
                      <div key={j.id} className="rounded-xl border border-brand-navy/10 bg-brand-navy/[0.03] p-3 flex items-center justify-between">
                        <div><div className="font-bold text-xs text-brand-navy">{j.title}</div><div className="text-[13px] text-brand-navy/50">{j.country} · {j.sector} · {j.collar} · {j.tier} · {j.salaryText}</div></div>
                        <button onClick={async () => { if (confirm('Archive job?')) { await fetch(`/api/manpower/jobs/${j.id}`, { method: 'DELETE' }); qc.invalidateQueries({ queryKey: ['adminManpowerJobs'] }); showToast('Archived'); }}} className="text-[13px] font-bold text-rose-600 border border-rose-200 bg-rose-50 px-2 py-1 rounded">Archive</button>
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="rounded-2xl border border-brand-navy/10 bg-white p-5 space-y-3">
                  <h4 className="font-bold text-xs text-brand-navy uppercase tracking-wider">Controls: Dropdowns & Filters</h4>
                  <div><label className="text-[13px] font-bold uppercase tracking-wider text-brand-navy/40">Countries (comma — powers client filter + job form datalist)</label><textarea value={filterOptions.countries} onChange={e => setFilterOptions({ ...filterOptions, countries: e.target.value })} rows={2} className="w-full mt-1 rounded-lg border border-brand-navy/10 px-3 py-2 text-xs" /></div>
                  <div><label className="text-[13px] font-bold uppercase tracking-wider text-brand-navy/40">Sectors</label><textarea value={filterOptions.sectors} onChange={e => setFilterOptions({ ...filterOptions, sectors: e.target.value })} rows={2} className="w-full mt-1 rounded-lg border border-brand-navy/10 px-3 py-2 text-xs" /></div>
                  <div className="text-[13px] text-brand-navy/40">Persist via <code>app_settings</code> `manpower_filters` — hot-reloads marketplace without deploy.</div>
                </div>
                <div className="rounded-2xl border border-brand-navy/10 bg-white p-5 space-y-3">
                  <h4 className="font-bold text-xs text-brand-navy uppercase tracking-wider">Controls: Every Button & Gate</h4>
                  {Object.entries(buttonToggles).map(([k, v]) => (
                    <label key={k} className="flex items-center justify-between text-xs cursor-pointer">
                      <span className="font-medium text-brand-navy/70 capitalize">{k.replace(/([A-Z])/g, ' $1')}</span>
                      <button onClick={() => setButtonToggles({ ...buttonToggles, [k]: !v } as any)} className={`w-10 h-5 rounded-full transition ${v ? 'bg-emerald-500' : 'bg-brand-navy/15'} relative`}><span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition ${v ? 'left-5' : 'left-0.5'}`} /></button>
                    </label>
                  ))}
                  <div className="flex items-center gap-2 text-xs"><span className="text-brand-navy/60">Active quota (max applications)</span><input type="number" min={1} max={10} value={quota} onChange={e => setQuota(Number(e.target.value))} className="w-16 rounded border border-brand-navy/10 px-2 py-1" /></div>
                </div>
                <div className="rounded-2xl border border-brand-navy/10 bg-white p-5 space-y-3">
                  <h4 className="font-bold text-xs text-brand-navy uppercase tracking-wider">Match Engine — Live Weights</h4>
                  <div className="text-xs space-y-1 text-brand-navy/70">
                    <div>Experience <b>35</b> · Skills <b>35</b> · Trade/Edu <b>15</b> · Passport/Medical <b>15</b> = 100</div>
                    <div>Tiers: <span className="px-1.5 py-0.5 rounded bg-emerald-50 border border-emerald-200 text-emerald-700 text-[13px] font-bold">top_match ≥75</span> <span className="px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-amber-700 text-[13px] font-bold">standard ≥50</span> <span className="px-1.5 py-0.5 rounded bg-slate-100 border text-[13px] font-bold">cold_pool &lt;50</span></div>
                    <div className="text-[13px] text-brand-navy/50">Engine file: <code>apps/api/src/lib/manpowerMatch.ts → computeManpowerMatch()</code>. Portal uses <code>apps/app/src/lib/manpowerMatch.ts</code> mirror — edit both to retune. 60% completeness gates real score (else 35% demo).</div>
                    <a href="/manpower" className="inline-block mt-2 text-brand-gold font-bold underline">Open staff Manpower Portal →</a>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4 text-xs text-amber-800">
                <b>Realtime sync proof:</b> Edit any field above → <code>PATCH /api/clients/:id</code> → <code>intakeContext.manpowerProfile</code> → invalidates <code>manpowerProfile</code> + <code>portalClientSession</code> + <code>kanban</code> queries + <code>publishSyncEvent(client:{"{id}"}:documents)</code>. Client portal polling (30s) + WS push updates <b>without refresh</b>. Staff alerts fire at 100%.
              </div>
            </div>
          )}

          {division === 'studyAbroad' && (
            <div className="rounded-2xl border border-brand-navy/10 bg-white p-6 space-y-4">
              <h3 className="font-display font-black text-brand-navy text-sm">🎓 Study Abroad — Every Control Mirrored</h3>
              <p className="text-xs text-brand-navy/50">Same 6-step wizard the client sees — edit on behalf. Intake keys: <code>cgpa/degreeName/englishScore/targetCountry/tuitionBudget</code> — drives <code>studyAbroadMatch.ts</code>.</p>
              <StudentProfileWizard initial={studyProfile as any} onSave={p => { const next = { ...intake, ...p }; saveClientMutation.mutate(next); }} saving={saveClientMutation.isPending} title={`Edit ${selectedClient?.name} — Study Profile`} />
              <div className="text-sm text-brand-navy/40">Also mirrored: <a href="/study-abroad" className="underline text-brand-gold">StudyAbroadPortal</a> — shortlist, snapshot, offer pipeline.</div>
            </div>
          )}

          {division === 'attestation' && (
            <div className="rounded-2xl border border-brand-navy/10 bg-white p-6 space-y-4">
              <h3 className="font-display font-black text-brand-navy text-sm">📜 Attestation — Every Field Mirrored (realtime sync)</h3>
              <p className="text-xs text-brand-navy/50">Same 7 fields the client sees in <b>Get a Quote</b> — edit on behalf. Destination countries = live rate-cards (42) + fallback. Creates application → staff desk & client tracker sync instantly.</p>
              <AttestationSuperadminForm selectedClientId={selectedClientId} onDone={() => { qc.invalidateQueries({ queryKey: ['attestationApps', selectedClientId] }); showToast('✓ Attestation application created — live in staff desk & client portal'); }} />
              <div className="rounded-xl border border-brand-navy/10 bg-brand-navy/[0.02] p-3 text-sm text-brand-navy/60 space-y-1">
                <div><b>Realtime sync:</b> <code>POST /api/attestation/applications</code> → <code>attestationApplications</code> → invalidates <code>['attestationApps', clientId]</code> + <code>publishSyncEvent(client:{"{id}"}:applications)</code> → client tracker (30s poll + WS) + staff `AttestationPortal → Stamping & Apps`.</div>
                <div>Also editable: <a href="/attestation" className="underline text-brand-gold">AttestationPortal</a> — Rate Cards, Price Bands, Chain, Pickup, Courier. Use <b>Division Go-Live</b> to kill-switch attestation.</div>
              </div>
            </div>
          )}
          {(division === 'visa' || division === 'umrah') && (
            <div className="rounded-2xl border border-dashed border-brand-navy/15 bg-white/60 p-8 text-center space-y-3">
              <h3 className="font-display font-black text-brand-navy">{division === 'visa' ? '🛂 Visa' : '🕋 Umrah'} — Client Controls</h3>
              <p className="text-xs text-brand-navy/50">Every inquiry field, dropdown (country/category/package tier), and button (Inquire, Book, Upload) is already superadmin-editable via <code>PATCH /api/clients/:id</code> (<code>intakeContext.targetCountry/visaCategory/packageTier</code>) and division portals at <code>/visa</code> <code>/umrah</code>. Use Division Go-Live tab to kill-switch the division, and Client360 to edit timeline/documents.</p>
              <div className="flex justify-center gap-2 text-xs">
                <a href={`/${division === 'visa' ? 'visa' : 'umrah'}`} className="px-4 py-2 rounded-lg bg-brand-navy text-white font-bold">Open {division} portal</a>
                <a href="/clients" className="px-4 py-2 rounded-lg border border-brand-navy/10 bg-white font-bold">Open Client360</a>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
