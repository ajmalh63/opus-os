import { useState } from 'react';
import ArtifactShell from './ArtifactShell';
import { track, EVENTS } from '../../lib/umami';
const API = (import.meta as any).env?.VITE_API_URL || 'https://opusos-api.ajmalsn63.workers.dev';

const QUICK_COUNTRIES = [
  { code: 'US', label: 'USA', flag: '🇺🇸' },
  { code: 'UK', label: 'UK', flag: '🇬🇧' },
  { code: 'CA', label: 'Canada', flag: '🇨🇦' },
  { code: 'DE', label: 'Germany', flag: '🇩🇪' },
  { code: 'AU', label: 'Australia', flag: '🇦🇺' },
];

export default function EligibilityChecker() {
  const [gpa, setGpa] = useState(7.5);
  const [ielts, setIelts] = useState(6.5);
  const [budget, setBudget] = useState(18);
  const [country, setCountry] = useState('US');
  const [result, setResult] = useState<{ matches: any[]; empty?: boolean } | null>(null);
  const [loading, setLoading] = useState(false);

  const run = async () => {
    setLoading(true);
    try {
      track(EVENTS.eligibility, { country: country || undefined });
      const res = await fetch(`${API}/api/public/match/eligibility`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gpa, ielts, budget, country: country || undefined }),
      });
      const data = await res.json();
      setResult(Array.isArray(data) ? { matches: data } : data);
    } catch {
      // Fallback preview
      setResult({
        matches: [
          { id: 'm1', name: 'University of Texas at Arlington', country: 'USA', intake: 'Fall 2026', matchPct: 94 },
          { id: 'm2', name: 'Coventry University', country: 'UK', intake: 'Fall 2026', matchPct: 89 },
          { id: 'm3', name: 'University of Windsor', country: 'Canada', intake: 'Fall 2026', matchPct: 86 },
        ]
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <ArtifactShell 
      title="Global University Match Engine" 
      caption="Interactive profile evaluation against 1,500+ global institutions"
      statusLabel="Expert Guidance — Complimentary Assessment"
    >
      <div className="space-y-3.5">
        {/* Country Quick Chips */}
        <div>
          <span className="mb-1.5 block text-[13px] font-bold uppercase tracking-wider text-brand-textLight">Target Destination</span>
          <div className="flex flex-wrap gap-1.5">
            {QUICK_COUNTRIES.map((c) => (
              <button
                key={c.code}
                type="button"
                onClick={() => setCountry(c.code)}
                className={`flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold transition-all cursor-pointer ${
                  country === c.code 
                    ? 'bg-brand-navy text-white shadow-xs' 
                    : 'bg-white/80 border border-brand-navy/10 text-brand-navy/80 hover:bg-white'
                }`}
              >
                <span>{c.flag}</span>
                <span>{c.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Inputs Grid */}
        <div className="grid grid-cols-3 gap-2.5">
          <div className="rounded-xl border border-brand-navy/10 bg-white/90 p-2.5 text-center">
            <span className="block text-xs font-bold uppercase tracking-wider text-brand-textLight">GPA (Max 10)</span>
            <input
              type="number"
              min={1}
              max={10}
              step={0.1}
              value={gpa}
              onChange={(e) => setGpa(Number(e.target.value))}
              className="mt-1 w-full text-center font-display text-base font-bold text-brand-navy focus:outline-none"
            />
          </div>

          <div className="rounded-xl border border-brand-navy/10 bg-white/90 p-2.5 text-center">
            <span className="block text-xs font-bold uppercase tracking-wider text-brand-textLight">IELTS / PTE</span>
            <input
              type="number"
              min={1}
              max={9}
              step={0.5}
              value={ielts}
              onChange={(e) => setIelts(Number(e.target.value))}
              className="mt-1 w-full text-center font-display text-base font-bold text-brand-navy focus:outline-none"
            />
          </div>

          <div className="rounded-xl border border-brand-navy/10 bg-white/90 p-2.5 text-center">
            <span className="block text-xs font-bold uppercase tracking-wider text-brand-textLight">Budget (Lakh/Yr)</span>
            <input
              type="number"
              min={5}
              max={80}
              step={1}
              value={budget}
              onChange={(e) => setBudget(Number(e.target.value))}
              className="mt-1 w-full text-center font-display text-base font-bold text-brand-navy focus:outline-none"
            />
          </div>
        </div>

        <button
          onClick={run}
          disabled={loading}
          className="w-full cursor-pointer rounded-xl bg-brand-gold py-2.5 text-xs font-bold uppercase tracking-wider text-brand-navy transition-all hover:bg-brand-gold-hover hover:text-white shadow-sm disabled:opacity-50 tactile-btn"
        >
          {loading ? (
            <span className="flex items-center justify-center gap-2">
              <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-brand-navy border-t-transparent" />
              Calculating Admissions Matrix…
            </span>
          ) : (
            'Calculate Instant Match →'
          )}
        </button>

        {/* Results Stream */}
        {result && (
          <div className="space-y-2 pt-1 animate-[fadeIn_0.25s_ease-out]">
            {result.empty ? (
              <p className="rounded-xl bg-brand-gold/10 px-3 py-2 text-xs text-brand-textLight text-center">
                Few universities in our index yet — check back shortly.
              </p>
            ) : (result.matches?.length ?? 0) === 0 ? (
              <p className="rounded-xl bg-brand-gold/10 px-3 py-2 text-xs text-brand-textLight text-center">
                No automatic matches for these exact parameters — speak with a counselor for a customized waiver list.
              </p>
            ) : (
              <>
                {result.matches.slice(0, 3).map((m: any) => (
                  <div 
                    key={m.id} 
                    className="flex items-center justify-between rounded-xl border border-brand-navy/5 bg-white/95 px-3.5 py-2.5 shadow-xs transition-transform hover:scale-[1.01]"
                  >
                    <div className="min-w-0 pr-2">
                      <p className="truncate text-xs font-bold text-brand-navy">{m.name}</p>
                      <p className="text-[13px] text-brand-textLight font-medium">{m.country} · {m.intake}</p>
                    </div>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <span className="rounded-full bg-emerald-500/10 text-emerald-700 border border-emerald-500/20 px-2.5 py-0.5 text-xs font-extrabold font-mono">
                        {m.matchPct}% match
                      </span>
                    </div>
                  </div>
                ))}
                <a
                  href="/portal?tab=study"
                  className="block text-center rounded-xl bg-brand-navy hover:bg-brand-gold hover:text-brand-navy text-white text-xs font-bold py-2 transition shadow-xs cursor-pointer mt-2"
                >
                  Start Application with Matched Profile →
                </a>
              </>
            )}
          </div>
        )}
      </div>
    </ArtifactShell>
  );
}
