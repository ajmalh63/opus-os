import { useState } from 'react';
import { useLocation } from 'wouter';

export default function LandingPortal() {
  const [, setLocation] = useLocation();
  const [currentUser, setCurrentUser] = useState<string | null>(
    document.cookie.includes('better-auth.session_token=') ? 'counselor' : null
  );

  const mockUsers = [
    { name: 'Rahul Counselor', email: 'counselor@test.com', role: 'counselor', token: 'token-counselor', divisions: ['study-abroad'] },
    { name: 'Meera Manager', email: 'manager@test.com', role: 'manager', token: 'token-manager', divisions: ['study-abroad', 'visa', 'umrah'] },
    { name: 'Admin Owner', email: 'admin@test.com', role: 'super_admin', token: 'token-admin', divisions: ['study-abroad', 'visa', 'umrah', 'attestation', 'manpower'] },
  ];

  const handleMockLogin = (user: typeof mockUsers[0]) => {
    document.cookie = `better-auth.session_token=${user.token}; path=/; max-age=3600`;
    setCurrentUser(user.role);
    alert(`Logged in as ${user.name} (${user.role.toUpperCase()})`);
  };

  const handleLogout = () => {
    document.cookie = 'better-auth.session_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT';
    setCurrentUser(null);
    alert('Logged out successfully.');
  };

  const cards = [
    { icon: '📝', title: 'Public Lead Intake', desc: 'Public student and job seeker registration form with compliance notice & consent agreements.', to: '/lead-form', hero: false },
    { icon: '🚀', title: 'Client Journey Portal', desc: 'Self-service status lookups using client tokens. Check visa schedules and document uploads.', to: '/portal', hero: false },
    { icon: '🤝', title: 'Partner Dashboard', desc: 'Affiliate referral submission, KYC validation (PAN/Bank details), and commission ledgers.', to: '/partner', hero: false },
    { icon: '📋', title: 'Counselor Kanban', desc: 'Interactive drag-and-drop workspace scoping client pipelines with WIP limits and stale flags.', to: '/kanban', hero: false },
    { icon: '⚙️', title: 'Admin Control Desk', desc: 'Staff registration, division scoping permissions mapping, and compliance audit trail logs.', to: '/admin', hero: true },
    { icon: '👤', title: 'Client 360 Profiles', desc: 'Open the Kanban pipeline and select any client card to view their full 360 profile, vault, agreements and ledgers.', to: '/kanban', hero: true },
  ];

  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-brand-navy p-6 text-white">
      <div className="pointer-events-none absolute inset-0" aria-hidden="true">
        <div className="hero-orb -left-20 top-1/4 h-96 w-96 bg-brand-gold/10 blur-3xl" />
        <div className="hero-orb -right-16 bottom-1/4 h-96 w-96 bg-brand-blue/25 blur-3xl" />
        <div className="film-grain" />
      </div>

      <div className="relative z-10 w-full max-w-4xl space-y-10">
        <div className="space-y-4 text-center">
          <div className="inline-block rounded-full border border-brand-gold/40 bg-white/5 px-4 py-1 text-xs font-semibold uppercase tracking-widest text-brand-gold backdrop-blur">
            Opus Overseas Enterprise Suite
          </div>
          <h1 className="font-display text-5xl font-extrabold tracking-tight">
            Welcome to <span className="text-brand-gold">OpusOS</span>
          </h1>
          <p className="mx-auto max-w-lg text-sm text-white/60">
            The private business operating engine managing overseas education, visas, Umrah packages, attestations, and recruitments.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
          {cards.map((c) => (
            <div
              key={c.title}
              onClick={() => setLocation(c.to)}
              className={`group cursor-pointer rounded-2xl border p-6 backdrop-blur transition-all hover:-translate-y-1 ${c.hero ? 'border-brand-gold/30 bg-white/5 hover:border-brand-gold' : 'border-white/10 bg-white/5 hover:border-brand-gold/60'}`}
            >
              <div className="mb-4 text-3xl">{c.icon}</div>
              <h3 className="text-lg font-bold transition-colors group-hover:text-brand-gold">{c.title}</h3>
              <p className="mt-2 text-xs text-white/60">{c.desc}</p>
            </div>
          ))}
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 backdrop-blur">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-sm font-semibold text-brand-gold">Simulated Role Authentication Panel</h3>
            {currentUser && (
              <button onClick={handleLogout} className="cursor-pointer rounded border border-red-800 bg-red-950/40 px-3 py-1.5 text-xs text-red-400 hover:bg-red-900/40">
                Log Out Session
              </button>
            )}
          </div>

          <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
            {mockUsers.map((user) => (
              <button
                key={user.role}
                onClick={() => handleMockLogin(user)}
                className="flex flex-col items-start rounded-xl border border-white/10 bg-brand-navy p-4 text-left transition-all hover:border-brand-gold/60"
              >
                <span className="text-xs font-semibold text-white">{user.name}</span>
                <span className="text-[10px] text-white/50">{user.email}</span>
                <span className="mt-2 font-mono text-[10px] uppercase tracking-widest text-brand-gold">Role: {user.role}</span>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}