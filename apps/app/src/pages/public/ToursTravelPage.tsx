import React, { useState } from 'react';
import { Link } from 'wouter';
import Nav from '../../components/Nav';
import Footer from '../../components/Footer';
import StickyCallBar from '../../components/StickyCallBar';
import ChatWidget from '../../components/ChatWidget';
import TurnstileWidget from '../../components/TurnstileWidget';
import GeoFaqSection from '../../components/public/GeoFaqSection';
import SEOHead from '../../components/SEOHead';
import DomainBackdrop from '../../components/DomainBackdrop';
import DomainDarkGraphics from '../../components/DomainDarkGraphics';
import { BASE_ORGANIZATION_SCHEMA, getBreadcrumbSchema, getFAQSchema, getServiceSchema } from '../../lib/schemas';
import { useVisibilityTracking } from '../../lib/visibilityTracking';
import { track, EVENTS } from '../../lib/umami';
const API = (import.meta as any).env?.VITE_API_URL || '';

const TOURS_FAQS = [
  {
    question: 'How can I view real-time prices and availability for tour packages?',
    answer: 'In accordance with our fair pricing policy and live airline inventory blockings, detailed itemized rate cards, room configurations, and group discounts are accessible directly by logging into your OpusOS Client Portal or by submitting a custom quotation request.',
  },
  {
    question: 'What categories of travel packages does Opus Overseas specialize in?',
    answer: 'We operate four core travel verticals: (1) All-inclusive 5-Star and Classic Umrah Pilgrimages from Hyderabad with Haram proximity hotels, (2) Curated International Holidays to Dubai, Europe, Bali, Singapore, and Thailand, (3) Scenic Domestic Getaways to Kashmir, Kerala, and Himachal, and (4) Bespoke Corporate MICE & Family Custom Group tours with 100% visa assistance and direct flight arrangements.',
  },
  {
    question: 'What is included in the 5-Star Executive Umrah package?',
    answer: 'Our 5-Star Umrah packages include scheduled return air tickets from Hyderabad (IndiGo / Saudia), 5-Star hotel stays within 50 to 100 meters of the Haram in Makkah (Clock Tower properties) and Madinah, direct Saudi tourist/Umrah e-visa with comprehensive medical insurance, luxury air-conditioned ground transfers, full 3-course Indian buffet catering, guided historical Ziyarat tours, and 5L Zamzam.',
  },
  {
    question: 'How do you assist with tourist and visit visa processing for overseas tours?',
    answer: 'Our in-house global visa team handles the entire documentation, financial proofing, appointment scheduling, and embassy filing for all international holiday destinations including UAE (Dubai express e-visas), Schengen Europe, UK Standard Visitor, Singapore, and Southeast Asia.',
  },
  {
    question: 'Can private family or corporate group tours (MICE) be customized?',
    answer: 'Yes. We curate private departures with tailored itineraries, private vehicle fleets, customized meal plans, conference facility bookings, and dedicated bilingual tour directors for groups ranging from 4 to 150+ travelers.',
  },
  {
    question: 'What is the booking and payment milestone structure for tour packages?',
    answer: 'Bookings are secured with an initial nominal advance fee per traveler. The remaining balance can be settled in scheduled milestone installments or at our physical office prior to ticket and voucher issuance, with 100% itemized GST receipts.',
  },
];

interface TourPackage {
  id: string;
  category: 'umrah_pilgrimage' | 'international_holiday' | 'domestic' | 'custom_group';
  categoryBadge: string;
  title: string;
  tagline: string;
  destination: string;
  duration: string;
  featuredBadge: string;
  imageUrl: string;
  flightRoute: string;
  hotelSummary: string;
  highlights: string[];
  inclusions: string[];
  departureFrequency: string;
}

const SHOWCASE_PACKAGES: TourPackage[] = [
  {
    id: 'umrah-5star',
    category: 'umrah_pilgrimage',
    categoryBadge: '🕋 Umrah & Pilgrimage',
    title: '5-Star Executive Umrah (Haram-Frontage)',
    tagline: 'Spiritual tranquility with clock tower luxury suites & senior scholar accompaniment.',
    destination: 'Makkah al-Mukarramah & Madinah al-Munawwarah',
    duration: '14 Days / 13 Nights',
    featuredBadge: 'Haram View Guaranteed',
    imageUrl: 'https://images.unsplash.com/photo-1565552645632-d725f8bfc19a?auto=format&fit=crop&w=1200&q=80',
    flightRoute: 'Direct Flight: Hyderabad (HYD) ➔ Jeddah (JED)',
    hotelSummary: '50m to Haram · Swissôtel Makkah & Madinah 5★ Frontage',
    highlights: ['Daily Kaaba views & prayer access', 'Historical Cave Hira & Mount Uhud Ziyarat', 'Haramain high-speed bullet train transfer', 'Senior Muallim guided rituals'],
    inclusions: ['Saudi eVisa + Medical Insurance', '5★ Luxury Hotel Stays', 'Full Indian Buffet Catering', 'AC Coach Transfers', '5L Zamzam Packing'],
    departureFrequency: 'Bi-Weekly Scheduled Departures',
  },
  {
    id: 'umrah-classic',
    category: 'umrah_pilgrimage',
    categoryBadge: '🕋 Umrah & Pilgrimage',
    title: 'Classic Economy Umrah Group Departure',
    tagline: 'Value-oriented sacred pilgrimage with proximity accommodations & complete guidance.',
    destination: 'Makkah & Madinah, Saudi Arabia',
    duration: '14 Days Group Departure',
    featuredBadge: 'Best Seller',
    imageUrl: 'https://images.unsplash.com/photo-1591604129939-f1efa4d9f7fa?auto=format&fit=crop&w=1200&q=80',
    flightRoute: 'Scheduled Airline: Direct / 1-Stop Ex-Hyderabad',
    hotelSummary: '150m walking distance to Haramain Courtyards',
    highlights: ['Guided Ihram & Tawaf step-by-step', 'Complete Ziyarat in Makkah & Madinah', 'Round-the-clock ground coordination team'],
    inclusions: ['Return Flight Tickets', 'Umrah Visa Processing', 'Quad/Triple Air-Cooled Rooms', 'All Meals & Refreshments', 'Religious Guidance'],
    departureFrequency: 'Departures on 1st & 15th of Every Month',
  },
  {
    id: 'dubai-luxury',
    category: 'international_holiday',
    categoryBadge: '🏖️ International Holidays',
    title: 'Dubai & Abu Dhabi 5D/4N Iconic Escape',
    tagline: 'Futuristic architectural wonders, golden desert dunes, and luxury marina cruising.',
    destination: 'Dubai & Abu Dhabi, United Arab Emirates',
    duration: '5 Days / 4 Nights',
    featuredBadge: 'Instant eVisa',
    imageUrl: 'https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&w=1200&q=80',
    flightRoute: 'Direct Flight: Hyderabad ➔ Dubai (DXB)',
    hotelSummary: '4-Star Deluxe City Center Property (Downtown Access)',
    highlights: ['Burj Khalifa 124th Floor Observation Deck', 'Dune Bashing Safari with BBQ & Fire Show', 'Marina Luxury Glass Dhow Cruise Dinner', 'Sheikh Zayed Grand Mosque Abu Dhabi'],
    inclusions: ['UAE 30-Day Express Tourist Visa', '4★ Accommodation with Daily Breakfast', 'Private Airport Transfers', 'All Sightseeing Entry Passes'],
    departureFrequency: 'Weekly Departures Year-Round',
  },
  {
    id: 'europe-alpine',
    category: 'international_holiday',
    categoryBadge: '🏖️ International Holidays',
    title: 'Grand Swiss Alps & Paris Extravaganza',
    tagline: 'Snow-capped alpine peaks, scenic Swiss rail corridors, and Parisian romantic avenues.',
    destination: 'Switzerland (Zurich, Lucerne, Interlaken) & France (Paris)',
    duration: '7 Days / 6 Nights',
    featuredBadge: 'Schengen Fast-Track',
    imageUrl: 'https://images.unsplash.com/photo-1530122037265-a5f1f91d3b99?auto=format&fit=crop&w=1200&q=80',
    flightRoute: 'Hyderabad ➔ Zurich (ZRH) / Paris (CDG) ➔ Hyderabad',
    hotelSummary: '4-Star Central City & Alpine Mountain Resorts',
    highlights: ['Mount Titlis Rotair Cable Car & Ice Grotto', 'Scenic Lake Lucerne Cruise', 'Eiffel Tower Top Floor Access & Seine River Cruise', 'High-Speed TGV Train Crossing'],
    inclusions: ['Schengen Visa Advisory & Appointment Filing', '4★ Resort Accommodations', 'Swiss Rail Pass 2nd Class', 'Daily Continental Breakfast'],
    departureFrequency: 'Monthly Group Departures (Spring / Summer / Autumn)',
  },
  {
    id: 'kashmir-paradise',
    category: 'domestic',
    categoryBadge: '🏞️ Domestic Getaways',
    title: 'Kashmir Valley & Gulmarg Snow Circuit',
    tagline: 'Tranquil Shikara glides on Dal Lake, pine-carpeted valleys, and snow meadows.',
    destination: 'Srinagar · Gulmarg · Pahalgam · Sonmarg',
    duration: '6 Days / 5 Nights',
    featuredBadge: 'Romantic & Family',
    imageUrl: 'https://images.unsplash.com/photo-1595815771614-ade9d652a65d?auto=format&fit=crop&w=1200&q=80',
    flightRoute: 'Direct Flight: Hyderabad ➔ Srinagar (SXR)',
    hotelSummary: '1 Night Dal Lake Super Deluxe Houseboat + 4★ Valley Resorts',
    highlights: ['Sunset Shikara Ride on Dal Lake', 'Gulmarg Gondola Phase 1 & 2 Cable Ride', 'Pahalgam Betaab Valley & Aru River Valley', 'Authentic Kashmiri Wazwan Dinner'],
    inclusions: ['Airport Pick-and-Drop in Private AC Sedan', 'Daily Breakfast & Dinner', 'Houseboat Stay', 'All Tolls, Parking & Driver Allowances'],
    departureFrequency: 'Custom Departures Daily',
  },
  {
    id: 'kerala-backwaters',
    category: 'domestic',
    categoryBadge: '🏞️ Domestic Getaways',
    title: 'Misty Munnar Hills & Alleppey Backwaters',
    tagline: 'Verdant rolling tea plantations, spice trails, and private luxury houseboat cruises.',
    destination: 'Cochin · Munnar · Thekkady · Alleppey',
    duration: '5 Days / 4 Nights',
    featuredBadge: 'All-Season Favorite',
    imageUrl: 'https://images.unsplash.com/photo-1602216056096-3b40cc0c9944?auto=format&fit=crop&w=1200&q=80',
    flightRoute: 'Direct Flight: Hyderabad ➔ Cochin (COK)',
    hotelSummary: 'Munnar Mist Hillside Resort + Private Alleppey Houseboat',
    highlights: ['Tea Museum & Mattupetty Dam Speedboat', 'Periyar Wildlife Sanctuary Boat Safari', 'Overnight Houseboat Cruise through Palm Canals', 'Kathakali Cultural Dance Show'],
    inclusions: ['Dedicated AC Innova Cab for entire tour', 'Houseboat with All Meals (Chef on Board)', 'Resort Stays with Breakfast', 'Spice Garden Tour Entry'],
    departureFrequency: 'Custom Departures Daily',
  },
  {
    id: 'bali-tropical',
    category: 'international_holiday',
    categoryBadge: '🏖️ International Holidays',
    title: 'Bali Exotic Island & Ubud Jungle Retreat',
    tagline: 'Emerald rice terraces, cliffside ocean temples, and private pool luxury villas.',
    destination: 'Ubud · Kuta · Seminyak · Nusa Penida',
    duration: '6 Days / 5 Nights',
    featuredBadge: 'Visa on Arrival',
    imageUrl: 'https://images.unsplash.com/photo-1537996194471-e657df975ab4?auto=format&fit=crop&w=1200&q=80',
    flightRoute: 'Hyderabad ➔ Denpasar Bali (DPS)',
    hotelSummary: '2 Nights Ubud Rainforest Resort + 3 Nights Private Pool Villa',
    highlights: ['Tegallalang Rice Terraces & Jungle Swing', 'Uluwatu Sunset Temple & Kecak Fire Dance', 'Nusa Penida Kelingking Beach Speedboat Tour', 'Traditional Balinese Flower Spa Therapy'],
    inclusions: ['Indonesian e-VOA Guidance', 'Private AC Vehicle & English Driver', 'All Villa Stays with Daily Breakfast', 'Ferry & Sightseeing Passes'],
    departureFrequency: 'Weekly Group & Private Departures',
  },
  {
    id: 'corporate-mice',
    category: 'custom_group',
    categoryBadge: '👥 Custom & Corporate Groups',
    title: 'Corporate MICE & Executive Incentive Tours',
    tagline: 'High-impact corporate retreats, international dealer meets, and team celebrations.',
    destination: 'Singapore · Dubai · Thailand · Goa',
    duration: 'Tailored (3 to 7 Days)',
    featuredBadge: 'Corporate Solutions',
    imageUrl: 'https://images.unsplash.com/photo-1511578314322-379afb476865?auto=format&fit=crop&w=1200&q=80',
    flightRoute: 'Group Block Air Booking Ex-Hyderabad / Mumbai',
    hotelSummary: '5-Star Convention Hotels & Beachfront Resorts with AV Facilities',
    highlights: ['Turnkey conference hall & banquet setups', 'Team bonding excursions & luxury gala dinners', 'Custom branded merchandise & itinerary apps', 'On-ground Opus Tour Director support'],
    inclusions: ['Group Visa Processing', 'Dedicated Coach Transits', 'Full Board Meal Plans with Cocktails', 'End-to-End Event Coordination'],
    departureFrequency: 'Custom Scheduled upon RFP',
  },
];

export default function ToursTravelPage() {
  useVisibilityTracking('/tours-travels');

  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedPackage, setSelectedPackage] = useState<TourPackage>(SHOWCASE_PACKAGES[0]);

  // Inquiry form state
  const [travelerName, setTravelerName] = useState('');
  const [travelerPhone, setTravelerPhone] = useState('');
  const [travelerEmail, setTravelerEmail] = useState('');
  const [travelMonth, setTravelMonth] = useState('Next Month');
  const [consent, setConsent] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [formFeedback, setFormFeedback] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Dynamic itinerary configurator
  const [estimatorPax, setEstimatorPax] = useState(2);
  const [estimatorHotelTier, setEstimatorHotelTier] = useState<'standard' | 'luxury'>('luxury');

  const filteredPackages = selectedCategory === 'all'
    ? SHOWCASE_PACKAGES
    : SHOWCASE_PACKAGES.filter((p) => p.category === selectedCategory);

  const handleSubmitInquiry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!consent) {
      setFormFeedback('Please grant DPDP data processing consent.');
      return;
    }
    setSubmitting(true);
    setFormFeedback(null);

    const digits = travelerPhone.replace(/\D/g, '');
    const normalizedPhone = digits.length === 10 ? `+91 ${digits.slice(0, 5)} ${digits.slice(5)}` : travelerPhone;

    try {
      const res = await fetch(`${API}/api/public/leads`, {
        credentials: 'include',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(turnstileToken ? { 'cf-turnstile-response': turnstileToken } : {}),
        },
        body: JSON.stringify({
          name: travelerName,
          phone: normalizedPhone,
          email: travelerEmail || undefined,
          serviceInterest: `Tours & Travels: ${selectedPackage.title}`,
          division: 'umrah',
          leadSource: 'website-tours-travels',
          dynamicContext: {
            packageId: selectedPackage.id,
            packageName: selectedPackage.title,
            category: selectedPackage.category,
            pax: estimatorPax,
            hotelTier: estimatorHotelTier,
            month: travelMonth,
          },
          consent: true,
        }),
      });

      if (res.ok) {
        track(EVENTS.leadSubmit, { division: 'tours-travels' });
        setFormFeedback('✅ Thank you! Our Senior Tour Director will contact you within 15 minutes with complete flight schedules, hotel vouchers, and customized pricing.');
        setTravelerName('');
        setTravelerPhone('');
        setTravelerEmail('');
      } else {
        const err = await res.json().catch(() => ({}));
        setFormFeedback(err.error || 'Failed to submit inquiry. Please try again or reach out on WhatsApp.');
      }
    } catch {
      setFormFeedback('Network error. Please call our tour desk directly.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-brand-cream font-sans text-brand-navy selection:bg-brand-gold selection:text-brand-navy">
      <SEOHead
        title="Tours & Travels | 5-Star Umrah, World Holidays & Custom Getaways | Opus Overseas"
        description="Explore luxury 5-Star Umrah packages from Hyderabad, Dubai & Europe international holiday tours, and domestic getaways with 100% visa assistance and direct flights."
        canonicalPath="/tours-travels"
        schemas={[
          BASE_ORGANIZATION_SCHEMA,
          getServiceSchema({
            name: 'Tours & Travels Division — World Holidays, Umrah & Bespoke Vacations',
            description: 'Comprehensive tour operator offering scheduled 5-Star Umrah departures, international holiday tours (Dubai, Europe, Bali), domestic escapes, and corporate MICE logistics.',
            serviceType: 'Travel Agency & Tour Operator',
            path: '/tours-travels',
          }),
          getBreadcrumbSchema([
            { name: 'Home', path: '/' },
            { name: 'Tours & Travels', path: '/tours-travels' },
          ]),
          getFAQSchema(TOURS_FAQS),
        ]}
      />
      <div className="film-grain" aria-hidden="true" />
      <Nav />
      <ChatWidget />
      <StickyCallBar />

      {/* ============================================================ */}
      {/* 1. HERO SECTION — WORLD HOLIDAYS & 5-STAR UMRAH */}
      {/* ============================================================ */}
      <section className="relative overflow-hidden bg-gradient-to-b from-[#061e38] via-[#092b4c] to-[#0a2d50] pb-24 pt-36 sm:pt-40 text-white border-b border-brand-gold/20">
        <DomainBackdrop theme="global" />
        <DomainDarkGraphics variant="umrah" />
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="hero-orb -right-20 -top-20 h-96 w-96 rounded-full bg-brand-gold/20 blur-3xl" />
          <div className="hero-orb -left-20 bottom-0 h-96 w-96 rounded-full bg-sky-500/20 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-7xl px-5 sm:px-6 md:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            {/* Left Content Column */}
            <div className="lg:col-span-7">
              <span className="inline-flex items-center gap-2 rounded-full border border-brand-gold/40 bg-brand-gold/10 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.2em] text-brand-gold shimmer-badge">
                🧳 Curated World Holidays · 5-Star Umrah · Corporate MICE
              </span>

              <h1 className="mt-5 font-display fluid-h1 font-black leading-tight tracking-tight text-white">
                Extraordinary Journeys, <span className="text-brand-gold">Flawlessly Managed</span>
              </h1>

              <p className="mt-5 text-base sm:text-lg leading-relaxed text-white/80 max-w-2xl font-light">
                From sacred 5-Star Umrah pilgrimages steps away from the Kaaba in Makkah &amp; Madinah to thrilling family vacations in Dubai, Switzerland, Kashmir, and Kerala — complete with scheduled airline blockings, pre-audited luxury hotels, and 100% visa assistance.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  href="#catalog-explorer"
                  className="rounded-full bg-brand-gold px-8 py-3.5 text-xs font-extrabold uppercase tracking-wider text-brand-navy shadow-[0_10px_30px_rgba(215,160,25,0.4)] transition-all hover:bg-brand-gold-hover hover:text-white tactile-btn cursor-pointer"
                >
                  Explore All Tour Packages ↓
                </a>
                <Link
                  href="/login"
                  className="rounded-full border border-white/25 bg-white/5 hover:bg-white/10 px-6 py-3.5 text-xs font-semibold text-white transition-all hover:border-brand-gold hover:text-brand-gold tactile-btn inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <span>🔒 Member Sign In for Live Rates</span>
                  <span className="text-[13px] text-brand-gold">➔</span>
                </Link>
              </div>
            </div>

            {/* Right Hero Visual Card */}
            <div className="lg:col-span-5 relative">
              <div className="relative rounded-3xl overflow-hidden border border-white/20 shadow-2xl group">
                <img
                  src="https://images.unsplash.com/photo-1512453979798-5ea266f8880c?auto=format&fit=crop&w=1200&q=80"
                  alt="Tours and Travels Global Destinations"
                  className="w-full h-80 sm:h-96 object-cover transform transition-transform duration-700 group-hover:scale-105"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#061e38] via-transparent to-transparent opacity-80" />
                <div className="absolute bottom-4 left-4 right-4 glass-light p-4 rounded-2xl text-brand-navy">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-display text-xs font-bold uppercase tracking-wider text-brand-gold">World Holidays &amp; Umrah</p>
                      <p className="font-display text-sm font-extrabold text-brand-navy">Direct Flights · 5★ Stays · Visa Support</p>
                    </div>
                    <span className="rounded-full bg-emerald-500/20 text-emerald-800 px-2.5 py-1 text-[13px] font-bold font-mono">
                      ● 2026 Batches Open
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 2. TRAVEL PILLARS & GUARANTEES */}
      {/* ============================================================ */}
      <section className="bg-white py-12 border-b border-brand-navy/5 relative overflow-hidden">
        <DomainBackdrop theme="global" />
        <div className="mx-auto max-w-7xl px-5 sm:px-6 relative z-10 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 text-center">
          <div>
            <span className="text-2xl mb-1 block">🧳</span>
            <p className="font-display font-extrabold text-sm text-brand-navy">Direct Airline Allocations</p>
            <p className="text-sm text-brand-textLight mt-0.5">Pre-blocked scheduled seats with confirmed PNRs</p>
          </div>
          <div>
            <span className="text-2xl mb-1 block">🏨</span>
            <p className="font-display font-extrabold text-sm text-brand-navy">5-Star &amp; 4-Star Stays</p>
            <p className="text-sm text-brand-textLight mt-0.5">50–100m Haram proximity &amp; audited resorts</p>
          </div>
          <div>
            <span className="text-2xl mb-1 block">🛡️</span>
            <p className="font-display font-extrabold text-sm text-brand-navy">100% Visa Assistance</p>
            <p className="text-sm text-brand-textLight mt-0.5">End-to-end filing with medical insurance</p>
          </div>
          <div>
            <span className="text-2xl mb-1 block">🧭</span>
            <p className="font-display font-extrabold text-sm text-brand-navy">24/7 Ground Concierge</p>
            <p className="text-sm text-brand-textLight mt-0.5">Muallim scholars &amp; dedicated tour directors</p>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 3. INTERACTIVE TOUR CATALOG WITH MEMBER PRICING POLICY */}
      {/* ============================================================ */}
      <section id="catalog-explorer" className="py-24 mx-auto max-w-7xl px-5 sm:px-6 lg:px-8 relative">
        <DomainBackdrop theme="global" />
        <div className="relative z-10">
          {/* Member Pricing Gate Notice */}
          <div className="mb-12 rounded-3xl border border-brand-navy/10 bg-white p-6 sm:p-8 shadow-sm flex flex-col md:flex-row items-center justify-between gap-6">
            <div className="space-y-1.5 text-center md:text-left">
              <span className="inline-flex items-center gap-2 rounded-full bg-brand-navy/5 px-3 py-1 text-sm font-extrabold uppercase tracking-wider text-brand-navy">
                🔒 Client &amp; Member Inventory Access
              </span>
              <h3 className="font-display font-black text-xl text-brand-navy">
                Live Departure Batches, Real-Time PNRs &amp; Member Rates
              </h3>
              <p className="text-xs text-brand-navy/70 max-w-2xl font-light">
                In accordance with our fair pricing and airline inventory policies, live dynamic rate cards, room allocations, and family discounts are exclusively accessible to authenticated OpusOS accounts.
              </p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-3 shrink-0">
              <Link
                href="/login"
                className="rounded-full bg-brand-navy px-6 py-3.5 text-xs font-black uppercase tracking-wider text-brand-gold hover:bg-brand-navy/90 shadow-md transition-all cursor-pointer inline-flex items-center gap-2"
              >
                <span>Sign In to Access Rates</span>
                <span>➔</span>
              </Link>
              <a
                href="#booking-quote-builder"
                className="rounded-full border border-brand-navy/20 bg-brand-cream/60 px-5 py-3.5 text-xs font-bold text-brand-navy hover:border-brand-gold hover:text-brand-gold transition cursor-pointer"
              >
                Request Itinerary
              </a>
            </div>
          </div>

          <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-12">
            <div className="space-y-2 max-w-xl">
              <span className="text-xs font-bold uppercase tracking-[0.2em] text-brand-gold">Destination Directory</span>
              <h2 className="font-display text-3xl sm:text-4xl font-extrabold text-brand-navy leading-tight">
                Curated Tour Packages &amp; Itineraries
              </h2>
              <p className="text-xs sm:text-sm text-brand-navy/65">
                Select a category below to filter our fixed group departures and custom vacation packages.
              </p>
            </div>

            {/* Filter Bar */}
            <div className="flex flex-wrap gap-2">
              {[
                { key: 'all', label: 'All Packages (8)' },
                { key: 'umrah_pilgrimage', label: '🕋 Umrah & Pilgrimage' },
                { key: 'international_holiday', label: '🏖️ International' },
                { key: 'domestic', label: '🏞️ Domestic' },
                { key: 'custom_group', label: '👥 Custom & MICE' },
              ].map((c) => (
                <button
                  key={c.key}
                  onClick={() => setSelectedCategory(c.key)}
                  className={`rounded-full px-5 py-2.5 text-xs font-extrabold transition-all cursor-pointer shadow-xs ${
                    selectedCategory === c.key
                      ? 'bg-brand-navy text-brand-gold scale-105 shadow-md'
                      : 'bg-white border border-brand-navy/15 text-brand-navy/70 hover:border-brand-gold hover:text-brand-navy'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>

          {/* Dynamic Card Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
            {filteredPackages.map((pkg) => (
              <div
                key={pkg.id}
                className="group flex flex-col justify-between rounded-3xl border border-brand-navy/10 bg-white overflow-hidden shadow-sm hover:shadow-2xl hover:border-brand-gold/60 transition-all duration-300 transform hover:-translate-y-1"
              >
                {/* Card Image Header */}
                <div className="relative h-56 w-full overflow-hidden bg-brand-navy/10">
                  <img
                    src={pkg.imageUrl}
                    alt={pkg.title}
                    className="h-full w-full object-cover transform group-hover:scale-110 transition-transform duration-700"
                    loading="lazy"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/20 to-transparent" />
                  
                  {/* Floating Badges */}
                  <div className="absolute top-3.5 left-3.5 right-3.5 flex items-center justify-between">
                    <span className="rounded-full bg-white/90 backdrop-blur-md px-3 py-1 text-[13px] font-black uppercase text-brand-navy shadow-xs">
                      {pkg.categoryBadge}
                    </span>
                    <span className="rounded-full bg-brand-gold px-2.5 py-0.5 text-[13px] font-black uppercase tracking-wider text-brand-navy shadow-xs">
                      {pkg.featuredBadge}
                    </span>
                  </div>

                  <div className="absolute bottom-3.5 left-3.5 right-3.5 text-white">
                    <div className="text-xs font-semibold opacity-90">📍 {pkg.destination}</div>
                    <div className="text-sm font-mono opacity-75">{pkg.duration}</div>
                  </div>
                </div>

                {/* Card Body */}
                <div className="p-6 space-y-4 flex-1 flex flex-col justify-between">
                  <div className="space-y-3">
                    <h3 className="font-display text-lg font-bold text-brand-navy leading-snug group-hover:text-brand-gold transition-colors">
                      {pkg.title}
                    </h3>
                    <p className="text-xs text-brand-navy/70 leading-relaxed font-light line-clamp-2">
                      {pkg.tagline}
                    </p>

                    <div className="space-y-2 rounded-2xl bg-brand-cream/80 border border-brand-navy/[0.06] p-3 text-xs">
                      <div className="font-semibold text-brand-navy truncate">🏨 {pkg.hotelSummary}</div>
                      <div className="text-brand-navy/75 text-sm truncate">🧳 {pkg.flightRoute}</div>
                    </div>

                    <div className="space-y-1.5 pt-1">
                      <div className="text-[13px] font-extrabold uppercase tracking-wider text-brand-navy/50">Top Inclusions:</div>
                      <div className="flex flex-wrap gap-1.5">
                        {pkg.inclusions.slice(0, 3).map((inc, i) => (
                          <span key={i} className="rounded-md bg-brand-navy/[0.04] px-2 py-0.5 text-[13px] font-medium text-brand-navy/80">
                            ✓ {inc}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Card Footer with Policy Gated Rates */}
                  <div className="pt-4 mt-4 border-t border-brand-navy/10 flex items-center justify-between gap-3">
                    <div>
                      <span className="inline-flex items-center gap-1.5 rounded-md bg-brand-navy/[0.04] px-2.5 py-1 text-sm font-bold text-brand-navy">
                        🔒 Member Rates
                      </span>
                      <div className="text-[13px] text-brand-navy/50 font-bold uppercase mt-0.5">Live Inventory &amp; PNRs</div>
                    </div>

                    <div className="flex items-center gap-2">
                      <Link
                        href="/login"
                        className="rounded-xl border border-brand-navy/20 bg-white px-3 py-2 text-xs font-bold text-brand-navy hover:border-brand-gold hover:text-brand-gold transition cursor-pointer"
                      >
                        Sign In ➔
                      </Link>
                      <button
                        onClick={() => {
                          setSelectedPackage(pkg);
                          const el = document.getElementById('booking-quote-builder');
                          el?.scrollIntoView({ behavior: 'smooth' });
                        }}
                        className="rounded-xl bg-brand-navy px-3 py-2 text-xs font-bold text-brand-gold hover:bg-brand-navy/90 shadow-xs transition cursor-pointer"
                      >
                        Inquire
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 4. IMMERSIVE UMRAH SACRED SPOTLIGHT */}
      {/* ============================================================ */}
      <section className="py-24 bg-[#061e38] text-white relative overflow-hidden border-y border-brand-gold/20">
        <DomainBackdrop theme="global" />
        <DomainDarkGraphics variant="umrah" />
        <div className="relative mx-auto max-w-7xl px-5 sm:px-6 lg:px-8 z-10">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 lg:gap-16 items-center">
            <div className="lg:col-span-6 space-y-6">
              <span className="inline-flex items-center gap-2 rounded-full border border-brand-gold/40 bg-brand-gold/15 px-4 py-1 text-xs font-bold uppercase tracking-widest text-brand-gold">
                🕋 Sacred Pilgrimage Excellence
              </span>

              <h2 className="font-display text-3xl sm:text-4xl lg:text-5xl font-black text-white leading-tight">
                Perform Your Umrah with <br />
                <span className="text-brand-gold">Haram-Facing 5-Star Luxury</span>
              </h2>

              <p className="text-sm sm:text-base text-white/80 leading-relaxed font-light">
                Experience spiritual peace with zero logistical stress. Every group departure is accompanied by bilingual Islamic scholars to guide pilgrims step-by-step through Ihram, Tawaf, Sa’i, and comprehensive historical Ziyarat tours in Makkah &amp; Madinah.
              </p>

              <div className="grid grid-cols-2 gap-4 pt-2 text-xs">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-1 backdrop-blur-md">
                  <div className="font-bold text-brand-gold text-sm">50–100m Proximity</div>
                  <div className="text-white/70 text-sm">Clock Tower and courtyard properties steps away from Kaaba gates.</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-1 backdrop-blur-md">
                  <div className="font-bold text-brand-gold text-sm">Direct Saudi eVisa</div>
                  <div className="text-white/70 text-sm">Full digital issuance with mandatory medical insurance &amp; verified QR.</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-1 backdrop-blur-md">
                  <div className="font-bold text-brand-gold text-sm">Senior Muallim Led</div>
                  <div className="text-white/70 text-sm">Scholarly guidance in Urdu, Telugu, Hindi, and English throughout.</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4 space-y-1 backdrop-blur-md">
                  <div className="font-bold text-brand-gold text-sm">Full Indian Catering</div>
                  <div className="text-white/70 text-sm">Hygienic 3-course buffet meals with hot rotis &amp; 5L Zamzam water.</div>
                </div>
              </div>
            </div>

            {/* Departure Batch Radar */}
            <div className="lg:col-span-6 rounded-3xl border border-white/15 bg-white/5 p-7 space-y-5 backdrop-blur-md shadow-2xl">
              <div>
                <h3 className="font-display font-black text-lg text-brand-gold">
                  Scheduled Umrah Departure Calendar (Ex-Hyderabad)
                </h3>
                <p className="text-xs text-white/70 mt-1">
                  Fixed group seats with confirmed Saudia / IndiGo PNRs and locked hotel allocations.
                </p>
              </div>

              <div className="space-y-3">
                {[
                  { date: '15 Sep 2026', seats: '4 Seats Left', name: '5-Star Clock Tower Executive' },
                  { date: '28 Sep 2026', seats: '9 Seats Left', name: 'Classic Economy 14-Day Group' },
                  { date: '12 Oct 2026', seats: 'Available', name: 'Autumn Family Deluxe Group' },
                  { date: '26 Oct 2026', seats: 'Available', name: 'Executive Winter Departure' },
                ].map((dep, i) => (
                  <div key={i} className="flex items-center justify-between rounded-2xl bg-white/10 p-4 text-xs border border-white/10 hover:border-brand-gold/40 transition-colors">
                    <div>
                      <div className="font-bold text-white text-sm">{dep.date}</div>
                      <div className="text-xs text-white/80">{dep.name}</div>
                      <div className="text-[13px] text-emerald-400 font-bold mt-0.5">{dep.seats}</div>
                    </div>
                    <div className="text-right">
                      <Link
                        href="/login"
                        className="inline-flex items-center gap-1 rounded-lg bg-brand-gold px-3 py-1.5 text-sm font-black text-brand-navy hover:bg-brand-gold-hover transition cursor-pointer"
                      >
                        <span>View Rate Card</span>
                        <span>➔</span>
                      </Link>
                      <div className="text-[13px] text-white/60 mt-0.5">Member Login Required</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 5. CUSTOM ITINERARY CONFIGURATOR & INQUIRY FORM */}
      {/* ============================================================ */}
      <section id="booking-quote-builder" className="py-24 mx-auto max-w-7xl px-5 sm:px-6 lg:px-8 relative">
        <DomainBackdrop theme="global" />
        <div className="relative z-10">
          <div className="text-center max-w-2xl mx-auto mb-14 space-y-2">
            <span className="text-xs font-bold uppercase tracking-[0.2em] text-brand-gold">Instant Tour Advisory</span>
            <h2 className="font-display text-3xl sm:text-4xl font-extrabold text-brand-navy">Configure &amp; Request Custom Itinerary</h2>
            <p className="text-xs sm:text-sm text-brand-navy/65">
              Select your travel group size and preferences for <span className="font-bold text-brand-navy">{selectedPackage.title}</span>.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
            {/* Left: Tour Configuration Summary */}
            <div className="lg:col-span-5 rounded-3xl border border-brand-navy/15 bg-white p-7 shadow-lg space-y-6">
              <div>
                <span className="rounded-full bg-brand-gold/15 px-3 py-1 text-[13px] font-bold text-brand-navy uppercase">
                  Selected Tour Package
                </span>
                <h3 className="font-display font-black text-xl text-brand-navy mt-2">{selectedPackage.title}</h3>
                <p className="text-xs text-brand-navy/60 mt-1">📍 {selectedPackage.destination} · {selectedPackage.duration}</p>
              </div>

              <div className="space-y-5 pt-3 border-t border-brand-navy/10">
                <div>
                  <label className="text-[13px] font-bold uppercase text-brand-navy/60 tracking-wider">Number of Travelers (Pax)</label>
                  <div className="flex items-center gap-2.5 mt-2">
                    {[1, 2, 4, 6, 10].map((n) => (
                      <button
                        key={n}
                        type="button"
                        onClick={() => setEstimatorPax(n)}
                        className={`flex-1 rounded-xl py-2.5 text-xs font-bold transition cursor-pointer ${
                          estimatorPax === n
                            ? 'bg-brand-navy text-brand-gold shadow-xs'
                            : 'bg-brand-cream border border-brand-navy/10 text-brand-navy/70 hover:bg-slate-100'
                        }`}
                      >
                        {n} {n === 1 ? 'Solo' : 'Pax'}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="text-[13px] font-bold uppercase text-brand-navy/60 tracking-wider">Hotel Rooming Preference</label>
                  <div className="grid grid-cols-2 gap-3 mt-2">
                    <button
                      type="button"
                      onClick={() => setEstimatorHotelTier('standard')}
                      className={`rounded-2xl p-3 text-left border text-xs transition cursor-pointer ${
                        estimatorHotelTier === 'standard'
                          ? 'border-brand-navy bg-brand-navy/5 font-bold text-brand-navy'
                          : 'border-brand-navy/10 text-brand-navy/70'
                      }`}
                    >
                      <div className="font-bold">Standard Shared</div>
                      <div className="text-[13px] text-brand-navy/50">Quad / Triple Sharing</div>
                    </button>

                    <button
                      type="button"
                      onClick={() => setEstimatorHotelTier('luxury')}
                      className={`rounded-2xl p-3 text-left border text-xs transition cursor-pointer ${
                        estimatorHotelTier === 'luxury'
                          ? 'border-brand-navy bg-brand-navy/5 font-bold text-brand-navy'
                          : 'border-brand-navy/10 text-brand-navy/70'
                      }`}
                    >
                      <div className="font-bold">Private Suite</div>
                      <div className="text-[13px] text-brand-navy/50">Double / VIP Room</div>
                    </button>
                  </div>
                </div>

                <div className="rounded-2xl bg-brand-navy p-5 text-white space-y-3">
                  <div className="flex justify-between items-center text-xs text-brand-gold font-bold">
                    <span>Transparent Pricing Policy</span>
                    <span>Itemized Rate Card</span>
                  </div>
                  <p className="text-xs text-white/80 leading-relaxed">
                    Official milestone payment schedules, flight PNRs, hotel vouchers, and GST breakdowns for <strong>{estimatorPax} Traveler(s)</strong> ({estimatorHotelTier === 'luxury' ? 'Private Suite' : 'Standard Shared'}) are generated upon request or unlocked in your member account.
                  </p>
                  <div className="pt-2 flex items-center justify-between border-t border-white/10 text-sm text-white/60">
                    <span>Direct Airline Blockings</span>
                    <span>100% Visa Assistance</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right: Submission Form */}
            <div className="lg:col-span-7 rounded-3xl border border-brand-navy/15 bg-white p-7 shadow-lg space-y-6">
              <div>
                <h3 className="font-display font-black text-xl text-brand-navy">Request Official Itinerary &amp; Dates</h3>
                <p className="text-xs text-brand-navy/60 mt-1">
                  Receive the day-by-day itinerary, airline flight schedules, and official quote on WhatsApp.
                </p>
              </div>

              {formFeedback && (
                <div className={`p-4 rounded-2xl text-xs font-semibold ${
                  formFeedback.startsWith('✅') ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'
                }`}>
                  {formFeedback}
                </div>
              )}

              <form onSubmit={handleSubmitInquiry} className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[13px] font-bold uppercase tracking-wider text-brand-navy/60 block mb-1">Full Name *</label>
                    <input
                      type="text"
                      required
                      value={travelerName}
                      onChange={(e) => setTravelerName(e.target.value)}
                      placeholder="e.g. Mohammed Farooq"
                      className="w-full rounded-xl border border-brand-navy/20 p-3 text-xs bg-white text-brand-navy outline-none focus:border-brand-gold focus:ring-1 focus:ring-brand-gold"
                    />
                  </div>

                  <div>
                    <label className="text-[13px] font-bold uppercase tracking-wider text-brand-navy/60 block mb-1">WhatsApp Mobile *</label>
                    <input
                      type="tel"
                      required
                      value={travelerPhone}
                      onChange={(e) => setTravelerPhone(e.target.value)}
                      placeholder="+91 98765 43210"
                      className="w-full rounded-xl border border-brand-navy/20 p-3 text-xs bg-white text-brand-navy outline-none focus:border-brand-gold focus:ring-1 focus:ring-brand-gold"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[13px] font-bold uppercase tracking-wider text-brand-navy/60 block mb-1">Email Address</label>
                    <input
                      type="email"
                      value={travelerEmail}
                      onChange={(e) => setTravelerEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full rounded-xl border border-brand-navy/20 p-3 text-xs bg-white text-brand-navy outline-none focus:border-brand-gold focus:ring-1 focus:ring-brand-gold"
                    />
                  </div>

                  <div>
                    <label className="text-[13px] font-bold uppercase tracking-wider text-brand-navy/60 block mb-1">Planned Travel Month</label>
                    <select
                      value={travelMonth}
                      onChange={(e) => setTravelMonth(e.target.value)}
                      className="w-full rounded-xl border border-brand-navy/20 p-3 text-xs bg-white text-brand-navy outline-none focus:border-brand-gold focus:ring-1 focus:ring-brand-gold"
                    >
                      <option value="Next Month">Next Month</option>
                      <option value="Sep 2026">September 2026</option>
                      <option value="Oct 2026">October 2026</option>
                      <option value="Nov 2026">November 2026</option>
                      <option value="Dec 2026">December 2026</option>
                      <option value="Flexible">Flexible / Exploring</option>
                    </select>
                  </div>
                </div>

                <div className="flex items-center gap-2 pt-2">
                  <input
                    type="checkbox"
                    id="consent-tours"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    className="rounded border-brand-navy/20 text-brand-navy focus:ring-brand-gold"
                  />
                  <label htmlFor="consent-tours" className="text-sm text-brand-navy/70">
                    I grant consent for Opus Overseas travel consultants to contact me under the DPDP Act.
                  </label>
                </div>

                <TurnstileWidget onToken={setTurnstileToken} />

                <button
                  type="submit"
                  disabled={submitting}
                  className="w-full rounded-2xl bg-brand-gold p-4 text-xs font-black uppercase tracking-widest text-brand-navy hover:bg-brand-gold-hover shadow-md hover:shadow-lg transition-all cursor-pointer"
                >
                  {submitting ? 'Submitting Inquiry…' : 'Submit & Receive Itinerary Breakdown ➔'}
                </button>
              </form>
            </div>
          </div>
        </div>
      </section>

      {/* ============================================================ */}
      {/* 6. GEO & AEO KNOWLEDGE HUB FAQ */}
      {/* ============================================================ */}
      <GeoFaqSection
        badge="Tour Planning & Verification"
        title="Frequently Asked Questions"
        subtitle="Transparent information regarding flight departures, hotel distances, visa filing, and cancellation policies."
        summaryTitle="Opus Overseas — Licensed Tours & Travels Operator"
        summaryText="Opus Overseas is a premier global tour operator headquartered in Nizamabad, Telangana, India. We deliver verified 5-Star Umrah pilgrimage packages, international holidays (Dubai, Europe, Bali), domestic escapes (Kashmir, Kerala), and corporate MICE solutions with 100% compliant documentation and direct airlines."
        faqs={TOURS_FAQS}
      />

      <Footer />
    </div>
  );
}
