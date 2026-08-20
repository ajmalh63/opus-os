const COVENANTS = [
  {
    icon: '🛡️',
    title: 'Zero Document Loss',
    desc: 'Tamper-evident Insured Logistics custody. Zero sub-agent chain risk.',
  },
  {
    icon: '🏛️',
    title: 'Direct MEA Licensing',
    desc: 'Govt. MEA License #MEA-3402 & direct Nusuk Saudi authorization ID.',
  },
  {
    icon: '🔎',
    title: '24-Hour Consular Audit',
    desc: 'Pre-submission file review by senior academic & visa evaluators.',
  },
  {
    icon: '💳',
    title: 'RBI Refund Covenant',
    desc: 'Transparent 7–10 day financial settlement backed by signed terms.',
  },
];

export default function InstitutionalCovenants() {
  return (
    <section className="bg-[#061e38] text-white py-14 border-y border-brand-gold/15">
      <div className="mx-auto max-w-7xl px-5 sm:px-6">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 lg:gap-10">
          {COVENANTS.map((cov, idx) => (
            <div key={idx} className="flex items-start gap-4">
              <span className="text-2xl shrink-0 p-2.5 rounded-2xl bg-white/5 border border-white/10">{cov.icon}</span>
              <div>
                <h3 className="font-display text-sm font-bold text-white tracking-tight mb-1 flex items-center gap-2">
                  {cov.title}
                </h3>
                <p className="text-xs text-white/65 leading-relaxed">
                  {cov.desc}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
