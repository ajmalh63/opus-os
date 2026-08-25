export default function EmptyPipelineState({ onAction }: { onAction?: () => void }) {
  return (
    <div className="text-center py-10 px-6 bg-white rounded-2xl border border-slate-200">
      <div className="mx-auto w-16 h-16 rounded-2xl bg-slate-50 border border-slate-200 grid place-items-center text-2xl" aria-hidden>
        👥
      </div>
      <h3 className="mt-4 font-bold text-brand-navy">No referrals yet — your first commission is 1 share away</h3>
      <p className="mt-1 text-xs text-slate-500 max-w-[36ch] mx-auto">
        Share your 90-day cookie link. Any lead who signs inquiry is auto-attributed. Avg first referral: 2.3 days.
      </p>
      <button onClick={onAction} className="mt-4 h-9 px-5 rounded-full bg-brand-navy text-white text-sm font-bold hover:bg-black transition cursor-pointer">
        Copy tracking link →
      </button>
    </div>
  );
}
