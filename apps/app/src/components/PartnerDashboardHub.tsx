import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import EarningsHero from './partner/EarningsHero';
import NextBestAction from './partner/NextBestAction';
import ResourceStageTabs from './partner/ResourceStageTabs';
import OfflineBanner from './shared/OfflineBanner';

export interface PartnerDashboardHubProps {
  partnerName: string;
  partnerCode: string;
  partnerTier: string;
  totals: {
    matured: number;
    pending: number;
    paid: number;
    total: number;
  };
  referrals: any[];
  onNavigateTab: (tab: 'overview' | 'links' | 'referrals' | 'payouts' | 'tiers') => void;
  onQuickReferralSubmit?: (lead: { name: string; email: string; phone: string; service: string }) => Promise<void>;
}

export default function PartnerDashboardHub({
  partnerName,
  partnerCode,
  partnerTier = 'Gold Partner',
  totals = { matured: 0, pending: 0, paid: 0, total: 0 },
  referrals = [],
  onNavigateTab,
  onQuickReferralSubmit,
}: PartnerDashboardHubProps) {
  const [copied, setCopied] = useState(false);
  const [subId, setSubId] = useState('');
  const [leadForm, setLeadForm] = useState({ name: '', email: '', phone: '', service: 'study_abroad' });
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<string | null>(null);

  const baseUrl = typeof window !== 'undefined' 
    ? `${window.location.origin}/?ref=${partnerCode || 'OPUS-PARTNER'}`
    : `https://opusoverseas.com/?ref=${partnerCode || 'OPUS-PARTNER'}`;

  const referralUrl = subId.trim() ? `${baseUrl}&subid=${encodeURIComponent(subId.trim())}` : baseUrl;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(referralUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const handleDownloadQrSvg = () => {
    const svgEl = document.getElementById('partner-qr-svg');
    if (!svgEl) return;
    const serializer = new XMLSerializer();
    const source = serializer.serializeToString(svgEl);
    const blob = new Blob([source], { type: 'image/svg+xml;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `opus-partner-${partnerCode || 'referral'}-qr.svg`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleShareWhatsApp = () => {
    const text = encodeURIComponent(
      `Plan your Study Abroad, Visa Stamping, or Umrah journey with Opus Overseas. Get verified counseling and fast-track processing: ${referralUrl}`
    );
    window.open(`https://wa.me/?text=${text}`, '_blank');
  };

  const handleLeadSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!onQuickReferralSubmit) return;
    setSubmitting(true);
    try {
      await onQuickReferralSubmit(leadForm);
      setSubmitMsg('Referral successfully submitted to Opus counseling desk!');
      setLeadForm({ name: '', email: '', phone: '', service: 'study_abroad' });
      setTimeout(() => setSubmitMsg(null), 4000);
    } catch (err: any) {
      setSubmitMsg(err.message || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  // 5-Column Partner Referral Pipeline
  const kanbanColumns = [
    { id: 'new', label: '1. Referral Intake', icon: '📥', color: 'border-blue-300 bg-blue-50/50' },
    { id: 'counseling', label: '2. Active Counseling', icon: '🔍', color: 'border-amber-300 bg-amber-50/50' },
    { id: 'docs', label: '3. Docs & Verification', icon: '📑', color: 'border-indigo-300 bg-indigo-50/50' },
    { id: 'enrolled', label: '4. Enrolled (Matured)', icon: '💳', color: 'border-emerald-300 bg-emerald-50/50' },
    { id: 'settled', label: '5. Commission Settled', icon: '🏆', color: 'border-brand-gold/50 bg-amber-50/60' },
  ];

  const getStageForReferral = (r: any): string => {
    const status = (r.status || '').toLowerCase();
    if (['new', 'unmatured', 'pending', 'lead'].includes(status)) return 'new';
    if (['counseling', 'contacted', 'shortlisted'].includes(status)) return 'counseling';
    if (['docs', 'documents', 'processing', 'agreement_sent'].includes(status)) return 'docs';
    if (['matured', 'enrolled', 'paid_by_client', 'approved'].includes(status)) return 'enrolled';
    if (['paid', 'settled', 'completed'].includes(status)) return 'settled';
    return 'new';
  };

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* 0. OFFLINE / STALE — never show stale as live */}
      <OfflineBanner />

      {/* 0. EARNINGS HERO — Z endpoint top, goal gradient (Cockpit) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
        <div className="lg:col-span-8">
          <EarningsHero
            availablePaise={totals.matured}
            pendingPaise={totals.pending}
            paidPaise={totals.paid}
            tier={partnerTier}
            progressPct={72}
            nextTier="Platinum"
            onWithdraw={() => onNavigateTab('payouts')}
            onViewRewards={() => onNavigateTab('tiers')}
          />
        </div>
        <div className="lg:col-span-4">
          <NextBestAction
            title={`Welcome back, ${partnerName || 'Partner'}!`}
            hint="Share your 90-day tracking link to capture incoming admissions and visas."
            cta="Generate Campaign Link →"
            onAction={() => onNavigateTab('links')}
          />
        </div>
      </div>

      {/* 1. RESOURCE / DIVISION TABS */}
      <ResourceStageTabs />

      {/* 2. LIVE 5-COLUMN REFERRAL KANBAN STREAM */}
      <section className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-100">
          <div>
            <h3 className="font-display font-bold text-base text-brand-navy flex items-center gap-2">
              <span>🎯 Live Candidate Progression Stream</span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600">
                {referrals.length} Active Leads
              </span>
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Track your referred applicants in real time from initial consultation to commission maturity.
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab('referrals')}
            className="text-xs text-brand-navy font-bold hover:text-brand-gold transition self-start sm:self-auto cursor-pointer"
          >
            View full ledger →
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-3">
          {kanbanColumns.map((col) => {
            const colReferrals = referrals.filter((r) => getStageForReferral(r) === col.id);
            return (
              <div key={col.id} className={`rounded-2xl p-3 border ${col.color} space-y-3 min-h-[180px]`}>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-slate-700 flex items-center gap-1.5">
                    <span>{col.icon}</span>
                    <span className="truncate">{col.label}</span>
                  </span>
                  <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-full bg-white text-slate-700 shadow-2xs">
                    {colReferrals.length}
                  </span>
                </div>

                <div className="space-y-2">
                  {colReferrals.length === 0 ? (
                    <div className="py-8 text-center text-[10px] text-slate-400">
                      No candidates in this stage
                    </div>
                  ) : (
                    colReferrals.map((r, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => onNavigateTab('referrals')}
                        className="w-full text-left p-2.5 rounded-xl bg-white border border-slate-200/80 shadow-2xs hover:border-brand-gold hover:shadow-xs transition space-y-1.5 cursor-pointer"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-200">
                            Client #{r.referredClientId?.slice(0, 8) || 'REF'}
                          </span>
                          <span className="text-[10px] font-extrabold text-brand-gold">
                            ₹{((r.amountPaise || 0) / 100).toLocaleString('en-IN')}
                          </span>
                        </div>
                        <div className="text-[11px] font-bold text-slate-800">
                          Commission: {r.ratePct || 10}%
                        </div>
                        <div className="text-[9px] text-slate-400 capitalize">
                          Status: {r.status || 'Active in pipeline'}
                        </div>
                      </button>
                    ))
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* 3. QUICK REFERRAL ENGINE & SHARE LINKS */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Shareable Link & Campaign Studio */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold text-base text-brand-navy">Deep-Link & Campaign Studio</h3>
            <span className="text-[10px] bg-brand-gold/15 text-brand-navy font-bold px-2.5 py-0.5 rounded-full border border-brand-gold/30">
              Cookie 90-Days Active
            </span>
          </div>

          <p className="text-xs text-slate-500">
            Share your attribution link across WhatsApp, social media, and offline print ads. Leads are permanently tagged to your wallet.
          </p>

          {/* SubID Tagging Input */}
          <div className="flex items-center gap-2">
            <label className="text-[10px] font-extrabold uppercase tracking-wider text-slate-500 shrink-0">
              Campaign Tag (SubID):
            </label>
            <input
              type="text"
              placeholder="e.g. whatsapp_story, seminar_march"
              value={subId}
              onChange={(e) => setSubId(e.target.value.replace(/\s+/g, '_'))}
              className="flex-1 text-xs px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 font-mono outline-none focus:border-brand-gold"
            />
          </div>

          <div className="flex items-center gap-2 bg-slate-50 p-2.5 rounded-2xl border border-slate-200">
            <input
              type="text"
              readOnly
              value={referralUrl}
              className="w-full text-xs font-mono bg-transparent text-slate-800 outline-none select-all"
            />
            <button
              type="button"
              onClick={handleCopyLink}
              className="shrink-0 bg-brand-gold hover:bg-brand-goldHover text-brand-navy font-bold text-xs px-3.5 py-2 rounded-xl transition uppercase tracking-wider cursor-pointer shadow-xs"
            >
              {copied ? 'Copied! ✓' : 'Copy'}
            </button>
            <button
              type="button"
              onClick={handleShareWhatsApp}
              className="shrink-0 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs px-3 py-2 rounded-xl transition cursor-pointer shadow-xs flex items-center gap-1"
              title="Share directly on WhatsApp"
            >
              <span>💬</span>
              <span className="hidden sm:inline">WhatsApp</span>
            </button>
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white rounded-xl border border-slate-200 shadow-2xs">
                <QRCodeSVG id="partner-qr-svg" value={referralUrl} size={64} />
              </div>
              <div className="space-y-1">
                <div className="text-xs font-bold text-slate-800">Printable Vector QR Code</div>
                <button
                  type="button"
                  onClick={handleDownloadQrSvg}
                  className="text-[10px] text-brand-navy font-bold hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <span>📥 Download Vector SVG</span>
                </button>
              </div>
            </div>
            <button
              type="button"
              onClick={() => onNavigateTab('links')}
              className="text-xs text-brand-navy font-bold hover:text-brand-gold transition"
            >
              Custom division links →
            </button>
          </div>
        </div>

        {/* Quick Candidate Intake Form */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold text-base text-brand-navy">Fast Candidate Referral</h3>
            <span className="text-[10px] text-slate-400">Direct desk handoff</span>
          </div>

          {submitMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs rounded-xl font-medium">
              {submitMsg}
            </div>
          )}

          <form onSubmit={handleLeadSubmit} className="space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="text"
                required
                placeholder="Candidate Full Name"
                value={leadForm.name}
                onChange={(e) => setLeadForm({ ...leadForm, name: e.target.value })}
                className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:border-brand-gold outline-none"
              />
              <input
                type="tel"
                required
                placeholder="WhatsApp Phone (+91...)"
                value={leadForm.phone}
                onChange={(e) => setLeadForm({ ...leadForm, phone: e.target.value })}
                className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:border-brand-gold outline-none"
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <input
                type="email"
                required
                placeholder="Candidate Email Address"
                value={leadForm.email}
                onChange={(e) => setLeadForm({ ...leadForm, email: e.target.value })}
                className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 placeholder-slate-400 focus:border-brand-gold outline-none"
              />
              <select
                value={leadForm.service}
                onChange={(e) => setLeadForm({ ...leadForm, service: e.target.value })}
                className="w-full text-xs p-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-800 outline-none focus:border-brand-gold"
              >
                <option value="study_abroad">🎓 Study Abroad (Admissions)</option>
                <option value="visa_services">✈️ Visa Processing</option>
                <option value="umrah_pilgrimage">🕋 Umrah Pilgrimage</option>
                <option value="attestation">📑 Document Attestation</option>
                <option value="global_jobs">💼 Overseas Jobs & Careers</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={submitting}
              className="w-full bg-brand-navy hover:bg-brand-navy/90 text-white py-2.5 rounded-xl text-xs font-extrabold uppercase tracking-wider transition disabled:opacity-50 cursor-pointer shadow-xs"
            >
              {submitting ? 'Submitting to Counseling Desk...' : 'Submit Referral Candidate →'}
            </button>
          </form>
        </div>
      </section>
    </div>
  );
}
