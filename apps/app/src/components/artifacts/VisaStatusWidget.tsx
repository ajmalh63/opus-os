import { useState } from 'react';
import ArtifactShell from './ArtifactShell';

// LIVE ARTIFACT (slide 2, §24.1.1): visa status by tracking ref — real /api/public/portal/lookup?token=
export default function VisaStatusWidget() {
  const [ref, setRef] = useState('');
  const [status, setStatus] = useState<{ success?: boolean; journey?: any; error?: string } | null>(null);
  const [loading, setLoading] = useState(false);

  const track = async () => {
    const token = ref.trim().toUpperCase();
    if (!token) return;
    setLoading(true);
    setStatus(null);
    try {
      const res = await fetch(`/api/public/portal/lookup?token=${encodeURIComponent(token)}`);
      const data = await res.json();
      if (!res.ok) {
        setStatus({ error: data.error || 'Not found — verify your tracking code.' });
      } else {
        setStatus(data);
      }
    } finally {
      setLoading(false);
    }
  };

  const stage = (status as any)?.stageKey || (status as any)?.stage || null;

  return (
    <ArtifactShell title="Track My Visa" caption="Enter your journey token (OP-2026-…) to see your live stage">
      <div className="space-y-3">
        <div className="flex gap-2">
          <input
            value={ref}
            onChange={(e) => setRef(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && track()}
            placeholder="e.g. OP-2026-1234"
            className="w-full rounded-xl border border-brand-navy/10 bg-white px-3 py-2.5 text-sm text-brand-navy uppercase placeholder:normal-case focus:border-brand-gold focus:outline-none"
          />
          <button
            onClick={track}
            disabled={loading || !ref.trim()}
            className="shrink-0 rounded-xl bg-brand-gold px-4 py-2.5 text-xs font-bold uppercase tracking-wide text-brand-navy transition-all hover:bg-brand-gold-hover disabled:opacity-50"
          >
            {loading ? '…' : 'Track'}
          </button>
        </div>

        {status?.error && (
          <p className="rounded-xl bg-rose-50 px-3.5 py-2.5 text-xs text-rose-600">{status.error}</p>
        )}

        {stage && (
          <div className="rounded-xl border border-brand-navy/5 bg-white/70 p-3.5">
            <div className="flex items-center gap-3">
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-brand-gold/15 text-brand-gold">✓</span>
              <div>
                <p className="text-xs font-bold text-brand-navy">Current stage: {stage}</p>
                <p className="text-[10px] text-brand-textLight">
                  92% documented success rate ·
                  <span className="ml-1 inline-block h-2 w-2 animate-pulse rounded-full bg-emerald-500 align-middle" /> live
                </p>
              </div>
            </div>
          </div>
        )}

        {!status && !loading && (
          <p className="text-center text-[10px] text-brand-textLight">
            Your case file is updated in real time by our counselors.
          </p>
        )}
      </div>
    </ArtifactShell>
  );
}