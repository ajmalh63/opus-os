import { useLocation } from 'wouter';
import Nav from '../../components/Nav';
import Footer from '../../components/Footer';
import StickyCallBar from '../../components/StickyCallBar';
import ChatWidget from '../../components/ChatWidget';
import SEOHead from '../../components/SEOHead';
import { BASE_ORGANIZATION_SCHEMA, getBreadcrumbSchema } from '../../lib/schemas';
import { useVisibilityTracking } from '../../lib/visibilityTracking';

export default function TermsOfServicePage() {
  useVisibilityTracking('/terms');
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-brand-cream font-sans text-brand-navy selection:bg-brand-gold selection:text-brand-navy">
      <SEOHead
        title="Terms of Service & Client Engagement | Opus Overseas"
        description="Review the terms of service and engagement standards for Opus Overseas student admissions, visa facilitation, attestation, Umrah, and recruitment services."
        canonicalPath="/terms"
        schemas={[
          BASE_ORGANIZATION_SCHEMA,
          getBreadcrumbSchema([
            { name: 'Home', path: '/' },
            { name: 'Terms of Service', path: '/terms' },
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
            Official Client Agreement
          </span>
          <h1 className="mt-4 font-display fluid-h1 font-black leading-tight text-white">
            Terms of Service & Engagement
          </h1>
          <p className="mt-3 text-xs sm:text-sm text-white/70">
            Last Updated: August 2026 · Binding across all Opus Overseas divisions & portals
          </p>
        </div>
      </section>

      {/* LEGAL BODY */}
      <section className="mx-auto max-w-4xl px-5 sm:px-6 py-16 sm:py-20">
        <div className="glass-light p-8 sm:p-12 rounded-3xl shadow-xl border border-brand-navy/10 space-y-8 text-xs sm:text-sm leading-relaxed text-brand-navy/85">
          
          <div>
            <h2 className="font-display text-lg sm:text-xl font-extrabold text-brand-navy mb-2">
              1. Legal Entity & Acceptance of Terms
            </h2>
            <p>
              Opus Overseas is a premier international education, consular visa advisory, attestation, and mobility consultancy brand owned, registered, and operated by <strong className="text-brand-navy">Cordial Crafts</strong> (&ldquo;Company&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo;). By accessing the Opus Overseas platform, submitting consultation inquiries, or engaging our advisory services, you enter into a legally binding agreement with Cordial Crafts.
            </p>
          </div>

          <div>
            <h2 className="font-display text-lg sm:text-xl font-extrabold text-brand-navy mb-2">
              2. Sovereign Consular & University Disclaimers
            </h2>
            <ul className="list-disc pl-5 space-y-2 mt-2">
              <li>
                <strong className="text-brand-navy">Visa Decisions:</strong> The grant, refusal, delay, or administrative processing of any visa is the sole sovereign prerogative of the respective foreign embassy, consulate, or immigration authority (e.g. US Department of State, UK Visas & Immigration, UAE GDRFA). Opus Overseas facilitates accurate documentation and file presentation but cannot guarantee an unconditional visa outcome.
              </li>
              <li>
                <strong className="text-brand-navy">University Admissions:</strong> Admission offers, academic prerequisites, and merit scholarships remain subject to independent faculty and admissions board review by the target educational institution.
              </li>
            </ul>
          </div>

          <div>
            <h2 className="font-display text-lg sm:text-xl font-extrabold text-brand-navy mb-2">
              3. Applicant Responsibilities & Document Accuracy
            </h2>
            <p>
              You agree to provide true, complete, and authentic documents (academic certificates, bank statements, identification). Submission of fraudulent, forged, or altered documents will result in immediate termination of engagement and may lead to statutory reporting under applicable law.
            </p>
          </div>

          <div>
            <h2 className="font-display text-lg sm:text-xl font-extrabold text-brand-navy mb-2">
              4. Fees, Free Study Abroad Guidance & Refund Policy
            </h2>
            <ul className="list-disc pl-5 space-y-2 mt-2">
              <li>
                <strong className="text-brand-navy">100% Free Study Abroad Guidance:</strong> Opus Overseas provides student guidance, course shortlisting, SOP mentoring, and visa preparation free of consulting charges. No service fee is charged for counselling.
              </li>
              <li>
                <strong className="text-brand-navy">Refundable Application Commitment — ₹5,000 (Policy-Only Disclosure):</strong> A commitment of <strong>₹5,000</strong> is collected to initiate formal dossier processing and application filing. It is <strong>fully refunded</strong> when you attend the orientation / commencement day at your desired university and pay the first-semester fee (verified via university confirmation). <em>This condition is disclosed only in policy pages</em> — all marketing and client workspace messaging remains “100% Free” as positioned.
              </li>
              <li>
                <strong className="text-brand-navy">Launch Offer — First 50 Applicants Fully Free:</strong> The first 50 study-abroad applicants pay <strong>₹0</strong> — the ₹5,000 is waived entirely. No commitment required for early applicants.
              </li>
              <li>
                <strong className="text-brand-navy">Statutory Government & University Charges:</strong> University application fees, foreign embassy visa fees, VFS biometric charges, and MEA apostille challans are direct disbursements and are subject to respective institutional non-refundable rules once transmitted.
              </li>
            </ul>
          </div>

          <div>
            <h2 className="font-display text-lg sm:text-xl font-extrabold text-brand-navy mb-2">
              5. Umrah Logistics & Hotel Allocations
            </h2>
            <p>
              Umrah package departures and flight blocks are subject to airline schedule confirmations and Saudi Ministry guidelines. Hotel accommodations and room allocations in Makkah and Madinah are coordinated within the agreed package tier and are subject to hotel room inventory availability at the time of final confirmation.
            </p>
          </div>

          <div>
            <h2 className="font-display text-lg sm:text-xl font-extrabold text-brand-navy mb-2">
              6. Limitation of Liability & Dispute Resolution
            </h2>
            <p>
              Opus Overseas shall not be liable for losses resulting from sovereign border policy revisions, geopolitical restrictions, flight rescheduling by airlines, or natural disruptions (Force Majeure). Any legal disputes shall be subject to the exclusive jurisdiction of the competent courts in Telangana, India.
            </p>
          </div>

          <div className="pt-4 border-t border-brand-navy/10 flex items-center justify-between">
            <button
              onClick={() => setLocation('/privacy')}
              className="cursor-pointer font-bold text-brand-navy hover:text-brand-gold transition-colors"
            >
              ← View Privacy Policy
            </button>
            <button
              onClick={() => setLocation('/contact')}
              className="cursor-pointer font-bold text-brand-gold-hover hover:underline"
            >
              Contact Legal Advisory →
            </button>
          </div>

        </div>
      </section>

      <Footer />
    </div>
  );
}
