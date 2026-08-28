import React, { useEffect, useState } from 'react';
const API = (import.meta as any).env?.VITE_API_URL || 'https://opusos-api.ajmalsn63.workers.dev';

interface ClientContext {
  found: boolean;
  client?: {
    id: string;
    name: string;
    email: string;
    phone: string;
    primaryDivision: string;
    status: string;
    portalToken?: string;
  };
  portalUrl?: string;
  engagements?: Array<{ id: string; division: string; title: string; stageKey: string; status: string }>;
  tasks?: Array<{ id: string; title: string; status: string; priority: string }>;
  studyAbroadApplications?: Array<{ id: string; universityName: string; programName: string; targetCountry: string; targetIntake: string; status: string }>;
  attestationApplications?: Array<{ id: string; documentType: string; targetCountry: string; stage: string }>;
  bookings?: Array<{ id: string; title: string; startTime: number; status: string }>;
  bookingLinks?: Record<string, string>;
  message?: string;
}

export default function ChatwootDashboardWidget() {
  const [contactEmail, setContactEmail] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactName, setContactName] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ClientContext | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  // New Lead Quick Create Form
  const [quickName, setQuickName] = useState('');
  const [quickDivision, setQuickDivision] = useState('study-abroad');
  const [creatingLead, setCreatingLead] = useState(false);

  // 1. Listen to Chatwoot postMessage Events & URL Params
  useEffect(() => {
    // Check URL parameters first
    const params = new URLSearchParams(window.location.search);
    const emailParam = params.get('email') || params.get('contact_email') || '';
    const phoneParam = params.get('phone') || params.get('contact_phone') || '';
    const nameParam = params.get('name') || params.get('contact_name') || '';

    if (emailParam || phoneParam) {
      setContactEmail(emailParam);
      setContactPhone(phoneParam);
      setContactName(nameParam);
      fetchContext(emailParam, phoneParam);
    }

    // Listen to Chatwoot Dashboard App PostMessage
    const handleMessage = (event: MessageEvent) => {
      try {
        const payload = typeof event.data === 'string' ? JSON.parse(event.data) : event.data;
        if (payload?.event === 'appContext' || payload?.data?.contact) {
          const contact = payload?.data?.contact || payload?.contact;
          const email = contact?.email || '';
          const phone = contact?.phone_number || contact?.phone || '';
          const name = contact?.name || '';

          setContactEmail(email);
          setContactPhone(phone);
          setContactName(name);
          setQuickName(name);
          fetchContext(email, phone);
        }
      } catch {
        /* Ignore non-JSON postMessage */
      }
    };

    window.addEventListener('message', handleMessage);
    // Notify parent Chatwoot window that widget is ready
    window.parent?.postMessage('chatwoot:ready', '*');

    return () => window.removeEventListener('message', handleMessage);
  }, []);

  const fetchContext = async (email: string, phone: string) => {
    if (!email && !phone) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/public/chatwoot/context?email=${encodeURIComponent(email)}&phone=${encodeURIComponent(phone)}`,
      );
      const json = await res.json();
      setData(json);
    } catch {
      setData({ found: false, message: 'Could not connect to Opus OS CRM.' });
    } finally {
      setLoading(false);
    }
  };

  const copyToClipboard = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedKey(key);
    setTimeout(() => setCopiedKey(null), 2000);
  };

  const handleQuickLead = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreatingLead(true);
    try {
      const res = await fetch(`${API}/api/public/chatwoot/quick-lead`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: quickName || contactName || 'Chatwoot Lead',
          email: contactEmail,
          phone: contactPhone,
          division: quickDivision,
        }),
      });
      const json = await res.json();
      if (json.success) {
        fetchContext(contactEmail, contactPhone);
      }
    } catch {
      /* Handle error */
    } finally {
      setCreatingLead(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070e1c] text-white p-3 sm:p-4 font-sans antialiased selection:bg-brand-gold selection:text-brand-navy">
      {/* Top Header */}
      <div className="flex items-center justify-between border-b border-white/10 pb-3 mb-3">
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-lg bg-brand-gold flex items-center justify-center font-extrabold text-[#070e1c] text-xs">
            O
          </div>
          <div>
            <h1 className="text-xs font-extrabold tracking-wider text-white uppercase">Opus OS CRM Desk</h1>
            <p className="text-[13px] text-white/50">Live Counselor Sidebar</p>
          </div>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
          <span className="text-[13px] font-bold text-emerald-400 uppercase">Live</span>
        </div>
      </div>

      {loading && (
        <div className="py-12 text-center text-xs text-white/60">
          <div className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-brand-gold border-t-transparent mb-2" />
          <p>Syncing CRM profile...</p>
        </div>
      )}

      {!loading && data?.found && data.client && (
        <div className="space-y-3.5">
          {/* CLIENT IDENTITY CARD */}
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] p-3.5 backdrop-blur-md">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-xs font-extrabold uppercase tracking-widest text-brand-gold">
                  {data.client.id}
                </span>
                <h2 className="text-sm font-extrabold text-white mt-0.5">{data.client.name}</h2>
                <p className="text-sm text-white/60 truncate">{data.client.email}</p>
                {data.client.phone && (
                  <p className="text-sm text-emerald-400 font-semibold mt-0.5">
                    📱 {data.client.phone}
                  </p>
                )}
              </div>
              <span className="rounded-full bg-emerald-500/20 px-2 py-0.5 text-xs font-bold uppercase text-emerald-300 border border-emerald-500/30">
                {data.client.status}
              </span>
            </div>

            {/* QUICK ACTIONS */}
            <div className="mt-3 grid grid-cols-2 gap-2 pt-2.5 border-t border-white/10">
              {data.portalUrl && (
                <button
                  onClick={() => copyToClipboard(data.portalUrl!, 'portal')}
                  className="inline-flex items-center justify-center gap-1 rounded-xl border border-brand-gold/30 bg-brand-gold/10 px-2 py-1.5 text-[13px] font-bold text-brand-gold hover:bg-brand-gold hover:text-brand-navy transition cursor-pointer"
                >
                  {copiedKey === 'portal' ? '✅ Copied!' : '🔗 Copy Portal Link'}
                </button>
              )}

              {data.bookingLinks && (
                <button
                  onClick={() =>
                    copyToClipboard(
                      data.bookingLinks![data.client!.primaryDivision] || data.bookingLinks!['study-abroad'],
                      'booking',
                    )
                  }
                  className="inline-flex items-center justify-center gap-1 rounded-xl border border-blue-400/30 bg-blue-500/10 px-2 py-1.5 text-[13px] font-bold text-blue-300 hover:bg-blue-500 hover:text-white transition cursor-pointer"
                >
                  {copiedKey === 'booking' ? '✅ Copied!' : '📅 Copy 1-on-1 Link'}
                </button>
              )}
            </div>
          </div>

          {/* ACTIVE ENGAGEMENTS & STAGES */}
          {data.engagements && data.engagements.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
              <p className="text-[13px] font-extrabold uppercase tracking-wider text-white/50 mb-2">
                Active Services & Stages
              </p>
              <div className="space-y-2">
                {data.engagements.map((eng) => (
                  <div key={eng.id} className="flex items-center justify-between rounded-xl bg-white/5 p-2 text-xs">
                    <div>
                      <span className="font-bold text-white block text-sm">{eng.title}</span>
                      <span className="text-xs uppercase tracking-wider text-white/40">{eng.division}</span>
                    </div>
                    <span className="rounded-md bg-brand-gold/20 px-2 py-0.5 text-[13px] font-bold text-brand-gold uppercase">
                      {eng.stageKey}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* STUDY ABROAD APPLICATIONS SNAPSHOT */}
          {data.studyAbroadApplications && data.studyAbroadApplications.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
              <p className="text-[13px] font-extrabold uppercase tracking-wider text-white/50 mb-2">
                🎓 University Applications ({data.studyAbroadApplications.length})
              </p>
              <div className="space-y-1.5">
                {data.studyAbroadApplications.map((app) => (
                  <div key={app.id} className="rounded-xl bg-white/5 p-2 text-sm">
                    <p className="font-bold text-white">{app.universityName}</p>
                    <p className="text-[13px] text-white/60">
                      {app.programName} · {app.targetCountry} ({app.targetIntake})
                    </p>
                    <span className="mt-1 inline-block text-xs font-bold uppercase text-brand-gold">
                      Status: {app.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* SCHEDULED SESSIONS */}
          {data.bookings && data.bookings.length > 0 && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-3">
              <p className="text-[13px] font-extrabold uppercase tracking-wider text-white/50 mb-2">
                📅 Scheduled Consultations
              </p>
              <div className="space-y-1.5">
                {data.bookings.map((b) => (
                  <div key={b.id} className="rounded-xl bg-white/5 p-2 text-sm flex justify-between items-center">
                    <div>
                      <p className="font-bold text-white">{b.title}</p>
                      <p className="text-[13px] text-white/60">
                        {new Date(b.startTime * 1000).toLocaleString('en-IN', {
                          month: 'short',
                          day: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </p>
                    </div>
                    <span className="text-xs font-bold uppercase text-emerald-400">{b.status}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* UNKNOWN CONTACT / QUICK CREATE LEAD */}
      {!loading && !data?.found && (
        <div className="space-y-3">
          <div className="rounded-2xl border border-amber-500/20 bg-amber-500/10 p-3 text-amber-200">
            <p className="text-xs font-bold">Unregistered Contact</p>
            <p className="text-[13px] text-amber-300/80 mt-0.5">
              This visitor is not yet enrolled in Opus OS CRM.
            </p>
          </div>

          <form onSubmit={handleQuickLead} className="rounded-2xl border border-white/10 bg-white/[0.03] p-3.5 space-y-3">
            <p className="text-[13px] font-extrabold uppercase tracking-wider text-white/60">
              ⚡ 1-Click Quick Lead Enrollment
            </p>
            <div>
              <label className="block text-xs font-bold uppercase text-white/50 mb-1">Full Name</label>
              <input
                value={quickName || contactName}
                onChange={(e) => setQuickName(e.target.value)}
                placeholder="Applicant name..."
                required
                className="w-full rounded-xl border border-white/15 bg-white/5 px-2.5 py-1.5 text-xs text-white placeholder-white/30 focus:border-brand-gold focus:outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-bold uppercase text-white/50 mb-1">Primary Division</label>
              <select
                value={quickDivision}
                onChange={(e) => setQuickDivision(e.target.value)}
                className="w-full rounded-xl border border-white/15 bg-[#0a182d] px-2.5 py-1.5 text-xs font-semibold text-white focus:border-brand-gold focus:outline-none"
              >
                <option value="study-abroad">Study Abroad & Admissions</option>
                <option value="visa">Visa & Immigration</option>
                <option value="umrah">Umrah & Pilgrimage</option>
                <option value="attestation">Certificate Attestation</option>
                <option value="manpower">Overseas Recruitment</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={creatingLead}
              className="w-full rounded-xl bg-brand-gold py-2 text-xs font-extrabold uppercase tracking-wider text-brand-navy hover:bg-brand-gold-hover hover:text-white transition disabled:opacity-50 cursor-pointer"
            >
              {creatingLead ? 'Creating Lead...' : '➕ Enroll in Opus OS'}
            </button>
          </form>

          {/* Direct 1-on-1 Consultation Invite Share */}
          {data?.bookingLinks && (
            <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-3 space-y-2">
              <p className="text-[13px] font-extrabold uppercase tracking-wider text-white/50">
                Share 1-on-1 Consultation Link
              </p>
              <div className="grid grid-cols-1 gap-1.5">
                {Object.entries(data.bookingLinks).map(([div, link]) => (
                  <button
                    key={div}
                    onClick={() => copyToClipboard(link, div)}
                    className="w-full text-left flex items-center justify-between rounded-xl bg-white/5 px-2.5 py-2 text-[13px] font-bold text-white/80 hover:bg-white/10 hover:text-white transition cursor-pointer"
                  >
                    <span>📅 {div.replace('-', ' ').toUpperCase()}</span>
                    <span className="text-brand-gold text-xs">
                      {copiedKey === div ? '✅ Copied' : 'Copy Link ↗'}
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
