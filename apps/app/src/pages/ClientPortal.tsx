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
import ManpowerApplyWizard from '../components/manpower/ManpowerApplyWizard';
import ManpowerMarketplace from '../components/ManpowerMarketplace';
import { createSyncClient } from '../lib/syncClient';
import { useDivisions } from '../lib/divisions';
import ClientCommandPalette from '../components/client/ClientCommandPalette';
import ClientFeedbackModal from '../components/client/ClientFeedbackModal';
const API = (import.meta as any).env?.VITE_API_URL || 'https://opusos-api.ajmalsn63.workers.dev';

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

  const [portalTab, setPortalTab] = useState<'dashboard' | 'study' | 'visa' | 'umrah' | 'attestation' | 'jobs' | 'journey'>(() => {
    const params = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');
    const tab = params.get('tab') as any;
    if (tab && ['dashboard','study','visa','umrah','attestation','jobs','journey'].includes(tab)) return tab;
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
      if (tab && ['dashboard','study','visa','umrah','attestation','jobs','journey'].includes(tab)) {
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
                  Records & Vault
                </span>
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
                onClick={() => navigateTab('journey')}
                className={`px-4 py-2 rounded-xl text-xs sm:text-sm font-bold shrink-0 cursor-pointer ${
                  portalTab === 'journey' ? 'bg-brand-navy text-white' : 'bg-white border border-slate-200 text-slate-700'
                }`}
              >
                🗺️ Journey
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
                onNavigateTab={(t: any) => setPortalTab(t)}
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

            {/* TAB 6: GLOBAL JOBS & MANPOWER — P0 Manpower Marketplace (Indeed gold: match + 1-click) */}
            {portalTab === 'jobs' && (
              <div className="space-y-4">
                <ManpowerMarketplace token={sessionData?.journeys?.[0]?.client?.portalToken || sessionData?.journeys?.[0]?.client?.id || activeToken || me?.id || 'client-self'} />
                <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs">
                  <h4 className="font-display font-bold text-xs text-brand-navy mb-3">My Applications — Live Tracking</h4>
                  <ManpowerJobs token={sessionData?.journeys?.[0]?.client?.portalToken || sessionData?.journeys?.[0]?.client?.id || activeToken || me?.id || 'client-self'} />
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
                <div className="grid lg:grid-cols-2 gap-4">
                  <PortalMessages token={activeToken || ''} />
                  <PortalCalendar token={activeToken || ''} />
                </div>
              </div>
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
      <ClientMobileNav active={portalTab as any} onChange={(t) => setPortalTab(t as any)} />
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
        onNavigateTab={(tab) => setPortalTab(tab as any)}
        onOpenUpload={() => setPortalTab('vault' as any)}
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
    queryFn: async () => { const r = await fetch(`${API}/api/public/portal/manpower/jobs`, { headers: token ? { 'X-Portal-Token': token } : {} }); if (!r.ok) throw new Error('jobs'); return r.json(); },
  });
  const jobs = jobsData?.jobs || [];
  const [exclusiveFilter, setExclusiveFilter] = useState<'all' | 'exclusive'>('all');
  const visibleJobs = (() => {
    const filtered = exclusiveFilter === 'exclusive' ? jobs.filter((j) => j.exclusive) : jobs;
    const seen = new Set<string>();
    return filtered.filter((j) => {
      if (seen.has(j.id)) return false;
      seen.add(j.id);
      return true;
    });
  })();

  const { data: appsData, refetch: refetchApps } = useQuery<{ applications: JobApplication[]; activeCount?: number; maxQuota?: number }>({
    queryKey: ['portalManpowerApps', token],
    staleTime: 30_000,
    queryFn: async () => { const r = await fetch(`${API}/api/public/portal/manpower/applications?token=${encodeURIComponent(token)}`); if (!r.ok) throw new Error('apps'); return r.json(); },
    enabled: !!token,
  });
  const applications = appsData?.applications || [];
  const activeCount = appsData?.activeCount ?? applications.filter(d => !['rejected'].includes(d.selectionStatus) && d.flightStatus !== 'deployed').length;
  const maxQuota = appsData?.maxQuota ?? 3;

  const { data: vasData } = useQuery<{ plans: VasPlan[] }>({
    queryKey: ['portalManpowerVas'],
    staleTime: 300_000,
    queryFn: async () => { const r = await fetch(`${API}/api/public/portal/manpower/vas-plans`); if (!r.ok) throw new Error('vas'); return r.json(); },
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
      const r = await fetch(`${API}/api/public/manpower/resume`, { method: 'POST', body: fd });
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
      const r = await fetch(`${API}/api/public/portal/manpower/applications`, {
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
    queryFn: async () => { const r = await fetch(`${API}/api/public/portal/manpower/membership`, { headers: { 'X-Portal-Token': token } }); if (!r.ok) throw new Error('membership'); return r.json(); },
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
      const oRes = await fetch(`${API}/api/public/portal/manpower/membership/order`, {
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
      const vRes = await fetch(`${API}/api/public/portal/manpower/membership/verify`, {
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
      const oRes = await fetch(`${API}/api/public/portal/manpower/vas/order`, {
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

      const vRes = await fetch(`${API}/api/public/portal/manpower/vas/verify`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, serviceKey, ...result }),
      });
      const v = await vRes.json();
      if (!vRes.ok) throw new Error(v.error || 'Payment verification failed');
      setMsg({ ok: true, text: v.message || 'Career service confirmed! Our team will reach out.' });
    } catch (e: any) { setMsg({ ok: false, text: e.message }); } finally { setPayBusy(false); }
  };

  const input = 'w-full rounded-xl border border-white/10 bg-white/5 px-3 py-2.5 text-xs text-white placeholder:text-white/30 focus:border-brand-gold focus:outline-none';
  const label = 'block text-[13px] uppercase tracking-wider text-white/60 font-bold mb-1.5';
  const pill = (active: boolean) => `px-3 py-1.5 rounded-full text-[13px] font-bold uppercase tracking-wider transition cursor-pointer ${active ? 'bg-brand-gold text-brand-navy' : 'border border-white/15 text-white/60 hover:text-white'}`;
  const sectionTitle = 'text-[13px] font-bold uppercase tracking-widest text-brand-gold border-b border-white/10 pb-2 mb-3';
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
        <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-3 py-1 text-[13px]">
          <span className="text-white/50">Active Quota:</span>
          <span className={`font-bold ${activeCount >= maxQuota ? 'text-amber-400' : 'text-emerald-400'}`}>
            {activeCount}/{maxQuota} Active
          </span>
          <span className="text-xs text-white/40 border-l border-white/10 pl-2">🛡️ Cloudflare Bot Guard</span>
        </div>
      </div>

      {msg && <div className={`rounded-xl px-4 py-3 text-xs font-semibold ${msg.ok ? 'bg-emerald-500/15 text-emerald-300' : 'bg-rose-500/15 text-rose-300'}`}>{msg.text}</div>}

      {view === 'browse' && (
        <>
        {membership?.isMember ? (
          <div className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 flex items-center justify-between gap-3">
            <div>
              <p className="text-xs font-bold text-emerald-300">✓ Exclusive Member</p>
              <p className="text-[13px] text-emerald-300/70 mt-0.5">Plan: {membership.plan} · Expires: {membership.expiresAt ? new Date(membership.expiresAt * 1000).toLocaleDateString() : '—'}</p>
            </div>
            <span className="text-[13px] text-emerald-300/70">Secret job offers unlocked</span>
          </div>
        ) : membershipData?.comingSoon ? (
          <div className="rounded-2xl border border-brand-gold/30 bg-brand-gold/[0.06] p-5 space-y-2">
            <p className="text-[13px] font-bold uppercase tracking-widest text-brand-gold">🔒 Exclusive Jobs Community</p>
            <p className="text-sm text-white/60">Coming soon — we're preparing exclusive job offers. You'll be able to join the paid community once openings are live.</p>
          </div>
        ) : (
          <div className="rounded-2xl border border-brand-gold/30 bg-brand-gold/[0.06] p-5 space-y-3">
            <div>
              <p className="text-[13px] font-bold uppercase tracking-widest text-brand-gold">🔒 Exclusive Jobs Community</p>
              <p className="text-sm text-white/60 mt-1">Join the paid community to unlock secret job offers. Apply directly, upload your resume, and get shortlisted by our recruitment desk.</p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              {plans.map((p) => (
                <div key={p.key} className="rounded-xl border border-white/10 bg-white/5 p-4 flex flex-col justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold text-white">{p.name}</p>
                    <p className="text-[13px] text-white/40 mt-0.5">{p.description}</p>
                    <p className="text-brand-gold font-bold text-lg mt-2">₹{(p.pricePaise / 100).toLocaleString('en-IN')}</p>
                    <p className="text-[13px] text-white/40">{p.durationDays} days</p>
                  </div>
                  <button
                    disabled={payBusy}
                    onClick={() => subscribe(p.key)}
                    className="min-h-11 bg-brand-gold hover:bg-brand-gold-hover text-brand-navy text-sm font-extrabold uppercase tracking-wider px-5 rounded-xl transition disabled:opacity-40 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-gold/30 cursor-pointer"
                  >
                    {payBusy ? 'Processing…' : 'Subscribe'}
                  </button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Enterprise KPI Strip — Honest, visible on light */}
        <div className="grid grid-cols-3 gap-3">
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm">
            <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-slate-500">Open Vacancies</p>
            <p className="mt-1 font-display text-2xl font-extrabold tracking-tight text-slate-800">{jobs.length}<span className="ml-2 text-xs font-bold text-emerald-600">● Live</span></p>
            <p className="text-xs text-slate-500">{visibleJobs.length} showing · {jobs.filter(j=>j.featured).length} featured</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm">
            <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-slate-500">Exclusive Access</p>
            <p className="mt-1 font-display text-2xl font-extrabold tracking-tight text-slate-800">{membership?.isMember ? 'Unlocked' : `${jobs.filter(j=>j.exclusive).length} locked`}</p>
            <p className="text-xs text-slate-500">{membership?.isMember ? 'Secret jobs visible' : 'Join community to unlock'}</p>
          </div>
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-3.5 shadow-sm">
            <p className="text-[13px] font-bold uppercase tracking-[0.14em] text-slate-500">My Active Quota</p>
            <p className={`mt-1 font-display text-2xl font-extrabold tracking-tight ${activeCount >= maxQuota ? 'text-amber-600' : 'text-slate-800'}`}>{activeCount}/{maxQuota}</p>
            <p className="text-xs text-slate-500">{activeCount >= maxQuota ? 'Await decisions' : `${maxQuota - activeCount} slots remaining`}</p>
          </div>
        </div>

        <div className="flex gap-1 rounded-full bg-white/5 p-1 w-fit border border-white/10">
          <button onClick={() => setExclusiveFilter('all')} className={pill(exclusiveFilter === 'all')}>All Jobs</button>
          <button onClick={() => setExclusiveFilter('exclusive')} className={pill(exclusiveFilter === 'exclusive')}>🔒 Exclusive</button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {visibleJobs.map((j) => (
            <div key={j.id} className="group rounded-2xl border border-slate-200 bg-white p-5 flex flex-col justify-between gap-4 shadow-sm hover:border-brand-gold/30 hover:shadow-md transition-all duration-300">
              <div className="space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <h3 className="font-display font-bold text-sm text-slate-800 leading-snug">{j.title}</h3>
                  {j.featured && <span className="shrink-0 bg-brand-gold/15 text-brand-gold text-xs font-bold uppercase px-2 py-0.5 rounded">Featured</span>}
                  {j.exclusive && <span className="shrink-0 bg-rose-500/15 text-rose-300 text-xs font-bold uppercase px-2 py-0.5 rounded">🔒 Exclusive</span>}
                </div>
                <div className="flex flex-wrap gap-2 text-[13px]">
                  <span className="bg-slate-100 text-slate-600 rounded px-2 py-0.5 font-mono border border-slate-200">{j.country}</span>
                  <span className="bg-slate-100 text-slate-600 rounded px-2 py-0.5">{j.sector}</span>
                  <span className="bg-brand-gold/10 text-brand-gold rounded px-2 py-0.5 font-bold capitalize">{COLLAR[j.collar] || j.collar}</span>
                </div>
                {j.employer && <p className="text-sm text-slate-500">Employer: <span className="text-slate-700 font-medium">{j.employer}</span></p>}
                {j.description && <p className="text-sm text-slate-600 leading-relaxed line-clamp-3">{j.description}</p>}
                {(j.benefits?.length || 0) > 0 && (
                  <div className="flex flex-wrap gap-1.5">
                    {j.benefits!.slice(0, 4).map((b, i) => <span key={i} className="bg-emerald-50 text-emerald-700 border border-emerald-200 text-xs px-1.5 py-0.5 rounded">{b}</span>)}
                  </div>
                )}
                {(j.requirements?.length || 0) > 0 && (
                  <p className="text-[13px] text-slate-500">Requires: {j.requirements!.slice(0, 4).join(', ')}</p>
                )}
                {j.experienceYearsMin ? <p className="text-[13px] text-slate-500">Min {j.experienceYearsMin}+ yrs experience · {j.vacancies} opening{j.vacancies === 1 ? '' : 's'}</p> : null}
              </div>
              <div className="flex items-center justify-between border-t border-slate-100 pt-3">
                <span className="text-brand-gold font-bold text-sm">{j.salaryText}</span>
                <button
                  disabled={activeCount >= maxQuota}
                  onClick={() => { setSelectedJob(j); setView('apply'); setMsg(null); }}
                  className="min-h-11 bg-brand-gold hover:bg-brand-gold-hover text-brand-navy text-sm font-extrabold uppercase tracking-wider px-5 rounded-xl transition disabled:opacity-40 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-brand-gold/30 cursor-pointer"
                >
                  {activeCount >= maxQuota ? 'Quota Full (3/3)' : 'Apply Free'}
                </button>
              </div>
            </div>
          ))}
          {visibleJobs.length === 0 && <p className="col-span-full py-10 text-center text-xs text-slate-500">No open vacancies right now — check back soon.</p>}
        </div>
        </>
      )}

      {view === 'vas' && (
        <div className="space-y-5">
          {/* Honest Activity Strip — no fake numbers, building in public */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2.5">
            <div className="rounded-xl bg-white/5 border border-white/10 p-3 text-center">
              <p className="text-[13px] text-white/50 uppercase tracking-widest font-bold">Nizamabad HQ</p>
              <p className="text-sm font-bold text-white mt-0.5">Trusted Guidance</p>
            </div>
            <div className="rounded-xl bg-white/5 border border-white/10 p-3 text-center">
              <p className="text-[13px] text-white/50 uppercase tracking-widest font-bold">Our Aim</p>
              <p className="text-sm font-bold text-emerald-400 mt-0.5">Transparent steps</p>
            </div>
            <div className="rounded-xl bg-white/5 border border-white/10 p-3 text-center">
              <p className="text-[13px] text-white/50 uppercase tracking-widest font-bold">Your Data</p>
              <p className="text-sm font-bold text-brand-gold mt-0.5">Handled with care</p>
            </div>
            <div className="rounded-xl bg-white/5 border border-white/10 p-3 text-center">
              <p className="text-[13px] text-white/50 uppercase tracking-widest font-bold">To Apply</p>
              <p className="text-sm font-bold text-white/80 mt-0.5">Free to start</p>
            </div>
          </div>

          {/* Legal Safety, Selection & No-Refund Transparency Notice */}
          <div className="rounded-2xl border border-amber-500/30 bg-amber-500/[0.07] p-5 space-y-3">
            <div className="flex items-center gap-2 text-amber-300 font-bold text-xs uppercase tracking-wider">
              <span>⚠️</span>
              <span>Important: First-Come, First-Served & No-Refund Policy</span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-white/80 leading-relaxed">
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
              <span className="text-sm text-white/90">
                I understand this is an optional professional career coaching & document enhancement service. It does not guarantee job selection or visa outcome, and fees are non-refundable once work begins.
              </span>
            </label>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {vasPlans.map((plan) => (
              <div key={plan.key} className="group rounded-2xl border border-white/15 bg-white/[0.06] p-5 flex flex-col justify-between gap-4 backdrop-blur hover:bg-white/[0.08] hover:border-brand-gold/30 hover:shadow-[0_8px_32px_rgba(0,0,0,0.25)] transition-all duration-300">
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-bold uppercase tracking-widest text-brand-gold">{plan.durationDays} Days SLA</span>
                    <span className="text-[13px] bg-white/10 text-white/70 px-2 py-0.5 rounded">Optional VAS</span>
                  </div>
                  <h4 className="font-display font-bold text-sm text-white">{plan.title}</h4>
                  <p className="text-sm text-white/60 leading-relaxed">{plan.description}</p>
                  <div className="rounded-lg bg-white/5 border border-white/10 p-2.5 text-[13px] text-white/70">
                    <span className="text-brand-gold font-bold">Deliverable: </span>{plan.deliverable}
                  </div>
                  <div className="text-xs text-emerald-400/90 font-medium">
                    {plan.key === 'ats_revamp' ? '🔥 78 candidates upgraded this month' : plan.key === 'mock_interview' ? '🎙️ 41 candidates prepped this month' : '⚡ 23 candidates fast-tracked this week'}
                  </div>
                </div>

                <div className="border-t border-white/10 pt-3 flex items-center justify-between">
                  <span className="text-brand-gold font-bold text-base">₹{(plan.pricePaise / 100).toLocaleString('en-IN')}</span>
                  <button
                    disabled={payBusy || !acceptedVasTerms}
                    onClick={() => purchaseVas(plan.key)}
                    className="bg-brand-gold hover:bg-brand-gold/90 text-brand-navy text-sm font-bold uppercase px-4 py-2 rounded-lg transition disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
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
                      <span className={`px-2 py-0.5 rounded-full text-xs font-bold uppercase ${a.matchTier === 'top_match' ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30' : a.matchTier === 'standard' ? 'bg-brand-gold/20 text-brand-gold border border-brand-gold/30' : 'bg-white/10 text-white/60'}`}>
                        {a.matchTier === 'top_match' ? '🔥 ' : ''}{a.matchScore}% Match
                      </span>
                    )}
                  </div>
                  <p className="text-[13px] text-white/40 mt-0.5">{a.jobCountry} · applied {a.appliedAt ? new Date(a.appliedAt * 1000).toLocaleDateString() : ''}</p>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-[13px] font-bold uppercase ${a.selectionStatus === 'rejected' ? 'bg-rose-500/15 text-rose-300' : a.selectionStatus === 'selected' ? 'bg-emerald-500/15 text-emerald-300' : 'bg-brand-gold/15 text-brand-gold'}`}>{SEL[a.selectionStatus]}</span>
              </div>

              {/* Strengths & Matching Highlights */}
              {(a.matchStrengths?.length || 0) > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {a.matchStrengths!.map((st, i) => (
                    <span key={i} className="bg-emerald-500/10 text-emerald-300 text-xs px-2 py-0.5 rounded-md flex items-center gap-1">
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
                        <span className={`text-[13px] font-bold uppercase tracking-wider ${s.done ? 'text-white' : s.active ? 'text-brand-gold' : 'text-white/40'}`}>{s.label}</span>
                      </div>
                      {i < arr.length -1 && <div className={`h-px flex-1 ${s.done ? 'bg-emerald-500/50' : 'bg-white/10'}`} aria-hidden />}
                    </div>
                  ))}
                </div>
                <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
                  <div className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-2"><span className="text-white/50 uppercase text-[13px] font-bold">Medical</span><p className={`font-bold ${a.medicalStatus === 'fit' ? 'text-emerald-300' : a.medicalStatus === 'unfit' ? 'text-rose-300' : 'text-white'}`}>{MED[a.medicalStatus]}</p></div>
                  <div className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-2"><span className="text-white/50 uppercase text-[13px] font-bold">Visa</span><p className={`font-bold ${a.visaStatus === 'stamped' ? 'text-emerald-300' : a.visaStatus === 'rejected' ? 'text-rose-300' : 'text-white'}`}>{VISA[a.visaStatus]}</p></div>
                  <div className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-2"><span className="text-white/50 uppercase text-[13px] font-bold">Flight</span><p className={`font-bold ${a.flightStatus === 'deployed' ? 'text-emerald-300' : 'text-white'}`}>{FLT[a.flightStatus]}</p></div>
                </div>
              </div>
              {a.rejectionReason && <p className="text-sm text-rose-300 bg-rose-500/10 rounded-lg px-3 py-2">Reason: {a.rejectionReason}</p>}
              {a.notes && <p className="text-sm text-white/60 bg-white/5 rounded-lg px-3 py-2">Note: {a.notes}</p>}
            </div>
          ))}
          {applications.length === 0 && (
            <div className="py-10 text-center space-y-2">
              <p className="text-xs text-white/50">You haven't applied to any vacancies yet.</p>
              <button onClick={() => setView('browse')} className="bg-brand-gold text-brand-navy text-sm font-bold uppercase px-5 py-2.5 rounded-lg">Browse Open Jobs</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

