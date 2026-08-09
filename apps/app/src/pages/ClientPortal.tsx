import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Link } from 'wouter';
import Logo from '../components/Logo';

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

  const stages = [
    { key: 'lead', label: 'Consultation', seq: 1, desc: 'Initial counseling and profile assembly.' },
    { key: 'qualified', label: 'Qualification', seq: 2, desc: 'Eligibility review and documentation checklist.' },
    { key: 'documents', label: 'Document Vault', seq: 3, desc: 'Original certificate review & compliance validation.' },
    { key: 'processing', label: 'Processing', seq: 4, desc: 'Application submission to university/embassy.' },
    { key: 'complete', label: 'Stamping & Transit', seq: 5, desc: 'Visa stamping, pre-departure briefing, and travel.' },
  ];

  return (
    <div className="bg-[#070B19] text-brand-cream font-sans min-h-screen flex flex-col justify-between selection:bg-brand-gold selection:text-brand-navy">
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
              ðŸ”
            </div>
            <h3 className="font-display font-semibold text-sm text-white">Awaiting Token Inquiry</h3>
            <p className="text-[11px] text-brand-cream/50 mt-1 max-w-sm mx-auto">
              Please enter your unique ID in the lookup box above. Demo logs are pre-loaded under token OP-2026-5555.
            </p>
          </div>
        )}

        {isError && (
          <div className="p-5 bg-brand-error/10 border border-brand-error/20 text-brand-error rounded-xl text-xs flex items-center gap-3">
            <span className="text-lg">âš ï¸</span>
            <div>
              <p className="font-bold">Lookup Unsuccessful</p>
              <p className="text-[11px] opacity-80">{error?.message || 'Verification timed out. Check token formatting.'}</p>
            </div>
          </div>
        )}

        {sessionIsError && (
          <div className="p-5 bg-brand-error/10 border border-brand-error/20 text-brand-error rounded-xl text-xs flex items-center gap-3">
            <span className="text-lg">âš ï¸</span>
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
        {sessionData && sessionData.authenticated && (
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
                <div className="text-3xl mb-3">ðŸ—‚ï¸</div>
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
                              {p.type === 'receipt' ? '-' : '+'}â‚¹{(p.amount / 100).toFixed(2)}
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
                              <span className="text-brand-error font-mono font-bold text-lg">â‚¹{(eng.outstandingBalance / 100).toFixed(2)}</span>
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
                                    {isCompleted ? 'âœ“' : stage.seq}
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
        {data && data.success && (
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
                            {withdrawConsent.isPending ? 'Withdrawingâ€¦' : 'Withdraw'}
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
                            â‚¹{(eng.outstandingBalance / 100).toFixed(2)}
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
                                {isCompleted ? 'âœ“' : stage.seq}
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
            <span>Â© 2026 Opus Overseas (Telangana, India). All rights reserved.</span>
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
