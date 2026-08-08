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

gsap.registerPlugin(ScrollTrigger);

/*
 * HERO — 5-slide live-artifact carousel (plan §24.1.1)
 * Each slide mounts its live widget ONLY while active (lazy-mount): exactly one
 * backend artifact query runs per 6s auto-advance — free-tier CPU safe.
 */

const SLIDE_META = [
  { key: 'study', goTo: '/lead-form', cta: 'Check My Eligibility', ghost: 'Explore Programs', ghostTo: '/study-abroad' },
  { key: 'visa', goTo: '/visa-services', cta: 'Start My Visa', ghost: 'Track My Case', ghostTo: '/portal' },
  { key: 'umrah', goTo: '/umrah-travel', cta: 'View Umrah Packages', ghost: null, ghostTo: '' },
  { key: 'attestation', goTo: '/attestation', cta: 'Attest My Document', ghost: null, ghostTo: '' },
  { key: 'manpower', goTo: '/recruitment', cta: 'Browse Live Jobs', ghost: null, ghostTo: '' },
];

export default function HeroCarousel() {
  const [, setLocation] = useLocation();
  const stageRef = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduced = prefersReducedMotion();

  const advance = useCallback((dir: number) => {
    setActive((prev) => (prev + dir + SLIDE_META.length) % SLIDE_META.length);
  }, []);

  useEffect(() => {
    if (reduced || paused) return;
    const t = setInterval(() => advance(1), 6000);
    return () => clearInterval(t);
  }, [reduced, paused, advance]);

  // Animate active slide content (headline words, sub, artifact) on change.
  useEffect(() => {
    if (reduced) return;
    const scoped = stageRef.current?.querySelector(`.slide-panel[data-idx="${active}"]`);
    if (!scoped) return;
    const ctx = gsap.context(() => {
      const words = scoped.querySelectorAll('.hero-headline .hw-i');
      if (words.length) {
        gsap.fromTo(words, { y: 40, opacity: 0, rotateX: 25 }, { y: 0, opacity: 1, rotateX: 0, duration: 0.9, stagger: 0.035, delay: 0.1, ease: 'power3.out', transformOrigin: '50% 100%' });
      }
      const sub = scoped.querySelector('.hero-sub');
      if (sub) gsap.fromTo(sub, { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, delay: 0.3, ease: 'power3.out' });
      const cta = scoped.querySelector('.hero-ctas');
      if (cta) gsap.fromTo(cta, { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, delay: 0.42, ease: 'power3.out' });
    }, scoped);
    return () => ctx.revert();
  }, [active, reduced]);

  // Orb parallax on scroll (visual only)
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
      className="relative flex min-h-[100dvh] items-center overflow-hidden bg-brand-navy text-white"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="hero-orb -left-16 top-1/4 h-96 w-96 bg-brand-blue/30 blur-3xl" />
        <div className="hero-orb -right-20 top-10 h-[28rem] w-[28rem] bg-brand-gold/20 blur-3xl" />
        <div className="hero-orb bottom-0 left-1/3 h-72 w-72 bg-brand-navy-800/40 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto w-full max-w-7xl px-5 pb-20 pt-32 md:px-8 lg:pb-28">
        <div className="grid items-center gap-12 lg:grid-cols-2">
          {/* Copy column — single DOM with data-idx conditioned (avoids remount flicker) */}
          <div className="relative min-h-[380px] md:min-h-[340px]">
            {SLIDE_META.map((m, i) => (
              <div
                key={m.key}
                data-idx={i}
                className={`slide-panel absolute inset-0 ${i === active ? 'pointer-events-auto opacity-100' : 'pointer-events-none opacity-0'} transition-opacity duration-500`}
                aria-hidden={i !== active}
              >
                <SlideCopy i={i} go={go} meta={m} />
              </div>
            ))}
          </div>

          {/* Right — live artifact stage */}
          <div className="relative min-h-[340px]">
            {SLIDE_META.map((m, i) => (
              <div
                key={`artifact-${m.key}`}
                className={`absolute inset-0 transition-all duration-700 ${i === active ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
                aria-hidden={i !== active}
              >
                {i === active && <Artifact key={m.key} i={i} />}
              </div>
            ))}
          </div>
        </div>

        {/* Controls */}
        <div className="mt-12 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {SLIDE_META.map((m, i) => (
              <button key={m.key} aria-label={`Slide ${i + 1}`} onClick={() => setActive(i)} className="cursor-pointer py-2">
                <span className={`block h-1.5 rounded-full transition-all duration-300 ${i === active ? 'w-10 bg-brand-gold' : 'w-4 bg-white/30 hover:bg-white/60'}`} />
              </button>
            ))}
          </div>
          <div className="flex gap-2">
            <ArrowBtn dir={-1} onClick={() => advance(-1)} aria="Previous slide" />
            <ArrowBtn dir={1} onClick={() => advance(1)} aria="Next slide" />
          </div>
        </div>
      </div>
    </section>
  );
}

function SlideCopy({ i, go, meta }: { i: number; go: (p: string) => void; meta: (typeof SLIDE_META)[number] }) {
  switch (i) {
    case 0:
      return (
        <Slides>
          <span className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-bold uppercase tracking-[0.2em] ${CHIP_CLASSES.gold}`}>Study Abroad · 50+ Countries</span>
          <h1 className="hero-headline mt-5 font-display text-4xl font-extrabold leading-[1.06] tracking-tight md:text-[3.4rem]">
            Your Future is <span className="text-brand-gold block">50+ Countries</span> Away
          </h1>
          <p className="hero-sub mt-5 max-w-md text-sm leading-relaxed text-white/70 md:text-base">
            Premium admissions counseling, scholarships and SOP support — from Nizamabad to the world's best campuses.
          </p>
          <div className="hero-ctas mt-8 flex flex-wrap gap-3">
            <CtaBtn label="Check My Eligibility" onClick={() => go(meta.goTo)} />
            {meta.ghost && <GhostBtn label={meta.ghost} onClick={() => go(meta.ghostTo)} />}
          </div>
        </Slides>
      );
    case 1:
      return (
        <Slides>
          <span className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-bold uppercase tracking-[0.2em] ${CHIP_CLASSES.emerald}`}>
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> Visas, End-to-End
          </span>
          <h1 className="hero-headline mt-5 font-display text-4xl font-extrabold leading-[1.06] tracking-tight md:text-[3rem]">
            Visas, Handled<br />End-to-End
          </h1>
          <p className="hero-sub mt-6 max-w-md text-sm leading-relaxed text-white/70 md:text-base">
            Student, work and family visas with a 92% documented success rate — track your case live, courier to doorstep.
          </p>
          <div className="hero-ctas mt-8 flex flex-wrap gap-3">
            <CtaBtn label="Start My Visa" onClick={() => go(meta.goTo)} />
            <GhostBtn label="Track My Case" onClick={() => go('/portal')} />
          </div>
        </Slides>
      );
    case 2:
      return (
        <Slides>
          <span className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-bold uppercase tracking-[0.2em] ${CHIP_CLASSES.emerald}`}>Umrah & Group Departures</span>
          <h1 className="hero-headline mt-5 font-display text-4xl font-extrabold leading-[1.08] tracking-tight md:text-[3rem]">
            Your Spiritual Journey,<br />Made Effortless
          </h1>
          <p className="hero-sub mt-6 max-w-md text-sm leading-relaxed text-white/70 md:text-base">
            Complete Umrah packages, group departures and live seat availability — from Nizamabad to the Holy Cities.
          </p>
          <div className="hero-ctas mt-8 flex flex-wrap gap-3">
            <CtaBtn label={meta.cta} onClick={() => go(meta.goTo)} />
          </div>
        </Slides>
      );
    case 3:
      return (
        <Slides>
          <span className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-bold uppercase tracking-[0.2em] ${CHIP_CLASSES.sky}`}>Attestation Chains</span>
          <h1 className="hero-headline mt-5 font-display text-4xl font-extrabold leading-[1.08] tracking-tight md:text-[3rem]">
            Globally Recognized<br />Documents
          </h1>
          <p className="hero-sub mt-6 max-w-md text-sm leading-relaxed text-white/70 md:text-base">
            MEA, Embassy legalization and Apostille chains with live fees and timelines — your papers, ready for the world.
          </p>
          <div className="hero-ctas mt-8 flex flex-wrap gap-3">
            <CtaBtn label="Attest My Document" onClick={() => go(meta.goTo)} />
          </div>
        </Slides>
      );
    default:
      return (
        <Slides>
          <span className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-bold uppercase tracking-[0.2em] ${CHIP_CLASSES.rose}`}>Live Global Jobs</span>
          <h1 className="hero-headline mt-5 font-display text-4xl font-extrabold leading-[1.08] tracking-tight md:text-[3rem]">
            Global Careers<br />Start Here
          </h1>
          <p className="hero-sub mt-6 max-w-md text-sm leading-relaxed text-white/70 md:text-base">
            Saudi, UAE, Qatar, Europe — vetted employers, real salaries, zero fake listings. Your next role is one click away.
          </p>
          <div className="hero-ctas mt-8 flex flex-wrap gap-3">
            <CtaBtn label="Browse Live Jobs" onClick={() => go(meta.goTo)} />
          </div>
        </Slides>
      );
  }
}

// ======= helpers =======
function Slides({ children }: { children: React.ReactNode }) {
  return <div>{children}</div>;
}
function CtaBtn({ onClick, label }: { onClick: () => void; label?: string }) {
  return (
    <button
      onClick={onClick}
      className="inline-flex items-center gap-2 rounded-full bg-brand-gold px-6 py-3 text-xs font-bold uppercase tracking-wide text-brand-navy shadow-[0_8px_30px_rgba(215,160,25,0.35)] transition-all hover:bg-brand-gold-hover hover:text-white active:scale-[0.98]"
    >
      {label}
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-navy/10 text-[10px]">↗</span>
    </button>
  );
}
function GhostBtn({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="inline-flex items-center gap-2 rounded-full border border-white/25 px-6 py-3 text-xs font-semibold text-white/80 transition-all hover:border-brand-gold hover:text-brand-gold">
      {label}
    </button>
  );
}
const CHIP_CLASSES: Record<string, string> = {
  gold: 'border-brand-gold/40 bg-brand-gold/10 text-brand-gold',
  emerald: 'border-emerald-400/40 bg-emerald-500/10 text-emerald-300',
  sky: 'border-sky-400/40 bg-sky-500/10 text-sky-300',
  rose: 'border-rose-400/40 bg-rose-500/10 text-rose-300',
};

function Artifact({ i }: { i: number }) {
  switch (i) {
    case 0: return <EligibilityChecker />;
    case 1: return <VisaStatusWidget />;
    case 2: return <DepartureCountdown />;
    case 3: return <AttestationChain />;
    default: return <JobTicker />;
  }
}

function ArrowBtn({ dir, onClick, aria }: { dir: 1 | -1; onClick: () => void; aria: string }) {
  return (
    <button
      aria-label={aria}
      onClick={onClick}
      className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-full border border-white/20 text-white/70 transition-all hover:border-brand-gold hover:text-brand-gold"
    >
      {dir === -1 ? '←' : '→'}
    </button>
  );
}