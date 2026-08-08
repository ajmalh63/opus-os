import { useLocation } from 'wouter';
import { useSession } from '../lib/session';

// Authenticated workspace hub. Mock-login removed: session comes from the real
// auth gateway (/login). Logout clears the httpOnly cookie via Better Auth.

export default function LandingPortal() {
  const [, setLocation] = useLocation();
  const { me, refresh } = useSession();

  const handleLogout = async () => {
    await fetch('/api/auth/sign-out', { method: 'POST', credentials: 'include' });
    await refresh();
    setLocation('/login');
  };

  const cards = [
    { icon: '📝', title: 'Public Lead Intake', desc: 'Public student and job seeker registration form with compliance notice & consent agreements.', to: '/lead-form' },
    { icon: '📋', title: 'Counselor Kanban', desc: 'Interactive drag-and-drop workspace scoping client pipelines with WIP limits and stale flags.', to: '/kanban', roles: ['super_admin', 'manager', 'counselor', 'receptionist', 'coordinator'] },
    { icon: '👤', title: 'Client 360 Profiles', desc: 'Select any client card to view their full 360 profile, vault, agreements and ledgers.', to: '/kanban', roles: ['super_admin', 'manager', 'counselor'] },
    { icon: '⚙️', title: 'Admin Control Desk', desc: 'Staff registration, division scopes, RBAC roles and compliance audit trail.', to: '/admin', roles: ['super_admin', 'manager'] },
    { icon: '🚀', title: 'Client Journey Portal', desc: "Self-service status tracking using the client's journey token.", to: '/portal' },
    { icon: '🤝', title: 'Partner Dashboard', desc: 'Affiliate referrals, KYC and commission ledger.', to: '/partner' },
  ];

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-brand-navy p-6 text-white">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="hero-orb -left-20 top-1/4 h-96 w-96 bg-brand-gold/10 blur-3xl" />
        <div className="hero-orb -right-16 bottom-1/4 h-96 w-96 bg-brand-blue/25 blur-3xl" />
        <div className="film-grain" />
      </div>

      <div className="relative z-10 w-full max-w-5xl space-y-10">
        <div className="space-y-4 text-center">
          <div className="inline-block rounded-full border border-brand-gold/40 bg-white/5 px-4 py-1 text-xs font-semibold uppercase tracking-widest text-brand-gold backdrop-blur">
            Opus Overseas Enterprise Suite
          </div>
          <h1 className="font-display text-4xl font-extrabold tracking-tight md:text-5xl">
            Welcome, <span className="text-brand-gold">{me?.name?.split(' ')[0] || 'there'}</span>
          </h1>
          <p className="mx-auto max-w-lg text-sm text-white/60">
            {me?.role === 'super_admin' ? 'Owner-level access to every workspace.' : me?.role ? `${me.role} workspace access.` : 'Sign in to continue.'}
            {me?.twoFactorEnabled && <span className="ml-2 inline-block rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-bold text-emerald-300">2FA ON</span>}
          </p>

          <button
            onClick={handleLogout}
            className="mt-2 cursor-pointer rounded-full border border-white/15 px-5 py-2 text-xs font-semibold text-white/70 transition-all hover:border-red-400/60 hover:text-red-300"
          >
            Sign out
          </button>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => (
            <div
              key={c.title}
              onClick={() => setLocation(c.to)}
              className="group cursor-pointer rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur transition-all hover:-translate-y-1 hover:border-brand-gold/60"
            >
              <div className="mb-4 text-3xl">{c.icon}</div>
              <h3 className="text-lg font-bold transition-colors group-hover:text-brand-gold">{c.title}</h3>
              <p className="mt-2 text-xs text-white/60">{c.desc}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}