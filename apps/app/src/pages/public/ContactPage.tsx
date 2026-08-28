import React, { useState } from 'react';
import { useLocation } from 'wouter';
import Nav from '../../components/Nav';
import Footer from '../../components/Footer';
import StickyCallBar from '../../components/StickyCallBar';
import ChatWidget from '../../components/ChatWidget';
import TurnstileWidget from '../../components/TurnstileWidget';
import GeoFaqSection from '../../components/public/GeoFaqSection';
import SEOHead from '../../components/SEOHead';
import { BASE_ORGANIZATION_SCHEMA, getBreadcrumbSchema, getFAQSchema } from '../../lib/schemas';
import { useVisibilityTracking } from '../../lib/visibilityTracking';
import { track, EVENTS } from '../../lib/umami';
const API = (import.meta as any).env?.VITE_API_URL || 'https://opusos-api.ajmalsn63.workers.dev';

const CONTACT_FAQS = [
  {
    question: 'Where is the official physical office of Opus Overseas located?',
    answer: 'Our main office is in Nizamabad — Telangana, India. We are easily accessible from Nizamabad and surrounding areas.',
  },
  {
    question: 'What are your operational working days and office hours?',
    answer: 'We are open Monday through Saturday from 9:30 AM to 6:30 PM (IST). We are closed on Sundays and designated national public holidays.',
  },
  {
    question: 'How can I schedule an urgent consultation with a senior advisor?',
    answer: 'You can call our direct helpline at +91 9398848376, message us on WhatsApp, or use our digital calendar booking tool to schedule an immediate 1-on-1 virtual or in-person session.',
  },
  {
    question: 'What is the fastest way to get email responses from your admissions or visa desk?',
    answer: 'You can email our official desk at contact@opusoverseas.com or submit the digital contact form. All queries are assigned an automated tracking ticket and answered within 2 to 4 business hours.',
  },
];

export default function ContactPage() {
  useVisibilityTracking('/contact');
  const [, setLocation] = useLocation();

  // Contact Form State
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [division, setDivision] = useState('general');
  const [subject, setSubject] = useState('');
  const [message, setMessage] = useState('');
  const [consent, setConsent] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);
  const [formFeedback, setFormFeedback] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [submittedToken, setSubmittedToken] = useState<string | null>(null);

  // Submit Contact Form
  const handleSubmitContact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!consent) {
      setFormFeedback('Please grant DPDP data processing consent.');
      return;
    }
    setSubmitting(true);
    setFormFeedback(null);

    const digits = phone.replace(/\D/g, '');
    const normalizedPhone = digits.length === 10 ? `+91 ${digits.slice(0, 5)} ${digits.slice(5)}` : phone;

    try {
      const res = await fetch(`${API}/api/public/leads`, { credentials: 'include', 
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(turnstileToken ? { 'cf-turnstile-response': turnstileToken } : {}),
        },
        body: JSON.stringify({
          name,
          phone: normalizedPhone,
          email,
          highestQualification: 'undergrad',
          division: division === 'general' ? 'study-abroad' : division,
          leadSource: 'website-contact-form',
          dynamicContext: {
            departmentSelected: division,
            subject,
            inquiryMessage: message,
          },
          consents: { coreProcessing: consent, whatsappUpdates: true, marketingCampaigns: true },
        }),
      });

      const data = await res.json();
      if (res.ok) {
        track(EVENTS.leadSubmit, { division: 'contact' });
        setSubmittedToken(data.token || 'OP-CONTACT');
      } else {
        setFormFeedback(data.error || 'Failed to submit inquiry.');
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
        title="Contact Opus Overseas | Nizamabad, Telangana Office & Global Advisory Desk"
        description="Contact Opus Overseas in Nizamabad, Telangana. Reach our certified study abroad counselors, visa specialists, and attestation team via phone, WhatsApp, or in-person visit."
        canonicalPath="/contact"
        schemas={[
          BASE_ORGANIZATION_SCHEMA,
          {
            '@type': 'ContactPage',
            '@id': 'https://opusoverseas.com/contact#contactpage',
            url: 'https://opusoverseas.com/contact',
            name: 'Contact Opus Overseas',
            description: 'Direct contact details, office location in Nizamabad, opening hours, and digital appointment booking.',
            mainEntity: {
              '@id': 'https://opusoverseas.com/#organization',
            },
          },
          getBreadcrumbSchema([
            { name: 'Home', path: '/' },
            { name: 'Contact Us', path: '/contact' },
          ]),
          getFAQSchema(CONTACT_FAQS),
        ]}
      />
      <div className="film-grain" aria-hidden="true" />
      <Nav />
      <ChatWidget />
      <StickyCallBar />

      {/* HERO SECTION */}
      <section className="relative overflow-hidden bg-gradient-to-b from-[#061e38] via-[#092b4c] to-[#0a2d50] pb-20 pt-36 sm:pt-40 text-white border-b border-brand-gold/20">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="hero-orb -right-20 -top-20 h-96 w-96 rounded-full bg-brand-gold/20 blur-3xl" />
          <div className="hero-orb -left-20 bottom-0 h-96 w-96 rounded-full bg-brand-blue/30 blur-3xl" />
        </div>

        <div className="relative mx-auto max-w-7xl px-5 sm:px-6 md:px-8 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-brand-gold/40 bg-brand-gold/10 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.2em] text-brand-gold shimmer-badge">
            💬 Global Support & Advisory Desk
          </span>
          <h1 className="mt-5 font-display fluid-h1 font-black leading-tight tracking-tight text-white max-w-3xl mx-auto">
            Get in Touch with Our <span className="text-brand-gold">Senior Advisory Team</span>
          </h1>
          <p className="mt-4 text-base sm:text-lg leading-relaxed text-white/75 max-w-xl mx-auto">
            Have a question about admissions, visas, spiritual travel, attestation, or international recruitment? We are here to assist you.
          </p>
        </div>
      </section>

      {/* MAIN CONTACT SECTION */}
      <section className="mx-auto max-w-7xl px-5 sm:px-6 py-16 sm:py-24">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-start">
          
          {/* Left Column: Quick Contact Cards */}
          <div className="lg:col-span-5 space-y-6">
            <div className="clay-card p-6 sm:p-7 space-y-6">
              <h2 className="font-display text-xl font-bold text-brand-navy border-b border-brand-navy/10 pb-3">
                Direct Channels
              </h2>

              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-gold/15 text-lg">
                  📞
                </div>
                <div>
                  <h3 className="font-display text-xs font-bold uppercase tracking-wider text-brand-textLight">Phone Assistance</h3>
                  <a href="tel:+919398848376" className="text-sm sm:text-base font-bold text-brand-navy hover:text-brand-gold transition-colors">
                    +91 93988 48376
                  </a>
                  <p className="text-sm text-brand-textLight mt-0.5">Mon – Sat: 9:30 AM to 6:30 PM IST</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-brand-gold/15 text-lg">
                  💬
                </div>
                <div>
                  <h3 className="font-display text-xs font-bold uppercase tracking-wider text-brand-textLight">Live Chat & Support</h3>
                  <button 
                    type="button"
                    onClick={() => {
                      if (typeof window !== 'undefined' && (window as any).$chatwoot) {
                        (window as any).$chatwoot.toggle();
                      }
                    }}
                    className="cursor-pointer text-sm sm:text-base font-bold text-brand-navy hover:text-brand-gold transition-colors text-left"
                  >
                    Open Live Chatwoot Desk →
                  </button>
                  <p className="text-sm text-brand-textLight mt-0.5">Instant counselor assistance & case tracking</p>
                </div>
              </div>

              <div className="flex items-start gap-4">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-sky-500/15 text-lg">
                  ✉️
                </div>
                <div>
                  <h3 className="font-display text-xs font-bold uppercase tracking-wider text-brand-textLight">Official Email</h3>
                  <a href="mailto:info@opusoverseas.com" className="text-sm sm:text-base font-bold text-brand-navy hover:text-brand-gold transition-colors">
                    info@opusoverseas.com
                  </a>
                  <p className="text-sm text-brand-textLight mt-0.5">Response within 2-4 business hours</p>
                </div>
              </div>
            </div>

            {/* Department Routing Matrix */}
            <div className="clay-card p-6 space-y-3">
              <h3 className="font-display text-sm font-bold text-brand-navy">
                Specialized Division Direct Desks
              </h3>
              <ul className="space-y-2 text-xs text-brand-navy/80">
                <li className="flex justify-between border-b border-brand-navy/5 pb-1.5">
                  <span>Admissions & Universities:</span>
                  <span className="font-semibold text-brand-navy">admissions@opusoverseas.com</span>
                </li>
                <li className="flex justify-between border-b border-brand-navy/5 pb-1.5">
                  <span>Consular & Visas:</span>
                  <span className="font-semibold text-brand-navy">visas@opusoverseas.com</span>
                </li>
                <li className="flex justify-between border-b border-brand-navy/5 pb-1.5">
                  <span>Umrah & Sacred Travel:</span>
                  <span className="font-semibold text-brand-navy">umrah@opusoverseas.com</span>
                </li>
                <li className="flex justify-between">
                  <span>Apostille & Legalization:</span>
                  <span className="font-semibold text-brand-navy">attestation@opusoverseas.com</span>
                </li>
              </ul>
            </div>


          </div>

          {/* Right Column: Contact & Inquiry Form */}
          <div className="lg:col-span-7">
            <div className="glass-light p-8 sm:p-10 rounded-3xl shadow-2xl border border-brand-navy/10">
              {submittedToken ? (
                /* Success Confirmation State */
                <div className="text-center py-8 space-y-5 animate-[fadeIn_0.3s_ease-out]">
                  <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-3xl text-emerald-600">
                    ✓
                  </div>
                  <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-brand-navy">
                    Inquiry Received!
                  </h2>
                  <div className="rounded-2xl bg-emerald-50 border border-emerald-200 p-5 text-left max-w-md mx-auto space-y-2">
                    <p className="text-sm font-bold text-emerald-900">
                      We will get back to you shortly.
                    </p>
                    <p className="text-xs text-emerald-800 leading-relaxed">
                      A senior counselor from our <span className="font-bold uppercase">{division}</span> desk has been assigned to your request and will contact you via WhatsApp and email.
                    </p>
                    <div className="pt-2 border-t border-emerald-200/60 flex items-center justify-between text-xs">
                      <span className="text-emerald-700">Journey Token:</span>
                      <span className="font-mono font-extrabold text-emerald-950">{submittedToken}</span>
                    </div>
                  </div>

                  <div className="flex flex-wrap justify-center gap-3 pt-2">
                    <button
                      onClick={() => setLocation(`/portal?token=${encodeURIComponent(submittedToken)}`)}
                      className="min-h-11 cursor-pointer rounded-full bg-brand-navy px-6 py-3 text-xs font-bold uppercase tracking-wider text-white hover:bg-brand-gold hover:text-brand-navy transition-all shadow-md tactile-btn sm:min-h-0"
                    >
                      Track in Journey Portal →
                    </button>
                    <button
                      onClick={() => {
                        setSubmittedToken(null);
                        setSubject('');
                        setMessage('');
                      }}
                      className="min-h-11 cursor-pointer rounded-full border border-brand-navy/20 bg-white px-6 py-3 text-xs font-bold text-brand-navy hover:bg-slate-100 transition-all sm:min-h-0"
                    >
                      Send Another Inquiry
                    </button>
                  </div>
                </div>
              ) : (
                /* Active Form State */
                <>
                  <div className="mb-8">
                    <span className="gold-dot mb-2" />
                    <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-brand-navy">
                      Send Us a Message
                    </h2>
                    <p className="text-xs sm:text-sm text-brand-textLight mt-1">
                      Fill in your query details below and our team will get back to you shortly.
                    </p>
                  </div>

                  <form onSubmit={handleSubmitContact} className="space-y-4 lead-form-wrap">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[13px] font-bold uppercase tracking-wider text-brand-textLight mb-1">Full Name</label>
                        <input required placeholder="e.g. Ramesh Reddy" value={name} onChange={(e) => setName(e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-[13px] font-bold uppercase tracking-wider text-brand-textLight mb-1">WhatsApp Phone Number</label>
                        <input required type="tel" placeholder="+91 98765 00001" value={phone} onChange={(e) => setPhone(e.target.value)} />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[13px] font-bold uppercase tracking-wider text-brand-textLight mb-1">Email Address</label>
                        <input required type="email" placeholder="you@example.com" value={email} onChange={(e) => setEmail(e.target.value)} />
                      </div>
                      <div>
                        <label className="block text-[13px] font-bold uppercase tracking-wider text-brand-textLight mb-1">Department / Division</label>
                        <select value={division} onChange={(e) => setDivision(e.target.value)}>
                          <option value="general">General Inquiry</option>
                          <option value="study-abroad">Study Abroad &amp; Admissions</option>
                          <option value="visa">Global Visa Services</option>
                          <option value="umrah">Tours &amp; Travels (Holidays &amp; Umrah)</option>
                          <option value="attestation">Document Attestation &amp; Apostille</option>
                          <option value="manpower">Overseas Recruitment &amp; Manpower</option>
                        </select>
                      </div>
                    </div>

                    <div>
                      <label className="block text-[13px] font-bold uppercase tracking-wider text-brand-textLight mb-1">Subject</label>
                      <input required placeholder="Brief description of your query" value={subject} onChange={(e) => setSubject(e.target.value)} />
                    </div>

                    <div>
                      <label className="block text-[13px] font-bold uppercase tracking-wider text-brand-textLight mb-1">Detailed Message</label>
                      <textarea required rows={4} placeholder="How can our specialists assist you today?" value={message} onChange={(e) => setMessage(e.target.value)} />
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
                          I consent to Opus Overseas storing my contact details to respond to my query under official DPDP privacy guidelines.
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
                      {submitting ? 'Transmitting Inquiry…' : 'Send Message →'}
                    </button>
                  </form>
                </>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* GEO & AEO KNOWLEDGE HUB + FAQS */}
      <GeoFaqSection
        badge="Contact & Office Intelligence"
        title="Contact & Location Frequently Asked Questions"
        subtitle="Helpful information regarding directions, working hours, and response time guarantees."
        summaryTitle="Connect with Opus Overseas"
        summaryText="Visit our headquarters in Nizamabad — Telangana or connect via phone (+91 9398848376) and email (contact@opusoverseas.com). We provide transparent guidance across education, visas, attestation, and manpower recruitment."
        faqs={CONTACT_FAQS}
      />

      <Footer />
    </div>
  );
}
