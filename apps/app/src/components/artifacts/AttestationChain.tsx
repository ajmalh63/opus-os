import { useEffect, useState } from 'react';
import ArtifactShell from './ArtifactShell';

interface ChainStep { 
  step: string; 
  authority?: string; 
  status?: string; 
  timelineDays?: number; 
}

interface Chain { 
  country: string; 
  steps: ChainStep[]; 
}

const FALLBACK_CHAINS: Chain[] = [
  {
    country: 'United Arab Emirates (UAE) 🇦🇪',
    steps: [
      { step: 'State HRD / Home Department Authentication', authority: 'State Higher Education / Secretariat', status: 'HRD Verified', timelineDays: 3 },
      { step: 'Ministry of External Affairs (MEA) Legalization', authority: 'CPV Division, New Delhi', status: 'MEA Sealed', timelineDays: 2 },
      { step: 'UAE Embassy Consular Attestation', authority: 'Embassy of UAE (New Delhi)', status: 'Diplomatic Clearance', timelineDays: 4 },
      { step: 'Ministry of Foreign Affairs (MOFA)', authority: 'MOFA Dubai / Abu Dhabi', status: 'Entry Endorsed', timelineDays: 2 },
    ]
  },
  {
    country: 'Kingdom of Saudi Arabia (KSA) 🇸🇦',
    steps: [
      { step: 'University Verification & State HRD', authority: 'University Registrar & State Dept', status: 'Genuineness Verified', timelineDays: 4 },
      { step: 'MEA Official Authentication', authority: 'Ministry of External Affairs', status: 'MEA Stamped', timelineDays: 2 },
      { step: 'Saudi Cultural & Embassy Attestation', authority: 'Royal Embassy of Saudi Arabia', status: 'Enjaz Approved', timelineDays: 5 },
    ]
  },
  {
    country: 'Hague Convention Treaty (USA 🇺🇸 / UK 🇬🇧 / EU 🇪🇺)',
    steps: [
      { step: 'State Secretariat / SDM Verification', authority: 'Sub-Divisional Magistrate / State', status: 'Authenticated', timelineDays: 2 },
      { step: 'Official MEA Apostille Sticker Chain', authority: 'Ministry of External Affairs (MEA)', status: 'MEA Apostille Stamped', timelineDays: 2 },
    ]
  },
  {
    country: 'Qatar / Kuwait / Oman / Bahrain 🇶🇦 🇰🇼 🇴🇲',
    steps: [
      { step: 'State Notary & HRD Verification', authority: 'State Home Department', status: 'State Certified', timelineDays: 3 },
      { step: 'MEA Legalization Seal', authority: 'Ministry of External Affairs', status: 'MEA Authenticated', timelineDays: 2 },
      { step: 'Consular & Gulf Embassy Stamping', authority: 'Respective Embassy / Mission', status: 'Consular Clearance', timelineDays: 4 },
    ]
  }
];

export default function AttestationChain() {
  const [chains, setChains] = useState<Chain[]>(FALLBACK_CHAINS);
  const [country, setCountry] = useState(FALLBACK_CHAINS[0].country);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/public/attestation/chains');
        const data = await res.json();
        if (alive && data.chains?.length) {
          // Normalize to preserve status/authority fields
          const normalized = data.chains.map((c: any) => ({
            country: c.country,
            steps: c.steps.map((s: any, idx: number) => ({
              step: s.step,
              authority: s.authority || 'Government Authority',
              status: s.status || (idx === 0 ? 'State Verified' : idx === 1 ? 'MEA Sealed' : 'Consular Cleared'),
              timelineDays: s.timelineDays || 2,
            }))
          }));
          setChains(normalized);
          setCountry(normalized[0].country);
        }
      } catch {
        // Fallback to rich pre-configured matrix
      }
    })();
    return () => { alive = false; };
  }, []);

  const active = chains.find((c) => c.country === country) || chains[0];
  const totalDays = active?.steps.reduce((a, s) => a + (s.timelineDays ?? 0), 0) ?? 0;

  return (
    <ArtifactShell 
      title="Apostille & Legalization Stamp Matrix" 
      caption="Transparent step-by-step government authentication breakdown"
      statusLabel="MEA Verified"
    >
      <div className="space-y-3">
        {/* Country Selector */}
        <div>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-brand-textLight">
            Select Destination Country / Treaty
          </label>
          <select
            value={country}
            onChange={(e) => setCountry(e.target.value)}
            className="w-full rounded-xl border border-brand-navy/10 bg-white px-3.5 py-2 text-xs sm:text-sm font-semibold text-brand-navy focus:border-brand-gold focus:outline-none"
          >
            {chains.map((c) => <option key={c.country} value={c.country}>{c.country}</option>)}
          </select>
        </div>

        {/* Dynamic Stamp Step Sequence */}
        {active && (
          <div className="space-y-2 pt-1">
            <ol className="space-y-2">
              {active.steps.map((s, i) => (
                <li key={i} className="flex items-center gap-3 rounded-xl border border-brand-navy/5 bg-white/95 px-3.5 py-2.5 text-xs shadow-xs hover:border-brand-gold/30 transition-colors">
                  <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-gold/15 text-[10px] font-extrabold text-brand-gold font-mono">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-bold text-brand-navy">{s.step}</p>
                    <p className="text-[10px] text-brand-textLight">
                      {s.authority ? `${s.authority} · ` : ''}Est. {s.timelineDays} working days
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-1.5 shrink-0 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700">
                    <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                    {s.status || 'Verified Protocol'}
                  </span>
                </li>
              ))}
            </ol>

            {/* Total Summary Footer */}
            <div className="flex items-center justify-between rounded-xl bg-gradient-to-r from-brand-gold/20 to-brand-gold/10 border border-brand-gold/30 px-3.5 py-2.5">
              <span className="text-[10px] font-bold uppercase tracking-wider text-brand-navy">
                Total Processing SLA: ~{totalDays} Working Days
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] font-bold text-brand-navy bg-white/80 px-2.5 py-1 rounded-lg border border-brand-gold/40 shadow-xs">
                🔒 Insured Custody & MEA Apostille
              </span>
            </div>
          </div>
        )}
      </div>
    </ArtifactShell>
  );
}
