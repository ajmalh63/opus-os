

/**
 * PendingActionBanner — F-pattern top (most read). Single primary action, reduces choice overload.
 * Loss framing (ethical): "Slot reserved till 28 Aug" not fake scarcity.
 */
export default function PendingActionBanner({
  title = 'Upload your Passport Bio Page',
  dueLabel = 'Due in 3 days • Slot reserved till 28 Aug',
  estimate = '2 min',
  onPrimary,
  onSecondary,
}: {
  title?: string;
  dueLabel?: string;
  estimate?: string;
  onPrimary?: () => void;
  onSecondary?: () => void;
}) {
  return (
    <div className="rounded-2xl bg-gradient-to-r from-[#FFF3CD] via-[#FFE69C] to-[#FFD85A] border border-[#EAB54A] px-4 py-3 flex flex-col lg:flex-row lg:items-center gap-3 shadow-sm">
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="w-9 h-9 rounded-full bg-brand-navy text-[#FFD85A] grid place-items-center font-black text-sm shrink-0">!</div>
        <div className="min-w-0">
          <div className="text-[11px] font-black tracking-[0.08em] text-brand-navy">PENDING ACTION • {dueLabel}</div>
          <div className="text-sm font-semibold text-brand-navy leading-tight truncate">
            {title} <span className="font-normal text-[#6B5E2B]">— Estimated: {estimate} • Keep momentum, you are 60% done.</span>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-2 lg:ml-auto shrink-0">
        <button
          onClick={onPrimary}
          className="h-9 px-5 rounded-full bg-brand-navy text-white text-sm font-bold hover:bg-black transition active:scale-[0.98] shadow"
        >
          Upload now →
        </button>
        <button
          onClick={onSecondary}
          className="h-9 px-4 rounded-full bg-white/80 border border-brand-navy/10 text-sm font-medium hover:bg-white transition hidden sm:inline-flex"
        >
          Remind me later
        </button>
      </div>
    </div>
  );
}
