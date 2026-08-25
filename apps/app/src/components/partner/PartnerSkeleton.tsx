export function PartnerMetricsSkeleton() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4" aria-busy="true" aria-label="Loading earnings">
      {Array.from({ length: 4 }).map((_, i) => (
        <div key={i} className="bg-white rounded-2xl p-5 border border-slate-200 h-[110px] animate-pulse">
          <div className="h-3 bg-slate-200 rounded w-1/3 mb-4" />
          <div className="h-8 bg-slate-200 rounded w-1/2" />
        </div>
      ))}
    </div>
  );
}
export function PipelineSkeleton() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-5 gap-3.5" aria-busy="true">
      {Array.from({ length: 5 }).map((_, i) => (
        <div key={i} className="bg-slate-50 rounded-xl p-3.5 border border-slate-200 min-h-[280px] animate-pulse">
          <div className="h-4 bg-slate-200 rounded w-2/3 mb-3" />
          <div className="h-16 bg-white rounded-xl border" />
        </div>
      ))}
    </div>
  );
}
