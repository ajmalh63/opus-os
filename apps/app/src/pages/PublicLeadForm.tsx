import React, { useState, useEffect } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import Nav from '../components/Nav';
import Footer from '../components/Footer';
import StickyCallBar from '../components/StickyCallBar';
import TurnstileWidget from '../components/TurnstileWidget';
import { track, EVENTS } from '../lib/umami';
import { prefersReducedMotion, animateHeadlineWords } from '../lib/motion';

const siteKeyConfigured = !!((import.meta.env.VITE_TURNSTILE_SITE_KEY as string) || '');

type Division = 'study-abroad' | 'visa' | 'umrah' | 'attestation' | 'manpower';

interface LeadPayload {
  name: string;
  phone: string;
  email: string;
  highestQualification: 'highschool' | 'undergrad' | 'postgrad';
  division: Division;
  dynamicContext: Record<string, any>;
  consents: {
    coreProcessing: boolean;
    whatsappUpdates: boolean;
    marketingCampaigns: boolean;
  };
}

export default function PublicLeadForm() {
  // Toast State
  const [toast, setToast] = useState<{ show: boolean; msg: string }>({ show: false, msg: '' });
  const showToast = (msg: string) => {
    setToast({ show: true, msg });
    setTimeout(() => setToast({ show: false, msg: '' }), 3500);
  };

  // Form State
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [highestQualification, setHighestQualification] = useState<'highschool' | 'undergrad' | 'postgrad' | ''>('');
  const [division, setDivision] = useState<Division>('study-abroad');

  // Dynamic fields state
  const [targetCountry, setTargetCountry] = useState('us');
  const [intakeSeason, setIntakeSeason] = useState('Fall 2027');
  const [leadCgpa, setLeadCgpa] = useState('');
  const [leadEnglishScore, setLeadEnglishScore] = useState('');
  const [leadTuitionBudget, setLeadTuitionBudget] = useState('');
  const [visaCategory, setVisaCategory] = useState('student');
  const [visaCountry, setVisaCountry] = useState('');
  const [umrahTier, setUmrahTier] = useState('deluxe');
  const [umrahDeparture, setUmrahDeparture] = useState('sep');
  const [attestationCategory, setAttestationCategory] = useState('educational');
  const [attestationAuth, setAttestationAuth] = useState('apostille');
  const [manpowerSector, setManpowerSector] = useState('healthcare');
  const [manpowerFile, setManpowerFile] = useState<File | null>(null);
  const [manpowerRetain, setManpowerRetain] = useState(false);

  // Consents State
const [consentProcessing, setConsentProcessing] = useState(false);
const [consentWhatsApp, setConsentWhatsApp] = useState(true);
const [consentMarketing, setConsentMarketing] = useState(true);

  // Turnstile state (real bot check; null = waiting for challenge)
  const [turnstileToken, setTurnstileToken] = useState<string | null>(null);

  // Search State
  const [searchPhone, setSearchPhone] = useState('');
  const [searchToken, setSearchToken] = useState('');
  const [searchParams, setSearchParams] = useState<{ phone: string; token: string } | null>(null);

  // Partner attribution: ?ref= (from /go/:ref/ share links or homepage links)
  const urlRef = typeof window !== 'undefined' ? new URLSearchParams(window.location.search).get('ref') || '' : '';
  const [refCode] = useState(urlRef);

  // Status Check Query
  const { data: statusData, isError: searchError, isFetching: searchFetching } = useQuery({
    queryKey: ['leadStatus', searchParams],
    queryFn: async () => {
      if (!searchParams) return null;
      const res = await fetch(`/api/public/leads/status?phone=${encodeURIComponent(searchParams.phone)}&token=${encodeURIComponent(searchParams.token)}`);
      if (!res.ok) {
        throw new Error(await res.text() || 'Application status check failed');
      }
      return res.json();
    },
    enabled: !!searchParams,
  });

  // Hero headline reveal
  useEffect(() => {
    if (prefersReducedMotion()) return;
    const el = document.querySelector('.lead-h1') as HTMLElement | null;
    if (el) animateHeadlineWords(el, { delay: 0.15 });
  }, []);

  // Submit Lead Mutation — uploads manpower resume first (if selected),
  // then submits the lead with the returned resumeKey.
  const leadMutation = useMutation({
    mutationFn: async (payload: LeadPayload & { resumeFile?: File | null }) => {
      let resumeKey: string | null = null;
      if (division === 'manpower' && payload.resumeFile) {
        const fd = new FormData();
        fd.append('resume', payload.resumeFile);
        const up = await fetch('/api/public/manpower/resume', {
          method: 'POST',
          headers: turnstileToken ? { 'cf-turnstile-response': turnstileToken } : {},
          body: fd,
        });
        if (!up.ok) {
          const e = await up.json().catch(() => null);
          throw new Error(e?.error || 'Resume upload failed');
        }
        const upJson = await up.json();
        resumeKey = upJson.resumeKey as string;
      }

      const res = await fetch('/api/public/leads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(turnstileToken ? { 'cf-turnstile-response': turnstileToken } : {}),
        },
        body: JSON.stringify({
          ...payload,
          dynamicContext: resumeKey ? { ...payload.dynamicContext, resumeFileKey: resumeKey } : payload.dynamicContext,
        }),
      });
      if (!res.ok) {
        throw new Error(await res.text() || 'Failed to submit lead');
      }
      return res.json();
    },
    onSuccess: (data) => {
      track(EVENTS.leadSubmit, { division, ref: refCode || undefined });
      showToast(`Success! Lead created. Access Token: ${data.token}`);
      // Auto fill search box
      setSearchPhone(phone);
      setSearchToken(data.token);
      setSearchParams({ phone, token: data.token });
    },
    onError: (err: any) => {
      showToast(`Error: ${err.message || 'Intake failed'}`);
    },
  });

  const handleFormSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!consentProcessing) {
      showToast('You must agree to DPDP processing consent to proceed.');
      return;
    }
    if (!highestQualification) {
      showToast('Please select your highest qualification.');
      return;
    }
    if (siteKeyConfigured && !turnstileToken) {
      showToast('Please complete the security check.');
      return;
    }

    // Prepare dynamic context
    let dynamicContext: Record<string, any> = {};
    if (division === 'study-abroad') {
      dynamicContext = { targetCountry, intakeSeason, cgpa: leadCgpa, englishScore: leadEnglishScore, tuitionBudget: leadTuitionBudget };
    } else if (division === 'visa') {
      dynamicContext = { visaCategory, visaCountry };
    } else if (division === 'umrah') {
      dynamicContext = { umrahTier, umrahDeparture };
    } else if (division === 'attestation') {
      dynamicContext = { attestationCategory, attestationAuth };
    } else if (division === 'manpower') {
      dynamicContext = { manpowerSector, manpowerRetain, resumeUploaded: !!manpowerFile };
    }

    const payload: LeadPayload = {
      name,
      phone,
      email,
      highestQualification,
      division,
      ...(refCode ? { refCode } : {}),
      dynamicContext,
      consents: {
        coreProcessing: consentProcessing,
        whatsappUpdates: consentWhatsApp,
        marketingCampaigns: consentMarketing,
      },
    };

    leadMutation.mutate({ ...payload, resumeFile: manpowerFile });
  };

  const handleStatusSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchPhone || !searchToken) {
      showToast('Please enter both phone number and token code.');
      return;
    }
    setSearchParams({ phone: searchPhone, token: searchToken });
  };

  const fillDemoSearch = () => {
    setSearchPhone('+91 98765 43210');
    setSearchToken('OP-2026-0814');
    setSearchParams({ phone: '+91 98765 43210', token: 'OP-2026-0814' });
    showToast('Demo search parameters loaded.');
  };

  return (
    <div className="bg-brand-cream text-brand-textDark font-sans min-h-screen flex flex-col justify-between">
      <div className="film-grain" aria-hidden="true" />
      <Nav />
      <StickyCallBar />

      {/* Premium hero band */}
      <section className="relative overflow-hidden bg-brand-navy pb-10 pt-32 text-white">
        <div className="pointer-events-none absolute inset-0" aria-hidden="true">
          <div className="hero-orb -right-16 -top-20 h-96 w-96 bg-brand-gold/15 blur-3xl" />
          <div className="hero-orb -left-24 bottom-0 h-80 w-80 bg-brand-blue/25 blur-3xl" />
        </div>
        <div className="relative mx-auto max-w-7xl px-5 md:px-8">
          <span className="inline-flex items-center gap-2 rounded-full border border-brand-gold/40 bg-brand-gold/10 px-4 py-1.5 text-xs font-bold uppercase tracking-[0.2em] text-brand-gold">
            Free · 60 Seconds · No Commitment
          </span>
          <h1 className="lead-h1 mt-6 font-display text-4xl font-extrabold leading-[1.05] tracking-tight md:text-5xl">
            Start Your Journey <span className="text-brand-gold">Today</span>
          </h1>
          <p className="mt-4 max-w-lg text-sm leading-relaxed text-white/70">
            Submit your details and get an instant journey token — then track your case live, any time.
          </p>
        </div>
      </section>

      {/* CONTENT CONTAINER */}
      <main className="max-w-7xl w-full mx-auto p-8 flex-1 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* LEFT SIDE: LEAD INTAKE FORM */}
        <section className="lead-form-wrap lg:col-span-7 clay-card !rounded-3xl p-8 flex flex-col gap-6">
          <div>
            <h2 className="font-display font-extrabold text-2xl text-brand-navy">Start Your Journey Today</h2>
            <p className="text-xs text-brand-textLight mt-1">Submit your details and get instant access to the Client Status tracking system.</p>
          </div>

          <form onSubmit={handleFormSubmit} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-brand-navy uppercase tracking-wider block mb-1">Full Name *</label>
                <input 
                  type="text" 
                  required 
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="John Doe" 
                  className="w-full text-xs p-2.5 border border-gray-300 rounded bg-brand-cream/10"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-brand-navy uppercase tracking-wider block mb-1">Phone Number *</label>
                <input 
                  type="tel" 
                  required 
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+91 XXXXX XXXXX" 
                  className="w-full text-xs p-2.5 border border-gray-300 rounded bg-brand-cream/10"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-xs font-bold text-brand-navy uppercase tracking-wider block mb-1">Email Address *</label>
                <input 
                  type="email" 
                  required 
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="john@example.com" 
                  className="w-full text-xs p-2.5 border border-gray-300 rounded bg-brand-cream/10"
                />
              </div>
              <div>
                <label className="text-xs font-bold text-brand-navy uppercase tracking-wider block mb-1">Highest Qualification *</label>
                <select 
                  required 
                  value={highestQualification}
                  onChange={(e) => setHighestQualification(e.target.value as any)}
                  className="w-full text-xs p-2.5 border border-gray-300 rounded bg-white font-medium"
                >
                  <option value="">-- Select Qualification --</option>
                  <option value="highschool">High School (12th)</option>
                  <option value="undergrad">Bachelors Degree</option>
                  <option value="postgrad">Masters Degree</option>
                </select>
              </div>
            </div>

            {/* Division Selector pills */}
            <div>
              <label className="text-xs font-bold text-brand-navy uppercase tracking-wider block mb-2">Service Division Interested *</label>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
{[
                  { id: 'study-abroad', label: '🎓 Study Abroad' },
                  { id: 'visa', label: '🛂 Visa Services' },
                  { id: 'umrah', label: '🕋 Umrah Travel' },
                  { id: 'attestation', label: '📜 Document Attestation' },
                  { id: 'manpower', label: '💼 Overseas Jobs' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => setDivision(item.id as Division)}
                    className={`p-2 border rounded text-xs font-semibold text-center transition ${
                      division === item.id 
                        ? 'border-brand-gold bg-brand-cream text-brand-navy' 
                        : 'border-gray-300 hover:border-brand-gold hover:bg-brand-cream'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {/* DYNAMIC FIELDS PANELS */}
            {division === 'study-abroad' && (
              <div className="p-4 bg-brand-cream rounded-lg border border-brand-gold/15 space-y-3">
                <h4 className="text-xs font-bold text-brand-navy uppercase tracking-wider">Study Abroad Choices</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] text-brand-textLight font-semibold uppercase block mb-1">Target Country</label>
                    <select 
                      value={targetCountry}
                      onChange={(e) => setTargetCountry(e.target.value)}
                      className="w-full text-xs p-2 border border-gray-300 rounded bg-white font-medium"
                    >
                      <option value="us">United States (USA)</option>
                      <option value="uk">United Kingdom (UK)</option>
                      <option value="ca">Canada</option>
                      <option value="au">Australia</option>
                      <option value="nz">New Zealand</option>
                      <option value="ie">Ireland</option>
                      <option value="de">Germany</option>
                      <option value="fr">France</option>
                      <option value="nl">Netherlands</option>
                      <option value="se">Sweden</option>
                      <option value="ch">Switzerland</option>
                      <option value="es">Spain</option>
                      <option value="it">Italy</option>
                      <option value="sg">Singapore</option>
                      <option value="my">Malaysia</option>
                      <option value="ae">Dubai (UAE)</option>
                      <option value="cn">China</option>
                      <option value="jp">Japan</option>
                      <option value="kr">South Korea</option>
                      <option value="sa">Saudi Arabia</option>
                      <option value="other">Other / Not sure</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-brand-textLight font-semibold uppercase block mb-1">Preferred Intake Season</label>
                    <div className="flex gap-2">
                      {['Fall 2027', 'Spring 2027'].map((season) => (
                        <label 
                          key={season}
                          className={`flex-1 text-center border rounded p-1.5 text-xs font-medium cursor-pointer bg-white transition ${
                            intakeSeason === season ? 'border-brand-gold bg-brand-cream/30' : 'border-gray-300 hover:border-brand-gold'
                          }`}
                        >
                          <input 
                            type="radio" 
                            name="intake" 
                            className="sr-only" 
                            checked={intakeSeason === season} 
                            onChange={() => setIntakeSeason(season)}
                          />
                          {season}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className="col-span-1 md:col-span-2">
                    <label className="text-[10px] text-brand-textLight font-semibold uppercase block mb-1">Quick profile (optional — helps us pre-qualify you)</label>
                    <div className="grid grid-cols-3 gap-2">
                      <input type="number" min={0} max={10} step={0.1} value={leadCgpa} onChange={(e) => setLeadCgpa(e.target.value)} placeholder="CGPA (e.g. 7.5)" className="w-full text-xs p-2 border border-gray-300 rounded bg-white font-medium" />
                      <input type="number" min={0} max={9} step={0.5} value={leadEnglishScore} onChange={(e) => setLeadEnglishScore(e.target.value)} placeholder="IELTS (e.g. 6.5)" className="w-full text-xs p-2 border border-gray-300 rounded bg-white font-medium" />
                      <input type="number" min={0} max={100} value={leadTuitionBudget} onChange={(e) => setLeadTuitionBudget(e.target.value)} placeholder="Budget ₹L/yr" className="w-full text-xs p-2 border border-gray-300 rounded bg-white font-medium" />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {division === 'visa' && (
              <div className="p-4 bg-brand-cream rounded-lg border border-brand-gold/15 space-y-3">
                <h4 className="text-xs font-bold text-brand-navy uppercase tracking-wider">Visa Type Details</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] text-brand-textLight font-semibold uppercase block mb-1">Visa Category</label>
                    <select 
                      value={visaCategory}
                      onChange={(e) => setVisaCategory(e.target.value)}
                      className="w-full text-xs p-2 border border-gray-300 rounded bg-white font-medium"
                    >
                      <option value="student">Student F1 / Study Permit</option>
                      <option value="work">Work Visa (Skilled Professional)</option>
                      <option value="tourist">Tourist / Visit Visa</option>
                      <option value="family">Family reunification</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-brand-textLight font-semibold uppercase block mb-1">Target Visa Country</label>
                    <input 
                      type="text" 
                      value={visaCountry}
                      onChange={(e) => setVisaCountry(e.target.value)}
                      placeholder="e.g. Germany, Saudi Arabia" 
                      className="w-full text-xs p-2 border border-gray-300 rounded bg-white"
                    />
                  </div>
                </div>
              </div>
            )}

            {division === 'umrah' && (
              <div className="p-4 bg-brand-cream rounded-lg border border-brand-gold/15 space-y-3">
                <h4 className="text-xs font-bold text-brand-navy uppercase tracking-wider">Umrah Package Preferences</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] text-brand-textLight font-semibold uppercase block mb-1">Package Tier</label>
                    <select 
                      value={umrahTier}
                      onChange={(e) => setUmrahTier(e.target.value)}
                      className="w-full text-xs p-2 border border-gray-300 rounded bg-white font-medium"
                    >
                      <option value="deluxe">Deluxe (5-Star Hotel close to Haram)</option>
                      <option value="economy">Economy (Shared rooms, standard travel)</option>
                      <option value="custom">Custom Family Package</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-brand-textLight font-semibold uppercase block mb-1">Expected Departure</label>
                    <select 
                      value={umrahDeparture}
                      onChange={(e) => setUmrahDeparture(e.target.value)}
                      className="w-full text-xs p-2 border border-gray-300 rounded bg-white font-medium"
                    >
                      <option value="sep">September 2026</option>
                      <option value="ramadan">Ramadan Season 2027</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {division === 'attestation' && (
              <div className="p-4 bg-brand-cream rounded-lg border border-brand-gold/15 space-y-3">
                <h4 className="text-xs font-bold text-brand-navy uppercase tracking-wider">Attestation Document Options</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] text-brand-textLight font-semibold uppercase block mb-1">Document Category</label>
                    <select 
                      value={attestationCategory}
                      onChange={(e) => setAttestationCategory(e.target.value)}
                      className="w-full text-xs p-2 border border-gray-300 rounded bg-white font-medium"
                    >
                      <option value="educational">Educational Degree/Transcripts</option>
                      <option value="personal">Personal Certificate (Birth/Marriage)</option>
                      <option value="commercial">Commercial Invoices/Agreements</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-brand-textLight font-semibold uppercase block mb-1">Required Authentication</label>
                    <select 
                      value={attestationAuth}
                      onChange={(e) => setAttestationAuth(e.target.value)}
                      className="w-full text-xs p-2 border border-gray-300 rounded bg-white font-medium"
                    >
                      <option value="apostille">MEA Apostille stamp</option>
                      <option value="embassy">Saudi / Kuwait Embassy Legalization</option>
                      <option value="notary">State Home Department/Notary verification</option>
                    </select>
                  </div>
                </div>
              </div>
            )}

            {division === 'manpower' && (
              <div className="p-4 bg-brand-cream rounded-lg border border-brand-gold/15 space-y-3">
                <h4 className="text-xs font-bold text-brand-navy uppercase tracking-wider">Overseas Job Application</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] text-brand-textLight font-semibold uppercase block mb-1">Target Job Sector</label>
                    <select 
                      value={manpowerSector}
                      onChange={(e) => setManpowerSector(e.target.value)}
                      className="w-full text-xs p-2 border border-gray-300 rounded bg-white font-medium"
                    >
                      <option value="healthcare">Healthcare (Nursing, Medical staff)</option>
                      <option value="engineering">Construction & Civil Engineering</option>
                      <option value="hospitality">IT & Hospitality Management</option>
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] text-brand-textLight font-semibold uppercase block mb-1">Upload CV/Resume *</label>
                    <div 
                      className={`border-2 border-dashed rounded bg-white p-3 text-center transition cursor-pointer ${
                        manpowerFile ? 'border-brand-gold bg-brand-cream/10' : 'border-gray-300 hover:border-brand-gold'
                      }`}
                    >
                      <input 
                        type="file" 
                        accept=".pdf" 
                        onChange={(e) => setManpowerFile(e.target.files?.[0] || null)}
                        className="hidden" 
                        id="resumeFileInput"
                      />
                      <label htmlFor="resumeFileInput" className="cursor-pointer">
                        <span className="text-xs text-brand-textLight font-medium block">
                          {manpowerFile ? `✓ Selected: ${manpowerFile.name}` : 'Drag & Drop Resume (PDF)'}
                        </span>
                        <span className="text-[9px] text-brand-textLight">or click to browse</span>
                      </label>
                    </div>
                  </div>
                </div>
                <div className="flex items-start gap-2.5 mt-2 bg-white/50 p-2.5 rounded border border-gray-100">
                  <input 
                    type="checkbox" 
                    id="manpowerRetainCheck" 
                    checked={manpowerRetain}
                    onChange={(e) => setManpowerRetain(e.target.checked)}
                    className="mt-0.5 rounded border-gray-300 text-brand-gold focus:ring-brand-gold"
                  />
                  <label htmlFor="manpowerRetainCheck" className="text-[10px] text-brand-textLight leading-tight">
                    <strong>Retain Consent:</strong> I agree that Opus Overseas can retain my resume details for 3 years to match and share with foreign employers (DPDP Candidate Clause).
                  </label>
                </div>
              </div>
            )}

            {/* DPDP Plain English Consents */}
            <div className="border-t border-gray-200 pt-4 space-y-3">
              <h4 className="text-xs font-bold text-brand-navy uppercase tracking-wider">DPDP-2023 Legal Consents</h4>
              
              <div className="space-y-2.5">
                <label className="flex gap-2 items-start cursor-pointer select-none">
                  <input 
                    type="checkbox" 
                    required 
                    checked={consentProcessing}
                    onChange={(e) => setConsentProcessing(e.target.checked)}
                    className="mt-0.5 rounded border-gray-300 text-brand-gold focus:ring-brand-gold"
                  />
                  <span className="text-[11px] text-brand-textLight leading-tight">
                    I agree to the processing of my contact information and files to facilitate my application processes with universities, embassies, and transit agents.
                  </span>
                </label>

                <label className="flex gap-2 items-start cursor-pointer select-none">
                  <input 
                    type="checkbox" 
                    checked={consentWhatsApp}
                    onChange={(e) => setConsentWhatsApp(e.target.checked)}
                    className="mt-0.5 rounded border-gray-300 text-brand-gold focus:ring-brand-gold"
                  />
                  <span className="text-[11px] text-brand-textLight leading-tight">
                    I authorize sending progress alerts, payment reminders, and visa status information via WhatsApp and SMS notifications.
                  </span>
                </label>

                <label className="flex gap-2 items-start cursor-pointer select-none">
                  <input 
                    type="checkbox" 
                    checked={consentMarketing}
                    onChange={(e) => setConsentMarketing(e.target.checked)}
                    className="mt-0.5 rounded border-gray-300 text-brand-gold focus:ring-brand-gold"
                  />
                  <span className="text-[11px] text-brand-textLight leading-tight">
                    I would like to receive occasional updates, tips, scholarship alerts, and offers about study-abroad and visa services tailored to my interests.
                  </span>
                </label>
              </div>
            </div>

            {/* Bot Protection (Turnstile Simulator) */}
            {siteKeyConfigured ? (
              <TurnstileWidget onToken={setTurnstileToken} onExpire={() => setTurnstileToken(null)} />
            ) : (
              <div className="bg-gray-50 border border-gray-200 rounded p-3 flex justify-between items-center text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-brand-navy">Security check enabled in production</span>
                </div>
              </div>
            )}

            {/* Submit Button */}
            {refCode && (
              <div className="rounded-xl border border-brand-gold/40 bg-brand-gold/5 px-3 py-2.5 text-[11px] text-brand-navy/70">
                Referred by partner <span className="font-mono font-bold text-brand-gold">{refCode}</span> — the referral is credited automatically when this application is submitted.
              </div>
            )}
            <button 
              type="submit" 
              disabled={leadMutation.isPending}
              className="w-full bg-brand-gold hover:bg-brand-goldHover text-brand-navy py-2.5 rounded text-xs font-bold uppercase tracking-wider transition shadow hover:shadow-md disabled:opacity-50"
            >
              {leadMutation.isPending ? 'Submitting...' : 'Submit Lead & Get Code'}
            </button>

            {/* WhatsApp-first channel (Funnel#4): most Nizamabad leads live on WhatsApp */}
            <a
              href="https://wa.me/919876543210?text=Hi%20Opus%20Overseas%2C%20I%27m%20interested%20in%20your%20services.%20Could%20you%20guide%20me%3F"
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 flex items-center justify-center gap-2 py-2.5 rounded text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 transition shadow"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor"><path d="M17.47 14.38c-.3-.15-1.76-.87-2.03-.97-.27-.1-.47-.15-.67.15-.2.3-.77.97-.94 1.17-.17.2-.35.22-.65.07-.3-.15-1.25-.46-2.38-1.47-.88-.79-1.48-1.76-1.65-2.06-.17-.3-.02-.46.13-.61.13-.13.3-.35.45-.52.15-.17.2-.3.3-.5.1-.2.05-.37-.02-.52-.08-.15-.67-1.62-.92-2.22-.24-.58-.49-.5-.67-.51h-.57c-.2 0-.52.07-.8.37-.27.3-1.04 1.02-1.04 2.5 0 1.47 1.07 2.9 1.22 3.1.15.2 2.1 3.2 5.1 4.49.71.3 1.27.49 1.7.63.72.23 1.37.2 1.88.12.57-.09 1.76-.72 2-1.42.25-.7.25-1.3.18-1.42-.07-.12-.27-.2-.58-.35zM12.05 21.8c-2.69 0-5.2-1.08-7.1-3l-.54.16-2.06.54.6-1.95A9.64 9.64 0 0 1 2.4 12 9.6 9.6 0 0 1 12.05 2.4a9.63 9.63 0 0 1 9.6 9.6c0 5.3-4.3 9.62-9.6 9.62zm0-20.95C5.43.85.1 6.18.1 12.05c0 2.08.57 4.04 1.63 5.77L.1 23.9l6.3-1.63a11.7 11.7 0 0 0 5.65 1.45c6.49 0 11.77-5.29 11.76-11.77A11.72 11.72 0 0 0 12.04.85z"/></svg>
              Chat on WhatsApp
            </a>
          </form>
        </section>

        {/* RIGHT SIDE: LEAD STATUS TRACKER */}
        <section className="lg:col-span-5 flex flex-col gap-6">
          
          {/* STATUS SEARCH BOX */}
          <div className="bg-brand-navy text-white p-6 rounded-xl shadow-lg border border-brand-navyLight flex flex-col gap-4">
            <div>
              <h3 className="font-display font-bold text-lg text-brand-gold">Check Your Application Status</h3>
              <p className="text-xs text-brand-cream/65 mt-0.5">Enter your registered mobile number and unique token code.</p>
            </div>

            <form onSubmit={handleStatusSearch} className="space-y-3">
              <div>
                <label className="text-[9px] uppercase tracking-wider text-brand-gold font-bold block mb-1">Mobile Number</label>
                <input 
                  type="tel" 
                  value={searchPhone}
                  onChange={(e) => setSearchPhone(e.target.value)}
                  placeholder="+91 98765 43210" 
                  className="w-full text-xs p-2.5 border border-brand-navyLight rounded bg-brand-navyLight text-white placeholder-brand-cream/35"
                />
              </div>
              <div>
                <label className="text-[9px] uppercase tracking-wider text-brand-gold font-bold block mb-1">Access Token</label>
                <input 
                  type="text" 
                  value={searchToken}
                  onChange={(e) => setSearchToken(e.target.value)}
                  placeholder="OP-2026-0814" 
                  className="w-full text-xs p-2.5 border border-brand-navyLight rounded bg-brand-navyLight text-white placeholder-brand-cream/35"
                />
              </div>
              
              <button 
                type="submit" 
                disabled={searchFetching}
                className="w-full bg-brand-cream hover:bg-white text-brand-navy py-2 rounded text-xs font-bold tracking-wider transition disabled:opacity-50"
              >
                {searchFetching ? 'Searching...' : 'Search Status'}
              </button>
            </form>

            {/* Quick Demo Helper */}
            <div className="border-t border-brand-navyLight pt-3 flex justify-between items-center text-[10px] text-brand-cream/50">
              <span>Try Demo Search:</span>
              <button type="button" onClick={fillDemoSearch} className="text-brand-gold font-bold hover:underline">Click here to auto-fill</button>
            </div>
          </div>

          {/* SEARCH RESULT CARD */}
          {statusData && (
            <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-lg flex flex-col gap-5">
              <div className="flex justify-between items-start border-b border-gray-100 pb-3">
                <div>
                  <span className="text-[9px] font-bold text-brand-gold uppercase tracking-widest">Active Application Status</span>
                  <h4 className="font-display font-bold text-base text-brand-navy mt-1">{statusData.name || 'Client Account'}</h4>
                  <p className="text-[10px] text-brand-textLight">Token: <span className="font-mono text-brand-navy font-semibold">{statusData.token}</span></p>
                </div>
                <span className="px-2.5 py-1 bg-yellow-100 text-yellow-800 text-[10px] font-bold rounded uppercase">
                  {statusData.engagements?.[0]?.division || 'Study Abroad'}
                </span>
              </div>

              {/* Visual Timeline Tracker */}
              <div>
                <label className="text-[9px] uppercase tracking-wider text-brand-textLight font-bold block mb-3">Application Progress</label>
                
                <div className="relative pl-6 space-y-4 text-xs">
                  <div className="absolute left-[7px] top-1.5 bottom-1.5 w-[2px] bg-gray-200"></div>

                  {/* Step 1: Consult */}
                  <div className="relative flex gap-3 flex-col">
                    <span className="absolute -left-6 w-4 h-4 rounded-full bg-brand-success text-white text-[9px] flex items-center justify-center font-bold font-mono">✓</span>
                    <div>
                      <p className="font-bold text-brand-navy">Consultation & Onboarding</p>
                      <p className="text-[10px] text-brand-textLight">Completed. Lead captured in OpusOS database system.</p>
                    </div>
                  </div>

                  {/* Step 2: Documents */}
                  {(() => {
                    const stage = statusData.engagements?.[0]?.stageKey || 'lead';
                    const isActive = stage === 'lead' || stage === 'qualified' || stage === 'documents';
                    const isCompleted = stage === 'processing' || stage === 'complete';
                    
                    return (
                      <div className={`relative flex gap-3 flex-col ${!isActive && !isCompleted ? 'opacity-45' : ''}`}>
                        <span className={`absolute -left-6 w-4 h-4 rounded-full text-[9px] flex items-center justify-center font-bold font-mono ${
                          isCompleted ? 'bg-brand-success text-white' : isActive ? 'bg-brand-gold text-brand-navy' : 'bg-gray-200 text-gray-500'
                        }`}>
                          {isCompleted ? '✓' : '2'}
                        </span>
                        <div>
                          <p className="font-bold text-brand-navy">Document Vault Verification</p>
                          <p className="text-[10px] text-brand-textLight">
                            {isCompleted ? 'Completed. All required documents verified.' : isActive ? 'Under review. Counselors are auditing uploaded certificates.' : 'Awaiting previous stages.'}
                          </p>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Step 3: Submitted */}
                  {(() => {
                    const stage = statusData.engagements?.[0]?.stageKey || 'lead';
                    const isActive = stage === 'processing';
                    const isCompleted = stage === 'complete';
                    
                    return (
                      <div className={`relative flex gap-3 flex-col ${!isActive && !isCompleted ? 'opacity-45' : ''}`}>
                        <span className={`absolute -left-6 w-4 h-4 rounded-full text-[9px] flex items-center justify-center font-bold font-mono ${
                          isCompleted ? 'bg-brand-success text-white' : isActive ? 'bg-brand-gold text-brand-navy' : 'bg-gray-200 text-gray-500'
                        }`}>
                          {isCompleted ? '✓' : '3'}
                        </span>
                        <div>
                          <p className="font-bold text-brand-navy">Application Submission</p>
                          <p className="text-[10px] text-brand-textLight">
                            {isCompleted ? 'Submitted. Application sent to relevant entity.' : isActive ? 'Active. Counselors are submitting applications.' : 'Awaiting previous stages.'}
                          </p>
                        </div>
                      </div>
                    );
                  })()}

                  {/* Step 4: Visa Support */}
                  {(() => {
                    const stage = statusData.engagements?.[0]?.stageKey || 'lead';
                    const isActive = stage === 'complete';
                    
                    return (
                      <div className={`relative flex gap-3 flex-col ${!isActive ? 'opacity-45' : ''}`}>
                        <span className={`absolute -left-6 w-4 h-4 rounded-full text-[9px] flex items-center justify-center font-bold font-mono ${
                          isActive ? 'bg-brand-gold text-brand-navy' : 'bg-gray-200 text-gray-500'
                        }`}>
                          4
                        </span>
                        <div>
                          <p className="font-bold text-brand-navy">Visa Stamping & Transit</p>
                          <p className="text-[10px] text-brand-textLight">
                            {isActive ? 'Active. Visa interview prep & financial statement assembly.' : 'Awaiting previous stages.'}
                          </p>
                        </div>
                      </div>
                    );
                  })()}
                </div>
              </div>

              {/* Assigned Counselor details with WhatsApp quick link */}
              <div className="mt-2 pt-4 border-t border-gray-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-brand-gold/15 flex items-center justify-center font-semibold text-brand-gold text-xs border border-brand-gold">
                    SK
                  </div>
                  <div>
                    <p className="text-[10px] text-brand-textLight leading-none">Assigned Counselor</p>
                    <p className="text-xs font-bold text-brand-navy mt-1">Santhosh Kumar</p>
                  </div>
                </div>
                
                <a href="https://wa.me/919876543210" target="_blank" rel="noopener noreferrer" className="bg-green-500 hover:bg-green-600 text-white text-xs font-bold px-3 py-1.5 rounded flex items-center gap-1 transition shadow-sm">
                  <svg className="w-3.5 h-3.5 fill-current" viewBox="0 0 24 24"><path d="M.057 24l1.687-6.163c-1.041-1.804-1.588-3.849-1.587-5.946C.06 5.348 5.397.01 12.008.01c3.202.001 6.212 1.246 8.477 3.514 2.266 2.268 3.507 5.28 3.505 8.484-.004 6.657-5.34 11.997-11.953 11.997-2.005-.001-3.973-.502-5.73-1.45L0 24zm6.59-4.846c1.6.95 3.188 1.449 4.625 1.451 5.403.002 9.799-4.389 9.802-9.799.002-2.621-1.013-5.086-2.86-6.938C16.37 2.016 13.91 1.002 11.29 1.002c-5.405 0-9.801 4.393-9.806 9.805-.002 1.7.456 3.36 1.32 4.82L1.758 20.88l4.89-1.286z"/></svg>
                  <span>Chat on WA</span>
                </a>
              </div>
            </div>
          )}

          {searchError && (
            <div className="bg-red-50 text-red-800 p-4 rounded-xl border border-red-200 text-xs">
              <strong>Error:</strong> Failed to resolve tracking status. Please verify the access token and registered mobile number.
            </div>
          )}
        </section>

      </main>

      {/* PUBLIC FOOTER */}
      <Footer />

      {/* POPUP TOAST SYSTEM */}
      <div 
        className={`fixed right-6 bottom-6 bg-brand-navy border-l-4 border-brand-gold text-white text-xs px-4 py-3 rounded-lg shadow-xl transition duration-300 z-50 flex items-center gap-2 ${
          toast.show ? 'translate-y-0 opacity-100' : 'translate-y-24 opacity-0'
        }`}
      >
        <span className="font-bold text-brand-gold">INTAKE SYSTEM:</span>
        <span>{toast.msg}</span>
      </div>
    </div>
  );
}
