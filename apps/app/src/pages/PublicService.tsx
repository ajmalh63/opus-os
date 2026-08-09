import React, { useEffect, useRef, useState } from 'react';
import { useLocation } from 'wouter';
import TurnstileWidget from '../components/TurnstileWidget';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import Nav from '../components/Nav';
import Footer from '../components/Footer';
import StickyCallBar from '../components/StickyCallBar';
import Img from '../components/Img';
import ChatWidget from '../components/ChatWidget';
import { imageFor } from '../config/images';
import { prefersReducedMotion, animateHeadlineWords } from '../lib/motion';

gsap.registerPlugin(ScrollTrigger);

interface ServiceDetails {
  title: string;
  subtitle: string;
  icon: string;
  accent: 'gold' | 'blue' | 'emerald' | 'sky' | 'rose';
  desc: string;
  checklistTitle: string;
  checklist: string[];
  timeline: { step: string; details: string }[];
  liveTileLabel: string;
}

const ACCENTS: Record<string, { chip: string; orb: string; ring: string }> = {
  gold: { chip: 'border-brand-gold/40 bg-brand-gold/10 text-brand-gold', orb: 'bg-brand-gold/20', ring: 'hover:border-brand-gold' },
  blue: { chip: 'border-brand-blue/40 bg-brand-blue/10 text-brand-blue', orb: 'bg-brand-blue/30', ring: 'hover:border-brand-blue' },
  emerald: { chip: 'border-emerald-400/40 bg-emerald-500/10 text-emerald-300', orb: 'bg-emerald-500/20', ring: 'hover:border-emerald-400' },
  sky: { chip: 'border-sky-400/40 bg-sky-500/10 text-sky-300', orb: 'bg-sky-400/20', ring: 'hover:border-sky-400' },
  rose: { chip: 'border-rose-400/40 bg-rose-500/10 text-rose-300', orb: 'bg-rose-400/20', ring: 'hover:border-rose-400' },
};

const DIVISION_SLUG_TO_ENUM: Record<string, string> = {
  'study-abroad': 'study-abroad',
  'visa-services': 'visa',
  'umrah-travel': 'umrah',
  'attestation': 'attestation',
  'recruitment': 'manpower',
};

export default function PublicService({ params }: { params: { division: string } }) {
  const [, setLocation] = useLocation();
  const heroRef = useRef<HTMLElement>(null);
  const [submitted, setSubmitted] = useState<string | null>(null);
  const reduced = prefersReducedMotion();

  // Partner attribution: /go/:ref/:type/:id redirects land here with ?ref=
  const inquiryRef = new URLSearchParams(typeof location !== 'undefined' ? location.search : '').get('ref') || '';
  const [inquiryName, setInquiryName] = useState('');
  const [inquiryPhone, setInquiryPhone] = useState('');
  const [inquiryEmail, setInquiryEmail] = useState('');
  const [consent, setConsent] = useState(false);
  const [waConsent, setWaConsent] = useState(true);
  const [mktConsent, setMktConsent] = useState(true);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [targetCountry, setTargetCountry] = useState('us');
  const [intakeSeason, setIntakeSeason] = useState('Fall 2027');
  const [visaCategory, setVisaCategory] = useState('student');
  const [visaCountry, setVisaCountry] = useState('');
  const [umrahTier, setUmrahTier] = useState('deluxe');
  const [umrahDeparture, setUmrahDeparture] = useState('sep');
  const [attestationCategory, setAttestationCategory] = useState('educational');
  const [attestationAuth, setAttestationAuth] = useState('apostille');
  const [manpowerSector, setManpowerSector] = useState('healthcare');

  const serviceConfigs: Record<string, ServiceDetails> = {
    'study-abroad': {
      title: 'Study Abroad Consulting',
      subtitle: 'Graduate & Undergraduate Admissions',
      icon: '🎓',
      accent: 'gold',
      desc: 'Comprehensive coaching for university applications, statement of purpose (SOP) reviews, reference letters (LOR), funding options, and student visa mock interviews. We cover US, UK, Canada, Germany, and Australia.',
      checklistTitle: 'Required Academic Credentials Checklist',
      checklist: [
        'Official High School / Undergraduate Academic Transcripts',
        'Proof of Language Proficiency (IELTS, TOEFL, or Duolingo)',
        'Statement of Purpose (SOP) draft customized per university',
        'Two Academic or Professional Letters of Recommendation (LOR)',
        'Financial Support Statements (Bank letter, sponsorship proof)',
      ],
      timeline: [
        { step: 'Profile & Shortlisting', details: 'Select 5-8 target universities matching budget and GPA.' },
        { step: 'Documents Review', details: 'Refine SOPs and LORs with a dedicated counselor.' },
        { step: 'Application Submission', details: 'Submit via official portals before university deadlines.' },
        { step: 'Visa Prep', details: 'Mock interviews and visa checklist verification.' },
      ],
      liveTileLabel: 'Fall 2027 intakes · apply before deadlines',
    },
    'visa-services': {
      title: 'Global Visa Services',
      subtitle: 'Secure & Transparent Documentation',
      icon: '🛂',
      accent: 'blue',
      desc: 'Fast and reliable preparation for student, work, tourist, and family reunion visa applications. We guide you through biometric scheduling, insurance validations, and verification gates.',
      checklistTitle: 'General Visa Document Stack',
      checklist: [
        'Valid Passport (minimum 6 months validity)',
        'Recent passport-sized photographs (country specs)',
        'Confirmed flight reservation and itinerary',
        'Overseas travel health insurance confirmation',
        'Proof of financial subsistence (bank statements)',
      ],
      timeline: [
        { step: 'Document Auditing', details: 'Passport + financials checked against consulate rules.' },
        { step: 'Appointment Scheduling', details: 'Secure biometrics + consular interview slots.' },
        { step: 'File Preparation', details: 'Compile the physical visa folder to spec.' },
        { step: 'Collection', details: 'Track passport return and delivery.' },
      ],
      liveTileLabel: '92% documented success · track your case live',
    },
    'umrah-travel': {
      title: 'Umrah Packages & Travel',
      subtitle: 'Spiritual Pilgrimage Planning & Vouchers',
      icon: '🕋',
      accent: 'emerald',
      desc: 'Dedicated group departures from Hyderabad and Nizamabad — flights, luxury stays near Masjid al-Haram, seasonal camp permits, and Ziyarat tours with experienced guides.',
      checklistTitle: 'Pilgrim Enrollment Checklist',
      checklist: [
        'Original Passport with minimum 6 months validity',
        'Scanned copy of Aadhaar Card for identity verification',
        'Passport photo with pure white background',
        'Meningitis vaccination certificate',
        'Advance non-refundable booking fee receipt',
      ],
      timeline: [
        { step: 'Package Selection', details: 'Economy, standard, or premium options.' },
        { step: 'Seat Reservation', details: 'Lock in a seat from the live calendar.' },
        { step: 'Visa Issuance', details: 'Submit passport to Ministry of Hajj & Umrah portal.' },
        { step: 'Pre-Departure Briefing', details: 'Vouchers + orientation session.' },
      ],
      liveTileLabel: 'Next departures · live seat availability below',
    },
    'attestation': {
      title: 'Document Attestation',
      subtitle: 'HRD, MEA, Apostille & Embassy Legalization',
      icon: '📜',
      accent: 'sky',
      desc: 'Official apostille stamp processing for educational, marriage, and birth certificates. We handle the entire authentication chain securely via certified courier routes (Blue Dart/DTDC) preventing data loss.',
      checklistTitle: 'Legalization Pre-requisites',
      checklist: [
        'Original degree or birth certificate needing stamp',
        'Clear photocopy of client passport',
        'State HRD or SDM initial authentication',
        'Embassy-specific authority letter (signed)',
      ],
      timeline: [
        { step: 'Secure Pickup', details: 'Log courier reference + original certificate.' },
        { step: 'State Verification', details: 'Submit to HRD / Sub-Divisional Magistrate.' },
        { step: 'MEA Apostille', details: 'Ministry of External Affairs seals.' },
        { step: 'Embassy Legalization', details: 'Final attestation at destination consulate.' },
      ],
      liveTileLabel: 'Chain builder · fees & timeline transparent',
    },
    'recruitment': {
      title: 'Manpower Recruitment',
      subtitle: 'Global Placements & Candidate Hub',
      icon: '💼',
      accent: 'rose',
      desc: 'Connecting skilled technical and non-technical talent with opportunities in Gulf countries and Europe. Automatic CV checks, employer vetting, and DPDP-compliant data sharing consent.',
      checklistTitle: 'Candidate Screening Checklist',
      checklist: [
        'Structured Resume / CV in PDF format',
        'Valid academic and work experience letters',
        'DPDP data processing consent notice validation',
        'Technical mock assessment completion',
      ],
      timeline: [
        { step: 'Resume Intake', details: 'Upload PDF and extract parsing metadata.' },
        { step: 'Screening Interview', details: 'Call with a manpower counselor.' },
        { step: 'Employer Match', details: 'Present profiles to vetted overseas networks.' },
        { step: 'Selection & Visa', details: 'Offer processing + employment visa sponsorship.' },
      ],
      liveTileLabel: 'Live openings ticking from our board',
    },
  };

  const currentDiv = params.division;
  const data = serviceConfigs[currentDiv] || serviceConfigs['study-abroad'];
  const accent = ACCENTS[data.accent] ?? ACCENTS.gold;

  // Division hero reveal + checklist stagger
  useEffect(() => {
    const ctx = gsap.context(() => {
      if (!reduced) {
        animateHeadlineWords(heroRef.current?.querySelector('.division-h1') as HTMLElement, { delay: 0.1 });
      }
      gsap.utils.toArray<HTMLElement>('.chk-item').forEach((el, i) => {
        gsap.fromTo(el, { x: -24, opacity: 0 }, {
          x: 0, opacity: 1, duration: 0.7, ease: 'power3.out', delay: 0.2 + i * 0.08,
          scrollTrigger: { trigger: el, start: 'top 88%', once: true },
        });
      });
      gsap.utils.toArray<HTMLElement>('.tl-card').forEach((el) => {
        gsap.fromTo(el, { y: 30, opacity: 0 }, {
          y: 0, opacity: 1, duration: 0.8, ease: 'power3.out', stagger: 0.1, delay: 0.15,
          scrollTrigger: { trigger: el, start: 'top 90%', once: true },
        });
      });
      gsap.fromTo('.division-form', { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.9, ease: 'power3.out', scrollTrigger: { trigger: '.division-form', start: 'top 88%', once: true } });
    });
    return () => ctx.revert();
  }, [reduced]);

  const handleSubmitInquiry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inquiryName || !inquiryPhone || !inquiryEmail) { setSubmitted('Please fill all details.'); return; }
    if (!consent) { setSubmitted('Please grant data processing consent.'); return; }

    const division = DIVISION_SLUG_TO_ENUM[currentDiv] || 'study-abroad';

    let dynamicContext: Record<string, any> = {};
    if (division === 'study-abroad') dynamicContext = { targetCountry, intakeSeason };
    else if (division === 'visa') dynamicContext = { visaCategory, visaCountry };
    else if (division === 'umrah') dynamicContext = { umrahTier, umrahDeparture };
    else if (division === 'attestation') dynamicContext = { attestationCategory, attestationAuth };
    else if (division === 'manpower') dynamicContext = { manpowerSector };

    const digits = inquiryPhone.replace(/\D/g, '');
    const normalizedPhone = digits.length === 10
      ? `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`
      : digits.length === 12 && digits.startsWith('91')
        ? `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`
        : inquiryPhone;

    try {
      const res = await fetch('/api/public/leads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(turnstileToken ? { 'cf-turnstile-response': turnstileToken } : {}),
        },
        body: JSON.stringify({
          name: inquiryName,
          phone: normalizedPhone,
          email: inquiryEmail,
          highestQualification: 'undergrad',
          division,
          leadSource: 'website',
          ...(inquiryRef ? { refCode: inquiryRef } : {}),
          dynamicContext,
          consents: { coreProcessing: consent, whatsappUpdates: waConsent, marketingCampaigns: mktConsent },
        }),
      });
      const resData = await res.json();
      if (res.ok) {
        setSubmitted(`Inquiry logged! Your journey token: ${resData.token}`);
        setLocation(`/portal?token=${encodeURIComponent(resData.token)}`);
      } else {
        setSubmitted(`Error: ${resData.error || resData.details || 'Submission failed'}`);
      }
    } catch (err: any) {
      setSubmitted(`Network error: ${err.message}`);
    }
  };

  const inputCls = 'w-full rounded-xl border border-brand-navy/10 bg-white px-3.5 py-3 text-sm text-brand-navy placeholder:text-brand-gray focus:border-brand-gold focus:outline-none';

  return (
    <div className="min-h-screen bg-brand-cream font-sans text-brand-navy">
      <div className="film-grain" aria-hidden="true" />
      <Nav />
      <ChatWidget />
      <StickyCallBar />

      {/* Division hero */}
      <section ref={heroRef} className="relative overflow-hidden bg-brand-navy pb-24 pt-36 text-white">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className={`hero-orb -right-16 -top-20 h-96 w-96 rounded-full ${accent.orb} blur-3xl`} />
          <div className="hero-orb -left-24 bottom-0 h-80 w-80 rounded-full bg-brand-blue/20 blur-3xl" />
        </div>
        <div className="relative mx-auto grid max-w-7xl items-center gap-12 px-5 md:px-8 lg:grid-cols-2">
          <div>
            <span className={`inline-flex items-center gap-2 rounded-full border px-4 py-1.5 text-xs font-bold uppercase tracking-[0.2em] ${accent.chip}`}>
              {data.icon} {data.subtitle}
            </span>
            <h1 className="division-h1 mt-6 font-display text-4xl font-extrabold leading-[1.05] tracking-tight md:text-6xl">
              {data.title}
            </h1>
            <p className="mt-6 max-w-lg text-sm leading-relaxed text-white/70 md:text-base">{data.desc}</p>

            {/* Live tile */}
            <div className="mt-8 flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-5 py-4 backdrop-blur">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-gold/15 text-brand-gold">●</span>
              <p className="text-xs font-semibold text-white/85">{data.liveTileLabel}</p>
              <span className="ml-auto flex items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[10px] font-bold text-emerald-300">
                <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /> LIVE
              </span>
            </div>
          </div>

          <Img prompt={imageFor(`hero-${currentDiv}`).prompt} label={data.title} className="hidden lg:block" />
        </div>
      </section>

      {/* Checklist + timeline + form */}
      <main className="mx-auto grid max-w-7xl grid-cols-1 gap-10 px-5 py-20 md:px-8 lg:grid-cols-3">
        <div className="space-y-10 lg:col-span-2">
          <div>
            <div className="reveal mb-6 flex items-center gap-2">
              <span className="gold-dot" />
              <h2 className="font-display text-xl font-bold md:text-2xl">{data.checklistTitle}</h2>
            </div>
            <div className="clay-card p-7">
              <ul className="space-y-3.5">
                {data.checklist.map((item, idx) => (
                  <li key={idx} className="chk-item flex items-start gap-3 text-sm leading-relaxed">
                    <span className="mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-gold/15 text-xs font-bold text-brand-gold">✔</span>
                    <span className="text-brand-navy/85">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div>
            <div className="reveal mb-6 flex items-center gap-2">
              <span className="gold-dot" />
              <h2 className="font-display text-xl font-bold md:text-2xl">Processing Timeline</h2>
            </div>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              {data.timeline.map((step, idx) => (
                <div key={idx} className="tl-card clay-card p-6">
                  <div className="mb-3 flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-full border border-brand-gold/40 bg-brand-gold/10 font-display text-xs font-bold text-brand-gold">{idx + 1}</span>
                    <h3 className="font-display text-sm font-bold">{step.step}</h3>
                  </div>
                  <p className="text-xs leading-relaxed text-brand-textLight">{step.details}</p>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Inquiry form */}
        <div className="division-form space-y-6">
          <div className="glass-light rounded-3xl p-7 shadow-[0_20px_50px_rgba(10,45,80,0.12)]">
            <h3 className="font-display text-lg font-bold">Start Your {data.title.split(' ')[0]} Inquiry</h3>
            <p className="mt-1.5 text-xs leading-relaxed text-brand-textLight">
              A division counselor will review and allocate your journey token within 2 hours.
            </p>

            <form onSubmit={handleSubmitInquiry} className="mt-6 space-y-4">
              <Field label="Full Name"><input required placeholder="e.g. Ramesh Kumar" value={inquiryName} onChange={(e) => setInquiryName(e.target.value)} className={inputCls} /></Field>
              <Field label="Phone (with +91)"><input required type="tel" placeholder="+91 98765 00001" value={inquiryPhone} onChange={(e) => setInquiryPhone(e.target.value)} className={inputCls} /></Field>
              <Field label="Email"><input required type="email" placeholder="you@example.com" value={inquiryEmail} onChange={(e) => setInquiryEmail(e.target.value)} className={inputCls} /></Field>

              {currentDiv === 'study-abroad' && (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Target Country">
                    <select value={targetCountry} onChange={(e) => setTargetCountry(e.target.value)} className={inputCls}>
                      <option value="us">United States</option><option value="uk">United Kingdom</option><option value="canada">Canada</option><option value="germany">Germany</option><option value="australia">Australia</option><option value="other">Other</option>
                    </select>
                  </Field>
                  <Field label="Intake Season">
                    <select value={intakeSeason} onChange={(e) => setIntakeSeason(e.target.value)} className={inputCls}>
                      <option>Fall 2027</option><option>Spring 2028</option><option>Summer 2028</option>
                    </select>
                  </Field>
                </div>
              )}
              {currentDiv === 'visa-services' && (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Visa Category">
                    <select value={visaCategory} onChange={(e) => setVisaCategory(e.target.value)} className={inputCls}>
                      <option value="student">Student</option><option value="work">Work</option><option value="tourist">Tourist</option><option value="family">Family Reunion</option>
                    </select>
                  </Field>
                  <Field label="Destination Country"><input placeholder="e.g. UAE, UK" value={visaCountry} onChange={(e) => setVisaCountry(e.target.value)} className={inputCls} /></Field>
                </div>
              )}
              {currentDiv === 'umrah-travel' && (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Package Tier">
                    <select value={umrahTier} onChange={(e) => setUmrahTier(e.target.value)} className={inputCls}>
                      <option value="economy">Economy</option><option value="standard">Standard</option><option value="deluxe">Deluxe</option><option value="premium">Premium</option>
                    </select>
                  </Field>
                  <Field label="Departure Month">
                    <select value={umrahDeparture} onChange={(e) => setUmrahDeparture(e.target.value)} className={inputCls}>
                      <option value="sep">September</option><option value="oct">October</option><option value="nov">November</option><option value="dec">December</option>
                    </select>
                  </Field>
                </div>
              )}
              {currentDiv === 'attestation' && (
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Certificate Category">
                    <select value={attestationCategory} onChange={(e) => setAttestationCategory(e.target.value)} className={inputCls}>
                      <option value="educational">Educational</option><option value="marriage">Marriage</option><option value="birth">Birth</option>
                    </select>
                  </Field>
                  <Field label="Authentication">
                    <select value={attestationAuth} onChange={(e) => setAttestationAuth(e.target.value)} className={inputCls}>
                      <option value="apostille">Apostille</option><option value="embassy">Embassy Legalization</option><option value="mea">MEA</option>
                    </select>
                  </Field>
                </div>
              )}
              {currentDiv === 'recruitment' && (
                <Field label="Target Sector">
                  <select value={manpowerSector} onChange={(e) => setManpowerSector(e.target.value)} className={inputCls}>
                    <option value="healthcare">Healthcare</option><option value="construction">Construction</option><option value="hospitality">Hospitality</option><option value="it">IT / Tech</option><option value="domestic">Domestic Help</option>
                  </select>
                </Field>
              )}

              <label className="flex items-start gap-3 text-[10px] leading-normal text-brand-textLight">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-brand-gold" />
                I consent to Opus Overseas processing my digital identity documents for this application under DPDP provisions.
              </label>

              <label className="flex items-start gap-3 text-[10px] leading-normal text-brand-textLight">
                <input type="checkbox" checked={waConsent} onChange={(e) => setWaConsent(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-brand-gold" />
                I consent to receive status updates and occasional tips on WhatsApp.
              </label>

              <label className="flex items-start gap-3 text-[10px] leading-normal text-brand-textLight">
                <input type="checkbox" checked={mktConsent} onChange={(e) => setMktConsent(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0 accent-brand-gold" />
                I would like to receive occasional offers and campaign updates by email.
              </label>

              {inquiryRef && (
                <div className="rounded-xl border border-brand-gold/40 bg-brand-gold/5 px-3 py-2 text-[10px] text-brand-navy/70">
                  You arrived through a partner referral (code: <span className="font-mono font-bold text-brand-gold">{inquiryRef}</span>) — it will be credited automatically.
                </div>
              )}

              <TurnstileWidget onToken={setTurnstileToken} onExpire={() => setTurnstileToken(null)} />

              {submitted && <p className="rounded-xl bg-brand-gold/10 px-4 py-3 text-xs font-semibold text-brand-gold">{submitted}</p>}

              <button type="submit" className="w-full rounded-full bg-brand-gold py-3.5 text-xs font-bold uppercase tracking-wider text-brand-navy transition-all hover:bg-brand-gold-hover hover:text-white active:scale-[0.98]">
                Send Inquiry
              </button>
            </form>
          </div>

          <div className="clay-card p-6 text-xs leading-relaxed text-brand-textLight">
            <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-brand-navy">Division Support Office</p>
            <p>📍 Nizamabad GPO complex block, Hyderabad Road, Telangana, India</p>
            <p className="mt-1">📧 support@opusoverseas.com</p>
          </div>
        </div>
      </main>

      <Footer />
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-[10px] font-semibold uppercase tracking-wider text-brand-textLight">{label}</span>
      {children}
    </label>
  );
}