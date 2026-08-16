import { useVisibilityTracking } from '../lib/visibilityTracking';
import React, { useState, useEffect, useRef } from 'react';
import gsap from 'gsap';
import LiveWallpaper from '../components/LiveWallpaper';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Link } from 'wouter';
import PartnerThrive from '../components/PartnerThrive';
import Logo from '../components/Logo';
import { track, EVENTS } from '../lib/umami';

// Partner / Affiliate Portal — gold-standard patterns (research 2026):
//  1. Share-link generator one click from dashboard (Track360, Voucherify)
//  2. Real-time rupee balances + referral breakdown (Impact/ShareASale model)
//  3. Payout transparency (schedule, status chips, ledger math)
//  4. Activation shell: email+password account (KYC merged into registration)
//     with the legacy Partner ID + Access Key flow kept as a fallback.

interface CommissionRow { referralId: string; referredClientId: string; ratePct: number; amountPaise: number; status: 'unmatured' | 'matured' | 'paid' | 'held'; }
interface PartnerSummary {
  partner: { id?: string; name: string; referralCode: string | null; status: string; joinedAt: number };
  totals: { matured: number; pending: number; paid: number; total: number };
  referrals: CommissionRow[];
}
interface PartnerSessionPayload {
  success: boolean;
  authenticated: boolean;
  email?: string | null;
  partner?: { id: string; name: string; referralCode: string | null; status: string; joinedAt: number } | null;
  totals?: { matured: number; pending: number; paid: number; total: number };
  referrals?: CommissionRow[];
}

const rs = (paise: number) => `₹${(paise / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

export default function PartnerDashboard() {
  useVisibilityTracking('/partner');
  const panelRef = useRef<HTMLDivElement>(null);

  const queryClient = useQueryClient();
  const [toast, setToast] = useState<{ show: boolean; msg: string }>({ show: false, msg: '' });
  const showToast = (msg: string) => { setToast({ show: true, msg }); setTimeout(() => setToast({ show: false, msg: '' }), 4000); };
  const [copied, setCopied] = useState(false);

  // Legacy access-key partner (localStorage) — kept as a fallback path.
  const [partnerId, setPartnerId] = useState(() => localStorage.getItem('opus_partner_id') || '');
  const [partnerName, setPartnerName] = useState(() => localStorage.getItem('opus_partner_name') || '');
  const [partnerToken, setPartnerToken] = useState(() => localStorage.getItem('opus_partner_token') || '');

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [authError, setAuthError] = useState('');
  const [showAccessKey, setShowAccessKey] = useState(false);
  const [partnerIdInput, setPartnerIdInput] = useState('');
  const [tokenInput, setTokenInput] = useState('');

  const [kycName, setKycName] = useState('');
  const [kycEmail, setKycEmail] = useState('');
  const [kycPassword, setKycPassword] = useState('');
  const [kycPan, setKycPan] = useState('');
  const [kycBankAccount, setKycBankAccount] = useState('');
  const [kycIfsc, setKycIfsc] = useState('');

  const [clientId, setClientId] = useState('');
  const [commissionRate, setCommissionRate] = useState(5);

  // Session-first auth (mirrors the client portal): the Better Auth session
  // resolves to the partner row by email. 401 → anonymous; authenticated:false
  // → logged in but not a partner (staff visit, legacy token still applies).
  const { data: session, isLoading: sessionLoading } = useQuery<PartnerSessionPayload>({
    queryKey: ['partnerSession'],
    queryFn: async () => {
      const res = await fetch('/api/public/partners/session', { credentials: 'include' });
      if (res.status === 401) return { success: true, authenticated: false, email: null };
      if (!res.ok) throw new Error(await res.text() || 'Failed to load your partner session.');
      return res.json();
    },
    retry: false,
    refetchOnWindowFocus: false,
  });

  const sessionActive = session?.authenticated === true && !!session?.partner;

  const { data: summary, isFetching, isError } = useQuery<PartnerSummary>({
    queryKey: ['partnerSummary', partnerId],
    queryFn: async () => {
      if (!partnerId) return null as any;
      const res = await fetch(`/api/public/partners/${partnerId}/summary`, { headers: { 'Authorization': `Bearer ${partnerToken}` } });
      if (!res.ok) {
        setAuthError('Access failed — check your Partner ID and Access Key.');
        throw new Error(await res.text() || 'summary failed');
      }
      return res.json();
    },
    enabled: !!partnerId && !!partnerToken && !sessionActive,
  });

  useEffect(() => {
    if (panelRef.current) {
      gsap.fromTo(panelRef.current.querySelectorAll('.partner-fade'),
        { y: 15, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.7, stagger: 0.06, ease: 'power2.out' }
      );
    }
  }, [sessionActive, summary]);

  // Effective dashboard view: session (email+password) wins over legacy token.
  const effectiveSummary: PartnerSummary | undefined = sessionActive && session
    ? {
        partner: { id: session.partner!.id, name: session.partner!.name, referralCode: session.partner!.referralCode, status: session.partner!.status, joinedAt: session.partner!.joinedAt },
        totals: session.totals || { matured: 0, pending: 0, paid: 0, total: 0 },
        referrals: session.referrals || [],
      }
    : summary;
  const activePartner = sessionActive && session?.partner
    ? { id: session.partner.id, name: session.partner.name }
    : partnerId && partnerToken ? { id: partnerId, name: partnerName } : null;

  const totals = effectiveSummary?.totals || { matured: 0, pending: 0, paid: 0, total: 0 };
  const referrals = effectiveSummary?.referrals || [];

  const registerMutation = useMutation({
    mutationFn: async (payload: { name: string; email: string; password: string; panNumber: string; bankAccount: string; ifscCode: string }) => {
      const res = await fetch('/api/public/partners', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
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
          // Email+password account — session (or inbox verification) takes over.
          setKycName(''); setKycPan(''); setKycBankAccount(''); setKycIfsc(''); setKycEmail(''); setKycPassword('');
          queryClient.invalidateQueries({ queryKey: ['partnerSession'] });
          showToast(d.message || 'Partner account created — verify your email, then sign in.');
        } else {
          // Legacy KYC-only registration → token access.
          localStorage.setItem('opus_partner_id', d.partnerId);
          localStorage.setItem('opus_partner_name', kycName);
          if (d.apiToken) { localStorage.setItem('opus_partner_token', d.apiToken); setPartnerToken(d.apiToken); }
          setPartnerId(d.partnerId);
          setPartnerName(kycName);
          setKycName(''); setKycPan(''); setKycBankAccount(''); setKycIfsc('');
          showToast('Partner account created — welcome!');
        }
      }
    },
    onError: (e: any) => showToast(`Registration: ${e.message}`),
  });

  const logReferralMutation = useMutation({
    mutationFn: async (payload: { partnerId: string; clientId: string; commissionRate: number }) => {
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (!sessionActive) headers['Authorization'] = `Bearer ${partnerToken}`;
      const res = await fetch('/api/public/partners/referrals', { method: 'POST', headers, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    onSuccess: () => { showToast('Referral logged — it will appear in earnings when the client signs.'); setClientId(''); setCommissionRate(5); queryClient.invalidateQueries({ queryKey: ['partnerSummary', partnerId] }); queryClient.invalidateQueries({ queryKey: ['partnerSession'] }); },
    onError: (e: any) => showToast(`Referral: ${e.message}`),
  });

  const handleKyc = (e: React.FormEvent) => {
    e.preventDefault();
    if (!kycName || !kycPan || !kycBankAccount || !kycIfsc) { showToast('Fill in all KYC fields.'); return; }
    if (kycEmail) {
      if (kycPassword.length < 8) { showToast('Password must be at least 8 characters.'); return; }
      registerMutation.mutate({ name: kycName, email: kycEmail, password: kycPassword, panNumber: kycPan, bankAccount: kycBankAccount, ifscCode: kycIfsc });
    } else {
      registerMutation.mutate({ name: kycName, email: '', password: '', panNumber: kycPan, bankAccount: kycBankAccount, ifscCode: kycIfsc });
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail || !loginPassword) { setAuthError('Enter both your email and password.'); return; }
    setAuthError('');
    try {
      const res = await fetch('/api/auth/sign-in/email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: loginEmail, password: loginPassword }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        throw new Error(err?.message || err?.error || 'Sign-in failed. Check your credentials.');
      }
      setLoginEmail(''); setLoginPassword('');
      queryClient.invalidateQueries({ queryKey: ['partnerSession'] });
      showToast('Signed in successfully.');
    } catch (err: any) {
      setAuthError(err.message);
    }
  };

  const handleLegacyLogin = (e: React.FormEvent) => {
    e.preventDefault();
    if (!partnerIdInput || !tokenInput) { setAuthError('Enter both your Partner ID and the Access Key from your welcome message.'); return; }
    setAuthError('');
    localStorage.setItem('opus_partner_id', partnerIdInput.trim());
    localStorage.setItem('opus_partner_token', tokenInput.trim());
    setPartnerId(partnerIdInput.trim());
    setPartnerToken(tokenInput.trim());
    setPartnerName('Partner');
    setPartnerIdInput(''); setTokenInput('');
  };

  const handleLogout = () => {
    fetch('/api/auth/sign-out', { method: 'POST', credentials: 'include' }).catch(() => {});
    localStorage.removeItem('opus_partner_id'); localStorage.removeItem('opus_partner_token'); localStorage.removeItem('opus_partner_name');
    setPartnerId(''); setPartnerToken(''); setPartnerName('');
    queryClient.invalidateQueries({ queryKey: ['partnerSession'] });
    showToast('Signed out.');
  };

  const handleReferral = (e: React.FormEvent) => {
    e.preventDefault();
    if (!clientId.trim()) { showToast('Enter the client token you referred.'); return; }
    logReferralMutation.mutate({ partnerId: activePartner?.id || '', clientId: clientId.trim(), commissionRate });
  };

  const referralLink = effectiveSummary?.partner?.referralCode
    ? `${location.origin}/lead-form?${effectiveSummary.partner.referralCode.replace(/^ref=/i, 'ref=')}`
    : null;

  const copyLink = async () => {
    if (!referralLink) return;
    try { await navigator.clipboard.writeText(referralLink); } catch { /* fallback */ }
    setCopied(true); setTimeout(() => setCopied(false), 2500);
    showToast('Referral link copied — share it anywhere.');
  };
  const waShare = () => {
    if (!referralLink) return;
    const txt = encodeURIComponent(`Opus Overseas — earn commission when your referrals sign up. Use my link: ${referralLink}`);
    window.open(`https://wa.me/?text=${txt}`, '_blank');
  };

  const statusStyles: Record<string, string> = {
    matured: 'bg-emerald-500/15 text-emerald-700',
    pending: 'bg-amber-500/15 text-amber-700',
    paid: 'bg-sky-500/15 text-sky-700',
    held: 'bg-rose-500/15 text-rose-700',
    unmatured: 'bg-slate-500/15 text-slate-600',
  };
  const statusLabel: Record<string, string> = {
    matured: 'Earned — payout queue',
    pending: 'Awaiting sign',
    paid: 'Paid to you',
    held: 'Held (review)',
    unmatured: 'Referral linked',
  };

  return (
    <div ref={panelRef} className="relative min-h-screen bg-[#FAF8F4] font-sans text-brand-navy overflow-hidden">
      <LiveWallpaper />
      <header className="sticky top-0 z-30 border-b border-brand-navy/10 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3 md:px-8">
          <div className="flex items-center gap-3">
            <Logo className="h-7 w-auto" />
            <div>
              <div className="font-display text-sm font-bold tracking-wide text-brand-navy">Opus Overseas</div>
              <div className="text-[9px] font-bold uppercase tracking-[0.2em] text-brand-gold">Affiliate Portal</div>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <Link href="/portal" className="text-xs font-medium text-brand-navy/70 hover:text-brand-gold transition">Client tracker</Link>
            {activePartner && (
              <button onClick={handleLogout} className="rounded-full border border-brand-navy/15 px-3 py-1.5 text-[11px] font-semibold text-brand-navy/70 transition hover:border-brand-gold hover:text-brand-gold">
                Sign out
              </button>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-5 py-10 space-y-10 md:px-8">
        {sessionLoading && !activePartner ? (
          <div className="flex min-h-[40vh] items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-2 border-brand-gold border-t-transparent" />
          </div>
        ) : !activePartner ? (
          <div className="space-y-10">
            <section className="partner-fade relative overflow-hidden rounded-[2rem] border border-brand-navy/10 bg-white p-8 md:p-10 shadow-[0_24px_60px_-30px_rgba(10,45,80,0.25)]">
              <div className="pointer-events-none absolute -right-20 -top-28 h-80 w-80 rounded-full bg-brand-gold/10 blur-3xl" aria-hidden="true" />
              <div className="relative z-10 max-w-2xl">
                <span className="inline-block rounded-full border border-brand-gold/40 bg-brand-gold/10 px-3.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-brand-gold">Partner Program</span>
                <h1 className="mt-3 font-display text-3xl font-extrabold tracking-tight md:text-4xl">Earn a commission every time your referral signs.</h1>
                <p className="mt-3 text-sm leading-relaxed text-brand-navy/60">
                  Recommend Opus Overseas for study abroad, visas, Umrah, attestation and manpower — and earn a percentage of the client's paid fees once they engage. Transparent ledger, instant referral linking, bank payouts.
                </p>
                <div className="mt-6 grid max-w-md grid-cols-3 gap-3 text-center">
                  {[['Refer →', 'link clients in seconds'], ['Sign →', 'commission matures on agreement'], ['Earn →', 'paid out to your bank']].map(([a, b]) => (
                    <div key={a} className="rounded-xl border border-brand-navy/10 bg-[#FAF8F4] p-3">
                      <div className="text-xs font-bold text-brand-navy">{a}</div>
                      <div className="mt-0.5 text-[9px] text-brand-navy/50">{b}</div>
                    </div>
                  ))}
                </div>
              </div>
            </section>

            <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
              <section className="partner-fade rounded-2xl border border-brand-navy/10 bg-white p-6 md:p-8">
                <h2 className="font-display text-lg font-bold">Become a partner</h2>
                <p className="mt-1 text-xs text-brand-navy/50">One-minute application: your account plus KYC. Your PAN is masked at rest (DPDP notice below).</p>
                <form onSubmit={handleKyc} className="mt-6 space-y-4">
                  {[
                    { label: 'Email', type: 'email' as const, ph: 'you@example.com', val: kycEmail, set: setKycEmail, upper: false },
                    { label: 'Password (min 8)', type: 'password' as const, ph: 'Create a password', val: kycPassword, set: setKycPassword, upper: false },
                    { label: 'Name / Agency', type: 'text' as const, ph: 'e.g. Hyderabad Consultants', val: kycName, set: setKycName, upper: false },
                    { label: 'PAN (10 chars)', type: 'text' as const, ph: 'ABCDE1234F', val: kycPan, set: setKycPan, upper: true },
                    { label: 'Bank account', type: 'text' as const, ph: '50100123456789', val: kycBankAccount, set: setKycBankAccount, upper: false },
                    { label: 'IFSC', type: 'text' as const, ph: 'HDFC0000001', val: kycIfsc, set: setKycIfsc, upper: true },
                  ].map((f) => (
                    <div key={f.label}>
                      <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-brand-gold">{f.label}</label>
                      <input
                        type={f.type}
                        value={f.val} onChange={(e) => f.set(f.upper ? e.target.value.toUpperCase() : e.target.value)}
                        placeholder={f.ph}
                        className="w-full rounded-xl border border-brand-navy/15 bg-slate-50 px-3.5 py-2.5 text-xs text-brand-navy placeholder:text-slate-400 focus:border-brand-gold focus:outline-none"
                      />
                    </div>
                  ))}
                  <div className="rounded-xl bg-brand-gold/10 p-3 text-[10px] leading-relaxed text-brand-navy/70">
                    DPDP-2023 notice: your PAN is encrypted at rest (masked on every screen); bank details are used solely for commission payouts. A verification link is emailed after registration (dev: see the API log).
                  </div>
                  <button type="submit" disabled={registerMutation.isPending} className="w-full rounded-full bg-brand-navy py-3 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-brand-gold hover:text-brand-navy disabled:opacity-50">
                    {registerMutation.isPending ? 'Registering…' : 'Register & get my link'}
                  </button>
                </form>
              </section>

              <section className="flex flex-col gap-6">
                <div className="partner-fade rounded-2xl border border-brand-navy/10 bg-white p-6 md:p-8">
                  <h2 className="font-display text-lg font-bold">Already a partner?</h2>
                  <p className="mt-1 text-xs text-brand-navy/50">Sign in with the email and password you registered with on the login portal.</p>
                  <form onSubmit={handleLogin} className="mt-6 space-y-4">
                    <div>
                      <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-brand-gold">Email</label>
                      <input type="email" value={loginEmail} onChange={(e) => setLoginEmail(e.target.value)} placeholder="you@example.com" className="w-full rounded-xl border border-brand-navy/15 bg-slate-50 px-3.5 py-2.5 text-xs text-brand-navy placeholder:text-slate-400 focus:border-brand-gold focus:outline-none" />
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-brand-gold">Password</label>
                      <input type="password" value={loginPassword} onChange={(e) => setLoginPassword(e.target.value)} placeholder="Your password" className="w-full rounded-xl border border-brand-navy/15 bg-slate-50 px-3.5 py-2.5 text-xs text-brand-navy placeholder:text-slate-400 focus:border-brand-gold focus:outline-none" />
                    </div>
                    {authError && <div className="rounded-lg bg-rose-50 p-2.5 text-[11px] text-rose-700">{authError}</div>}
                    <button type="submit" className="w-full rounded-full bg-brand-gold py-3 text-xs font-bold uppercase tracking-wider text-brand-navy transition hover:bg-brand-navy hover:text-white">
                      Sign in
                    </button>
                  </form>

                  <div className="mt-5 border-t border-brand-navy/10 pt-4">
                    <button onClick={() => setShowAccessKey((v) => !v)} className="text-[11px] font-semibold text-brand-navy/60 hover:text-brand-gold transition">
                      {showAccessKey ? '← Sign in with email instead' : 'Using the legacy Partner ID + Access Key? Sign in here'}
                    </button>
                    {showAccessKey && (
                      <form onSubmit={handleLegacyLogin} className="mt-4 space-y-4">
                        <div>
                          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-brand-gold">Partner ID</label>
                          <input value={partnerIdInput} onChange={(e) => setPartnerIdInput(e.target.value)} placeholder="e.g. a8b9c0d1-…" className="w-full rounded-xl border border-brand-navy/15 bg-slate-50 px-3.5 py-2.5 font-mono text-xs text-brand-navy placeholder:text-slate-400 focus:border-brand-gold focus:outline-none" />
                        </div>
                        <div>
                          <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-brand-gold">Access Key (token)</label>
                          <input value={tokenInput} onChange={(e) => setTokenInput(e.target.value)} placeholder="Paste the long key from your welcome message" className="w-full rounded-xl border border-brand-navy/15 bg-slate-50 px-3.5 py-2.5 font-mono text-xs text-brand-navy placeholder:text-slate-400 focus:border-brand-gold focus:outline-none" />
                        </div>
                        {authError && <div className="rounded-lg bg-rose-50 p-2.5 text-[11px] text-rose-700">{authError}</div>}
                        <button type="submit" className="w-full rounded-full border border-brand-navy/20 py-3 text-xs font-bold uppercase tracking-wider text-brand-navy transition hover:border-brand-gold hover:text-brand-gold">
                          Sign in with access key
                        </button>
                      </form>
                    )}
                  </div>
                </div>
                <div className="rounded-2xl border border-dashed border-brand-gold/50 bg-brand-gold/5 p-5 text-[11px] leading-relaxed text-brand-navy/70">
                  <span className="font-bold text-brand-gold">Demo access:</span> register a partner above (any PAN works locally, e.g. ABCDE1234F) and your dashboard appears once the account is verified and signed in — with a share link, a zero balance and a blank ledger to try.
                </div>
              </section>
            </div>
          </div>
        ) : (
          /* ACTIVE PARTNER WORKSPACE */
          <div className="space-y-8">
            {/* Zoho Thrive-style workspace: tier card, performance, my inventory */}
            <PartnerThrive partnerId={activePartner?.id || ''} token={sessionActive ? '' : partnerToken} maturedPaise={totals.matured} onNotice={(m, ok = true) => ok ? showToast(m) : showToast(m)} />

            {/* Welcome + join-link generator — one click from the dashboard */}
            <section className="relative overflow-hidden rounded-[2rem] border border-brand-navy/10 bg-white p-8 shadow-[0_24px_60px_-30px_rgba(10,45,80,0.25)]">
              <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-brand-gold/10 blur-3xl" aria-hidden="true" />
              <div className="relative z-10 flex flex-wrap items-end justify-between gap-6">
                <div>
                  <span className={`inline-block rounded-full px-3 py-1 text-[10px] font-bold uppercase tracking-wider ${effectiveSummary?.partner?.status === 'blocked' ? 'bg-rose-500/10 text-rose-700' : 'border border-emerald-500/40 bg-emerald-500/10 text-emerald-700'}`}>
                    {effectiveSummary?.partner?.status === 'blocked' ? 'Account reviewed' : 'Active partner'}
                  </span>
                  <h1 className="mt-2 font-display text-2xl font-extrabold tracking-tight">Welcome back, {activePartner?.name || effectiveSummary?.partner?.name || 'Partner'}</h1>
                  <p className="mt-1 text-xs text-brand-navy/50">Share your link — earnings appear the moment a referred client signs an agreement.</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button onClick={waShare} className="rounded-full bg-emerald-600 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-emerald-500 active:scale-[0.97]">Share on WhatsApp</button>
                  <button onClick={copyLink} className="rounded-full bg-brand-gold px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-brand-navy transition hover:bg-brand-1 active:scale-[0.97]">{copied ? 'Copied!' : 'Copy my link'}</button>
                </div>
              </div>
              <div className="relative z-10 mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-brand-gold/40 bg-brand-gold/5 p-4">
                <span className="text-[10px] font-bold uppercase tracking-wider text-brand-gold">Your link</span>
                <code className="min-w-0 flex-1 truncate font-mono text-[11px] text-brand-navy">{referralLink || '…'}</code>
                <span className="hidden rounded-full bg-brand-navy/5 px-2 py-1 text-[9px] text-brand-navy/60 sm:inline">
                  {effectiveSummary?.partner?.status || 'active'} · joined {effectiveSummary?.partner?.joinedAt ? new Date(effectiveSummary.partner.joinedAt * 1000).toLocaleDateString() : ''}
                </span>
              </div>
            </section>

            {/* Earnings overview — real-time, rupee, self-evident */}
            <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
              {[
                { label: 'Earned (payout queue)', v: totals.matured, cls: 'text-emerald-700' },
                { label: 'Awaiting sign', v: totals.pending, cls: 'text-brand-navy' },
                { label: 'Paid to you', v: totals.paid, cls: 'text-sky-700' },
                { label: 'Lifetime', v: totals.total, cls: 'text-brand-gold' },
              ].map((k) => (
                <div key={k.label} className="rounded-2xl border border-brand-navy/10 bg-white p-5 shadow-[0_16px_40px_-20px_rgba(10,45,80,0.14)]">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{k.label}</p>
                  <p className={`mt-2 font-display text-2xl font-extrabold ${k.cls || ''}`}>{rs(k.v)}</p>
                  <p className="mt-1 font-mono text-[10px] text-slate-400">{k.v.toLocaleString()} paise</p>
                </div>
              ))}
            </section>

            {/* Refer + ledger */}
            <div className="grid grid-cols-1 gap-8 lg:grid-cols-12">
              <section className="self-start rounded-2xl border border-brand-navy/10 bg-white p-6 lg:col-span-4">
                <h3 className="font-display text-sm font-bold">Refer a client</h3>
                <p className="mt-1 text-[10px] text-brand-navy/50">Log a client token you brought into Opus. Commission matures when they sign their service agreement.</p>
                <form onSubmit={handleReferral} className="mt-5 space-y-4">
                  <div>
                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-brand-gold">Client token</label>
                    <input value={clientId} onChange={(e) => setClientId(e.target.value)} placeholder="e.g. OP-2026-5555" className="w-full rounded-xl border border-brand-navy/15 bg-slate-50 px-3.5 py-2.5 font-mono text-xs text-brand-navy placeholder:text-slate-400 focus:border-brand-gold focus:outline-none" />
                  </div>
                  <div>
                    <label className="mb-1 block text-[10px] font-bold uppercase tracking-wider text-brand-gold">Commission rate (%)</label>
                    <input type="number" min={1} max={25} value={commissionRate} onChange={(e) => setCommissionRate(parseInt(e.target.value) || 5)} className="w-full rounded-xl border border-brand-navy/15 bg-slate-50 px-3.5 py-2.5 text-xs text-brand-navy focus:border-brand-gold focus:outline-none" />
                  </div>
                  <button type="submit" disabled={logReferralMutation.isPending} className="w-full rounded-full bg-brand-navy py-3 text-xs font-bold uppercase tracking-wider text-white transition hover:bg-brand-gold hover:text-brand-navy disabled:opacity-50">
                    {logReferralMutation.isPending ? 'Logging…' : 'Log referral'}
                  </button>
                </form>
                <div className="mt-5 rounded-xl bg-slate-50 p-3 text-[10px] leading-relaxed text-brand-navy/60">
                  <span className="font-bold text-brand-navy">Payout schedule:</span> earned commissions are settled on the monthly payout run to the bank in your KYC. Held entries are reviewed by finance.
                </div>
              </section>

              {/* Ledger with breakdowns */}
              <section className="overflow-hidden rounded-2xl border border-brand-navy/10 bg-white lg:col-span-8">
                <div className="flex items-center justify-between border-b border-brand-navy/10 px-6 py-4">
                  <div>
                    <h3 className="font-display text-sm font-bold">Earnings ledger</h3>
                    <p className="text-[10px] text-brand-navy/50">Every referral, its rate, its status, and exactly how it was calculated — no black box.</p>
                  </div>
                  {isFetching && <span className="text-[10px] animate-pulse text-brand-gold">Syncing…</span>}
                </div>
                {isError && <div className="m-6 rounded-lg bg-rose-50 p-3 text-[11px] text-rose-700">{authError || 'Failed to load ledger.'}</div>}
                {!isError && referrals.length === 0 && (
                  <div className="p-12 text-center">
                    <p className="text-xs text-brand-navy/50">No referrals yet.</p>
                    <p className="mt-1 text-[10px] text-brand-navy/40">Use your copy-link or log a client above to start earning.</p>
                  </div>
                )}
                {referrals.length > 0 && (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-brand-navy/10 bg-[#FAF8F4] text-[10px] uppercase tracking-wider text-slate-500">
                          <th className="px-6 py-3">Referred client</th>
                          <th className="px-6 py-3">Rate</th>
                          <th className="px-6 py-3">Commission</th>
                          <th className="px-6 py-3">Status</th>
                        </tr>
                      </thead>
                      <tbody>
                        {referrals.map((r, i) => (
                          <tr key={r.referralId || i} className="border-b border-brand-navy/5 transition-colors last:border-0 hover:bg-brand-gold/5">
                            <td className="px-6 py-4 font-mono text-brand-navy">{r.referredClientId}</td>
                            <td className="px-6 py-4 text-slate-600">{r.ratePct}%</td>
                            <td className="px-6 py-4 font-bold text-brand-gold">{rs(r.amountPaise)}</td>
                            <td className="px-6 py-4">
                              <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[9px] font-bold uppercase tracking-wider ${statusStyles[r.status] || statusStyles.unmatured}`}>
                                <span className={`h-1.5 w-1.5 rounded-full ${r.status === 'matured' || r.status === 'paid' ? 'bg-current' : 'bg-slate-400'}`} />
                                {statusLabel[r.status] || r.status}
                              </span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            </div>

            {/* How it works + trust */}
            <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
              {[
                { t: '1 · Share', d: 'Copy your personal link or WhatsApp-share it — the client is auto-attributed to you through the lead form.' },
                { t: '2 · Client signs', d: 'When the referred client signs a service agreement, your commission for that referral matures automatically.' },
                { t: '3 · Get paid', d: 'Earned amounts are bank-transferred on the monthly payout cycle; every entry stays visible in this ledger.' },
              ].map((s) => (
                <div key={s.t} className="rounded-2xl border border-brand-navy/10 bg-white p-5">
                  <div className="text-xs font-bold uppercase tracking-wider text-brand-gold">{s.t}</div>
                  <p className="mt-2 text-[11px] leading-relaxed text-brand-navy/60">{s.d}</p>
                </div>
              ))}
            </section>
          </div>
        )}
      </main>

      {/* Toast */}
      <div className={`fixed right-6 bottom-6 z-50 flex items-center gap-2 rounded-xl border-l-4 border-brand-gold bg-brand-navy px-4 py-3 text-xs text-white shadow-2xl transition duration-300 ${toast.show ? 'translate-y-0 opacity-100' : 'translate-y-24 opacity-0'}`}>
        <span className="font-bold text-brand-gold">PARTNER:</span>
        <span>{toast.msg}</span>
      </div>
    </div>
  );
}