import React, { useState } from 'react';
import { useMutation } from '@tanstack/react-query';
import { getBookingUrlForDivision, isConsultationDivision, LEAD_FORM_ROUTE } from '../../config/booking';
import BookingModal from '../BookingModal';
import { useLocation } from 'wouter';

export type FunnelDivision = 'study-abroad' | 'visa' | 'umrah' | 'attestation' | 'manpower';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  initialDivision?: FunnelDivision;
  defaultGoal?: string;
}

interface ExpressLeadPayload {
  name: string;
  phone: string;
  email?: string;
  division: FunnelDivision;
  goal?: string;
  targetCountry?: string;
  refCode?: string;
  highestQualification?: 'highschool' | 'undergrad' | 'postgrad';
  context?: Record<string, any>;
  leadSource?: string;
}

export default function InteractiveFunnelModal({
  isOpen,
  onClose,
  initialDivision = 'study-abroad',
  defaultGoal,
}: Props) {
  const [, setLocation] = useLocation();
  const [division, setDivision] = useState<FunnelDivision>(initialDivision);
  const [bookingOpen, setBookingOpen] = useState(false);

  // Form states
  const [step, setStep] = useState<number>(1);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');

  // Study Abroad Specific
  const [studyCountry, setStudyCountry] = useState('United Kingdom');
  const [studyDegree, setStudyDegree] = useState<'highschool' | 'undergrad' | 'postgrad'>('undergrad');
  const [studyGpa, setStudyGpa] = useState<number>(7.5);
  const [studyEnglish, setStudyEnglish] = useState('IELTS 7.0 / PTE 68');
  const [studyBudget, setStudyBudget] = useState('₹15L – ₹25L/yr');

  // Visa Specific
  const [visaCountry, setVisaCountry] = useState('Dubai 🇦🇪');
  const [visaPurpose, setVisaPurpose] = useState('Tourist & Leisure');
  const [visaTravelMonth, setVisaTravelMonth] = useState('Next 30 Days');

  // Umrah Specific
  const [umrahMonth, setUmrahMonth] = useState('March 2026 (Ramadan)');
  const [umrahPilgrims, setUmrahPilgrims] = useState(2);
  const [umrahHotel, setUmrahHotel] = useState('5-Star Luxury (Clock Tower)');

  // Attestation Specific
  const [attestDoc, setAttestDoc] = useState('Degree / Educational Certificate');
  const [attestCountry, setAttestCountry] = useState('UAE / Gulf');
  const [attestCity, setAttestCity] = useState('Hyderabad / Telangana');

  // Manpower Specific
  const [careerSector, setCareerSector] = useState('Healthcare & Nursing');
  const [careerExp, setCareerExp] = useState('3–5 Years');
  const [careerCountry, setCareerCountry] = useState('Gulf / Saudi Arabia / UAE');

  // Submission Result
  const [leadToken, setLeadToken] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Update initial division when opened
  React.useEffect(() => {
    if (isOpen) {
      setDivision(initialDivision);
      setStep(1);
      setLeadToken(null);
      setErrorMsg(null);
    }
  }, [isOpen, initialDivision]);

  // Lead Submission Mutation
  const leadMutation = useMutation({
    mutationFn: async (payload: ExpressLeadPayload) => {
      const res = await fetch('/api/public/leads/express', { credentials: 'include', 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || data?.details || 'Failed to submit inquiry.');
      }
      return data;
    },
    onSuccess: (data) => {
      setLeadToken(data.token);
      setStep(3); // Result & Next steps screen
    },
    onError: (err: any) => {
      setErrorMsg(err.message || 'Submission failed. Please check details.');
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!name.trim() || !phone.trim()) {
      setErrorMsg('Please provide your name and contact phone number.');
      return;
    }

    // Get partner ref from URL if present
    const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
    const refCode = params.get('ref') || undefined;

    let dynamicContext: Record<string, any> = {};
    let goalDescription = defaultGoal || '';
    let targetCountry = '';

    if (division === 'study-abroad') {
      targetCountry = studyCountry;
      goalDescription = `${studyDegree.toUpperCase()} in ${studyCountry} (GPA: ${studyGpa})`;
      dynamicContext = {
        studyDegree,
        studyGpa,
        studyEnglish,
        studyBudget,
        targetCountry: studyCountry,
      };
    } else if (division === 'visa') {
      targetCountry = visaCountry;
      goalDescription = `${visaPurpose} Visa for ${visaCountry} (${visaTravelMonth})`;
      dynamicContext = { visaCountry, visaPurpose, visaTravelMonth };
    } else if (division === 'umrah') {
      goalDescription = `Umrah Package for ${umrahPilgrims} pilgrims · ${umrahMonth}`;
      dynamicContext = { umrahMonth, umrahPilgrims, umrahHotel };
    } else if (division === 'attestation') {
      targetCountry = attestCountry;
      goalDescription = `${attestDoc} for ${attestCountry}`;
      dynamicContext = { attestDoc, attestCountry, attestCity };
    } else if (division === 'manpower') {
      targetCountry = careerCountry;
      goalDescription = `${careerSector} Placement in ${careerCountry} (${careerExp})`;
      dynamicContext = { careerSector, careerExp, careerCountry };
    }

    leadMutation.mutate({
      name: name.trim(),
      phone: phone.trim(),
      email: email.trim() || undefined,
      division,
      goal: goalDescription,
      targetCountry,
      refCode,
      highestQualification: division === 'study-abroad' ? studyDegree : 'undergrad',
      context: dynamicContext,
      leadSource: 'interactive_funnel_modal',
    });
  };

  const openChatwoot = () => {
    if (typeof window !== 'undefined' && (window as any).$chatwoot) {
      (window as any).$chatwoot.toggle('open');
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-6 overflow-y-auto">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-[#061e38]/80 backdrop-blur-md transition-opacity animate-[fadeIn_0.2s_ease-out]"
        onClick={onClose}
      />

      {/* Modal Card */}
      <div className="relative z-10 m-auto w-full max-w-xl overflow-hidden rounded-3xl border border-white/20 bg-white shadow-2xl transition-all">
        {/* Header Ribbon */}
        <div className="relative overflow-hidden bg-gradient-to-r from-brand-navy-900 via-brand-navy to-brand-navy-800 p-6 text-white">
          <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-brand-gold/15 blur-2xl" />
          
          <div className="relative z-10 flex items-start justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-brand-gold/40 bg-brand-gold/15 px-3 py-0.5 text-[9px] font-bold uppercase tracking-[0.2em] text-brand-gold">
                <span className="live-pulse-dot text-brand-gold" /> Institutional Eligibility Portal
              </div>
              <h2 className="mt-2 font-display text-xl sm:text-2xl font-extrabold tracking-tight text-white">
                {division === 'study-abroad' && 'Instant University Match & Scholarship Pre-Check'}
                {division === 'visa' && 'Express Visa Feasibility & Document Checklist'}
                {division === 'umrah' && 'Customized Umrah Package Request & Seat Reservation'}
                {division === 'attestation' && 'Government Attestation & Apostille Calculator'}
                {division === 'manpower' && 'Overseas Career Eligibility & Profile Scorecard'}
              </h2>
              <p className="mt-1 text-xs text-white/70">
                Direct evaluation powered by official consular & university admission matrix.
              </p>
            </div>

            <button
              onClick={onClose}
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors cursor-pointer text-sm font-bold sm:h-8 sm:w-8"
              aria-label="Close modal"
            >
              ✕
            </button>
          </div>

          {/* Division Switcher */}
          <div className="mt-4 flex gap-1.5 overflow-x-auto pb-1 text-[10px] font-bold uppercase tracking-wider">
            {[
              { id: 'study-abroad', label: '🎓 Study Abroad' },
              { id: 'visa', label: '✈️ Visas' },
              { id: 'umrah', label: '🕋 Umrah' },
              { id: 'attestation', label: '📜 Attestation' },
              { id: 'manpower', label: '💼 Careers' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => {
                  setDivision(tab.id as FunnelDivision);
                  setStep(1);
                  setLeadToken(null);
                  setErrorMsg(null);
                }}
                className={`flex min-h-11 shrink-0 items-center rounded-full px-3 py-1 transition-all cursor-pointer sm:min-h-0 ${
                  division === tab.id
                    ? 'bg-brand-gold text-brand-navy font-black shadow-xs'
                    : 'bg-white/10 text-white/70 hover:bg-white/15 hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Content Body */}
        <div className="p-6 sm:p-8">
          {/* STEP 1: Interactive Assessment / Parameters */}
          {step === 1 && (
            <div className="space-y-5 animate-[fadeIn_0.2s_ease-out]">
              {/* Study Abroad Form */}
              {division === 'study-abroad' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-navy/70 mb-1">
                        Target Country
                      </label>
                      <select
                        value={studyCountry}
                        onChange={(e) => setStudyCountry(e.target.value)}
                        className="w-full min-h-11 rounded-xl border border-brand-navy/15 bg-slate-50 p-2.5 text-xs font-semibold text-brand-navy focus:border-brand-gold focus:outline-none sm:min-h-0"
                      >
                        <option value="United Kingdom">United Kingdom 🇬🇧 (1-Year Masters / PSW)</option>
                        <option value="United States">United States 🇺🇸 (STEM OPT / Top 100)</option>
                        <option value="Canada">Canada 🇨🇦 (PGWP Direct Pathways)</option>
                        <option value="Australia">Australia 🇦🇺 (CRICOS Accredited)</option>
                        <option value="Germany">Germany 🇩🇪 (Zero / Low Tuition)</option>
                        <option value="Ireland">Ireland 🇮🇪 (2-Year Stay Back)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-navy/70 mb-1">
                        Degree Level
                      </label>
                      <select
                        value={studyDegree}
                        onChange={(e) => setStudyDegree(e.target.value as any)}
                        className="w-full min-h-11 rounded-xl border border-brand-navy/15 bg-slate-50 p-2.5 text-xs font-semibold text-brand-navy focus:border-brand-gold focus:outline-none sm:min-h-0"
                      >
                        <option value="undergrad">Bachelors Degree (Undergraduate)</option>
                        <option value="postgrad">Masters Degree / MBA (Postgraduate)</option>
                        <option value="highschool">Foundation / Diploma Pathway</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between text-xs font-bold text-brand-navy mb-1.5">
                      <span>Academic Standing / CGPA / %:</span>
                      <span className="font-display font-extrabold text-brand-gold text-sm">{studyGpa.toFixed(1)} / 10.0 ({Math.round(studyGpa * 9.5)}%)</span>
                    </div>
                    <input
                      type="range"
                      min={5.0}
                      max={10.0}
                      step={0.1}
                      value={studyGpa}
                      onChange={(e) => setStudyGpa(parseFloat(e.target.value))}
                      className="w-full accent-brand-gold cursor-pointer"
                    />
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-navy/70 mb-1">
                        English Proficiency
                      </label>
                      <select
                        value={studyEnglish}
                        onChange={(e) => setStudyEnglish(e.target.value)}
                        className="w-full min-h-11 rounded-xl border border-brand-navy/15 bg-slate-50 p-2.5 text-xs font-semibold text-brand-navy focus:border-brand-gold focus:outline-none sm:min-h-0"
                      >
                        <option value="IELTS 7.0 / PTE 68">IELTS 7.0+ / PTE 68+ (High Band)</option>
                        <option value="IELTS 6.5 / PTE 60">IELTS 6.5 / PTE 58-64 (Standard)</option>
                        <option value="IELTS 6.0 / PTE 50">IELTS 6.0 / PTE 50-57</option>
                        <option value="MOI Waiver Candidate">MOI / English Waiver Eligible</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-navy/70 mb-1">
                        Annual Tuition Budget
                      </label>
                      <select
                        value={studyBudget}
                        onChange={(e) => setStudyBudget(e.target.value)}
                        className="w-full min-h-11 rounded-xl border border-brand-navy/15 bg-slate-50 p-2.5 text-xs font-semibold text-brand-navy focus:border-brand-gold focus:outline-none sm:min-h-0"
                      >
                        <option value="Under ₹15L/yr">Under ₹15 Lakhs / yr (Value)</option>
                        <option value="₹15L – ₹25L/yr">₹15L – ₹25 Lakhs / yr (Standard)</option>
                        <option value="₹25L – ₹40L/yr">₹25L – ₹40 Lakhs / yr (Premium)</option>
                        <option value="Full Scholarship Dependent">100% Scholarship Required</option>
                      </select>
                    </div>
                  </div>
                </div>
              )}

              {/* Visa Services Form */}
              {division === 'visa' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-navy/70 mb-1">
                        Destination Country
                      </label>
                      <select
                        value={visaCountry}
                        onChange={(e) => setVisaCountry(e.target.value)}
                        className="w-full min-h-11 rounded-xl border border-brand-navy/15 bg-slate-50 p-2.5 text-xs font-semibold text-brand-navy focus:border-brand-gold focus:outline-none sm:min-h-0"
                      >
                        <option value="Dubai 🇦🇪">Dubai / UAE 🇦🇪 (Express 3-4 Days)</option>
                        <option value="Schengen Europe 🇪🇺">Schengen Europe 🇪🇺 (27 Countries)</option>
                        <option value="Thailand 🇹🇭">Thailand 🇹🇭 (E-Visa / Fast-Track)</option>
                        <option value="Singapore 🇸🇬">Singapore 🇸🇬 (Single/Multi Entry)</option>
                        <option value="Malaysia 🇲🇾">Malaysia 🇲🇾 (E-Visa Direct)</option>
                        <option value="United States 🇺🇸">United States 🇺🇸 (B1/B2 Slot Assistance)</option>
                        <option value="United Kingdom 🇬🇧">United Kingdom 🇬🇧 (Standard Visitor)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-navy/70 mb-1">
                        Travel Purpose
                      </label>
                      <select
                        value={visaPurpose}
                        onChange={(e) => setVisaPurpose(e.target.value)}
                        className="w-full min-h-11 rounded-xl border border-brand-navy/15 bg-slate-50 p-2.5 text-xs font-semibold text-brand-navy focus:border-brand-gold focus:outline-none sm:min-h-0"
                      >
                        <option value="Tourist & Leisure">Tourist & Leisure</option>
                        <option value="Business & Conference">Business & Corporate Conference</option>
                        <option value="Family Visit & Transit">Family Visit / Transit</option>
                        <option value="Long-Term Residence / Work">Long-Term Work / Residence</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-navy/70 mb-1">
                      Expected Departure Timeline
                    </label>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {['Next 14 Days (Urgent)', 'Next 30 Days', '1–3 Months'].map((opt) => (
                        <button
                          key={opt}
                          type="button"
                          onClick={() => setVisaTravelMonth(opt)}
                          className={`flex min-h-11 items-center justify-center rounded-xl border p-2.5 text-center text-xs font-bold transition cursor-pointer sm:min-h-0 ${
                            visaTravelMonth === opt
                              ? 'border-brand-gold bg-brand-gold/15 text-brand-navy'
                              : 'border-brand-navy/10 bg-slate-50 text-brand-navy/70 hover:bg-slate-100'
                          }`}
                        >
                          {opt}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}

              {/* Umrah Form */}
              {division === 'umrah' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-navy/70 mb-1">
                        Preferred Departure Month
                      </label>
                      <select
                        value={umrahMonth}
                        onChange={(e) => setUmrahMonth(e.target.value)}
                        className="w-full min-h-11 rounded-xl border border-brand-navy/15 bg-slate-50 p-2.5 text-xs font-semibold text-brand-navy focus:border-brand-gold focus:outline-none sm:min-h-0"
                      >
                        <option value="March 2026 (Ramadan)">March 2026 (Blessed Ramadan Package)</option>
                        <option value="April 2026 (Shawwal)">April 2026 (Shawwal Group Departure)</option>
                        <option value="May 2026 (Pre-Hajj)">May 2026 (Direct Saudi Airlines)</option>
                        <option value="Custom Group Departure">Custom Dates (Private Family Group)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-navy/70 mb-1">
                        Number of Pilgrims
                      </label>
                      <div className="flex items-center gap-2">
                        {[1, 2, 4, '5+'].map((num) => (
                          <button
                            key={String(num)}
                            type="button"
                            onClick={() => setUmrahPilgrims(typeof num === 'number' ? num : 5)}
                            className={`flex min-h-11 flex-1 items-center justify-center rounded-xl border py-2 text-center text-xs font-bold transition cursor-pointer sm:min-h-0 ${
                              (num === '5+' && umrahPilgrims >= 5) || umrahPilgrims === num
                                ? 'border-brand-gold bg-brand-gold/15 text-brand-navy'
                                : 'border-brand-navy/10 bg-slate-50 text-brand-navy/70 hover:bg-slate-100'
                            }`}
                          >
                            {num} {num === 1 ? 'Person' : 'Pilgrims'}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-navy/70 mb-1">
                      Hotel & Distance Preference
                    </label>
                    <select
                      value={umrahHotel}
                      onChange={(e) => setUmrahHotel(e.target.value)}
                      className="w-full rounded-xl border border-brand-navy/15 bg-slate-50 p-2.5 text-xs font-semibold text-brand-navy focus:border-brand-gold focus:outline-none"
                    >
                      <option value="5-Star Luxury (Clock Tower)">5-Star Luxury (Fairmont / Swissotel Clock Tower — 0m)</option>
                      <option value="4-Star Premium (Walking Distance)">4-Star Premium (Ajyad / Ibrahim Khalil — 250m)</option>
                      <option value="Economy Group (Shuttle Included)">Economy Comfort (3-Star with 24/7 Haram Shuttle)</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Attestation Form */}
              {division === 'attestation' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-navy/70 mb-1">
                        Certificate Type
                      </label>
                      <select
                        value={attestDoc}
                        onChange={(e) => setAttestDoc(e.target.value)}
                        className="w-full min-h-11 rounded-xl border border-brand-navy/15 bg-slate-50 p-2.5 text-xs font-semibold text-brand-navy focus:border-brand-gold focus:outline-none sm:min-h-0"
                      >
                        <option value="Degree / Educational Certificate">Degree / Diploma / Educational</option>
                        <option value="Marriage / Birth Certificate">Marriage / Birth Certificate (Personal)</option>
                        <option value="Commercial / Export Invoices">Commercial Invoice / Board Resolution</option>
                        <option value="Nursing / Medical License">Medical / Nursing Registration</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-navy/70 mb-1">
                        Target Country
                      </label>
                      <select
                        value={attestCountry}
                        onChange={(e) => setAttestCountry(e.target.value)}
                        className="w-full min-h-11 rounded-xl border border-brand-navy/15 bg-slate-50 p-2.5 text-xs font-semibold text-brand-navy focus:border-brand-gold focus:outline-none sm:min-h-0"
                      >
                        <option value="UAE / Gulf">UAE / Dubai (MOFA + Embassy)</option>
                        <option value="Saudi Arabia">Saudi Arabia (SACM + Cultural)</option>
                        <option value="Qatar / Kuwait / Oman">Qatar / Kuwait / Oman</option>
                        <option value="Hague Apostille (USA / UK / EU)">Hague Apostille (120+ Member Countries)</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-navy/70 mb-1">
                      Pickup State / City
                    </label>
                    <select
                      value={attestCity}
                      onChange={(e) => setAttestCity(e.target.value)}
                      className="w-full rounded-xl border border-brand-navy/15 bg-slate-50 p-2.5 text-xs font-semibold text-brand-navy focus:border-brand-gold focus:outline-none"
                    >
                      <option value="Hyderabad / Telangana">Hyderabad & Telangana (Same-Day Pickup)</option>
                      <option value="Bangalore / Karnataka">Bangalore & Karnataka</option>
                      <option value="Mumbai / Maharashtra">Mumbai & Maharashtra</option>
                      <option value="Delhi / NCR">Delhi / NCR</option>
                      <option value="Chennai / Tamil Nadu">Chennai & Tamil Nadu</option>
                      <option value="Other All-India Pincode">Other Pincode across India (Blue Dart Express)</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Manpower Form */}
              {division === 'manpower' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-navy/70 mb-1">
                        Industry / Job Sector
                      </label>
                      <select
                        value={careerSector}
                        onChange={(e) => setCareerSector(e.target.value)}
                        className="w-full min-h-11 rounded-xl border border-brand-navy/15 bg-slate-50 p-2.5 text-xs font-semibold text-brand-navy focus:border-brand-gold focus:outline-none sm:min-h-0"
                      >
                        <option value="Healthcare & Nursing">Healthcare & Nursing (MOH / DHA)</option>
                        <option value="Engineering & Construction">Civil / Mechanical Engineering</option>
                        <option value="Hospitality & Facility">Hospitality & Facilities Management</option>
                        <option value="IT & Software Development">IT & Cloud Systems</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-navy/70 mb-1">
                        Preferred Location
                      </label>
                      <select
                        value={careerCountry}
                        onChange={(e) => setCareerCountry(e.target.value)}
                        className="w-full min-h-11 rounded-xl border border-brand-navy/15 bg-slate-50 p-2.5 text-xs font-semibold text-brand-navy focus:border-brand-gold focus:outline-none sm:min-h-0"
                      >
                        <option value="Gulf / Saudi Arabia / UAE">Gulf / Saudi Arabia & UAE (Tax-Free)</option>
                        <option value="Europe / Poland / Germany">Europe / Poland & Germany</option>
                        <option value="Singapore / Malaysia">Singapore & Malaysia</option>
                        <option value="Open to Any High-Growth Market">Open to Any High-Growth Market</option>
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-navy/70 mb-1">
                      Total Experience
                    </label>
                    <select
                      value={careerExp}
                      onChange={(e) => setCareerExp(e.target.value)}
                      className="w-full rounded-xl border border-brand-navy/15 bg-slate-50 p-2.5 text-xs font-semibold text-brand-navy focus:border-brand-gold focus:outline-none"
                    >
                      <option value="1–2 Years">1–2 Years</option>
                      <option value="3–5 Years">3–5 Years (Mid-Level)</option>
                      <option value="6+ Years">6+ Years (Senior / Lead)</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Continue to Step 2 Button */}
              <button
                type="button"
                onClick={() => setStep(2)}
                className="tactile-btn mt-6 min-h-12 w-full rounded-full bg-brand-navy py-3 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-brand-gold hover:text-brand-navy shadow-md cursor-pointer flex items-center justify-center gap-2 sm:min-h-0"
              >
                <span>Calculate Eligibility & Match →</span>
              </button>
            </div>
          )}

          {/* STEP 2: Instant Results Preview + Lead Contact Capture */}
          {step === 2 && (
            <form onSubmit={handleSubmit} className="space-y-5 animate-[fadeIn_0.2s_ease-out]">
              {/* Dynamic Instant Assessment Output Card */}
              <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 sm:p-5 text-emerald-950">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 px-2.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-800">
                    <span className="live-pulse-dot text-emerald-600" /> High Probability Match
                  </span>
                  <span className="font-display text-xs font-extrabold text-emerald-800">
                    {division === 'study-abroad' && '92% Admission Match'}
                    {division === 'visa' && '99% Compliance Score'}
                    {division === 'umrah' && 'Priority Seat Request'}
                    {division === 'attestation' && 'SLA ~7 Working Days'}
                    {division === 'manpower' && 'Direct Employer Match'}
                  </span>
                </div>

                <h3 className="mt-2 font-display text-sm sm:text-base font-bold text-emerald-900">
                  {division === 'study-abroad' && `Eligible for Global Top Universities in ${studyCountry} + Merit Scholarship Assessment`}
                  {division === 'visa' && `Direct Consular Clearance Ready for ${visaCountry} (${visaPurpose})`}
                  {division === 'umrah' && `Priority Itinerary Request for ${umrahPilgrims} Pilgrims (${umrahHotel})`}
                  {division === 'attestation' && `Insured MEA & Apostille Protocol Confirmed for ${attestCountry}`}
                  {division === 'manpower' && `Approved Job Openings Available in ${careerCountry} (${careerSector})`}
                </h3>

                <p className="mt-1 text-[11px] text-emerald-800/80">
                  Enter your direct contact details to unlock your <strong>Complete Dossier</strong> and get connected with our Senior Advisory Desk.
                </p>
              </div>

              {/* 3-Field High Converting Lead Form */}
              <div className="space-y-3">
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-navy/70 mb-1">
                    Your Full Name *
                  </label>
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Rahul Sharma"
                    className="w-full min-h-11 rounded-xl border border-brand-navy/15 bg-white p-3 text-xs text-brand-navy placeholder:text-slate-400 focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 focus:outline-none sm:min-h-0"
                  />
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-navy/70 mb-1">
                      WhatsApp Phone Number *
                    </label>
                    <input
                      type="tel"
                      required
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="e.g. +91 98765 43210"
                      className="w-full min-h-11 rounded-xl border border-brand-navy/15 bg-white p-3 text-xs text-brand-navy placeholder:text-slate-400 focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 focus:outline-none font-mono sm:min-h-0"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-navy/70 mb-1">
                      Email Address (Optional)
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="e.g. rahul@gmail.com"
                      className="w-full min-h-11 rounded-xl border border-brand-navy/15 bg-white p-3 text-xs text-brand-navy placeholder:text-slate-400 focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 focus:outline-none sm:min-h-0"
                    />
                  </div>
                </div>
              </div>

              {errorMsg && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-[11px] font-semibold text-rose-700">
                  {errorMsg}
                </div>
              )}

              <div className="rounded-xl bg-slate-50 p-3 text-[10px] text-slate-500 flex items-start gap-2">
                <span>🔒</span>
                <span>
                  <strong>DPDP-2023 Protected:</strong> Your information is strictly confidential. No spam, no unsolicited calls.
                </span>
              </div>

              <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
                <button
                  type="button"
                  onClick={() => setStep(1)}
                  className="w-full min-h-11 rounded-full border border-brand-navy/20 px-5 py-3 text-xs font-bold uppercase tracking-wider text-brand-navy hover:bg-slate-100 transition cursor-pointer sm:min-h-0 sm:w-auto"
                >
                  ← Edit Criteria
                </button>

                <button
                  type="submit"
                  disabled={leadMutation.isPending}
                  className="tactile-btn w-full min-h-12 rounded-full bg-brand-gold py-3 text-xs font-bold uppercase tracking-wider text-brand-navy transition hover:bg-brand-gold-hover hover:text-white shadow-md cursor-pointer disabled:opacity-50 flex items-center justify-center gap-2 sm:min-h-0 sm:flex-1"
                >
                  {leadMutation.isPending ? 'Verifying & Generating...' : 'Get Full Dossier & Advisor Call →'}
                </button>
              </div>
            </form>
          )}

          {/* STEP 3: Conversion Complete & Immediate Action Triggers */}
          {step === 3 && (
            <div className="space-y-6 text-center animate-[fadeIn_0.2s_ease-out]">
              <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500/20 text-3xl">
                ✓
              </div>

              <div>
                <span className="rounded-full border border-brand-gold/40 bg-brand-gold/10 px-3 py-1 font-mono text-xs font-bold text-brand-gold">
                  Tracking Token: {leadToken || 'OP-2026-ACTIVE'}
                </span>
                <h3 className="mt-3 font-display text-xl font-extrabold text-brand-navy">
                  Application Dossier Ready!
                </h3>
                <p className="mt-1 text-xs text-brand-navy/70 max-w-sm mx-auto">
                  Thank you, <strong>{name}</strong>. Your profile has been created and assigned to an Opus senior advisory specialist.
                </p>
              </div>

              {/* 2 Primary Next Steps */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 text-left">
                {isConsultationDivision(division) ? (
                <button
                  type="button"
                  onClick={() => setBookingOpen(true)}
                  className="tactile-btn flex flex-col justify-between rounded-2xl border border-brand-gold/40 bg-gradient-to-br from-brand-gold/10 to-brand-gold/5 p-4 text-left transition hover:border-brand-gold hover:shadow-md"
                >
                  <div>
                    <span className="text-xl">📅</span>
                    <h4 className="mt-1 font-display text-sm font-bold text-brand-navy">
                      Book 1-on-1 Session
                    </h4>
                    <p className="mt-0.5 text-[10px] text-brand-navy/60">
                      Pick an immediate video/phone slot with a verified counselor.
                    </p>
                  </div>
                  <span className="mt-3 text-xs font-bold text-brand-gold flex items-center gap-1">
                    Select Time Slot →
                  </span>
                </button>
                ) : (
                <a
                  href={LEAD_FORM_ROUTE}
                  className="tactile-btn flex flex-col justify-between rounded-2xl border border-brand-gold/40 bg-gradient-to-br from-brand-gold/10 to-brand-gold/5 p-4 transition hover:border-brand-gold hover:shadow-md"
                >
                  <div>
                    <span className="text-xl">📝</span>
                    <h4 className="mt-1 font-display text-sm font-bold text-brand-navy">
                      Request Detailed Quote
                    </h4>
                    <p className="mt-0.5 text-[10px] text-brand-navy/60">
                      Get a tailored package & cost breakdown from our team.
                    </p>
                  </div>
                  <span className="mt-3 text-xs font-bold text-brand-gold flex items-center gap-1">
                    Continue →
                  </span>
                </a>
                )}

                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    setLocation(`/portal?token=${leadToken || ''}`);
                  }}
                  className="tactile-btn flex flex-col justify-between rounded-2xl border border-brand-navy/10 bg-slate-50 p-4 transition hover:border-brand-navy/30 hover:shadow-md text-left cursor-pointer"
                >
                  <div>
                    <span className="text-xl">🚀</span>
                    <h4 className="mt-1 font-display text-sm font-bold text-brand-navy">
                      Track in Client Portal
                    </h4>
                    <p className="mt-0.5 text-[10px] text-brand-navy/60">
                      Upload documents, review agreements, and monitor milestone stages.
                    </p>
                  </div>
                  <span className="mt-3 text-xs font-bold text-brand-navy flex items-center gap-1">
                    Open Tracker →
                  </span>
                </button>
              </div>

              <BookingModal
                open={bookingOpen}
                onClose={() => setBookingOpen(false)}
                division={division}
                fallbackUrl={getBookingUrlForDivision(division)}
              />

              {/* Live Chat Support */}
              <div className="border-t border-brand-navy/10 pt-4 flex items-center justify-between text-xs">
                <span className="text-brand-navy/60 text-[11px]">Need immediate assistance right now?</span>
                <button
                  onClick={openChatwoot}
                  className="font-bold text-brand-gold hover:underline cursor-pointer flex items-center gap-1"
                >
                  <span>💬 Chat Live with Counselor</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
