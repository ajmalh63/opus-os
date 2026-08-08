import { useLocation } from 'wouter';
import Logo from './Logo';

export default function Footer() {
  const [, setLocation] = useLocation();

  return (
    <footer className="relative overflow-hidden bg-brand-navy text-white">
      <div className="hero-orb -left-20 -top-24 h-72 w-72 bg-brand-gold/10 blur-3xl" aria-hidden="true" />
      <div className="mx-auto max-w-6xl px-5 py-16 md:py-20">
        <div className="grid gap-10 md:grid-cols-3">
          <div className="space-y-4">
            <div className="flex items-center gap-2">
              <Logo className="h-8 w-auto" />
              <span className="font-display font-bold tracking-wide">OPUS <span className="text-brand-gold">OVERSEAS</span></span>
            </div>
            <p className="max-w-xs text-sm leading-relaxed text-white/60">
              Your trusted global services engine — study abroad, visas, Umrah travel, attestation and global careers, handled end-to-end.
            </p>
          </div>

          <div>
            <h4 className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-gold">Explore</h4>
            <ul className="space-y-2.5 text-sm text-white/70">
              {[
                ['Study Abroad', '/study-abroad'],
                ['Visa Services', '/visa-services'],
                ['Umrah & Travel', '/umrah-travel'],
                ['Attestation', '/attestation'],
                ['Global Careers', '/recruitment'],
              ].map(([label, path]) => (
                <li key={path}>
                  <button onClick={() => setLocation(path)} className="cursor-pointer transition-colors hover:text-brand-gold">
                    {label}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <h4 className="mb-4 text-xs font-bold uppercase tracking-[0.2em] text-brand-gold">Contact</h4>
            <ul className="space-y-2.5 text-sm text-white/70">
              <li>Nizamabad, Telangana, India</li>
              <li>
                <a href="tel:+919876500001" className="hover:text-brand-gold">+91 98765 00001</a>
              </li>
              <li>
                <a href="mailto:hello@opusoverseas.com" className="hover:text-brand-gold">hello@opusoverseas.com</a>
              </li>
              <li className="pt-2">
                <a
                  href="https://wa.me/919876543210?text=Hi%20Opus%20Overseas!"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 rounded-full bg-emerald-500/15 px-4 py-2 text-xs font-bold text-emerald-300 hover:bg-emerald-500 hover:text-white transition-all"
                >
                  Chat on WhatsApp
                </a>
              </li>
            </ul>
          </div>
        </div>

        <div className="mt-14 flex flex-col items-center justify-between gap-3 border-t border-white/10 pt-6 text-xs text-white/40 md:flex-row">
          <p>© {new Date().getFullYear()} Opus Overseas. All rights reserved.</p>
          <p className="flex gap-5">
            <button className="cursor-pointer hover:text-brand-gold">Privacy</button>
            <button className="cursor-pointer hover:text-brand-gold">Terms</button>
            <button className="cursor-pointer hover:text-brand-gold">Refund Policy</button>
          </p>
        </div>
      </div>
    </footer>
  );
}