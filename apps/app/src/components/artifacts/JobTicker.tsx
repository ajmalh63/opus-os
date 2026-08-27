import { useEffect, useState } from 'react';
import ArtifactShell from './ArtifactShell';
import { track, EVENTS } from '../../lib/umami';

interface Job { id: string; title: string; country: string; sector: string; salaryText: string; }

const FALLBACK_JOBS: Job[] = [
  { id: 'j1', title: 'Senior Structural Engineer', country: 'United Arab Emirates', sector: 'Civil Infrastructure', salaryText: 'AED 18,000 / mo' },
  { id: 'j2', title: 'Registered ICU Staff Nurse', country: 'Kingdom of Saudi Arabia', sector: 'Healthcare MOH', salaryText: 'SAR 9,500 / mo' },
  { id: 'j3', title: 'HVAC Plant Maintenance Supervisor', country: 'Qatar', sector: 'Energy & FM', salaryText: 'QAR 8,200 / mo' },
  { id: 'j4', title: 'CNC Machine Operator & Programmer', country: 'Germany', sector: 'Manufacturing (EU FastTrack)', salaryText: '€3,200 / mo' },
];

export default function JobTicker() {
  const [jobs, setJobs] = useState<Job[]>(FALLBACK_JOBS);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/public/jobs');
        const data = await res.json();
        if (alive && data.jobs?.length) {
          setJobs(data.jobs);
          track(EVENTS.jobsClick);
        }
      } catch {
        // Keeps fallback
      }
    })();
    return () => { alive = false; };
  }, []);

  return (
    <ArtifactShell 
      title="Verified Overseas Employer Demands" 
      caption="Vacancies — building verified network as we launch"
      statusLabel="Verified Network — Building in Public"
    >
      <div className="space-y-2">
        {jobs.slice(0, 4).map((j, idx) => (
          <div 
            key={j.id} 
            className="flex items-center justify-between gap-3 rounded-xl border border-brand-navy/5 bg-white/95 px-3.5 py-2.5 shadow-xs hover:border-brand-gold/40 transition-colors"
          >
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-xs font-bold text-brand-navy">{j.title}</p>
                {idx === 0 && (
                  <span className="rounded bg-emerald-500/15 text-emerald-700 px-1.5 py-0.2 text-xs font-extrabold">
                    NEW
                  </span>
                )}
              </div>
              <p className="text-[13px] text-brand-textLight mt-0.5">{j.country} · {j.sector}</p>
            </div>

            <div className="text-right shrink-0">
              <a 
                href="/portal?tab=jobs"
                className="inline-flex items-center gap-1 rounded-md bg-brand-navy/10 px-2 py-0.5 text-[13px] font-bold text-brand-navy hover:bg-brand-gold hover:text-brand-navy transition-colors cursor-pointer"
              >
                <span>💼</span> Apply via Portal
              </a>
              <span className="text-xs text-brand-textLight block mt-0.5">Employer Sponsored</span>
            </div>
          </div>
        ))}

        <div className="rounded-xl bg-brand-navy/5 px-3 py-2 flex items-center justify-between text-[13px] text-brand-navy font-medium">
          <span>Candidate Sourcing Partner</span>
          <span className="text-brand-gold font-bold">Verified network — building in public</span>
        </div>
      </div>
    </ArtifactShell>
  );
}
