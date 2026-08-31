import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ManpowerProfileWizard, { ManpowerProfile, manpowerCompleteness } from './ManpowerProfileWizard';
import { ManpowerAccessGate } from './manpower/ManpowerAccessGate';
import { computeManpowerMatchFrontend } from '../lib/manpowerMatch';
import { apiFetch } from '../lib/apiClient';
import { createSyncClient } from '../lib/syncClient';
const API = (import.meta as any).env?.VITE_API_URL || '';

// VAS (career add-on services) — single optional paid offering alongside the ₹100 Candidate Pass
type VasPlan = { key: string; title: string; description: string; pricePaise: number; durationDays: number; deliverable: string };

// Application tracker status labels (ported from the legacy ManpowerJobs tracker)
const SEL: Record<string, string> = { applied: 'Applied', shortlisted: 'Shortlisted', selected: 'Selected', rejected: 'Rejected' };
const MED: Record<string, string> = { pending: 'Medical Pending', fit: 'Medically Fit', unfit: 'Unfit', restricted: 'Restricted' };
const VISA: Record<string, string> = { pending: 'Visa Pending', submitted: 'Visa Submitted', stamped: 'Visa Stamped', rejected: 'Visa Rejected' };
const FLT: Record<string, string> = { pending: 'Awaiting Flight', booked: 'Flight Booked', deployed: 'Deployed' };

export default function ManpowerMarketplace({ token, clientId }: { token: string; clientId?: string }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'profile' | 'jobs' | 'applications' | 'vas'>('jobs');
  const [q, setQ] = useState('');
  const [country, setCountry] = useState('');
  const [selectedJob, setSelectedJob] = useState<any | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);
  const [showGate, setShowGate] = useState(false);
  const [payBusy, setPayBusy] = useState(false);
  const [acceptedVasTerms, setAcceptedVasTerms] = useState(false);

  // P1-3 realtime: live application-status + payment events from SyncHub.
  useEffect(() => {
    if (!clientId) return;
    const client = createSyncClient({
      plane: 'client',
      token,
      channels: [`client:${clientId}:applications`, `client:${clientId}:payments`],
      onEvent: (e) => {
        if (e.type === 'MANPOWER_DEPLOYMENT_CREATED' || e.type === 'MANPOWER_DEPLOYMENT_UPDATED') {
          qc.invalidateQueries({ queryKey: ['portalManpowerApps', token] });
          qc.invalidateQueries({ queryKey: ['manpowerMarketplace'] });
          qc.invalidateQueries({ queryKey: ['portalJobAppsHub'] });
        }
        if (e.type === 'PAYMENT_VERIFIED') {
          qc.invalidateQueries({ queryKey: ['portalManpowerApps', token] });
          qc.invalidateQueries({ queryKey: ['portalPayments', token] });
        }
      },
    });
    client.connect();
    return () => client.disconnect();
  }, [clientId, token]);

  const { data, isLoading } = useQuery<{ jobs: any[] }>({
    queryKey: ['manpowerMarketplace', q, country],
    queryFn: async () => {
      const r = await fetch(`${API}/api/public/jobs`);
      if (!r.ok) throw new Error('Request failed (' + r.status + ').');
      return r.json();
    },
  });

  // ——— Defense-in-depth membership gate: ₹100 candidate-pass required before applying ———
  const { data: membershipData, refetch: refetchMembership } = useQuery<{ enabled: boolean; comingSoon: boolean; membership: { isMember: boolean; expiresAt: number | null; plan: string | null } }>({
    queryKey: ['portalManpowerMembershipGate', token],
    staleTime: 60_000,
    queryFn: async () => {
      const r = await fetch(`${API}/api/public/portal/manpower/membership`, { headers: { 'X-Portal-Token': token } });
      if (!r.ok) throw new Error('membership status unavailable');
      return r.json();
    },
    enabled: !!token,
  });
  const isMember = membershipData?.membership?.isMember === true;

  const applyMutation = useMutation({
    mutationFn: async ({ jobId }: { jobId: string }) => {
      if (!isProfileReady) throw new Error('Complete your career profile (60%+) before applying — so Match% is real and recruiters can shortlist you.');
      if (activeCount >= maxQuota) throw new Error(`Active application limit reached (${activeCount}/${maxQuota}) — wait for a decision on a current application before applying to more roles.`);
      // Membership check: trust the cached status, else re-verify live before the POST fires
      let member = isMember;
      if (!member) {
        try {
          const r = await fetch(`${API}/api/public/portal/manpower/membership`, { headers: { 'X-Portal-Token': token } });
          if (r.ok) member = !!(await r.json())?.membership?.isMember;
        } catch {}
      }
      if (!member) throw new Error('Candidate Pass required — purchase the ₹100 verification pass first.');
      const formJson = {
        personal: { fullName: profile.fullName, dob: profile.dob, gender: profile.gender, nationality: profile.nationality, currentCity: profile.currentCity, languages: profile.languages },
        contact: { phone: profile.phone, email: profile.email, emergencyContact: profile.emergencyContact, emergencyPhone: profile.emergencyPhone },
        passport: { hasPassport: !!profile.hasPassport, passportNumber: profile.passportNumber, expiryDate: profile.passportExpiry },
        experience: { totalYears: profile.totalYears, currentRole: profile.currentRole, currentEmployer: profile.currentEmployer, skills: profile.skills, willingToTravel: !!profile.willingToTravel },
        education: { highestQualification: profile.highestQualification, institution: profile.institution, fieldOfStudy: profile.fieldOfStudy },
        salary: { currentSalaryPaise: profile.currentSalaryPaise, expectedSalaryPaise: profile.expectedSalaryPaise, noticePeriodDays: profile.noticePeriodDays },
        medical: { selfDeclaredFit: profile.selfDeclaredFit, hasChronicCondition: !!profile.hasChronicCondition },
        additional: { tradeCertifications: profile.tradeCertifications, drivingLicense: profile.drivingLicense },
      };
      const res = await fetch(`${API}/api/public/portal/manpower/applications`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token || 'client-self', jobId, formJson, resumeKey: profile.resumeKey || null }),
      });
      const json = await res.json();
      if (!res.ok) {
        const friendly = json.code === 'MEMBERSHIP_REQUIRED'
          ? 'Candidate Pass required — purchase the ₹100 verification pass first.'
          : (json.error || json.details || 'Failed to submit application');
        const err: any = new Error(friendly);
        err.code = json.code;
        throw err;
      }
      return json;
    },
    onSuccess: (_d, vars) => {
      const jobObj = (data?.jobs || []).find((j: any) => j.id === vars.jobId);
      setStatusMsg({
        text: `✓ Successfully applied for ${jobObj?.title || 'position'}! Your profile has been queued for recruiter review.`,
        type: 'success',
      });
      setSelectedJob(null);
      qc.invalidateQueries({ queryKey: ['portalManpowerApps'] });
      qc.invalidateQueries({ queryKey: ['portalClientSession'] });
      setTimeout(() => setStatusMsg(null), 5000);
    },
    onError: (err: any) => {
      if (err?.code === 'MEMBERSHIP_REQUIRED') {
        setShowGate(true);
        setStatusMsg({ text: '🔒 Candidate Pass required — a one-time ₹100 verification keeps applications spam-free. Unlock below to apply.', type: 'error' });
      } else {
        setStatusMsg({ text: err.message || 'Application failed. Please try again.', type: 'error' });
      }
      setTimeout(() => setStatusMsg(null), 8000);
    },
  });

  const jobs = (data?.jobs || []).filter((j: any) => {
    if (q && !(`${j.title} ${j.sector}`.toLowerCase().includes(q.toLowerCase()))) return false;
    if (country && j.country !== country) return false;
    return true;
  }).slice(0, 12);

  const countries = Array.from(new Set((data?.jobs || []).map((j: any) => j.country))).sort() as string[];

  // ——— Manpower profile (same pattern as StudyAbroad: profile → jobs → applications, realtime sync) ———
  const storageKey = `manpowerProfile:${token || 'anon'}`;
  const { data: profileData } = useQuery<{ profile: ManpowerProfile }>({
    queryKey: ['manpowerProfile', token],
    queryFn: async () => {
      // Try backend first (if portalManpower profile route exists), fallback to localStorage
      try {
        const r = await fetch(`${API}/api/public/portal/manpower/profile`, { headers: { 'X-Portal-Token': token } });
        if (r.ok) {
          const j = await r.json();
          if (j.profile) return j;
        }
      } catch {}
      const raw = localStorage.getItem(storageKey);
      return { profile: raw ? JSON.parse(raw) : {} };
    },
  });
  const profile: ManpowerProfile = profileData?.profile || {};
  const completeness = manpowerCompleteness(profile);
  const isProfileReady = completeness.pct >= 60;

  const saveProfileMutation = useMutation({
    mutationFn: async (p: ManpowerProfile) => {
      // Persist locally for instant realtime sync across tabs
      localStorage.setItem(storageKey, JSON.stringify(p));
      // Attempt backend sync (non-blocking) — stores in clients.intakeContext.manpowerProfile
      try {
        const r = await fetch(`${API}/api/public/portal/manpower/profile`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json', 'X-Portal-Token': token },
          body: JSON.stringify(p),
        });
        if (r.ok) return r.json();
      } catch {}
      return { success: true };
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['manpowerProfile', token] });
      qc.invalidateQueries({ queryKey: ['portalClientSession'] });
      qc.invalidateQueries({ queryKey: ['manpowerMarketplace'] });
      // Mirror StudyAbroad realtime invalidations: kanban + workspace
      qc.invalidateQueries({ queryKey: ['kanban'] });
      setStatusMsg({ text: '✓ Profile saved — Match% updated instantly across jobs and staff desk.', type: 'success' });
      setTimeout(() => setStatusMsg(null), 4000);
    },
    onError: (e: any) => setStatusMsg({ text: e.message, type: 'error' }),
  });

  // Resume upload — presigned R2 flow (same as StudyAbroad docs/upload, reused for manpower resume)
  const uploadResume = async (file: File) => {
    try {
      const presignedRes = await fetch(`${API}/api/public/portal/manpower/resume/presigned?token=${token}&filename=${encodeURIComponent(file.name)}`, { method: 'POST', headers: { 'X-Portal-Token': token } });
      if (presignedRes.ok) {
        const { url } = await presignedRes.json();
        const put = await fetch(url, { method: 'PUT', body: await file.arrayBuffer() });
        if (put.ok) {
          const updated = { ...profile, resumeName: file.name, resumeKey: `r2:${file.name}` };
          localStorage.setItem(storageKey, JSON.stringify(updated));
          qc.invalidateQueries({ queryKey: ['manpowerProfile', token] });
          setStatusMsg({ text: '✓ Resume uploaded — visible to recruiters instantly.', type: 'success' });
          setTimeout(() => setStatusMsg(null), 4000);
          return;
        }
      }
      // Fallback: store name only (offline/dev without R2)
      const updated = { ...profile, resumeName: file.name, resumeKey: `pending:${file.name}` };
      localStorage.setItem(storageKey, JSON.stringify(updated));
      qc.invalidateQueries({ queryKey: ['manpowerProfile', token] });
      setStatusMsg({ text: `✓ ${file.name} queued locally — staff will see it on sync.`, type: 'success' });
      setTimeout(() => setStatusMsg(null), 4000);
    } catch (e: any) {
      setStatusMsg({ text: `Resume upload failed: ${e.message}`, type: 'error' });
    }
  };

  const { data: appsData, error: appsError } = useQuery<{ success: boolean; applications: any[]; activeCount?: number; maxQuota?: number }>({
    queryKey: ['portalManpowerApps', token],
    queryFn: async () => {
      // P2-3 fix: route through apiFetch — failures now throw ApiError (status +
      // server message) instead of silently masquerading as an empty success.
      return apiFetch(`${API}/api/public/portal/manpower/applications?token=${token}`, { headers: { 'X-Portal-Token': token } });
    },
    enabled: !!token,
    refetchInterval: 30000,
  });
  const applications = appsData?.applications || [];
  const activeCount = appsData?.activeCount ?? applications.filter((d: any) => !['rejected'].includes(d.selectionStatus) && d.flightStatus !== 'deployed').length;
  const maxQuota = appsData?.maxQuota ?? 3;

  // P2-3: surface fetch failures instead of showing a misleading empty state.
  useEffect(() => {
    if (appsError) setStatusMsg({ text: appsError instanceof Error ? appsError.message : 'Could not load your applications.', type: 'error' });
  }, [appsError]);

  // ——— VAS career add-ons (ATS resume revamp, mock interviews, express screening) — optional, never required ———
  const { data: vasData } = useQuery<{ plans: VasPlan[] }>({
    queryKey: ['portalManpowerVas'],
    staleTime: 300_000,
    queryFn: async () => { const r = await fetch(`${API}/api/public/portal/manpower/vas-plans`); if (!r.ok) throw new Error('vas'); return r.json(); },
    enabled: tab === 'vas',
  });
  const vasPlans = vasData?.plans || [];

  const loadRazorpay = () => new Promise<boolean>((resolve) => {
    if ((window as any).Razorpay) return resolve(true);
    const sc = document.createElement('script');
    sc.src = 'https://checkout.razorpay.com/v1/checkout.js';
    sc.onload = () => resolve(true);
    sc.onerror = () => resolve(false);
    document.body.appendChild(sc);
  });

  const purchaseVas = async (serviceKey: string) => {
    setPayBusy(true);
    try {
      const loaded = await loadRazorpay();
      if (!loaded) throw new Error('Razorpay checkout failed to load.');
      const oRes = await fetch(`${API}/api/public/portal/manpower/vas/order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, serviceKey }),
      });
      const o = await oRes.json();
      if (!oRes.ok || !o.order_id) throw new Error(o.error || 'Failed to initialize service order');

      const result = await new Promise<{ razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string } | null>((resolve) => {
        const rz = new (window as any).Razorpay({
          key: o.key, amount: o.amount_paise, currency: o.currency || 'INR',
          name: 'Opus Overseas Career Advisory', description: o.title || 'Career Service',
          order_id: o.order_id,
          handler: (res: any) => resolve({ razorpay_payment_id: res.razorpay_payment_id, razorpay_order_id: res.razorpay_order_id, razorpay_signature: res.razorpay_signature }),
          modal: { ondismiss: () => resolve(null) },
        });
        rz.open();
      });
      if (!result) { setStatusMsg({ text: 'Payment window closed.', type: 'error' }); return; }

      const vRes = await fetch(`${API}/api/public/portal/manpower/vas/verify`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, serviceKey, ...result }),
      });
      const v = await vRes.json();
      if (!vRes.ok) throw new Error(v.error || 'Payment verification failed');
      setStatusMsg({ text: v.message || '✓ Career service confirmed! Our team will reach out.', type: 'success' });
      setTimeout(() => setStatusMsg(null), 6000);
    } catch (e: any) {
      setStatusMsg({ text: e.message || 'Payment failed. Please try again.', type: 'error' });
      setTimeout(() => setStatusMsg(null), 8000);
    } finally {
      setPayBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {statusMsg && (
        <div className={`p-3.5 rounded-xl text-xs font-medium flex items-center justify-between shadow-xs ${
          statusMsg.type === 'success' ? 'bg-emerald-50 border border-emerald-200 text-emerald-800' : 'bg-rose-50 border border-rose-200 text-rose-800'
        }`}>
          <span>{statusMsg.text}</span>
          <button onClick={() => setStatusMsg(null)} className="font-bold opacity-60 hover:opacity-100 cursor-pointer">✕</button>
        </div>
      )}

      {showGate && (
        <ManpowerAccessGate
          isModal={false}
          clientToken={token}
          onSuccess={() => {
            setShowGate(false);
            refetchMembership();
            qc.invalidateQueries({ queryKey: ['portalManpowerApps'] });
            qc.invalidateQueries({ queryKey: ['manpowerMarketplace'] });
          }}
        />
      )}

      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs">
        <div className="space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2.5 flex-wrap">
              <h3 className="font-display font-bold text-brand-navy text-base sm:text-lg">🌍 Manpower Services</h3>
              <span className="text-xs px-2.5 py-1 rounded-full bg-brand-navy/[0.06] text-brand-navy/70 font-semibold">Profile → Jobs → Applications</span>
              {isMember && (
                <span className="text-[11px] font-bold px-2.5 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700" title="₹100 lifetime candidate-pass verified">
                  ✓ Your pass: Candidate Pass — active
                </span>
              )}
            </div>
            <div className="flex gap-1.5 bg-brand-navy/[0.05] p-1.5 rounded-xl text-xs sm:text-sm font-bold text-brand-navy/70">
              {(['profile','jobs','applications','vas'] as const).map(t => (
                <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 rounded-lg cursor-pointer transition-all ${tab===t ? 'bg-brand-gold text-brand-navy shadow-sm font-black' : 'hover:text-brand-navy'}`}>
                  {t==='profile' ? `My Profile ${completeness.pct<100 ? `(${completeness.pct}%)` : '✓'}` : t==='jobs' ? 'Open Jobs' : t==='vas' ? '✨ Career Add-Ons' : `My Applications ${applications.length ? `(${applications.length})` : ''}`}
                </button>
              ))}
            </div>
          </div>

          {tab === 'profile' ? (
            <div className="space-y-5">
              {completeness.pct < 100 && (
                <div className="rounded-2xl border border-brand-gold/40 bg-brand-gold/[0.08] p-4 text-xs sm:text-sm text-brand-navy/80 space-y-1">
                  <div><b>Your career profile is {completeness.pct}% complete.</b> 60%+ unlocks real Match% (not the random demo score) — computed live from <b>Experience (35)</b> + <b>Skills (35)</b> + <b>Trade (15)</b> + <b>Passport/Medical (15)</b>.</div>
                  {completeness.missing.length>0 && <div className="text-brand-navy/60">Missing: {completeness.missing.join(' · ')}</div>}
                </div>
              )}
              <ManpowerProfileWizard initial={profile} onSave={p => saveProfileMutation.mutate(p)} saving={saveProfileMutation.isPending} />
              <div className="rounded-2xl border border-dashed border-brand-navy/15 p-5 space-y-3 bg-brand-navy/[0.02]">
                <div className="text-sm font-bold text-brand-navy">📄 Resume vault (realtime sync)</div>
                <p className="text-xs sm:text-sm text-brand-navy/60">Upload once — visible instantly to recruiters, staff desk, and your Documents workspace. Max 5MB, PDF/DOCX/JPG.</p>
                <label className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-brand-navy text-white text-xs sm:text-sm font-bold cursor-pointer hover:bg-brand-navy/90 transition-all">
                  <input type="file" className="hidden" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" onChange={e => { const f=e.target.files?.[0]; if (f) uploadResume(f); }} />
                  {profile.resumeName ? `↻ Replace resume (${profile.resumeName})` : '+ Upload resume'}
                </label>
                {profile.resumeName && <div className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-1.5 inline-block ml-3">✓ {profile.resumeName}</div>}
              </div>
            </div>
          ) : tab === 'applications' ? (
            <div className="space-y-4">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <p className="text-xs sm:text-sm text-slate-600">Live tracking — selection, medical, visa, and flight stages sync every 30s.</p>
                <span className={`text-xs px-3 py-1 rounded-full border font-bold ${activeCount >= maxQuota ? 'bg-amber-50 border-amber-200 text-amber-700' : 'bg-emerald-50 border-emerald-200 text-emerald-700'}`}>Active quota {activeCount}/{maxQuota}</span>
              </div>
              {applications.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-brand-navy/15 bg-white/60 p-10 text-center space-y-3">
                  <p className="text-sm text-brand-navy/50">You haven't applied to any vacancies yet — browse open jobs and quick-apply with your profile.</p>
                  <button onClick={() => setTab('jobs')} className="inline-block bg-brand-gold hover:bg-brand-gold-hover text-brand-navy text-xs font-extrabold uppercase tracking-wider px-5 py-2.5 rounded-xl cursor-pointer transition shadow-sm">Browse Open Jobs</button>
                </div>
              ) : applications.map((a:any) => (
                <div key={a.id} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-display font-bold text-sm text-brand-navy">{a.jobTitle}</h3>
                        {a.matchScore !== undefined && (
                          <span className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase border ${a.matchTier === 'top_match' ? 'bg-emerald-500/10 text-emerald-700 border-emerald-200' : a.matchTier === 'standard' ? 'bg-amber-500/10 text-amber-700 border-amber-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                            {a.matchTier === 'top_match' ? '🔥 ' : ''}{a.matchScore}% Match
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-slate-500 mt-0.5">{a.jobCountry} · applied {a.appliedAt ? new Date(a.appliedAt * 1000).toLocaleDateString() : ''}</p>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase shrink-0 ${a.selectionStatus === 'rejected' ? 'bg-rose-500/10 text-rose-700' : a.selectionStatus === 'selected' ? 'bg-emerald-500/10 text-emerald-700' : 'bg-brand-gold/15 text-amber-800'}`}>{SEL[a.selectionStatus] || a.selectionStatus}</span>
                  </div>

                  {(a.matchStrengths?.length || 0) > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {a.matchStrengths.map((st: string, i: number) => (
                        <span key={i} className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs px-2 py-0.5 rounded-md">✓ {st}</span>
                      ))}
                    </div>
                  )}

                  {/* Enterprise decision timeline — operational dashboard hierarchy (NN/g) */}
                  <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5">
                    <div className="flex items-center justify-between gap-2">
                      {[
                        { label: 'Applied', done: true, active: a.selectionStatus !== 'applied', ok: a.selectionStatus !== 'rejected' },
                        { label: 'Shortlisted', done: ['shortlisted','selected'].includes(a.selectionStatus), active: a.selectionStatus === 'shortlisted', ok: a.selectionStatus !== 'rejected' },
                        { label: 'Selected', done: a.selectionStatus === 'selected', active: a.selectionStatus === 'selected', ok: a.selectionStatus !== 'rejected' },
                        { label: 'Medical', done: a.medicalStatus === 'fit', active: a.medicalStatus === 'pending', ok: a.medicalStatus !== 'unfit' },
                        { label: 'Visa', done: a.visaStatus === 'stamped', active: a.visaStatus === 'submitted', ok: a.visaStatus !== 'rejected' },
                        { label: 'Deployed', done: a.flightStatus === 'deployed', active: a.flightStatus === 'booked', ok: true },
                      ].map((s, i, arr) => (
                        <div key={s.label} className="flex flex-1 items-center gap-2">
                          <div className="flex flex-col items-center gap-1">
                            <div className={`flex h-7 w-7 items-center justify-center rounded-full border text-xs font-extrabold ${s.done ? (s.ok ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-rose-500 text-white border-rose-500') : s.active ? 'bg-brand-gold text-brand-navy border-brand-gold animate-pulse' : 'bg-slate-100 text-slate-400 border-slate-200'}`}>{s.done ? '✓' : i+1}</div>
                            <span className={`text-[11px] font-bold uppercase tracking-wider ${s.done ? 'text-slate-800' : s.active ? 'text-brand-gold' : 'text-slate-400'}`}>{s.label}</span>
                          </div>
                          {i < arr.length - 1 && <div className={`h-px flex-1 ${s.done ? 'bg-emerald-500/50' : 'bg-slate-200'}`} aria-hidden />}
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                      <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2"><span className="text-slate-500 uppercase text-[11px] font-bold">Medical</span><p className={`font-bold ${a.medicalStatus === 'fit' ? 'text-emerald-700' : a.medicalStatus === 'unfit' ? 'text-rose-700' : 'text-slate-700'}`}>{MED[a.medicalStatus] || a.medicalStatus}</p></div>
                      <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2"><span className="text-slate-500 uppercase text-[11px] font-bold">Visa</span><p className={`font-bold ${a.visaStatus === 'stamped' ? 'text-emerald-700' : a.visaStatus === 'rejected' ? 'text-rose-700' : 'text-slate-700'}`}>{VISA[a.visaStatus] || a.visaStatus}</p></div>
                      <div className="rounded-lg border border-slate-200 bg-white px-2.5 py-2"><span className="text-slate-500 uppercase text-[11px] font-bold">Flight</span><p className={`font-bold ${a.flightStatus === 'deployed' ? 'text-emerald-700' : 'text-slate-700'}`}>{FLT[a.flightStatus] || a.flightStatus}</p></div>
                    </div>
                  </div>

                  {a.rejectionReason && <p className="text-xs text-rose-700 bg-rose-50 border border-rose-200 rounded-lg px-3 py-2">Reason: {a.rejectionReason}</p>}
                  {a.notes && <p className="text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">Note: {a.notes}</p>}
                </div>
              ))}
            </div>
          ) : tab === 'vas' ? (
            <div className="space-y-5">
              <p className="text-xs sm:text-sm text-slate-600">Optional professional services — <b>standard recruitment stays free</b>. The only required payment is the one-time ₹100 Candidate Pass.</p>

              {/* Legal safety, selection & no-refund transparency notice */}
              <div className="rounded-2xl border border-amber-300 bg-amber-50 p-5 space-y-3">
                <div className="flex items-center gap-2 text-amber-700 font-bold text-xs uppercase tracking-wider">
                  <span>⚠️</span>
                  <span>Important: First-Come, First-Served & No-Refund Policy</span>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-amber-900/80 leading-relaxed">
                  <div className="space-y-1">
                    <p className="font-bold text-amber-900 flex items-center gap-1.5">
                      <span className="text-amber-600">1.</span> First-Come, First-Served Employer Review
                    </p>
                    <p className="text-amber-900/60">
                      International hiring authorities evaluate candidates sequentially. If a candidate ahead of you is selected for a specific opening, your professional deliverable (ATS resume, interview coaching) remains permanently valid and active for all present and future overseas openings in your trade.
                    </p>
                  </div>
                  <div className="space-y-1">
                    <p className="font-bold text-amber-900 flex items-center gap-1.5">
                      <span className="text-amber-600">2.</span> No Job Guarantee & Non-Refundable Fee Policy
                    </p>
                    <p className="text-amber-900/60">
                      Under the <strong>Indian Emigration Act 1983</strong> and <strong>ILO C181</strong>, standard job recruitment is strictly free. These optional fees cover expert resume writing, mock interview coaching, and express screening labor. They <strong>do not guarantee employment or visa issuance</strong>. Fees are non-refundable once deliverable work commences.
                    </p>
                  </div>
                </div>

                <label className="flex items-start gap-2.5 cursor-pointer bg-white/70 border border-amber-200 rounded-xl p-3 mt-1 hover:border-amber-400 transition">
                  <input
                    type="checkbox"
                    checked={acceptedVasTerms}
                    onChange={(e) => setAcceptedVasTerms(e.target.checked)}
                    className="mt-0.5 rounded border-slate-300 text-brand-gold focus:ring-brand-gold cursor-pointer"
                  />
                  <span className="text-sm text-amber-900/90">
                    I understand this is an optional professional career coaching & document enhancement service. It does not guarantee job selection or visa outcome, and fees are non-refundable once work begins.
                  </span>
                </label>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {vasPlans.map((plan) => (
                  <div key={plan.key} className="group rounded-2xl border border-slate-200 bg-white p-5 flex flex-col justify-between gap-4 shadow-sm hover:border-brand-gold/30 hover:shadow-md transition-all duration-300">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-widest text-brand-gold">{plan.durationDays} Days SLA</span>
                        <span className="text-xs bg-slate-100 text-slate-600 px-2 py-0.5 rounded font-medium">Optional VAS</span>
                      </div>
                      <h4 className="font-display font-bold text-sm text-brand-navy">{plan.title}</h4>
                      <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">{plan.description}</p>
                      <div className="rounded-lg bg-slate-50 border border-slate-200 p-2.5 text-xs text-slate-700">
                        <span className="text-amber-700 font-bold">Deliverable: </span>{plan.deliverable}
                      </div>
                    </div>
                    <div className="border-t border-slate-100 pt-3 flex items-center justify-between">
                      <span className="text-brand-gold font-bold text-base">₹{(plan.pricePaise / 100).toLocaleString('en-IN')}</span>
                      <button
                        disabled={payBusy || !acceptedVasTerms}
                        onClick={() => purchaseVas(plan.key)}
                        className="min-h-11 bg-brand-gold hover:bg-brand-gold-hover text-brand-navy text-xs font-extrabold uppercase tracking-wider px-5 rounded-xl transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer shadow-sm focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-gold/30"
                      >
                        {payBusy ? 'Processing…' : !acceptedVasTerms ? 'Accept Terms' : 'Purchase'}
                      </button>
                    </div>
                  </div>
                ))}
                {vasPlans.length === 0 && (
                  <div className="col-span-full rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
                    No career add-ons published right now — check back soon.
                  </div>
                )}
              </div>
            </div>
          ) : (
            <>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-xs sm:text-sm text-slate-600">Direct hiring · Zero sub-agents · Real Match% computed live from your profile</p>
              <span className="text-xs px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold">Live</span>
            </div>

            {/* KPI strip — honest stats only (no exclusive/secret metrics) */}
            <div className="grid grid-cols-3 gap-3">
              <div className="rounded-2xl border border-slate-200 bg-slate-50/60 px-4 py-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Open Vacancies</p>
                <p className="mt-1 font-display text-xl font-extrabold tracking-tight text-slate-800">{jobs.length}</p>
                <p className="text-[11px] text-slate-500">{countries.length} countries</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50/60 px-4 py-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">My Applications</p>
                <p className="mt-1 font-display text-xl font-extrabold tracking-tight text-slate-800">{applications.length}</p>
                <p className="text-[11px] text-slate-500">{applications.filter((a: any) => a.selectionStatus === 'shortlisted' || a.selectionStatus === 'selected').length} in review</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-slate-50/60 px-4 py-3">
                <p className="text-[11px] font-bold uppercase tracking-[0.14em] text-slate-500">Active Quota</p>
                <p className={`mt-1 font-display text-xl font-extrabold tracking-tight ${activeCount >= maxQuota ? 'text-amber-600' : 'text-slate-800'}`}>{activeCount}/{maxQuota}</p>
                <p className="text-[11px] text-slate-500">{activeCount >= maxQuota ? 'Await decisions' : `${maxQuota - activeCount} slots remaining`}</p>
              </div>
            </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              placeholder="Search role or trade, e.g. Welder, Nurse, Driver"
              className="rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-2.5 text-sm text-brand-navy placeholder:text-slate-400 outline-none focus:border-brand-gold focus:bg-white"
            />
            <select
              value={country}
              onChange={e => setCountry(e.target.value)}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm text-brand-navy cursor-pointer focus:border-brand-gold outline-none"
            >
              <option value="">All countries ({countries.length})</option>
              {countries.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <div className="text-xs text-slate-600 flex items-center bg-slate-50 border border-slate-200/80 rounded-xl px-3.5 py-2">
              <span>Direct Hiring · Zero Unofficial Sub-Agents</span>
            </div>
          </div>

          {!isProfileReady && (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex items-center justify-between gap-4">
              <div className="text-xs sm:text-sm text-amber-800"><b>Complete your profile ({completeness.pct}%) to see real Match%.</b> Right now cards show a demo estimate (35%). <span className="text-amber-700">Takes 2 mins — same wizard as Study Abroad.</span></div>
              <button onClick={() => setTab('profile')} className="shrink-0 px-4 py-2.5 rounded-xl bg-brand-navy text-white text-xs sm:text-sm font-bold hover:bg-brand-navy/90 cursor-pointer transition-all">Complete profile →</button>
            </div>
          )}

{isLoading ? (
              <div className="py-10 text-center text-sm text-slate-400">Loading live openings…</div>
            ) : jobs.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-500">
                No jobs match your filter. Try broader terms or check back shortly.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              {jobs.map((j: any) => {
                const real = computeManpowerMatchFrontend(profile, j);
                const match = isProfileReady ? real.score : 35;
                const tier = isProfileReady ? real.tier : 'cold_pool';
                const collarLabel = j.collar === 'blue_collar' ? 'Blue Collar' : j.collar === 'white_collar' ? 'White Collar' : j.collar;
                const salaryINR = (() => {
                  if (!j.salaryText) return null;
                  const s = j.salaryText as string;
                  const num = parseInt(s.replace(/[^0-9]/g, ''), 10);
                  if (!num) return null;
                  if (s.includes('QR')) return ` (~₹${Math.round(num * 22.8).toLocaleString('en-IN')})`;
                  if (s.includes('AED')) return ` (~₹${Math.round(num * 22.6).toLocaleString('en-IN')})`;
                  if (s.includes('SAR')) return ` (~₹${Math.round(num * 22.2).toLocaleString('en-IN')})`;
                  return null;
                })();
                return (
                  <div key={j.id} className="group rounded-2xl border border-slate-200 bg-white p-5 sm:p-6 flex flex-col justify-between gap-4 shadow-sm hover:border-brand-gold/30 hover:shadow-md transition-all duration-300">
                    <div className="space-y-2.5">
                      <div className="flex items-start justify-between gap-2.5">
                        <h3 className="font-display font-bold text-base sm:text-lg text-slate-800 leading-snug min-w-0 flex-1">{j.title}</h3>
                        <span className={`px-3 py-1 rounded-full text-xs font-extrabold border shrink-0 ${tier==='top_match' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' : tier==='standard' ? 'bg-amber-50 text-amber-700 border-amber-200' : 'bg-slate-100 text-slate-600 border-slate-200'}`} title={isProfileReady ? real.tier : 'Complete profile for real score'}>Match {match}%</span>
                      </div>
                      <div className="flex flex-wrap gap-2 text-xs">
                        <span className="bg-slate-100 text-slate-700 rounded-md px-2.5 py-1 font-mono border border-slate-200">{j.country}</span>
                        <span className="bg-slate-100 text-slate-700 rounded-md px-2.5 py-1 font-medium">{j.sector}</span>
                        <span className="bg-brand-gold/10 text-amber-800 rounded-md px-2.5 py-1 font-bold capitalize border border-amber-200">{collarLabel}</span>
                      </div>
                      {j.description && (
                        <p className="text-xs sm:text-sm text-slate-600 line-clamp-2 leading-relaxed">{j.description}</p>
                      )}
                    </div>
                    <div className="flex items-center justify-between border-t border-slate-100 pt-3.5 gap-3">
                      <span className="text-brand-gold font-bold text-sm sm:text-base truncate">
                        {j.salaryText || 'Salary on appointment'}
                        {salaryINR && <span className="font-medium text-slate-500 text-xs sm:text-sm ml-1.5">{salaryINR}</span>}
                      </span>
                      <div className="flex items-center gap-2.5 shrink-0">
                        <button
                          onClick={() => setSelectedJob(j)}
                          className="hidden sm:inline-flex px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-brand-navy hover:bg-white hover:border-brand-gold transition cursor-pointer"
                        >
                          View Details
                        </button>
                        <button
                          onClick={() => applyMutation.mutate({ jobId: j.id })}
                          disabled={applyMutation.isPending || activeCount >= maxQuota}
                          className="min-h-11 bg-brand-gold hover:bg-brand-gold-hover text-brand-navy text-xs font-extrabold uppercase tracking-wider px-5 rounded-xl transition disabled:opacity-40 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-gold/30 cursor-pointer shadow-sm"
                        >
                          {activeCount >= maxQuota ? `Quota Full (${activeCount}/${maxQuota})` : applyMutation.isPending ? 'Submitting…' : '⚡ Quick Apply'}
                        </button>
                      </div>
                    </div>
                    <div className="sm:hidden flex gap-2">
                      <button
                        onClick={() => setSelectedJob(j)}
                        className="flex-1 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs font-bold text-brand-navy hover:bg-white transition cursor-pointer"
                      >
                        View Details
                      </button>
                    </div>
                  </div>
                );
              })}
              </div>
            )}
            </>
          )}
          </div>
        </div>

      {/* Detailed Job Modal */}
      {selectedJob && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 sm:p-8 space-y-5 shadow-2xl border border-slate-200 max-h-[90vh] overflow-y-auto animate-fadeIn">
            <div className="flex items-start justify-between gap-3 border-b border-slate-100 pb-4">
              <div>
                <span className="text-xs font-bold text-brand-gold uppercase tracking-widest block">Position Overview</span>
                <h3 className="font-display font-black text-lg sm:text-xl text-brand-navy mt-1">{selectedJob.title}</h3>
                <div className="text-xs sm:text-sm text-slate-500 font-medium mt-1">{selectedJob.country} · {selectedJob.sector}</div>
              </div>
              <button onClick={() => setSelectedJob(null)} className="w-8 h-8 rounded-full bg-slate-100 text-slate-500 font-bold hover:bg-slate-200 flex items-center justify-center cursor-pointer text-base">✕</button>
            </div>

            <div className="space-y-4 text-xs sm:text-sm text-slate-600">
              <div className="p-4 bg-slate-50 rounded-2xl border border-slate-100 space-y-2">
                <div className="font-bold text-brand-navy text-sm">Compensation & Contract</div>
                <div>Salary: <strong className="text-slate-800">{selectedJob.salaryText || 'Standard Industry Grade'}</strong></div>
                <div>Visa & Medical: <strong className="text-slate-800">Employer Sponsored</strong></div>
                <div>Accommodation: <strong className="text-slate-800">Provided / Allowance Included</strong></div>
              </div>

              {selectedJob.description && (
                <div>
                  <div className="font-bold text-brand-navy text-sm mb-1.5">Job Description</div>
                  <p className="leading-relaxed whitespace-pre-line text-slate-700">{selectedJob.description}</p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-100">
              <button
                onClick={() => setSelectedJob(null)}
                className="px-4 py-2.5 rounded-xl border border-slate-200 text-xs sm:text-sm font-bold text-slate-600 hover:bg-slate-50 cursor-pointer"
              >
                Close
              </button>
              <button
                onClick={() => applyMutation.mutate({ jobId: selectedJob.id })}
                disabled={applyMutation.isPending || activeCount >= maxQuota}
                className="px-5 py-2.5 rounded-xl bg-brand-navy hover:bg-brand-gold hover:text-brand-navy text-white text-xs sm:text-sm font-bold transition shadow-xs cursor-pointer disabled:opacity-50"
              >
                {activeCount >= maxQuota ? 'Quota Full' : applyMutation.isPending ? 'Submitting Application…' : 'Submit Application →'}
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="text-xs text-slate-500">
        All placements comply with MEA Overseas Employment norms. No unauthorized fees are charged to job seekers.
      </div>
    </div>
  );
}
