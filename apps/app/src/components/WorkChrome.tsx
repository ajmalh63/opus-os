import { type ReactNode } from 'react';

// Shared brand primitives for the workspace — light canvas (#FAF8F4 behind
// white cards), brand-navy #0A2D50 as the blue, gold accents from the public
// site's clay/gold language. WorkspaceShell owns the canvas + sidebar.

export const WS_CARD =
  'rounded-2xl border border-brand-navy/10 bg-white shadow-[0_16px_40px_-22px_rgba(10,45,80,0.16)]';
export const WS_CARD_HOVER =
  'transition-all duration-300 hover:-translate-y-0.5 hover:border-brand-gold/60';

export const WS_INPUT =
  'w-full rounded-xl border border-brand-navy/10 bg-white px-3.5 py-2.5 text-xs text-brand-navy placeholder:text-brand-navy/35 outline-none transition-colors duration-300 focus:border-brand-gold/70 focus:ring-1 focus:ring-brand-gold/25';

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
    <div className="mb-7">
      <div className="flex items-center gap-2.5">
        <span className="gold-dot" />
        <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-brand-gold">{eyebrow}</span>
      </div>
      <h2 className="mt-2.5 font-display text-2xl font-extrabold tracking-tight text-brand-navy md:text-3xl">
        {title}
      </h2>
      {subtitle && (
        <p className="mt-2 max-w-2xl text-[11px] leading-relaxed text-brand-navy/50">{subtitle}</p>
      )}
      <div className="gold-rule mt-5" />
      {children}
    </div>
  );
}

export function Panel({
  className = '',
  children,
}: {
  className?: string;
  children?: ReactNode;
}) {
  return <div className={`${WS_CARD} ${className}`}>{children}</div>;
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
        <h3 className="font-display text-sm font-bold text-brand-navy">{title}</h3>
        {caption && <p className="mt-0.5 text-[10px] text-brand-navy/40">{caption}</p>}
      </div>
      {right}
    </div>
  );
}

export function EmptyState({ title, hint }: { title: string; hint?: string }) {
  return (
    <div className="py-14 text-center">
      <span className="gold-dot mx-auto !h-2 !w-2" />
      <p className="mt-3.5 text-xs font-semibold text-brand-navy/60">{title}</p>
      {hint && <p className="mt-1 text-[10px] text-brand-navy/35">{hint}</p>}
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
}: {
  label: string;
  caption?: string;
  value: string | number;
  valueClass?: string;
  accent?: boolean;
  countKey?: string;
}) {
  return (
    <Panel className="reveal-widget relative overflow-hidden p-6">
      {accent && (
        <div className="pointer-events-none absolute -right-10 -top-12 h-32 w-32 rounded-full bg-brand-gold/15 blur-2xl" />
      )}
      <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-gold">{label}</p>
      <p className={`mt-3 font-display text-4xl font-extrabold ${valueClass}`} data-count={countKey}>{value}</p>
      {caption && <p className="mt-1.5 text-[10px] text-brand-navy/40">{caption}</p>}
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
      className={`inline-flex cursor-pointer items-center gap-2 rounded-full px-5 py-2.5 text-[11px] font-bold uppercase tracking-wider transition-all duration-300 active:scale-[0.97] ${
        gold
          ? 'bg-brand-gold text-brand-navy hover:bg-brand-gold/90 shadow-[0_10px_24px_-10px_rgba(215,160,25,0.45)]'
          : 'border border-brand-navy/15 bg-white text-brand-navy hover:border-brand-gold'
      } ${className}`}
    >
      {children}
    </button>
  );
}