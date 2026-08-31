/**
 * PartnerMobileNav — Fixed bottom tab for partner cockpit (thumb-zone, 64h)
 */
export type PartnerTab = 'overview' | 'links' | 'referrals' | 'payouts' | 'tiers' | 'helpdesk';

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
    { key: 'helpdesk', label: 'Help', icon: '🎧' },
  ];
  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0B1220] border-t border-white/10 shadow-[0_-8px_24px_rgba(0,0,0,0.2)]">
      <div className="grid grid-cols-5 h-[64px]">
        {items.map((it) => (
          <button
            key={it.key}
            onClick={() => onChange(it.key)}
            className={`flex flex-col items-center justify-center gap-0.5 text-sm font-bold transition ${active === it.key ? 'text-brand-gold bg-white/5' : 'text-slate-400 hover:text-slate-200'}`}
          >
            <span className="text-[18px] leading-none">{it.icon}</span>
            <span className="leading-none">{it.label}</span>
            {active === it.key && <span className="w-1.5 h-1.5 rounded-full bg-brand-gold shadow-[0_0_6px_rgba(215,160,25,0.9)] mt-0.5" />}
          </button>
        ))}
      </div>
      <div className="h-[env(safe-area-inset-bottom)] bg-[#0B1220]" />
    </nav>
  );
}
