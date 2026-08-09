import { useState } from 'react';
import ArtifactShell from './ArtifactShell';
import { track, EVENTS } from '../../lib/umami';

// LIVE ARTIFACT (slide 1, §24.1.1): eligibility checker — real /api/public/match/eligibility
const FIELDS = [
  { key: 'gpa', label: 'GPA (out of 10)', min: 0, max: 10, step: 0.1, def: 7 },
  { key: 'ielts', label: 'IELTS (0â€“9)', min: 0, max: 9, step: 0.5, def: 6.5 },
  { key: 'budget', label: 'Budget (â‚¹ lakh/yr)', min: 0, max: 60, step: 1, def: 15 },
] as const;

export default function EligibilityChecker() {
  const [gpa, setGpa] = useState(7);
  const [ielts, setIelts] = useState(6.5);
  const [budget, setBudget] = useState(15);
  const [country, setCountry] = useState('');
  const [result, setResult] = useState<{ matches: any[]; empty?: boolean } | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      track(EVENTS.eligibility, { country: country || undefined });
      const res = await fetch('/api/public/match/eligibility', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gpa, ielts, budget, country: country || undefined }),
      });
      const data = await res.json();
      setResult(Array.isArray(data) ? { matches: data } : data);
    } finally {
      setLoading(false);
    }
  };

  return (
    <ArtifactShell title="Eligibility Checker" caption="Real match Â· from our university database">
      <div className="space-y-3">
        {FIELDS.map((f) => (
          <label key={f.key} className="block">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-brand-textLight">{f.label}</span>
            <input
              type="number"
              min={f.min}
              max={f.max}
              step={f.step}
              value={f.key === 'gpa' ? gpa : f.key === 'ielts' ? ielts : budget}
              onChange={(e) => {
                const v = Number(e.target.value);
                if (f.key === 'gpa') setGpa(v);
                else if (f.key === 'ielts') setIelts(v);
                else setBudget(v);
              }}
              className="w-full rounded-xl border border-brand-navy/10 bg-white px-3 py-2 text-sm text-brand-navy focus:border-brand-gold focus:outline-none"
            />
          </label>
        ))}
        <input
          value={country}
          onChange={(e) => setCountry(e.target.value)}
          placeholder="Country preference (optional)"
          className="w-full rounded-xl border border-brand-navy/10 bg-white px-3 py-2 text-sm text-brand-navy focus:border-brand-gold focus:outline-none"
        />

        <button
          onClick={run}
          disabled={loading}
          className="w-full rounded-full bg-brand-gold py-2.5 text-xs font-bold uppercase tracking-wider text-brand-navy transition-all hover:bg-brand-gold-hover hover:text-white disabled:opacity-50"
        >
          {loading ? 'Matching...' : 'Check My Eligibility'}
        </button>

        {result && (
          <div className="space-y-2">
            {result.empty ? (
              <p className="rounded-xl bg-brand-gold/10 px-3 py-2 text-xs text-brand-textLight">
                Few universities in our index yet â€” check back shortly.
              </p>
            ) : (result.matches?.length ?? 0) === 0 ? (
              <p className="rounded-xl bg-brand-gold/10 px-3 py-2 text-xs text-brand-textLight">
                No strong matches for those numbers â€” speak with a counselor for a tailored list.
              </p>
            ) : (
              result.matches.map((m: any) => (
                <div key={m.id} className="flex items-center justify-between rounded-xl border border-brand-navy/5 bg-white/70 px-3.5 py-2.5">
                  <div>
                    <p className="text-xs font-bold text-brand-navy">{m.name}</p>
                    <p className="text-[10px] text-brand-textLight">{m.country} Â· {m.intake}</p>
                  </div>
                  <span className="rounded-full bg-brand-gold/15 px-2.5 py-1 text-xs font-bold text-brand-gold">{m.matchPct}%</span>
                </div>
              ))
            )}
          </div>
        )}
      </div>
    </ArtifactShell>
  );
}