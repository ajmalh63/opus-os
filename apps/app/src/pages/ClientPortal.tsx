import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Link } from 'wouter';
import Logo from '../components/Logo';
import LiveWallpaper from '../components/LiveWallpaper';
import UmrahClientSection from '../components/UmrahClientSection';
import StudyAbroadClientSection from '../components/StudyAbroadClientSection';

interface Engagement {
  id: string;
  clientId: string;
  division: 'study-abroad' | 'visa' | 'umrah' | 'attestation' | 'manpower';
  title: string;
  stageKey: 'lead' | 'qualified' | 'documents' | 'processing' | 'complete';
  outstandingBalance: number;
  status: 'active' | 'closed' | 'deferred';
  createdAt: number;
  updatedAt: number;
}

interface Consent {
  consentType: 'core-processing' | 'university-sharing' | 'whatsapp-updates' | 'marketing-campaigns' | 'manpower-retain';
  status: 'granted' | 'withdrawn';
  grantedAt: number;
}

interface DocumentRecord {
  id: string;
  fileName: string;
  version: string;
  status: 'pending' | 'verified' | 'rejected';
  uploadedAt: number;
}

interface PaymentRecord {
  id: string;
  amount: number;
  type: string;
  milestoneName: string;
  method: string | null;
  referenceNumber: string | null;
  createdAt: number;
}

interface ClientPortalData {
  success: boolean;
  client: {
    id: string;
    name: string;
    email: string;
    createdAt: number;
    intakeContext?: string;
  };
  engagements: Engagement[];
  consents: Consent[];
  documents: DocumentRecord[];
  payments?: PaymentRecord[];
}

interface SessionResponse {
  success: boolean;
  authenticated: boolean;
  email: string;
  journeys: ClientPortalData[];
}



const VISA_COUNTRIES = [
  "Dubai 🇦🇪",
  "Thailand 🇹🇭",
  "Malaysia 🇲🇾",
  "Vietnam 🇻🇳",
  "Sri Lanka 🇱🇰",
  "Azerbaijan 🇦🇿",
  "Bahrain 🇧🇭",
  "Cambodia 🇰🇭",
  "Egypt 🇪🇬",
  "Ethiopia 🇪🇹",
  "Georgia 🇬🇪",
  "Hong Kong 🇭🇰",
  "Indonesia 🇮🇩",
  "Kenya 🇰🇪",
  "Morocco 🇲🇦",
  "Myanmar 🇲🇲",
  "Oman 🇴🇲",
  "Qatar 🇶🇦",
  "Russia 🇷🇺",
  "Turkey 🇹🇷",
  "Uzbekistan 🇺🇿",
  "Zambia 🇿🇲"
];

const DEFAULT_PRODUCTS = [
  { id: 'v1', country: 'Dubai 🇦🇪', visaType: 'Tourist', entryType: 'Single Entry', processingTime: '3-4 Days', feePaise: 720000 },
  { id: 'v2', country: 'Thailand 🇹🇭', visaType: 'Tourist', entryType: 'Single Entry', processingTime: '2-3 Days', feePaise: 450000 },
  { id: 'v3', country: 'Malaysia 🇲🇾', visaType: 'Tourist', entryType: 'Single Entry', processingTime: '4-5 Days', feePaise: 580000 },
  { id: 'v4', country: 'Singapore 🇸🇬', visaType: 'Tourist', entryType: 'Single Entry', processingTime: '5-7 Days', feePaise: 850000 },
  { id: '5', country: 'Vietnam 🇻🇳', visaType: 'Tourist', entryType: 'Single Entry', processingTime: '3 Days', feePaise: 390000 },
  { id: '6', country: 'Sri Lanka 🇱🇰', visaType: 'Tourist', entryType: 'Single Entry', processingTime: '2 Days', feePaise: 250000 }
];


export default function ClientPortal() {
  const [toast, setToast] = useState<{ show: boolean; msg: string }>({ show: false, msg: '' });
  const showToast = (msg: string) => {
    setToast({ show: true, msg });
    setTimeout(() => setToast({ show: false, msg: '' }), 3500);
  };

  // Get token from URL query parameters
  const [tokenInput, setTokenInput] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('token') || '';
  });

  const [activeToken, setActiveToken] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('token') || '';
  });

  // Keep URL updated with the searched token
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (activeToken) {
      params.set('token', activeToken);
    } else {
      params.delete('token');
    }
    const newRelativePathQuery = window.location.pathname + (params.toString() ? '?' + params.toString() : '');
    window.history.pushState(null, '', newRelativePathQuery);
  }, [activeToken]);

  // Fetch client portal details (public lookup endpoint)
  const { data, isFetching, error, isError } = useQuery<ClientPortalData>({
    queryKey: ['portalLookup', activeToken],
    queryFn: async () => {
      if (!activeToken) return null;
      const res = await fetch(`/api/public/portal/lookup?token=${encodeURIComponent(activeToken)}`);
      if (!res.ok) {
        if (res.status === 404) {
          throw new Error('No client record matches the provided token.');
        }
        throw new Error(await res.text() || 'Application status lookup failed.');
      }
      return res.json();
    },
    enabled: !!activeToken,
    retry: false,
  });

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = tokenInput.trim();
    if (!cleaned) {
      showToast('Please enter a valid tracking token.');
      return;
    }
    setActiveToken(cleaned);
  };

  // DPDP consent withdrawal (subject right): token-authenticated public action.
  const withdrawConsent = useMutation({
    mutationFn: async ({ token, consentType }: { token: string; consentType: string }) => {
      const res = await fetch('/api/public/portal/consent/withdraw', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, consentType }),
      });
      if (!res.ok) { const e = await res.json().catch(() => null); throw new Error(e?.error || 'Withdrawal failed'); }
      return res.json();
    },
    onSuccess: () => { showToast('Consent withdrawn. Non-core outreach is now suppressed.'); },
    onError: (e: any) => showToast((e as Error).message),
  });

  const handleFillDemo = () => {
    setTokenInput('OP-2026-5555');
    setActiveToken('OP-2026-5555');
    showToast('Demo token loaded.');
  };

  // ====== Authenticated "My Journey" (Section 25.4) ======
  const [loginState, setLoginState] = useState<{ email: string; password: string }>({ email: '', password: '' });
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [claimToken, setClaimToken] = useState('');
  const [claimPhone, setClaimPhone] = useState('');

  // Fetch authenticated journeys once logged in
  const { data: sessionData, isFetching: sessionFetching, refetch: refetchSession, error: sessionError, isError: sessionIsError } =
    useQuery<SessionResponse>({
      queryKey: ['portalSession', authEmail],
      queryFn: async () => {
        if (!authEmail) return null;
        const res = await fetch('/api/public/portal/session', { credentials: 'include' });
        if (res.status === 401) {
          setAuthEmail(null);
          throw new Error('Session expired. Please sign in again.');
        }
        if (!res.ok) throw new Error(await res.text() || 'Failed to load your journeys.');
        return res.json();
      },
      enabled: !!authEmail,
      retry: false,
    });

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginState.email || !loginState.password) {
      showToast('Enter your email and password.');
      return;
    }
    try {
      const res = await fetch('/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: loginState.email, password: loginState.password }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || 'Sign-in failed. Check your credentials.');
      }
      setAuthEmail(loginState.email);
      setLoginState({ email: loginState.email, password: '' });
      showToast('Signed in successfully.');
    } catch (err: any) {
      showToast(`Sign-in error: ${err.message}`);
    }
  };

  const handleSignOut = () => {
    fetch('/api/auth/sign-out', { method: 'POST', credentials: 'include' }).catch(() => {});
    setAuthEmail(null);
    setLoginState({ email: '', password: '' });
    showToast('Signed out.');
  };

  const handleClaim = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!claimToken || !claimPhone) {
      showToast('Enter your journey token and phone number.');
      return;
    }
    try {
      const res = await fetch('/api/public/portal/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ token: claimToken, phone: claimPhone }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || 'Claim failed.');
      }
      showToast(data.message || 'Journey linked to your account.');
      setClaimToken('');
      setClaimPhone('');
      refetchSession();
    } catch (err: any) {
      showToast(`Claim error: ${err.message}`);
    }
  };

// Portal section nav — 'Visa Services' is the primary entry path (Visa Phase-1).
  // 'Journey' keeps the existing token lookup dashboard / My Journey flow intact.
  const [portalTab, setPortalTab] = useState<'visa' | 'jobs' | 'umrah' | 'study' | 'journey'>('visa');

  const stages = [
    { key: 'lead', label: 'Consultation', seq: 1, desc: 'Initial counseling and profile assembly.' },
    { key: 'qualified', label: 'Qualification', seq: 2, desc: 'Eligibility review and documentation checklist.' },
    { key: 'documents', label: 'Document Vault', seq: 3, desc: 'Original certificate review & compliance validation.' },
    { key: 'processing', label: 'Processing', seq: 4, desc: 'Application submission to university/embassy.' },
    { key: 'complete', label: 'Stamping & Transit', seq: 5, desc: 'Visa stamping, pre-departure briefing, and travel.' },
  ];

  return (
    <div className="relative bg-[#070B19] text-brand-cream font-sans min-h-screen flex flex-col justify-between selection:bg-brand-gold selection:text-brand-navy overflow-hidden">
      <LiveWallpaper />
      {/* HEADER */}
      <header className="bg-brand-navy/80 backdrop-blur-md border-b border-brand-navyLight py-4 px-8 sticky top-0 shadow-lg z-30 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Logo className="h-9 w-auto" />
          <div>
            <span className="font-display font-bold text-base tracking-wider block text-white">Opus Overseas</span>
            <span className="text-[9px] text-brand-gold tracking-widest uppercase block leading-none">Client Status Desk</span>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <Link href="/partner" className="text-xs text-brand-cream/80 hover:text-brand-gold font-medium transition">
            Partner Portal
          </Link>
          <a href="tel:+919876543210" className="text-xs bg-brand-navyLight border border-brand-gold/20 hover:border-brand-gold hover:text-white px-3 py-1.5 rounded transition text-brand-gold font-semibold">
            Support Desk
          </a>
        </div>
      </header>

      {/* MAIN CONTAINER */}
      <main className="max-w-7xl w-full mx-auto p-6 md:p-8 flex-1 flex flex-col gap-8">
        
        {/* LOOKUP HERO SECTION */}
        <section className="bg-gradient-to-br from-brand-navyLight to-[#111A36] p-8 rounded-2xl border border-brand-navyLight shadow-2xl flex flex-col lg:flex-row items-center justify-between gap-8">
          <div className="max-w-xl space-y-3">
            <h1 className="font-display font-extrabold text-2xl md:text-3xl text-white leading-tight">
              Track Your Global Journey in <span className="text-brand-gold">Real Time</span>
            </h1>
            <p className="text-xs text-brand-cream/70 leading-relaxed">
              Welcome to the public lookup desk. Enter your unique client token <code className="text-brand-gold font-mono font-bold bg-brand-navy/40 px-1.5 py-0.5 rounded">OP-2026-XXXX</code> to check your university application progress, legal consent status, and original document vault status.
            </p>
          </div>

          <div className="w-full max-w-md bg-brand-navy p-6 rounded-xl border border-brand-navyLight/60 shadow-xl flex flex-col gap-4">
            {/* ====== Sign In (My Journey, Section 25.4) ====== */}
            {!authEmail ? (
              <form onSubmit={handleSignIn} className="space-y-3">
                <div>
                  <label className="text-[10px] uppercase tracking-wider text-brand-gold font-bold block mb-1">
                    My Journey Sign In
                  </label>
                  <input
                    type="email"
                    required
                    placeholder="you@email.com"
                    value={loginState.email}
                    onChange={(e) => setLoginState({ ...loginState, email: e.target.value })}
                    className="w-full text-xs p-3 border border-brand-navyLight rounded bg-brand-navyLight text-white placeholder-brand-cream/35 focus:border-brand-gold focus:ring-1 focus:ring-brand-gold"
                  />
                </div>
                <input
                  type="password"
                  required
                  placeholder="Password"
                  value={loginState.password}
                  onChange={(e) => setLoginState({ ...loginState, password: e.target.value })}
                  className="w-full text-xs p-3 border border-brand-navyLight rounded bg-brand-navyLight text-white placeholder-brand-cream/35 focus:border-brand-gold focus:ring-1 focus:ring-brand-gold"
                />
                <button
                  type="submit"
                  className="w-full bg-brand-gold hover:bg-brand-goldHover text-brand-navy py-2.5 rounded text-xs font-bold uppercase tracking-wider transition"
                >
                  Sign In to My Journey
                </button>
                <p className="text-[10px] text-brand-cream/50 text-center leading-relaxed">
                  New to the portal? Use the token lookup below first, then link your journey from your dashboard.
                </p>
              </form>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-wider text-brand-gold font-bold">
                    Signed in as {authEmail}
                  </span>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="text-[10px] text-brand-error hover:underline font-semibold"
                  >
                    Sign out
                  </button>
                </div>

                {/* Claim journey token */}
                <form onSubmit={handleClaim} className="space-y-2 border-t border-brand-navyLight pt-3">
                  <span className="text-[10px] uppercase tracking-wider text-brand-cream/60 font-semibold block">
                    Link your journey token
                  </span>
                  <input
                    type="text"
                    placeholder="Token (OP-2026-XXXX)"
                    value={claimToken}
                    onChange={(e) => setClaimToken(e.target.value)}
                    className="w-full text-xs p-2.5 border border-brand-navyLight rounded bg-brand-navyLight text-white placeholder-brand-cream/35 focus:border-brand-gold"
                  />
                  <input
                    type="text"
                    placeholder="Phone (as registered)"
                    value={claimPhone}
                    onChange={(e) => setClaimPhone(e.target.value)}
                    className="w-full text-xs p-2.5 border border-brand-navyLight rounded bg-brand-navyLight text-white placeholder-brand-cream/35 focus:border-brand-gold"
                  />
                  <button
                    type="submit"
                    className="w-full border border-brand-gold/40 text-brand-gold hover:bg-brand-gold hover:text-brand-navy py-2 rounded text-[10px] font-bold uppercase tracking-wider transition"
                  >
                    Link to My Account
                  </button>
                </form>
              </div>
            )}
          </div>

          <div className="w-full max-w-md bg-brand-navy/70 p-5 rounded-xl border border-brand-navyLight/40 shadow-lg">
            <form onSubmit={handleSearchSubmit} className="space-y-3">
              <div>
                <label className="text-[10px] uppercase tracking-wider text-brand-gold font-bold block mb-1">
                  Access Token ID
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. OP-2026-5555"
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value)}
                  className="w-full text-xs p-3 border border-brand-navyLight rounded bg-brand-navyLight text-white placeholder-brand-cream/35 focus:border-brand-gold focus:ring-1 focus:ring-brand-gold"
                />
              </div>
              <button
                type="submit"
                disabled={isFetching}
                className="w-full bg-brand-gold hover:bg-brand-goldHover text-brand-navy py-2.5 rounded text-xs font-bold uppercase tracking-wider transition disabled:opacity-50"
              >
                {isFetching ? 'Resolving...' : 'Lookup Journey'}
              </button>
            </form>

            <div className="border-t border-brand-navyLight pt-3 flex justify-between items-center text-[10px] text-brand-cream/55">
              <span>Quick Demo Token:</span>
              <button
                type="button"
                onClick={handleFillDemo}
                className="text-brand-gold hover:text-brand-goldHover font-bold hover:underline"
              >
                Use OP-2026-5555
              </button>
            </div>
          </div>
        </section>

        {/* PORTAL SECTION NAV — Visa Services primary, Journey overview secondary */}
        {activeToken && (
          <nav className="flex gap-1 rounded-full bg-white/5 p-1 w-fit border border-white/10">
            <button
              type="button"
              onClick={() => setPortalTab('visa')}
              className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition cursor-pointer ${
                portalTab === 'visa' ? 'bg-brand-gold text-brand-navy' : 'text-white/60 hover:text-white'
              }`}
            >
              ✈ Visa Services
            </button>
            <button
              type="button"
              onClick={() => setPortalTab('jobs')}
              className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition cursor-pointer ${
                portalTab === 'jobs' ? 'bg-brand-gold text-brand-navy' : 'text-white/60 hover:text-white'
              }`}
            >
              🧑‍🔧 Jobs
            </button>
            <button
              type="button"
              onClick={() => setPortalTab('umrah')}
              className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition cursor-pointer ${
                portalTab === 'umrah' ? 'bg-brand-gold text-brand-navy' : 'text-white/60 hover:text-white'
              }`}
            >
              🕋 Umrah
            </button>
            <button
              type="button"
              onClick={() => setPortalTab('study')}
              className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition cursor-pointer ${
                portalTab === 'study' ? 'bg-brand-gold text-brand-navy' : 'text-white/60 hover:text-white'
              }`}
            >
              🎓 Study Abroad
            </button>
            <button
              type="button"
              onClick={() => setPortalTab('journey')}
              className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition cursor-pointer ${
                portalTab === 'journey' ? 'bg-brand-gold text-brand-navy' : 'text-white/60 hover:text-white'
              }`}
            >
              Journey Overview
            </button>
          </nav>
        )}

        {activeToken && portalTab === 'visa' && (
          <VisaServices token={activeToken} />
        )}

        {activeToken && portalTab === 'jobs' && (
          <ManpowerJobs token={activeToken} />
        )}

        {activeToken && portalTab === 'umrah' && (
                    <UmrahClientSection token={activeToken} />
        )}

        {activeToken && portalTab === 'study' && (
          <StudyAbroadClientSection token={activeToken} />
        )}

        {/* LOADING & INITIAL STATES */}
        {isFetching && !data && (
          <div className="py-16 text-center space-y-4">
            <div className="w-10 h-10 border-4 border-brand-gold border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-xs text-brand-cream/70 font-medium">Fetching journey logs from security servers...</p>
          </div>
        )}

        {!activeToken && (
          <div className="py-16 text-center border-2 border-dashed border-brand-navyLight rounded-xl p-8 bg-brand-navy/10">
            <div className="w-12 h-12 bg-brand-navyLight/60 rounded-full flex items-center justify-center mx-auto text-brand-gold mb-3">
              📊”
            </div>
            <h3 className="font-display font-semibold text-sm text-white">Awaiting Token Inquiry</h3>
            <p className="text-[11px] text-brand-cream/50 mt-1 max-w-sm mx-auto">
              Please enter your unique ID in the lookup box above. Demo logs are pre-loaded under token OP-2026-5555.
            </p>
          </div>
        )}

        {isError && (
          <div className="p-5 bg-brand-error/10 border border-brand-error/20 text-brand-error rounded-xl text-xs flex items-center gap-3">
            <span className="text-lg">⚠️</span>
            <div>
              <p className="font-bold">Lookup Unsuccessful</p>
              <p className="text-[11px] opacity-80">{error?.message || 'Verification timed out. Check token formatting.'}</p>
            </div>
          </div>
        )}

        {sessionIsError && (
          <div className="p-5 bg-brand-error/10 border border-brand-error/20 text-brand-error rounded-xl text-xs flex items-center gap-3">
            <span className="text-lg">⚠️</span>
            <div>
              <p className="font-bold">My Journey Unavailable</p>
              <p className="text-[11px] opacity-80">{sessionError?.message || 'Could not load your journeys.'}</p>
            </div>
          </div>
        )}

        {sessionFetching && authEmail && (
          <div className="py-16 text-center space-y-4">
            <div className="w-10 h-10 border-4 border-brand-gold border-t-transparent rounded-full animate-spin mx-auto"></div>
            <p className="text-xs text-brand-cream/70 font-medium">Loading your journeys...</p>
          </div>
        )}

{/* ====== MY JOURNEY (Authenticated, Section 25.4) ====== */}
        {portalTab === 'journey' && sessionData && sessionData.authenticated && (
          <div className="space-y-8">
            <div className="border-b border-brand-navyLight pb-3">
              <h2 className="font-display font-bold text-lg text-white flex items-center gap-2">
                My Journey Dashboard
                <span className="text-[9px] bg-brand-gold/15 text-brand-gold px-2 py-0.5 rounded-full uppercase tracking-wider">Authenticated</span>
              </h2>
              <p className="text-[11px] text-brand-cream/50 mt-1">{sessionData.email}</p>
            </div>

            {sessionData.journeys.length === 0 && (
              <div className="text-center border-2 border-dashed border-brand-navyLight rounded-xl p-10 bg-brand-navy/10">
                <div className="text-3xl mb-3">📊</div>
                <h3 className="font-display font-semibold text-sm text-white">No journeys yet</h3>
                <p className="text-[11px] text-brand-cream/50 mt-1 max-w-sm mx-auto">
                  Use the "Link your journey token" box to attach a token to this account, or enroll through our services to begin.
                </p>
              </div>
            )}

            {sessionData.journeys.map((journey, jIdx) => (
              <div key={jIdx} className="grid grid-cols-1 lg:grid-cols-12 gap-8">
                <div className="lg:col-span-4 flex flex-col gap-6">
                  <div className="bg-brand-navy/40 border border-brand-navyLight p-6 rounded-2xl">
                    <span className="text-[9px] font-bold text-brand-gold uppercase tracking-widest block">Client profile</span>
                    <h3 className="font-display font-bold text-lg text-white mt-1">{journey.client.name}</h3>
                    <p className="text-[10px] text-brand-cream/60 mt-0.5">Account ID: {journey.client.id}</p>
                    <p className="text-[10px] text-brand-cream/50 mt-1">{journey.client.email}</p>
                  </div>

                  {/* Payments summary (Section 25.4) */}
                  <div className="bg-brand-navy/40 border border-brand-navyLight p-6 rounded-2xl">
                    <h4 className="font-display font-semibold text-xs text-white uppercase tracking-wider">Payment Overview</h4>
                    {journey.payments && journey.payments.length > 0 ? (
                      <div className="mt-3 space-y-2.5">
                        {journey.payments.map((p, i) => (
                          <div key={i} className="flex justify-between items-center text-xs border-b border-brand-navyLight/40 pb-2">
                            <span className="text-brand-cream/70">{p.milestoneName || p.type}</span>
                            <span className={`font-mono font-bold ${p.type === 'receipt' ? 'text-brand-success' : 'text-brand-error'}`}>
                              {p.type === 'receipt' ? '-' : '+'}€₹₹{(p.amount / 100).toFixed(2)}
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-[10px] text-brand-cream/40 mt-2">No payments recorded.</p>
                    )}
                  </div>
                </div>

                <div className="lg:col-span-8">
                  {journey.engagements.map((eng) => {
                    const currentIdx = stages.findIndex(s => s.key === eng.stageKey);
                    return (
                      <div key={eng.id} className="bg-brand-navy/40 border border-brand-navyLight p-6 md:p-8 rounded-2xl flex flex-col gap-6">
                        <div className="flex justify-between items-start border-b border-brand-navyLight pb-4 flex-wrap gap-2">
                          <div>
                            <span className="text-[9px] font-bold text-brand-gold uppercase tracking-widest bg-brand-gold/10 px-2 py-0.5 rounded">
                              {eng.division.replace('-', ' ')}
                            </span>
                            <h3 className="font-display font-extrabold text-lg text-white mt-2">{eng.title}</h3>
                            <p className="text-[10px] text-brand-cream/60 mt-0.5">
                              Status: <span className="font-semibold uppercase text-brand-gold">{eng.status}</span>
                            </p>
                          </div>
                          {eng.outstandingBalance > 0 && (
                            <div className="text-right">
                              <span className="text-[9px] text-brand-cream/50 uppercase tracking-wider block">Outstanding</span>
                              <span className="text-brand-error font-mono font-bold text-lg">€₹₹{(eng.outstandingBalance / 100).toFixed(2)}</span>
                            </div>
                          )}
                        </div>

                        <div>
                          <h4 className="text-[10px] font-bold uppercase tracking-wider text-brand-gold mb-5">Journey Progress</h4>
                          <div className="relative pl-6 space-y-6 text-xs">
                            <div className="absolute left-[7px] top-1.5 bottom-1.5 w-[2px] bg-brand-navyLight"></div>
                            {stages.map((stage, idx) => {
                              const isCompleted = idx < currentIdx;
                              const isActive = idx === currentIdx;
                              return (
                                <div key={stage.key} className={`relative flex gap-3 flex-col transition duration-300 ${!isCompleted && !isActive ? 'opacity-40' : ''}`}>
                                  <span className={`absolute -left-6 w-4.5 h-4.5 rounded-full text-[9px] flex items-center justify-center font-bold font-mono transition border ${
                                    isCompleted ? 'bg-brand-success border-brand-success text-brand-navy'
                                    : isActive ? 'bg-brand-gold border-brand-gold text-brand-navy animate-pulse'
                                    : 'bg-[#070B19] border-brand-navyLight text-brand-cream/40'
                                  }`}>
                                    {isCompleted ? '€✓' : stage.seq}
                                  </span>
                                  <div>
                                    <h5 className={`font-bold ${isActive ? 'text-brand-gold text-sm' : 'text-white'}`}>{stage.label}</h5>
                                    <p className="text-[10px] text-brand-cream/60 mt-0.5">{stage.desc}</p>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <ClientVisaWidget journey={journey}  />
                  {journey.engagements.length === 0 && (
                    <div className="bg-brand-navy/40 border border-brand-navyLight p-8 rounded-2xl text-center">
                      <p className="text-xs text-brand-cream/50">No active journeys for this client record.</p>
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}

        {/* DATA PRESENTATION */}
        {portalTab === 'journey' && data && data.success && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
            
            {/* LEFT PROFILE CARD */}
            <div className="lg:col-span-4 flex flex-col gap-6">
              <div className="bg-brand-navy/40 border border-brand-navyLight p-6 rounded-2xl flex flex-col gap-5">
                <div className="pb-4 border-b border-brand-navyLight">
                  <span className="text-[9px] font-bold text-brand-gold uppercase tracking-widest block">Client profile</span>
                  <h3 className="font-display font-bold text-lg text-white mt-1">{data.client.name}</h3>
                  <p className="text-[10px] text-brand-cream/60 mt-0.5">Verified Account ID: {data.client.id}</p>
                </div>

                <div className="space-y-3.5 text-xs">
                  <div>
                    <span className="text-[10px] text-brand-cream/50 block">Registered Email</span>
                    <span className="font-semibold text-brand-cream/90">{data.client.email}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-brand-cream/50 block">Onboarded Since</span>
                    <span className="font-semibold text-brand-cream/90">
                      {new Date(data.client.createdAt * 1000).toLocaleDateString(undefined, { dateStyle: 'medium' })}
                    </span>
                  </div>
                </div>

                <div className="mt-2 p-3 bg-brand-success/10 border border-brand-success/20 rounded-lg text-[10px] text-brand-success flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-brand-success animate-pulse"></span>
                  <span className="font-semibold">DPDP-2023 Compliant Journey</span>
                </div>
              </div>

              {/* CONSENTS LIST */}
              <div className="bg-brand-navy/40 border border-brand-navyLight p-6 rounded-2xl flex flex-col gap-4">
                <div>
                  <h4 className="font-display font-semibold text-xs text-white uppercase tracking-wider">
                    DPDP Consent Matrix
                  </h4>
                  <p className="text-[10px] text-brand-cream/50 mt-0.5">Legal processing permissions verified at rest.</p>
                </div>

                <div className="space-y-3">
                  {data.consents.map((consent, idx) => (
                    <div 
                      key={idx} 
                      className={`p-3 rounded-lg border text-[10px] space-y-1.5 transition ${
                        consent.status === 'granted'
                          ? 'bg-brand-success/5 border-brand-success/20 text-brand-cream/80'
                          : 'bg-brand-error/5 border-brand-error/20 text-brand-error'
                      }`}
                    >
                      <div className="flex justify-between items-center font-bold">
                        <span className="uppercase tracking-wider">
                          {consent.consentType.replace('-', ' ')}
                        </span>
                        <span className={`px-1.5 py-0.2 rounded text-[8px] font-bold uppercase tracking-widest ${
                          consent.status === 'granted' ? 'bg-brand-success/25 text-brand-success' : 'bg-brand-error/25 text-brand-error'
                        }`}>
                          {consent.status}
                        </span>
                      </div>
                      <div className="flex justify-between items-center text-[9px] text-brand-cream/40">
                        <span>Authorized Date</span>
                        <span>{new Date(consent.grantedAt * 1000).toLocaleDateString()}</span>
                      </div>
                      {consent.status === 'granted' && consent.consentType !== 'core-processing' && (
                        <div className="flex justify-end pt-1">
                          <button
                            onClick={() => withdrawConsent.mutate({ token: activeToken, consentType: consent.consentType })}
                            disabled={withdrawConsent.isPending}
                            className="cursor-pointer rounded-full border border-brand-error/40 px-2.5 py-1 text-[8px] font-bold uppercase tracking-widest text-brand-error transition-colors hover:bg-brand-error hover:text-white disabled:opacity-40"
                          >
                            {withdrawConsent.isPending ? 'Withdrawing€' : 'Withdraw'}
                          </button>
                        </div>
                      )}
                    </div>
                  ))}
                  {data.consents.length === 0 && (
                    <p className="text-[10px] text-brand-cream/40 text-center py-4">No active consents found.</p>
                  )}
                </div>
              </div>
            </div>

            {/* RIGHT PROGRESS AND VAULT */}
            <div className="lg:col-span-8 flex flex-col gap-8">
              
              {/* STAGE TIMELINE PROGRESSION */}
              {data.engagements.map((eng) => {
                const currentIdx = stages.findIndex(s => s.key === eng.stageKey);
                
                return (
                  <div key={eng.id} className="bg-brand-navy/40 border border-brand-navyLight p-6 md:p-8 rounded-2xl flex flex-col gap-6">
                    <div className="flex justify-between items-start border-b border-brand-navyLight pb-4 flex-wrap gap-2">
                      <div>
                        <span className="text-[9px] font-bold text-brand-gold uppercase tracking-widest bg-brand-gold/10 px-2 py-0.5 rounded">
                          {eng.division.replace('-', ' ')}
                        </span>
                        <h3 className="font-display font-extrabold text-lg text-white mt-2">{eng.title}</h3>
                        <p className="text-[10px] text-brand-cream/60 mt-0.5">
                          Status: <span className="font-semibold uppercase text-brand-gold">{eng.status}</span>
                        </p>
                      </div>

                      {eng.outstandingBalance > 0 && (
                        <div className="text-right">
                          <span className="text-[9px] text-brand-cream/50 uppercase tracking-wider block">Outstanding Fees</span>
                          <span className="text-brand-error font-mono font-bold text-lg">
                            €₹₹{(eng.outstandingBalance / 100).toFixed(2)}
                          </span>
                        </div>
                      )}
                    </div>

                    {/* Step Timeline Graphics */}
                    <div>
                      <h4 className="text-[10px] font-bold uppercase tracking-wider text-brand-gold mb-5">Journey Progress</h4>
                      
                      <div className="relative pl-6 space-y-6 text-xs">
                        {/* Connecting Line */}
                        <div className="absolute left-[7px] top-1.5 bottom-1.5 w-[2px] bg-brand-navyLight"></div>

                        {stages.map((stage, idx) => {
                          const isCompleted = idx < currentIdx;
                          const isActive = idx === currentIdx;
                          
                          return (
                            <div 
                              key={stage.key} 
                              className={`relative flex gap-3 flex-col transition duration-300 ${
                                !isCompleted && !isActive ? 'opacity-40' : ''
                              }`}
                            >
                              {/* Bullet circle */}
                              <span className={`absolute -left-6 w-4.5 h-4.5 rounded-full text-[9px] flex items-center justify-center font-bold font-mono transition border ${
                                isCompleted 
                                  ? 'bg-brand-success border-brand-success text-brand-navy' 
                                  : isActive 
                                    ? 'bg-brand-gold border-brand-gold text-brand-navy animate-pulse' 
                                    : 'bg-[#070B19] border-brand-navyLight text-brand-cream/40'
                              }`}>
                                {isCompleted ? '€✓' : stage.seq}
                              </span>

                              <div>
                                <h5 className={`font-bold ${isActive ? 'text-brand-gold text-sm' : 'text-white'}`}>
                                  {stage.label}
                                </h5>
                                <p className="text-[10px] text-brand-cream/60 mt-0.5">{stage.desc}</p>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                );
              })}

              {data.engagements.length === 0 && (
                <div className="bg-brand-navy/40 border border-brand-navyLight p-8 rounded-2xl text-center">
                  <p className="text-xs text-brand-cream/50">No active application engagements listed for this client.</p>
                </div>
              )}

              {/* DOCUMENT VAULT STATUS */}
              <div className="bg-brand-navy/40 border border-brand-navyLight p-6 rounded-2xl flex flex-col gap-4">
                <div>
                  <h3 className="font-display font-bold text-sm text-white">Cloudflare R2 Document Vault</h3>
                  <p className="text-[10px] text-brand-cream/50 mt-0.5">Secure storage list audit of client uploads.</p>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs min-w-[500px]">
                    <thead>
                      <tr className="border-b border-brand-navyLight text-[10px] font-bold text-brand-cream/50 uppercase tracking-wider">
                        <th className="py-3 px-4">Document Title</th>
                        <th className="py-3 px-4">File Version</th>
                        <th className="py-3 px-4">Upload Timestamp</th>
                        <th className="py-3 px-4">Vault Audit Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.documents.map((doc) => (
                        <tr key={doc.id} className="border-b border-brand-navyLight/40 hover:bg-brand-navyLight/15 transition">
                          <td className="py-3 px-4 font-semibold text-white">{doc.fileName}</td>
                          <td className="py-3 px-4 text-brand-cream/70 font-mono">{doc.version}</td>
                          <td className="py-3 px-4 text-brand-cream/60">
                            {new Date(doc.uploadedAt * 1000).toLocaleDateString()}
                          </td>
                          <td className="py-3 px-4">
                            <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[9px] font-bold uppercase tracking-wider ${
                              doc.status === 'verified'
                                ? 'bg-brand-success/15 text-brand-success'
                                : doc.status === 'rejected'
                                  ? 'bg-brand-error/15 text-brand-error'
                                  : 'bg-brand-warning/15 text-brand-warning'
                            }`}>
                              <span className={`w-1 h-1 rounded-full ${
                                doc.status === 'verified' ? 'bg-brand-success' : doc.status === 'rejected' ? 'bg-brand-error' : 'bg-brand-warning'
                              }`}></span>
                              {doc.status}
                            </span>
                          </td>
                        </tr>
                      ))}

                      {data.documents.length === 0 && (
                        <tr>
                          <td colSpan={4} className="py-8 text-center text-[10px] text-brand-cream/45 border-none">
                            No documents archived in the cloud storage vault.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>

                {/* Upload Form */}
                <div className="mt-4 pt-4 border-t border-brand-navyLight flex flex-col gap-3">
                  <h4 className="text-[10px] font-bold uppercase tracking-wider text-brand-gold">Upload New Document</h4>
                  <form onSubmit={async (e) => {
                    e.preventDefault();
                    const form = e.currentTarget;
                    const fileInput = form.elements.namedItem('file') as HTMLInputElement;
                    const file = fileInput.files?.[0];
                    if (!file) return alert('Please select a file.');
                    
                    try {
                      // 1. Get presigned upload URL
                      const pRes = await fetch(`/api/public/portal/documents/presigned?token=${encodeURIComponent(activeToken)}&filename=${encodeURIComponent(file.name)}`);
                      const pData = await pRes.json() as any;
                      if (!pData.success || !pData.url) throw new Error(pData.error || 'Failed to generate upload link.');

                      // 2. PUT file body to the presigned URL
                      const uRes = await fetch(pData.url, {
                        method: 'PUT',
                        body: file
                      });
                      if (!uRes.ok) throw new Error(await uRes.text() || 'Upload execution failed.');

                      alert('Document uploaded successfully! It is pending counselor review.');
                      form.reset();
                      window.location.reload(); // refresh page to show document in list
                    } catch (err: any) {
                      alert(`Upload failed: ${err.message}`);
                    }
                  }} className="flex flex-col sm:flex-row gap-3 items-stretch">
                    <input 
                      type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx" 
                      name="file" 
                      required 
                      className="cursor-pointer flex-1 text-xs text-brand-cream/60 file:mr-4 file:py-1.5 file:px-4 file:rounded-full file:border-0 file:text-[10px] file:font-semibold file:bg-brand-navyLight file:text-brand-cream hover:file:bg-brand-navyLight/80"
                    />
                    <button 
                      type="submit" 
                      className="cursor-pointer rounded-full bg-brand-gold text-brand-navy px-5 py-1.5 text-[10px] font-bold uppercase tracking-wider transition-colors hover:bg-brand-gold-hover"
                    >
                      Upload File
                    </button>
                  </form>
                </div>
              </div>

            </div>

          </div>
        )}

      </main>

      {/* FOOTER */}
      <footer className="bg-brand-navy border-t border-brand-navyLight py-6 mt-12 shrink-0">
        <div className="max-w-7xl mx-auto px-8 flex flex-col md:flex-row justify-between items-center gap-4 text-xs text-brand-cream/40">
          <div className="flex items-center gap-3">
            <span className="border border-brand-gold/30 text-brand-gold px-2 py-0.5 rounded text-[10px] font-semibold font-display">
              British Council Certified Agent
            </span>
          </div>
          <div>
            <span>© 2026 Opus Overseas (Telangana, India). All rights reserved.</span>
          </div>
          <div className="flex gap-4 font-semibold">
            <a href="/" className="hover:text-brand-gold transition">Home</a>
            <a href="/lead-form" className="hover:text-brand-gold transition">DPDP Consent</a>
          </div>
        </div>
      </footer>

      {/* TOAST SYSTEM */}
      <div 
        className={`fixed right-6 bottom-6 bg-brand-navyLight border-l-4 border-brand-gold text-white text-xs px-4 py-3 rounded-lg shadow-2xl transition duration-300 z-50 flex items-center gap-2 ${
          toast.show ? 'translate-y-0 opacity-100' : 'translate-y-24 opacity-0'
        }`}
      >
        <span className="font-bold text-brand-gold">PORTAL LOOKUP:</span>
        <span>{toast.msg}</span>
      </div>
    </div>
  );
}



function ClientVisaWidget({ journey }: { journey: any }) {
  const [inquiryCountry, setInquiryCountry] = useState('');
  const [inquiryType, setInquiryType] = useState('');
  const [inquiryNotes, setInquiryNotes] = useState('');
  const [inquiryEmail, setInquiryEmail] = useState(journey.client.email || '');
  const [inquiryPhone, setInquiryPhone] = useState(journey.client.phone || '');
  const [inquiryAgreed, setInquiryAgreed] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Custom inquiry files state
  const [inquiryFiles, setInquiryFiles] = useState<Record<string, File>>({});

  // Catalog checkout states
  const [selectedCatalogProduct, setSelectedCatalogProduct] = useState<any | null>(null);
  const [checkoutEmail, setCheckoutEmail] = useState(journey.client.email || '');
  const [checkoutPhone, setCheckoutPhone] = useState(journey.client.phone || '');
  const [checkoutAgreed, setCheckoutAgreed] = useState(false);
  const [catalogFiles, setCatalogFiles] = useState<Record<string, File>>({});

  const { data: dbProducts } = useQuery<any>({
    queryKey: ['publicVisaProducts'],
    queryFn: async () => {
      const r = await fetch('/api/public/visa/products');
      if (!r.ok) return DEFAULT_PRODUCTS;
      const d = await r.json();
      return d.products && d.products.length > 0 ? d.products : DEFAULT_PRODUCTS;
    }
  });

  const products = dbProducts || DEFAULT_PRODUCTS;

  // Dynamically filter visa product options based on selected country
  const filteredVisaOptions = products.filter((p: any) => 
    inquiryCountry && p.country.toLowerCase().includes(inquiryCountry.toLowerCase()) && p.status === 'active'
  );

  const selectedInquiryProduct = products.find((p: any) => p.visaType === inquiryType && p.country === inquiryCountry);

  // Retrieve active visa application from real D1 table mapped in token lookup
  const activeApp = journey.visaApplications && journey.visaApplications.length > 0
    ? journey.visaApplications[journey.visaApplications.length - 1]
    : null;

  // Retrieve latest mock interview prep session
  const latestMock = journey.visaMockInterviews && journey.visaMockInterviews.length > 0
    ? journey.visaMockInterviews[journey.visaMockInterviews.length - 1]
    : null;

  // Locate active visa engagement
  const activeVisaEng = journey.engagements?.find((e: any) => e.division === 'visa' && e.status === 'active');

  const loadRazorpay = () => {
    return new Promise((resolve) => {
      if ((window as any).Razorpay) {
        resolve(true);
        return;
      }
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handleRazorpayCheckout = async (country: string, amountPaise: number) => {
    const loaded = await loadRazorpay();
    if (!loaded) {
      alert("Razorpay checkout failed to load. Please check your internet connection.");
      return;
    }

    try {
      const res = await fetch('/api/public/portal/payments/order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId: journey.client.id,
          country,
          amountPaise
        })
      });
      const data = await res.json() as any;
      if (!res.ok || !data.success) {
        throw new Error(data.error || "Order creation failed.");
      }

      const options = {
        key: data.key,
        amount: data.order.amount,
        currency: "INR",
        name: "Opus Overseas",
        description: `${country} Visa Fee Payment`,
        order_id: data.order.id,
        handler: async function (response: any) {
          try {
            const vRes = await fetch('/api/public/portal/payments/verify', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                clientId: journey.client.id,
                engagementId: data.engagementId,
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature,
                milestoneName: `${country} Visa Processing Fee`
              })
            });
            const vData = await vRes.json();
            if (vData.success) {
              alert(`✓ Payment successful! Recorded transaction Ref: ${response.razorpay_payment_id}`);
              window.location.reload();
            } else {
              alert("Payment verification failed. Please contact support.");
            }
          } catch (err: any) {
            alert(`Verification request failed: ${err.message}`);
          }
        },
        prefill: {
          name: journey.client.name,
          email: journey.client.email
        },
        theme: {
          color: "#0a2d50"
        }
      };
      const rzp = new (window as any).Razorpay(options);
      rzp.open();
    } catch (err: any) {
      alert(`Razorpay checkout initialization failed: ${err.message}`);
    }
  };

  // Parse required documents list helper
  const getRequiredDocs = (product: any): string[] => {
    if (!product) return [];
    try {
      return JSON.parse(product.requiredDocsJson || '[]');
    } catch {
      return ["Passport scan", "Photo"];
    }
  };

  return (
    <div className="space-y-6 mt-6">
      {activeApp && (
        <div className="bg-brand-navy/40 border border-brand-navyLight p-6 rounded-2xl space-y-4">
          <div className="flex justify-between items-center border-b border-brand-navyLight pb-3">
            <div>
              <span className="text-[9px] font-bold text-brand-gold uppercase tracking-widest bg-brand-gold/10 px-2 py-0.5 rounded">
                Visa Application Status
              </span>
              <h3 className="font-display font-bold text-base text-white mt-1">
                {activeApp.country} {activeApp.visaType}
              </h3>
            </div>
            <span className="text-xs font-semibold px-3 py-1 rounded-full bg-brand-gold/15 text-brand-gold uppercase tracking-wider">
              {activeApp.status.replace('_', ' ')}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 text-xs text-brand-cream/80">
            {/* Checklist */}
            <div className="space-y-2 border-r border-brand-navyLight/40 pr-4">
              <h4 className="font-bold text-white uppercase tracking-wider text-[9px] text-brand-gold">Documents Vault</h4>
              <div className="space-y-1.5 font-medium max-h-24 overflow-y-auto pr-1">
                {journey.documents && journey.documents.length > 0 ? (
                  journey.documents.map((d: any) => (
                    <div key={d.id} className="flex justify-between items-center gap-2 text-[10px]">
                      <span className="truncate">{d.fileName}</span>
                      <span className={`text-[8px] font-bold uppercase px-1 rounded ${d.status === 'verified' ? 'bg-emerald-500/10 text-emerald-400' : d.status === 'rejected' ? 'bg-rose-500/10 text-rose-400' : 'bg-amber-500/10 text-amber-400'}`}>
                        {d.status}
                      </span>
                    </div>
                  ))
                ) : (
                  <p className="text-brand-cream/40 italic">No files uploaded yet.</p>
                )}
              </div>
              <div className="mt-2.5 pt-2 border-t border-brand-navyLight/30">
                <input 
                  type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx" 
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    try {
                      const pRes = await fetch(`/api/public/portal/documents/presigned?token=${encodeURIComponent(journey.client.id)}&filename=${encodeURIComponent(file.name)}`);
                      const pData = await pRes.json() as any;
                      if (!pData.success || !pData.url) throw new Error(pData.error || 'Failed to generate upload link.');

                      const uRes = await fetch(pData.url, {
                        method: 'PUT',
                        body: file
                      });
                      if (!uRes.ok) throw new Error(await uRes.text() || 'Upload execution failed.');

                      alert(`✓ ${file.name} uploaded successfully! Pending verification.`);
                      window.location.reload();
                    } catch (err: any) {
                      alert(`Upload failed: ${err.message}`);
                    }
                  }}
                  className="hidden" 
                  id="visa-quick-file-upload"
                />
                <label 
                  htmlFor="visa-quick-file-upload"
                  className="w-full inline-block bg-brand-navyLight hover:bg-brand-navyLight/80 text-brand-cream font-bold py-1 px-2 rounded text-[8px] uppercase tracking-wider text-center cursor-pointer transition-all border border-brand-navyLight"
                >
                  📤 Upload Document
                </label>
              </div>
            </div>

            {/* VFS Booking Slot */}
            <div className="space-y-2 border-r border-brand-navyLight/40 pr-4">
              <h4 className="font-bold text-white uppercase tracking-wider text-[9px] text-brand-gold">Embassy Appointment Details</h4>
              <div className="space-y-1">
                <div>
                  <span className="text-brand-cream/40 block text-[10px]">Slot Scheduled Date:</span>
                  <span className="font-bold text-white">
                    {activeApp.appointmentDate ? new Date(activeApp.appointmentDate * 1000).toLocaleDateString() : 'Not Scheduled yet'}
                  </span>
                </div>
                <div className="mt-2">
                  <span className="text-brand-cream/40 block text-[10px]">Consulate Location:</span>
                  <span className="font-semibold text-white">{activeApp.appointmentLocation || 'Awaiting Slot Allocation'}</span>
                </div>
              </div>
            </div>

            {/* Mock Interview recommendation */}
            <div className="space-y-2">
              <h4 className="font-bold text-white uppercase tracking-wider text-[9px] text-brand-gold">Embassy Interview Guidance</h4>
              <div className="space-y-1">
                {latestMock ? (
                  <>
                    <div>
                      <span className="text-brand-cream/40 block text-[10px]">Prep Session Status:</span>
                      <span className="font-bold text-emerald-400 uppercase">{latestMock.status}</span>
                    </div>
                    {latestMock.status === 'completed' && (
                      <div className="mt-1">
                        <span className="text-brand-cream/40 block text-[10px]">Mock Prep Score:</span>
                        <span className="font-bold text-white">{latestMock.score}/10</span>
                      </div>
                    )}
                    {latestMock.feedback && (
                      <p className="text-[11px] text-brand-cream/60 italic bg-brand-navyLight/40 p-2 rounded border border-brand-navyLight/20 mt-1.5">
                        "${latestMock.feedback}"
                      </p>
                    )}
                  </>
                ) : (
                  <p className="text-brand-cream/40 italic">Awaiting slot allocation and mock interview prep scheduling.</p>
                )}
              </div>
            </div>
          </div>

          {activeVisaEng && activeVisaEng.outstandingBalance > 0 && (
            <div className="mt-4 pt-3 border-t border-brand-navyLight/45 flex justify-between items-center gap-3">
              <div>
                <span className="text-[9px] text-brand-cream/50 uppercase block">Pending Payment Balance</span>
                <span className="text-sm font-bold text-white">₹${(activeVisaEng.outstandingBalance / 100).toLocaleString('en-IN')}</span>
              </div>
              <button
                onClick={() => handleRazorpayCheckout(activeApp.country, activeVisaEng.outstandingBalance)}
                className="bg-brand-gold hover:bg-brand-gold-hover text-brand-navy font-bold py-1.5 px-4 rounded-full text-[10px] uppercase tracking-wider transition-all cursor-pointer flex items-center gap-1.5"
              >
                💳 Pay Visa Processing Fee
              </button>
            </div>
          )}
        </div>
      )}

      {/* Available Visa Categories */}
      <div className="bg-brand-navy/40 border border-brand-navyLight p-6 rounded-2xl space-y-4">
        <div>
          <h3 className="font-display font-bold text-sm text-white">✈️ Browse Active Visa Offerings</h3>
          <p className="text-[10px] text-brand-cream/50 mt-0.5">Explore standard entry visas and submit processing requests.</p>
        </div>

        {selectedCatalogProduct ? (
          /* Catalog Checkout Form Panel */
          <div className="border border-brand-gold/30 bg-brand-navyLight/20 p-5 rounded-xl space-y-4">
            <div className="flex justify-between items-center border-b border-brand-navyLight pb-2">
              <div>
                <h4 className="font-bold text-xs text-brand-gold uppercase tracking-wider">Confirm Visa Application Details</h4>
                <div className="text-[11px] text-white font-semibold mt-0.5">{selectedCatalogProduct.country} — {selectedCatalogProduct.visaType}</div>
              </div>
              <button 
                onClick={() => {
                  setSelectedCatalogProduct(null);
                  setCatalogFiles({});
                }}
                className="text-[10px] text-brand-cream/40 hover:text-white uppercase font-bold tracking-widest cursor-pointer"
              >
                ✕ Cancel
              </button>
            </div>

            <form onSubmit={async (e) => {
              e.preventDefault();
              if (!checkoutAgreed) {
                alert('You must agree to the Terms & Conditions to proceed.');
                return;
              }
              const requiredList = getRequiredDocs(selectedCatalogProduct);
              for (const reqDoc of requiredList) {
                if (!catalogFiles[reqDoc]) {
                  alert(`Please upload the required document: ${reqDoc}`);
                  return;
                }
              }

              try {
                // 1. Submit inquiry details to D1
                const res = await fetch('/api/public/portal/visa/inquiry', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    clientId: journey.client.id,
                    country: selectedCatalogProduct.country,
                    visaType: selectedCatalogProduct.visaType,
                    email: checkoutEmail,
                    registeredMobile: checkoutPhone,
                    agreedToTerms: checkoutAgreed,
                    notes: "Requested directly from active catalog offering (" + selectedCatalogProduct.entryType + ", processing: " + selectedCatalogProduct.processingTime + ")."
                  })
                });
                if (!res.ok) throw new Error('Failed to register application details');

                // 2. Upload files to Object Storage (R2) via presigned URLs
                for (const [docName, file] of Object.entries(catalogFiles)) {
                  const fileName = `${selectedCatalogProduct.country.replace(/\s+/g, '')}-${docName.replace(/\s+/g, '_')}-${file.name}`;
                  const pRes = await fetch(`/api/public/portal/documents/presigned?token=${encodeURIComponent(journey.client.id)}&filename=${encodeURIComponent(fileName)}`);
                  const pData = await pRes.json() as any;
                  if (!pData.success || !pData.url) throw new Error(`Failed to generate upload URL for ${docName}`);

                  const uRes = await fetch(pData.url, {
                    method: 'PUT',
                    body: file
                  });
                  if (!uRes.ok) throw new Error(`Failed to upload ${docName} body to object storage.`);
                }

                // 3. Launch payment
                await handleRazorpayCheckout(selectedCatalogProduct.country, selectedCatalogProduct.feePaise);
                setSelectedCatalogProduct(null);
                setCatalogFiles({});
              } catch (err: any) {
                alert(`Application error: ${err.message}`);
              }
            }} className="space-y-4 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] text-brand-cream/50 font-semibold block">Notification Email *</label>
                  <input 
                    type="email" 
                    required 
                    value={checkoutEmail}
                    onChange={(e) => setCheckoutEmail(e.target.value)}
                    className="w-full text-xs p-2 rounded bg-brand-navyLight border border-brand-navyLight text-white focus:border-brand-gold focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-brand-cream/50 font-semibold block">Registered Mobile Number *</label>
                  <input 
                    type="tel" 
                    required 
                    value={checkoutPhone}
                    onChange={(e) => setCheckoutPhone(e.target.value)}
                    className="w-full text-xs p-2 rounded bg-brand-navyLight border border-brand-navyLight text-white focus:border-brand-gold focus:outline-none"
                  />
                </div>
              </div>

              {/* Dynamic Document Requirement Section */}
              <div className="space-y-3 bg-brand-navyLight/20 p-4 rounded-lg border border-brand-navyLight/60">
                <h5 className="text-[10px] font-bold uppercase tracking-wider text-brand-gold">
                  📋 Document Requirement for {selectedCatalogProduct.country}
                </h5>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {getRequiredDocs(selectedCatalogProduct).map((docName: string) => (
                    <div key={docName} className="space-y-1">
                      <label className="text-[10px] text-brand-cream/60 font-semibold block">
                        {docName} *
                      </label>
                      <input
                        type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx"
                        required
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            setCatalogFiles(prev => ({ ...prev, [docName]: file }));
                          }
                        }}
                        className="w-full text-xs text-brand-cream/60 file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-[9px] file:font-semibold file:bg-brand-navyLight file:text-brand-cream hover:file:bg-brand-navyLight/80 cursor-pointer"
                      />
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex items-start gap-2.5 pt-2">
                <input 
                  type="checkbox" 
                  id="checkout-agreed-chk" 
                  checked={checkoutAgreed}
                  onChange={(e) => setCheckoutAgreed(e.target.checked)}
                  className="mt-0.5 cursor-pointer accent-brand-gold"
                />
                <label htmlFor="checkout-agreed-chk" className="text-[10px] text-brand-cream/60 leading-relaxed cursor-pointer selection:bg-transparent">
                  I agree to the Terms & Conditions. A copy of the terms is available for review at <a href="https://opusoverseas.com/terms" target="_blank" rel="noreferrer" className="text-brand-gold hover:underline">opusoverseas.com/terms</a>. (Visa fees are non-refundable once processed).
                </label>
              </div>

              <button
                type="submit"
                className="w-full bg-brand-gold text-brand-navy font-bold py-2 rounded text-[10px] uppercase tracking-wider hover:bg-brand-gold-hover cursor-pointer"
              >
                💳 Confirm & Pay Processing Fee (₹{(selectedCatalogProduct.feePaise / 100).toLocaleString('en-IN')})
              </button>
            </form>
          </div>
        ) : (
          /* Products Grid view */
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {products.map((p: any, idx: number) => (
              <div key={idx} className="border border-brand-navyLight/60 bg-brand-navyLight/20 hover:border-brand-gold/30 rounded-xl p-4.5 flex flex-col justify-between transition-all duration-300">
                <div className="space-y-1">
                  <div className="font-bold text-white text-xs">{p.country}</div>
                  <div className="text-[9px] text-brand-cream/50">Processing: {p.processingTime}</div>
                  <div className="text-[9px] text-brand-cream/40 font-semibold">{p.visaType} • {p.entryType}</div>
                </div>
                <div className="text-brand-gold font-bold text-sm mt-3 flex justify-between items-end">
                  <span className="text-[8px] text-brand-cream/40 uppercase font-bold tracking-wider">Fee:</span>
                  <span>₹{(p.feePaise / 100).toLocaleString('en-IN')}</span>
                </div>
                <button
                  onClick={() => {
                    setSelectedCatalogProduct(p);
                    setCheckoutEmail(journey.client.email || '');
                    setCheckoutPhone(journey.client.phone || '');
                    setCheckoutAgreed(false);
                    setCatalogFiles({});
                  }}
                  className="w-full mt-3 bg-brand-gold hover:bg-brand-gold-hover text-brand-navy font-bold py-1.5 rounded text-[9px] uppercase tracking-wider transition-all cursor-pointer text-center"
                >
                  Inquire / Apply
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Custom Inquiry Form */}
        <div className="border-t border-brand-navyLight/40 pt-4 mt-2">
          <h4 className="text-[10px] font-bold uppercase tracking-wider text-brand-gold mb-3">Custom Visa Country Inquiry</h4>
          {submitted ? (
            <div className="bg-emerald-500/10 text-emerald-400 p-3 rounded-lg border border-emerald-500/25 font-bold text-xs">
              ✓ Your visa inquiry has been received. Our team will contact you shortly.
            </div>
          ) : (
            <form onSubmit={async (e) => {
              e.preventDefault();
              if (!inquiryCountry || !inquiryType) {
                alert('Please select both country and visa option.');
                return;
              }
              if (!inquiryAgreed) {
                alert('You must agree to the Terms & Conditions to proceed.');
                return;
              }
              
              const requiredList = getRequiredDocs(selectedInquiryProduct);
              for (const reqDoc of requiredList) {
                if (!inquiryFiles[reqDoc]) {
                  alert(`Please upload the required document: &reqDoc`);
                  return;
                }
              }

              try {
                const res = await fetch('/api/public/portal/visa/inquiry', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({
                    clientId: journey.client.id,
                    country: inquiryCountry,
                    visaType: inquiryType,
                    email: inquiryEmail,
                    registeredMobile: inquiryPhone,
                    agreedToTerms: inquiryAgreed,
                    notes: inquiryNotes
                  })
                });
                if (!res.ok) throw new Error('Inquiry failed');

                // Upload files to Object Storage (R2) via presigned URLs
                for (const [docName, file] of Object.entries(inquiryFiles)) {
                  const fileName = `${inquiryCountry.replace(/\s+/g, '')}-&docName.replace(/\s+/g, '_')}-${file.name}`;
                  const pRes = await fetch(`/api/public/portal/documents/presigned?token=${encodeURIComponent(journey.client.id)}&filename=${encodeURIComponent(fileName)}`);
                  const pData = await pRes.json() as any;
                  if (!pData.success || !pData.url) throw new Error(`Failed to generate upload URL for ${docName}`);

                  const uRes = await fetch(pData.url, {
                    method: 'PUT',
                    body: file
                  });
                  if (!uRes.ok) throw new Error(`Failed to upload ${docName} body.`);
                }

                setSubmitted(true);
                const feeAmount = selectedInquiryProduct ? selectedInquiryProduct.feePaise : 1500000;
                
                if (confirm("✓ Inquiry submitted!\n\nWould you like to pay the standard visa processing fee of ₹" + (feeAmount / 100).toLocaleString('en-IN') + " now to initiate your documentation list?")) {
                  handleRazorpayCheckout(inquiryCountry, feeAmount);
                } else {
                  window.location.reload();
                }
              } catch (err: any) {
                alert(`Failed to submit visa inquiry: ${err.message}`);
              }
            }} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 items-end">
                <div className="space-y-1">
                  <label className="text-[10px] text-brand-cream/50 font-semibold block">Destination Country</label>
                  <select
                    value={inquiryCountry}
                    onChange={(e) => {
                      setInquiryCountry(e.target.value);
                      setInquiryType('');
                      setInquiryFiles({});
                    }}
                    className="w-full text-xs p-2 rounded bg-brand-navyLight border border-brand-navyLight text-white focus:border-brand-gold focus:outline-none cursor-pointer"
                  >
                    <option value="">Select Target Country...</option>
                    {VISA_COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-brand-cream/50 font-semibold block">Visa Class / Duration</label>
                  <select
                    value={inquiryType}
                    onChange={(e) => {
                      setInquiryType(e.target.value);
                      setInquiryFiles({});
                    }}
                    disabled={!inquiryCountry}
                    className="w-full text-xs p-2 rounded bg-brand-navyLight border border-brand-navyLight text-white focus:border-brand-gold focus:outline-none cursor-pointer disabled:opacity-50"
                  >
                    <option value="">Select Visa Option...</option>
                    {filteredVisaOptions.length > 0 ? (
                      filteredVisaOptions.map((p: any) => (
                        <option key={p.id} value={p.visaType}>
                          {p.visaType.replace(p.country, '').trim()} (₹{(p.feePaise / 100).toLocaleString('en-IN')})
                        </option>
                      ))
                    ) : (
                      <>
                        <option>Tourist Visa</option>
                        <option>Business Visa</option>
                        <option>Employment Visa</option>
                        <option>Transit Visa</option>
                      </>
                    )}
                  </select>
                </div>
                <div className="space-y-1 md:col-span-2">
                  <label className="text-[10px] text-brand-cream/50 font-semibold block">Special requests or requirements...</label>
                  <input
                    type="text"
                    placeholder="Enter special details..."
                    value={inquiryNotes}
                    onChange={(e) => setInquiryNotes(e.target.value)}
                    className="w-full text-xs p-2 rounded bg-brand-navyLight border border-brand-navyLight text-white placeholder-brand-cream/35 focus:border-brand-gold focus:outline-none"
                  />
                </div>
              </div>

              {selectedInquiryProduct && (
                /* Dynamic Document Requirement Section for Custom Inquiry Form */
                <div className="space-y-3 bg-brand-navyLight/20 p-4 rounded-lg border border-brand-navyLight/60">
                  <h5 className="text-[10px] font-bold uppercase tracking-wider text-brand-gold">
                    📋 Document Requirement for {inquiryCountry}
                  </h5>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                    {getRequiredDocs(selectedInquiryProduct).map((docName: string) => (
                      <div key={docName} className="space-y-1">
                        <label className="text-[10px] text-brand-cream/60 font-semibold block">
                          {docName} *
                        </label>
                        <input
                          type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx"
                          required
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (file) {
                              setInquiryFiles(prev => ({ ...prev, [docName]: file }));
                            }
                          }}
                          className="w-full text-xs text-brand-cream/60 file:mr-3 file:py-1 file:px-3 file:rounded file:border-0 file:text-[9px] file:font-semibold file:bg-brand-navyLight file:text-brand-cream hover:file:bg-brand-navyLight/80 cursor-pointer"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] text-brand-cream/50 font-semibold block">Notification Email *</label>
                  <input 
                    type="email" 
                    required 
                    value={inquiryEmail}
                    onChange={(e) => setInquiryEmail(e.target.value)}
                    className="w-full text-xs p-2 rounded bg-brand-navyLight border border-brand-navyLight text-white focus:border-brand-gold focus:outline-none"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-brand-cream/50 font-semibold block">Registered Mobile Number *</label>
                  <input 
                    type="tel" 
                    required 
                    value={inquiryPhone}
                    onChange={(e) => setInquiryPhone(e.target.value)}
                    className="w-full text-xs p-2 rounded bg-brand-navyLight border border-brand-navyLight text-white focus:border-brand-gold focus:outline-none"
                  />
                </div>
              </div>

              <div className="flex items-start gap-2.5 pt-2">
                <input 
                  type="checkbox" 
                  id="inquiry-agreed-chk" 
                  checked={inquiryAgreed}
                  onChange={(e) => setInquiryAgreed(e.target.checked)}
                  className="mt-0.5 cursor-pointer accent-brand-gold"
                />
                <label htmlFor="inquiry-agreed-chk" className="text-[10px] text-brand-cream/60 leading-relaxed cursor-pointer selection:bg-transparent">
                  I agree to the Terms & Conditions. A copy of the terms is available for review at <a href="https://opusoverseas.com/terms" target="_blank" rel="noreferrer" className="text-brand-gold hover:underline">opusoverseas.com/terms</a>.
                </label>
              </div>

<button
                type="submit"
                className="w-full bg-brand-gold text-brand-navy hover:bg-brand-gold-hover py-2 rounded text-[10px] font-bold uppercase tracking-wider transition cursor-pointer"
              >
                Submit Inquiry
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

/* ==========================================================================
   VISA SERVICES — client-facing application desk (Visa Phase-1)
   Three modes: Catalogue → Draft Wizard (9 steps) → Tracker.
   Identity/auth: the portal TOKEN doubles as the client id — the exact same
   token already handed to /lookup and /documents/presigned, so we reuse it
   for every visa endpoint below (token-auth, spec section 3).
   ========================================================================== */

type VisaSectionKey = 'applicant' | 'passport' | 'contact' | 'employment' | 'travel' | 'financial' | 'visaHistory';

interface VisaProduct {
  id: string;
  country: string;
  visaType: string;
  entryType: string;
  processingTime: string;
  feePaise: number;
  requiredDocs: string[];
}

interface VisaDocRow {
  id: string;
  fileName: string;
  version: string;
  status: 'pending' | 'verified' | 'rejected';
  uploadedAt: number | null;
  verifiedAt: number | null;
}

interface VisaApplicationRow {
  id: string;
  country: string;
  visaType: string;
  status: string;
  appointmentDate: number | null;
  appointmentLocation: string | null;
  notes: string | null;
  formJson: Record<string, any> | null;
  submittedAt: number | null;
  decisionAt: number | null;
  rejectionReason: string | null;
  deliveredAt: number | null;
  createdAt: number;
  updatedAt: number;
  requiredDocs: string[];
  documents: VisaDocRow[];
}

const VISA_STEPS: { key: string; label: string }[] = [
  { key: 'applicant', label: 'Applicant' },
  { key: 'passport', label: 'Passport' },
  { key: 'contact', label: 'Contact' },
  { key: 'employment', label: 'Employment' },
  { key: 'travel', label: 'Travel' },
  { key: 'financial', label: 'Financial' },
  { key: 'visaHistory', label: 'Visa History' },
  { key: 'documents', label: 'Documents' },
  { key: 'review', label: 'Review' },
];

const VISA_FLOW: { key: string; label: string }[] = [
  { key: 'draft', label: 'Draft' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'document_prep', label: 'Document Prep' },
  { key: 'slot_booked', label: 'Slot Booked' },
  { key: 'granted', label: 'Granted' },
  { key: 'delivered', label: 'Delivered' },
];

const VISA_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const VISA_INPUT = 'w-full text-xs px-3 py-2.5 rounded-lg border border-white/10 bg-white/5 text-white placeholder:text-white/30 focus:border-brand-gold outline-none';
const VISA_LABEL = 'text-[10px] uppercase tracking-wider text-white/60';
const VISA_HEADING = 'text-[10px] font-bold uppercase tracking-widest text-brand-gold';
const VISA_BTN = 'bg-brand-gold text-brand-navy font-bold hover:bg-brand-gold/90';

const visaBlockedEdit = (s: string) => ['granted', 'rejected', 'delivered', 'cancelled'].includes(s);

const visaChip = (s: string) =>
  ['granted', 'delivered'].includes(s)
    ? 'px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider bg-brand-gold/15 text-brand-gold'
    : ['rejected', 'cancelled'].includes(s)
      ? 'px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider bg-rose-500/15 text-rose-400'
      : 'px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider bg-white/10 text-white/80';

const docBadge = (s: string) =>
  s === 'verified'
    ? 'px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wider bg-emerald-500/15 text-emerald-400'
    : s === 'rejected'
      ? 'px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wider bg-rose-500/15 text-rose-400'
      : 'px-2 py-0.5 rounded-full text-[8px] font-bold uppercase tracking-wider bg-amber-500/15 text-amber-400';

function validateVisaSection(key: VisaSectionKey, s: Record<string, any> | undefined): string {
  const sec = s || {};
  const required = (v: any, label: string) => {
    if (v === undefined || v === null || String(v).trim() === '') return `${label} is required.`;
    return '';
  };
  const date = (v: any, label: string) => {
    const r = required(v, label);
    if (r) return r;
    if (!VISA_DATE_RE.test(String(v))) return `${label} must be a valid date (YYYY-MM-DD).`;
    return '';
  };
  const boolSet = (v: any, label: string) => (typeof v === 'boolean' ? '' : `${label} is required.`);
  switch (key) {
    case 'applicant':
      return required(sec.fullName, 'Full name')
        || date(sec.dob, 'Date of birth')
        || (!sec.gender ? 'Gender is required.' : '')
        || (!sec.maritalStatus ? 'Marital status is required.' : '');
    case 'passport': {
      if (!required(sec.number, 'Passport number')) {
        if (String(sec.number).length < 4) return 'Passport number must be at least 4 characters.';
        if (!/^[A-Z0-9]+$/.test(String(sec.number))) return 'Passport number allows only uppercase letters and digits.';
      }
      return required(sec.number, 'Passport number')
        || date(sec.issueDate, 'Passport issue date')
        || date(sec.expiryDate, 'Passport expiry date')
        || required(sec.placeOfIssue, 'Place of issue')
        || boolSet(sec.hasPreviousPassport, 'Previous passport')
        || (sec.hasPreviousPassport ? required(sec.previousPassportNumber, 'Previous passport number') : '');
    }
    case 'contact':
      return required(sec.address, 'Residential address')
        || required(sec.city, 'City')
        || required(sec.state, 'State')
        || required(sec.pincode, 'PIN code')
        || required(sec.emergencyContact, 'Emergency contact')
        || required(sec.emergencyPhone, 'Emergency contact phone');
    case 'employment':
      return required(sec.status, 'Employment status')
        || ((sec.status === 'salaried' || sec.status === 'self_employed')
          ? (required(sec.occupation, 'Occupation') || (sec.status === 'salaried' ? required(sec.employerName, 'Employer name') : ''))
          : '');
    case 'travel':
      return required(sec.purpose, 'Travel purpose')
        || date(sec.intendedArrival, 'Intended arrival date')
        || date(sec.intendedDeparture, 'Intended departure date')
        || required(sec.accommodation, 'Accommodation')
        || (sec.accommodation === 'hotel' ? required(sec.accommodationName, 'Hotel name') : '')
        || boolSet(sec.returnTicketBooked, 'Return ticket booked')
        || boolSet(sec.hasCompanions, 'Companions');
    case 'financial':
      return required(sec.fundingSource, 'Funding source')
        || (sec.fundingSource === 'sponsor' ? required(sec.sponsorName, 'Sponsor name') : '')
        || boolSet(sec.employmentLetterAvailable, 'Employment letter')
        || boolSet(sec.itrFiled, 'ITR filed');
    case 'visaHistory':
      return boolSet(sec.hasUsUkSchengen, 'US/UK/Schengen travel')
        || boolSet(sec.everRejected, 'Visa rejection history')
        || (sec.everRejected ? required(sec.rejectionCountry, 'Rejection country') : '')
        || boolSet(sec.everOverstayed, 'Overstay history');
  }
  return '';
}

function visaReviewRows(key: VisaSectionKey, form: Record<string, any>): [string, string][] {
  const s = form[key] || {};
  const val = (v: any) => {
    if (v === undefined || v === null || v === '') return '—';
    if (typeof v === 'boolean') return v ? 'Yes' : 'No';
    if (Array.isArray(v)) return v.length ? v.join(', ') : '—';
    return String(v);
  };
  switch (key) {
    case 'applicant':
      return ([['Full Name', s.fullName], ['Date of Birth', s.dob], ['Gender', s.gender], ['Marital Status', s.maritalStatus], ['Nationality', s.nationality], ['Place of Birth', s.placeOfBirth]] as [string, any][]).map(([k, v]) => [k, val(v)]);
    case 'passport':
      return ([['Passport Number', s.number], ['Issue Date', s.issueDate], ['Expiry Date', s.expiryDate], ['Place of Issue', s.placeOfIssue], ['Country of Issue', s.countryOfIssue], ['Previous Passport', s.hasPreviousPassport], s.hasPreviousPassport ? ['Previous Number', s.previousPassportNumber] : null] as ([string, any] | null)[])
        .filter((r): r is [string, any] => r !== null)
        .map(([k, v]) => [k, val(v)]);
    case 'contact':
      return ([['Address', s.address], ['City', s.city], ['State', s.state], ['PIN Code', s.pincode], ['Phone', s.phone], ['Alternate Phone', s.alternatePhone], ['Emergency Contact', s.emergencyContact], ['Emergency Phone', s.emergencyPhone]] as [string, any][]).map(([k, v]) => [k, val(v)]);
    case 'employment':
      return ([['Status', s.status], ['Occupation', s.occupation], ['Employer', s.employerName], ['Designation', s.designation], ['Employer Address', s.employerAddress], ['Employer Phone', s.employerPhone], ['Years Employed', s.yearsEmployed], ['Monthly Income (₹)', s.monthlyIncome]] as [string, any][]).map(([k, v]) => [k, val(v)]);
    case 'travel':
      return ([['Purpose', s.purpose], ['Intended Arrival', s.intendedArrival], ['Intended Departure', s.intendedDeparture], ['Accommodation', s.accommodation], ['Accommodation Name', s.accommodationName], ['Return Ticket Booked', s.returnTicketBooked], ['Has Companions', s.hasCompanions], ['Companions', s.companions]] as [string, any][]).map(([k, v]) => [k, val(v)]);
    case 'financial':
      return ([['Funding Source', s.fundingSource], ['Bank Balance (₹)', s.bankBalanceInr], s.fundingSource === 'sponsor' ? ['Sponsor Name', s.sponsorName] : null, s.fundingSource === 'sponsor' ? ['Sponsor Relation', s.sponsorRelation] : null, s.fundingSource === 'sponsor' ? ['Sponsor Contact', s.sponsorContact] : null, ['Employment Letter', s.employmentLetterAvailable], ['ITR Filed', s.itrFiled]] as ([string, any] | null)[])
        .filter((r): r is [string, any] => r !== null)
        .map(([k, v]) => [k, val(v)]);
    case 'visaHistory':
      return ([['US/UK/Schengen Travel', s.hasUsUkSchengen], ['Previous Countries', s.previousCountries], ['Ever Rejected', s.everRejected], ['Rejection Country', s.rejectionCountry], ['Ever Overstayed', s.everOverstayed]] as [string, any][]).map(([k, v]) => [k, val(v)]);
  }
  return [];
}

function VField({ label, children, inline }: { label: string; children: React.ReactNode; inline?: boolean }) {
  return (
    <div className={`${inline ? 'flex flex-col gap-1.5' : 'space-y-1.5'}`}>
      <label className={`${VISA_LABEL} block`}>{label}</label>
      {children}
    </div>
  );
}

function VInput(props: { label: string; value: any; onChange: (v: string) => void; type?: string; placeholder?: string; className?: string }) {
  return (
    <VField label={props.label} inline>
      <input
        type={props.type || 'text'}
        value={props.value ?? ''}
        onChange={(e) => props.onChange(e.target.value)}
        placeholder={props.placeholder}
        className={`${VISA_INPUT} ${props.className || ''}`}
      />
    </VField>
  );
}

function VNumber(props: { label: string; value: number | undefined; onChange: (v: number | undefined) => void; placeholder?: string }) {
  return (
    <VField label={props.label} inline>
      <input
        type="number"
        min={0}
        value={props.value ?? ''}
        onChange={(e) => props.onChange(e.target.value === '' ? undefined : Number(e.target.value))}
        placeholder={props.placeholder}
        className={VISA_INPUT}
      />
    </VField>
  );
}

function VSelect(props: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[]; placeholder?: string; className?: string }) {
  return (
    <VField label={props.label} inline>
      <select
        value={props.value ?? ''}
        onChange={(e) => props.onChange(e.target.value)}
        className={`${VISA_INPUT} cursor-pointer [&>option]:bg-[#0D1830] ${props.className || ''}`}
      >
        <option value="">{props.placeholder || 'Select...'}</option>
        {props.options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </VField>
  );
}

function VPill(props: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <VField label={props.label} inline>
      <div className="flex gap-1 rounded-full bg-white/5 p-1 w-fit">
        {props.options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => props.onChange(o.value)}
            className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition cursor-pointer ${
              props.value === o.value ? 'bg-brand-gold text-brand-navy' : 'text-white/60 hover:text-white'
            }`}
          >
            {o.label}
          </button>
        ))}
      </div>
    </VField>
  );
}

function VBool(props: { label: string; value: boolean | undefined; onChange: (v: boolean) => void }) {
  const on = props.value === true;
  return (
    <VField label={props.label} inline>
      <div className="flex gap-1 rounded-full bg-white/5 p-1 w-fit">
        <button
          type="button"
          onClick={() => props.onChange(true)}
          className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition cursor-pointer ${
            on ? 'bg-brand-gold text-brand-navy' : 'text-white/60 hover:text-white'
          }`}
        >
          Yes
        </button>
        <button
          type="button"
          onClick={() => props.onChange(false)}
          className={`px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition cursor-pointer ${
            !on ? 'bg-brand-gold text-brand-navy' : 'text-white/60 hover:text-white'
          }`}
        >
          No
        </button>
      </div>
    </VField>
  );
}

function VisaServices({ token }: { token: string }) {
  const [tab, setTab] = useState<'catalogue' | 'wizard' | 'tracker'>('catalogue');
  const [activeAppId, setActiveAppId] = useState<string | null>(null);
  const [country, setCountry] = useState('');
  const [inquiryCountry, setInquiryCountry] = useState('');
  const [inquiryType, setInquiryType] = useState('');
  const [inquiryNotes, setInquiryNotes] = useState('');
const [inquiryBusy, setInquiryBusy] = useState(false);
  const [inquirySent, setInquirySent] = useState(false);
  const [inquiryError, setInquiryError] = useState('');

  const submitInquiry = async () => {
    setInquiryBusy(true); setInquiryError('');
    try {
      const r = await fetch('/api/public/portal/visa/inquiry', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId: token, country: inquiryCountry, visaType: inquiryType || 'Custom request', notes: inquiryNotes, agreedToTerms: true }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Failed to send request');
      setInquirySent(true);
    } catch (e: any) { setInquiryError(e.message); } finally { setInquiryBusy(false); }
  };
  const [step, setStep] = useState(0);
  const [form, setForm] = useState<Record<string, any>>({});
  const [notice, setNotice] = useState<string | null>(null);
  const [wizardErr, setWizardErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [agreed, setAgreed] = useState(false);

  const productsQ = useQuery<VisaProduct[]>({
    queryKey: ['portalVisaProducts'],
    queryFn: async () => {
      const r = await fetch('/api/public/portal/visa/products');
      if (!r.ok) throw new Error(await r.text() || 'Failed to load visa products.');
      const d = await r.json();
      return d.products || [];
    },
    retry: false,
  });

  const appsQ = useQuery<VisaApplicationRow[]>({
    queryKey: ['portalVisaApplications', token],
    queryFn: async () => {
      if (!token) return [];
      const r = await fetch(`/api/public/portal/visa/applications?token=${encodeURIComponent(token)}`);
      if (!r.ok) throw new Error(await r.text() || 'Failed to load your applications.');
      const d = await r.json();
      return d.applications || [];
    },
    enabled: !!token,
    retry: false,
  });

  const products = productsQ.data || [];
  const applications = appsQ.data || [];
  const countries = Array.from(new Set(products.map((p) => p.country))).sort();
  const activeApp = applications.find((a) => a.id === activeAppId) || null;

  const patch = (key: VisaSectionKey, p: Record<string, any>) =>
    setForm((f) => ({ ...f, [key]: { ...(f[key] || {}), ...p } }));

  const materializeSection = (key: VisaSectionKey): Record<string, any> => {
    const seeded = { ...(form[key] || {}) };
    if (key === 'applicant' && !seeded.nationality) seeded.nationality = 'Indian';
    if (key === 'passport') {
      if (!seeded.countryOfIssue) seeded.countryOfIssue = 'India';
      if (typeof seeded.hasPreviousPassport !== 'boolean') seeded.hasPreviousPassport = false;
    }
    if (key === 'travel') {
      if (typeof seeded.returnTicketBooked !== 'boolean') seeded.returnTicketBooked = false;
      if (typeof seeded.hasCompanions !== 'boolean') seeded.hasCompanions = false;
      if (typeof seeded.companions !== 'number') seeded.companions = 0;
    }
    if (key === 'financial') {
      if (typeof seeded.employmentLetterAvailable !== 'boolean') seeded.employmentLetterAvailable = false;
      if (typeof seeded.itrFiled !== 'boolean') seeded.itrFiled = false;
    }
    if (key === 'visaHistory') {
      if (typeof seeded.hasUsUkSchengen !== 'boolean') seeded.hasUsUkSchengen = false;
      if (typeof seeded.everRejected !== 'boolean') seeded.everRejected = false;
      if (typeof seeded.everOverstayed !== 'boolean') seeded.everOverstayed = false;
      if (!Array.isArray(seeded.previousCountries)) seeded.previousCountries = [];
    }
    setForm((f) => ({ ...f, [key]: seeded }));
    return seeded;
  };

  const latestDoc = (docName: string): VisaDocRow | null => {
    const matches = (activeApp?.documents || []).filter((d) => d.fileName.toLowerCase().includes(docName.toLowerCase()));
    return matches.length ? matches[matches.length - 1] : null;
  };

  const saveSection = async (key: VisaSectionKey): Promise<boolean> => {
    if (!activeApp) return false;
    const normalized = materializeSection(key);
    setBusy(true);
    setWizardErr('');
    try {
      const r = await fetch(`/api/public/portal/visa/applications/${activeApp.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, formJson: { [key]: normalized } }),
      });
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d.error || 'Could not save this section.');
      await appsQ.refetch();
      return true;
    } catch (err: any) {
      setWizardErr(err.message);
      return false;
    } finally {
      setBusy(false);
    }
  };

  const startApp = async (product: VisaProduct) => {
    setBusy(true);
    setWizardErr('');
    try {
      const r = await fetch('/api/public/portal/visa/applications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, country: product.country, visaProductId: product.id }),
      });
      const d = await r.json();
      if (!r.ok || !d.success) throw new Error(d.error || 'Could not start application.');
      const res = await appsQ.refetch();
      const fresh = (res.data || []).find((a) => a.id === d.id) || null;
      setActiveAppId(d.id);
      setForm(fresh?.formJson ? JSON.parse(JSON.stringify(fresh.formJson)) : {});
      setAgreed(false);
      setStep(0);
      setTab('wizard');
      setNotice(d.draft ? `Resumed your existing draft.` : `Started ${product.visaType} application for ${product.country}.`);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      setWizardErr(err.message);
    } finally {
      setBusy(false);
    }
  };

  const openApp = (app: VisaApplicationRow) => {
    setActiveAppId(app.id);
    if (app.status === 'draft') {
      setForm(app.formJson ? JSON.parse(JSON.stringify(app.formJson)) : {});
      setAgreed(false);
      setStep(0);
      setTab('wizard');
    } else {
      setTab('tracker');
    }
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const editApplication = () => {
    if (!activeApp) return;
    setForm(activeApp.formJson ? JSON.parse(JSON.stringify(activeApp.formJson)) : {});
    setAgreed(false);
    setStep(0);
    setTab('wizard');
    setNotice(`Editing ${activeApp.country} ${activeApp.visaType} — changes are saved per section.`);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleNext = async () => {
    setWizardErr('');
    if (step === 7) { setStep(8); return; }
    if (step >= 8) return;
    const key = VISA_STEPS[step].key as VisaSectionKey;
    const err = validateVisaSection(key, form[key]);
    if (err) { setWizardErr(err); return; }
    const ok = await saveSection(key);
    if (ok) setStep(step + 1);
  };

  const uploadDoc = async (docName: string, file: File) => {
    if (!activeApp) return;
    setBusy(true);
    setWizardErr('');
    try {
      const ext = file.name.includes('.') ? file.name.slice(file.name.lastIndexOf('.')) : '';
      const fileName = `${docName}-${Date.now()}${ext}`;
      // 1. Presigned GET: bucket grants a signed, time-limited upload URL.
      const pRes = await fetch(`/api/public/portal/documents/presigned?token=${encodeURIComponent(token)}&filename=${encodeURIComponent(fileName)}`);
      const pData = await pRes.json() as any;
      if (!pRes.ok || !pData.success || !pData.url) throw new Error(pData.error || 'Failed to generate upload link.');
      // 2. PUT the raw file binary to the signed URL (query carries token/filename/expires/signature).
      const uRes = await fetch(pData.url, {
        method: 'PUT',
        body: file,
      });
      if (!uRes.ok) throw new Error((await uRes.text().catch(() => '')) || 'Upload failed.');
      await appsQ.refetch();
      setNotice(`Uploaded "${docName}" — pending staff verification.`);
    } catch (err: any) {
      setWizardErr(`Upload failed for ${docName}: ${err.message}`);
    } finally {
      setBusy(false);
    }
  };

  const submitApp = async () => {
    if (!activeApp) return;
    if (!agreed) { setWizardErr('Please agree to the Terms & Conditions before submitting.'); return; }
    setBusy(true);
    setWizardErr('');
    try {
      const r = await fetch(`/api/public/portal/visa/applications/${activeApp.id}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, agreedToTerms: true }),
      });
      const d = await r.json();
      if (!r.ok || !d.success) {
        const missing = (d.missingSections || []).join(', ');
        setWizardErr(missing ? `Application incomplete. Missing sections: ${missing}.` : (d.error || 'Submission failed. Please try again.'));
        return;
      }
      await appsQ.refetch();
      setAgreed(false);
      setTab('tracker');
      setNotice('Application submitted for review. Our visa desk will begin document preparation.');
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err: any) {
      setWizardErr(err.message);
    } finally {
      setBusy(false);
    }
  };

  const draftByProduct = (p: VisaProduct) =>
    applications.some((a) => a.status === 'draft' && a.country === p.country && a.visaType === p.visaType);

  const reviewErrors = VISA_STEPS.slice(0, 7)
    .map((s) => ({ key: s.key, label: s.label, err: validateVisaSection(s.key as VisaSectionKey, form[s.key]) }))
    .filter((e) => e.err);

  /* ---------------- Catalogue ---------------- */
  const renderCatalogue = () => (
    <div className="flex flex-col gap-6">
      <div className="bg-brand-navy/40 border border-brand-navyLight rounded-2xl p-6 flex flex-col gap-4">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <span className={VISA_HEADING + ' block'}>Visa Catalogue</span>
            <h3 className="font-display font-bold text-sm text-white mt-1">Choose your destination</h3>
          </div>
          <div className="w-full md:w-72">
            <VSelect
              label="Destination Country"
              value={country}
              onChange={(v) => setCountry(v)}
              options={[{ value: '__other__', label: 'Other country…' }, ...countries.map((c) => ({ value: c, label: c }))]}
              placeholder="All countries"
            />
          </div>
        </div>
        <p className="text-[10px] text-brand-cream/50">Standard processing fees apply per product. Start an application to open the guided draft wizard — your progress is saved at every step.</p>
      </div>

      {productsQ.isLoading && (
        <div className="py-10 flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-4 border-brand-gold border-t-transparent rounded-full animate-spin"></div>
          <p className="text-[10px] text-brand-cream/60">Loading visa catalogue...</p>
        </div>
      )}

      {productsQ.isError && (
        <div className="p-5 bg-rose-500/10 border border-rose-500/25 text-rose-400 rounded-xl text-xs">
          <p className="font-bold">Catalogue unavailable</p>
          <p className="text-[11px] mt-0.5 opacity-80">{(productsQ.error as Error)?.message}</p>
          <button onClick={() => productsQ.refetch()} className="mt-3 text-[10px] font-bold uppercase tracking-wider border border-brand-gold/40 text-brand-gold hover:bg-brand-gold hover:text-brand-navy px-3 py-1.5 rounded-lg cursor-pointer">
            Retry
          </button>
        </div>
      )}

      {!productsQ.isLoading && products.length === 0 && (
        <div className="text-center border-2 border-dashed border-brand-navyLight rounded-xl p-10 bg-brand-navy/10">
          <h3 className="font-display font-semibold text-sm text-white">No visa products available</h3>
          <p className="text-[10px] text-brand-cream/50 mt-1">Our visa desk has not published any active products yet.</p>
        </div>
      )}

      {appsQ.isError && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/25 text-rose-400 rounded-xl text-xs">
          <p className="font-bold">Could not load your applications</p>
          <p className="text-[11px] mt-0.5 opacity-80">{(appsQ.error as Error)?.message}</p>
        </div>
      )}

      {applications.length > 0 && (
        <div className="flex flex-col gap-3">
          <span className={VISA_HEADING + ' block'}>Your Applications</span>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {applications.map((a) => (
              <button
                key={a.id}
                onClick={() => openApp(a)}
                className="text-left bg-brand-navy/40 border border-brand-navyLight hover:border-brand-gold/40 rounded-xl p-4 transition cursor-pointer hover:bg-brand-navy/60"
              >
                <div className="flex justify-between items-center gap-2">
                  <span className="font-bold text-white text-xs">{a.country} — {a.visaType}</span>
                  <span className={visaChip(a.status)}>{a.status.replace('_', ' ')}</span>
                </div>
                <p className="text-[9px] text-brand-cream/50 mt-1.5">
                  {a.status === 'draft' ? 'Draft in progress — tap to continue.' : `Last updated ${new Date(a.updatedAt * 1000).toLocaleDateString()}`}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      {country === '__other__' && (
        <div className="rounded-2xl border border-brand-gold/30 bg-brand-gold/[0.06] p-6 space-y-4">
          <div>
            <span className={VISA_HEADING + ' block'}>Country not listed?</span>
            <h3 className="font-display font-bold text-sm text-white mt-1">Request a custom visa</h3>
            <p className="text-[10px] text-brand-cream/60 mt-1">Tell us the country you need a visa for — our desk will get back to you with options and pricing.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-brand-cream/60 font-bold mb-1.5">Country you need *</label>
              <input value={inquiryCountry} onChange={(e) => setInquiryCountry(e.target.value)} placeholder="e.g. United Kingdom" className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs text-white placeholder:text-white/30 focus:border-brand-gold focus:outline-none" />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-brand-cream/60 font-bold mb-1.5">Visa type (if known)</label>
              <input value={inquiryType} onChange={(e) => setInquiryType(e.target.value)} placeholder="e.g. Tourist / Work / Student" className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs text-white placeholder:text-white/30 focus:border-brand-gold focus:outline-none" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-[10px] uppercase tracking-wider text-brand-cream/60 font-bold mb-1.5">Anything else we should know?</label>
              <textarea value={inquiryNotes} onChange={(e) => setInquiryNotes(e.target.value)} rows={2} placeholder="Travel dates, purpose, number of travellers…" className="w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs text-white placeholder:text-white/30 focus:border-brand-gold focus:outline-none" />
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-[10px] text-brand-cream/50">We'll contact you on your registered details.</p>
            <button onClick={submitInquiry} disabled={inquiryBusy || !inquiryCountry.trim()} className="bg-brand-gold hover:bg-brand-gold/90 text-brand-navy text-[11px] font-bold uppercase tracking-wider px-5 py-2.5 rounded-lg transition disabled:opacity-50">
              {inquiryBusy ? 'Sending…' : 'Request Visa'}
            </button>
          </div>
          {inquirySent && <p className="text-[11px] text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 rounded-lg px-3 py-2">✓ Request sent! Our visa desk will get back to you shortly.</p>}
          {inquiryError && <p className="text-[11px] text-rose-300 bg-rose-500/10 border border-rose-500/25 rounded-lg px-3 py-2">{inquiryError}</p>}
        </div>
      )}

      {!productsQ.isLoading && products.length > 0 && country !== '__other__' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {products
            .filter((p) => !country || p.country === country)
            .map((p) => (
              <div key={p.id} className="bg-brand-navy/40 border border-brand-navyLight hover:border-brand-gold/30 rounded-2xl p-5 flex flex-col gap-3 transition">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="font-display font-bold text-white text-sm">{p.visaType}</h4>
                    <span className="text-[10px] text-brand-cream/60">{p.country}</span>
                  </div>
                  <span className="text-[8px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/5 text-white/70 border border-white/10">{p.entryType}</span>
                </div>
                <div className="flex items-center justify-between text-[10px] text-brand-cream/60">
                  <span>⏱ {p.processingTime}</span>
                  <span className="text-brand-gold font-bold text-sm">₹{(p.feePaise / 100).toLocaleString('en-IN')}</span>
                </div>
                <div>
                  <span className={VISA_HEADING + ' block'}>Required Documents</span>
                  <ul className="mt-1.5 space-y-1 text-[10px] text-brand-cream/70">
                    {p.requiredDocs.map((doc) => (
                      <li key={doc} className="flex items-center gap-1.5"><span className="text-brand-gold">•</span>{doc}</li>
                    ))}
                  </ul>
                </div>
                <button
                  onClick={() => startApp(p)}
                  disabled={busy}
                  className={`${VISA_BTN} mt-auto py-2 rounded-lg text-[10px] uppercase tracking-wider cursor-pointer transition disabled:opacity-50`}
                >
                  {draftByProduct(p) ? 'Continue Draft' : 'Start Application'}
                </button>
              </div>
            ))}
        </div>
      )}
    </div>
  );

  /* ---------------- Wizard ---------------- */
  const renderWizard = () => {
    if (!activeApp) {
      return (
        <div className="text-center border-2 border-dashed border-brand-navyLight rounded-xl p-10 bg-brand-navy/10">
          <h3 className="font-display font-semibold text-sm text-white">No active draft</h3>
          <p className="text-[10px] text-brand-cream/50 mt-1">Start an application from the catalogue to open the wizard.</p>
          <button onClick={() => setTab('catalogue')} className={`${VISA_BTN} mt-4 px-4 py-2 rounded-lg text-[10px] uppercase tracking-wider cursor-pointer`}>Back to Catalogue</button>
        </div>
      );
    }

    const applicant = form.applicant || {};
    const passport = form.passport || {};
    const contact = form.contact || {};
    const employment = form.employment || {};
    const travel = form.travel || {};
    const financial = form.financial || {};
    const visaHistory = form.visaHistory || {};

    return (
      <div className="bg-brand-navy/40 border border-brand-navyLight rounded-2xl p-6 flex flex-col gap-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-4">
          <div>
            <span className={VISA_HEADING + ' block'}>Draft Application</span>
            <h3 className="font-display font-bold text-base text-white mt-1">{activeApp.country} — {activeApp.visaType}</h3>
          </div>
          <button onClick={() => setTab('catalogue')} className="text-[10px] text-brand-cream/40 hover:text-white uppercase font-bold tracking-widest cursor-pointer">✕ Exit Draft</button>
        </div>

        <div className="flex gap-1 overflow-x-auto pb-1">
          {VISA_STEPS.map((s, i) => (
            <button
              key={s.key}
              onClick={() => { if (i <= step) setStep(i); }}
              className={`px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider whitespace-nowrap transition cursor-pointer ${
                i === step ? 'bg-brand-gold text-brand-navy'
                : i < step ? 'bg-brand-gold/15 text-brand-gold'
                : 'bg-white/5 text-white/40'
              }`}
            >
              {i + 1}. {s.label}
            </button>
          ))}
        </div>
        <div className="h-1 rounded-full bg-white/10 overflow-hidden">
          <div className="h-full bg-brand-gold transition-all duration-300" style={{ width: `${(step / (VISA_STEPS.length - 1)) * 100}%` }}></div>
        </div>

        <div className="min-h-[280px]">
          {/* Applicant */}
          {step === 0 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <VInput label="Full Name *" value={applicant.fullName} onChange={(v) => patch('applicant', { fullName: v })} placeholder="As printed on passport" className="md:col-span-2" />
              <VInput label="Date of Birth *" type="date" value={applicant.dob} onChange={(v) => patch('applicant', { dob: v })} />
              <VInput label="Nationality *" value={applicant.nationality} onChange={(v) => patch('applicant', { nationality: v })} placeholder="Indian" />
              <VPill label="Gender *" value={applicant.gender || ''} onChange={(v) => patch('applicant', { gender: v })} options={[{ value: 'male', label: 'Male' }, { value: 'female', label: 'Female' }, { value: 'other', label: 'Other' }]} />
              <VPill label="Marital Status *" value={applicant.maritalStatus || ''} onChange={(v) => patch('applicant', { maritalStatus: v })} options={[{ value: 'single', label: 'Single' }, { value: 'married', label: 'Married' }, { value: 'divorced', label: 'Divorced' }, { value: 'widowed', label: 'Widowed' }]} />
              <VInput label="Place of Birth" value={applicant.placeOfBirth} onChange={(v) => patch('applicant', { placeOfBirth: v })} placeholder="Optional" />
            </div>
          )}

          {/* Passport */}
          {step === 1 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <VInput label="Passport Number *" value={passport.number} onChange={(v) => patch('passport', { number: v.toUpperCase() })} placeholder="e.g. N1234567 (letters & digits only)" className="md:col-span-2" />
              <VInput label="Issue Date *" type="date" value={passport.issueDate} onChange={(v) => patch('passport', { issueDate: v })} />
              <VInput label="Expiry Date *" type="date" value={passport.expiryDate} onChange={(v) => patch('passport', { expiryDate: v })} />
              <VInput label="Place of Issue *" value={passport.placeOfIssue} onChange={(v) => patch('passport', { placeOfIssue: v })} placeholder="e.g. Hyderabad" />
              <VInput label="Country of Issue" value={passport.countryOfIssue} onChange={(v) => patch('passport', { countryOfIssue: v })} placeholder="India" />
              <VBool label="Previous Passport?" value={passport.hasPreviousPassport} onChange={(v) => patch('passport', { hasPreviousPassport: v })} />
              {passport.hasPreviousPassport && (
                <VInput label="Previous Passport Number" value={passport.previousPassportNumber} onChange={(v) => patch('passport', { previousPassportNumber: v.toUpperCase() })} placeholder="Required if you hold one" />
              )}
            </div>
          )}

          {/* Contact */}
          {step === 2 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <VInput label="Residential Address *" value={contact.address} onChange={(v) => patch('contact', { address: v })} className="md:col-span-2" placeholder="House, street, area" />
              <VInput label="City *" value={contact.city} onChange={(v) => patch('contact', { city: v })} />
              <VInput label="State *" value={contact.state} onChange={(v) => patch('contact', { state: v })} />
              <VInput label="PIN Code *" value={contact.pincode} onChange={(v) => patch('contact', { pincode: v })} placeholder="6 digits" />
              <VInput label="Phone (WhatsApp)" value={contact.phone} onChange={(v) => patch('contact', { phone: v })} placeholder="Optional" />
              <VInput label="Alternate Phone" value={contact.alternatePhone} onChange={(v) => patch('contact', { alternatePhone: v })} placeholder="Optional" />
              <VInput label="Emergency Contact *" value={contact.emergencyContact} onChange={(v) => patch('contact', { emergencyContact: v })} placeholder="Name of next of kin" />
              <VInput label="Emergency Phone *" value={contact.emergencyPhone} onChange={(v) => patch('contact', { emergencyPhone: v })} placeholder="With country code" />
            </div>
          )}

          {/* Employment */}
          {step === 3 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <VSelect
                label="Employment Status *"
                value={employment.status || ''}
                onChange={(v) => patch('employment', { status: v })}
                options={[
                  { value: 'salaried', label: 'Salaried' },
                  { value: 'self_employed', label: 'Self Employed' },
                  { value: 'student', label: 'Student' },
                  { value: 'retired', label: 'Retired' },
                  { value: 'unemployed', label: 'Unemployed' },
                  { value: 'homemaker', label: 'Homemaker' },
                ]}
                className="md:col-span-2"
              />
              {(employment.status === 'salaried' || employment.status === 'self_employed') && (
                <>
                  <VInput label="Occupation *" value={employment.occupation} onChange={(v) => patch('employment', { occupation: v })} />
                  {employment.status === 'salaried' && <VInput label="Employer Name *" value={employment.employerName} onChange={(v) => patch('employment', { employerName: v })} />}
                  <VInput label="Designation" value={employment.designation} onChange={(v) => patch('employment', { designation: v })} placeholder="Optional" />
                  <VInput label="Employer Phone" value={employment.employerPhone} onChange={(v) => patch('employment', { employerPhone: v })} placeholder="Optional" />
                  <VInput label="Employer Address" value={employment.employerAddress} onChange={(v) => patch('employment', { employerAddress: v })} placeholder="Optional" className="md:col-span-2" />
                  <VNumber label="Years Employed" value={employment.yearsEmployed} onChange={(v) => patch('employment', { yearsEmployed: v })} />
                  <VNumber label="Monthly Income (₹)" value={employment.monthlyIncome} onChange={(v) => patch('employment', { monthlyIncome: v })} />
                </>
              )}
            </div>
          )}

          {/* Travel */}
          {step === 4 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <VSelect
                label="Travel Purpose *"
                value={travel.purpose || ''}
                onChange={(v) => patch('travel', { purpose: v })}
                options={[
                  { value: 'tourism', label: 'Tourism' },
                  { value: 'business', label: 'Business' },
                  { value: 'medical', label: 'Medical' },
                  { value: 'visiting_family', label: 'Visiting Family' },
                  { value: 'other', label: 'Other' },
                ]}
                className="md:col-span-2"
              />
              <VInput label="Intended Arrival *" type="date" value={travel.intendedArrival} onChange={(v) => patch('travel', { intendedArrival: v })} />
              <VInput label="Intended Departure *" type="date" value={travel.intendedDeparture} onChange={(v) => patch('travel', { intendedDeparture: v })} />
              <VPill
                label="Accommodation *"
                value={travel.accommodation || ''}
                onChange={(v) => patch('travel', { accommodation: v })}
                options={[{ value: 'hotel', label: 'Hotel' }, { value: 'family', label: 'Family' }, { value: 'friend', label: 'Friend' }, { value: 'other', label: 'Other' }]}
              />
              {travel.accommodation === 'hotel' && (
                <VInput label="Hotel Name *" value={travel.accommodationName} onChange={(v) => patch('travel', { accommodationName: v })} />
              )}
              <VBool label="Return Ticket Booked?" value={travel.returnTicketBooked} onChange={(v) => patch('travel', { returnTicketBooked: v })} />
              <VBool label="Travelling With Companions?" value={travel.hasCompanions} onChange={(v) => patch('travel', { hasCompanions: v })} />
              {travel.hasCompanions && (
                <VNumber label="Number of Companions" value={travel.companions} onChange={(v) => patch('travel', { companions: v })} />
              )}
            </div>
          )}

          {/* Financial */}
          {step === 5 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <VSelect
                label="Funding Source *"
                value={financial.fundingSource || ''}
                onChange={(v) => patch('financial', { fundingSource: v })}
                options={[
                  { value: 'salary', label: 'Salary' },
                  { value: 'savings', label: 'Savings' },
                  { value: 'sponsor', label: 'Sponsor' },
                  { value: 'family', label: 'Family' },
                ]}
                className="md:col-span-2"
              />
              <VNumber label="Bank Balance (₹)" value={financial.bankBalanceInr} onChange={(v) => patch('financial', { bankBalanceInr: v })} />
              {financial.fundingSource === 'sponsor' && (
                <>
                  <VInput label="Sponsor Name" value={financial.sponsorName} onChange={(v) => patch('financial', { sponsorName: v })} />
                  <VInput label="Sponsor Relation" value={financial.sponsorRelation} onChange={(v) => patch('financial', { sponsorRelation: v })} />
                  <VInput label="Sponsor Contact" value={financial.sponsorContact} onChange={(v) => patch('financial', { sponsorContact: v })} />
                </>
              )}
              <VBool label="Employment Letter Available?" value={financial.employmentLetterAvailable} onChange={(v) => patch('financial', { employmentLetterAvailable: v })} />
              <VBool label="ITR Filed?" value={financial.itrFiled} onChange={(v) => patch('financial', { itrFiled: v })} />
            </div>
          )}

          {/* Visa History */}
          {step === 6 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <VBool label="Held US / UK / Schengen Visa?" value={visaHistory.hasUsUkSchengen} onChange={(v) => patch('visaHistory', { hasUsUkSchengen: v })} />
              <VInput
                label="Previously Visited Countries"
                value={(visaHistory.previousCountries || []).join(', ')}
                onChange={(v) => patch('visaHistory', { previousCountries: v.split(',').map((x) => x.trim()).filter(Boolean) })}
                placeholder="e.g. UAE, Qatar, Malaysia"
                className="md:col-span-2"
              />
              <VBool label="Ever Had a Visa Rejection?" value={visaHistory.everRejected} onChange={(v) => patch('visaHistory', { everRejected: v })} />
              {visaHistory.everRejected && (
                <VInput label="Rejection Country *" value={visaHistory.rejectionCountry} onChange={(v) => patch('visaHistory', { rejectionCountry: v })} />
              )}
              <VBool label="Ever Overstayed a Visa?" value={visaHistory.everOverstayed} onChange={(v) => patch('visaHistory', { everOverstayed: v })} />
            </div>
          )}

          {/* Documents checklist */}
          {step === 7 && (
            <div className="flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <span className={VISA_HEADING + ' block'}>Required Documents</span>
                <span className="text-[10px] text-brand-cream/50">
                  {(activeApp.requiredDocs || []).filter((d) => latestDoc(d)).length}/{activeApp.requiredDocs.length} uploaded
                </span>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {(activeApp.requiredDocs || []).map((docName) => {
                  const doc = latestDoc(docName);
                  return (
                    <div key={docName} className="bg-white/5 border border-white/10 rounded-xl p-4 flex flex-col gap-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-semibold text-white">{docName}</span>
                        {doc ? (
                          <span className={docBadge(doc.status)}>{doc.status === 'pending' ? 'Uploaded' : doc.status === 'verified' ? 'Verified' : 'Rejected'}</span>
                        ) : (
                          <span className="text-[8px] uppercase tracking-wider text-white/40 border border-white/10 rounded-full px-2 py-0.5">Not uploaded</span>
                        )}
                      </div>
                      {doc && <p className="text-[9px] text-brand-cream/50 font-mono truncate">{doc.fileName}</p>}
                      <label className={`${VISA_BTN} text-center py-1.5 rounded-lg text-[9px] uppercase tracking-wider cursor-pointer transition disabled:opacity-50`}>
                        {doc?.status === 'rejected' ? '↻ Re-upload Document' : doc ? 'Replace Document' : 'Upload Document'}
                        <input
                          type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx"
                          className="hidden"
                          disabled={busy}
                          onChange={(e) => {
                            const f = e.target.files?.[0];
                            if (f) uploadDoc(docName, f);
                            e.currentTarget.value = '';
                          }}
                        />
                      </label>
                    </div>
                  );
                })}
              </div>
              <p className="text-[10px] text-brand-cream/50">
                Files are uploaded to our secure R2 vault and reviewed by the visa desk. Rejected files can be re-uploaded from the tracker later.
              </p>
            </div>
          )}

          {/* Review */}
          {step === 8 && (
            <div className="flex flex-col gap-5">
              <div className="flex items-center justify-between">
                <span className={VISA_HEADING + ' block'}>Review & Submit</span>
                <span className="text-[10px] text-brand-cream/50">{activeApp.country} — {activeApp.visaType}</span>
              </div>

              {reviewErrors.length > 0 && (
                <div className="bg-amber-500/10 border border-amber-500/25 text-amber-400 rounded-lg px-3 py-2.5 text-[11px]">
                  <p className="font-bold uppercase tracking-wider text-[10px] mb-1">Incomplete before submission</p>
                  {reviewErrors.map((e) => (
                    <p key={e.key}>• {e.label}: {e.err}</p>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {VISA_STEPS.slice(0, 7).map((s) => (
                  <div key={s.key} className="bg-white/5 border border-white/10 rounded-xl p-4">
                    <span className={VISA_HEADING + ' block mb-2'}>{s.label}</span>
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[10px]">
                      {visaReviewRows(s.key as VisaSectionKey, form).map(([k, v]) => (
                        <div key={k} className="col-span-2 flex justify-between gap-3 border-b border-white/5 pb-1">
                          <dt className="text-white/45">{k}</dt>
                          <dd className="font-semibold text-white/90 text-right">{v}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ))}
              </div>

              <div className="border-t border-white/10 pt-4 flex flex-col gap-3">
                <label className="flex items-start gap-2.5 text-[10px] text-brand-cream/60 cursor-pointer">
                  <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 accent-brand-gold cursor-pointer" />
                  <span>
                    I confirm the information above is accurate, and I agree to the Terms & Conditions for visa processing.
                    <a href="https://opusoverseas.com/terms" target="_blank" rel="noreferrer" className="text-brand-gold hover:underline ml-1">Terms</a>
                  </span>
                </label>
                <div className="flex items-center gap-3">
                  <button onClick={() => setStep(7)} disabled={busy} className="border border-white/15 text-white/70 hover:text-white hover:border-white/30 px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider cursor-pointer">
                    ← Back
                  </button>
                  <button
                    onClick={submitApp}
                    disabled={!agreed || reviewErrors.length > 0 || busy}
                    className={`${VISA_BTN} flex-1 py-2.5 rounded-lg text-[10px] uppercase tracking-wider cursor-pointer transition disabled:opacity-40 disabled:cursor-not-allowed`}
                  >
                    {busy ? 'Submitting...' : 'Submit Application'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {wizardErr && (
          <div className="flex items-start gap-2 bg-rose-500/10 border border-rose-500/25 text-rose-400 text-[11px] rounded-lg px-3 py-2">
            <span>⚠</span><span>{wizardErr}</span>
          </div>
        )}

        {step < 8 && (
          <div className="flex justify-between gap-3 pt-4 border-t border-white/10">
            {step > 0 ? (
              <button onClick={() => { setWizardErr(''); setStep(step - 1); }} disabled={busy} className="border border-white/15 text-white/70 hover:text-white hover:border-white/30 px-4 py-2 rounded-lg text-[10px] font-bold uppercase tracking-wider cursor-pointer">
                ← Back
              </button>
            ) : <span />}
            <button onClick={handleNext} disabled={busy} className={`${VISA_BTN} px-6 py-2 rounded-lg text-[10px] uppercase tracking-wider cursor-pointer transition disabled:opacity-50`}>
              {busy ? 'Saving...' : step === 7 ? 'Continue to Review →' : 'Save & Continue →'}
            </button>
          </div>
        )}
      </div>
    );
  };

  /* ---------------- Tracker ---------------- */
  const renderTracker = () => {
    if (!activeApp) {
      return (
        <div className="text-center border-2 border-dashed border-brand-navyLight rounded-xl p-10 bg-brand-navy/10">
          <h3 className="font-display font-semibold text-sm text-white">No application selected</h3>
          <p className="text-[10px] text-brand-cream/50 mt-1">Pick an application from the catalogue or start a new one.</p>
          <button onClick={() => setTab('catalogue')} className={`${VISA_BTN} mt-4 px-4 py-2 rounded-lg text-[10px] uppercase tracking-wider cursor-pointer`}>Back to Catalogue</button>
        </div>
      );
    }

    const curIdx = VISA_FLOW.findIndex((f) => f.key === activeApp.status);
    const isRejected = activeApp.status === 'rejected' || activeApp.status === 'cancelled';

    return (
      <div className="flex flex-col gap-6">
        <div className="bg-brand-navy/40 border border-brand-navyLight rounded-2xl p-6 flex flex-col gap-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className={VISA_HEADING + ' block'}>Visa Application</span>
              <h3 className="font-display font-bold text-base text-white mt-1">{activeApp.country} — {activeApp.visaType}</h3>
            </div>
            <span className={visaChip(activeApp.status)}>{activeApp.status.replace('_', ' ')}</span>
          </div>

          {/* Status timeline */}
          <div className="flex flex-wrap items-center gap-1.5">
            {VISA_FLOW.map((f, i) => {
              const done = curIdx > i;
              const current = curIdx === i;
              return (
                <div key={f.key} className="flex items-center gap-1.5">
                  <span className={`px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider border ${
                    done ? 'bg-brand-gold text-brand-navy border-brand-gold'
                    : current ? 'text-white border-brand-gold bg-brand-gold/15'
                    : 'bg-white/5 text-white/40 border-white/10'
                  }`}>
                    {f.label}
                  </span>
                  {i < VISA_FLOW.length - 1 && <span className="text-white/20 text-[10px]">→</span>}
                </div>
              );
            })}
            {isRejected && (
              <span className="px-2.5 py-1 rounded-full text-[9px] font-bold uppercase tracking-wider border border-rose-500/40 bg-rose-500/15 text-rose-400">
                {activeApp.status.replace('_', ' ')}
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-1 text-[9px] uppercase tracking-wider text-brand-cream/40">
            <span>Submitted {activeApp.submittedAt ? new Date(activeApp.submittedAt * 1000).toLocaleString() : '—'}</span>
            <span>Decision {activeApp.decisionAt ? new Date(activeApp.decisionAt * 1000).toLocaleString() : '—'}</span>
            <span>Delivered {activeApp.deliveredAt ? new Date(activeApp.deliveredAt * 1000).toLocaleString() : '—'}</span>
            <span>Created {new Date(activeApp.createdAt * 1000).toLocaleDateString()}</span>
          </div>
        </div>

        {activeApp.rejectionReason && (
          <div className="flex items-start gap-2 bg-rose-500/10 border border-rose-500/25 text-rose-400 rounded-lg px-4 py-3 text-[11px]">
            <span>⛔</span>
            <div>
              <p className="font-bold uppercase tracking-wider text-[10px]">Application {activeApp.status === 'cancelled' ? 'Cancelled' : 'Rejected'}</p>
              <p className="mt-0.5">{activeApp.rejectionReason}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <span className={VISA_HEADING + ' block mb-2'}>Embassy Appointment</span>
            {activeApp.appointmentDate ? (
              <div className="space-y-1.5 text-xs text-brand-cream/80">
                <p><span className="text-white/50 block text-[10px]">Slot Scheduled Date</span><span className="font-bold text-white">{new Date(activeApp.appointmentDate * 1000).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span></p>
                <p><span className="text-white/50 block text-[10px]">Consulate Location</span><span className="font-semibold text-white">{activeApp.appointmentLocation || 'To be confirmed'}</span></p>
              </div>
            ) : (
              <p className="text-[10px] text-brand-cream/50 italic">No slot scheduled yet. Our visa desk will book your embassy slot and update it here.</p>
            )}
          </div>
          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <span className={VISA_HEADING + ' block mb-2'}>Staff Notes</span>
            {activeApp.notes ? (
              <p className="text-[11px] text-brand-cream/80 leading-relaxed whitespace-pre-wrap">{activeApp.notes}</p>
            ) : (
              <p className="text-[10px] text-brand-cream/50 italic">No notes from the visa desk yet.</p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <span className={VISA_HEADING + ' block'}>Document Status</span>
          <div className="bg-white/5 border border-white/10 rounded-xl overflow-x-auto">
            <table className="w-full text-left text-[10px] min-w-[560px]">
              <thead className="border-b border-white/10 text-white/50 uppercase tracking-wider text-[9px]">
                <tr>
                  <th className="py-2.5 px-3">Document</th>
                  <th className="py-2.5 px-3">File</th>
                  <th className="py-2.5 px-3">Version</th>
                  <th className="py-2.5 px-3">Uploaded</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5">
                {(activeApp.requiredDocs || []).map((docName) => {
                  const doc = latestDoc(docName);
                  return (
                    <tr key={docName} className="hover:bg-white/5">
                      <td className="py-2.5 px-3 font-semibold text-white whitespace-nowrap">{docName}</td>
                      <td className="py-2.5 px-3 text-brand-cream/60 font-mono max-w-[220px] truncate">{doc ? doc.fileName : '—'}</td>
                      <td className="py-2.5 px-3 text-brand-cream/50 font-mono">{doc?.version || '—'}</td>
                      <td className="py-2.5 px-3 text-brand-cream/50 whitespace-nowrap">{doc?.uploadedAt ? new Date(doc.uploadedAt * 1000).toLocaleDateString() : '—'}</td>
                      <td className="py-2.5 px-3">
                        {doc ? (
                          <span className={docBadge(doc.status)}>{doc.status === 'pending' ? 'Uploaded' : doc.status === 'verified' ? 'Verified' : 'Rejected'}</span>
                        ) : (
                          <span className="text-[8px] uppercase tracking-wider text-white/30">Not uploaded</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        {(!doc || doc.status === 'rejected') ? (
                          <label className="inline-block cursor-pointer border border-brand-gold/40 text-brand-gold hover:bg-brand-gold hover:text-brand-navy px-2.5 py-1 rounded text-[8px] font-bold uppercase tracking-wider transition">
                            {doc?.status === 'rejected' ? '↻ Re-upload' : '↑ Upload'}
                            <input
                              type="file" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx"
                              className="hidden"
                              disabled={busy}
                              onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (f) uploadDoc(docName, f);
                                e.currentTarget.value = '';
                              }}
                            />
                          </label>
                        ) : (
                          <span className="text-[8px] uppercase tracking-wider text-white/35">{doc.status === 'verified' ? 'Verified ✓' : 'Awaiting review'}</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        {!visaBlockedEdit(activeApp.status) && (
          <div className="flex justify-end">
            <button onClick={editApplication} className={`${VISA_BTN} px-4 py-2 rounded-lg text-[10px] uppercase tracking-wider cursor-pointer transition`}>
              Edit Application
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h2 className="font-display font-bold text-lg text-white">✈️ Visa Services</h2>
        <p className="text-[10px] text-brand-cream/50 mt-0.5">Apply for, draft, and track your embassy visa applications — end to end.</p>
      </div>

      {notice && (
        <div className="flex items-center gap-2 bg-brand-gold/10 border border-brand-gold/25 text-brand-gold text-[11px] rounded-lg px-3 py-2">
          <span>✓</span><span>{notice}</span>
        </div>
      )}

      {tab === 'catalogue' && renderCatalogue()}
      {tab === 'wizard' && renderWizard()}
      {tab === 'tracker' && renderTracker()}
    </div>
  );
}

type JobRow = { id: string; title: string; country: string; sector: string; salaryText: string; collar: string; employer?: string; description?: string; salaryMinPaise?: number | null; salaryMaxPaise?: number | null; currency?: string; vacancies?: number; benefits?: string[]; requirements?: string[]; experienceYearsMin?: number; tradeCategory?: string; visaProvided?: boolean; medicalRequired?: boolean; deadline?: number | null; featured?: boolean; exclusive?: boolean };

type JobApplication = { id: string; jobId: string; jobTitle: string; jobCountry: string; selectionStatus: string; medicalStatus: string; visaStatus: string; flightStatus: string; appliedAt?: number | null; rejectionReason?: string | null; resumeKey?: string | null; notes?: string | null };

const COLLAR = { blue_collar: 'Blue Collar', white_collar: 'White Collar' } as Record<string, string>;
const SEL = { applied: 'Applied', shortlisted: 'Shortlisted', selected: 'Selected', rejected: 'Rejected' } as Record<string, string>;
const MED = { pending: 'Medical Pending', fit: 'Medically Fit', unfit: 'Unfit', restricted: 'Restricted' } as Record<string, string>;
const VISA = { pending: 'Visa Pending', submitted: 'Visa Submitted', stamped: 'Visa Stamped', rejected: 'Visa Rejected' } as Record<string, string>;
const FLT = { pending: 'Awaiting Flight', booked: 'Flight Booked', deployed: 'Deployed' } as Record<string, string>;

function ManpowerJobs({ token }: { token: string }) {
  const [view, setView] = useState<'browse' | 'apply' | 'tracker'>('browse');
  const [selectedJob, setSelectedJob] = useState<JobRow | null>(null);
  const [applying, setApplying] = useState(false);
  const [resumeKey, setResumeKey] = useState<string | null>(null);
  const [resumeName, setResumeName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [form, setForm] = useState(() => ({
    personal: { fullName: '', dob: '', gender: 'male', maritalStatus: 'single', nationality: 'Indian', currentCity: '', currentState: '', languages: '' },
    contact: { phone: '', email: '', alternatePhone: '', emergencyContact: '', emergencyPhone: '' },
    passport: { hasPassport: true, passportNumber: '', issueDate: '', expiryDate: '' },
    experience: { totalYears: 0, currentRole: '', currentEmployer: '', skills: '', willingToTravel: true, availableFrom: '' },
    education: { highestQualification: '', institution: '', fieldOfStudy: '' },
    salary: { currentSalaryPaise: '', expectedSalaryPaise: '', noticePeriodDays: 0 },
    medical: { selfDeclaredFit: true, hasChronicCondition: false },
    additional: { tradeCertifications: '', drivingLicense: '', references: '' },
  }));

  const { data: jobsData, refetch: refetchJobs } = useQuery<{ jobs: JobRow[] }>({
    queryKey: ['portalManpowerJobs', token],
    queryFn: async () => { const r = await fetch(`/api/public/portal/manpower/jobs${token ? `?token=${encodeURIComponent(token)}` : ''}`); if (!r.ok) throw new Error('jobs'); return r.json(); },
  });
  const jobs = jobsData?.jobs || [];
  const [exclusiveFilter, setExclusiveFilter] = useState<'all' | 'exclusive'>('all');
  const visibleJobs = exclusiveFilter === 'exclusive' ? jobs.filter((j) => j.exclusive) : jobs;

  const { data: appsData, refetch: refetchApps } = useQuery<{ applications: JobApplication[] }>({
    queryKey: ['portalManpowerApps', token],
    queryFn: async () => { const r = await fetch(`/api/public/portal/manpower/applications?token=${encodeURIComponent(token)}`); if (!r.ok) throw new Error('apps'); return r.json(); },
    enabled: !!token,
  });
  const applications = appsData?.applications || [];

  const up = (section: string, key: string, value: any) => setForm((f) => ({ ...f, [section]: { ...(f as any)[section], [key]: value } }));

  const uploadResume = async (file: File) => {
    setUploading(true); setMsg(null);
    try {
      const fd = new FormData(); fd.append('resume', file); fd.append('token', token);
      const r = await fetch('/api/public/manpower/resume', { method: 'POST', body: fd });
      const j = await r.json();
      if (!r.ok || !j.resumeKey) throw new Error(j.error || 'Resume upload failed');
      setResumeKey(j.resumeKey); setResumeName(file.name);
    } catch (e: any) { setMsg({ ok: false, text: e.message }); } finally { setUploading(false); }
  };

  const buildFormJson = () => ({
    personal: { ...form.personal, languages: form.personal.languages.split(',').map((s) => s.trim()).filter(Boolean) },
    contact: form.contact,
    passport: form.passport,
    experience: { ...form.experience, skills: form.experience.skills.split(',').map((s) => s.trim()).filter(Boolean), totalYears: Number(form.experience.totalYears) || 0 },
    education: form.education,
    salary: { currentSalaryPaise: form.salary.currentSalaryPaise ? Math.round(Number(form.salary.currentSalaryPaise) * 100) : undefined, expectedSalaryPaise: form.salary.expectedSalaryPaise ? Math.round(Number(form.salary.expectedSalaryPaise) * 100) : undefined, noticePeriodDays: Number(form.salary.noticePeriodDays) || 0 },
    medical: form.medical,
    additional: { ...form.additional, tradeCertifications: form.additional.tradeCertifications.split(',').map((s) => s.trim()).filter(Boolean) },
  });

  const submit = async () => {
    setApplying(true); setMsg(null);
    try {
      const r = await fetch('/api/public/portal/manpower/applications', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, jobId: selectedJob!.id, formJson: buildFormJson(), resumeKey }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Submit failed' + (j.missingSections ? ` (missing: ${j.missingSections.join(', ')})` : ''));
      refetchApps(); setView('tracker'); setMsg({ ok: true, text: j.message || 'Application submitted.' });
    } catch (e: any) { setMsg({ ok: false, text: e.message }); } finally { setApplying(false); }
  };

  const { data: membershipData, refetch: refetchMembership } = useQuery<{ enabled: boolean; comingSoon: boolean; membership: { isMember: boolean; expiresAt: number | null; plan: string | null }; plans: { key: string; name: string; description?: string; pricePaise: number; durationDays: number; tier: string; perks: string[] }[] }>({
    queryKey: ['portalManpowerMembership', token],
    queryFn: async () => { const r = await fetch(`/api/public/portal/manpower/membership?token=${encodeURIComponent(token)}`); if (!r.ok) throw new Error('membership'); return r.json(); },
    enabled: !!token,
  });
  const membership = membershipData?.membership;
  const plans = membershipData?.plans || [];
  const [payBusy, setPayBusy] = useState(false);

  const loadRazorpay = () => new Promise<boolean>((resolve) => {
    if ((window as any).Razorpay) return resolve(true);
    const sc = document.createElement('script');
    sc.src = 'https://checkout.razorpay.com/v1/checkout.js';
    sc.onload = () => resolve(true);
    sc.onerror = () => resolve(false);
    document.body.appendChild(sc);
  });

  const subscribe = async (planKey: string) => {
    setPayBusy(true); setMsg(null);
    try {
      const loaded = await loadRazorpay();
      if (!loaded) throw new Error('Razorpay checkout failed to load.');
      const oRes = await fetch('/api/public/portal/manpower/membership/order', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, planKey }),
      });
      const o = await oRes.json();
      if (!oRes.ok || !o.order_id) throw new Error(o.error || 'Failed to create order');
      const result = await new Promise<{ razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string } | null>((resolve) => {
        const rz = new (window as any).Razorpay({
          key: o.key, amount: o.amount_paise, currency: o.currency || 'INR',
          name: 'Opus Overseas', description: 'Exclusive Jobs Membership',
          order_id: o.order_id,
          handler: (res: any) => resolve({ razorpay_payment_id: res.razorpay_payment_id, razorpay_order_id: res.razorpay_order_id, razorpay_signature: res.razorpay_signature }),
          modal: { ondismiss: () => resolve(null) },
        });
        rz.open();
      });
      if (!result) { setMsg({ ok: false, text: 'Payment window closed.' }); return; }
      const vRes = await fetch('/api/public/portal/manpower/membership/verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, planKey, ...result }),
      });
      const v = await vRes.json();
      if (!vRes.ok) throw new Error(v.error || 'Verification failed');
      refetchMembership(); refetchJobs(); setMsg({ ok: true, text: v.message || 'Membership activated!' });
    } catch (e: any) { setMsg({ ok: false, text: e.message }); } finally { setPayBusy(false); }
  };

  const input = 'w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs text-white placeholder:text-white/30 focus:border-brand-gold focus:outline-none';
  const label = 'block text-[10px] uppercase tracking-wider text-white/60 font-bold mb-1.5';
  const pill = (active: boolean) => `px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition cursor-pointer ${active ? 'bg-brand-gold text-brand-navy' : 'border border-white/15 text-white/60 hover:text-white'}`;
  const sectionTitle = 'text-[10px] font-bold uppercase tracking-widest text-brand-gold border-b border-white/10 pb-2 mb-3';

  return (
    <div className="space-y-6">
      {view !== 'tracker' && (
        <div className="flex gap-1 rounded-full bg-white/5 p-1 w-fit border border-white/10">
          <button onClick={() => setView('browse')} className={pill(view === 'browse')}>🧑‍🔧 Open Jobs</button>
          <button onClick={() => setView('tracker')} className={pill(false)}>📋 My Applications ({applications.length})</button>
        </div>
      )}

      {msg && <div className={`rounded-xl px-4 py-3 text-xs font-semibold ${msg.ok ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'}`}>{msg.text}</div>}

      {view === 'browse' && (
        <>
        {membership?.isMember ? (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-emerald-300">✓ Exclusive Member</p>
              <p className="text-[10px] text-emerald-300/70 mt-0.5">Plan: {membership.plan} · Expires: {membership.expiresAt ? new Date(membership.expiresAt * 1000).toLocaleDateString() : '—'}</p>
            </div>
            <span className="text-[10px] text-emerald-300/70">Secret job offers unlocked</span>
          </div>
        ) : membershipData?.comingSoon ? (
          <div className="rounded-2xl border border-brand-gold/30 bg-brand-gold/[0.06] p-5 space-y-2">
            <p className="text-[10px] font-bold uppercase tracking-widest text-brand-gold">🔒 Exclusive Jobs Community</p>
            <p className="text-[11px] text-white/60">Coming soon — we're preparing exclusive job offers. You'll be able to join the paid community once openings are live.</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-brand-gold/30 bg-brand-gold/[0.06] p-5 space-y-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-brand-gold">🔒 Exclusive Jobs Community</p>
              <p className="text-[11px] text-white/60 mt-1">Join the paid community to unlock secret job offers. Apply directly, upload your resume, and get shortlisted by our recruitment desk.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {plans.map((p) => (
                <div key={p.key} className="rounded-xl border border-white/10 bg-white/5 p-4 flex flex-col justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold text-white">{p.name}</p>
                    <p className="text-[10px] text-white/40 mt-0.5">{p.description}</p>
                    <p className="text-brand-gold font-bold text-lg mt-2">₹{(p.pricePaise / 100).toLocaleString('en-IN')}</p>
                    <p className="text-[10px] text-white/40">{p.durationDays} days</p>
                  </div>
                  <button
                    disabled={payBusy}
                    onClick={() => subscribe(p.key)}
                    className="bg-brand-gold hover:bg-brand-gold/90 text-brand-navy text-[11px] font-bold uppercase tracking-wider px-4 py-2 rounded-lg transition disabled:opacity-50"
                  >
                    {payBusy ? 'Processing…' : 'Subscribe'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="flex gap-1 rounded-full bg-white/5 p-1 w-fit border border-white/10">
          <button onClick={() => setExclusiveFilter('all')} className={pill(exclusiveFilter === 'all')}>All Jobs</button>
          <button onClick={() => setExclusiveFilter('exclusive')} className={pill(exclusiveFilter === 'exclusive')}>🔒 Exclusive</button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {visibleJobs.map((j) => (
            <div key={j.id} className="rounded-2xl border border-white/10 bg-white/5 p-5 flex flex-col justify-between gap-4 backdrop-blur">
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-display font-bold text-sm text-white leading-snug">{j.title}</h3>
                  {j.featured && <span className="shrink-0 bg-brand-gold/15 text-brand-gold text-[9px] font-bold uppercase px-2 py-0.5 rounded">Featured</span>}
                  {j.exclusive && <span className="shrink-0 bg-rose-500/15 text-rose-300 text-[9px] font-bold uppercase px-2 py-0.5 rounded">🔒 Exclusive</span>}
                </div>
                <div className="flex flex-wrap gap-2 text-[10px]">
                  <span className="bg-white/10 text-white/70 rounded px-2 py-0.5 font-mono border border-white/10">{j.country}</span>
                  <span className="bg-white/10 text-white/70 rounded px-2 py-0.5">{j.sector}</span>
                  <span className="bg-brand-gold/10 text-brand-gold rounded px-2 py-0.5 font-bold capitalize">{COLLAR[j.collar] || j.collar}</span>
                </div>
                {j.employer && <p className="text-[11px] text-white/50">Employer: <span className="text-white/80 font-medium">{j.employer}</span></p>}
                {j.description && <p className="text-[11px] text-white/50 leading-relaxed line-clamp-3">{j.description}</p>}
                {(j.benefits?.length || 0) > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {j.benefits!.slice(0, 4).map((b, i) => <span key={i} className="bg-emerald-500/10 text-emerald-300 text-[9px] px-1.5 py-0.5 rounded">{b}</span>)}
                  </div>
                )}
                {(j.requirements?.length || 0) > 0 && (
                  <p className="text-[10px] text-white/40">Requires: {j.requirements!.slice(0, 4).join(', ')}</p>
                )}
                {j.experienceYearsMin ? <p className="text-[10px] text-white/40">Min {j.experienceYearsMin}+ yrs experience · {j.vacancies} opening{j.vacancies === 1 ? '' : 's'}</p> : null}
              </div>
              <div className="flex items-center justify-between border-t border-white/10 pt-3">
                <span className="text-brand-gold font-bold text-sm">{j.salaryText}</span>
                <button
                  onClick={() => { setSelectedJob(j); setView('apply'); setMsg(null); }}
                  className="bg-brand-gold hover:bg-brand-gold/90 text-brand-navy text-[11px] font-bold uppercase tracking-wider px-4 py-2 rounded-lg transition"
                >
                  Apply Now
                </button>
              </div>
            </div>
          ))}
          {visibleJobs.length === 0 && <p className="col-span-full py-10 text-center text-xs text-white/40">No open vacancies right now — check back soon.</p>}
        </div>
        </>
      )}

      {view === 'apply' && selectedJob && (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 space-y-6 backdrop-blur">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-brand-gold font-bold">Apply for</p>
              <h3 className="font-display text-lg font-bold text-white">{selectedJob.title}</h3>
              <p className="text-[11px] text-white/50">{selectedJob.country} · {selectedJob.sector} · {selectedJob.salaryText}</p>
            </div>
            <button onClick={() => setView('browse')} className="text-white/50 hover:text-white text-[11px] font-bold uppercase">← Back</button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div className="space-y-3">
              <h4 className={sectionTitle}>Personal</h4>
              <div><label className={label}>Full Name *</label><input className={input} value={form.personal.fullName} onChange={(e) => up('personal', 'fullName', e.target.value)} placeholder="As per passport" /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={label}>Date of Birth *</label><input type="date" className={input} value={form.personal.dob} onChange={(e) => up('personal', 'dob', e.target.value)} /></div>
                <div>
                  <label className={label}>Gender *</label>
                  <div className="flex gap-1 rounded-full bg-white/5 p-1">
                    {['male', 'female', 'other'].map((g) => <button key={g} onClick={() => up('personal', 'gender', g)} className={`flex-1 text-[10px] font-bold uppercase rounded-full py-1.5 ${form.personal.gender === g ? 'bg-brand-gold text-brand-navy' : 'text-white/50'}`}>{g}</button>)}
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={label}>Marital Status</label><select className={input} value={form.personal.maritalStatus} onChange={(e) => up('personal', 'maritalStatus', e.target.value)}><option value="single">Single</option><option value="married">Married</option></select></div>
                <div><label className={label}>Nationality</label><input className={input} value={form.personal.nationality} onChange={(e) => up('personal', 'nationality', e.target.value)} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={label}>Current City</label><input className={input} value={form.personal.currentCity} onChange={(e) => up('personal', 'currentCity', e.target.value)} /></div>
                <div><label className={label}>Current State</label><input className={input} value={form.personal.currentState} onChange={(e) => up('personal', 'currentState', e.target.value)} /></div>
              </div>
              <div><label className={label}>Languages (comma separated)</label><input className={input} value={form.personal.languages} onChange={(e) => up('personal', 'languages', e.target.value)} placeholder="English, Hindi, Arabic" /></div>
            </div>

            <div className="space-y-3">
              <h4 className={sectionTitle}>Contact</h4>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={label}>Phone</label><input className={input} value={form.contact.phone} onChange={(e) => up('contact', 'phone', e.target.value)} /></div>
                <div><label className={label}>Email</label><input type="email" className={input} value={form.contact.email} onChange={(e) => up('contact', 'email', e.target.value)} /></div>
              </div>
              <div><label className={label}>Alternate Phone</label><input className={input} value={form.contact.alternatePhone} onChange={(e) => up('contact', 'alternatePhone', e.target.value)} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={label}>Emergency Contact</label><input className={input} value={form.contact.emergencyContact} onChange={(e) => up('contact', 'emergencyContact', e.target.value)} /></div>
                <div><label className={label}>Emergency Phone</label><input className={input} value={form.contact.emergencyPhone} onChange={(e) => up('contact', 'emergencyPhone', e.target.value)} /></div>
              </div>

              <h4 className={`${sectionTitle} mt-4`}>Passport</h4>
              <div className="flex gap-1 rounded-full bg-white/5 p-1 w-fit">
                <button onClick={() => up('passport', 'hasPassport', true)} className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase ${form.passport.hasPassport ? 'bg-brand-gold text-brand-navy' : 'text-white/50'}`}>Have Passport</button>
                <button onClick={() => up('passport', 'hasPassport', false)} className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase ${!form.passport.hasPassport ? 'bg-brand-gold text-brand-navy' : 'text-white/50'}`}>No Passport</button>
              </div>
              {form.passport.hasPassport && (
                <div className="grid grid-cols-2 gap-3">
                  <div><label className={label}>Passport No.</label><input className={input} value={form.passport.passportNumber} onChange={(e) => up('passport', 'passportNumber', e.target.value)} /></div>
                  <div><label className={label}>Expiry Date</label><input type="date" className={input} value={form.passport.expiryDate} onChange={(e) => up('passport', 'expiryDate', e.target.value)} /></div>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <h4 className={sectionTitle}>Experience</h4>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={label}>Total Years</label><input type="number" min={0} className={input} value={form.experience.totalYears} onChange={(e) => up('experience', 'totalYears', e.target.value)} /></div>
                <div><label className={label}>Available From</label><input type="date" className={input} value={form.experience.availableFrom} onChange={(e) => up('experience', 'availableFrom', e.target.value)} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={label}>Current Role</label><input className={input} value={form.experience.currentRole} onChange={(e) => up('experience', 'currentRole', e.target.value)} /></div>
                <div><label className={label}>Current Employer</label><input className={input} value={form.experience.currentEmployer} onChange={(e) => up('experience', 'currentEmployer', e.target.value)} /></div>
              </div>
              <div><label className={label}>Skills (comma separated)</label><input className={input} value={form.experience.skills} onChange={(e) => up('experience', 'skills', e.target.value)} placeholder="Welding, Electrical, Driving" /></div>
              <div className="flex gap-1 rounded-full bg-white/5 p-1 w-fit">
                <button onClick={() => up('experience', 'willingToTravel', true)} className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase ${form.experience.willingToTravel ? 'bg-brand-gold text-brand-navy' : 'text-white/50'}`}>Willing to travel</button>
                <button onClick={() => up('experience', 'willingToTravel', false)} className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase ${!form.experience.willingToTravel ? 'bg-brand-gold text-brand-navy' : 'text-white/50'}`}>Local only</button>
              </div>
            </div>

            <div className="space-y-3">
              <h4 className={sectionTitle}>Education & Salary</h4>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={label}>Qualification</label><input className={input} value={form.education.highestQualification} onChange={(e) => up('education', 'highestQualification', e.target.value)} /></div>
                <div><label className={label}>Field of Study</label><input className={input} value={form.education.fieldOfStudy} onChange={(e) => up('education', 'fieldOfStudy', e.target.value)} /></div>
              </div>
              <div><label className={label}>Institution</label><input className={input} value={form.education.institution} onChange={(e) => up('education', 'institution', e.target.value)} /></div>
              <div className="grid grid-cols-2 gap-3">
                <div><label className={label}>Current Salary (₹/month)</label><input type="number" min={0} className={input} value={form.salary.currentSalaryPaise} onChange={(e) => up('salary', 'currentSalaryPaise', e.target.value)} /></div>
                <div><label className={label}>Expected Salary (₹/month)</label><input type="number" min={0} className={input} value={form.salary.expectedSalaryPaise} onChange={(e) => up('salary', 'expectedSalaryPaise', e.target.value)} /></div>
              </div>
              <div><label className={label}>Notice Period (days)</label><input type="number" min={0} className={input} value={form.salary.noticePeriodDays} onChange={(e) => up('salary', 'noticePeriodDays', e.target.value)} /></div>

              <h4 className={`${sectionTitle} mt-4`}>Medical & Extras</h4>
              <div className="flex gap-1 rounded-full bg-white/5 p-1 w-fit">
                <button onClick={() => up('medical', 'selfDeclaredFit', true)} className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase ${form.medical.selfDeclaredFit ? 'bg-brand-gold text-brand-navy' : 'text-white/50'}`}>I declare I am fit</button>
                <button onClick={() => up('medical', 'selfDeclaredFit', false)} className={`px-4 py-1.5 rounded-full text-[10px] font-bold uppercase ${!form.medical.selfDeclaredFit ? 'bg-brand-gold text-brand-navy' : 'text-white/50'}`}>Not fit</button>
              </div>
              <div><label className={label}>Trade Certifications (comma separated)</label><input className={input} value={form.additional.tradeCertifications} onChange={(e) => up('additional', 'tradeCertifications', e.target.value)} placeholder="ITI Fitter, NDT Level II" /></div>
              <div><label className={label}>Driving License</label><input className={input} value={form.additional.drivingLicense} onChange={(e) => up('additional', 'drivingLicense', e.target.value)} placeholder="e.g. LMV / HMV / None" /></div>
              <div><label className={label}>References</label><input className={input} value={form.additional.references} onChange={(e) => up('additional', 'references', e.target.value)} /></div>
            </div>
          </div>

          <div className="rounded-xl border border-dashed border-white/20 p-4 flex items-center gap-3">
            <div className="flex-1">
              <p className="text-[11px] font-bold text-white">Resume / CV <span className="text-white/40 font-normal">(PDF up to 5 MB)</span></p>
              {resumeName ? <p className="text-[10px] text-emerald-300 mt-1">✓ {resumeName} uploaded</p> : <p className="text-[10px] text-white/40 mt-1">Upload for faster screening.</p>}
            </div>
            <label className="cursor-pointer bg-white/10 hover:bg-white/15 text-white text-[11px] font-bold px-4 py-2 rounded-lg transition">
              {uploading ? 'Uploading…' : 'Choose file'}
              <input type="file" accept="application/pdf,.pdf,.doc,.docx" className="hidden" onChange={(e) => { const f = e.target.files?.[0]; if (f) uploadResume(f); }} />
            </label>
          </div>

          <div className="flex justify-end gap-3">
            <button onClick={() => setView('browse')} className="border border-white/15 text-white/60 hover:text-white text-[11px] font-bold uppercase px-5 py-2.5 rounded-lg transition">Cancel</button>
            <button disabled={applying || !form.personal.fullName || !form.personal.dob} onClick={submit} className="bg-brand-gold hover:bg-brand-gold/90 text-brand-navy text-[11px] font-bold uppercase tracking-wider px-6 py-2.5 rounded-lg transition disabled:opacity-50">
              {applying ? 'Submitting…' : 'Submit Application'}
            </button>
          </div>
        </div>
      )}

      {view === 'tracker' && (
        <div className="space-y-4">
          {applications.map((a) => (
            <div key={a.id} className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-3 backdrop-blur">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-display font-bold text-sm text-white">{a.jobTitle}</h3>
                  <p className="text-[10px] text-white/40">{a.jobCountry} · applied {a.appliedAt ? new Date(a.appliedAt * 1000).toLocaleDateString() : ''}</p>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${a.selectionStatus === 'rejected' ? 'bg-rose-500/15 text-rose-300' : a.selectionStatus === 'selected' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-brand-gold/15 text-brand-gold'}`}>{SEL[a.selectionStatus]}</span>
              </div>
              <div className="grid grid-cols-3 gap-3 text-[10px]">
                <div className="rounded-lg bg-white/5 border border-white/10 p-2.5">
                  <p className="text-white/40 uppercase tracking-wider font-bold">Medical</p>
                  <p className={`font-bold mt-1 ${a.medicalStatus === 'fit' ? 'text-emerald-300' : a.medicalStatus === 'unfit' ? 'text-rose-300' : 'text-white/70'}`}>{MED[a.medicalStatus]}</p>
                </div>
                <div className="rounded-lg bg-white/5 border border-white/10 p-2.5">
                  <p className="text-white/40 uppercase tracking-wider font-bold">Visa</p>
                  <p className={`font-bold mt-1 ${a.visaStatus === 'stamped' ? 'text-emerald-300' : a.visaStatus === 'rejected' ? 'text-rose-300' : 'text-white/70'}`}>{VISA[a.visaStatus]}</p>
                </div>
                <div className="rounded-lg bg-white/5 border border-white/10 p-2.5">
                  <p className="text-white/40 uppercase tracking-wider font-bold">Flight</p>
                  <p className={`font-bold mt-1 ${a.flightStatus === 'deployed' ? 'text-emerald-300' : 'text-white/70'}`}>{FLT[a.flightStatus]}</p>
                </div>
              </div>
              {a.rejectionReason && <p className="text-[11px] text-rose-300 bg-rose-500/10 rounded-lg px-3 py-2">Reason: {a.rejectionReason}</p>}
              {a.notes && <p className="text-[11px] text-white/60 bg-white/5 rounded-lg px-3 py-2">Note: {a.notes}</p>}
            </div>
          ))}
          {applications.length === 0 && (
            <div className="py-10 text-center space-y-2">
              <p className="text-xs text-white/50">You haven't applied to any jobs yet.</p>
              <button onClick={() => setView('browse')} className="bg-brand-gold text-brand-navy text-[11px] font-bold uppercase px-5 py-2.5 rounded-lg">Browse Open Jobs</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

