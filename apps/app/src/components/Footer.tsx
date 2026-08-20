import { useLocation } from 'wouter';
import Logo from './Logo';
import { CAL_BOOKING_URL } from '../config/booking';

export default function Footer() {
  const [, setLocation] = useLocation();

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const triggerOmnibar = () => {
    window.dispatchEvent(new CustomEvent('open-command-palette'));
  };

  return (
    <footer className="relative overflow-hidden bg-[#061e38] text-white border-t border-white/10">
      <div className="hero-orb -left-20 -top-24 h-72 w-72 bg-brand-gold/10 blur-3xl opacity-60" aria-hidden="true" />
      <div className="mx-auto max-w-7xl px-5 sm:px-6 py-16 sm:py-20">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-5">
          {/* Brand Col */}
          <div className="space-y-4 lg:col-span-2">
            <div className="flex items-center gap-2.5">
              <Logo className="h-9 w-auto" />
              <span className="font-display text-lg font-bold tracking-tight text-white">
                OPUS <span className="text-brand-gold font-extrabold">OVERSEAS</span>
              </span>
            </div>
            <p className="max-w-sm text-xs sm:text-sm leading-relaxed text-white/65">
              Your premier operating system for global mobility — study abroad, express visas, Umrah group travel, government attestation chains, and international careers.
            </p>
            <div className="pt-2 flex items-center gap-3">
              <button
                onClick={triggerOmnibar}
                className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs text-white/70 hover:text-white hover:bg-white/10 transition-all cursor-pointer"
              >
                <span className="text-[11px]">Quick Jump</span>
                <kbd className="rounded border border-white/20 bg-white/10 px-1.5 py-0.5 text-[10px] font-mono text-brand-gold">⌘K</kbd>
              </button>
            </div>
          </div>

          {/* Divisions */}
          <div>
            <h4 className="mb-4 text-xs font-bold uppercase tracking-[0.18em] text-brand-gold">Divisions</h4>
            <ul className="space-y-2.5 text-xs sm:text-sm text-white/70">
              {[
                ['Study Abroad', '/study-abroad'],
                ['Global Visa Services', '/visa-services'],
                ['Umrah & Spiritual Travel', '/umrah-travel'],
                ['Document Attestation', '/attestation'],
                ['Overseas Careers', '/recruitment'],
              ].map(([label, path]) => (
                <li key={path}>
                  <button onClick={() => setLocation(path)} className="cursor-pointer transition-colors hover:text-brand-gold text-left">
                    {label}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Quick Access */}
          <div>
            <h4 className="mb-4 text-xs font-bold uppercase tracking-[0.18em] text-brand-gold">Quick Access</h4>
            <ul className="space-y-2.5 text-xs sm:text-sm text-white/70">
              <li>
                <button onClick={() => setLocation('/about')} className="cursor-pointer transition-colors hover:text-brand-gold">
                  About Opus Overseas
                </button>
              </li>
              <li>
                <a
                  href={CAL_BOOKING_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 transition-colors hover:text-brand-gold text-white/85 font-medium"
                >
                  <span>📅 Book 1-on-1 Session</span>
                  <span className="text-[10px] text-brand-gold">↗</span>
                </a>
              </li>
              <li>
                <button onClick={() => setLocation('/lead-form')} className="cursor-pointer transition-colors hover:text-brand-gold">
                  Submit Inquiry
                </button>
              </li>
              <li className="pt-1">
                <button onClick={() => setLocation('/login')} className="cursor-pointer transition-colors hover:text-brand-gold font-bold text-white flex items-center gap-1">
                  <span>Sign In to Workspace</span>
                  <span className="text-brand-gold">→</span>
                </button>
              </li>
            </ul>
          </div>

          {/* Contact */}
          <div>
            <h4 className="mb-4 text-xs font-bold uppercase tracking-[0.18em] text-brand-gold">Contact & Support</h4>
            <ul className="space-y-2.5 text-xs sm:text-sm text-white/70">
              <li>
                <button onClick={() => setLocation('/contact')} className="cursor-pointer font-bold text-white hover:text-brand-gold transition-colors">
                  Contact Advisory Desk →
                </button>
              </li>
              <li>
                <a href="tel:+919876500001" className="hover:text-brand-gold transition-colors">+91 98765 00001</a>
              </li>
              <li>
                <a href="mailto:hello@opusoverseas.com" className="hover:text-brand-gold transition-colors">hello@opusoverseas.com</a>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Bar */}
        <div className="mt-14 flex flex-col items-center justify-between gap-4 border-t border-white/10 pt-6 text-xs text-white/45 sm:flex-row">
          <p>© {new Date().getFullYear()} Opus Overseas. All rights reserved.</p>
          <div className="flex flex-wrap items-center gap-4 sm:gap-6">
            <button onClick={() => setLocation('/privacy')} className="cursor-pointer hover:text-brand-gold transition-colors">Privacy Policy</button>
            <button onClick={() => setLocation('/terms')} className="cursor-pointer hover:text-brand-gold transition-colors">Terms of Service</button>
            <button onClick={() => setLocation('/refund-policy')} className="cursor-pointer hover:text-brand-gold transition-colors">Refund Policy</button>
            <button 
              onClick={scrollToTop} 
              className="flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 hover:bg-white/15 px-3 py-1 text-[11px] text-white/80 transition-all cursor-pointer"
            >
              Back to Top ↑
            </button>
          </div>
        </div>
      </div>
    </footer>
  );
}
