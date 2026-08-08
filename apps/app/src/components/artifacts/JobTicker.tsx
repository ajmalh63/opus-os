import { useEffect, useState } from 'react';
import ArtifactShell from './ArtifactShell';

interface Job { id: string; title: string; country: string; sector: string; salaryText: string; }

// LIVE ARTIFACT (slide 5, §24.1.1): global job ticker — real /api/public/jobs
export default function JobTicker() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/public/jobs');
        const data = await res.json();
        if (alive) setJobs(data.jobs ?? []);
      } catch {
        if (alive) setJobs([]);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  return (
    <ArtifactShell title="Live Global Jobs" caption="Vetted employers · real salaries · open today">
      {loading ? (
        <div className="space-y-2.5">{[0, 1, 2].map((i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-brand-navy/5" />)}</div>
      ) : jobs.length === 0 ? (
        <p className="rounded-xl bg-brand-gold/10 px-3.5 py-3 text-center text-xs text-brand-gold">
          Fresh openings drop weekly — subscribe to get them first.
        </p>
      ) : (
        <ul className="space-y-2">
          {jobs.slice(0, 4).map((j, idx) => (
            <li key={j.id} className="flex items-center gap-3 rounded-xl border border-brand-navy/5 bg-white/70 px-3.5 py-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-gold/10 text-sm" aria-hidden="true">
                {j.country.slice(0, 2).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs font-bold text-brand-navy">{j.title}</p>
                <p className="text-[10px] text-brand-textLight">{j.country} · {j.sector}</p>
              </div>
              <div className="text-right">
                <p className="text-xs font-semibold text-brand-gold">{j.salaryText}</p>
                {idx === 0 && <span className="text-[9px] font-bold text-emerald-500">NEW</span>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </ArtifactShell>
  );
}