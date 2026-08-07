import React, { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';

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

  // Search State
  const [searchPhone, setSearchPhone] = useState('');
  const [searchToken, setSearchToken] = useState('');
  const [searchParams, setSearchParams] = useState<{ phone: string; token: string } | null>(null);

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

  // Submit Lead Mutation
  const leadMutation = useMutation({
    mutationFn: async (payload: LeadPayload) => {
      const res = await fetch('/api/public/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        throw new Error(await res.text() || 'Failed to submit lead');
      }
      return res.json();
    },
    onSuccess: (data) => {
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

    // Prepare dynamic context
    let dynamicContext: Record<string, any> = {};
    if (division === 'study-abroad') {
      dynamicContext = { targetCountry, intakeSeason };
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
      dynamicContext,
      consents: {
        coreProcessing: consentProcessing,
        whatsappUpdates: consentWhatsApp,
        marketingCampaigns: false,
      },
    };

    leadMutation.mutate(payload);
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
      {/* PUBLIC HEADER */}
      <header className="bg-brand-navy text-white py-4 px-8 sticky top-0 shadow-md z-30 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded bg-brand-gold flex items-center justify-center font-display font-bold text-brand-navy">O</div>
          <div>
            <span className="font-display font-bold text-base tracking-wider block">Opus Overseas</span>
            <span className="text-[9px] text-brand-gold tracking-widest uppercase block leading-none">Global Services Engine</span>
          </div>
        </div>
        
        <nav className="hidden md:flex gap-6 text-xs font-semibold uppercase tracking-wider text-brand-cream/80">
          <a href="#" className="hover:text-brand-gold transition">Study Abroad</a>
          <a href="#" className="hover:text-brand-gold transition">Visa Services</a>
          <a href="#" className="hover:text-brand-gold transition">Umrah</a>
          <a href="#" className="hover:text-brand-gold transition">Attestation</a>
          <a href="#" className="hover:text-brand-gold transition">Careers</a>
        </nav>

        <div className="flex items-center gap-3">
          <a href="tel:+919876543210" className="text-xs bg-brand-navyLight border border-brand-gold/30 hover:border-brand-gold hover:text-white px-3 py-1.5 rounded transition text-brand-gold font-bold">
            Call Support
          </a>
        </div>
      </header>

      {/* CONTENT CONTAINER */}
      <main className="max-w-7xl w-full mx-auto p-8 flex-1 grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        
        {/* LEFT SIDE: LEAD INTAKE FORM */}
        <section className="lg:col-span-7 bg-white p-8 rounded-xl border border-gray-200 shadow-lg flex flex-col gap-6">
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
              </div>
            </div>

            {/* Bot Protection (Turnstile Simulator) */}
            <div className="bg-gray-50 border border-gray-200 rounded p-3 flex justify-between items-center text-xs">
              <div className="flex items-center gap-2">
                <div className="w-4 h-4 rounded bg-brand-gold animate-spin"></div>
                <span className="font-medium text-brand-navy">Cloudflare Turnstile Verified</span>
              </div>
              <span className="text-[9px] text-brand-textLight font-mono">Token: c1f845...</span>
            </div>

            {/* Submit Button */}
            <button 
              type="submit" 
              disabled={leadMutation.isPending}
              className="w-full bg-brand-gold hover:bg-brand-goldHover text-brand-navy py-2.5 rounded text-xs font-bold uppercase tracking-wider transition shadow hover:shadow-md disabled:opacity-50"
            >
              {leadMutation.isPending ? 'Submitting...' : 'Submit Lead & Get Code'}
            </button>
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
      <footer className="bg-brand-navy text-white py-6 border-t border-brand-navyLight shrink-0">
        <div className="max-w-7xl mx-auto px-8 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-brand-cream/50">
          <div className="flex items-center gap-3">
            <span className="border border-brand-gold/30 text-brand-gold px-2 py-0.5 rounded text-[10px] font-semibold font-display">British Council Certified Agent</span>
          </div>
          
          <div>
            <span>© 2026 Opus Overseas. Nizamabad, Telangana, India. All rights reserved.</span>
          </div>

          <div className="flex gap-4 font-semibold">
            <a href="#" className="hover:underline">Privacy Policy (DPDP)</a>
            <a href="#" className="hover:underline">Terms of Service</a>
          </div>
        </div>
      </footer>

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
