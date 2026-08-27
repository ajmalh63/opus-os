/**
 * EmptyVaultState — Beautiful empty, not blank (ui-ux-pro-max: no-emoji-icons, but illustration allowed)
 * Gives next step, reduces abandonment
 */
export default function EmptyVaultState({ onAction }: { onAction?: () => void }) {
  return (
    <div className="text-center py-10 px-6 bg-white rounded-2xl border border-slate-200">
      <div className="mx-auto w-16 h-16 rounded-2xl bg-[#FAF3DC] border border-[#F5E6B8] grid place-items-center text-2xl" aria-hidden>
        📁
      </div>
      <h3 className="mt-4 font-bold text-brand-navy">Your vault is empty — let's fill it in 2 minutes</h3>
      <p className="mt-1 text-xs text-slate-500 max-w-[32ch] mx-auto leading-relaxed">
        Upload your passport bio page to keep your slot reserved. Camera scan auto-crops, handled with care, read receipts.
      </p>
      <button
        onClick={onAction}
        className="mt-4 h-9 px-5 rounded-full bg-brand-navy text-white text-sm font-bold hover:bg-black transition cursor-pointer"
      >
        Upload first document →
      </button>
      <p className="mt-2 text-sm text-slate-400">Supports PDF/JPG up to 10MB • Or drag & drop</p>
    </div>
  );
}
