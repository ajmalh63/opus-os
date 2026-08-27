import type { ReactNode } from 'react';

// Shared high-craft glass "artifact" stage used across all hero live widgets.
export default function ArtifactShell({ 
  title, 
  caption, 
  children, 
  statusLabel = 'Live Real-Time Engine'
}: {
  title: string;
  caption?: string;
  children: ReactNode;
  accent?: string;
  statusLabel?: string;
}) {
  return (
    <div className="glass-light rounded-3xl p-6 sm:p-7 shadow-[0_20px_50px_rgba(10,45,80,0.22)] border border-white/60 hover:border-brand-gold/40 hover:shadow-[0_24px_60px_rgba(215,160,25,0.18)] transition-all duration-400 ease-out group">
      {/* Header bar with status pill */}
      <div className="mb-4 flex items-start justify-between gap-3 border-b border-brand-navy/5 pb-3.5">
        <div>
          <div className="flex items-center gap-2">
            <p className="font-display text-sm sm:text-base font-bold text-brand-navy tracking-tight">{title}</p>
          </div>
          {caption && <p className="mt-0.5 text-sm text-brand-textLight leading-snug">{caption}</p>}
        </div>

        <div className="flex shrink-0 items-center gap-1.5 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-1 text-[13px] font-semibold text-emerald-700">
          <span className="live-pulse-dot text-emerald-500 !h-1.5 !w-1.5" />
          <span className="hidden sm:inline">{statusLabel}</span>
          <span className="sm:hidden">Live</span>
        </div>
      </div>

      {/* Content Area */}
      <div className="relative">
        {children}
      </div>
    </div>
  );
}
