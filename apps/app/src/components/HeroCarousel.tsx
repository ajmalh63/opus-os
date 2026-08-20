import { useCallback, useEffect, useRef, useState } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useLocation } from 'wouter';
import { prefersReducedMotion, parallaxY } from '../lib/motion';
import EligibilityChecker from './artifacts/EligibilityChecker';
import VisaStatusWidget from './artifacts/VisaStatusWidget';
import DepartureCountdown from './artifacts/DepartureCountdown';
import AttestationChain from './artifacts/AttestationChain';
import JobTicker from './artifacts/JobTicker';
import LiveWallpaper from './LiveWallpaper';
import DomainBackdrop from './DomainBackdrop';

gsap.registerPlugin(ScrollTrigger);

const SLIDE_META = [
  { key: 'study', icon: '🎓', label: 'Study Abroad', goTo: '/study-abroad', cta: 'Find Universities & Waivers', ghost: 'Explore 1,500+ Campuses', ghostTo: '/study-abroad' },
  { key: 'visa', icon: '✈️', label: 'Global Visas', goTo: '/visa-services', cta: 'Calculate Visa Fees', ghost: 'Track Active Case', ghostTo: '/visa-services#tracker' },
  { key: 'umrah', icon: '🕋', label: 'Umrah Travel', goTo: '/umrah-travel', cta: 'Explore Umrah Packages', ghost: 'View Departure Calendar', ghostTo: '/umrah-travel#calendar' },
  { key: 'attestation', icon: '📜', label: 'Attestation', goTo: '/attestation', cta: 'Calculate Stamping Quote', ghost: 'View Consular Matrix', ghostTo: '/attestation#matrix' },
  { key: 'manpower', icon: '💼', label: 'Global Careers', goTo: '/recruitment', cta: 'Browse Verified Openings', ghost: 'View Employer Demands', ghostTo: '/recruitment#jobs' },
] as const;


export default function HeroCarousel() {
  const [, setLocation] = useLocation();
  const stageRef = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const reduced = prefersReducedMotion();
  const visibleMeta = SLIDE_META;

  useEffect(() => {
    if (active >= visibleMeta.length) setActive(0);
  }, [visibleMeta.length, active]);

  const advance = useCallback((dir: number) => {
    setActive((prev) => (prev + dir + visibleMeta.length) % visibleMeta.length);
    setProgress(0);
  }, [visibleMeta.length]);

  // Smooth slide timer with progress bar
  useEffect(() => {
    if (reduced || paused) return;
    const interval = 50; // ms
    const totalTime = 6000; // ms
    const step = (interval / totalTime) * 100;

    const timer = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          advance(1);
          return 0;
        }
        return prev + step;
      });
    }, interval);

    return () => clearInterval(timer);
  }, [reduced, paused, advance]);

  // Animate active slide copy
  useEffect(() => {
    if (reduced) return;
    const scoped = stageRef.current?.querySelector(`.slide-panel[data-idx="${active}"]`);
    if (!scoped) return;
    const ctx = gsap.context(() => {
      const heading = scoped.querySelector('.hero-headline');
      if (heading) gsap.fromTo(heading, { y: 24, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, ease: 'power3.out' });
      const sub = scoped.querySelector('.hero-sub');
      if (sub) gsap.fromTo(sub, { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, delay: 0.15, ease: 'power3.out' });
      const ctas = scoped.querySelector('.hero-ctas');
      if (ctas) gsap.fromTo(ctas, { y: 16, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5, delay: 0.25, ease: 'power3.out' });
    }, scoped);
    return () => ctx.revert();
  }, [active, reduced]);

  // Parallax on orbs
  useEffect(() => {
    const ctx = gsap.context(() => {
      gsap.utils.toArray<HTMLElement>('.hero-orb').forEach((orb) => parallaxY(orb, { amount: 14, scrub: 1 }));
    }, stageRef);
    return () => ctx.revert();
  }, []);

  const go = (path: string) => setLocation(path);

  return (
    <section
      ref={stageRef}
      className="relative flex min-h-[100dvh] items-center overflow-hidden bg-[#061e38] text-white pt-24 pb-16 sm:pt-28 sm:pb-20"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      {/* Background Ambience */}
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <LiveWallpaper />
        <DomainBackdrop theme="global" />
        <div className="hero-orb -left-16 top-1/4 h-96 w-96 bg-brand-blue/35 blur-3xl opacity-70" />
        <div className="hero-orb -right-20 top-10 h-[30rem] w-[30rem] bg-brand-gold/25 blur-3xl opacity-60" />
        <div className="hero-orb bottom-0 left-1/3 h-80 w-80 bg-brand-navy-800/50 blur-3xl opacity-80" />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-7xl px-5 sm:px-6 md:px-8">
        {/* 2-COLUMN MAIN HERO STAGE */}
        <div className="grid items-center gap-10 lg:grid-cols-12 lg:gap-14">
          {/* Left: Copy column */}
          <div className="lg:col-span-6 flex flex-col justify-center min-h-[380px] sm:min-h-[420px]">
            {visibleMeta.map((m, i) => (
              <div
                key={m.key}
                data-idx={i}
                className={`slide-panel ${i === active ? 'block opacity-100' : 'hidden opacity-0'} transition-opacity duration-400`}
                aria-hidden={i !== active}
              >
                <SlideCopy go={go} meta={m} />
              </div>
            ))}
          </div>

          {/* Right: Live Interactive Artifact stage */}
          <div className="lg:col-span-6 flex flex-col justify-center">
            {visibleMeta.map((m, i) => (
              <div
                key={`artifact-${m.key}`}
                className={`${i === active ? 'block opacity-100 scale-100' : 'hidden opacity-0 scale-95'} transition-all duration-400`}
                aria-hidden={i !== active}
              >
                {i === active && <Artifact metaKey={m.key} />}
              </div>
            ))}
          </div>
        </div>

        {/* BOTTOM FOOTER CONTROL & TRUST BAR */}
        <div className="mt-12 sm:mt-16 flex flex-col sm:flex-row items-center justify-between gap-4 border-t border-white/10 pt-6 text-xs text-white/70">
          <div className="flex items-center gap-3 sm:gap-6 flex-wrap justify-center sm:justify-start">
            <span className="inline-flex items-center gap-2 text-white/85 font-semibold">
              <span className="h-2 w-2 rounded-full bg-emerald-400" />
              🇬🇧 British Council Certified #115050
            </span>
            <span className="hidden sm:inline text-white/30">·</span>
            <span className="inline-flex items-center gap-2 text-white/85 font-semibold">
              <span className="h-2 w-2 rounded-full bg-brand-gold" />
              🏛️ Govt. MEA Sourcing Network
            </span>
            <span className="hidden sm:inline text-white/30">·</span>
            <span className="inline-flex items-center gap-2 text-white/85 font-semibold">
              <span className="h-2 w-2 rounded-full bg-sky-400" />
              🔒 Pan-India Insured Logistics
            </span>
          </div>

          {/* Slide Navigation and Indicators */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-1.5">
              {visibleMeta.map((m, i) => {
                const isSelected = i === active;
                return (
                  <button
                    key={m.key}
                    type="button"
                    onClick={() => { setActive(i); setProgress(0); }}
                    aria-label={`Go to slide ${i + 1}: ${m.label}`}
                    className={`h-2 rounded-full transition-all cursor-pointer overflow-hidden ${
                      isSelected
                        ? 'w-10 bg-white/20 border border-brand-gold/30 shadow-[0_0_12px_rgba(215,160,25,0.4)]'
                        : 'w-2 bg-white/30 hover:bg-white/60'
                    }`}
                  >
                    {isSelected && (
                      <div 
                        className="h-full bg-brand-gold rounded-full transition-all duration-75"
                        style={{ width: `${progress}%` }}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            <span className="font-mono text-xs text-white/80 font-bold tracking-widest bg-white/10 px-3 py-1 rounded-full border border-white/10">
              {String(active + 1).padStart(2, '0')} / {String(visibleMeta.length).padStart(2, '0')}
            </span>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => advance(-1)}
                aria-label="Previous slide"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white hover:bg-brand-gold hover:text-brand-navy hover:border-brand-gold transition-all cursor-pointer tactile-btn shadow-md"
              >
                ←
              </button>
              <button
                type="button"
                onClick={() => advance(1)}
                aria-label="Next slide"
                className="flex h-9 w-9 items-center justify-center rounded-full border border-white/20 bg-white/10 text-white hover:bg-brand-gold hover:text-brand-navy hover:border-brand-gold transition-all cursor-pointer tactile-btn shadow-md"
              >
                →
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function SlideCopy({ go, meta }: { go: (p: string) => void; meta: (typeof SLIDE_META)[number] }) {
  switch (meta.key) {
    case 'study':
      return (
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-brand-gold/40 bg-brand-gold/10 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-brand-gold shimmer-badge">
            🇬🇧 British Council Certified (ID #115050) · 100% Free Mentorship
          </span>
          <h1 className="hero-headline mt-5 font-display text-3xl sm:text-4xl lg:text-5xl font-black leading-[1.18] tracking-tight text-white">
            Your Gateway to <span className="text-brand-gold">1,500+ Global</span> Campuses
          </h1>
          <p className="hero-sub mt-4 max-w-xl text-sm sm:text-base leading-relaxed text-white/80">
            Course shortlisting, scholarship guidance, and personalized SOP mentoring across UK, USA, Europe, Canada & Australia. 100% free career counselling for students.
          </p>
          <div className="hero-ctas mt-8 flex flex-wrap items-center gap-3.5">
            <CtaBtn label={meta.cta} onClick={() => go(meta.goTo)} />
            {meta.ghost && <GhostBtn label={meta.ghost} onClick={() => go(meta.ghostTo)} />}
          </div>
        </div>
      );
    case 'visa':
      return (
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-500/10 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-emerald-300 shimmer-badge">
            <span className="live-pulse-dot text-emerald-400 !h-1.5 !w-1.5" /> ✈️ Express Consular Fast-Track · 99.4% Precision
          </span>
          <h1 className="hero-headline mt-5 font-display text-3xl sm:text-4xl lg:text-5xl font-black leading-[1.18] tracking-tight text-white">
            Global Visas, <span className="text-brand-gold">Handled End-to-End</span>
          </h1>
          <p className="hero-sub mt-4 max-w-xl text-sm sm:text-base leading-relaxed text-white/80">
            Student, tourist, visit, and business visa dossiers with real-time appointment scheduling, financial vetting, and doorstep courier tracking.
          </p>
          <div className="hero-ctas mt-8 flex flex-wrap items-center gap-3.5">
            <CtaBtn label={meta.cta} onClick={() => go(meta.goTo)} />
            {meta.ghost && <GhostBtn label={meta.ghost} onClick={() => go(meta.ghostTo)} />}
          </div>
        </div>
      );
    case 'umrah':
      return (
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-brand-gold/40 bg-brand-gold/10 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-brand-gold shimmer-badge">
            🕋 Tailored Spiritual Journeys · Hyderabad Departures
          </span>
          <h1 className="hero-headline mt-5 font-display text-3xl sm:text-4xl lg:text-5xl font-black leading-[1.18] tracking-tight text-white">
            Your Sacred Journey, <span className="text-brand-gold">Planned with Care</span>
          </h1>
          <p className="hero-sub mt-4 max-w-xl text-sm sm:text-base leading-relaxed text-white/80">
            Customized family and group Umrah packages with Haram-proximity hotel arrangements, dedicated ground logistics, and scholar-led guidance.
          </p>
          <div className="hero-ctas mt-8 flex flex-wrap items-center gap-3.5">
            <CtaBtn label={meta.cta} onClick={() => go(meta.goTo)} />
            {meta.ghost && <GhostBtn label={meta.ghost} onClick={() => go(meta.ghostTo)} />}
          </div>
        </div>
      );
    case 'attestation':
      return (
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-sky-400/40 bg-sky-500/10 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-sky-300 shimmer-badge">
            📜 State HRD, MEA & Embassy Legalization
          </span>
          <h1 className="hero-headline mt-5 font-display text-3xl sm:text-4xl lg:text-5xl font-black leading-[1.18] tracking-tight text-white">
            Globally Recognized <span className="text-brand-gold">Legal Documents</span>
          </h1>
          <p className="hero-sub mt-4 max-w-xl text-sm sm:text-base leading-relaxed text-white/80">
            Direct MEA Apostille, State HRD/Home authentication, and Gulf Embassy stamp chains with Pan-India insured Blue Dart courier dispatch.
          </p>
          <div className="hero-ctas mt-8 flex flex-wrap items-center gap-3.5">
            <CtaBtn label={meta.cta} onClick={() => go(meta.goTo)} />
            {meta.ghost && <GhostBtn label={meta.ghost} onClick={() => go(meta.ghostTo)} />}
          </div>
        </div>
      );
    case 'manpower':
    default:
      return (
        <div>
          <span className="inline-flex items-center gap-2 rounded-full border border-rose-400/40 bg-rose-500/10 px-4 py-1.5 text-xs font-bold uppercase tracking-wider text-rose-300 shimmer-badge">
            💼 Govt. MEA Sourcing Partner · 100% Verified Demands
          </span>
          <h1 className="hero-headline mt-5 font-display text-3xl sm:text-4xl lg:text-5xl font-black leading-[1.18] tracking-tight text-white">
            Verified Global <span className="text-brand-gold">Career Openings</span>
          </h1>
          <p className="hero-sub mt-4 max-w-xl text-sm sm:text-base leading-relaxed text-white/80">
            Connecting skilled Indian professionals to verified Gulf & European employers through Govt. Registered MEA-Licensed overseas recruitment agencies.
          </p>
          <div className="hero-ctas mt-8 flex flex-wrap items-center gap-3.5">
            <CtaBtn label={meta.cta} onClick={() => go(meta.goTo)} />
            {meta.ghost && <GhostBtn label={meta.ghost} onClick={() => go(meta.ghostTo)} />}
          </div>
        </div>
      );
  }
}

function Artifact({ metaKey }: { metaKey: string }) {
  switch (metaKey) {
    case 'study': return <EligibilityChecker />;
    case 'visa': return <VisaStatusWidget />;
    case 'umrah': return <DepartureCountdown />;
    case 'attestation': return <AttestationChain />;
    case 'manpower': return <JobTicker />;
    default: return null;
  }
}

function CtaBtn({ onClick, label }: { onClick: () => void; label?: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-2.5 rounded-full bg-brand-gold px-7 py-3.5 text-xs font-extrabold uppercase tracking-wider text-brand-navy shadow-[0_10px_30px_rgba(215,160,25,0.38)] transition-all hover:bg-brand-gold-hover hover:text-white cursor-pointer tactile-btn"
    >
      <span>{label}</span>
      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-navy/15 text-[10px] font-bold">↗</span>
    </button>
  );
}

function GhostBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button 
      type="button"
      onClick={onClick} 
      className="inline-flex items-center gap-2 rounded-full border border-white/30 bg-white/5 hover:bg-white/10 px-6 py-3.5 text-xs font-semibold text-white transition-all hover:border-brand-gold hover:text-brand-gold cursor-pointer tactile-btn"
    >
      {label}
    </button>
  );
}
