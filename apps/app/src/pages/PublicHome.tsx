import { useVisibilityTracking } from '../lib/visibilityTracking';
import { useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Nav from '../components/Nav';
import Footer from '../components/Footer';
import StickyCallBar from '../components/StickyCallBar';
import HeroCarousel from '../components/HeroCarousel';
import Img from '../components/Img';
import ChatWidget from '../components/ChatWidget';
import ApplicationReadinessAuditor from '../components/home/ApplicationReadinessAuditor';
import InstitutionalCovenants from '../components/home/InstitutionalCovenants';
import RealCaseVault from '../components/home/RealCaseVault';
import GeoFaqSection from '../components/public/GeoFaqSection';
import SEOHead from '../components/SEOHead';
import { BASE_ORGANIZATION_SCHEMA, getBreadcrumbSchema, getFAQSchema } from '../lib/schemas';
import { imageFor } from '../config/images';
import { useDivisions } from '../lib/divisions';

gsap.registerPlugin(ScrollTrigger);

const HOME_FAQS = [
  {
    question: 'What comprehensive overseas services does Opus Overseas offer?',
    answer: 'Opus Overseas is a licensed full-spectrum consultancy delivering top-tier Study Abroad university admissions, Global Visa processing (Student, Tourist, Work, Business), MEA Apostille & Document Attestation, verified Umrah pilgrimage logistics from Hyderabad, and international Manpower Recruitment.',
  },
  {
    question: 'How do I start my application or counseling session?',
    answer: 'You can book a 1-on-1 consultation session online through our calendar booking tool, submit an inquiry through our digital lead form, or visit our headquarters at 1-1-382, Rakasipet, Bodhan, Telangana. Our certified counselors conduct an initial profile audit and provide a transparent roadmap.',
  },
  {
    question: 'What countries are available for Study Abroad and Work Visas?',
    answer: 'We represent and process applications for top destinations worldwide including the United Kingdom, United States, Canada, Germany, Australia, Ireland, New Zealand, Saudi Arabia, the United Arab Emirates, Qatar, and other European and GCC nations.',
  },
  {
    question: 'How does Opus Overseas maintain compliance and document security?',
    answer: 'We operate under strict zero-advance fee guarantees for recruitment, timing-verified MEA / Embassy courier tracking, and ISO-grade document protection in encrypted cloud vaults with timing-safe audit logs.',
  },
];

const SLUG_TO_DIVISION_KEY: Record<string, string> = {
  'study-abroad': 'study-abroad',
  'visa-services': 'visa',
  'umrah-travel': 'umrah',
  'attestation': 'attestation',
  'recruitment': 'manpower',
};

const SERVICES = [
  { 
    id: 'study-abroad', 
    title: 'Study Abroad Consulting', 
    telemetry: '● Fall & Spring Admissions Open',
    desc: 'University applications, scholarship evaluations, SOP mentoring, and 1-on-1 consular visa mock drills across 50+ countries.', 
    path: '/study-abroad' 
  },
  { 
    id: 'visa-services', 
    title: 'Global Visa Services', 
    telemetry: '● 24–48h Express Queue Active',
    desc: 'Tourist, business, work, and family residency visas with verified embassy document preparation and queue tracking.', 
    path: '/visa-services' 
  },
  { 
    id: 'umrah-travel', 
    title: 'Umrah & Sacred Logistics', 
    telemetry: '● Scheduled Flights & Groups',
    desc: 'Customized packages from Hyderabad, pre-vetted Haram proximity hotel stays, complete visa support, and scholar guidance.', 
    path: '/umrah-travel' 
  },
  { 
    id: 'attestation', 
    title: 'Document Attestation & Apostille', 
    telemetry: '● MEA New Delhi Stamping 3–5d',
    desc: 'State HRD, Home Dept (SDM), MEA Apostille, and destination embassy legalizations with insured courier custody.', 
    path: '/attestation' 
  },
  { 
    id: 'recruitment', 
    title: 'Overseas Careers & Manpower', 
    telemetry: '● 100% Verified Demands',
    desc: 'Candidate sourcing partner to Govt. Registered MEA-Licensed Agencies for engineers, healthcare personnel, and skilled talent.', 
    path: '/recruitment' 
  },
];

const FLAG_CODES = ['us', 'gb', 'ca', 'au', 'nz', 'de', 'ie', 'ae', 'fr', 'nl'];
const FLAG_NAMES = ['USA', 'UK', 'Canada', 'Australia', 'New Zealand', 'Germany', 'Ireland', 'UAE', 'France', 'Netherlands'];

const STEPS = [
  ['Profile & Strategy', 'We audit your background, transcripts, and financial timelines to map your optimal global pathway.'],
  ['Dossier Assembly', 'Our legal and admissions desk drafts SOPs, legalizes certificates via MEA, and formats sponsor portfolios.'],
  ['Consular Submission', 'We secure priority VFS/Embassy biometric slots, conduct rigorous mock interviews, and monitor live queues.'],
  ['Arrival & Settlement', 'Receive your stamped passport, flight briefings, foreign exchange support, and on-ground guidance.'],
] as const;

export default function PublicHome() {
  useVisibilityTracking('/');
  const { enabled, isEnabled } = useDivisions();
  const [, setLocation] = useLocation();
  
  const marqueeRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLElement>(null);
  const stepsRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      const tween = gsap.to(marqueeRef.current, { xPercent: -50, duration: 38, ease: 'none', repeat: -1 });
      ScrollTrigger.create({
        trigger: document.body,
        start: 'top top',
        end: 'max',
        onUpdate: (self) => {
          const speed = 1 + self.getVelocity() / 1800;
          tween.timeScale(Math.max(0.5, Math.min(3.2, speed)));
        },
      });

      gsap.fromTo('.svc-card', { y: 30, opacity: 0 }, {
        y: 0, opacity: 1, duration: 0.7, ease: 'power3.out', stagger: 0.08,
        scrollTrigger: { trigger: gridRef.current, start: 'top 80%', once: true },
      });

      gsap.utils.toArray<HTMLElement>('.reveal').forEach((el) => {
        gsap.fromTo(el, { y: 25, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 85%', once: true } });
      });
      gsap.utils.toArray<HTMLElement>('.step-item').forEach((el) => {
        gsap.fromTo(el, { y: 25, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, ease: 'power3.out', scrollTrigger: { trigger: stepsRef.current, start: 'top 80%', once: true } });
      });
    });
    return () => ctx.revert();
  }, []);

  return (
    <div className="min-h-screen bg-[#fcfbf9] font-sans text-brand-navy selection:bg-brand-gold selection:text-brand-navy">
      <SEOHead
        title="Opus Overseas | Global Study Abroad, Visas, Attestation & Umrah Consultancy"
        description="Opus Overseas is a premier global consultancy for university admissions in UK, USA, Germany, Canada, worldwide visa processing, MEA apostille attestation, Umrah tours & Gulf careers."
        canonicalPath="/"
        schemas={[
          BASE_ORGANIZATION_SCHEMA,
          getBreadcrumbSchema([{ name: 'Home', path: '/' }]),
          getFAQSchema(HOME_FAQS),
        ]}
      />
      <div className="film-grain" aria-hidden="true" />
      <Nav />
      <ChatWidget />
      
      {/* 1. HERO SHOWCASE */}
      <HeroCarousel />
      <StickyCallBar />

      {/* 2. TIER-ONE FLAG MARQUEE */}
      <div className="relative overflow-hidden border-y border-brand-navy/10 bg-white py-3.5">
        <div ref={marqueeRef} className="flex w-max items-center gap-12 whitespace-nowrap will-change-transform">
          {[...FLAG_CODES, ...FLAG_CODES, ...FLAG_CODES].map((code, i) => (
            <div key={i} className="flex shrink-0 items-center gap-2.5">
              <img
                src={`/img/flags/${code}.png`}
                alt={FLAG_NAMES[i % FLAG_NAMES.length]}
                className="h-4.5 w-6.5 rounded object-cover shadow-2xs border border-slate-100"
              />
              <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-navy/65">
                {FLAG_NAMES[i % FLAG_NAMES.length]}
              </span>
            </div>
          ))}
        </div>
        <div className="pointer-events-none absolute inset-y-0 left-0 w-20 bg-gradient-to-r from-white to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-20 bg-gradient-to-l from-white to-transparent" />
      </div>

      {/* 3. PROFESSIONAL DIVISIONS SHOWCASE (With Embedded Live Telemetry Badges) */}
      <section id="services-grid" ref={gridRef} className="mx-auto max-w-7xl px-5 sm:px-6 py-20 sm:py-24">
        <div className="reveal mb-14 space-y-2.5 text-center">
          <span className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">
            Authorized Desks
          </span>
          <h2 className="font-display fluid-h2 font-extrabold text-brand-navy tracking-tight">
            Our Specialized Global Mobility Divisions
          </h2>
          <p className="mx-auto max-w-md text-xs sm:text-sm text-brand-textLight">
            Dedicated consulting units operating under direct sovereign licensing and institutional quotas.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {SERVICES.map((svc) => {
            const disabled = enabled !== null && !isEnabled(SLUG_TO_DIVISION_KEY[svc.id]);
            return (
              <div
                key={svc.id}
                onClick={() => !disabled && setLocation(svc.path)}
                className={`svc-card group rounded-3xl border border-brand-navy/10 bg-white p-6 shadow-xs hover:shadow-md hover:border-brand-gold/40 transition-all duration-300 flex flex-col justify-between ${
                  disabled ? 'pointer-events-none opacity-60' : 'cursor-pointer'
                }`}
                aria-disabled={disabled || undefined}
              >
                <div>
                  <Img 
                    src={imageFor(`hero-${svc.id}`).src} 
                    prompt={imageFor(`hero-${svc.id}`).prompt} 
                    label={svc.title} 
                    className="mb-4.5 rounded-2xl overflow-hidden shadow-2xs" 
                  />
                  
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-[10px] font-bold font-mono text-emerald-800 bg-emerald-50 border border-emerald-200/60 px-2.5 py-0.5 rounded-full">
                      {svc.telemetry}
                    </span>
                    {disabled && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-brand-gold/40 bg-brand-gold/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-brand-gold">
                        Coming soon
                      </span>
                    )}
                  </div>

                  <h3 className="font-display text-base sm:text-lg font-bold text-brand-navy transition-colors group-hover:text-brand-gold-hover mb-1.5">
                    {svc.title}
                  </h3>
                  
                  <p className="text-xs leading-relaxed text-brand-textLight">{svc.desc}</p>
                </div>

                <div className="mt-5 pt-3.5 border-t border-brand-navy/5 flex items-center justify-between text-xs">
                  <span className="font-bold uppercase tracking-wider text-brand-gold group-hover:text-brand-navy transition-colors flex items-center gap-1 text-[11px]">
                    {disabled ? 'Coming Soon' : 'Explore Division'} →
                  </span>
                  <span className="text-brand-navy/30 group-hover:text-brand-gold font-mono text-[11px]">
                    0{SERVICES.indexOf(svc) + 1}
                  </span>
                </div>
              </div>
            );
          })}

          {/* Direct Advisory CTA Card */}
          <div className="svc-card rounded-3xl bg-[#061e38] text-white p-7 flex flex-col justify-between shadow-md">
            <div>
              <span className="font-mono text-[10px] uppercase font-bold text-brand-gold bg-brand-gold/15 px-2.5 py-0.5 rounded-full inline-block mb-3">
                ● Unified Client Portal
              </span>
              <h3 className="font-display text-lg font-bold text-white mb-2">
                Create Your Opus OS Account
              </h3>
              <p className="text-xs leading-relaxed text-white/70">
                Unlock instant real-time application tracking, direct counselor messaging, secure document vaults, and personalized university shortlists.
              </p>
            </div>
            <button 
              onClick={() => setLocation('/login')} 
              className="mt-6 cursor-pointer self-start rounded-full bg-brand-gold px-6 py-3 text-xs font-extrabold uppercase tracking-wider text-brand-navy hover:bg-brand-gold-hover hover:text-white transition-all shadow-sm tactile-btn"
            >
              Sign Up on Opus OS →
            </button>
          </div>
        </div>
      </section>

      {/* 4. INTERACTIVE 60-SECOND APPLICATION READINESS AUDITOR */}
      <ApplicationReadinessAuditor />

      {/* 5. INSTITUTIONAL COVENANTS RIBBON (Replaced heavy boxed cards with sleek trust bar) */}
      <InstitutionalCovenants />

      {/* 6. PROVEN CASE SPOTLIGHT (Replaced 6 generic review boxes with 1 tabbed spotlight) */}
      <RealCaseVault />

      {/* 7. HOW IT WORKS — CLEAN EDITORIAL TIMELINE */}
      <section ref={stepsRef} className="py-20 sm:py-24 bg-[#fcfbf9] border-b border-brand-navy/10">
        <div className="mx-auto max-w-6xl px-5 sm:px-6">
          <div className="reveal mb-14 text-center space-y-2">
            <span className="font-mono text-[11px] font-bold uppercase tracking-[0.2em] text-brand-gold">
              Execution Protocol
            </span>
            <h2 className="font-display fluid-h2 font-extrabold text-brand-navy tracking-tight">
              Four Steps to Your Global Milestone
            </h2>
            <p className="text-xs sm:text-sm text-brand-textLight">Complete transparency, document tracking, and compliance at every stage.</p>
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            {STEPS.map(([title, body], i) => (
              <div key={title} className="step-item relative">
                <span className="font-mono text-xs font-black text-brand-gold bg-brand-gold/15 px-3 py-1 rounded-lg inline-block mb-3">
                  0{i + 1}
                </span>
                <h3 className="font-display text-base font-bold text-brand-navy mb-1.5">{title}</h3>
                <p className="text-xs leading-relaxed text-brand-textLight">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* 8. GEO & AEO KNOWLEDGE HUB + FREQUENTLY ASKED QUESTIONS */}
      <GeoFaqSection
        badge="General Inquiries & Protocol"
        title="Frequently Asked Questions"
        subtitle="Clear, verified answers regarding our overseas education, visa processing, attestation, and manpower recruitment protocols."
        summaryTitle="Opus Overseas — Verified Global Consultancy"
        summaryText="Opus Overseas is a premier global consultancy headquartered in Bodhan, Telangana, India. We operate specialized divisions in Study Abroad, Worldwide Visa Services, MEA Document Attestation, Umrah Pilgrimage Packages, and Gulf Manpower Recruitment with 100% compliant tracking and zero hidden charges."
        faqs={HOME_FAQS}
      />

      <Footer />
    </div>
  );
}
