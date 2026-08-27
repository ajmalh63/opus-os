import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import { QRCodeSVG } from 'qrcode.react';
import Logo from '../components/Logo';
import Nav from '../components/Nav';
import Footer from '../components/Footer';
import LiveWallpaper from '../components/LiveWallpaper';
import PartnerDashboardHub from '../components/PartnerDashboardHub';
import PartnerMobileNav from '../components/partner/PartnerMobileNav';
import ChatWidget from '../components/ChatWidget';
import { track, EVENTS } from '../lib/umami';
import { fadeUp, staggerReveal, countUp, prefersReducedMotion, makeContext, whenFontsReady } from '../lib/motion';
import { useVisibilityTracking } from '../lib/visibilityTracking';
import { createSyncClient } from '../lib/syncClient';
import { BookingTower } from '../components/partner/BookingTower';
import { CommissionPerformance } from '../components/partner/CommissionPerformance';

// ============================================================================
// OPUS OVERSEAS — PARTNER & AFFILIATE COMMAND CENTER (GOLD STANDARD ARCHITECTURE)
// Inspired by Stripe Atlas, FirstPromoter, and Rewardful.
// 1. Session-first & token-safe auth with seamless KYC onboarding.
// 2. 5-Division 1-Click Link Hub (Study Abroad, Visa, Umrah, Attestation, Manpower).
// 3. Telemetry ribbon with live rupee rollups & count-up animations.
// 4. Transparent milestone ledger (Lead → Agreement → Payment → Matured → Payout).
// 5. Payout station with masked bank/UPI preferences & 1-click settlement requests.
// 6. VIP Loyalty Tier ladder (Thrive points, commission boosts, perks).
// 7. Dynamic creative kit, copy swipe library, & instant QR code studio.
// ============================================================================

type TabKey = 'overview' | 'links' | 'referrals' | 'payouts' | 'tiers';

interface CommissionRow {
  referralId: string;
  referredClientId: string;
  ratePct: number;
  amountPaise: number;
  status: 'unmatured' | 'matured' | 'paid' | 'held' | string;
}

interface PartnerSummary {
  partner: {
    id?: string;
    name: string;
    referralCode: string | null;
    status: string;
    joinedAt: number;
  };
  totals: {
    matured: number;
    pending: number;
    paid: number;
    total: number;
  };
  referrals: CommissionRow[];
}

interface PartnerSessionPayload {
  success: boolean;
  authenticated: boolean;
  email?: string | null;
  partner?: {
    id: string;
    name: string;
    referralCode: string | null;
    status: string;
    joinedAt: number;
  } | null;
  totals?: {
    matured: number;
    pending: number;
    paid: number;
    total: number;
  };
  referrals?: CommissionRow[];
}

interface TimelineEvent {
  label: string;
  at: number | null;
  state?: string;
}

interface ReferralDetailRow {
  referralId: string;
  clientId: string;
  clientName?: string | null;
  commissionRate: number;
  amountPaise: number;
  status: string;
  createdAt: number;
  timeline: TimelineEvent[];
}

interface ReferralDetailPayload {
  referrals: ReferralDetailRow[];
}

interface Creative {
  id: string;
  title: string;
  type: string;
  size: string | null;
  url: string;
  imageKey: string | null;
  active: boolean;
}

interface CreativesPayload {
  creatives: Creative[];
}

interface PayoutConfig {
  payoutMethod: 'bank' | 'upi' | null;
  payoutDetail: string;
  payoutThresholdPaise: number;
}

interface PayoutRow {
  id: string;
  partnerId: string;
  amountPaise: number;
  status: 'requested' | 'approved' | 'paid' | 'rejected';
  note: string | null;
  requestedAt: number;
  resolvedAt: number | null;
}

interface ThriveSummary {
  ref: string | null;
  tier: {
    key: string;
    name: string;
    minPoints: number;
    boostPct: number;
    perks: string[];
    color: string;
  } | null;
  nextTier: {
    key: string;
    name: string;
    minPoints: number;
  } | null;
  totalPoints: number;
  progressPct: number;
  totalClicks: number;
  linkCount: number;
}

interface CatalogItem {
  type: string;
  id: string;
  title: string;
  pricePaise: number;
  meta?: any;
}

interface PartnerLink {
  id: string;
  catalogType: string;
  catalogItemId: string;
  title: string;
  pricePaise: number;
  clicks: number;
  createdAt: number;
  lastClickedAt: number | null;
}

interface LedgerRow {
  referralId: string;
  clientId: string;
  clientName?: string | null;
  ratePct: number;
  amountPaise: number;
  status: string;
  createdAt: number | null;
  timeline: TimelineEvent[];
}

// Currency & Date formatters
const rs = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const rsExact = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const d = (ts: number) => new Date(ts * 1000).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const ago = (ts: number | null): string => {
  if (!ts) return '—';
  const s = Math.floor(Date.now() / 1000) - ts;
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  if (s < 86400 * 30) return `${Math.floor(s / 86400)}d ago`;
  return d(ts);
};

// 5 Divisions definition
interface DivisionConfig {
  id: string;
  name: string;
  badge: string;
  path: string;
  tagline: string;
  avgCommission: string;
  typicalFee: number; // in rupees
  estRate: number; // percentage
  color: string;
  whatsappText: (url: string) => string;
}

const DIVISIONS: DivisionConfig[] = [
  {
    id: 'study-abroad',
    name: 'Study Abroad & Admissions',
    badge: 'Education',
    path: '/study-abroad',
    tagline: '500+ Top Global Universities across UK, USA, Canada, Australia, Germany & Ireland.',
    avgCommission: '₹15,000 – ₹35,000 / student',
    typicalFee: 150000,
    estRate: 12,
    color: '#235a96',
    whatsappText: (url) => `Planning to study in the UK, USA, Canada, or Australia? Connect with Opus Overseas for 100% free study abroad counselling and verified visa guidance: ${url}`,
  },
  {
    id: 'visa-services',
    name: 'Global Visas & Immigration',
    badge: 'Immigration',
    path: '/visa-services',
    tagline: 'Tourist, Business, Work Permits & PR for 40+ countries with 99% approval.',
    avgCommission: '₹3,000 – ₹12,000 / case',
    typicalFee: 45000,
    estRate: 10,
    color: '#0d9488',
    whatsappText: (url) => `Fast-track visa processing with 99% document compliance for 40+ countries via Opus Overseas: ${url}`,
  },
  {
    id: 'tours-travels',
    name: 'Tours & Travels (Holidays & Umrah)',
    badge: 'Travel & Holidays',
    path: '/tours-travels',
    tagline: 'Curated world holidays, 5-Star Umrah packages, and custom getaways.',
    avgCommission: '₹5,000 – ₹10,000 / booking',
    typicalFee: 85000,
    estRate: 8,
    color: '#16a34a',
    whatsappText: (url) => `Explore world holiday tours, 5-Star Umrah packages, and custom getaways via Opus Overseas: ${url}`,
  },
  {
    id: 'attestation',
    name: 'Document Attestation & Apostille',
    badge: 'Compliance',
    path: '/attestation',
    tagline: 'MEA, HRD, Embassy attestation, Apostille & door-to-door courier tracking across India.',
    avgCommission: '₹1,500 – ₹4,500 / certificate',
    typicalFee: 20000,
    estRate: 15,
    color: '#7c3aed',
    whatsappText: (url) => `Verified MEA / Embassy certificate attestation and Apostille services across India with Opus Overseas: ${url}`,
  },
  {
    id: 'recruitment',
    name: 'International Manpower',
    badge: 'Recruitment',
    path: '/manpower',
    tagline: 'Overseas manpower recruitment for Gulf, Europe, and Asia across verified employers.',
    avgCommission: '₹10,000 – ₹25,000 / placement',
    typicalFee: 120000,
    estRate: 10,
    color: '#d97706',
    whatsappText: (url) => `Explore verified overseas career openings in Gulf and Europe with Opus Overseas: ${url}`,
  },
];

// Pre-approved Marketing Swipe Copies
const SWIPE_TEMPLATES = [
  {
    id: 'whatsapp-blast',
    title: 'WhatsApp Broadcast Message',
    channel: 'WhatsApp & SMS',
    hint: 'Best for direct 1-to-1 contacts or broadcasting to client groups.',
    body: (url: string) =>
      `Hi there! 👋 If you or anyone in your family is planning for Study Abroad (UK/US/Canada/Australia), Global Visas, Umrah Pilgrimages, Certificate Attestation, or Overseas Jobs, I highly recommend Opus Overseas.\n\nThey offer transparent guidance with exceptional success rates. Connect directly with their senior advisors here:\n👉 ${url}`,
  },
  {
    id: 'email-warm',
    title: 'Warm Email Introduction',
    channel: 'Email Newsletter / Client Note',
    hint: 'Use when emailing your existing client list or student alumni.',
    body: (url: string) =>
      `Subject: Trusted Partner for Global Visas, Study Abroad & Pilgrimages\n\nDear Client,\n\nNavigating international admissions, visa procedures, or pilgrimage travel requires verified, professional handling. I am pleased to partner with Opus Overseas — India's premier global mobility consultancy.\n\nWhether you require:\n• Direct University Admissions (UK, USA, Canada, Australia)\n• Fast-track Tourist, Business or Work Visas (40+ countries)\n• All-inclusive Umrah & Hajj Group Departures\n• MEA & Embassy Document Attestation / Apostille\n\nYou can book a priority consultation with their team here:\n${url}\n\nWarm regards,\nYour Trusted Partner`,
  },
  {
    id: 'social-linkedin',
    title: 'LinkedIn / Professional Post',
    channel: 'LinkedIn & Facebook',
    hint: 'High-trust copy for professional networks, HRs, and educators.',
    body: (url: string) =>
      `Global ambitions require seamless execution. 🛂🎓\n\nI am proud to partner with Opus Overseas to provide end-to-end pathways for:\n1. Global Higher Education & Scholarships\n2. Compliant Visa & Immigration Services\n3. Embassy Attestation & Apostille Logistics\n4. Verified Overseas Recruitment & Umrah Departures\n\nExplore official offerings or schedule an expert consultation:\n👉 ${url}\n\n#GlobalMobility #StudyAbroad #Immigration #OpusOverseas`,
  },
  {
    id: 'instagram-bio',
    title: 'Instagram Bio & Story Snippet',
    channel: 'Instagram Bio / Status',
    hint: 'Short & punchy format for bio links or swipe-up stories.',
    body: (url: string) =>
      `🛂 Official Partner @ Opus Overseas | Study Abroad • Fast-Track Visas • Umrah Packages • MEA Attestation\n🔗 Priority Consultation Link: ${url}`,
  },
];

// Visual Status Configs
const statusStyles: Record<string, string> = {
  matured: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30',
  pending: 'bg-amber-500/15 text-amber-700 border-amber-500/30',
  paid: 'bg-sky-500/15 text-sky-700 border-sky-500/30',
  held: 'bg-rose-500/15 text-rose-700 border-rose-500/30',
  unmatured: 'bg-slate-500/15 text-slate-700 border-slate-500/30',
};

const statusLabel: Record<string, string> = {
  matured: 'Earned (Payout Ready)',
  pending: 'Awaiting Agreement Sign',
  paid: 'Paid Out to Bank',
  held: 'Held (Under Review)',
  unmatured: 'Referral Tracked',
};

const payoutStatusStyles: Record<string, string> = {
  paid: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30',
  approved: 'bg-sky-500/15 text-sky-700 border-sky-500/30',
  requested: 'bg-amber-500/15 text-amber-700 border-amber-500/30',
  rejected: 'bg-rose-500/15 text-rose-700 border-rose-500/30',
};

// Sub-components
function AnimatedNumber({ value, prefix = '', suffix = '' }: { value: number; prefix?: string; suffix?: string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef<number | null>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (prev.current === null) {
      countUp(el, value, { prefix, suffix });
    } else if (prev.current !== value) {
      el.textContent = `${prefix}${value.toLocaleString('en-IN')}${suffix}`;
    }
    prev.current = value;
  }, [value, prefix, suffix]);
  return <span ref={ref}>{prefix}0{suffix}</span>;
}

function StatusChip({ status }: { status: string }) {
  const cls = statusStyles[status] || statusStyles.unmatured;

  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-bold uppercase tracking-wider ${cls}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${status === 'matured' || status === 'paid' ? 'bg-emerald-500' : status === 'pending' ? 'bg-amber-500' : 'bg-slate-400'}`} />
      {statusLabel[status] || status}
    </span>
  );
}

function MilestoneTimeline({ events }: { events: TimelineEvent[] }) {
  const isDone = (st?: string) => !st || !['pending', 'upcoming', 'todo', 'future'].includes(st);
  return (
    <div className="relative pl-6 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-[2px] before:bg-brand-navy/10 space-y-4">
      {events.map((e, idx) => (
        <div key={idx} className="relative flex items-start gap-3">
          <span className={`absolute -left-6 top-1 h-3.5 w-3.5 rounded-full border-2 border-white shadow-sm ${isDone(e.state) ? 'bg-brand-gold' : 'bg-slate-300'}`} />
          <div className="min-w-0 flex-1">
            <div className="text-xs font-bold text-brand-navy">{e.label}</div>
            <div className="text-[13px] text-brand-navy/50">{e.at ? ago(e.at) : 'Pending next stage'}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function PartnerDashboard() {
  useVisibilityTracking('/partner');
  const panelRef = useRef<HTMLDivElement>(null);
  const heroTitleRef = useRef<HTMLHeadingElement>(null);
  const queryClient = useQueryClient();

  // Toast system
  const [toast, setToast] = useState<{ show: boolean; msg: string; type?: 'gold' | 'success' | 'error' }>({ show: false, msg: '', type: 'gold' });
  const showToast = (msg: string, type: 'gold' | 'success' | 'error' = 'gold') => {
    setToast({ show: true, msg, type });
    setTimeout(() => setToast({ show: false, msg: '', type: 'gold' }), 4000);
  };

  // State management
  const [tab, setTab] = useState<TabKey>('overview');
  const [copiedLinkKey, setCopiedLinkKey] = useState<string | null>(null);
  const [openReferral, setOpenReferral] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  // QR Code Modal State
  const [qrModal, setQrModal] = useState<{ open: boolean; title: string; url: string }>({ open: false, title: '', url: '' });

  // Catalog browser state — P0 Deep Link Builder (FirstPromoter gold: division deep links + SubID)
  const [catalogType, setCatalogType] = useState<string>('university');
  const [catalogSearch, setCatalogSearch] = useState<string>('');
  const [utmCampaign, setUtmCampaign] = useState<string>('');
  const divisionForCatalog = (t: string) => t === 'university' ? 'study-abroad' : t === 'visa' ? 'visa-services' : t === 'umrah_package' ? 'tours-travels' : t === 'departure' ? 'tours-travels' : t === 'job' ? 'recruitment' : 'study-abroad';
  const deepLinkFor = (item: any) => {
    const base = typeof window !== 'undefined' ? window.location.origin : '';
    const div = divisionForCatalog(item.type);
    const ref = `ref=${refCode}`;
    const utm = utmCampaign.trim() ? `&utm_campaign=${encodeURIComponent(utmCampaign.trim())}` : '';
    const deep = item.type === 'visa' ? `?country=${encodeURIComponent(item.title.split(' ')[0])}&` : item.type === 'umrah_package' ? `?pkg=${item.id}&` : item.type === 'job' ? `?job=${item.id}&` : `?program=${encodeURIComponent(item.title)}&`;
    return `${base}/${div}${deep}${ref}${utm}`;
  };

  // Landing page Calculator State
  const [calcStudy, setCalcStudy] = useState(3);
  const [calcVisas, setCalcVisas] = useState(6);
  const [calcUmrah, setCalcUmrah] = useState(2);
  const [calcAttest, setCalcAttest] = useState(4);
  const [calcManpower, setCalcManpower] = useState(1);

  // Legacy Partner auth fallback
  const [partnerId, setPartnerId] = useState(() => localStorage.getItem('opus_partner_id') || '');
  const [, setPartnerName] = useState(() => localStorage.getItem('opus_partner_name') || '');
  const [partnerToken, setPartnerToken] = useState(() => localStorage.getItem('opus_partner_token') || '');

  // Sign In inputs
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [showAccessKey, setShowAccessKey] = useState(false);
  const [partnerIdInput, setPartnerIdInput] = useState('');
  const [tokenInput, setTokenInput] = useState('');

  // Registration KYC inputs
  const [kycName, setKycName] = useState('');
  const [kycEmail, setKycEmail] = useState('');
  const [kycPassword, setKycPassword] = useState('');
  const [kycPan, setKycPan] = useState('');
  const [kycBankAccount, setKycBankAccount] = useState('');
  const [kycIfsc, setKycIfsc] = useState('');

  // Manual Referral Log Inputs
  const [manualClientId, setManualClientId] = useState('');
  const [manualCommissionRate, setManualCommissionRate] = useState(10);

  // Payout Configuration State
  const [payoutMethod, setPayoutMethod] = useState<'bank' | 'upi'>('bank');
  const [payoutDetail, setPayoutDetail] = useState('');
  const [payoutThreshold, setPayoutThreshold] = useState(3000);
  const [editPayoutConfig, setEditPayoutConfig] = useState(false);

  // --------------------------------------------------------------------------
  // AUTH & SESSION DATA FETCHING
  // --------------------------------------------------------------------------
  const { data: session, isLoading: sessionLoading } = useQuery<PartnerSessionPayload>({
    queryKey: ['partnerSession'],
    queryFn: async () => {
      try {
        const res = await fetch('/api/public/partners/session', { credentials: 'include' });
        if (res.status === 401 || res.status === 404) return { success: true, authenticated: false, email: null };
        if (!res.ok) return { success: true, authenticated: false, email: null };
        return res.json();
      } catch {
        return { success: true, authenticated: false, email: null };
      }
    },
    retry: false,
    refetchOnWindowFocus: false,
  });

  const sessionActive = session?.authenticated === true && !!session?.partner;
  const activePartnerId = sessionActive && session?.partner
    ? session.partner.id
    : partnerId && partnerToken ? partnerId : null;

  const authHeaders = (json = false): Record<string, string> => {
    const h: Record<string, string> = {};
    if (!sessionActive && partnerToken) h['Authorization'] = `Bearer ${partnerToken}`;
    if (json) h['Content-Type'] = 'application/json';
    return h;
  };

  // --------------------------------------------------------------------------
  // PARTNER DATA QUERIES
  // --------------------------------------------------------------------------
  const { data: summary } = useQuery<PartnerSummary>({
    queryKey: ['partnerSummary', partnerId],
    queryFn: async () => {
      if (!partnerId) return null as unknown as PartnerSummary;
      const res = await fetch(`/api/public/partners/${partnerId}/summary`, { headers: authHeaders() });
      if (!res.ok) {
        setAuthError('Access failed — check your Partner ID and Access Key.');
        throw new Error(await res.text() || 'summary failed');
      }
      return res.json();
    },
    enabled: !!partnerId,
    retry: false,
  });

  const { data: thrive } = useQuery<ThriveSummary>({
    queryKey: ['partnerThrive', activePartnerId],
    queryFn: async () => {
      const r = await fetch(`/api/public/partners/${activePartnerId}/thrive`, { headers: authHeaders() });
      if (!r.ok) throw new Error('thrive');
      return r.json();
    },
    enabled: !!activePartnerId,
    retry: false,
  });

  const { data: referralDetail } = useQuery<ReferralDetailPayload>({
    queryKey: ['partnerReferralDetail', activePartnerId],
    queryFn: async () => {
      const r = await fetch(`/api/public/partners/${activePartnerId}/referrals/detail`, { headers: authHeaders() });
      if (r.status === 404) return { referrals: [] };
      if (!r.ok) throw new Error(await r.text() || 'referral detail failed');
      return r.json();
    },
    enabled: !!activePartnerId,
    retry: false,
    refetchInterval: 45000,
  });

  const { data: creativesData } = useQuery<CreativesPayload>({
    queryKey: ['partnerCreatives', activePartnerId],
    queryFn: async () => {
      const r = await fetch(`/api/public/partners/${activePartnerId}/creatives`, { headers: authHeaders() });
      if (r.status === 404) return { creatives: [] };
      if (!r.ok) throw new Error(await r.text() || 'creatives failed');
      return r.json();
    },
    enabled: !!activePartnerId,
    retry: false,
  });

  const { data: linksData } = useQuery<{ links: PartnerLink[] }>({
    queryKey: ['partnerLinks', activePartnerId],
    queryFn: async () => {
      const r = await fetch(`/api/public/partners/${activePartnerId}/links`, { headers: authHeaders() });
      if (!r.ok) throw new Error('links');
      return r.json();
    },
    enabled: !!activePartnerId,
  });

  const { data: payoutsData } = useQuery<{ payouts: PayoutRow[] }>({
    queryKey: ['partnerPayouts', activePartnerId],
    queryFn: async () => {
      const r = await fetch(`/api/public/partners/${activePartnerId}/payouts`, { headers: authHeaders() });
      if (!r.ok) throw new Error('payouts');
      return r.json();
    },
    enabled: !!activePartnerId,
  });

  const { data: catalog } = useQuery<{ items: CatalogItem[] }>({
    queryKey: ['partnerCatalog'],
    queryFn: async () => {
      const r = await fetch('/api/public/partners/catalog', { headers: authHeaders() });
      if (!r.ok) throw new Error('catalog');
      return r.json();
    },
    enabled: !!activePartnerId && tab === 'links',
  });

  // Partner realtime WebSocket sync for live commissions, leads, and payouts
  useEffect(() => {
    const enabled = (import.meta as any).env?.VITE_SYNC_ENABLED !== 'false';
    if (!enabled || !activePartnerId) return;

    const c = createSyncClient({
      plane: 'partner',
      apiToken: partnerToken,
      channels: [
        `partner:${activePartnerId}:commissions`,
        `partner:${activePartnerId}:referrals`,
        'public:catalog:umrah',
      ],
      enabled,
      onEvent: () => {
        queryClient.invalidateQueries({ queryKey: ['partnerSummary'] });
        queryClient.invalidateQueries({ queryKey: ['partnerSession'] });
        queryClient.invalidateQueries({ queryKey: ['partnerReferralDetail'] });
        queryClient.invalidateQueries({ queryKey: ['partnerPayouts'] });
        queryClient.invalidateQueries({ queryKey: ['partnerThrive'] });
      },
    });

    c.connect();
    return () => {
      try { (c as any).disconnect?.(); } catch {}
    };
  }, [activePartnerId, partnerToken, queryClient]);

  // Effective partner state
  const effectiveSummary: PartnerSummary | undefined = sessionActive && session
    ? {
        partner: {
          id: session.partner!.id,
          name: session.partner!.name,
          referralCode: session.partner!.referralCode,
          status: session.partner!.status,
          joinedAt: session.partner!.joinedAt,
        },
        totals: session.totals || { matured: 0, pending: 0, paid: 0, total: 0 },
        referrals: session.referrals || [],
      }
    : summary;

  const totals = effectiveSummary?.totals || { matured: 0, pending: 0, paid: 0, total: 0 };
  const referrals = effectiveSummary?.referrals || [];
  const rawRefCode = (effectiveSummary?.partner?.referralCode || '').replace(/^\?ref=/i, '');
  const refCode = rawRefCode || 'OPUS-PARTNER';
  const universalReferralLink = `${typeof window !== 'undefined' ? window.location.origin : ''}/lead-form?ref=${refCode}`;

  // Ledger calculation with detail merge
  const detailByRef = useMemo(() => new Map((referralDetail?.referrals || []).map((r) => [r.referralId, r])), [referralDetail]);
  const ledgerRows: LedgerRow[] = useMemo(() => {
    return referrals.map((r) => {
      const dt = detailByRef.get(r.referralId);
      return {
        referralId: r.referralId,
        clientId: r.referredClientId,
        clientName: dt?.clientName ?? null,
        ratePct: dt ? dt.commissionRate : r.ratePct,
        amountPaise: dt ? dt.amountPaise : r.amountPaise,
        status: dt?.status || r.status,
        createdAt: dt?.createdAt ?? null,
        timeline: dt?.timeline || [],
      };
    });
  }, [referrals, detailByRef]);

  // Filtered referrals
  const filteredLedger = useMemo(() => {
    return ledgerRows.filter((row) => {
      const matchesStatus = filterStatus === 'all' || row.status === filterStatus;
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q || row.clientId.toLowerCase().includes(q) || (row.clientName && row.clientName.toLowerCase().includes(q));
      return matchesStatus && matchesSearch;
    });
  }, [ledgerRows, filterStatus, searchQuery]);

  // Status counts
  const maturedCount = useMemo(() => ledgerRows.filter((r) => r.status === 'matured').length, [ledgerRows]);
  const pendingCount = useMemo(() => ledgerRows.filter((r) => r.status === 'pending' || r.status === 'unmatured').length, [ledgerRows]);
  const paidCount = useMemo(() => ledgerRows.filter((r) => r.status === 'paid').length, [ledgerRows]);
  const heldCount = useMemo(() => ledgerRows.filter((r) => r.status === 'held').length, [ledgerRows]);

  // Conversion metrics
  const totalReferredCount = ledgerRows.length;
  const maturedOrPaidCount = maturedCount + paidCount;
  const conversionRate = totalReferredCount > 0 ? Math.round((maturedOrPaidCount / totalReferredCount) * 100) : 0;

  // --------------------------------------------------------------------------
  // MUTATIONS
  // --------------------------------------------------------------------------
  const registerMutation = useMutation({
    mutationFn: async (payload: { name: string; email: string; password: string; panNumber: string; bankAccount: string; ifscCode: string }) => {
      const res = await fetch('/api/public/partners', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => null);
        throw new Error(d?.error || await res.text());
      }
      return res.json();
    },
    onSuccess: (d) => {
      if (d.success && d.partnerId) {
        track(EVENTS.partnerRegister);
        if (d.accountCreated) {
          setKycName(''); setKycPan(''); setKycBankAccount(''); setKycIfsc(''); setKycEmail(''); setKycPassword('');
          queryClient.invalidateQueries({ queryKey: ['partnerSession'] });
          showToast(d.message || 'Partner account created! Sign in to access your Command Center.', 'success');
        } else {
          localStorage.setItem('opus_partner_id', d.partnerId);
          localStorage.setItem('opus_partner_name', kycName);
          if (d.apiToken) {
            localStorage.setItem('opus_partner_token', d.apiToken);
            setPartnerToken(d.apiToken);
          }
          setPartnerId(d.partnerId);
          setPartnerName(kycName);
          setKycName(''); setKycPan(''); setKycBankAccount(''); setKycIfsc('');
          showToast('Welcome to Opus Partner Hub!', 'success');
        }
      }
    },
    onError: (e: any) => showToast(`Registration: ${e.message}`, 'error'),
  });

  const logReferralMutation = useMutation({
    mutationFn: async (payload: { partnerId: string; clientId: string; commissionRate: number }) => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (!sessionActive) headers['Authorization'] = `Bearer ${partnerToken}`;
      const res = await fetch('/api/public/partners/referrals', { method: 'POST', headers, body: JSON.stringify(payload) });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.error || await res.text());
      }
      return res.json();
    },
    onSuccess: () => {
      showToast('Referral logged successfully! It will mature once the client signs an agreement.', 'success');
      setManualClientId('');
      setManualCommissionRate(10);
      queryClient.invalidateQueries({ queryKey: ['partnerSummary', partnerId] });
      queryClient.invalidateQueries({ queryKey: ['partnerReferralDetail', activePartnerId] });
      queryClient.invalidateQueries({ queryKey: ['partnerSession'] });
    },
    onError: (e: any) => showToast(`Referral Log: ${e.message}`, 'error'),
  });

  const requestPayout = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/public/partners/${activePartnerId}/payouts`, { method: 'POST', headers: authHeaders(true) });
      if (!r.ok) {
        const e = await r.json().catch(() => null);
        throw new Error(e?.error || 'Payout request failed');
      }
      return r.json();
    },
    onSuccess: (d) => {
      queryClient.invalidateQueries({ queryKey: ['partnerPayouts', activePartnerId] });
      showToast(d.message || 'Payout request submitted — finance team will review and transfer.', 'success');
    },
    onError: (e: any) => showToast(`Payout: ${e.message}`, 'error'),
  });

  const savePayoutConfig = useMutation({
    mutationFn: async (payload: { payoutMethod: string; payoutDetail: string; payoutThresholdPaise: number }) => {
      const r = await fetch(`/api/public/partners/${activePartnerId}/payout-config`, {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify(payload),
      });
      if (!r.ok) {
        const e = await r.json().catch(() => null);
        throw new Error(e?.error || 'Failed to save payout preferences.');
      }
      return r.json();
    },
    onSuccess: (d: PayoutConfig) => {
      setPayoutMethod(d.payoutMethod || 'bank');
      setPayoutDetail(d.payoutDetail || '');
      setPayoutThreshold(d.payoutThresholdPaise ? d.payoutThresholdPaise / 100 : 3000);
      setEditPayoutConfig(false);
      showToast('Payout preferences securely saved.', 'success');
    },
    onError: (e: any) => showToast(`Payout Config: ${e.message}`, 'error'),
  });

  const createLinkMutation = useMutation({
    mutationFn: async (item: CatalogItem) => {
      const r = await fetch(`/api/public/partners/${activePartnerId}/links`, {
        method: 'POST',
        headers: authHeaders(true),
        body: JSON.stringify({
          catalogType: item.type,
          catalogItemId: item.id,
          title: item.title,
          pricePaise: item.pricePaise || 0,
          utmCampaign: utmCampaign.trim() || undefined,
          deepLink: deepLinkFor(item),
        }),
      });
      if (!r.ok) throw new Error('Failed to create link');
      return r.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['partnerLinks', activePartnerId] });
      queryClient.invalidateQueries({ queryKey: ['partnerThrive', activePartnerId] });
      queryClient.invalidateQueries({ queryKey: ['partnerClicks', activePartnerId] });
      showToast('Custom inventory link generated & added to your kit!', 'success');
    },
  });

  // --------------------------------------------------------------------------
  // HANDLERS
  // --------------------------------------------------------------------------
  const handleKyc = (e: React.FormEvent) => {
    e.preventDefault();
    if (!kycName.trim() || !kycPan.trim() || !kycBankAccount.trim() || !kycIfsc.trim()) {
      showToast('Please fill all mandatory KYC fields.', 'error');
      return;
    }
    const cleanPan = kycPan.trim().toUpperCase();
    if (!/^[A-Z]{5}[0-9]{4}[A-Z]$/.test(cleanPan)) {
      showToast('PAN must follow standard 10-char format: ABCDE1234F', 'error');
      return;
    }
    const cleanIfsc = kycIfsc.trim().toUpperCase();
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(cleanIfsc)) {
      showToast('IFSC must match format HDFC0000001 (4 letters, 0, 6 chars)', 'error');
      return;
    }
    if (kycEmail) {
      if (kycPassword.length < 8) {
        showToast('Password must be at least 8 characters.', 'error');
        return;
      }
      registerMutation.mutate({
        name: kycName.trim(),
        email: kycEmail.trim(),
        password: kycPassword,
        panNumber: cleanPan,
        bankAccount: kycBankAccount.trim(),
        ifscCode: cleanIfsc,
      });
    } else {
      registerMutation.mutate({
        name: kycName.trim(),
        email: '',
        password: '',
        panNumber: cleanPan,
        bankAccount: kycBankAccount.trim(),
        ifscCode: cleanIfsc,
      });
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail.trim() || !loginPassword) {
      setAuthError('Enter both your registered email and password.');
      return;
    }
    setAuthError('');
    try {
      const res = await fetch('/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: loginEmail.trim(), password: loginPassword }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || err?.error || 'Sign-in failed. Please verify credentials.');
      }
      setLoginEmail(''); setLoginPassword('');
      queryClient.invalidateQueries({ queryKey: ['partnerSession'] });
      showToast('Signed in successfully — welcome back!', 'success');
    } catch (err: any) {
      setAuthError(err.message);
    }
  };

  const handleLegacyLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!partnerIdInput.trim() || !tokenInput.trim()) {
      setAuthError('Enter both your Partner ID and Access Key.');
      return;
    }
    setAuthError('');
    localStorage.setItem('opus_partner_id', partnerIdInput.trim());
    localStorage.setItem('opus_partner_token', tokenInput.trim());
    setPartnerId(partnerIdInput.trim());
    setPartnerToken(tokenInput.trim());
    setPartnerName('Partner');
    setPartnerIdInput(''); setTokenInput('');
    showToast('Signed in with Access Key.', 'success');
  };

  const handleLogout = () => {
    fetch('/api/auth/sign-out', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    }).catch(() => {});
    localStorage.removeItem('opus_partner_id');
    localStorage.removeItem('opus_partner_token');
    localStorage.removeItem('opus_partner_name');
    setPartnerId(''); setPartnerToken(''); setPartnerName('');
    queryClient.invalidateQueries({ queryKey: ['partnerSession'] });
    showToast('Signed out of Partner Command Center.', 'gold');
  };

  const handleManualReferral = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualClientId.trim()) {
      showToast('Enter the client token to attribute (e.g. OP-2026-XXXX).', 'error');
      return;
    }
    logReferralMutation.mutate({
      partnerId: activePartnerId || '',
      clientId: manualClientId.trim().toUpperCase(),
      commissionRate: manualCommissionRate,
    });
  };

  const copyToClipboard = async (text: string, keyName: string, label = 'Link') => {
    try {
      await navigator.clipboard.writeText(text);
      track(EVENTS.shareCopied);
      setCopiedLinkKey(keyName);
      setTimeout(() => setCopiedLinkKey(null), 2500);
      showToast(`${label} copied to clipboard!`, 'success');
    } catch {
      showToast('Unable to copy to clipboard', 'error');
    }
  };

  const openWhatsApp = (msg: string) => {
    window.open(`https://wa.me/?text=${encodeURIComponent(msg)}`, '_blank');
  };

  const handleSaveConfig = (e: React.FormEvent) => {
    e.preventDefault();
    if (!payoutDetail.trim()) {
      showToast('Please enter your Bank Account/IFSC or UPI ID.', 'error');
      return;
    }
    savePayoutConfig.mutate({
      payoutMethod,
      payoutDetail: payoutDetail.trim(),
      payoutThresholdPaise: Math.max(0, Math.round(payoutThreshold * 100)),
    });
  };

  // Pending payout request
  const pendingPayout = (payoutsData?.payouts || []).find((p) => p.status === 'requested');

  // GSAP Entrance Animations
  const reveal = () => staggerReveal('.partner-fade', { y: 20, duration: 0.65, stagger: 0.06 });

  useEffect(() => {
    const ctx = makeContext(panelRef.current);
    ctx.add(() => {
      whenFontsReady().then(reveal);
    });
    return () => ctx.revert();
  }, []);

  useEffect(() => {
    if (heroTitleRef.current) fadeUp(heroTitleRef.current, { y: 24, duration: 0.8, delay: 0.15 });
  }, [sessionActive]);

  useEffect(() => {
    if (!prefersReducedMotion()) window.scrollTo({ top: 0, behavior: 'smooth' });
    const t = setTimeout(reveal, 60);
    return () => clearTimeout(t);
  }, [tab, sessionActive]);

  // Projected Commission calculation for Landing Simulator
  const simulatedMonthlyEarnings = useMemo(() => {
    return (calcStudy * 20000) + (calcVisas * 5000) + (calcUmrah * 8000) + (calcAttest * 2500) + (calcManpower * 15000);
  }, [calcStudy, calcVisas, calcUmrah, calcAttest, calcManpower]);

  const baseInput = 'w-full rounded-xl border border-brand-navy/15 bg-white px-3.5 py-2.5 text-xs text-brand-navy placeholder:text-slate-400 focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 focus:outline-none transition';
  const goldBtn = 'tactile-btn rounded-full bg-brand-gold px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-brand-navy transition hover:bg-brand-gold-hover hover:text-white active:scale-[0.97] disabled:opacity-40 shadow-sm inline-flex items-center justify-center gap-1.5 cursor-pointer';
  const navyBtn = 'tactile-btn rounded-full bg-brand-navy px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-brand-gold hover:text-brand-navy active:scale-[0.97] disabled:opacity-40 shadow-sm inline-flex items-center justify-center gap-1.5 cursor-pointer';

  return (
    <div ref={panelRef} className="relative min-h-screen overflow-hidden bg-brand-cream font-sans text-brand-navy">
      <div className="film-grain" aria-hidden="true" />
      <Nav />

      <main className="relative min-h-screen">
        {sessionLoading && !activePartnerId ? (
          <div className="flex min-h-[70vh] flex-col items-center justify-center gap-4">
            <div className="h-10 w-10 animate-spin rounded-full border-3 border-brand-gold border-t-transparent" />
            <p className="text-xs font-bold uppercase tracking-widest text-brand-navy/60">Loading Partner Hub…</p>
          </div>
        ) : !activePartnerId ? (
          /* ================================================================ */
          /* LANDING & KYC ONBOARDING VIEW (UNAUTHENTICATED)                   */
          /* ================================================================ */
          <div className="relative min-h-screen pb-20">
            {/* LiveWallpaper strictly behind cards */}
            <div className="pointer-events-none absolute inset-0 -z-10 overflow-hidden" aria-hidden="true">
              <LiveWallpaper />
              <div className="hero-orb -left-20 top-20 h-96 w-96 bg-brand-gold/15 blur-3xl" />
              <div className="hero-orb -right-20 top-1/3 h-[32rem] w-[32rem] bg-brand-blue/20 blur-3xl" />
            </div>

            <div className="relative z-20 mx-auto max-w-6xl px-5 pt-28 md:px-8">
              {/* Portal Header Pill */}
              <div className="mb-8 flex flex-wrap items-center justify-between gap-3">
                <span className="inline-flex items-center gap-2 rounded-full border border-brand-gold/40 bg-white/80 px-3.5 py-1.5 text-[13px] font-bold uppercase tracking-[0.18em] text-brand-gold shadow-sm backdrop-blur">
                  <Logo className="h-4 w-auto" /> Opus Overseas · Growth & Affiliate Network
                </span>
                <Link href="/portal" className="rounded-full border border-brand-navy/15 bg-white/80 px-3.5 py-1.5 text-xs font-semibold text-brand-navy/70 transition hover:border-brand-gold hover:text-brand-gold backdrop-blur">
                  Looking for Client Portal? →
                </Link>
              </div>

              {/* Hero Banner Card */}
              <section className="partner-fade relative z-20 overflow-hidden rounded-[2rem] border border-brand-navy/10 bg-white p-8 shadow-[0_24px_60px_-30px_rgba(10,45,80,0.25)] md:p-12">
                <div className="pointer-events-none absolute -right-16 -top-20 h-80 w-80 rounded-full bg-brand-gold/10 blur-3xl" aria-hidden="true" />
                <div className="relative z-10 max-w-3xl">
                  <div className="inline-flex items-center gap-2 rounded-full bg-brand-gold/10 px-3.5 py-1 text-[13px] font-bold uppercase tracking-[0.2em] text-brand-gold">
                    <span className="live-pulse-dot text-brand-gold" /> Institutional Affiliate Program
                  </div>
                  <h1 className="mt-4 font-display text-3xl font-extrabold tracking-tight text-brand-navy md:text-5xl lg:leading-[1.1]">
                    Turn your client network into substantial recurring commission.
                  </h1>
                  <p className="mt-4 text-sm leading-relaxed text-brand-navy/70 md:text-base">
                    Partner with Opus Overseas — India’s trusted global mobility platform. Monetize your referrals across Study Abroad, Global Visas, Umrah Pilgrimages, Attestation, and International Recruitment with real-time attribution and direct bank settlement.
                  </p>

                  {/* Program Highlights Ribbon */}
                  <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
                    {[
                      { label: '5 High-Yield Verticals', sub: 'Education, Visa, Umrah & Jobs' },
                      { label: 'Up to 15% Payout', sub: 'Calculated on gross service fees' },
                      { label: 'Sub-Minute Tracking', sub: 'No lost cookies or attribution gap' },
                      { label: 'Automated Clearance', sub: 'Direct NEFT/RTGS/UPI transfers' },
                    ].map((item, idx) => (
                      <div key={idx} className="rounded-xl border border-brand-navy/10 bg-brand-cream/70 p-3.5">
                        <div className="text-xs font-extrabold text-brand-navy">{item.label}</div>
                        <div className="mt-0.5 text-[13px] text-brand-navy/50">{item.sub}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </section>

              {/* Interactive Commission Simulator (CRO Tool) */}
              <section className="partner-fade relative z-20 mt-10 rounded-[2rem] border border-brand-gold/30 bg-gradient-to-br from-white via-white to-brand-gold/5 p-8 shadow-md md:p-10">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-brand-navy/10 pb-6">
                  <div>
                    <span className="text-[13px] font-bold uppercase tracking-[0.18em] text-brand-gold">Interactive Partner Yield Calculator</span>
                    <h2 className="mt-1 font-display text-xl font-extrabold text-brand-navy md:text-2xl">
                      Estimate your monthly affiliate revenue
                    </h2>
                  </div>
                  <div className="rounded-2xl border border-brand-gold/40 bg-brand-gold/10 px-5 py-3 text-right">
                    <div className="text-[13px] font-bold uppercase tracking-wider text-slate-500">Estimated Monthly Earnings</div>
                    <div className="font-display text-2xl font-black text-brand-gold md:text-3xl">
                      ₹{simulatedMonthlyEarnings.toLocaleString('en-IN')}
                    </div>
                    <div className="text-[13px] font-semibold text-emerald-700">
                      ≈ ₹{(simulatedMonthlyEarnings * 12).toLocaleString('en-IN')}/year
                    </div>
                  </div>
                </div>

                <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-5">
                  {[
                    { label: 'Study Abroad Clients', val: calcStudy, set: setCalcStudy, rate: '₹20,000 avg', min: 0, max: 20 },
                    { label: 'Global Visa Cases', val: calcVisas, set: setCalcVisas, rate: '₹5,000 avg', min: 0, max: 30 },
                    { label: 'Umrah Pilgrims', val: calcUmrah, set: setCalcUmrah, rate: '₹8,000 avg', min: 0, max: 25 },
                    { label: 'Attestation Chains', val: calcAttest, set: setCalcAttest, rate: '₹2,500 avg', min: 0, max: 30 },
                    { label: 'Manpower Placements', val: calcManpower, set: setCalcManpower, rate: '₹15,000 avg', min: 0, max: 15 },
                  ].map((ctrl) => (
                    <div key={ctrl.label} className="rounded-xl border border-brand-navy/10 bg-white p-4 shadow-sm">
                      <div className="flex items-center justify-between text-xs font-bold text-brand-navy">
                        <span>{ctrl.label}</span>
                        <span className="font-display text-brand-gold">{ctrl.val}</span>
                      </div>
                      <input
                        type="range"
                        min={ctrl.min}
                        max={ctrl.max}
                        value={ctrl.val}
                        onChange={(e) => ctrl.set(parseInt(e.target.value) || 0)}
                        className="mt-3 w-full accent-brand-gold cursor-pointer"
                      />
                      <div className="mt-2 text-[13px] text-slate-500">{ctrl.rate}</div>
                    </div>
                  ))}
                </div>
              </section>

              {/* 2-Column Auth and Registration Grid */}
              <div className="mt-10 grid grid-cols-1 gap-8 lg:grid-cols-2 relative z-20">
                {/* Column 1: KYC Registration Form */}
                <section className="partner-fade relative z-20 rounded-2xl border border-brand-navy/10 bg-white p-6 md:p-8 shadow-sm">
                  <div className="flex items-center justify-between">
                    <div>
                      <h2 className="font-display text-xl font-bold text-brand-navy">Become an Opus Partner</h2>
                      <p className="mt-1 text-xs text-brand-navy/60">One-minute onboarding with direct KYC encryption.</p>
                    </div>
                    <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-bold uppercase tracking-wider text-emerald-700">Instant Approval</span>
                  </div>

                  <form onSubmit={handleKyc} className="lead-form-wrap mt-6 space-y-4">
                    <div>
                      <label className="mb-1 block text-[13px] font-bold uppercase tracking-wider text-brand-gold">Full Name / Agency Name</label>
                      <input
                        type="text"
                        value={kycName}
                        onChange={(e) => setKycName(e.target.value)}
                        placeholder="e.g. Skyline Educational Consultancy"
                        className={baseInput}
                        required
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-[13px] font-bold uppercase tracking-wider text-brand-gold">Official Email</label>
                        <input
                          type="email"
                          value={kycEmail}
                          onChange={(e) => setKycEmail(e.target.value)}
                          placeholder="partner@agency.com"
                          className={baseInput}
                          required
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[13px] font-bold uppercase tracking-wider text-brand-gold">Password (Min 8 chars)</label>
                        <input
                          type="password"
                          value={kycPassword}
                          onChange={(e) => setKycPassword(e.target.value)}
                          placeholder="Create password"
                          className={baseInput}
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between">
                        <label className="mb-1 block text-[13px] font-bold uppercase tracking-wider text-brand-gold">PAN Number (10 Chars)</label>
                        <span className="text-xs text-slate-400">Format: ABCDE1234F</span>
                      </div>
                      <input
                        type="text"
                        maxLength={10}
                        value={kycPan}
                        onChange={(e) => setKycPan(e.target.value.toUpperCase())}
                        placeholder="ABCDE1234F"
                        className={`${baseInput} font-mono tracking-wider`}
                        required
                      />
                    </div>

                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                      <div>
                        <label className="mb-1 block text-[13px] font-bold uppercase tracking-wider text-brand-gold">Bank Account Number</label>
                        <input
                          type="text"
                          value={kycBankAccount}
                          onChange={(e) => setKycBankAccount(e.target.value)}
                          placeholder="50100123456789"
                          className={`${baseInput} font-mono`}
                          required
                        />
                      </div>
                      <div>
                        <div className="flex items-center justify-between">
                          <label className="mb-1 block text-[13px] font-bold uppercase tracking-wider text-brand-gold">Bank IFSC Code</label>
                          <span className="text-xs text-slate-400">e.g. HDFC0000001</span>
                        </div>
                        <input
                          type="text"
                          maxLength={11}
                          value={kycIfsc}
                          onChange={(e) => setKycIfsc(e.target.value.toUpperCase())}
                          placeholder="HDFC0000001"
                          className={`${baseInput} font-mono tracking-wider`}
                          required
                        />
                      </div>
                    </div>

                    <div className="rounded-xl border border-brand-navy/10 bg-slate-50 p-3 text-[13px] leading-relaxed text-brand-navy/70 flex items-start gap-2">
                      <span className="text-brand-gold font-bold">🔒</span>
                      <span>
                        <strong>DPDP-2023 Compliant:</strong> Your PAN and banking credentials are AES-GCM encrypted at rest. PII is strictly masked across all portal surfaces.
                      </span>
                    </div>

                    <button type="submit" disabled={registerMutation.isPending} className={`${navyBtn} w-full py-3.5`}>
                      {registerMutation.isPending ? 'Validating KYC…' : 'Complete KYC & Get Referral Kit'}
                    </button>
                  </form>
                </section>

                {/* Column 2: Sign In & Partner Guarantees */}
                <section className="flex flex-col gap-6 relative z-20">
                  <div className="partner-fade relative z-20 rounded-2xl border border-brand-navy/10 bg-white p-6 md:p-8 shadow-sm">
                    <h2 className="font-display text-xl font-bold text-brand-navy">Sign In to Partner Hub</h2>
                    <p className="mt-1 text-xs text-brand-navy/60">Access your live telemetry, commission ledger, and custom links.</p>

                    <form onSubmit={handleLogin} className="lead-form-wrap mt-6 space-y-4">
                      <div>
                        <label className="mb-1 block text-[13px] font-bold uppercase tracking-wider text-brand-gold">Registered Email</label>
                        <input
                          type="email"
                          value={loginEmail}
                          onChange={(e) => setLoginEmail(e.target.value)}
                          placeholder="partner@agency.com"
                          className={baseInput}
                        />
                      </div>
                      <div>
                        <label className="mb-1 block text-[13px] font-bold uppercase tracking-wider text-brand-gold">Password</label>
                        <input
                          type="password"
                          value={loginPassword}
                          onChange={(e) => setLoginPassword(e.target.value)}
                          placeholder="Enter your password"
                          className={baseInput}
                        />
                      </div>

                      {authError && (
                        <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm font-medium text-rose-700">
                          {authError}
                        </div>
                      )}

                      <button type="submit" className={`${goldBtn} w-full py-3.5`}>
                        Sign In to Partner Hub
                      </button>
                    </form>

                    <div className="mt-6 border-t border-brand-navy/10 pt-4">
                      <button
                        onClick={() => setShowAccessKey((v) => !v)}
                        className="text-sm font-semibold text-brand-navy/70 transition hover:text-brand-gold cursor-pointer"
                      >
                        {showAccessKey ? '← Return to standard Email Sign In' : 'Have a Legacy Partner ID & Access Key? Click here'}
                      </button>

                      {showAccessKey && (
                        <form onSubmit={handleLegacyLogin} className="lead-form-wrap mt-4 space-y-3">
                          <div>
                            <label className="mb-1 block text-[13px] font-bold uppercase tracking-wider text-brand-gold">Partner ID (UUID)</label>
                            <input
                              value={partnerIdInput}
                              onChange={(e) => setPartnerIdInput(e.target.value)}
                              placeholder="e.g. a8b9c0d1-…"
                              className={`${baseInput} font-mono text-sm`}
                            />
                          </div>
                          <div>
                            <label className="mb-1 block text-[13px] font-bold uppercase tracking-wider text-brand-gold">Access Key Token</label>
                            <input
                              value={tokenInput}
                              onChange={(e) => setTokenInput(e.target.value)}
                              placeholder="Paste bearer token"
                              className={`${baseInput} font-mono text-sm`}
                            />
                          </div>
                          <button type="submit" className={`${navyBtn} w-full py-2.5`}>
                            Authenticate with Token
                          </button>
                        </form>
                      )}
                    </div>
                  </div>

                  {/* Sandbox / Trust Card */}
                  <div className="rounded-2xl border border-brand-gold/40 bg-brand-gold/10 p-6 text-xs leading-relaxed text-brand-navy/80 space-y-2 shadow-sm">
                    <div className="font-display font-bold text-brand-navy flex items-center gap-2">
                      <span className="gold-dot" /> Institutional Growth Commitment
                    </div>
                    <p className="text-sm text-brand-navy/70">
                      Opus Overseas guarantees 100% transparent milestone tracking. Every client referred via your link is permanently attributed, with real-time status updates as they advance from document review to visa stamping.
                    </p>
                  </div>
                </section>
              </div>
            </div>
          </div>
        ) : (
          /* ================================================================ */
          /* AUTHENTICATED PARTNER COMMAND CENTER                             */
          /* ================================================================ */
          <div className="relative min-h-screen pb-20">
            {/* HERO TELEMETRY RIBBON (LUXURY BRAND NAVY) */}
            <section className="relative overflow-hidden bg-gradient-to-br from-brand-navy-900 via-brand-navy to-brand-navy-800 text-white shadow-xl">
              <div className="pointer-events-none absolute inset-0 -z-10" aria-hidden="true">
                <LiveWallpaper />
                <div className="hero-orb -left-20 top-1/4 h-[30rem] w-[30rem] bg-brand-gold/15 blur-3xl" />
                <div className="hero-orb -right-20 bottom-0 h-96 w-96 bg-brand-blue/30 blur-3xl" />
              </div>

              <div className="relative z-10 mx-auto max-w-6xl px-5 pt-28 pb-10 md:px-8">
                {/* Top Telemetry Header */}
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-6">
                  <div className="flex items-center gap-3">
                    <span className="inline-flex items-center gap-2 text-[13px] font-bold uppercase tracking-[0.2em] text-brand-gold">
                      <Logo className="h-5 w-auto" /> Partner Command Center
                    </span>
                    <span className="hidden sm:inline-block text-white/30">|</span>
                    <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/40 bg-emerald-500/15 px-3 py-0.5 text-xs font-bold uppercase tracking-wider text-emerald-300">
                      <span className="live-pulse-dot text-emerald-400" /> Active & Verified
                    </span>
                  </div>

                  <div className="flex items-center gap-3">
                    <Link href="/portal" className="text-xs font-semibold text-white/70 transition hover:text-brand-gold">
                      Client Tracker
                    </Link>
                    <button
                      onClick={handleLogout}
                      className="rounded-full border border-white/20 px-4 py-1.5 text-xs font-semibold text-white/80 transition hover:border-brand-gold hover:text-brand-gold cursor-pointer"
                    >
                      Sign Out
                    </button>
                  </div>
                </div>

                {/* Partner Identity Strip */}
                <div className="mt-6 flex flex-wrap items-end justify-between gap-6">
                  <div>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <span
                        className="inline-flex items-center gap-1.5 rounded-full px-3 py-0.5 text-[13px] font-bold uppercase tracking-wider text-white shadow-sm"
                        style={{ backgroundColor: thrive?.tier?.color || '#b87333' }}
                      >
                        ★ {thrive?.tier?.name || 'Bronze Partner'}
                      </span>
                      {thrive?.tier?.boostPct ? (
                        <span className="rounded-full border border-brand-gold/50 bg-brand-gold/20 px-2.5 py-0.5 text-xs font-extrabold text-brand-gold">
                          +{thrive.tier.boostPct}% Boost Active
                        </span>
                      ) : null}
                    </div>

                    <h1 ref={heroTitleRef} className="mt-2 font-display text-3xl font-extrabold tracking-tight md:text-4xl text-white">
                      {effectiveSummary?.partner?.name || 'Partner Executive'}
                    </h1>
                    <p className="mt-1 text-xs text-white/60">
                      Partner ID: <code className="font-mono text-brand-gold">{activePartnerId?.slice(0, 12)}…</code> · Joined {effectiveSummary?.partner?.joinedAt ? d(effectiveSummary.partner.joinedAt) : 'Recently'}
                    </p>
                  </div>

                  {/* Hero Quick Actions */}
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      onClick={() => setQrModal({ open: true, title: 'Universal Referral QR Code', url: universalReferralLink })}
                      className="tactile-btn rounded-full border border-white/20 bg-white/10 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white transition hover:border-brand-gold hover:text-brand-gold active:scale-[0.97] cursor-pointer inline-flex items-center gap-1.5"
                    >
                      <span>▦</span> QR Studio
                    </button>
                    <button
                      onClick={() => openWhatsApp(`Opus Overseas — premium study abroad, visas, Umrah packages and attestation: ${universalReferralLink}`)}
                      className="tactile-btn rounded-full bg-emerald-600 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-emerald-500 active:scale-[0.97] cursor-pointer inline-flex items-center gap-1.5"
                    >
                      <span>💬</span> WhatsApp Share
                    </button>
                    <button
                      onClick={() => copyToClipboard(universalReferralLink, 'hero-link', 'Universal Link')}
                      className={goldBtn}
                    >
                      {copiedLinkKey === 'hero-link' ? '✓ Copied Link' : 'Copy Main Link'}
                    </button>
                  </div>
                </div>

                {/* KPI TELEMETRY GRID (6 Telemetry Cards) */}
                <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
                  {[
                    { label: 'Total Earnings', val: totals.total, prefix: '₹', highlight: 'text-brand-gold', sub: `${rsExact(totals.total)} lifetime` },
                    { label: 'Available Balance', val: totals.matured, prefix: '₹', highlight: 'text-emerald-400', sub: 'Ready for payout' },
                    { label: 'Pending Pipeline', val: totals.pending, prefix: '₹', highlight: 'text-sky-300', sub: 'Awaiting client sign' },
                    { label: 'Paid Out', val: totals.paid, prefix: '₹', highlight: 'text-white', sub: 'Disbursed to bank' },
                    { label: 'Referred Clients', val: totalReferredCount, prefix: '', highlight: 'text-white', sub: `${maturedOrPaidCount} converted` },
                    { label: 'Conversion Rate', val: conversionRate, suffix: '%', highlight: 'text-brand-gold', sub: 'Sign-to-lead ratio' },
                  ].map((card, idx) => (
                    <div key={idx} className="partner-fade rounded-2xl border border-white/10 bg-white/5 p-4 backdrop-blur-md transition hover:border-brand-gold/40">
                      <div className="text-[13px] font-bold uppercase tracking-wider text-white/50">{card.label}</div>
                      <div className={`mt-2 font-display text-xl font-black ${card.highlight}`}>
                        <AnimatedNumber value={card.val} prefix={card.prefix || ''} suffix={card.suffix || ''} />
                      </div>
                      <div className="mt-1 text-[13px] text-white/40">{card.sub}</div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            {/* STICKY LUXURY NAVIGATION TAB BAR */}
            <div className="sticky top-0 z-30 border-b border-brand-navy/10 bg-[#FAF8F4]/90 backdrop-blur-xl shadow-xs">
              <nav className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3 md:px-8">
                <div className="flex flex-wrap items-center gap-1.5 rounded-2xl bg-white/90 p-1.5 shadow-sm border border-brand-navy/10">
                  {[
                    { key: 'overview' as TabKey, label: 'Command Cockpit' },
                    { key: 'links' as TabKey, label: '1-Click Links & Creative Kit' },
                    { key: 'referrals' as TabKey, label: `Commission Ledger (${totalReferredCount})` },
                    { key: 'payouts' as TabKey, label: 'Payout Station' },
                    { key: 'tiers' as TabKey, label: `VIP Loyalty Tier (${thrive?.totalPoints || 0} pts)` },
                  ].map((t) => (
                    <button
                      key={t.key}
                      onClick={() => setTab(t.key)}
                      className={`tactile-btn rounded-xl px-4 py-2 text-xs font-bold uppercase tracking-wider transition-all duration-200 cursor-pointer flex items-center gap-1.5 ${
                        tab === t.key
                          ? 'bg-gradient-to-r from-brand-gold to-amber-500 text-brand-navy font-black shadow-sm'
                          : 'text-brand-navy/60 hover:text-brand-navy hover:bg-brand-navy/5'
                      }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>

                <div className="hidden items-center gap-2 pr-3 text-[13px] font-black uppercase tracking-wider text-brand-gold lg:flex">
                  <span className="h-2 w-2 rounded-full bg-brand-gold shadow-[0_0_8px_rgba(215,160,25,0.9)] animate-pulse" /> Real-Time Telemetry
                </div>
              </nav>
            </div>

            {/* TAB CONTENT PANELS */}
            <div className="mx-auto max-w-6xl space-y-8 px-5 py-8 md:px-8">
              {/* ============================================================ */}
              {/* TAB 1: OVERVIEW COCKPIT & LIVE KANBAN HUB                    */}
              {/* ============================================================ */}
              {tab === 'overview' && (
                <PartnerDashboardHub
                  partnerName={effectiveSummary?.partner?.name || 'Partner Executive'}
                  partnerCode={refCode || 'OPUS-PARTNER'}
                  partnerTier={thrive?.tier?.name || 'Gold Partner'}
                  totals={totals}
                  referrals={effectiveSummary?.referrals || []}
                  onNavigateTab={(t) => setTab(t)}
                  onQuickReferralSubmit={async (lead) => {
                    await logReferralMutation.mutateAsync({
                      partnerId: activePartnerId || '',
                      clientId: (lead.phone || lead.email).toUpperCase(),
                      commissionRate: manualCommissionRate,
                    });
                  }}
                />
              )}

              {/* ============================================================ */}
              {/* TAB 2: 1-CLICK LINKS & CREATIVE KIT                          */}
              {/* ============================================================ */}
              {tab === 'links' && (
                <div className="space-y-8">
                  {/* Division Link Hub */}
                  <section className="partner-fade clay-card p-6 md:p-8">
                    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-brand-navy/10 pb-4">
                      <div>
                        <h3 className="font-display text-lg font-bold text-brand-navy">5-Division Link & QR Kit</h3>
                        <p className="text-xs text-brand-navy/60">Generate targeted referral links and marketing assets for each business line.</p>
                      </div>
                    </div>

                    <div className="mt-6 grid grid-cols-1 gap-5 md:grid-cols-2">
                      {DIVISIONS.map((div) => {
                        const targetUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}${div.path}?ref=${refCode}`;
                        return (
                          <div key={div.id} className="rounded-2xl border border-brand-navy/10 bg-white p-5 shadow-sm space-y-3">
                            <div className="flex items-center justify-between">
                              <span className="rounded-full px-3 py-1 text-xs font-bold uppercase tracking-wider text-white" style={{ backgroundColor: div.color }}>
                                {div.badge}
                              </span>
                              <span className="text-xs font-bold text-emerald-700">{div.avgCommission}</span>
                            </div>
                            <div>
                              <h4 className="font-display text-sm font-bold text-brand-navy">{div.name}</h4>
                              <p className="mt-1 text-xs text-brand-navy/60">{div.tagline}</p>
                            </div>
                            <div className="rounded-xl border border-brand-navy/10 bg-slate-50 p-2.5 font-mono text-sm text-brand-navy/80 truncate">
                              {targetUrl}
                            </div>
                            <div className="flex items-center gap-2 pt-2">
                              <button
                                onClick={() => copyToClipboard(targetUrl, `tab2-${div.id}`, div.name)}
                                className="tactile-btn flex-1 rounded-full bg-brand-navy py-2 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-brand-gold hover:text-brand-navy cursor-pointer"
                              >
                                {copiedLinkKey === `tab2-${div.id}` ? '✓ Copied Link' : 'Copy Link'}
                              </button>
                              <button
                                onClick={() => openWhatsApp(div.whatsappText(targetUrl))}
                                className="tactile-btn rounded-full bg-emerald-600 px-4 py-2 text-xs font-bold text-white transition hover:bg-emerald-500 cursor-pointer"
                              >
                                💬 WhatsApp
                              </button>
                              <button
                                onClick={() => setQrModal({ open: true, title: `${div.name} QR Code`, url: targetUrl })}
                                className="tactile-btn rounded-full border border-brand-navy/20 bg-white px-4 py-2 text-xs font-bold text-brand-navy transition hover:border-brand-gold hover:text-brand-gold cursor-pointer"
                              >
                                ▦ QR
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>

                  {/* PRE-APPROVED COPY SWIPES */}
                  <section className="partner-fade clay-card p-6 md:p-8">
                    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-brand-navy/10 pb-4">
                      <div>
                        <span className="text-[13px] font-bold uppercase tracking-[0.18em] text-brand-gold">Ready-to-Use Copy</span>
                        <h3 className="mt-0.5 font-display text-lg font-bold text-brand-navy">High-Converting Swipe Files</h3>
                        <p className="text-xs text-brand-navy/60">Pre-approved compliance text with your referral link auto-inserted.</p>
                      </div>
                    </div>

                    <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-2">
                      {SWIPE_TEMPLATES.map((swipe) => {
                        const swipeText = swipe.body(universalReferralLink);
                        return (
                          <div key={swipe.id} className="flex flex-col justify-between rounded-2xl border border-brand-navy/10 bg-slate-50 p-5">
                            <div>
                              <div className="flex items-center justify-between">
                                <h4 className="font-display text-sm font-bold text-brand-navy">{swipe.title}</h4>
                                <span className="rounded-full bg-brand-gold/15 px-2.5 py-0.5 text-xs font-bold uppercase text-brand-gold">
                                  {swipe.channel}
                                </span>
                              </div>
                              <p className="mt-1 text-[13px] text-brand-navy/50">{swipe.hint}</p>
                              <div className="mt-3 max-h-36 overflow-y-auto whitespace-pre-wrap rounded-xl border border-brand-navy/10 bg-white p-3 font-sans text-xs leading-relaxed text-brand-navy/80">
                                {swipeText}
                              </div>
                            </div>

                            <button
                              onClick={() => copyToClipboard(swipeText, `swipe-${swipe.id}`, swipe.title)}
                              className="tactile-btn mt-4 w-full rounded-full bg-brand-navy py-2 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-brand-gold hover:text-brand-navy cursor-pointer"
                            >
                              {copiedLinkKey === `swipe-${swipe.id}` ? '✓ Copied Full Swipe Text' : 'Copy Message'}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </section>

                  {/* DYNAMIC CREATIVES FROM SERVER */}
                  {(creativesData?.creatives || []).length > 0 && (
                    <section className="partner-fade clay-card p-6 md:p-8">
                      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-brand-navy/10 pb-4">
                        <div>
                          <span className="text-[13px] font-bold uppercase tracking-[0.18em] text-brand-gold">Brand Assets</span>
                          <h3 className="mt-0.5 font-display text-lg font-bold text-brand-navy">Pre-Approved Display Creatives</h3>
                          <p className="text-xs text-brand-navy/60">Official banners and visual assets with your referral code auto-embedded.</p>
                        </div>
                      </div>

                      <div className="mt-6 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
                        {(creativesData?.creatives || []).map((c: Creative) => {
                          const sep = c.url.includes('?') ? '&' : '?';
                          const fullCreativeUrl = `${typeof window !== 'undefined' ? window.location.origin : ''}${c.url}${sep}ref=${encodeURIComponent(refCode)}`;
                          return (
                            <div key={c.id} className="flex flex-col justify-between rounded-2xl border border-brand-navy/10 bg-slate-50 p-5 space-y-3">
                              <div className="flex items-center justify-between">
                                <span className="truncate font-display text-sm font-bold text-brand-navy">{c.title}</span>
                                <span className="rounded-full bg-brand-gold/15 px-2 py-0.5 text-xs font-bold uppercase text-brand-gold">
                                  {c.type} {c.size ? `· ${c.size}` : ''}
                                </span>
                              </div>
                              <div className="flex items-center justify-center rounded-xl border border-dashed border-brand-navy/20 bg-white p-6 text-center text-xs text-brand-navy/60">
                                {c.size ? `Banner Asset (${c.size})` : 'Marketing Creative'}
                              </div>
                              <button
                                onClick={() => copyToClipboard(fullCreativeUrl, `creative-${c.id}`, c.title)}
                                className="tactile-btn w-full rounded-full bg-brand-navy py-2 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-brand-gold hover:text-brand-navy cursor-pointer"
                              >
                                {copiedLinkKey === `creative-${c.id}` ? '✓ Copied Creative Link' : 'Copy Asset Link'}
                              </button>
                            </div>
                          );
                        })}
                      </div>
                    </section>
                  )}

                  {/* ITEM-LEVEL INVENTORY / CATALOG BROWSER */}
                  <section className="partner-fade clay-card p-6 md:p-8">
                    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-brand-navy/10 pb-4">
                      <div>
                        <h3 className="font-display text-lg font-bold text-brand-navy">Deep-Link Inventory Catalog</h3>
                        <p className="text-xs text-brand-navy/60">Generate targeted referral links for specific universities, packages, and visas.</p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {[
                          { key: 'university', label: 'Universities' },
                          { key: 'umrah_package', label: 'Umrah Packages' },
                          { key: 'departure', label: 'Departures' },
                          { key: 'visa', label: 'Visa Products' },
                          { key: 'job', label: 'Jobs' },
                        ].map((btn) => (
                          <button
                            key={btn.key}
                            onClick={() => setCatalogType(btn.key)}
                            className={`rounded-full px-3.5 py-1.5 text-xs font-bold transition cursor-pointer ${
                              catalogType === btn.key
                                ? 'bg-brand-navy text-white'
                                : 'border border-brand-navy/15 text-slate-600 hover:border-brand-gold hover:text-brand-gold'
                            }`}
                          >
                            {btn.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="mt-4 space-y-3">
                      <input
                        type="text"
                        placeholder={`Search ${catalogType} catalog…`}
                        value={catalogSearch}
                        onChange={(e) => setCatalogSearch(e.target.value)}
                        className={baseInput}
                      />
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        <input
                          type="text"
                          placeholder="UTM campaign e.g. ramadan, whatsapp_june (SubID)"
                          value={utmCampaign}
                          onChange={(e) => setUtmCampaign(e.target.value)}
                          className={baseInput}
                        />
                        <div className="rounded-xl bg-brand-navy text-white px-3 py-2.5 text-xs font-mono truncate flex items-center gap-2">
                          <span className="text-brand-gold shrink-0">Preview:</span>
                          <span className="truncate">{typeof window !== 'undefined' ? `${window.location.origin}/${divisionForCatalog(catalogType)}?ref=${refCode}${utmCampaign.trim() ? `&utm_campaign=${utmCampaign.trim()}` : ''}` : ''}</span>
                        </div>
                      </div>
                      <div className="text-sm text-brand-navy/40">Deep link adds `?country=`/`?pkg=`/`?job=` + `ref` + `utm_campaign` → track per-campaign in Clicks table (FirstPromoter SubID gold).</div>
                    </div>

                    <div className="mt-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {(catalog?.items || [])
                        .filter((i) => i.type === catalogType && (!catalogSearch || i.title.toLowerCase().includes(catalogSearch.toLowerCase())))
                        .slice(0, 10)
                        .map((item) => {
                          const existingLink = (linksData?.links || []).find((l) => l.catalogType === item.type && l.catalogItemId === item.id);
                          const directUrl = existingLink ? `${typeof window !== 'undefined' ? window.location.origin : ''}/go/${refCode}/${item.type}/${item.id}` : null;
                          return (
                            <div key={`${item.type}-${item.id}`} className="flex items-center justify-between gap-3 rounded-xl border border-brand-navy/10 bg-slate-50 p-4">
                              <div className="min-w-0 flex-1">
                                <div className="truncate text-xs font-bold text-brand-navy">{item.title}</div>
                                <div className="text-[13px] text-slate-500">
                                  {item.meta?.country || item.meta?.date || ''} {item.pricePaise > 0 ? `· ${rs(item.pricePaise)}` : ''} {existingLink ? `· ${existingLink.clicks} clicks` : ''}
                                </div>
                              </div>

                              {existingLink && directUrl ? (
                                <button
                                  onClick={() => copyToClipboard(directUrl, `cat-${item.id}`, item.title)}
                                  className="shrink-0 rounded-full border border-brand-gold/50 bg-brand-gold/10 px-3.5 py-1.5 text-[13px] font-bold uppercase tracking-wider text-brand-gold transition hover:bg-brand-gold hover:text-brand-navy cursor-pointer"
                                >
                                  {copiedLinkKey === `cat-${item.id}` ? '✓ Copied' : 'Copy'}
                                </button>
                              ) : (
                                <button
                                  onClick={() => createLinkMutation.mutate(item)}
                                  disabled={createLinkMutation.isPending}
                                  className="shrink-0 rounded-full bg-brand-navy px-3.5 py-1.5 text-[13px] font-bold uppercase tracking-wider text-white transition hover:bg-brand-gold hover:text-brand-navy disabled:opacity-40 cursor-pointer"
                                >
                                  {createLinkMutation.isPending ? '…' : '+ Link'}
                                </button>
                              )}
                            </div>
                          );
                        })}
                    </div>
                  </section>
                </div>
              )}

              {/* ============================================================ */}
              {/* TAB 3: REFERRALS & COMMISSION LEDGER                         */}
              {/* ============================================================ */}
              {tab === 'referrals' && (
                <div className="space-y-8">
                  <BookingTower partnerId={activePartnerId || ''} token={partnerToken || ''} />
                  {/* Manual Log Referral Drawer */}
                  <section className="partner-fade clay-card p-6 md:p-8">
                    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-brand-navy/10 pb-4">
                      <div>
                        <span className="text-[13px] font-bold uppercase tracking-[0.18em] text-brand-gold">Manual Attribution Station</span>
                        <h3 className="mt-0.5 font-display text-lg font-bold text-brand-navy">Attribute Client Referral</h3>
                        <p className="text-xs text-brand-navy/60">If a client visited directly or applied offline, link their unique Client Token here.</p>
                      </div>
                    </div>

                    <form onSubmit={handleManualReferral} className="lead-form-wrap mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
                      <div>
                        <label className="mb-1 block text-[13px] font-bold uppercase tracking-wider text-brand-gold">Client Token</label>
                        <input
                          type="text"
                          value={manualClientId}
                          onChange={(e) => setManualClientId(e.target.value.toUpperCase())}
                          placeholder="e.g. OP-2026-9041"
                          className={`${baseInput} font-mono`}
                          required
                        />
                      </div>

                      <div>
                        <label className="mb-1 block text-[13px] font-bold uppercase tracking-wider text-brand-gold">Agreed Commission Rate (%)</label>
                        <input
                          type="number"
                          min={1}
                          max={25}
                          value={manualCommissionRate}
                          onChange={(e) => setManualCommissionRate(parseInt(e.target.value) || 10)}
                          className={baseInput}
                        />
                      </div>

                      <div className="flex items-end">
                        <button type="submit" disabled={logReferralMutation.isPending} className={`${navyBtn} w-full py-2.5`}>
                          {logReferralMutation.isPending ? 'Logging…' : '+ Attribute Client'}
                        </button>
                      </div>
                    </form>
                  </section>

                  {/* Filterable & Searchable Commission Ledger */}
                  <section className="partner-fade clay-card overflow-hidden">
                    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-brand-navy/10 px-6 py-4">
                      <div>
                        <h3 className="font-display text-base font-bold text-brand-navy">Referral & Commission Ledger</h3>
                        <p className="text-xs text-brand-navy/50">Immutable audit log of all referred leads, agreement statuses, and matured earnings.</p>
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {[
                          { key: 'all', label: `All (${ledgerRows.length})` },
                          { key: 'matured', label: `Matured (${maturedCount})` },
                          { key: 'pending', label: `Pending Sign (${pendingCount})` },
                          { key: 'paid', label: `Paid (${paidCount})` },
                          { key: 'held', label: `Held (${heldCount})` },
                        ].map((st) => (
                          <button
                            key={st.key}
                            onClick={() => setFilterStatus(st.key)}
                            className={`rounded-full px-3 py-1 text-[13px] font-bold uppercase tracking-wider transition cursor-pointer ${
                              filterStatus === st.key
                                ? 'bg-brand-navy text-white'
                                : 'border border-brand-navy/10 text-brand-navy/60 hover:border-brand-gold'
                            }`}
                          >
                            {st.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="border-b border-brand-navy/10 bg-slate-50 px-6 py-3">
                      <input
                        type="text"
                        placeholder="Search by Client Token or Client Name…"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className={baseInput}
                      />
                    </div>

                    {filteredLedger.length === 0 ? (
                      <div className="p-12 text-center">
                        <p className="text-sm font-bold text-brand-navy">No matching referrals found</p>
                        <p className="mt-1 text-xs text-brand-navy/50">Share your referral link to begin attributing clients to your ledger.</p>
                      </div>
                    ) : (
                      <>
                        {/* Desktop Table */}
                        <div className="hidden overflow-x-auto md:block">
                          <table className="w-full text-left text-xs">
                            <thead>
                              <tr className="border-b border-brand-navy/10 bg-brand-cream/80 text-[13px] font-bold uppercase tracking-wider text-slate-500">
                                <th className="px-6 py-3.5">Client Token & Name</th>
                                <th className="px-6 py-3.5">Commission Rate</th>
                                <th className="px-6 py-3.5">Earned Amount</th>
                                <th className="px-6 py-3.5">Lifecycle Status</th>
                                <th className="px-6 py-3.5">Referral Date</th>
                                <th className="px-6 py-3.5 text-right">Audit Timeline</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-brand-navy/5">
                              {filteredLedger.map((r) => (
                                <React.Fragment key={r.referralId}>
                                  <tr className="transition hover:bg-brand-gold/5">
                                    <td className="px-6 py-4">
                                      <button
                                        onClick={() => setOpenReferral((cur) => (cur === r.referralId ? null : r.referralId))}
                                        className="flex items-center gap-2.5 text-left cursor-pointer"
                                      >
                                        <span className={`text-[13px] text-brand-gold transition-transform duration-200 ${openReferral === r.referralId ? 'rotate-90' : ''}`}>
                                          ▶
                                        </span>
                                        <div>
                                          <div className="font-bold text-brand-navy">{r.clientName || r.clientId}</div>
                                          <div className="font-mono text-[13px] text-brand-navy/50">{r.clientId}</div>
                                        </div>
                                      </button>
                                    </td>
                                    <td className="px-6 py-4 font-semibold text-slate-600">{r.ratePct}%</td>
                                    <td className="px-6 py-4 font-display font-bold text-brand-gold">{rs(r.amountPaise)}</td>
                                    <td className="px-6 py-4">
                                      <StatusChip status={r.status} />
                                    </td>
                                    <td className="px-6 py-4 text-slate-500">{r.createdAt ? d(r.createdAt) : '—'}</td>
                                    <td className="px-6 py-4 text-right">
                                      <button
                                        onClick={() => setOpenReferral((cur) => (cur === r.referralId ? null : r.referralId))}
                                        className="rounded-full border border-brand-navy/15 px-3 py-1 text-[13px] font-bold uppercase tracking-wider text-brand-navy/70 transition hover:border-brand-gold hover:text-brand-gold cursor-pointer"
                                      >
                                        {openReferral === r.referralId ? 'Hide History' : 'View Stage'}
                                      </button>
                                    </td>
                                  </tr>

                                  {/* Expanded Milestone Timeline */}
                                  {openReferral === r.referralId && (
                                    <tr className="bg-brand-cream/50 border-b border-brand-navy/10">
                                      <td colSpan={6} className="px-8 py-5">
                                        <div className="max-w-xl">
                                          <div className="mb-3 text-[13px] font-bold uppercase tracking-wider text-brand-gold">
                                            Referral Lifecycle Milestones
                                          </div>
                                          {r.timeline.length > 0 ? (
                                            <MilestoneTimeline events={r.timeline} />
                                          ) : (
                                            <p className="text-xs text-brand-navy/50">
                                              Referral tracked. Next stages (Agreement Signed → Payment Confirmed → Commission Matured) will appear automatically.
                                            </p>
                                          )}
                                        </div>
                                      </td>
                                    </tr>
                                  )}
                                </React.Fragment>
                              ))}
                            </tbody>
                          </table>
                        </div>

                        {/* Mobile Cards */}
                        <div className="divide-y divide-brand-navy/5 md:hidden">
                          {filteredLedger.map((r) => (
                            <div key={r.referralId} className="p-4 space-y-3">
                              <div className="flex items-center justify-between">
                                <div>
                                  <div className="text-xs font-bold text-brand-navy">{r.clientName || r.clientId}</div>
                                  <div className="font-mono text-[13px] text-brand-navy/50">{r.clientId}</div>
                                </div>
                                <StatusChip status={r.status} />
                              </div>

                              <div className="flex items-center justify-between text-xs">
                                <span className="text-slate-500">Commission Rate: {r.ratePct}%</span>
                                <span className="font-display font-bold text-brand-gold">{rs(r.amountPaise)}</span>
                              </div>

                              <button
                                onClick={() => setOpenReferral((cur) => (cur === r.referralId ? null : r.referralId))}
                                className="w-full rounded-xl border border-brand-navy/15 py-1.5 text-center text-[13px] font-bold uppercase tracking-wider text-brand-navy/70 cursor-pointer"
                              >
                                {openReferral === r.referralId ? 'Hide Timeline' : 'View Milestones'}
                              </button>

                              {openReferral === r.referralId && (
                                <div className="rounded-xl bg-white p-4 border border-brand-navy/10">
                                  {r.timeline.length > 0 ? (
                                    <MilestoneTimeline events={r.timeline} />
                                  ) : (
                                    <p className="text-sm text-brand-navy/50">Stages will update as the client progresses.</p>
                                  )}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </section>
                </div>
              )}

              {/* ============================================================ */}
              {/* TAB 4: PAYOUTS & BANK SETTLEMENT                             */}
              {/* ============================================================ */}
              {tab === 'payouts' && (
                <div className="space-y-8">
                  <CommissionPerformance partnerId={activePartnerId || ''} token={partnerToken || ''} />
                  {/* Settlement Request Card */}
                  <section className="partner-fade clay-card p-6 md:p-8">
                    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-brand-navy/10 pb-6">
                      <div>
                        <span className="text-[13px] font-bold uppercase tracking-[0.18em] text-brand-gold">Settlement Station</span>
                        <h3 className="mt-0.5 font-display text-xl font-bold text-brand-navy">Request Earnings Disbursement</h3>
                        <p className="text-xs text-brand-navy/60">Disburse your matured commissions directly to your registered bank account or UPI.</p>
                      </div>

                      <div className="text-right">
                        <div className="text-[13px] font-bold uppercase tracking-wider text-slate-500">Matured Payout Balance</div>
                        <div className="font-display text-3xl font-black text-emerald-700">{rs(totals.matured)}</div>
                        <div className="text-[13px] text-slate-400">Available to withdraw now</div>
                      </div>
                    </div>

                    <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-brand-navy/10 bg-slate-50 p-5">
                      <div className="space-y-1">
                        <div className="text-xs font-bold text-brand-navy">Payout Threshold & Readiness</div>
                        <p className="text-sm text-brand-navy/60">
                          Configured threshold: <strong>₹{payoutThreshold.toLocaleString('en-IN')}</strong> · Minimum clearance requirement.
                        </p>
                      </div>

                      <div>
                        {pendingPayout ? (
                          <span className="inline-flex items-center gap-2 rounded-full border border-amber-500/50 bg-amber-500/10 px-5 py-2 text-xs font-bold uppercase tracking-wider text-amber-700">
                            <span className="live-pulse-dot text-amber-600" /> Payout Pending Finance Approval
                          </span>
                        ) : totals.matured > 0 && (totals.matured / 100) >= payoutThreshold ? (
                          <button
                            onClick={() => requestPayout.mutate()}
                            disabled={requestPayout.isPending}
                            className="tactile-btn rounded-full bg-emerald-600 px-6 py-3 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-emerald-500 active:scale-[0.97] cursor-pointer shadow-md"
                          >
                            {requestPayout.isPending ? 'Processing Request…' : `Withdraw ${rs(totals.matured)} Now`}
                          </button>
                        ) : (
                          <div className="text-right">
                            <button disabled className="rounded-full bg-slate-200 px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-slate-500 cursor-not-allowed">
                              Threshold Not Met
                            </button>
                            <div className="mt-1 text-[13px] text-slate-400">
                              Requires ₹{Math.max(0, payoutThreshold - Math.round(totals.matured / 100)).toLocaleString('en-IN')} more to unlock withdrawal.
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </section>

                  {/* Payout Preferences Form */}
                  <section className="partner-fade clay-card p-6 md:p-8">
                    <div className="flex items-center justify-between border-b border-brand-navy/10 pb-4">
                      <div>
                        <h3 className="font-display text-base font-bold text-brand-navy">Payout Method & Routing Details</h3>
                        <p className="text-xs text-brand-navy/50">Manage your settlement destination (Bank Transfer or UPI).</p>
                      </div>
                      {!editPayoutConfig && (
                        <button
                          onClick={() => setEditPayoutConfig(true)}
                          className="rounded-full border border-brand-navy/15 px-3.5 py-1 text-xs font-bold uppercase tracking-wider text-brand-navy/70 hover:border-brand-gold hover:text-brand-gold cursor-pointer"
                        >
                          Edit Settings
                        </button>
                      )}
                    </div>

                    {editPayoutConfig ? (
                      <form onSubmit={handleSaveConfig} className="lead-form-wrap mt-6 max-w-xl space-y-4">
                        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                          <div>
                            <label className="mb-1 block text-[13px] font-bold uppercase tracking-wider text-brand-gold">Disbursement Channel</label>
                            <select
                              value={payoutMethod}
                              onChange={(e) => setPayoutMethod(e.target.value as 'bank' | 'upi')}
                              className="w-full rounded-xl border border-brand-navy/15 bg-white p-2.5 text-xs text-brand-navy"
                            >
                              <option value="bank">Bank Transfer (NEFT / RTGS)</option>
                              <option value="upi">Instant UPI Transfer</option>
                            </select>
                          </div>
                          <div>
                            <label className="mb-1 block text-[13px] font-bold uppercase tracking-wider text-brand-gold">Withdrawal Threshold (₹)</label>
                            <input
                              type="number"
                              min={500}
                              step={500}
                              value={payoutThreshold}
                              onChange={(e) => setPayoutThreshold(parseInt(e.target.value) || 1000)}
                              className={baseInput}
                            />
                          </div>
                        </div>

                        <div>
                          <label className="mb-1 block text-[13px] font-bold uppercase tracking-wider text-brand-gold">
                            {payoutMethod === 'upi' ? 'UPI ID / VPA' : 'Bank Account Number + IFSC Code'}
                          </label>
                          <input
                            type="text"
                            value={payoutDetail}
                            onChange={(e) => setPayoutDetail(e.target.value)}
                            placeholder={payoutMethod === 'upi' ? 'partner@okaxis' : '50100123456789 · HDFC0000001'}
                            className={baseInput}
                            required
                          />
                        </div>

                        <div className="flex items-center gap-3 pt-2">
                          <button type="submit" disabled={savePayoutConfig.isPending} className={goldBtn}>
                            {savePayoutConfig.isPending ? 'Saving…' : 'Save Preferences'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setEditPayoutConfig(false)}
                            className="rounded-full border border-brand-navy/20 px-4 py-2.5 text-xs font-bold uppercase text-brand-navy/70 hover:bg-slate-100 cursor-pointer"
                          >
                            Cancel
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div className="mt-5 grid grid-cols-1 gap-4 sm:grid-cols-3">
                        <div className="rounded-xl border border-brand-navy/10 bg-slate-50 p-4">
                          <div className="text-[13px] font-bold uppercase tracking-wider text-slate-500">Method</div>
                          <div className="mt-1 text-xs font-bold text-brand-navy uppercase">{payoutMethod} Transfer</div>
                        </div>
                        <div className="rounded-xl border border-brand-navy/10 bg-slate-50 p-4">
                          <div className="text-[13px] font-bold uppercase tracking-wider text-slate-500">Destination Detail</div>
                          <div className="mt-1 font-mono text-xs font-bold text-brand-navy truncate">
                            {payoutDetail || 'Using KYC Bank Credentials'}
                          </div>
                        </div>
                        <div className="rounded-xl border border-brand-navy/10 bg-slate-50 p-4">
                          <div className="text-[13px] font-bold uppercase tracking-wider text-slate-500">Minimum Threshold</div>
                          <div className="mt-1 text-xs font-bold text-brand-navy">₹{payoutThreshold.toLocaleString('en-IN')}</div>
                        </div>
                      </div>
                    )}
                  </section>

                  {/* Payout History Ledger */}
                  <section className="partner-fade clay-card overflow-hidden">
                    <div className="flex items-center justify-between border-b border-brand-navy/10 px-6 py-4">
                      <div>
                        <h3 className="font-display text-base font-bold text-brand-navy">Settlement History</h3>
                        <p className="text-xs text-brand-navy/50">All past disbursement requests, UTR transaction references, and notes.</p>
                      </div>
                    </div>

                    {(payoutsData?.payouts || []).length === 0 ? (
                      <div className="p-12 text-center">
                        <p className="text-sm font-bold text-brand-navy">No disbursement history</p>
                        <p className="mt-1 text-xs text-brand-navy/50">Requests will be listed here once submitted.</p>
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-left text-xs">
                          <thead>
                            <tr className="border-b border-brand-navy/10 bg-brand-cream/80 text-[13px] font-bold uppercase tracking-wider text-slate-500">
                              <th className="px-6 py-3.5">Requested Date</th>
                              <th className="px-6 py-3.5">Disbursed Amount</th>
                              <th className="px-6 py-3.5">Status</th>
                              <th className="px-6 py-3.5">Reference / Note</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-brand-navy/5">
                            {(payoutsData?.payouts || []).map((p) => (
                              <tr key={p.id} className="hover:bg-brand-gold/5 transition">
                                <td className="px-6 py-4 text-slate-600">{d(p.requestedAt)}</td>
                                <td className="px-6 py-4 font-display font-bold text-brand-navy">{rs(p.amountPaise)}</td>
                                <td className="px-6 py-4">
                                  <span className={`inline-flex rounded-full border px-2.5 py-0.5 text-xs font-bold uppercase tracking-wider ${payoutStatusStyles[p.status] || 'bg-slate-100 text-slate-700'}`}>
                                    {p.status}
                                  </span>
                                </td>
                                <td className="px-6 py-4 text-slate-500 font-mono text-sm">{p.note || '—'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </section>
                </div>
              )}

              {/* ============================================================ */}
              {/* TAB 5: VIP LOYALTY TIER LADDER                               */}
              {/* ============================================================ */}
              {tab === 'tiers' && (
                <div className="space-y-8">
                  <section className="partner-fade clay-card p-6 md:p-8">
                    <div className="flex flex-wrap items-center justify-between gap-4 border-b border-brand-navy/10 pb-6">
                      <div>
                        <span className="text-[13px] font-bold uppercase tracking-[0.18em] text-brand-gold">VIP Ladder</span>
                        <h3 className="mt-0.5 font-display text-xl font-bold text-brand-navy">Partner Loyalty Tiers</h3>
                        <p className="text-xs text-brand-navy/60">Unlock higher recurring commission boosts and institutional privileges.</p>
                      </div>

                      <div className="text-right">
                        <div className="text-[13px] font-bold uppercase tracking-wider text-slate-500">Your Lifetime Points</div>
                        <div className="font-display text-3xl font-black text-brand-gold">{(thrive?.totalPoints || 0).toLocaleString()}</div>
                      </div>
                    </div>

                    <div className="mt-8 grid grid-cols-1 gap-5 md:grid-cols-4">
                      {[
                        { name: 'Bronze Partner', min: 0, boost: 'Base 0%', color: '#b87333', perks: ['Standard 5-15% commission', 'Real-time ledger access', 'Monthly payout runs'] },
                        { name: 'Silver Partner', min: 5000, boost: '+2% Boost', color: '#94a3b8', perks: ['+2% additional commission', 'Bi-weekly payout runs', 'Custom marketing kit'] },
                        { name: 'Gold Partner', min: 15000, boost: '+5% Boost', color: '#d97706', perks: ['+5% additional commission', 'Weekly instant payouts', 'Dedicated Partner Manager', 'Co-branded landing pages'] },
                        { name: 'Platinum VIP', min: 50000, boost: '+8% Boost', color: '#0a2d50', perks: ['+8% additional commission', 'Instant on-demand payouts', 'Executive Luncheon invite', 'Sponsored student events'] },
                      ].map((tierCard) => {
                        const isCurrent = (thrive?.tier?.name || 'Bronze Partner').toLowerCase().includes(tierCard.name.split(' ')[0].toLowerCase());
                        return (
                          <div
                            key={tierCard.name}
                            className={`relative rounded-2xl border p-6 flex flex-col justify-between transition ${
                              isCurrent
                                ? 'border-brand-gold bg-brand-gold/5 shadow-md ring-2 ring-brand-gold/30'
                                : 'border-brand-navy/10 bg-white shadow-sm'
                            }`}
                          >
                            <div>
                              {isCurrent && (
                                <span className="absolute -top-3 right-4 rounded-full bg-brand-gold px-3 py-0.5 text-xs font-extrabold uppercase tracking-wider text-brand-navy shadow-sm">
                                  Current Tier
                                </span>
                              )}
                              <span
                                className="inline-block rounded-xl px-3 py-1 text-[13px] font-bold uppercase tracking-wider text-white"
                                style={{ backgroundColor: tierCard.color }}
                              >
                                {tierCard.name}
                              </span>
                              <div className="mt-4 font-display text-2xl font-black text-brand-navy">{tierCard.boost}</div>
                              <div className="text-[13px] text-slate-500">Requires {tierCard.min.toLocaleString()} points</div>

                              <ul className="mt-5 space-y-2 text-xs text-brand-navy/70">
                                {tierCard.perks.map((prk, i) => (
                                  <li key={i} className="flex items-start gap-2">
                                    <span className="text-brand-gold font-bold">✓</span>
                                    <span>{prk}</span>
                                  </li>
                                ))}
                              </ul>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </section>
                </div>
              )}
            </div>
          </div>
        )}
        {/* spacer for fixed bottom nav (thumb-zone) */}
        {activePartnerId && <div className="h-[72px] md:hidden" aria-hidden />}
      </main>

      {/* Mobile Bottom Nav — thumb-zone, fixed (ITA Group: bottom nav +40% engagement vs top hamburger) */}
      {activePartnerId && <PartnerMobileNav active={tab} onChange={(t) => setTab(t)} />}

      <Footer />

      {/* ==================================================================== */}
      {/* QR CODE MODAL POPUP                                                 */}
      {/* ==================================================================== */}
      {qrModal.open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-navy/80 p-4 backdrop-blur-sm animate-fade-in">
          <div className="relative w-full max-w-md rounded-3xl border border-brand-navy/10 bg-white p-6 shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-brand-navy/10 pb-3">
              <div>
                <h3 className="font-display text-base font-bold text-brand-navy">{qrModal.title}</h3>
                <p className="text-[13px] text-brand-navy/50">Print or present this QR code for instant client attribution.</p>
              </div>
              <button
                onClick={() => setQrModal({ open: false, title: '', url: '' })}
                className="rounded-full p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div id="partner-qr-svg-container" className="flex flex-col items-center justify-center p-4 bg-slate-50 rounded-2xl border border-brand-navy/10">
              <div className="p-3 bg-white rounded-xl shadow-sm">
                <QRCodeSVG
                  value={qrModal.url}
                  size={200}
                  level="H"
                  includeMargin={true}
                />
              </div>
              <div className="mt-3 w-full max-w-xs text-center font-mono text-[13px] text-brand-navy/60 truncate">
                {qrModal.url}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => {
                  const svgEl = document.querySelector('#partner-qr-svg-container svg');
                  if (!svgEl) return;
                  const svgData = new XMLSerializer().serializeToString(svgEl);
                  const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' });
                  const svgUrl = URL.createObjectURL(svgBlob);
                  const downloadLink = document.createElement('a');
                  downloadLink.href = svgUrl;
                  downloadLink.download = `opus-partner-qr-${Date.now()}.svg`;
                  document.body.appendChild(downloadLink);
                  downloadLink.click();
                  document.body.removeChild(downloadLink);
                  showToast('✓ QR Code downloaded successfully as vector SVG.');
                }}
                className="flex-1 py-2.5 rounded-full bg-brand-gold hover:bg-brand-gold/90 text-brand-navy text-xs font-bold transition-all shadow-xs cursor-pointer"
              >
                📥 Download Vector QR
              </button>
              <button
                onClick={() => copyToClipboard(qrModal.url, 'modal-qr', 'QR URL')}
                className={`${navyBtn} flex-1 py-2.5`}
              >
                {copiedLinkKey === 'modal-qr' ? '✓ Copied Link' : 'Copy Destination URL'}
              </button>
              <button
                onClick={() => setQrModal({ open: false, title: '', url: '' })}
                className="rounded-full border border-brand-navy/20 px-5 py-2.5 text-xs font-bold uppercase text-brand-navy/70 hover:bg-slate-100 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FLOATING LUXURY TOAST */}
      <div
        className={`fixed right-6 bottom-6 z-50 flex items-center gap-3 rounded-2xl border bg-brand-navy px-5 py-3.5 text-xs font-semibold text-white shadow-2xl transition-all duration-300 ${
          toast.show ? 'translate-y-0 opacity-100' : 'translate-y-24 opacity-0 pointer-events-none'
        } ${toast.type === 'error' ? 'border-rose-500' : 'border-brand-gold'}`}
      >
        <span className={toast.type === 'error' ? 'text-rose-400' : 'text-brand-gold'}>●</span>
        <span>{toast.msg}</span>
      </div>
      <ChatWidget />
    </div>
  );
}
