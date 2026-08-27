import { useState } from 'react';

/**
 * LiveDossierTelemetryRibbon — Meaningful, real-time, high-trust client context.
 * Displays Case Ref (1-click copy), live assigned counselor, active division,
 * real-time WebSocket connection state, and 1-click immediate next action trigger.
 */
export interface TrustStripProps {
  clientName?: string;
  fileNo?: string;
  program?: string;
  intake?: string;
  counselorName?: string;
  lastSyncLabel?: string;
  nextStep?: string;
  nextStepAction?: () => void;
  isWsConnected?: boolean;
}

export default function TrustStrip({
  clientName,
  fileNo,
  program,
  intake,
  counselorName,
  lastSyncLabel,
  nextStep,
  nextStepAction,
  isWsConnected = true,
}: TrustStripProps) {
  const [copied, setCopied] = useState(false);
  const hasJourney = !!(clientName || fileNo || program);

  const handleCopyFileNo = () => {
    if (!fileNo) return;
    const clean = fileNo.replace(/^#/, '');
    navigator.clipboard?.writeText(clean);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="w-full bg-[#FAF8F4] border-y border-brand-navy/10 -mx-6 md:-mx-8 px-6 md:px-8 py-2">
      <div className="flex items-center justify-between gap-3 text-sm overflow-x-auto whitespace-nowrap scrollbar-thin">
        {!hasJourney ? (
          <div className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1.5 font-bold text-brand-navy">
              <span className="w-2 h-2 rounded-full bg-brand-gold animate-pulse" />
              Welcome to Opus Overseas
            </span>
            <span className="text-slate-300">|</span>
            <span className="text-slate-600 font-medium">Ready to start your journey — select an admissions or visa desk below</span>
          </div>
        ) : (
          <div className="flex items-center gap-3">
            {/* 1. Client Identity & Live WS Indicator */}
            <div className="flex items-center gap-1.5 font-bold text-brand-navy">
              <span className={`w-2 h-2 rounded-full ${isWsConnected ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
              <span className="truncate max-w-[140px]">{clientName || 'Applicant'}</span>
            </div>

            {/* 2. Copyable Case Dossier ID */}
            {fileNo && (
              <>
                <span className="text-slate-300">|</span>
                <button
                  type="button"
                  onClick={handleCopyFileNo}
                  title="Click to copy Case Reference ID"
                  className="inline-flex items-center gap-1 font-mono text-[13px] font-bold px-2 py-0.5 rounded-md bg-white border border-brand-navy/10 text-brand-navy hover:border-brand-gold hover:text-brand-navy transition-colors cursor-pointer shadow-xs"
                >
                  <span>{fileNo}</span>
                  <span className="text-xs text-brand-gold">{copied ? '✓' : '📋'}</span>
                </button>
              </>
            )}

            {/* 3. Program / Division */}
            {program && (
              <>
                <span className="hidden sm:inline text-slate-300">|</span>
                <span className="hidden sm:inline text-slate-700 font-semibold truncate max-w-[200px]">
                  {program}{intake ? ` • ${intake}` : ''}
                </span>
              </>
            )}

            {/* 4. Assigned Counselor Badge */}
            {counselorName && (
              <>
                <span className="hidden md:inline text-slate-300">|</span>
                <span className="hidden md:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200/80 font-medium text-[13px]">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-600" />
                  Counselor: {counselorName}
                </span>
              </>
            )}

            {/* 5. Last Live Sync Timestamp */}
            {lastSyncLabel && (
              <>
                <span className="hidden lg:inline text-slate-300">|</span>
                <span className="hidden lg:inline font-mono text-[13px] text-slate-500">
                  {lastSyncLabel}
                </span>
              </>
            )}
          </div>
        )}

        {/* Next Required Step CTA */}
        {nextStep && (
          <div className="shrink-0 pl-2">
            {nextStepAction ? (
              <button
                type="button"
                onClick={nextStepAction}
                className="inline-flex items-center gap-1.5 bg-brand-navy hover:bg-brand-gold hover:text-brand-navy text-white text-sm font-bold px-3 py-1 rounded-full transition-all shadow-xs cursor-pointer"
              >
                <span>⚡ Next: {nextStep}</span>
                <span>→</span>
              </button>
            ) : (
              <span className="inline-flex items-center gap-1 font-bold text-brand-navy text-sm px-2.5 py-0.5 rounded-full bg-amber-50 border border-amber-200/80">
                <span>Next: {nextStep}</span>
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
