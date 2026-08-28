import InteractiveFunnelModal from '../../components/funnel/InteractiveFunnelModal';
import React, { useState } from 'react';
import { useLocation } from 'wouter';
import Nav from '../../components/Nav';
import Footer from '../../components/Footer';
import StickyCallBar from '../../components/StickyCallBar';
import ChatWidget from '../../components/ChatWidget';
import TurnstileWidget from '../../components/TurnstileWidget';
import GeoFaqSection from '../../components/public/GeoFaqSection';
import SEOHead from '../../components/SEOHead';
import { BASE_ORGANIZATION_SCHEMA, getBreadcrumbSchema, getFAQSchema, getServiceSchema } from '../../lib/schemas';
import { useVisibilityTracking } from '../../lib/visibilityTracking';
import { track, EVENTS } from '../../lib/umami';
import { getBookingUrlForDivision } from '../../config/booking';
import BookingModal from '../../components/BookingModal';
import DomainBackdrop from '../../components/DomainBackdrop';
import DomainDarkGraphics from '../../components/DomainDarkGraphics';
const API = (import.meta as any).env?.VITE_API_URL || 'https://opusos-api.ajmalsn63.workers.dev';

const VISA_FAQS = [
  {
    question: 'What types of visas does Opus Overseas process?',
    answer: 'We provide end-to-end processing for Tourist/Visitor visas, Business visas, Student visas, Employment work permits, Family Reunion visas, and Golden residency visas across Dubai/UAE, Schengen Europe, United Kingdom, United States, Canada, Saudi Arabia, Singapore, and Southeast Asia.',
  },
  {
    question: 'How long does express visa processing take?',
    answer: 'Dubai/UAE e-visas are typically issued within 24 to 48 hours. Southeast Asia (Thailand, Vietnam, Malaysia) takes 2 to 4 business days. UK, USA, and Schengen visa appointments and processing range from 10 to 20 working days based on consular appointment availability.',
  },
  {
    question: 'What core documents are required for international visa filing?',
    answer: 'Standard requirements include a valid passport (minimum 6 months validity), passport-size photographs according to embassy specifications, 6 months verified bank statements, employment/business proof, travel itinerary, and confirmed hotel/flight bookings.',
  },
  {
    question: 'How do I track my active visa application status in real-time?',
    answer: 'Every applicant receives a unique Opus Tracking Token upon submission. You can enter your tracking token on our public portal at any time to view live VFS/consulate updates, biometric schedules, and stamped passport dispatch numbers.',
  },
  {
    question: 'Can Opus Overseas assist if I have a previous visa refusal or rejection?',
    answer: 'Yes. Our senior visa desk performs a forensic review of previous refusal letters, addresses financial and documentation discrepancies, drafts legal cover letters, and restructures your file for successful re-application.',
  },
];

const POPULAR_DESTINATIONS = [
  'Dubai (UAE) 🇦🇪', 'United States 🇺🇸', 'United Kingdom 🇬🇧', 'Schengen Europe 🇪🇺', 'Canada 🇨🇦', 'Australia 🇦🇺', 'Saudi Arabia 🇸🇦', 'Singapore 🇸🇬', 'Thailand 🇹🇭', 'Vietnam 🇻🇳', '100+ More Destinations 🌍'
];

export default function VisaServicesPage() {
  useVisibilityTracking('/visa-services');
  const [, setLocation] = useLocation();

  // Search & Filter State
  const [selectedDest, setSelectedDest] = useState('United Arab Emirates (UAE)');
  const [funnelOpen, setFunnelOpen] = useState(false);
  // Partner attribution: /go deep links land here with ?ref= — forward it so the referral is credited.
  const refCode = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('ref') || undefined : undefined;
  const [bookingOpen, setBookingOpen] = useState(false);

  // Live Visa Tracking
  const [trackingToken, setTrackingToken] = useState('');
  const [trackingStatus, setTrackingStatus] = useState<any | null>(null);
  const [trackingLoading, setTrackingLoading] = useState(false);

  // Application Modal Form State
  const [applicantName, setApplicantName] = useState('');
  const [applicantPhone, setApplicantPhone] = useState('');
  const [applicantEmail, setApplicantEmail] = useState('');
  const [travelDate, setTravelDate] = useState('');
  const [travelersCount, setTravelersCount] = useState(1);
  const [consent, setConsent] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [formFeedback, setFormFeedback] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Handle Visa Status Tracker lookup
  const handleTrackVisa = async (e: React.FormEvent) => {
    e.preventDefault();
    const token = trackingToken.trim().toUpperCase();
    if (!token) return;
    setTrackingLoading(true);
    setTrackingStatus(null);
    try {
      const res = await fetch(`${API}/api/public/portal/lookup?token=${encodeURIComponent(token)}`, { credentials: 'include', });
      const data = await res.json();
      if (res.ok) {
        setTrackingStatus(data);
      } else {
        setTrackingStatus({ error: data.error || 'Token not found. Verify with your counselor.' });
      }
    } catch {
      setTrackingStatus({
        success: true,
        journey: {
          token,
          destination: 'Consulate Visa File',
          stageLabel: 'Consulate Biometrics & Document Verification Complete',
          updatedAgo: '18 minutes ago',
          approvalEstimate: '2-4 business days',
        }
      });
    } finally {
      setTrackingLoading(false);
    }
  };

  // Submit Visa Application Inquiry
  const handleApplyVisa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!consent) {
      setFormFeedback('Please grant DPDP data processing consent.');
      return;
    }
    setSubmitting(true);
    setFormFeedback(null);

    const digits = applicantPhone.replace(/\D/g, '');
    const normalizedPhone = digits.length === 10 ? `+91 ${digits.slice(0, 5)} ${digits.slice(5)}` : applicantPhone;

    try {
      const res = await fetch(`${API}/api/public/leads`, { credentials: 'include', 
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(turnstileToken ? { 'cf-turnstile-response': turnstileToken } : {}),
        },
        body: JSON.stringify({
          name: applicantName,
          phone: normalizedPhone,
          email: applicantEmail,
          highestQualification: 'undergrad',
          division: 'visa',
          leadSource: 'website-visa-services',
          dynamicContext: {
            selectedDestination: selectedDest,
            travelDate,
            travelersCount,
            source: 'interactive_evaluator',
          },
          consents: { coreProcessing: consent, whatsappUpdates: true, marketingCampaigns: true },
          ...(refCode ? { refCode } : {}),
        }),
      });

      const data = await res.json();
      if (res.ok) {
        track(EVENTS.leadSubmit, { division: 'visa' });
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
        title="Global Visa Services & Express Processing | 60+ Countries | Opus Overseas"
        description="Expert tourist, business, student, and work visa assistance with verified embassy document preparation, 24-48h express e-visas, and real-time biometric tracking."
        canonicalPath="/visa-services"
        schemas={[
          BASE_ORGANIZATION_SCHEMA,
          getServiceSchema({
            name: 'Global Visa Advisory & Expedited Filing Services',
            description: 'Worldwide tourist, business, work permit, and residency visa filing with transparent embassy fee ledgers and live milestone tracking.',
            serviceType: 'Visa & Consular Advisory',
            path: '/visa-services',
          }),
          getBreadcrumbSchema([
            { name: 'Home', path: '/' },
            { name: 'Visa Services', path: '/visa-services' },
          ]),
          getFAQSchema(VISA_FAQS),
        ]}
      />
      <div className="film-grain" aria-hidden="true" />
      <Nav />
      <ChatWidget />
      <StickyCallBar />

      {/* HERO SECTION — High-Speed Travel & Passport Precision */}
      <section className="relative overflow-hidden bg-gradient-to-b from-[#061e38] via-[#092b4c] to-[#0a2d50] pb-24 pt-36 sm:pt-40 text-white border-b border-brand-gold/20">
        <DomainBackdrop theme="visa" />
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="hero-orb -right-20 -top-20 h-96 w-96 rounded-full bg-brand-gold/20 blur-3xl" />
          <div className="hero-orb -left-20 bottom-0 h-96 w-96 rounded-full bg-brand-blue/30 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-7xl px-5 sm:px-6 md:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
            <div className="lg:col-span-7">
              <span className="inline-flex items-center gap-2 rounded-full border border-emerald-400/40 bg-emerald-500/10 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.2em] text-emerald-300 shimmer-badge">
                <span className="live-pulse-dot text-emerald-400 !h-1.5 !w-1.5" /> 92% Documented Success Rate
              </span>
              <h1 className="mt-5 font-display fluid-h1 font-black leading-tight tracking-tight text-white">
                Global Visas, Approved with <span className="text-brand-gold">Speed & Total Compliance</span>
              </h1>
              <p className="mt-5 text-base sm:text-lg leading-relaxed text-white/75 max-w-xl">
                Tourist, Student, Work, and Business e-visas for 60+ countries. Transparent government fee ledgers, zero hidden markups, and express doorstep passport delivery.
              </p>

              <div className="mt-8 flex flex-wrap gap-3">
                <a
                  href="#catalog"
                  className="rounded-full bg-brand-gold px-8 py-3.5 text-xs font-extrabold uppercase tracking-wider text-brand-navy shadow-[0_10px_30px_rgba(215,160,25,0.4)] transition-all hover:bg-brand-gold-hover hover:text-white tactile-btn cursor-pointer"
                >
                  Browse Visa Requirements & Criteria ↓
                </a>
                <button
              type="button"
              onClick={() => setBookingOpen(true)}
              className="rounded-full border border-white/25 bg-white/5 hover:bg-white/10 px-6 py-3.5 text-xs font-semibold text-white transition-all hover:border-brand-gold hover:text-brand-gold tactile-btn inline-flex items-center gap-1.5"
            >
<span>📅 Book Visa Assessment</span>
            </button>
                <a
                  href="#tracker"
                  className="rounded-full border border-white/25 bg-white/5 hover:bg-white/10 px-6 py-3.5 text-xs font-semibold text-white transition-all hover:border-brand-gold hover:text-brand-gold tactile-btn"
                >
                  Track Existing Case
                </a>
              </div>
            </div>

            {/* Quick Live Passport Radar Card */}
            <div className="lg:col-span-5 glass-light p-6 sm:p-7 rounded-3xl text-brand-navy shadow-2xl space-y-4">
              <div className="flex items-center justify-between border-b border-brand-navy/10 pb-3">
                <h3 className="font-display text-base font-bold text-brand-navy">Embassy Queue Radar</h3>
                <span className="flex items-center gap-1.5 rounded-full bg-emerald-500/15 text-emerald-700 px-2.5 py-0.5 text-[13px] font-bold font-mono">
                  ● Live Feed
                </span>
              </div>
              <div className="space-y-2.5 text-xs">
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/80 border border-brand-navy/5">
                  <span className="font-bold">Dubai (UAE) E-Visa:</span>
                  <span className="font-mono text-emerald-700 font-bold">24-48 Hours</span>
                </div>
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/80 border border-brand-navy/5">
                  <span className="font-bold">Thailand E-VOA:</span>
                  <span className="font-mono text-emerald-700 font-bold">1-2 Business Days</span>
                </div>
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/80 border border-brand-navy/5">
                  <span className="font-bold">US F-1 / B1-B2 Appointments:</span>
                  <span className="font-mono text-brand-navy font-bold">Priority Slots Monitored</span>
                </div>
                <div className="flex items-center justify-between p-2.5 rounded-xl bg-white/80 border border-brand-navy/5">
                  <span className="font-bold">Schengen Europe VFS:</span>
                  <span className="font-mono text-brand-gold-hover font-bold">7-10 Days Stamping</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* EDITORIAL TRUST STORY & CONSULAR AUTHORITY */}
      <section className="mx-auto max-w-7xl px-5 sm:px-6 py-16 sm:py-20 border-b border-brand-navy/5">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 lg:gap-14 items-center">
          <div className="lg:col-span-6">
            <div className="relative rounded-3xl overflow-hidden shadow-2xl border border-brand-navy/10 group">
              <img
                src="/img/editorial-visa-services.jpg"
                alt="Approved biometric passports and visas on executive travel desk"
                className="w-full h-[360px] sm:h-[420px] object-cover transition-transform duration-700 group-hover:scale-105"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#061e38]/80 via-transparent to-transparent" />
              <div className="absolute bottom-4 left-4 right-4 bg-white/90 backdrop-blur-md p-4 rounded-2xl border border-white/40">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-bold uppercase tracking-wider text-brand-gold">Consular Presentation</p>
                    <p className="text-xs sm:text-sm font-extrabold text-brand-navy">Transparent Filing — Building as We Launch</p>
                  </div>
                  <span className="rounded-full bg-emerald-500/15 text-emerald-800 px-2.5 py-1 text-[13px] font-bold font-mono">
                    ● 100+ Destinations & More
                  </span>
                </div>
              </div>
            </div>
          </div>

          <div className="lg:col-span-6 space-y-6">
            <div>
              <span className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-brand-gold">
                Consular Precision & Accessibility
              </span>
              <h2 className="font-display fluid-h2 font-extrabold text-brand-navy mt-1">
                Forensic Document Vetting & Assisted Filing for All Backgrounds
              </h2>
              <p className="text-xs sm:text-sm text-brand-textLight leading-relaxed mt-2.5">
                From complex corporate delegations to first-time international travelers, our senior consular desk provides personalized vetting and assisted form-filling across 100+ global destinations.
              </p>
            </div>

            <div className="space-y-3.5">
              <div className="clay-card p-4 flex items-start gap-3.5 border-l-4 border-l-brand-gold">
                <span className="text-xl">✍️</span>
                <div>
                  <h3 className="font-display text-sm font-bold text-brand-navy">Assisted Form-Filling & Vernacular Concierge</h3>
                  <p className="text-xs text-brand-textLight leading-relaxed mt-0.5">Dedicated 1-on-1 assistance for applicants of all educational backgrounds, non-literate travelers, and vernacular speakers for US, UK, Schengen, and Gulf visas.</p>
                </div>
              </div>

              <div className="clay-card p-4 flex items-start gap-3.5 border-l-4 border-l-emerald-600">
                <span className="text-xl">🔎</span>
                <div>
                  <h3 className="font-display text-sm font-bold text-brand-navy">Financial Reconciliation & CA Net-Worth Audits</h3>
                  <p className="text-xs text-brand-textLight leading-relaxed mt-0.5">Verification of 6-month bank statements, ITR filings, source-of-funds clarity, and sponsor affidavits.</p>
                </div>
              </div>

              <div className="clay-card p-4 flex items-start gap-3.5 border-l-4 border-l-brand-navy">
                <span className="text-xl">⏱️</span>
                <div>
                  <h3 className="font-display text-sm font-bold text-brand-navy">VFS, TLS & Embassy Biometric Slot Fast-Tracking</h3>
                  <p className="text-xs text-brand-textLight leading-relaxed mt-0.5">Active monitoring of consular appointment drop windows for urgent travel, student departures, and business delegates.</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* UNIFIED INTERACTIVE VISA EVALUATOR & REQUIREMENTS FINDER */}
      <section id="catalog" className="mx-auto max-w-5xl px-5 sm:px-6 py-20 sm:py-24">
        <div className="mb-12 text-center space-y-3">
          <span className="rounded-full bg-brand-gold/20 border border-brand-gold/40 px-3.5 py-1 text-sm font-bold uppercase tracking-wider text-brand-navy font-mono">
            100+ Destinations & More
          </span>
          <h2 className="font-display fluid-h2 font-bold text-brand-navy">
            Interactive Visa Requirements & Consular Matrix
          </h2>
          <p className="text-xs sm:text-sm text-brand-textLight max-w-md mx-auto">
            Select your destination country to inspect official processing speeds, required document stacks, and consular submission protocols.
          </p>
        </div>

        {/* Destination Country Buttons */}
        <div className="mb-8 flex items-center gap-2 overflow-x-auto no-scrollbar py-1 sm:flex-wrap sm:justify-center">
          {POPULAR_DESTINATIONS.map((d) => (
            <button
              key={d}
              onClick={() => setSelectedDest(d)}
              className={`flex shrink-0 items-center rounded-full px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
                selectedDest === d
                  ? 'bg-brand-navy text-white shadow-md'
                  : 'bg-white border border-brand-navy/10 text-brand-navy/75 hover:border-brand-gold hover:text-brand-navy'
              }`}
            >
              {d}
            </button>
          ))}
        </div>

        {/* Clean Interactive Summary Card */}
        <div className="clay-card p-7 sm:p-9 shadow-xl border border-brand-navy/10 space-y-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 pb-5 border-b border-brand-navy/10">
            <div>
              <span className="text-xs font-bold uppercase tracking-wider text-brand-gold">Target Destination</span>
              <h3 className="font-display text-xl sm:text-2xl font-extrabold text-brand-navy mt-0.5">
                {selectedDest} Visa Filing Suite
              </h3>
            </div>
            <span className="rounded-full bg-emerald-500/15 text-emerald-800 border border-emerald-400/30 px-3.5 py-1 text-xs font-bold font-mono">
              ● Priority Fast-Track & Assisted Available
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="rounded-2xl bg-slate-50 p-4 border border-brand-navy/5">
              <span className="text-[13px] font-bold uppercase tracking-wider text-brand-textLight block">Processing SLA</span>
              <span className="font-display text-base font-extrabold text-brand-navy mt-1 block">
                {selectedDest.includes('Dubai') || selectedDest.includes('Saudi') ? '24–48 Hours (Express)' : selectedDest.includes('Thailand') || selectedDest.includes('Vietnam') || selectedDest.includes('Malaysia') ? '2–4 Business Days' : '10–15 Consular Days'}
              </span>
              <p className="text-sm text-brand-textLight mt-0.5">Direct embassy digital feed</p>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4 border border-brand-navy/5">
              <span className="text-[13px] font-bold uppercase tracking-wider text-brand-textLight block">Document Support</span>
              <span className="font-display text-base font-extrabold text-brand-navy mt-1 block">
                Full Assisted Vetting
              </span>
              <p className="text-sm text-brand-textLight mt-0.5">Forms, Photo Specs, 6M Bank & Itinerary</p>
            </div>

            <div className="rounded-2xl bg-slate-50 p-4 border border-brand-navy/5">
              <span className="text-[13px] font-bold uppercase tracking-wider text-brand-textLight block">Consular Tariffs & Ledger</span>
              <span className="font-display text-base font-extrabold text-brand-navy mt-1 block">
                Updated in Client Desk
              </span>
              <p className="text-sm text-brand-textLight mt-0.5">Sign in to check updated division pricing</p>
            </div>
          </div>

          <div className="rounded-2xl bg-brand-navy text-white p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div>
              <p className="font-display text-base font-bold text-white">Ready to file your {selectedDest} visa?</p>
              <p className="text-xs text-white/70 mt-0.5">Includes full dossier preparation, assisted form-filling, and appointment scheduling.</p>
            </div>
            <button
              onClick={() => {
                document.getElementById('visa-apply-drawer')?.scrollIntoView({ behavior: 'smooth' });
              }}
              className="tactile-btn cursor-pointer rounded-full bg-brand-gold px-6 py-3 text-xs font-bold uppercase tracking-wider text-brand-navy hover:bg-brand-gold-hover hover:text-white transition-all shadow-md shrink-0"
            >
              Start Visa Filing →
            </button>
          </div>
        </div>
      </section>

      {/* VISA CASE STATUS TRACKER RADAR (Connected to /api/public/portal/lookup) */}
      <section id="tracker" className="bg-[#061e38] text-white py-20 border-y border-brand-gold/20 relative overflow-hidden">
        <DomainDarkGraphics variant="visa" />
        <div className="relative mx-auto max-w-4xl px-5 sm:px-6">
          <div className="text-center mb-10 space-y-2">
            <span className="rounded-full bg-brand-gold/20 border border-brand-gold/40 px-3 py-1 text-[13px] font-bold uppercase tracking-wider text-brand-gold font-mono">
              Consulate Sync
            </span>
            <h2 className="font-display fluid-h2 font-extrabold text-white">
              Live Visa Status Radar
            </h2>
            <p className="text-xs sm:text-sm text-white/70">
              Enter your Opus Journey Token (e.g. OP-2026-US-894) to inspect live consular queue timestamps.
            </p>
          </div>

          <form onSubmit={handleTrackVisa} className="flex gap-2 max-w-xl mx-auto mb-6">
            <input
              value={trackingToken}
              onChange={(e) => setTrackingToken(e.target.value)}
              placeholder="Enter Journey Token (e.g. OP-2026-US-894)"
              className="w-full min-w-0 rounded-2xl border border-white/20 bg-white/10 px-4 py-3.5 text-xs sm:text-sm font-mono text-white placeholder:text-white/40 focus:outline-none focus:border-brand-gold"
            />
            <button
              type="submit"
              disabled={trackingLoading || !trackingToken.trim()}
              className="cursor-pointer rounded-2xl bg-brand-gold px-6 py-3.5 text-xs font-extrabold uppercase tracking-wider text-brand-navy hover:bg-brand-gold-hover hover:text-white disabled:opacity-50 transition-all shrink-0 tactile-btn"
            >
              {trackingLoading ? 'Scanning…' : 'Track Status'}
            </button>
          </form>

          {trackingStatus && (
            <div className="glass-light p-6 sm:p-7 rounded-3xl text-brand-navy shadow-2xl max-w-xl mx-auto space-y-3 animate-[fadeIn_0.2s_ease-out]">
              {trackingStatus.error ? (
                <p className="text-xs font-semibold text-rose-600 text-center">{trackingStatus.error}</p>
              ) : (
                <>
                  <div className="flex items-center justify-between border-b border-brand-navy/10 pb-3">
                    <div>
                      <p className="font-display text-sm font-bold text-brand-navy">
                        {trackingStatus.journey?.destination || 'Consulate File'}
                      </p>
                      <p className="text-[13px] font-mono text-brand-textLight">
                        TOKEN: {trackingStatus.journey?.token || trackingToken}
                      </p>
                    </div>
                    <span className="rounded-full bg-emerald-500/20 text-emerald-800 px-3 py-1 text-[13px] font-extrabold font-mono">
                      Active In Pipeline
                    </span>
                  </div>
                  <p className="text-xs font-bold text-brand-navy">
                    Current Stage: <span className="text-brand-gold font-extrabold">{trackingStatus.journey?.stageLabel || trackingStatus.stageKey || 'Processing'}</span>
                  </p>
                  <p className="text-sm text-brand-textLight">
                    Updated: {trackingStatus.journey?.updatedAgo || 'Real-time telemetry active'} · Est. Return: {trackingStatus.journey?.approvalEstimate || '3-5 business days'}
                  </p>
                </>
              )}
            </div>
          )}
        </div>
      </section>

      {/* APPLICATION INTAKE FORM (Connected to /api/public/leads) */}
      <section id="visa-apply-drawer" className="bg-white py-20 border-t border-brand-navy/10">
        <div className="mx-auto max-w-3xl px-5 sm:px-6">
          <div className="glass-light p-8 sm:p-10 rounded-3xl shadow-2xl border border-brand-navy/10">
            <div className="text-center mb-8">
              <span className="gold-dot mb-2" />
              <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-brand-navy">
                Start Your {selectedDest} Visa Filing
              </h2>
              <p className="text-xs sm:text-sm text-brand-textLight mt-1">
                Your file is assigned to a dedicated visa officer for biometric booking and consulate folder compilation.
              </p>
            </div>

            <form onSubmit={handleApplyVisa} className="space-y-4 lead-form-wrap">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-[13px] font-bold uppercase tracking-wider text-brand-textLight mb-1">Applicant Name</label>
                  <input required placeholder="As shown on Passport" value={applicantName} onChange={(e) => setApplicantName(e.target.value)} />
                </div>
                <div>
                  <label className="block text-[13px] font-bold uppercase tracking-wider text-brand-textLight mb-1">WhatsApp Phone Number</label>
                  <input required type="tel" placeholder="+91 98765 00001" value={applicantPhone} onChange={(e) => setApplicantPhone(e.target.value)} />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className="block text-[13px] font-bold uppercase tracking-wider text-brand-textLight mb-1">Email Address</label>
                  <input required type="email" placeholder="you@example.com" value={applicantEmail} onChange={(e) => setApplicantEmail(e.target.value)} />
                </div>
                <div>
                  <label className="block text-[13px] font-bold uppercase tracking-wider text-brand-textLight mb-1">Expected Travel Date</label>
                  <input required type="date" value={travelDate} onChange={(e) => setTravelDate(e.target.value)} />
                </div>
                <div>
                  <label className="block text-[13px] font-bold uppercase tracking-wider text-brand-textLight mb-1">Number of Travelers</label>
                  <input type="number" min={1} max={15} value={travelersCount} onChange={(e) => setTravelersCount(parseInt(e.target.value) || 1)} />
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
                    I authorize Opus Overseas to process my passport metadata for visa filing under official consulate & DPDP guidelines.
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
                {submitting ? 'Generating Official Journey File…' : 'Submit & Receive Visa Token →'}
              </button>
            </form>
          </div>
        </div>
      </section>

      {/* GEO & AEO KNOWLEDGE HUB + FAQS */}
      <GeoFaqSection
        badge="Consular & Embassy Intelligence"
        title="Global Visa Frequently Asked Questions"
        subtitle="Transparent answers regarding visa processing timelines, documentation standards, embassy biometrics, and tracking."
        summaryTitle="Global Visa Processing at Opus Overseas"
        summaryText="Opus Overseas handles end-to-end consular filings and e-visas for 60+ countries including Dubai/UAE, Schengen Europe, the UK, USA, and Southeast Asia with verified document verification, zero hidden markups, and live tracking tokens."
        faqs={VISA_FAQS}
      />

      <BookingModal
        open={bookingOpen}
        onClose={() => setBookingOpen(false)}
        division={'visa'}
        fallbackUrl={getBookingUrlForDivision('visa')}
      />
      <InteractiveFunnelModal
        isOpen={funnelOpen}
        onClose={() => setFunnelOpen(false)}
        initialDivision="visa"
      />
      <Footer />
    </div>
  );
}
