import { useState } from 'react';
import { useLocation } from 'wouter';
import Nav from '../../components/Nav';
import Footer from '../../components/Footer';
import StickyCallBar from '../../components/StickyCallBar';
import ChatWidget from '../../components/ChatWidget';
import BookingModal from '../../components/BookingModal';
import GeoFaqSection from '../../components/public/GeoFaqSection';
import SEOHead from '../../components/SEOHead';
import DomainDarkGraphics from '../../components/DomainDarkGraphics';
import { BASE_ORGANIZATION_SCHEMA, getBreadcrumbSchema, getFAQSchema } from '../../lib/schemas';
import { useVisibilityTracking } from '../../lib/visibilityTracking';
import { CAL_BOOKING_URL } from '../../config/booking';

const ABOUT_FAQS = [
  {
    question: 'Who founded Opus Overseas and what is the institutional mission?',
    answer: 'Opus Overseas was founded in Telangana with a mission to bring complete transparency, compliance, and zero predatory markups to international education, global visa facilitation, MEA certificate attestation, and overseas workforce mobility.',
  },
  {
    question: 'What professional certifications and partnerships does Opus Overseas hold?',
    answer: 'Our counseling leadership holds British Council Certified Counselor accreditation (#115050), direct institutional alliances with 200+ global universities, MEA-aligned attestation channels, and licensed international recruitment partnerships across the GCC and Europe.',
  },
  {
    question: 'Where is Opus Overseas located and can clients visit for walk-in advisory?',
    answer: 'Our headquarters is located at 1-1-382, Rakasipet, Bodhan, Telangana 503185, India. We welcome walk-in consultations Monday through Saturday from 9:30 AM to 6:30 PM, as well as worldwide virtual video sessions.',
  },
  {
    question: 'What is the Opus Overseas Ethical Covenant?',
    answer: 'We enforce 100% free student counseling and university shortlisting, zero advance recruitment fees for overseas job applicants, timing-safe MEA document tracking, and secure DPDP-compliant client data management.',
  },
];

export default function AboutUsPage() {
  useVisibilityTracking('/about');
  const [bookingOpen, setBookingOpen] = useState(false);
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-brand-cream font-sans text-brand-navy selection:bg-brand-gold selection:text-brand-navy">
      <SEOHead
        title="About Opus Overseas | Leadership, Certifications & Institutional Mission"
        description="Learn about Opus Overseas — certified British Council counselors (#115050), ethical global education alliances, transparent visa advisory, and licensed manpower recruitment."
        canonicalPath="/about"
        schemas={[
          BASE_ORGANIZATION_SCHEMA,
          {
            '@type': 'AboutPage',
            '@id': 'https://opusoverseas.com/about#aboutpage',
            url: 'https://opusoverseas.com/about',
            name: 'About Opus Overseas Consultants',
            description: 'Institutional profile, mission, certifications, and operational reach of Opus Overseas global consultancy.',
            mainEntity: {
              '@id': 'https://opusoverseas.com/#organization',
            },
          },
          getBreadcrumbSchema([
            { name: 'Home', path: '/' },
            { name: 'About Us', path: '/about' },
          ]),
          getFAQSchema(ABOUT_FAQS),
        ]}
      />
      <div className="film-grain" aria-hidden="true" />
      <Nav />
      <ChatWidget />
      <StickyCallBar />

      {/* HERO SECTION */}
      <section className="relative overflow-hidden bg-gradient-to-b from-[#061e38] via-[#092b4c] to-[#0a2d50] pb-24 pt-36 sm:pt-40 text-white border-b border-brand-gold/20">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="hero-orb -right-20 -top-20 h-96 w-96 rounded-full bg-brand-gold/20 blur-3xl" />
          <div className="hero-orb -left-20 bottom-0 h-96 w-96 rounded-full bg-brand-blue/30 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-7xl px-5 sm:px-6 md:px-8 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-brand-gold/40 bg-brand-gold/10 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.2em] text-brand-gold shimmer-badge">
            🏛️ Institutional Profile & Legacy
          </span>
          <h1 className="mt-5 font-display fluid-h1 font-black leading-tight tracking-tight text-white max-w-4xl mx-auto">
            Architecting Seamless Global Mobility with <span className="text-brand-gold">Uncompromising Integrity</span>
          </h1>
          <p className="mt-5 text-base sm:text-lg leading-relaxed text-white/75 max-w-2xl mx-auto">
            Founded with a vision to eliminate predatory practices in overseas consulting, Opus Overseas operates across 5 key divisions with full statutory compliance, direct embassy partnerships, and verified university alliances.
          </p>
        </div>
      </section>

      {/* INSTITUTIONAL COVENANTS & CAPABILITIES */}
      <section className="bg-white py-12 border-b border-brand-navy/5">
        <div className="mx-auto max-w-7xl px-5 sm:px-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 text-center">
          <div>
            <p className="font-display text-2xl sm:text-3xl font-extrabold text-brand-navy">1,500+</p>
            <p className="text-[11px] font-bold uppercase tracking-wider text-brand-textLight mt-1">Global University Portals</p>
          </div>
          <div>
            <p className="font-display text-2xl sm:text-3xl font-extrabold text-brand-gold">100% Free</p>
            <p className="text-[11px] font-bold uppercase tracking-wider text-brand-textLight mt-1">Student Counselling & SOP Guidance</p>
          </div>
          <div>
            <p className="font-display text-2xl sm:text-3xl font-extrabold text-brand-navy">🇬🇧 British Council</p>
            <p className="text-[11px] font-bold uppercase tracking-wider text-brand-textLight mt-1">Certified UK Counsellor #115050</p>
          </div>
          <div>
            <p className="font-display text-2xl sm:text-3xl font-extrabold text-brand-gold">100% Insured</p>
            <p className="text-[11px] font-bold uppercase tracking-wider text-brand-textLight mt-1">Pan-India Insured Chain Custody</p>
          </div>
        </div>
      </section>

      {/* ACCREDITATIONS & OPERATIONAL CAPABILITIES */}
      <section className="mx-auto max-w-7xl px-5 sm:px-6 py-20">
        <div className="mb-14 text-center space-y-3">
          <h2 className="font-display fluid-h2 font-bold text-brand-navy">
            Professional Accreditations & Operational Reach
          </h2>
          <p className="text-sm sm:text-base text-brand-textLight max-w-xl mx-auto">
            Our certified credentials ensure your academic admissions, visa applications, and original certificates are guided with complete ethical precision.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="clay-card p-6 space-y-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-sky-500/15 text-2xl">
              🎓
            </div>
            <h3 className="font-display text-base font-bold text-brand-navy">British Council Certified UK Agent</h3>
            <p className="text-xs text-brand-textLight leading-relaxed">
              Certified UK Knowledge Agent & Education Counsellor (Awarded to Ajmal Hussain, Certificate Code #115050, Valid through 2028). Adhering to the National Code of Ethical Practice for UK education.
            </p>
            <span className="inline-block font-mono text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
              ● Code: 115050 · Valid 2028
            </span>
          </div>

          <div className="clay-card p-6 space-y-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-brand-gold/15 text-2xl">
              🇮🇳
            </div>
            <h3 className="font-display text-base font-bold text-brand-navy">Govt. MEA Recruitment Network</h3>
            <p className="text-xs text-brand-textLight leading-relaxed">
              Authorized candidate sourcing and identification partner to Govt. Registered MEA-Licensed Overseas Recruitment Agencies with 100% verified employer demands.
            </p>
            <span className="inline-block font-mono text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
              ● Verified Sourcing Network
            </span>
          </div>

          <div className="clay-card p-6 space-y-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-500/15 text-2xl">
              🕋
            </div>
            <h3 className="font-display text-base font-bold text-brand-navy">End-to-End Sacred Logistics</h3>
            <p className="text-xs text-brand-textLight leading-relaxed">
              Wholesale flight booking allocations from Hyderabad, pre-vetted Haram proximity hotel tie-ups in Makkah & Madinah, and dedicated scholar-led spiritual guidance.
            </p>
            <span className="inline-block font-mono text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded">
              ● Full Logistic Support
            </span>
          </div>
        </div>
      </section>

      {/* CORE OPERATIONAL VALUES */}
      <section className="bg-[#061e38] text-white py-20 border-y border-brand-gold/15 relative overflow-hidden">
        <DomainDarkGraphics variant="about" />
        <div className="relative mx-auto max-w-7xl px-5 sm:px-6">
          <div className="mb-14 text-center space-y-3">
            <h2 className="font-display fluid-h2 font-extrabold text-white">
              The Four Pillars of Opus OS
            </h2>
            <p className="text-sm text-white/70 max-w-md mx-auto">
              How our proprietary operating system sets the gold standard for cross-border services.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {[
              { num: '01', title: 'Zero Sub-Agent Risks', desc: 'Every file is processed in-house by licensed case officers with direct embassy and university submissions.' },
              { num: '02', title: 'Financial Transparency', desc: 'Itemized government fee ledgers with zero hidden commissions or unverified charges.' },
              { num: '03', title: 'DPDP Cryptographic Custody', desc: 'Your original certificates and identity scans are safeguarded under strict cryptographic protocols.' },
              { num: '04', title: 'Real-Time Tracking Radar', desc: 'Every client receives an encrypted Journey Token for 24/7 visibility into consular processing queues.' },
            ].map((p) => (
              <div key={p.num} className="glass-light p-6 rounded-3xl text-brand-navy shadow-xl">
                <span className="font-mono text-2xl font-black text-brand-gold block mb-2">{p.num}</span>
                <h3 className="font-display text-base font-bold text-brand-navy mb-2">{p.title}</h3>
                <p className="text-xs text-brand-textLight leading-relaxed">{p.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* GEO & AEO KNOWLEDGE HUB + FAQS */}
      <GeoFaqSection
        badge="Institutional Credentials & Standards"
        title="About Opus Overseas — FAQs"
        subtitle="Key information regarding our leadership, official accreditations, physical presence, and client covenants."
        summaryTitle="About Opus Overseas"
        summaryText="Opus Overseas is a premier, legally compliant global consultancy based in Bodhan, Telangana. We are certified by the British Council (#115050) and provide transparent university admissions, visa facilitation, MEA apostille attestation, Umrah tours, and international manpower recruitment."
        faqs={ABOUT_FAQS}
      />

      {/* CTA SECTION */}
      <section className="bg-white py-20 text-center">
        <div className="mx-auto max-w-3xl px-5 sm:px-6 space-y-6">
          <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-brand-navy">
            Ready to Begin Your Global Journey?
          </h2>
          <p className="text-xs sm:text-sm text-brand-textLight max-w-md mx-auto">
            Speak directly with our senior counseling team or visit our contact desk for immediate assistance.
          </p>
          <div className="flex flex-wrap justify-center gap-3">
            <button
              onClick={() => setLocation('/signup')}
              className="cursor-pointer rounded-full bg-brand-gold px-8 py-3.5 text-xs font-extrabold uppercase tracking-wider text-brand-navy hover:bg-brand-gold-hover hover:text-white transition-all shadow-md tactile-btn"
            >
              Sign Up on Opus OS →
            </button>
            <button
              type="button"
              onClick={() => setBookingOpen(true)}
              className="cursor-pointer rounded-full border border-brand-navy/20 bg-white px-7 py-3.5 text-xs font-bold text-brand-navy hover:bg-slate-100 transition-all inline-flex items-center gap-1.5"
            >
              <span>📅 Book 1-on-1 Session</span>
            </button>
          </div>
        </div>
      </section>

      <Footer />
      <BookingModal
        open={bookingOpen}
        onClose={() => setBookingOpen(false)}
        division="study-abroad"
        fallbackUrl={CAL_BOOKING_URL}
      />
    </div>
  );
}
