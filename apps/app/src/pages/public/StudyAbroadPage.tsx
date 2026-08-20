import { useState, useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Nav from '../../components/Nav';
import Footer from '../../components/Footer';
import StickyCallBar from '../../components/StickyCallBar';
import ChatWidget from '../../components/ChatWidget';
import GeoFaqSection from '../../components/public/GeoFaqSection';
import SEOHead from '../../components/SEOHead';
import { BASE_ORGANIZATION_SCHEMA, getBreadcrumbSchema, getFAQSchema, getServiceSchema } from '../../lib/schemas';
import { useVisibilityTracking } from '../../lib/visibilityTracking';
import { track, EVENTS } from '../../lib/umami';
import { CAL_BOOKING_URL, leadFormHref } from '../../config/booking';
import BookingModal from '../../components/BookingModal';
import DomainBackdrop from '../../components/DomainBackdrop';
import DomainDarkGraphics from '../../components/DomainDarkGraphics';

gsap.registerPlugin(ScrollTrigger);

const STUDY_ABROAD_FAQS = [
  {
    question: 'Which country offers the best post-study work visa (PSWV) for Indian students?',
    answer: 'The United States offers up to 3 years of STEM OPT. The United Kingdom provides a 2-year Graduate Route. Canada offers up to 3-year PGWP with direct PR pathways, Australia offers 2 to 4 years post-study rights, and Germany offers 18 months job seeker visas with tuition-free public universities.',
  },
  {
    question: 'Can I apply for foreign universities without taking IELTS or TOEFL?',
    answer: 'Yes. Many top universities in the UK, Germany, and Europe accept Medium of Instruction (MOI) certificates from accredited English-medium Indian universities, or alternative tests like Duolingo English Test (DET) and PTE Academic.',
  },
  {
    question: 'What is the average cost to study abroad in 2026?',
    answer: 'Tuition structures vary across destinations. Public universities in Germany offer low to no tuition models, while the UK, US, Canada, and Australia offer diverse university tiers and extensive merit scholarship grants. Sign in to your student workspace to evaluate customized institution fee ledgers.',
  },
  {
    question: 'How do scholarship grants and application fee waivers work at Opus Overseas?',
    answer: 'Our admissions desk maintains direct institutional relationships with over 200+ universities worldwide. We evaluate your academic GPA, test scores, and profile to apply for automatic merit scholarships, departmental grants, and application fee waiver codes.',
  },
  {
    question: 'When is the ideal time to start applying for Fall and Spring intakes?',
    answer: 'For Fall (August/September intake), begin profiling 8 to 12 months in advance (October–February). For Spring (January/February intake), begin profiling by June–August to secure CAS/I-20 issuance and biometric visa slots.',
  },
];

interface UniversityMatch {
  id: string;
  name: string;
  country: string;
  intake: string;
  matchPct: number;
}

const TOP_DESTINATIONS = [
  {
    country: 'United States',
    flag: '🇺🇸',
    avgCost: '$25,000 - $48,000 / yr',
    pswp: '3 Years (STEM OPT)',
    intakes: 'Fall (Aug) & Spring (Jan)',
    topUnis: ['MIT', 'Stanford', 'UT Arlington', 'NYU', 'UC Berkeley'],
    highlight: 'World-leading research labs & highest starting salaries',
  },
  {
    country: 'United Kingdom',
    flag: '🇬🇧',
    avgCost: '£14,000 - £28,000 / yr',
    pswp: '2 Years Graduate Route',
    intakes: 'September & January',
    topUnis: ['Oxford', 'Imperial', 'Coventry', 'Manchester', 'UCL'],
    highlight: '1-Year accelerated Master\'s programs save tuition & living costs',
  },
  {
    country: 'Canada',
    flag: '🇨🇦',
    avgCost: 'CAD 18,000 - 35,000 / yr',
    pswp: 'Up to 3 Years PGWP',
    intakes: 'Fall, Winter & Spring',
    topUnis: ['Toronto', 'UBC', 'Windsor', 'McGill', 'Waterloo'],
    highlight: 'Direct PR pathway opportunities for skilled graduates',
  },
  {
    country: 'Germany',
    flag: '🇩🇪',
    avgCost: '€0 - €3,000 / yr (Public)',
    pswp: '18 Months Job Seeking Visa',
    intakes: 'Winter (Oct) & Summer (Apr)',
    topUnis: ['TUM', 'LMU Munich', 'RWTH Aachen', 'Heidelberg', 'TU Berlin'],
    highlight: 'Tuition-free public universities for engineering & technology',
  },
  {
    country: 'Australia',
    flag: '🇦🇺',
    avgCost: 'AUD 24,000 - 45,000 / yr',
    pswp: '2 to 4 Years Post-Study',
    intakes: 'February & July',
    topUnis: ['Melbourne', 'UNSW', 'Sydney', 'Monash', 'UQ'],
    highlight: 'High minimum wage and generous regional post-study extensions',
  },
  {
    country: 'Ireland',
    flag: '🇮🇪',
    avgCost: '€12,000 - €22,000 / yr',
    pswp: '2 Years Stay Back Option',
    intakes: 'Autumn (Sep) & Spring (Jan)',
    topUnis: ['Trinity College Dublin', 'UCD', 'Galway', 'UCC', 'DCU'],
    highlight: 'European tech HQ hub (Google, Apple, Meta European HQs)',
  },
];

export default function StudyAbroadPage() {
  useVisibilityTracking('/study-abroad');
  const heroRef = useRef<HTMLElement>(null);

  // Matcher State
  const [gpa, setGpa] = useState(7.5);
    const [bookingOpen, setBookingOpen] = useState(false);
  const [ielts, setIelts] = useState(6.5);
  const [budget, setBudget] = useState(18);
  const [selectedCountry, setSelectedCountry] = useState('United States');
  const [matchResult, setMatchResult] = useState<UniversityMatch[]>([]);
  const [matching, setMatching] = useState(false);
  // Run initial match calculation
  const handleCalculateMatch = async () => {
    setMatching(true);
    try {
      track(EVENTS.eligibility, { country: selectedCountry });
      const res = await fetch('/api/public/match/eligibility', { credentials: 'include', 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          gpa,
          ielts,
          budget,
          country: selectedCountry.toLowerCase(),
        }),
      });
      const data = await res.json();
      if (Array.isArray(data)) setMatchResult(data);
      else if (data.matches) setMatchResult(data.matches);
    } catch {
      // Fallback preview
      setMatchResult([
        { id: 'u1', name: `${selectedCountry} State University`, country: selectedCountry, intake: 'Fall 2027', matchPct: 92 },
        { id: 'u2', name: `${selectedCountry} Institute of Technology`, country: selectedCountry, intake: 'Fall 2027', matchPct: 87 },
      ]);
    } finally {
      setMatching(false);
    }
  };

  useEffect(() => {
    handleCalculateMatch();
  }, [selectedCountry]);

  return (
    <div className="min-h-screen bg-brand-cream font-sans text-brand-navy selection:bg-brand-gold selection:text-brand-navy">
      <SEOHead
        title="Study Abroad Consultants | USA, UK, Canada, Germany & Australia | Opus Overseas"
        description="Top overseas education consultancy for university shortlisting, Ivy League admissions, I-20/CAS processing, scholarship grants, and 1-on-1 student visa mock interviews."
        canonicalPath="/study-abroad"
        schemas={[
          BASE_ORGANIZATION_SCHEMA,
          getServiceSchema({
            name: 'Study Abroad University Admissions & Counseling',
            description: 'Comprehensive overseas education advisory including university shortlisting, SOP mentoring, institutional fee waivers, and student visa interview drills.',
            serviceType: 'Educational Consultancy',
            path: '/study-abroad',
          }),
          getBreadcrumbSchema([
            { name: 'Home', path: '/' },
            { name: 'Study Abroad', path: '/study-abroad' },
          ]),
          getFAQSchema(STUDY_ABROAD_FAQS),
        ]}
      />
      <div className="film-grain" aria-hidden="true" />
      <Nav />
      <ChatWidget />
      <StickyCallBar />

      {/* HERO SECTION — Ivy League Academic Excellence */}
      <section ref={heroRef} className="relative overflow-hidden bg-gradient-to-b from-[#061e38] via-[#0a2d50] to-[#0c345c] pb-24 pt-36 sm:pt-40 text-white border-b border-brand-gold/20">
        <DomainBackdrop theme="study" />
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="hero-orb -right-16 -top-20 h-96 w-96 rounded-full bg-brand-gold/20 blur-3xl" />
          <div className="hero-orb -left-24 bottom-0 h-96 w-96 rounded-full bg-brand-blue/30 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-7xl px-5 sm:px-6 md:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            <div className="lg:col-span-7">
              <span className="inline-flex items-center gap-2 rounded-full border border-brand-gold/40 bg-brand-gold/10 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.2em] text-brand-gold shimmer-badge">
                🇬🇧 British Council Certified (ID #115050) · 100% Free Counselling
              </span>
              <h1 className="mt-5 font-display fluid-h1 font-black leading-tight tracking-tight text-white">
                Get Admitted to Top Global Campuses with <span className="text-brand-gold">Full Scholarship Support</span>
              </h1>
              <p className="mt-5 text-base sm:text-lg leading-relaxed text-white/75 max-w-2xl">
                From profile evaluation and university shortlisting across 1,500+ global institutions to bespoke SOP mentoring and 1-on-1 visa mock drills. 100% free career counselling and application guidance for students.
              </p>

              <div className="mt-8 flex flex-wrap items-center gap-3">
                <a
                  href="#match-calculator"
                  className="rounded-full bg-brand-gold px-8 py-3.5 text-xs font-extrabold uppercase tracking-wider text-brand-navy shadow-[0_10px_30px_rgba(215,160,25,0.4)] transition-all hover:bg-brand-gold-hover hover:text-white cursor-pointer tactile-btn"
                >
                  Calculate Admission Probability ↓
                </a>
                <button
              type="button"
              onClick={() => setBookingOpen(true)}
              className="rounded-full border border-white/25 bg-white/5 hover:bg-white/10 px-7 py-3.5 text-xs font-semibold text-white transition-all hover:border-brand-gold hover:text-brand-gold tactile-btn"
            >
📅 Book Free 1-on-1 Profile Assessment
            </button>
              </div>
            </div>

            <div className="lg:col-span-5 relative">
              <div className="relative rounded-3xl overflow-hidden border border-white/20 shadow-2xl group">
                <img
                  src="/img/hero-study-abroad.jpg"
                  alt="Study Abroad Campus and Students"
                  className="w-full h-80 sm:h-96 object-cover transform transition-transform duration-700 group-hover:scale-105"
                  onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#061e38] via-transparent to-transparent opacity-80" />
                <div className="absolute bottom-4 left-4 right-4 glass-light p-4 rounded-2xl text-brand-navy">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-display text-xs font-bold uppercase tracking-wider text-brand-gold">Global Institutional Access</p>
                      <p className="font-display text-sm font-extrabold text-brand-navy">1,500+ Top University Portals</p>
                    </div>
                    <span className="rounded-full bg-emerald-500/20 text-emerald-800 px-2.5 py-1 text-[10px] font-bold font-mono">
                      ● Fall '26 & '27
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* INSTITUTIONAL ADMISSIONS COVENANTS */}
      <section className="bg-white border-b border-brand-navy/5 py-10">
        <div className="mx-auto max-w-7xl px-5 sm:px-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6">
          <div className="text-center">
            <p className="font-display text-2xl sm:text-3xl font-extrabold text-brand-navy">1,500+</p>
            <p className="text-[11px] font-bold uppercase tracking-wider text-brand-textLight mt-1">Global University Portals</p>
          </div>
          <div className="text-center">
            <p className="font-display text-2xl sm:text-3xl font-extrabold text-brand-gold">100% Free</p>
            <p className="text-[11px] font-bold uppercase tracking-wider text-brand-textLight mt-1">Student Counselling & Shortlisting</p>
          </div>
          <div className="text-center">
            <p className="font-display text-2xl sm:text-3xl font-extrabold text-brand-navy">🇬🇧 British Council</p>
            <p className="text-[11px] font-bold uppercase tracking-wider text-brand-textLight mt-1">Certified UK Counsellor #115050</p>
          </div>
          <div className="text-center">
            <p className="font-display text-2xl sm:text-3xl font-extrabold text-brand-gold">96.8%</p>
            <p className="text-[11px] font-bold uppercase tracking-wider text-brand-textLight mt-1">Consular Visa Presentation Success</p>
          </div>
        </div>
      </section>

      {/* COUNTRY DESTINATION TILES */}
      <section className="mx-auto max-w-7xl px-5 sm:px-6 py-20 sm:py-24">
        <div className="mb-14 text-center space-y-3">
          <h2 className="font-display fluid-h2 font-bold text-brand-navy">
            Explore Study Destinations
          </h2>
          <p className="text-sm sm:text-base text-brand-textLight max-w-xl mx-auto">
            Compare post-study work rights, living budgets, and academic intakes across tier-one education destinations.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {TOP_DESTINATIONS.map((d) => (
            <div 
              key={d.country} 
              className="clay-card p-6 flex flex-col justify-between hover:border-brand-gold/40 transition-all group"
            >
              <div>
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <span className="text-3xl">{d.flag}</span>
                    <h3 className="font-display text-lg font-bold text-brand-navy group-hover:text-brand-gold-hover transition-colors">
                      {d.country}
                    </h3>
                  </div>
                  <span className="rounded-full bg-brand-gold/10 border border-brand-gold/30 px-2.5 py-0.5 text-[10px] font-bold text-brand-navy font-mono">
                    Tier-1 Hub
                  </span>
                </div>

                <p className="text-xs text-brand-textLight leading-relaxed mb-4">
                  {d.highlight}
                </p>

                <div className="space-y-2 border-t border-brand-navy/5 pt-3.5 text-xs">
                  <div className="flex justify-between items-center">
                    <span className="text-brand-textLight">Tuition Bracket:</span>
                    <span className="inline-flex items-center gap-1 rounded bg-brand-navy/5 border border-brand-navy/10 px-2 py-0.5 text-[10px] font-bold text-brand-navy">
                      <span>🔒</span>
                      <span>Sign In to Unlock</span>
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-brand-textLight">Work Permit (PSWP):</span>
                    <span className="font-semibold text-emerald-700">{d.pswp}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-brand-textLight">Upcoming Intakes:</span>
                    <span className="font-medium text-brand-navy">{d.intakes}</span>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-brand-navy/5">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-brand-textLight mb-1.5">Top Campuses:</p>
                  <div className="flex flex-wrap gap-1.5">
                    {d.topUnis.map((u) => (
                      <span key={u} className="rounded-md bg-white border border-brand-navy/10 px-2 py-0.5 text-[10px] font-medium text-brand-navy">
                        {u}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              <button
                onClick={() => {
                  setSelectedCountry(d.country);
                  document.getElementById('match-calculator')?.scrollIntoView({ behavior: 'smooth' });
                }}
                className="mt-6 w-full min-h-11 cursor-pointer rounded-xl border border-brand-navy/15 bg-white/80 py-2.5 text-xs font-bold text-brand-navy hover:bg-brand-gold hover:text-white hover:border-brand-gold transition-all sm:min-h-0"
              >
                Match for {d.country} →
              </button>
            </div>
          ))}
        </div>
      </section>

      {/* EDITORIAL TRUST STORY & INSTITUTIONAL COVENANTS */}
      <section className="mx-auto max-w-7xl px-5 sm:px-6 py-16 sm:py-20 border-b border-brand-navy/5">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center">
          <div className="lg:col-span-6">
            <div className="relative rounded-3xl overflow-hidden shadow-2xl border border-brand-navy/10 group">
              <img
                src="/img/editorial-study-abroad.jpg"
                alt="Opus Overseas academic mentoring on campus"
                className="w-full h-[360px] sm:h-[420px] object-cover transition-transform duration-700 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#061e38]/80 via-transparent to-transparent" />
              <div className="absolute bottom-4 left-4 right-4 bg-white/90 backdrop-blur-md p-4 rounded-2xl border border-white/40">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-[11px] font-bold uppercase tracking-wider text-brand-gold">British Council Certified Partner</p>
                    <p className="text-xs sm:text-sm font-extrabold text-brand-navy">ID #115050 · Official Advisory</p>
                  </div>
                  <span className="rounded-full bg-emerald-500/15 text-emerald-800 px-2.5 py-1 text-[10px] font-bold font-mono">
                    ● 100% Free Guidance
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-6 space-y-6">
            <div>
              <span className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-brand-gold">
                Ethical Admissions
              </span>
              <h2 className="font-display fluid-h2 font-extrabold text-brand-navy mt-1">
                Direct University Admissions & Scholarship Advocacy
              </h2>
              <p className="text-xs sm:text-sm text-brand-textLight leading-relaxed mt-2.5">
                We cut through the noise of commission-driven agencies. Opus Overseas provides direct institutional access, personalized SOP polishing, and merit scholarship appeals for students across India.
              </p>
            </div>

            <div className="space-y-3.5">
              <div className="clay-card p-4 flex items-start gap-3.5 border-l-4 border-l-brand-gold">
                <span className="text-xl">🎓</span>
                <div>
                  <h3 className="font-display text-sm font-bold text-brand-navy">Fast-Track Application Portal Access</h3>
                  <p className="text-xs text-brand-textLight leading-relaxed mt-0.5">Apply directly through verified institutional channels with official application fee waivers and institutional grants.</p>
                </div>
              </div>

              <div className="clay-card p-4 flex items-start gap-3.5 border-l-4 border-l-brand-navy">
                <span className="text-xl">📝</span>
                <div>
                  <h3 className="font-display text-sm font-bold text-brand-navy">Academic SOP & LOR Mentoring</h3>
                  <p className="text-xs text-brand-textLight leading-relaxed mt-0.5">Narrative architecture and personalized statements of purpose tailored specifically to faculty admissions committees.</p>
                </div>
              </div>

              <div className="clay-card p-4 flex items-start gap-3.5 border-l-4 border-l-emerald-600">
                <span className="text-xl">🏛️</span>
                <div>
                  <h3 className="font-display text-sm font-bold text-brand-navy">Consular Mock Drills & Financial Vetting</h3>
                  <p className="text-xs text-brand-textLight leading-relaxed mt-0.5">1-on-1 consular visa mock interviews, CA net-worth affidavit structuring, and I-20/CAS biometric verification.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* LIVE ADMISSIONS MATCHER ENGINE (Interactive Tool connected to /api/public/match/eligibility) */}
      <section id="match-calculator" className="bg-[#061e38] text-white py-20 sm:py-24 border-y border-brand-gold/15 relative overflow-hidden">
        <DomainDarkGraphics variant="study" />
        <div className="relative mx-auto max-w-7xl px-5 sm:px-6">
          <div className="mb-12 text-center space-y-3">
            <span className="rounded-full bg-brand-gold/20 border border-brand-gold/40 px-3.5 py-1 text-[11px] font-bold uppercase tracking-wider text-brand-gold font-mono">
              Live Algorithm v2.4
            </span>
            <h2 className="font-display fluid-h2 font-extrabold text-white">
              Instant University Match Calculator
            </h2>
            <p className="text-sm text-white/70 max-w-md mx-auto">
              Simulate your acceptance chances and match with eligible institutions across our global partner catalog.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
            {/* Controls panel */}
            <div className="lg:col-span-5 glass-light p-6 sm:p-7 rounded-3xl text-brand-navy shadow-2xl space-y-5">
              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-brand-textLight mb-2">
                  Destination Country
                </label>
                <select
                  value={selectedCountry}
                  onChange={(e) => setSelectedCountry(e.target.value)}
                  className="w-full min-h-11 rounded-xl border border-brand-navy/15 bg-white px-3.5 py-2.5 text-sm font-bold text-brand-navy focus:border-brand-gold focus:outline-none sm:min-h-0"
                >
                  {TOP_DESTINATIONS.map((d) => (
                    <option key={d.country} value={d.country}>{d.flag} {d.country}</option>
                  ))}
                </select>
              </div>

              <div>
                <div className="flex justify-between text-xs font-bold mb-1">
                  <span className="text-brand-textLight uppercase tracking-wider text-[10px]">Academic GPA (Out of 10)</span>
                  <span className="text-brand-navy font-mono text-sm">{gpa.toFixed(1)} / 10.0</span>
                </div>
                <input
                  type="range"
                  min="4.0"
                  max="10.0"
                  step="0.1"
                  value={gpa}
                  onChange={(e) => setGpa(parseFloat(e.target.value))}
                  className="w-full accent-brand-gold cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs font-bold mb-1">
                  <span className="text-brand-textLight uppercase tracking-wider text-[10px]">English Score (IELTS / PTE Equiv.)</span>
                  <span className="text-brand-navy font-mono text-sm">{ielts.toFixed(1)}</span>
                </div>
                <input
                  type="range"
                  min="5.0"
                  max="9.0"
                  step="0.5"
                  value={ielts}
                  onChange={(e) => setIelts(parseFloat(e.target.value))}
                  className="w-full accent-brand-gold cursor-pointer"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs font-bold mb-1">
                  <span className="text-brand-textLight uppercase tracking-wider text-[10px]">Institutional Tier Target</span>
                  <span className="text-brand-gold-hover font-mono text-sm">
                    {budget <= 15 ? 'Value & Scholarship Tier' : budget <= 28 ? 'Standard Comprehensive Tier' : 'Global Ivy & Research Tier'}
                  </span>
                </div>
                <input
                  type="range"
                  min="6"
                  max="50"
                  step="1"
                  value={budget}
                  onChange={(e) => setBudget(parseInt(e.target.value))}
                  className="w-full accent-brand-gold cursor-pointer"
                />
              </div>

              <button
                onClick={handleCalculateMatch}
                disabled={matching}
                className="w-full min-h-12 cursor-pointer rounded-xl bg-brand-gold py-3 text-xs font-extrabold uppercase tracking-wider text-brand-navy hover:bg-brand-gold-hover hover:text-white transition-all shadow-md tactile-btn sm:min-h-0"
              >
                {matching ? 'Calculating Live Fit…' : 'Recalculate Matches →'}
              </button>
            </div>

            {/* Results display */}
            <div className="lg:col-span-7 space-y-3.5">
              <div className="flex items-center justify-between pb-2 border-b border-white/10">
                <h3 className="font-display text-base font-bold text-white">
                  Eligible University Fits in {selectedCountry}
                </h3>
                <span className="text-xs text-brand-gold font-mono">{matchResult.length} Top Matches</span>
              </div>

              {matchResult.length === 0 ? (
                <div className="rounded-2xl border border-white/15 bg-white/10 p-8 text-center text-white/80 text-sm space-y-2">
                  <p className="font-bold text-brand-gold">Custom Academic Roster Compiling</p>
                  <p className="text-xs text-white/70">Our admissions officers evaluate prerequisite waivers and institutional scholarship grants directly. Submit your profile below for custom shortlisting.</p>
                </div>
              ) : (
                <>
                  {matchResult.map((u, idx) => (
                    <div
                      key={u.id || idx}
                      className="flex items-center justify-between rounded-2xl border border-white/15 bg-white/10 p-4 sm:p-5 backdrop-blur-md hover:border-brand-gold/50 transition-all"
                    >
                      <div className="min-w-0 pr-4">
                        <div className="flex items-center gap-2">
                          <p className="truncate font-display text-base font-bold text-white">{u.name}</p>
                          <span className="rounded bg-brand-gold/20 text-brand-gold px-2 py-0.5 text-[10px] font-bold font-mono">
                            {u.intake}
                          </span>
                        </div>
                        <p className="text-xs text-white/70 mt-1">
                          Direct counselor fast-track · Application fee waiver eligible
                        </p>
                      </div>

                      <div className="shrink-0 text-right">
                        <div className="rounded-full bg-emerald-500/20 border border-emerald-400/40 px-3 py-1 text-emerald-300 font-mono text-sm font-extrabold">
                          {u.matchPct}% Match
                        </div>
                      </div>
                    </div>
                  ))}

                  {/* PROGRESSIVE DISCLOSURE: PSWP & 5-Year Career Net ROI Projections */}
                  <div className="rounded-2xl border border-emerald-400/30 bg-emerald-950/40 p-5 backdrop-blur-md space-y-3 mt-4 animate-[fadeIn_0.3s_ease-out]">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">💼</span>
                        <h4 className="font-display text-sm font-bold text-emerald-300">
                          Post-Study Work Permit & 5-Year ROI Projection ({selectedCountry})
                        </h4>
                      </div>
                      <span className="rounded-full bg-emerald-400/20 text-emerald-200 px-2.5 py-0.5 text-[10px] font-mono font-bold">
                        Calculated
                      </span>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                        <p className="text-[10px] uppercase tracking-wider text-white/60">Work Rights</p>
                        <p className="font-extrabold text-white mt-1">
                          {selectedCountry === 'United States' ? '3 Years STEM OPT' : selectedCountry === 'United Kingdom' ? '2 Years Graduate Route' : selectedCountry === 'Germany' ? '18 Mo. Job Seeking' : '2 to 4 Years PSWP'}
                        </p>
                      </div>
                      <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                        <p className="text-[10px] uppercase tracking-wider text-white/60">Key Growth Sectors</p>
                        <p className="font-extrabold text-emerald-400 mt-1">
                          {selectedCountry === 'United States' ? 'Tech, AI & High-Tech STEM' : selectedCountry === 'United Kingdom' ? 'Financial & Core Engineering' : selectedCountry === 'Germany' ? 'Automotive & Clean Tech' : 'Software & Biotechnology'}
                        </p>
                      </div>
                      <div className="rounded-xl bg-white/5 border border-white/10 p-3">
                        <p className="text-[10px] uppercase tracking-wider text-white/60">Career Trajectory</p>
                        <p className="font-extrabold text-brand-gold mt-1">Accelerated Global Mobility</p>
                      </div>
                    </div>
                  </div>
                </>
              )}

              <div className="rounded-2xl border border-brand-gold/40 bg-brand-gold/10 p-5 text-xs text-white/90 flex flex-wrap items-center justify-between gap-3 shadow-md">
                <div>
                  <p className="font-display font-bold text-white text-sm">Ready to lock your admission & scholarship grants?</p>
                  <p className="text-white/70 text-xs mt-0.5">Get your academic transcript and SOP pre-evaluated by our senior desk.</p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setBookingOpen(true)}
                    className="tactile-btn inline-flex items-center gap-1.5 rounded-full bg-brand-gold px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-brand-navy hover:bg-brand-gold-hover hover:text-white transition shadow-sm cursor-pointer"
                  >
                    <span>📅 Book 1-on-1 Session</span>
                  </button>
                  <a
                    href={leadFormHref()}
                    className="tactile-btn inline-flex items-center gap-1 rounded-full border border-white/30 bg-white/10 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white hover:bg-white/20 transition"
                  >
                    Submit Profile →
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ADMISSION ROADMAP */}
      <section className="mx-auto max-w-7xl px-5 sm:px-6 py-20 sm:py-24">
        <div className="mb-16 text-center space-y-3">
          <h2 className="font-display fluid-h2 font-bold text-brand-navy">
            Our 5-Stage Admissions Framework
          </h2>
          <p className="text-sm text-brand-textLight">Standardized precision and ethical guidance at every checkpoint.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {[
            { step: '01', title: 'Profile Audit', desc: 'GPA conversion, transcript audit, and target country selection.' },
            { step: '02', title: 'Shortlisting', desc: 'Strategic categorization into Dream, Reach, and Safe university buckets.' },
            { step: '03', title: 'SOP Mentoring', desc: 'Narrative crafting, personal statement polishing, and LOR structuring.' },
            { step: '04', title: 'Offer & I-20 / CAS', desc: 'Admissions follow-up, scholarship appeals, and formal seat acceptance.' },
            { step: '05', title: 'Visa Mock Drills', desc: 'Consulate mock interviews, financial affidavit vetting, and biometrics.' },
          ].map((s) => (
            <div key={s.step} className="clay-card p-5 relative">
              <span className="font-mono text-2xl font-black text-brand-gold block mb-2">{s.step}</span>
              <h3 className="font-display text-sm font-bold text-brand-navy">{s.title}</h3>
              <p className="text-xs text-brand-textLight leading-relaxed mt-1.5">{s.desc}</p>
            </div>
          ))}
        </div>
      </section>

      {/* GEO & AEO KNOWLEDGE HUB + FAQS */}
      <GeoFaqSection
        badge="Admissions & Visa Intelligence"
        title="Study Abroad Frequently Asked Questions"
        subtitle="Authoritative guidance on foreign university admissions, IELTS waivers, tuition budgets, and student visa approvals."
        summaryTitle="Study Abroad Admissions at Opus Overseas"
        summaryText="Opus Overseas assists students across India in securing verified admissions, institutional scholarships, and student visas to over 200+ partner universities in the USA, UK, Canada, Germany, Australia, and Ireland with structured SOP mentoring and biometric mock drills."
        faqs={STUDY_ABROAD_FAQS}
      />

      <BookingModal
        open={bookingOpen}
        onClose={() => setBookingOpen(false)}
        division={'study-abroad'}
        fallbackUrl={CAL_BOOKING_URL}
      />
      <Footer />
    </div>
  );
}
