import { useLocation } from "wouter";
import Nav from "../../components/Nav";
import Footer from "../../components/Footer";
import StickyCallBar from "../../components/StickyCallBar";
import ChatWidget from "../../components/ChatWidget";
import SEOHead from "../../components/SEOHead";
import { BASE_ORGANIZATION_SCHEMA, getBreadcrumbSchema } from "../../lib/schemas";
import { useVisibilityTracking } from "../../lib/visibilityTracking";

export default function ShippingPolicyPage() {
  useVisibilityTracking("/shipping-policy");
  const [, setLocation] = useLocation();

  return (
    <div className="min-h-screen bg-brand-cream font-sans text-brand-navy selection:bg-brand-gold selection:text-brand-navy">
      <SEOHead
        title="Shipping & Document Delivery Policy | Insured Logistics | Opus Overseas"
        description="Review the official Opus Overseas Shipping & Delivery Policy. Learn about pan-India insured transit, passport handling, attestation courier timelines, and delivery tracking."
        canonicalPath="/shipping-policy"
        schemas={[
          BASE_ORGANIZATION_SCHEMA,
          getBreadcrumbSchema([
            { name: "Home", path: "/" },
            { name: "Shipping & Delivery Policy", path: "/shipping-policy" },
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
            Insured Logistics & Custody Protocols
          </span>
          <h1 className="mt-4 font-display fluid-h1 font-black leading-tight text-white">
            Shipping & Document Delivery Policy
          </h1>
          <p className="mt-3 text-xs sm:text-sm text-white/70">
            Last Updated: August 2026 · Applicable to physical document transit across all divisions
          </p>
        </div>
      </section>

      {/* POLICY BODY */}
      <section className="mx-auto max-w-4xl px-5 sm:px-6 py-16 sm:py-20">
        <div className="glass-light p-8 sm:p-12 rounded-3xl shadow-xl border border-brand-navy/10 space-y-8 text-xs sm:text-sm leading-relaxed text-brand-navy/85">
          
          <div>
            <h2 className="font-display text-lg sm:text-xl font-extrabold text-brand-navy mb-2">
              1. Nature of Physical Deliveries
            </h2>
            <p>
              Opus Overseas primarily delivers digital consultation, university admissions, and e-visa services. Physical shipments are restricted to high-security custody transit of original physical assets, including:
            </p>
            <ul className="list-disc pl-5 space-y-1.5 mt-2">
              <li>Original educational degree certificates, marksheets, and commercial documents submitted for State HRD, MEA Apostille, and Embassy Legalization.</li>
              <li>Physical passports stamped with sticker visas from foreign embassies.</li>
              <li>Physical I-20 / CAS immigration welcome kits or official university offer packages.</li>
            </ul>
          </div>

          <div>
            <h2 className="font-display text-lg sm:text-xl font-extrabold text-brand-navy mb-2">
              2. Shipping Method & Insured Logistics
            </h2>
            <p>
              All physical consignments are transported through premier, trackable, tamper-evident courier partners (Insured Logistics). Each physical shipment is accompanied by a unique Air Waybill (AWB) number and high-value transit coverage to ensure complete custody safety.
            </p>
          </div>

          <div>
            <h2 className="font-display text-lg sm:text-xl font-extrabold text-brand-navy mb-2">
              3. Dispatch & Delivery Timelines
            </h2>
            <div className="space-y-3 mt-3">
              <div className="p-4 rounded-2xl bg-white border border-brand-navy/10">
                <p className="font-bold text-brand-navy">📜 Attested Certificates & Apostille Deliveries</p>
                <p className="text-xs text-brand-textLight mt-1">
                  Dispatched within <strong>24 business hours</strong> of receipt of completed consular and MEA seals. Return transit across India is delivered within <strong>3 to 5 business days</strong> depending on delivery pincode.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-white border border-brand-navy/10">
                <p className="font-bold text-brand-navy">✈️ Stamped Passport Return Deliveries</p>
                <p className="text-xs text-brand-textLight mt-1">
                  Dispatched immediately upon consular counter handover. Delivered securely to the client registered residential address within <strong>2 to 4 working days</strong>.
                </p>
              </div>

              <div className="p-4 rounded-2xl bg-white border border-brand-navy/10">
                <p className="font-bold text-brand-navy">🕋 Umrah Travel Kits & Visa Envelopes</p>
                <p className="text-xs text-brand-textLight mt-1">
                  Handed over or dispatched at least <strong>7 to 10 days prior to group departure date</strong>.
                </p>
              </div>
            </div>
          </div>

          <div>
            <h2 className="font-display text-lg sm:text-xl font-extrabold text-brand-navy mb-2">
              4. Shipping Charges & Insurance Fees
            </h2>
            <p>
              Standard insured return shipping charges are clearly itemized in your service invoice prior to payment. Where expedited overnight or dedicated hand-carry diplomatic delivery is requested, applicable courier tariff surcharges are disclosed transparently.
            </p>
          </div>

          <div>
            <h2 className="font-display text-lg sm:text-xl font-extrabold text-brand-navy mb-2">
              5. Consignment Tracking & Inquiries
            </h2>
            <p>
              Clients can track the live dispatch milestone of their physical documents 24/7 on the Opus Client Portal or directly via the courier AWB tracking link provided via SMS and WhatsApp.
            </p>
            <div className="mt-3 rounded-2xl bg-white p-4 border border-brand-navy/10 space-y-1 text-xs font-mono text-brand-navy">
              <p><strong>Logistics & Dispatch Desk:</strong> Opus Overseas Logistics Hub</p>
              <p><strong>Email:</strong> logistics@opusoverseas.com / support@opusoverseas.com</p>
              <p><strong>Tracking Helpline:</strong> +91 98765 00001</p>
            </div>
          </div>

          <div className="pt-4 border-t border-brand-navy/10 flex items-center justify-between">
            <button
              onClick={() => setLocation("/terms")}
              className="cursor-pointer font-bold text-brand-navy hover:text-brand-gold transition-colors"
            >
              ← Terms of Service
            </button>
            <button
              onClick={() => setLocation("/refund-policy")}
              className="cursor-pointer font-bold text-brand-gold-hover hover:underline"
            >
              Refund Policy →
            </button>
          </div>

        </div>
      </section>

      <Footer />
    </div>
  );
}
