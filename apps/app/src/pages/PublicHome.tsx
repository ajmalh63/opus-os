import { useVisibilityTracking } from '../lib/visibilityTracking';
import { useEffect, useRef } from 'react';
import { useLocation } from 'wouter';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useQuery } from '@tanstack/react-query';
import Nav from '../components/Nav';
import Footer from '../components/Footer';
import StickyCallBar from '../components/StickyCallBar';
import HeroCarousel from '../components/HeroCarousel';
import Img from '../components/Img';
import ChatWidget from '../components/ChatWidget';
import { track, EVENTS } from '../lib/umami';
import { imageFor } from '../config/images';

const BOOKING_URL = import.meta.env.VITE_BOOKING_URL || 'http://100.87.71.38:3000/opus-owner/consultation'; // Cal.diy — keep tailnet for dev; swap to public domain in prod

gsap.registerPlugin(ScrollTrigger);

const SERVICES = [
  { id: 'study-abroad', title: 'Study Abroad', desc: 'Top-tier university applications, SOP mentoring, scholarship guidance and visa interview prep — in 50+ countries.', path: '/study-abroad' },
  { id: 'visa-services', title: 'Global Visa Services', desc: 'Student, work, travel, family and business visas with high documented approval rates.', path: '/visa-services' },
  { id: 'umrah-travel', title: 'Umrah & Travel', desc: 'Customized spiritual journeys, group departures, premium stays near Haram and complete visa logistics.', path: '/umrah-travel' },
  { id: 'attestation', title: 'Document Attestation', desc: 'Legal certifications, MEA approvals, HRD authentication and embassy apostille stamp chains.', path: '/attestation' },
  { id: 'recruitment', title: 'Manpower Recruitment', desc: 'Connecting skilled professionals with leading overseas corporations and employers.', path: '/recruitment' },
];

const FLAG_CODES = ['us', 'gb', 'ca', 'au', 'nz', 'de', 'ie', 'ae', 'fr', 'nl'];
const FLAG_NAMES = ['USA', 'UK', 'Canada', 'Australia', 'New Zealand', 'Germany', 'Ireland', 'UAE', 'France', 'Netherlands'];

const STATS = [
  { value: 15, suffix: '+', label: 'Years of Excellence' },
  { value: 5000, suffix: '+', label: 'Students Guided' },
  { value: 92, suffix: '%', label: 'Visa Success Rate' },
  { value: 30, suffix: '+', label: 'Partner Universities' },
];

const TESTIMONIALS = [
  { name: 'Rahul Verma', role: 'Masters · Canada', quote: 'My SOP got rewritten into a story the admissions panel actually remembered. Top-15 offer in 9 weeks.' },
  { name: 'Ayesha & Family', role: 'Umrah 2025', quote: 'From documents to boarding, every step was handled. Truly a peaceful, stress-free journey.' },
  { name: 'Naveen Reddy', role: 'Work Visa · UAE', quote: '92% isn’t just marketing — my paperwork went through faster than I believed possible.' },
];

const STEPS = [
  ['Consult', 'We map your goals to the right division, country and timeline in one free call.'],
  ['Document', 'We handle transcripts, attestations, SOPs and every form — you stay in the loop.'],
  ['Submit', 'We file on your behalf, chasing revisions and couriers until "done" really means done.'],
  ['Achieve', 'Your visa, seat, stamp or offer lands — we keep supporting you after arrival.'],
] as const;

export default function PublicHome() {
  useVisibilityTracking('/');
  const [, setLocation] = useLocation();
  // Partner attribution forwarder: ?ref= must survive to the lead form.
  const homeRef = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('ref') || '' : '';
  const goLeadForm = () => { track(EVENTS.bookingCta, { ref: homeRef || undefined }); setLocation(`/lead-form${homeRef ? `?ref=${encodeURIComponent(homeRef)}` : ''}`); };
  const marqueeRef = useRef<HTMLDivElement>(null);
  const statsRef = useRef<HTMLElement>(null);
  const gridRef = useRef<HTMLElement>(null);
  const stepsRef = useRef<HTMLElement>(null);

  const { data: jobsData } = useQuery({
    queryKey: ['publicJobs'],
    queryFn: async () => { const r = await fetch('/api/public/jobs'); if (!r.ok) return { jobs: [] as any[] }; return r.json(); },
    staleTime: 60_000,
  });
  const liveJobs = (jobsData?.jobs ?? []).slice(0, 3) as any[];

  useEffect(() => {
    const ctx = gsap.context(() => {
      const tween = gsap.to(marqueeRef.current, { xPercent: -50, duration: 40, ease: 'none', repeat: -1 });
      ScrollTrigger.create({
        trigger: document.body,
        start: 'top top',
        end: 'max',
        onUpdate: (self) => {
          const speed = 1 + self.getVelocity() / 2000;
          tween.timeScale(Math.max(0.5, Math.min(3, speed)));
        },
      });

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

      gsap.fromTo('.svc-card', { y: 60, opacity: 0 }, {
        y: 0, opacity: 1, duration: 0.9, ease: 'power3.out', stagger: 0.1,
        scrollTrigger: { trigger: gridRef.current, start: 'top 80%', once: true },
      });

      gsap.utils.toArray<HTMLElement>('.reveal').forEach((el) => {
        gsap.fromTo(el, { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 1, ease: 'power3.out', scrollTrigger: { trigger: el, start: 'top 85%', once: true } });
      });
      gsap.utils.toArray<HTMLElement>('.step-card').forEach((el) => {
        gsap.fromTo(el, { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.9, ease: 'power3.out', scrollTrigger: { trigger: stepsRef.current, start: 'top 80%', once: true } });
      });
    });
    return () => ctx.revert();
  }, []);

  return (
    <div className="min-h-screen bg-brand-cream font-sans text-brand-navy">
      <div className="film-grain" aria-hidden="true" />
      <Nav />
      <ChatWidget />
      <HeroCarousel />
      <StickyCallBar />

      {/* TIER-ONE FLAG MARQUEE */}
      <div className="relative overflow-hidden border-y border-brand-navy/10 bg-white py-5">
        <div ref={marqueeRef} className="flex w-max items-center gap-16 whitespace-nowrap will-change-transform">
          {[...FLAG_CODES, ...FLAG_CODES].map((code, i) => (
            <div key={i} className="flex shrink-0 items-center gap-3">
              <img
                src={`/img/flags/${code}.png`}
                alt={FLAG_NAMES[i % FLAG_NAMES.length]}
                className="h-5 w-7.5 rounded object-cover shadow-xs border border-slate-100"
              />
              <span className="text-xs font-semibold uppercase tracking-[0.15em] text-brand-navy/60">{FLAG_NAMES[i % FLAG_NAMES.length]}</span>
            </div>
          ))}
        </div>
        <div className="pointer-events-none absolute inset-y-0 left-0 w-32 bg-gradient-to-r from-white to-transparent" />
        <div className="pointer-events-none absolute inset-y-0 right-0 w-32 bg-gradient-to-l from-white to-transparent" />
      </div>

      {/* TRUST / STATS */}
      <section ref={statsRef} className="bg-brand-navy py-16 md:py-20">
        <div className="mx-auto grid max-w-6xl grid-cols-2 gap-8 px-6 md:grid-cols-4">
          {STATS.map((s, i) => (
            <div key={i} className="stat-item text-center">
              <div className="stat-num font-display text-4xl font-black text-brand-gold md:text-5xl">0{s.suffix}</div>
              <p className="mt-2 text-xs uppercase tracking-[0.15em] text-white/60">{s.label}</p>
            </div>
          ))}
        </div>
      </section>

      {/* SERVICES — asymmetric clay bento */}
      <section id="services-grid" ref={gridRef} className="mx-auto max-w-7xl px-6 py-24">
        <div className="reveal mb-16 space-y-4 text-center">
          <div className="flex items-center justify-center gap-2"><span className="gold-dot" /><span className="gold-dot" /><span className="gold-dot" /></div>
          <h2 className="font-display text-3xl font-bold tracking-tight md:text-4xl">Our Professional Services</h2>
          <p className="mx-auto max-w-md text-sm text-brand-textLight">Five divisions. One standard of excellence — choose where to begin.</p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {SERVICES.map((svc) => (
            <div key={svc.id} onClick={() => setLocation(svc.path)} className="svc-card group clay-card cursor-pointer p-5">
              <Img src={imageFor(`hero-${svc.id}`).src} prompt={imageFor(`hero-${svc.id}`).prompt} label={svc.title} className="mb-5" />
              <div className="mb-3 flex items-center gap-3">
                <span className="gold-dot !h-2.5 !w-2.5" />
                <h3 className="font-display text-lg font-semibold transition-colors group-hover:text-brand-gold-hover">{svc.title}</h3>
              </div>
              <p className="text-sm leading-relaxed text-brand-textLight">{svc.desc}</p>
              <span className="mt-5 inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.15em] text-brand-gold transition-all group-hover:gap-3">
                Learn More →
              </span>
            </div>
          ))}

          <div className="svc-card clay-card flex flex-col justify-between bg-brand-navy p-7">
            <div>
              <div className="mb-5 flex items-center gap-3">
                <span className="h-2.5 w-2.5 rounded-full bg-brand-gold" />
                <h3 className="font-display text-lg font-semibold text-white">Not sure where to start?</h3>
              </div>
              <p className="text-sm leading-relaxed text-white/60">Book a free consultation — we'll map your goals to the right division in one call.</p>
            </div>
            <button onClick={() => goLeadForm()} className="mt-6 self-start rounded-full bg-brand-gold px-5 py-3 text-xs font-bold text-brand-navy transition-all hover:bg-brand-gold-hover hover:text-white">
              Book Free Consultation
            </button>
          </div>
        </div>
      </section>

      {/* LIVE PROOF (jobs + testimonials) */}
      <section className="bg-white py-24">
        <div className="mx-auto max-w-7xl px-6">
          <div className="reveal mb-14 space-y-4 text-center">
            <h2 className="font-display text-3xl font-bold tracking-tight md:text-4xl">Real Journeys, Real Proof</h2>
            <p className="mx-auto max-w-md text-sm text-brand-textLight">Live job openings ticking from our board, and the stories behind them.</p>
          </div>

          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
            <div className="clay-card p-6">
              <div className="mb-5 flex items-center justify-between">
                <h3 className="font-display text-base font-bold">Live Global Roles</h3>
                <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-3 py-1 text-[10px] font-bold text-emerald-600">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-emerald-500" /> LIVE
                </span>
              </div>
              <div className="space-y-3">
                {liveJobs.length === 0 ? (
                  <p className="text-xs text-brand-textLight">New openings drop weekly — check back soon.</p>
                ) : liveJobs.map((j: any) => (
                  <div key={j.id} className="flex items-center justify-between rounded-xl border border-brand-navy/5 bg-white/70 px-3.5 py-3">
                    <div>
                      <p className="text-xs font-bold">{j.title}</p>
                      <p className="text-[10px] text-brand-textLight">{j.country} · {j.sector}</p>
                    </div>
                    <span className="text-xs font-semibold text-brand-gold">{j.salaryText}</span>
                  </div>
                ))}
              </div>
              <button onClick={() => setLocation('/recruitment')} className="mt-5 w-full rounded-2xl border border-brand-navy/10 py-2.5 text-xs font-bold transition-colors hover:border-brand-gold hover:text-brand-gold">
                Browse All Jobs
              </button>
            </div>

            {TESTIMONIALS.map((t) => (
              <div key={t.name} className="clay-card flex flex-col justify-between p-6">
                <div>
                  <div className="gold-dot mb-4" />
                  <p className="text-xs leading-relaxed text-brand-navy/80">"{t.quote}"</p>
                </div>
                <div className="mt-6 flex items-center gap-3">
                  <span className="flex h-10 w-10 items-center justify-center rounded-full bg-brand-gold/15 font-display text-sm font-bold text-brand-gold">{t.name.charAt(0)}</span>
                  <div>
                    <p className="text-xs font-bold">{t.name}</p>
                    <p className="text-[10px] text-brand-textLight">{t.role}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* HOW IT WORKS */}
      <section ref={stepsRef} className="py-24">
        <div className="mx-auto max-w-6xl px-6">
          <div className="reveal mb-14 text-center">
            <h2 className="font-display text-3xl font-bold tracking-tight md:text-4xl">How It Works</h2>
          </div>
          <div className="grid grid-cols-1 gap-8 md:grid-cols-4">
            {STEPS.map(([title, body], i) => (
              <div key={title} className="step-card clay-card relative p-7">
                <span className="absolute -top-3 left-6 flex h-9 w-9 items-center justify-center rounded-full border border-brand-gold/40 bg-brand-gold/10 font-display text-sm font-bold text-brand-gold">
                  {i + 1}
                </span>
                <h3 className="mt-3 font-display text-lg font-semibold">{title}</h3>
                <p className="mt-2 text-xs leading-relaxed text-brand-textLight">{body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA BAND */}
      <section className="relative overflow-hidden bg-brand-navy px-6 py-20">
        <div className="pointer-events-none absolute left-1/2 top-1/2 h-[600px] w-[600px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-brand-gold/10 blur-[130px]" />
        <div className="reveal relative mx-auto max-w-3xl text-center">
          <h2 className="font-display text-3xl font-bold text-white md:text-4xl">Ready to Start?</h2>
          <p className="mt-4 text-sm text-white/60">Your journey to a global future begins with one conversation.</p>
          <div className="mt-8 flex flex-wrap justify-center gap-3">
            <button onClick={() => goLeadForm()} className="rounded-full bg-brand-gold px-10 py-4 text-sm font-bold text-brand-navy shadow-[0_8px_30px_rgba(215,160,25,0.4)] transition-all hover:bg-brand-gold-hover hover:text-white">
              Book Free Consultation
            </button>
            {BOOKING_URL && (
              <a
                href={BOOKING_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 rounded-full border border-brand-gold/40 bg-brand-gold/10 px-10 py-4 text-sm font-bold text-brand-gold transition-all hover:bg-brand-gold hover:text-brand-navy"
              >
                Pick a Time
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-navy/10 text-[10px]">↗</span>
              </a>
            )}
            <a
              href="https://wa.me/919876543210?text=Hi%20Opus%20Overseas!"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-full border border-emerald-400/50 bg-emerald-500/10 px-10 py-4 text-sm font-bold text-emerald-300 transition-all hover:bg-emerald-500 hover:text-white"
            >
              Chat on WhatsApp
            </a>
          </div>
        </div>
      </section>

      <Footer />
    </div>
  );
}