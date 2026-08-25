import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import InteractiveFunnelModal, { FunnelDivision } from './funnel/InteractiveFunnelModal';
import BookingModal from './BookingModal';

interface Props {
  division?: FunnelDivision;
  hookText?: string;
}

export default function StickyCallBar({ division, hookText }: Props) {
  const [location] = useLocation();
  const [modalOpen, setModalOpen] = useState(false);
  const [bookingModalOpen, setBookingModalOpen] = useState(false);
  const [visible, setVisible] = useState(true);

  // Determine current division from route if not explicitly passed
  const activeDivision: FunnelDivision = division || (
    location.includes('visa') ? 'visa' :
    location.includes('umrah') ? 'umrah' :
    location.includes('attestation') ? 'attestation' :
    location.includes('recruitment') ? 'manpower' : 'study-abroad'
  );

  const getHook = () => {
    if (hookText) return hookText;
    switch (activeDivision) {
      case 'study-abroad':
        return '🎓 Fall 2026 Admissions Open · Complimentary Profile Assessment';
      case 'visa':
        return '✈️ Express Consular Fast-Track · Transparent Document Handling';
      case 'umrah':
        return '🕋 Customized Umrah Packages · Premium Hotel Stays & Guided Logistics';
      case 'attestation':
        return '📜 MEA & Embassy Apostille · Insured Door-to-Door Courier Across India';
      case 'manpower':
        return '💼 Verified Gulf & Europe Employer Network';
      default:
        return '🌟 Opus Overseas · Your Trusted Gateway to Global Opportunities';
    }
  };

  const openChatwoot = () => {
    if (typeof window !== 'undefined' && (window as any).$chatwoot) {
      (window as any).$chatwoot.toggle('open');
    }
  };

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY;
      if (window.innerWidth < 768) {
        setVisible(y > 200);
      } else {
        setVisible(true);
      }
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <>
      <aside 
        aria-label="Quick consultation and eligibility bar"
        className={`fixed bottom-3 sm:bottom-4 left-1/2 z-40 w-[calc(100%-1.25rem)] sm:w-[calc(100%-2rem)] max-w-5xl -translate-x-1/2 transition-all duration-400 ${
          visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-16 opacity-0'
        }`}
      >
        <div className="glass-pill rounded-2xl md:rounded-full p-2.5 md:px-4 md:py-2.5 shadow-2xl border border-white/20 backdrop-blur-xl bg-brand-navy/90">
          {/* Mobile Ergonomic Layout (< md) */}
          <div className="flex flex-col gap-2 md:hidden">
            {/* Top Hook Strip */}
            <div className="flex items-center gap-2 px-1 min-w-0">
              <span className="h-1.5 w-1.5 rounded-full bg-brand-gold animate-pulse shrink-0" />
              <p className="truncate text-[11px] font-semibold text-white/90">
                {getHook()}
              </p>
            </div>

            {/* Action Buttons: Both Primary CTAs Balanced for Mobile */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => setModalOpen(true)}
                className="tactile-btn cursor-pointer inline-flex items-center justify-center gap-1.5 rounded-xl bg-brand-gold py-2.5 px-2 text-[11px] font-bold uppercase tracking-wider text-brand-navy transition hover:bg-brand-gold-hover hover:text-white active:scale-[0.98] shadow-sm text-center"
              >
                <span>⚡ Eligibility Check</span>
              </button>

              <button
                onClick={() => setBookingModalOpen(true)}
                className="tactile-btn cursor-pointer inline-flex items-center justify-center gap-1 rounded-xl border border-white/25 bg-white/10 py-2.5 px-2 text-[11px] font-bold uppercase tracking-wider text-white transition hover:border-brand-gold hover:text-brand-gold hover:bg-white/15 active:scale-[0.98] text-center"
              >
                <span>📅 Book 1-on-1</span>
                <span className="text-[10px] text-brand-gold">↗</span>
              </button>
            </div>
          </div>

          {/* Desktop & Tablet Layout (>= md) */}
          <div className="hidden md:flex items-center justify-between gap-3">
            {/* Left Value Proposition Hook */}
            <div className="flex items-center gap-2.5 pl-1.5 min-w-0 flex-1">
              <span className="inline-flex h-2 w-2 rounded-full bg-brand-gold animate-pulse shrink-0" />
              <p className="truncate text-xs font-semibold text-white/90">
                {getHook()}
              </p>
            </div>

            {/* Right Action Cluster */}
            <div className="flex items-center gap-2 shrink-0">
              {/* 1-Click Interactive Assessment Button */}
              <button
                onClick={() => setModalOpen(true)}
                className="tactile-btn cursor-pointer inline-flex items-center gap-1.5 rounded-full bg-brand-gold px-4 py-2 text-xs font-bold uppercase tracking-wider text-brand-navy transition hover:bg-brand-gold-hover hover:text-white active:scale-[0.98] shadow-sm"
              >
                <span>⚡ Free Eligibility Check</span>
              </button>

              {/* Protected 1-on-1 Turnstile Booking Modal */}
              <button
                onClick={() => setBookingModalOpen(true)}
                className="tactile-btn inline-flex items-center gap-1 rounded-full border border-white/25 bg-white/10 px-3.5 py-2 text-xs font-bold uppercase tracking-wider text-white transition hover:border-brand-gold hover:text-brand-gold hover:bg-white/15 cursor-pointer"
              >
                <span>📅 Book 1-on-1</span>
                <span className="text-[10px] text-brand-gold">↗</span>
              </button>

              {/* Live Chat Action */}
              <button
                onClick={openChatwoot}
                aria-label="Open live chat with advisor"
                className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10 hover:bg-white/20 text-white transition cursor-pointer text-sm"
                title="Chat Live with an Advisor"
              >
                💬
              </button>
            </div>
          </div>
        </div>
      </aside>

      {/* Global Interactive Funnel Modal */}
      <InteractiveFunnelModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        initialDivision={activeDivision}
      />

      {/* Turnstile Protected 1-on-1 Consultation Booking Modal */}
      <BookingModal
        open={bookingModalOpen}
        onClose={() => setBookingModalOpen(false)}
        division={activeDivision}
      />
    </>
  );
}
