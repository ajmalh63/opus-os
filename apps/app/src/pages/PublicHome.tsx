import { useVisibilityTracking } from '../lib/visibilityTracking';
import { useEffect, useRef, useState } from 'react';
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
    answer: 'Opus Overseas is a licensed full-spectrum consultancy delivering top-tier Study Abroad university admissions, Global Visa processing (Student, Tourist, Work, Business), MEA Apostille & Document Attestation, curated Tours & Travels (including verified Umrah pilgrimage logistics from Hyderabad), and international Manpower Recruitment.',
  },
  {
    question: 'How do I start my application or counseling session?',
    answer: 'You can book a 1-on-1 consultation session online through our calendar booking tool, submit an inquiry through our digital lead form, or visit our headquarters at Nizamabad, Telangana. Our certified counselors conduct an initial profile audit and provide a transparent roadmap.',
  },
  {
    question: 'What countries are available for Study Abroad and Work Visas?',
    answer: 'We represent and process applications for top destinations worldwide including the United Kingdom, United States, Canada, Germany, Australia, Ireland, New Zealand, Saudi Arabia, the United Arab Emirates, Qatar, and other European and GCC nations.',
  },
  {
    question: 'How does Opus Overseas maintain compliance and document security?',
    answer: 'We operate under strict zero-advance fee guarantees for recruitment, timing-verified MEA / Embassy courier tracking, and careful document protection in private vaults — with complete audit logs and transparent tracking.',
  },
];

const SLUG_TO_DIVISION_KEY: Record<string, string> = {
  'study-abroad': 'study-abroad',
  'visa-services': 'visa',
  'tours-travels': 'umrah',
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
    id: 'tours-travels', 
    title: 'Tours & Travels (Holidays & Umrah)', 
    telemetry: '● Scheduled Flights & Group Tours',
    desc: 'Curated international holidays, 5-Star Umrah packages from Hyderabad, domestic getaways, pre-vetted luxury hotels, direct flights, and visa support.', 
    path: '/tours-travels' 
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
    title: 'Overseas Manpower & Manpower', 
    telemetry: '● Verified Gulf & Europe Demands',
    desc: 'Employer-verified openings with structured triage, medical and visa milestone tracking.', 
    path: '/manpower' 
  },
];

const FLAG_CODES = ['us', 'gb', 'ca', 'au', 'nz', 'de', 'ie', 'ae', 'fr', 'nl'];
const FLAG_NAMES = ['USA', 'UK', 'Canada', 'Australia', 'New Zealand', 'Germany', 'Ireland', 'UAE', 'France', 'Netherlands'];



export default function PublicHome() {
  useVisibilityTracking('/');
  const { enabled, isEnabled } = useDivisions();
  const [, setLocation] = useLocation();
  
  const marqueeRef = useRef<HTMLDivElement>(null);
  const gridRef = useRef<HTMLElement>(null);
  const mobileScrollerRef = useRef<HTMLDivElement>(null);
  const [mobileIdx, setMobileIdx] = useState(0);

  useEffect(() => {
    let mobileCleanup: (() => void) | null = null;
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
    });

    // Mobile 3D parallax + index tracking for hints (outside gsap context to avoid TDZ)
    const scroller = mobileScrollerRef.current;
    if (scroller && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      const cards = scroller.querySelectorAll<HTMLElement>('.svc-card-mobile');
      const update3D = () => {
        const rect = scroller.getBoundingClientRect();
        const center = rect.left + rect.width / 2;
        let closestIdx = 0;
        let minDist = Infinity;
        cards.forEach((card, idx) => {
          const cRect = card.getBoundingClientRect();
          const cCenter = cRect.left + cRect.width / 2;
          const dist = (cCenter - center) / rect.width;
          const rotateY = dist * -18;
          const translateZ = -Math.abs(dist) * 40;
          const scale = 1 - Math.abs(dist) * 0.08;
          card.style.transform = `perspective(1000px) rotateY(${rotateY}deg) translateZ(${translateZ}px) scale(${scale})`;
          card.style.opacity = String(Math.max(0.85, 1 - Math.abs(dist) * 0.15));
          const abs = Math.abs(cCenter - center);
          if (abs < minDist) { minDist = abs; closestIdx = idx; }
        });
        setMobileIdx(closestIdx);
      };
      let ticking = false;
      const onScroll = () => {
        if (!ticking) {
          requestAnimationFrame(() => { update3D(); ticking = false; });
          ticking = true;
        }
      };
      scroller.addEventListener('scroll', onScroll, { passive: true });
      window.addEventListener('resize', update3D);
      update3D();
      mobileCleanup = () => {
        scroller.removeEventListener('scroll', onScroll);
        window.removeEventListener('resize', update3D);
      };
    }
    return () => {
      mobileCleanup?.();
      ctx.revert();
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#fcfbf9] font-sans text-brand-navy selection:bg-brand-gold selection:text-brand-navy">
      <SEOHead
        title="Opus Overseas | Study Abroad, Overseas Jobs & Travel"
        description="Opus Overseas is a premier global consultancy for university admissions in UK, USA, Germany, Canada, worldwide visa processing, MEA apostille attestation, world tour packages & Gulf manpower."
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
              <span className="text-sm font-bold uppercase tracking-[0.18em] text-brand-navy/65">
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
          <span className="font-mono text-sm font-bold uppercase tracking-[0.2em] text-brand-gold">
            Authorized Desks
          </span>
          <h2 className="font-display fluid-h2 font-extrabold text-brand-navy tracking-tight">
            Our Specialized Global Mobility Divisions
          </h2>
          <p className="mx-auto max-w-md text-xs sm:text-sm text-brand-textLight">
            Dedicated consulting units operating under direct sovereign licensing and institutional quotas.
          </p>
        </div>

        {/* Mobile — horizontal swipe with 3D parallax (md:hidden) */}
        <div
          ref={mobileScrollerRef}
          className="md:hidden -mx-5 px-5 flex gap-4 overflow-x-auto snap-x snap-mandatory pb-6 pt-2 scroll-smooth"
          style={{ WebkitOverflowScrolling: 'touch', perspective: '1200px', scrollbarWidth: 'none' } as any}
        >
          {SERVICES.map((svc) => {
            const disabled = enabled !== null && !isEnabled(SLUG_TO_DIVISION_KEY[svc.id]);
            return (
              <div
                key={`m-${svc.id}`}
                onClick={() => !disabled && setLocation(svc.path)}
                className={`svc-card-mobile shrink-0 snap-center min-w-[82vw] max-w-[320px] group rounded-3xl border border-brand-navy/10 bg-white p-6 shadow-xs flex flex-col justify-between will-change-transform ${
                  disabled ? 'pointer-events-none opacity-60' : 'cursor-pointer active:scale-[0.98]'
                }`}
                style={{ transformStyle: 'preserve-3d' } as any}
                aria-disabled={disabled || undefined}
              >
                <div>
                  <Img src={imageFor(`hero-${svc.id}`).src} prompt={imageFor(`hero-${svc.id}`).prompt} label={svc.title} className="mb-4.5 rounded-2xl overflow-hidden shadow-2xs" />
                  <div className="flex items-center justify-between gap-2 mb-2">
                    <span className="text-[13px] font-bold font-mono text-emerald-800 bg-emerald-50 border border-emerald-200/60 px-2.5 py-0.5 rounded-full">{svc.telemetry}</span>
                    {disabled && <span className="inline-flex items-center gap-1 rounded-full border border-brand-gold/40 bg-brand-gold/10 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-brand-gold">Coming soon</span>}
                  </div>
                  <h3 className="font-display text-base font-bold text-brand-navy mb-1.5">{svc.title}</h3>
                  <p className="text-xs leading-relaxed text-brand-textLight">{svc.desc}</p>
                </div>
                <div className="mt-5 pt-3.5 border-t border-brand-navy/5 flex items-center justify-between text-xs">
                  <span className="font-bold uppercase tracking-wider text-brand-gold flex items-center gap-1 text-sm">{disabled ? 'Coming Soon' : 'Explore Division'} →</span>
                  <span className="text-brand-navy/30 font-mono text-sm">0{SERVICES.indexOf(svc) + 1}</span>
                </div>
              </div>
            );
          })}
          <div className="svc-card-mobile shrink-0 snap-center min-w-[82vw] max-w-[320px] rounded-3xl bg-[#061e38] text-white p-7 flex flex-col justify-between shadow-md will-change-transform" style={{ transformStyle: 'preserve-3d' } as any}>
            <div>
              <span className="font-mono text-[13px] uppercase font-bold text-brand-gold bg-brand-gold/15 px-2.5 py-0.5 rounded-full inline-block mb-3">● Unified Client Portal</span>
              <h3 className="font-display text-lg font-bold text-white mb-2">Create Your Opus OS Account</h3>
              <p className="text-xs leading-relaxed text-white/70">Unlock instant real-time tracking, direct counselor messaging, secure vaults, and personalized shortlists.</p>
            </div>
            <button onClick={() => setLocation('/login')} className="mt-6 cursor-pointer self-start rounded-full bg-brand-gold px-6 py-3 text-xs font-extrabold uppercase tracking-wider text-brand-navy hover:bg-brand-gold-hover hover:text-white transition-all shadow-sm">Sign Up on Opus OS →</button>
          </div>
        </div>

        {/* Mobile swipe hints — only < md */}
        <div className="md:hidden mt-4 flex items-center justify-between gap-3">
          <span className="inline-flex items-center gap-2 text-sm font-bold uppercase tracking-[0.14em] text-brand-navy/45">
            <span className="hidden sm:inline w-6 h-0.5 bg-brand-gold/30 rounded-full" />
            <span className="inline-flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-brand-gold animate-pulse" />
              Swipe to explore
            </span>
            <span className="animate-[bounce_1.2s_infinite]">→</span>
          </span>
          <div className="flex items-center gap-2">
            <button
              aria-label="Previous card"
              onClick={() => mobileScrollerRef.current?.scrollBy({ left: -320, behavior: 'smooth' })}
              className="h-8 w-8 grid place-items-center rounded-full border border-brand-navy/10 bg-white text-brand-navy/60 hover:text-brand-navy hover:border-brand-gold/40 shadow-xs active:scale-95 transition"
            >
              ‹
            </button>
            <div className="flex items-center gap-1.5 px-2">
              {[...Array(SERVICES.length + 1)].map((_, i) => (
                <button
                  key={i}
                  aria-label={`Go to card ${i + 1}`}
                  onClick={() => {
                    const el = mobileScrollerRef.current?.querySelectorAll('.svc-card-mobile')[i] as HTMLElement | undefined;
                    el?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
                  }}
                  className={`h-1.5 rounded-full transition-all ${i === mobileIdx ? 'w-5 bg-brand-gold' : 'w-1.5 bg-brand-navy/15 hover:bg-brand-navy/25'}`}
                />
              ))}
            </div>
            <button
              aria-label="Next card"
              onClick={() => mobileScrollerRef.current?.scrollBy({ left: 320, behavior: 'smooth' })}
              className="h-8 w-8 grid place-items-center rounded-full border border-brand-navy/10 bg-white text-brand-navy/60 hover:text-brand-navy hover:border-brand-gold/40 shadow-xs active:scale-95 transition"
            >
              ›
            </button>
          </div>
        </div>
        <div className="md:hidden mt-3 h-1 w-full rounded-full bg-brand-navy/5 overflow-hidden">
          <div className="h-full bg-brand-gold rounded-full transition-all duration-500" style={{ width: `${((mobileIdx + 1) / (SERVICES.length + 1)) * 100}%` }} />
        </div>

        {/* Desktop — grid (unchanged, smoother) */}
        <div className="hidden md:grid md:grid-cols-2 lg:grid-cols-3 gap-6">
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
                    <span className="text-[13px] font-bold font-mono text-emerald-800 bg-emerald-50 border border-emerald-200/60 px-2.5 py-0.5 rounded-full">
                      {svc.telemetry}
                    </span>
                    {disabled && (
                      <span className="inline-flex items-center gap-1 rounded-full border border-brand-gold/40 bg-brand-gold/10 px-2 py-0.5 text-xs font-bold uppercase tracking-wider text-brand-gold">
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
                  <span className="font-bold uppercase tracking-wider text-brand-gold group-hover:text-brand-navy transition-colors flex items-center gap-1 text-sm">
                    {disabled ? 'Coming Soon' : 'Explore Division'} →
                  </span>
                  <span className="text-brand-navy/30 group-hover:text-brand-gold font-mono text-sm">
                    0{SERVICES.indexOf(svc) + 1}
                  </span>
                </div>
              </div>
            );
          })}

          {/* Direct Advisory CTA Card */}
          <div className="svc-card rounded-3xl bg-[#061e38] text-white p-7 flex flex-col justify-between shadow-md">
            <div>
              <span className="font-mono text-[13px] uppercase font-bold text-brand-gold bg-brand-gold/15 px-2.5 py-0.5 rounded-full inline-block mb-3">
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

      {/* 5. PROVEN CASE SPOTLIGHT (Replaced 6 generic review boxes with 1 tabbed spotlight) */}
      <RealCaseVault />

      {/* 6. WHY CHOOSE OPUS OVERSEAS — Trust Strip (moved right before FAQs) */}
      <InstitutionalCovenants />



      {/* 8. GEO & AEO KNOWLEDGE HUB + FREQUENTLY ASKED QUESTIONS */}
      <GeoFaqSection
        badge="General Inquiries & Protocol"
        title="Frequently Asked Questions"
        subtitle="Clear, verified answers regarding our overseas education, visa processing, attestation, and manpower recruitment protocols."
        summaryTitle="Opus Overseas — Verified Global Consultancy"
        summaryText="Opus Overseas is a premier global consultancy headquartered in Nizamabad, Telangana, India. We operate specialized divisions in Study Abroad, Worldwide Visa Services, MEA Document Attestation, Tours & Travels, and Gulf Manpower Recruitment with 100% compliant tracking and zero hidden charges."
        faqs={HOME_FAQS}
      />

      <Footer />
    </div>
  );
}
