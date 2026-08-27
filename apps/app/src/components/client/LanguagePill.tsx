import { useState } from 'react';

/**
 * LanguagePill — Generic, config-driven. No hardcoded market assumption.
 * Usage: <LanguagePill languages={['EN','HI','AR']} /> or <LanguagePill /> (defaults to EN only)
 * Reads from prop; if you add i18n config later, pass it in — no guessing.
 */
import { SUPPORTED_LANGUAGES, labelFor } from '../../config/i18n';

export default function LanguagePill({
  languages,
  value,
  onChange,
}: {
  languages?: string[];
  value?: string;
  onChange?: (lang: string) => void;
}) {
  const langs = (languages || [...SUPPORTED_LANGUAGES]).filter(Boolean);
  const displayLangs = langs.length ? langs : ['EN'];
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(value || langs[0]);

  const pick = (l: string) => {
    setActive(l);
    setOpen(false);
    onChange?.(l);
  };

  if (displayLangs.length === 1) {
    // Single language — show as static pill, no dropdown needed (a11y: not a button)
    return (
      <div className="inline-flex items-center gap-1.5 text-sm font-bold border border-slate-200 bg-white rounded-full px-2.5 py-1 shadow-xs" aria-label={`Language: ${labelFor(active)}`}>
        <span className="w-3 h-3 rounded-full bg-slate-100 grid place-items-center text-sm" aria-hidden>🌐</span>
        {labelFor(active)}
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 text-sm font-bold border border-slate-200 bg-white rounded-full px-2.5 py-1 shadow-xs hover:border-slate-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-navy/20 min-h-[28px] min-w-[44px] justify-center cursor-pointer"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Language selector, current: ${labelFor(active)}`}
      >
        <span className="w-3 h-3 rounded-full bg-slate-100 grid place-items-center text-sm" aria-hidden>🌐</span>
        {labelFor(active)} <span className="text-slate-400 text-[13px]" aria-hidden>▾</span>
      </button>
      {open && (
        <div
          role="listbox"
          aria-label="Select language"
          className="absolute right-0 mt-1 w-32 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden z-50"
        >
          {displayLangs.map((l) => (
            <button
              key={l}
              onClick={() => pick(l)}
              role="option"
              aria-selected={active === l}
              className={`w-full text-left px-3 py-2 text-xs hover:bg-slate-50 focus:outline-none focus:bg-slate-100 min-h-[44px] ${active === l ? 'font-bold text-brand-navy bg-[#FAF3DC]' : 'text-slate-700'}`}
            >
              {labelFor(l)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
