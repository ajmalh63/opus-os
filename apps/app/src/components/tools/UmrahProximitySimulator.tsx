import { useState, useMemo } from 'react';
import { track, EVENTS } from '../../lib/umami';

interface HotelTier {
  id: string;
  name: string;
  makkahHotel: string;
  makkahDistanceMeters: number;
  makkahSteps: number;
  madinahHotel: string;
  madinahDistanceMeters: number;
  basePricePerHeadInr: number;
  badge: string;
}

const TIERS: Record<string, HotelTier> = {
  executive_5star: {
    id: 'executive_5star',
    name: '5-Star Executive (Clock Tower)',
    makkahHotel: 'Fairmont / Swissôtel Makkah (Clock Tower)',
    makkahDistanceMeters: 20,
    makkahSteps: 30,
    madinahHotel: 'Dar Al Taqwa / Oberoi (Haram Courtyard)',
    madinahDistanceMeters: 50,
    basePricePerHeadInr: 125000,
    badge: 'Under 50m Haram Facing',
  },
  premium_4star: {
    id: 'premium_4star',
    name: '4-Star Premium Walking Distance',
    makkahHotel: 'Voco Makkah / Anjum Hotel',
    makkahDistanceMeters: 250,
    makkahSteps: 320,
    madinahHotel: 'Rove Hotel / Emaar Elite',
    madinahDistanceMeters: 180,
    basePricePerHeadInr: 95000,
    badge: '2–4 Min Easy Walk',
  },
  economy_shuttle: {
    id: 'economy_shuttle',
    name: 'Comfort Economy (24/7 Free AC Shuttle)',
    makkahHotel: 'Retaj Al Rayyan / Rawabi Makkah',
    makkahDistanceMeters: 800,
    makkahSteps: 950,
    madinahHotel: 'Al Mukhtara International',
    madinahDistanceMeters: 400,
    basePricePerHeadInr: 72000,
    badge: 'Best Value with 24/7 Shuttle',
  },
};

export default function UmrahProximitySimulator() {
  const [tierKey, setTierKey] = useState<string>('executive_5star');
  const [sharingType, setSharingType] = useState<'quad' | 'triple' | 'double'>('quad');
  const [pilgrimCount, setPilgrimCount] = useState<number>(4);
  const [departureMonth, setDepartureMonth] = useState<string>('March 2026 (Ramadan)');

  const tier = TIERS[tierKey] || TIERS.executive_5star;

  const quoteCalculations = useMemo(() => {
    // Sharing multiplier
    const sharingMultiplier = sharingType === 'double' ? 1.35 : sharingType === 'triple' ? 1.15 : 1.0;
    
    // Ramadan surcharge calculation
    const isRamadan = departureMonth.toLowerCase().includes('ramadan');
    const monthMultiplier = isRamadan ? 1.4 : 1.0;

    const basePerHead = tier.basePricePerHeadInr * sharingMultiplier * monthMultiplier;
    
    // Group volume discount: 4+ pilgrims = 5% off, 8+ pilgrims = 8% off
    const discountPct = pilgrimCount >= 8 ? 8 : pilgrimCount >= 4 ? 5 : 0;
    const netPerHead = basePerHead * (1 - discountPct / 100);
    const totalGroupCost = netPerHead * pilgrimCount;
    const totalSavings = (basePerHead * pilgrimCount) - totalGroupCost;

    return {
      perHeadInr: Math.round(netPerHead).toLocaleString('en-IN'),
      totalGroupInr: Math.round(totalGroupCost).toLocaleString('en-IN'),
      totalSavingsInr: Math.round(totalSavings).toLocaleString('en-IN'),
      discountPct,
      makkahWalkTimeMinutes: Math.ceil(tier.makkahDistanceMeters / 75),
      madinahWalkTimeMinutes: Math.ceil(tier.madinahDistanceMeters / 75),
    };
  }, [tier, sharingType, pilgrimCount, departureMonth]);

  const handleWhatsappInquiry = () => {
    track(EVENTS.featureClick, { feature: 'umrah_whatsapp_quote', tier: tierKey, count: pilgrimCount });
    const msg = encodeURIComponent(
      `As-salamu alaykum! I would like to reserve the Umrah package:\n- Package: ${tier.name}\n- Pilgrims: ${pilgrimCount} (${sharingType.toUpperCase()} Sharing)\n- Dates: ${departureMonth}\n- Estimated Group Quote: ₹${quoteCalculations.totalGroupInr}\nPlease share available flight seats from Hyderabad.`
    );
    window.open(`https://wa.me/919876500001?text=${msg}`, '_blank');
  };

  return (
    <section id="umrah-simulator" className="bg-[#05182e] text-white py-20 sm:py-24 border-y border-brand-gold/15 relative overflow-hidden">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="hero-orb left-1/4 top-0 h-96 w-96 bg-brand-gold/10 blur-3xl" />
        <div className="hero-orb right-0 bottom-0 h-80 w-80 bg-brand-blue/20 blur-3xl" />
      </div>

      <div className="relative mx-auto max-w-7xl px-5 sm:px-6 md:px-8">
        <div className="mb-12 text-center space-y-3">
          <span className="rounded-full bg-brand-gold/20 border border-brand-gold/40 px-3.5 py-1 text-[11px] font-bold uppercase tracking-wider text-brand-gold font-mono">
            🕋 Live Proximity & Tariff Modeler
          </span>
          <h2 className="font-display fluid-h2 font-extrabold text-white tracking-tight">
            Haram Distance Radar & Group Cost Simulator
          </h2>
          <p className="text-sm text-white/70 max-w-2xl mx-auto">
            Accurate verified walking meters from King Abdulaziz Gate (Makkah) and Green Dome (Madinah). Transparent group rates with zero hidden markups.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          {/* Controls Panel */}
          <div className="lg:col-span-5 glass-light p-6 sm:p-7 rounded-3xl text-brand-navy shadow-2xl space-y-4.5">
            {/* Hotel Tier */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-brand-textLight mb-2">
                Hotel Tier & Proximity
              </label>
              <div className="space-y-2">
                {Object.entries(TIERS).map(([key, t]) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setTierKey(key)}
                    className={`w-full text-left rounded-2xl border p-3 transition cursor-pointer flex items-center justify-between gap-2 ${
                      tierKey === key
                        ? 'border-brand-gold bg-brand-gold/20 shadow-xs'
                        : 'border-brand-navy/10 bg-white/70 hover:bg-white'
                    }`}
                  >
                    <div>
                      <p className="font-display font-bold text-xs text-brand-navy">{t.name}</p>
                      <p className="text-[10px] text-brand-textLight">{t.makkahHotel}</p>
                    </div>
                    <span className="shrink-0 rounded-full bg-brand-navy text-white text-[9px] font-bold px-2 py-0.5 font-mono">
                      {t.makkahDistanceMeters}m
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Room Sharing Mode */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-brand-textLight mb-1.5">
                Room Sharing Type
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                {[
                  { id: 'quad', label: 'Quad (4-Bed)' },
                  { id: 'triple', label: 'Triple (3-Bed)' },
                  { id: 'double', label: 'Double (2-Bed)' },
                ].map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSharingType(s.id as any)}
                    className={`rounded-xl border py-2 text-xs font-bold transition cursor-pointer text-center ${
                      sharingType === s.id
                        ? 'border-brand-navy bg-brand-navy text-white'
                        : 'border-brand-navy/15 bg-white text-brand-navy/80 hover:bg-slate-50'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Pilgrim Count Slider */}
            <div>
              <div className="flex justify-between text-xs font-bold mb-1">
                <span className="text-brand-textLight uppercase tracking-wider text-[10px]">Total Family / Group Pilgrims</span>
                <span className="text-brand-gold-hover font-mono text-sm font-bold">{pilgrimCount} {pilgrimCount === 1 ? 'Pilgrim' : 'Pilgrims'}</span>
              </div>
              <input
                type="range"
                min="1"
                max="16"
                step="1"
                value={pilgrimCount}
                onChange={(e) => setPilgrimCount(parseInt(e.target.value))}
                className="w-full accent-brand-gold cursor-pointer"
              />
              <div className="flex justify-between text-[10px] text-brand-textLight mt-0.5">
                <span>1 Person</span>
                <span>4 (Family)</span>
                <span>8+ (Extended Group Discount)</span>
              </div>
            </div>

            {/* Departure Season */}
            <div>
              <label className="block text-[11px] font-bold uppercase tracking-wider text-brand-textLight mb-1.5">
                Departure Month
              </label>
              <select
                value={departureMonth}
                onChange={(e) => setDepartureMonth(e.target.value)}
                className="w-full rounded-xl border border-brand-navy/15 bg-white px-3.5 py-2.5 text-xs font-bold text-brand-navy focus:border-brand-gold focus:outline-none"
              >
                <option value="March 2026 (Ramadan)">March 2026 (Blessed Ramadan Package)</option>
                <option value="April 2026 (Shawwal)">April 2026 (Shawwal Group Departure)</option>
                <option value="May 2026 (Pre-Hajj)">May 2026 (Direct Saudi Airlines Flights)</option>
                <option value="August 2026 (Post-Hajj)">August 2026 (Post-Hajj Comfort Group)</option>
              </select>
            </div>
          </div>

          {/* Results Radar & Distance Meter */}
          <div className="lg:col-span-7 space-y-4">
            {/* Visual Proximity Meter */}
            <div className="rounded-3xl border border-white/15 bg-white/10 p-6 backdrop-blur-md space-y-4">
              <h3 className="font-display text-sm font-bold text-white uppercase tracking-wider text-brand-gold">
                📍 Verified Haramain Walking Distance Meter
              </h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white">Makkah al-Mukarramah</span>
                    <span className="font-mono text-xs font-bold text-emerald-300">
                      {tier.makkahDistanceMeters} Meters
                    </span>
                  </div>
                  <p className="text-[11px] text-white/70 truncate">{tier.makkahHotel}</p>
                  <div className="flex items-center gap-2 text-[10px] text-brand-gold">
                    <span>🚶 ≈ {quoteCalculations.makkahWalkTimeMinutes} Min Walk</span>
                    <span>•</span>
                    <span>≈ {tier.makkahSteps} Steps to King Abdulaziz Gate</span>
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-white/5 border border-white/10 space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-white">Madinah al-Munawwarah</span>
                    <span className="font-mono text-xs font-bold text-emerald-300">
                      {tier.madinahDistanceMeters} Meters
                    </span>
                  </div>
                  <p className="text-[11px] text-white/70 truncate">{tier.madinahHotel}</p>
                  <div className="flex items-center gap-2 text-[10px] text-brand-gold">
                    <span>🚶 ≈ {quoteCalculations.madinahWalkTimeMinutes} Min Walk</span>
                    <span>•</span>
                    <span>Courtyard to Prophet's Mosque Green Dome</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Pricing Summary Card */}
            <div className="rounded-3xl border border-brand-gold/30 bg-brand-gold/15 p-6 backdrop-blur-md space-y-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-white/10 pb-4">
                <div>
                  <span className="text-[10px] uppercase tracking-wider text-white/70 font-semibold block">
                    All-Inclusive Group Tariff ({pilgrimCount} {pilgrimCount === 1 ? 'Person' : 'Pilgrims'})
                  </span>
                  <p className="font-mono text-3xl font-black text-white mt-0.5">
                    ₹{quoteCalculations.totalGroupInr}
                  </p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] text-brand-gold font-bold block uppercase">Per Head Rate</span>
                  <span className="font-mono text-lg font-bold text-white">₹{quoteCalculations.perHeadInr} / person</span>
                </div>
              </div>

              {quoteCalculations.discountPct > 0 && (
                <div className="flex items-center justify-between text-xs text-emerald-300 bg-emerald-500/15 border border-emerald-400/30 p-2.5 rounded-xl">
                  <span>✓ {quoteCalculations.discountPct}% Family Group Discount Applied</span>
                  <span className="font-mono font-bold">Saved ₹{quoteCalculations.totalSavingsInr}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-2 text-[11px] text-white/80">
                <div className="flex items-center gap-1.5">✓ Direct Flights</div>
                <div className="flex items-center gap-1.5">✓ Nusuk E-Visa</div>
                <div className="flex items-center gap-1.5">✓ 3 Meals Daily</div>
                <div className="flex items-center gap-1.5">✓ Ziyarat Guided</div>
              </div>

              <div className="pt-2 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleWhatsappInquiry}
                  className="tactile-btn cursor-pointer inline-flex items-center gap-2 rounded-full bg-brand-gold px-6 py-3 text-xs font-extrabold uppercase tracking-wider text-brand-navy hover:bg-brand-gold-hover hover:text-white transition shadow-lg"
                >
                  <span>💬 Lock This Group Quote via WhatsApp →</span>
                </button>
                <a
                  href="#departures"
                  className="tactile-btn inline-flex items-center gap-1 rounded-full border border-white/25 bg-white/10 px-5 py-3 text-xs font-bold uppercase tracking-wider text-white hover:bg-white/20 transition"
                >
                  View Fixed Departures ↓
                </a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
