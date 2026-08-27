import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface DivisionMeta {
  key: string;
  name: string;
  tagline: string;
  icon: string;
  accent: string;
  description: string;
  portalRoute: string;
}

const DIVISION_CONFIG: DivisionMeta[] = [
  {
    key: 'study-abroad',
    name: 'Study Abroad Division',
    tagline: 'University Admissions, Eligibility Matching & Scholarship Assistance',
    icon: '🎓',
    accent: 'from-blue-600/20 to-indigo-600/20 text-blue-400 border-blue-500/30',
    description: 'Enables live student intake, course shortlisting, application snapshot tracking, and offer management.',
    portalRoute: '/study-abroad',
  },
  {
    key: 'visa',
    name: 'Worldwide Visa Services',
    tagline: 'Consular Processing, Document Stack Audits & Appointment Expediting',
    icon: '🛂',
    accent: 'from-amber-600/20 to-yellow-600/20 text-amber-400 border-amber-500/30',
    description: 'Controls public visa inquiry intake, consular checklist tracking, and priority appointment booking.',
    portalRoute: '/visa',
  },
  {
    key: 'umrah',
    name: 'Tours & Travels Division',
    tagline: 'World Holidays, 5-Star Umrah Pilgrimages & Bespoke Group Departures',
    icon: '🧳',
    accent: 'from-emerald-600/20 to-teal-600/20 text-emerald-400 border-emerald-500/30',
    description: 'Gates public tour packages, departure dates, seat hold reservations, and passenger manifests.',
    portalRoute: '/umrah',
  },
  {
    key: 'attestation',
    name: 'MEA & Embassy Attestation',
    tagline: 'Apostille Chains, Chamber of Commerce & Insured Door-to-Door Courier',
    icon: '📜',
    accent: 'from-purple-600/20 to-violet-600/20 text-purple-400 border-purple-500/30',
    description: 'Manages document attestation intake, indicative rate card calculations, and step-by-step chain verification.',
    portalRoute: '/attestation',
  },
  {
    key: 'manpower',
    name: 'Manpower Recruitment & Demands',
    tagline: 'Verified Gulf/Europe Employer Demands & ILO C181 Free Candidate Intake',
    icon: '💼',
    accent: 'from-amber-500/20 to-orange-600/20 text-brand-gold border-brand-gold/30',
    description: 'Controls overseas job demand board, candidate application triage, Turnstile anti-spam quotas, and career VAS orders.',
    portalRoute: '/recruitment',
  },
];

export default function DivisionControlsTab() {
  const queryClient = useQueryClient();
  const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

  const showToast = (msg: string, type: 'success' | 'error') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  // 1. Fetch live divisions state
  const { data, isLoading, isError } = useQuery<{
    enabled: Record<string, boolean>;
    list: string[];
    updatedAt: number | null;
  }>({
    queryKey: ['adminDivisions'],
    queryFn: async () => {
      const res = await fetch('/api/admin/divisions');
      if (!res.ok) throw new Error(await res.text() || 'Failed to fetch division states');
      return res.json();
    },
  });

  // 2. Mutation to toggle division state
  const toggleMutation = useMutation({
    mutationFn: async ({ key, nextState }: { key: string; nextState: boolean }) => {
      const res = await fetch('/api/admin/divisions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: { [key]: nextState } }),
      });
      if (!res.ok) throw new Error(await res.text() || 'Failed to update division status');
      return res.json();
    },
    onSuccess: (_result, variables) => {
      queryClient.invalidateQueries({ queryKey: ['adminDivisions'] });
      queryClient.invalidateQueries({ queryKey: ['publicDivisions'] });
      const meta = DIVISION_CONFIG.find((d) => d.key === variables.key);
      const name = meta?.name || variables.key;
      showToast(
        `${name} is now ${variables.nextState ? 'LIVE 🟢' : 'CLOSED / MAINTENANCE 🔴'}. Audit record created.`,
        'success'
      );
    },
    onError: (err: any) => {
      showToast(`Update Failed: ${err.message}`, 'error');
    },
  });

  const enabledMap = data?.enabled || {
    'study-abroad': true,
    visa: false,
    umrah: false,
    attestation: false,
    manpower: false,
  };

  const activeCount = Object.values(enabledMap).filter(Boolean).length;

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`rounded-xl border px-4 py-3 text-xs font-semibold shadow-lg transition-all flex items-center justify-between ${
            toast.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : 'bg-rose-50 border-rose-200 text-rose-800'
          }`}
        >
          <span>{toast.msg}</span>
          <button onClick={() => setToast(null)} className="cursor-pointer font-bold text-sm ml-4">
            ×
          </button>
        </div>
      )}

      {/* Header Summary Banner */}
      <div className="bg-gradient-to-r from-brand-navy via-brand-navy-900 to-[#06182c] rounded-2xl p-6 border border-white/10 text-white shadow-xl flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-brand-gold animate-pulse" />
            <span className="text-[13px] font-bold uppercase tracking-widest text-brand-gold">
              Master Availability Controls
            </span>
          </div>
          <h2 className="text-xl font-display font-black tracking-tight text-white mt-1">
            Division Go-Live & Kill-Switch Hub
          </h2>
          <p className="text-xs text-white/60 mt-1 max-w-2xl">
            Instantly toggle public operations, lead intake, client portal self-service, and partner catalog access for each division. Every change is cryptographically audited.
          </p>
        </div>

        <div className="flex items-center gap-4 bg-white/5 border border-white/10 rounded-xl px-5 py-3 backdrop-blur-sm">
          <div className="text-center">
            <div className="text-2xl font-display font-black text-brand-gold">{activeCount} / 5</div>
            <div className="text-[13px] font-bold uppercase tracking-wider text-white/60">Divisions Live</div>
          </div>
          <div className="h-8 w-px bg-white/15" />
          <div className="text-xs text-white/70">
            <div className="font-semibold text-white">Fail-Safe State</div>
            <div className="text-[13px] text-white/50">
              {data?.updatedAt ? `Last updated ${new Date(data.updatedAt * 1000).toLocaleDateString('en-IN')}` : 'Factory Defaults'}
            </div>
          </div>
        </div>
      </div>

      {/* Loading & Error States */}
      {isLoading && (
        <div className="p-12 text-center text-xs text-slate-400">Loading division state...</div>
      )}

      {isError && (
        <div className="p-6 text-xs text-rose-600 bg-rose-50 border border-rose-200 rounded-xl">
          Failed to load division controls. Please verify super-admin session.
        </div>
      )}

      {/* Divisions Grid */}
      {!isLoading && !isError && (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {DIVISION_CONFIG.map((div) => {
            const isLive = enabledMap[div.key] === true;
            const isPending = toggleMutation.isPending && toggleMutation.variables?.key === div.key;

            return (
              <div
                key={div.key}
                className={`rounded-2xl border transition-all duration-300 bg-white p-6 shadow-md hover:shadow-xl flex flex-col justify-between ${
                  isLive ? 'border-emerald-500/30' : 'border-slate-200 opacity-90'
                }`}
              >
                <div>
                  {/* Top Status & Icon */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-navy/[0.04] border border-brand-navy/10 text-2xl shadow-xs">
                        {div.icon}
                      </div>
                      <div>
                        <h3 className="font-display text-sm font-bold text-brand-navy">{div.name}</h3>
                        <span className="font-mono text-[13px] text-slate-400">{div.key}</span>
                      </div>
                    </div>

                    <span
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[13px] font-bold uppercase tracking-wider ${
                        isLive
                          ? 'bg-emerald-500/15 text-emerald-700 border border-emerald-500/30'
                          : 'bg-slate-100 text-slate-500 border border-slate-200'
                      }`}
                    >
                      <span className={`h-1.5 w-1.5 rounded-full ${isLive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-400'}`} />
                      {isLive ? 'Live' : 'Closed'}
                    </span>
                  </div>

                  {/* Subtitle & Description */}
                  <p className="mt-3 text-xs font-semibold text-brand-navy/80">{div.tagline}</p>
                  <p className="mt-1.5 text-sm leading-relaxed text-slate-500">{div.description}</p>
                </div>

                {/* Bottom Toggle Action */}
                <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between gap-3">
                  <span className="text-sm font-medium text-slate-400">
                    Status: <strong className={isLive ? 'text-emerald-600' : 'text-slate-600'}>{isLive ? 'Active for Public & Clients' : 'Paused / Maintenance'}</strong>
                  </span>

                  <button
                    onClick={() => toggleMutation.mutate({ key: div.key, nextState: !isLive })}
                    disabled={isPending}
                    className={`cursor-pointer rounded-xl px-4 py-2 text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 active:scale-[0.98] disabled:opacity-50 ${
                      isLive
                        ? 'bg-rose-50 text-rose-700 hover:bg-rose-100 border border-rose-200'
                        : 'bg-gradient-to-r from-brand-gold to-amber-500 text-brand-navy hover:bg-brand-gold-hover hover:text-white border border-brand-gold/40'
                    }`}
                  >
                    {isPending ? (
                      <span>Updating...</span>
                    ) : isLive ? (
                      <span>🔴 Deactivate</span>
                    ) : (
                      <span>🟢 Go Live</span>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Operational Protocol Note */}
      <div className="rounded-xl border border-brand-navy/10 bg-brand-navy/[0.02] p-4 text-sm text-slate-500 leading-relaxed">
        <strong className="text-brand-navy">ℹ Operational Protocol:</strong> Deactivating a division switches its public inquiry routes to Coming Soon mode and restricts new client booking creation, while preserving all existing active client engagements, documents, and historical payments.
      </div>
    </div>
  );
}
