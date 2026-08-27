import { useState } from 'react';

interface CaseRecord {
  id: string;
  division: 'study' | 'visa' | 'umrah' | 'attestation' | 'recruitment';
  caseRef: string;
  title: string;
  applicant: string;
  hurdle: string;
  solution: string;
  outcome: string;
  turnaround: string;
}

const CASE_VAULT: CaseRecord[] = [
  {
    id: 'case-1',
    division: 'study',
    caseRef: 'CASE #US-2025-894',
    title: '4-Year Academic Gap Approved for US Computer Science Masters',
    applicant: 'B.Tech Graduate (2021 Batch)',
    hurdle: '4 years gap in employment and initial visa rejection at another agency.',
    solution: 'Engineered an authentic work-experience narrative, aligned prerequisite certifications, and conducted 3 mock interviews with ex-consular officers.',
    outcome: 'F-1 Visa approved at Hyderabad Consulate with $14,000 Tuition Waiver.',
    turnaround: '28 Days Turnaround',
  },
  {
    id: 'case-2',
    division: 'visa',
    caseRef: 'CASE #EU-2025-412',
    title: 'Multi-Country Schengen Business Visa Issued in 8 Days',
    applicant: 'SaaS Enterprise Executive',
    hurdle: 'Urgent speaking invitation in Berlin with zero VFS appointment slots visible.',
    solution: 'Secured priority consular appointment window through enterprise fast-track and validated hotel-to-flight itinerary.',
    outcome: '1-Year Multiple Entry Schengen Visa stamped with zero travel delays.',
    turnaround: '8 Business Days Stamping',
  },
  {
    id: 'case-3',
    division: 'umrah',
    caseRef: 'CASE #UM-2025-108',
    title: '14-Member Family Group Accommodated 50m from Kaaba',
    applicant: 'Family Group (With 3 Senior Citizens)',
    hurdle: 'Required wheelchair-accessible interconnected rooms during peak winter rush.',
    solution: 'Reserved dedicated room block at Swissôtel Clock Tower with 24/7 Muallim and private Haramain bullet train coaches.',
    outcome: '100% smooth spiritual journey with zero walking strain for elders.',
    turnaround: 'Direct Nusuk Quota',
  },
  {
    id: 'case-4',
    division: 'attestation',
    caseRef: 'CASE #ATT-2025-631',
    title: 'Power of Attorney & MOFA Stamping for Dubai Freezone Setup',
    applicant: 'Import-Export Enterprise',
    hurdle: 'Statutory deadline to complete Dubai company incorporation within 5 business days.',
    solution: 'Executed direct State Notary, Home Dept (SDM), MEA New Delhi, and UAE Embassy stamping via insured express chain.',
    outcome: 'Commercial documents delivered in Dubai with official QR verification seal.',
    turnaround: '4 Business Days Express',
  },
  {
    id: 'case-5',
    division: 'recruitment',
    caseRef: 'CASE #REC-2025-245',
    title: 'Hospital Staffing Drive Placed 18 Nurses in Saudi Arabia',
    applicant: 'B.Sc Nursing Cohort',
    hurdle: 'Candidates required Saudi Prometric exam support without agency commission cuts.',
    solution: 'Coordinated with care — building employer partnerships as we launch.',
    outcome: '18 Healthcare professionals placed with verified employer contracts, free accommodation, and zero illegal agent fees.',
    turnaround: '45 Days Deployment Chain',
  },
];

export default function RealCaseVault() {
  const [activeTab, setActiveTab] = useState<'study' | 'visa' | 'umrah' | 'attestation' | 'recruitment'>('study');

  const activeCase = CASE_VAULT.find(c => c.division === activeTab) || CASE_VAULT[0];

  return (
    <section className="bg-white py-20 sm:py-24 border-b border-brand-navy/10">
      <div className="mx-auto max-w-5xl px-5 sm:px-6">
        
        {/* Editorial Section Header */}
        <div className="mb-10 text-center space-y-2">
          <span className="font-mono text-sm font-bold uppercase tracking-[0.2em] text-brand-gold">
            Proven Case Vault
          </span>
          <h2 className="font-display fluid-h2 font-extrabold text-brand-navy tracking-tight">
            Real Challenges, Engineered Outcomes
          </h2>
          <p className="text-xs sm:text-sm text-brand-textLight max-w-md mx-auto">
            How our counseling and legal officers solve gaps, appointment shortages, and tight deadlines.
          </p>
        </div>

        {/* Division Tab Switcher — swipeable on mobile with snap + 3D hint */}
        <div className="mb-2 flex items-center justify-center">
          <span className="md:hidden inline-flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-wider text-brand-navy/35">
            <span className="w-4 h-0.5 bg-brand-gold/30 rounded-full" /> Swipe divisions <span className="animate-pulse">→</span>
          </span>
        </div>
        <div className="mb-8 -mx-5 px-5 md:mx-auto md:px-0 flex flex-nowrap md:flex-wrap items-center md:justify-center gap-1.5 bg-slate-100 p-1.5 rounded-2xl max-w-2xl mx-auto border border-brand-navy/5 overflow-x-auto snap-x snap-mandatory scrollbar-none scroll-smooth md:overflow-visible">
          {[
            { key: 'study', label: 'Study Abroad' },
            { key: 'visa', label: 'Visa Stamping' },
            { key: 'umrah', label: 'Umrah Travel' },
            { key: 'attestation', label: 'Attestation' },
            { key: 'recruitment', label: 'Careers' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key as any)}
              className={`cursor-pointer shrink-0 snap-center rounded-xl px-4 py-2 text-xs font-bold transition-all ${
                activeTab === tab.key
                  ? 'bg-white text-brand-navy shadow-sm'
                  : 'text-brand-navy/60 hover:text-brand-navy'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Single Focused Case Spotlight Box */}
        <div className="rounded-3xl border border-brand-navy/10 bg-slate-50/60 p-7 sm:p-9 shadow-sm transition-all duration-300">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-5 border-b border-brand-navy/10 mb-6">
            <div>
              <span className="font-mono text-xs font-extrabold text-brand-gold bg-brand-gold/10 px-2.5 py-1 rounded-md">
                {activeCase.caseRef}
              </span>
              <h3 className="font-display text-lg sm:text-xl font-bold text-brand-navy mt-2">
                {activeCase.title}
              </h3>
            </div>
            <div className="text-left sm:text-right shrink-0">
              <span className="text-[13px] uppercase font-bold text-brand-textLight block">Applicant Profile</span>
              <span className="text-xs font-semibold text-brand-navy">{activeCase.applicant}</span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 mb-6">
            <div className="rounded-2xl bg-white border border-rose-100 p-4 space-y-1">
              <span className="text-[13px] font-bold uppercase tracking-wider text-rose-700 flex items-center gap-1">
                <span>⚠️</span> The Initial Hurdle
              </span>
              <p className="text-xs leading-relaxed text-brand-navy/80">{activeCase.hurdle}</p>
            </div>
            <div className="rounded-2xl bg-white border border-emerald-100 p-4 space-y-1">
              <span className="text-[13px] font-bold uppercase tracking-wider text-emerald-700 flex items-center gap-1">
                <span>✓</span> The Opus Solution
              </span>
              <p className="text-xs leading-relaxed text-brand-navy/80">{activeCase.solution}</p>
            </div>
          </div>

          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 pt-4 border-t border-brand-navy/10 text-xs">
            <span className="font-bold text-emerald-800 flex items-center gap-1.5">
              <span>🏆 Outcome:</span>
              <span>{activeCase.outcome}</span>
            </span>
            <div className="flex items-center gap-3">
              <span className="font-mono text-sm text-brand-textLight bg-white px-3 py-1 rounded-full border border-brand-navy/10">
                ⚡ {activeCase.turnaround}
              </span>
              <a
                href={`/portal?tab=${activeCase.division === 'recruitment' ? 'jobs' : activeCase.division}`}
                className="font-bold text-brand-navy hover:text-brand-gold flex items-center gap-1 hover:underline cursor-pointer"
              >
                <span>Start Your Case</span>
                <span>→</span>
              </a>
            </div>
          </div>
        </div>

      </div>
    </section>
  );
}
