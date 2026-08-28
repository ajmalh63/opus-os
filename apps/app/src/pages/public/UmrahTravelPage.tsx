import InteractiveFunnelModal from '../../components/funnel/InteractiveFunnelModal';
import { leadFormHref } from '../../config/booking';
import React, { useState } from 'react';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
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
const API = (import.meta as any).env?.VITE_API_URL || 'https://opusos-api.ajmalsn63.workers.dev';

const UMRAH_FAQS = [
  {
    question: 'What is included in the Opus Overseas All-Inclusive Umrah package from Hyderabad?',
    answer: 'Our packages include direct/1-stop scheduled return air tickets from Hyderabad, guaranteed 3-Star to 5-Star hotel stays within 50–200 meters of the Haram in Makkah and Madinah, direct Saudi tourist/Umrah e-visa with medical insurance, luxury air-conditioned ground transfers, full buffet meals, and scholar-led Ziyarat tours.',
  },
  {
    question: 'How close are the hotels to Masjid al-Haram and Masjid an-Nabawi?',
    answer: 'Our 5-Star Executive packages feature clock tower and courtyard properties within 50 meters of the Haram gates. Economy and Classic group packages are within 150 to 350 meters with 24/7 dedicated shuttle options.',
  },
  {
    question: 'What documents are required for Indian passport holders to apply for Umrah?',
    answer: 'Indian pilgrims require an original passport valid for at least 6 months, white background passport photos, PAN card copy, and contact details. Visa issuance is 100% digital with immediate QR verification.',
  },
  {
    question: 'Are guided historical Ziyarat and religious rituals guided by experienced scholars?',
    answer: 'Yes. Every group departure is accompanied by an experienced bilingual Muallim / Islamic scholar who guides pilgrims step-by-step through Ihram, Tawaf, Sa’i, and guided historical tours of Cave Hira, Mount Uhud, and Masjid Quba.',
  },
  {
    question: 'Can customized private family packages and wheelchair assistance be arranged?',
    answer: 'Yes. We offer customized private VIP departures tailored for families and elderly pilgrims, including private GMC transfers, ground assistance, and wheelchair coordinators inside the Haram plazas.',
  },
];

interface Departure {
  id: string;
  packageTier: string;
  departureDate: number;
  seatsLeft: number;
  capacity: number;
  availability: 'green' | 'yellow' | 'red';
  pricePaise: number;
  bookingFeePaise: number;
}

const fmtDate = (ts: number) =>
  new Date(ts * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });

const ITINERARY_DAYS = [
  { day: 'Day 01 - 02', title: 'Arrival in Jeddah & Transfer to Makkah', desc: 'Direct flight from Hyderabad. Private air-conditioned coach transfer to Makkah hotel. Perform first Umrah under senior Muallim guidance.' },
  { day: 'Day 03 - 06', title: 'Ibadah in Masjid al-Haram & Makkah Ziyarat', desc: 'Daily prayers at the Kaaba. Guided historical tour to Cave of Hira (Jabal al-Nour), Jabal al-Thawr, Mina, Muzdalifah, and Mount Arafat.' },
  { day: 'Day 07 - 11', title: 'Transfer to Madinah al-Munawwarah', desc: 'High-speed Haramain train transfer to Madinah. Stays within 100 meters of the Prophet’s Mosque (Al-Masjid an-Nabawi). Salam at Rawdah ash-Sharifah.' },
  { day: 'Day 12 - 14', title: 'Madinah Historical Ziyarat & Return Departure', desc: 'Visit to Quba Mosque (first mosque of Islam), Mount Uhud martyrs cemetery, and dates market. Transfer to Madinah/Jeddah airport for home flight.' },
];

export default function UmrahTravelPage() {
  useVisibilityTracking('/umrah-travel');
  const [, setLocation] = useLocation();

  // Selected package state
  const [selectedPackage, setSelectedPackage] = useState<string>('5-Star Executive Haram View');
  const [funnelOpen, setFunnelOpen] = useState(false);
  // Partner attribution: /go deep links land here with ?ref= — forward it so the referral is credited.
  const refCode = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('ref') || undefined : undefined;
  const [selectedDeparture, setSelectedDeparture] = useState<Departure | null>(null);

  // Booking Form State
  const [pilgrimName, setPilgrimName] = useState('');
  const [pilgrimPhone, setPilgrimPhone] = useState('');
  const [pilgrimEmail, setPilgrimEmail] = useState('');
  const [travelersCount, setTravelersCount] = useState(2);
  const [roomType, setRoomType] = useState('double');
  const [consent, setConsent] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [formFeedback, setFormFeedback] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Fetch real group departures from backend
  const { data: departuresData, isLoading: loadingDepartures } = useQuery({
    queryKey: ['publicUmrahDepartures'],
    queryFn: async () => {
      const res = await fetch(`${API}/api/public/umrah/departures`, { credentials: 'include', });
      if (!res.ok) return { departures: [] };
      return res.json();
    },
    staleTime: 60_000,
  });

  const departures: Departure[] = departuresData?.departures || [];

  // Submit Pilgrim Booking Inquiry
  const handleSubmitBooking = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!consent) {
      setFormFeedback('Please grant DPDP data processing consent.');
      return;
    }
    setSubmitting(true);
    setFormFeedback(null);

    const digits = pilgrimPhone.replace(/\D/g, '');
    const normalizedPhone = digits.length === 10 ? `+91 ${digits.slice(0, 5)} ${digits.slice(5)}` : pilgrimPhone;

    try {
      const res = await fetch(`${API}/api/public/leads`, { credentials: 'include', 
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(turnstileToken ? { 'cf-turnstile-response': turnstileToken } : {}),
        },
        body: JSON.stringify({
          name: pilgrimName,
          phone: normalizedPhone,
          email: pilgrimEmail,
          highestQualification: 'undergrad',
          division: 'umrah',
          leadSource: 'website-umrah-travel',
          dynamicContext: {
            packageTier: selectedPackage,
            departureId: selectedDeparture?.id,
            departureDate: selectedDeparture ? fmtDate(selectedDeparture.departureDate) : 'Upcoming Group',
            travelersCount,
            roomType,
          },
          consents: { coreProcessing: consent, whatsappUpdates: true, marketingCampaigns: true },
          ...(refCode ? { refCode } : {}),
        }),
      });

      const data = await res.json();
      if (res.ok) {
        track(EVENTS.leadSubmit, { division: 'umrah' });
        setLocation(`/portal?token=${encodeURIComponent(data.token)}`);
      } else {
        setFormFeedback(data.error || 'Booking submission failed.');
      }
    } catch (err: any) {
      setFormFeedback(`Network error: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAF8F4] font-sans text-brand-navy selection:bg-brand-gold selection:text-brand-navy">
      <SEOHead
        title="Umrah Packages 2026 from Hyderabad | All-Inclusive Tours | Opus Overseas"
        description="Premium & economy all-inclusive Umrah tour packages from Hyderabad. 5-Star Haram proximity hotels in Makkah and Madinah, direct e-visas, scholar guidance & Ziyarat."
        canonicalPath="/umrah-travel"
        schemas={[
          BASE_ORGANIZATION_SCHEMA,
          getServiceSchema({
            name: 'All-Inclusive Umrah Packages & Sacred Pilgrimage Logistics',
            description: 'Scheduled group and VIP private Umrah departures from Hyderabad with verified Haram view hotel accommodations, Saudi e-visas, full catering, and guided Ziyarat.',
            serviceType: 'Pilgrimage Travel Agency',
            path: '/umrah-travel',
          }),
          getBreadcrumbSchema([
            { name: 'Home', path: '/' },
            { name: 'Umrah Travel', path: '/umrah-travel' },
          ]),
          getFAQSchema(UMRAH_FAQS),
        ]}
      />
      <div className="film-grain" aria-hidden="true" />
      <Nav />
      <ChatWidget />
      <StickyCallBar />

      {/* HERO SECTION — Spiritual Prestige & Guaranteed Proximity */}
      <section className="relative overflow-hidden bg-gradient-to-b from-[#061e38] via-[#082342] to-[#0a2d50] pb-24 pt-36 sm:pt-40 text-white border-b border-brand-gold/20">
        <DomainBackdrop theme="umrah" />
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="hero-orb -right-20 -top-20 h-96 w-96 rounded-full bg-brand-gold/20 blur-3xl" />
          <div className="hero-orb -left-20 bottom-0 h-96 w-96 rounded-full bg-emerald-500/20 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-7xl px-5 sm:px-6 md:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            <div className="lg:col-span-7">
              <span className="inline-flex items-center gap-2 rounded-full border border-brand-gold/40 bg-brand-gold/15 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.2em] text-brand-gold shimmer-badge">
                🕋 Sacred Journey Logistics · Direct Departures
              </span>
              <h1 className="mt-5 font-display fluid-h1 font-black leading-tight tracking-tight text-white">
                Experience a Peaceful Umrah with <span className="text-brand-gold">Haram-Facing Luxury</span>
              </h1>
              <p className="mt-5 text-base sm:text-lg leading-relaxed text-white/80 max-w-2xl">
                All-inclusive group and customized Umrah packages. Verified 5-star hotels within steps of the Haram, direct flights from Hyderabad, and experienced spiritual scholars.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  href="#departures"
                  className="rounded-full bg-brand-gold px-8 py-3.5 text-xs font-extrabold uppercase tracking-wider text-brand-navy shadow-[0_10px_30px_rgba(215,160,25,0.4)] transition-all hover:bg-brand-gold-hover hover:text-white tactile-btn cursor-pointer"
                >
                  View Live Group Departures ↓
                </a>
                <a
                  href={leadFormHref()}
                  className="rounded-full border border-white/25 bg-white/5 hover:bg-white/10 px-6 py-3.5 text-xs font-semibold text-white transition-all hover:border-brand-gold hover:text-brand-gold tactile-btn inline-flex items-center gap-1.5"
                >
                  <span>📝 Custom Package Inquiry</span>
                  <span className="text-[13px] text-brand-gold">↗</span>
                </a>
              </div>
            </div>

            <div className="lg:col-span-5 relative">
              <div className="relative rounded-3xl overflow-hidden border border-white/20 shadow-2xl group">
                <img
                  src="/img/hero-umrah-travel.jpg"
                  alt="Masjid al-Haram and Kaaba"
                  className="w-full h-80 sm:h-96 object-cover transform transition-transform duration-700 group-hover:scale-105"
                  onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#041a33] via-transparent to-transparent opacity-80" />
                <div className="absolute bottom-4 left-4 right-4 glass-light p-4 rounded-2xl text-brand-navy">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-display text-xs font-bold uppercase tracking-wider text-brand-gold">Haramain Verified</p>
                      <p className="font-display text-sm font-extrabold text-brand-navy">Under 100m Hotel Stays</p>
                    </div>
                    <span className="rounded-full bg-emerald-500/20 text-emerald-800 px-2.5 py-1 text-[13px] font-bold font-mono">
                      ● Direct Flights
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* PILLARS OF EXCELLENCE */}
      <section className="bg-white py-12 border-b border-brand-navy/5">
        <div className="mx-auto max-w-7xl px-5 sm:px-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 text-center">
          <div>
            <span className="text-2xl mb-1 block">🕌</span>
            <p className="font-display font-extrabold text-sm text-brand-navy">Haram Proximity</p>
            <p className="text-sm text-brand-textLight mt-0.5">Under 150m walking distance</p>
          </div>
          <div>
            <span className="text-2xl mb-1 block">🧳</span>
            <p className="font-display font-extrabold text-sm text-brand-navy">Direct Saudi Airlines</p>
            <p className="text-sm text-brand-textLight mt-0.5">Hyderabad to Jeddah direct</p>
          </div>
          <div>
            <span className="text-2xl mb-1 block">🍲</span>
            <p className="font-display font-extrabold text-sm text-brand-navy">Indian Buffet Catering</p>
            <p className="text-sm text-brand-textLight mt-0.5">Breakfast, Lunch & Dinner</p>
          </div>
          <div>
            <span className="text-2xl mb-1 block">📜</span>
            <p className="font-display font-extrabold text-sm text-brand-navy">Comprehensive Umrah Visa</p>
            <p className="text-sm text-brand-textLight mt-0.5">Biometric & portal filing assistance</p>
          </div>
        </div>
      </section>

      {/* EDITORIAL TRUST STORY & SPIRITUAL HOSPITALITY */}
      <section className="mx-auto max-w-7xl px-5 sm:px-6 py-16 sm:py-20 border-b border-brand-navy/5">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center">
          <div className="lg:col-span-6">
            <div className="relative rounded-3xl overflow-hidden shadow-2xl border border-brand-navy/10 group">
              <img
                src="/img/editorial-umrah-travel.jpg"
                alt="Panoramic view of the Holy Kaaba and Masjid al-Haram from luxury suite"
                className="w-full h-[360px] sm:h-[420px] object-cover transition-transform duration-700 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#061e38]/80 via-transparent to-transparent" />
              <div className="absolute bottom-4 left-4 right-4 bg-white/90 backdrop-blur-md p-4 rounded-2xl border border-white/40">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold uppercase tracking-wider text-brand-gold">Haramain Courtyard Access</p>
                    <p className="text-xs sm:text-sm font-extrabold text-brand-navy">5-Star Proximity Guarantee</p>
                  </div>
                  <span className="rounded-full bg-emerald-500/15 text-emerald-800 px-2.5 py-1 text-[13px] font-bold font-mono">
                    ● Under 150m Walk
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-6 space-y-6">
            <div>
              <span className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-brand-gold">
                Sacred Hospitality
              </span>
              <h2 className="font-display fluid-h2 font-extrabold text-brand-navy mt-1">
                Sanctuary Comfort & Guided Spiritual Devotion
              </h2>
              <p className="text-xs sm:text-sm text-brand-textLight leading-relaxed mt-2.5">
                Every detail of your sacred journey is curated for peace of mind. We secure direct flights, prime courtyard hotels, executive buffet dining, and scholar-guided rites for families across India.
              </p>
            </div>

            <div className="space-y-3.5">
              <div className="clay-card p-4 flex items-start gap-3.5 border-l-4 border-l-brand-gold">
                <span className="text-xl">🕌</span>
                <div>
                  <h3 className="font-display text-sm font-bold text-brand-navy">Under 150m Courtyard Proximity</h3>
                  <p className="text-xs text-brand-textLight leading-relaxed mt-0.5">Stay steps away from the Haram gates in Makkah and the Prophet's Mosque in Madinah for effortless prayer access for elders and children.</p>
                </div>
              </div>

              <div className="clay-card p-4 flex items-start gap-3.5 border-l-4 border-l-brand-navy">
                <span className="text-xl">🧳</span>
                <div>
                  <h3 className="font-display text-sm font-bold text-brand-navy">Direct Saudi Airlines Flight Allocations</h3>
                  <p className="text-xs text-brand-textLight leading-relaxed mt-0.5">Guaranteed airline group blocks from Hyderabad directly into Jeddah or Madinah with zero multi-city layovers.</p>
                </div>
              </div>

              <div className="clay-card p-4 flex items-start gap-3.5 border-l-4 border-l-emerald-600">
                <span className="text-xl">📖</span>
                <div>
                  <h3 className="font-display text-sm font-bold text-brand-navy">Dedicated Muallim Spiritual Mentorship</h3>
                  <p className="text-xs text-brand-textLight leading-relaxed mt-0.5">Certified scholars accompany each group for step-by-step Umrah guidance, history lectures, and guided Ziyarat tours.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* LIVE DEPARTURES RADAR (Connected to /api/public/umrah/departures) */}
      <section id="departures" className="mx-auto max-w-7xl px-5 sm:px-6 py-20 sm:py-24">
        <div className="mb-12 text-center space-y-3">
          <span className="rounded-full bg-emerald-500/10 border border-emerald-500/30 px-3.5 py-1 text-sm font-bold uppercase tracking-wider text-emerald-800 font-mono">
            Direct Flight Allocations
          </span>
          <h2 className="font-display fluid-h2 font-bold text-brand-navy">
            Scheduled Group Departures
          </h2>
          <p className="text-sm sm:text-base text-brand-textLight max-w-lg mx-auto">
            Live seat counts updated directly from airline group booking manifests.
          </p>
        </div>

        {loadingDepartures ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-44 rounded-2xl bg-brand-navy/5 animate-pulse" />
            ))}
          </div>
        ) : departures.length === 0 ? (
          <div className="clay-card p-12 text-center text-brand-textLight max-w-lg mx-auto space-y-2">
            <span className="inline-block rounded-full bg-emerald-500/15 text-emerald-800 px-3 py-1 font-mono text-[13px] font-bold">
              ● Upcoming Lunar Cycle Flight Allocations
            </span>
            <p className="font-bold text-brand-navy text-sm">Next Scheduled Group Departures Finalizing</p>
            <p className="text-xs text-brand-textLight">Direct Hyderabad flight blocks and 5-star hotel allotments are being confirmed for the upcoming month. Submit your family inquiry below for priority seat lock.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {departures.map((d) => (
              <div
                key={d.id}
                className="clay-card p-6 flex flex-col justify-between hover:border-brand-gold/40 transition-all group"
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <span className="font-mono text-xs font-bold text-brand-gold">
                      📅 {fmtDate(d.departureDate)}
                    </span>
                    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[13px] font-extrabold ${
                      d.availability === 'green' ? 'bg-emerald-100 text-emerald-800' : d.availability === 'yellow' ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'
                    }`}>
                      <span className="h-1.5 w-1.5 rounded-full bg-current" />
                      {d.seatsLeft} Seats Open
                    </span>
                  </div>

                  <h3 className="font-display text-base font-bold text-brand-navy capitalize mb-2">
                    {d.packageTier} Departure
                  </h3>

                  <p className="text-xs text-brand-textLight leading-relaxed mb-4">
                    14 Days Total (7N Makkah + 7N Madinah) · Hyderabad Departure · Ziyarat & Flights Included.
                  </p>
                </div>

                <div className="pt-4 border-t border-brand-navy/5 flex items-center justify-between">
                  <div>
                    <span className="text-[13px] font-bold uppercase tracking-wider text-brand-textLight block">Direct Flight & Stay</span>
                    <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 border border-emerald-200 px-2 py-0.5 text-xs font-bold text-emerald-800">
                      Confirmed Group Block
                    </span>
                  </div>
                  <button
                    onClick={() => {
                      setSelectedDeparture(d);
                      document.getElementById('booking-section')?.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className="min-h-11 cursor-pointer rounded-full bg-brand-gold px-4 py-2 text-xs font-bold uppercase tracking-wider text-brand-navy hover:bg-brand-gold-hover hover:text-white transition-all tactile-btn sm:min-h-0"
                  >
                    Reserve Seat →
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* PACKAGE COMPARISON MATRIX */}
      <section id="packages" className="bg-[#061e38] text-white py-20 border-y border-brand-gold/15 relative overflow-hidden">
        <DomainDarkGraphics variant="umrah" />
        <div className="relative mx-auto max-w-7xl px-5 sm:px-6">
          <div className="mb-14 text-center space-y-3">
            <h2 className="font-display fluid-h2 font-extrabold text-white">
              Package Options Tailored to Your Family
            </h2>
            <p className="text-sm text-white/70 max-w-md mx-auto">
              Choose your preferred comfort tier with full transparent inclusions.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {[
              {
                title: '5-Star Executive Haram View',
                tierTag: 'Direct Haram View · VIP Executive',
                badge: 'Most Popular',
                hotelMakkah: 'Swissôtel / Fairmont Clock Tower (50m)',
                hotelMadinah: 'Dar Al Taqwa / Oberoi Madinah (70m)',
                features: ['Direct Kaaba / Haram view rooms', 'Full VIP Buffet Catering', 'Haramain Bullet Train Executive Class', 'Private GMC Luxury Ziyarat'],
              },
              {
                title: 'Deluxe Comfort Package',
                tierTag: 'Premium Walking Distance · Deluxe',
                badge: 'Best Value',
                hotelMakkah: 'Voco Makkah / Pullman Zamzam (150m)',
                hotelMadinah: 'Frontel Al Harithia (100m)',
                features: ['Walking distance under 3 minutes', '3-Course Indian Buffet Meals', 'Air-Conditioned VIP Coach transfers', 'Guided group Ziyarat tours'],
              },
              {
                title: 'Economy Pilgrimage Package',
                tierTag: 'Affordable Family Comfort · Standard',
                badge: 'Budget Friendly',
                hotelMakkah: '3-Star Standard (350m with 24/7 shuttle)',
                hotelMadinah: '3-Star Central Markaziah (250m)',
                features: ['Clean air-conditioned rooms', 'Full catering included', 'Group spiritual guidance by Scholar', 'Complete visa & insurance coverage'],
              },
            ].map((pkg) => (
              <div key={pkg.title} className="glass-light p-6 sm:p-7 rounded-2xl sm:rounded-3xl text-brand-navy shadow-2xl flex flex-col justify-between">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="rounded-full bg-brand-gold/20 text-brand-navy px-3 py-0.5 text-[13px] font-bold uppercase tracking-wider font-mono">
                      {pkg.badge}
                    </span>
                  </div>
                  <h3 className="font-display text-lg font-bold text-brand-navy mb-1">{pkg.title}</h3>
                  <p className="font-display text-sm font-extrabold text-brand-navy mb-4">{pkg.tierTag}</p>

                  <div className="space-y-2 text-xs border-t border-brand-navy/10 pt-4 mb-4">
                    <p><span className="font-bold">Makkah:</span> {pkg.hotelMakkah}</p>
                    <p><span className="font-bold">Madinah:</span> {pkg.hotelMadinah}</p>
                  </div>

                  <ul className="space-y-2 text-xs text-brand-navy/85">
                    {pkg.features.map((f, i) => (
                      <li key={i} className="flex items-center gap-2">
                        <span className="text-brand-gold font-bold">✓</span> {f}
                      </li>
                    ))}
                  </ul>
                </div>

                <button
                  onClick={() => {
                    setSelectedPackage(pkg.title);
                    document.getElementById('booking-section')?.scrollIntoView({ behavior: 'smooth' });
                  }}
                  className="mt-6 w-full min-h-11 cursor-pointer rounded-full bg-brand-navy py-3 text-xs font-extrabold uppercase tracking-wider text-white hover:bg-brand-gold hover:text-brand-navy transition-all shadow-md tactile-btn sm:min-h-0"
                >
                  Select This Tier →
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 14-DAY SPIRITUAL ITINERARY */}
      <section className="mx-auto max-w-5xl px-5 sm:px-6 py-20">
        <div className="mb-12 text-center space-y-3">
          <h2 className="font-display fluid-h2 font-bold text-brand-navy">
            14-Day Spiritual Itinerary
          </h2>
          <p className="text-sm text-brand-textLight">A structured, deeply reverent pilgrimage experience.</p>
        </div>

        <div className="space-y-4">
          {ITINERARY_DAYS.map((it) => (
            <div key={it.day} className="clay-card p-6 flex flex-col sm:flex-row items-start gap-4">
              <span className="rounded-xl bg-brand-gold/15 text-brand-navy px-3 py-1 font-mono text-xs font-bold shrink-0">
                {it.day}
              </span>
              <div>
                <h3 className="font-display text-base font-bold text-brand-navy">{it.title}</h3>
                <p className="text-xs sm:text-sm text-brand-textLight leading-relaxed mt-1">{it.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* BOOKING / INQUIRY SECTION (Connected to /api/public/leads) */}
      <section id="booking-section" className="bg-white py-20 border-t border-brand-navy/10">
        <div className="mx-auto max-w-3xl px-5 sm:px-6">
          <div className="glass-light p-8 sm:p-10 rounded-3xl shadow-2xl border border-brand-navy/10">
            <div className="text-center mb-8">
              <span className="gold-dot mb-2" />
              <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-brand-navy">
                Reserve Umrah Departure or Request Custom Quote
              </h2>
              <p className="text-xs sm:text-sm text-brand-textLight mt-1">
                Selected Tier: <span className="font-bold text-brand-gold">{selectedPackage}</span>
              </p>
            </div>

            <form onSubmit={handleSubmitBooking} className="space-y-4 lead-form-wrap">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[13px] font-bold uppercase tracking-wider text-brand-textLight mb-1">Lead Pilgrim Name</label>
                  <input required placeholder="As shown on Passport" value={pilgrimName} onChange={(e) => setPilgrimName(e.target.value)} />
                </div>
                <div>
                  <label className="block text-[13px] font-bold uppercase tracking-wider text-brand-textLight mb-1">WhatsApp Phone Number</label>
                  <input required type="tel" placeholder="+91 98765 00001" value={pilgrimPhone} onChange={(e) => setPilgrimPhone(e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[13px] font-bold uppercase tracking-wider text-brand-textLight mb-1">Email Address</label>
                  <input required type="email" placeholder="you@example.com" value={pilgrimEmail} onChange={(e) => setPilgrimEmail(e.target.value)} />
                </div>
                <div>
                  <label className="block text-[13px] font-bold uppercase tracking-wider text-brand-textLight mb-1">Number of Pilgrims</label>
                  <input type="number" min={1} max={30} value={travelersCount} onChange={(e) => setTravelersCount(parseInt(e.target.value) || 1)} />
                </div>
                <div>
                  <label className="block text-[13px] font-bold uppercase tracking-wider text-brand-textLight mb-1">Room Occupancy</label>
                  <select value={roomType} onChange={(e) => setRoomType(e.target.value)}>
                    <option value="double">Double Sharing (2 Beds)</option>
                    <option value="triple">Triple Sharing (3 Beds)</option>
                    <option value="quad">Quad Sharing (4 Beds)</option>
                    <option value="private">Private Family Suite</option>
                  </select>
                </div>
              </div>

              <div className="pt-2">
                <label className="flex items-start gap-3 text-sm leading-relaxed text-brand-textLight cursor-pointer">
                  <input
                    type="checkbox"
                    checked={consent}
                    onChange={(e) => setConsent(e.target.checked)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-brand-gold"
                  />
                  <span>
                    I consent to Opus Overseas coordinating Umrah visa approvals, hotel bookings, and airline reservations under official guidelines.
                  </span>
                </label>
              </div>

              <TurnstileWidget onToken={setTurnstileToken} onExpire={() => setTurnstileToken(null)} />

              {formFeedback && (
                <p className="rounded-xl bg-rose-50 border border-rose-200 p-3 text-xs font-semibold text-rose-700 text-center">
                  {formFeedback}
                </p>
              )}

              <button
                type="submit"
                disabled={submitting}
                className="w-full cursor-pointer rounded-full bg-brand-gold py-4 text-xs font-extrabold uppercase tracking-wider text-brand-navy shadow-lg hover:bg-brand-gold-hover hover:text-white transition-all disabled:opacity-50 tactile-btn"
              >
                {submitting ? 'Confirming Pilgrim Registration…' : 'Submit & Lock Seat Inquiries →'}
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* GEO & AEO KNOWLEDGE HUB + FAQS */}
      <GeoFaqSection
        badge="Pilgrimage & Sacred Travel Insights"
        title="Umrah Travel Frequently Asked Questions"
        subtitle="Transparent answers regarding Umrah group departures from Hyderabad, visa requirements, Haram proximity hotels, and Ziyarat."
        summaryTitle="Umrah Pilgrimage Services by Opus Overseas"
        summaryText="Opus Overseas organizes scheduled and customized Umrah tour packages from Hyderabad to Makkah and Madinah with pre-vetted Haram proximity 3-Star to 5-Star accommodations, direct Saudi e-visas with medical coverage, air-conditioned coach transfers, and scholar-led religious rituals."
        faqs={UMRAH_FAQS}
      />

      <InteractiveFunnelModal
        isOpen={funnelOpen}
        onClose={() => setFunnelOpen(false)}
        initialDivision="umrah"
      />
      <Footer />
    </div>
  );
}
