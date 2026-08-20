import React, { useState, useMemo } from 'react';
import { getBookingUrlForDivision } from '../../config/booking';
import BookingModal from '../BookingModal';
import { track, EVENTS } from '../../lib/umami';

interface DestinationProfile {
  name: string;
  flag: string;
  minRecommendedFundsLakhs: number;
  itrRequirement: string;
  interviewMandatory: boolean;
  baseRejectionRisk: number; // percentage
}

const DESTINATIONS: Record<string, DestinationProfile> = {
  dubai: {
    name: 'Dubai (UAE) E-Visa',
    flag: '🇦🇪',
    minRecommendedFundsLakhs: 1.5,
    itrRequirement: 'Not Mandatory',
    interviewMandatory: false,
    baseRejectionRisk: 2,
  },
  schengen: {
    name: 'Schengen Europe (France / Germany / Switzerland)',
    flag: '🇪🇺',
    minRecommendedFundsLakhs: 3.5,
    itrRequirement: 'Last 2–3 Years (₹5L+ recommended)',
    interviewMandatory: false,
    baseRejectionRisk: 12,
  },
  usa: {
    name: 'United States (B1/B2 Tourist & Business / F-1)',
    flag: '🇺🇸',
    minRecommendedFundsLakhs: 5.0,
    itrRequirement: 'Last 3 Years Form 16 / ITR-V',
    interviewMandatory: true,
    baseRejectionRisk: 18,
  },
  uk: {
    name: 'United Kingdom (Standard Visitor)',
    flag: '🇬🇧',
    minRecommendedFundsLakhs: 4.0,
    itrRequirement: 'Last 2 Years',
    interviewMandatory: false,
    baseRejectionRisk: 8,
  },
  thailand: {
    name: 'Thailand E-VOA & Tourist',
    flag: '🇹🇭',
    minRecommendedFundsLakhs: 1.0,
    itrRequirement: 'Not Required',
    interviewMandatory: false,
    baseRejectionRisk: 1,
  },
  singapore: {
    name: 'Singapore E-Visa',
    flag: '🇸🇬',
    minRecommendedFundsLakhs: 2.0,
    itrRequirement: '1–2 Years',
    interviewMandatory: false,
    baseRejectionRisk: 4,
  },
};

export default function VisaRiskDiagnostic() {
  const [destKey, setDestKey] = useState<string>('schengen');
    const [bookingOpen, setBookingOpen] = useState(false);
  const [travelHistory, setTravelHistory] = useState<'none' | 'few' | 'frequent'>('few');
  const [employmentType, setEmploymentType] = useState<'salaried' | 'business' | 'freelancer' | 'student'>('salaried');
  const [liquidFundsLakhs, setLiquidFundsLakhs] = useState<number>(4.0);
  const [hasItr, setHasItr] = useState<boolean>(true);

  // Express lead gate state
  const [unlockedReport, setUnlockedReport] = useState<boolean>(false);
  const [leadName, setLeadName] = useState('');
  const [leadPhone, setLeadPhone] = useState('');
  const [submittingLead, setSubmittingLead] = useState(false);

  const dest = DESTINATIONS[destKey] || DESTINATIONS.schengen;

  const scoreAnalysis = useMemo(() => {
    let score = 100 - dest.baseRejectionRisk;
    const riskFactors: string[] = [];
    const positiveFactors: string[] = [];

    // 1. Funds evaluation
    if (liquidFundsLakhs < dest.minRecommendedFundsLakhs) {
      score -= 22;
      riskFactors.push(`Bank balance (₹${liquidFundsLakhs}L) is below recommended minimum ₹${dest.minRecommendedFundsLakhs}L for ${dest.name}.`);
    } else {
      score += 4;
      positiveFactors.push(`Sufficient liquid funds maintained (₹${liquidFundsLakhs}L vs ₹${dest.minRecommendedFundsLakhs}L requirement).`);
    }

    // 2. Travel History
    if (travelHistory === 'none' && (destKey === 'usa' || destKey === 'schengen')) {
      score -= 14;
      riskFactors.push('Blank passport travel history — requires stronger proof of financial & family ties to India.');
    } else if (travelHistory === 'frequent') {
      score += 6;
      positiveFactors.push('Strong prior international travel stamps establish high genuine visitor credibility.');
    }

    // 3. ITR / Tax Filing
    if (!hasItr && dest.itrRequirement !== 'Not Required') {
      score -= 18;
      riskFactors.push('Lack of official ITR filings requires notarized sponsorship or asset valuation certificates.');
    } else if (hasItr) {
      positiveFactors.push('Documented ITR filings verify legitimate economic standing.');
    }

    // 4. Employment Stability
    if (employmentType === 'salaried') {
      positiveFactors.push('Stable salaried employment with NOC & payslips gives high consular clearance.');
    } else if (employmentType === 'business') {
      positiveFactors.push('GST registration & business bank statements provide strong self-sustenance proof.');
    }

    // Clamp score
    const finalScore = Math.min(99, Math.max(45, score));
    const tier = finalScore >= 88 ? 'high' : finalScore >= 70 ? 'medium' : 'action_needed';

    return {
      finalScore,
      tier,
      riskFactors,
      positiveFactors,
    };
  }, [dest, destKey, travelHistory, employmentType, liquidFundsLakhs, hasItr]);

  const handleUnlockChecklist = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittingLead(true);
    try {
      await fetch('/api/public/leads/express', { credentials: 'include', 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: leadName.trim(),
          phone: leadPhone.trim(),
          division: 'visa',
          targetCountry: dest.name,
          goal: `Visa Risk Diagnostic: ${scoreAnalysis.finalScore}% Approval Score for ${dest.name}`,
          context: {
            score: scoreAnalysis.finalScore,
            liquidFundsLakhs,
            hasItr,
            travelHistory,
            employmentType,
          },
        }),
      });
      track(EVENTS.leadSubmit, { division: 'visa_diagnostic' });
      setUnlockedReport(true);
    } catch {
      setUnlockedReport(true);
    } finally {
      setSubmittingLead(false);
    }
  };

  return (
    <>
    <section id="visa-diagnostic" className="bg-[#051c36] text-white py-20 sm:py-24 border-y border-brand-gold/15 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="hero-orb left-10 top-1/4 h-80 w-80 bg-emerald-500/10 blur-3xl" />
        <div className="hero-orb right-0 bottom-0 h-96 w-96 bg-brand-gold/10 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-7xl px-5 sm:px-6 md:px-8">
        <div className="mb-12 text-center space-y-3">
          <span className="rounded-full bg-emerald-500/20 border border-emerald-400/40 px-3.5 py-1 text-[11px] font-bold uppercase tracking-wider text-emerald-300 font-mono">
            🛡️ Free Consular Risk Diagnostic
          </span>
          <h2 className="font-display fluid-h2 font-extrabold text-white tracking-tight">
            Embassy Visa Approval Probability & Risk Analyzer
          </h2>
          <p className="text-sm text-white/70 max-w-2xl mx-auto">
            Test your profile against official consular benchmarks for Schengen, US, UK, and UAE to catch document red flags before submitting.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Diagnostic Controls */}
          <div className="lg:col-span-5 glass-light p-6 sm:p-7 rounded-3xl text-brand-navy shadow-2xl space-y-4.5">
            {/* Country Selector */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-brand-textLight mb-1.5">
                Target Travel Destination
              </label>
              <select
                value={destKey}
                onChange={(e) => setDestKey(e.target.value)}
                className="w-full rounded-xl border border-brand-navy/15 bg-white px-3.5 py-2.5 text-xs font-bold text-brand-navy focus:border-brand-gold focus:outline-none"
              >
                {Object.entries(DESTINATIONS).map(([key, data]) => (
                  <option key={key} value={key}>
                    {data.flag} {data.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Travel History */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-brand-textLight mb-1.5">
                Passport Travel History
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {[
                  { id: 'none', label: 'Fresh / Blank' },
                  { id: 'few', label: '1–2 Countries' },
                  { id: 'frequent', label: '3+ (Frequent)' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setTravelHistory(item.id as any)}
                    className={`rounded-xl border py-2 text-xs font-bold transition cursor-pointer text-center ${
                      travelHistory === item.id
                        ? 'border-brand-navy bg-brand-navy text-white'
                        : 'border-brand-navy/15 bg-white text-brand-navy/80 hover:bg-slate-50'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Employment Status */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-brand-textLight mb-1.5">
                Primary Employment Status
              </label>
              <select
                value={employmentType}
                onChange={(e) => setEmploymentType(e.target.value as any)}
                className="w-full rounded-xl border border-brand-navy/15 bg-white px-3.5 py-2.5 text-xs font-bold text-brand-navy focus:border-brand-gold focus:outline-none"
              >
                <option value="salaried">Salaried Professional (With Form 16 / Payslips)</option>
                <option value="business">Self-Employed / Business Owner (GST Registered)</option>
                <option value="freelancer">Independent Contractor / Consultant</option>
                <option value="student">Student / Dependent (Sponsored by Family)</option>
              </select>
            </div>

            {/* Liquid Bank Balance Slider */}
            <div>
              <div className="flex justify-between text-xs font-bold mb-1">
                <span className="text-brand-textLight uppercase tracking-wider text-[10px]">Available Liquid Bank Funds</span>
                <span className="text-brand-gold-hover font-mono text-sm font-bold">₹{liquidFundsLakhs.toFixed(1)} Lakhs</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="15.0"
                step="0.5"
                value={liquidFundsLakhs}
                onChange={(e) => setLiquidFundsLakhs(parseFloat(e.target.value))}
                className="w-full accent-brand-gold cursor-pointer"
              />
              <span className="text-[10px] text-brand-textLight block mt-0.5">
                Recommended benchmark for {dest.name}: ₹{dest.minRecommendedFundsLakhs}L+
              </span>
            </div>

            {/* Tax Filing ITR Toggle */}
            <div className="flex items-center justify-between p-3 rounded-xl bg-white/70 border border-brand-navy/10">
              <div>
                <p className="font-bold text-xs text-brand-navy">Official Income Tax Returns (ITR)</p>
                <p className="text-[10px] text-brand-textLight">Filed with Govt. of India for last 1–3 years</p>
              </div>
              <button
                type="button"
                onClick={() => setHasItr(!hasItr)}
                className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                  hasItr ? 'bg-brand-navy' : 'bg-slate-300'
                }`}
              >
                <span
                  className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                    hasItr ? 'translate-x-5' : 'translate-x-0'
                  }`}
                />
              </button>
            </div>
          </div>

          {/* Results & Scorecard */}
          <div className="lg:col-span-7 space-y-4">
            {/* Scorecard Hero Banner */}
            <div className="rounded-3xl border border-white/15 bg-white/10 p-6 backdrop-blur-md">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-5">
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-white/70 font-mono block mb-1">
                    Consular Assessment Algorithm v3.1
                  </span>
                  <h3 className="font-display text-xl sm:text-2xl font-bold text-white flex items-center gap-2">
                    <span>{dest.flag}</span>
                    <span>{dest.name}</span>
                  </h3>
                </div>

                <div className="text-right">
                  <div className={`inline-flex items-baseline gap-1 rounded-2xl px-4 py-2 font-mono ${
                    scoreAnalysis.tier === 'high'
                      ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                      : scoreAnalysis.tier === 'medium'
                      ? 'bg-amber-500/20 text-amber-300 border border-amber-400/40'
                      : 'bg-rose-500/20 text-rose-300 border border-rose-400/40'
                  }`}>
                    <span className="text-3xl font-black">{scoreAnalysis.finalScore}%</span>
                    <span className="text-xs font-bold uppercase tracking-wider">Approval Fit</span>
                  </div>
                </div>
              </div>

              {/* Factors Breakdown */}
              <div className="mt-5 space-y-3">
                <div className="space-y-2">
                  <p className="text-[10px] uppercase tracking-wider text-emerald-300 font-bold">
                    ✓ Verified Profile Strengths
                  </p>
                  {scoreAnalysis.positiveFactors.map((item, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-xs text-white/85">
                      <span className="text-emerald-400 shrink-0 mt-0.5">●</span>
                      <span>{item}</span>
                    </div>
                  ))}
                </div>

                {scoreAnalysis.riskFactors.length > 0 && (
                  <div className="space-y-2 pt-3 border-t border-white/10">
                    <p className="text-[10px] uppercase tracking-wider text-amber-300 font-bold">
                      ⚠️ Identified Consular Vulnerabilities & Fixes
                    </p>
                    {scoreAnalysis.riskFactors.map((item, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-xs text-amber-200">
                        <span className="text-amber-400 shrink-0 mt-0.5">▲</span>
                        <span>{item}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            {/* Lead Capture or Full Document Checklist */}
            {!unlockedReport ? (
              <div className="rounded-3xl border border-brand-gold/40 bg-brand-gold/15 p-6 backdrop-blur-md">
                <div className="mb-4">
                  <span className="text-[10px] uppercase tracking-wider text-brand-gold font-bold font-mono">
                    Official Consular Document Stack
                  </span>
                  <h4 className="font-display text-base font-bold text-white mt-1">
                    Unlock Verified {dest.name} Document Checklist & Cover Letter
                  </h4>
                  <p className="text-xs text-white/75 mt-0.5">
                    Receive the exact consular cover letter template and verified sponsorship formats for your profile.
                  </p>
                </div>

                <form onSubmit={handleUnlockChecklist} className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
                  <div className="sm:col-span-5">
                    <input
                      type="text"
                      required
                      placeholder="Your Full Name"
                      value={leadName}
                      onChange={(e) => setLeadName(e.target.value)}
                      className="w-full rounded-xl border border-white/20 bg-white/90 px-3.5 py-2.5 text-xs text-brand-navy placeholder:text-brand-textLight/70 focus:bg-white focus:outline-none"
                    />
                  </div>
                  <div className="sm:col-span-4">
                    <input
                      type="tel"
                      required
                      placeholder="WhatsApp Phone"
                      value={leadPhone}
                      onChange={(e) => setLeadPhone(e.target.value)}
                      className="w-full rounded-xl border border-white/20 bg-white/90 px-3.5 py-2.5 text-xs text-brand-navy placeholder:text-brand-textLight/70 focus:bg-white focus:outline-none"
                    />
                  </div>
                  <div className="sm:col-span-3">
                    <button
                      type="submit"
                      disabled={submittingLead}
                      className="w-full cursor-pointer rounded-xl bg-brand-gold py-2.5 text-xs font-extrabold uppercase tracking-wider text-brand-navy hover:bg-brand-gold-hover hover:text-white transition shadow-md disabled:opacity-50 tactile-btn"
                    >
                      {submittingLead ? 'Unlocking…' : 'Get Checklist →'}
                    </button>
                  </div>
                </form>
              </div>
            ) : (
              <div className="rounded-3xl border border-emerald-400/40 bg-emerald-500/15 p-6 backdrop-blur-md space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-300">
                    ✓ Document Checklist & Cover Letter Ready
                  </span>
                  <span className="text-[10px] text-white/70">Case ID: OP-2026-VISA</span>
                </div>
                <p className="text-xs text-white/90">
                  Our consular documentation desk has prepared your tailored visa checklist. Speak directly with our visa officer to book your priority biometric appointment slot.
                </p>
                <div className="flex flex-wrap gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setBookingOpen(true)}
                    className="tactile-btn inline-flex items-center gap-1.5 rounded-full bg-brand-gold px-4.5 py-2 text-xs font-bold uppercase tracking-wider text-brand-navy hover:bg-brand-gold-hover hover:text-white transition shadow-sm cursor-pointer"
                  >
                    <span>📅 Book 1-on-1 Visa Verification Call</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </section>
      <BookingModal
        open={bookingOpen}
        onClose={() => setBookingOpen(false)}
        division="visa"
        fallbackUrl={getBookingUrlForDivision('visa')}
      />
    </>
  );
}
