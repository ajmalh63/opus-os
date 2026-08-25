/**
 * PortalSkeleton — Perceived performance (ui-ux-pro-max: loading-states, content-jumping)
 * Reserve space, use pulse, respect prefers-reduced-motion
 */
export function KanbanSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-4" aria-busy="true" aria-label="Loading pipeline">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="bg-slate-50/90 rounded-2xl p-4 border border-slate-200/80 min-h-[360px] animate-pulse">
          <div className="h-4 bg-slate-200 rounded w-3/4 mb-4" />
          <div className="space-y-3">
            <div className="h-20 bg-white rounded-xl border border-slate-100" />
            <div className="h-20 bg-white rounded-xl border border-slate-100 opacity-60" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ChecklistSkeleton() {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 p-5 animate-pulse" aria-busy="true">
      <div className="h-4 bg-slate-200 rounded w-1/2 mb-3" />
      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 bg-slate-100 rounded-xl" />
        ))}
      </div>
    </div>
  );
}

export function MetricSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" aria-busy="true">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="bg-white rounded-3xl p-6 border border-slate-200/80 min-h-[110px] animate-pulse">
          <div className="h-3 bg-slate-200 rounded w-1/3 mb-4" />
          <div className="h-8 bg-slate-200 rounded w-1/2" />
        </div>
      ))}
    </div>
  );
}
