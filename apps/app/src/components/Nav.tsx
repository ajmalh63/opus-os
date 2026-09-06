import { useState } from 'react';
import { useLocation } from 'wouter';
import Logo from './Logo';
import { useSession } from '../lib/session';

const LINKS = [
  { label: 'Study Abroad', path: '/study-abroad' },
  { label: 'Visa', path: '/visa-services' },
  { label: 'Tours & Travels', path: '/tours-travels' },
  { label: 'Attestation', path: '/attestation' },
  { label: 'Manpower', path: '/manpower' },
  { label: 'Contact', path: '/contact' },
];

export default function Nav() {
  const [open, setOpen] = useState(false);
  const [location, setLocation] = useLocation();
  const { me } = useSession();

  const go = (path: string) => {
    setOpen(false);
    setLocation(path);
  };

  return (
    <>
      {/* Desktop + mobile pill: floating glass island */}
      <header className="fixed left-1/2 top-4 z-50 w-[calc(100%-1.5rem)] max-w-6xl -translate-x-1/2">
        <nav className="glass-pill flex items-center gap-1 rounded-full px-3 py-2.5 shadow-lg">
          <button onClick={() => go('/')} className="flex cursor-pointer items-center gap-2 pl-2 pr-3 py-1" aria-label="Opus Overseas home">
            <Logo className="h-8.5 w-auto" />
            <span className="font-display text-base sm:text-lg font-bold tracking-wide text-white">
              OPUS <span className="text-brand-gold">OVERSEAS</span>
            </span>
          </button>

          {/* Desktop Navigation Links */}
          <div className="ml-2 hidden lg:flex items-center gap-0.5">
            {LINKS.map((l) => {
              const isActive = location === l.path;
              return (
                <button
                  key={l.path}
                  onClick={() => go(l.path)}
                  className={`cursor-pointer rounded-full px-3.5 py-2 text-[13px] font-semibold tracking-tight transition-all duration-200 ${
                    isActive 
                      ? 'bg-white/15 text-brand-gold font-bold shadow-2xs' 
                      : 'text-white/80 hover:bg-white/10 hover:text-white'
                  }`}
                >
                  {l.label}
                </button>
              );
            })}
          </div>

          {/* Right Action Group */}
          <div className="ml-auto flex items-center gap-2">
            {/* Search Bar / Command Palette Trigger (Ctrl+K) */}
            <button
              type="button"
              onClick={() => window.dispatchEvent(new CustomEvent('open-command-palette'))}
              aria-label="Search site (Ctrl+K)"
              className="flex cursor-pointer items-center gap-2 rounded-full border border-white/20 bg-white/10 px-3 sm:px-3.5 py-1.5 text-xs text-white/80 transition-all hover:border-brand-gold/60 hover:bg-white/15 hover:text-white shadow-2xs"
            >
              <svg className="h-3.5 w-3.5 text-brand-gold shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.2-5.2m2.2-5.3a7.5 7.5 0 11-15 0 7.5 7.5 0 0115 0z" />
              </svg>
              <span className="hidden sm:inline font-medium text-white/70">Search...</span>
              <kbd className="hidden sm:inline-flex items-center gap-0.5 rounded border border-white/20 bg-white/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-white/90">
                {typeof navigator !== 'undefined' && /Mac|iPhone|iPod|iPad/i.test(navigator.platform || '') ? '⌘K' : 'Ctrl+K'}
              </kbd>
            </button>

            {/* Quick Contact Button for Medium Screens */}
            <button
              onClick={() => go('/contact')}
              className={`hidden md:inline-flex lg:hidden cursor-pointer items-center gap-1.5 rounded-full border px-3.5 py-2 text-xs font-bold uppercase tracking-wider transition-all ${
                location === '/contact'
                  ? 'border-brand-gold bg-brand-gold/20 text-brand-gold'
                  : 'border-white/20 bg-white/5 text-white/85 hover:border-brand-gold hover:text-brand-gold'
              }`}
            >
              Contact Us
            </button>

            {me ? (
              <button
                onClick={() => go('/workspaces')}
                className="mr-1 hidden cursor-pointer items-center gap-2 rounded-full border border-brand-gold/40 bg-brand-gold/10 px-4 sm:px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-brand-gold transition-all hover:bg-brand-gold hover:text-brand-navy md:inline-flex tactile-btn"
              >
                <span className="h-1.5 w-1.5 rounded-full bg-brand-gold animate-pulse" />
                {me.name?.split(' ')[0]} · {me.role}
              </button>
            ) : (
              <button
                onClick={() => go('/login')}
                className="mr-1 hidden cursor-pointer items-center gap-1.5 rounded-full bg-brand-gold px-5 sm:px-6 py-2.5 text-xs font-bold uppercase tracking-wider text-brand-navy transition-all hover:bg-brand-gold-hover hover:text-white active:scale-[0.98] sm:inline-flex tactile-btn shadow-xs"
              >
                Sign In
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-brand-navy/15 text-[13px] font-extrabold">↗</span>
              </button>
            )}

            {/* Hamburger morph button */}
            <button
              onClick={() => setOpen((v) => !v)}
              aria-label="Toggle menu"
              aria-expanded={open}
              className="relative flex h-10 w-10 cursor-pointer items-center justify-center rounded-full bg-white/10 hover:bg-white/15 transition-colors lg:hidden"
            >
              <span className={`absolute h-[2px] w-5 rounded-full bg-white transition-all duration-300 ${open ? 'rotate-45' : '-translate-y-[5px]'}`} />
              <span className={`absolute h-[2px] w-5 rounded-full bg-white transition-all duration-300 ${open ? 'opacity-0' : ''}`} />
              <span className={`absolute h-[2px] w-5 rounded-full bg-white transition-all duration-300 ${open ? '-rotate-45' : 'translate-y-[5px]'}`} />
            </button>
          </div>
        </nav>
      </header>

      {/* Mobile full-screen glass overlay with staggered link reveal */}
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-[#061e38]/90 backdrop-blur-2xl transition-opacity animate-[fadeIn_0.2s_ease-out]" />
          <nav className="relative flex h-full flex-col items-center justify-center gap-2.5 px-6 py-20" onClick={(e) => e.stopPropagation()}>
            {/* Mobile Search Button */}
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                window.dispatchEvent(new CustomEvent('open-command-palette'));
              }}
              className="w-full max-w-sm flex items-center justify-between gap-2 px-4 py-3 rounded-2xl border border-white/20 bg-white/10 text-white/90 text-sm font-medium hover:border-brand-gold/50 cursor-pointer mb-2"
            >
              <span className="flex items-center gap-2.5">
                <svg className="h-4 w-4 text-brand-gold shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.2-5.2m2.2-5.3a7.5 7.5 0 11-15 0 7.5 7.5 0 0115 0z" />
                </svg>
                <span>Search services, visas, FAQs...</span>
              </span>
              <kbd className="rounded border border-white/20 bg-white/10 px-1.5 py-0.5 font-mono text-[11px] font-bold text-brand-gold">
                {typeof navigator !== 'undefined' && /Mac|iPhone|iPod|iPad/i.test(navigator.platform || '') ? '⌘K' : 'Ctrl+K'}
              </kbd>
            </button>
            {[{ label: 'Home', path: '/' }, ...LINKS].map((l, i) => {
              const isActive = location === l.path;
              return (
                <button
                  key={l.path}
                  onClick={() => go(l.path)}
                  style={{ transitionDelay: `${i * 45}ms` }}
                  className={`w-full max-w-sm cursor-pointer rounded-2xl border py-3.5 text-center font-display text-base font-semibold transition-all ${
                    isActive 
                      ? 'border-brand-gold bg-brand-gold text-brand-navy shadow-md font-bold' 
                      : 'border-white/10 bg-white/5 text-white/90 hover:bg-white/10'
                  }`}
                >
                  {l.label}
                </button>
              );
            })}
            
            <button
              onClick={() => (me ? go('/workspaces') : go('/login'))}
              className="mt-3 w-full max-w-sm cursor-pointer rounded-full bg-brand-gold py-3.5 text-sm font-bold uppercase tracking-wider text-brand-navy transition-all shadow-lg tactile-btn"
            >
              {me ? `${me.name?.split(' ')[0]} · My Workspace` : 'Sign In to Workspace →'}
            </button>
          </nav>
        </div>
      )}
    </>
  );
}
