export default function InstitutionalCovenants() {
  return (
    <section className="bg-[#061e38] text-white py-16 sm:py-20 border-y border-brand-gold/15">
      <div className="mx-auto max-w-7xl px-5 sm:px-6">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center">
          {/* Left — Logo (bigger) */}
          <div className="lg:col-span-5 flex flex-col items-center lg:items-start text-center lg:text-left">
            <img src="/Footer.svg" alt="Opus Overseas" className="h-28 sm:h-32 lg:h-36 w-auto" />
            <p className="text-xs text-white/50 mt-4">British Council Certified Agent #115050 — Ajmal Hussain (Valid 2028)</p>
          </div>

          {/* Right — Why choose Opus Overseas (honest, no false licensing claims) */}
          <div className="lg:col-span-7 space-y-5">
            <h3 className="font-display text-2xl sm:text-3xl font-bold text-white tracking-tight">Why choose Opus Overseas?</h3>
            <p className="text-base sm:text-lg leading-relaxed text-white/80">
              We trade street promises for <span className="text-white font-semibold">verifiable process</span> — every file is checklist-built, every handover is logged, and every fee is itemized before you pay.
            </p>
            <div className="space-y-4 text-sm sm:text-base leading-relaxed text-white/70">
              <p>
                <span className="text-white font-semibold">Because trust must be traceable.</span> — Course-matched shortlisting across multiple destinations, VFS & Embassy dossiers built to the official checklist with senior review, step-by-step attestation tracking (State → MEA → Embassy → MOFA) with insured door-to-door handling, and Haram-proximity stays curated by stay, distance and logistics — not by brochure.
              </p>
              <p>
                <span className="text-white font-semibold">Because your data stays yours.</span> — Privacy-first vaults, DPDP-consented sharing only where needed, itemized fee ledgers with GST invoices, and complete audit trails. No inflated numbers, no hidden sub-agents — just the next clear step, shown live in your workspace.
              </p>
            </div>
            <div className="flex flex-wrap gap-2.5 pt-1">
              <span className="text-[11px] font-bold uppercase tracking-wider bg-white/5 border border-white/10 text-white/70 px-3 py-1.5 rounded-full">British Council #115050</span>
              <span className="text-[11px] font-bold uppercase tracking-wider bg-white/5 border border-white/10 text-white/70 px-3 py-1.5 rounded-full">Checklist-Built Files</span>
              <span className="text-[11px] font-bold uppercase tracking-wider bg-white/5 border border-white/10 text-white/70 px-3 py-1.5 rounded-full">Insured Custody</span>
              <span className="text-[11px] font-bold uppercase tracking-wider bg-white/5 border border-white/10 text-white/70 px-3 py-1.5 rounded-full">Audit-Logged</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
