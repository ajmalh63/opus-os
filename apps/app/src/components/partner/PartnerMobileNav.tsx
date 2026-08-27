/**
 * PartnerMobileNav — Fixed bottom tab for partner cockpit (thumb-zone, 64h)
 */
export type PartnerTab = 'overview' | 'links' | 'referrals' | 'payouts' | 'tiers';

export default function PartnerMobileNav({
  active,
  onChange,
}: {
  active: PartnerTab;
  onChange: (t: PartnerTab) => void;
}) {
  const items: { key: PartnerTab; label: string; icon: string }[] = [
    { key: 'overview', label: 'Home', icon: '◉' },
    { key: 'referrals', label: 'Deals', icon: '≡' },
    { key: 'links', label: 'Assets', icon: '◆' },
    { key: 'payouts', label: 'Earnings', icon: '₹' },
    { key: 'tiers', label: 'More', icon: '⋯' },
  ];
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0B1220] border-t border-white/10 shadow-[0_-8px_24px_rgba(0,0,0,0.2)]">
      <div className="grid grid-cols-5 h-[64px]">
        {items.map((it) => (
          <button
            key={it.key}
            onClick={() => onChange(it.key)}
            className={`flex flex-col items-center justify-center gap-0.5 text-sm font-bold ${active === it.key ? 'text-[#CEFF00] bg-white/5' : 'text-slate-400'}`}
          >
            <span className="text-[18px] leading-none">{it.icon}</span>
            <span className="leading-none">{it.label}</span>
            {active === it.key && <span className="w-1 h-1 rounded-full bg-[#CEFF00] mt-0.5" />}
          </button>
        ))}
      </div>
      <div className="h-[env(safe-area-inset-bottom)] bg-[#0B1220]" />
    </nav>
  );
}
