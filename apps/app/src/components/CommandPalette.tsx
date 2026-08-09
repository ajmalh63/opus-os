import { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'wouter';
import { useSession } from '../lib/session';
import { allowedNavFor } from './WorkspaceShell';

// Cmd/Ctrl+K command palette — SaaS power-user standard (Linear/Notion).
// Globally scoped module jump within the ONE workspace umbrella.

export default function CommandPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState('');
  const [, setLocation] = useLocation();
  const { me } = useSession();

  const sections = useMemo(() => allowedNavFor(me), [me]);
  const items = useMemo(() => {
    const flat = sections.flatMap((s) => s.items.map((i) => ({ ...i, section: s.title })));
    const q = query.trim().toLowerCase();
    if (!q) return flat;
    return flat.filter((i) => (i.label + ' ' + i.section).toLowerCase().includes(q));
  }, [sections, query]);

  useEffect(() => {
    if (!open) return;
    setQuery('');
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  const go = (to: string) => {
    setLocation(to);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-black/60 px-4 pt-[12vh] backdrop-blur-sm" onMouseDown={onClose}>
      <div
        className="w-full max-w-lg overflow-hidden rounded-2xl border border-white/10 bg-[#0d1529] shadow-2xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 border-b border-white/10 px-4 py-3">
          <svg className="h-4 w-4 shrink-0 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.2-5.2m2.2-5.3a7.5 7.5 0 11-15 0 7.5 7.5 0 0115 0z" />
          </svg>
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to any module…  (Esc to close)"
            className="w-full bg-transparent text-sm text-white placeholder:text-slate-500 focus:outline-none"
          />
        </div>

        <div className="max-h-[42vh] overflow-y-auto p-1.5">
          {items.length === 0 && (
            <div className="px-4 py-8 text-center text-xs text-slate-500">No matches — try “Kanban”, “Campaigns”, “Audit”.</div>
          )}
          {items.map((item) => (
            <button
              key={`${item.section}-${item.key}`}
              onClick={() => go(item.to)}
              className="flex w-full cursor-pointer items-center gap-3 rounded-lg px-3 py-2.5 text-left text-[13px] text-slate-200 transition-colors hover:bg-brand-gold/10 hover:text-brand-gold"
            >
              <svg className="h-4 w-4 shrink-0 text-slate-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
                <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
              </svg>
              <span className="flex-1 truncate">{item.label}</span>
              <span className="text-[10px] uppercase tracking-wider text-slate-600">{item.section}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}