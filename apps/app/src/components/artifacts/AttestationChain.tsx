import { useEffect, useState } from 'react';
import ArtifactShell from './ArtifactShell';

interface ChainStep { step: string; fee?: number; feePaise?: number; timelineDays?: number; }
interface Chain { country: string; steps: ChainStep[]; }

const fmtINR = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN')}`;

export default function AttestationChain() {
  const [chains, setChains] = useState<Chain[]>([]);
  const [country, setCountry] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/public/attestation/chains');
        const data = await res.json();
        if (alive) {
          setChains(data.chains ?? []);
          if (data.chains?.length) setCountry(data.chains[0].country);
        }
      } catch {
        if (alive) { setChains([]); }
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  const active = chains.find((c) => c.country === country) ?? null;
  const totalFee = active?.steps.reduce((a, s) => a + (s.feePaise ?? s.fee ?? 0), 0) ?? 0;
  const totalDays = active?.steps.reduce((a, s) => a + (s.timelineDays ?? 0), 0) ?? 0;

  return (
    <ArtifactShell title="Attestation Chain Builder" caption="Every stamp, fee and timeline — transparent">
      {loading ? (
        <div className="space-y-2.5">{[0, 1].map((i) => <div key={i} className="h-12 animate-pulse rounded-xl bg-brand-navy/5" />)}</div>
      ) : chains.length === 0 ? (
        <p className="rounded-xl bg-brand-gold/10 px-3.5 py-3 text-center text-xs text-brand-gold">
          Chain guides for your country are being added — ask us directly.
        </p>
      ) : (
        <div className="space-y-3">
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="w-full rounded-xl border border-brand-navy/10 bg-white px-3 py-2 text-sm text-brand-navy focus:border-brand-gold focus:outline-none"
          >
            {chains.map((c) => <option key={c.country} value={c.country}>{c.country}</option>)}
          </select>

          {active && (
            <>
              <ol className="space-y-2">
                {active.steps.map((s, i) => (
                  <li key={i} className="flex items-center gap-3 rounded-xl border border-brand-navy/5 bg-white/70 px-3.5 py-2.5">
                    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-gold/15 text-[10px] font-bold text-brand-gold">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-brand-navy">{s.step}</p>
                      <p className="text-[10px] text-brand-textLight">{s.timelineDays} days</p>
                    </div>
                    <span className="text-xs font-semibold text-brand-navy">{fmtINR(s.feePaise ?? s.fee ?? 0)}</span>
                  </li>
                ))}
              </ol>
              <div className="flex items-center justify-between rounded-xl bg-brand-gold/10 px-3.5 py-2.5">
                <span className="text-[10px] font-bold uppercase tracking-wider text-brand-gold">Total · ~{totalDays} days</span>
                <span className="text-xs font-bold text-brand-gold">{fmtINR(totalFee)}</span>
              </div>
            </>
          )}
        </div>
      )}
    </ArtifactShell>
  );
}