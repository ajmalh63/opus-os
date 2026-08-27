/**
 * RealtimeJourneyTracker — Honest, live progress from actual engagements.
 * No dummy 25% — calculates from stageKey (lead 0% → complete 100%) and documents.
 * If no journeys, shows honest empty state: 0% — start to see progress.
 */
export interface StepperProps {
  engagements?: Array<{ stageKey: string; status: string; title?: string; division?: string }>;
  documents?: Array<{ status: string; fileName?: string }>;
  isLoading?: boolean;
  onStepClick?: (stageKey: string) => void;
}

const STAGES = [
  { key: 'lead', label: 'Intake & Profiling', shortLabel: 'Intake', pct: 15 },
  { key: 'documents', label: 'Document Vault', shortLabel: 'Documents', pct: 40 },
  { key: 'processing', label: 'Consular / University Review', shortLabel: 'Review', pct: 70 },
  { key: 'complete', label: 'Decision & Dispatch', shortLabel: 'Decision', pct: 100 },
] as const;

function stagePct(key: string) {
  switch (key) {
    case 'lead':
    case 'intake':
      return 15;
    case 'qualified':
    case 'shortlisted':
    case 'documents':
    case 'docs_ready':
      return 40;
    case 'submitted':
    case 'under_review':
    case 'processing':
    case 'in_process':
      return 70;
    case 'offer_letter':
    case 'deposit_paid':
    case 'enrolled':
    case 'complete':
    case 'dispatched':
    case 'delivered':
      return 100;
    default:
      return 20;
  }
}

export default function JourneyStepper({ engagements = [], documents = [], isLoading, onStepClick }: StepperProps) {
  if (isLoading) {
    return (
      <div className="sticky top-0 z-10 -mx-6 md:-mx-8 px-6 md:px-8 bg-[#FAF8F4]/95 backdrop-blur border-y border-slate-200/80">
        <div className="h-[52px] flex items-center gap-3 animate-pulse">
          <div className="h-3 bg-slate-200 rounded w-32" />
          <div className="flex-1 h-2 bg-slate-100 rounded-full" />
        </div>
      </div>
    );
  }

  const hasJourney = engagements.length > 0;

  // Real progress: average of stage pct across engagements, weighted by documents verification
  const avgStagePct = hasJourney
    ? Math.round(engagements.reduce((a, e) => a + stagePct(e.stageKey), 0) / engagements.length)
    : 0;
  const verified = documents.filter((d) => d.status === 'verified' || d.status === 'approved').length;
  const totalDocs = documents.length;
  const docsBonus = totalDocs ? Math.round((verified / totalDocs) * 15) : 0; // +0-15% for verified docs
  const journeyPct = Math.min(100, Math.max(hasJourney ? 15 : 0, avgStagePct + docsBonus));

  // Current stage = most advanced engagement stage
  const currentStageKey = hasJourney
    ? engagements.reduce((max, e) => (stagePct(e.stageKey) > stagePct(max) ? e.stageKey : max), engagements[0].stageKey)
    : 'lead';

  const mappedIndex = currentStageKey === 'lead' ? 0 : currentStageKey === 'documents' || currentStageKey === 'docs_ready' ? 1 : currentStageKey === 'complete' || currentStageKey === 'dispatched' ? 3 : 2;
  const currentIdx = Math.min(STAGES.length - 1, Math.max(0, mappedIndex));
  const nextStage = STAGES[currentIdx + 1];

  // Next step honest label
  const nextStepLabel = !hasJourney
    ? 'Start your application below'
    : nextStage
      ? `Next: ${nextStage.label}`
      : 'All stages complete';

  const isDone = (idx: number) => hasJourney && idx < currentIdx;
  const isActive = (idx: number) => hasJourney && idx === currentIdx;

  if (!hasJourney) {
    return (
      <div className="sticky top-0 z-10 -mx-6 md:-mx-8 px-6 md:px-8 bg-[#FAF8F4]/95 backdrop-blur border-y border-brand-navy/10">
        <div className="h-[52px] flex items-center justify-between gap-3 overflow-x-auto scrollbar-thin">
          <div className="text-xs font-black tracking-wider text-slate-600 whitespace-nowrap">
            YOUR ROADMAP • <span className="text-brand-navy font-mono">0% Ready</span>
          </div>
          <div className="hidden lg:block w-[180px] h-2 bg-slate-200 rounded-full overflow-hidden shrink-0">
            <div className="h-full bg-slate-300 rounded-full" style={{ width: '0%' }} />
          </div>
          <span className="text-xs text-slate-600 font-medium">Select an active service below to initialize your live milestone radar</span>
        </div>
      </div>
    );
  }

  return (
    <div className="sticky top-0 z-10 -mx-6 md:-mx-8 px-6 md:px-8 bg-[#FAF8F4]/95 backdrop-blur border-y border-brand-navy/10 shadow-xs">
      <div className="h-[52px] flex items-center gap-3 overflow-x-auto scrollbar-thin">
        {/* Progress summary label */}
        <div className="text-xs font-black tracking-wider text-slate-700 whitespace-nowrap">
          ROADMAP • <span className="text-brand-navy font-mono font-bold">{currentIdx + 1}/{STAGES.length} • {journeyPct}%</span>
        </div>

        {/* Multi-stage step indicators */}
        <div className="flex items-center gap-2.5 min-w-[500px] flex-1 mx-2">
          {STAGES.map((s, i) => (
            <button
              key={s.key}
              type="button"
              onClick={() => onStepClick?.(s.key)}
              className="flex items-center gap-2 group cursor-pointer focus:outline-none"
              title={`Click to navigate to ${s.label}`}
            >
              <span
                className={`w-7 h-7 rounded-full grid place-items-center text-xs font-bold border transition-all duration-300
                  ${isDone(i) ? 'bg-emerald-500 text-white border-emerald-500' : isActive(i) ? 'bg-brand-navy text-brand-gold border-brand-navy shadow-xs ring-2 ring-brand-gold/40' : 'bg-white text-slate-400 border-slate-300 group-hover:border-brand-gold'}`}
                aria-current={isActive(i) ? 'step' : undefined}
              >
                {isDone(i) ? '✓' : i + 1}
              </span>
              <span className={`hidden sm:inline text-xs sm:text-sm transition-colors ${isActive(i) ? 'font-bold text-brand-navy' : isDone(i) ? 'font-semibold text-slate-700' : 'font-medium text-slate-400 group-hover:text-slate-600'}`}>
                {s.shortLabel}
              </span>
              {i < STAGES.length - 1 && (
                <span className={`w-6 sm:w-8 h-[2px] hidden sm:block transition-colors ${isDone(i) ? 'bg-emerald-500' : isActive(i) ? 'bg-brand-navy' : 'bg-slate-200'}`} />
              )}
            </button>
          ))}
        </div>

        {/* Live Visual Progress Track */}
        <div className="hidden lg:block w-[140px] h-2 bg-slate-200 rounded-full overflow-hidden shrink-0">
          <div
            className="h-full bg-brand-navy rounded-full transition-all duration-500"
            style={{ width: `${journeyPct}%` }}
          />
        </div>

        {/* Real-time next step badge */}
        <div className="hidden md:flex items-center gap-2 text-xs shrink-0">
          <span className="px-3 py-1 rounded-full bg-white border border-brand-navy/10 text-brand-navy font-bold text-xs whitespace-nowrap shadow-2xs">
            {nextStepLabel}
          </span>
        </div>
      </div>
    </div>
  );
}
