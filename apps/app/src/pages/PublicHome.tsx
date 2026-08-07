import { useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Logo from '../components/Logo';

gsap.registerPlugin(ScrollTrigger);

const SERVICES = [
  { id: 'study-abroad', title: 'Study Abroad', desc: 'Top-tier university applications, SOP mentoring, scholarship guidance and visa interview prep — in 50+ countries.', path: '/study-abroad' },
  { id: 'visa-services', title: 'Global Visa Services', desc: 'Student, work, tourist, family and business visas with high documented approval rates.', path: '/visa-services' },
  { id: 'umrah-travel', title: 'Umrah & Travel', desc: 'Customized spiritual journeys, group departures, premium stays near Haram and complete visa logistics.', path: '/umrah-travel' },
  { id: 'attestation', title: 'Document Attestation', desc: 'Legal certifications, MEA approvals, HRD authentication and embassy apostille stamp chains.', path: '/attestation' },
  { id: 'recruitment', title: 'Manpower Recruitment', desc: 'Connecting skilled professionals with leading overseas corporations and employers.', path: '/recruitment' },
];

const FLAGS = ['🇺🇸', '🇬🇧', '🇨🇦', '🇦🇺', '🇳🇿', '🇩🇪', '🇮🇪', '🇦🇪', '🇫🇷', '🇳🇱'];
const FLAG_NAMES = ['USA', 'UK', 'Canada', 'Australia', 'New Zealand', 'Germany', 'Ireland', 'UAE', 'France', 'Netherlands'];

const STATS = [
  { value: 15, suffix: '+', label: 'Years of Excellence' },
  { value: 5000, suffix: '+', label: 'Students Guided' },
  { value: 92, suffix: '%', label: 'Visa Success Rate' },
  { value: 30, suffix: '+', label: 'Partner Universities' },
];

function SplitText({ text, className = '' }: { text: string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const chars = Array.from(el.querySelectorAll('.split-char'));
    gsap.fromTo(
      chars,
      { yPercent: 120, opacity: 0 },
      { yPercent: 0, opacity: 1, duration: 0.9, ease: 'power4.out', stagger: 0.04, delay: 0.2 }
    );
  }, []);
  return (
    <span ref={ref} className={className} aria-label={text}>
      {text.split('').map((c, i) => (
        <span key={i} className="split-char inline-block" style={{ willChange: 'transform' }} aria-hidden="true">
          {c === ' ' ? '\u00A0' : c}
        </span>
      ))}
    </span>
  );
}

export default function PublicHome() {
  const [, setLocation] = useLocation();
  const heroRef = useRef<HTMLElement>(null);
  const marqueeRef = useRef<HTMLDivElement>(null);
  const statsRef = useRef<HTMLElement>(null);
  const gridRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const ctx = gsap.context(() => {
      // Hero orbs parallax
      gsap.to('.hero-orb-1', { yPercent: 25, ease: 'none', scrollTrigger: { trigger: heroRef.current, start: 'top top', end: 'bottom top', scrub: true } });
      gsap.to('.hero-orb-2', { yPercent: -20, ease: 'none', scrollTrigger: { trigger: heroRef.current, start: 'top top', end: 'bottom top', scrub: true } });

      // Hero fade-up elements
      gsap.fromTo('.hero-fade', { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 1, ease: 'power3.out', stagger: 0.15, delay: 0.6 });

      // Flag marquee: seamless horizontal loop, left-to-right
      const tween = gsap.to(marqueeRef.current, {
        xPercent: -50,
        duration: 40,
        ease: 'none',
        repeat: -1,
      });
      // Speed up slightly on fast scroll (plan: scroll-linked)
      ScrollTrigger.create({
        trigger: document.body,
        start: 'top top',
        end: 'max',
        onUpdate: (self) => {
          const speed = 1 + self.getVelocity() / 2000;
          tween.timeScale(Math.max(0.5, Math.min(3, speed)));
        },
      });

      // Stats count-up on entry
      ScrollTrigger.create({
        trigger: statsRef.current,
        start: 'top 85%',
        once: true,
        onEnter: () => {
          gsap.fromTo('.stat-num', { innerText: 0 }, {
            innerText: (i: number) => STATS[i].value,
            snap: { innerText: 1 },
            duration: 1.6,
            ease: 'power2.out',
            stagger: 0.15,
          });
          gsap.fromTo('.stat-item', { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.9, stagger: 0.12 });
        },
      });

      // Services grid stagger reveal
      gsap.fromTo('.svc-card', { y: 60, opacity: 0 }, {
        y: 0, opacity: 1, duration: 0.9, ease: 'power3.out', stagger: 0.12,
        scrollTrigger: { trigger: gridRef.current, start: 'top 80%', once: true },
      });

      // Section headings fade-up
      gsap.utils.toArray<HTMLElement>('.reveal').forEach((el) => {
        gsap.fromTo(el, { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 1, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 85%', once: true } });
      });
    }, heroRef);
    return () => ctx.revert();
  }, []);

  return (
    <div className="min-h-screen bg-brand-cream text-brand-navy font-sans">
      {/* ================= NAV (white header w/ official logo) ================= */}
      <header className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-brand-navy/10 px-6 py-3">
        <div className="max-w-7xl mx-auto flex items-center justify-between">
          <button onClick={() => setLocation('/')} className="flex items-center">
            <Logo className="h-9 w-auto" />
          </button>
          <nav className="hidden md:flex items-center gap-6 text-sm font-semibold text-brand-navy/80">
            {SERVICES.map((s) => (
              <button key={s.id} onClick={() => setLocation(s.path)} className="hover:text-brand-gold transition-colors">{s.title}</button>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <button onClick={() => setLocation('/portal')} className="hidden sm:block text-xs border border-brand-navy/20 hover:border-brand-gold px-4 py-2 rounded-full text-brand-navy/80 hover:text-brand-gold transition-all">
              Track Journey
            </button>
            <button onClick={() => setLocation('/lead-form')} className="text-xs bg-brand-gold text-brand-navy font-bold px-5 py-2.5 rounded-full shadow-[0_4px_20px_rgba(215,160,25,0.35)] hover:bg-brand-gold-hover hover:text-white transition-all">
              Start Your Process
            </button>
          </div>
        </div>
      </header>

      {/* ================= HERO ================= */}
      <section ref={heroRef} className="relative overflow-hidden bg-brand-navy text-white">
        {/* Gold gradient orbs (parallax) */}
        <div className="hero-orb-1 absolute -top-32 -right-24 w-[480px] h-[480px] rounded-full bg-brand-gold/20 blur-[120px] pointer-events-none" />
        <div className="hero-orb-2 absolute bottom-0 -left-32 w-[420px] h-[420px] rounded-full bg-brand-blue/30 blur-[110px] pointer-events-none" />
        {/* Two-circle logo motif */}
        <svg className="absolute right-[8%] top-1/2 -translate-y-1/2 w-[340px] h-[340px] opacity-[0.07] pointer-events-none hidden lg:block" viewBox="0 0 400 400">
          <circle cx="140" cy="200" r="110" fill="none" stroke="#d7a019" strokeWidth="14" />
          <circle cx="260" cy="200" r="110" fill="none" stroke="#ffffff" strokeWidth="14" />
        </svg>

        <div className="relative max-w-7xl mx-auto px-6 pt-24 pb-20 md:pt-36 md:pb-28 text-center md:text-left">
          <div className="hero-fade inline-block rounded-full bg-brand-gold/10 border border-brand-gold/40 px-4 py-1.5 text-xs font-semibold text-brand-gold uppercase tracking-[0.2em]">
            Nizamabad's Trusted Overseas Agency
          </div>

          <h1 className="mt-8 font-display font-black text-4xl md:text-6xl lg:text-7xl leading-[1.05] tracking-tight max-w-3xl">
            <SplitText text="YOUR FUTURE," className="block text-white" />
            <SplitText text="OUR COMMITMENT." className="block text-brand-gold" />
          </h1>

          <p className="hero-fade mt-6 text-white/70 text-sm md:text-lg max-w-xl leading-relaxed">
            Study abroad · Visa services · Umrah &amp; travel · Attestation · Global careers — five divisions, one trusted partner for every step of your journey.
          </p>

          <div className="hero-fade mt-9 flex flex-col sm:flex-row gap-4 md:justify-start justify-center">
            <button onClick={() => setLocation('/lead-form')} className="bg-brand-gold text-brand-navy font-bold px-8 py-3.5 rounded-full shadow-[0_8px_30px_rgba(215,160,25,0.4)] hover:bg-brand-gold-hover hover:text-white transition-all">
              Start Free Assessment
            </button>
            {/* WhatsApp-first channel (Funnel#4) */}
            <a
              href="https://wa.me/919876543210?text=Hi%20Opus%20Overseas%2C%20I%27d%20like%20to%20know%20more."
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center gap-2 border border-emerald-400/50 bg-emerald-500/10 hover:bg-emerald-500 hover:text-white px-8 py-3.5 rounded-full font-bold text-emerald-300 transition-all"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.25-.46-2.38-1.47-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.5 0 1.47 1.07 2.9 1.22 3.1.15.2 2.1 3.2 5.1 4.49.71.3 1.27.49 1.7.63.72.23 1.37.2 1.88.12.57-.09 1.76-.72 2-1.42.25-.7.25-1.3.18-1.42-.07-.12-.27-.2-.58-.35zM12.05 21.8c-2.69 0-5.2-1.08-7.1-3l-.54.16-2.06.54.6-1.95A9.64 9.64 0 0 1 2.4 12 9.6 9.6 0 0 1 12.05 2.4a9.63 9.63 0 0 1 9.6 9.6c0 5.3-4.3 9.62-9.6 9.62zm0-20.95C5.43.85.1 6.18.1 12.05c0 2.08.57 4.04 1.63 5.77L.1 23.9l6.3-1.63a11.7 11.7 0 0 0 5.65 1.45c6.49 0 11.77-5.29 11.76-11.77A11.72 11.72 0 0 0 12.04.85z"/></svg>
              Chat on WhatsApp
            </a>
            <button onClick={() => document.getElementById('services-grid')?.scrollIntoView({ behavior: 'smooth' })} className="border border-white/30 hover:border-brand-gold px-8 py-3.5 rounded-full font-medium text-white/85 hover:text-brand-gold transition-all">
              Explore Our Services
            </button>
          </div>

          {/* Live artifact strip — eligibility CTA (plan 24.1.1) */}
          <div className="hero-fade mt-12 max-w-2xl mx-auto md:mx-0">
            <div className="brand-card !shadow-none bg-white/5 backdrop-blur border border-white/15 p-4 flex items-center gap-4">
              <div className="w-10 h-10 rounded-full bg-brand-gold/20 text-brand-gold flex items-center justify-center font-display font-bold text-lg shrink-0">AI</div>
              <div className="text-left flex-1">
                <p className="text-white text-sm font-semibold">Check your eligibility in 60 seconds</p>
                <p className="text-white/60 text-xs">AI-powered matching for Study Abroad, Visa and Manpower — free, no commitment.</p>
              </div>
              <button onClick={() => setLocation('/lead-form')} className="text-xs bg-brand-gold/15 border border-brand-gold/50 text-brand-gold px-4 py-2 rounded-full hover:bg-brand-gold hover:text-brand-navy transition-all shrink-0">
                Check Now
              </button>
            </div>
          </div>
        </div>

        {/* ============ TIER-ONE FLAG MARQUEE (plan 24.1.2) ============ */}
        <div className="relative border-t border-white/10 py-5 overflow-hidden bg-brand-navy/80">
          <div ref={marqueeRef} className="flex items-center gap-16 whitespace-nowrap w-max will-change-transform">
            {[...FLAGS, ...FLAGS].map((flag, i) => (
              <div key={i} className="flex items-center gap-3 shrink-0">
                <span className="text-3xl drop-shadow">{flag}</span>
                <span className="text-xs font-semibold uppercase tracking-[0.15em] text-white/70">{FLAG_NAMES[i % FLAG_NAMES.length]}</span>
              </div>
            ))}
          </div>
          {/* Edge dissolve masks */}
          <div className="absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-brand-navy to-transparent pointer-events-none" />
          <div className="absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-brand-navy to-transparent pointer-events-none" />
        </div>
      </section>

      {/* ================= TRUST / STATS ================= */}
      <section ref={statsRef} className="bg-brand-navy py-16 border-y border-brand-navy/20">
        <div className="max-w-6xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-8">
          {STATS.map((s, i) => (
            <div key={i} className="stat-item text-center">
              <div className="stat-num font-display font-black text-4xl md:text-5xl text-brand-gold">
                0{s.suffix}
              </div>
              <p className="mt-2 text-xs uppercase tracking-[0.15em] text-white/60">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* ================= SERVICES GRID ================= */}
      <section id="services-grid" ref={gridRef} className="px-6 py-24 max-w-7xl mx-auto">
        <div className="text-center space-y-4 mb-16 reveal">
          <div className="flex items-center justify-center gap-2">
            <span className="gold-dot" /><span className="gold-dot" /><span className="gold-dot" />
          </div>
          <h2 className="font-display font-bold text-3xl md:text-4xl tracking-tight text-brand-navy">Our Professional Services</h2>
          <p className="text-brand-textLight text-sm max-w-md mx-auto">Five divisions. One standard of excellence — choose where to begin.</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {SERVICES.map((svc, i) => (
            <div
              key={svc.id}
              onClick={() => setLocation(svc.path)}
              className={`svc-card group cursor-pointer brand-card p-7 ${i === 0 ? 'lg:col-span-1' : ''}`}
            >
              <div className="flex items-center gap-3 mb-5">
                <span className="gold-dot !w-2.5 !h-2.5" />
                <h3 className="font-display font-semibold text-lg text-brand-navy group-hover:text-brand-gold-hover transition-colors">
                  {svc.title}
                </h3>
              </div>
              <p className="text-sm text-brand-textLight leading-relaxed">{svc.desc}</p>
              <span className="inline-flex items-center gap-2 mt-6 text-[11px] uppercase font-bold text-brand-gold tracking-[0.15em] group-hover:gap-3 transition-all">
                Learn More →
              </span>
            </div>
          ))}
          {/* CTA tile to fill the grid */}
          <div className="svc-card brand-card p-7 flex flex-col justify-between bg-brand-navy !border-brand-navy">
            <div>
              <div className="flex items-center gap-3 mb-5">
                <span className="w-2.5 h-2.5 rounded-full bg-brand-gold" />
                <h3 className="font-display font-semibold text-lg text-white">Not sure where to start?</h3>
              </div>
              <p className="text-sm text-white/60 leading-relaxed">Book a free consultation — we'll map your goals to the right division in one call.</p>
            </div>
            <button onClick={() => setLocation('/lead-form')} className="mt-6 bg-brand-gold text-brand-navy font-bold text-xs px-5 py-3 rounded-full hover:bg-brand-gold-hover hover:text-white transition-all self-start">
              Book Free Consultation
            </button>
          </div>
        </div>
      </section>

      {/* ================= CTA BAND ================= */}
      <section className="px-6 py-20 bg-brand-navy relative overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full bg-brand-gold/10 blur-[130px] pointer-events-none" />
        <div className="relative max-w-3xl mx-auto text-center reveal">
          <h2 className="font-display font-bold text-3xl md:text-4xl text-white">Ready to Start?</h2>
          <p className="mt-4 text-white/60 text-sm">Your journey to a global future begins with one conversation.</p>
          <button onClick={() => setLocation('/lead-form')} className="mt-8 bg-brand-gold text-brand-navy font-bold px-10 py-4 rounded-full shadow-[0_8px_30px_rgba(215,160,25,0.4)] hover:bg-brand-gold-hover hover:text-white transition-all">
            Book Free Consultation
          </button>
        </div>
      </section>

      {/* ================= FOOTER ================= */}
      <footer className="border-t border-brand-navy/10 bg-white px-6 py-14">
        <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-10 text-xs text-brand-textLight">
          <div className="space-y-4">
            <Logo className="h-8 w-auto" />
            <p className="leading-relaxed">Serving the community of Nizamabad and Telangana with legal, transparent, and top-tier global travel and employment consulting.</p>
          </div>
          <div className="space-y-4">
            <h4 className="font-display font-bold text-brand-navy uppercase tracking-[0.15em]">Nizamabad Main Office</h4>
            <p className="leading-relaxed">1st Floor, Nizamabad Complex, Opposite General Post Office, Hyderabad Road, Nizamabad, Telangana — 503001, India.</p>
            <p>Tel: +91 98765 00001 · info@opusoverseas.com</p>
          </div>
          <div className="space-y-4">
            <h4 className="font-display font-bold text-brand-navy uppercase tracking-[0.15em]">Quick Access</h4>
            <div className="flex flex-col gap-2">
              <button onClick={() => setLocation('/portal')} className="text-left hover:text-brand-gold transition-colors">Public Journey Tracker</button>
              <button onClick={() => setLocation('/partner')} className="text-left hover:text-brand-gold transition-colors">Partner Program</button>
              <button onClick={() => setLocation('/lead-form')} className="text-left hover:text-brand-gold transition-colors">Online Intake Form</button>
            </div>
          </div>
        </div>
        <div className="mt-10 border-t border-brand-navy/10 pt-6 text-center text-[10px] text-brand-gray">
          © {new Date().getFullYear()} Opus Overseas. All rights reserved.
        </div>
      </footer>
    </div>
  );
}
