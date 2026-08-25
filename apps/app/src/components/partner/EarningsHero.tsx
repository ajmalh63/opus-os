

/**
 * EarningsHero — Z endpoint top. Single hero with Withdraw CTA + tier ring (Goal Gradient)
 * Dense cockpit style: lime accent, mono numbers, always visible.
 */
export default function EarningsHero({
  availablePaise,
  pendingPaise,
  paidPaise,
  tier = 'Gold',
  progressPct = 72,
  nextTier = 'Platinum',
  onWithdraw,
  onViewRewards,
}: {
  availablePaise: number;
  pendingPaise?: number;
  paidPaise?: number;
  tier?: string;
  progressPct?: number;
  nextTier?: string;
  onWithdraw?: () => void;
  onViewRewards?: () => void;
}) {
  const available = `₹${(availablePaise / 100).toLocaleString('en-IN')}`;
  const pending = pendingPaise !== undefined ? `₹${(pendingPaise / 100).toLocaleString('en-IN')}` : undefined;
  const paid = paidPaise !== undefined ? `₹${(paidPaise / 100).toLocaleString('en-IN')}` : undefined;
  const offset = 113 - (113 * progressPct) / 100; // circle dash 2πr ≈113

  return (
    <div className="bg-gradient-to-br from-[#0F172A] via-[#0B1220] to-[#070C18] rounded-2xl border border-[#1F2B45] p-5 lg:p-6 text-white flex flex-col gap-4">
      <div className="flex items-start justify-between gap-4">
        <div>
          <p className="text-[11px] tracking-[0.14em] font-black text-slate-400">EARNINGS HERO • WITHDRAW IN ONE TAP</p>
          <div className="mt-2 flex items-baseline gap-3">
            <span className="text-3xl lg:text-4xl font-black tracking-tight">{available}</span>
            <span className="text-xs px-2 py-1 rounded-full bg-[#CEFF00] text-black font-black">Available to withdraw</span>
          </div>
          <p className="text-sm text-slate-400 mt-1">
            Next payout in <b className="text-white">3 days</b>
            {pending && <> • Pending <b className="text-white">{pending}</b></>}
            {paid && <> • Paid <b className="text-white">{paid}</b></>}
          </p>
        </div>

        <div className="hidden sm:flex flex-col items-center gap-2 shrink-0">
          <div className="relative w-20 h-20">
            <svg className="w-20 h-20 -rotate-90" viewBox="0 0 44 44">
              <circle cx="22" cy="22" r="18" stroke="#1F2B45" strokeWidth={4} fill="none" />
              <circle cx="22" cy="22" r="18" stroke="#CEFF00" strokeWidth={4} fill="none" strokeDasharray={113} strokeDashoffset={offset} strokeLinecap="round" />
              <text x="22" y="25" textAnchor="middle" fontSize={7} fontWeight={700} fill="white">
                {progressPct}%
              </text>
            </svg>
            <span className="absolute -bottom-2 left-1/2 -translate-x-1/2 text-[10px] px-2 py-0.5 rounded-full bg-[#CEFF00] text-black font-black whitespace-nowrap">
              {tier} → {nextTier}
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <button onClick={onWithdraw} className="h-10 px-6 rounded-full bg-[#CEFF00] text-black text-sm font-black hover:bg-[#B8E600] transition active:scale-[0.98]">
          Withdraw to UPI / Bank →
        </button>
        <button onClick={onViewRewards} className="h-10 px-5 rounded-full bg-white/10 border border-white/15 text-sm font-semibold hover:bg-white/15 transition">
          View Rewards
        </button>
      </div>

      <div className="flex items-center gap-2 text-[11px] text-slate-400">
        <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" /> Live • Last deal approved 14 min ago • Auto-synced from CRM
      </div>
    </div>
  );
}
