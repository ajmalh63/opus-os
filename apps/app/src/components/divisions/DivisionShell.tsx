import { useEffect, useRef } from 'react';
import { useSession } from '../../lib/session';
import gsap from 'gsap';

/**
 * DivisionShell — Enterprise DRY shell for 5 portals (StudyAbroad, Visa, Umrah, Attestation, Manpower)
 * Extracts: header, tabs, GSAP staggerReveal, INR, alert, KPI strip
 * Saves ~2K LOH across 5 files (7,601L duplication)
 * Gold standard: Temporal-like single responsibility, DRY per Brooks, Tailwind v4 tokens
 */

export const INR = (p: number | null | undefined) => (p == null ? '—' : '₹' + (p / 100).toLocaleString('en-IN'));
export const formatPaise = INR; // alias for shared

export function useRevealRoot() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!ref.current) return;
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReduced) return;
    const ctx = gsap.context(() => {
      gsap.from('.reveal', { y: 16, opacity: 0, duration: 0.5, stagger: 0.06, ease: 'power3.out' });
    }, ref);
    return () => ctx.revert();
  }, []);
  return ref;
}

type DivisionShellProps = {
  title: string;
  subtitle?: string;
  telemetry?: string; // "● Live" badge
  icon?: string;
  children: React.ReactNode;
  tabs?: { key: string; label: string; count?: number }[];
  activeTab?: string;
  onTabChange?: (k: string) => void;
  kpis?: { label: string; value: string | number; sub?: string }[];
  alert?: { type: 'info' | 'success' | 'warn' | 'error'; text: string } | null;
};

export default function DivisionShell({ title, subtitle, telemetry, icon, children, tabs, activeTab, onTabChange, kpis, alert }: DivisionShellProps) {
  const rootRef = useRevealRoot();
  const { me } = useSession();

  return (
    <div ref={rootRef} className="mx-auto max-w-7xl px-5 sm:px-6 py-6 space-y-6">
      {/* Header — F-pattern top (NN/g) */}
      <div className="reveal flex flex-wrap items-start justify-between gap-4 border-b border-brand-navy/10 pb-5">
        <div>
          <div className="flex items-center gap-3">
            {icon && <span className="text-2xl" aria-hidden>{icon}</span>}
            <h1 className="font-display text-2xl font-extrabold tracking-tight text-brand-navy">{title}</h1>
            {telemetry && <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-bold text-emerald-700">{telemetry}</span>}
          </div>
          {subtitle && <p className="mt-1 max-w-2xl text-sm text-brand-textLight">{subtitle}</p>}
        </div>
        <div className="text-right">
          <p className="text-xs font-bold uppercase tracking-widest text-brand-navy/40">Signed in</p>
          <p className="text-sm font-bold text-brand-navy">{me?.name || '—'} · <span className="text-brand-gold">{me?.role || ''}</span></p>
        </div>
      </div>

      {/* KPI Strip — Level 1 hierarchy */}
      {kpis && kpis.length > 0 && (
        <div className="reveal grid grid-cols-2 gap-3 sm:grid-cols-4">
          {kpis.map((k) => (
            <div key={k.label} className="rounded-2xl border border-brand-navy/10 bg-white p-4 shadow-card">
              <p className="text-xs font-bold uppercase tracking-widest text-brand-navy/40">{k.label}</p>
              <p className="mt-1 font-display text-xl font-extrabold text-brand-navy">{k.value}</p>
              {k.sub && <p className="text-xs text-brand-textLight">{k.sub}</p>}
            </div>
          ))}
        </div>
      )}

      {/* Alert */}
      {alert && (
        <div className={`reveal rounded-xl border px-4 py-3 text-sm font-medium ${alert.type === 'error' ? 'border-rose-200 bg-rose-50 text-rose-700' : alert.type === 'warn' ? 'border-amber-200 bg-amber-50 text-amber-800' : alert.type === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-brand-navy/10 bg-brand-navy/[0.03] text-brand-navy'}`}>{alert.text}</div>
      )}

      {/* Tabs — accessible, keyboard nav */}
      {tabs && tabs.length > 0 && (
        <div className="reveal flex gap-1 overflow-x-auto rounded-full bg-brand-navy/[0.04] p-1 w-fit border border-brand-navy/10" role="tablist">
          {tabs.map((t) => (
            <button
              key={t.key}
              role="tab"
              aria-selected={activeTab === t.key}
              onClick={() => onTabChange?.(t.key)}
              className={`whitespace-nowrap rounded-full px-4 py-2 text-sm font-bold transition ${activeTab === t.key ? 'bg-brand-navy text-white shadow' : 'text-brand-navy/60 hover:text-brand-navy hover:bg-white'}`}
            >
              {t.label} {t.count != null && <span className={`ml-1 rounded-full px-1.5 py-0.5 text-xs ${activeTab === t.key ? 'bg-white/20' : 'bg-brand-navy/10'}`}>{t.count}</span>}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      <div className="reveal">{children}</div>
    </div>
  );
}
