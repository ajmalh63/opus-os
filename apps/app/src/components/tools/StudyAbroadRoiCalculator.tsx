import { useState, useMemo } from 'react';
import { CAL_BOOKING_URL, leadFormHref } from '../../config/booking';
import BookingModal from '../BookingModal';
import { track, EVENTS } from '../../lib/umami';

interface CountryData {
  name: string;
  flag: string;
  currency: string;
  currSymbol: string;
  fxRateToInr: number;
  avgTuitionAnnual: number; // in local currency
  avgLivingAnnual: number; // in local currency
  pswvYears: number;
  avgGradSalaryAnnual: number; // in local currency
  popularCities: string[];
}

const COUNTRIES: Record<string, CountryData> = {
  usa: {
    name: 'United States',
    flag: '🇺🇸',
    currency: 'USD',
    currSymbol: '$',
    fxRateToInr: 87.5,
    avgTuitionAnnual: 32000,
    avgLivingAnnual: 15000,
    pswvYears: 3, // STEM OPT
    avgGradSalaryAnnual: 78000,
    popularCities: ['Dallas, TX', 'Boston, MA', 'San Jose, CA', 'New York, NY'],
  },
  uk: {
    name: 'United Kingdom',
    flag: '🇬🇧',
    currency: 'GBP',
    currSymbol: '£',
    fxRateToInr: 111.0,
    avgTuitionAnnual: 18000,
    avgLivingAnnual: 12000,
    pswvYears: 2, // Graduate Route
    avgGradSalaryAnnual: 38000,
    popularCities: ['London', 'Manchester', 'Coventry', 'Birmingham'],
  },
  germany: {
    name: 'Germany',
    flag: '🇩🇪',
    currency: 'EUR',
    currSymbol: '€',
    fxRateToInr: 95.0,
    avgTuitionAnnual: 1500, // Public university semester fees
    avgLivingAnnual: 11208, // Blocked account requirement
    pswvYears: 1.5, // 18-month job seeker
    avgGradSalaryAnnual: 52000,
    popularCities: ['Munich', 'Berlin', 'Frankfurt', 'Aachen'],
  },
  ireland: {
    name: 'Ireland',
    flag: '🇮🇪',
    currency: 'EUR',
    currSymbol: '€',
    fxRateToInr: 95.0,
    avgTuitionAnnual: 16000,
    avgLivingAnnual: 12000,
    pswvYears: 2, // Third level graduate scheme
    avgGradSalaryAnnual: 45000,
    popularCities: ['Dublin', 'Cork', 'Galway', 'Limerick'],
  },
  australia: {
    name: 'Australia',
    flag: '🇦🇺',
    currency: 'AUD',
    currSymbol: 'A$',
    fxRateToInr: 56.5,
    avgTuitionAnnual: 34000,
    avgLivingAnnual: 24000,
    pswvYears: 3, // Post-study work stream
    avgGradSalaryAnnual: 72000,
    popularCities: ['Melbourne', 'Sydney', 'Brisbane', 'Perth'],
  },
  canada: {
    name: 'Canada',
    flag: '🇨🇦',
    currency: 'CAD',
    currSymbol: 'C$',
    fxRateToInr: 63.0,
    avgTuitionAnnual: 26000,
    avgLivingAnnual: 20635, // GIC requirement
    pswvYears: 3, // PGWP
    avgGradSalaryAnnual: 62000,
    popularCities: ['Toronto', 'Vancouver', 'Montreal', 'Calgary'],
  },
};

export default function StudyAbroadRoiCalculator() {
  const [countryKey, setCountryKey] = useState<string>('usa');
    const [bookingOpen, setBookingOpen] = useState(false);
  const [courseDurationYears, setCourseDurationYears] = useState<number>(2);
  const [scholarshipPercent, setScholarshipPercent] = useState<number>(20);
  const [partTimeIncomeMonthlyInr, setPartTimeIncomeMonthlyInr] = useState<number>(65000); // 20h/wk student job

  const country = COUNTRIES[countryKey] || COUNTRIES.usa;

  const calculations = useMemo(() => {
    // 1. Gross Tuition over course
    const annualTuitionInr = country.avgTuitionAnnual * country.fxRateToInr;
    const netAnnualTuitionInr = annualTuitionInr * (1 - scholarshipPercent / 100);
    const totalTuitionInr = netAnnualTuitionInr * courseDurationYears;

    // 2. Gross Living over course
    const annualLivingInr = country.avgLivingAnnual * country.fxRateToInr;
    const totalLivingInr = annualLivingInr * courseDurationYears;

    // 3. Total Investment
    const grossInvestmentInr = totalTuitionInr + totalLivingInr;

    // 4. Part-time offset during study (9 months per year)
    const partTimeEarningsTotalInr = partTimeIncomeMonthlyInr * 9 * courseDurationYears;
    const netOutOfPocketInr = Math.max(0, grossInvestmentInr - partTimeEarningsTotalInr);

    // 5. Post-study salary & earnings
    const annualGradSalaryInr = country.avgGradSalaryAnnual * country.fxRateToInr;
    const monthlyNetSalaryInr = (annualGradSalaryInr * 0.75) / 12; // Approx 25% tax/living in foreign country
    const estimatedAnnualSavingsPostGradInr = annualGradSalaryInr * 0.45; // 45% net savings potential

    // 6. Break-even payback time in months
    const breakEvenYears = estimatedAnnualSavingsPostGradInr > 0 
      ? (netOutOfPocketInr / estimatedAnnualSavingsPostGradInr).toFixed(1) 
      : '2.0';

    return {
      totalTuitionLakhs: (totalTuitionInr / 100000).toFixed(1),
      totalLivingLakhs: (totalLivingInr / 100000).toFixed(1),
      grossInvestmentLakhs: (grossInvestmentInr / 100000).toFixed(1),
      partTimeOffsetLakhs: (partTimeEarningsTotalInr / 100000).toFixed(1),
      netOutOfPocketLakhs: (netOutOfPocketInr / 100000).toFixed(1),
      annualGradSalaryLakhs: (annualGradSalaryInr / 100000).toFixed(1),
      monthlyNetSalaryInr: Math.round(monthlyNetSalaryInr).toLocaleString('en-IN'),
      breakEvenYears,
      totalPswvEarningsLakhs: ((annualGradSalaryInr * country.pswvYears) / 100000).toFixed(1),
    };
  }, [country, courseDurationYears, scholarshipPercent, partTimeIncomeMonthlyInr]);

  return (
    <>
    <section id="roi-calculator" className="bg-[#05182d] text-white py-20 sm:py-24 border-y border-brand-gold/15 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="hero-orb right-10 top-1/4 h-80 w-80 bg-brand-gold/10 blur-3xl" />
        <div className="hero-orb -left-10 bottom-0 h-96 w-96 bg-brand-blue/20 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-7xl px-5 sm:px-6 md:px-8">
        <div className="mb-12 text-center space-y-3">
          <span className="rounded-full bg-brand-gold/20 border border-brand-gold/40 px-3.5 py-1 text-[11px] font-bold uppercase tracking-wider text-brand-gold font-mono">
            📊 Interactive Financial Modeler
          </span>
          <h2 className="font-display fluid-h2 font-extrabold text-white tracking-tight">
            Post-Study Work Visa (PSWV) & 5-Year Net ROI Calculator
          </h2>
          <p className="text-sm text-white/70 max-w-2xl mx-auto">
            Simulate your total study investment in ₹ Lakhs, part-time student offsets, post-graduation earnings, and break-even payback timeline.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Controls Panel */}
          <div className="lg:col-span-5 glass-light p-6 sm:p-7 rounded-3xl text-brand-navy shadow-2xl space-y-5">
            {/* Country Selector */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-brand-textLight mb-2">
                Destination Country
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {Object.entries(COUNTRIES).map(([key, data]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setCountryKey(key);
                      track(EVENTS.featureClick, { feature: 'roi_country_change', country: key });
                    }}
                    className={`rounded-xl border p-2.5 text-center text-xs font-bold transition cursor-pointer flex flex-col items-center gap-1 ${
                      countryKey === key
                        ? 'border-brand-gold bg-brand-gold/20 text-brand-navy shadow-sm'
                        : 'border-brand-navy/10 bg-white/70 text-brand-navy/80 hover:bg-white'
                    }`}
                  >
                    <span className="text-base">{data.flag}</span>
                    <span className="truncate w-full text-[11px]">{data.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Course Duration */}
            <div>
              <div className="flex justify-between text-xs font-bold mb-1.5">
                <span className="text-brand-textLight uppercase tracking-wider text-[10px]">Program Duration</span>
                <span className="text-brand-navy font-mono text-sm">{courseDurationYears} {courseDurationYears === 1 ? 'Year (Master’s)' : 'Years'}</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {[1, 2, 4].map((yr) => (
                  <button
                    key={yr}
                    type="button"
                    onClick={() => setCourseDurationYears(yr)}
                    className={`rounded-xl border py-2 text-xs font-bold transition cursor-pointer ${
                      courseDurationYears === yr
                        ? 'border-brand-navy bg-brand-navy text-white'
                        : 'border-brand-navy/15 bg-white text-brand-navy/80 hover:bg-slate-50'
                    }`}
                  >
                    {yr === 1 ? '1 Year' : yr === 2 ? '2 Years (PG)' : '4 Years (UG)'}
                  </button>
                ))}
              </div>
            </div>

            {/* Expected Scholarship Waiver */}
            <div>
              <div className="flex justify-between text-xs font-bold mb-1">
                <span className="text-brand-textLight uppercase tracking-wider text-[10px]">Institutional Scholarship Waiver</span>
                <span className="text-emerald-700 font-mono text-sm font-extrabold">{scholarshipPercent}% Waiver</span>
              </div>
              <input
                type="range"
                min="0"
                max="60"
                step="5"
                value={scholarshipPercent}
                onChange={(e) => setScholarshipPercent(parseInt(e.target.value))}
                className="w-full accent-brand-gold cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-brand-textLight mt-1">
                <span>0% (Standard)</span>
                <span>25% (Merit)</span>
                <span>50%+ (Dean's List)</span>
              </div>
            </div>

            {/* Part-time Monthly Offset */}
            <div>
              <div className="flex justify-between text-xs font-bold mb-1">
                <span className="text-brand-textLight uppercase tracking-wider text-[10px]">Est. Student Part-Time Wages</span>
                <span className="text-brand-gold-hover font-mono text-sm font-bold">₹{(partTimeIncomeMonthlyInr / 1000).toFixed(0)}k / month</span>
              </div>
              <input
                type="range"
                min="30000"
                max="120000"
                step="5000"
                value={partTimeIncomeMonthlyInr}
                onChange={(e) => setPartTimeIncomeMonthlyInr(parseInt(e.target.value))}
                className="w-full accent-brand-gold cursor-pointer"
              />
              <p className="text-[10px] text-brand-textLight/80 mt-1">
                Based on legal 20 hrs/week student on-campus & retail work allowances.
              </p>
            </div>
          </div>

          {/* Results Visual Radar */}
          <div className="lg:col-span-7 space-y-4">
            {/* Top Key Takeaway Metrics */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
              <div className="rounded-2xl border border-white/15 bg-white/10 p-4.5 backdrop-blur-md">
                <span className="text-[10px] uppercase tracking-wider text-white/70 font-semibold block mb-1">
                  Net Study Investment
                </span>
                <p className="font-mono text-2xl font-black text-white">
                  ₹{calculations.netOutOfPocketLakhs} <span className="text-xs font-normal text-white/60">Lakhs</span>
                </p>
                <span className="text-[10px] text-emerald-400 font-medium block mt-1">
                  ✓ After ₹{calculations.partTimeOffsetLakhs}L work offset
                </span>
              </div>

              <div className="rounded-2xl border border-brand-gold/30 bg-brand-gold/15 p-4.5 backdrop-blur-md">
                <span className="text-[10px] uppercase tracking-wider text-brand-gold font-bold block mb-1">
                  Starting Graduate Salary
                </span>
                <p className="font-mono text-2xl font-black text-white">
                  ₹{calculations.annualGradSalaryLakhs} <span className="text-xs font-normal text-white/70">LPA</span>
                </p>
                <span className="text-[10px] text-brand-gold font-semibold block mt-1">
                  ≈ {country.currSymbol}{country.avgGradSalaryAnnual.toLocaleString()} / year
                </span>
              </div>

              <div className="rounded-2xl border border-emerald-400/30 bg-emerald-500/15 p-4.5 backdrop-blur-md">
                <span className="text-[10px] uppercase tracking-wider text-emerald-300 font-bold block mb-1">
                  Est. Break-Even Payback
                </span>
                <p className="font-mono text-2xl font-black text-emerald-300">
                  {calculations.breakEvenYears} <span className="text-xs font-normal text-white/70">Years</span>
                </p>
                <span className="text-[10px] text-emerald-200 font-medium block mt-1">
                  ⚡ Inside {country.pswvYears}-Year PSWV Window
                </span>
              </div>
            </div>

            {/* Detailed Breakdown Card */}
            <div className="rounded-2xl border border-white/15 bg-white/10 p-5 backdrop-blur-md space-y-3.5 text-xs text-white/90">
              <h3 className="font-display text-sm font-bold text-white flex items-center justify-between border-b border-white/10 pb-2">
                <span>{country.flag} {country.name} 5-Year Career Trajectory</span>
                <span className="rounded-full bg-emerald-500/20 text-emerald-300 font-mono text-[10px] px-2.5 py-0.5 font-bold">
                  ● {country.pswvYears} Years Post-Study Work Visa
                </span>
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[11px]">
                <div className="p-3 rounded-xl bg-white/5 border border-white/10 space-y-1">
                  <span className="text-white/60 block text-[10px] uppercase">Tuition Fee ({courseDurationYears} Yrs)</span>
                  <p className="font-mono text-white font-bold text-sm">₹{calculations.totalTuitionLakhs} Lakhs</p>
                  <span className="text-[10px] text-emerald-400">Includes {scholarshipPercent}% scholarship discount</span>
                </div>
                <div className="p-3 rounded-xl bg-white/5 border border-white/10 space-y-1">
                  <span className="text-white/60 block text-[10px] uppercase">Est. Living & Accommodation</span>
                  <p className="font-mono text-white font-bold text-sm">₹{calculations.totalLivingLakhs} Lakhs</p>
                  <span className="text-[10px] text-white/70">{country.popularCities.slice(0, 2).join(', ')} benchmark</span>
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-gradient-to-r from-brand-gold/15 to-transparent border border-brand-gold/25 flex items-center justify-between">
                <div>
                  <p className="font-bold text-white text-xs">Total PSWV Potential Career Earnings</p>
                  <p className="text-white/70 text-[10px]">Over full {country.pswvYears}-year legal stay-back employment</p>
                </div>
                <span className="font-mono text-base font-black text-brand-gold">
                  ₹{calculations.totalPswvEarningsLakhs} Lakhs
                </span>
              </div>
            </div>

            {/* Action Card */}
            <div className="rounded-2xl border border-brand-gold/40 bg-brand-gold/15 p-5 text-xs text-white flex flex-wrap items-center justify-between gap-3 shadow-lg">
              <div>
                <p className="font-display font-bold text-white text-sm">Want to maximize your scholarship & fee waiver?</p>
                <p className="text-white/75 text-xs mt-0.5">Our admissions officers verify prerequisite waivers with university boards directly.</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setBookingOpen(true)}
                  className="tactile-btn inline-flex items-center gap-1.5 rounded-full bg-brand-gold px-4.5 py-2.5 text-xs font-bold uppercase tracking-wider text-brand-navy hover:bg-brand-gold-hover hover:text-white transition shadow-sm cursor-pointer"
                >
                  <span>📅 Book Financial Review</span>
                </button>
                <a
                  href={leadFormHref()}
                  className="tactile-btn inline-flex items-center gap-1 rounded-full border border-white/30 bg-white/10 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white hover:bg-white/20 transition"
                >
                  Apply for Shortlisting ↓
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
      <BookingModal
        open={bookingOpen}
        onClose={() => setBookingOpen(false)}
        division="study-abroad"
        fallbackUrl={CAL_BOOKING_URL}
      />
    </>
  );
}
