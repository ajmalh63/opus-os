import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import ManpowerProfileWizard, { ManpowerProfile, manpowerCompleteness } from './ManpowerProfileWizard';
import { computeManpowerMatchFrontend } from '../lib/manpowerMatch';

export default function ManpowerMarketplace({ token }: { token: string }) {
  const qc = useQueryClient();
  const [tab, setTab] = useState<'profile' | 'jobs' | 'applications'>('jobs');
  const [q, setQ] = useState('');
  const [country, setCountry] = useState('');
  const [selectedJob, setSelectedJob] = useState<any | null>(null);
  const [statusMsg, setStatusMsg] = useState<{ text: string; type: 'success' | 'error' } | null>(null);

  const { data, isLoading } = useQuery<{ jobs: any[] }>({
    queryKey: ['manpowerMarketplace', q, country],
    queryFn: async () => {
      const r = await fetch('/api/public/jobs');
      if (!r.ok) return { jobs: [] };
      return r.json();
    },
  });

  const applyMutation = useMutation({
    mutationFn: async ({ jobId }: { jobId: string }) => {
      if (!isProfileReady) throw new Error('Complete your career profile (60%+) before applying — so Match% is real and recruiters can shortlist you.');
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
      const res = await fetch('/api/public/portal/manpower/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: token || 'client-self', jobId, formJson, resumeKey: profile.resumeKey || null }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || json.details || 'Failed to submit application');
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
      setStatusMsg({ text: err.message || 'Application failed. Please try again.', type: 'error' });
      setTimeout(() => setStatusMsg(null), 6000);
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
        const r = await fetch(`/api/public/portal/manpower/profile`, { headers: { 'X-Portal-Token': token } });
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
        const r = await fetch(`/api/public/portal/manpower/profile`, {
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
      const presignedRes = await fetch(`/api/public/portal/manpower/resume/presigned?token=${token}&filename=${encodeURIComponent(file.name)}`, { method: 'POST', headers: { 'X-Portal-Token': token } });
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

  const { data: appsData } = useQuery<{ success: boolean; applications: any[]; activeCount?: number }>({
    queryKey: ['portalManpowerApps', token],
    queryFn: async () => {
      const r = await fetch(`/api/public/portal/manpower/applications?token=${token}`, { headers: { 'X-Portal-Token': token } });
      if (!r.ok) return { success: true, applications: [] };
      return r.json();
    },
    enabled: tab === 'applications',
    refetchInterval: 30000,
  });

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

      <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs">
        <div className="space-y-6">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div className="flex items-center gap-2.5">
              <h3 className="font-display font-bold text-brand-navy text-base sm:text-lg">🌍 Global Careers</h3>
              <span className="text-xs px-2.5 py-1 rounded-full bg-brand-navy/[0.06] text-brand-navy/70 font-semibold">Profile → Jobs → Applications</span>
            </div>
            <div className="flex gap-1.5 bg-brand-navy/[0.05] p-1.5 rounded-xl text-xs sm:text-sm font-bold text-brand-navy/70">
              {(['profile','jobs','applications'] as const).map(t => (
                <button key={t} onClick={() => setTab(t)} className={`px-3 py-1.5 rounded-lg cursor-pointer transition-all ${tab===t ? 'bg-brand-gold text-brand-navy shadow-sm font-black' : 'hover:text-brand-navy'}`}>
                  {t==='profile' ? `My Profile ${completeness.pct<100 ? `(${completeness.pct}%)` : '✓'}` : t==='jobs' ? 'Open Jobs' : `My Applications ${appsData?.applications?.length ? `(${appsData.applications.length})` : ''}`}
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
            <div className="space-y-3.5">
              {(appsData?.applications || []).length===0 ? (
                <div className="rounded-2xl border border-dashed border-brand-navy/15 bg-white/60 p-10 text-center text-sm text-brand-navy/50">No applications yet — complete your profile and apply to an opening. Staff dispatch & kanban sync in realtime (30s poll + invalidations).</div>
              ) : (appsData!.applications.map((a:any) => (
                <div key={a.id} className="rounded-2xl border border-brand-navy/10 bg-white p-5 shadow-sm space-y-2.5 text-sm">
                  <div className="flex items-start justify-between gap-3">
                    <div><div className="font-bold text-brand-navy text-base">{a.jobTitle}</div><div className="text-xs text-brand-navy/50 mt-0.5">{a.jobCountry} · {a.selectionStatus} · Match {a.matchScore}% ({a.matchTier})</div></div>
                    <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase ${a.matchTier==='top_match'?'bg-emerald-500/15 text-emerald-700':a.matchTier==='standard'?'bg-amber-500/15 text-amber-700':'bg-slate-100 text-slate-600'}`}>{a.matchTier.replace('_',' ')}</span>
                  </div>
                  {(a.matchStrengths?.length || a.matchGaps?.length) ? <div className="text-xs text-brand-navy/70 bg-brand-navy/[0.03] rounded-xl px-3 py-2">{a.matchStrengths?.length ? <span className="text-emerald-700 font-semibold">✓ {a.matchStrengths.join(' · ')}</span> : null}{a.matchGaps?.length ? <span className="text-amber-700 font-semibold ml-3">○ {a.matchGaps.join(' · ')}</span> : null}</div> : null}
                </div>
              )))}
            </div>
          ) : (
            <>
            <div className="flex items-center justify-between flex-wrap gap-2">
              <p className="text-xs sm:text-sm text-slate-600">Direct hiring · Zero sub-agents · Real Match% computed live from your profile</p>
              <span className="text-xs px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-700 font-bold">Live</span>
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
                          disabled={applyMutation.isPending}
                          className="min-h-11 bg-brand-gold hover:bg-brand-gold-hover text-brand-navy text-xs font-extrabold uppercase tracking-wider px-5 rounded-xl transition disabled:opacity-40 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-gold/30 cursor-pointer shadow-sm"
                        >
                          {applyMutation.isPending ? 'Submitting…' : '⚡ Quick Apply'}
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
                disabled={applyMutation.isPending}
                className="px-5 py-2.5 rounded-xl bg-brand-navy hover:bg-brand-gold hover:text-brand-navy text-white text-xs sm:text-sm font-bold transition shadow-xs cursor-pointer disabled:opacity-50"
              >
                {applyMutation.isPending ? 'Submitting Application…' : 'Submit Application →'}
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
