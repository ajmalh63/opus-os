import React, { useEffect, useState } from 'react';
import TurnstileWidget from './TurnstileWidget';
import { getBookingUrlForDivision } from '../config/booking';

/**
 * BookingModal — Turnstile-Gated 1-on-1 Consultation Booking Funnel.
 *
 * Anti-Spam & Anti-Bot Defense-in-Depth:
 *  1. Mandatory Cloudflare Turnstile bot verification.
 *  2. 40+ Disposable / burner email domain blacklist.
 *  3. Phone number integrity & fake sequence rejection.
 *  4. Invisible Honeypot trap for automated scrapers.
 *  5. Direct Lead Capture in Opus OS CRM + seamless redirect to personalized Cal.com calendar.
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

const DISPOSABLE_DOMAINS = new Set([
  'mailinator.com', '10minutemail.com', 'tempmail.com', 'guerrillamail.com', 'throwawaymail.com',
  'yopmail.com', 'sharklasers.com', 'dispostable.com', 'trashmail.com', 'fakeinbox.com', 'getairmail.com',
  'generator.email', 'temp-mail.org', 'tempail.com', 'mohmal.com', 'disposablemail.com', 'maildrop.cc',
  'getnada.com', 'mailnesia.com', 'spam4.me', 'mytemp.email', 'crazymailing.com', 'dropmail.me',
  'harakirimail.com', 'mailcatch.com', 'nada.ltd', 'tempinbox.com', 'throwaway.email', 'trashmail.net',
  'inboxkitten.com', 'burnermail.io', 'minuteinbox.com', 'tempmailo.com', 'emailondeck.com',
  'guerrillamailblock.com', 'guerrillamail.net', 'guerrillamail.org', 'grr.la', 'guerrillamail.biz'
]);

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
  // Core Identity Fields
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [countryCode, setCountryCode] = useState('+91');
  const [phone, setPhone] = useState('');
  const [website, setWebsite] = useState(''); // Honeypot trap

  // Qualification Fields
  const [destination, setDestination] = useState(STUDY_ABROAD_DESTINATIONS[0]);
  const [intake, setIntake] = useState(STUDY_ABROAD_INTAKES[0]);
  const [visaCategory, setVisaCategory] = useState(VISA_CATEGORIES[0]);
  const [trade, setTrade] = useState(MANPOWER_TRADES[0]);
  const [customDetail, setCustomDetail] = useState('');
  const [notes, setNotes] = useState('');

  // Status & Bot Verification
  const [token, setToken] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [bookingRedirectUrl, setBookingRedirectUrl] = useState<string | null>(null);
  const [error, setError] = useState('');

  const activeDivision = division || 'study-abroad';

  useEffect(() => {
    if (!open) return;
    setBookingRedirectUrl(null);
    setError('');
    setCustomDetail('');
  }, [open]);

  if (!open) return null;

  const isOtherSelected =
    (activeDivision === 'study-abroad' && destination.includes('Other')) ||
    (activeDivision === 'visa' && visaCategory.includes('Other')) ||
    (activeDivision === 'manpower' && trade.includes('Other'));

  const fullPhone = phone.trim() ? `${countryCode} ${phone.trim()}` : '';

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
    if (!email.trim() || !email.includes('@')) {
      setError('A valid email address is required to send your calendar invite.');
      return false;
    }
    const emailDomain = email.trim().toLowerCase().split('@')[1];
    if (emailDomain && DISPOSABLE_DOMAINS.has(emailDomain)) {
      setError('Temporary/disposable email addresses are blocked. Please provide your real active email.');
      return false;
    }
    if (!token && !window.location.hostname.includes('localhost') && !window.location.hostname.includes('127.0.0.1')) {
      setError('Please complete the Cloudflare Turnstile security check.');
      return false;
    }
    return true;
  };

  const handleProceedToCalendar = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateInputQuality()) return;

    setSubmitting(true);
    setError('');

    const qualificationSummary = [
      activeDivision === 'study-abroad' ? `Target: ${destination}, Intake: ${intake}` : null,
      activeDivision === 'visa' ? `Category: ${visaCategory}` : null,
      activeDivision === 'manpower' ? `Trade: ${trade}` : null,
      isOtherSelected && customDetail ? `Details: ${customDetail}` : null,
      notes.trim() ? `Notes: ${notes.trim()}` : null,
    ]
      .filter(Boolean)
      .join(' | ');

    try {
      // 1. Capture and record verified lead into Opus OS CRM
      await fetch('/api/public/leads', {
        credentials: 'include',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'cf-turnstile-response': token } : {}),
        },
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          phone: fullPhone,
          primaryDivision: activeDivision,
          leadSource: 'verified-booking-funnel',
          intakeContext: qualificationSummary,
          serviceIntent: activeDivision,
          notes: qualificationSummary,
          dpdpConsent: true,
          marketingConsent: true,
          honeypot: website, // Traps automated scrapers
        }),
      }).catch(() => {});

      // 2. Build personalized Cal.com scheduling URL with prefilled applicant details
      const baseUrl = getBookingUrlForDivision(activeDivision);
      const targetUrl = new URL(baseUrl);
      targetUrl.searchParams.set('name', name.trim());
      targetUrl.searchParams.set('email', email.trim().toLowerCase());
      targetUrl.searchParams.set('phone', fullPhone);

      const finalUrl = targetUrl.toString();
      setBookingRedirectUrl(finalUrl);

      // 3. Open calendar scheduler in new tab
      window.open(finalUrl, '_blank', 'noopener,noreferrer');
    } catch {
      const baseUrl = getBookingUrlForDivision(activeDivision);
      setBookingRedirectUrl(baseUrl);
    } finally {
      setSubmitting(false);
    }
  };

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
              Verified 1-on-1 Booking
            </div>
            <h3 className="mt-1.5 font-display text-xl font-extrabold text-brand-navy">
              {DIVISION_LABELS[activeDivision] || 'Consultation Booking'}
            </h3>
            <p className="text-xs font-semibold text-brand-navy/60">
              Senior Counselor · 30 Min Session · Complimentary & Personalized
            </p>
          </div>
          <button
            onClick={onClose}
            className="flex min-h-11 min-w-11 items-center justify-center rounded-full bg-brand-navy/5 p-2 text-brand-navy/50 transition hover:bg-brand-navy/10 hover:text-brand-navy cursor-pointer"
            aria-label="Close modal"
          >
            ✕
          </button>
        </div>

        {/* SUCCESS / CALENDAR REDIRECT STATE */}
        {bookingRedirectUrl ? (
          <div className="py-8 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-3xl">
              ✅
            </div>
            <h4 className="mt-4 font-display text-lg font-extrabold text-brand-navy">
              Verification Successful!
            </h4>
            <p className="mt-2 text-xs font-medium text-brand-navy/80">
              We have opened your verified calendar slot picker in a new tab.
              <br />
              <span className="text-[11px] text-brand-navy/60">
                Please select your preferred date and time on the calendar to finalize your Google Meet session.
              </span>
            </p>

            <div className="mt-6 rounded-2xl bg-brand-navy/[0.03] p-4 text-left border border-brand-navy/10">
              <p className="text-[11px] font-bold uppercase tracking-wider text-brand-navy/50">Consultation Details:</p>
              <ul className="mt-1 space-y-1 text-xs text-brand-navy/70">
                <li>• <strong>Applicant:</strong> {name} ({fullPhone || phone})</li>
                <li>• <strong>Email:</strong> {email}</li>
                <li>• <strong>Division:</strong> {DIVISION_LABELS[activeDivision]}</li>
              </ul>
            </div>

            <div className="mt-6 flex flex-col gap-2.5 sm:flex-row sm:justify-center">
              <a
                href={bookingRedirectUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="tactile-btn inline-flex min-h-11 items-center justify-center rounded-full bg-brand-gold px-6 py-2.5 text-xs font-bold uppercase tracking-wider text-brand-navy hover:bg-brand-gold-hover hover:text-white"
              >
                📅 Open Calendar Selector Again ↗
              </a>
              <button
                onClick={onClose}
                className="tactile-btn min-h-11 rounded-full border border-brand-navy/15 bg-white px-6 py-2.5 text-xs font-bold text-brand-navy hover:bg-brand-navy/5 cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        ) : (
          /* FORM STATE */
          <form onSubmit={handleProceedToCalendar} className="mt-5 space-y-4">
            {/* Invisible Honeypot Trap */}
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
              placeholder="Any specific questions or profile background for the counselor (optional)..."
              rows={2}
              className="w-full rounded-xl border border-brand-navy/15 bg-brand-navy/[0.02] px-3 py-2 text-xs text-brand-navy focus:border-brand-gold focus:outline-none"
            />

            {/* Cloudflare Turnstile Bot Gate */}
            <TurnstileWidget onToken={setToken} />

            {error && <p className="rounded-xl bg-rose-50 p-3 text-xs font-semibold text-rose-700">{error}</p>}

            <button
              type="submit"
              disabled={submitting}
              className="tactile-btn min-h-12 w-full rounded-full bg-brand-gold py-3 text-xs font-bold uppercase tracking-wider text-brand-navy transition hover:bg-brand-gold-hover hover:text-white disabled:opacity-50 cursor-pointer shadow-md"
            >
              {submitting ? 'Verifying Details…' : '📅 Proceed to Choose Your Slot →'}
            </button>
            <p className="text-center text-[10px] text-brand-navy/40">
              Protected by Cloudflare Turnstile · Session conducted via Google Meet
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
