import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface Client {
  id: string;
  name: string;
  phone: string;
  email: string;
  primaryDivision: string;
  exclusiveMember?: boolean;
  exclusiveExpiresAt?: number | null;
  exclusivePlan?: string | null;
  instagramHandle?: string | null;
}

interface JobPosting {
  id: string;
  title: string;
  country: string;
  sector: string;
  salaryText: string;
  collar: 'blue_collar' | 'white_collar';
  tier: 'public' | 'secret';
  status: string;
  description?: string | null;
  employer?: string | null;
  employerReference?: string | null;
  salaryMinPaise?: number | null;
  salaryMaxPaise?: number | null;
  currency?: string;
  vacancies?: number;
  benefits?: string[];
  requirements?: string[];
  experienceYearsMin?: number;
  tradeCategory?: string | null;
  visaProvided?: boolean;
  medicalRequired?: boolean;
  deadline?: number | null;
  featured?: boolean;
  applicantCount?: number;
}

interface Deployment {
  id: string;
  clientId: string;
  jobId: string;
  selectionStatus: 'applied' | 'shortlisted' | 'selected' | 'rejected';
  medicalStatus: 'pending' | 'fit' | 'unfit' | 'restricted';
  visaStatus: 'pending' | 'submitted' | 'stamped' | 'rejected';
  flightStatus: 'pending' | 'booked' | 'deployed';
  jobTitle?: string;
  jobCountry?: string;
  jobSector?: string;
  collar?: string;
  employer?: string | null;
  employerReference?: string | null;
  candidateName?: string;
  candidateEmail?: string;
  candidatePhone?: string;
  formJson?: any;
  resumeKey?: string | null;
  appliedAt?: number | null;
  rejectionReason?: string | null;
  notes?: string | null;
  matchScore?: number;
  matchTier?: 'top_match' | 'standard' | 'cold_pool';
  matchStrengths?: string[];
  matchGaps?: string[];
  profileCompletenessPct?: number;
  missingProfileSections?: string[];
  hasPaidVas?: boolean;
  vasServiceTitle?: string;
}

const COLLAR_LABEL: Record<string, string> = { blue_collar: 'Blue Collar', white_collar: 'White Collar' };

export default function ManpowerPortal() {
  const queryClient = useQueryClient();
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [activeSubTab, setActiveSubTab] = useState<'jobs' | 'deployments' | 'community'>('jobs');
  const [jobTier, setJobTier] = useState<'public' | 'secret'>('public');
  const [jobCategory, setJobCategory] = useState<'blue_collar' | 'white_collar'>('blue_collar');
  const [showAddJob, setShowAddJob] = useState(false);
  const [showDeploy, setShowDeploy] = useState(false);
  const [editJobId, setEditJobId] = useState<string | null>(null);
  const [previewJob, setPreviewJob] = useState<JobPosting | null>(null);
  const [jobStatusFilter, setJobStatusFilter] = useState('all');
  const [exclusiveEnabled, setExclusiveEnabled] = useState(true);
  const [triageFilter, setTriageFilter] = useState<'all' | 'top_match' | 'standard' | 'cold_pool' | 'paid_vas'>('all');

  const [jobForm, setJobForm] = useState({
    title: '', country: '', sector: '', salaryText: '', collar: 'blue_collar' as 'blue_collar' | 'white_collar',
    tier: 'public' as 'public' | 'secret', description: '', employer: '', employerReference: '',
    salaryMinPaise: '', salaryMaxPaise: '', currency: 'AED', vacancies: 1, benefits: '', requirements: '',
    experienceYearsMin: 0, tradeCategory: '', visaProvided: true, medicalRequired: true, deadline: '', featured: false,
  });
  const [deployJobId, setDeployJobId] = useState('');

  const { data: jobsData, isLoading: jobsLoading } = useQuery<{ success: boolean; jobs: JobPosting[] }>({
    queryKey: ['manpowerJobs'],
    queryFn: async () => {
      const r = await fetch('/api/manpower/jobs');
      if (!r.ok) throw new Error('Failed to fetch jobs');
      return r.json();
    }
  });

  const { data: candidatesData } = useQuery<{ candidates: Client[] }>({
    queryKey: ['manpowerCandidates'],
    queryFn: async () => {
      const r = await fetch('/api/manpower/candidates');
      if (!r.ok) return { candidates: [] as Client[] };
      return r.json();
    }
  });

  const { data: clientsData } = useQuery<{ clients: Client[] }>({
    queryKey: ['clientsList'],
    queryFn: async () => {
      const r = await fetch('/api/clients');
      if (!r.ok) throw new Error('Failed to fetch clients');
      return r.json();
    }
  });

  const jobs = jobsData?.jobs?.length ? jobsData.jobs : [];
  const candidates = candidatesData?.candidates && candidatesData.candidates.length ? candidatesData.candidates
    : (clientsData?.clients || []).filter(c => c.primaryDivision === 'manpower');
  const selectedCandidate = candidates.find(c => c.id === selectedClientId) || candidates[0];

  const { data: deploymentsData } = useQuery<{ success: boolean; deployments: Deployment[] }>({
    queryKey: ['manpowerDeployments', selectedCandidate?.id],
    queryFn: async () => {
      if (!selectedCandidate?.id) return { success: true, deployments: [] };
      const r = await fetch(`/api/manpower/deployments?clientId=${selectedCandidate.id}`);
      if (!r.ok) return { success: true, deployments: [] as Deployment[] };
      return r.json();
    },
    enabled: !!selectedCandidate && activeSubTab === 'deployments'
  });

  const filteredJobs = jobs.filter(j => j.collar === jobCategory && j.tier === jobTier && (jobStatusFilter === 'all' || j.status === jobStatusFilter));

  const addJobMutation = useMutation({
    mutationFn: async (payload: any) => {
      const r = await fetch('/api/manpower/jobs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!r.ok) throw new Error('Failed to create job');
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['manpowerJobs'] });
      setShowAddJob(false);
      setJobForm({ title: '', country: '', sector: '', salaryText: '', collar: 'blue_collar', tier: 'public', description: '', employer: '', employerReference: '', salaryMinPaise: '', salaryMaxPaise: '', currency: 'AED', vacancies: 1, benefits: '', requirements: '', experienceYearsMin: 0, tradeCategory: '', visaProvided: true, medicalRequired: true, deadline: '', featured: false });
    },
    onError: (e: any) => alert(e.message)
  });

  const updateJobMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: any }) => {
      const r = await fetch(`/api/manpower/jobs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!r.ok) throw new Error('Failed to update job');
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['manpowerJobs'] });
      setShowAddJob(false);
      setEditJobId(null);
      setPreviewJob(null);
      setJobForm({ title: '', country: '', sector: '', salaryText: '', collar: 'blue_collar', tier: 'public', description: '', employer: '', employerReference: '', salaryMinPaise: '', salaryMaxPaise: '', currency: 'AED', vacancies: 1, benefits: '', requirements: '', experienceYearsMin: 0, tradeCategory: '', visaProvided: true, medicalRequired: true, deadline: '', featured: false });
    },
    onError: (e: any) => alert(e.message)
  });

  const archiveJobMutation = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/manpower/jobs/${id}`, { method: 'DELETE' });
      if (!r.ok) throw new Error('Failed to archive job');
      return r.json();
    },
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['manpowerJobs'] }); setPreviewJob(null); },
    onError: (e: any) => alert(e.message)
  });

  const setJobStatus = (id: string, status: string) => {
    updateJobMutation.mutate({ id, payload: { status } });
  };

  const handleEditJobClick = (j: JobPosting) => {
    setEditJobId(j.id);
    setJobForm({
      title: j.title, country: j.country, sector: j.sector, salaryText: j.salaryText,
      collar: j.collar, tier: j.tier,
      description: j.description || '', employer: j.employer || '', employerReference: j.employerReference || '',
      salaryMinPaise: j.salaryMinPaise ? String(j.salaryMinPaise) : '', salaryMaxPaise: j.salaryMaxPaise ? String(j.salaryMaxPaise) : '',
      currency: j.currency || 'AED', vacancies: j.vacancies || 1,
      benefits: (j.benefits || []).join(', '), requirements: (j.requirements || []).join(', '),
      experienceYearsMin: j.experienceYearsMin || 0, tradeCategory: j.tradeCategory || '',
      visaProvided: j.visaProvided !== false, medicalRequired: j.medicalRequired !== false,
      deadline: j.deadline ? new Date(j.deadline * 1000).toISOString().slice(0, 10) : '',
      featured: !!j.featured,
    });
    setShowAddJob(true);
  };

  const submitJob = () => {
    const payload = {
      ...jobForm,
      vacancies: Number(jobForm.vacancies) || 1,
      experienceYearsMin: Number(jobForm.experienceYearsMin) || 0,
      salaryMinPaise: jobForm.salaryMinPaise ? Math.round(Number(jobForm.salaryMinPaise)) : null,
      salaryMaxPaise: jobForm.salaryMaxPaise ? Math.round(Number(jobForm.salaryMaxPaise)) : null,
      benefits: jobForm.benefits.split(',').map((s) => s.trim()).filter(Boolean),
      requirements: jobForm.requirements.split(',').map((s) => s.trim()).filter(Boolean),
      deadline: jobForm.deadline ? Math.floor(new Date(jobForm.deadline).getTime() / 1000) : null,
    };
    if (editJobId) {
      updateJobMutation.mutate({ id: editJobId, payload });
    } else {
      addJobMutation.mutate(payload);
    }
  };

  const createDeploymentMutation = useMutation({
    mutationFn: async ({ clientId, jobId }: { clientId: string; jobId: string }) => {
      const r = await fetch('/api/manpower/deployments', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId, jobId })
      });
      if (!r.ok) throw new Error('Failed to start deployment');
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['manpowerDeployments', selectedCandidate?.id] });
      setShowDeploy(false);
      setDeployJobId('');
    },
    onError: (e: any) => alert(e.message)
  });

  const updateDeploymentMutation = useMutation({
    mutationFn: async ({ id, payload }: { id: string; payload: any }) => {
      const r = await fetch(`/api/manpower/deployments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!r.ok) throw new Error('Failed to update deployment');
      return r.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['manpowerDeployments', selectedCandidate?.id] }),
    onError: (e: any) => alert(e.message)
  });

  const deployments = deploymentsData?.deployments || [];

  // ---- Exclusive community: membership plans (admin) ----
  const [planForm, setPlanForm] = useState({ key: '', name: '', description: '', pricePaise: '', durationDays: 30, tier: 'basic', perks: '', active: true, sortOrder: 0 });
  const [editPlanId, setEditPlanId] = useState<string | null>(null);
  const [showPlanModal, setShowPlanModal] = useState(false);

  const { data: plansData, refetch: refetchPlans } = useQuery<{ success: boolean; plans: any[] }>({
    queryKey: ['membershipPlans'],
    queryFn: async () => { const r = await fetch('/api/manpower/membership-plans'); if (!r.ok) throw new Error('plans'); return r.json(); },
  });
  const plans = plansData?.plans || [];

  const savePlanMutation = useMutation({
    mutationFn: async (payload: any) => {
      const url = editPlanId ? `/api/manpower/membership-plans/${editPlanId}` : '/api/manpower/membership-plans';
      const r = await fetch(url, { method: editPlanId ? 'PUT' : 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (!r.ok) throw new Error('Failed to save plan');
      return r.json();
    },
    onSuccess: () => { refetchPlans(); setShowPlanModal(false); },
    onError: (e: any) => alert(e.message),
  });

  const deactivatePlanMutation = useMutation({
    mutationFn: async (id: string) => { const r = await fetch(`/api/manpower/membership-plans/${id}`, { method: 'DELETE' }); if (!r.ok) throw new Error('Failed'); return r.json(); },
    onSuccess: () => refetchPlans(),
    onError: (e: any) => alert(e.message),
  });

  const grantMembershipMutation = useMutation({
    mutationFn: async ({ clientId, exclusiveMember, planKey, durationDays }: any) => {
      const r = await fetch(`/api/manpower/clients/${clientId}/membership`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ exclusiveMember, planKey, durationDays }) });
      if (!r.ok) throw new Error('Failed');
      return r.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['clientsList'] }),
    onError: (e: any) => alert(e.message),
  });

  const selectedClientFull = (clientsData?.clients || []).find((c) => c.id === selectedCandidate?.id);

  const { data: settingsData } = useQuery<{ success: boolean; exclusiveCommunityEnabled: boolean }>({
    queryKey: ['manpowerSettings'],
    queryFn: async () => { const r = await fetch('/api/manpower/settings'); if (!r.ok) throw new Error('settings'); return r.json(); },
  });
  useEffect(() => { if (settingsData?.exclusiveCommunityEnabled !== undefined) setExclusiveEnabled(settingsData.exclusiveCommunityEnabled); }, [settingsData?.exclusiveCommunityEnabled]);

  const toggleCommunityMutation = useMutation({
    mutationFn: async (enabled: boolean) => {
      const r = await fetch('/api/manpower/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ exclusiveCommunityEnabled: enabled }) });
      if (!r.ok) throw new Error('Failed to update settings');
      return r.json();
    },
    onSuccess: (d) => { setExclusiveEnabled(d.exclusiveCommunityEnabled); },
    onError: (e: any) => alert(e.message),
  });

  return (
    <div className="space-y-6 font-sans">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-brand-navy/10 pb-5">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="h-2 w-2 rounded-full bg-brand-gold shadow-[0_0_8px_rgba(215,160,25,0.8)] animate-pulse" />
            <span className="text-[13px] font-extrabold uppercase tracking-[0.2em] text-brand-gold">Recruitment & Deployment</span>
          </div>
          <h1 className="font-display text-2xl font-black text-brand-navy tracking-tight">Manpower Sourcing Operations</h1>
          <p className="text-xs text-brand-textLight mt-0.5">Manage international job openings, recruitment classifications, and candidate flight deployments.</p>
        </div>
      </div>

      <div className="flex bg-white/80 p-1.5 rounded-2xl border border-brand-navy/15 text-xs font-bold text-brand-navy shadow-xs backdrop-blur-md gap-1.5 w-fit">
        <button
          onClick={() => setActiveSubTab('jobs')}
          className={`px-4 py-2 rounded-xl transition-all duration-200 cursor-pointer flex items-center gap-1.5 ${activeSubTab === 'jobs' ? 'bg-gradient-to-r from-brand-gold to-amber-500 text-brand-navy font-black shadow-sm' : 'text-brand-textLight hover:text-brand-navy hover:bg-brand-navy/5'}`}
        >
          <span>💼</span>
          <span>Job Vacancies Board</span>
        </button>
        <button
          onClick={() => { setActiveSubTab('deployments'); }}
          className={`px-4 py-2 rounded-xl transition-all duration-200 cursor-pointer flex items-center gap-1.5 ${activeSubTab === 'deployments' ? 'bg-gradient-to-r from-brand-gold to-amber-500 text-brand-navy font-black shadow-sm' : 'text-brand-textLight hover:text-brand-navy hover:bg-brand-navy/5'}`}
        >
          <span>🧳</span>
          <span>Deployment Status</span>
        </button>
        <button
          onClick={() => setActiveSubTab('community')}
          className={`px-4 py-2 rounded-xl transition-all duration-200 cursor-pointer flex items-center gap-1.5 ${activeSubTab === 'community' ? 'bg-gradient-to-r from-brand-gold to-amber-500 text-brand-navy font-black shadow-sm' : 'text-brand-textLight hover:text-brand-navy hover:bg-brand-navy/5'}`}
        >
          <span>🔒</span>
          <span>Exclusive Community</span>
        </button>
      </div>

      {activeSubTab === 'jobs' && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6 text-xs">
          <div className="lg:col-span-1 rounded-2xl border border-brand-navy/10 bg-white p-5 shadow-sm space-y-4 h-fit backdrop-blur-sm">
            <div>
              <div className="flex items-center justify-between mb-2">
                <h5 className="font-bold text-brand-gold uppercase tracking-widest text-xs">Job Board Tier</h5>
                <button onClick={() => setShowAddJob(true)} className="bg-brand-gold text-brand-navy text-[13px] font-bold px-2.5 py-1 rounded-lg hover:bg-brand-gold/90 transition-all cursor-pointer">+ Add</button>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={() => setJobTier('public')}
                  className={`flex-1 text-center py-2 rounded-lg font-bold cursor-pointer transition-all border ${jobTier === 'public' ? 'border-brand-gold bg-brand-gold/10 text-brand-gold' : 'border-brand-navy/10 bg-brand-navy/[0.04] text-brand-navy/50 hover:text-brand-navy'}`}
                >
                  Public vacancies
                </button>
                <button
                  onClick={() => setJobTier('secret')}
                  className={`flex-1 text-center py-2 rounded-lg font-bold cursor-pointer transition-all border ${jobTier === 'secret' ? 'border-brand-gold bg-brand-gold/10 text-brand-gold' : 'border-brand-navy/10 bg-brand-navy/[0.04] text-brand-navy/50 hover:text-brand-navy'}`}
                >
                  Secret openings
                </button>
              </div>
            </div>

            <div>
              <h5 className="font-bold text-brand-gold uppercase tracking-widest text-xs mb-2.5">Category Class</h5>
              <div className="flex gap-2">
                <button
                  onClick={() => setJobCategory('blue_collar')}
                  className={`flex-1 text-center py-2 rounded-lg font-bold cursor-pointer transition-all border ${jobCategory === 'blue_collar' ? 'border-brand-gold bg-brand-gold/10 text-brand-gold' : 'border-brand-navy/10 bg-brand-navy/[0.04] text-brand-navy/50 hover:text-brand-navy'}`}
                >
                  Blue Collar
                </button>
                <button
                  onClick={() => setJobCategory('white_collar')}
                  className={`flex-1 text-center py-2 rounded-lg font-bold cursor-pointer transition-all border ${jobCategory === 'white_collar' ? 'border-brand-gold bg-brand-gold/10 text-brand-gold' : 'border-brand-navy/10 bg-brand-navy/[0.04] text-brand-navy/50 hover:text-brand-navy'}`}
                >
                  White Collar
                </button>
              </div>
            </div>
            <p className="text-[13px] text-brand-navy/40 italic">Secret roles are staff-visible only and never leak to the public careers page.</p>
          </div>

          <div className="lg:col-span-3">
            <div className="flex flex-wrap items-center gap-1.5 mb-3">
              <span className="text-[13px] font-bold uppercase tracking-wider text-brand-navy/40 mr-1">Status:</span>
              {['all', 'draft', 'open', 'paused', 'filled', 'closed', 'archived'].map(st => (
                <button
                  key={st}
                  onClick={() => setJobStatusFilter(st)}
                  className={`px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider transition cursor-pointer ${jobStatusFilter === st ? 'bg-brand-gold text-brand-navy' : 'bg-brand-navy/[0.04] text-brand-navy/50 hover:text-brand-navy border border-brand-navy/10'}`}
                >
                  {st}
                </button>
              ))}
            </div>
            {jobsLoading ? (
              <p className="text-xs text-brand-navy/50 italic">Loading job postings…</p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredJobs.map(j => (
                  <div key={j.id} onClick={() => setPreviewJob(j)} className="rounded-2xl border border-brand-navy/10 bg-white p-5 shadow-sm flex flex-col justify-between hover:border-brand-gold/60 hover:bg-brand-navy/[0.04] backdrop-blur-sm transition-all duration-300 cursor-pointer">
                    <div className="space-y-2">
                      <div className="flex items-start justify-between gap-2">
                        <h4 className="font-bold text-brand-navy text-sm">{j.title}</h4>
                        <div className="flex items-center gap-1.5 shrink-0">
                          {j.featured && <span className="bg-brand-gold/15 text-brand-gold rounded px-1.5 py-0.5 text-xs font-bold uppercase">Featured</span>}
                          <span className={`rounded px-1.5 py-0.5 text-xs font-bold uppercase ${
                            j.status === 'open' ? 'bg-emerald-50 text-emerald-700' :
                            j.status === 'paused' ? 'bg-amber-50 text-amber-700' :
                            j.status === 'filled' ? 'bg-sky-50 text-sky-700' :
                            j.status === 'closed' ? 'bg-rose-50 text-rose-700' :
                            j.status === 'archived' ? 'bg-brand-navy/[0.06] text-brand-navy/40' :
                            'bg-brand-navy/[0.06] text-brand-navy/40'
                          }`}>{j.status || 'open'}</span>
                        </div>
                      </div>
                      <div className="flex gap-2 items-center flex-wrap">
                        <span className="bg-brand-navy/[0.06] text-brand-navy/70 rounded px-1.5 py-0.5 text-xs font-mono border border-brand-navy/10">{j.country}</span>
                        <span className="bg-brand-gold/10 text-brand-gold rounded px-1.5 py-0.5 text-xs font-bold capitalize">{COLLAR_LABEL[j.collar] || j.collar.replace('_', ' ')}</span>
                        {j.tier === 'secret' && <span className="bg-amber-500/15 text-amber-700 rounded px-1.5 py-0.5 text-xs font-bold uppercase">Secret</span>}
                        {typeof j.applicantCount === 'number' && <span className="bg-emerald-500/15 text-emerald-700 rounded px-1.5 py-0.5 text-xs font-bold">{j.applicantCount} applied</span>}
                      </div>
                      {j.employer && <p className="text-[13px] text-brand-navy/50">Employer: <span className="font-medium text-brand-navy/70">{j.employer}</span></p>}
                      {j.description && <p className="text-[13px] text-brand-navy/50 leading-relaxed line-clamp-2">{j.description}</p>}
                      {(j.benefits?.length || 0) > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {j.benefits!.slice(0, 4).map((b, i) => <span key={i} className="bg-emerald-500/10 text-emerald-700 text-xs px-1.5 py-0.5 rounded">{b}</span>)}
                        </div>
                      )}
                    </div>
                    <div className="text-brand-navy font-bold text-sm pt-4 border-t border-brand-navy/[0.08] mt-4 flex justify-between items-center">
                      <span>Salary:</span>
                      <span className="text-brand-gold">{j.salaryText}</span>
                    </div>
                  </div>
                ))}
                {filteredJobs.length === 0 && (
                  <p className="col-span-full py-12 text-center text-brand-navy/50 italic">No job openings found in this category. Add one from the filters panel.</p>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {activeSubTab === 'community' && (
        <div className="rounded-2xl border border-brand-navy/10 bg-white p-6 shadow-sm space-y-4 text-xs backdrop-blur-sm">
          <div className="flex justify-between items-center border-b border-brand-navy/10 pb-3">
            <div>
              <h3 className="font-display font-extrabold text-brand-navy text-sm">Exclusive Community — Membership Plans</h3>
              <p className="text-[13px] text-brand-navy/50">Control prices, durations, tiers, and perks for the paid job-seeker community. Active plans appear on the client paywall.</p>
            </div>
            <div className="flex items-center gap-4">
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <span className="text-[13px] font-bold uppercase tracking-wider text-brand-navy/50">Community</span>
                <button
                  onClick={() => toggleCommunityMutation.mutate(!exclusiveEnabled)}
                  className={`relative w-10 h-5 rounded-full transition-colors cursor-pointer ${exclusiveEnabled ? 'bg-emerald-500' : 'bg-brand-navy/[0.15]'}`}
                >
                  <span className={`absolute top-0.5 h-4 w-4 rounded-full bg-white shadow transition-all ${exclusiveEnabled ? 'left-5' : 'left-0.5'}`} />
                </button>
                <span className={`text-[13px] font-bold uppercase tracking-wider ${exclusiveEnabled ? 'text-emerald-700' : 'text-brand-navy/40'}`}>{exclusiveEnabled ? 'Live' : 'Coming Soon'}</span>
              </label>
              <button
                onClick={() => { setEditPlanId(null); setPlanForm({ key: '', name: '', description: '', pricePaise: '', durationDays: 30, tier: 'basic', perks: '', active: true, sortOrder: 0 }); setShowPlanModal(true); }}
                className="bg-brand-gold text-brand-navy text-[13px] font-bold px-3 py-1.5 rounded-lg hover:bg-brand-gold/90 transition-all cursor-pointer"
              >
                + New Plan
              </button>
            </div>
          </div>

          <div className="overflow-x-auto border border-brand-navy/10 rounded-xl">
            <table className="w-full text-left text-xs">
              <thead className="bg-brand-navy/[0.04] text-[13px] uppercase font-bold text-brand-gold border-b border-brand-navy/[0.08]">
                <tr>
                  <th className="px-4 py-3">Plan</th>
                  <th className="px-4 py-3">Tier</th>
                  <th className="px-4 py-3 text-right">Price</th>
                  <th className="px-4 py-3 text-right">Duration</th>
                  <th className="px-4 py-3 text-center">Status</th>
                  <th className="px-4 py-3 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-navy/[0.08] text-brand-navy/70">
                {plans.map((p) => (
                  <tr key={p.id} className="hover:bg-brand-navy/[0.04]">
                    <td className="px-4 py-3">
                      <div className="font-bold text-brand-navy">{p.name}</div>
                      <div className="text-[13px] text-brand-navy/40 font-mono">{p.key}</div>
                    </td>
                    <td className="px-4 py-3"><span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${p.tier === 'premium' ? 'bg-purple-50 text-purple-600' : p.tier === 'pro' ? 'bg-amber-50 text-amber-600' : 'bg-emerald-50 text-emerald-600'}`}>{p.tier}</span></td>
                    <td className="px-4 py-3 text-right font-bold text-brand-gold">₹{(p.pricePaise / 100).toLocaleString('en-IN')}</td>
                    <td className="px-4 py-3 text-right">{p.durationDays} days</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${p.active ? 'bg-emerald-50 text-emerald-700' : 'bg-brand-navy/[0.06] text-brand-navy/40'}`}>{p.active ? 'Active' : 'Inactive'}</span>
                    </td>
                    <td className="px-4 py-3 text-center space-x-2.5">
                      <button
                        onClick={() => { setEditPlanId(p.id); setPlanForm({ key: p.key, name: p.name, description: p.description || '', pricePaise: String(p.pricePaise / 100), durationDays: p.durationDays, tier: p.tier, perks: (() => { try { return JSON.parse(p.perksJson || '[]').join(', '); } catch { return ''; } })(), active: !!p.active, sortOrder: p.sortOrder || 0 }); setShowPlanModal(true); }}
                        className="text-brand-navy hover:underline font-bold cursor-pointer"
                      >
                        Edit
                      </button>
                      {p.active && (
                        <button onClick={() => { if (confirm('Deactivate this plan?')) deactivatePlanMutation.mutate(p.id); }} className="text-rose-600 hover:underline font-bold cursor-pointer">
                          Deactivate
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {plans.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-brand-navy/50 italic">No membership plans yet. Create one to start the paid community.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {activeSubTab === 'deployments' && (
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          <div className="lg:col-span-1 rounded-2xl border border-brand-navy/10 bg-white p-4 h-[500px] overflow-y-auto space-y-3 shadow-sm backdrop-blur-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-xs uppercase font-bold text-brand-gold tracking-wider">Candidate pool</h3>
              <button onClick={() => setShowDeploy(true)} className="bg-brand-gold text-brand-navy text-[13px] font-bold px-2.5 py-1 rounded-lg hover:bg-brand-gold/90 transition-all cursor-pointer">+ Deploy</button>
            </div>
            <div className="space-y-2">
              {candidates.map(c => (
                <button
                  key={c.id}
                  onClick={() => { setSelectedClientId(c.id); }}
                  className={`w-full text-left p-3 rounded-xl border text-xs transition-all cursor-pointer flex flex-col gap-1 ${selectedCandidate?.id === c.id ? 'border-brand-gold bg-brand-gold/10 font-semibold' : 'border-brand-navy/10 hover:border-brand-gold/50 bg-brand-navy/[0.04]'}`}
                >
                  <span className="font-bold text-brand-navy">{c.name}</span>
                  <span className="text-[13px] text-brand-navy/40 font-mono">{c.id}</span>
                </button>
              ))}
              {candidates.length === 0 && <p className="text-xs text-brand-navy/50 italic">No active manpower candidates found.</p>}
            </div>
          </div>

          <div className="lg:col-span-3 rounded-2xl border border-brand-navy/10 bg-white p-6 shadow-sm space-y-6 backdrop-blur-sm">
            {selectedCandidate ? (
              <>
                <div className="flex items-center gap-4 border-b border-brand-navy/[0.08] pb-5">
                  <span className="grid h-12 w-12 place-items-center rounded-xl bg-brand-navy/[0.05] text-lg border border-brand-navy/10">👷</span>
                  <div>
                    <h2 className="font-display text-lg font-bold text-brand-navy">{selectedCandidate.name}</h2>
                    <div className="flex items-center gap-2 mt-1.5">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${selectedClientFull?.exclusiveMember ? 'bg-emerald-50 text-emerald-700' : 'bg-brand-navy/[0.06] text-brand-navy/40'}`}>
                        {selectedClientFull?.exclusiveMember ? '✓ Exclusive Member' : 'Free Member'}
                      </span>
                      {selectedClientFull?.exclusiveExpiresAt && <span className="text-xs text-brand-navy/40 font-mono">expires {new Date(selectedClientFull.exclusiveExpiresAt * 1000).toLocaleDateString()}</span>}
                      {selectedClientFull?.instagramHandle && <span className="text-xs text-brand-navy/40 font-mono">@{selectedClientFull.instagramHandle}</span>}
                      <button
                        onClick={() => {
                          if (selectedClientFull?.exclusiveMember) {
                            if (confirm('Revoke exclusive membership for this client?')) grantMembershipMutation.mutate({ clientId: selectedCandidate.id, exclusiveMember: false });
                          } else {
                            const days = prompt('Grant exclusive membership for how many days?', '30');
                            if (days) grantMembershipMutation.mutate({ clientId: selectedCandidate.id, exclusiveMember: true, planKey: 'exclusive-30', durationDays: parseInt(days, 10) || 30 });
                          }
                        }}
                        className="text-xs font-bold uppercase tracking-wider text-brand-gold hover:underline cursor-pointer"
                      >
                        {selectedClientFull?.exclusiveMember ? 'Revoke' : 'Grant'}
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-brand-navy/40 font-mono text-[13px] mt-1">
                      <span>{selectedCandidate.id}</span><span>•</span><span>{selectedCandidate.email}</span><span>•</span><span>{selectedCandidate.phone}</span>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 bg-brand-navy/[0.03] p-2.5 rounded-xl border border-brand-navy/10">
                  <div className="flex gap-1">
                    <button
                      onClick={() => setTriageFilter('all')}
                      className={`px-3 py-1 rounded-lg text-[13px] font-bold uppercase transition cursor-pointer ${triageFilter === 'all' ? 'bg-brand-navy text-white' : 'text-brand-navy/60 hover:text-brand-navy'}`}
                    >
                      All ({deployments.length})
                    </button>
                    <button
                      onClick={() => setTriageFilter('paid_vas')}
                      className={`px-3 py-1 rounded-lg text-[13px] font-bold uppercase transition cursor-pointer ${triageFilter === 'paid_vas' ? 'bg-purple-600 text-white font-bold' : 'text-purple-700 bg-purple-50 hover:bg-purple-100'}`}
                    >
                      ✨ Paid Add-Ons ({deployments.filter(d => d.hasPaidVas).length})
                    </button>
                    <button
                      onClick={() => setTriageFilter('top_match')}
                      className={`px-3 py-1 rounded-lg text-[13px] font-bold uppercase transition cursor-pointer ${triageFilter === 'top_match' ? 'bg-emerald-600 text-white' : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100'}`}
                    >
                      🔥 Top Match (≥75%)
                    </button>
                    <button
                      onClick={() => setTriageFilter('standard')}
                      className={`px-3 py-1 rounded-lg text-[13px] font-bold uppercase transition cursor-pointer ${triageFilter === 'standard' ? 'bg-brand-gold text-brand-navy font-bold' : 'text-brand-gold bg-brand-gold/10 hover:bg-brand-gold/20'}`}
                    >
                      ⚡ Standard (50–74%)
                    </button>
                    <button
                      onClick={() => setTriageFilter('cold_pool')}
                      className={`px-3 py-1 rounded-lg text-[13px] font-bold uppercase transition cursor-pointer ${triageFilter === 'cold_pool' ? 'bg-slate-600 text-white' : 'text-slate-600 bg-slate-100 hover:bg-slate-200'}`}
                    >
                      ❄️ Cold Pool (&lt;50%)
                    </button>
                  </div>

                  <div className="text-[13px] text-brand-navy/50 flex items-center gap-1.5 font-mono">
                    <span>🛡️ AI Guardrails: OWASP LLM01 Active</span>
                  </div>
                </div>

                {deployments.length === 0 ? (
                  <p className="text-xs text-brand-navy/50 italic">No deployment record yet. Use "Deploy" to assign this candidate to an opening.</p>
                ) : (
                  <div className="space-y-4">
                    {deployments
                      .filter(d => triageFilter === 'all' || (triageFilter === 'paid_vas' ? d.hasPaidVas : d.matchTier === triageFilter))
                      .map(d => (
                      <div key={d.id} className="rounded-xl border border-brand-navy/10 bg-brand-navy/[0.04] p-5 space-y-4">
                        <div className="flex flex-wrap items-start justify-between gap-3 border-b border-brand-navy/[0.08] pb-3">
                          <div>
                            <div className="flex items-center gap-2">
                              <span className="font-bold text-brand-navy text-sm">{d.jobTitle || 'Job'}</span>
                              <span className="bg-brand-gold/10 text-brand-gold rounded px-1.5 py-0.5 text-xs font-bold capitalize">
                                {COLLAR_LABEL[d.collar || 'blue_collar']}
                              </span>
                              {d.hasPaidVas && (
                                <span className="bg-purple-100 text-purple-800 border border-purple-300 rounded px-1.5 py-0.5 text-xs font-bold flex items-center gap-1">
                                  <span>✨</span> {d.vasServiceTitle || 'Paid Add-On'}
                                </span>
                              )}
                              {d.matchScore !== undefined && (
                                <span className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase ${
                                  d.matchTier === 'top_match'
                                    ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                                    : d.matchTier === 'standard'
                                    ? 'bg-amber-100 text-amber-800 border border-amber-300'
                                    : 'bg-slate-100 text-slate-700 border border-slate-300'
                                }`}>
                                  {d.matchTier === 'top_match' ? '🔥 Top Match ' : ''}{d.matchScore}% Match Score
                                </span>
                              )}
                            </div>
                            <div className="text-[13px] text-brand-navy/50 mt-0.5">
                              {d.jobCountry || ''} · {d.jobSector || ''} {d.employer ? `· Employer: ${d.employer}` : ''} · <span className="font-mono">{d.id}</span>
                            </div>
                          </div>

                          <div className="flex items-center gap-2">
                            {d.profileCompletenessPct !== undefined && (
                              <span className="text-[13px] font-bold text-brand-navy/60 bg-white px-2 py-1 rounded border border-brand-navy/10">
                                📋 {d.profileCompletenessPct}% Profile
                              </span>
                            )}
                            <span className="text-[13px] font-bold text-emerald-700 bg-emerald-50 px-2 py-1 rounded border border-emerald-200">
                              🛡️ docScan: Verified Clean
                            </span>
                          </div>
                        </div>

                        {/* Match Strengths & Gaps */}
                        {(d.matchStrengths?.length || 0) > 0 && (
                          <div className="flex flex-wrap gap-1.5">
                            {d.matchStrengths!.map((st, i) => (
                              <span key={i} className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-[13px] px-2 py-0.5 rounded font-medium">
                                ✓ {st}
                              </span>
                            ))}
                            {(d.matchGaps || []).map((gp, i) => (
                              <span key={i} className="bg-amber-50 text-amber-700 border border-amber-200 text-[13px] px-2 py-0.5 rounded font-medium">
                                ⚠️ {gp}
                              </span>
                            ))}
                          </div>
                        )}

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                          <div className="flex justify-between items-center">
                            <span className="font-semibold text-brand-navy/70">Selection Status</span>
                            <select
                              value={d.selectionStatus}
                              onChange={(e) => updateDeploymentMutation.mutate({ id: d.id, payload: { selectionStatus: e.target.value } })}
                              className="border border-brand-navy/10 bg-white rounded px-2 py-1 text-sm font-semibold text-brand-navy outline-none cursor-pointer focus:border-brand-gold [&>option]:bg-white"
                            >
                              {['applied', 'shortlisted', 'selected', 'rejected'].map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="font-semibold text-brand-navy/70">Medical Fitness Test</span>
                            <select
                              value={d.medicalStatus}
                              onChange={(e) => updateDeploymentMutation.mutate({ id: d.id, payload: { medicalStatus: e.target.value } })}
                              className="border border-brand-navy/10 bg-white rounded px-2 py-1 text-sm font-semibold text-brand-navy outline-none cursor-pointer focus:border-brand-gold [&>option]:bg-white"
                            >
                              {['pending', 'fit', 'unfit', 'restricted'].map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="font-semibold text-brand-navy/70">Visa Endorsement &amp; Stamping</span>
                            <select
                              value={d.visaStatus}
                              onChange={(e) => updateDeploymentMutation.mutate({ id: d.id, payload: { visaStatus: e.target.value } })}
                              className="border border-brand-navy/10 bg-white rounded px-2 py-1 text-sm font-semibold text-brand-navy outline-none cursor-pointer focus:border-brand-gold [&>option]:bg-white"
                            >
                              {['pending', 'submitted', 'stamped', 'rejected'].map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="font-semibold text-brand-navy/70">Flight Ticket &amp; Deployment</span>
                            <select
                              value={d.flightStatus}
                              onChange={(e) => updateDeploymentMutation.mutate({ id: d.id, payload: { flightStatus: e.target.value } })}
                              className="border border-brand-navy/10 bg-white rounded px-2 py-1 text-sm font-semibold text-brand-navy outline-none cursor-pointer focus:border-brand-gold [&>option]:bg-white"
                            >
                              {['pending', 'booked', 'deployed'].map(s => <option key={s} value={s}>{s}</option>)}
                            </select>
                          </div>
                        </div>

                        {d.formJson && (
                          <details className="mt-3 rounded-lg border border-brand-navy/10 bg-white">
                            <summary className="cursor-pointer px-3 py-2 text-sm font-bold text-brand-navy">📋 Candidate Structured Profile &amp; Form Data</summary>
                            <div className="px-3 pb-3 grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-1.5 text-sm text-brand-navy/80">
                              <p><span className="text-brand-navy/40">Name:</span> {d.formJson.personal?.fullName || '—'}</p>
                              <p><span className="text-brand-navy/40">DOB:</span> {d.formJson.personal?.dob || '—'}</p>
                              <p><span className="text-brand-navy/40">Gender:</span> {d.formJson.personal?.gender || '—'}</p>
                              <p><span className="text-brand-navy/40">City:</span> {d.formJson.personal?.currentCity || '—'}</p>
                              <p><span className="text-brand-navy/40">Languages:</span> {(d.formJson.personal?.languages || []).join(', ') || '—'}</p>
                              <p><span className="text-brand-navy/40">Passport:</span> {d.formJson.passport?.hasPassport ? (d.formJson.passport.passportNumber || 'Yes') : 'No'}</p>
                              <p><span className="text-brand-navy/40">Experience:</span> {d.formJson.experience?.totalYears ?? 0} yrs</p>
                              <p><span className="text-brand-navy/40">Skills:</span> {(d.formJson.experience?.skills || []).join(', ') || '—'}</p>
                              <p><span className="text-brand-navy/40">Education:</span> {d.formJson.education?.highestQualification || '—'}</p>
                              <p><span className="text-brand-navy/40">Expected ₹/mo:</span> {d.formJson.salary?.expectedSalaryPaise ? Math.round(d.formJson.salary.expectedSalaryPaise / 100).toLocaleString('en-IN') : '—'}</p>
                              <p><span className="text-brand-navy/40">Notice:</span> {d.formJson.salary?.noticePeriodDays ?? 0} days</p>
                              <p><span className="text-brand-navy/40">Certs:</span> {(d.formJson.additional?.tradeCertifications || []).join(', ') || '—'}</p>
                              <p><span className="text-brand-navy/40">License:</span> {d.formJson.additional?.drivingLicense || '—'}</p>
                              <p><span className="text-brand-navy/40">Willing to travel:</span> {d.formJson.experience?.willingToTravel ? 'Yes' : 'No'}</p>
                              <p className="col-span-full"><span className="text-brand-navy/40">Available from:</span> {d.formJson.experience?.availableFrom || '—'}</p>
                            </div>
                          </details>
                        )}

                        {d.selectionStatus === 'rejected' && (
                          <div className="mt-3">
                            <label className="text-[13px] font-semibold text-brand-navy/50 block mb-1">Rejection reason</label>
                            <input
                              defaultValue={d.rejectionReason || ''}
                              onBlur={(e) => { const v = e.target.value.trim(); if (v) updateDeploymentMutation.mutate({ id: d.id, payload: { rejectionReason: v } }); }}
                              placeholder="Why was this candidate rejected?"
                              className="w-full border border-brand-navy/10 bg-white rounded px-2 py-1.5 text-sm text-brand-navy placeholder:text-brand-navy/40 outline-none focus:border-brand-gold"
                            />
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="text-xs text-brand-navy/50 italic py-12 text-center">Please select a candidate from the pool directory.</p>
            )}
          </div>
        </div>
      )}

      {showPlanModal && (
        <div className="fixed inset-0 bg-brand-navy/60 backdrop-blur-xs flex items-center justify-center z-50">
          <div className="rounded-2xl border border-brand-navy/10 bg-white p-6 w-[30rem] max-w-[95vw] max-h-[90vh] overflow-y-auto shadow-lg space-y-4 text-xs">
            <div className="flex justify-between items-center border-b border-brand-navy/10 pb-2">
              <h3 className="font-display font-extrabold text-brand-navy text-sm">{editPlanId ? 'Edit Membership Plan' : 'New Membership Plan'}</h3>
              <button onClick={() => setShowPlanModal(false)} className="text-brand-navy/40 hover:text-brand-navy text-lg cursor-pointer">✕</button>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-2">
                <label className="font-semibold text-brand-navy/40 block mb-1">Plan Key</label>
                <input value={planForm.key} onChange={(e) => setPlanForm({ ...planForm, key: e.target.value })} placeholder="e.g. exclusive-30" className="w-full rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-brand-navy outline-none focus:border-brand-gold" />
              </div>
              <div className="col-span-2">
                <label className="font-semibold text-brand-navy/40 block mb-1">Plan Name</label>
                <input value={planForm.name} onChange={(e) => setPlanForm({ ...planForm, name: e.target.value })} placeholder="e.g. Exclusive 30 Days" className="w-full rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-brand-navy outline-none focus:border-brand-gold" />
              </div>
              <div className="col-span-2">
                <label className="font-semibold text-brand-navy/40 block mb-1">Description</label>
                <input value={planForm.description} onChange={(e) => setPlanForm({ ...planForm, description: e.target.value })} className="w-full rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-brand-navy outline-none focus:border-brand-gold" />
              </div>
              <div>
                <label className="font-semibold text-brand-navy/40 block mb-1">Price (₹)</label>
                <input type="number" min={0} value={planForm.pricePaise} onChange={(e) => setPlanForm({ ...planForm, pricePaise: e.target.value })} className="w-full rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-brand-navy outline-none focus:border-brand-gold" />
              </div>
              <div>
                <label className="font-semibold text-brand-navy/40 block mb-1">Duration (days)</label>
                <input type="number" min={1} value={planForm.durationDays} onChange={(e) => setPlanForm({ ...planForm, durationDays: Number(e.target.value) })} className="w-full rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-brand-navy outline-none focus:border-brand-gold" />
              </div>
              <div>
                <label className="font-semibold text-brand-navy/40 block mb-1">Tier</label>
                <select value={planForm.tier} onChange={(e) => setPlanForm({ ...planForm, tier: e.target.value })} className="w-full rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-brand-navy outline-none focus:border-brand-gold cursor-pointer [&>option]:bg-white">
                  <option value="basic">Basic</option>
                  <option value="pro">Pro</option>
                  <option value="premium">Premium</option>
                </select>
              </div>
              <div>
                <label className="font-semibold text-brand-navy/40 block mb-1">Sort Order</label>
                <input type="number" value={planForm.sortOrder} onChange={(e) => setPlanForm({ ...planForm, sortOrder: Number(e.target.value) })} className="w-full rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-brand-navy outline-none focus:border-brand-gold" />
              </div>
              <div className="col-span-2">
                <label className="font-semibold text-brand-navy/40 block mb-1">Perks (comma separated)</label>
                <input value={planForm.perks} onChange={(e) => setPlanForm({ ...planForm, perks: e.target.value })} placeholder="Secret job offers, Direct apply, Priority shortlisting" className="w-full rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-brand-navy outline-none focus:border-brand-gold" />
              </div>
              <label className="flex items-center gap-2 cursor-pointer text-brand-navy/70 font-semibold col-span-2">
                <input type="checkbox" checked={planForm.active} onChange={(e) => setPlanForm({ ...planForm, active: e.target.checked })} className="rounded border-brand-navy/20 accent-brand-gold" /> Active (visible on client paywall)
              </label>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowPlanModal(false)} className="flex-1 border border-brand-navy/15 bg-brand-navy/[0.04] hover:border-brand-gold/50 py-2 rounded-lg font-bold text-brand-navy cursor-pointer transition-all">Cancel</button>
              <button
                disabled={!planForm.key || !planForm.name || !planForm.pricePaise}
                onClick={() => savePlanMutation.mutate({ key: planForm.key, name: planForm.name, description: planForm.description, pricePaise: Math.round(parseFloat(planForm.pricePaise) * 100), durationDays: planForm.durationDays, tier: planForm.tier, perks: planForm.perks.split(',').map((x) => x.trim()).filter(Boolean), active: planForm.active, sortOrder: planForm.sortOrder })}
                className="flex-1 bg-brand-gold hover:bg-brand-gold/90 text-brand-navy py-2 rounded-lg font-bold cursor-pointer transition-all disabled:opacity-50"
              >
                {editPlanId ? 'Save Changes' : 'Create Plan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Job Detail + Lifecycle Drawer */}
      {previewJob && (
        <>
          <div className="fixed inset-0 bg-brand-navy/40 z-40" onClick={() => setPreviewJob(null)} />
          <aside className="fixed top-0 right-0 h-full w-[30rem] max-w-[95vw] bg-white shadow-2xl z-50 overflow-y-auto p-6 space-y-5 border-l border-brand-navy/10 animate-in slide-in-from-right duration-300">
            <div className="flex justify-between items-start border-b border-brand-navy/10 pb-4">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-brand-gold">Job Posting</p>
                <h3 className="font-display font-extrabold text-lg text-brand-navy mt-1">{previewJob.title}</h3>
                <p className="text-sm text-brand-navy/50">{previewJob.country} · {previewJob.sector}</p>
              </div>
              <button onClick={() => setPreviewJob(null)} className="text-brand-navy/50 hover:text-brand-navy text-xl cursor-pointer">✕</button>
            </div>

            <div className="flex flex-wrap gap-1.5">
              <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider ${
                previewJob.status === 'open' ? 'bg-emerald-50 text-emerald-700' :
                previewJob.status === 'paused' ? 'bg-amber-50 text-amber-700' :
                previewJob.status === 'filled' ? 'bg-sky-50 text-sky-700' :
                previewJob.status === 'closed' ? 'bg-rose-50 text-rose-700' :
                previewJob.status === 'archived' ? 'bg-brand-navy/[0.06] text-brand-navy/40' : 'bg-brand-navy/[0.06] text-brand-navy/40'
              }`}>{previewJob.status || 'open'}</span>
              <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-brand-navy/[0.06] text-brand-navy/70">{previewJob.tier}</span>
              <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-brand-gold/10 text-brand-gold">{previewJob.collar?.replace('_', ' ')}</span>
              {previewJob.featured && <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-bold uppercase tracking-wider bg-brand-gold/15 text-brand-gold">Featured</span>}
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div className="rounded-lg bg-brand-navy/[0.03] border border-brand-navy/10 p-3">
                <p className="text-xs font-bold uppercase tracking-wider text-brand-navy/40">Employer</p>
                <p className="font-bold text-brand-navy mt-0.5">{previewJob.employer || '—'}</p>
              </div>
              <div className="rounded-lg bg-brand-navy/[0.03] border border-brand-navy/10 p-3">
                <p className="text-xs font-bold uppercase tracking-wider text-brand-navy/40">Salary</p>
                <p className="font-bold text-brand-gold mt-0.5">{previewJob.salaryText}</p>
              </div>
              <div className="rounded-lg bg-brand-navy/[0.03] border border-brand-navy/10 p-3">
                <p className="text-xs font-bold uppercase tracking-wider text-brand-navy/40">Vacancies</p>
                <p className="font-bold text-brand-navy mt-0.5">{previewJob.vacancies || 1}</p>
              </div>
              <div className="rounded-lg bg-brand-navy/[0.03] border border-brand-navy/10 p-3">
                <p className="text-xs font-bold uppercase tracking-wider text-brand-navy/40">Applicants</p>
                <p className="font-bold text-brand-navy mt-0.5">{typeof previewJob.applicantCount === 'number' ? previewJob.applicantCount : '—'}</p>
              </div>
              <div className="rounded-lg bg-brand-navy/[0.03] border border-brand-navy/10 p-3">
                <p className="text-xs font-bold uppercase tracking-wider text-brand-navy/40">Experience</p>
                <p className="font-bold text-brand-navy mt-0.5">{previewJob.experienceYearsMin || 0}+ yrs</p>
              </div>
              <div className="rounded-lg bg-brand-navy/[0.03] border border-brand-navy/10 p-3">
                <p className="text-xs font-bold uppercase tracking-wider text-brand-navy/40">Deadline</p>
                <p className="font-bold text-brand-navy mt-0.5">{previewJob.deadline ? new Date(previewJob.deadline * 1000).toLocaleDateString() : '—'}</p>
              </div>
            </div>

            {previewJob.description && (
              <div>
                <h4 className="text-[13px] font-bold uppercase tracking-wider text-brand-navy/40 mb-1.5">Description</h4>
                <p className="text-xs text-brand-navy/70 leading-relaxed">{previewJob.description}</p>
              </div>
            )}

            {(previewJob.benefits?.length || 0) > 0 && (
              <div>
                <h4 className="text-[13px] font-bold uppercase tracking-wider text-brand-navy/40 mb-1.5">Benefits</h4>
                <div className="flex flex-wrap gap-1.5">
                  {previewJob.benefits!.map((b, i) => <span key={i} className="bg-emerald-50 text-emerald-700 border border-emerald-100 rounded px-2 py-0.5 text-[13px]">{b}</span>)}
                </div>
              </div>
            )}

            {(previewJob.requirements?.length || 0) > 0 && (
              <div>
                <h4 className="text-[13px] font-bold uppercase tracking-wider text-brand-navy/40 mb-1.5">Requirements</h4>
                <div className="flex flex-wrap gap-1.5">
                  {previewJob.requirements!.map((r, i) => <span key={i} className="bg-brand-navy/[0.06] text-brand-navy/70 border border-brand-navy/10 rounded px-2 py-0.5 text-[13px]">{r}</span>)}
                </div>
              </div>
            )}

            <div className="border-t border-brand-navy/10 pt-4">
              <h4 className="text-[13px] font-bold uppercase tracking-wider text-brand-navy/40 mb-2">Lifecycle Actions</h4>
              <div className="flex flex-wrap gap-2">
                {previewJob.status !== 'open' && (
                  <button onClick={() => setJobStatus(previewJob.id, 'open')} className="bg-emerald-600 hover:bg-emerald-700 text-white text-[13px] font-bold px-3 py-1.5 rounded-lg transition cursor-pointer">Open</button>
                )}
                {previewJob.status !== 'paused' && previewJob.status !== 'archived' && (
                  <button onClick={() => setJobStatus(previewJob.id, 'paused')} className="bg-amber-500 hover:bg-amber-600 text-white text-[13px] font-bold px-3 py-1.5 rounded-lg transition cursor-pointer">Pause</button>
                )}
                {previewJob.status !== 'filled' && previewJob.status !== 'archived' && (
                  <button onClick={() => setJobStatus(previewJob.id, 'filled')} className="bg-sky-600 hover:bg-sky-700 text-white text-[13px] font-bold px-3 py-1.5 rounded-lg transition cursor-pointer">Mark Filled</button>
                )}
                {previewJob.status !== 'closed' && previewJob.status !== 'archived' && (
                  <button onClick={() => setJobStatus(previewJob.id, 'closed')} className="bg-rose-600 hover:bg-rose-700 text-white text-[13px] font-bold px-3 py-1.5 rounded-lg transition cursor-pointer">Close</button>
                )}
                {previewJob.status !== 'archived' && (
                  <button onClick={() => { if (confirm('Archive this job posting?')) archiveJobMutation.mutate(previewJob.id); }} className="bg-brand-navy/[0.06] hover:bg-brand-navy/[0.1] text-brand-navy text-[13px] font-bold px-3 py-1.5 rounded-lg transition cursor-pointer">Archive</button>
                )}
                <button onClick={() => { handleEditJobClick(previewJob); }} className="bg-brand-gold hover:bg-brand-gold/90 text-brand-navy text-[13px] font-bold px-3 py-1.5 rounded-lg transition cursor-pointer">✎ Edit</button>
              </div>
            </div>
          </aside>
        </>
      )}

      {showAddJob && (
        <div className="fixed inset-0 bg-brand-navy/60 backdrop-blur-xs flex items-center justify-center z-50">
          <div className="rounded-2xl border border-brand-navy/10 bg-white p-6 w-[44rem] max-w-[95vw] max-h-[90vh] overflow-y-auto shadow-lg space-y-4 text-xs">
            <div className="flex justify-between items-center border-b border-brand-navy/10 pb-2">
              <h3 className="font-display font-extrabold text-brand-navy text-sm">{editJobId ? 'Edit Job Posting' : 'Add Job Posting'}</h3>
              <button onClick={() => setShowAddJob(false)} className="text-brand-navy/40 hover:text-brand-navy text-lg cursor-pointer">✕</button>
            </div>
            <div className="grid grid-cols-2 gap-3">              <div className="col-span-2">
                <label className="font-semibold text-brand-navy/40 block mb-1">Job Title</label>
                <input value={jobForm.title} onChange={(e) => setJobForm({ ...jobForm, title: e.target.value })} className="w-full rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-brand-navy outline-none focus:border-brand-gold" />
              </div>
              <div>
                <label className="font-semibold text-brand-navy/40 block mb-1">Country</label>
                <input value={jobForm.country} onChange={(e) => setJobForm({ ...jobForm, country: e.target.value })} className="w-full rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-brand-navy outline-none focus:border-brand-gold" />
              </div>
              <div>
                <label className="font-semibold text-brand-navy/40 block mb-1">Sector</label>
                <input value={jobForm.sector} onChange={(e) => setJobForm({ ...jobForm, sector: e.target.value })} className="w-full rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-brand-navy outline-none focus:border-brand-gold" />
              </div>
              <div className="col-span-2">
                <label className="font-semibold text-brand-navy/40 block mb-1">Salary Text</label>
                <input value={jobForm.salaryText} onChange={(e) => setJobForm({ ...jobForm, salaryText: e.target.value })} placeholder="e.g. QR 2,500 (~₹57,000)" className="w-full rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-brand-navy placeholder:text-brand-navy/40 outline-none focus:border-brand-gold" />
              </div>
              <div>
                <label className="font-semibold text-brand-navy/40 block mb-1">Collar</label>
                <select value={jobForm.collar} onChange={(e) => setJobForm({ ...jobForm, collar: e.target.value as any })} className="w-full rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-brand-navy outline-none focus:border-brand-gold cursor-pointer [&>option]:bg-white">
                  <option value="blue_collar">Blue Collar</option>
                  <option value="white_collar">White Collar</option>
                </select>
              </div>
              <div>
                <label className="font-semibold text-brand-navy/40 block mb-1">Tier</label>
                <select value={jobForm.tier} onChange={(e) => setJobForm({ ...jobForm, tier: e.target.value as any })} className="w-full rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-brand-navy outline-none focus:border-brand-gold cursor-pointer [&>option]:bg-white">
                  <option value="public">Public</option>
                  <option value="secret">Secret</option>
                </select>
              </div>
              <div className="col-span-2">
                <label className="font-semibold text-brand-navy/40 block mb-1">Employer (B2B agency / MEA employer)</label>
                <input value={jobForm.employer} onChange={(e) => setJobForm({ ...jobForm, employer: e.target.value })} placeholder="e.g. Al Marwan Contracting LLC" className="w-full rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-brand-navy placeholder:text-brand-navy/40 outline-none focus:border-brand-gold" />
              </div>
              <div className="col-span-2">
                <label className="font-semibold text-brand-navy/40 block mb-1">Employer Requirement Ref</label>
                <input value={jobForm.employerReference} onChange={(e) => setJobForm({ ...jobForm, employerReference: e.target.value })} placeholder="Their internal demand number (optional)" className="w-full rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-brand-navy placeholder:text-brand-navy/40 outline-none focus:border-brand-gold" />
              </div>
              <div className="col-span-2">
                <label className="font-semibold text-brand-navy/40 block mb-1">Description</label>
                <textarea value={jobForm.description} onChange={(e) => setJobForm({ ...jobForm, description: e.target.value })} rows={2} placeholder="Role summary, duties, working hours…" className="w-full rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-brand-navy placeholder:text-brand-navy/40 outline-none focus:border-brand-gold" />
              </div>
              <div>
                <label className="font-semibold text-brand-navy/40 block mb-1">Salary Min (₹/mo)</label>
                <input type="number" value={jobForm.salaryMinPaise} onChange={(e) => setJobForm({ ...jobForm, salaryMinPaise: e.target.value })} className="w-full rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-brand-navy outline-none focus:border-brand-gold" />
              </div>
              <div>
                <label className="font-semibold text-brand-navy/40 block mb-1">Salary Max (₹/mo)</label>
                <input type="number" value={jobForm.salaryMaxPaise} onChange={(e) => setJobForm({ ...jobForm, salaryMaxPaise: e.target.value })} className="w-full rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-brand-navy outline-none focus:border-brand-gold" />
              </div>
              <div>
                <label className="font-semibold text-brand-navy/40 block mb-1">Currency</label>
                <select value={jobForm.currency} onChange={(e) => setJobForm({ ...jobForm, currency: e.target.value })} className="w-full rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-brand-navy outline-none focus:border-brand-gold cursor-pointer [&>option]:bg-white">
                  {['AED', 'SAR', 'QAR', 'OMR', 'KWD', 'BHD', 'USD', 'INR'].map(c => <option key={c} value={c}>{c}</option>)}
                </select>
              </div>
              <div>
                <label className="font-semibold text-brand-navy/40 block mb-1">Vacancies</label>
                <input type="number" min={1} value={jobForm.vacancies} onChange={(e) => setJobForm({ ...jobForm, vacancies: Number(e.target.value) })} className="w-full rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-brand-navy outline-none focus:border-brand-gold" />
              </div>
              <div>
                <label className="font-semibold text-brand-navy/40 block mb-1">Trade Category</label>
                <input value={jobForm.tradeCategory} onChange={(e) => setJobForm({ ...jobForm, tradeCategory: e.target.value })} placeholder="e.g. Construction / Hospitality" className="w-full rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-brand-navy placeholder:text-brand-navy/40 outline-none focus:border-brand-gold" />
              </div>
              <div>
                <label className="font-semibold text-brand-navy/40 block mb-1">Min Experience (yrs)</label>
                <input type="number" min={0} value={jobForm.experienceYearsMin} onChange={(e) => setJobForm({ ...jobForm, experienceYearsMin: Number(e.target.value) })} className="w-full rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-brand-navy outline-none focus:border-brand-gold" />
              </div>
              <div className="col-span-2">
                <label className="font-semibold text-brand-navy/40 block mb-1">Benefits (comma separated)</label>
                <input value={jobForm.benefits} onChange={(e) => setJobForm({ ...jobForm, benefits: e.target.value })} placeholder="Accommodation, Food, Medical insurance, Air ticket" className="w-full rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-brand-navy placeholder:text-brand-navy/40 outline-none focus:border-brand-gold" />
              </div>
              <div className="col-span-2">
                <label className="font-semibold text-brand-navy/40 block mb-1">Requirements (comma separated)</label>
                <input value={jobForm.requirements} onChange={(e) => setJobForm({ ...jobForm, requirements: e.target.value })} placeholder="ITI certificate, 2+ yrs GCC experience, English" className="w-full rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-brand-navy placeholder:text-brand-navy/40 outline-none focus:border-brand-gold" />
              </div>
              <div>
                <label className="font-semibold text-brand-navy/40 block mb-1">Application Deadline</label>
                <input type="date" value={jobForm.deadline} onChange={(e) => setJobForm({ ...jobForm, deadline: e.target.value })} className="w-full rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-brand-navy outline-none focus:border-brand-gold" />
              </div>
              <div className="flex items-center gap-4 col-span-2 pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-brand-navy/70 font-semibold text-xs">
                  <input type="checkbox" checked={jobForm.visaProvided} onChange={(e) => setJobForm({ ...jobForm, visaProvided: e.target.checked })} className="rounded border-brand-navy/20 accent-brand-gold" /> Visa provided
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-brand-navy/70 font-semibold text-xs">
                  <input type="checkbox" checked={jobForm.medicalRequired} onChange={(e) => setJobForm({ ...jobForm, medicalRequired: e.target.checked })} className="rounded border-brand-navy/20 accent-brand-gold" /> GAMCA medical required
                </label>
                <label className="flex items-center gap-2 cursor-pointer text-brand-navy/70 font-semibold text-xs">
                  <input type="checkbox" checked={jobForm.featured} onChange={(e) => setJobForm({ ...jobForm, featured: e.target.checked })} className="rounded border-brand-navy/20 accent-brand-gold" /> Featured
                </label>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowAddJob(false)} className="flex-1 border border-brand-navy/15 bg-brand-navy/[0.04] hover:border-brand-gold/50 py-2 rounded-lg font-bold text-brand-navy cursor-pointer transition-all">Cancel</button>
              <button
                disabled={!jobForm.title || !jobForm.country || !jobForm.sector || !jobForm.salaryText}
                onClick={submitJob}
                className="flex-1 bg-brand-gold hover:bg-brand-gold/90 text-brand-navy py-2 rounded-lg font-bold cursor-pointer transition-all disabled:opacity-50"
              >
{editJobId ? 'Save Changes' : 'Create Posting'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showDeploy && (
        <div className="fixed inset-0 bg-brand-navy/60 backdrop-blur-xs flex items-center justify-center z-50">
          <div className="rounded-2xl border border-brand-navy/10 bg-white p-6 w-[28rem] shadow-lg space-y-4 text-xs">
            <div className="flex justify-between items-center border-b border-brand-navy/10 pb-2">
              <h3 className="font-display font-extrabold text-brand-navy text-sm">Initiate Deployment</h3>
              <button onClick={() => setShowDeploy(false)} className="text-brand-navy/40 hover:text-brand-navy text-lg cursor-pointer">✕</button>
            </div>
            <div className="space-y-3">
              <div>
                <label className="font-semibold text-brand-navy/40 block mb-1">Candidate</label>
                <select
                  value={selectedCandidate?.id || ''}
                  onChange={(e) => setSelectedClientId(e.target.value)}
                  className="w-full rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-brand-navy outline-none focus:border-brand-gold cursor-pointer [&>option]:bg-white"
                >
                  {candidates.map(c => <option key={c.id} value={c.id}>{c.name} ({c.id})</option>)}
                </select>
              </div>
              <div>
                <label className="font-semibold text-brand-navy/40 block mb-1">Opening</label>
                <select value={deployJobId} onChange={(e) => setDeployJobId(e.target.value)} className="w-full rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-brand-navy outline-none focus:border-brand-gold cursor-pointer [&>option]:bg-white">
                  <option value="">-- Choose opening --</option>
                  {jobs.filter(j => j.status !== 'filled').map(j => <option key={j.id} value={j.id}>{j.title} · {j.country}</option>)}
                </select>
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button onClick={() => setShowDeploy(false)} className="flex-1 border border-brand-navy/15 bg-brand-navy/[0.04] hover:border-brand-gold/50 py-2 rounded-lg font-bold text-brand-navy cursor-pointer transition-all">Cancel</button>
              <button
                disabled={!deployJobId || !selectedCandidate?.id}
                onClick={() => createDeploymentMutation.mutate({ clientId: selectedCandidate!.id, jobId: deployJobId })}
                className="flex-1 bg-brand-gold hover:bg-brand-gold/90 text-brand-navy py-2 rounded-lg font-bold cursor-pointer transition-all disabled:opacity-50"
              >
                Start Deployment
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}