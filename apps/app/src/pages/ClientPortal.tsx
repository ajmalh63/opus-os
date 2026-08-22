import { useVisibilityTracking } from '../lib/visibilityTracking';
import React, { useState, useEffect } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { Link } from 'wouter';
import { useSession } from '../lib/session';
import Logo from '../components/Logo';
import ChatWidget from '../components/ChatWidget';
import ClientDashboardHub from '../components/ClientDashboardHub';
import UmrahClientSection from '../components/UmrahClientSection';
import StudyAbroadClientSection from '../components/StudyAbroadClientSection';
import AttestationClientSection from '../components/AttestationClientSection';
import ManpowerApplyWizard from '../components/manpower/ManpowerApplyWizard';
import ManpowerMarketplace from '../components/ManpowerMarketplace';
import { createSyncClient } from '../lib/syncClient';

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
  { id: 'v1', country: 'Dubai 🇦🇪', visaType: 'Tourist', entryType: 'Single Entry', processingTime: '3-4 Days', feePaise: 720000, requiredDocs: ['Passport (6+ mos validity)', 'Color Photograph', 'Return Flight Booking'] },
  { id: 'v2', country: 'Thailand 🇹🇭', visaType: 'Tourist', entryType: 'Single Entry', processingTime: '2-3 Days', feePaise: 450000, requiredDocs: ['Passport (6+ mos validity)', 'White Background Photo', 'Hotel Reservation'] },
  { id: 'v3', country: 'Malaysia 🇲🇾', visaType: 'Tourist', entryType: 'Single Entry', processingTime: '4-5 Days', feePaise: 580000, requiredDocs: ['Passport Bio-page Scan', 'Passport Photo', 'Flight Itinerary'] },
  { id: 'v4', country: 'Singapore 🇸🇬', visaType: 'Tourist', entryType: 'Single Entry', processingTime: '5-7 Days', feePaise: 850000, requiredDocs: ['Passport front & back', 'Form 14A', 'Covering Letter', 'Bank Statement'] },
  { id: '5', country: 'Vietnam 🇻🇳', visaType: 'Tourist', entryType: 'Single Entry', processingTime: '3 Days', feePaise: 390000, requiredDocs: ['Passport Copy', 'Portrait Photo', 'Entry/Exit Dates'] },
  { id: '6', country: 'Sri Lanka 🇱🇰', visaType: 'Tourist', entryType: 'Single Entry', processingTime: '2 Days', feePaise: 250000, requiredDocs: ['Passport Bio-data Scan', 'Travel Itinerary'] }
];


export default function ClientPortal() {
  useVisibilityTracking('/portal');
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
  const { me, loading: sessionLoading, refresh: refreshSession } = useSession();
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [claimToken, setClaimToken] = useState('');
  const [claimPhone, setClaimPhone] = useState('');

  // Check and synchronize existing Better Auth session
  useEffect(() => {
    if (me?.authenticated && me?.email) {
      setAuthEmail(me.email);
    } else if (!sessionLoading && !me) {
      setAuthEmail(null);
    }
  }, [me, sessionLoading]);

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

  // Automatically bind the client's credential token once authenticated
  useEffect(() => {
    if (sessionData?.journeys && sessionData.journeys.length > 0) {
      const firstClient = sessionData.journeys[0]?.client;
      const tok = firstClient?.portalToken || firstClient?.id;
      if (tok && tok !== activeToken) {
        setActiveToken(tok);
        setTokenInput(firstClient?.id || tok);
      }
    }
  }, [sessionData, activeToken]);

  const handleSignOut = async () => {
    try {
      await fetch('/api/auth/sign-out', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
    } catch {}
    setAuthEmail(null);
    setActiveToken('');
    await refreshSession();
    showToast('Signed out successfully.');
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

  const [portalTab, setPortalTab] = useState<'dashboard' | 'study' | 'visa' | 'umrah' | 'attestation' | 'jobs' | 'journey'>('dashboard');

  const { data: studyAppsData } = useQuery({
    queryKey: ['portalStudyAppsHub', activeToken],
    queryFn: async () => {
      if (!activeToken) return [];
      const res = await fetch(`/api/public/portal/study-abroad/applications?token=${encodeURIComponent(activeToken)}`);
      if (!res.ok) return [];
      const d = await res.json();
      return d.applications || [];
    },
    enabled: !!activeToken,
  });

  const { data: visaAppsData } = useQuery({
    queryKey: ['portalVisaAppsHub', activeToken],
    queryFn: async () => {
      if (!activeToken) return [];
      const res = await fetch(`/api/public/portal/visa/applications?token=${encodeURIComponent(activeToken)}`);
      if (!res.ok) return [];
      const d = await res.json();
      return d.applications || [];
    },
    enabled: !!activeToken,
  });

  const { data: umrahBookingsData } = useQuery({
    queryKey: ['portalUmrahBookingsHub', activeToken],
    queryFn: async () => {
      if (!activeToken) return [];
      const res = await fetch(`/api/public/portal/umrah/my-bookings?token=${encodeURIComponent(activeToken)}`);
      if (!res.ok) return [];
      const d = await res.json();
      return d.bookings || [];
    },
    enabled: !!activeToken,
  });

  const { data: attestationAppsData } = useQuery({
    queryKey: ['portalAttestAppsHub', activeToken],
    queryFn: async () => {
      if (!activeToken) return [];
      const res = await fetch(`/api/public/portal/attestation/applications?token=${encodeURIComponent(activeToken)}`);
      if (!res.ok) return [];
      const d = await res.json();
      return d.applications || [];
    },
    enabled: !!activeToken,
  });

  const { data: jobAppsData } = useQuery({
    queryKey: ['portalJobAppsHub', activeToken],
    queryFn: async () => {
      if (!activeToken) return [];
      const res = await fetch(`/api/public/portal/manpower/applications?token=${encodeURIComponent(activeToken)}`);
      if (!res.ok) return [];
      const d = await res.json();
      return d.applications || [];
    },
    enabled: !!activeToken,
  });

  const stages = [
    { key: 'lead', label: 'Consultation', seq: 1, desc: 'Initial counseling and profile assembly.' },
    { key: 'qualified', label: 'Qualification', seq: 2, desc: 'Eligibility review and documentation checklist.' },
    { key: 'documents', label: 'Document Vault', seq: 3, desc: 'Original certificate review & compliance validation.' },
    { key: 'processing', label: 'Processing', seq: 4, desc: 'Application submission to university/embassy.' },
    { key: 'complete', label: 'Stamping & Transit', seq: 5, desc: 'Visa stamping, pre-departure briefing, and travel.' },
  ];

  // Client realtime — portalToken plane, private client:{id}:* + departure inventory
  // @ts-ignore
  const _syncClient = (() => {
    try {
      const enabled = (import.meta as any).env?.VITE_SYNC_ENABLED !== 'false';
      if (!enabled || typeof window === 'undefined') return null;
      const token = (() => { try { return localStorage.getItem('portalToken') || new URLSearchParams(location.search).get('token') || ''; } catch { return ''; } })();
      const clientId = (() => { try { return localStorage.getItem('clientId') || token || ''; } catch { return token || ''; } })();
      if (!token) return null;
      const c = createSyncClient({
        plane: 'client',
        token,
        channels: [`client:${clientId}:bookings`, `client:${clientId}:documents`, `departure:*:inventory`].slice(0,5),
        enabled,
        onEvent: (e) => { try { const qc=(window as any).__TANSTACK_QUERY_CLIENT__; if(qc){ if(e.channel.startsWith('client:')) qc.invalidateQueries({queryKey:['portal']}); if(e.channel.startsWith('departure:')) qc.invalidateQueries({queryKey:['departures']}); } } catch {} },
      });
      c.connect(); return c;
    } catch { return null; }
  })();

  return (
    <div className="relative bg-[#FAF8F4] text-slate-800 font-sans min-h-screen flex flex-col justify-between selection:bg-brand-gold selection:text-brand-navy">
      {/* HEADER */}
      <header className="bg-white/95 backdrop-blur-md border-b border-slate-200/80 py-3.5 px-6 md:px-10 sticky top-0 shadow-xs z-30 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Logo className="h-8 w-auto" />
          <div>
            <span className="font-display font-extrabold text-base tracking-wider block text-brand-navy">Opus Overseas</span>
            <span className="text-[9px] text-brand-gold font-bold tracking-widest uppercase block leading-none">Client Workspace & Services</span>
          </div>
        </div>

        <div className="flex items-center gap-3 md:gap-4">
          <div className="hidden sm:flex items-center gap-2 bg-emerald-50 border border-emerald-200/70 text-emerald-800 px-3 py-1 rounded-full text-[10px] font-bold">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Live Workspace Sync</span>
          </div>

          <button
            type="button"
            onClick={() => {
              if (typeof window !== 'undefined' && (window as any).$chatwoot) {
                (window as any).$chatwoot.toggle();
              }
            }}
            className="text-xs bg-brand-navy hover:bg-brand-gold hover:text-brand-navy text-white px-3.5 py-1.5 rounded-xl transition font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
          >
            <span>💬</span>
            <span className="hidden sm:inline">Counselor Live Chat</span>
          </button>

          <a
            href="tel:+919876543210"
            className="text-xs bg-slate-100 hover:bg-slate-200 border border-slate-300/70 text-slate-700 px-3 py-1.5 rounded-xl transition font-semibold flex items-center gap-1.5"
          >
            <span>📞</span>
            <span className="hidden sm:inline">Support Hotline</span>
          </a>

          {authEmail && (
            <button
              type="button"
              onClick={handleSignOut}
              className="text-xs bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 px-3 py-1.5 rounded-lg transition font-semibold cursor-pointer"
            >
              Sign Out
            </button>
          )}
        </div>
      </header>

      {/* MAIN LAYOUT */}
      {authEmail || me?.authenticated ? (
        <div className="flex flex-1 max-w-[1440px] w-full mx-auto">
          {/* LEFT SIDEBAR NAVIGATION PANE */}
          <aside className="w-64 shrink-0 bg-white border-r border-slate-200/80 p-4 space-y-6 flex flex-col justify-between hidden md:flex min-h-[calc(100vh-65px)] sticky top-[65px]">
            <div className="space-y-6">
              {/* Client Profile Header */}
              <div className="p-3.5 bg-slate-50 border border-slate-200/80 rounded-xl space-y-1">
                <div className="flex items-center gap-2">
                  <div className="w-7 h-7 rounded-lg bg-brand-gold/20 text-brand-gold font-extrabold flex items-center justify-center text-xs">
                    👤
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold text-slate-800 truncate">{me?.name || authEmail}</div>
                    <div className="text-[9px] text-slate-400 font-mono">#{me?.id?.slice(0, 10) || 'CLIENT'}</div>
                  </div>
                </div>
                <div className="text-[9px] bg-brand-gold/15 text-brand-navy font-bold px-2 py-0.5 rounded text-center">
                  ✨ Verified Client Workspace
                </div>
              </div>

              {/* Navigation Section 1: Main Hub */}
              <div className="space-y-1">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 px-3 block">
                  Main Desk
                </span>
                <button
                  type="button"
                  onClick={() => setPortalTab('dashboard')}
                  className={`w-full text-left px-3 py-2.5 rounded-xl text-xs font-bold transition flex items-center justify-between cursor-pointer ${
                    portalTab === 'dashboard'
                      ? 'bg-brand-navy text-white shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span>📊</span>
                    <span>Dashboard & Pipeline</span>
                  </span>
                  {portalTab === 'dashboard' && <span className="w-1.5 h-1.5 rounded-full bg-brand-gold"></span>}
                </button>
              </div>

              {/* Navigation Section 2: Global Divisions */}
              <div className="space-y-1">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 px-3 block">
                  Enrolled Divisions
                </span>
                <button
                  type="button"
                  onClick={() => setPortalTab('study')}
                  className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold transition flex items-center justify-between cursor-pointer ${
                    portalTab === 'study'
                      ? 'bg-brand-navy text-white shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span>🎓</span>
                    <span>Study Abroad</span>
                  </span>
                  {portalTab === 'study' && <span className="w-1.5 h-1.5 rounded-full bg-brand-gold"></span>}
                </button>

                <button
                  type="button"
                  onClick={() => setPortalTab('visa')}
                  className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold transition flex items-center justify-between cursor-pointer ${
                    portalTab === 'visa'
                      ? 'bg-brand-navy text-white shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span>✈️</span>
                    <span>Visa Processing</span>
                  </span>
                  {portalTab === 'visa' && <span className="w-1.5 h-1.5 rounded-full bg-brand-gold"></span>}
                </button>

                <button
                  type="button"
                  onClick={() => setPortalTab('umrah')}
                  className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold transition flex items-center justify-between cursor-pointer ${
                    portalTab === 'umrah'
                      ? 'bg-brand-navy text-white shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span>🕋</span>
                    <span>Umrah Pilgrimage</span>
                  </span>
                  {portalTab === 'umrah' && <span className="w-1.5 h-1.5 rounded-full bg-brand-gold"></span>}
                </button>

                <button
                  type="button"
                  onClick={() => setPortalTab('attestation')}
                  className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold transition flex items-center justify-between cursor-pointer ${
                    portalTab === 'attestation'
                      ? 'bg-brand-navy text-white shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span>📑</span>
                    <span>Attestation Desk</span>
                  </span>
                  {portalTab === 'attestation' && <span className="w-1.5 h-1.5 rounded-full bg-brand-gold"></span>}
                </button>

                <button
                  type="button"
                  onClick={() => setPortalTab('jobs')}
                  className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold transition flex items-center justify-between cursor-pointer ${
                    portalTab === 'jobs'
                      ? 'bg-brand-navy text-white shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span>💼</span>
                    <span>Global Careers</span>
                  </span>
                  {portalTab === 'jobs' && <span className="w-1.5 h-1.5 rounded-full bg-brand-gold"></span>}
                </button>
              </div>

              {/* Navigation Section 3: Records & Vault */}
              <div className="space-y-1">
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 px-3 block">
                  Records & Vault
                </span>
                <button
                  type="button"
                  onClick={() => setPortalTab('journey')}
                  className={`w-full text-left px-3 py-2 rounded-xl text-xs font-bold transition flex items-center justify-between cursor-pointer ${
                    portalTab === 'journey'
                      ? 'bg-brand-navy text-white shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <span>🗺️</span>
                    <span>Journey Overview</span>
                  </span>
                  {portalTab === 'journey' && <span className="w-1.5 h-1.5 rounded-full bg-brand-gold"></span>}
                </button>
              </div>
            </div>

            {/* Bottom Support Widget */}
            <div className="p-3 bg-brand-gold/10 border border-brand-gold/30 rounded-xl space-y-1.5">
              <div className="text-[10px] font-bold text-brand-navy uppercase tracking-wider">Hyderabad HQ</div>
              <div className="text-[11px] text-slate-600">Mon - Sat: 9:30 AM - 6:30 PM</div>
              <a
                href="https://wa.me/919876543210"
                target="_blank"
                rel="noreferrer"
                className="text-[10px] text-brand-navy font-extrabold hover:underline block pt-1"
              >
                Direct Counselor WhatsApp →
              </a>
            </div>
          </aside>

          {/* MAIN CONTENT AREA */}
          <main className="flex-1 p-6 md:p-8 space-y-8 overflow-y-auto">
            {/* Mobile Horizontal Navigation Strip */}
            <div className="md:hidden flex items-center gap-1.5 overflow-x-auto pb-2 border-b border-slate-200">
              <button
                type="button"
                onClick={() => setPortalTab('dashboard')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 ${
                  portalTab === 'dashboard' ? 'bg-brand-navy text-white' : 'bg-white border border-slate-200 text-slate-700'
                }`}
              >
                📊 Dashboard
              </button>
              <button
                type="button"
                onClick={() => setPortalTab('study')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 ${
                  portalTab === 'study' ? 'bg-brand-navy text-white' : 'bg-white border border-slate-200 text-slate-700'
                }`}
              >
                🎓 Study Abroad
              </button>
              <button
                type="button"
                onClick={() => setPortalTab('visa')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 ${
                  portalTab === 'visa' ? 'bg-brand-navy text-white' : 'bg-white border border-slate-200 text-slate-700'
                }`}
              >
                ✈️ Visa
              </button>
              <button
                type="button"
                onClick={() => setPortalTab('umrah')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 ${
                  portalTab === 'umrah' ? 'bg-brand-navy text-white' : 'bg-white border border-slate-200 text-slate-700'
                }`}
              >
                🕋 Umrah
              </button>
              <button
                type="button"
                onClick={() => setPortalTab('attestation')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 ${
                  portalTab === 'attestation' ? 'bg-brand-navy text-white' : 'bg-white border border-slate-200 text-slate-700'
                }`}
              >
                📑 Attestation
              </button>
              <button
                type="button"
                onClick={() => setPortalTab('jobs')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 ${
                  portalTab === 'jobs' ? 'bg-brand-navy text-white' : 'bg-white border border-slate-200 text-slate-700'
                }`}
              >
                💼 Careers
              </button>
              <button
                type="button"
                onClick={() => setPortalTab('journey')}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold shrink-0 ${
                  portalTab === 'journey' ? 'bg-brand-navy text-white' : 'bg-white border border-slate-200 text-slate-700'
                }`}
              >
                🗺️ Journey
              </button>
            </div>

            {/* TAB 1: CLIENT DASHBOARD & LIVE KANBAN HUB */}
            {portalTab === 'dashboard' && (
              <ClientDashboardHub
                clientName={me?.name || authEmail || 'Valued Client'}
                clientEmail={authEmail || ''}
                accountId={me?.id || activeToken || 'CLIENT'}
                sessionData={sessionData}
                assignedCounselor={sessionData?.journeys?.[0]?.assignedCounselor}
                studyApps={studyAppsData || []}
                visaApps={visaAppsData || []}
                umrahBookings={umrahBookingsData || []}
                attestationApps={attestationAppsData || []}
                jobApps={jobAppsData || []}
                onNavigateTab={(t: any) => setPortalTab(t)}
              />
            )}

            {/* TAB 2: STUDY ABROAD */}
            {portalTab === 'study' && (
              <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs">
                <StudyAbroadClientSection token={activeToken || me?.id || 'client-self'} />
              </div>
            )}

            {/* TAB 3: VISA PROCESSING */}
            {portalTab === 'visa' && (
              <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs">
                <VisaServices token={activeToken || me?.id || 'client-self'} />
              </div>
            )}

            {/* TAB 4: UMRAH PILGRIMAGE */}
            {portalTab === 'umrah' && (
              <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs">
                <UmrahClientSection token={activeToken || me?.id || 'client-self'} />
              </div>
            )}

            {/* TAB 5: DOCUMENT ATTESTATION */}
            {portalTab === 'attestation' && (
              <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs">
                <AttestationClientSection token={activeToken || me?.id || 'client-self'} />
              </div>
            )}

            {/* TAB 6: GLOBAL JOBS & CAREERS — P0 Manpower Marketplace (Indeed gold: match + 1-click) */}
            {portalTab === 'jobs' && (
              <div className="space-y-4">
                <ManpowerMarketplace token={activeToken || me?.id || 'client-self'} />
                <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs">
                  <h4 className="font-display font-bold text-xs text-brand-navy mb-3">My Applications — Live Tracking</h4>
                  <ManpowerJobs token={activeToken || me?.id || 'client-self'} />
                </div>
              </div>
            )}

            {/* TAB 7: JOURNEY OVERVIEW */}
            {portalTab === 'journey' && sessionData && sessionData.authenticated && (
              <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-6">
                <div className="border-b border-slate-100 pb-3">
                  <h3 className="font-display font-bold text-base text-brand-navy">Your Verified Journey Files</h3>
                  <p className="text-xs text-slate-500">Live milestones, verified DPDP consents, and payment receipts.</p>
                </div>
                {sessionData.journeys?.map((j: any, idx: number) => (
                  <div key={idx} className="p-4 bg-slate-50 border border-slate-200 rounded-xl space-y-3">
                    <div className="font-bold text-xs text-brand-navy">Client ID: #{j.client?.id}</div>
                    <div className="text-xs text-slate-600">Documents: {j.documents?.length || 0} files on record</div>
                  </div>
                ))}
              </div>
            )}
          </main>
        </div>
      ) : (
        <main className="max-w-6xl w-full mx-auto p-6 md:p-8 flex-1 flex flex-col gap-8">
          <section className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm flex flex-col lg:flex-row items-center justify-between gap-8">
            <div className="max-w-xl space-y-3">
              <span className="text-[10px] bg-brand-gold/15 text-brand-navy font-bold px-3 py-1 rounded-full uppercase tracking-wider">
                Public Journey Lookup
              </span>
              <h1 className="font-display font-extrabold text-2xl md:text-3xl text-brand-navy leading-tight">
                Track Your Global Journey in <span className="text-brand-gold">Real Time</span>
              </h1>
              <p className="text-xs text-slate-500 leading-relaxed">
                Enter your unique client token <code className="text-brand-gold font-mono font-bold bg-slate-100 px-1.5 py-0.5 rounded">OP-2026-XXXX</code> to check your application progress and document vault status.
              </p>
            </div>

            <div className="w-full max-w-md bg-slate-50 p-6 rounded-2xl border border-slate-200 space-y-4">
              <div>
                <h3 className="font-display font-bold text-brand-navy text-sm">Registered Client?</h3>
                <p className="text-xs text-slate-500 mt-1">Sign in to access your confidential document vault and counselor desk.</p>
              </div>

              <Link
                href="/login"
                className="w-full inline-flex items-center justify-center gap-2 bg-brand-navy hover:bg-brand-navy/90 text-white py-3 rounded-xl text-xs font-extrabold uppercase tracking-wider transition shadow-xs"
              >
                <span>Sign In with Email / OTP</span>
                <span>→</span>
              </Link>
            </div>
          </section>
        </main>
      )}

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
      {/* Mobile Bottom Nav — thumb zone (platform-design HIG, 44px) */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 bg-white/95 backdrop-blur border-t border-slate-200 flex justify-around items-center py-1.5 pb-[calc(0.5rem+env(safe-area-inset-bottom))]">
        {[
          { k: 'dashboard', label: 'Browse', icon: '⌂' },
          { k: 'visa', label: 'Bookings', icon: '✈' },
          { k: 'journey', label: 'Docs', icon: '📄' },
          { k: 'help', label: 'Help', icon: '?' },
        ].map(i => (
          <button key={i.k} onClick={() => i.k === 'help' ? (window as any).$chatwoot?.toggle?.() : setPortalTab(i.k as any)} className={`flex flex-col items-center gap-0.5 px-3 py-1 rounded-lg ${portalTab===i.k?'text-brand-gold':'text-slate-400'} cursor-pointer`}>
            <span className="text-base leading-none">{i.icon}</span><span className="text-[9px] font-bold uppercase tracking-wide">{i.label}</span>
          </button>
        ))}
      </nav>
      {/* In-product Help Center — Vezert 30% deflection */}
      <div className="fixed bottom-20 right-4 md:bottom-6 md:right-6 z-30 hidden md:block">
        <button onClick={() => (window as any).$chatwoot?.toggle?.()} className="bg-brand-navy text-white px-3.5 py-2.5 rounded-full text-xs font-bold shadow-lg hover:bg-brand-gold hover:text-brand-navy transition flex items-center gap-1.5 cursor-pointer">
          <span>?</span> Help center — search docs, dues, refunds
        </button>
      </div>
      <ChatWidget />

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
  // Visa Cart (P0 RICE 230) — gold standard: eligibility + cart + sticky CTA
  const [visaCart, setVisaCart] = useState<any[]>([]);
  const [showVisaCart, setShowVisaCart] = useState(false);
  const addToVisaCart = (p: any) => {
    if (visaCart.find(v => v.id === p.id)) return;
    setVisaCart(c => [...c, p]);
  };

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

      {/* Available Visa Categories — P0 Visa Cart (Ralabs gold: eligibility + cart + sticky CTA) */}
      <div className="bg-brand-navy/40 border border-brand-navyLight p-6 rounded-2xl space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="font-display font-bold text-sm text-white">✈️ Browse Active Visa Offerings</h3>
            <p className="text-[10px] text-brand-cream/50 mt-0.5">Explore standard entry visas — add to cart for family, pay once.</p>
          </div>
          {visaCart.length > 0 && (
            <button onClick={() => setShowVisaCart(true)} className="inline-flex items-center gap-1.5 bg-brand-gold text-brand-navy px-3 py-1.5 rounded-full text-xs font-bold cursor-pointer">
              🛒 Cart ({visaCart.length}) — ₹{(visaCart.reduce((s,p)=>s+(p.feePaise||0),0)/100).toLocaleString('en-IN')}
            </button>
          )}
        </div>
        <div className="flex flex-wrap gap-1.5 text-[10px]">
          <span className="px-2.5 py-1 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/20 font-bold">✅ Indian → Dubai Tourist Eligible · 3-4 Days</span>
          <span className="px-2.5 py-1 rounded-full bg-white/10 text-white/70">Single-column form · 44px</span>
        </div>

        {selectedCatalogProduct ? (
          /* Catalog Checkout Form Panel — enterprise: draft saved, progress 1/3, sticky CTA */
          <div id="visa-checkout" className="border border-brand-gold/30 bg-brand-navyLight/20 p-5 rounded-xl space-y-4 scroll-mt-4">
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
                <div className="flex gap-1.5 mt-3">
                  <button onClick={() => addToVisaCart(p)} disabled={visaCart.some(v=>v.id===p.id)} className={`flex-1 py-1.5 rounded text-[9px] font-bold uppercase border transition cursor-pointer ${visaCart.some(v=>v.id===p.id) ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/20' : 'bg-white/10 text-white border-white/20 hover:bg-white/20'}`}>
                    {visaCart.some(v=>v.id===p.id) ? '✓ In cart' : '+ Cart'}
                  </button>
                  <button
                    onClick={() => {
                      setSelectedCatalogProduct(p);
                      setCheckoutEmail(journey.client.email || '');
                      setCheckoutPhone(journey.client.phone || '');
                      setCheckoutAgreed(false);
                      setCatalogFiles({});
                      setTimeout(() => document.getElementById('visa-checkout')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
                    }}
                    className="flex-1 bg-brand-navy hover:bg-brand-gold hover:text-brand-navy text-white font-bold py-1.5 rounded text-[9px] uppercase tracking-wider transition-all cursor-pointer text-center border border-transparent"
                  >
                    Start Application →
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
        {visaCart.length > 0 && (
          <div className="rounded-xl border border-brand-gold/30 bg-brand-gold/[0.06] p-4 flex items-center justify-between flex-wrap gap-3">
            <div className="text-xs text-brand-navy">
              <span className="font-bold">Cart ({visaCart.length})</span>
              <span className="mx-1.5 text-brand-navy/40">·</span>
              <span>₹{(visaCart.reduce((s,p)=>s+(p.feePaise||0),0)/100).toLocaleString('en-IN')}</span>
              <span className="hidden sm:inline text-brand-navy/40 ml-2">{visaCart.map(p=>p.country).join(' + ')}</span>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setVisaCart([])} className="px-3 py-1.5 rounded-full border border-brand-navy/15 bg-white text-xs font-bold text-brand-navy hover:bg-brand-navy/5 cursor-pointer">Clear</button>
              <button onClick={async () => {
                if (visaCart.length === 1) { setSelectedCatalogProduct(visaCart[0]); setShowVisaCart(false); return; }
                // Bulk: create inquiries for each, then one cart checkout
                const ok = confirm(`Place ${visaCart.length} visa inquiries together? Each will create a tracking entry and you can pay once.`);
                if (!ok) return;
                for (const item of visaCart) {
                  try {
                    await fetch('/api/public/portal/visa/inquiry', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ clientId: journey.client.id, country: item.country, visaType: item.visaType, email: journey.client.email, registeredMobile: journey.client.phone, agreedToTerms: true, notes: `Bulk cart checkout — ${item.entryType}, ${item.processingTime}` }) });
                  } catch {}
                }
                const total = visaCart.reduce((s,p)=>s+(p.feePaise||0),0);
                alert(`✓ ${visaCart.length} inquiries placed. Total fee ₹${(total/100).toLocaleString('en-IN')} — pay from Outstanding Balance or we’ll contact you.`);
                setVisaCart([]); setShowVisaCart(false); window.location.reload();
              }} className="px-4 py-1.5 rounded-full bg-brand-navy text-white text-xs font-bold hover:bg-brand-navy/90 cursor-pointer">
                Checkout Cart → Pay ₹{(visaCart.reduce((s,p)=>s+(p.feePaise||0),0)/100).toLocaleString('en-IN')}
              </button>
            </div>
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
      if (r.status === 404) return [];
      if (!r.ok) throw new Error(await r.text() || 'Failed to load your applications.');
      const d = await r.json();
      return d.applications || [];
    },
    enabled: !!token,
    retry: false,
  });

  const products = (productsQ.data && productsQ.data.length > 0) ? productsQ.data : DEFAULT_PRODUCTS;
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
      {/* Destination Country Filter Strip */}
      <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-6 flex flex-col gap-4 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
          <div>
            <span className="text-[10px] font-bold text-brand-gold uppercase tracking-widest block">Visa Catalogue</span>
            <h3 className="font-display font-extrabold text-base text-brand-navy mt-1">Choose your destination</h3>
          </div>
          <div className="w-full md:w-72">
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="w-full p-2.5 text-xs bg-white border border-slate-200 rounded-xl text-slate-800 font-medium outline-none focus:border-brand-gold shadow-xs cursor-pointer"
            >
              <option value="">All Countries ({countries.length} Available)</option>
              {countries.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
              <option value="__other__">Other country…</option>
            </select>
          </div>
        </div>
        <p className="text-xs text-slate-500">Standard processing fees apply per product. Start an application to open the guided draft wizard — your progress is saved at every step.</p>
      </div>

      {productsQ.isLoading && (
        <div className="py-12 flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-brand-gold border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs text-slate-500 font-medium">Loading visa catalogue...</p>
        </div>
      )}

      {productsQ.isError && (
        <div className="p-5 bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl text-xs">
          <p className="font-bold">Catalogue unavailable</p>
          <p className="text-[11px] mt-0.5 opacity-80">{(productsQ.error as Error)?.message}</p>
          <button onClick={() => productsQ.refetch()} className="mt-3 text-[10px] font-bold uppercase tracking-wider bg-white border border-rose-300 text-rose-700 px-3 py-1.5 rounded-lg cursor-pointer">
            Retry
          </button>
        </div>
      )}

      {!productsQ.isLoading && products.length === 0 && (
        <div className="text-center border-2 border-dashed border-slate-200 rounded-2xl p-10 bg-slate-50">
          <h3 className="font-display font-bold text-sm text-brand-navy">No visa products available</h3>
          <p className="text-xs text-slate-500 mt-1">Our visa desk has not published any active products yet.</p>
        </div>
      )}

      {applications.length > 0 && (
        <div className="flex flex-col gap-3">
          <span className="text-[10px] font-bold text-brand-gold uppercase tracking-widest block">Your Applications</span>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {applications.map((a) => (
              <button
                key={a.id}
                onClick={() => openApp(a)}
                className="text-left bg-white border border-slate-200 hover:border-brand-gold rounded-2xl p-4 transition cursor-pointer shadow-xs hover:shadow-sm"
              >
                <div className="flex justify-between items-center gap-2">
                  <span className="font-bold text-brand-navy text-xs">{a.country} — {a.visaType}</span>
                  <span className="text-[9px] font-extrabold uppercase px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                    {a.status.replace('_', ' ')}
                  </span>
                </div>
                <p className="text-[10px] text-slate-500 mt-1.5">
                  {a.status === 'draft' ? 'Draft in progress — tap to continue.' : `Last updated ${new Date(a.updatedAt * 1000).toLocaleDateString()}`}
                </p>
              </button>
            ))}
          </div>
        </div>
      )}

      {country === '__other__' && (
        <div className="rounded-2xl border border-brand-gold/40 bg-amber-50/40 p-6 space-y-4 shadow-xs">
          <div>
            <span className="text-[10px] font-bold text-brand-gold uppercase tracking-widest block">Country not listed?</span>
            <h3 className="font-display font-bold text-sm text-brand-navy mt-1">Request a custom visa</h3>
            <p className="text-xs text-slate-500 mt-1">Tell us the country you need a visa for — our desk will get back to you with options and pricing.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1.5">Country you need *</label>
              <input value={inquiryCountry} onChange={(e) => setInquiryCountry(e.target.value)} placeholder="e.g. United Kingdom" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-brand-gold focus:outline-none" />
            </div>
            <div>
              <label className="block text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1.5">Visa type (if known)</label>
              <input value={inquiryType} onChange={(e) => setInquiryType(e.target.value)} placeholder="e.g. Tourist / Work / Student" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-brand-gold focus:outline-none" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-[10px] uppercase tracking-wider text-slate-500 font-bold mb-1.5">Anything else we should know?</label>
              <textarea value={inquiryNotes} onChange={(e) => setInquiryNotes(e.target.value)} rows={2} placeholder="Travel dates, purpose, number of travellers…" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-brand-gold focus:outline-none" />
            </div>
          </div>
          <div className="flex items-center justify-between gap-3">
            <p className="text-xs text-slate-500">We'll contact you on your registered details.</p>
            <button onClick={submitInquiry} disabled={inquiryBusy || !inquiryCountry.trim()} className="bg-brand-navy hover:bg-brand-gold hover:text-brand-navy text-white text-xs font-bold uppercase tracking-wider px-5 py-2.5 rounded-xl transition disabled:opacity-50 cursor-pointer shadow-xs">
              {inquiryBusy ? 'Sending…' : 'Request Visa'}
            </button>
          </div>
          {inquirySent && <p className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">✓ Request sent! Our visa desk will get back to you shortly.</p>}
          {inquiryError && <p className="text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">{inquiryError}</p>}
        </div>
      )}

      {!productsQ.isLoading && products.length > 0 && country !== '__other__' && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {products
            .filter((p) => !country || p.country === country)
            .map((p) => (
              <div key={p.id} className="bg-white border border-slate-200/90 hover:border-brand-gold rounded-2xl p-5 flex flex-col justify-between gap-4 transition shadow-xs hover:shadow-md group">
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <h4 className="font-display font-extrabold text-brand-navy text-sm group-hover:text-brand-gold transition-colors">{p.visaType}</h4>
                      <span className="text-xs text-slate-500 font-semibold">{p.country}</span>
                    </div>
                    <span className="text-[9px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-slate-100 text-slate-700 border border-slate-200 shrink-0">{p.entryType}</span>
                  </div>

                  <div className="flex items-center justify-between text-xs py-2 px-3 bg-slate-50 rounded-xl border border-slate-100">
                    <span className="text-slate-500">⏱ Processing: <strong className="text-slate-700">{p.processingTime}</strong></span>
                    <span className="text-brand-navy font-display font-black text-base">₹{(p.feePaise / 100).toLocaleString('en-IN')}</span>
                  </div>

                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">Required Documents</span>
                    <ul className="mt-1.5 space-y-1 text-xs text-slate-600">
                      {(p.requiredDocs || ['Passport scan', 'Color photograph']).map((doc) => (
                        <li key={doc} className="flex items-center gap-1.5">
                          <span className="text-emerald-500 font-bold">✓</span>
                          <span>{doc}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>

                <button
                  onClick={() => startApp(p)}
                  disabled={busy}
                  className="w-full mt-2 py-2.5 rounded-xl bg-brand-navy hover:bg-brand-gold hover:text-brand-navy text-white text-xs font-black uppercase tracking-wider transition shadow-xs cursor-pointer disabled:opacity-50 active:scale-95"
                >
                  {draftByProduct(p) ? 'Continue Draft' : 'Start Application →'}
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

type JobApplication = {
  id: string;
  jobId: string;
  jobTitle: string;
  jobCountry: string;
  selectionStatus: string;
  medicalStatus: string;
  visaStatus: string;
  flightStatus: string;
  appliedAt?: number | null;
  rejectionReason?: string | null;
  resumeKey?: string | null;
  notes?: string | null;
  matchScore?: number;
  matchTier?: 'top_match' | 'standard' | 'cold_pool';
  matchStrengths?: string[];
  matchGaps?: string[];
};

type VasPlan = {
  key: string;
  title: string;
  description: string;
  pricePaise: number;
  durationDays: number;
  deliverable: string;
};

const COLLAR = { blue_collar: 'Blue Collar', white_collar: 'White Collar' } as Record<string, string>;
const SEL = { applied: 'Applied', shortlisted: 'Shortlisted', selected: 'Selected', rejected: 'Rejected' } as Record<string, string>;
const MED = { pending: 'Medical Pending', fit: 'Medically Fit', unfit: 'Unfit', restricted: 'Restricted' } as Record<string, string>;
const VISA = { pending: 'Visa Pending', submitted: 'Visa Submitted', stamped: 'Visa Stamped', rejected: 'Visa Rejected' } as Record<string, string>;
const FLT = { pending: 'Awaiting Flight', booked: 'Flight Booked', deployed: 'Deployed' } as Record<string, string>;

function ManpowerJobs({ token }: { token: string }) {
  const [view, setView] = useState<'browse' | 'apply' | 'tracker' | 'vas'>('browse');
  const [selectedJob, setSelectedJob] = useState<JobRow | null>(null);
  const [applying, setApplying] = useState(false);
  const [resumeKey, setResumeKey] = useState<string | null>(null);
  const [resumeName, setResumeName] = useState('');
  const [uploading, setUploading] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [turnstileToken] = useState<string>('cf_ts_simulated_token_' + Date.now());
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
    staleTime: 60_000,
    queryFn: async () => { const r = await fetch(`/api/public/portal/manpower/jobs${token ? `?token=${encodeURIComponent(token)}` : ''}`); if (!r.ok) throw new Error('jobs'); return r.json(); },
  });
  const jobs = jobsData?.jobs || [];
  const [exclusiveFilter, setExclusiveFilter] = useState<'all' | 'exclusive'>('all');
  const visibleJobs = exclusiveFilter === 'exclusive' ? jobs.filter((j) => j.exclusive) : jobs;

  const { data: appsData, refetch: refetchApps } = useQuery<{ applications: JobApplication[]; activeCount?: number; maxQuota?: number }>({
    queryKey: ['portalManpowerApps', token],
    staleTime: 30_000,
    queryFn: async () => { const r = await fetch(`/api/public/portal/manpower/applications?token=${encodeURIComponent(token)}`); if (!r.ok) throw new Error('apps'); return r.json(); },
    enabled: !!token,
  });
  const applications = appsData?.applications || [];
  const activeCount = appsData?.activeCount ?? applications.filter(d => !['rejected'].includes(d.selectionStatus) && d.flightStatus !== 'deployed').length;
  const maxQuota = appsData?.maxQuota ?? 3;

  const { data: vasData } = useQuery<{ plans: VasPlan[] }>({
    queryKey: ['portalManpowerVas'],
    staleTime: 300_000,
    queryFn: async () => { const r = await fetch('/api/public/portal/manpower/vas-plans'); if (!r.ok) throw new Error('vas'); return r.json(); },
  });
  const vasPlans = vasData?.plans || [];

  const up = (section: string, key: string, value: any) => setForm((f) => ({ ...f, [section]: { ...(f as any)[section], [key]: value } }));

  // Calculate local profile readiness percentage
  const profileReadiness = Math.min(100, (
    (form.personal.fullName && form.personal.dob ? 20 : 0) +
    (form.contact.phone && form.contact.email ? 20 : 0) +
    (form.passport.passportNumber ? 20 : 0) +
    (form.experience.skills ? 20 : 0) +
    (form.education.highestQualification ? 20 : 0)
  ));

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
    if (activeCount >= maxQuota) {
      setMsg({ ok: false, text: `Active application quota reached (${activeCount}/${maxQuota}). Please await decision on current applications.` });
      return;
    }
    setApplying(true); setMsg(null);
    try {
      const r = await fetch('/api/public/portal/manpower/applications', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          token,
          jobId: selectedJob!.id,
          formJson: buildFormJson(),
          resumeKey,
          turnstileToken
        }),
      });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Submit failed' + (j.missingSections ? ` (missing: ${j.missingSections.join(', ')})` : ''));
      refetchApps();
      setView('tracker');
      setMsg({
        ok: true,
        text: j.message || `Application submitted! Match Score: ${j.matchScore}%`
      });
    } catch (e: any) { setMsg({ ok: false, text: e.message }); } finally { setApplying(false); }
  };

  const { data: membershipData, refetch: refetchMembership } = useQuery<{ enabled: boolean; comingSoon: boolean; membership: { isMember: boolean; expiresAt: number | null; plan: string | null }; plans: { key: string; name: string; description?: string; pricePaise: number; durationDays: number; tier: string; perks: string[] }[] }>({
    queryKey: ['portalManpowerMembership', token],
    staleTime: 60_000,
    queryFn: async () => { const r = await fetch(`/api/public/portal/manpower/membership?token=${encodeURIComponent(token)}`); if (!r.ok) throw new Error('membership'); return r.json(); },
    enabled: !!token,
  });
  const membership = membershipData?.membership;
  const plans = membershipData?.plans || [];
  const [payBusy, setPayBusy] = useState(false);
  const [acceptedVasTerms, setAcceptedVasTerms] = useState(false);

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

  const purchaseVas = async (serviceKey: string) => {
    setPayBusy(true); setMsg(null);
    try {
      const loaded = await loadRazorpay();
      if (!loaded) throw new Error('Razorpay checkout failed to load.');
      const oRes = await fetch('/api/public/portal/manpower/vas/order', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, serviceKey }),
      });
      const o = await oRes.json();
      if (!oRes.ok || !o.order_id) throw new Error(o.error || 'Failed to initialize service order');

      const result = await new Promise<{ razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string } | null>((resolve) => {
        const rz = new (window as any).Razorpay({
          key: o.key, amount: o.amount_paise, currency: o.currency || 'INR',
          name: 'Opus Overseas Career Advisory', description: o.title || 'Career Service',
          order_id: o.order_id,
          handler: (res: any) => resolve({ razorpay_payment_id: res.razorpay_payment_id, razorpay_order_id: res.razorpay_order_id, razorpay_signature: res.razorpay_signature }),
          modal: { ondismiss: () => resolve(null) },
        });
        rz.open();
      });
      if (!result) { setMsg({ ok: false, text: 'Payment window closed.' }); return; }

      const vRes = await fetch('/api/public/portal/manpower/vas/verify', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, serviceKey, ...result }),
      });
      const v = await vRes.json();
      if (!vRes.ok) throw new Error(v.error || 'Payment verification failed');
      setMsg({ ok: true, text: v.message || 'Career service confirmed! Our team will reach out.' });
    } catch (e: any) { setMsg({ ok: false, text: e.message }); } finally { setPayBusy(false); }
  };

  const input = 'w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs text-white placeholder:text-white/30 focus:border-brand-gold focus:outline-none';
  const label = 'block text-[10px] uppercase tracking-wider text-white/60 font-bold mb-1.5';
  const pill = (active: boolean) => `px-3 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition cursor-pointer ${active ? 'bg-brand-gold text-brand-navy' : 'border border-white/15 text-white/60 hover:text-white'}`;
  const sectionTitle = 'text-[10px] font-bold uppercase tracking-widest text-brand-gold border-b border-white/10 pb-2 mb-3';
  // legacy wizard state now delegated to ManpowerApplyWizard — keep refs to satisfy TS (enterprise cleanup pending)
  void applying; void resumeKey; void resumeName; void uploading; void up; void profileReadiness; void uploadResume; void buildFormJson; void submit; void input; void label; void sectionTitle;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-full bg-white/5 p-1 w-fit border border-white/10">
          <button onClick={() => setView('browse')} className={pill(view === 'browse')}>🧑‍🔧 Open Vacancies</button>
          <button onClick={() => setView('tracker')} className={pill(view === 'tracker')}>📋 My Applications ({applications.length})</button>
          <button onClick={() => setView('vas')} className={pill(view === 'vas')}>✨ Career Add-Ons</button>
        </div>

        {/* Anti-Spam Quota Indicator */}
        <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-3 py-1 text-[10px]">
          <span className="text-white/50">Active Quota:</span>
          <span className={`font-bold ${activeCount >= maxQuota ? 'text-amber-400' : 'text-emerald-400'}`}>
            {activeCount}/{maxQuota} Active
          </span>
          <span className="text-[9px] text-white/40 border-l border-white/10 pl-2">🛡️ Cloudflare Bot Guard</span>
        </div>
      </div>

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
                    className="min-h-11 bg-brand-gold hover:bg-brand-gold-hover text-brand-navy text-[11px] font-extrabold uppercase tracking-wider px-5 rounded-xl transition disabled:opacity-40 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-gold/30 cursor-pointer"
                  >
                    {payBusy ? 'Processing…' : 'Subscribe'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Enterprise KPI Strip — F-pattern Level 1 (NN/g 2026) — 3-second decision */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl border border-white/15 bg-white/5 px-4 py-3.5 backdrop-blur">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/50">Open Vacancies</p>
            <p className="mt-1 font-display text-2xl font-extrabold tracking-tight text-white">{jobs.length}<span className="ml-2 text-xs font-bold text-emerald-300">● Live</span></p>
            <p className="text-xs text-white/60">{visibleJobs.length} showing · {jobs.filter(j=>j.featured).length} featured</p>
          </div>
          <div className="rounded-2xl border border-white/15 bg-white/5 px-4 py-3.5 backdrop-blur">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/50">Exclusive Access</p>
            <p className="mt-1 font-display text-2xl font-extrabold tracking-tight text-white">{membership?.isMember ? 'Unlocked' : `${jobs.filter(j=>j.exclusive).length} locked`}</p>
            <p className="text-xs text-white/60">{membership?.isMember ? 'Secret jobs visible' : 'Join community to unlock'}</p>
          </div>
          <div className="rounded-2xl border border-white/15 bg-white/5 px-4 py-3.5 backdrop-blur">
            <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-white/50">My Active Quota</p>
            <p className={`mt-1 font-display text-2xl font-extrabold tracking-tight ${activeCount >= maxQuota ? 'text-amber-300' : 'text-white'}`}>{activeCount}/{maxQuota}</p>
            <p className="text-xs text-white/60">{activeCount >= maxQuota ? 'Await decisions' : `${maxQuota - activeCount} slots remaining`}</p>
          </div>
        </div>

        <div className="flex gap-1 rounded-full bg-white/5 p-1 w-fit border border-white/10">
          <button onClick={() => setExclusiveFilter('all')} className={pill(exclusiveFilter === 'all')}>All Jobs</button>
          <button onClick={() => setExclusiveFilter('exclusive')} className={pill(exclusiveFilter === 'exclusive')}>🔒 Exclusive</button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {visibleJobs.map((j) => (
            <div key={j.id} className="group rounded-2xl border border-white/15 bg-white/[0.06] p-5 flex flex-col justify-between gap-4 backdrop-blur hover:bg-white/[0.08] hover:border-brand-gold/30 hover:shadow-[0_8px_32px_rgba(0,0,0,0.25)] transition-all duration-300">
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
                  disabled={activeCount >= maxQuota}
                  onClick={() => { setSelectedJob(j); setView('apply'); setMsg(null); }}
                  className="min-h-11 bg-brand-gold hover:bg-brand-gold-hover text-brand-navy text-[11px] font-extrabold uppercase tracking-wider px-5 rounded-xl transition disabled:opacity-40 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-gold/30 cursor-pointer"
                >
                  {activeCount >= maxQuota ? 'Quota Full (3/3)' : 'Apply Free'}
                </button>
              </div>
            </div>
          ))}
          {visibleJobs.length === 0 && <p className="col-span-full py-10 text-center text-xs text-white/40">No open vacancies right now — check back soon.</p>}
        </div>
        </>
      )}

      {view === 'vas' && (
        <div className="space-y-5">
          {/* Trust & Realtime Activity Strip */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
            <div className="rounded-xl bg-white/5 border border-white/10 p-3 text-center">
              <p className="text-[10px] text-white/50 uppercase tracking-widest font-bold">Active Candidates</p>
              <p className="text-sm font-bold text-white mt-0.5">🔥 142 This Month</p>
            </div>
            <div className="rounded-xl bg-white/5 border border-white/10 p-3 text-center">
              <p className="text-[10px] text-white/50 uppercase tracking-widest font-bold">Delivery Turnaround</p>
              <p className="text-sm font-bold text-emerald-400 mt-0.5">⚡ 24h–72h SLA</p>
            </div>
            <div className="rounded-xl bg-white/5 border border-white/10 p-3 text-center">
              <p className="text-[10px] text-white/50 uppercase tracking-widest font-bold">Recruiter Deliverable</p>
              <p className="text-sm font-bold text-brand-gold mt-0.5">🛡️ 100% Verified</p>
            </div>
            <div className="rounded-xl bg-white/5 border border-white/10 p-3 text-center">
              <p className="text-[10px] text-white/50 uppercase tracking-widest font-bold">Standard Applications</p>
              <p className="text-sm font-bold text-white/80 mt-0.5">⚖️ Always 100% Free</p>
            </div>
          </div>

          {/* Legal Safety, Selection & No-Refund Transparency Notice */}
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.07] p-5 space-y-3">
            <div className="flex items-center gap-2 text-amber-300 font-bold text-xs uppercase tracking-wider">
              <span>⚠️</span>
              <span>Important: First-Come, First-Served & No-Refund Policy</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-[11px] text-white/80 leading-relaxed">
              <div className="space-y-1">
                <p className="font-bold text-white flex items-center gap-1.5">
                  <span className="text-amber-400">1.</span> First-Come, First-Served Employer Review
                </p>
                <p className="text-white/60">
                  International hiring authorities evaluate candidates sequentially. If a candidate ahead of you is selected for a specific opening, your professional deliverable (ATS resume, interview coaching) remains permanently valid and active for all present and future overseas openings in your trade.
                </p>
              </div>
              <div className="space-y-1">
                <p className="font-bold text-white flex items-center gap-1.5">
                  <span className="text-amber-400">2.</span> No Job Guarantee & Non-Refundable Fee Policy
                </p>
                <p className="text-white/60">
                  Under the <strong>Indian Emigration Act 1983</strong> and <strong>ILO C181</strong>, standard job recruitment is strictly free. These optional fees cover expert resume writing, mock interview coaching, and express screening labor. They <strong>do not guarantee employment or visa issuance</strong>. Fees are non-refundable once deliverable work commences.
                </p>
              </div>
            </div>

            {/* Checkbox Acknowledgment */}
            <label className="flex items-start gap-2.5 cursor-pointer bg-black/20 border border-white/10 rounded-xl p-3 mt-1 hover:border-amber-400/40 transition">
              <input
                type="checkbox"
                checked={acceptedVasTerms}
                onChange={(e) => setAcceptedVasTerms(e.target.checked)}
                className="mt-0.5 rounded border-white/30 text-brand-gold focus:ring-brand-gold cursor-pointer"
              />
              <span className="text-[11px] text-white/90">
                I understand this is an optional professional career coaching & document enhancement service. It does not guarantee job selection or visa outcome, and fees are non-refundable once work begins.
              </span>
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {vasPlans.map((plan) => (
              <div key={plan.key} className="group rounded-2xl border border-white/15 bg-white/[0.06] p-5 flex flex-col justify-between gap-4 backdrop-blur hover:bg-white/[0.08] hover:border-brand-gold/30 hover:shadow-[0_8px_32px_rgba(0,0,0,0.25)] transition-all duration-300">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-bold uppercase tracking-widest text-brand-gold">{plan.durationDays} Days SLA</span>
                    <span className="text-[10px] bg-white/10 text-white/70 px-2 py-0.5 rounded">Optional VAS</span>
                  </div>
                  <h4 className="font-display font-bold text-sm text-white">{plan.title}</h4>
                  <p className="text-[11px] text-white/60 leading-relaxed">{plan.description}</p>
                  <div className="rounded-lg bg-white/5 border border-white/10 p-2.5 text-[10px] text-white/70">
                    <span className="text-brand-gold font-bold">Deliverable: </span>{plan.deliverable}
                  </div>
                  <div className="text-[9px] text-emerald-400/90 font-medium">
                    {plan.key === 'ats_revamp' ? '🔥 78 candidates upgraded this month' : plan.key === 'mock_interview' ? '🎙️ 41 candidates prepped this month' : '⚡ 23 candidates fast-tracked this week'}
                  </div>
                </div>

                <div className="border-t border-white/10 pt-3 flex items-center justify-between">
                  <span className="text-brand-gold font-bold text-base">₹{(plan.pricePaise / 100).toLocaleString('en-IN')}</span>
                  <button
                    disabled={payBusy || !acceptedVasTerms}
                    onClick={() => purchaseVas(plan.key)}
                    className="bg-brand-gold hover:bg-brand-gold/90 text-brand-navy text-[11px] font-bold uppercase px-4 py-2 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {payBusy ? 'Processing…' : !acceptedVasTerms ? 'Accept Terms' : 'Purchase'}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {view === 'apply' && selectedJob && (
        <ManpowerApplyWizard
          job={selectedJob}
          token={token}
          turnstileToken={turnstileToken}
          activeCount={activeCount}
          maxQuota={maxQuota}
          onClose={() => setView('browse')}
          onSuccess={(message, _score) => {
            refetchApps();
            setView('tracker');
            setMsg({ ok: true, text: message });
          }}
        />
      )}

      {view === 'tracker' && (
        <div className="space-y-4">
          {applications.map((a) => (
            <div key={a.id} className="rounded-2xl border border-white/10 bg-white/5 p-5 space-y-3 backdrop-blur">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-display font-bold text-sm text-white">{a.jobTitle}</h3>
                    {a.matchScore !== undefined && (
                      <span className={`px-2 py-0.5 rounded-full text-[9px] font-bold uppercase ${a.matchTier === 'top_match' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : a.matchTier === 'standard' ? 'bg-brand-gold/20 text-brand-gold border border-brand-gold/30' : 'bg-white/10 text-white/60'}`}>
                        {a.matchTier === 'top_match' ? '🔥 ' : ''}{a.matchScore}% Match
                      </span>
                    )}
                  </div>
                  <p className="text-[10px] text-white/40 mt-0.5">{a.jobCountry} · applied {a.appliedAt ? new Date(a.appliedAt * 1000).toLocaleDateString() : ''}</p>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${a.selectionStatus === 'rejected' ? 'bg-rose-500/15 text-rose-300' : a.selectionStatus === 'selected' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-brand-gold/15 text-brand-gold'}`}>{SEL[a.selectionStatus]}</span>
              </div>

              {/* Strengths & Matching Highlights */}
              {(a.matchStrengths?.length || 0) > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {a.matchStrengths!.map((st, i) => (
                    <span key={i} className="bg-emerald-500/10 text-emerald-300 text-[9px] px-2 py-0.5 rounded-md flex items-center gap-1">
                      <span>✓</span> {st}
                    </span>
                  ))}
                </div>
              )}

              {/* Enterprise Decision Timeline — operational dashboard hierarchy (NN/g) */}
              <div className="relative rounded-xl border border-white/10 bg-white/[0.04] p-3.5">
                <div className="flex items-center justify-between gap-2">
                  {[
                    { label: 'Applied', done: true, active: a.selectionStatus !== 'applied', ok: a.selectionStatus !== 'rejected' },
                    { label: 'Shortlisted', done: ['shortlisted','selected'].includes(a.selectionStatus), active: a.selectionStatus === 'shortlisted', ok: a.selectionStatus !== 'rejected' },
                    { label: 'Selected', done: a.selectionStatus === 'selected', active: a.selectionStatus === 'selected', ok: a.selectionStatus !== 'rejected' },
                    { label: 'Medical', done: a.medicalStatus === 'fit', active: a.medicalStatus === 'pending', ok: a.medicalStatus !== 'unfit' },
                    { label: 'Visa', done: a.visaStatus === 'stamped', active: a.visaStatus === 'submitted', ok: a.visaStatus !== 'rejected' },
                    { label: 'Deployed', done: a.flightStatus === 'deployed', active: a.flightStatus === 'booked', ok: true },
                  ].map((s, i, arr) => (
                    <div key={s.label} className="flex flex-1 items-center gap-2">
                      <div className="flex flex-col items-center gap-1">
                        <div className={`flex h-7 w-7 items-center justify-center rounded-full border text-xs font-extrabold ${s.done ? (s.ok ? 'bg-emerald-500 text-white border-emerald-500' : 'bg-rose-500 text-white border-rose-500') : s.active ? 'bg-brand-gold text-brand-navy border-brand-gold animate-pulse' : 'bg-white/10 text-white/40 border-white/15'}`}>{s.done ? '✓' : i+1}</div>
                        <span className={`text-[10px] font-bold uppercase tracking-wider ${s.done ? 'text-white' : s.active ? 'text-brand-gold' : 'text-white/40'}`}>{s.label}</span>
                      </div>
                      {i < arr.length -1 && <div className={`h-px flex-1 ${s.done ? 'bg-emerald-500/50' : 'bg-white/10'}`} aria-hidden />}
                    </div>
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-2"><span className="text-white/50 uppercase text-[10px] font-bold">Medical</span><p className={`font-bold ${a.medicalStatus === 'fit' ? 'text-emerald-300' : a.medicalStatus === 'unfit' ? 'text-rose-300' : 'text-white'}`}>{MED[a.medicalStatus]}</p></div>
                  <div className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-2"><span className="text-white/50 uppercase text-[10px] font-bold">Visa</span><p className={`font-bold ${a.visaStatus === 'stamped' ? 'text-emerald-300' : a.visaStatus === 'rejected' ? 'text-rose-300' : 'text-white'}`}>{VISA[a.visaStatus]}</p></div>
                  <div className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-2"><span className="text-white/50 uppercase text-[10px] font-bold">Flight</span><p className={`font-bold ${a.flightStatus === 'deployed' ? 'text-emerald-300' : 'text-white'}`}>{FLT[a.flightStatus]}</p></div>
                </div>
              </div>
              {a.rejectionReason && <p className="text-[11px] text-rose-300 bg-rose-500/10 rounded-lg px-3 py-2">Reason: {a.rejectionReason}</p>}
              {a.notes && <p className="text-[11px] text-white/60 bg-white/5 rounded-lg px-3 py-2">Note: {a.notes}</p>}
            </div>
          ))}
          {applications.length === 0 && (
            <div className="py-10 text-center space-y-2">
              <p className="text-xs text-white/50">You haven't applied to any vacancies yet.</p>
              <button onClick={() => setView('browse')} className="bg-brand-gold text-brand-navy text-[11px] font-bold uppercase px-5 py-2.5 rounded-lg">Browse Open Jobs</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

