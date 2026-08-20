import { useState, useMemo } from 'react';
import { track, EVENTS } from '../../lib/umami';
import DomainDarkGraphics from '../DomainDarkGraphics';

interface MarketData {
  name: string;
  flag: string;
  currency: string;
  currSymbol: string;
  fxRateToInr: number;
  isTaxFree: boolean;
  typicalTaxPct: number;
  defaultMonthlySalary: number;
  rentEstimatedLocal: number;
  foodEstimatedLocal: number;
}

const MARKETS: Record<string, MarketData> = {
  uae: {
    name: 'United Arab Emirates (Dubai / Abu Dhabi)',
    flag: '🇦🇪',
    currency: 'AED',
    currSymbol: 'AED',
    fxRateToInr: 23.8,
    isTaxFree: true,
    typicalTaxPct: 0,
    defaultMonthlySalary: 12000,
    rentEstimatedLocal: 3500,
    foodEstimatedLocal: 1500,
  },
  saudi: {
    name: 'Kingdom of Saudi Arabia (Riyadh / Jeddah)',
    flag: '🇸🇦',
    currency: 'SAR',
    currSymbol: 'SAR',
    fxRateToInr: 23.3,
    isTaxFree: true,
    typicalTaxPct: 0,
    defaultMonthlySalary: 10000,
    rentEstimatedLocal: 2500,
    foodEstimatedLocal: 1200,
  },
  qatar: {
    name: 'State of Qatar (Doha)',
    flag: '🇶🇦',
    currency: 'QAR',
    currSymbol: 'QAR',
    fxRateToInr: 24.0,
    isTaxFree: true,
    typicalTaxPct: 0,
    defaultMonthlySalary: 11000,
    rentEstimatedLocal: 3000,
    foodEstimatedLocal: 1400,
  },
  kuwait: {
    name: 'State of Kuwait (Kuwait City)',
    flag: '🇰🇼',
    currency: 'KWD',
    currSymbol: 'KWD',
    fxRateToInr: 285.0,
    isTaxFree: true,
    typicalTaxPct: 0,
    defaultMonthlySalary: 750,
    rentEstimatedLocal: 200,
    foodEstimatedLocal: 100,
  },
  germany: {
    name: 'Germany (EU Blue Card / Opportunity Card)',
    flag: '🇩🇪',
    currency: 'EUR',
    currSymbol: '€',
    fxRateToInr: 95.0,
    isTaxFree: false,
    typicalTaxPct: 35, // Income tax + social security
    defaultMonthlySalary: 4200,
    rentEstimatedLocal: 950,
    foodEstimatedLocal: 400,
  },
  poland: {
    name: 'Poland & Eastern Europe (Work Permit)',
    flag: '🇵🇱',
    currency: 'EUR',
    currSymbol: '€',
    fxRateToInr: 95.0,
    isTaxFree: false,
    typicalTaxPct: 22,
    defaultMonthlySalary: 2200,
    rentEstimatedLocal: 550,
    foodEstimatedLocal: 300,
  },
};

export default function OverseasSalaryCalculator() {
  const [marketKey, setMarketKey] = useState<string>('uae');
  const [monthlySalary, setMonthlySalary] = useState<number>(12000);
  const [freeAccommodation, setFreeAccommodation] = useState<boolean>(true);
  const [freeFoodOrTransport, setFreeFoodOrTransport] = useState<boolean>(true);

  const market = MARKETS[marketKey] || MARKETS.uae;

  // Sync default salary when market changes
  const handleMarketChange = (key: string) => {
    setMarketKey(key);
    setMonthlySalary(MARKETS[key]?.defaultMonthlySalary || 10000);
    track(EVENTS.featureClick, { feature: 'salary_calc_market_change', market: key });
  };

  const calculations = useMemo(() => {
    // 1. Gross monthly salary in INR
    const grossMonthlyInr = monthlySalary * market.fxRateToInr;

    // 2. Tax deduction
    const taxDeductionInr = grossMonthlyInr * (market.typicalTaxPct / 100);
    const netTakeHomeForeignInr = grossMonthlyInr - taxDeductionInr;

    // 3. Living expenses deduction
    const rentCostInr = freeAccommodation ? 0 : market.rentEstimatedLocal * market.fxRateToInr;
    const foodCostInr = freeFoodOrTransport ? (market.foodEstimatedLocal * 0.3 * market.fxRateToInr) : (market.foodEstimatedLocal * market.fxRateToInr);
    const miscCostInr = grossMonthlyInr * 0.1; // 10% phone, commute, leisure

    const totalLivingInr = rentCostInr + foodCostInr + miscCostInr;
    const netMonthlySavingsInr = Math.max(0, netTakeHomeForeignInr - totalLivingInr);
    const netAnnualSavingsInr = netMonthlySavingsInr * 12;

    // 4. Equivalent Domestic Indian CTC (factoring Indian 30% tax bracket + cost of living)
    // To save X INR in India after rent, taxes and PF, an Indian gross CTC is approx 1.6x of net savings + living
    const equivalentIndianCtcLakhs = ((netAnnualSavingsInr * 1.55 + 400000) / 100000).toFixed(1);

    return {
      grossMonthlyInr: Math.round(grossMonthlyInr).toLocaleString('en-IN'),
      netMonthlySavingsInr: Math.round(netMonthlySavingsInr).toLocaleString('en-IN'),
      netAnnualSavingsLakhs: (netAnnualSavingsInr / 100000).toFixed(1),
      equivalentIndianCtcLakhs,
      isTaxFree: market.isTaxFree,
    };
  }, [market, monthlySalary, freeAccommodation, freeFoodOrTransport]);

  return (
    <section id="salary-calculator" className="bg-[#061e38] text-white py-20 sm:py-24 border-y border-brand-gold/15 relative overflow-hidden">
      <DomainDarkGraphics variant="recruitment" />
      <div className="relative mx-auto max-w-7xl px-5 sm:px-6 md:px-8">
        <div className="mb-12 text-center space-y-3">
          <span className="rounded-full bg-rose-500/20 border border-rose-400/40 px-3.5 py-1 text-[11px] font-bold uppercase tracking-wider text-rose-300 font-mono">
            💼 International Compensation & Tax-Free Modeler
          </span>
          <h2 className="font-display fluid-h2 font-extrabold text-white tracking-tight">
            Overseas Tax-Free Salary & Monthly Net Savings Calculator
          </h2>
          <p className="text-sm text-white/70 max-w-2xl mx-auto">
            Calculate your actual monthly remittances to India after living costs, company accommodation perks, and tax-free status.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Controls */}
          <div className="lg:col-span-5 glass-light p-6 sm:p-7 rounded-3xl text-brand-navy shadow-2xl space-y-4.5">
            {/* Country Selector */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-brand-textLight mb-1.5">
                Target Country & Employment Hub
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {Object.entries(MARKETS).map(([key, data]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => handleMarketChange(key)}
                    className={`rounded-xl border p-2 text-center text-xs font-bold transition cursor-pointer flex flex-col items-center gap-1 ${
                      marketKey === key
                        ? 'border-brand-gold bg-brand-gold/20 text-brand-navy shadow-xs'
                        : 'border-brand-navy/10 bg-white/70 text-brand-navy/80 hover:bg-white'
                    }`}
                  >
                    <span className="text-base">{data.flag}</span>
                    <span className="truncate w-full text-[10px]">{data.currency}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Salary Input */}
            <div>
              <div className="flex justify-between text-xs font-bold mb-1">
                <span className="text-brand-textLight uppercase tracking-wider text-[10px]">Offered Monthly Salary</span>
                <span className="text-brand-gold-hover font-mono text-sm font-bold">
                  {market.currSymbol} {monthlySalary.toLocaleString()} / mo
                </span>
              </div>
              <input
                type="range"
                min={market.defaultMonthlySalary * 0.4}
                max={market.defaultMonthlySalary * 3.5}
                step={marketKey === 'kuwait' ? 25 : 500}
                value={monthlySalary}
                onChange={(e) => setMonthlySalary(parseFloat(e.target.value))}
                className="w-full accent-brand-gold cursor-pointer"
              />
              <span className="text-[10px] text-brand-textLight block mt-0.5 font-mono">
                ≈ ₹{calculations.grossMonthlyInr} INR Gross / Month
              </span>
            </div>

            {/* Company Perks */}
            <div className="space-y-2.5 pt-1">
              <label className="block text-[11px] font-bold uppercase tracking-wider text-brand-textLight">
                Employer Provided Perks
              </label>
              
              <div 
                onClick={() => setFreeAccommodation(!freeAccommodation)}
                className="flex items-center justify-between p-3 rounded-xl bg-white/80 border border-brand-navy/10 cursor-pointer hover:bg-white"
              >
                <div>
                  <p className="font-bold text-xs text-brand-navy">Free Company Accommodation / Bed Space</p>
                  <p className="text-[10px] text-brand-textLight">Saves ~{market.currSymbol}{market.rentEstimatedLocal}/mo in foreign rent</p>
                </div>
                <input
                  type="checkbox"
                  checked={freeAccommodation}
                  onChange={() => {}}
                  className="h-4 w-4 rounded accent-brand-gold"
                />
              </div>

              <div 
                onClick={() => setFreeFoodOrTransport(!freeFoodOrTransport)}
                className="flex items-center justify-between p-3 rounded-xl bg-white/80 border border-brand-navy/10 cursor-pointer hover:bg-white"
              >
                <div>
                  <p className="font-bold text-xs text-brand-navy">Company Transport / Food Allowance</p>
                  <p className="text-[10px] text-brand-textLight">Daily commute & duty meals provided</p>
                </div>
                <input
                  type="checkbox"
                  checked={freeFoodOrTransport}
                  onChange={() => {}}
                  className="h-4 w-4 rounded accent-brand-gold"
                />
              </div>
            </div>
          </div>

          {/* Results Display */}
          <div className="lg:col-span-7 space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
              <div className="rounded-3xl border border-emerald-400/40 bg-emerald-500/15 p-6 backdrop-blur-md space-y-1">
                <span className="text-[10px] uppercase tracking-wider text-emerald-300 font-bold block">
                  Net Monthly Savings (Remittable to India)
                </span>
                <p className="font-mono text-3xl font-black text-white">
                  ₹{calculations.netMonthlySavingsInr} <span className="text-xs font-normal text-white/70">/ month</span>
                </p>
                <span className="text-xs text-emerald-200 block font-medium pt-1">
                  ≈ ₹{calculations.netAnnualSavingsLakhs} Lakhs pure savings per year
                </span>
              </div>

              <div className="rounded-3xl border border-brand-gold/40 bg-brand-gold/15 p-6 backdrop-blur-md space-y-1">
                <span className="text-[10px] uppercase tracking-wider text-brand-gold font-bold block">
                  Equivalent Indian CTC Required
                </span>
                <p className="font-mono text-3xl font-black text-white">
                  ₹{calculations.equivalentIndianCtcLakhs} <span className="text-xs font-normal text-white/70">LPA</span>
                </p>
                <span className="text-xs text-brand-gold font-medium block pt-1">
                  {market.isTaxFree ? '⚡ 0% Income Tax in Gulf' : '● European High Standard of Living'}
                </span>
              </div>
            </div>

            {/* Explanatory breakdown card */}
            <div className="rounded-3xl border border-white/15 bg-white/10 p-5 backdrop-blur-md space-y-3 text-xs text-white/90">
              <div className="flex items-center justify-between border-b border-white/10 pb-2.5">
                <span className="font-bold text-white flex items-center gap-2">
                  <span>{market.flag}</span>
                  <span>{market.name}</span>
                </span>
                <span className="font-mono text-brand-gold font-bold text-[11px]">
                  1 {market.currency} = ₹{market.fxRateToInr} INR
                </span>
              </div>
              <p className="text-white/75 leading-relaxed text-[11px]">
                By securing verified employment sponsorship coordinated through Govt. Registered MEA-Licensed Partners, you avoid illegal sub-agent commissions and receive legitimate employer-sponsored work visas, flight allowances, and medical benefits as per contract.
              </p>
            </div>

            {/* CTA Box */}
            <div className="rounded-3xl border border-brand-gold/40 bg-brand-gold/15 p-5 flex flex-wrap items-center justify-between gap-3 shadow-lg">
              <div>
                <p className="font-display font-bold text-white text-sm">Ready to match with verified foreign employers?</p>
                <p className="text-white/75 text-xs mt-0.5">Submit your CV for free qualification with our authorized employer demand network.</p>
              </div>
              <a
                href="#apply-form"
                className="tactile-btn cursor-pointer inline-flex items-center gap-1.5 rounded-full bg-brand-gold px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-brand-navy hover:bg-brand-gold-hover hover:text-white transition shadow-sm"
              >
                <span>Submit CV for Matching →</span>
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
