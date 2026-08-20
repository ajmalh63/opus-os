import { useLocation } from 'wouter';
import Nav from '../../components/Nav';
import Footer from '../../components/Footer';
import StickyCallBar from '../../components/StickyCallBar';
import ChatWidget from '../../components/ChatWidget';
import SEOHead from '../../components/SEOHead';
import { BASE_ORGANIZATION_SCHEMA, getBreadcrumbSchema } from '../../lib/schemas';
import { useVisibilityTracking } from '../../lib/visibilityTracking';

export default function PrivacyPolicyPage() {
  useVisibilityTracking('/privacy');
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-brand-cream font-sans text-brand-navy selection:bg-brand-gold selection:text-brand-navy">
      <SEOHead
        title="Privacy Policy & DPDP Compliance | Opus Overseas"
        description="Read the official Opus Overseas Privacy Policy. Learn how applicant data, academic transcripts, passport scans, and payment telemetry are protected under the DPDP Act 2023."
        canonicalPath="/privacy"
        schemas={[
          BASE_ORGANIZATION_SCHEMA,
          getBreadcrumbSchema([
            { name: 'Home', path: '/' },
            { name: 'Privacy Policy', path: '/privacy' },
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
            DPDP Act 2023 & GDPR Compliant
          </span>
          <h1 className="mt-4 font-display fluid-h1 font-black leading-tight text-white">
            Privacy Policy & Data Protection
          </h1>
          <p className="mt-3 text-xs sm:text-sm text-white/70">
            Last Updated: August 2026 · Effective across all Opus Overseas portals & services
          </p>
        </div>
      </section>

      {/* LEGAL BODY */}
      <section className="mx-auto max-w-4xl px-5 sm:px-6 py-16 sm:py-20">
        <div className="glass-light p-8 sm:p-12 rounded-3xl shadow-xl border border-brand-navy/10 space-y-8 text-xs sm:text-sm leading-relaxed text-brand-navy/85">
          
          <div>
            <h2 className="font-display text-lg sm:text-xl font-extrabold text-brand-navy mb-2">
              1. Introduction & Data Fiduciary Role
            </h2>
            <p>
              <strong className="text-brand-navy">Cordial Crafts</strong> (operating under the trade and brand name <strong className="text-brand-navy">Opus Overseas</strong>, &ldquo;we&rdquo;, &ldquo;us&rdquo;, or &ldquo;our&rdquo;) acts as a Data Fiduciary under the Digital Personal Data Protection Act, 2023 (India) and applicable international data privacy standards. We are committed to safeguarding the personal, academic, financial, and travel metadata entrusted to us by applicants, students, pilgrims, and partner institutions.
            </p>
          </div>

          <div>
            <h2 className="font-display text-lg sm:text-xl font-extrabold text-brand-navy mb-2">
              2. Categories of Information We Collect
            </h2>
            <ul className="list-disc pl-5 space-y-1.5 mt-2">
              <li><strong className="text-brand-navy">Identity & Passport Records:</strong> Full legal name, date of birth, passport number, expiration dates, nationality, and scanned copies required for visa filing.</li>
              <li><strong className="text-brand-navy">Academic & Professional Credentials:</strong> Transcripts, GPA, degree certificates, IELTS/TOEFL/PTE scorecards, and resumes for university shortlisting and international employment.</li>
              <li><strong className="text-brand-navy">Contact & Communications Data:</strong> WhatsApp phone numbers, email addresses, residential pickup addresses, and correspondence records.</li>
              <li><strong className="text-brand-navy">Financial & Payment Telemetry:</strong> Transaction identifiers, invoicing records, and Razorpay/Stripe compliance payloads (card and bank credentials are never stored on our servers).</li>
            </ul>
          </div>

          <div>
            <h2 className="font-display text-lg sm:text-xl font-extrabold text-brand-navy mb-2">
              3. Legal Basis & Purpose of Data Processing
            </h2>
            <p>We process your data strictly for legitimate mobility facilitation purposes:</p>
            <ul className="list-disc pl-5 space-y-1.5 mt-2">
              <li>Facilitating university applications, scholarship claims, and I-20/CAS generation.</li>
              <li>Compiling consular visa dossiers, scheduling VFS/embassy biometric appointments, and e-visa issuance.</li>
              <li>Coordinating sacred Umrah flight manifests, Nusuk visa issuance, and hotel room allotments.</li>
              <li>Authenticating original documents through State HRD, MEA New Delhi, and foreign embassies.</li>
              <li>Matching candidate CVs with verified overseas employer quotas under MEA guidelines.</li>
            </ul>
          </div>

          <div>
            <h2 className="font-display text-lg sm:text-xl font-extrabold text-brand-navy mb-2">
              4. Data Retention & Cryptographic Security
            </h2>
            <p>
              All personal data transmitted to Opus Overseas is encrypted in transit using TLS 1.3 with AES-256 GCM algorithms. Document scans and identification payloads are purged automatically after successful visa stamping or upon formal client withdrawal, in full compliance with statutory immigration retention timelines.
            </p>
          </div>

          <div>
            <h2 className="font-display text-lg sm:text-xl font-extrabold text-brand-navy mb-2">
              5. Your Rights as a Data Principal
            </h2>
            <p>Under the DPDP Act 2023, you retain the following statutory rights:</p>
            <ul className="list-disc pl-5 space-y-1.5 mt-2">
              <li><strong className="text-brand-navy">Right to Access & Summary:</strong> Request an export of all personal information held in your client file.</li>
              <li><strong className="text-brand-navy">Right to Correction & Erasure:</strong> Correct inaccuracies or request complete file erasure once visa processing concludes.</li>
              <li><strong className="text-brand-navy">Right to Withdraw Consent:</strong> Withdraw DPDP processing consent at any time through our Data Protection Officer.</li>
            </ul>
          </div>

          <div>
            <h2 className="font-display text-lg sm:text-xl font-extrabold text-brand-navy mb-2">
              6. Grievance Redressal & Data Protection Officer
            </h2>
            <p>
              If you have inquiries, data deletion requests, or grievances regarding your privacy, please contact our designated Grievance Officer:
            </p>
            <div className="mt-3 rounded-2xl bg-white p-4 border border-brand-navy/10 space-y-1 text-xs font-mono text-brand-navy">
              <p><strong>Grievance & Privacy Desk:</strong> Opus Overseas Legal & Compliance</p>
              <p><strong>Email:</strong> privacy@opusoverseas.com / legal@opusoverseas.com</p>
              <p><strong>Direct Helpline:</strong> +91 98765 00001</p>
            </div>
          </div>

          <div className="pt-4 border-t border-brand-navy/10 flex items-center justify-between">
            <button
              onClick={() => setLocation('/contact')}
              className="cursor-pointer font-bold text-brand-gold-hover hover:underline"
            >
              ← Contact Privacy Desk
            </button>
            <button
              onClick={() => setLocation('/terms')}
              className="cursor-pointer font-bold text-brand-navy hover:text-brand-gold transition-colors"
            >
              View Terms of Service →
            </button>
          </div>

        </div>
      </section>

      <Footer />
    </div>
  );
}
