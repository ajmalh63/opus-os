import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import StudentProfileWizard, { StudentProfile } from './StudentProfileWizard';
const API = (import.meta as any).env?.VITE_API_URL || '';

// Client portal — Study Abroad section (token-auth).
// Profile wizard (student-owned data) + Mandatory Strategy Call Gate (Option B) + applications tracker + document uploads.
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

interface StrategySessionStatus {
  success: boolean;
  profileComplete: boolean;
  completeness: { pct: number; missing: string[] };
  gatePct?: number;
  sessionMandatory: boolean;
  sessionStatus: 'required' | 'scheduled' | 'completed';
  booking: {
    id: string;
    title: string;
    startTime: number;
    endTime: number;
    status: string;
    attendeeName?: string | null;
    attendeeEmail?: string | null;
  } | null;
  bookingUrl: string;
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
    return <div className="flex items-center gap-1.5 text-xs font-bold text-rose-600"><span>✕</span><span>Application rejected</span></div>;
  }
  if (status === 'withdrawn') {
    return <div className="flex items-center gap-1.5 text-xs font-bold text-brand-navy/40"><span>⏸</span><span>Withdrawn</span></div>;
  }
  const idx = MILESTONES.indexOf(status);
  return (
    <div className="flex items-center gap-0.5">
      {MILESTONES.map((m, i) => (
        <div key={m} className="flex items-center gap-0.5 flex-1">
          <div className={`flex items-center gap-1 min-w-0 ${i <= idx ? 'text-brand-gold' : 'text-brand-navy/25'}`}>
            <span className="text-[13px]">{MILESTONE_ICON[m]}</span>
            <span className={`text-sm font-bold uppercase tracking-wide truncate ${i === idx ? 'text-brand-navy' : ''}`}>{STATUS_LABEL[m]}</span>
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
  const [tab, setTab] = useState<'profile' | 'applications' | 'documents'>('profile');
  const [otherLabels, setOtherLabels] = useState<Record<string, string>>({});

  const { data: profileData } = useQuery<{ success: boolean; profile: StudentProfile; completeness: { pct: number; missing: string[] }; universitySharingConsent: boolean; highestQualification: string | null }>({
    queryKey: ['studyProfile', token],
    queryFn: async () => {
      const r = await fetch(`${API}/api/public/portal/study-abroad/profile`, { headers: { 'X-Portal-Token': token } });
      if (r.status === 404) return { success: true, profile: {}, completeness: { pct: 0, missing: [] }, universitySharingConsent: false, highestQualification: null };
      if (!r.ok) throw new Error('Profile fetch failed');
      return r.json();
    }
  });

  const { data: strategyData } = useQuery<StrategySessionStatus>({
    queryKey: ['studyStrategySession', token],
    queryFn: async () => {
      const r = await fetch(`${API}/api/public/portal/study-abroad/strategy-session`, { headers: { 'X-Portal-Token': token } });
      if (!r.ok) throw new Error('Strategy session fetch failed');
      return r.json();
    },
    refetchInterval: 20000
  });

  const { data: appsData } = useQuery<{ success: boolean; applications: AppRow[] }>({
    queryKey: ['studyAppsClient', token],
    queryFn: async () => {
      const r = await fetch(`${API}/api/public/portal/study-abroad/applications`, { headers: { 'X-Portal-Token': token } });
      if (r.status === 404) return { success: true, applications: [] };
      if (!r.ok) throw new Error('Applications fetch failed');
      return r.json();
    },
    refetchInterval: 30000 // cross-tab sync: staff changes appear within 30s
  });

  const { data: docsData } = useQuery<{ success: boolean; documents: any[]; applications: { id: string; university: string; docsChecklist: Record<string, string> }[] }>({
    queryKey: ['studyDocsClient', token],
    queryFn: async () => {
      const r = await fetch(`${API}/api/public/portal/study-abroad/documents`, { headers: { 'X-Portal-Token': token } });
      if (r.status === 404) return { success: true, documents: [], applications: [] };
      if (!r.ok) throw new Error('Documents fetch failed');
      return r.json();
    },
    enabled: tab === 'documents'
  });

  const saveProfileMutation = useMutation({
    mutationFn: async (profile: StudentProfile) => {
      const r = await fetch(`${API}/api/public/portal/study-abroad/profile`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'X-Portal-Token': token },
        body: JSON.stringify(profile)
      });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || 'Save failed');
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['studyProfile', token] });
      queryClient.invalidateQueries({ queryKey: ['studyStrategySession', token] });
      alert(data.message || 'Profile saved. Please book your Strategy Session below to lock your target shortlist.');
    },
    onError: (e: any) => alert(e.message)
  });

  const acceptOfferMutation = useMutation({
    mutationFn: async ({ id, decision }: { id: string; decision: 'accepted' | 'declined' }) => {
      const r = await fetch(`${API}/api/public/portal/study-abroad/applications/${id}/accept-offer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Portal-Token': token },
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
      const presignedRes = await fetch(`${API}/api/public/portal/study-abroad/applications/${appId}/docs/${key}/presigned?token=${token}&filename=${encodeURIComponent(file.name)}${label ? `&label=${encodeURIComponent(label)}` : ''}`, { method: 'POST', headers: { 'X-Portal-Token': token } });
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
    if (d < 0) return <span className="px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-600 text-xs font-bold">⏰ {Math.abs(d)}d overdue</span>;
    if (d <= 7) return <span className="px-1.5 py-0.5 rounded bg-rose-500/15 text-rose-600 text-xs font-bold">🔥 {d}d left</span>;
    if (d <= 14) return <span className="px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-700 text-xs font-bold">⏳ {d}d left</span>;
    return <span className="px-1.5 py-0.5 rounded bg-brand-navy/[0.06] text-brand-navy/50 text-xs font-bold">{d}d left</span>;
  };

  const completeness = profileData?.completeness || { pct: 0, missing: [] };
  const sessionStatus = strategyData?.sessionStatus || 'required';
  const booking = strategyData?.booking;
  const gatePct = strategyData?.gatePct || 80;
  const gatePassed = completeness.pct >= gatePct && sessionStatus !== 'required';

  return (
    <div className="space-y-5">
      {/* Header — profile first */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2">
          <h3 className="font-display font-bold text-brand-navy text-sm">🎓 Study Abroad</h3>
          <span className="text-[13px] px-2 py-1 rounded-full bg-brand-navy/[0.06] text-brand-navy/60">Profile → Strategy Session → Applications</span>
        </div>
        <div className="flex gap-1 bg-brand-navy/[0.05] p-1 rounded-xl text-[13px] font-bold text-brand-navy/60">
          {(['profile', 'applications', 'documents'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} className={`px-2.5 py-1.5 rounded-lg cursor-pointer transition-all ${tab === t ? 'bg-brand-gold text-brand-navy shadow-sm' : 'hover:text-brand-navy'}`}>
              {t === 'profile' ? 'My Profile' : t === 'applications' ? 'Applications' : 'Documents'}
            </button>
          ))}
        </div>
      </div>

      {/* ── MANDATORY STRATEGY SESSION MILESTONE GATE (Option B Gold Standard) ── */}
      <div className="rounded-2xl border border-brand-gold/40 bg-gradient-to-br from-brand-gold/[0.08] via-white to-brand-navy/[0.02] p-5 shadow-sm space-y-3">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-gold text-brand-navy text-xs font-bold">2</span>
              <span className="text-[13px] font-bold uppercase tracking-wider text-brand-gold">Mandatory Milestone Gate</span>
              <span className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase ${
                sessionStatus === 'completed'
                  ? 'bg-emerald-500/15 text-emerald-800'
                  : sessionStatus === 'scheduled'
                  ? 'bg-blue-500/15 text-blue-800'
                  : 'bg-amber-500/20 text-amber-900 animate-pulse'
              }`}>
                {sessionStatus === 'completed' ? '✓ Strategy Evaluation Complete' : sessionStatus === 'scheduled' ? '📅 Session Confirmed' : 'Action Required: Book Strategy Call'}
              </span>
            </div>
            <h4 className="font-display text-sm font-bold text-brand-navy">
              {sessionStatus === 'completed'
                ? 'Admissions Strategy Evaluation Completed'
                : sessionStatus === 'scheduled'
                ? `Admissions Strategy Session Scheduled: ${booking?.startTime ? new Date(booking.startTime * 1000).toLocaleString('en-IN', { weekday: 'short', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Confirmed'}`
                : 'Book Your 1-on-1 University Strategy & Shortlisting Call'}
            </h4>
            <p className="text-xs text-brand-navy/70 max-w-2xl leading-relaxed">
              {sessionStatus === 'completed'
                ? 'Your senior admissions counselor has evaluated your profile, verified test waivers, and locked your target university shortlist.'
                : sessionStatus === 'scheduled'
                ? 'Your counselor is currently reviewing your academic transcripts and GPA to prepare your tailored Safe & Reach university matching matrix for your upcoming call.'
                : 'To ensure maximum admission success and scholarship eligibility, every student is required to complete a 30-minute 1-on-1 Strategy Session with our Senior Admissions Director before applications are filed.'}
            </p>
          </div>

          <div className="shrink-0 flex items-center gap-2">
            {sessionStatus === 'required' && strategyData?.bookingUrl && (
              <a
                href={strategyData.bookingUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-xl bg-brand-navy px-4 py-2.5 text-xs font-bold text-white shadow-md transition-all hover:bg-brand-gold hover:text-brand-navy active:scale-95 cursor-pointer"
              >
                <span>📅 Schedule 30-Min Call (Google Meet)</span>
                <span>↗</span>
              </a>
            )}
            {sessionStatus === 'scheduled' && strategyData?.bookingUrl && (
              <a
                href={strategyData.bookingUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-2 rounded-xl border border-brand-navy/20 bg-white px-4 py-2 text-xs font-bold text-brand-navy transition-all hover:border-brand-gold hover:text-brand-gold active:scale-95 cursor-pointer"
              >
                <span>Reschedule Call ↗</span>
              </a>
            )}
          </div>
        </div>

        {/* Visual Roadmap Stepper — gatePct-aware + exam-valid */}
        <div className="pt-2 border-t border-brand-navy/10 grid grid-cols-1 md:grid-cols-3 gap-2 text-[13px]">
          <div className="flex items-center gap-2 rounded-lg bg-white/70 p-2 border border-brand-navy/5">
            <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-xs font-bold ${completeness.pct >= gatePct ? 'bg-emerald-500 text-white' : 'bg-brand-navy/10 text-brand-navy'}`}>
              {completeness.pct >= gatePct ? '✓' : '1'}
            </span>
            <span className="font-semibold text-brand-navy">1. Complete Profile ({completeness.pct}%{completeness.pct < gatePct ? ` → need ${gatePct}%` : ''})</span>
          </div>
          <div className={`flex items-center gap-2 rounded-lg p-2 border ${sessionStatus === 'completed' ? 'bg-emerald-500/10 border-emerald-500/30' : sessionStatus === 'scheduled' ? 'bg-blue-500/10 border-blue-500/30' : completeness.pct >= gatePct ? 'bg-amber-500/10 border-amber-500/30 animate-pulse' : 'bg-white/70 border-brand-navy/5'}`}>
            <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-xs font-bold ${sessionStatus === 'completed' ? 'bg-emerald-500 text-white' : sessionStatus === 'scheduled' ? 'bg-blue-600 text-white' : completeness.pct >= gatePct ? 'bg-amber-600 text-white' : 'bg-brand-navy/10 text-brand-navy'}`}>
              {sessionStatus === 'completed' ? '✓' : '2'}
            </span>
            <span className="font-semibold text-brand-navy">2. Mandatory Strategy Session {completeness.pct < gatePct ? `(unlock at ${gatePct}%)` : ''}</span>
          </div>
          <div className={`flex items-center gap-2 rounded-lg p-2 border ${gatePassed ? 'bg-white/70 border-brand-navy/5' : 'bg-brand-navy/[0.02] border-dashed border-brand-navy/15'}`}>
            <span className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full text-xs font-bold ${gatePassed ? 'bg-brand-navy/10 text-brand-navy' : 'bg-brand-navy/[0.06] text-brand-navy/40'}`}>3</span>
            <span className={`font-semibold ${gatePassed ? 'text-brand-navy' : 'text-brand-navy/40'}`}>3. Submissions & Offers {gatePassed ? '' : '🔒'}</span>
          </div>
        </div>
        {/* Inline Cal — CRO gold: keep on page, no redirect, when pct >= gate */}
        {sessionStatus === 'required' && completeness.pct >= gatePct && strategyData?.bookingUrl && (
          <div className="rounded-xl border border-brand-gold/30 bg-white p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-brand-navy">Pick your 15-min slot — stays on this page</span>
              <a href={strategyData.bookingUrl} target="_blank" rel="noreferrer" className="text-[13px] font-bold text-brand-navy/50 underline">Open in new tab ↗</a>
            </div>
            <div className="rounded-lg overflow-hidden border border-brand-navy/10 bg-brand-navy/[0.02]" style={{ height: 520 }}>
              <iframe src={strategyData.bookingUrl} title="Strategy Session Booking" className="w-full h-full border-0" loading="lazy" allow="clipboard-write" />
            </div>
            <p className="text-[13px] text-brand-navy/50">Prefilled with your name/email • Reschedule anytime • You'll get the shortlist PDF after the call.</p>
          </div>
        )}
        {sessionStatus === 'required' && completeness.pct < gatePct && (
          <div className="rounded-lg border border-amber-500/20 bg-amber-500/10 p-3 text-sm text-amber-900">
            Complete your profile to <b>{gatePct}%</b> to unlock booking — missing: {completeness.missing.join(' · ') || 'a few fields'}.
          </div>
        )}
      </div>

      {/* ── PROFILE ── */}
      {tab === 'profile' && (
        <div className="space-y-4">
          {completeness.pct < 100 && (
            <div className="rounded-xl border border-brand-gold/30 bg-brand-gold/[0.06] p-3 text-[13px] text-brand-navy/70">
              <b>Your profile is {completeness.pct}% complete.</b> Complete it so your counselor has full context for your Strategy Call.
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

      {/* ── APPLICATIONS ── gate-locked until strategy session */}
      {tab === 'applications' && (
        <div className="space-y-3">
          {sessionStatus === 'required' && (
            <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-6 text-center space-y-3">
              <div className="text-sm font-bold text-amber-900">🔒 Applications locked — book your Strategy Session first</div>
              <p className="text-xs text-amber-800/80 max-w-xl mx-auto">Your submissions unlock after the 15-min call so Ajmal can lock your Safe/Reach shortlist. {completeness.pct < gatePct ? `Complete profile to ${gatePct}% first.` : 'Pick a slot in the gold card above.'}</p>
              {completeness.pct >= gatePct && strategyData?.bookingUrl && (
                <a href={strategyData.bookingUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-xl bg-brand-navy px-4 py-2 text-xs font-bold text-white">Book now ↗</a>
              )}
            </div>
          )}
          {gatePassed && (appsData?.applications || []).length === 0 && (
            <div className="rounded-2xl border border-dashed border-brand-navy/15 bg-white/60 p-8 text-center text-xs text-brand-navy/40">
              {sessionStatus === 'completed'
                ? 'Your counselor is generating your university applications based on your completed strategy session.'
                : 'No applications yet. Your counselor will create your shortlists after the strategy call.'}
            </div>
          )}
          {(appsData?.applications || []).map(app => (
            <div key={app.id} className="rounded-2xl border border-brand-navy/10 bg-white p-5 shadow-sm space-y-3 text-xs">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-bold text-brand-navy">{app.university.name}</div>
                  <div className="text-[13px] text-brand-navy/40 mt-0.5">{app.university.country} · {app.university.program} · {app.university.intake}</div>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {deadlineChip(app.university.deadline)}
                  <span className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase ${app.status === 'offer_letter' ? 'bg-emerald-500/15 text-emerald-700' : app.status === 'rejected' ? 'bg-rose-500/15 text-rose-600' : app.status === 'enrolled' ? 'bg-emerald-600/15 text-emerald-800' : 'bg-brand-navy/[0.06] text-brand-navy/60'}`}>{STATUS_LABEL[app.status] || app.status}</span>
                </div>
              </div>

              {/* Milestone stepper — visual journey */}
              <MilestoneStepper status={app.status} />

              {/* Match tier */}
              <div className="text-xs text-brand-navy/50 bg-brand-navy/[0.03] rounded-lg px-2.5 py-1.5">
                Fit: <b className={app.match.tier === 'match' ? 'text-emerald-700' : app.match.tier === 'reach' ? 'text-amber-700' : 'text-blue-700'}>{app.match.tier.toUpperCase()} {app.match.score}/100</b>
                {app.match.reasons.length > 0 && <span className="text-brand-navy/40"> — {app.match.reasons.join(' · ')}</span>}
              </div>

              {/* Offer panel */}
              {app.status === 'offer_letter' && (
                <div className="rounded-lg border border-emerald-200 bg-emerald-50/50 p-3 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold uppercase tracking-widest text-emerald-700">📬 Offer Letter</span>
                    <span className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase ${app.offer.offerDecision === 'accepted' ? 'bg-emerald-500/15 text-emerald-700' : app.offer.offerDecision === 'declined' ? 'bg-rose-500/15 text-rose-600' : 'bg-amber-500/15 text-amber-700'}`}>{app.offer.offerDecision}</span>
                  </div>
                  <div className="text-[13px] text-brand-navy/70 space-y-0.5">
                    <div>Type: <b>{app.offer.offerType || '—'}</b></div>
                    {app.offer.offerConditions.length > 0 && <div>Conditions: {app.offer.offerConditions.join('; ')}</div>}
                    <div className="flex flex-wrap gap-x-4">
                      <span>Accept by: <b>{fmtDate(app.offer.acceptanceDeadline)}</b> {deadlineChip(app.offer.acceptanceDeadline)}</span>
                      {app.offer.depositAmountPaise ? <span>Deposit: <b>{INR(app.offer.depositAmountPaise)}</b> by {fmtDate(app.offer.depositDeadline)}</span> : null}
                    </div>
                  </div>
                  {app.offer.offerDecision === 'pending' && (
                    <div className="flex gap-2">
                      <button onClick={() => acceptOfferMutation.mutate({ id: app.id, decision: 'accepted' })} className="bg-emerald-600 text-white text-[13px] font-bold px-3 py-2 rounded hover:bg-emerald-700 transition-all cursor-pointer">✓ Accept Offer</button>
                      <button onClick={() => acceptOfferMutation.mutate({ id: app.id, decision: 'declined' })} className="border border-rose-300 text-rose-600 text-[13px] font-bold px-3 py-2 rounded hover:bg-rose-50 transition-all cursor-pointer">✕ Decline</button>
                    </div>
                  )}
                </div>
              )}

              {app.status === 'rejected' && app.rejectionReason && (
                <div className="rounded-lg bg-rose-500/10 border border-rose-200 p-2.5 text-[13px] text-rose-700"><b>Rejected:</b> {app.rejectionReason}</div>
              )}

              {/* Docs checklist progress */}
              {Object.keys(app.docsChecklist).length > 0 && (
                <div className="flex items-center gap-2">
                  <div className="flex-1 h-1.5 rounded bg-brand-navy/[0.08] overflow-hidden">
                    <div className="h-full bg-brand-gold" style={{ width: `${Math.round((Object.values(app.docsChecklist).filter(v => v !== 'missing').length / Object.keys(app.docsChecklist).length) * 100)}%` }} />
                  </div>
                  <span className="text-xs text-brand-navy/40 font-bold">{Object.values(app.docsChecklist).filter(v => v !== 'missing').length}/{Object.keys(app.docsChecklist).length} docs</span>
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
                        <div className="text-[13px] font-bold text-brand-navy">{DOC_LABEL[key]}</div>
                        <div className={`text-xs font-bold uppercase ${state === 'verified' ? 'text-emerald-700' : state === 'received' ? 'text-blue-700' : 'text-brand-navy/40'}`}>
                          {state === 'verified' ? '✓ Verified' : state === 'received' ? '⏳ Under review' : 'Not uploaded'}
                        </div>
                      </div>
                      {state === 'missing' && (
                        <label className="cursor-pointer">
                          <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadDoc(app.id, key, f); }} />
                          <span className="bg-brand-gold text-brand-navy text-xs font-bold px-2.5 py-1.5 rounded hover:bg-brand-gold/90 transition-all">Upload</span>
                        </label>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Other documents — student labels what it is; multiple allowed */}
              <div className="rounded-lg border border-dashed border-brand-navy/15 p-3 space-y-2">
                <div className="text-xs font-bold uppercase tracking-widest text-brand-navy/40">📎 Other documents (anything else — label it)</div>
                <div className="flex items-center gap-2">
                  <input
                    value={otherLabels[app.id] || ''}
                    onChange={(e) => setOtherLabels(l => ({ ...l, [app.id]: e.target.value }))}
                    placeholder="What is this document? e.g. Gap year certificate, Work experience letter…"
                    className="flex-1 rounded-lg border border-brand-navy/10 bg-white px-2.5 py-2 text-[13px] text-brand-navy outline-none focus:border-brand-gold"
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
                    <span className="bg-brand-navy text-white text-xs font-bold px-3 py-2 rounded hover:bg-brand-navy/90 transition-all">Upload</span>
                  </label>
                </div>
                <div className="text-xs text-brand-navy/40">You can upload multiple — each one is tied to your profile and visible to your counsellor.</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
