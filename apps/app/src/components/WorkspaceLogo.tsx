// Workspace mark — compact monogram + wordmark lockup for the app shell.
// Brand tokens only (brand-navy / brand-gold); renders identical on light + dark.
export default function WorkspaceLogo({ compact = false, className = '' }: { compact?: boolean; className?: string }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <div className="relative grid h-10 w-10 shrink-0 place-items-center overflow-hidden rounded-2xl bg-brand-navy ring-1 ring-brand-gold/50">
        <svg viewBox="0 0 24 24" className="h-6 w-6" aria-hidden="true">
          <defs>
            <linearGradient id="opus-gold" x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
              <stop offset="0" stopColor="#eca11a" />
              <stop offset="0.5" stopColor="#f1ec6d" />
              <stop offset="1" stopColor="#e5a11f" />
            </linearGradient>
          </defs>
          <circle cx="9" cy="9" r="5.5" fill="none" stroke="url(#opus-gold)" strokeWidth="2.2" />
          <circle cx="15.5" cy="15.5" r="5.5" fill="none" stroke="url(#opus-gold)" strokeWidth="2.2" />
        </svg>
        <div className="absolute inset-0 rounded-2xl bg-gradient-to-br from-brand-gold/20 to-transparent" aria-hidden="true" />
      </div>
      {!compact && (
        <div className="leading-tight">
          <div className="font-display text-[15px] font-extrabold tracking-tight text-white">
            OPUS<span className="text-brand-gold">OS</span>
          </div>
          <div className="text-[9px] font-semibold uppercase tracking-[0.28em] text-slate-400">
            Opus Overseas
          </div>
        </div>
      )}
    </div>
  );
}