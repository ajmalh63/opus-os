import React, { useState } from 'react';

export interface ClientDashboardProps {
  clientName: string;
  clientEmail: string;
  accountId: string;
  sessionData: any;
  assignedCounselor?: { name: string; role: string; email?: string };
  studyApps: any[];
  visaApps: any[];
  umrahBookings: any[];
  attestationApps: any[];
  jobApps: any[];
  onNavigateTab: (tab: 'study' | 'visa' | 'umrah' | 'attestation' | 'jobs' | 'vault' | 'payments') => void;
}

export default function ClientDashboardHub({
  clientName,
  clientEmail,
  accountId,
  sessionData,
  assignedCounselor,
  studyApps = [],
  visaApps = [],
  umrahBookings = [],
  attestationApps = [],
  jobApps = [],
  onNavigateTab,
}: ClientDashboardProps) {
  const [activeFilter, setActiveFilter] = useState<'all' | 'study' | 'visa' | 'umrah' | 'attestation' | 'jobs'>('all');

  const totalEnrolled = studyApps.length + visaApps.length + umrahBookings.length + attestationApps.length + jobApps.length;
  
  const totalDocs = sessionData?.journeys?.flatMap((j: any) => j.documents || []) || [];
  const verifiedDocsCount = totalDocs.filter((d: any) => d.status === 'verified' || d.status === 'approved').length;
  
  const totalPayments = sessionData?.journeys?.flatMap((j: any) => j.payments || []) || [];
  const totalPaidPaise = totalPayments.reduce((acc: number, p: any) => acc + (p.amount || 0), 0);

  // 5-Column Gold Standard Pipeline
  const kanbanColumns = [
    { 
      id: 'intake', 
      label: '1. Consultation & Intake', 
      tagline: 'Initial profiling & eligibility review',
      icon: '📝', 
      badgeBg: 'bg-amber-100 text-amber-900 border-amber-300/80',
      headerGlow: 'from-amber-500/10 to-transparent',
    },
    { 
      id: 'documents', 
      label: '2. Document Vault', 
      tagline: 'Original certificate review & compliance',
      icon: '📁', 
      badgeBg: 'bg-blue-100 text-blue-900 border-blue-300/80',
      headerGlow: 'from-blue-500/10 to-transparent',
    },
    { 
      id: 'processing', 
      label: '3. In Processing', 
      tagline: 'Lodge at embassy / university portal',
      icon: '⚙️', 
      badgeBg: 'bg-indigo-100 text-indigo-900 border-indigo-300/80',
      headerGlow: 'from-indigo-500/10 to-transparent',
    },
    { 
      id: 'decision', 
      label: '4. Decision & Stamping', 
      tagline: 'Offer letters, endorsements & visas',
      icon: '📜', 
      badgeBg: 'bg-emerald-100 text-emerald-900 border-emerald-300/80',
      headerGlow: 'from-emerald-500/10 to-transparent',
    },
    { 
      id: 'transit', 
      label: '5. Ready & Travel', 
      tagline: 'Flight ticketing, briefing & arrival',
      icon: '✈️', 
      badgeBg: 'bg-amber-100 text-amber-950 border-brand-gold/60',
      headerGlow: 'from-brand-gold/15 to-transparent',
    },
  ];

  const getStageForApp = (type: string, app: any): string => {
    const status = (app.status || '').toLowerCase();
    if (['draft', 'new', 'inquiry', 'shortlisted', 'quote'].includes(status)) return 'intake';
    if (['docs_ready', 'docs_awaiting', 'documents_pending', 'held'].includes(status)) return 'documents';
    if (['submitted', 'under_review', 'in_process', 'processing', 'reserved'].includes(status)) return 'processing';
    if (['offer_letter', 'conditional_offer', 'unconditional_offer', 'deposit_paid', 'completed', 'approved'].includes(status)) return 'decision';
    if (['enrolled', 'dispatched', 'delivered', 'booked', 'confirmed', 'transit'].includes(status)) return 'transit';
    return 'processing';
  };

  const kanbanItems = [
    ...studyApps.map((a) => ({
      id: `study-${a.id}`,
      type: 'study' as const,
      badge: '🎓 Study Abroad',
      badgeClass: 'bg-indigo-500/10 text-indigo-700 border-indigo-200/80',
      title: a.university || a.program || 'University Application',
      subtitle: `${a.degree || 'Degree'} · ${a.intakeTerm || 'Upcoming Intake'}`,
      country: a.country || 'Global',
      status: a.status || 'In Progress',
      stage: getStageForApp('study', a),
    })),
    ...visaApps.map((a) => ({
      id: `visa-${a.id}`,
      type: 'visa' as const,
      badge: '✈️ Visa Processing',
      badgeClass: 'bg-sky-500/10 text-sky-700 border-sky-200/80',
      title: `${a.country || 'Global'} ${a.visaType || 'Visa'}`,
      subtitle: `Entry: ${a.entryType || 'Standard'}`,
      country: a.country || 'International',
      status: a.status || 'Under Review',
      stage: getStageForApp('visa', a),
    })),
    ...umrahBookings.map((b) => ({
      id: `umrah-${b.id}`,
      type: 'umrah' as const,
      badge: '🕋 Umrah Pilgrimage',
      badgeClass: 'bg-amber-500/10 text-amber-800 border-amber-200/80',
      title: b.packageName || 'Premium Umrah Package',
      subtitle: `Party of ${b.paxCount || 1} · Departure: ${b.departureDate || 'Scheduled'}`,
      country: 'Saudi Arabia 🇸🇦',
      status: b.status || 'Confirmed',
      stage: getStageForApp('umrah', b),
    })),
    ...attestationApps.map((a) => ({
      id: `attest-${a.id}`,
      type: 'attestation' as const,
      badge: '📑 Attestation Desk',
      badgeClass: 'bg-emerald-500/10 text-emerald-700 border-emerald-200/80',
      title: `${a.targetCountry || 'Embassy'} Attestation`,
      subtitle: `Doc: ${a.docCategory || 'Commercial / Educational'}`,
      country: a.targetCountry || 'Embassy',
      status: a.stage || 'In Verification',
      stage: getStageForApp('attestation', a),
    })),
    ...jobApps.map((j) => ({
      id: `job-${j.id}`,
      type: 'jobs' as const,
      badge: '💼 Global Career',
      badgeClass: 'bg-slate-500/10 text-slate-800 border-slate-300/80',
      title: j.jobTitle || 'International Job Application',
      subtitle: `Country: ${j.country || 'Gulf / Europe'}`,
      country: j.country || 'Global',
      status: j.status || 'Applied',
      stage: getStageForApp('jobs', j),
    })),
  ];

  const filteredItems = activeFilter === 'all' ? kanbanItems : kanbanItems.filter((i) => i.type === activeFilter);

  return (
    <div className="space-y-8 animate-fadeIn">
      {/* 1. LUXURY HERO EXECUTIVE BANNER */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-brand-navy via-[#0C2340] to-[#08182B] p-7 md:p-9 text-white shadow-xl border border-brand-gold/20">
        <div className="absolute top-0 right-0 w-96 h-96 bg-brand-gold/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20"></div>
        <div className="absolute bottom-0 left-1/3 w-64 h-64 bg-blue-500/10 rounded-full blur-2xl pointer-events-none"></div>

        <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-6">
          <div className="space-y-2.5 max-w-2xl">
            <div className="flex flex-wrap items-center gap-2">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-gold/20 border border-brand-gold/40 px-3 py-0.5 text-[10px] font-black uppercase tracking-[0.2em] text-brand-gold shadow-xs">
                ✨ Verified Client Operating System
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-500/20 border border-emerald-400/30 px-2.5 py-0.5 text-[10px] font-bold text-emerald-300">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
                Live Real-Time Sync Active
              </span>
            </div>

            <h1 className="font-display font-black text-2xl md:text-3xl text-white tracking-tight leading-tight">
              Welcome back, <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-gold via-amber-300 to-amber-100">{clientName || clientEmail}</span>
            </h1>

            <p className="text-xs md:text-sm text-slate-300 leading-relaxed font-normal">
              Your global journey hub is synchronized directly with Opus Overseas counselors across admissions, visa processing, document vaults, and pilgrimage desks.
            </p>
          </div>

          {/* Quick Action Station */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3 w-full lg:w-auto">
            <div className="bg-white/10 backdrop-blur-md border border-white/15 px-4 py-3 rounded-2xl flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-brand-gold/20 border border-brand-gold/40 flex items-center justify-center text-brand-gold font-black text-base shadow-inner">
                👤
              </div>
              <div>
                <div className="text-xs font-bold text-white truncate max-w-[150px]">{clientEmail}</div>
                <div className="text-[10px] text-brand-gold font-mono font-bold tracking-wider">#{accountId?.slice(0, 10) || 'CLIENT'}</div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => onNavigateTab('study')}
              className="bg-gradient-to-r from-brand-gold to-amber-500 hover:from-amber-400 hover:to-brand-gold text-brand-navy font-black text-xs px-5 py-3.5 rounded-2xl transition shadow-lg uppercase tracking-wider cursor-pointer whitespace-nowrap active:scale-95"
            >
              + Apply New Service
            </button>
          </div>
        </div>
      </section>

      {/* 2. TOP METRICS TELEMETRY STRIP */}
      <section className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Metric 1 */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs hover:shadow-md transition group flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Enrolled Services</span>
            <span className="w-10 h-10 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-brand-navy flex items-center justify-center text-lg shadow-inner group-hover:scale-110 transition-transform">
              🚀
            </span>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black text-brand-navy font-display tracking-tight">{totalEnrolled}</div>
            <div className="text-xs text-slate-500 mt-1 flex items-center gap-1">
              <span className="font-semibold text-brand-gold">Active</span> applications & files
            </div>
          </div>
        </div>

        {/* Metric 2 */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs hover:shadow-md transition group flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Document Vault</span>
            <span className="w-10 h-10 rounded-2xl bg-blue-500/10 border border-blue-500/20 text-blue-600 flex items-center justify-center text-lg shadow-inner group-hover:scale-110 transition-transform">
              📁
            </span>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black text-brand-navy font-display tracking-tight">{verifiedDocsCount}</div>
            <div className="text-xs text-slate-500 mt-1 flex items-center gap-1">
              <span className="font-semibold text-emerald-600">Verified</span> certificates on file
            </div>
          </div>
        </div>

        {/* Metric 3 */}
        <div className="bg-white rounded-3xl p-6 border border-slate-200/80 shadow-xs hover:shadow-md transition group flex flex-col justify-between">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Payments & Receipts</span>
            <span className="w-10 h-10 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-600 flex items-center justify-center text-lg shadow-inner group-hover:scale-110 transition-transform">
              💳
            </span>
          </div>
          <div className="mt-4">
            <div className="text-3xl font-black text-brand-navy font-display tracking-tight">₹{(totalPaidPaise / 100).toLocaleString('en-IN')}</div>
            <div className="text-xs text-slate-500 mt-1 flex items-center gap-1">
              <span className="font-semibold text-emerald-600">{totalPayments.length}</span> settled invoices
            </div>
          </div>
        </div>

        {/* Metric 4: Dedicated Counselor Desk */}
        <div className="bg-gradient-to-br from-brand-navy to-[#0F223D] text-white rounded-3xl p-6 border border-brand-gold/30 shadow-md flex flex-col justify-between relative overflow-hidden">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-extrabold uppercase tracking-wider text-brand-gold">Assigned Counselor</span>
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-ping"></span>
          </div>
          <div className="mt-3">
            <div className="font-display font-bold text-sm text-white">
              {assignedCounselor?.name || 'Central Opus Advisory Desk'}
            </div>
            <div className="text-[11px] text-white/70">
              {assignedCounselor?.role || 'Senior Counselor'} · Hyderabad HQ
            </div>
          </div>
          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                if (typeof window !== 'undefined' && (window as any).$chatwoot) {
                  (window as any).$chatwoot.toggle();
                }
              }}
              className="flex-1 text-center bg-emerald-500 hover:bg-emerald-600 text-white py-2 rounded-xl text-[11px] font-extrabold uppercase tracking-wider transition shadow-sm cursor-pointer"
            >
              Live Chat Desk
            </button>
            <a
              href="tel:+919876543210"
              className="px-3 py-2 bg-white/10 hover:bg-white/20 text-white rounded-xl text-xs transition"
              title="Call Counselor Desk"
            >
              📞
            </a>
          </div>
        </div>
      </section>

      {/* 3. LIVE KANBAN PIPELINE BOARD */}
      <section className="bg-white rounded-3xl p-6 md:p-8 border border-slate-200/80 shadow-sm space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <h2 className="font-display font-black text-xl text-brand-navy tracking-tight">
                Live Enrolled Services Pipeline
              </h2>
              <span className="text-[10px] bg-emerald-50 border border-emerald-300 text-emerald-800 px-2.5 py-0.5 rounded-full font-extrabold shadow-xs">
                Auto-Synced with Staff CRM
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Live status tracking across university admissions, embassy visa files, attestation chains, and pilgrimage slots.
            </p>
          </div>

          {/* Division Filter Pills */}
          <div className="flex flex-wrap items-center gap-1.5 bg-slate-100/80 p-1.5 rounded-2xl border border-slate-200">
            {[
              { id: 'all', label: 'All Files' },
              { id: 'study', label: '🎓 Study' },
              { id: 'visa', label: '✈️ Visa' },
              { id: 'umrah', label: '🕋 Umrah' },
              { id: 'attestation', label: '📑 Attest' },
              { id: 'jobs', label: '💼 Jobs' },
            ].map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setActiveFilter(f.id as any)}
                className={`px-3 py-1 rounded-xl text-[11px] font-bold transition cursor-pointer ${
                  activeFilter === f.id
                    ? 'bg-brand-navy text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* 5-Column Kanban Board Grid */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {kanbanColumns.map((col) => {
            const itemsInCol = filteredItems.filter((item) => item.stage === col.id);
            return (
              <div
                key={col.id}
                className="bg-slate-50/90 rounded-2xl p-4 border border-slate-200/80 flex flex-col gap-3 min-h-[360px]"
              >
                {/* Column Header */}
                <div className="flex items-center justify-between pb-3 border-b border-slate-200/80">
                  <div className="flex items-center gap-2">
                    <span className="text-base">{col.icon}</span>
                    <div>
                      <div className="text-xs font-black text-brand-navy leading-none">{col.label}</div>
                    </div>
                  </div>
                  <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${col.badgeBg}`}>
                    {itemsInCol.length}
                  </span>
                </div>

                {/* Column Items */}
                <div className="flex flex-col gap-3 flex-1">
                  {itemsInCol.length === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center text-center p-4 border-2 border-dashed border-slate-200/60 rounded-xl">
                      <span className="text-slate-300 text-xs font-semibold">No active files</span>
                    </div>
                  ) : (
                    itemsInCol.map((item) => (
                      <div
                        key={item.id}
                        onClick={() => onNavigateTab(item.type)}
                        className="bg-white hover:bg-slate-50/90 rounded-2xl p-4 border border-slate-200/90 hover:border-brand-gold shadow-xs hover:shadow-md transition-all duration-200 cursor-pointer space-y-2.5 group"
                      >
                        <div className="flex items-center justify-between">
                          <span className={`text-[9px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md border ${item.badgeClass}`}>
                            {item.badge}
                          </span>
                          <span className="text-[10px] font-bold text-slate-400 group-hover:text-brand-gold transition-colors">
                            Open →
                          </span>
                        </div>

                        <div>
                          <h4 className="text-xs font-bold text-brand-navy leading-snug group-hover:text-brand-gold transition-colors">
                            {item.title}
                          </h4>
                          <p className="text-[11px] text-slate-500 mt-0.5">{item.subtitle}</p>
                        </div>

                        <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[10px]">
                          <span className="text-slate-400">Country: <strong className="text-slate-700">{item.country}</strong></span>
                          <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded font-bold capitalize">
                            {item.status.replace(/_/g, ' ')}
                          </span>
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

      {/* 4. DIVISIONS EXPLORER & INVENTORY PORTAL */}
      <section className="bg-white rounded-3xl p-6 md:p-8 border border-slate-200/80 shadow-sm space-y-6">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <h3 className="font-display font-black text-lg text-brand-navy tracking-tight">
              Global Divisions & Instant Application Desk
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">Explore active catalogue inventories and initiate self-service applications.</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Division 1: Study Abroad */}
          <div
            onClick={() => onNavigateTab('study')}
            className="p-5 rounded-2xl border border-slate-200/80 hover:border-brand-gold bg-gradient-to-br from-white to-slate-50 hover:shadow-md transition cursor-pointer flex flex-col justify-between space-y-4 group"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-700 flex items-center justify-center text-xl group-hover:scale-110 transition-transform">
                  🎓
                </span>
                <span className="text-[10px] font-black uppercase tracking-wider text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded-full">
                  12 Partner Universities
                </span>
              </div>
              <h4 className="font-display font-black text-sm text-brand-navy">Study Abroad Admissions</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Full-service applications for UK, USA, Canada, Australia & Europe with live IELTS/GRE match score calculations.
              </p>
            </div>
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-brand-navy group-hover:text-brand-gold">
              <span>Launch Intake Wizard</span>
              <span>→</span>
            </div>
          </div>

          {/* Division 2: Visa Services */}
          <div
            onClick={() => onNavigateTab('visa')}
            className="p-5 rounded-2xl border border-slate-200/80 hover:border-brand-gold bg-gradient-to-br from-white to-slate-50 hover:shadow-md transition cursor-pointer flex flex-col justify-between space-y-4 group"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="w-10 h-10 rounded-xl bg-sky-50 text-sky-700 flex items-center justify-center text-xl group-hover:scale-110 transition-transform">
                  ✈️
                </span>
                <span className="text-[10px] font-black uppercase tracking-wider text-sky-700 bg-sky-50 border border-sky-200 px-2 py-0.5 rounded-full">
                  56 Live Products
                </span>
              </div>
              <h4 className="font-display font-black text-sm text-brand-navy">Visa Processing Desk</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Tourist, Business, and Student visas for Dubai, Thailand, Malaysia, Singapore, Vietnam, UK, US, and Schengen.
              </p>
            </div>
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-brand-navy group-hover:text-brand-gold">
              <span>Explore Visa Catalogue</span>
              <span>→</span>
            </div>
          </div>

          {/* Division 3: Umrah Pilgrimage */}
          <div
            onClick={() => onNavigateTab('umrah')}
            className="p-5 rounded-2xl border border-slate-200/80 hover:border-brand-gold bg-gradient-to-br from-white to-slate-50 hover:shadow-md transition cursor-pointer flex flex-col justify-between space-y-4 group"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="w-10 h-10 rounded-xl bg-amber-50 text-amber-800 flex items-center justify-center text-xl group-hover:scale-110 transition-transform">
                  🕋
                </span>
                <span className="text-[10px] font-black uppercase tracking-wider text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                  Fixed Group Calendar
                </span>
              </div>
              <h4 className="font-display font-black text-sm text-brand-navy">Umrah Pilgrimage Desk</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                5-Star luxury packages in Makkah & Madinah, family pricing, direct flights, and guaranteed departure dates.
              </p>
            </div>
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-brand-navy group-hover:text-brand-gold">
              <span>View Packages & Departures</span>
              <span>→</span>
            </div>
          </div>

          {/* Division 4: Attestation Desk */}
          <div
            onClick={() => onNavigateTab('attestation')}
            className="p-5 rounded-2xl border border-slate-200/80 hover:border-brand-gold bg-gradient-to-br from-white to-slate-50 hover:shadow-md transition cursor-pointer flex flex-col justify-between space-y-4 group"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-700 flex items-center justify-center text-xl group-hover:scale-110 transition-transform">
                  📑
                </span>
                <span className="text-[10px] font-black uppercase tracking-wider text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                  MEA & Apostille
                </span>
              </div>
              <h4 className="font-display font-black text-sm text-brand-navy">Document Attestation Desk</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                HRD, SDM, MEA, Apostille, and Embassy authentication chains with doorstep document pickup and tracking.
              </p>
            </div>
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-brand-navy group-hover:text-brand-gold">
              <span>Check Rate Cards</span>
              <span>→</span>
            </div>
          </div>

          {/* Division 5: Global Careers */}
          <div
            onClick={() => onNavigateTab('jobs')}
            className="p-5 rounded-2xl border border-slate-200/80 hover:border-brand-gold bg-gradient-to-br from-white to-slate-50 hover:shadow-md transition cursor-pointer flex flex-col justify-between space-y-4 group"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="w-10 h-10 rounded-xl bg-slate-100 text-slate-800 flex items-center justify-center text-xl group-hover:scale-110 transition-transform">
                  💼
                </span>
                <span className="text-[10px] font-black uppercase tracking-wider text-slate-700 bg-slate-100 border border-slate-300 px-2 py-0.5 rounded-full">
                  8 Open Vacancies
                </span>
              </div>
              <h4 className="font-display font-black text-sm text-brand-navy">International Job Placement</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Verified overseas job openings in Gulf and European markets with direct employer interviews and work permits.
              </p>
            </div>
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-brand-navy group-hover:text-brand-gold">
              <span>Browse Vacancies</span>
              <span>→</span>
            </div>
          </div>

          {/* Division 6: Document Vault */}
          <div
            onClick={() => onNavigateTab('vault')}
            className="p-5 rounded-2xl border border-slate-200/80 hover:border-brand-gold bg-gradient-to-br from-white to-slate-50 hover:shadow-md transition cursor-pointer flex flex-col justify-between space-y-4 group"
          >
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="w-10 h-10 rounded-xl bg-amber-50 text-amber-700 flex items-center justify-center text-xl group-hover:scale-110 transition-transform">
                  🔒
                </span>
                <span className="text-[10px] font-black uppercase tracking-wider text-amber-700 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-full">
                  DPDP Encrypted
                </span>
              </div>
              <h4 className="font-display font-black text-sm text-brand-navy">Secure Document Vault</h4>
              <p className="text-xs text-slate-500 leading-relaxed">
                Encrypted storage for passports, transcripts, and financial records with tamper-evident audit logging.
              </p>
            </div>
            <div className="pt-3 border-t border-slate-100 flex items-center justify-between text-xs font-bold text-brand-navy group-hover:text-brand-gold">
              <span>Open Document Vault</span>
              <span>→</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
