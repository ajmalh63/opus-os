

/**
 * NextBestAction — Single AI-suggested step, reduces choice overload (Hick's Law)
 */
export default function NextBestAction({
  title = 'Claim ₹10k SPIF: Register 2 deals for Riyadh University by Fri',
  hint = 'You are 1 deal away from extra bonus. Avg close: 4.2 days.',
  cta = 'Register deal →',
  onAction,
  streakLabel = '🔥 Streak: 7 days • Badge: Closer',
  streakHint = '3 more logins to unlock Elite badge.',
}: {
  title?: string;
  hint?: string;
  cta?: string;
  onAction?: () => void;
  streakLabel?: string;
  streakHint?: string;
}) {
  return (
    <div className="bg-white text-[#0B1220] rounded-2xl border border-slate-200 p-5 shadow-sm">
      <p className="text-sm tracking-[0.12em] font-black text-slate-500">NEXT BEST ACTION • AI SUGGESTED</p>
      <h3 className="text-[16px] font-black leading-tight mt-2">{title}</h3>
      <p className="text-xs text-slate-500 mt-2">{hint}</p>
      <button onClick={onAction} className="w-full mt-4 h-9 rounded-full bg-[#0B1220] text-white text-sm font-bold hover:bg-black transition">
        {cta}
      </button>
      <div className="mt-4 p-3 rounded-xl bg-[#FFFBF0] border border-[#FFE9A8] text-xs">
        <p className="font-bold">{streakLabel}</p>
        <p className="text-[#6B5E2B] mt-1">{streakHint}</p>
        <div className="mt-2 h-1.5 bg-[#F3EEE3] rounded-full overflow-hidden"><div className="h-full bg-[#0B1220]" style={{ width: '70%' }} /></div>
      </div>
    </div>
  );
}
