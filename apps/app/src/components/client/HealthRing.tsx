export function HealthRing({ score, tier }: { score: number, tier: 'green'|'yellow'|'red' }) {
  const color = tier === 'green' ? '#10b981' : tier === 'yellow' ? '#f59e0b' : '#ef4444';
  const bg = tier === 'green' ? 'bg-emerald-500/10' : tier === 'yellow' ? 'bg-amber-500/10' : 'bg-red-500/10';
  const circumference = 2 * Math.PI * 44;
  const offset = circumference * (1 - score/100);
  return (
    <div className={`rounded-2xl border border-brand-navy/10 bg-white p-4 flex items-center gap-4 ${bg}`}>
      <div className="relative w-24 h-24">
        <svg width="96" height="96" viewBox="0 0 96 96" className="transform -rotate-90">
          <circle cx="48" cy="48" r="44" stroke="rgba(10,45,80,0.08)" strokeWidth="8" fill="none" />
          <circle cx="48" cy="48" r="44" stroke={color} strokeWidth="8" fill="none" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} style={{ transition: 'stroke-dashoffset 600ms ease' }} />
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <div className="text-center">
            <div className="font-display font-bold text-xl leading-none" style={{ color }}>{score}</div>
            <div className="text-xs font-bold uppercase tracking-wide text-brand-navy/50">Health</div>
          </div>
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <div className="text-xs font-bold text-brand-navy">Journey Health</div>
        <div className="text-sm text-brand-navy/60 mt-1">
          {tier==='green' ? 'On track — keep momentum.' : tier==='yellow' ? 'Needs attention — one task overdue.' : 'At risk — action needed today.'}
        </div>
        <div className="mt-2 h-1.5 w-full rounded-full bg-brand-navy/10 overflow-hidden"><div className="h-full rounded-full" style={{ width: `${score}%`, background: color }} /></div>
      </div>
    </div>
  );
}
