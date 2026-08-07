import React, { useState } from 'react';
import { useLocation } from 'wouter';

interface ServiceDetails {
  title: string;
  subtitle: string;
  icon: string;
  bannerColor: string;
  desc: string;
  checklistTitle: string;
  checklist: string[];
  timeline: { step: string; details: string }[];
}

export default function PublicService({ params }: { params: { division: string } }) {
  const [, setLocation] = useLocation();
  const [inquiryName, setInquiryName] = useState('');
  const [inquiryPhone, setInquiryPhone] = useState('');
  const [inquiryEmail, setInquiryEmail] = useState('');
  const [consent, setConsent] = useState(false);
  // Division-aware interest context (funnel scoring — mirrors PublicLeadForm)
  const [targetCountry, setTargetCountry] = useState('us');
  const [intakeSeason, setIntakeSeason] = useState('Fall 2027');
  const [visaCategory, setVisaCategory] = useState('student');
  const [visaCountry, setVisaCountry] = useState('');
  const [umrahTier, setUmrahTier] = useState('deluxe');
  const [umrahDeparture, setUmrahDeparture] = useState('sep');
  const [attestationCategory, setAttestationCategory] = useState('educational');
  const [attestationAuth, setAttestationAuth] = useState('apostille');
  const [manpowerSector, setManpowerSector] = useState('healthcare');

  // Dynamic configuration mapping
  const serviceConfigs: Record<string, ServiceDetails> = {
    'study-abroad': {
      title: "Study Abroad Consulting",
      subtitle: "Graduate and Undergraduate Admissions",
      icon: "🎓",
      bannerColor: "from-blue-600/20 to-indigo-600/20",
      desc: "Comprehensive coaching for university applications, statement of purpose (SOP) reviews, reference letters (LOR), funding options, and student visa mock interviews. We cover US, UK, Canada, Germany, and Australia.",
      checklistTitle: "Required Academic Credentials Checklist:",
      checklist: [
        "Official High School / Undergraduate Academic Transcripts",
        "Proof of Language Proficiency (IELTS, TOEFL, or Duolingo)",
        "Statement of Purpose (SOP) draft customized per university",
        "Two Academic or Professional Letters of Recommendation (LOR)",
        "Financial Support Statements (Bank letter, sponsorship proof)"
      ],
      timeline: [
        { step: "Phase 1: Profile & Shortlisting", details: "Select 5-8 target universities matching student budget and GPA." },
        { step: "Phase 2: Documents Review", details: "Review and refine SOPs and LORs with a counselor." },
        { step: "Phase 3: Application Submission", details: "Submit files via official portals before university deadlines." },
        { step: "Phase 4: Visa Prep", details: "Mock interviews and visa checklist verification." }
      ]
    },
    'visa-services': {
      title: "Global Visa Services",
      subtitle: "Secure and Transparent Documentation",
      icon: "🛂",
      bannerColor: "from-emerald-600/20 to-teal-600/20",
      desc: "Fast and reliable preparation for student, work, tourist, and family reunion visa applications. We guide you through biometric scheduling, insurance validations, and verification gates.",
      checklistTitle: "General Visa Document Stack:",
      checklist: [
        "Valid Passport (Minimum 6 months validity from travel date)",
        "Recent passport-sized photographs (as per country specifications)",
        "Confirmed flight reservation and travel itinerary details",
        "Overseas travel health insurance coverage confirmation",
        "Proof of sufficient financial subsistence (Bank statements)"
      ],
      timeline: [
        { step: "Phase 1: Document Auditing", details: "Verification of passport and financials against consulate rules." },
        { step: "Phase 2: Appointment Scheduling", details: "Secure slots for biometrics and consular interview." },
        { step: "Phase 3: Application File Prep", details: "Compile and organize physical visa folders." },
        { step: "Phase 4: Collection", details: "Track passport return and delivery status." }
      ]
    },
    'umrah-travel': {
      title: "Umrah Packages & Travel",
      subtitle: "Spiritual Pilgrimage Planning & Vouchers",
      icon: "🕋",
      bannerColor: "from-amber-600/20 to-yellow-600/20",
      desc: "Dedicated group departures from Hyderabad and Nizamabad. Our packages include flight booking, luxury accommodation close to Masjid al-Haram, seasonal camp permits, and Ziyarat tours with experienced guides.",
      checklistTitle: "Pilgrim Enrollment Checklist:",
      checklist: [
        "Original Passport with minimum 6 months validity",
        "Scanned copy of Aadhaar Card for identity verification",
        "Passport size photo with pure white background",
        "Meningitis vaccination certificate",
        "Advance non-refundable booking fee receipt"
      ],
      timeline: [
        { step: "Phase 1: Package Selection", details: "Choose between economy, standard, or premium options." },
        { step: "Phase 2: Seat Reservation", details: "Lock in seat from the calendar (WIP cap: 30 pilgrims)." },
        { step: "Phase 3: Visa Issuance", details: "Submit passport to the Ministry of Hajj & Umrah portal." },
        { step: "Phase 4: Pre-Departure Briefing", details: "Obtain travel vouchers and attend orientation." }
      ]
    },
    'attestation': {
      title: "Document Attestation",
      subtitle: "HRD, MEA, Apostille & Embassy Legalization",
      icon: "📜",
      bannerColor: "from-purple-600/20 to-pink-600/20",
      desc: "Official apostille stamp processing for educational, marriage, and birth certificates. We handle the entire authentication chain securely via certified courier routes (Blue Dart/DTDC) preventing data loss.",
      checklistTitle: "Legalization Pre-requisites Checklist:",
      checklist: [
        "Original Degree or Birth Certificate needing stamp",
        "Clear photocopy of client Passport",
        "State Government HRD or SDM initial authentication",
        "Embassy specific authority letter signed by applicant"
      ],
      timeline: [
        { step: "Phase 1: Secure Pickup", details: "Log courier package reference and original certificate." },
        { step: "Phase 2: State Verification", details: "Submit to HRD/Sub-Divisional Magistrate." },
        { step: "Phase 3: MEA Apostille", details: "Apply Ministry of External Affairs seals." },
        { step: "Phase 4: Embassy Legalization", details: "Final attestation at destination consulate." }
      ]
    },
    'recruitment': {
      title: "Manpower Recruitment",
      subtitle: "Global Placements & Candidate Hub",
      icon: "💼",
      bannerColor: "from-sky-600/20 to-blue-600/20",
      desc: "Connecting skilled technical and non-technical talent with opportunities in Gulf countries and Europe. We run automatic CV checks and ensure compliance with DPDP employer sharing consent regulations.",
      checklistTitle: "Candidate Screening Checklist:",
      checklist: [
        "Structured Resume / CV in PDF format",
        "Valid Academic and Work Experience Letters",
        "DPDP Data Processing Consent Notice validation",
        "Technical Mock Assessment completion certificate"
      ],
      timeline: [
        { step: "Phase 1: Resume Intake", details: "Upload PDF and extract parsing metadata using Workers AI." },
        { step: "Phase 2: Screening Interview", details: "Conduct screening call with manpower counselor." },
        { step: "Phase 3: Employer Match", details: "Present profiles to verified overseas employer networks." },
        { step: "Phase 4: Selection & Visa", details: "Job offer processing and employment visa sponsorship." }
      ]
    }
  };

  const currentDiv = params.division;
  const data = serviceConfigs[currentDiv] || serviceConfigs['study-abroad'];

  const handleSubmitInquiry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inquiryName || !inquiryPhone || !inquiryEmail) {
      alert("Please fill all details.");
      return;
    }
    if (!consent) {
      alert("Please grant data processing consent.");
      return;
    }

    // Map public route slug -> API division enum (App routes use URL-friendly slugs)
    const divisionMap: Record<string, string> = {
      'study-abroad': 'study-abroad',
      'visa-services': 'visa',
      'umrah-travel': 'umrah',
      'attestation': 'attestation',
      'recruitment': 'manpower',
    };
    const division = divisionMap[currentDiv] || 'study-abroad';

    // Build division-aware interest context so this entry feeds the funnel scorer
    // the same intent signals (destination_specified / budget_given / intake_started)
    // as the full lead form.
    let dynamicContext: Record<string, any> = {};    if (division === 'study-abroad') {
      dynamicContext = { targetCountry, intakeSeason };
    } else if (division === 'visa') {
      dynamicContext = { visaCategory, visaCountry };
    } else if (division === 'umrah') {
      dynamicContext = { umrahTier, umrahDeparture };
    } else if (division === 'attestation') {
      dynamicContext = { attestationCategory, attestationAuth };
    } else if (division === 'manpower') {
      dynamicContext = { manpowerSector };
    }

    // Normalize phone to the API-required format: +91 XXXXX XXXXX
    const digits = inquiryPhone.replace(/\D/g, '');
    const normalizedPhone = digits.length === 10
      ? `+91 ${digits.slice(0, 5)} ${digits.slice(5)}`
      : digits.length === 12 && digits.startsWith('91')
        ? `+91 ${digits.slice(2, 7)} ${digits.slice(7)}`
        : inquiryPhone;

    try {
      const res = await fetch('/api/public/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: inquiryName,
          phone: normalizedPhone,
          email: inquiryEmail,
          highestQualification: 'undergrad',
          division,
          leadSource: 'website',
          dynamicContext,
          consents: { coreProcessing: true, whatsappUpdates: true, marketingCampaigns: false }
        })
      });
      const resData = await res.json();
      if (res.ok) {
        alert(`Inquiry logged successfully! Your journey token is: ${resData.token}`);
        setLocation(`/portal?token=${encodeURIComponent(resData.token)}`);
      } else {
        alert(`Error: ${resData.error || resData.details || 'Submission failed'}`);
      }
    } catch (err: any) {
      alert(`Network error: ${err.message}`);
    }
  };

  return (
    <div className="min-h-screen bg-[hsl(224,25%,12%)] text-white font-sans flex flex-col justify-between">
      
      {/* Header */}
      <header className="bg-[hsl(224,25%,12%)] border-b border-[hsl(224,25%,18%)] px-6 py-4 flex items-center justify-between">
        <button onClick={() => setLocation('/')} className="flex items-center gap-2 text-[hsl(45,100%,50%)] hover:text-white transition-all font-bold">
          ← Back to Home
        </button>
        <span className="text-sm font-bold text-gray-400">OPUS OVERSEAS DIVISION DETAILS</span>
      </header>

      {/* Main Hero Container */}
      <main className="max-w-6xl mx-auto w-full px-6 py-12 grid grid-cols-1 lg:grid-cols-3 gap-12 flex-1">
        
        {/* Left Columns - Details */}
        <div className="lg:col-span-2 space-y-8">
          
          {/* Service Header Card */}
          <div className={`rounded-2xl bg-gradient-to-r ${data.bannerColor} border border-[hsl(224,25%,18%)] p-8 relative overflow-hidden`}>
            <div className="text-5xl mb-4">{data.icon}</div>
            <span className="text-xs uppercase font-mono tracking-widest text-[hsl(45,100%,50%)] font-bold">{data.subtitle}</span>
            <h1 className="text-3xl md:text-4xl font-extrabold mt-2 tracking-tight">{data.title}</h1>
            <p className="text-gray-300 text-sm mt-4 leading-relaxed max-w-xl">
              {data.desc}
            </p>
          </div>

          {/* Checklist */}
          <div className="rounded-xl border border-[hsl(224,25%,18%)] bg-[hsl(224,25%,18%)]/50 p-6 space-y-4">
            <h3 className="font-bold text-white uppercase text-xs tracking-wider border-b border-[hsl(224,25%,18%)] pb-2">
              {data.checklistTitle}
            </h3>
            <ul className="space-y-3">
              {data.checklist.map((item, idx) => (
                <li key={idx} className="flex items-start gap-2 text-xs text-gray-300">
                  <span className="text-[hsl(45,100%,50%)] font-bold">✔</span>
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>

          {/* Timeline workflow */}
          <div className="space-y-4">
            <h3 className="font-bold text-white uppercase text-xs tracking-wider">Processing Timeline Stages:</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {data.timeline.map((step, idx) => (
                <div key={idx} className="rounded-lg border border-[hsl(224,25%,18%)] bg-[hsl(224,25%,18%)] p-4 space-y-1">
                  <span className="text-[10px] uppercase font-bold text-[hsl(45,100%,50%)]">{step.step}</span>
                  <p className="text-xs text-gray-300">{step.details}</p>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* Right Column - Inquiry Form */}
        <div className="space-y-6">
          
          <div className="rounded-xl border border-[hsl(45,100%,40%)]/30 bg-[hsl(224,25%,18%)] p-6 space-y-4 shadow-[0_0_15px_rgba(250,204,21,0.05)]">
            <h3 className="text-md font-bold text-white tracking-tight">Submit Division Inquiry</h3>
            <p className="text-xs text-gray-400">
              Submit your contact details. A division counselor will review and allocate a journey token within 2 hours.
            </p>

            <form onSubmit={handleSubmitInquiry} className="space-y-3 text-xs">
              <div>
                <label className="block text-gray-400 mb-1">Full Name</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Ramesh Kumar"
                  value={inquiryName}
                  onChange={(e) => setInquiryName(e.target.value)}
                  className="w-full rounded bg-[hsl(224,25%,12%)] border border-[hsl(224,25%,26%)] p-2 text-white focus:border-[hsl(45,100%,50%)] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-gray-400 mb-1">Phone Number (with +91)</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. +91 98765 00001"
                  value={inquiryPhone}
                  onChange={(e) => setInquiryPhone(e.target.value)}
                  className="w-full rounded bg-[hsl(224,25%,12%)] border border-[hsl(224,25%,26%)] p-2 text-white focus:border-[hsl(45,100%,50%)] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-gray-400 mb-1">Email Address</label>
                <input
                  type="email"
                  required
                  placeholder="e.g. ramesh@test.com"
                  value={inquiryEmail}
                  onChange={(e) => setInquiryEmail(e.target.value)}
                  className="w-full rounded bg-[hsl(224,25%,12%)] border border-[hsl(224,25%,26%)] p-2 text-white focus:border-[hsl(45,100%,50%)] focus:outline-none"
                />
              </div>

              {currentDiv === 'study-abroad' && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-gray-400 mb-1">Target Country</label>
                    <select
                      value={targetCountry}
                      onChange={(e) => setTargetCountry(e.target.value)}
                      className="w-full rounded bg-[hsl(224,25%,12%)] border border-[hsl(224,25%,26%)] p-2 text-white focus:border-[hsl(45,100%,50%)] focus:outline-none"
                    >
                      <option value="us">United States</option>
                      <option value="uk">United Kingdom</option>
                      <option value="canada">Canada</option>
                      <option value="germany">Germany</option>
                      <option value="australia">Australia</option>
                      <option value="other">Other</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-gray-400 mb-1">Intake Season</label>
                    <select
                      value={intakeSeason}
                      onChange={(e) => setIntakeSeason(e.target.value)}
                      className="w-full rounded bg-[hsl(224,25%,12%)] border border-[hsl(224,25%,26%)] p-2 text-white focus:border-[hsl(45,100%,50%)] focus:outline-none"
                    >
                      <option value="Fall 2027">Fall 2027</option>
                      <option value="Spring 2028">Spring 2028</option>
                      <option value="Summer 2028">Summer 2028</option>
                    </select>
                  </div>
                </div>
              )}

              {currentDiv === 'visa-services' && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-gray-400 mb-1">Visa Category</label>
                    <select
                      value={visaCategory}
                      onChange={(e) => setVisaCategory(e.target.value)}
                      className="w-full rounded bg-[hsl(224,25%,12%)] border border-[hsl(224,25%,26%)] p-2 text-white focus:border-[hsl(45,100%,50%)] focus:outline-none"
                    >
                      <option value="student">Student</option>
                      <option value="work">Work</option>
                      <option value="tourist">Tourist</option>
                      <option value="family">Family Reunion</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-gray-400 mb-1">Destination Country</label>
                    <input
                      type="text"
                      placeholder="e.g. UAE, UK"
                      value={visaCountry}
                      onChange={(e) => setVisaCountry(e.target.value)}
                      className="w-full rounded bg-[hsl(224,25%,12%)] border border-[hsl(224,25%,26%)] p-2 text-white focus:border-[hsl(45,100%,50%)] focus:outline-none"
                    />
                  </div>
                </div>
              )}

              {currentDiv === 'umrah-travel' && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-gray-400 mb-1">Package Tier</label>
                    <select
                      value={umrahTier}
                      onChange={(e) => setUmrahTier(e.target.value)}
                      className="w-full rounded bg-[hsl(224,25%,12%)] border border-[hsl(224,25%,26%)] p-2 text-white focus:border-[hsl(45,100%,50%)] focus:outline-none"
                    >
                      <option value="economy">Economy</option>
                      <option value="standard">Standard</option>
                      <option value="deluxe">Deluxe</option>
                      <option value="premium">Premium</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-gray-400 mb-1">Departure Month</label>
                    <select
                      value={umrahDeparture}
                      onChange={(e) => setUmrahDeparture(e.target.value)}
                      className="w-full rounded bg-[hsl(224,25%,12%)] border border-[hsl(224,25%,26%)] p-2 text-white focus:border-[hsl(45,100%,50%)] focus:outline-none"
                    >
                      <option value="sep">September</option>
                      <option value="oct">October</option>
                      <option value="nov">November</option>
                      <option value="dec">December</option>
                    </select>
                  </div>
                </div>
              )}

              {currentDiv === 'attestation' && (
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-gray-400 mb-1">Certificate Category</label>
                    <select
                      value={attestationCategory}
                      onChange={(e) => setAttestationCategory(e.target.value)}
                      className="w-full rounded bg-[hsl(224,25%,12%)] border border-[hsl(224,25%,26%)] p-2 text-white focus:border-[hsl(45,100%,50%)] focus:outline-none"
                    >
                      <option value="educational">Educational</option>
                      <option value="marriage">Marriage</option>
                      <option value="birth">Birth</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-gray-400 mb-1">Authentication</label>
                    <select
                      value={attestationAuth}
                      onChange={(e) => setAttestationAuth(e.target.value)}
                      className="w-full rounded bg-[hsl(224,25%,12%)] border border-[hsl(224,25%,26%)] p-2 text-white focus:border-[hsl(45,100%,50%)] focus:outline-none"
                    >
                      <option value="apostille">Apostille</option>
                      <option value="embassy">Embassy Legalization</option>
                      <option value="mea">MEA</option>
                    </select>
                  </div>
                </div>
              )}

              {currentDiv === 'recruitment' && (
                <div>
                  <label className="block text-gray-400 mb-1">Target Sector</label>
                  <select
                    value={manpowerSector}
                    onChange={(e) => setManpowerSector(e.target.value)}
                    className="w-full rounded bg-[hsl(224,25%,12%)] border border-[hsl(224,25%,26%)] p-2 text-white focus:border-[hsl(45,100%,50%)] focus:outline-none"
                  >
                    <option value="healthcare">Healthcare</option>
                    <option value="construction">Construction</option>
                    <option value="hospitality">Hospitality</option>
                    <option value="it">IT / Tech</option>
                    <option value="domestic">Domestic Help</option>
                  </select>
                </div>
              )}

              <div className="flex items-start gap-2 pt-2">
                <input
                  type="checkbox"
                  id="consentNotice"
                  checked={consent}
                  onChange={(e) => setConsent(e.target.checked)}
                  className="mt-0.5 accent-[hsl(45,100%,50%)]"
                />
                <label htmlFor="consentNotice" className="text-[10px] text-gray-400 leading-normal">
                  Notice: I consent to having Opus Overseas process my digital identity documents for overseas travel/education applications under DPDP provisions.
                </label>
              </div>

              <button
                type="submit"
                className="w-full rounded bg-[hsl(45,100%,50%)] text-black font-bold py-2.5 hover:bg-[hsl(45,100%,45%)] transition-colors mt-2"
              >
                Send Inquiry File
              </button>
            </form>
          </div>

          {/* Offices Address Help Widget */}
          <div className="rounded-xl border border-[hsl(224,25%,18%)] bg-[hsl(224,25%,18%)]/30 p-6 text-xs text-gray-400 space-y-2">
            <span className="font-bold text-white block uppercase tracking-wider text-[10px]">Division Support Office</span>
            <p>📍 Nizamabad GPO complex block, Hyderabad Road, TS, India.</p>
            <p>📧 support@opusoverseas.com</p>
          </div>

        </div>

      </main>

      {/* Footer */}
      <footer className="border-t border-[hsl(224,25%,18%)] py-6 text-center text-[10px] text-gray-500 bg-[hsl(224,25%,12%)]">
        © {new Date().getFullYear()} Opus Overseas. Registered under Nizamabad division compliance.
      </footer>

    </div>
  );
}
