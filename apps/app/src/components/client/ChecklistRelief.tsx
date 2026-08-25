

/**
 * ChecklistRelief — Dopamine checklist. Each tick reduces anxiety (VisaPath: Progress as relief)
 * 44px min targets, progress bar, social proof at hesitation point handled by parent.
 */
export interface ChecklistItem {
  id: string;
  label: string;
  required?: boolean;
  done: boolean;
  actionLabel?: string;
  division?: string;
}

export default function ChecklistRelief({
  items,
  onToggle,
  optedDivisions,
  onUpload,
}: {
  items: ChecklistItem[];
  onToggle?: (id: string) => void;
  optedDivisions?: string[];
  onUpload?: (item: ChecklistItem) => void;
}) {
  const done = items.filter((i) => i.done).length;
  const pct = items.length ? Math.round((done / items.length) * 100) : 0;
  const isEmpty = items.length === 0;

  if (isEmpty) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-brand-navy">Your checklist</h3>
          <span className="font-mono text-xs px-2 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-500">No divisions yet</span>
        </div>
        <p className="text-xs text-slate-500 mt-1">This checklist reflects only divisions you’ve opted for — no generic filler.</p>
        <div className="mt-4 rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-center">
          <p className="text-sm font-bold text-slate-700">No checklist yet</p>
          <p className="text-xs text-slate-500 mt-1 max-w-[32ch] mx-auto">Apply to Study Abroad, Visa, Umrah, Attestation, or Careers to see your personalized, live checklist here. It updates as you upload and we verify.</p>
          <p className="text-[11px] text-slate-400 mt-2">Building in public — real tasks, no fake 2/5</p>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-bold text-brand-navy">
          Your checklist {optedDivisions?.length ? `• ${optedDivisions.join(', ')}` : ''} • 2 min each
        </h3>
        <span className="font-mono text-xs px-2 py-1 rounded-full bg-[#FAF3DC] border border-[#F5E6B8] text-brand-navy">
          {done}/{items.length} done
        </span>
      </div>
      <p className="text-xs text-slate-500 mt-1">Only for divisions you opted for — checked items reduce anxiety. Live from your vault.</p>

      <div className="mt-4 space-y-2">
        {items.map((it) => (
          <label
            key={it.id}
            className={`flex items-center gap-3 p-3 rounded-xl border cursor-pointer transition
              ${it.done ? 'bg-emerald-50 border-emerald-200' : it.required ? 'bg-amber-50 border-amber-200' : 'bg-white border-slate-200 hover:border-brand-gold/40'}`}
          >
            <input
              type="checkbox"
              checked={it.done}
              onChange={() => onToggle?.(it.id)}
              className="w-4 h-4 accent-emerald-600"
            />
            <span className={`text-sm ${it.done ? 'font-medium line-through opacity-70' : 'font-medium'}`}>
              {it.label} {it.required && !it.done && <span className="text-amber-700 text-xs">• Required</span>}
            </span>
            {it.done ? (
              <span className="ml-auto text-[11px] px-2 py-1 rounded-full border bg-white">View</span>
            ) : (
              <button
                onClick={() => onUpload?.(it)}
                aria-label={`Upload ${it.label}`}
                className="ml-auto text-[11px] px-3 py-1 rounded-full border bg-brand-navy text-white border-brand-navy hover:bg-black cursor-pointer min-h-[28px] focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy/20"
              >
                Upload
              </button>
            )}
          </label>
        ))}
      </div>

      <div className="mt-4 h-2 bg-[#FAF3DC] rounded-full overflow-hidden">
        <div className="h-full bg-brand-navy transition-all duration-500" style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[11px] text-slate-500 mt-2">
        {done} of {items.length} • {pct === 100 ? 'All done! 🎉' : `You are ${pct}% done. Keep momentum.`} Avg completion 3.2 days.
      </p>
    </div>
  );
}
