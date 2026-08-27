import { useEffect, useMemo, useState, useRef } from 'react';
import { useLocation } from 'wouter';
import { useSession } from '../lib/session';
import { allowedNavFor } from './WorkspaceShell';

// Linear / Raycast style Command Palette — accessible across public & authenticated surfaces.
const PUBLIC_COMMANDS = [
  { key: 'home', label: 'Home — Overview & Live Artifacts', to: '/', section: 'Navigation', icon: 'M3 12l9-9 9 9M5 10v10h5v-6h4v6h5V10' },
  { key: 'study-abroad', label: 'Study Abroad Consulting (50+ Countries)', to: '/study-abroad', section: 'Divisions', icon: 'M12 14l9-5-9-5-9 5 9 5zm0 7l-9-5 9-5 9 5-9 5z' },
  { key: 'visa-services', label: 'Global Visa Services & Express Stamping', to: '/visa-services', section: 'Divisions', icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z' },
  { key: 'tours-travels', label: 'Tours & Travels (Holidays & Umrah)', to: '/tours-travels', section: 'Divisions', icon: 'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z' },
  { key: 'attestation', label: 'Document Attestation & MEA Apostille', to: '/attestation', section: 'Divisions', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
  { key: 'recruitment', label: 'Overseas Manpower & Global Careers', to: '/recruitment', section: 'Divisions', icon: 'M21 13.255A23.931 23.931 0 0112 15c-3.183 0-6.22-.62-9-1.745M16 6V4a2 2 0 00-2-2h-4a2 2 0 00-2 2v2m4 6h.01M5 20h14a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
  { key: 'about', label: 'About Us — Institutional Profile & MEA Authorizations', to: '/about', section: 'Navigation', icon: 'M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4' },
  { key: 'contact', label: 'Contact Us — Advisory & Support Desk', to: '/contact', section: 'Navigation', icon: 'M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z' },
  { key: 'privacy', label: 'Privacy Policy & DPDP Data Protection', to: '/privacy', section: 'Legal', icon: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z' },
  { key: 'terms', label: 'Terms of Service & Client Engagement Agreement', to: '/terms', section: 'Legal', icon: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z' },
  { key: 'refund-policy', label: 'Refund & Cancellation Policy (RBI Norms)', to: '/refund-policy', section: 'Legal', icon: 'M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 003-3V8a3 3 0 00-3-3H6a3 3 0 00-3 3v8a3 3 0 003 3z' },
  { key: 'lead-form', label: 'Book Free Consultation / Check Eligibility', to: '/lead-form', section: 'Actions', icon: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z' },
  { key: 'portal', label: 'Client Tracking Portal (Passcode Access)', to: '/portal', section: 'Self-Service', icon: 'M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z' },
  { key: 'partner', label: 'Partner & Referral Network Dashboard', to: '/partner', section: 'Self-Service', icon: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0' },
  { key: 'login', label: 'Sign In to Workspace (Client, Partner, Staff)', to: '/login', section: 'Account', icon: 'M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1' },
];

export default function CommandPalette({ open, onClose }: { open?: boolean; onClose?: () => void }) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isControlled = typeof open === 'boolean';
  const isOpen = isControlled ? open : internalOpen;

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [, setLocation] = useLocation();
  const { me } = useSession();
  const listRef = useRef<HTMLDivElement>(null);

  const handleClose = () => {
    if (onClose) onClose();
    setInternalOpen(false);
    setQuery('');
    setSelectedIndex(0);
  };

  // Global Cmd+K / Ctrl+K listener and custom event listener
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setInternalOpen((prev) => !prev);
      }
    };
    const onCustomOpen = () => setInternalOpen(true);

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('open-command-palette', onCustomOpen);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('open-command-palette', onCustomOpen);
    };
  }, []);

  const sections = useMemo(() => allowedNavFor(me), [me]);
  
  const allItems = useMemo(() => {
    if (me) {
      const workspaceItems = sections.flatMap((s) => s.items.map((i) => ({ ...i, section: s.title })));
      // Merge with public items for full omnisearch
      return [...workspaceItems, ...PUBLIC_COMMANDS];
    }
    return PUBLIC_COMMANDS;
  }, [sections, me]);

  const filteredItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return allItems;
    return allItems.filter((i) => (i.label + ' ' + i.section + ' ' + i.to).toLowerCase().includes(q));
  }, [allItems, query]);

  // Keep selected index in bound
  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  // Keyboard navigation inside the palette
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((prev) => (filteredItems.length ? (prev + 1) % filteredItems.length : 0));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((prev) => (filteredItems.length ? (prev - 1 + filteredItems.length) % filteredItems.length : 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filteredItems[selectedIndex]) {
          go(filteredItems[selectedIndex].to);
        }
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [isOpen, filteredItems, selectedIndex]);

  // Auto-scroll to selected item
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector(`[data-index="${selectedIndex}"]`) as HTMLElement | null;
    if (el) {
      el.scrollIntoView({ block: 'nearest' });
    }
  }, [selectedIndex]);

  if (!isOpen) return null;

  const go = (to: string) => {
    setLocation(to);
    handleClose();
  };

  return (
    <div 
      className="fixed inset-0 z-[100] flex items-start justify-center bg-[#061e38]/70 px-4 pt-[14vh] backdrop-blur-md transition-all animate-[fadeIn_0.15s_ease-out]" 
      onMouseDown={handleClose}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-white/15 bg-[#0a2d50] shadow-[0_25px_60px_rgba(0,0,0,0.55)] transition-all animate-[scaleUp_0.2s_cubic-bezier(0.16,1,0.3,1)]"
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Search Input Bar */}
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3.5 bg-white/5">
          <svg className="h-5 w-5 shrink-0 text-brand-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.2-5.2m2.2-5.3a7.5 7.5 0 11-15 0 7.5 7.5 0 0115 0z" />
          </svg>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type a command or jump to any division, module, or service…"
            className="w-full bg-transparent text-[14px] text-white placeholder:text-white/40 focus:outline-none"
          />
          <span className="rounded-md border border-white/20 bg-white/10 px-1.5 py-0.5 text-[13px] font-mono text-white/60">
            ESC
          </span>
        </div>

        {/* Results List */}
        <div ref={listRef} className="max-h-[48vh] overflow-y-auto p-2 divide-y divide-white/5">
          {filteredItems.length === 0 ? (
            <div className="px-4 py-10 text-center text-xs text-white/50">
              No matching pages or modules found for <span className="text-brand-gold font-medium">"{query}"</span>
            </div>
          ) : (
            filteredItems.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <button
                  key={`${item.section}-${item.key}-${idx}`}
                  data-index={idx}
                  onClick={() => go(item.to)}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex w-full cursor-pointer items-center gap-3 rounded-xl px-3.5 py-3 text-left transition-all ${
                    isSelected 
                      ? 'bg-brand-gold text-brand-navy font-semibold shadow-sm scale-[1.01]' 
                      : 'text-white/85 hover:bg-white/5'
                  }`}
                >
                  <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${isSelected ? 'bg-brand-navy/15 text-brand-navy' : 'bg-white/10 text-brand-gold'}`}>
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                      <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                    </svg>
                  </div>
                  <span className="flex-1 truncate text-xs sm:text-[13px]">{item.label}</span>
                  <span className={`text-[13px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full ${isSelected ? 'bg-brand-navy/20 text-brand-navy' : 'bg-white/10 text-white/50'}`}>
                    {item.section}
                  </span>
                  {isSelected && (
                    <span className="text-sm font-mono text-brand-navy/70">↵</span>
                  )}
                </button>
              );
            })
          )}
        </div>

        {/* Footer shortcuts */}
        <div className="flex items-center justify-between border-t border-white/10 bg-black/20 px-4 py-2 text-sm text-white/40">
          <div className="flex items-center gap-3">
            <span><kbd className="font-mono text-white/60">↑↓</kbd> to navigate</span>
            <span><kbd className="font-mono text-white/60">↵</kbd> to open</span>
          </div>
          <div>
            <span><kbd className="font-mono text-white/60">esc</kbd> to dismiss</span>
          </div>
        </div>
      </div>
    </div>
  );
}
