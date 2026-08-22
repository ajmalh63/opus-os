import React, { useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';

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
  const [leadForm, setLeadForm] = useState({ name: '', email: '', phone: '', service: 'study_abroad' });
  const [submitting, setSubmitting] = useState(false);
  const [submitMsg, setSubmitMsg] = useState<string | null>(null);

  const referralUrl = typeof window !== 'undefined' 
    ? `${window.location.origin}/?ref=${partnerCode || 'OPUS-PARTNER'}`
    : `https://opusoverseas.com/?ref=${partnerCode || 'OPUS-PARTNER'}`;

  const handleCopyLink = () => {
    navigator.clipboard.writeText(referralUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
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
    <div className="space-y-8 animate-fadeIn">
      {/* 1. PARTNER METRICS CARDS */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Earned */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col justify-between hover:border-brand-gold/40 transition">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Commissions</span>
            <span className="w-9 h-9 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center text-base font-bold shadow-xs">
              💰
            </span>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-extrabold text-brand-navy font-display">₹{(totals.total / 100).toLocaleString('en-IN')}</div>
            <div className="text-xs text-slate-500 mt-0.5">Lifetime earned commissions</div>
          </div>
        </div>

        {/* Ready to Payout (Matured) */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col justify-between hover:border-brand-gold/40 transition">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Ready for Payout</span>
            <span className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-base font-bold shadow-xs">
              ⚡
            </span>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-extrabold text-emerald-600 font-display">₹{(totals.matured / 100).toLocaleString('en-IN')}</div>
            <div className="text-xs text-slate-500 mt-0.5">Matured balance ready for bank transfer</div>
          </div>
        </div>

        {/* Active Candidates */}
        <div className="bg-white rounded-2xl p-5 border border-slate-200/80 shadow-xs flex flex-col justify-between hover:border-brand-gold/40 transition">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Referred Candidates</span>
            <span className="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center text-base font-bold shadow-xs">
              👥
            </span>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-extrabold text-brand-navy font-display">{referrals.length}</div>
            <div className="text-xs text-slate-500 mt-0.5">Leads submitted & tracking</div>
          </div>
        </div>

        {/* Partner Tier Card */}
        <div className="bg-gradient-to-br from-brand-navy to-[#111A36] text-white rounded-2xl p-5 border border-brand-navy shadow-sm flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-brand-gold">Affiliate Tier</span>
            <span className="text-[10px] bg-brand-gold/20 text-brand-gold font-bold px-2 py-0.5 rounded-md border border-brand-gold/30">
              {partnerTier}
            </span>
          </div>
          <div className="mt-2">
            <div className="font-bold text-sm text-white">{partnerName || 'Partner Desk'}</div>
            <div className="text-[11px] text-white/70 font-mono">Code: {partnerCode || 'OPUS-PARTNER'}</div>
          </div>
          <button
            type="button"
            onClick={() => onNavigateTab('payouts')}
            className="mt-3 w-full text-center bg-brand-gold hover:bg-brand-goldHover text-brand-navy py-1.5 rounded-lg text-[11px] font-bold uppercase tracking-wider transition shadow-xs cursor-pointer"
          >
            Request Settlement →
          </button>
        </div>
      </section>

      {/* 2. LIVE REFERRAL KANBAN BOARD */}
      <section className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-display font-extrabold text-lg text-brand-navy">Live Referral Pipeline</h2>
              <span className="text-[10px] bg-emerald-50 border border-emerald-200 text-emerald-700 px-2.5 py-0.5 rounded-full font-bold">
                Auto-Synced with Counselor Desk
              </span>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              Live progression of your referred candidates as our counseling team guides them through admissions, visas, and enrollment.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onNavigateTab('referrals')}
              className="text-xs bg-brand-navy hover:bg-brand-navy/90 text-white font-bold px-3.5 py-2 rounded-xl transition cursor-pointer shadow-xs"
            >
              + Submit Referral
            </button>
          </div>
        </div>

        {/* Kanban Board Columns */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-3.5">
          {kanbanColumns.map((col) => {
            const itemsInCol = referrals.filter((r) => getStageForReferral(r) === col.id);
            return (
              <div key={col.id} className="bg-slate-50/90 rounded-xl p-3.5 border border-slate-200/70 flex flex-col gap-2.5 min-h-[280px]">
                <div className="flex items-center justify-between pb-2 border-b border-slate-200/70">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs">{col.icon}</span>
                    <span className="text-[11px] font-bold text-slate-700">{col.label}</span>
                  </div>
                  <span className="text-[10px] font-bold bg-white border border-slate-200 text-slate-600 px-1.5 py-0.2 rounded-full">
                    {itemsInCol.length}
                  </span>
                </div>

                <div className="flex flex-col gap-2.5 flex-1">
                  {itemsInCol.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-3 border-2 border-dashed border-slate-200/50 rounded-lg">
                      <span className="text-slate-400 text-[11px] font-medium">No candidates</span>
                    </div>
                  ) : (
                    itemsInCol.map((r, idx) => (
                      <div
                        key={r.referralId || idx}
                        onClick={() => onNavigateTab('referrals')}
                        className="bg-white hover:bg-slate-50 rounded-xl p-3 border border-slate-200 hover:border-brand-gold/60 shadow-xs transition cursor-pointer space-y-1.5"
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
                          Commission Rate: {r.ratePct || 10}%
                        </div>
                        <div className="text-[9px] text-slate-400 capitalize">
                          Status: {r.status || 'Active in pipeline'}
                        </div>
                      </div>
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
        {/* Shareable Link Generator */}
        <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="font-display font-bold text-base text-brand-navy">Your Master Tracking Link</h3>
            <span className="text-[10px] bg-brand-gold/15 text-brand-navy font-bold px-2 py-0.5 rounded-full border border-brand-gold/30">
              Cookie 90-Days Active
            </span>
          </div>

          <p className="text-xs text-slate-500">
            Share this link with students, pilgrims, and job seekers. Any lead who signs up or submits an inquiry is permanently attributed to your commission wallet.
          </p>

          <div className="flex items-center gap-2 bg-slate-50 p-2.5 rounded-xl border border-slate-200">
            <input
              type="text"
              readOnly
              value={referralUrl}
              className="w-full text-xs font-mono bg-transparent text-slate-800 outline-none select-all"
            />
            <button
              type="button"
              onClick={handleCopyLink}
              className="shrink-0 bg-brand-gold hover:bg-brand-goldHover text-brand-navy font-bold text-xs px-3.5 py-1.5 rounded-lg transition uppercase tracking-wider cursor-pointer shadow-xs"
            >
              {copied ? 'Copied! ✓' : 'Copy Link'}
            </button>
          </div>

          <div className="pt-3 border-t border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white rounded-lg border border-slate-200">
                <QRCodeSVG value={referralUrl} size={64} />
              </div>
              <div>
                <div className="text-xs font-bold text-slate-800">Scan & Share QR Code</div>
                <div className="text-[10px] text-slate-500">Print or share on WhatsApp status & brochures</div>
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
        <div className="bg-white rounded-2xl p-6 border border-slate-200/80 shadow-xs space-y-4">
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
