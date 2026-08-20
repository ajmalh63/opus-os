import { useLocation } from 'wouter';
import Nav from '../../components/Nav';
import Footer from '../../components/Footer';
import StickyCallBar from '../../components/StickyCallBar';
import ChatWidget from '../../components/ChatWidget';
import SEOHead from '../../components/SEOHead';
import { BASE_ORGANIZATION_SCHEMA, getBreadcrumbSchema } from '../../lib/schemas';
import { useVisibilityTracking } from '../../lib/visibilityTracking';

export default function RefundPolicyPage() {
  useVisibilityTracking('/refund-policy');
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-brand-cream font-sans text-brand-navy selection:bg-brand-gold selection:text-brand-navy">
      <SEOHead
        title="Refund & Cancellation Policy | Transparent Fee Ledgers | Opus Overseas"
        description="Read the official Opus Overseas refund policy. Full transparency on refundable security deposits, statutory government fees, and fair cancellation protocols."
        canonicalPath="/refund-policy"
        schemas={[
          BASE_ORGANIZATION_SCHEMA,
          getBreadcrumbSchema([
            { name: 'Home', path: '/' },
            { name: 'Refund Policy', path: '/refund-policy' },
          ]),
        ]}
      />
      <div className="film-grain" aria-hidden="true" />
      <Nav />
      <ChatWidget />
      <StickyCallBar />

      {/* HEADER */}
      <section className="relative overflow-hidden bg-gradient-to-b from-[#061e38] via-[#092b4c] to-[#0a2d50] pb-16 pt-36 sm:pt-40 text-white border-b border-brand-gold/20">
        <div className="mx-auto max-w-5xl px-5 sm:px-6 text-center">
          <span className="inline-flex items-center gap-2 rounded-full border border-brand-gold/40 bg-brand-gold/10 px-4 py-1 text-xs font-bold uppercase tracking-[0.2em] text-brand-gold">
            Transparent Financial Ledgers
          </span>
          <h1 className="mt-4 font-display fluid-h1 font-black leading-tight text-white">
            Refund & Cancellation Policy
          </h1>
          <p className="mt-3 text-xs sm:text-sm text-white/70">
            Last Updated: August 2026 · Standardized across all Opus Overseas divisions
          </p>
        </div>
      </section>

      {/* POLICY CONTENT */}
      <section className="mx-auto max-w-4xl px-5 sm:px-6 py-16 sm:py-20">
        <div className="glass-light p-8 sm:p-12 rounded-3xl shadow-xl border border-brand-navy/10 space-y-8 text-xs sm:text-sm leading-relaxed text-brand-navy/85">
          
          <div>
            <h2 className="font-display text-lg sm:text-xl font-extrabold text-brand-navy mb-2">
              1. Policy Overview & Commitment to Fair Dealing
            </h2>
            <p>
              At Opus Overseas, we maintain 100% transparent fee ledgers. Our refund policy distinguishes clearly between non-refundable statutory government disbursements and refundable professional advisory fees.
            </p>
          </div>

          <div>
            <h2 className="font-display text-lg sm:text-xl font-extrabold text-brand-navy mb-3">
              2. Division-Specific Refund & Cancellation Matrix
            </h2>
            
            <div className="space-y-4">
              <div className="p-4 rounded-2xl bg-white border border-brand-navy/10">
                <h3 className="font-display text-sm font-bold text-brand-navy mb-1">🎓 Study Abroad (100% Free Mentorship & Refundable Deposit)</h3>
                <ul className="list-disc pl-5 space-y-1 text-xs text-brand-textLight">
                  <li><strong>Free Advisory Scope:</strong> Study abroad counselling, profile shortlisting, SOP mentoring, and visa guidance are 100% free.</li>
                  <li><strong>100% Security Deposit Refund:</strong> The initial application commitment deposit is 100% refunded to the student once the candidate successfully enrolls and commences classes on Day 1 of the official academic term at the applied university (verified via admissions management portals, provided the student does not transfer or abandon the file).</li>
                  <li><strong>Cancellation Before Portal Submission:</strong> 100% refund of the security deposit if cancelled in writing prior to institutional dossier filing.</li>
                  <li><strong>Non-Refundable:</strong> Direct university application fees or evaluation charges paid directly to foreign educational boards.</li>
                </ul>
              </div>

              <div className="p-4 rounded-2xl bg-white border border-brand-navy/10">
                <h3 className="font-display text-sm font-bold text-brand-navy mb-1">✈️ Global Visa Services</h3>
                <ul className="list-disc pl-5 space-y-1 text-xs text-brand-textLight">
                  <li><strong>Pre-Submission:</strong> 100% refund of professional fees if visa file processing is cancelled prior to consular portal transmission.</li>
                  <li><strong>Post-Submission:</strong> Sovereign consular fees, VFS biometric appointment booking charges, and mandatory travel insurance premiums are strictly non-refundable.</li>
                </ul>
              </div>

              <div className="p-4 rounded-2xl bg-white border border-brand-navy/10">
                <h3 className="font-display text-sm font-bold text-brand-navy mb-1">🕋 Umrah & Spiritual Travel</h3>
                <ul className="list-disc pl-5 space-y-1 text-xs text-brand-textLight">
                  <li><strong>30+ Days Prior to Departure:</strong> 85% refund of total package price (less non-refundable airline seat lock deposit).</li>
                  <li><strong>15 to 29 Days Prior:</strong> 50% refund of total package cost.</li>
                  <li><strong>Under 14 Days:</strong> Strictly non-refundable due to non-cancellable Haramain hotel block-bookings and group air tickets.</li>
                </ul>
              </div>

              <div className="p-4 rounded-2xl bg-white border border-brand-navy/10">
                <h3 className="font-display text-sm font-bold text-brand-navy mb-1">📜 Document Attestation & Apostille</h3>
                <ul className="list-disc pl-5 space-y-1 text-xs text-brand-textLight">
                  <li><strong>Before Courier Transit:</strong> 100% refund of all fees.</li>
                  <li><strong>During Verification:</strong> Non-refundable for completed statutory milestones (e.g. State HRD, MEA challans already executed).</li>
                </ul>
              </div>
            </div>
          </div>

          <div>
            <h2 className="font-display text-lg sm:text-xl font-extrabold text-brand-navy mb-2">
              3. Refund Request Procedure & Bank Settlement Timelines
            </h2>
            <p>
              To initiate a refund request, submit an email with your Journey Token and receipt to <strong className="text-brand-navy">billing@opusoverseas.com</strong>.
            </p>
            <p className="mt-2">
              Approved refunds are settled directly to the original payment source (bank account / UPI / credit card) within <strong className="text-brand-navy">5 to 7 business days</strong> in compliance with Reserve Bank of India (RBI) payment gateway norms.
            </p>
          </div>

          <div className="pt-4 border-t border-brand-navy/10 flex items-center justify-between">
            <button
              onClick={() => setLocation('/terms')}
              className="cursor-pointer font-bold text-brand-navy hover:text-brand-gold transition-colors"
            >
              ← Terms of Service
            </button>
            <button
              onClick={() => setLocation('/contact')}
              className="cursor-pointer font-bold text-brand-gold-hover hover:underline"
            >
              Contact Billing Desk →
            </button>
          </div>

        </div>
      </section>

      <Footer />
    </div>
  );
}
