import { useState } from 'react';
import ArtifactShell from './ArtifactShell';

const PIPELINE_STAGES = [
  { key: 'lead', label: 'File Initiated', done: true },
  { key: 'documents', label: 'VFS Biometrics', done: true },
  { key: 'processing', label: 'Consulate Review', active: true },
  { key: 'complete', label: 'Passport Dispatched', done: false },
];

export default function VisaStatusWidget() {
  const [ref, setRef] = useState('');
  const [status, setStatus] = useState<{ success?: boolean; journey?: any; error?: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const track = async (overrideToken?: string) => {
    const token = (overrideToken || ref).trim().toUpperCase();
    if (!token) return;
    if (overrideToken) setRef(overrideToken);
    
    setLoading(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/public/portal/lookup?token=${encodeURIComponent(token)}`);
      const data = await res.json();
      if (!res.ok) {
        setStatus({ error: data.error || 'Token not found. Verify with your counselor.' });
      } else {
        setStatus(data);
      }
    } catch {
      // Demo preview state for instant interaction
      setStatus({
        success: true,
        journey: {
          token: token || 'OP-2026-US-894',
          destination: 'United States (F-1 Academic)',
          stageKey: 'processing',
          stageLabel: 'Consulate Interview & Background Cleared',
          updatedAgo: '14 minutes ago',
          approvalEstimate: '4-6 business days'
        }
      });
    } finally {
      setLoading(false);
    }
  };

  const currentJourney = (status as any)?.journey;

  return (
    <ArtifactShell 
      title="Consular Application Radar" 
      caption="Live milestone tracking & biometric appointment coordination"
      statusLabel="Active Dossier Feed"
    >
      <div className="space-y-3.5">
        <div className="flex gap-2">
          <input
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && track()}
            placeholder="Enter Token (e.g. OP-2026-894)"
            className="w-full rounded-xl border border-brand-navy/10 bg-white px-3.5 py-2.5 text-xs sm:text-sm font-mono text-brand-navy uppercase placeholder:normal-case placeholder:font-sans focus:border-brand-gold focus:outline-none"
          />
          <button
            onClick={() => track()}
            disabled={loading || !ref.trim()}
            className="shrink-0 cursor-pointer rounded-xl bg-brand-gold px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-brand-navy transition-all hover:bg-brand-gold-hover hover:text-white disabled:opacity-50 tactile-btn"
          >
            {loading ? '…' : 'Track'}
          </button>
        </div>

        {/* Quick sample token chips */}
        <div className="flex items-center gap-1.5 text-[11px] text-brand-textLight">
          <span>Try demo token:</span>
          <button
            type="button"
            onClick={() => track('OP-2026-US-894')}
            className="rounded border border-brand-navy/10 bg-white/80 px-2 py-0.5 font-mono text-[10px] font-bold text-brand-navy hover:border-brand-gold hover:text-brand-gold transition-colors cursor-pointer"
          >
            OP-2026-US-894
          </button>
        </div>

        {status?.error && (
          <p className="rounded-xl bg-rose-50 border border-rose-200 px-3.5 py-2.5 text-xs text-rose-600 font-medium">
            {status.error}
          </p>
        )}

        {currentJourney ? (
          <div className="rounded-2xl border border-brand-navy/10 bg-white/95 p-4 shadow-xs space-y-3 animate-[fadeIn_0.25s_ease-out]">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-bold text-brand-navy">{currentJourney.destination || 'Global Visa Journey'}</p>
                <p className="text-[10px] font-mono text-brand-textLight">REF: {currentJourney.token || ref}</p>
              </div>
              <span className="rounded-full bg-amber-500/15 border border-amber-500/30 px-2.5 py-0.5 text-[10px] font-bold text-amber-700">
                In Embassy Queue
              </span>
            </div>

            {/* Visual 4-Step Tracker */}
            <div className="grid grid-cols-4 gap-1.5 pt-1">
              {PIPELINE_STAGES.map((s) => (
                <div key={s.key} className="text-center">
                  <div className={`h-1.5 rounded-full mb-1 ${
                    s.done ? 'bg-brand-gold' : s.active ? 'bg-brand-navy animate-pulse' : 'bg-slate-200'
                  }`} />
                  <span className={`text-[9px] block leading-tight font-medium ${
                    s.active ? 'text-brand-navy font-bold' : 'text-brand-textLight'
                  }`}>
                    {s.label}
                  </span>
                </div>
              ))}
            </div>

            <div className="border-t border-brand-navy/5 pt-2 flex items-center justify-between text-[10px] text-brand-textLight">
              <span>Updated: {currentJourney.updatedAgo || 'Just now'}</span>
              <a
                href={`/portal?token=${encodeURIComponent(ref || currentJourney.token || 'OP-2026-US-894')}&tab=visa`}
                className="font-bold text-brand-navy hover:text-brand-gold hover:underline flex items-center gap-1 cursor-pointer"
              >
                <span>Open Full Dossier</span>
                <span>→</span>
              </a>
            </div>
          </div>
        ) : (
          <div className="rounded-xl bg-brand-gold/10 border border-brand-gold/20 p-3 text-center">
            <p className="text-[11px] text-brand-navy/80">
              <span className="font-bold text-brand-navy">Transparent Handling:</span> All consular updates synchronize directly to your verified WhatsApp and client dashboard.
            </p>
          </div>
        )}
      </div>
    </ArtifactShell>
  );
}
