import { useVisibilityTracking } from '../lib/visibilityTracking';
import { lazy, Suspense, useState, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { useSession } from '../lib/session';
import Logo from '../components/Logo';
import ChatWidget from '../components/ChatWidget';
import ClientDashboardHub from '../components/ClientDashboardHub';
import ClientMobileNav from '../components/client/ClientMobileNav';
import LanguagePill from '../components/client/LanguagePill';
import UmrahClientSection from '../components/UmrahClientSection';
import StudyAbroadClientSection from '../components/StudyAbroadClientSection';
import AttestationClientSection from '../components/AttestationClientSection';
import { PortalMessages } from '../components/client/PortalMessages';
import { PortalCalendar } from '../components/client/PortalCalendar';
import { VisaTracker } from '../components/client/VisaTracker';
import ManpowerMarketplace from '../components/ManpowerMarketplace';
import { ManpowerAccessGate } from '../components/manpower/ManpowerAccessGate';
import { createSyncClient } from '../lib/syncClient';
import { useDivisions } from '../lib/divisions';
import ClientCommandPalette from '../components/client/ClientCommandPalette';
import ClientFeedbackModal from '../components/client/ClientFeedbackModal';
import { ClientDocumentVault } from '../components/client/ClientDocumentVault';
import { ClientHelpdeskSection } from '../components/client/ClientHelpdeskSection';
import TwoFactorSetup from '../components/TwoFactorSetup';
const ClientVisaSection = lazy(() => import('../components/client/ClientVisaSection'));
const API = (import.meta as any).env?.VITE_API_URL || '';

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
    phone?: string;
    portalToken?: string;
    createdAt: number;
    intakeContext?: string;
  };
  assignedCounselor?: {
    id: string;
    name: string;
    email: string;
    role?: string;
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
  useVisibilityTracking('/portal');
  const { isEnabled } = useDivisions();
  const [toast, setToast] = useState<{ show: boolean; msg: string }>({ show: false, msg: '' });
  const showToast = (msg: string) => {
    setToast({ show: true, msg });
    setTimeout(() => setToast({ show: false, msg: '' }), 3500);
  };

  const [activeToken, setActiveToken] = useState(() => {
    // Secure handling: read token from URL once, then hide it (no query exposure, no referrer leak)
    // Token is high-entropy magic link — must not stay in URL history/logs.
    const params = new URLSearchParams(window.location.search);
    const urlToken = params.get('token');
    const stored = (() => {
      try { return sessionStorage.getItem('portalToken') || ''; } catch { return ''; }
    })();
    const token = urlToken || stored || '';
    if (urlToken) {
      try { sessionStorage.setItem('portalToken', urlToken); } catch {}
      // Remove token from URL immediately (replace, not push, so back button doesn't re-expose)
      params.delete('token');
      const cleanUrl = window.location.pathname + (params.toString() ? '?' + params.toString() : '') + window.location.hash;
      window.history.replaceState(null, '', cleanUrl);
      // Also store a short-lived flag for debugging (optional)
      return urlToken;
    }
    if (stored) return stored;
    return token;
  });

  // Keep token in sessionStorage, never back in URL (prevents exposure in history/referrer/logs)
  useEffect(() => {
    if (activeToken) {
      try { sessionStorage.setItem('portalToken', activeToken); } catch {}
      // Ensure URL stays clean — remove any stray token param if it reappears
      const params = new URLSearchParams(window.location.search);
      if (params.has('token')) {
        params.delete('token');
        const cleanUrl = window.location.pathname + (params.toString() ? '?' + params.toString() : '') + window.location.hash;
        window.history.replaceState(null, '', cleanUrl);
      }
    } else {
      try { sessionStorage.removeItem('portalToken'); } catch {}
    }
  }, [activeToken]);

  // ====== Authenticated "My Journey" (Section 25.4) ======
  const { me, loading: sessionLoading, refresh: refreshSession } = useSession();
  const [authEmail, setAuthEmail] = useState<string | null>(null);
  const [commandPaletteOpen, setCommandPaletteOpen] = useState(false);
  const [feedbackModalOpen, setFeedbackModalOpen] = useState(false);

  // Check and synchronize existing Better Auth session
  useEffect(() => {
    if (me?.authenticated && me?.email) {
      setAuthEmail(me.email);
    } else if (!sessionLoading && !me) {
      setAuthEmail(null);
    }
  }, [me, sessionLoading]);

  // Fetch authenticated journeys once logged in
  const { data: sessionData } =
    useQuery<SessionResponse>({
      queryKey: ['portalSession', authEmail],
      queryFn: async () => {
        if (!authEmail) return null;
        const res = await fetch(`${API}/api/public/portal/session`, { credentials: 'include' });
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
      }
    }
  }, [sessionData, activeToken]);

  const handleSignOut = async () => {
    try {
      await fetch(`${API}/api/auth/sign-out`, {
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

  const [portalTab, setPortalTab] = useState<'dashboard' | 'study' | 'visa' | 'umrah' | 'attestation' | 'jobs' | 'vault' | 'journey' | 'security' | 'helpdesk'>(() => {
    const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
    const tab = params.get('tab') as any;
    if (tab && ['dashboard','study','visa','umrah','attestation','jobs','vault','journey','security','helpdesk'].includes(tab)) return tab;
    return 'dashboard';
  });

  // Sync portalTab with URL — every tab is a real link, back button works
  const navigateTab = (tab: typeof portalTab) => {
    const url = new URL(window.location.href);
    url.searchParams.set('tab', tab);
    window.history.pushState(null, '', url.toString());
    setPortalTab(tab);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Handle browser back/forward
  useEffect(() => {
    const onPop = () => {
      const params = new URLSearchParams(window.location.search);
      const tab = params.get('tab') as any;
      if (tab && ['dashboard','study','visa','umrah','attestation','jobs','vault','journey','security','helpdesk'].includes(tab)) {
        setPortalTab(tab);
      }
    };
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  const { data: studyAppsData } = useQuery({
    queryKey: ['portalStudyAppsHub', activeToken],
    queryFn: async () => {
      if (!activeToken) return [];
      const res = await fetch(`${API}/api/public/portal/study-abroad/applications`, { headers: { 'X-Portal-Token': activeToken } });
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
      const res = await fetch(`${API}/api/public/portal/visa/applications`, { headers: { 'X-Portal-Token': activeToken } });
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
      const res = await fetch(`${API}/api/public/portal/umrah/my-bookings`, { headers: { 'X-Portal-Token': activeToken } });
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
      const res = await fetch(`${API}/api/public/portal/attestation/applications`, { headers: { 'X-Portal-Token': activeToken } });
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
      const res = await fetch(`${API}/api/public/portal/manpower/applications`, { headers: { 'X-Portal-Token': activeToken } });
      if (!res.ok) return [];
      const d = await res.json();
      return d.applications || [];
    },
    enabled: !!activeToken,
  });

  const queryClient = useQueryClient();

  // ——— Manpower jobs paywall: membership status for the /portal jobs tab (₹100 candidate-pass) ———
  const mpPortalToken = sessionData?.journeys?.[0]?.client?.portalToken || sessionData?.journeys?.[0]?.client?.id || activeToken || me?.id || 'client-self';
  const {
    data: mpMembershipData,
    isLoading: mpMembershipLoading,
    refetch: refetchMpMembership,
  } = useQuery<{
    enabled: boolean;
    comingSoon: boolean;
    membership: { isMember: boolean; expiresAt: number | null; plan: string | null; since?: number | null };
    plans: { key: string; name: string; description?: string; pricePaise: number; durationDays: number; tier: string; perks: string[] }[];
  }>({
    queryKey: ['portalManpowerMembershipGate', mpPortalToken],
    staleTime: 60_000,
    queryFn: async () => {
      const r = await fetch(`${API}/api/public/portal/manpower/membership`, { headers: { 'X-Portal-Token': mpPortalToken } });
      if (!r.ok) throw new Error('membership status unavailable');
      return r.json();
    },
    enabled: !!mpPortalToken,
  });
  const mpIsMember = mpMembershipData?.membership?.isMember === true;

  // Client realtime — WebSocket Durable Object sync for live stage & document updates
  useEffect(() => {
    const enabled = (import.meta as any).env?.VITE_SYNC_ENABLED !== 'false';
    if (!enabled) return;
    // L5 FIX: never fall back to localStorage — portalToken is sessionStorage-only
    // (prevents persistent XSS exfiltration + history leak). Legacy localStorage
    // value is ignored; activeToken is the single source of truth.
    const token = activeToken || '';
    const clientId = sessionData?.journeys?.[0]?.client?.id || token || '';
    if (!token && !clientId) return;

    const c = createSyncClient({
      plane: 'client',
      token,
      channels: [
        `client:${clientId}:bookings`,
        `client:${clientId}:documents`,
        `client:${clientId}:payments`,
        `client:${clientId}:journey`,
        `client:${clientId}:family`,
        `departure:*:inventory`,
      ],
      enabled,
      onEvent: (_e) => {
        queryClient.invalidateQueries({ queryKey: ['portalClientSession'] });
        queryClient.invalidateQueries({ queryKey: ['portalDashboard'] });
        queryClient.invalidateQueries({ queryKey: ['studyAbroadApps'] });
        queryClient.invalidateQueries({ queryKey: ['portalVisaApplications'] });
        queryClient.invalidateQueries({ queryKey: ['portalUmrahMyBookings'] });
        queryClient.invalidateQueries({ queryKey: ['attestationApps'] });
        queryClient.invalidateQueries({ queryKey: ['portalManpowerApps'] });
      },
    });

    c.connect();
    return () => {
      try { (c as any).disconnect?.(); } catch {}
    };
  }, [activeToken, sessionData, queryClient]);

  return (
    <div className="relative bg-[#FAF8F4] text-slate-800 font-sans min-h-screen flex flex-col justify-between selection:bg-brand-gold selection:text-brand-navy">
      {/* HEADER */}
      <header className="bg-white/95 backdrop-blur-md border-b border-slate-200/80 py-3.5 px-6 md:px-10 sticky top-0 shadow-xs z-30 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Logo className="h-9 w-auto" />
          <div>
            <span className="font-display font-extrabold text-base sm:text-lg tracking-wider block text-brand-navy">Opus Overseas</span>
            <span className="text-xs text-brand-gold font-bold tracking-widest uppercase block leading-none mt-0.5">Client Workspace & Services</span>
          </div>
        </div>

        <div className="flex items-center gap-2 md:gap-3">
          <button
            type="button"
            onClick={() => setCommandPaletteOpen(true)}
            className="hidden sm:flex items-center gap-2 px-3.5 py-2 rounded-xl bg-slate-100/90 hover:bg-slate-200/90 border border-slate-200 text-xs font-semibold text-slate-700 transition cursor-pointer"
            title="Press Cmd+K or Ctrl+K to open search"
          >
            <span>🔍</span>
            <span className="hidden md:inline">Quick Jump</span>
            <kbd className="px-2 py-0.5 rounded bg-white border border-slate-200 text-xs font-mono text-slate-600 shadow-2xs">
              ⌘K
            </kbd>
          </button>
          <LanguagePill />
          <div className="hidden sm:flex items-center gap-2 bg-emerald-50 border border-emerald-200/70 text-emerald-800 px-3.5 py-1.5 rounded-full text-xs font-bold">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <span>Live Sync</span>
          </div>

          <a
            href="tel:+919876543210"
            className="text-xs sm:text-sm bg-slate-100 hover:bg-slate-200 border border-slate-300/70 text-slate-700 px-3.5 py-2 rounded-xl transition font-semibold flex items-center gap-1.5"
          >
            <span>📞</span>
            <span className="hidden sm:inline">Support Hotline</span>
          </a>

          {authEmail && (
            <button
              type="button"
              onClick={handleSignOut}
              className="text-xs sm:text-sm bg-rose-50 hover:bg-rose-100 text-rose-600 border border-rose-200 px-3.5 py-2 rounded-xl transition font-semibold cursor-pointer"
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
          <aside className="w-72 shrink-0 bg-white border-r border-slate-200/80 p-5 space-y-6 flex flex-col justify-between hidden md:flex min-h-[calc(100vh-65px)] sticky top-[65px]">
            <div className="space-y-6">
              {/* Client Profile Header */}
              <div className="p-4 bg-slate-50 border border-slate-200/80 rounded-2xl space-y-2">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-brand-gold/20 text-brand-gold font-extrabold flex items-center justify-center text-sm">
                    👤
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-slate-800 truncate">{me?.name || authEmail}</div>
                    <div className="text-xs text-slate-500 font-mono">#{me?.id?.slice(0, 10) || 'CLIENT'}</div>
                  </div>
                </div>
                <div className="text-xs bg-brand-gold/15 text-brand-navy font-bold px-3 py-1 rounded-lg text-center">
                  ✨ Verified Client Workspace
                </div>
              </div>

              {/* Navigation Section 1: Main Hub */}
              <div className="space-y-1.5">
                <span className="text-xs font-black uppercase tracking-wider text-slate-400 px-3 block">
                  Main Desk
                </span>
                <button
                  type="button"
                  onClick={() => navigateTab('dashboard')}
                  className={`w-full text-left px-3.5 py-2.5 rounded-xl text-sm font-bold transition flex items-center justify-between cursor-pointer ${
                    portalTab === 'dashboard'
                      ? 'bg-brand-navy text-white shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <span>📊</span>
                    <span>Dashboard & Pipeline</span>
                  </span>
                  {portalTab === 'dashboard' && <span className="w-2 h-2 rounded-full bg-brand-gold"></span>}
                </button>
              </div>

              {/* Navigation Section 2: Global Divisions */}
              <div className="space-y-1.5">
                <span className="text-xs font-black uppercase tracking-wider text-slate-400 px-3 block">
                  Enrolled Divisions
                </span>
                <button
                  type="button"
                  onClick={() => navigateTab('study')}
                  className={`w-full text-left px-3.5 py-2.5 rounded-xl text-sm font-bold transition flex items-center justify-between cursor-pointer ${
                    portalTab === 'study'
                      ? 'bg-brand-navy text-white shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <span>🎓</span>
                    <span>Study Abroad</span>
                  </span>
                  <div className="flex items-center gap-1.5">
                    {!isEnabled('study-abroad') && <span className="text-xs font-extrabold uppercase tracking-wider text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">Soon</span>}
                    {portalTab === 'study' && <span className="w-2 h-2 rounded-full bg-brand-gold"></span>}
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => navigateTab('visa')}
                  className={`w-full text-left px-3.5 py-2.5 rounded-xl text-sm font-bold transition flex items-center justify-between cursor-pointer ${
                    portalTab === 'visa'
                      ? 'bg-brand-navy text-white shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <span>🛂</span>
                    <span>Visa Processing</span>
                  </span>
                  <div className="flex items-center gap-1.5">
                    {!isEnabled('visa') && <span className="text-xs font-extrabold uppercase tracking-wider text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">Soon</span>}
                    {portalTab === 'visa' && <span className="w-2 h-2 rounded-full bg-brand-gold"></span>}
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => navigateTab('umrah')}
                  className={`w-full text-left px-3.5 py-2.5 rounded-xl text-sm font-bold transition flex items-center justify-between cursor-pointer ${
                    portalTab === 'umrah'
                      ? 'bg-brand-navy text-white shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <span>🧳</span>
                    <span>Tours &amp; Travels</span>
                  </span>
                  <div className="flex items-center gap-1.5">
                    {!isEnabled('umrah') && <span className="text-xs font-extrabold uppercase tracking-wider text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">Soon</span>}
                    {portalTab === 'umrah' && <span className="w-2 h-2 rounded-full bg-brand-gold"></span>}
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => navigateTab('attestation')}
                  className={`w-full text-left px-3.5 py-2.5 rounded-xl text-sm font-bold transition flex items-center justify-between cursor-pointer ${
                    portalTab === 'attestation'
                      ? 'bg-brand-navy text-white shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <span>📜</span>
                    <span>Attestation Desk</span>
                  </span>
                  <div className="flex items-center gap-1.5">
                    {!isEnabled('attestation') && <span className="text-xs font-extrabold uppercase tracking-wider text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">Soon</span>}
                    {portalTab === 'attestation' && <span className="w-2 h-2 rounded-full bg-brand-gold"></span>}
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => navigateTab('jobs')}
                  className={`w-full text-left px-3.5 py-2.5 rounded-xl text-sm font-bold transition flex items-center justify-between cursor-pointer ${
                    portalTab === 'jobs'
                      ? 'bg-brand-navy text-white shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <span>💼</span>
                    <span>Manpower Services</span>
                  </span>
                  <div className="flex items-center gap-1.5">
                    {!isEnabled('manpower') && <span className="text-xs font-extrabold uppercase tracking-wider text-amber-800 bg-amber-100 px-2 py-0.5 rounded-full">Soon</span>}
                    {portalTab === 'jobs' && <span className="w-2 h-2 rounded-full bg-brand-gold"></span>}
                  </div>
                </button>
              </div>

              {/* Navigation Section 3: Records & Vault */}
              <div className="space-y-1.5">
                <span className="text-xs font-black uppercase tracking-wider text-slate-400 px-3 block">
                  Records &amp; Vault
                </span>
                <button
                  type="button"
                  onClick={() => navigateTab('vault')}
                  className={`w-full text-left px-3.5 py-2.5 rounded-xl text-sm font-bold transition flex items-center justify-between cursor-pointer ${
                    portalTab === 'vault'
                      ? 'bg-brand-navy text-white shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <span>🔒</span>
                    <span>Document Vault</span>
                  </span>
                  {portalTab === 'vault' && <span className="w-2 h-2 rounded-full bg-brand-gold"></span>}
                </button>
                <button
                  type="button"
                  onClick={() => navigateTab('journey')}
                  className={`w-full text-left px-3.5 py-2.5 rounded-xl text-sm font-bold transition flex items-center justify-between cursor-pointer ${
                    portalTab === 'journey'
                      ? 'bg-brand-navy text-white shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <span>🗺️</span>
                    <span>Journey Overview</span>
                  </span>
                  {portalTab === 'journey' && <span className="w-2 h-2 rounded-full bg-brand-gold"></span>}
                </button>
              </div>

              {/* Navigation Section 4: Security — Gold Standard (OWASP ASVS L2 / NIST AAL2) */}
              <div className="space-y-1.5">
                <span className="text-xs font-black uppercase tracking-wider text-slate-400 px-3 block">
                  Security &amp; Privacy
                </span>
                <button
                  type="button"
                  onClick={() => navigateTab('security')}
                  className={`w-full text-left px-3.5 py-2.5 rounded-xl text-sm font-bold transition flex items-center justify-between cursor-pointer ${
                    portalTab === 'security'
                      ? 'bg-brand-navy text-white shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <span>🛡️</span>
                    <span>Security Center</span>
                  </span>
                  <div className="flex items-center gap-1.5">
                    {me?.twoFactorEnabled ? <span className="h-2 w-2 rounded-full bg-emerald-500"></span> : <span className="h-2 w-2 rounded-full bg-amber-500"></span>}
                    {portalTab === 'security' && <span className="w-2 h-2 rounded-full bg-brand-gold"></span>}
                  </div>
                </button>
                <p className="text-[11px] text-slate-400 px-3 leading-relaxed">2FA, sessions, password &amp; audit — same as superadmin (AAL2).</p>
              </div>

              {/* Navigation Section 5: Helpdesk & Support */}
              <div className="space-y-1.5">
                <span className="text-xs font-black uppercase tracking-wider text-slate-400 px-3 block">
                  Support &amp; Helpdesk
                </span>
                <button
                  type="button"
                  onClick={() => navigateTab('helpdesk')}
                  className={`w-full text-left px-3.5 py-2.5 rounded-xl text-sm font-bold transition flex items-center justify-between cursor-pointer ${
                    portalTab === 'helpdesk'
                      ? 'bg-brand-navy text-white shadow-xs'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`}
                >
                  <span className="flex items-center gap-2.5">
                    <span>🎧</span>
                    <span>Helpdesk Tickets</span>
                  </span>
                  <div className="flex items-center gap-1.5">
                    <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full">Live</span>
                    {portalTab === 'helpdesk' && <span className="w-2 h-2 rounded-full bg-brand-gold"></span>}
                  </div>
                </button>
              </div>
            </div>
          </aside>

          {/* MAIN CONTENT AREA — pb for fixed bottom nav thumb-zone */}
          <main className="flex-1 p-6 md:p-8 pb-[88px] md:pb-8 space-y-8 overflow-y-auto">
            {/* Mobile Horizontal Navigation Strip */}
            <div className="md:hidden flex items-center gap-2 overflow-x-auto pb-2.5 border-b border-slate-200">
              <button
                type="button"
                onClick={() => navigateTab('dashboard')}
                className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold shrink-0 cursor-pointer ${
                  portalTab === 'dashboard' ? 'bg-brand-navy text-white' : 'bg-white border border-slate-200 text-slate-700'
                }`}
              >
                📊 Dashboard
              </button>
              <button
                type="button"
                onClick={() => navigateTab('study')}
                className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold shrink-0 cursor-pointer flex items-center gap-1.5 ${
                  portalTab === 'study' ? 'bg-brand-navy text-white' : 'bg-white border border-slate-200 text-slate-700'
                }`}
              >
                <span>🎓 Study</span>
                {!isEnabled('study-abroad') && <span className="text-xs bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full">Soon</span>}
              </button>
              <button
                type="button"
                onClick={() => navigateTab('visa')}
                className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold shrink-0 cursor-pointer flex items-center gap-1.5 ${
                  portalTab === 'visa' ? 'bg-brand-navy text-white' : 'bg-white border border-slate-200 text-slate-700'
                }`}
              >
                <span>🛂 Visa</span>
                {!isEnabled('visa') && <span className="text-xs bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full">Soon</span>}
              </button>
              <button
                type="button"
                onClick={() => navigateTab('umrah')}
                className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold shrink-0 cursor-pointer flex items-center gap-1.5 ${
                  portalTab === 'umrah' ? 'bg-brand-navy text-white' : 'bg-white border border-slate-200 text-slate-700'
                }`}
              >
                <span>🧳 Tours &amp; Travels</span>
                {!isEnabled('umrah') && <span className="text-xs bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full">Soon</span>}
              </button>
              <button
                type="button"
                onClick={() => navigateTab('attestation')}
                className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold shrink-0 cursor-pointer flex items-center gap-1.5 ${
                  portalTab === 'attestation' ? 'bg-brand-navy text-white' : 'bg-white border border-slate-200 text-slate-700'
                }`}
              >
                <span>📑 Attest</span>
                {!isEnabled('attestation') && <span className="text-xs bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full">Soon</span>}
              </button>
              <button
                type="button"
                onClick={() => navigateTab('jobs')}
                className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold shrink-0 cursor-pointer flex items-center gap-1.5 ${
                  portalTab === 'jobs' ? 'bg-brand-navy text-white' : 'bg-white border border-slate-200 text-slate-700'
                }`}
              >
                <span>💼 Manpower</span>
                {!isEnabled('manpower') && <span className="text-xs bg-amber-100 text-amber-800 px-1.5 py-0.5 rounded-full">Soon</span>}
              </button>
              <button
                type="button"
                onClick={() => navigateTab('vault')}
                className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold shrink-0 cursor-pointer flex items-center gap-1.5 ${
                  portalTab === 'vault' ? 'bg-brand-navy text-white' : 'bg-white border border-slate-200 text-slate-700'
                }`}
              >
                <span>🔒 Vault</span>
              </button>
              <button
                type="button"
                onClick={() => navigateTab('journey')}
                className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold shrink-0 cursor-pointer ${
                  portalTab === 'journey' ? 'bg-brand-navy text-white' : 'bg-white border border-slate-200 text-slate-700'
                }`}
              >
                🗺️ Journey
              </button>
              <button
                type="button"
                onClick={() => navigateTab('security')}
                className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold shrink-0 cursor-pointer flex items-center gap-1 ${
                  portalTab === 'security' ? 'bg-brand-navy text-white' : 'bg-white border border-slate-200 text-slate-700'
                }`}
              >
                <span>🛡️ Security</span>
                {me?.twoFactorEnabled ? <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span> : <span className="h-1.5 w-1.5 rounded-full bg-amber-500"></span>}
              </button>
              <button
                type="button"
                onClick={() => navigateTab('helpdesk')}
                className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold shrink-0 cursor-pointer flex items-center gap-1.5 ${
                  portalTab === 'helpdesk' ? 'bg-brand-navy text-white' : 'bg-white border border-slate-200 text-slate-700'
                }`}
              >
                <span>🎧 Helpdesk</span>
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
              </button>
            </div>

            {/* TAB 1: CLIENT DASHBOARD & LIVE KANBAN HUB */}
            {portalTab === 'dashboard' && (
              <ClientDashboardHub
                portalToken={activeToken || sessionData?.journeys?.[0]?.client?.portalToken || ''}
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
                onNavigateTab={navigateTab}
              />
            )}

            {/* TAB 2: STUDY ABROAD */}
            {portalTab === 'study' && (
              <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs">
                <StudyAbroadClientSection token={sessionData?.journeys?.[0]?.client?.portalToken || sessionData?.journeys?.[0]?.client?.id || activeToken || me?.id || 'client-self'} />
              </div>
            )}

            {/* TAB 3: VISA PROCESSING — C5 Anxiety-Grade Tracker (VP0) */}
            {portalTab === 'visa' && (
              <div className="space-y-4">
                {visaAppsData && visaAppsData.length > 0 && (
                  <VisaTracker bookingId={visaAppsData[0]?.id || visaAppsData[0]?.engagementId || ''} token={activeToken || ''} />
                )}
                <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs">
                  <Suspense fallback={<div className="p-6 text-xs text-slate-400 animate-pulse" aria-busy="true" aria-label="Loading visa desk">Loading visa desk…</div>}>
                    <ClientVisaSection token={sessionData?.journeys?.[0]?.client?.portalToken || sessionData?.journeys?.[0]?.client?.id || activeToken || me?.id || 'client-self'} clientId={sessionData?.journeys?.[0]?.client?.id || me?.id || activeToken} />
                  </Suspense>
                </div>
              </div>
            )}

            {/* TAB 4: UMRAH PILGRIMAGE */}
            {portalTab === 'umrah' && (
              <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs">
                <UmrahClientSection token={sessionData?.journeys?.[0]?.client?.portalToken || sessionData?.journeys?.[0]?.client?.id || activeToken || me?.id || 'client-self'} />
              </div>
            )}

            {/* TAB 5: DOCUMENT ATTESTATION */}
            {portalTab === 'attestation' && (
              <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs">
                <AttestationClientSection token={sessionData?.journeys?.[0]?.client?.portalToken || sessionData?.journeys?.[0]?.client?.id || activeToken || me?.id || 'client-self'} />
              </div>
            )}

            {/* TAB 6: GLOBAL JOBS & MANPOWER — P0 paywall: ₹100 candidate-pass gates browse + apply */}
            {portalTab === 'jobs' && (
              mpMembershipLoading ? (
                <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-3 animate-pulse" aria-busy="true" aria-label="Checking jobs access">
                  <div className="h-5 w-56 rounded bg-slate-100" />
                  <div className="h-3 w-full rounded bg-slate-100" />
                  <div className="h-3 w-2/3 rounded bg-slate-100" />
                  <div className="h-36 w-full rounded-xl bg-slate-100" />
                </div>
              ) : mpMembershipData?.membership && !mpIsMember ? (
                <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-5">
                  <div className="border-b border-slate-100 pb-3">
                    <span className="text-[11px] font-extrabold uppercase tracking-widest text-brand-gold">Manpower · Overseas Jobs</span>
                    <h3 className="font-display font-black text-lg text-brand-navy mt-1">Unlock Overseas Jobs — One-Time ₹100 Verification Pass</h3>
                    <p className="text-xs text-slate-500 mt-1.5">Verified candidates only — one small pass keeps spam out and makes sure recruiters read every application.</p>
                  </div>
                  <div className="grid sm:grid-cols-3 gap-3">
                    <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                      <span className="text-emerald-600 font-bold">✓</span>
                      <div className="text-xs text-slate-700"><b>Unlimited applications</b><br /><span className="text-slate-500">Apply to every live opening, forever.</span></div>
                    </div>
                    <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                      <span className="text-emerald-600 font-bold">✓</span>
                      <div className="text-xs text-slate-700"><b>Anti-spam verification</b><br /><span className="text-slate-500">Your profile stands out to real recruiters.</span></div>
                    </div>
                    <div className="flex items-start gap-2.5 p-3.5 rounded-xl bg-slate-50 border border-slate-100">
                      <span className="text-emerald-600 font-bold">✓</span>
                      <div className="text-xs text-slate-700"><b>Lifetime access</b><br /><span className="text-slate-500">Pay once — never again.</span></div>
                    </div>
                  </div>
                  <ManpowerAccessGate
                    isModal={false}
                    clientToken={mpPortalToken}
                    clientName={sessionData?.journeys?.[0]?.client?.name}
                    clientEmail={sessionData?.journeys?.[0]?.client?.email}
                    clientPhone={sessionData?.journeys?.[0]?.client?.phone}
                    onSuccess={() => {
                      refetchMpMembership();
                      queryClient.invalidateQueries({ queryKey: ['manpowerMarketplace'] });
                      queryClient.invalidateQueries({ queryKey: ['portalJobAppsHub'] });
                      queryClient.invalidateQueries({ queryKey: ['portalManpowerApps'] });
                    }}
                  />
                </div>
              ) : (
                <ManpowerMarketplace token={mpPortalToken} clientId={sessionData?.journeys?.[0]?.client?.id || me?.id || activeToken} />
              )
            )}

            {/* TAB 7: SECURE DOCUMENT VAULT (30-day lifecycle retention & 50MB quota) */}
            {portalTab === 'vault' && (
              <ClientDocumentVault
                token={sessionData?.journeys?.[0]?.client?.portalToken || sessionData?.journeys?.[0]?.client?.id || activeToken || me?.id || 'client-self'}
              />
            )}

            {/* TAB 8: SECURITY CENTER — Gold Standard (OWASP ASVS L2 / NIST AAL2) — Same as superadmin */}
            {portalTab === 'security' && (
              <div className="space-y-6">
                <div className="rounded-2xl border border-brand-navy/10 bg-gradient-to-br from-brand-navy-900 via-brand-navy to-brand-navy-800 p-6 text-white shadow-xl">
                  <div className="flex items-center gap-2">
                    <span className="text-brand-gold text-lg">🛡️</span>
                    <h3 className="font-display text-lg font-black text-white">Security Center — Gold Standard</h3>
                    <span className="ml-auto rounded-full bg-emerald-500/20 border border-emerald-400/40 px-3 py-1 text-xs font-black uppercase tracking-wider text-emerald-300">AAL2 / L2</span>
                  </div>
                  <p className="text-xs text-white/60 mt-1">Same protections as superadmin: TOTP 2FA (RFC 6238), backup codes, sessions, password, audit. OWASP ASVS 3.2/3.3 + NIST 800-63B.</p>
                  <div className="mt-3 flex flex-wrap gap-2 text-xs">
                    <span className="rounded-full bg-white/10 px-2.5 py-1 border border-white/15">PBKDF2 100k + HIBP</span>
                    <span className="rounded-full bg-white/10 px-2.5 py-1 border border-white/15">__Host- Secure HttpOnly SameSite=Lax</span>
                    <span className="rounded-full bg-white/10 px-2.5 py-1 border border-white/15">30d / 12h / 30m timeouts</span>
                  </div>
                </div>
                <TwoFactorSetup />
                <div className="grid md:grid-cols-2 gap-4">
                  <a href="/settings" className="rounded-2xl border border-brand-navy/10 bg-white p-5 hover:border-brand-gold/30 transition shadow-sm block">
                    <h4 className="font-display text-sm font-bold text-brand-navy">Change Password & Sessions</h4>
                    <p className="text-xs text-slate-500 mt-1">Full Settings → Security & Sessions: HIBP-checked password change + view/revoke all devices (ASVS 3.3.3/3.3.4). Also available here via same APIs.</p>
                    <span className="mt-3 inline-flex rounded-full bg-brand-navy px-3 py-1.5 text-xs font-bold uppercase tracking-wider text-white">Go to Settings →</span>
                  </a>
                  <div className="rounded-2xl border border-emerald-500/20 bg-emerald-50/50 p-5">
                    <h4 className="font-display text-sm font-bold text-emerald-900">Client = Superadmin Parity</h4>
                    <p className="text-xs text-emerald-800/80 mt-1">Every endpoint here checks <code className="bg-white px-1 rounded">validateSessionToken</code> (not role). Clients can enable 2FA, change password, list/revoke sessions, and get login alerts — identical to superadmin, scoped to own <code>clientId</code>.</p>
                    <p className="text-xs text-emerald-700 mt-2 font-semibold">No division scoping, no staff privilege — just your own account.</p>
                  </div>
                </div>
              </div>
            )}

            {/* TAB 9: JOURNEY OVERVIEW */}
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
                <div className="grid lg:grid-cols-2 gap-4">
                  <PortalMessages token={activeToken || ''} />
                  <PortalCalendar token={activeToken || ''} />
                </div>
              </div>
            )}

            {/* TAB 10: HELPDESK & RESOLUTION CENTER */}
            {portalTab === 'helpdesk' && (
              <ClientHelpdeskSection
                token={sessionData?.journeys?.[0]?.client?.portalToken || sessionData?.journeys?.[0]?.client?.id || activeToken || me?.id || 'client-self'}
                clientId={sessionData?.journeys?.[0]?.client?.id || me?.id || activeToken || 'client'}
              />
            )}
          </main>
        </div>
      ) : (
        <main className="max-w-6xl w-full mx-auto p-6 md:p-8 flex-1 flex flex-col gap-8">
          <section className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm flex flex-col lg:flex-row items-center justify-between gap-8">
            <div className="max-w-xl space-y-3">
              <span className="text-[13px] bg-brand-gold/15 text-brand-navy font-bold px-3 py-1 rounded-full uppercase tracking-wider">
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

      {/* FOOTER — Nizamabad HQ, real Footer.svg logo */}
      <footer className="bg-brand-navy border-t border-brand-navyLight py-8 mt-12 shrink-0">
        <div className="max-w-7xl mx-auto px-6 md:px-8">
          <div className="flex flex-col lg:flex-row justify-between gap-6">
            <div className="space-y-3 max-w-md">
              <div className="flex items-center gap-3">
                <img src="/Footer.svg" alt="Opus Overseas" className="h-10 w-auto" />
                <span className="text-[13px] px-2 py-0.5 rounded-full bg-white/10 border border-white/10 text-white/60">British Council Certified Agent #115050</span>
              </div>
              <p className="text-xs leading-relaxed text-brand-cream/60">
                Transparent guidance for study abroad, visas, attestation, Umrah, and manpower services. No inflated numbers — real updates appear here when you begin. Your data stays private.
              </p>
              <div className="text-sm leading-relaxed text-brand-cream/60">
                <div className="font-bold text-white/80">Opus Overseas — Nizamabad, Telangana</div>
                <div>Nizamabad — Telangana, India</div>
                <div className="mt-1"><a href="tel:+919398848376" className="hover:text-brand-gold">+91 93988 48376</a> · <a href="mailto:contact@opusoverseas.com" className="hover:text-brand-gold">contact@opusoverseas.com</a></div>
                <div className="text-sm text-brand-cream/40 mt-1">Mon–Sat 9:30 AM – 6:30 PM • Support via chatbot bubble</div>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-8 text-xs">
              <div className="space-y-2">
                <p className="font-bold text-white/80 uppercase tracking-wider text-sm">Explore</p>
                <a href="/" className="block text-brand-cream/60 hover:text-brand-gold transition">Home</a>
                <a href="/about" className="block text-brand-cream/60 hover:text-brand-gold transition">About</a>
                <a href="/contact" className="block text-brand-cream/60 hover:text-brand-gold transition">Contact</a>
                <a href="/lead-form" className="block text-brand-cream/60 hover:text-brand-gold transition">Get in touch</a>
              </div>
              <div className="space-y-2">
                <p className="font-bold text-white/80 uppercase tracking-wider text-sm">Legal</p>
                <a href="/privacy" className="block text-brand-cream/60 hover:text-brand-gold transition">Privacy Policy</a>
                <a href="/terms" className="block text-brand-cream/60 hover:text-brand-gold transition">Terms of Service</a>
                <a href="/refund-policy" className="block text-brand-cream/60 hover:text-brand-gold transition">Refund Policy</a>
                <a href="/shipping-policy" className="block text-brand-cream/60 hover:text-brand-gold transition">Shipping Policy</a>
              </div>
            </div>
          </div>
          <div className="mt-6 pt-6 border-t border-white/10 flex flex-col md:flex-row justify-between items-center gap-3 text-xs text-brand-cream/40">
            <span>© 2026 Opus Overseas (Telangana, India). All rights reserved. — Honest from day one, no fake badges.</span>
            <span className="text-sm text-brand-cream/30">Built transparently • Updates live when available</span>
          </div>
        </div>
      </footer>
      {/* Mobile Bottom Nav — thumb zone, fixed, 44px min targets */}
      <ClientMobileNav active={portalTab} onChange={(t) => navigateTab(t)} />
      <ChatWidget
        user={{
          id: me?.id || sessionData?.journeys?.[0]?.client?.id || activeToken,
          name: me?.name || sessionData?.journeys?.[0]?.client?.name || authEmail || 'Client',
          email: me?.email || authEmail || sessionData?.journeys?.[0]?.client?.email,
          phone: sessionData?.journeys?.[0]?.client?.phone,
          division: sessionData?.journeys?.[0]?.engagements?.[0]?.division || 'general',
          stageKey: sessionData?.journeys?.[0]?.engagements?.[0]?.stageKey || 'documents',
          counselorName: sessionData?.journeys?.[0]?.assignedCounselor?.name,
        }}
      />

      {/* ENTERPRISE COMMAND PALETTE & MODALS */}
      <ClientCommandPalette
        open={commandPaletteOpen}
        onClose={() => setCommandPaletteOpen(false)}
        onNavigateTab={(tab) => navigateTab(tab)}
        onOpenUpload={() => navigateTab('vault')}
        onOpenFeedback={() => setFeedbackModalOpen(true)}
        counselorName={sessionData?.journeys?.[0]?.assignedCounselor?.name}
      />

      <ClientFeedbackModal
        open={feedbackModalOpen}
        onClose={() => setFeedbackModalOpen(false)}
        portalToken={activeToken || sessionData?.journeys?.[0]?.client?.portalToken}
        clientName={me?.name || authEmail || 'Valued Client'}
        division={sessionData?.journeys?.[0]?.engagements?.[0]?.division || 'general'}
        counselorName={sessionData?.journeys?.[0]?.assignedCounselor?.name}
      />

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

