/**
 * ClientMobileNav — Fixed bottom tab for mobile (thumb-zone, 64h)
 * F-pattern: bottom nav gets 40% more engagement than top hamburger (ITA Group)
 * Always visible < md, hidden >= md (sidebar takes over)
 */
import { useDivisions } from '../../lib/divisions';

export type ClientTab = 'dashboard' | 'study' | 'visa' | 'jobs' | 'umrah';

export default function ClientMobileNav({
  active,
  onChange,
}: {
  active: ClientTab;
  onChange: (t: ClientTab) => void;
}) {
  const { isEnabled } = useDivisions();

  const divisionKeyMap: Record<ClientTab, string | null> = {
    dashboard: null,
    study: 'study-abroad',
    visa: 'visa',
    jobs: 'manpower',
    umrah: 'umrah',
  };

  const items: { key: ClientTab; label: string; icon: string }[] = [
    { key: 'dashboard', label: 'Home', icon: '⌂' },
    { key: 'study', label: 'Study', icon: '🎓' },
    { key: 'visa', label: 'Visa', icon: '✈️' },
    { key: 'jobs', label: 'Jobs', icon: '💼' },
    { key: 'umrah', label: 'Umrah', icon: '🕋' },
  ];
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 shadow-[0_-8px_24px_rgba(0,0,0,0.06)]">
      <div className="grid grid-cols-5 h-[64px]">
        {items.map((it) => {
          const divKey = divisionKeyMap[it.key];
          const activeOrEnabled = divKey ? isEnabled(divKey) : true;
          return (
            <button
              key={it.key}
              onClick={() => onChange(it.key)}
              className={`flex flex-col items-center justify-center gap-0.5 text-[11px] font-bold cursor-pointer ${
                active === it.key ? 'text-brand-navy bg-[#FAF3DC]' : 'text-slate-500'
              }`}
            >
              <span className={`text-[18px] leading-none ${active === it.key ? 'scale-110' : ''}`}>
                {it.icon}
              </span>
              <div className="flex items-center gap-0.5 leading-none">
                <span>{it.label}</span>
                {!activeOrEnabled && (
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500" title="Coming Soon" />
                )}
              </div>
              {active === it.key && <span className="w-1 h-1 rounded-full bg-brand-gold mt-0.5" />}
            </button>
          );
        })}
      </div>
      {/* thumb-zone safe area for iPhone home indicator */}
      <div className="h-[env(safe-area-inset-bottom)] bg-white" />
    </nav>
  );
}
