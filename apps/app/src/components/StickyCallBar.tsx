import { useState, useEffect } from 'react';
import { useLocation } from 'wouter';
import { getBookingUrlForDivision } from '../config/booking';
import InteractiveFunnelModal, { FunnelDivision } from './funnel/InteractiveFunnelModal';

interface Props {
  division?: FunnelDivision;
  hookText?: string;
}

export default function StickyCallBar({ division, hookText }: Props) {
  const [location] = useLocation();
  const [modalOpen, setModalOpen] = useState(false);
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
        return '🎓 Fall 2026 Admissions Open · 100% Free Study Abroad Counselling & Scholarship Assistance';
      case 'visa':
        return '✈️ Express Consular Fast-Track · 99.4% Verified Document Stack';
      case 'umrah':
        return '🕋 Customized Umrah Packages · Premium Hotel Stays & Guided Logistics';
      case 'attestation':
        return '📜 MEA & Embassy Apostille · Insured Door-to-Door Courier Across India';
      case 'manpower':
        return '💼 100% Verified Employer Demands in Gulf & Europe · Zero Hidden Charges';
      default:
        return '🌟 Opus Overseas · Premier Operating System for Global Mobility';
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
        className={`fixed bottom-4 left-1/2 z-40 w-[calc(100%-1.5rem)] max-w-5xl -translate-x-1/2 transition-all duration-400 ${
          visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-16 opacity-0'
        }`}
      >
        <div className="glass-pill flex flex-wrap items-center justify-between gap-2.5 rounded-full px-3.5 sm:px-4 py-2 sm:py-2.5 shadow-2xl border border-white/20">
          {/* Left Value Proposition Hook */}
          <div className="flex items-center gap-2.5 pl-1.5 min-w-0 flex-1">
            <span className="hidden sm:inline-flex h-2 w-2 rounded-full bg-brand-gold animate-pulse shrink-0" />
            <p className="truncate text-xs font-semibold text-white/90">
              {getHook()}
            </p>
          </div>

          {/* Right Action Cluster */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* 1-Click Interactive Assessment Button */}
            <button
              onClick={() => setModalOpen(true)}
              className="tactile-btn cursor-pointer inline-flex items-center gap-1.5 rounded-full bg-brand-gold px-3.5 sm:px-4 py-2 text-xs font-bold uppercase tracking-wider text-brand-navy transition hover:bg-brand-gold-hover hover:text-white active:scale-[0.98] shadow-sm"
            >
              <span>⚡ Free Eligibility Check</span>
            </button>

            {/* Direct 1-on-1 Cal.com Booking */}
            <a
              href={getBookingUrlForDivision(activeDivision)}
              target="_blank"
              rel="noopener noreferrer"
              className="tactile-btn hidden md:inline-flex items-center gap-1 rounded-full border border-white/25 bg-white/10 px-3.5 py-2 text-xs font-bold uppercase tracking-wider text-white transition hover:border-brand-gold hover:text-brand-gold hover:bg-white/15 cursor-pointer"
            >
              <span>📅 Book 1-on-1</span>
              <span className="text-[10px] text-brand-gold">↗</span>
            </a>

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
      </aside>

      {/* Global Interactive Funnel Modal */}
      <InteractiveFunnelModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
        initialDivision={activeDivision}
      />
    </>
  );
}
