import { useVisibilityTracking } from '../lib/visibilityTracking';
import React, { useState, useEffect } from 'react';
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
                  <VisaServices token={sessionData?.journeys?.[0]?.client?.portalToken || sessionData?.journeys?.[0]?.client?.id || activeToken || me?.id || 'client-self'} />
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
                <ManpowerMarketplace token={mpPortalToken} />
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

const VISA_INPUT = 'w-full text-sm sm:text-base px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-800 placeholder:text-slate-400 focus:border-brand-gold focus:ring-1 focus:ring-brand-gold/30 outline-none transition font-medium shadow-xs';
const VISA_LABEL = 'text-xs font-bold uppercase tracking-wider text-slate-600';
const VISA_HEADING = 'text-xs font-extrabold uppercase tracking-widest text-brand-gold';
const VISA_BTN = 'bg-brand-navy hover:bg-brand-gold hover:text-brand-navy text-white font-bold transition shadow-xs text-xs sm:text-sm';

const visaBlockedEdit = (s: string) => ['granted', 'rejected', 'delivered', 'cancelled'].includes(s);

const visaChip = (s: string) =>
  ['granted', 'delivered'].includes(s)
    ? 'px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200'
    : ['rejected', 'cancelled'].includes(s)
      ? 'px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200'
      : 'px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-blue-50 text-blue-700 border border-blue-200';

const docBadge = (s: string) =>
  s === 'verified'
    ? 'px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-emerald-50 text-emerald-700 border border-emerald-200'
    : s === 'rejected'
      ? 'px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-rose-50 text-rose-700 border border-rose-200'
      : 'px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider bg-amber-50 text-amber-700 border border-amber-200';

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
        className={`${VISA_INPUT} cursor-pointer ${props.className || ''}`}
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
      <div className="flex flex-wrap gap-1.5 rounded-xl bg-slate-100 p-1 w-fit border border-slate-200/80">
        {props.options.map((o) => (
          <button
            key={o.value}
            type="button"
            onClick={() => props.onChange(o.value)}
            className={`px-3 py-1.5 rounded-lg text-[13px] font-bold uppercase tracking-wider transition cursor-pointer ${
              props.value === o.value ? 'bg-brand-navy text-white shadow-xs' : 'text-slate-600 hover:text-brand-navy hover:bg-white/60'
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
      <div className="flex gap-1.5 rounded-xl bg-slate-100 p-1 w-fit border border-slate-200/80">
        <button
          type="button"
          onClick={() => props.onChange(true)}
          className={`px-3 py-1.5 rounded-lg text-[13px] font-bold uppercase tracking-wider transition cursor-pointer ${
            on ? 'bg-brand-navy text-white shadow-xs' : 'text-slate-600 hover:text-brand-navy hover:bg-white/60'
          }`}
        >
          Yes
        </button>
        <button
          type="button"
          onClick={() => props.onChange(false)}
          className={`px-3 py-1.5 rounded-lg text-[13px] font-bold uppercase tracking-wider transition cursor-pointer ${
            !on ? 'bg-brand-navy text-white shadow-xs' : 'text-slate-600 hover:text-brand-navy hover:bg-white/60'
          }`}
        >
          No
        </button>
      </div>
    </VField>
  );
}

function VisaServices({ token }: { token: string }) {
  const VISA_PAUSED = true; // subtle paused — pricing will be available soon, applications via waitlist only
  const [tab, setTab] = useState<'catalogue' | 'wizard' | 'tracker'>('catalogue');
  const [activeAppId, setActiveAppId] = useState<string | null>(null);
  const [country, setCountry] = useState('');
  const [selectedVisaByCountry, setSelectedVisaByCountry] = useState<Record<string, string>>({});
  const [inquiryCountry, setInquiryCountry] = useState('');
  const [inquiryType, setInquiryType] = useState('');
  const [inquiryNotes, setInquiryNotes] = useState('');
const [inquiryBusy, setInquiryBusy] = useState(false);
  const [inquirySent, setInquirySent] = useState(false);
  const [inquiryError, setInquiryError] = useState('');

  const submitInquiry = async () => {
    setInquiryBusy(true); setInquiryError('');
    try {
      const r = await fetch(`${API}/api/public/portal/visa/inquiry`, {
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
      const r = await fetch(`${API}/api/public/portal/visa/products`);
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
      const r = await fetch(`${API}/api/public/portal/visa/applications`, { headers: { 'X-Portal-Token': token } });
      if (r.status === 404) return [];
      if (!r.ok) throw new Error(await r.text() || 'Failed to load your applications.');
      const d = await r.json();
      return d.applications || [];
    },
    enabled: !!token,
    retry: false,
  });

  const products: VisaProduct[] = productsQ.data || [];
  const applications: VisaApplicationRow[] = appsQ.data || [];
  const countries: string[] = Array.from(new Set(products.map((p: VisaProduct) => p.country))).sort();
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
      const r = await fetch(`${API}/api/public/portal/visa/applications/${activeApp.id}`, {
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
      const r = await fetch(`${API}/api/public/portal/visa/applications`, {
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
      const pRes = await fetch(`${API}/api/public/portal/documents/presigned?token=${encodeURIComponent(token)}&filename=${encodeURIComponent(fileName)}`, { headers: { 'X-Portal-Token': token } });
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
      const r = await fetch(`${API}/api/public/portal/visa/applications/${activeApp.id}/submit`, {
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
  void draftByProduct; void startApp;

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
            <span className="text-[13px] font-bold text-brand-gold uppercase tracking-widest block">Visa Catalogue</span>
            <h3 className="font-display font-extrabold text-base text-brand-navy mt-1">Choose your destination</h3>
          </div>
          <div className="w-full md:w-72">
            <select
              value={country}
              onChange={(e) => setCountry(e.target.value)}
              className="w-full p-2.5 text-xs bg-white border border-slate-200 rounded-xl text-slate-800 font-medium outline-none focus:border-brand-gold shadow-xs cursor-pointer"
            >
              <option value="">All Countries ({countries.length} Available)</option>
              {countries.map((c: string) => (
                <option key={c} value={c}>{c}</option>
              ))}
              <option value="__other__">Other country…</option>
            </select>
          </div>
        </div>
        <p className="text-xs text-slate-500">Standard processing fees apply per product. Start an application to open the guided draft wizard — your progress is saved at every step.</p>
      </div>

      {wizardErr && (
        <div className="p-4 bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl text-xs flex items-center justify-between shadow-xs">
          <div className="flex items-center gap-2">
            <span className="font-bold">⚠</span>
            <span>{wizardErr}</span>
          </div>
          <button onClick={() => setWizardErr('')} className="text-rose-500 hover:text-rose-800 font-bold px-2 py-1 cursor-pointer">✕</button>
        </div>
      )}

      {productsQ.isLoading && (
        <div className="py-12 flex flex-col items-center gap-3">
          <div className="w-8 h-8 border-3 border-brand-gold border-t-transparent rounded-full animate-spin"></div>
          <p className="text-xs text-slate-500 font-medium">Loading visa catalogue...</p>
        </div>
      )}

      {productsQ.isError && (
        <div className="p-5 bg-rose-50 border border-rose-200 text-rose-700 rounded-2xl text-xs">
          <p className="font-bold">Catalogue unavailable</p>
          <p className="text-sm mt-0.5 opacity-80">{(productsQ.error as Error)?.message}</p>
          <button onClick={() => productsQ.refetch()} className="mt-3 text-[13px] font-bold uppercase tracking-wider bg-white border border-rose-300 text-rose-700 px-3 py-1.5 rounded-lg cursor-pointer">
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
          <span className="text-[13px] font-bold text-brand-gold uppercase tracking-widest block">Your Applications</span>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {applications.map((a: VisaApplicationRow) => (
              <button
                key={a.id}
                onClick={() => openApp(a)}
                className="text-left bg-white border border-slate-200 hover:border-brand-gold rounded-2xl p-4 transition cursor-pointer shadow-xs hover:shadow-sm"
              >
                <div className="flex justify-between items-center gap-2">
                  <span className="font-bold text-brand-navy text-xs">{a.country} — {a.visaType}</span>
                  <span className="text-xs font-extrabold uppercase px-2 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                    {a.status.replace('_', ' ')}
                  </span>
                </div>
                <p className="text-[13px] text-slate-500 mt-1.5">
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
            <span className="text-[13px] font-bold text-brand-gold uppercase tracking-widest block">Country not listed?</span>
            <h3 className="font-display font-bold text-sm text-brand-navy mt-1">Request a custom visa</h3>
            <p className="text-xs text-slate-500 mt-1">Tell us the country you need a visa for — our desk will get back to you with options and pricing.</p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-[13px] uppercase tracking-wider text-slate-500 font-bold mb-1.5">Country you need *</label>
              <input value={inquiryCountry} onChange={(e) => setInquiryCountry(e.target.value)} placeholder="e.g. United Kingdom" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-brand-gold focus:outline-none" />
            </div>
            <div>
              <label className="block text-[13px] uppercase tracking-wider text-slate-500 font-bold mb-1.5">Visa type (if known)</label>
              <input value={inquiryType} onChange={(e) => setInquiryType(e.target.value)} placeholder="e.g. Tourist / Work / Student" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs text-slate-800 placeholder:text-slate-400 focus:border-brand-gold focus:outline-none" />
            </div>
            <div className="md:col-span-2">
              <label className="block text-[13px] uppercase tracking-wider text-slate-500 font-bold mb-1.5">Anything else we should know?</label>
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

      {/* ——— Subtle Guided Path — applications paused, pricing will be available soon ——— */}
      <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-4 flex items-start gap-3">
        <span className="text-lg">⏸️</span>
        <div className="flex-1">
          <p className="text-xs font-bold text-amber-900">Applications paused — pricing will be available soon</p>
          <p className="text-sm text-amber-800/80 mt-0.5">We’re refining our visa processing flow for a calmer, step-by-step experience. Save your interest below — we’ll notify you the moment we go live. No fees are charged while paused.</p>
        </div>
        <span className="text-[13px] font-bold uppercase tracking-wider bg-white border border-amber-200 text-amber-800 px-2.5 py-1 rounded-full shrink-0">Will be available soon</span>
      </div>

      {!productsQ.isLoading && products.length > 0 && country !== '__other__' && (() => {
        const filtered = products.filter((p: VisaProduct) => !country || p.country === country);
        if (filtered.length === 0) return <p className="text-xs text-slate-500 text-center py-6">No visa options for this country yet — try "Other country…" below.</p>;
        // Subtle single-selector: pick one country (from top filter) → one visa type → checklist → waitlist
        const list = country && country !== '' ? filtered : filtered.slice(0, 12); void list;
        // If a country filter is set, show its options in a single subtle card; otherwise show the first country's card as preview
        const singleCountry = country && country !== '' ? country : filtered[0]?.country;
        const countryList = filtered.filter(p => p.country === singleCountry);
        const selectedId = selectedVisaByCountry[singleCountry] || countryList[0]?.id;
        const selected = countryList.find(x => x.id === selectedId) || countryList[0];
        if (!selected) return null;
        return (
          <div className="bg-white border border-slate-200 rounded-2xl p-6 shadow-sm space-y-5">
            <div className="flex items-center justify-between flex-wrap gap-2">
              <div>
                <span className="text-[13px] font-bold text-brand-gold uppercase tracking-widest">Your next step</span>
                <h4 className="font-display font-bold text-brand-navy text-sm mt-1">1. Choose destination → 2. See checklist → 3. Join waitlist</h4>
              </div>
              <span className="text-[13px] px-2 py-1 rounded-full bg-slate-100 border border-slate-200 text-slate-600 font-bold">{selected.entryType} · {singleCountry}</span>
            </div>

            {countryList.length > 1 && (
              <div>
                <label className="text-[13px] font-bold text-slate-500 uppercase tracking-wider block mb-1.5">Visa type for {singleCountry}</label>
                <select
                  value={selected.id}
                  onChange={(e) => setSelectedVisaByCountry((m) => ({ ...m, [singleCountry]: e.target.value }))}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-semibold text-slate-700 focus:border-brand-gold focus:outline-none cursor-pointer"
                >
                  {countryList.map((opt) => (
                    <option key={opt.id} value={opt.id}>{opt.visaType} • {opt.processingTime} • Will be available soon</option>
                  ))}
                </select>
              </div>
            )}
            {countryList.length === 1 && (
              <div className="text-xs font-bold text-brand-navy bg-slate-50 rounded-xl px-3 py-2.5 border border-slate-100">{selected.visaType} · {selected.entryType}</div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-xl bg-slate-50 border border-slate-100 p-3">
                <span className="text-[13px] font-bold text-slate-400 uppercase tracking-wider block">Required documents — prepare early</span>
                <ul className="mt-2 space-y-1.5 text-xs text-slate-600">
                  {(selected.requiredDocs || ['Passport scan', 'Color photograph', 'Supporting docs per checklist']).map((doc: string) => (
                    <li key={doc} className="flex gap-2"><span className="text-slate-300">—</span><span>{doc}</span></li>
                  ))}
                </ul>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between text-xs py-2.5 px-3 bg-slate-50 rounded-xl border border-slate-100">
                  <span className="text-slate-500">⏱ Processing</span>
                  <strong className="text-slate-700">{selected.processingTime}</strong>
                </div>
                <div className="rounded-xl bg-slate-50 border border-slate-100 px-3 py-3 flex items-center justify-between">
                  <span className="text-xs text-slate-500">Fee</span>
                  <span className="text-xs font-bold text-slate-400 blur-[3px] select-none">₹••••</span>
                  <span className="text-[13px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-200 px-2 py-1 rounded-full">Will be available soon</span>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={async () => {
                  setInquiryBusy(true);
                  try {
                    const r = await fetch(`${API}/api/public/portal/visa/inquiry`, {
                      method: 'POST', headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ clientId: token, country: selected.country, visaType: selected.visaType, notes: 'Waitlist — applications paused, notify when live', agreedToTerms: true }),
                    });
                    const j = await r.json().catch(() => ({}));
                    if (!r.ok) throw new Error(j.error || 'Waitlist failed');
                    setNotice(`✓ You’re on the waitlist for ${selected.country} — ${selected.visaType}. We’ll notify you when applications reopen.`);
                    window.scrollTo({ top: 0, behavior: 'smooth' });
                  } catch (e: any) { setWizardErr(e.message); } finally { setInquiryBusy(false); }
                }}
                disabled={inquiryBusy}
                className="flex-1 py-3 rounded-xl bg-brand-navy text-white text-xs font-black uppercase tracking-wider hover:bg-brand-gold hover:text-brand-navy transition shadow-xs disabled:opacity-50 cursor-pointer"
              >
                {inquiryBusy ? 'Joining…' : '✓ Join Waitlist — Notify Me When Live'}
              </button>
              <button onClick={() => setCountry('__other__')} className="px-4 py-3 rounded-xl border border-slate-200 bg-white text-xs font-bold text-slate-600 hover:border-brand-gold cursor-pointer">Need another country? →</button>
            </div>
            <p className="text-sm text-slate-500 text-center">No payment is taken while paused. Your checklist is saved to your portal — we’ll pre-fill it when we go live.</p>
          </div>
        );
      })()}
    </div>
  );

  /* ---------------- Wizard ---------------- */
  const renderWizard = () => {
    if (!activeApp) {
      return (
        <div className="text-center border-2 border-dashed border-slate-200 rounded-2xl p-10 bg-slate-50">
          <h3 className="font-display font-bold text-sm text-brand-navy">No active draft</h3>
          <p className="text-xs text-slate-500 mt-1">Start an application from the catalogue to open the wizard.</p>
          <button onClick={() => setTab('catalogue')} className={`${VISA_BTN} mt-4 px-4 py-2 rounded-xl text-xs uppercase tracking-wider cursor-pointer`}>Back to Catalogue</button>
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
      <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-6 flex flex-col gap-5 shadow-xs">
        {VISA_PAUSED && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 flex items-center gap-2 text-sm text-amber-800">
            <span>⏸️</span><span className="font-bold">Applications paused — will be available soon.</span><span className="text-amber-700">You can still fill and save your draft; submit will reopen and auto-notify waitlist.</span>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
          <div>
            <span className={VISA_HEADING + ' block'}>Draft Application {VISA_PAUSED && <span className="ml-2 text-[13px] px-2 py-0.5 rounded-full bg-amber-100 border border-amber-200 text-amber-800">Paused</span>}</span>
            <h3 className="font-display font-bold text-base text-brand-navy mt-1">{activeApp.country} — {activeApp.visaType}</h3>
          </div>
          <button onClick={() => setTab('catalogue')} className="text-xs text-slate-500 hover:text-brand-navy font-bold uppercase tracking-wider cursor-pointer">✕ Exit Draft</button>
        </div>

        <div className="flex gap-1.5 overflow-x-auto pb-1">
          {VISA_STEPS.map((s, i) => (
            <button
              key={s.key}
              onClick={() => { if (i <= step) setStep(i); }}
              className={`px-3 py-1.5 rounded-full text-xs font-extrabold uppercase tracking-wider whitespace-nowrap transition cursor-pointer ${
                i === step ? 'bg-brand-navy text-white shadow-xs'
                : i < step ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                : 'bg-white border border-slate-200 text-slate-400'
              }`}
            >
              {i + 1}. {s.label}
            </button>
          ))}
        </div>
        <div className="h-1.5 rounded-full bg-slate-200 overflow-hidden">
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
              <VInput label="Passport Number *" value={passport.number} onChange={(v) => patch('passport', { number: v.toUpperCase() })} placeholder="e.g. Z1234567" />
              <VInput label="Place of Issue *" value={passport.placeOfIssue} onChange={(v) => patch('passport', { placeOfIssue: v })} placeholder="e.g. Hyderabad" />
              <VInput label="Issue Date *" type="date" value={passport.issueDate} onChange={(v) => patch('passport', { issueDate: v })} />
              <VInput label="Expiry Date *" type="date" value={passport.expiryDate} onChange={(v) => patch('passport', { expiryDate: v })} />
              <VInput label="Country of Issue *" value={passport.countryOfIssue} onChange={(v) => patch('passport', { countryOfIssue: v })} placeholder="India" />
              <VBool label="Do you have a previous passport? *" value={passport.hasPreviousPassport} onChange={(v) => patch('passport', { hasPreviousPassport: v })} />
              {passport.hasPreviousPassport && (
                <VInput label="Previous Passport Number *" value={passport.previousPassportNumber} onChange={(v) => patch('passport', { previousPassportNumber: v.toUpperCase() })} className="md:col-span-2" />
              )}
            </div>
          )}

          {/* Contact */}
          {step === 2 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <VInput label="Residential Address *" value={contact.address} onChange={(v) => patch('contact', { address: v })} className="md:col-span-2" />
              <VInput label="City *" value={contact.city} onChange={(v) => patch('contact', { city: v })} />
              <VInput label="State *" value={contact.state} onChange={(v) => patch('contact', { state: v })} />
              <VInput label="PIN Code *" value={contact.pincode} onChange={(v) => patch('contact', { pincode: v })} />
              <VInput label="Primary Phone *" value={contact.phone} onChange={(v) => patch('contact', { phone: v })} />
              <VInput label="Alternate Phone" value={contact.alternatePhone} onChange={(v) => patch('contact', { alternatePhone: v })} />
              <VInput label="Emergency Contact Name *" value={contact.emergencyContact} onChange={(v) => patch('contact', { emergencyContact: v })} />
              <VInput label="Emergency Phone *" value={contact.emergencyPhone} onChange={(v) => patch('contact', { emergencyPhone: v })} />
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
                  { value: 'salaried', label: 'Salaried Employee' },
                  { value: 'self_employed', label: 'Self-Employed / Business' },
                  { value: 'student', label: 'Student' },
                  { value: 'unemployed', label: 'Unemployed' },
                  { value: 'retired', label: 'Retired' },
                  { value: 'homemaker', label: 'Homemaker' },
                ]}
                className="md:col-span-2"
              />
              {(employment.status === 'salaried' || employment.status === 'self_employed') && (
                <>
                  <VInput label="Occupation / Job Title *" value={employment.occupation} onChange={(v) => patch('employment', { occupation: v })} />
                  {employment.status === 'salaried' && (
                    <VInput label="Employer / Company Name *" value={employment.employerName} onChange={(v) => patch('employment', { employerName: v })} />
                  )}
                  <VInput label="Designation" value={employment.designation} onChange={(v) => patch('employment', { designation: v })} />
                  <VNumber label="Years Employed" value={employment.yearsEmployed} onChange={(v) => patch('employment', { yearsEmployed: v })} />
                  <VInput label="Employer Address" value={employment.employerAddress} onChange={(v) => patch('employment', { employerAddress: v })} className="md:col-span-2" />
                  <VInput label="Employer Phone" value={employment.employerPhone} onChange={(v) => patch('employment', { employerPhone: v })} />
                  <VNumber label="Monthly Income (₹)" value={employment.monthlyIncome} onChange={(v) => patch('employment', { monthlyIncome: v })} />
                </>
              )}
            </div>
          )}

          {/* Travel */}
          {step === 4 && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <VSelect
                label="Purpose of Travel *"
                value={travel.purpose || ''}
                onChange={(v) => patch('travel', { purpose: v })}
                options={[
                  { value: 'tourism', label: 'Tourism & Sightseeing' },
                  { value: 'business', label: 'Business Meeting / Conference' },
                  { value: 'family_visit', label: 'Visiting Family / Friends' },
                  { value: 'transit', label: 'Airport Transit' },
                  { value: 'medical', label: 'Medical Treatment' },
                  { value: 'other', label: 'Other' },
                ]}
                className="md:col-span-2"
              />
              <VInput label="Intended Arrival Date *" type="date" value={travel.intendedArrival} onChange={(v) => patch('travel', { intendedArrival: v })} />
              <VInput label="Intended Departure Date *" type="date" value={travel.intendedDeparture} onChange={(v) => patch('travel', { intendedDeparture: v })} />
              <VSelect
                label="Accommodation Type *"
                value={travel.accommodation || ''}
                onChange={(v) => patch('travel', { accommodation: v })}
                options={[
                  { value: 'hotel', label: 'Hotel / Resort' },
                  { value: 'host', label: 'Staying with Host / Family' },
                  { value: 'other', label: 'Other Accommodation' },
                ]}
              />
              {travel.accommodation === 'hotel' && (
                <VInput label="Hotel / Booking Name *" value={travel.accommodationName} onChange={(v) => patch('travel', { accommodationName: v })} />
              )}
              <VBool label="Return Flight Ticket Booked? *" value={travel.returnTicketBooked} onChange={(v) => patch('travel', { returnTicketBooked: v })} />
              <VBool label="Travelling with Companions? *" value={travel.hasCompanions} onChange={(v) => patch('travel', { hasCompanions: v })} />
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
                  { value: 'self', label: 'Self-Funded' },
                  { value: 'sponsor', label: 'Sponsored by Family / Company' },
                  { value: 'employer', label: 'Employer-Funded' },
                ]}
                className="md:col-span-2"
              />
              <VNumber label="Estimated Bank Balance (₹)" value={financial.bankBalanceInr} onChange={(v) => patch('financial', { bankBalanceInr: v })} />
              {financial.fundingSource === 'sponsor' && (
                <>
                  <VInput label="Sponsor Full Name *" value={financial.sponsorName} onChange={(v) => patch('financial', { sponsorName: v })} />
                  <VInput label="Relationship with Sponsor" value={financial.sponsorRelation} onChange={(v) => patch('financial', { sponsorRelation: v })} />
                  <VInput label="Sponsor Phone" value={financial.sponsorContact} onChange={(v) => patch('financial', { sponsorContact: v })} />
                </>
              )}
              <VBool label="Employment Letter Available? *" value={financial.employmentLetterAvailable} onChange={(v) => patch('financial', { employmentLetterAvailable: v })} />
              <VBool label="ITR (Income Tax Returns) Filed? *" value={financial.itrFiled} onChange={(v) => patch('financial', { itrFiled: v })} />
            </div>
          )}

          {/* Visa History */}
          {step === 6 && (
            <div className="grid grid-cols-1 gap-4">
              <VBool label="Have you travelled to US, UK, Canada, or Schengen area in the last 5 years? *" value={visaHistory.hasUsUkSchengen} onChange={(v) => patch('visaHistory', { hasUsUkSchengen: v })} />
              <VInput label="Previous countries visited (comma-separated)" value={Array.isArray(visaHistory.previousCountries) ? visaHistory.previousCountries.join(', ') : (visaHistory.previousCountries || '')} onChange={(v) => patch('visaHistory', { previousCountries: v.split(',').map((s) => s.trim()).filter(Boolean) })} placeholder="e.g. Singapore, UAE, Thailand" />
              <VBool label="Have you ever had a visa application rejected? *" value={visaHistory.everRejected} onChange={(v) => patch('visaHistory', { everRejected: v })} />
              {visaHistory.everRejected && (
                <VInput label="Country of rejection *" value={visaHistory.rejectionCountry} onChange={(v) => patch('visaHistory', { rejectionCountry: v })} placeholder="e.g. United Kingdom" />
              )}
              <VBool label="Have you ever overstayed a visa in any country? *" value={visaHistory.everOverstayed} onChange={(v) => patch('visaHistory', { everOverstayed: v })} />
            </div>
          )}

          {/* Document Uploads */}
          {step === 7 && (
            <div className="flex flex-col gap-4">
              <div>
                <span className={VISA_HEADING + ' block'}>Required Documents</span>
                <p className="text-xs text-slate-500 mt-1">Upload clear scans or photos of the required documents for your {activeApp.country} {activeApp.visaType}.</p>
              </div>

              <div className="grid grid-cols-1 gap-3">
                {(activeApp.requiredDocs || []).map((docName) => {
                  const doc = latestDoc(docName);
                  return (
                    <div key={docName} className="bg-white border border-slate-200/90 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 shadow-xs">
                      <div>
                        <span className="font-bold text-xs text-brand-navy block">{docName}</span>
                        {doc ? (
                          <span className="text-[13px] text-slate-500 font-mono mt-0.5 block">{doc.fileName} · v{doc.version} · {doc.status}</span>
                        ) : (
                          <span className="text-[13px] text-slate-400 italic mt-0.5 block">Not uploaded yet</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {doc && <span className={docBadge(doc.status)}>{doc.status}</span>}
                        <label className="bg-brand-navy hover:bg-brand-gold hover:text-brand-navy text-white text-xs font-bold uppercase tracking-wider px-3 py-1.5 rounded-lg transition cursor-pointer shadow-xs">
                          {doc ? 'Re-upload' : 'Upload File'}
                          <input
                            type="file"
                            accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx"
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
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Review */}
          {step === 8 && (
            <div className="flex flex-col gap-5">
              <div className="flex items-center justify-between">
                <span className={VISA_HEADING + ' block'}>Review & Submit</span>
                <span className="text-xs text-slate-500 font-semibold">{activeApp.country} — {activeApp.visaType}</span>
              </div>

              {reviewErrors.length > 0 && (
                <div className="bg-amber-50 border border-amber-200 text-amber-800 rounded-xl p-4 text-xs shadow-xs">
                  <p className="font-bold uppercase tracking-wider text-[13px] mb-1">Incomplete before submission</p>
                  {reviewErrors.map((e) => (
                    <p key={e.key}>• {e.label}: {e.err}</p>
                  ))}
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {VISA_STEPS.slice(0, 7).map((s) => (
                  <div key={s.key} className="bg-white border border-slate-200/90 rounded-xl p-4 shadow-xs">
                    <span className={VISA_HEADING + ' block mb-2'}>{s.label}</span>
                    <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-xs">
                      {visaReviewRows(s.key as VisaSectionKey, form).map(([k, v]) => (
                        <div key={k} className="col-span-2 flex justify-between gap-3 border-b border-slate-100 pb-1">
                          <dt className="text-slate-500">{k}</dt>
                          <dd className="font-semibold text-slate-800 text-right">{v}</dd>
                        </div>
                      ))}
                    </dl>
                  </div>
                ))}
              </div>

              <div className="border-t border-slate-200 pt-4 flex flex-col gap-3">
                <label className="flex items-start gap-2.5 text-xs text-slate-600 cursor-pointer">
                  <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 accent-brand-gold cursor-pointer" />
                  <span>
                    I confirm the information above is accurate, and I agree to the Terms & Conditions for visa processing.
                    <a href="https://opusoverseas.com/terms" target="_blank" rel="noreferrer" className="text-brand-gold font-bold hover:underline ml-1">Terms</a>
                  </span>
                </label>
                <div className="flex flex-col gap-2">
                  {VISA_PAUSED ? (
                    <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-center">
                      <p className="text-xs font-bold text-amber-800">Submit paused — will be available soon</p>
                      <p className="text-sm text-amber-700 mt-1">Your draft is saved. Join the waitlist from the catalogue and we’ll submit it for you when we go live — no re-entry needed.</p>
                      <button onClick={() => setTab('catalogue')} className="mt-2 px-4 py-2 rounded-xl bg-brand-navy text-white text-xs font-bold hover:bg-brand-gold hover:text-brand-navy cursor-pointer">Go to Waitlist →</button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-3">
                      <button onClick={() => setStep(7)} disabled={busy} className="border border-slate-200 bg-white text-slate-600 hover:text-brand-navy hover:border-slate-300 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer shadow-xs">
                        ← Back
                      </button>
                      <button
                        onClick={submitApp}
                        disabled={!agreed || reviewErrors.length > 0 || busy}
                        className={`${VISA_BTN} flex-1 py-3 rounded-xl text-xs font-black uppercase tracking-wider cursor-pointer transition disabled:opacity-40 disabled:cursor-not-allowed`}
                      >
                        {busy ? 'Submitting...' : 'Submit Application'}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {wizardErr && (
          <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl p-3 shadow-xs">
            <span className="font-bold">⚠</span><span>{wizardErr}</span>
          </div>
        )}

        {step < 8 && (
          <div className="flex justify-between gap-3 pt-4 border-t border-slate-200">
            {step > 0 ? (
              <button onClick={() => { setWizardErr(''); setStep(step - 1); }} disabled={busy} className="border border-slate-200 bg-white text-slate-600 hover:text-brand-navy hover:border-slate-300 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider cursor-pointer shadow-xs">
                ← Back
              </button>
            ) : <span />}
            <button onClick={handleNext} disabled={busy} className={`${VISA_BTN} px-6 py-2.5 rounded-xl text-xs uppercase tracking-wider cursor-pointer transition disabled:opacity-50`}>
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
        <div className="text-center border-2 border-dashed border-slate-200 rounded-2xl p-10 bg-slate-50">
          <h3 className="font-display font-bold text-sm text-brand-navy">No application selected</h3>
          <p className="text-xs text-slate-500 mt-1">Pick an application from the catalogue or start a new one.</p>
          <button onClick={() => setTab('catalogue')} className={`${VISA_BTN} mt-4 px-4 py-2 rounded-xl text-xs uppercase tracking-wider cursor-pointer`}>Back to Catalogue</button>
        </div>
      );
    }

    const curIdx = VISA_FLOW.findIndex((f) => f.key === activeApp.status);
    const isRejected = activeApp.status === 'rejected' || activeApp.status === 'cancelled';

    return (
      <div className="flex flex-col gap-6">
        <div className="bg-slate-50 border border-slate-200/90 rounded-2xl p-6 flex flex-col gap-5 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <span className={VISA_HEADING + ' block'}>Visa Application</span>
              <h3 className="font-display font-bold text-base text-brand-navy mt-1">{activeApp.country} — {activeApp.visaType}</h3>
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
                  <span className={`px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border ${
                    done ? 'bg-emerald-50 text-emerald-700 border-emerald-200 font-extrabold'
                    : current ? 'text-brand-navy border-brand-gold bg-amber-50 font-extrabold shadow-xs'
                    : 'bg-white text-slate-400 border-slate-200'
                  }`}>
                    {f.label}
                  </span>
                  {i < VISA_FLOW.length - 1 && <span className="text-slate-300 text-[13px]">→</span>}
                </div>
              );
            })}
            {isRejected && (
              <span className="px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider border border-rose-200 bg-rose-50 text-rose-700">
                {activeApp.status.replace('_', ' ')}
              </span>
            )}
          </div>

          <div className="flex flex-wrap gap-x-6 gap-y-1 text-[13px] uppercase tracking-wider text-slate-500">
            <span>Submitted: {activeApp.submittedAt ? new Date(activeApp.submittedAt * 1000).toLocaleString() : '—'}</span>
            <span>Decision: {activeApp.decisionAt ? new Date(activeApp.decisionAt * 1000).toLocaleString() : '—'}</span>
            <span>Delivered: {activeApp.deliveredAt ? new Date(activeApp.deliveredAt * 1000).toLocaleString() : '—'}</span>
            <span>Created: {new Date(activeApp.createdAt * 1000).toLocaleDateString()}</span>
          </div>
        </div>

        {activeApp.rejectionReason && (
          <div className="flex items-start gap-2 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl p-4 text-xs shadow-xs">
            <span>⛔</span>
            <div>
              <p className="font-bold uppercase tracking-wider text-[13px]">Application {activeApp.status === 'cancelled' ? 'Cancelled' : 'Rejected'}</p>
              <p className="mt-0.5">{activeApp.rejectionReason}</p>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-white border border-slate-200/90 rounded-xl p-4 shadow-xs">
            <span className={VISA_HEADING + ' block mb-2'}>Embassy Appointment</span>
            {activeApp.appointmentDate ? (
              <div className="space-y-1.5 text-xs text-slate-700">
                <p><span className="text-slate-400 block text-[13px]">Slot Scheduled Date</span><span className="font-bold text-brand-navy">{new Date(activeApp.appointmentDate * 1000).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span></p>
                <p><span className="text-slate-400 block text-[13px]">Consulate Location</span><span className="font-semibold text-brand-navy">{activeApp.appointmentLocation || 'To be confirmed'}</span></p>
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">No slot scheduled yet. Our visa desk will book your embassy slot and update it here.</p>
            )}
          </div>
          <div className="bg-white border border-slate-200/90 rounded-xl p-4 shadow-xs">
            <span className={VISA_HEADING + ' block mb-2'}>Staff Notes</span>
            {activeApp.notes ? (
              <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">{activeApp.notes}</p>
            ) : (
              <p className="text-xs text-slate-400 italic">No notes from the visa desk yet.</p>
            )}
          </div>
        </div>

        <div className="flex flex-col gap-3">
          <span className={VISA_HEADING + ' block'}>Document Status</span>
          <div className="bg-white border border-slate-200/90 rounded-xl overflow-x-auto shadow-xs">
            <table className="w-full text-left text-xs min-w-[560px]">
              <thead className="border-b border-slate-200 text-slate-500 uppercase tracking-wider text-xs bg-slate-50">
                <tr>
                  <th className="py-2.5 px-3">Document</th>
                  <th className="py-2.5 px-3">File</th>
                  <th className="py-2.5 px-3">Version</th>
                  <th className="py-2.5 px-3">Uploaded</th>
                  <th className="py-2.5 px-3">Status</th>
                  <th className="py-2.5 px-3">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {(activeApp.requiredDocs || []).map((docName) => {
                  const doc = latestDoc(docName);
                  return (
                    <tr key={docName} className="hover:bg-slate-50/80">
                      <td className="py-2.5 px-3 font-semibold text-brand-navy whitespace-nowrap">{docName}</td>
                      <td className="py-2.5 px-3 text-slate-600 font-mono max-w-[220px] truncate">{doc ? doc.fileName : '—'}</td>
                      <td className="py-2.5 px-3 text-slate-400 font-mono">{doc?.version || '—'}</td>
                      <td className="py-2.5 px-3 text-slate-400 whitespace-nowrap">{doc?.uploadedAt ? new Date(doc.uploadedAt * 1000).toLocaleDateString() : '—'}</td>
                      <td className="py-2.5 px-3">
                        {doc ? (
                          <span className={docBadge(doc.status)}>{doc.status === 'pending' ? 'Uploaded' : doc.status === 'verified' ? 'Verified' : 'Rejected'}</span>
                        ) : (
                          <span className="text-sm uppercase tracking-wider text-slate-400">Not uploaded</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3">
                        {(!doc || doc.status === 'rejected') ? (
                          <label className="inline-block cursor-pointer bg-slate-100 hover:bg-brand-navy hover:text-white text-slate-700 border border-slate-200 px-2.5 py-1 rounded-lg text-xs font-bold uppercase tracking-wider transition shadow-xs">
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
                          <span className="text-xs uppercase tracking-wider text-emerald-600 font-bold">{doc.status === 'verified' ? 'Verified ✓' : 'Awaiting review'}</span>
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
            <button onClick={editApplication} className={`${VISA_BTN} px-5 py-2.5 rounded-xl text-xs uppercase tracking-wider cursor-pointer transition`}>
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
        <h2 className="font-display font-bold text-lg text-brand-navy">🛂 Visa Services</h2>
        <p className="text-xs text-slate-500 mt-0.5">Apply for, draft, and track your embassy visa applications — end to end.</p>
      </div>

      {notice && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl px-3.5 py-2.5 shadow-xs">
          <span className="font-bold">✓</span><span>{notice}</span>
        </div>
      )}

      {tab === 'catalogue' && renderCatalogue()}
      {tab === 'wizard' && renderWizard()}
      {tab === 'tracker' && renderTracker()}
    </div>
  );
}
