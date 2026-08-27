import { useState, useEffect } from 'react';
import ArtifactShell from './ArtifactShell';
import { EVENTS, track } from '../../lib/umami';

interface TourCard {
  id: string;
  category: 'umrah' | 'international' | 'domestic';
  categoryLabel: string;
  title: string;
  destination: string;
  duration: string;
  highlights: string;
  priceFormatted: string;
  statusBadge: string;
  flightHub: string;
  inclusions: string[];
}

const FEATURED_TOURS: TourCard[] = [
  {
    id: 'umrah-vip',
    category: 'umrah',
    categoryLabel: '🕋 Pilgrimage',
    title: '5-Star Executive Umrah (Haram View)',
    destination: 'Makkah & Madinah',
    duration: '14 Days Total',
    highlights: '50m to Haram · Clock Tower Stay · Senior Muallim Guidance · Indian Buffet',
    priceFormatted: '₹1,15,000',
    statusBadge: 'Direct Flight Booked',
    flightHub: 'Hyderabad (HYD) ➔ Jeddah (JED)',
    inclusions: ['Saudi eVisa + Insurance', '5★ Haram Proximity', 'Guided Ziyarat', 'Zamzam 5L'],
  },
  {
    id: 'umrah-eco',
    category: 'umrah',
    categoryLabel: '🕋 Pilgrimage',
    title: 'Classic Economy Umrah Group',
    destination: 'Makkah & Madinah',
    duration: '14 Days Group Departure',
    highlights: '150m walking distance · Quad Sharing · Full Indian Catering · Ziyarat Tours',
    priceFormatted: '₹85,000',
    statusBadge: 'Seats Filling Fast',
    flightHub: 'Hyderabad (HYD) ➔ Jeddah (JED)',
    inclusions: ['Group Flight', 'Visa Stamping', 'Air-Conditioned Bus', 'Indian Meals'],
  },
  {
    id: 'dubai-family',
    category: 'international',
    categoryLabel: '🏖️ International',
    title: 'Dubai & Abu Dhabi 5D/4N Family Tour',
    destination: 'United Arab Emirates',
    duration: '5 Days / 4 Nights',
    highlights: 'Burj Khalifa 124th Fl · Desert Safari with BBQ · Marina Dhow Dinner Cruise',
    priceFormatted: '₹48,500',
    statusBadge: 'Instant eVisa',
    flightHub: 'Direct Flights Ex-Hyderabad',
    inclusions: ['4★ City Hotel', 'Daily Breakfast', 'Private Transfers', 'Sightseeing Tickets'],
  },
  {
    id: 'europe-alpine',
    category: 'international',
    categoryLabel: '🏖️ International',
    title: 'Europe Grand Alpine Explorer (7D/6N)',
    destination: 'Switzerland & France',
    duration: '7 Days / 6 Nights',
    highlights: 'Mount Titlis Cable Car · Rhine Falls · Eiffel Tower Summit · Euro Rail',
    priceFormatted: '₹1,45,000',
    statusBadge: 'Schengen Visa Fast-Track',
    flightHub: 'Hyderabad ➔ Zurich / Paris',
    inclusions: ['4★ Resort Stays', 'Swiss Travel Pass', 'Schengen Visa Support', 'Indian Dinners'],
  },
  {
    id: 'kashmir-paradise',
    category: 'domestic',
    categoryLabel: '🏞️ Domestic',
    title: 'Kashmir Paradise Holiday (6D/5N)',
    destination: 'Srinagar · Gulmarg · Pahalgam',
    duration: '6 Days / 5 Nights',
    highlights: 'Dal Lake Luxury Houseboat · Gulmarg Gondola · Betaab Valley Shikara Ride',
    priceFormatted: '₹24,500',
    statusBadge: 'Best Seller',
    flightHub: 'Srinagar Airport Pickup',
    inclusions: ['Houseboat + Hotel', 'Private AC Cab', 'Breakfast & Dinner', 'Shikara Ride Pass'],
  },
  {
    id: 'kerala-backwaters',
    category: 'domestic',
    categoryLabel: '🏞️ Domestic',
    title: 'Kerala Backwaters & Munnar Hills',
    destination: 'Munnar · Thekkady · Alleppey',
    duration: '5 Days / 4 Nights',
    highlights: 'Tea Plantation Walk · Spice Garden Tour · Private Houseboat Cruise',
    priceFormatted: '₹19,800',
    statusBadge: 'All-Inclusive',
    flightHub: 'Cochin Hub Pickup',
    inclusions: ['Premium Resorts', 'Private Innova', 'All Meals in Houseboat', 'Sightseeing Entry'],
  },
];

export default function ToursExplorer() {
  const [activeCategory, setActiveCategory] = useState<'all' | 'umrah' | 'international' | 'domestic'>('all');

  useEffect(() => {
    track(EVENTS.umrahView);
  }, []);

  const filtered = activeCategory === 'all'
    ? FEATURED_TOURS
    : FEATURED_TOURS.filter((t) => t.category === activeCategory);

  return (
    <ArtifactShell
      title="Tours & Holiday Itinerary Explorer"
      caption="Live scheduled departures, verified star accommodations & transparent per-pax pricing"
      statusLabel="Seasonal Inventory Open"
    >
      <div className="space-y-3">
        {/* Category Switcher Tabs */}
        <div className="flex rounded-xl bg-brand-navy/5 p-1 text-sm font-bold">
          {[
            { key: 'all', label: 'All Packages' },
            { key: 'umrah', label: '🕋 Umrah' },
            { key: 'international', label: '🏖️ International' },
            { key: 'domestic', label: '🏞️ Domestic' },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveCategory(tab.key as any)}
              className={`flex-1 rounded-lg py-1.5 transition text-center ${
                activeCategory === tab.key
                  ? 'bg-brand-navy text-brand-gold shadow-xs'
                  : 'text-brand-navy/60 hover:text-brand-navy'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tour Cards Deck */}
        <div className="space-y-2.5 max-h-[310px] overflow-y-auto pr-1">
          {filtered.map((tour) => (
            <div
              key={tour.id}
              className="rounded-2xl border border-brand-navy/10 bg-white/95 p-3.5 shadow-xs hover:border-brand-gold/40 transition flex flex-col justify-between space-y-2"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="rounded bg-brand-gold/20 px-1.5 py-0.5 text-xs font-bold text-brand-navy uppercase">
                      {tour.categoryLabel}
                    </span>
                    <span className="text-[13px] text-brand-navy/50 font-medium">· {tour.destination}</span>
                  </div>
                  <h4 className="text-xs font-bold text-brand-navy leading-snug mt-1">{tour.title}</h4>
                  <p className="text-[13px] text-brand-navy/60 leading-tight mt-0.5 line-clamp-1">{tour.highlights}</p>
                </div>

                <div className="text-right shrink-0">
                  <div className="font-display text-sm font-extrabold text-brand-navy">{tour.priceFormatted}</div>
                  <span className="text-xs text-brand-gold font-bold">/ person</span>
                </div>
              </div>

              {/* Inclusions Strip */}
              <div className="flex flex-wrap items-center justify-between gap-1 pt-2 border-t border-brand-navy/[0.06] text-xs">
                <div className="flex gap-1 flex-wrap">
                  {tour.inclusions.slice(0, 3).map((inc, i) => (
                    <span key={i} className="rounded bg-brand-navy/[0.04] px-1.5 py-0.5 text-brand-navy/70">
                      ✓ {inc}
                    </span>
                  ))}
                </div>
                <a
                  href={`/tours-travels?category=${tour.category}`}
                  className="font-bold text-brand-navy hover:text-brand-gold transition"
                >
                  View Details ➔
                </a>
              </div>
            </div>
          ))}
        </div>

        {/* Trust Footer */}
        <div className="rounded-xl bg-brand-navy/[0.03] border border-brand-navy/10 px-3 py-2 flex items-center justify-between text-[13px] text-brand-navy/60">
          <span className="flex items-center gap-1.5">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse" />
            100% Visa Assistance &amp; Direct Flight Hubs
          </span>
          <span className="font-bold text-brand-navy">Ex-Hyderabad</span>
        </div>
      </div>
    </ArtifactShell>
  );
}
