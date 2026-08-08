import { useState } from 'react';
import { useLocation } from 'wouter';
import Logo from './Logo';
import { useSession } from '../lib/session';

const LINKS = [
  { label: 'Study Abroad', path: '/study-abroad' },
  { label: 'Visa', path: '/visa-services' },
  { label: 'Umrah & Travel', path: '/umrah-travel' },
  { label: 'Attestation', path: '/attestation' },
  { label: 'Careers', path: '/recruitment' },
];

export default function Nav() {
  const [open, setOpen] = useState(false);
  const [, setLocation] = useLocation();
  const { me } = useSession();

  const go = (path: string) => {
    setOpen(false);
    setLocation(path);
  };

  return (
    <>
      {/* Desktop + mobile pill: floating glass island */}
      <header className="fixed left-1/2 top-4 z-50 w-[calc(100%-1.5rem)] max-w-5xl -translate-x-1/2">
        <nav className="glass-pill flex items-center gap-1 rounded-full px-3 py-2">
          <button onClick={() => go('/')} className="flex cursor-pointer items-center gap-2 pl-2 pr-3 py-1" aria-label="Opus Overseas home">
            <Logo className="h-7 w-auto" />
            <span className="font-display text-sm font-bold tracking-wide text-white">
              OPUS <span className="text-brand-gold">OVERSEAS</span>
            </span>
          </button>

          <div className="ml-2 hidden md:flex items-center gap-1">
            {LINKS.map((l) => (
              <button
                key={l.path}
                onClick={() => go(l.path)}
                className="cursor-pointer rounded-full px-3.5 py-2 text-xs font-semibold tracking-wide text-white/80 transition-all hover:bg-white/5 hover:text-brand-gold"
              >
                {l.label}
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center">
            {me ? (
              <button
                onClick={() => go('/workspaces')}
                className="mr-1 hidden cursor-pointer items-center gap-2 rounded-full border border-brand-gold/40 bg-brand-gold/10 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-brand-gold transition-all hover:bg-brand-gold hover:text-brand-navy md:inline-flex"
              >
                {me.name?.split(' ')[0]} · {me.role}
              </button>
            ) : (
              <button
                onClick={() => go('/login')}
                className="mr-1 hidden cursor-pointer items-center gap-2 rounded-full bg-brand-gold px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-brand-navy transition-all hover:bg-brand-gold-hover hover:text-white active:scale-[0.98] md:inline-flex"
              >
                Sign In
                <span className="flex h-6 w-6 items-center justify-center rounded-full bg-brand-navy/10 text-[10px]">↗</span>
              </button>
            )}

            {/* Hamburger morph */}
            <button
              onClick={() => setOpen((v) => !v)}
              aria-label="Toggle menu"
              aria-expanded={open}
              className="relative flex h-11 w-11 cursor-pointer items-center justify-center rounded-full bg-white/5 md:hidden"
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
        <div className="fixed inset-0 z-40 md:hidden" onClick={() => setOpen(false)}>
          <div className="absolute inset-0 bg-brand-navy/85 backdrop-blur-2xl" />
          <nav className="relative flex h-full flex-col items-center justify-center gap-2.5 px-6">
            {[{ label: 'Home', path: '/' }, ...LINKS].map((l, i) => (
              <button
                key={l.path}
                onClick={() => go(l.path)}
                style={{ transitionDelay: `${i * 60}ms` }}
                className="w-full max-w-sm cursor-pointer rounded-2xl border border-white/10 bg-white/5 py-4 text-center font-display text-lg font-semibold text-white/90 opacity-0 transition-all duration-500 [animation:link-reveal_0.55s_cubic-bezier(0.32,0.72,0,1)_forwards]"
              >
                {l.label}
              </button>
            ))}
            <button
              onClick={() => (me ? go('/workspaces') : go('/login'))}
              style={{ transitionDelay: `${(LINKS.length + 1) * 60}ms` }}
              className="mt-4 w-full max-w-sm cursor-pointer rounded-full bg-brand-gold py-4 text-sm font-bold uppercase tracking-wider text-brand-navy transition-all active:scale-[0.98]"
            >
              {me ? `${me.name?.split(' ')[0]} · My Workspace` : 'Sign In'}
            </button>
          </nav>
        </div>
      )}
    </>
  );
}