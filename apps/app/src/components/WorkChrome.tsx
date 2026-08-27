import { type ReactNode } from 'react';

// Shared brand primitives for the workspace — light canvas (#FAF8F4 behind
// white cards), brand-navy #0A2D50 as the blue, gold accents from the public
// site's clay/gold language. WorkspaceShell owns the canvas + sidebar.

export const WS_CARD =
  'rounded-2xl border border-brand-navy/10 bg-white/95 backdrop-blur-sm shadow-[0_20px_50px_-20px_rgba(10,45,80,0.10)] transition-all duration-300 hover:shadow-[0_25px_60px_-15px_rgba(215,160,25,0.12)] hover:border-brand-gold/40';
export const WS_CARD_HOVER =
  'transition-all duration-300 hover:-translate-y-1 hover:border-brand-gold/60 hover:shadow-[0_20px_45px_-12px_rgba(10,45,80,0.18)]';

export const WS_INPUT =
  'w-full rounded-xl border border-brand-navy/15 bg-white/90 px-4 py-2.5 text-xs text-brand-navy placeholder:text-brand-navy/35 outline-none transition-all duration-300 focus:border-brand-gold focus:bg-white focus:ring-2 focus:ring-brand-gold/20 font-sans shadow-xs';

export function WorkspaceHeader({
  eyebrow = 'Opus OS',
  title,
  subtitle,
  children,
}: {
  eyebrow?: string;
  title: string;
  subtitle?: string;
  children?: ReactNode;
}) {
  return (
    <div className="mb-8">
      <div className="flex items-center gap-2.5">
        <span className="h-2 w-2 rounded-full bg-brand-gold animate-pulse shadow-[0_0_8px_rgba(215,160,25,0.8)]" />
        <span className="text-[13px] font-bold uppercase tracking-[0.24em] text-brand-gold">{eyebrow}</span>
      </div>
      <h2 className="mt-2 font-display text-2xl font-black tracking-tight text-brand-navy md:text-3xl">
        {title}
      </h2>
      {subtitle && (
        <p className="mt-1.5 max-w-3xl text-xs leading-relaxed text-brand-textLight">{subtitle}</p>
      )}
      <div className="mt-5 h-[1.5px] w-full bg-gradient-to-r from-brand-gold/40 via-brand-navy/10 to-transparent" />
      {children}
    </div>
  );
}

export function Panel({
  className = '',
  children,
  onClick,
}: {
  className?: string;
  children?: ReactNode;
  onClick?: () => void;
}) {
  return <div className={`${WS_CARD} ${className}`} onClick={onClick}>{children}</div>;
}

export function PanelHead({
  title,
  caption,
  right,
}: {
  title: string;
  caption?: string;
  right?: ReactNode;
}) {
  return (
    <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-brand-navy/10 pb-3.5">
      <div>
        <h3 className="font-display text-sm font-extrabold text-brand-navy tracking-tight">{title}</h3>
        {caption && <p className="mt-0.5 text-sm text-brand-textLight">{caption}</p>}
      </div>
      {right}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="py-14 text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-brand-gold/10 border border-brand-gold/30">
        <span className="h-2.5 w-2.5 rounded-full bg-brand-gold shadow-[0_0_10px_rgba(215,160,25,0.8)]" />
      </div>
      <p className="mt-3.5 text-xs font-bold text-brand-navy">{title}</p>
      {hint && <p className="mt-1 text-sm text-brand-textLight max-w-sm mx-auto">{hint}</p>}
    </div>
  );
}

export function KpiTile({
  label,
  caption,
  value,
  valueClass = 'text-brand-navy',
  accent = false,
  countKey,
  onClick,
}: {
  label: string;
  caption?: string;
  value: string | number;
  valueClass?: string;
  accent?: boolean;
  countKey?: string;
  onClick?: () => void;
}) {
  return (
    <Panel className={`reveal-widget relative overflow-hidden p-6 group ${onClick ? 'cursor-pointer hover:border-brand-gold transition-all' : ''}`} onClick={onClick}>
      {/* Top illuminated gradient strip */}
      <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-brand-gold via-brand-blue to-brand-gold opacity-80 group-hover:opacity-100 transition-opacity" />
      
      {accent && (
        <div className="pointer-events-none absolute -right-10 -top-12 h-36 w-36 rounded-full bg-brand-gold/15 blur-3xl animate-pulse" />
      )}
      <div className="flex items-center justify-between">
        <p className="text-[13px] font-extrabold uppercase tracking-[0.2em] text-brand-gold">{label}</p>
      </div>
      <p className={`mt-3.5 font-display text-3xl sm:text-4xl font-black tracking-tight ${valueClass}`} data-count={countKey}>{value}</p>
      {caption && <p className="mt-1.5 text-sm font-medium text-brand-textLight">{caption}</p>}
    </Panel>
  );
}

export function WorkButton({
  children,
  onClick,
  gold = false,
  className = '',
}: {
  children: ReactNode;
  onClick?: () => void;
  gold?: boolean;
  className?: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex cursor-pointer items-center gap-2 rounded-full px-5 py-2.5 text-sm font-extrabold uppercase tracking-wider transition-all duration-300 active:scale-[0.97] shadow-sm ${
        gold
          ? 'bg-brand-gold text-brand-navy hover:bg-brand-gold/90 hover:shadow-[0_12px_28px_-8px_rgba(215,160,25,0.5)]'
          : 'border border-brand-navy/15 bg-white text-brand-navy hover:border-brand-gold hover:bg-brand-navy/5'
      } ${className}`}
    >
      {children}
    </button>
  );
}