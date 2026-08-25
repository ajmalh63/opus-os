import { useState, useEffect, useMemo } from 'react';

export interface CommandItem {
  id: string;
  category: 'Actions' | 'Divisions' | 'Support' | 'Financials';
  title: string;
  subtitle?: string;
  icon: string;
  shortcut?: string;
  onSelect: () => void;
}

export interface ClientCommandPaletteProps {
  open: boolean;
  onClose: () => void;
  onNavigateTab: (tab: 'study' | 'visa' | 'umrah' | 'attestation' | 'jobs' | 'vault' | 'payments') => void;
  onOpenUpload: (label?: string) => void;
  onOpenFeedback: () => void;
  counselorName?: string;
}

export default function ClientCommandPalette({
  open,
  onClose,
  onNavigateTab,
  onOpenUpload,
  onOpenFeedback,
  counselorName,
}: ClientCommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Global Cmd+K / Ctrl+K listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        if (open) onClose();
        else {
          setQuery('');
          setSelectedIndex(0);
        }
      } else if (e.key === 'Escape' && open) {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [open, onClose]);

  const commands: CommandItem[] = useMemo(
    () => [
      {
        id: 'upload-doc',
        category: 'Actions',
        title: 'Upload Document',
        subtitle: 'Passport, Bank Certificate, Academic Transcripts',
        icon: '📄',
        shortcut: 'U',
        onSelect: () => {
          onClose();
          onOpenUpload('Passport Scan');
        },
      },
      {
        id: 'pay-balance',
        category: 'Financials',
        title: 'Pay Balance & View Invoices',
        subtitle: 'Milestone settlements with GST tax receipts',
        icon: '💳',
        shortcut: 'P',
        onSelect: () => {
          onClose();
          onNavigateTab('payments');
        },
      },
      {
        id: 'rate-counselor',
        category: 'Support',
        title: 'Leave Feedback & 5-Star Review',
        subtitle: `Rate your experience ${counselorName ? `with ${counselorName}` : ''}`,
        icon: '⭐',
        shortcut: 'R',
        onSelect: () => {
          onClose();
          onOpenFeedback();
        },
      },
      {
        id: 'nav-study',
        category: 'Divisions',
        title: 'Study Abroad Applications',
        subtitle: 'University applications, offer letters, & IELTS scores',
        icon: '🎓',
        onSelect: () => {
          onClose();
          onNavigateTab('study');
        },
      },
      {
        id: 'nav-visa',
        category: 'Divisions',
        title: 'Visa Stamping & Consular Prep',
        subtitle: 'VFS biometrics, checklist verification, & deadlines',
        icon: '🛂',
        onSelect: () => {
          onClose();
          onNavigateTab('visa');
        },
      },
      {
        id: 'nav-umrah',
        category: 'Divisions',
        title: 'Umrah Packages & Departures',
        subtitle: 'Group departure manifests, visas, & flight itinerary',
        icon: '🕋',
        onSelect: () => {
          onClose();
          onNavigateTab('umrah');
        },
      },
      {
        id: 'nav-attest',
        category: 'Divisions',
        title: 'Certificate Attestation',
        subtitle: 'HRD, MEA, Apostille & Embassy authentication tracking',
        icon: '📜',
        onSelect: () => {
          onClose();
          onNavigateTab('attestation');
        },
      },
      {
        id: 'nav-vault',
        category: 'Actions',
        title: 'Open Document Vault',
        subtitle: 'All uploaded & verified identity documents',
        icon: '🗄️',
        shortcut: 'V',
        onSelect: () => {
          onClose();
          onNavigateTab('vault');
        },
      },
    ],
    [onClose, onNavigateTab, onOpenUpload, onOpenFeedback, counselorName]
  );

  const filtered = useMemo(() => {
    if (!query.trim()) return commands;
    const q = query.toLowerCase();
    return commands.filter(
      (c) =>
        c.title.toLowerCase().includes(q) ||
        (c.subtitle && c.subtitle.toLowerCase().includes(q)) ||
        c.category.toLowerCase().includes(q)
    );
  }, [commands, query]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [filtered]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev + 1) % Math.max(1, filtered.length));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIndex((prev) => (prev - 1 + filtered.length) % Math.max(1, filtered.length));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const current = filtered[selectedIndex];
      if (current) current.onSelect();
    }
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-start justify-center p-4 pt-16 sm:pt-24"
    >
      <div
        className="absolute inset-0 bg-brand-navy/60 backdrop-blur-md transition-opacity"
        onClick={onClose}
        aria-hidden
      />

      <div
        onKeyDown={handleKeyDown}
        className="relative w-full max-w-xl bg-white rounded-3xl border border-brand-navy/15 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150"
      >
        {/* Search Bar Input */}
        <div className="flex items-center gap-3 px-5 py-4 border-b border-brand-navy/10 bg-[#FAF8F4]">
          <span className="text-lg">🔍</span>
          <input
            autoFocus
            type="text"
            placeholder="Type a command or search workspace..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="w-full bg-transparent text-sm font-semibold text-brand-navy placeholder:text-brand-navy/40 outline-none"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              className="text-xs text-slate-400 hover:text-slate-600 px-1 cursor-pointer"
            >
              Clear
            </button>
          )}
          <kbd className="hidden sm:inline-block px-2 py-0.5 rounded-md bg-white border border-slate-200 text-[10px] font-mono font-bold text-slate-500 shadow-2xs">
            ESC
          </kbd>
        </div>

        {/* Command Items List */}
        <div className="max-h-80 overflow-y-auto p-2 divide-y divide-brand-navy/5 scrollbar-thin">
          {filtered.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500 space-y-1">
              <p className="font-bold text-brand-navy">No matching commands found.</p>
              <p className="text-[11px] text-slate-400">Try searching for "upload", "visa", "pay", or "counselor".</p>
            </div>
          ) : (
            filtered.map((item, idx) => {
              const isSelected = idx === selectedIndex;
              return (
                <div
                  key={item.id}
                  onClick={item.onSelect}
                  onMouseEnter={() => setSelectedIndex(idx)}
                  className={`flex items-center justify-between px-4 py-3 rounded-2xl cursor-pointer transition-all duration-150 ${
                    isSelected
                      ? 'bg-brand-navy text-white shadow-xs'
                      : 'hover:bg-slate-50 text-brand-navy'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="text-xl shrink-0">{item.icon}</span>
                    <div className="min-w-0">
                      <div className={`text-xs font-bold truncate ${isSelected ? 'text-white' : 'text-brand-navy'}`}>
                        {item.title}
                      </div>
                      {item.subtitle && (
                        <div className={`text-[10px] truncate ${isSelected ? 'text-white/70' : 'text-slate-500'}`}>
                          {item.subtitle}
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0 pl-2">
                    <span className={`text-[9px] font-bold uppercase px-2 py-0.5 rounded-md ${
                      isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {item.category}
                    </span>
                    {item.shortcut && (
                      <kbd className={`hidden sm:inline-block px-1.5 py-0.5 rounded font-mono text-[9px] font-bold ${
                        isSelected ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600 border border-slate-200'
                      }`}>
                        {item.shortcut}
                      </kbd>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer Shortcut Navigation Hints */}
        <div className="flex items-center justify-between px-5 py-2.5 bg-[#FAF8F4] border-t border-brand-navy/10 text-[10px] text-slate-500 font-medium">
          <div className="flex items-center gap-3">
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-white border border-slate-200 font-mono text-[9px]">↑</kbd>{' '}
              <kbd className="px-1.5 py-0.5 rounded bg-white border border-slate-200 font-mono text-[9px]">↓</kbd> Navigate
            </span>
            <span>
              <kbd className="px-1.5 py-0.5 rounded bg-white border border-slate-200 font-mono text-[9px]">↵</kbd> Select
            </span>
          </div>
          <span className="font-mono text-[10px] text-brand-gold font-bold">OpusOS Command Palette</span>
        </div>
      </div>
    </div>
  );
}
