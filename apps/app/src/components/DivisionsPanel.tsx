import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { makeContext, staggerReveal, whenFontsReady } from '../lib/motion';

// ============ DIVISION AVAILABILITY (superadmin kill-switch) ============
// Reads/persists the app_settings `divisions_enabled` map via the admin
// endpoints (owner-only; every write is audited server-side as DIVISION_TOGGLED).
// Extracted from AdminConsole — standalone so it can live in the workspace
// sidebar (Security & Program → Division Availability).


interface DivisionsState {
  enabled: Record<string, boolean>;
  list: string[];
  updatedAt?: number;
}

const AVAILABILITY_DIVISIONS = [
  { key: 'study-abroad', label: 'Study Abroad', desc: 'Overseas admissions, timelines, and document processing.', icon: '🎓' },
  { key: 'visa', label: 'Visa Processing', desc: 'Embassy slot bookings, visa products, and mock interviews.', icon: '✈️' },
  { key: 'umrah', label: 'Umrah Packages', desc: 'Umrah group departures, package checklists, and hotel booking.', icon: '🕋' },
  { key: 'attestation', label: 'Document Attestation', desc: 'Certificate legalization workflows and India Post bookings.', icon: '📜' },
  { key: 'manpower', label: 'Manpower Recruitment', desc: 'Job postings, candidate medicals, and deployment.', icon: '👷' },
];

// Mirrors the backend seed — used to build a complete map even if the GET
// response is missing a key (backend upserts the full map on POST).
const AVAILABILITY_DEFAULTS: Record<string, boolean> = {
  'study-abroad': true,
  visa: false,
  umrah: false,
  attestation: false,
  manpower: false,
};

export default function DivisionsPanel() {
  const queryClient = useQueryClient();
  const rootRef = useRef<HTMLDivElement>(null);
  // Self-contained toast (sidebar route has no parent console to toast through).
  const [toast, setToast] = useState<{ show: boolean; msg: string; type: 'success' | 'error' | 'warning' }>({ show: false, msg: '', type: 'success' });
  const showToast = (msg: string, type: 'success' | 'error' | 'warning' = 'success') => {
    setToast({ show: true, msg, type });
    window.setTimeout(() => setToast((t) => ({ ...t, show: false })), 4000);
  };

  const { data, isLoading, isError } = useQuery<DivisionsState>({
    queryKey: ['adminDivisions'],
    queryFn: async () => {
      const res = await fetch('/api/admin/divisions', { credentials: 'include',  headers: { } });
      if (!res.ok) {
        throw new Error(await res.text() || 'Failed to load division availability');
      }
      return res.json();
    }
  });

  const saveMutation = useMutation({
    mutationFn: async (next: Record<string, boolean>) => {
      const res = await fetch('/api/admin/divisions', { credentials: 'include', 
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          },
        body: JSON.stringify({ enabled: next })
      });
      if (!res.ok) {
        throw new Error(await res.text() || 'Failed to update division availability');
      }
      return res.json();
    },
    onMutate: async (next) => {
      await queryClient.cancelQueries({ queryKey: ['adminDivisions'] });
      const prev = queryClient.getQueryData<DivisionsState>(['adminDivisions']);
      queryClient.setQueryData<DivisionsState>(['adminDivisions'], (old) => (old ? { ...old, enabled: next } : old));
      return { prev };
    },
    onSuccess: (saved) => {
      queryClient.setQueryData<DivisionsState>(['adminDivisions'], saved);
      showToast('Division availability updated — change is logged.', 'success');
    },
    onError: (err: any, _vars, ctx) => {
      if (ctx?.prev) queryClient.setQueryData<DivisionsState>(['adminDivisions'], ctx.prev);
      showToast(`Division update failed: ${(err as Error).message}`, 'error');
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['adminDivisions'] });
    }
  });

  // GSAP entrance: staggered rise of the toggle cards (respects reduced motion).
  useEffect(() => {
    const ctx = makeContext(rootRef.current);
    ctx.add(() => {
      whenFontsReady().then(() => staggerReveal('.division-toggle', { y: 24, duration: 0.7, stagger: 0.08 }));
    });
    return () => ctx.revert();
  }, []);

  // Complete map: seeded defaults until the server payload lands.
  const currentMap: Record<string, boolean> = { ...AVAILABILITY_DEFAULTS, ...(data?.enabled ?? {}) };
  const locked = isLoading || saveMutation.isPending;

  const handleToggle = (key: string) => {
    if (!data || locked) return;
    saveMutation.mutate({ ...currentMap, [key]: !currentMap[key] });
  };

  return (
    <div ref={rootRef} className="space-y-6">
      {toast.show && (
        <div className={`fixed bottom-6 right-6 z-[60] rounded-xl border-l-4 bg-brand-navy px-4 py-3 text-xs font-semibold text-white shadow-xl ${
          toast.type === 'success' ? 'border-emerald-400' : toast.type === 'error' ? 'border-rose-400' : 'border-amber-400'
        }`}>
          {toast.msg}
        </div>
      )}
      <div className="division-toggle flex items-center gap-2">
        <span className="gold-dot" />
        <h3 className="font-display font-semibold text-brand-navy text-base">Division Availability</h3>
        {data?.updatedAt ? (
          <span className="text-[10px] text-slate-400 ml-auto">
            Last updated {new Date(data.updatedAt * 1000).toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </span>
        ) : null}
      </div>
      <p className="text-[11px] text-brand-navy/50 -mt-3">
        Business-operations kill switch — switched-off divisions stop intake everywhere (public site, client portal, partner catalog, lead forms). Existing data is untouched.
      </p>

      {isLoading ? (
        <div className="division-toggle p-12 text-center text-xs text-slate-400">Loading division availability...</div>
      ) : isError ? (
        <div className="division-toggle p-12 text-center text-xs text-rose-600 bg-rose-50 border border-rose-200/50 rounded-lg">
          ⚠ Error – Failed to load division availability. Please verify DB status and Admin session permissions.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-5">
          {AVAILABILITY_DIVISIONS.map((d) => {
            const isOn = !!currentMap[d.key];
            return (
              <div
                key={d.key}
                className={`division-toggle clay-card p-6 flex flex-col justify-between gap-5 ${locked ? 'opacity-70' : ''}`}
              >
                <div className="flex items-start gap-3.5">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-navy/[0.05] text-xl border border-brand-navy/10">
                    {d.icon}
                  </span>
                  <div className="min-w-0">
                    <h4 className="font-display font-bold text-brand-navy text-sm">{d.label}</h4>
                    <p className="text-[11px] text-brand-navy/50 mt-1 leading-relaxed">{d.desc}</p>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-1">
                  <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider border ${
                    isOn
                      ? 'bg-brand-gold/10 text-brand-gold border-brand-gold/25'
                      : 'bg-brand-navy/[0.05] text-brand-navy/45 border-brand-navy/10'
                  }`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${isOn ? 'bg-brand-gold' : 'bg-brand-navy/30'}`} />
                    {isOn ? 'Live' : 'Off'}
                  </span>

                  <button
                    type="button"
                    role="switch"
                    aria-checked={isOn}
                    aria-label={`Toggle ${d.label}`}
                    onClick={() => handleToggle(d.key)}
                    disabled={locked}
                    className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-200 cursor-pointer disabled:cursor-wait ${
                      isOn ? 'bg-brand-gold hover:bg-brand-gold-hover' : 'bg-brand-navy/15 border border-brand-navy/15 hover:bg-brand-navy/20'
                    }`}
                  >
                    <span className={`absolute top-0.5 left-0.5 h-5 w-5 rounded-full bg-white shadow-md transition-transform duration-200 ${
                      isOn ? 'translate-x-5' : 'translate-x-0'
                    }`} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="division-toggle flex items-start gap-2.5 rounded-xl border border-brand-navy/10 bg-brand-navy/[0.03] px-4 py-3">
        <span className="text-brand-gold text-sm leading-none mt-0.5">◈</span>
        <p className="text-[11px] text-brand-navy/55 leading-relaxed">
          Division availability controls intake everywhere (public site, client portal, partner catalog, lead forms) — changes are audited.
        </p>
      </div>
    </div>
  );
}