/**
 * ClientMobileNav — Fixed bottom navigation for mobile (thumb-zone, 64px height)
 * Supports all 8 official portal tabs with horizontal smooth scrolling and safe area padding.
 */
import { useDivisions } from '../../lib/divisions';

export type ClientTab =
  | 'dashboard'
  | 'study'
  | 'visa'
  | 'umrah'
  | 'attestation'
  | 'jobs'
  | 'vault'
  | 'journey'
  | 'security'
  | 'helpdesk';

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
    umrah: 'umrah',
    attestation: 'attestation',
    jobs: 'manpower',
    vault: null,
    journey: null,
    security: null,
    helpdesk: null,
  };

  const items: { key: ClientTab; label: string; icon: string }[] = [
    { key: 'dashboard', label: 'Home', icon: '📊' },
    { key: 'helpdesk', label: 'Help', icon: '🎧' },
    { key: 'study', label: 'Study', icon: '🎓' },
    { key: 'visa', label: 'Visa', icon: '🛂' },
    { key: 'umrah', label: 'Travel', icon: '🧳' },
    { key: 'attestation', label: 'Attest', icon: '📑' },
    { key: 'jobs', label: 'Jobs', icon: '💼' },
    { key: 'vault', label: 'Vault', icon: '🔒' },
    { key: 'journey', label: 'Journey', icon: '🗺️' },
    { key: 'security', label: 'Security', icon: '🛡️' },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 shadow-[0_-8px_24px_rgba(0,0,0,0.08)]">
      <div className="flex items-center gap-1 overflow-x-auto px-2 py-1.5 scrollbar-none h-[64px]">
        {items.map((it) => {
          const divKey = divisionKeyMap[it.key];
          const activeOrEnabled = divKey ? isEnabled(divKey) : true;
          const isSelected = active === it.key;

          return (
            <button
              key={it.key}
              type="button"
              onClick={() => onChange(it.key)}
              className={`flex flex-col items-center justify-center min-w-[56px] px-2 py-1 rounded-xl text-[11px] font-bold shrink-0 transition-all cursor-pointer ${
                isSelected
                  ? 'text-brand-navy bg-brand-gold/20 shadow-2xs font-extrabold'
                  : 'text-slate-500 hover:text-slate-800'
              }`}
            >
              <span className={`text-[16px] leading-none mb-0.5 transition-transform ${isSelected ? 'scale-115' : ''}`}>
                {it.icon}
              </span>
              <div className="flex items-center gap-0.5 leading-none">
                <span>{it.label}</span>
                {!activeOrEnabled && (
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0" title="Coming Soon" />
                )}
              </div>
              {isSelected && <span className="w-1.5 h-1.5 rounded-full bg-brand-gold mt-0.5" />}
            </button>
          );
        })}
      </div>
      {/* Thumb-zone safe area for modern mobile devices */}
      <div className="h-[env(safe-area-inset-bottom)] bg-white" />
    </nav>
  );
}
