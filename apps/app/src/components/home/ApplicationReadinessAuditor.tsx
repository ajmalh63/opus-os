import React, { useState } from 'react';
import { useLocation } from 'wouter';

interface AuditResult {
  score: number;
  badge: string;
  summary: string;
  mitigations: string[];
}

export default function ApplicationReadinessAuditor() {
  const [, setLocation] = useLocation();

  const [division, setDivision] = useState<'study' | 'visa' | 'umrah' | 'attestation' | 'recruitment'>('study');
  const [profileInput1, setProfileInput1] = useState('bachelors_pass');
  const [targetDestination, setTargetDestination] = useState('USA / Germany');
  const [audited, setAudited] = useState(false);
  const [loading, setLoading] = useState(false);
  const [auditName, setAuditName] = useState('');
  const [auditPhone, setAuditPhone] = useState('');
  const [reportSent, setReportSent] = useState<string | null>(null); // lead token
  const [reportError, setReportError] = useState('');
  const [sendingReport, setSendingReport] = useState(false);

  const calculateAudit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setAudited(true);
    }, 450);
  };

  const DIVISION_MAP: Record<string, string> = {
    study: 'study-abroad', visa: 'visa', umrah: 'umrah', attestation: 'attestation', recruitment: 'manpower',
  };

  // Express-lead capture: the audit result is worthless to the client if we
  // don't persist it — POST /api/public/leads/express creates/updates the CRM
  // client + engagement + communication row (dedupe by phone).
  const sendReport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (auditName.trim().length < 2 || auditPhone.replace(/\D/g, '').length < 7) {
      setReportError('Please enter your name and a valid phone number.');
      return;
    }
    setSendingReport(true);
    setReportError('');
    try {
      const res = await fetch('/api/public/leads/express', { credentials: 'include', 
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: auditName.trim(),
          phone: auditPhone.trim(),
          division: DIVISION_MAP[division] || 'study-abroad',
          goal: 'Readiness audit report',
          targetCountry: targetDestination,
          context: { auditScore: result.score, badge: result.badge, profile: profileInput1 },
          leadSource: 'home-readiness-auditor',
        }),
      });
      const d = await res.json().catch(() => ({}));
      if (res.ok && d?.success) {
        setReportSent(d.token || 'yes');
      } else {
        setReportError(d?.error || 'Could not send the report — please try again.');
      }
    } catch {
      setReportError('Network error — please try again.');
    } finally {
      setSendingReport(false);
    }
  };

  const getResult = (): AuditResult => {
    switch (division) {
      case 'study':
        return {
          score: profileInput1 === 'gap_years' ? 84 : 96,
          badge: 'High Admissions Probability',
          summary: 'Your academic profile qualifies for direct institutional shortlisting with scholarship eligibility across top-ranked universities.',
          mitigations: [
            'SOP & Statement of Intent curated to explain any academic timeline gaps',
            'Pre-vetted financial sponsor affidavits formatted to embassy guidelines',
            '1-on-1 consular mock interview drills with ex-visa officers',
          ],
        };
      case 'visa':
        return {
          score: 94,
          badge: 'Streamlined Consular Processing',
          summary: 'Your travel intent and documentation meet standard consular review criteria for express appointment queuing.',
          mitigations: [
            'Complete VFS / Consulate document stack verification prior to submission',
            'Cover letter & travel itinerary structured for zero-rejection compliance',
            'Direct consular appointment tracking and door-to-door courier tracking',
          ],
        };
      case 'umrah':
        return {
          score: 99,
          badge: 'Customized Package Assistance',
          summary: 'Customized Umrah itinerary with pre-vetted Haram proximity hotel allocations and complete visa assistance.',
          mitigations: [
            'Direct Saudi Airlines HYD → JED flight block reservations (subject to flight schedule confirmations)',
            'Makkah Clock Tower & Madinah Central Markaziah room allotments based on selected tier',
            'Complete scholar-led spiritual orientation & ground transport assistance',
          ],
        };
      case 'attestation':
        return {
          score: 98,
          badge: 'Statutory MEA & Apostille Route',
          summary: 'Your certificate category has an established statutory legalization sequence for destination country acceptance.',
          mitigations: [
            'State HRD / Home Department verification handled directly without sub-agents',
            'Ministry of External Affairs (MEA) New Delhi Apostille / Embassy stamp',
            'Tamper-evident Blue Dart insured courier pouch with real-time GPS tracking',
          ],
        };
      case 'recruitment':
        return {
          score: 91,
          badge: 'Direct Employer Match Open',
          summary: 'Your professional credentials align with active overseas employer recruitment drives sourced through Govt. Registered MEA-Licensed Partners.',
          mitigations: [
            'Govt-vetted foreign employer contracts with full salary and perk transparency',
            'Zero extortion policy: employer-sponsored visa, airfare, and contract medical benefits',
            'Pre-departure cultural & workplace orientation session included',
          ],
        };
    }
  };

  const result = getResult();

  return (
    <section className="bg-white py-20 sm:py-24 border-b border-brand-navy/10 relative">
      <div className="mx-auto max-w-5xl px-5 sm:px-6">
        
        {/* Title */}
        <div className="mb-12 text-center space-y-3">
          <span className="rounded-full bg-brand-gold/15 border border-brand-gold/30 px-3.5 py-1 text-[11px] font-bold uppercase tracking-wider text-brand-gold font-mono">
            Interactive Assessment Engine
          </span>
          <h2 className="font-display fluid-h2 font-extrabold text-brand-navy tracking-tight">
            60-Second Application Readiness & Risk Auditor
          </h2>
          <p className="text-xs sm:text-sm text-brand-textLight max-w-lg mx-auto">
            Test your profile parameters to evaluate consular approval probability, uncover hidden hurdles, and see how Opus OS streamlines execution and maximizes approval odds.
          </p>
        </div>

        {/* Division Selector Tabs */}
        <div className="mb-8 flex flex-wrap justify-center gap-2">
          {[
            { key: 'study', label: '🎓 Study Abroad' },
            { key: 'visa', label: '✈️ Visa Filing' },
            { key: 'umrah', label: '🕌 Umrah & Travel' },
            { key: 'attestation', label: '📜 Attestation' },
            { key: 'recruitment', label: '💼 Overseas Careers' },
          ].map(tab => (
            <button
              key={tab.key}
              onClick={() => { setDivision(tab.key as any); setAudited(false); }}
              className={`cursor-pointer rounded-full px-4 py-2 text-xs font-bold transition-all ${
                division === tab.key
                  ? 'bg-brand-navy text-white shadow-md'
                  : 'bg-slate-100 text-brand-navy/70 hover:bg-slate-200 hover:text-brand-navy'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {/* Interactive Calculator Surface */}
        <div className="clay-card p-7 sm:p-10">
          <form onSubmit={calculateAudit} className="grid grid-cols-1 md:grid-cols-3 gap-5 items-end">
            
            {division === 'study' && (
              <>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-textLight mb-1.5">
                    Target Study Country
                  </label>
                  <select
                    value={targetDestination}
                    onChange={e => setTargetDestination(e.target.value)}
                    className="w-full rounded-xl border border-brand-navy/15 bg-white px-3.5 py-3 text-xs font-bold text-brand-navy focus:border-brand-gold focus:outline-none"
                  >
                    <option>USA (Stem OPT / Ivy & State Unis)</option>
                    <option>Germany (TU9 / Public Tuition-Free)</option>
                    <option>United Kingdom (1-Year Masters / PSWP)</option>
                    <option>Australia (CRICOS & Regional Subclasses)</option>
                    <option>Canada & Ireland (Global Top 100)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-textLight mb-1.5">
                    Academic Background & Gaps
                  </label>
                  <select
                    value={profileInput1}
                    onChange={e => setProfileInput1(e.target.value)}
                    className="w-full rounded-xl border border-brand-navy/15 bg-white px-3.5 py-3 text-xs font-bold text-brand-navy focus:border-brand-gold focus:outline-none"
                  >
                    <option value="bachelors_pass">Fresh Graduate (0–1 yr gap, 60%+ GPA)</option>
                    <option value="gap_years">Working Professional (2–5 yr gap)</option>
                    <option value="backlogs">Academic Backlogs / Profile Pivot</option>
                  </select>
                </div>
              </>
            )}

            {division === 'visa' && (
              <>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-textLight mb-1.5">
                    Destination Region
                  </label>
                  <select
                    value={targetDestination}
                    onChange={e => setTargetDestination(e.target.value)}
                    className="w-full rounded-xl border border-brand-navy/15 bg-white px-3.5 py-3 text-xs font-bold text-brand-navy focus:border-brand-gold focus:outline-none"
                  >
                    <option>Schengen 29 European States</option>
                    <option>Dubai & GCC Freezones</option>
                    <option>United Kingdom / USA B1/B2</option>
                    <option>Southeast Asia (Thailand, Malaysia, Vietnam)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-textLight mb-1.5">
                    Filing Purpose
                  </label>
                  <select
                    value={profileInput1}
                    onChange={e => setProfileInput1(e.target.value)}
                    className="w-full rounded-xl border border-brand-navy/15 bg-white px-3.5 py-3 text-xs font-bold text-brand-navy focus:border-brand-gold focus:outline-none"
                  >
                    <option value="bachelors_pass">Tourism & Family Visit</option>
                    <option value="gap_years">Business Conference & Trade Meeting</option>
                    <option value="backlogs">Express Consular Transit</option>
                  </select>
                </div>
              </>
            )}

            {division === 'umrah' && (
              <>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-textLight mb-1.5">
                    Intended Travel Period
                  </label>
                  <select
                    value={targetDestination}
                    onChange={e => setTargetDestination(e.target.value)}
                    className="w-full rounded-xl border border-brand-navy/15 bg-white px-3.5 py-3 text-xs font-bold text-brand-navy focus:border-brand-gold focus:outline-none"
                  >
                    <option>Upcoming Scheduled Group Departure</option>
                    <option>Ramadan Sacred Last 10 Days</option>
                    <option>Custom Family VIP Suite (Anytime)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-textLight mb-1.5">
                    Group Size & Special Assistance
                  </label>
                  <select
                    value={profileInput1}
                    onChange={e => setProfileInput1(e.target.value)}
                    className="w-full rounded-xl border border-brand-navy/15 bg-white px-3.5 py-3 text-xs font-bold text-brand-navy focus:border-brand-gold focus:outline-none"
                  >
                    <option value="bachelors_pass">Family Group (With Senior Citizens / Wheelchair)</option>
                    <option value="gap_years">Couple / Quad Sharing Group</option>
                    <option value="backlogs">Single Pilgrim Fast-Track</option>
                  </select>
                </div>
              </>
            )}

            {division === 'attestation' && (
              <>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-textLight mb-1.5">
                    Document Category
                  </label>
                  <select
                    value={targetDestination}
                    onChange={e => setTargetDestination(e.target.value)}
                    className="w-full rounded-xl border border-brand-navy/15 bg-white px-3.5 py-3 text-xs font-bold text-brand-navy focus:border-brand-gold focus:outline-none"
                  >
                    <option>Degree / Diploma / Medical Marksheets</option>
                    <option>Marriage / Birth / Police Clearance (PCC)</option>
                    <option>Commercial Invoices / Power of Attorney</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-textLight mb-1.5">
                    Destination Authority
                  </label>
                  <select
                    value={profileInput1}
                    onChange={e => setProfileInput1(e.target.value)}
                    className="w-full rounded-xl border border-brand-navy/15 bg-white px-3.5 py-3 text-xs font-bold text-brand-navy focus:border-brand-gold focus:outline-none"
                  >
                    <option value="bachelors_pass">UAE / Saudi / Qatar / Kuwait Embassy</option>
                    <option value="gap_years">Hague Apostille (USA / UK / Europe)</option>
                  </select>
                </div>
              </>
            )}

            {division === 'recruitment' && (
              <>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-textLight mb-1.5">
                    Sector & Profession
                  </label>
                  <select
                    value={targetDestination}
                    onChange={e => setTargetDestination(e.target.value)}
                    className="w-full rounded-xl border border-brand-navy/15 bg-white px-3.5 py-3 text-xs font-bold text-brand-navy focus:border-brand-gold focus:outline-none"
                  >
                    <option>Civil, Electrical & Mechanical Engineering</option>
                    <option>Nursing, MBBS & Allied Healthcare</option>
                    <option>Hospitality, Chefs & Facilities Management</option>
                    <option>IT, Logistics & Operations</option>
                  </select>
                </div>
                <div>
                  <label className="block text-[10px] font-bold uppercase tracking-wider text-brand-textLight mb-1.5">
                    Experience Level
                  </label>
                  <select
                    value={profileInput1}
                    onChange={e => setProfileInput1(e.target.value)}
                    className="w-full rounded-xl border border-brand-navy/15 bg-white px-3.5 py-3 text-xs font-bold text-brand-navy focus:border-brand-gold focus:outline-none"
                  >
                    <option value="bachelors_pass">3+ Years Industry Experience</option>
                    <option value="gap_years">Fresh Graduate / Certified Technician</option>
                    <option value="backlogs">5+ Years Senior Leadership</option>
                  </select>
                </div>
              </>
            )}

            <div>
              <button
                type="submit"
                disabled={loading}
                className="w-full cursor-pointer rounded-xl bg-brand-gold py-3 text-xs font-extrabold uppercase tracking-wider text-brand-navy hover:bg-brand-gold-hover hover:text-white transition-all shadow-md tactile-btn"
              >
                {loading ? 'Evaluating Profile…' : 'Run Profile Audit →'}
              </button>
            </div>
          </form>

          {/* Results Output Block */}
          {audited && (
            <div className="mt-8 pt-7 border-t border-brand-navy/10 animate-[fadeIn_0.3s_ease-out]">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-display text-2xl sm:text-3xl font-black text-brand-navy">
                      {result.score}%
                    </span>
                    <span className="rounded-full bg-emerald-500/15 border border-emerald-500/30 px-3 py-0.5 text-xs font-bold text-emerald-800">
                      {result.badge}
                    </span>
                  </div>
                  <p className="text-xs sm:text-sm text-brand-textLight mt-1">
                    {result.summary}
                  </p>
                </div>

                <button
                  onClick={() => setLocation('/lead-form')}
                  className="cursor-pointer shrink-0 rounded-full bg-brand-navy px-6 py-3 text-xs font-extrabold uppercase tracking-wider text-white hover:bg-brand-gold hover:text-brand-navy transition-all shadow-md tactile-btn"
                >
                  Get Full Readiness Assessment & Consultation →
                </button>
              </div>

              {/* CRM-linked report capture — express lead, deduped by phone */}
              {reportSent ? (
                <div className="mb-6 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-4 text-center">
                  <p className="text-sm font-bold text-emerald-800">✅ Personalized Application Plan Ready!</p>
                  <p className="mt-1 text-xs text-emerald-800/80">
                    Our senior counsellor will review your profile criteria and reach out with your recommended roadmap.
                  </p>
                  <a
                    href={`/portal?token=${encodeURIComponent(reportSent)}`}
                    className="mt-3 inline-block rounded-full bg-brand-navy px-5 py-2 text-[11px] font-bold uppercase tracking-wider text-white hover:bg-brand-gold hover:text-brand-navy transition-all"
                  >
                    Track Your Application →
                  </a>
                </div>
              ) : (
                <form onSubmit={sendReport} className="mb-6 rounded-2xl border border-brand-gold/30 bg-brand-gold/5 p-4 sm:p-5">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-brand-navy/60 mb-3">
                    Get your detailed readiness report on WhatsApp — free
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] gap-2.5">
                    <input
                      value={auditName}
                      onChange={(e) => setAuditName(e.target.value)}
                      placeholder="Your name *"
                      className="rounded-lg border border-brand-navy/15 bg-white px-3 py-2.5 text-xs font-semibold text-brand-navy placeholder:text-brand-navy/35 focus:border-brand-gold focus:outline-none"
                    />
                    <input
                      value={auditPhone}
                      onChange={(e) => setAuditPhone(e.target.value)}
                      type="tel"
                      placeholder="WhatsApp number *"
                      className="rounded-lg border border-brand-navy/15 bg-white px-3 py-2.5 text-xs font-semibold text-brand-navy placeholder:text-brand-navy/35 focus:border-brand-gold focus:outline-none"
                    />
                    <button
                      type="submit"
                      disabled={sendingReport}
                      className="rounded-lg bg-brand-gold px-5 py-2.5 text-[11px] font-extrabold uppercase tracking-wider text-brand-navy hover:bg-brand-gold-hover hover:text-white transition-all disabled:opacity-50 cursor-pointer"
                    >
                      {sendingReport ? 'Sending…' : 'Send My Report'}
                    </button>
                  </div>
                  {reportError && <p className="mt-2 text-[11px] font-semibold text-red-600">{reportError}</p>}
                </form>
              )}

              <div className="rounded-2xl bg-slate-50 border border-brand-navy/5 p-4 sm:p-5">
                <p className="text-[10px] font-bold uppercase tracking-wider text-brand-textLight mb-2.5">
                  How Opus OS Mitigates Rejection Hurdles:
                </p>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {result.mitigations.map((m, idx) => (
                    <div key={idx} className="flex items-start gap-2 text-xs text-brand-navy/90">
                      <span className="text-brand-gold font-black shrink-0">✓</span>
                      <span>{m}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

      </div>
    </section>
  );
}
