import type { ReactNode } from 'react';

// Shared glass "artifact" panel shell used by all 5 hero live widgets.
export default function ArtifactShell({ title, caption, children, accent = 'brand-gold' }: {
  title: string;
  caption?: string;
  children: ReactNode;
  accent?: string;
}) {
  return (
    <div className="glass-light rounded-3xl p-6 shadow-[0_20px_50px_rgba(10,45,80,0.25)] border border-transparent hover:border-brand-gold/30 hover:shadow-[0_20px_50px_rgba(215,160,25,0.15)] hover:scale-[1.02] transition-all duration-300">
      <div className="mb-4 flex items-center justify-between gap-2">
        <div>
          <p className={`font-display text-sm font-bold text-brand-navy`} style={{ color: 'var(--color-brand-navy)' }}>{title}</p>
          {caption && <p className="mt-0.5 text-[10px] text-brand-textLight">{caption}</p>}
        </div>
        <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-gold/10 text-brand-gold" aria-hidden="true">
          <span className={`h-2 w-2 rounded-full bg-${accent.replace('bg-', '')}`} />
        </span>
      </div>
      {children}
    </div>
  );
}