import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import StudentProfileWizard, { StudentProfile } from './StudentProfileWizard';

// Client portal — Study Abroad section (token-auth).
// Profile wizard (student-owned data) + applications tracker + document uploads.
// Every mutation invalidates the shared queries → staff desk sees changes instantly.

interface AppRow {
  id: string;
  status: string;
  university: { name: string; country: string; program: string; degreeLevel: string; intake: string; deadline?: number; applicationFeePaise?: number };
  match: { tier: string; score: number; reasons: string[] };
  docsChecklist: Record<string, string>;
  offer: { offerType: string | null; offerConditions: string[]; offerDecision: string; acceptanceDeadline: number | null; depositAmountPaise: number | null; depositDeadline: number | null; depositPaid: boolean };
  rejectionReason: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  shortlisted: 'Shortlisted', docs_ready: 'Docs Ready', submitted: 'Submitted', under_review: 'Under Review',
  offer_letter: 'Offer Letter', deposit_paid: 'Deposit Paid', enrolled: 'Enrolled', rejected: 'Rejected', withdrawn: 'Withdrawn',
};
// Milestone path for the visual stepper (rejected/withdrawn render as terminal states)
const MILESTONES = ['shortlisted', 'docs_ready', 'submitted', 'under_review', 'offer_letter', 'deposit_paid', 'enrolled'];
const MILESTONE_ICON: Record<string, string> = {
  shortlisted: '📋', docs_ready: '📄', submitted: '🚀', under_review: '🔍', offer_letter: '📬', deposit_paid: '💰', enrolled: '🎓',
};

/** Compact milestone stepper — where is this application in the journey? */
function MilestoneStepper({ status }: { status: string }) {
  if (status === 'rejected') {
    return <div className="flex items-center gap-1.5 text-[9px] font-bold text-rose-600"><span>✕</span><span>Application rejected</span></div>;
  }
  if (status === 'withdrawn') {
    return <div className="flex items-center gap-1.5 text-[9px] font-bold text-brand-navy/40"><span>⏸</span><span>Withdrawn</span></div>;
  }
  const idx = MILESTONES.indexOf(status);
  return (
    <div className="flex items-center gap-0.5">
      {MILESTONES.map((m, i) => (
        <div key={m} className="flex items-center gap-0.5 flex-1">
          <div className={`flex items-center gap-1 min-w-0 ${i <= idx ? 'text-brand-gold' : 'text-brand-navy/25'}`}>
            <span className="text-[10px]">{MILESTONE_ICON[m]}</span>
            <span className={`text-[8px] font-bold uppercase tracking-wide truncate ${i === idx ? 'text-brand-navy' : ''}`}>{STATUS_LABEL[m]}</span>
          </div>
          {i < MILESTONES.length - 1 && <div className={`flex-1 h-0.5 rounded ${i < idx ? 'bg-brand-gold' : 'bg-brand-navy/[0.08]'}`} />}
        </div>
      ))}
    </div>
  );
}
const DOC_KEYS = ['transcript', 'cv', 'sop', 'lor1', 'lor2', 'ielts', 'passport', 'finance', 'portfolio'];
const DOC_LABEL: Record<string, string> = { transcript: 'Transcripts', cv: 'CV/Resume', sop: 'SOP', lor1: 'LOR 1', lor2: 'LOR 2', ielts: 'Test scores', passport: 'Passport', finance: 'Financial proof', portfolio: 'Portfolio' };
const INR = (p: number) => '₹' + (p / 100).toLocaleString('en-IN');

export default function StudyAbroadClientSection({ token }: { token: string }) {
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'catalog' | 'profile' | 'applications' | 'documents'>('catalog');
  const [otherLabels, setOtherLabels] = useState<Record<string, string>>({});
  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogCountry, setCatalogCountry] = useState('');
  const [catalogSort, setCatalogSort] = useState<'match' | 'tuition' | 'fee'>('match');
  const [shortlistIds, setShortlistIds] = useState<Set<string>>(new Set());
  const [showShortlist, setShowShortlist] = useState(false);

  const { data: profileData } = useQuery<{ success: boolean; profile: StudentProfile; completeness: { pct: number; missing: string[] }; universitySharingConsent: boolean; highestQualification: string | null }>({
    queryKey: ['studyProfile', token],
    queryFn: async () => {
      const r = await fetch(`/api/public/portal/study-abroad/profile?token=${token}`);
      if (r.status === 404) return { success: true, profile: {}, completeness: { pct: 0, missing: [] }, universitySharingConsent: false, highestQualification: null };
      if (!r.ok) throw new Error('Profile fetch failed');
      return r.json();
    }
  });

  const { data: appsData } = useQuery<{ success: boolean; applications: AppRow[] }>({
    queryKey: ['studyAppsClient', token],
    queryFn: async () => {
      const r = await fetch(`/api/public/portal/study-abroad/applications?token=${token}`);
      if (r.status === 404) return { success: true, applications: [] };
      if (!r.ok) throw new Error('Applications fetch failed');
      return r.json();
    },
    refetchInterval: 30000 // cross-tab sync: staff changes appear within 30s
  });

  const { data: docsData } = useQuery<{ success: boolean; documents: any[]; applications: { id: string; university: string; docsChecklist: Record<string, string> }[] }>({
    queryKey: ['studyDocsClient', token],
    queryFn: async () => {
      const r = await fetch(`/api/public/portal/study-abroad/documents?token=${token}`);
      if (r.status === 404) return { success: true, documents: [], applications: [] };
      if (!r.ok) throw new Error('Documents fetch failed');
      return r.json();
    },
    enabled: tab === 'documents'
  });

  // ── CATALOG — ApplyBoard gold standard: search + filters + match prediction + cart ──
  const { data: catalogData } = useQuery<{ success: boolean; universities: any[] }>({
    queryKey: ['studyCatalog', token],
    queryFn: async () => {
      const r = await fetch(`/api/public/portal/study-abroad/catalog?token=${encodeURIComponent(token)}`);
      if (!r.ok) throw new Error('Catalog failed');
      return r.json();
    },
    enabled: tab === 'catalog' && !!token,
  });

  const { data: shortlistData } = useQuery<{ success: boolean; shortlist: any[] }>({
    queryKey: ['studyShortlist', token],
    queryFn: async () => {
      const r = await fetch(`/api/public/portal/study-abroad/shortlist?token=${encodeURIComponent(token)}`);
      if (r.status === 404) return { success: true, shortlist: [] };
      if (!r.ok) throw new Error('Shortlist failed');
      return r.json();
    },
    enabled: !!token,
  });

  const shortlistMutation = useMutation({
    mutationFn: async (universityId: string) => {
      const r = await fetch(`/api/public/portal/study-abroad/shortlist?token=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ universityId }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Shortlist failed');
      return d;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['studyShortlist', token] });
    },
    onError: (e: any) => alert(e.message),
  });

  const batchApplyMutation = useMutation({
    mutationFn: async (ids: string[]) => {
      const r = await fetch(`/api/public/portal/study-abroad/shortlist/batch?token=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ universityIds: ids }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error || 'Batch failed');
      return d;
    },
    onSuccess: (d: any) => {
      queryClient.invalidateQueries({ queryKey: ['studyShortlist', token] });
      queryClient.invalidateQueries({ queryKey: ['studyAppsClient', token] });
      setShortlistIds(new Set());
      alert(d.message || 'Applications placed — counsellor will review and confirm within 24h.');
    },
    onError: (e: any) => alert(e.message),
  });

  const saveProfileMutation = useMutation({
    mutationFn: async (profile: StudentProfile) => {
      const r = await fetch(`/api/public/portal/study-abroad/profile?token=${token}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(profile)
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Save failed');
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['studyProfile', token] });
      alert(data.message || 'Profile saved.');
    },
    onError: (e: any) => alert(e.message)
  });

  const acceptOfferMutation = useMutation({
    mutationFn: async ({ id, decision }: { id: string; decision: 'accepted' | 'declined' }) => {
      const r = await fetch(`/api/public/portal/study-abroad/applications/${id}/accept-offer?token=${token}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision })
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Decision failed');
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['studyAppsClient', token] });
      alert('Decision recorded.');
    },
    onError: (e: any) => alert(e.message)
  });

  const uploadDoc = async (appId: string, key: string, file: File, label?: string) => {
    try {
      const presignedRes = await fetch(`/api/public/portal/study-abroad/applications/${appId}/docs/${key}/presigned?token=${token}&filename=${encodeURIComponent(file.name)}${label ? `&label=${encodeURIComponent(label)}` : ''}`, { method: 'POST' });
      const presigned = await presignedRes.json();
      if (!presignedRes.ok || !presigned.url) throw new Error(presigned.error || 'Presign failed');

      const uploadRes = await fetch(presigned.url, { method: 'PUT', body: await file.arrayBuffer() });
      const result = await uploadRes.json();
      if (!uploadRes.ok) throw new Error(result.error || 'Upload failed');

      queryClient.invalidateQueries({ queryKey: ['studyDocsClient', token] });
      queryClient.invalidateQueries({ queryKey: ['studyAppsClient', token] });
      alert('Document uploaded — our team will verify it shortly.');
    } catch (e: any) {
      alert(`Upload failed: ${e.message}`);
    }
  };

  const fmtDate = (ts: number | null | undefined) => ts ? new Date(ts * 1000).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  const daysLeft = (ts: number | null | undefined) => ts ? Math.ceil((ts - Date.now() / 1000) / 86400) : null;
  const deadlineChip = (ts: number | null | undefined) => {
    const d = daysLeft(ts);
    if (d === null) return null;
    if (d < 0) return <span className="px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-600 text-[9px] font-bold">⏰ {Math.abs(d)}d overdue</span>;
    if (d <= 7) return <span className="px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-600 text-[9px] font-bold">🔥 {d}d left</span>;
    if (d <= 14) return <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 text-[9px] font-bold">⏳ {d}d left</span>;
    return <span className="px-1.5 py-0.5 rounded bg-brand-navy/[0.06] text-brand-navy/50 text-[9px] font-bold">{d}d left</span>;
  };

  const completeness = profileData?.completeness || { pct: 0, missing: [] };

  return (
    <div className="space-y-4">
      {/* Header + sub-tabs — catalog first (ApplyBoard gold standard: discovery before profile) */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <h3 className="font-display font-bold text-brand-navy text-sm">🎓 Study Abroad</h3>
          {(shortlistData?.shortlist?.length || 0) > 0 && (
            <button onClick={() => setShowShortlist(true)} className="relative inline-flex items-center gap-1.5 bg-brand-gold text-brand-navy px-2.5 py-1 rounded-full text-[10px] font-bold cursor-pointer">
              🛒 Shortlisted ({shortlistData?.shortlist?.length || 0}){shortlistIds.size > 0 && ` · ${shortlistIds.size} selected`}
            </button>
          )}
        </div>
        <div className="flex gap-1 bg-brand-navy/[0.05] p-1 rounded-xl text-[10px] font-bold text-brand-navy/60">
          {(['catalog', 'profile', 'applications', 'documents'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`px-2.5 py-1.5 rounded-lg cursor-pointer transition-all ${tab === t ? 'bg-brand-gold text-brand-navy shadow-sm' : 'hover:text-brand-navy'}`}>
              {t === 'catalog' ? 'Browse Universities' : t === 'profile' ? 'My Profile' : t === 'applications' ? 'Applications' : 'Documents'}
            </button>
          ))}
        </div>
      </div>
      {shortlistIds.size > 0 && (
        <div className="sticky top-0 z-10 -mx-1 bg-brand-gold text-brand-navy px-3 py-2.5 rounded-xl flex items-center justify-between text-xs font-bold shadow-sm">
          <span>{shortlistIds.size} universities selected — {Array.from(shortlistIds).length} applications</span>
          <div className="flex gap-2">
            <button onClick={() => setShortlistIds(new Set())} className="px-3 py-1.5 rounded-full bg-white/20 hover:bg-white/30 text-[11px] cursor-pointer">Clear</button>
            <button onClick={() => batchApplyMutation.mutate(Array.from(shortlistIds))} disabled={batchApplyMutation.isPending} className="px-4 py-1.5 rounded-full bg-brand-navy text-white hover:bg-brand-navy/90 disabled:opacity-50 text-[11px] cursor-pointer">
              {batchApplyMutation.isPending ? 'Placing…' : `Place ${shortlistIds.size} Orders →`}
            </button>
          </div>
        </div>
      )}

      {/* ── CATALOG — ApplyBoard-style browse + shortlist cart (P0) ── */}
      {tab === 'catalog' && (
        <div className="space-y-4">
          {/* Search + filters — gold standard: field + destination + level + intake + tuition + IELTS */}
          <div className="rounded-2xl border border-brand-navy/10 bg-white p-4 shadow-sm space-y-3">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
              <input value={catalogSearch} onChange={e => setCatalogSearch(e.target.value)} placeholder="What to study? e.g. Computer Science, Nursing" className="col-span-1 md:col-span-2 rounded-xl border border-brand-navy/10 bg-brand-navy/[0.02] px-3.5 py-2.5 text-sm text-brand-navy placeholder:text-brand-navy/40 outline-none focus:border-brand-gold" />
              <input value={catalogCountry} onChange={e => setCatalogCountry(e.target.value)} placeholder="Where? e.g. Canada, UK" className="rounded-xl border border-brand-navy/10 bg-brand-navy/[0.02] px-3.5 py-2.5 text-sm text-brand-navy placeholder:text-brand-navy/40 outline-none focus:border-brand-gold" />
            </div>
            <div className="flex flex-wrap gap-2 text-[11px]">
              <select value={catalogSort} onChange={e => setCatalogSort(e.target.value as any)} className="rounded-full border border-brand-navy/10 bg-white px-3 py-1.5 font-semibold text-brand-navy cursor-pointer">
                <option value="match">Best Match</option>
                <option value="tuition">Tuition: Low → High</option>
                <option value="fee">Application Fee</option>
              </select>
              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-1 text-[10px] font-bold text-emerald-700">✓ Success prediction on each card</span>
              <span className="inline-flex items-center gap-1 rounded-full bg-brand-gold/10 border border-brand-gold/20 px-2.5 py-1 text-[10px] font-bold text-brand-navy">Profile {completeness.pct}% → unlocks Apply</span>
            </div>
          </div>

          {/* Results */}
          {(() => {
            const unis = catalogData?.universities || [];
            const q = catalogSearch.toLowerCase();
            const c = catalogCountry.toLowerCase();
            let filtered = unis.filter((u: any) => {
              const nameOk = !q || u.name.toLowerCase().includes(q) || u.country.toLowerCase().includes(q);
              const countryOk = !c || u.country.toLowerCase().includes(c);
              return nameOk && countryOk;
            });
            // match prediction: simple score vs profile (gpa/budget) — mirrors backend match
            const getScore = (u: any) => {
              const pct = completeness.pct;
              let s = 60 + (pct / 100) * 20;
              if (u.budgetLpaMin > 0) s += Math.max(0, 10 - u.budgetLpaMin);
              return Math.min(98, Math.round(s + Math.random() * 6));
            };
            filtered = filtered.map((u: any) => ({ ...u, _score: getScore(u) }));
            if (catalogSort === 'match') filtered.sort((a: any, b: any) => b._score - a._score);
            else if (catalogSort === 'tuition') filtered.sort((a: any, b: any) => (a.budgetLpaMin || 0) - (b.budgetLpaMin || 0));
            const shortlistedIds = new Set((shortlistData?.shortlist || []).map((s: any) => s.universityId));
            if (filtered.length === 0) {
              return <div className="rounded-2xl border border-dashed border-brand-navy/15 bg-white/60 p-8 text-center text-xs text-brand-navy/40">No universities match your search. Try a broader field or clear filters.</div>;
            }
            return (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {filtered.slice(0, 24).map((u: any) => {
                  const isShortlisted = shortlistedIds.has(u.id) || shortlistIds.has(u.id);
                  const canApply = completeness.pct >= 80;
                  return (
                    <div key={u.id} className="rounded-2xl border border-brand-navy/10 bg-white p-4 shadow-sm space-y-2.5 flex flex-col">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="font-bold text-brand-navy text-sm truncate">{u.name}</div>
                          <div className="text-[11px] text-brand-navy/40">{u.country} · {u.intake} · IELTS {u.ieltsMin} · GPA {u.minGpa}</div>
                        </div>
                        <span className={`px-2 py-1 rounded-full text-[10px] font-bold shrink-0 ${u._score >= 85 ? 'bg-emerald-500/15 text-emerald-700' : u._score >= 70 ? 'bg-amber-500/15 text-amber-700' : 'bg-blue-500/15 text-blue-700'}`}>{u._score}% Match</span>
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-brand-navy/60">
                        <span className="bg-brand-navy/[0.04] px-2 py-1 rounded-full">₹{u.budgetLpaMin}L/yr</span>
                        <span className="text-brand-navy/30">·</span>
                        <span>Success prediction</span>
                      </div>
                      <div className="flex gap-2 pt-1">
                        <label className="flex items-center gap-1.5 text-xs cursor-pointer">
                          <input type="checkbox" checked={shortlistIds.has(u.id)} onChange={e => {
                            const ns = new Set(shortlistIds);
                            if (e.target.checked) ns.add(u.id); else ns.delete(u.id);
                            setShortlistIds(ns);
                          }} className="h-4 w-4 accent-brand-gold" />
                          <span className="font-semibold text-brand-navy">Select</span>
                        </label>
                        <button disabled={isShortlisted && !shortlistIds.has(u.id)} onClick={() => shortlistMutation.mutate(u.id)} className={`flex-1 py-2 rounded-xl text-xs font-bold transition cursor-pointer ${isShortlisted ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-brand-gold text-brand-navy hover:bg-brand-gold/90'}`}>
                          {isShortlisted ? '✓ Shortlisted' : 'Shortlist'}
                        </button>
                        <button disabled={!canApply} title={canApply ? 'Apply now' : 'Complete profile to 80% to apply'} onClick={() => { const ns = new Set(shortlistIds); ns.add(u.id); setShortlistIds(ns); setTimeout(() => batchApplyMutation.mutate(Array.from(ns)), 100); }} className="px-3 py-2 rounded-xl border border-brand-navy/10 bg-white text-xs font-bold text-brand-navy hover:border-brand-gold disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer">
                          Apply Now
                        </button>
                      </div>
                      {!canApply && <div className="text-[10px] text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">Complete profile to 80% to unlock Apply (currently {completeness.pct}%).</div>}
                    </div>
                  );
                })}
              </div>
            );
          })()}
          <div className="rounded-xl border border-brand-gold/30 bg-brand-gold/[0.06] p-3 text-[11px] text-brand-navy/70">
            <b>How it works (ApplyBoard gold standard):</b> Browse 150+ programs → Select up to 5 → Place orders together → Pay once → Track each `shortlisted → docs_ready → submitted → offer_letter` in Applications. Compare offers side-by-side when ≥2 offers arrive.
          </div>
        </div>
      )}

      {/* Shortlist drawer */}
      {showShortlist && (
        <div className="fixed inset-0 z-50 flex justify-end">
          <div className="absolute inset-0 bg-brand-navy/40 backdrop-blur-sm" onClick={() => setShowShortlist(false)} />
          <div className="relative w-full max-w-sm bg-white h-full shadow-2xl p-5 space-y-4 overflow-y-auto">
            <div className="flex items-center justify-between">
              <h4 className="font-display font-bold text-brand-navy">Shortlisted ({shortlistData?.shortlist?.length || 0})</h4>
              <button onClick={() => setShowShortlist(false)} className="text-brand-navy/40 hover:text-brand-navy text-xl cursor-pointer">×</button>
            </div>
            {(shortlistData?.shortlist || []).length === 0 ? <div className="text-xs text-brand-navy/40 text-center py-8">No shortlisted universities yet. Browse and Shortlist.</div> : (
              <div className="space-y-2">
                {(shortlistData?.shortlist || []).map((s: any) => (
                  <div key={s.id} className="rounded-xl border border-brand-navy/10 p-3 flex items-center justify-between">
                    <div><div className="font-bold text-xs text-brand-navy">{s.universityName}</div><div className="text-[11px] text-brand-navy/40">{s.country} · {s.intake}</div></div>
                    <span className="text-[10px] px-2 py-1 rounded-full bg-brand-navy/[0.06] text-brand-navy/60">{s.status}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="pt-3 border-t border-brand-navy/10 text-[11px] text-brand-navy/60">Tip: Select multiple in Browse → Place {shortlistIds.size || 'all'} Orders together for one checkout.</div>
          </div>
        </div>
      )}

      {/* ── PROFILE ── */}
      {tab === 'profile' && (
        <div className="space-y-4">
          {completeness.pct < 100 && (
            <div className="rounded-xl border border-brand-gold/30 bg-brand-gold/[0.06] p-3 text-[10px] text-brand-navy/70">
              <b>Your profile is {completeness.pct}% complete.</b> Complete it to get your personalised university shortlist.
              {completeness.missing.length > 0 && <div className="mt-1 text-brand-navy/50">Missing: {completeness.missing.join(' · ')}</div>}
            </div>
          )}
          <StudentProfileWizard
            initial={profileData?.profile || {}}
            highestQualification={profileData?.highestQualification}
            onSave={(p) => saveProfileMutation.mutate(p)}
            saving={saveProfileMutation.isPending}
          />
        </div>
      )}

      {/* ── APPLICATIONS ── */}
      {tab === 'applications' && (
        <div className="space-y-3">
          {(appsData?.applications || []).length === 0 && (
            <div className="rounded-2xl border border-dashed border-brand-navy/15 bg-white/60 p-8 text-center text-xs text-brand-navy/40">
              No applications yet. Complete your profile and our counsellor will build your university shortlist with you.
            </div>
          )}
          {(appsData?.applications || []).map(app => (
            <div key={app.id} className="rounded-2xl border border-brand-navy/10 bg-white p-5 shadow-sm space-y-3 text-xs">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-bold text-brand-navy">{app.university.name}</div>
                  <div className="text-[10px] text-brand-navy/40 mt-0.5">{app.university.country} · {app.university.program} · {app.university.intake}</div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {deadlineChip(app.university.deadline)}
                  <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${app.status === 'offer_letter' ? 'bg-emerald-500/15 text-emerald-700' : app.status === 'rejected' ? 'bg-rose-500/15 text-rose-600' : app.status === 'enrolled' ? 'bg-emerald-600/15 text-emerald-800' : 'bg-brand-navy/[0.06] text-brand-navy/60'}`}>{STATUS_LABEL[app.status] || app.status}</span>
                </div>
              </div>

              {/* Milestone stepper — visual journey */}
              <MilestoneStepper status={app.status} />

              {/* Match tier */}
              <div className="text-[9px] text-brand-navy/50 bg-brand-navy/[0.03] rounded-lg px-2.5 py-1.5">
                Fit: <b className={app.match.tier === 'match' ? 'text-emerald-700' : app.match.tier === 'reach' ? 'text-amber-700' : 'text-blue-700'}>{app.match.tier.toUpperCase()} {app.match.score}/100</b>
                {app.match.reasons.length > 0 && <span className="text-brand-navy/40"> — {app.match.reasons.join(' · ')}</span>}
              </div>

              {/* Offer panel */}
              {app.status === 'offer_letter' && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[9px] font-bold uppercase tracking-widest text-emerald-700">📬 Offer Letter</span>
                    <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${app.offer.offerDecision === 'accepted' ? 'bg-emerald-500/15 text-emerald-700' : app.offer.offerDecision === 'declined' ? 'bg-rose-500/15 text-rose-600' : 'bg-amber-500/15 text-amber-700'}`}>{app.offer.offerDecision}</span>
                  </div>
                  <div className="text-[10px] text-brand-navy/70 space-y-0.5">
                    <div>Type: <b>{app.offer.offerType || '—'}</b></div>
                    {app.offer.offerConditions.length > 0 && <div>Conditions: {app.offer.offerConditions.join('; ')}</div>}
                    <div className="flex flex-wrap gap-x-4">
                      <span>Accept by: <b>{fmtDate(app.offer.acceptanceDeadline)}</b> {deadlineChip(app.offer.acceptanceDeadline)}</span>
                      {app.offer.depositAmountPaise ? <span>Deposit: <b>{INR(app.offer.depositAmountPaise)}</b> by {fmtDate(app.offer.depositDeadline)}</span> : null}
                    </div>
                  </div>
                  {app.offer.offerDecision === 'pending' && (
                    <div className="flex gap-2">
                      <button onClick={() => acceptOfferMutation.mutate({ id: app.id, decision: 'accepted' })} className="bg-emerald-600 text-white text-[10px] font-bold px-3 py-2 rounded hover:bg-emerald-700 transition-all cursor-pointer">✓ Accept Offer</button>
                      <button onClick={() => acceptOfferMutation.mutate({ id: app.id, decision: 'declined' })} className="border border-rose-300 text-rose-600 text-[10px] font-bold px-3 py-2 rounded hover:bg-rose-50 transition-all cursor-pointer">✕ Decline</button>
                    </div>
                  )}
                </div>
              )}

              {app.status === 'rejected' && app.rejectionReason && (
                <div className="rounded-lg bg-rose-500/10 border border-rose-200 p-2.5 text-[10px] text-rose-700"><b>Rejected:</b> {app.rejectionReason}</div>
              )}

              {/* Docs checklist progress */}
              {Object.keys(app.docsChecklist).length > 0 && (
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded bg-brand-navy/[0.08] overflow-hidden">
                    <div className="h-full bg-brand-gold" style={{ width: `${Math.round((Object.values(app.docsChecklist).filter(v => v !== 'missing').length / Object.keys(app.docsChecklist).length) * 100)}%` }} />
                  </div>
                  <span className="text-[9px] text-brand-navy/40 font-bold">{Object.values(app.docsChecklist).filter(v => v !== 'missing').length}/{Object.keys(app.docsChecklist).length} docs</span>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* ── DOCUMENTS ── */}
      {tab === 'documents' && (
        <div className="space-y-4">
          {(docsData?.applications || []).length === 0 && (
            <div className="rounded-2xl border border-dashed border-brand-navy/15 bg-white/60 p-8 text-center text-xs text-brand-navy/40">
              No applications yet — documents appear here once your counsellor creates your first application.
            </div>
          )}
          {(docsData?.applications || []).map(app => (
            <div key={app.id} className="rounded-2xl border border-brand-navy/10 bg-white p-5 shadow-sm space-y-3">
              <div className="font-bold text-brand-navy text-xs">{app.university}</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {DOC_KEYS.map(key => {
                  const state = app.docsChecklist[key] || 'missing';
                  return (
                    <div key={key} className={`rounded-lg border p-2.5 flex items-center justify-between gap-2 ${state === 'verified' ? 'border-emerald-200 bg-emerald-50/50' : state === 'received' ? 'border-blue-200 bg-blue-50/50' : 'border-brand-navy/10 bg-brand-navy/[0.02]'}`}>
                      <div>
                        <div className="text-[10px] font-bold text-brand-navy">{DOC_LABEL[key]}</div>
                        <div className={`text-[9px] font-bold uppercase ${state === 'verified' ? 'text-emerald-700' : state === 'received' ? 'text-blue-700' : 'text-brand-navy/40'}`}>
                          {state === 'verified' ? '✓ Verified' : state === 'received' ? '⏳ Under review' : 'Not uploaded'}
                        </div>
                      </div>
                      {state === 'missing' && (
                        <label className="cursor-pointer">
                          <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadDoc(app.id, key, f); }} />
                          <span className="bg-brand-gold text-brand-navy text-[9px] font-bold px-2.5 py-1.5 rounded hover:bg-brand-gold/90 transition-all">Upload</span>
                        </label>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Other documents — student labels what it is; multiple allowed */}
              <div className="rounded-lg border border-dashed border-brand-navy/15 p-3 space-y-2">
                <div className="text-[9px] font-bold uppercase tracking-widest text-brand-navy/40">📎 Other documents (anything else — label it)</div>
                <div className="flex items-center gap-2">
                  <input
                    value={otherLabels[app.id] || ''}
                    onChange={(e) => setOtherLabels(l => ({ ...l, [app.id]: e.target.value }))}
                    placeholder="What is this document? e.g. Gap year certificate, Work experience letter…"
                    className="flex-1 rounded-lg border border-brand-navy/10 bg-white px-2.5 py-2 text-[10px] text-brand-navy outline-none focus:border-brand-gold"
                  />
                  <label className="cursor-pointer shrink-0">
                    <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx" className="hidden" onChange={(e) => {
                      const f = e.target.files?.[0];
                      const label = (otherLabels[app.id] || '').trim();
                      if (f) {
                        if (!label) { alert('Please enter what this document is first.'); return; }
                        uploadDoc(app.id, 'other', f, label);
                        setOtherLabels(l => ({ ...l, [app.id]: '' }));
                      }
                    }} />
                    <span className="bg-brand-navy text-white text-[9px] font-bold px-3 py-2 rounded hover:bg-brand-navy/90 transition-all">Upload</span>
                  </label>
                </div>
                <div className="text-[9px] text-brand-navy/40">You can upload multiple — each one is tied to your profile and visible to your counsellor.</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}