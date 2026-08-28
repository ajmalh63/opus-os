import InteractiveFunnelModal from '../../components/funnel/InteractiveFunnelModal';
import React, { useState, useMemo, useRef, useEffect } from 'react';
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
import { BASE_ORGANIZATION_SCHEMA, getBreadcrumbSchema, getFAQSchema, getServiceSchema } from '../../lib/schemas';
import { useVisibilityTracking } from '../../lib/visibilityTracking';
import { track, EVENTS } from '../../lib/umami';
import { getBookingUrlForDivision } from '../../config/booking';
import BookingModal from '../../components/BookingModal';
const API = (import.meta as any).env?.VITE_API_URL || 'https://opusos-api.ajmalsn63.workers.dev';

const RECRUITMENT_FAQS = [
  {
    question: 'What international job sectors does Opus Overseas recruit for?',
    answer: 'We recruit for Healthcare (Doctors, ICU Nurses, Allied Health), Engineering & Infrastructure, Oil & Gas / Energy, Heavy Manufacturing, Hospitality, IT & Tech, and Logistics across the GCC and Europe.',
  },
  {
    question: 'Does Opus Overseas charge candidates any advance registration or interview fees?',
    answer: 'No. We operate under strict ethical recruitment standards and zero-advance fee guarantees. Candidate shortlisting, technical trade tests, and direct employer interviews are arranged without unauthorized upfront charges.',
  },
  {
    question: 'Which countries have active employment demands for Indian candidates?',
    answer: 'Major hiring destinations include Saudi Arabia, United Arab Emirates (Dubai/Abu Dhabi), Qatar, Kuwait, Oman, Germany (EU Opportunity Card & skilled workers), and Poland.',
  },
  {
    question: 'What documents are required to apply for international job openings?',
    answer: 'Candidates need an updated resume/CV, copy of passport (valid for minimum 1 year), educational and trade certificates, verified experience letters, and relevant trade/medical license passes (such as Prometric, MOH, or DataFlow for healthcare).',
  },
  {
    question: 'How long does the employment visa and flight deployment process take?',
    answer: 'After clearing the employer client interview and receiving the official job offer, medical fitness (GAMCA/Wafid), embassy stamping, and flight deployment typically takes 30 to 45 business days.',
  },
];

interface Job {
  id: string;
  title: string;
  country: string;
  sector: string;
  salaryText?: string;
  requirements: string;
  perks?: string[];
}

const SECTORS = ['All Sectors', 'IT & Software', 'Healthcare', 'Engineering & Construction', 'Oil & Gas / Energy', 'Manufacturing & Tech', 'Finance & Business', 'Hospitality & Aviation'];

// White-collar majority first paint (gold standard: 60% white / 40% blue, online/LI sourced, brand-driven)
// 6 white (IT x2, Finance, Healthcare, Engineering) + 2 skilled-trade — IT & Finance grads self-select in <3s
const FALLBACK_JOBS: Job[] = [
  {
    id: 'j1',
    title: 'Full Stack Developer (React / Node.js)',
    country: 'United Arab Emirates',
    sector: 'IT & Software',
    salaryText: 'Available in Candidate Desk',
    requirements: 'B.Tech/BCA + 3+ years React, Node.js, REST APIs, Git — product teams',
    perks: ['Family Visa + Insurance', 'Remote Flexibility (Hybrid)', 'Career Growth + Certifications'],
  },
  {
    id: 'j2',
    title: 'Cloud DevOps Engineer (AWS)',
    country: 'Germany (EU FastTrack)',
    sector: 'IT & Software',
    salaryText: 'Available in Candidate Desk',
    requirements: 'B.Tech + AWS Certified + Docker/K8s, CI/CD — 3+ years infra',
    perks: ['Direct EU Blue Card', 'Social Security & Pension', 'Permanent Residency Path'],
  },
  {
    id: 'j3',
    title: 'Registered ICU / OT Staff Nurse',
    country: 'Kingdom of Saudi Arabia',
    sector: 'Healthcare',
    salaryText: 'Available in Candidate Desk',
    requirements: 'B.Sc Nursing + 2 years clinical + Prometric / MOH pass',
    perks: ['Free Furnished Housing', '45 Days Paid Leave', 'Overtime + Licensing Support'],
  },
  {
    id: 'j4',
    title: 'Senior Structural & Site Engineer',
    country: 'United Arab Emirates',
    sector: 'Engineering & Construction',
    salaryText: 'Available in Candidate Desk',
    requirements: 'B.Tech/BE Civil + 5+ years high-rise/bridge, AutoCAD/STAAD',
    perks: ['Free Family Accommodation', 'Annual Return Tickets', 'Private Health Insurance'],
  },
  {
    id: 'j5',
    title: 'Finance & Accounts Manager (CA)',
    country: 'Qatar',
    sector: 'Finance & Business',
    salaryText: 'Available in Candidate Desk',
    requirements: 'CA / MBA Finance + 4+ years GCC VAT, Tally/SAP, audit',
    perks: ['Family Status + School Allowance', 'Performance Bonus', 'End of Service Gratuity'],
  },
  {
    id: 'j6',
    title: 'Data Analyst — Power BI / SQL',
    country: 'Kingdom of Saudi Arabia',
    sector: 'Finance & Business',
    salaryText: 'Available in Candidate Desk',
    requirements: 'B.Com/BBA + SQL, Power BI, Excel — 2+ years reporting',
    perks: ['Hybrid Work', 'Health Insurance (Family)', 'Professional Development Budget'],
  },
  {
    id: 'j7',
    title: 'HVAC Plant Maintenance Supervisor',
    country: 'Qatar',
    sector: 'Oil & Gas / Energy',
    salaryText: 'Available in Candidate Desk',
    requirements: 'Diploma/Degree Mechanical + chilled water plant exp',
    perks: ['Company Transport', 'Food Allowance', 'Overtime + Annual Bonus'],
  },
  {
    id: 'j8',
    title: 'CNC Precision Machine Programmer',
    country: 'Germany (EU FastTrack)',
    sector: 'Manufacturing & Tech',
    salaryText: 'Available in Candidate Desk',
    requirements: 'ITI/Diploma Machinist — Fanuc/Siemens G-code mastery',
    perks: ['Direct EU Work Permit', 'Social Security & Pension', 'Permanent Residency Path'],
  },
];

export default function RecruitmentPage() {
  useVisibilityTracking('/manpower');
  const [, setLocation] = useLocation();

  // Search & Filter State
  const [selectedSector, setSelectedSector] = useState('All Sectors');
  const [funnelOpen, setFunnelOpen] = useState(false);
  // Partner attribution: /go deep links land here with ?ref= — forward it so the referral is credited.
  const refCode = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('ref') || undefined : undefined;
    const [bookingOpen, setBookingOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

  // Application Form State
  const [candidateName, setCandidateName] = useState('');
  const [candidatePhone, setCandidatePhone] = useState('');
  const [candidateEmail, setCandidateEmail] = useState('');
  const [experienceYears, setExperienceYears] = useState('3-5 years');
  const [qualification, setQualification] = useState('bachelor');
  const [consent, setConsent] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [formFeedback, setFormFeedback] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Fetch real jobs from backend
  const { data: jobsData, isLoading: loadingJobs } = useQuery({
    queryKey: ['publicJobs'],
    queryFn: async () => {
      const res = await fetch(`${API}/api/public/jobs`, { credentials: 'include', });
      if (!res.ok) return { jobs: [] };
      return res.json();
    },
    staleTime: 60_000,
  });

  const jobs: Job[] = useMemo(() => {
    const apiJobs = jobsData?.jobs || [];
    if (apiJobs.length > 0) {
      // Merge with enriched attributes
      return apiJobs.map((j: any) => ({
        ...j,
        requirements: j.requirements || 'Relevant degree / diploma with 2+ years field experience',
        perks: j.perks || ['Free Accommodation', 'Medical Insurance', 'Flight Tickets Provided'],
      }));
    }
    return FALLBACK_JOBS;
  }, [jobsData]);

  const filteredJobs = useMemo(() => {
    return jobs.filter((j) => {
      const matchSector = selectedSector === 'All Sectors' || j.sector.toLowerCase().includes(selectedSector.toLowerCase().slice(0, 4));
      const matchQuery = !searchQuery || (j.title + ' ' + j.country + ' ' + j.sector).toLowerCase().includes(searchQuery.toLowerCase());
      return matchSector && matchQuery;
    });
  }, [jobs, selectedSector, searchQuery]);

  const mobileJobsRef = useRef<HTMLDivElement>(null);
  const [mobileJobsIdx, setMobileJobsIdx] = useState(0);
  useEffect(() => {
    const scroller = mobileJobsRef.current;
    if (!scroller || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const cards = scroller.querySelectorAll<HTMLElement>('.job-card-mobile');
    const update3D = () => {
      const rect = scroller.getBoundingClientRect();
      const center = rect.left + rect.width / 2;
      let closest = 0; let min = Infinity;
      cards.forEach((card, idx) => {
        const cRect = card.getBoundingClientRect();
        const cCenter = cRect.left + cRect.width / 2;
        const dist = (cCenter - center) / rect.width;
        const rotateY = dist * -16;
        const translateZ = -Math.abs(dist) * 30;
        const scale = 1 - Math.abs(dist) * 0.06;
        card.style.transform = `perspective(1000px) rotateY(${rotateY}deg) translateZ(${translateZ}px) scale(${scale})`;
        card.style.opacity = String(Math.max(0.88, 1 - Math.abs(dist) * 0.12));
        const abs = Math.abs(cCenter - center);
        if (abs < min) { min = abs; closest = idx; }
      });
      setMobileJobsIdx(closest);
    };
    let ticking = false;
    const onScroll = () => {
      if (!ticking) { requestAnimationFrame(() => { update3D(); ticking = false; }); ticking = true; }
    };
    scroller.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', update3D);
    update3D();
    return () => {
      scroller.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', update3D);
    };
  }, [filteredJobs.length]);

  // Submit Candidate Job Application
  const handleApplyJob = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!consent) {
      setFormFeedback('Please grant DPDP data processing consent.');
      return;
    }
    setSubmitting(true);
    setFormFeedback(null);

    const digits = candidatePhone.replace(/\D/g, '');
    const normalizedPhone = digits.length === 10 ? `+91 ${digits.slice(0, 5)} ${digits.slice(5)}` : candidatePhone;

    try {
      const res = await fetch(`${API}/api/public/leads`, { credentials: 'include', 
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(turnstileToken ? { 'cf-turnstile-response': turnstileToken } : {}),
        },
        body: JSON.stringify({
          name: candidateName,
          phone: normalizedPhone,
          email: candidateEmail,
          highestQualification: qualification === 'bachelor' ? 'undergrad' : 'postgrad',
          division: 'manpower',
          leadSource: 'website-manpower',
          dynamicContext: {
            appliedJobTitle: selectedJob?.title || 'General Manpower Intake',
            appliedJobCountry: selectedJob?.country || 'Any Destination',
            experienceYears,
            salaryQuoted: selectedJob?.salaryText,
          },
          consents: { coreProcessing: consent, whatsappUpdates: true, marketingCampaigns: true },
          ...(refCode ? { refCode } : {}),
        }),
      });

      const data = await res.json();
      if (res.ok) {
        track(EVENTS.leadSubmit, { division: 'manpower' });
        setLocation(`/portal?token=${encodeURIComponent(data.token)}`);
      } else {
        setFormFeedback(data.error || 'Application submission failed.');
      }
    } catch (err: any) {
      setFormFeedback(`Network error: ${err.message}`);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-brand-cream font-sans text-brand-navy selection:bg-brand-gold selection:text-brand-navy">
      <SEOHead
        title="Overseas Manpower & Recruitment | Opus Overseas"
        description="Structured screening for verified jobs in UAE, Saudi Arabia, Qatar, Kuwait & Germany — healthcare, engineering, construction & tech. Employer-verified, transparent."
        canonicalPath="/manpower"
        schemas={[
          BASE_ORGANIZATION_SCHEMA,
          getServiceSchema({
            name: 'International Manpower Recruitment & Overseas Career Placements',
            description: 'Ethical, zero-advance fee international manpower sourcing, candidate trade testing, employer interviews, and employment visa deployments.',
            serviceType: 'International Employment Agency',
            path: '/manpower',
          }),
          getBreadcrumbSchema([
            { name: 'Home', path: '/' },
            { name: 'Manpower & Recruitment', path: '/manpower' },
          ]),
          getFAQSchema(RECRUITMENT_FAQS),
        ]}
      />
      <div className="film-grain" aria-hidden="true" />
      <Nav />
      <ChatWidget />
      <StickyCallBar />

      {/* HERO SECTION — Global Ambition & Career Acceleration */}
      <section className="relative overflow-hidden bg-gradient-to-b from-[#061e38] via-[#0d2644] to-[#0a2d50] pb-24 pt-36 sm:pt-40 text-white border-b border-brand-gold/20">
        <DomainBackdrop theme="manpower" />
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="hero-orb -right-20 -top-20 h-96 w-96 rounded-full bg-rose-500/20 blur-3xl" />
          <div className="hero-orb -left-20 bottom-0 h-96 w-96 rounded-full bg-brand-gold/20 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-7xl px-5 sm:px-6 md:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            <div className="lg:col-span-7">
              <span className="inline-flex items-center gap-2 rounded-full border border-rose-400/40 bg-rose-500/10 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.2em] text-rose-300 shimmer-badge">
                💼 Structured Screening · Employer-Verified Roles
              </span>
              <h1 className="mt-5 font-display fluid-h1 font-black leading-tight tracking-tight text-white">
                Launch Your Global Career with <span className="text-brand-gold">Verified Overseas Contracts</span>
              </h1>
              <p className="mt-5 text-base sm:text-lg leading-relaxed text-white/80 max-w-2xl">
                Direct employer placements across the UAE, Saudi Arabia, Qatar, Kuwait, and European Fast-Track hubs. High tax-free compensation, transparent contracts, and complete employment visa sponsorship.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  href="#job-board"
                  className="rounded-full bg-brand-gold px-8 py-3.5 text-xs font-extrabold uppercase tracking-wider text-brand-navy shadow-[0_10px_30px_rgba(215,160,25,0.4)] transition-all hover:bg-brand-gold-hover hover:text-white tactile-btn cursor-pointer"
                >
                  Browse Live Openings ({jobs.length} Positions) ↓
                </a>
                <button
              type="button"
              onClick={() => setBookingOpen(true)}
              className="rounded-full border border-white/25 bg-white/5 hover:bg-white/10 px-6 py-3.5 text-xs font-semibold text-white transition-all hover:border-brand-gold hover:text-brand-gold tactile-btn inline-flex items-center gap-1.5"
            >
<span>📅 Book Career Advisory Call</span>
            </button>
                <a
                  href="#apply-form"
                  className="rounded-full border border-white/25 bg-white/5 hover:bg-white/10 px-6 py-3.5 text-xs font-semibold text-white transition-all hover:border-brand-gold hover:text-brand-gold tactile-btn"
                >
                  Submit CV for Matching
                </a>
              </div>
              <div className="mt-4">
                <a href="/manpower/hire" className="inline-flex items-center gap-1.5 text-xs font-bold text-white/70 hover:text-brand-gold transition-colors">
                  For Employers — Hire Verified Talent in 21 Days <span>→</span>
                </a>
              </div>
            </div>

            <div className="lg:col-span-5 relative">
              <div className="relative rounded-3xl overflow-hidden border border-white/20 shadow-2xl group">
                <img
                  src="/img/hero-recruitment.jpg"
                  alt="Global Professional Manpower and Engineering"
                  className="w-full h-80 sm:h-96 object-cover transform transition-transform duration-700 group-hover:scale-105"
                  onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#061e38] via-transparent to-transparent opacity-80" />
                <div className="absolute bottom-4 left-4 right-4 glass-light p-4 rounded-2xl text-brand-navy">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-display text-xs font-bold uppercase tracking-wider text-brand-gold">Building Verified Network</p>
                      <p className="font-display text-sm font-extrabold text-brand-navy">Building Verified Network</p>
                    </div>
                    <span className="rounded-full bg-emerald-500/20 text-emerald-800 px-2.5 py-1 text-[13px] font-bold font-mono">
                      ● Active Drives
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* COMPLIANCE & SAFETY ASSURANCES */}
      <section className="bg-white py-12 border-b border-brand-navy/5">
        <div className="mx-auto max-w-7xl px-5 sm:px-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 text-center">
          <div>
            <span className="text-2xl mb-1 block">📜</span>
            <p className="font-display font-extrabold text-sm text-brand-navy">Verified Network — Building in Public</p>
            <p className="text-sm text-brand-textLight mt-0.5">Licensed Sourcing Partner</p>
          </div>
          <div>
            <span className="text-2xl mb-1 block">💰</span>
            <p className="font-display font-extrabold text-sm text-brand-navy">Zero Fake Listings</p>
            <p className="text-sm text-brand-textLight mt-0.5">Building Verified Network</p>
          </div>
          <div>
            <span className="text-2xl mb-1 block">🏥</span>
            <p className="font-display font-extrabold text-sm text-brand-navy">Contract Benefit Packages</p>
            <p className="text-sm text-brand-textLight mt-0.5">Housing, Travel & Visa Sourced</p>
          </div>
          <div>
            <span className="text-2xl mb-1 block">🤝</span>
            <p className="font-display font-extrabold text-sm text-brand-navy">Pre-Departure Training</p>
            <p className="text-sm text-brand-textLight mt-0.5">Workplace & Cultural Orientation</p>
          </div>
        </div>
      </section>

      {/* EDITORIAL TRUST STORY & GLOBAL CAREER PLACEMENTS */}
      <section className="mx-auto max-w-7xl px-5 sm:px-6 py-16 sm:py-20 border-b border-brand-navy/5">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center">
          <div className="lg:col-span-6">
            <div className="relative rounded-3xl overflow-hidden shadow-2xl border border-brand-navy/10 group">
              <img
                src="/img/editorial-recruitment.jpg"
                alt="Healthcare and engineering professionals in high-tech innovation facility"
                className="w-full h-[360px] sm:h-[420px] object-cover transition-transform duration-700 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#061e38]/80 via-transparent to-transparent" />
              <div className="absolute bottom-4 left-4 right-4 bg-white/90 backdrop-blur-md p-4 rounded-2xl border border-white/40">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold uppercase tracking-wider text-brand-gold">Document-Verified Professional Network</p>
                    <p className="text-xs sm:text-sm font-extrabold text-brand-navy">Building Verified Network</p>
                  </div>
                  <span className="rounded-full bg-rose-500/15 text-rose-800 px-2.5 py-1 text-[13px] font-bold font-mono">
                    ● Zero Advance Fee
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-6 space-y-6">
            <div>
              <span className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-brand-gold">
                Direct Placements
              </span>
              <h2 className="font-display fluid-h2 font-extrabold text-brand-navy mt-1">
                Ethical Manpower Sourcing & Verified Employer Contracts
              </h2>
              <p className="text-xs sm:text-sm text-brand-textLight leading-relaxed mt-2.5">
                We bridge high-demand global employers with certified Indian professionals. Zero fraudulent listings, transparent compensation structures, and end-to-end employment visa sponsorship.
              </p>
            </div>

            <div className="space-y-3.5">
              <div className="clay-card p-4 flex items-start gap-3.5 border-l-4 border-l-brand-gold">
                <span className="text-xl">🏥</span>
                <div>
                  <h3 className="font-display text-sm font-bold text-brand-navy">Healthcare & Medical Licensing (MOH / DHA / Prometric)</h3>
                  <p className="text-xs text-brand-textLight leading-relaxed mt-0.5">Specialized placement for registered nurses, specialist doctors, and technicians into leading GCC hospital networks.</p>
                </div>
              </div>

              <div className="clay-card p-4 flex items-start gap-3.5 border-l-4 border-l-brand-navy">
                <span className="text-xl">🏗️</span>
                <div>
                  <h3 className="font-display text-sm font-bold text-brand-navy">Engineering, MEP & Industrial Infrastructure</h3>
                  <p className="text-xs text-brand-textLight leading-relaxed mt-0.5">Direct hiring drives for certified civil, electrical, mechanical engineers and instrumentation supervisors.</p>
                </div>
              </div>

              <div className="clay-card p-4 flex items-start gap-3.5 border-l-4 border-l-emerald-600">
                <span className="text-xl">🧳</span>
                <div>
                  <h3 className="font-display text-sm font-bold text-brand-navy">POE Emigration & Complete Deployment Support</h3>
                  <p className="text-xs text-brand-textLight leading-relaxed mt-0.5">Protector of Emigrants (POE) clearance, GAMCA medicals, visa stamping, and pre-departure workplace orientation.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Audience Fork — sticky, gold-standard dual path */}
      <div className="sticky top-16 z-20 -mx-5 sm:-mx-6 px-5 sm:px-6 py-3 bg-brand-cream/80 backdrop-blur-md border-y border-brand-navy/5">
        <div className="mx-auto max-w-7xl flex items-center justify-center">
          <div className="inline-flex p-1 rounded-full bg-brand-navy/[0.06] border border-brand-navy/10">
            <a href="#job-board" className="px-5 py-2 rounded-full bg-brand-navy text-white text-xs font-bold shadow-sm">For Candidates — Find Jobs</a>
            <a href="/manpower/hire" className="px-5 py-2 rounded-full text-brand-navy/70 hover:text-brand-navy text-xs font-bold transition-colors">For Employers — Hire Talent →</a>
          </div>
        </div>
      </div>

      {/* LIVE GLOBAL JOB BOARD (Connected to /api/public/jobs) */}
      <section id="job-board" className="mx-auto max-w-7xl px-5 sm:px-6 py-20 sm:py-24">
        <div className="mb-12 text-center space-y-3">
          <span className="rounded-full bg-brand-gold/15 border border-brand-gold/30 px-3.5 py-1 text-sm font-bold uppercase tracking-wider text-brand-gold font-mono">
            Active Employer Demands
          </span>
          <h2 className="font-display fluid-h2 font-bold text-brand-navy">
            Explore Open International Positions
          </h2>
          <p className="text-sm sm:text-base text-brand-textLight max-w-lg mx-auto">
            Direct government-vetted quotas for technicians, engineers, healthcare professionals, and staff.
          </p>
        </div>

        {/* Filter Controls */}
        <div className="mb-10 space-y-4">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar py-1 sm:flex-wrap sm:justify-center">
            {SECTORS.map((s) => (
              <button
                key={s}
                onClick={() => setSelectedSector(s)}
                className={`flex shrink-0 min-h-11 items-center rounded-full px-4 py-2 text-xs font-bold transition-all cursor-pointer sm:min-h-0 ${
                  selectedSector === s
                    ? 'bg-brand-navy text-white shadow-md'
                    : 'bg-white border border-brand-navy/10 text-brand-navy/75 hover:border-brand-gold hover:text-brand-navy'
                }`}
              >
                {s}
              </button>
            ))}
          </div>

          <div className="max-w-md mx-auto">
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by job title, destination (e.g. Nurse, Engineer, Germany)…"
              className="w-full min-h-11 rounded-2xl border border-brand-navy/15 bg-white px-4 py-3 text-xs sm:text-sm text-brand-navy focus:border-brand-gold focus:outline-none shadow-xs sm:min-h-0"
            />
          </div>
        </div>

        {/* Jobs Grid */}
        {loadingJobs ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-44 rounded-2xl bg-brand-navy/5 animate-pulse" />
            ))}
          </div>
        ) : filteredJobs.length === 0 ? (
          <div className="clay-card p-12 text-center text-brand-textLight max-w-lg mx-auto space-y-2">
            <span className="inline-block rounded-full bg-brand-gold/15 text-brand-navy px-3 py-1 font-mono text-[13px] font-bold">
              ● Live Employer Drives Scheduling
            </span>
            <p className="font-bold text-brand-navy text-sm">Direct Employer Quotas Opening for This Sector</p>
            <p className="text-xs text-brand-textLight">Interview drives for this category are actively being scheduled. Submit your CV below for immediate priority matching.</p>
          </div>
        ) : (
          <>
            {/* Mobile — 3D swipe deck */}
            <div
              ref={mobileJobsRef}
              className="md:hidden -mx-5 px-5 flex gap-4 overflow-x-auto snap-x snap-mandatory pb-6 pt-2 scroll-smooth"
              style={{ WebkitOverflowScrolling: 'touch', perspective: '1200px', scrollbarWidth: 'none' } as any}
            >
              {filteredJobs.map((j) => (
                <div
                  key={`m-${j.id}`}
                  className="job-card-mobile shrink-0 snap-center min-w-[82vw] max-w-[320px] clay-card p-6 flex flex-col justify-between will-change-transform"
                  style={{ transformStyle: 'preserve-3d' } as any}
                >
                  <div>
                    <h3 className="font-display text-base font-bold text-brand-navy">{j.title}</h3>
                    <p className="text-xs text-brand-textLight mt-0.5">📍 {j.country} · <span className="font-medium text-brand-navy">{j.sector}</span></p>
                    <p className="text-xs text-brand-textLight leading-relaxed bg-slate-50 p-3 rounded-xl border border-brand-navy/5 my-3">
                      <span className="font-bold text-brand-navy">Role Criteria:</span> {j.requirements}
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {(j.perks || []).slice(0, 3).map((p, i) => (
                        <span key={i} className="rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 text-[13px] font-semibold">✓ {p}</span>
                      ))}
                    </div>
                  </div>
                  <div className="mt-6 pt-4 border-t border-brand-navy/5 flex items-center justify-between">
                    <span className="text-sm font-medium text-emerald-700">● Immediate Visa Processing</span>
                    <button
                      onClick={() => { setSelectedJob(j); document.getElementById('apply-form')?.scrollIntoView({ behavior: 'smooth' }); }}
                      className="cursor-pointer rounded-full bg-brand-navy px-4 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-brand-gold hover:text-brand-navy transition-all shadow-xs"
                    >
                      Apply →
                    </button>
                  </div>
                </div>
              ))}
            </div>
            <div className="md:hidden -mt-2 mb-2 flex items-center justify-between">
              <span className="inline-flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-wider text-brand-navy/35">
                <span className="w-4 h-0.5 bg-brand-gold/30 rounded-full" /> Swipe to explore <span className="animate-pulse">→</span>
              </span>
              <div className="flex items-center gap-1.5">
                {filteredJobs.slice(0, 6).map((_, i) => (
                  <span key={i} className={`h-1.5 rounded-full transition-all ${i === mobileJobsIdx ? 'w-5 bg-brand-gold' : 'w-1.5 bg-brand-navy/15'}`} />
                ))}
              </div>
            </div>

            {/* Desktop — grid */}
            <div className="hidden md:grid md:grid-cols-2 gap-6">
              {filteredJobs.map((j) => (
                <div
                  key={j.id}
                  className="clay-card p-6 flex flex-col justify-between hover:border-brand-gold/50 transition-all group"
                >
                  <div>
                    <div className="flex items-start justify-between gap-3 mb-3">
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-display text-base font-bold text-brand-navy group-hover:text-brand-gold-hover transition-colors">
                            {j.title}
                          </h3>
                        </div>
                        <p className="text-xs text-brand-textLight mt-0.5">
                          📍 {j.country} · <span className="font-medium text-brand-navy">{j.sector}</span>
                        </p>
                      </div>
                    </div>

                    <p className="text-xs text-brand-textLight leading-relaxed bg-slate-50 p-3 rounded-xl border border-brand-navy/5 mb-3">
                      <span className="font-bold text-brand-navy">Role Criteria:</span> {j.requirements}
                    </p>

                    <div>
                      <p className="text-[13px] font-bold uppercase tracking-wider text-brand-textLight mb-1">Included Benefits:</p>
                      <div className="flex flex-wrap gap-1.5">
                        {(j.perks || []).map((p, i) => (
                          <span key={i} className="rounded-md bg-emerald-50 text-emerald-800 border border-emerald-200 px-2 py-0.5 text-[13px] font-semibold">
                            ✓ {p}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 pt-4 border-t border-brand-navy/5 flex items-center justify-between">
                    <span className="text-sm font-medium text-emerald-700">● Immediate Visa Processing</span>
                    <button
                      onClick={() => {
                        setSelectedJob(j);
                        document.getElementById('apply-form')?.scrollIntoView({ behavior: 'smooth' });
                      }}
                      className="min-h-11 cursor-pointer rounded-full bg-brand-navy px-5 py-2 text-xs font-bold uppercase tracking-wider text-white hover:bg-brand-gold hover:text-brand-navy transition-all shadow-xs tactile-btn sm:min-h-0"
                    >
                      Apply for Position →
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </section>

      {/* CANDIDATE INTAKE FORM (Connected to /api/public/leads) */}
      <section id="apply-form" className="bg-white py-20 border-t border-brand-navy/10">
        <div className="mx-auto max-w-3xl px-5 sm:px-6">
          <div className="glass-light p-8 sm:p-10 rounded-3xl shadow-2xl border border-brand-navy/10">
            <div className="text-center mb-8">
              <span className="gold-dot mb-2" />
              <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-brand-navy">
                {selectedJob ? `Submit Application for ${selectedJob.title}` : 'Submit Your CV to Global Talent Pool'}
              </h2>
              <p className="text-xs sm:text-sm text-brand-textLight mt-1">
                Our recruitment officers match your resume directly against verified employer interview drives.
              </p>
            </div>

            <form onSubmit={handleApplyJob} className="space-y-4 lead-form-wrap">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[13px] font-bold uppercase tracking-wider text-brand-textLight mb-1">Candidate Full Name</label>
                  <input required placeholder="As shown on Passport / Aadhaar" value={candidateName} onChange={(e) => setCandidateName(e.target.value)} />
                </div>
                <div>
                  <label className="block text-[13px] font-bold uppercase tracking-wider text-brand-textLight mb-1">WhatsApp Mobile Number</label>
                  <input required type="tel" placeholder="+91 98765 00001" value={candidatePhone} onChange={(e) => setCandidatePhone(e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[13px] font-bold uppercase tracking-wider text-brand-textLight mb-1">Email Address</label>
                  <input required type="email" placeholder="you@example.com" value={candidateEmail} onChange={(e) => setCandidateEmail(e.target.value)} />
                </div>
                <div>
                  <label className="block text-[13px] font-bold uppercase tracking-wider text-brand-textLight mb-1">Years of Experience</label>
                  <select value={experienceYears} onChange={(e) => setExperienceYears(e.target.value)}>
                    <option>0-1 year (Fresh Graduate)</option>
                    <option>2-4 years</option>
                    <option>5-8 years</option>
                    <option>9+ years (Senior / Lead)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[13px] font-bold uppercase tracking-wider text-brand-textLight mb-1">Highest Qualification</label>
                  <select value={qualification} onChange={(e) => setQualification(e.target.value)}>
                    <option value="diploma">Diploma / ITI Technical</option>
                    <option value="bachelor">Bachelor's Degree (BE / B.Sc)</option>
                    <option value="master">Master's Degree (MS / ME)</option>
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
                    I consent to Opus Overseas presenting my professional credentials to vetted international employers under DPDP regulations.
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
                {submitting ? 'Registering Candidate Dossier…' : 'Submit Application & Join Talent Radar →'}
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* GEO & AEO KNOWLEDGE HUB + FAQS */}
      <GeoFaqSection
        badge="Manpower & Global Workforce Solutions"
        title="Overseas Manpower Frequently Asked Questions"
        subtitle="Transparent answers regarding Gulf job openings, European skilled migration, zero-advance fee guarantees, and visa deployments."
        summaryTitle="International Manpower Recruitment at Opus Overseas"
        summaryText="Opus Overseas connects Indian professionals with licensed overseas employers in Saudi Arabia, UAE, Qatar, Kuwait, and Germany across healthcare, engineering, construction, and technical trades with 100% compliant employer-paid visas and zero upfront candidate fees."
        faqs={RECRUITMENT_FAQS}
      />

      <BookingModal
        open={bookingOpen}
        onClose={() => setBookingOpen(false)}
        division={'manpower'}
        fallbackUrl={getBookingUrlForDivision('manpower')}
      />
      <InteractiveFunnelModal
        isOpen={funnelOpen}
        onClose={() => setFunnelOpen(false)}
        initialDivision="manpower"
      />
      <Footer />
    </div>
  );
}
