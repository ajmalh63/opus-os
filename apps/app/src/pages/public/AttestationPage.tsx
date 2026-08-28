import InteractiveFunnelModal from '../../components/funnel/InteractiveFunnelModal';
import React, { useState } from 'react';
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
import DomainDarkGraphics from '../../components/DomainDarkGraphics';
import { BASE_ORGANIZATION_SCHEMA, getBreadcrumbSchema, getFAQSchema, getServiceSchema } from '../../lib/schemas';
import { useVisibilityTracking } from '../../lib/visibilityTracking';
import { track, EVENTS } from '../../lib/umami';
const API = (import.meta as any).env?.VITE_API_URL || 'https://opusos-api.ajmalsn63.workers.dev';

const ATTESTATION_FAQS = [
  {
    question: 'What is the difference between Hague Convention Apostille and Embassy Attestation?',
    answer: 'An MEA Apostille sticker is accepted across all 120+ Hague Convention member countries (such as USA, UK, Germany, Australia, France). Non-Hague countries (including UAE, Saudi Arabia, Qatar, Kuwait) require a complete consular legalization chain: State HRD/Home → MEA New Delhi → Destination Embassy in India → MOFA abroad.',
  },
  {
    question: 'How long does educational degree attestation take from State HRD and MEA?',
    answer: 'Express Sub-Divisional Magistrate (SDM) + MEA Apostille takes 3 to 5 business days. State HRD university verification typically takes 10 to 18 working days depending on state education board verification timelines.',
  },
  {
    question: 'What personal certificates can be apostilled or attested?',
    answer: 'We legalise Birth Certificates, Marriage Certificates, Police Clearance Certificates (PCC), Single Status Affidavits, Medical Fitness Certificates, and Experience Letters for family visas and employment abroad.',
  },
  {
    question: 'How do I submit my original documents to Opus Overseas?',
    answer: 'After requesting an official quote and reviewing the statutory fee breakdown with our counselor, you courier your physical original certificates via insured parcel directly to the Opus Overseas central processing center in Hyderabad. A tamper-evident chain-of-custody token is activated the moment our desk receives your parcel.',
  },
  {
    question: 'How can I track the custody of my original documents during transit?',
    answer: 'Every consignment is assigned an Opus Chain-of-Custody Token. You can track every physical dispatch, MEA submission, embassy stamping, and return insured delivery in real-time on our tracking portal.',
  },
];

interface ChainStep {
  step: string;
  feePaise?: number;
  fee?: number;
  timelineDays?: number;
}

interface Chain {
  country: string;
  steps: ChainStep[];
}

const DOCUMENT_CATEGORIES = [
  {
    category: 'Educational Documents',
    icon: '🎓',
    docs: ['Degree Certificate', 'Diploma Certificate', 'Engineering Transcripts', 'Nursing / MBBS License', 'School Marksheets (SSC/HSC)'],
    purpose: 'Employment Visas, Higher Education Admissions, MOH Licensing in GCC',
    standardRoute: 'State HRD / GAD → MEA New Delhi → Destination Embassy → MOFA',
  },
  {
    category: 'Personal Documents',
    icon: '📜',
    docs: ['Birth Certificate', 'Marriage Certificate', 'Police Clearance (PCC)', 'Single Status Affidavit', 'Experience Letters'],
    purpose: 'Family Residence Visas, Spousal Sponsorship, International Migration',
    standardRoute: 'Notary Public → State Home Dept (SDM) → MEA → Destination Embassy',
  },
  {
    category: 'Commercial Documents',
    icon: '🏢',
    docs: ['Power of Attorney (POA)', 'Memorandum of Association (MOA)', 'Board Resolution', 'Certificate of Origin', 'Commercial Invoices'],
    purpose: 'Overseas Business Setup, Company Branch Registration, Trade & Exports',
    standardRoute: 'Chamber of Commerce → MEA Apostille / Embassy Legalization',
  },
];

export default function AttestationPage() {
  useVisibilityTracking('/attestation');
  const [, setLocation] = useLocation();

  const [selectedCountry, setSelectedCountry] = useState('United Arab Emirates (UAE)');
  const [funnelOpen, setFunnelOpen] = useState(false);
  const refCode = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('ref') || undefined : undefined;
  const [selectedDocCategory, setSelectedDocCategory] = useState('educational');

  // Intake Form State
  const [clientName, setClientName] = useState('');
  const [clientPhone, setClientPhone] = useState('');
  const [clientEmail, setClientEmail] = useState('');
  const [documentType, setDocumentType] = useState('Degree Certificate');
  const [returnAddress, setReturnAddress] = useState('');
  const [consent, setConsent] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [formFeedback, setFormFeedback] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Fetch real attestation chains from backend
  const { data: chainsData } = useQuery({
    queryKey: ['publicAttestationChains'],
    queryFn: async () => {
      const res = await fetch(`${API}/api/public/attestation/chains`, { credentials: 'include', });
      if (!res.ok) return { chains: [] };
      return res.json();
    },
    staleTime: 120_000,
  });

  const chains: Chain[] = chainsData?.chains || [];
  const activeChain = chains.find((c) => c.country.toLowerCase().includes(selectedCountry.toLowerCase().slice(0, 5))) || chains[0] || {
    country: selectedCountry,
    steps: [
      { step: 'State HRD / Home Department Authentication', feePaise: 150000, timelineDays: 3 },
      { step: 'Ministry of External Affairs (MEA New Delhi)', feePaise: 80000, timelineDays: 2 },
      { step: 'Destination Embassy Legalization', feePaise: 420000, timelineDays: 4 },
      { step: 'MOFA Legalization in Destination Country', feePaise: 350000, timelineDays: 2 },
    ]
  };

  const totalFee = activeChain.steps.reduce((a, s) => a + (s.feePaise ?? s.fee ?? 0), 0);
  const totalDays = activeChain.steps.reduce((a, s) => a + (s.timelineDays ?? 0), 0);

  // Submit Attestation Quote Request
  const handleSubmitAttestation = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!consent) {
      setFormFeedback('Please grant DPDP document processing consent.');
      return;
    }
    setSubmitting(true);
    setFormFeedback(null);

    const digits = clientPhone.replace(/\D/g, '');
    const normalizedPhone = digits.length === 10 ? `+91 ${digits.slice(0, 5)} ${digits.slice(5)}` : clientPhone;

    try {
      const res = await fetch(`${API}/api/public/leads`, { credentials: 'include', 
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(turnstileToken ? { 'cf-turnstile-response': turnstileToken } : {}),
        },
        body: JSON.stringify({
          name: clientName,
          phone: normalizedPhone,
          email: clientEmail,
          highestQualification: 'undergrad',
          division: 'attestation',
          leadSource: 'website-attestation',
          dynamicContext: {
            destinationCountry: selectedCountry,
            documentCategory: selectedDocCategory,
            documentType,
            returnAddress,
            quotedFeePaise: totalFee,
          },
          consents: { coreProcessing: consent, whatsappUpdates: true, marketingCampaigns: true },
          ...(refCode ? { refCode } : {}),
        }),
      });

      const data = await res.json();
      if (res.ok) {
        track(EVENTS.leadSubmit, { division: 'attestation' });
        setLocation(`/portal?token=${encodeURIComponent(data.token)}`);
      } else {
        setFormFeedback(data.error || 'Submission failed.');
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
        title="Document Attestation & MEA Apostille Services | India | Opus Overseas"
        description="Fast-track MEA Apostille, State HRD, SDM, and Embassy Legalization for educational, personal, and commercial certificates with insured courier custody."
        canonicalPath="/attestation"
        schemas={[
          BASE_ORGANIZATION_SCHEMA,
          getServiceSchema({
            name: 'Document Attestation, Apostille & Embassy Legalization',
            description: 'Pan-India certificate authentication including State HRD, Home Dept (SDM), MEA Apostille, and Embassy stamping with real-time barcode tracking.',
            serviceType: 'Legal & Notary Document Authentication',
            path: '/attestation',
          }),
          getBreadcrumbSchema([
            { name: 'Home', path: '/' },
            { name: 'Attestation', path: '/attestation' },
          ]),
          getFAQSchema(ATTESTATION_FAQS),
        ]}
      />
      <div className="film-grain" aria-hidden="true" />
      <Nav />
      <ChatWidget />
      <StickyCallBar />

      {/* HERO SECTION — Government Authentication & Legal Authority */}
      <section className="relative overflow-hidden bg-gradient-to-b from-[#061e38] via-[#0b294a] to-[#0a2d50] pb-24 pt-36 sm:pt-40 text-white border-b border-brand-gold/20">
        <DomainBackdrop theme="attestation" />
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="hero-orb -right-20 -top-20 h-96 w-96 rounded-full bg-sky-400/20 blur-3xl" />
          <div className="hero-orb -left-20 bottom-0 h-96 w-96 rounded-full bg-brand-gold/20 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-7xl px-5 sm:px-6 md:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            <div className="lg:col-span-7">
              <span className="inline-flex items-center gap-2 rounded-full border border-sky-400/40 bg-sky-500/10 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.2em] text-sky-300 shimmer-badge">
                📜 Official Legalization · MEA & Embassy Authorized
              </span>
              <h1 className="mt-5 font-display fluid-h1 font-black leading-tight tracking-tight text-white">
                Document Attestation & Apostille with <span className="text-brand-gold">100% Chain Verification</span>
              </h1>
              <p className="mt-5 text-base sm:text-lg leading-relaxed text-white/80 max-w-2xl">
                State HRD, Home Dept (SDM), Ministry of External Affairs (MEA), and destination embassy apostille stamps for GCC, Europe, and Hague Treaty nations. Dispatched safely to our central processing center in Hyderabad.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  href="#chain-calculator"
                  className="rounded-full bg-brand-gold px-8 py-3.5 text-xs font-extrabold uppercase tracking-wider text-brand-navy shadow-[0_10px_30px_rgba(215,160,25,0.4)] transition-all hover:bg-brand-gold-hover hover:text-white tactile-btn cursor-pointer"
                >
                  Inspect Stamp Chain & Fees ↓
                </a>
                <a
                  href="#quote-form"
                  className="rounded-full border border-white/25 bg-white/5 hover:bg-white/10 px-6 py-3.5 text-xs font-semibold text-white transition-all hover:border-brand-gold hover:text-brand-gold tactile-btn inline-flex items-center gap-1.5"
                >
                  <span>📝 Request Quote & Dispatch Info</span>
                  <span className="text-[13px] text-brand-gold">↗</span>
                </a>
              </div>
            </div>

            <div className="lg:col-span-5 relative">
              <div className="relative rounded-3xl overflow-hidden border border-white/20 shadow-2xl group">
                <img
                  src="/img/hero-attestation.jpg"
                  alt="Government Legalization and MEA Apostille"
                  className="w-full h-80 sm:h-96 object-cover transform transition-transform duration-700 group-hover:scale-105"
                  onError={(e) => { (e.target as HTMLElement).style.display = 'none'; }}
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#061e38] via-transparent to-transparent opacity-80" />
                <div className="absolute bottom-4 left-4 right-4 glass-light p-4 rounded-2xl text-brand-navy">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-display text-xs font-bold uppercase tracking-wider text-brand-gold">Hague & GCC Compliant</p>
                      <p className="font-display text-sm font-extrabold text-brand-navy">Tamper-Evident Security</p>
                    </div>
                    <span className="rounded-full bg-emerald-500/20 text-emerald-800 px-2.5 py-1 text-[13px] font-bold font-mono">
                      ● Insured Transit
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* SECURITY & AUTHENTICATION GUARANTEES */}
      <section className="bg-white py-12 border-b border-brand-navy/5">
        <div className="mx-auto max-w-7xl px-5 sm:px-6 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 text-center">
          <div>
            <span className="text-2xl mb-1 block">🔒</span>
            <p className="font-display font-extrabold text-sm text-brand-navy">Insured Transit</p>
            <p className="text-sm text-brand-textLight mt-0.5">Insured Logistics Secure Bags</p>
          </div>
          <div>
            <span className="text-2xl mb-1 block">🏛️</span>
            <p className="font-display font-extrabold text-sm text-brand-navy">Direct MEA Submission</p>
            <p className="text-sm text-brand-textLight mt-0.5">No sub-agent chain risk</p>
          </div>
          <div>
            <span className="text-2xl mb-1 block">⏱️</span>
            <p className="font-display font-extrabold text-sm text-brand-navy">Express Stamping</p>
            <p className="text-sm text-brand-textLight mt-0.5">3-7 Business Days Average</p>
          </div>
          <div>
            <span className="text-2xl mb-1 block">🔎</span>
            <p className="font-display font-extrabold text-sm text-brand-navy">QR Code Verification</p>
            <p className="text-sm text-brand-textLight mt-0.5">Official government sticker scan</p>
          </div>
        </div>
      </section>

      {/* DOCUMENT CATEGORIES BREAKDOWN */}
      <section className="mx-auto max-w-7xl px-5 sm:px-6 py-20">
        <div className="mb-14 text-center space-y-3">
          <h2 className="font-display fluid-h2 font-bold text-brand-navy">
            Document Categories We Legalize
          </h2>
          <p className="text-sm sm:text-base text-brand-textLight max-w-xl mx-auto">
            Select your certificate classification to view the statutory government verification route.
          </p>
        </div>

        <div className="md:hidden -mx-5 px-5 flex gap-4 overflow-x-auto snap-x snap-mandatory pb-4 scroll-smooth" style={{ WebkitOverflowScrolling: 'touch' } as any}>
          {DOCUMENT_CATEGORIES.map((cat) => {
            const isSelected = selectedDocCategory === cat.category.toLowerCase().split(' ')[0];
            return (
              <div 
                key={cat.category} 
                onClick={() => setSelectedDocCategory(cat.category.toLowerCase().split(' ')[0])}
                className={`shrink-0 snap-center min-w-[82vw] max-w-[320px] clay-card p-6 flex flex-col justify-between transition-all group cursor-pointer will-change-transform ${isSelected ? 'border-brand-gold ring-2 ring-brand-gold/30' : 'hover:border-brand-gold/40'}`}
                style={{ transformStyle: 'preserve-3d' } as any}
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">{cat.icon}</span>
                      <h3 className="font-display text-base font-bold text-brand-navy group-hover:text-brand-gold-hover transition-colors">
                        {cat.category}
                      </h3>
                    </div>
                    {isSelected && (
                      <span className="rounded-full bg-brand-gold/20 text-brand-gold text-[13px] font-bold px-2 py-0.5 font-mono">Selected</span>
                    )}
                  </div>
                  <p className="text-xs font-semibold text-brand-gold mb-3">{cat.purpose}</p>
                  <div className="space-y-1.5 text-xs text-brand-textLight mb-4">
                    <p className="font-bold text-brand-navy text-sm uppercase tracking-wider">Covered Documents:</p>
                    <ul className="space-y-1 text-sm">
                      {cat.docs.map((d, i) => (
                        <li key={i} className="flex items-center gap-1.5 truncate"><span className="w-1 h-1 rounded-full bg-brand-gold shrink-0" />{d}</li>
                      ))}
                    </ul>
                  </div>
                </div>
                <div className="text-sm font-bold uppercase tracking-wider text-brand-gold group-hover:text-brand-navy flex items-center gap-1">Explore →</div>
              </div>
            );
          })}
        </div>
        <div className="md:hidden mt-3 flex items-center justify-center gap-1.5">
          {DOCUMENT_CATEGORIES.map((_, i) => (
            <span key={i} className="h-1.5 w-1.5 rounded-full bg-brand-navy/15" />
          ))}
          <span className="ml-2 text-[13px] font-bold uppercase tracking-wider text-brand-navy/35 flex items-center gap-1">Swipe to explore <span className="animate-pulse">→</span></span>
        </div>
        <div className="hidden md:grid md:grid-cols-3 gap-6">
          {DOCUMENT_CATEGORIES.map((cat) => {
            const isSelected = selectedDocCategory === cat.category.toLowerCase().split(' ')[0];
            return (
              <div 
                key={cat.category} 
                onClick={() => setSelectedDocCategory(cat.category.toLowerCase().split(' ')[0])}
                className={`clay-card p-6 flex flex-col justify-between transition-all group cursor-pointer ${
                  isSelected ? 'border-brand-gold ring-2 ring-brand-gold/30' : 'hover:border-brand-gold/40'
                }`}
              >
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <span className="text-3xl">{cat.icon}</span>
                      <h3 className="font-display text-base font-bold text-brand-navy group-hover:text-brand-gold-hover transition-colors">
                        {cat.category}
                      </h3>
                    </div>
                    {isSelected && (
                      <span className="rounded-full bg-brand-gold/20 text-brand-gold text-[13px] font-bold px-2 py-0.5 font-mono">Selected</span>
                    )}
                  </div>

                  <p className="text-xs font-semibold text-brand-gold mb-3">
                    {cat.purpose}
                  </p>

                  <div className="space-y-1.5 text-xs text-brand-textLight mb-4">
                    <p className="font-bold text-brand-navy text-sm uppercase tracking-wider">Covered Documents:</p>
                    <ul className="space-y-1 text-sm">
                      {cat.docs.map((d, i) => (
                        <li key={i} className="flex items-center gap-1.5 truncate">
                          <span className="text-brand-gold font-bold">●</span> {d}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <div className="pt-3.5 border-t border-brand-navy/5">
                  <p className="text-[13px] font-bold uppercase tracking-wider text-brand-textLight mb-1">Standard Route:</p>
                  <p className="text-sm font-mono text-brand-navy font-semibold">{cat.standardRoute}</p>
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* INTERACTIVE STAMP CHAIN EXPLORER (Connected to /api/public/attestation/chains) */}
      <section id="chain-calculator" className="bg-[#061e38] text-white py-20 border-y border-brand-gold/15 relative overflow-hidden">
        <DomainDarkGraphics variant="attestation" />
        <div className="relative mx-auto max-w-5xl px-5 sm:px-6">
          <div className="mb-12 text-center space-y-3">
            <span className="rounded-full bg-brand-gold/20 border border-brand-gold/40 px-3.5 py-1 text-[13px] font-bold uppercase tracking-wider text-brand-gold font-mono">
              Consular Chain Matrix
            </span>
            <h2 className="font-display fluid-h2 font-extrabold text-white">
              Official Government Stamp Matrix & Timelines
            </h2>
            <p className="text-xs sm:text-sm text-white/70 max-w-md mx-auto">
              Select destination country to inspect every official seal, statutory milestone, and turnaround estimate.
            </p>
          </div>

          <div className="glass-light p-5 sm:p-9 rounded-2xl sm:rounded-3xl text-brand-navy shadow-2xl space-y-6">
            <div>
              <label className="block text-sm font-bold uppercase tracking-wider text-brand-textLight mb-2">
                Select Destination Country / Treaty
              </label>
              <select
                value={selectedCountry}
                onChange={(e) => setSelectedCountry(e.target.value)}
                className="w-full rounded-xl border border-brand-navy/15 bg-white px-4 py-3 text-sm font-bold text-brand-navy focus:border-brand-gold focus:outline-none"
              >
                <option>United Arab Emirates (UAE)</option>
                <option>Kingdom of Saudi Arabia (KSA)</option>
                <option>Qatar</option>
                <option>Kuwait</option>
                <option>Oman</option>
                <option>Hague Convention (USA / UK / Germany Apostille)</option>
              </select>
            </div>

            {/* Step sequence breakdown */}
            <div className="space-y-2.5">
              <p className="text-xs font-bold uppercase tracking-wider text-brand-textLight">
                Statutory Authentication Sequence:
              </p>
              <ol className="space-y-2">
                {activeChain.steps.map((s, idx) => (
                  <li key={idx} className="flex items-center justify-between p-3.5 rounded-xl bg-white border border-brand-navy/10 shadow-xs">
                    <div className="flex items-center gap-3 min-w-0 pr-2">
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-brand-gold/15 font-mono text-xs font-extrabold text-brand-gold">
                        {idx + 1}
                      </span>
                      <div>
                        <p className="truncate text-xs sm:text-sm font-bold text-brand-navy">{s.step}</p>
                        <p className="text-[13px] text-brand-textLight">Est. {s.timelineDays} working days</p>
                      </div>
                    </div>
                    <span className="rounded-full bg-emerald-50 border border-emerald-200 px-3 py-1 text-[13px] font-bold text-emerald-800 shrink-0">
                      Official Seal Milestone
                    </span>
                  </li>
                ))}
              </ol>
            </div>

            {/* Summary Box */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-4 rounded-2xl bg-brand-gold/15 border border-brand-gold/30 p-5">
              <div>
                <p className="text-xs font-bold uppercase tracking-wider text-brand-navy">Total Timeline: ~{totalDays} Working Days</p>
                <p className="text-sm text-brand-textLight">Includes state HRD verification, MEA seals, and Insured Logistics tracking.</p>
              </div>
              <div className="text-right shrink-0">
                <button
                  onClick={() => setFunnelOpen(true)}
                  className="min-h-11 cursor-pointer rounded-full bg-brand-navy px-5 py-2.5 text-xs font-extrabold uppercase tracking-wider text-white hover:bg-brand-gold hover:text-brand-navy transition-all shadow-md tactile-btn flex items-center gap-1.5 sm:min-h-0"
                >
                  <span>View Timeline & Chain Details →</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* EDITORIAL TRUST STORY & DIPLOMATIC AUTHORITY */}
      <section className="mx-auto max-w-7xl px-5 sm:px-6 py-16 sm:py-20 border-b border-brand-navy/5">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center">
          <div className="lg:col-span-6">
            <div className="relative rounded-3xl overflow-hidden shadow-2xl border border-brand-navy/10 group">
              <img
                src="/img/editorial-attestation.jpg"
                alt="Diplomatic attestation certificate with MEA Apostille seal"
                className="w-full h-[360px] sm:h-[420px] object-cover transition-transform duration-700 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#061e38]/80 via-transparent to-transparent" />
              <div className="absolute bottom-4 left-4 right-4 bg-white/90 backdrop-blur-md p-4 rounded-2xl border border-white/40">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold uppercase tracking-wider text-brand-gold">Hague & GCC Legalization Desk</p>
                    <p className="text-xs sm:text-sm font-extrabold text-brand-navy">MEA Apostille & Consular Seals</p>
                  </div>
                  <span className="rounded-full bg-sky-500/15 text-sky-800 px-2.5 py-1 text-[13px] font-bold font-mono">
                    ● 100% Chain Security
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-6 space-y-6">
            <div>
              <span className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-brand-gold">
                Sovereign Verification
              </span>
              <h2 className="font-display fluid-h2 font-extrabold text-brand-navy mt-1">
                State HRD, MEA Apostille & Embassy Legalization Chains
              </h2>
              <p className="text-xs sm:text-sm text-brand-textLight leading-relaxed mt-2.5">
                Original certificates require strict government protocol. Opus Overseas processes state education verifications, MEA New Delhi apostilles, and Gulf consular legalization with zero sub-agent chain risk.
              </p>
            </div>

            <div className="space-y-3.5">
              <div className="clay-card p-4 flex items-start gap-3.5 border-l-4 border-l-brand-gold">
                <span className="text-xl">🏛️</span>
                <div>
                  <h3 className="font-display text-sm font-bold text-brand-navy">Direct State HRD & MEA New Delhi Submission</h3>
                  <p className="text-xs text-brand-textLight leading-relaxed mt-0.5">Physical document presentation at State Higher Education Departments and Ministry of External Affairs counters in New Delhi.</p>
                </div>
              </div>

              <div className="clay-card p-4 flex items-start gap-3.5 border-l-4 border-l-sky-600">
                <span className="text-xl">📜</span>
                <div>
                  <h3 className="font-display text-sm font-bold text-brand-navy">Gulf Embassy & Consular Legalization</h3>
                  <p className="text-xs text-brand-textLight leading-relaxed mt-0.5">Official stamping for UAE, Saudi Arabia, Qatar, Kuwait, and Oman consulates across Mumbai and New Delhi.</p>
                </div>
              </div>

              <div className="clay-card p-4 flex items-start gap-3.5 border-l-4 border-l-emerald-600">
                <span className="text-xl">🔒</span>
                <div>
                  <h3 className="font-display text-sm font-bold text-brand-navy">Tamper-Evident Insured Return Custody</h3>
                  <p className="text-xs text-brand-textLight leading-relaxed mt-0.5">Every legalized certificate is sealed in a barcode-tracked security pouch and returned directly to your address.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 4-STEP DOCUMENT DISPATCH & VERIFICATION WORKFLOW */}
      <section className="bg-slate-50/70 border-t border-brand-navy/10 py-16">
        <div className="mx-auto max-w-7xl px-5 sm:px-6">
          <div className="text-center mb-12 space-y-2">
            <span className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-brand-gold">
              Simple 4-Step Process
            </span>
            <h2 className="font-display fluid-h2 font-extrabold text-brand-navy">
              How Document Legalization Works
            </h2>
            <p className="text-xs sm:text-sm text-brand-textLight max-w-md mx-auto">
              Transparent, insured, and handled directly with sovereign authentication authorities.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
            {[
              { step: '01', title: 'Request Fee Quote', desc: 'Select certificate type and target country to inspect statutory government fee matrix.' },
              { step: '02', title: 'Counselor Verification', desc: 'Senior attestation officer checks certificate scans and confirms prerequisite stamps.' },
              { step: '03', title: 'Dispatch to Head Office', desc: 'Courier original documents via insured parcel to Opus Overseas Head Office in Hyderabad.' },
              { step: '04', title: 'Stamping & Return Delivery', desc: 'We execute State HRD, MEA, and Embassy stamps, returning originals in tamper-evident pouch.' },
            ].map((s) => (
              <div key={s.step} className="clay-card p-5 relative">
                <span className="font-mono text-2xl font-black text-brand-gold block mb-2">{s.step}</span>
                <h3 className="font-display text-sm font-bold text-brand-navy">{s.title}</h3>
                <p className="text-xs text-brand-textLight leading-relaxed mt-1.5">{s.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* OFFICIAL QUOTE & DISPATCH INSTRUCTIONS INTAKE (Connected to /api/public/leads) */}
      <section id="quote-form" className="bg-white py-20 border-t border-brand-navy/10">
        <div className="mx-auto max-w-3xl px-5 sm:px-6">
          <div className="glass-light p-8 sm:p-10 rounded-3xl shadow-2xl border border-brand-navy/10">
            <div className="text-center mb-8">
              <span className="gold-dot mb-2" />
              <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-brand-navy">
                Request Official Quote & Dispatch Instructions
              </h2>
              <p className="text-xs sm:text-sm text-brand-textLight mt-1">
                Receive the verified fee ledger, document checklist, and our Hyderabad office dispatch address.
              </p>
            </div>

            <form onSubmit={handleSubmitAttestation} className="space-y-4 lead-form-wrap">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[13px] font-bold uppercase tracking-wider text-brand-textLight mb-1">Document Holder Name</label>
                  <input required placeholder="As printed on certificate" value={clientName} onChange={(e) => setClientName(e.target.value)} />
                </div>
                <div>
                  <label className="block text-[13px] font-bold uppercase tracking-wider text-brand-textLight mb-1">Phone Number (with WhatsApp)</label>
                  <input required type="tel" placeholder="+91 98765 00001" value={clientPhone} onChange={(e) => setClientPhone(e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[13px] font-bold uppercase tracking-wider text-brand-textLight mb-1">Email Address</label>
                  <input required type="email" placeholder="you@example.com" value={clientEmail} onChange={(e) => setClientEmail(e.target.value)} />
                </div>
                <div>
                  <label className="block text-[13px] font-bold uppercase tracking-wider text-brand-textLight mb-1">Certificate Type</label>
                  <input required placeholder="e.g. B.Tech Degree, Birth Cert" value={documentType} onChange={(e) => setDocumentType(e.target.value)} />
                </div>
                <div>
                  <label className="block text-[13px] font-bold uppercase tracking-wider text-brand-textLight mb-1">Target Country</label>
                  <input required placeholder="e.g. UAE, Saudi, USA" value={selectedCountry} onChange={(e) => setSelectedCountry(e.target.value)} />
                </div>
              </div>

              <div>
                <label className="block text-[13px] font-bold uppercase tracking-wider text-brand-textLight mb-1">Return Delivery Postal Address (India)</label>
                <textarea required rows={2} placeholder="House / Office address, Landmark, City, Pincode for return delivery" value={returnAddress} onChange={(e) => setReturnAddress(e.target.value)} />
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
                    I authorize Opus Overseas to evaluate my certificate for government apostille & embassy legalization under strict chain of custody.
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
                {submitting ? 'Generating Official Quote & Dispatch Pack…' : 'Request Official Quote & Dispatch Instructions →'}
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* GEO & AEO KNOWLEDGE HUB + FAQS */}
      <GeoFaqSection
        badge="Legalization & Verification Intelligence"
        title="Document Attestation Frequently Asked Questions"
        subtitle="Authoritative answers regarding State HRD, SDM, MEA Apostille, Embassy stamping, and courier chain-of-custody."
        summaryTitle="Document Attestation & Apostille Services by Opus Overseas"
        summaryText="Opus Overseas provides certified government legalization, Hague Apostille, State HRD/Home Department, and Embassy stamping services for educational degrees, personal certificates, and commercial legal documents with insured door-to-door pan-India pickup and live tracking."
        faqs={ATTESTATION_FAQS}
      />

      <InteractiveFunnelModal
        isOpen={funnelOpen}
        onClose={() => setFunnelOpen(false)}
        initialDivision="attestation"
      />
      <Footer />
    </div>
  );
}
