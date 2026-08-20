import { useEffect, useMemo, useState } from 'react';
import TurnstileWidget from './TurnstileWidget';

/**
 * BookingModal — Enterprise 3-Tier Protected Consultation Booking Funnel.
 *
 * Tier 1 Defense-in-Depth:
 *  1. Cloudflare Turnstile bot verification (mandatory before submit).
 *  2. Invisible Honeypot field (silently traps automated scrapers).
 *  3. Division Intent Qualification (Study Abroad / Visa / Manpower with 'Other' write-in).
 *  4. Standardized Country Code & Phone verification.
 *  5. Zero Raw Link Leaks: If slots are syncing or unreachable, seamless in-modal
 *     Priority Callback form captures the lead via POST /api/public/leads (no raw cal.com URL exposed).
 */

const DIVISION_LABELS: Record<string, string> = {
  'study-abroad': 'Study Abroad Consultation',
  visa: 'Visa & Immigration Advisory',
  manpower: 'Manpower & Recruitment Screening',
};

const COUNTRY_CODES = [
  { code: '+91', country: 'IN', label: 'India (+91)' },
  { code: '+971', country: 'AE', label: 'UAE (+971)' },
  { code: '+966', country: 'SA', label: 'Saudi Arabia (+966)' },
  { code: '+44', country: 'GB', label: 'UK (+44)' },
  { code: '+1', country: 'US', label: 'USA / Canada (+1)' },
  { code: '+61', country: 'AU', label: 'Australia (+61)' },
  { code: '+65', country: 'SG', label: 'Singapore (+65)' },
  { code: '+60', country: 'MY', label: 'Malaysia (+60)' },
  { code: '+974', country: 'QA', label: 'Qatar (+974)' },
  { code: '+968', country: 'OM', label: 'Oman (+968)' },
  { code: '+965', country: 'KW', label: 'Kuwait (+965)' },
  { code: '+973', country: 'BH', label: 'Bahrain (+973)' },
  { code: '+49', country: 'DE', label: 'Germany (+49)' },
  { code: '+33', country: 'FR', label: 'France (+33)' },
  { code: '+353', country: 'IE', label: 'Ireland (+353)' },
];

const STUDY_ABROAD_DESTINATIONS = [
  'United Kingdom (UK)',
  'United States (USA)',
  'Canada',
  'Australia',
  'Germany & Europe',
  'Ireland',
  'New Zealand',
  'Other Destination',
];

const STUDY_ABROAD_INTAKES = [
  'Fall 2026 (Aug/Sep)',
  'Spring 2027 (Jan/Feb)',
  'Fall 2027',
  'Other / Flexible',
];

const VISA_CATEGORIES = [
  'Student / Study Visa',
  'Tourist / Visitor Visa',
  'Work / Employment Visa',
  'Family / Dependent Visa',
  'Business / Investor Visa',
  'Other Visa Category',
];

const MANPOWER_TRADES = [
  'Hospitality & Culinary Arts',
  'Healthcare, Nursing & Medical',
  'IT, Software & Engineering',
  'Construction, MEP & Civil',
  'Logistics, Supply Chain & Driving',
  'Skilled Technical Trades',
  'Other Industry / Role',
];

interface SlotGroup { date: string; label: string; slots: string[] }

function groupSlots(slots: string[]): SlotGroup[] {
  const byDate = new Map<string, string[]>();
  for (const iso of slots) {
    const d = new Date(iso);
    const key = d.toISOString().slice(0, 10);
    const arr = byDate.get(key) || [];
    arr.push(iso);
    byDate.set(key, arr);
  }
  return [...byDate.entries()]
    .sort((a, b) => a[0].localeCompare(b[0]))
    .map(([date, list]) => ({
      date,
      label: new Date(`${date}T12:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }),
      slots: list.sort(),
    }));
}

function fmtSlot(iso: string): string {
  return new Date(iso).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true });
}

export default function BookingModal({
  open,
  onClose,
  division,
}: {
  open: boolean;
  onClose: () => void;
  division: string;
  fallbackUrl?: string;
}) {
  const [slots, setSlots] = useState<string[] | null>(null); // null = loading
  const [useCallbackFallback, setUseCallbackFallback] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<string>('');

  // Core Identity Fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [countryCode, setCountryCode] = useState('+91');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState(''); // Honeypot trap

  // Qualification Fields (Tier 1 intent friction)
  const [destination, setDestination] = useState(STUDY_ABROAD_DESTINATIONS[0]);
  const [intake, setIntake] = useState(STUDY_ABROAD_INTAKES[0]);
  const [visaCategory, setVisaCategory] = useState(VISA_CATEGORIES[0]);
  const [trade, setTrade] = useState(MANPOWER_TRADES[0]);
  const [customDetail, setCustomDetail] = useState(''); // For "Other" write-ins

  // Priority Callback Specific Fields
  const [preferredWindow, setPreferredWindow] = useState('Morning (11:00 AM – 01:00 PM)');
  const [notes, setNotes] = useState('');

  // Status & Bot Verification
  const [token, setToken] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState<null | { start?: string; type: 'slot' | 'callback' }>(null);
  const [error, setError] = useState('');

  const timeZone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Kolkata';
    } catch {
      return 'Asia/Kolkata';
    }
  }, []);

  const activeDivision = division || 'study-abroad';

  useEffect(() => {
    if (!open) return;
    setSlots(null);
    setUseCallbackFallback(false);
    setSelectedSlot('');
    setDone(null);
    setError('');
    setCustomDetail('');

    const start = new Date();
    const end = new Date(Date.now() + 14 * 86400 * 1000);
    fetch(
      `/api/cal/public/slots?division=${encodeURIComponent(activeDivision)}&start=${start.toISOString()}&end=${end.toISOString()}&timeZone=${encodeURIComponent(timeZone)}`,
    )
      .then((r) => r.json().catch(() => ({})))
      .then((d: any) => {
        if (d?.success && Array.isArray(d.slots) && d.slots.length > 0) {
          setSlots(d.slots);
        } else {
          // Graceful degradation: Seamless Priority Callback (Never expose raw URLs)
          setUseCallbackFallback(true);
        }
      })
      .catch(() => setUseCallbackFallback(true));
  }, [open, activeDivision, timeZone]);

  if (!open) return null;

  const isOtherSelected =
    (activeDivision === 'study-abroad' && destination.includes('Other')) ||
    (activeDivision === 'visa' && visaCategory.includes('Other')) ||
    (activeDivision === 'manpower' && trade.includes('Other'));

  const fullPhone = phone.trim() ? `${countryCode} ${phone.trim()}` : '';

  const DISPOSABLE_DOMAINS = [
    'mailinator.com', '10minutemail.com', 'tempmail.com', 'guerrillamail.com', 'throwawaymail.com',
    'yopmail.com', 'sharklasers.com', 'dispostable.com', 'trashmail.com', 'fakeinbox.com', 'getairmail.com',
    'generator.email', 'temp-mail.org', 'tempail.com', 'mohmal.com', 'disposablemail.com'
  ];

  const validateInputQuality = () => {
    if (name.trim().length < 3 || !/^[a-zA-Z\s.'-]+$/.test(name.trim())) {
      setError('Please provide your authentic full name (at least 3 alphabetic characters).');
      return false;
    }
    const cleanPhone = phone.replace(/\D/g, '');
    if (cleanPhone.length < 8 || cleanPhone.length > 15) {
      setError('Please enter a valid active WhatsApp number (8 to 15 digits).');
      return false;
    }
    if (/^(\d)\1+$/.test(cleanPhone) || ['1234567890', '0123456789', '9876543210', '0000000000', '1111111111'].includes(cleanPhone)) {
      setError('Please provide a genuine, active WhatsApp mobile number.');
      return false;
    }
    if (email.trim()) {
      const emailDomain = email.trim().toLowerCase().split('@')[1];
      if (emailDomain && DISPOSABLE_DOMAINS.includes(emailDomain)) {
        setError('Temporary/disposable email addresses are blocked. Please provide your real active email.');
        return false;
      }
    }
    if (!token && !window.location.hostname.includes('localhost') && !window.location.hostname.includes('127.0.0.1')) {
      setError('Please complete the Cloudflare Turnstile security verification.');
      return false;
    }
    return true;
  };

  const handleBookingSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSlot) {
      setError('Please select an available time slot.');
      return;
    }
    if (!email.trim()) {
      setError('Email address is required for calendar invite confirmation.');
      return;
    }
    if (!validateInputQuality()) return;

    setSubmitting(true);
    setError('');

    const qualificationPayload = {
      destination: activeDivision === 'study-abroad' ? destination : undefined,
      intake: activeDivision === 'study-abroad' ? intake : undefined,
      visaCategory: activeDivision === 'visa' ? visaCategory : undefined,
      trade: activeDivision === 'manpower' ? trade : undefined,
      customDetail: isOtherSelected ? customDetail.trim() : undefined,
    };

    try {
      const res = await fetch('/api/cal/public/book', { credentials: 'include', 
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'cf-turnstile-response': token } : {}),
        },
        body: JSON.stringify({
          division: activeDivision,
          start: selectedSlot,
          name: name.trim(),
          email: email.trim().toLowerCase(),
          phone: fullPhone,
          timeZone,
          website, // Honeypot
          ...qualificationPayload,
        }),
      });

      const d = await res.json().catch(() => ({}));
      if (res.ok && d?.success) {
        setDone({ start: d.booking?.start || selectedSlot, type: 'slot' });
        return;
      }

      if (d?.reason === 'suspicious') {
        setError('Verification could not be completed. Please use the priority callback option below.');
        setUseCallbackFallback(true);
      } else if (d?.reason === 'flood_limit') {
        setError('A consultation is already registered for this contact today. Our counselor will contact you shortly.');
      } else if (d?.reason === 'slot_taken') {
        setError('That specific slot was just booked by another user. Please select another time.');
        setSlots((s) => (s || []).filter((x) => x !== selectedSlot));
        setSelectedSlot('');
      } else {
        setError(d?.message || 'Booking encountered an error. You can request an immediate priority callback below.');
        setUseCallbackFallback(true);
      }
    } catch {
      setError('Network sync error. Please submit a priority callback request below.');
      setUseCallbackFallback(true);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCallbackSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateInputQuality()) return;

    setSubmitting(true);
    setError('');

    const qualificationSummary = [
      activeDivision === 'study-abroad' ? `Target: ${destination}, Intake: ${intake}` : null,
      activeDivision === 'visa' ? `Category: ${visaCategory}` : null,
      activeDivision === 'manpower' ? `Trade: ${trade}` : null,
      isOtherSelected && customDetail ? `Details: ${customDetail}` : null,
      `Preferred Window: ${preferredWindow}`,
      notes.trim() ? `Notes: ${notes.trim()}` : null,
    ]
      .filter(Boolean)
      .join(' | ');

    try {
      const res = await fetch('/api/public/leads', { credentials: 'include', 
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'cf-turnstile-response': token } : {}),
        },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase() || `${phone.replace(/\D/g, '')}@lead.opusoverseas.com`,
          phone: fullPhone,
          primaryDivision: activeDivision,
          leadSource: 'priority-callback-modal',
          intakeContext: qualificationSummary,
          serviceIntent: activeDivision,
          notes: qualificationSummary,
          dpdpConsent: true,
          marketingConsent: true,
          honeypot: website, // Honeypot trap
        }),
      });

      const d = await res.json().catch(() => ({}));
      if (res.ok && d?.success) {
        setDone({ type: 'callback' });
        return;
      }
      setError(d?.error || 'Callback request could not be sent. Please call our hotline.');
    } catch {
      setError('Connection error. Please reach out to us via direct WhatsApp.');
    } finally {
      setSubmitting(false);
    }
  };

  const groups = groupSlots(slots || []);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-brand-navy/70 p-4 backdrop-blur-sm" onClick={onClose}>
      <div
        className="max-h-[92vh] w-full max-w-xl overflow-y-auto rounded-3xl bg-white p-6 shadow-2xl transition-all sm:p-8"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-start justify-between border-b border-brand-navy/10 pb-4">
          <div>
            <div className="inline-flex items-center gap-1.5 rounded-full bg-brand-gold/15 px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-brand-navy">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-gold animate-pulse" />
              Verified 1-on-1 Session
            </div>
            <h3 className="mt-1.5 font-display text-xl font-extrabold text-brand-navy">
              {DIVISION_LABELS[activeDivision] || 'Consultation Booking'}
            </h3>
            <p className="text-xs font-semibold text-brand-navy/60">
              Senior Counselor · 30 min · Available 11:00 AM – 1:00 PM & 2:00 PM – 5:00 PM IST
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-full bg-brand-navy/5 p-2 text-brand-navy/50 transition hover:bg-brand-navy/10 hover:text-brand-navy"
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        {/* 1. SUCCESS / CONFIRMATION STATE */}
        {done ? (
          <div className="py-8 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-3xl">
              ✅
            </div>
            <h4 className="mt-4 font-display text-lg font-extrabold text-brand-navy">
              {done.type === 'slot' ? 'Consultation Slot Reserved!' : 'Priority Callback Requested!'}
            </h4>
            {done.type === 'slot' && done.start ? (
              <p className="mt-2 text-xs font-medium text-brand-navy/80">
                Scheduled for:{' '}
                <strong className="text-brand-navy">
                  {new Date(done.start).toLocaleString('en-IN', {
                    weekday: 'long',
                    day: 'numeric',
                    month: 'long',
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </strong>
                <br />
                <span className="text-[11px] text-brand-navy/60">
                  Our counselor will review your case notes and send the Google Meet / WhatsApp invite shortly.
                </span>
              </p>
            ) : (
              <p className="mt-2 text-xs font-medium text-brand-navy/80">
                Your consultation request has been assigned to our senior counseling desk.
                <br />
                <span className="text-[11px] text-brand-navy/60">
                  A counselor will call/WhatsApp you during your preferred window (<strong>{preferredWindow}</strong>).
                </span>
              </p>
            )}
            <div className="mt-6 rounded-2xl bg-brand-navy/[0.03] p-4 text-left border border-brand-navy/10">
              <p className="text-[11px] font-bold uppercase tracking-wider text-brand-navy/50">Next Steps:</p>
              <ul className="mt-1 space-y-1 text-xs text-brand-navy/70">
                <li>• Keep your academic / visa documents handy for review.</li>
                <li>• WhatsApp confirmation will arrive on <strong>{fullPhone || phone}</strong>.</li>
                <li>• Free session with zero obligation.</li>
              </ul>
            </div>
            <button
              onClick={onClose}
              className="tactile-btn mt-6 min-h-11 rounded-full bg-brand-gold px-8 py-3 text-xs font-bold uppercase tracking-wider text-brand-navy hover:bg-brand-gold-hover hover:text-white"
            >
              Done
            </button>
          </div>
        ) : useCallbackFallback ? (
          /* 2. PRIORITY CALLBACK FORM (Zero Raw Links Exposed) */
          <form onSubmit={handleCallbackSubmit} className="mt-5 space-y-4">
            <div className="rounded-xl border border-brand-gold/30 bg-brand-gold/10 p-3.5 text-xs text-brand-navy/80">
              <p className="font-bold text-brand-navy">⚡ Instant Counselor Callback</p>
              <p className="mt-0.5 text-[11px] text-brand-navy/70">
                Live slot picker is momentarily syncing. Enter your details below and a verified counselor will contact you within 15 minutes.
              </p>
            </div>

            {/* Invisible Honeypot */}
            <input
              type="text"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              tabIndex={-1}
              autoComplete="off"
              className="absolute -left-[9999px] h-0 w-0 opacity-0"
              aria-hidden="true"
            />

            {/* Division Qualification Fields */}
            <div className="rounded-2xl border border-brand-navy/10 bg-brand-navy/[0.02] p-3.5 space-y-3">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-brand-navy/50">
                Consultation Topic & Preferences
              </p>

              {activeDivision === 'study-abroad' && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-brand-navy/60 mb-1">Target Country</label>
                    <select
                      value={destination}
                      onChange={(e) => setDestination(e.target.value)}
                      className="min-h-11 w-full rounded-xl border border-brand-navy/15 bg-white px-3 py-2 text-xs font-semibold text-brand-navy focus:border-brand-gold focus:outline-none"
                    >
                      {STUDY_ABROAD_DESTINATIONS.map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-brand-navy/60 mb-1">Target Intake</label>
                    <select
                      value={intake}
                      onChange={(e) => setIntake(e.target.value)}
                      className="min-h-11 w-full rounded-xl border border-brand-navy/15 bg-white px-3 py-2 text-xs font-semibold text-brand-navy focus:border-brand-gold focus:outline-none"
                    >
                      {STUDY_ABROAD_INTAKES.map((i) => (
                        <option key={i} value={i}>{i}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {activeDivision === 'visa' && (
                <div>
                  <label className="block text-[10px] font-bold uppercase text-brand-navy/60 mb-1">Visa Category Needed</label>
                  <select
                    value={visaCategory}
                    onChange={(e) => setVisaCategory(e.target.value)}
                    className="min-h-11 w-full rounded-xl border border-brand-navy/15 bg-white px-3 py-2 text-xs font-semibold text-brand-navy focus:border-brand-gold focus:outline-none"
                  >
                    {VISA_CATEGORIES.map((v) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                </div>
              )}

              {activeDivision === 'manpower' && (
                <div>
                  <label className="block text-[10px] font-bold uppercase text-brand-navy/60 mb-1">Trade / Industry Specialization</label>
                  <select
                    value={trade}
                    onChange={(e) => setTrade(e.target.value)}
                    className="min-h-11 w-full rounded-xl border border-brand-navy/15 bg-white px-3 py-2 text-xs font-semibold text-brand-navy focus:border-brand-gold focus:outline-none"
                  >
                    {MANPOWER_TRADES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              )}

              {/* Dynamic Write-in for "Other" */}
              {isOtherSelected && (
                <div>
                  <label className="block text-[10px] font-bold uppercase text-brand-navy/60 mb-1">Specify Details *</label>
                  <input
                    value={customDetail}
                    onChange={(e) => setCustomDetail(e.target.value)}
                    placeholder="Tell us your specific requirement..."
                    className="min-h-11 w-full rounded-xl border border-brand-navy/15 bg-white px-3 py-2 text-xs text-brand-navy focus:border-brand-gold focus:outline-none"
                  />
                </div>
              )}

              <div>
                <label className="block text-[10px] font-bold uppercase text-brand-navy/60 mb-1">Preferred Time Window</label>
                <select
                  value={preferredWindow}
                  onChange={(e) => setPreferredWindow(e.target.value)}
                  className="min-h-11 w-full rounded-xl border border-brand-navy/15 bg-white px-3 py-2 text-xs font-semibold text-brand-navy focus:border-brand-gold focus:outline-none"
                >
                  <option value="Morning (11:00 AM – 01:00 PM)">Morning (11:00 AM – 01:00 PM IST)</option>
                  <option value="Afternoon (02:00 PM – 05:00 PM)">Afternoon (02:00 PM – 05:00 PM IST)</option>
                  <option value="Earliest Available">Earliest Available (ASAP)</option>
                </select>
              </div>
            </div>

            {/* Contact Details */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-[10px] font-bold uppercase text-brand-navy/60 mb-1">Your Full Name *</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Asim Hassan"
                  required
                  className="min-h-11 w-full rounded-xl border border-brand-navy/15 bg-brand-navy/[0.02] px-3 py-2.5 text-xs text-brand-navy focus:border-brand-gold focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-brand-navy/60 mb-1">Email Address</label>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  placeholder="name@example.com"
                  className="min-h-11 w-full rounded-xl border border-brand-navy/15 bg-brand-navy/[0.02] px-3 py-2.5 text-xs text-brand-navy focus:border-brand-gold focus:outline-none"
                />
              </div>
            </div>

            {/* Phone with Country Code */}
            <div>
              <label className="block text-[10px] font-bold uppercase text-brand-navy/60 mb-1">WhatsApp / Phone Number *</label>
              <div className="flex gap-2">
                <select
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  className="min-h-11 w-32 rounded-xl border border-brand-navy/15 bg-brand-navy/[0.02] px-2 py-2 text-xs font-bold text-brand-navy focus:border-brand-gold focus:outline-none"
                >
                  {COUNTRY_CODES.map((c) => (
                    <option key={c.code} value={c.code}>{c.label}</option>
                  ))}
                </select>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/[^0-9]/g, ''))}
                  type="tel"
                  placeholder="98765 43210"
                  required
                  className="min-h-11 flex-1 rounded-xl border border-brand-navy/15 bg-brand-navy/[0.02] px-3 py-2.5 text-xs font-bold text-brand-navy focus:border-brand-gold focus:outline-none"
                />
              </div>
            </div>

            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any specific questions or profile details (optional)..."
              rows={2}
              className="w-full rounded-xl border border-brand-navy/15 bg-brand-navy/[0.02] px-3 py-2 text-xs text-brand-navy focus:border-brand-gold focus:outline-none"
            />

            <TurnstileWidget onToken={setToken} />

            {error && <p className="rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="tactile-btn min-h-12 w-full rounded-full bg-brand-gold py-3 text-xs font-bold uppercase tracking-wider text-brand-navy transition hover:bg-brand-gold-hover hover:text-white disabled:opacity-50"
            >
              {submitting ? 'Submitting Request…' : 'Request Priority Callback'}
            </button>
          </form>
        ) : slots === null ? (
          /* 3. LOADING STATE */
          <div className="py-12 flex flex-col items-center text-center">
            <div className="h-9 w-9 animate-spin rounded-full border-2 border-brand-gold border-t-transparent" />
            <p className="mt-3 text-xs font-semibold text-brand-navy/70">Connecting to secure calendar…</p>
          </div>
        ) : (
          /* 4. ACTIVE SLOT SELECTION FORM (Tier 1 Bot-Gated) */
          <form onSubmit={handleBookingSubmit} className="mt-5 space-y-4">
            {/* Honeypot */}
            <input
              type="text"
              value={website}
              onChange={(e) => setWebsite(e.target.value)}
              tabIndex={-1}
              autoComplete="off"
              className="absolute -left-[9999px] h-0 w-0 opacity-0"
              aria-hidden="true"
            />

            {/* Slot Picker */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <p className="text-[11px] font-extrabold uppercase tracking-wider text-brand-navy/50">
                  Select Consultation Time
                </p>
                <span className="text-[10px] font-semibold text-brand-navy/40">IST (Asia/Kolkata)</span>
              </div>

              {groups.length === 0 ? (
                <div className="rounded-xl bg-amber-50 p-4 text-center">
                  <p className="text-xs font-semibold text-amber-900">
                    No open slots in the next 14 days.
                  </p>
                  <button
                    type="button"
                    onClick={() => setUseCallbackFallback(true)}
                    className="mt-2 text-xs font-bold text-brand-navy underline"
                  >
                    Request a priority callback instead →
                  </button>
                </div>
              ) : (
                <div className="max-h-44 space-y-2.5 overflow-y-auto pr-1 border border-brand-navy/10 rounded-2xl p-3 bg-brand-navy/[0.01]">
                  {groups.map((g) => (
                    <div key={g.date}>
                      <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-brand-navy/50">
                        {g.label}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        {g.slots.map((iso) => {
                          const isSel = selectedSlot === iso;
                          return (
                            <button
                              key={iso}
                              type="button"
                              onClick={() => setSelectedSlot(iso)}
                              className={`min-h-9 rounded-lg border px-3 py-1.5 text-xs font-bold transition ${
                                isSel
                                  ? 'border-brand-gold bg-brand-gold text-brand-navy shadow-sm'
                                  : 'border-brand-navy/15 bg-white text-brand-navy hover:border-brand-gold/60'
                              }`}
                            >
                              {fmtSlot(iso)}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Division-Specific Qualification Dropdown */}
            <div className="rounded-2xl border border-brand-navy/10 bg-brand-navy/[0.02] p-3.5 space-y-3">
              <p className="text-[10px] font-extrabold uppercase tracking-wider text-brand-navy/50">
                Service Intent & Specialization
              </p>

              {activeDivision === 'study-abroad' && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-brand-navy/60 mb-1">Target Country</label>
                    <select
                      value={destination}
                      onChange={(e) => setDestination(e.target.value)}
                      className="min-h-11 w-full rounded-xl border border-brand-navy/15 bg-white px-3 py-2 text-xs font-semibold text-brand-navy focus:border-brand-gold focus:outline-none"
                    >
                      {STUDY_ABROAD_DESTINATIONS.map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold uppercase text-brand-navy/60 mb-1">Target Intake</label>
                    <select
                      value={intake}
                      onChange={(e) => setIntake(e.target.value)}
                      className="min-h-11 w-full rounded-xl border border-brand-navy/15 bg-white px-3 py-2 text-xs font-semibold text-brand-navy focus:border-brand-gold focus:outline-none"
                    >
                      {STUDY_ABROAD_INTAKES.map((i) => (
                        <option key={i} value={i}>{i}</option>
                      ))}
                    </select>
                  </div>
                </div>
              )}

              {activeDivision === 'visa' && (
                <div>
                  <label className="block text-[10px] font-bold uppercase text-brand-navy/60 mb-1">Visa Category</label>
                  <select
                    value={visaCategory}
                    onChange={(e) => setVisaCategory(e.target.value)}
                    className="min-h-11 w-full rounded-xl border border-brand-navy/15 bg-white px-3 py-2 text-xs font-semibold text-brand-navy focus:border-brand-gold focus:outline-none"
                  >
                    {VISA_CATEGORIES.map((v) => (
                      <option key={v} value={v}>{v}</option>
                    ))}
                  </select>
                </div>
              )}

              {activeDivision === 'manpower' && (
                <div>
                  <label className="block text-[10px] font-bold uppercase text-brand-navy/60 mb-1">Trade / Domain</label>
                  <select
                    value={trade}
                    onChange={(e) => setTrade(e.target.value)}
                    className="min-h-11 w-full rounded-xl border border-brand-navy/15 bg-white px-3 py-2 text-xs font-semibold text-brand-navy focus:border-brand-gold focus:outline-none"
                  >
                    {MANPOWER_TRADES.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              )}

              {isOtherSelected && (
                <div>
                  <label className="block text-[10px] font-bold uppercase text-brand-navy/60 mb-1">Specify Details *</label>
                  <input
                    value={customDetail}
                    onChange={(e) => setCustomDetail(e.target.value)}
                    placeholder="Tell us your specific requirement..."
                    className="min-h-11 w-full rounded-xl border border-brand-navy/15 bg-white px-3 py-2 text-xs text-brand-navy focus:border-brand-gold focus:outline-none"
                  />
                </div>
              )}
            </div>

            {/* Attendee Info */}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="block text-[10px] font-bold uppercase text-brand-navy/60 mb-1">Your Full Name *</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Asim Hassan"
                  required
                  className="min-h-11 w-full rounded-xl border border-brand-navy/15 bg-brand-navy/[0.02] px-3 py-2.5 text-xs text-brand-navy focus:border-brand-gold focus:outline-none"
                />
              </div>
              <div>
                <label className="block text-[10px] font-bold uppercase text-brand-navy/60 mb-1">Email Address *</label>
                <input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  type="email"
                  placeholder="name@example.com"
                  required
                  className="min-h-11 w-full rounded-xl border border-brand-navy/15 bg-brand-navy/[0.02] px-3 py-2.5 text-xs text-brand-navy focus:border-brand-gold focus:outline-none"
                />
              </div>
            </div>

            {/* Phone with Country Code */}
            <div>
              <label className="block text-[10px] font-bold uppercase text-brand-navy/60 mb-1">WhatsApp Number (for meeting link) *</label>
              <div className="flex gap-2">
                <select
                  value={countryCode}
                  onChange={(e) => setCountryCode(e.target.value)}
                  className="min-h-11 w-32 rounded-xl border border-brand-navy/15 bg-brand-navy/[0.02] px-2 py-2 text-xs font-bold text-brand-navy focus:border-brand-gold focus:outline-none"
                >
                  {COUNTRY_CODES.map((c) => (
                    <option key={c.code} value={c.code}>{c.label}</option>
                  ))}
                </select>
                <input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value.replace(/[^0-9]/g, ''))}
                  type="tel"
                  placeholder="98765 43210"
                  required
                  className="min-h-11 flex-1 rounded-xl border border-brand-navy/15 bg-brand-navy/[0.02] px-3 py-2.5 text-xs font-bold text-brand-navy focus:border-brand-gold focus:outline-none"
                />
              </div>
            </div>

            <TurnstileWidget onToken={setToken} />

            {error && <p className="rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="tactile-btn min-h-12 w-full rounded-full bg-brand-gold py-3 text-xs font-bold uppercase tracking-wider text-brand-navy transition hover:bg-brand-gold-hover hover:text-white disabled:opacity-50"
            >
              {submitting ? 'Verifying & Booking…' : 'Confirm 1-on-1 Consultation'}
            </button>
            <p className="text-center text-[10px] text-brand-navy/40">
              Protected by Cloudflare Turnstile · Session will be held via Google Meet / WhatsApp
            </p>
          </form>
        )}
      </div>
    </div>
  );
}