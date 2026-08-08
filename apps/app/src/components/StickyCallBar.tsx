import { useEffect, useState } from 'react';
import { useLocation } from 'wouter';

// Mobile-first thumb-zone CTA bar (Section 24 design plan): appears on scroll up,
// hides while scrolling down, always within thumb reach. Desktop: hidden.
export default function StickyCallBar() {
  const [, setLocation] = useLocation();
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    let lastY = window.scrollY;
    const onScroll = () => {
      const y = window.scrollY;
      const scrollingUp = y < lastY;
      const threshold = y > 480;
      setVisible(scrollingUp && threshold);
      lastY = y;
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  return (
    <div
      className={`fixed inset-x-0 bottom-4 z-50 flex justify-center px-4 transition-all duration-500 md:hidden ${
        visible ? 'translate-y-0 opacity-100' : 'pointer-events-none translate-y-16 opacity-0'
      }`}
    >
      <div className="glass-pill flex w-full max-w-sm items-center gap-2 rounded-full p-2 pl-5" role="group" aria-label="Quick actions">
        <a
          href="https://wa.me/919876543210?text=Hi%20Opus%20Overseas!"
          target="_blank"
          rel="noopener noreferrer"
          className="text-xs font-medium text-white/70 transition-colors hover:text-emerald-300"
        >
          WhatsApp
        </a>
        <div className="h-5 w-px bg-white/15" />
        <a href="tel:+919876500001" className="text-xs font-medium text-white/70 transition-colors hover:text-brand-gold">
          Call
        </a>
        <button
          onClick={() => setLocation('/lead-form')}
          className="ml-auto flex items-center gap-1.5 rounded-full bg-brand-gold px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-brand-navy transition-all active:scale-[0.97]"
        >
          Get Started
          <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-navy/10 text-[9px]">↗</span>
        </button>
      </div>
    </div>
  );
}