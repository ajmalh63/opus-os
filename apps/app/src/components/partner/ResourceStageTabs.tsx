import { useState } from 'react';

/**
 * ResourceStageTabs — Organized by sales stage, not file type. 30s to find or we failed.
 */
const STAGES = ['Prospecting', 'Qualifying', 'Closing', 'Servicing'] as const;

export default function ResourceStageTabs() {
  const [active, setActive] = useState<(typeof STAGES)[number]>('Prospecting');

  return (
    <div className="bg-white text-[#0B1220] rounded-2xl border border-slate-200 p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-black">Resource Center • By sales stage</h3>
        <span className="text-xs px-2 py-1 rounded-full bg-[#FAF3DC] border border-[#F5E6B8]">30s to find or we failed</span>
      </div>
      <div className="mt-4 flex flex-wrap gap-1.5">
        {STAGES.map((s) => (
          <button
            key={s}
            onClick={() => setActive(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-bold border transition ${active === s ? 'bg-[#0B1220] text-white border-[#0B1220]' : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300'}`}
          >
            {s}
          </button>
        ))}
      </div>
      <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-3">
        <a className="rounded-xl border border-slate-200 p-3 hover:border-[#0B1220] transition">
          <p className="text-xs font-black">1-pager • Canada PG</p>
          <p className="text-xs text-slate-500">Ideal customer + fees + intake</p>
          <span className="inline-block mt-2 text-[11px] px-2 py-1 rounded-full bg-[#0B1220] text-white">Open • 1 min</span>
        </a>
        <a className="rounded-xl border border-slate-200 p-3 hover:border-[#0B1220] transition">
          <p className="text-xs font-black">Video • 2 min demo script</p>
          <p className="text-xs text-slate-500">Objection: “Why Canada?”</p>
          <span className="inline-block mt-2 text-[11px] px-2 py-1 rounded-full bg-white border">Watch</span>
        </a>
        <a className="rounded-xl border border-slate-200 p-3 hover:border-[#0B1220] transition">
          <p className="text-xs font-black">Calculator • ROI for parents</p>
          <p className="text-xs text-slate-500">Part-time + PR pathway</p>
          <span className="inline-block mt-2 text-[11px] px-2 py-1 rounded-full bg-white border">Use</span>
        </a>
      </div>
      <div className="mt-3 flex items-center gap-2 text-[11px] text-slate-500">
        <span>Top 10 Most Used</span> • <span>Recently Viewed</span> • <span>Favorites ☆</span> <span className="ml-auto hidden sm:inline">Did you mean: SOP template?</span>
      </div>
    </div>
  );
}
