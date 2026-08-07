import { useState } from 'react';
import { useLocation } from 'wouter';

export default function LandingPortal() {
  const [, setLocation] = useLocation();
  const [currentUser, setCurrentUser] = useState<string | null>(
    document.cookie.includes('better-auth.session_token=') ? 'counselor' : null
  );

  const mockUsers = [
    {
      name: "Rahul Counselor",
      email: "counselor@test.com",
      role: "counselor",
      token: "token-counselor",
      divisions: ["study-abroad"]
    },
    {
      name: "Meera Manager",
      email: "manager@test.com",
      role: "manager",
      token: "token-manager",
      divisions: ["study-abroad", "visa", "umrah"]
    },
    {
      name: "Admin Owner",
      email: "admin@test.com",
      role: "super_admin",
      token: "token-admin",
      divisions: ["study-abroad", "visa", "umrah", "attestation", "manpower"]
    }
  ];

  const handleMockLogin = (user: typeof mockUsers[0]) => {
    // Set simulated cookie for better-auth integration testing
    document.cookie = `better-auth.session_token=${user.token}; path=/; max-age=3600`;
    setCurrentUser(user.role);
    alert(`Logged in as ${user.name} (${user.role.toUpperCase()})`);
  };

  const handleLogout = () => {
    document.cookie = "better-auth.session_token=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
    setCurrentUser(null);
    alert("Logged out successfully.");
  };

  return (
    <div className="min-h-screen bg-[hsl(224,25%,12%)] text-white font-sans flex flex-col items-center justify-center p-6 relative overflow-hidden">
      {/* Dynamic Background Glows */}
      <div className="absolute top-1/4 left-1/4 w-[400px] h-[400px] bg-[hsl(45,100%,50%)]/5 rounded-full blur-[100px] pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-[350px] h-[350px] bg-blue-500/5 rounded-full blur-[90px] pointer-events-none" />

      {/* Main Container */}
      <div className="w-full max-w-4xl z-10 space-y-10">
        
        {/* Header Hero */}
        <div className="text-center space-y-4">
          <div className="inline-block rounded-full border border-[hsl(45,100%,40%)] bg-[hsl(224,25%,18%)] px-4 py-1 text-xs font-semibold text-[hsl(45,100%,50%)] uppercase tracking-widest shadow-[0_0_10px_rgba(250,204,21,0.1)]">
            Opus Overseas Enterprise Suite
          </div>
          <h1 className="text-5xl font-extrabold tracking-tight text-white">
            Welcome to <span className="text-[hsl(45,100%,50%)] shadow-gold">OpusOS</span>
          </h1>
          <p className="text-gray-400 max-w-lg mx-auto text-sm">
            The private business operating engine managing Overseas Education, Visas, Umrah packages, Attestations, and Recruitments.
          </p>
        </div>

        {/* Workspaces / Portals Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          
          {/* Card 1: Public Intake Form */}
          <div 
            onClick={() => setLocation('/lead-form')}
            className="group cursor-pointer rounded-xl border border-[hsl(224,25%,26%)] bg-[hsl(224,25%,18%)] p-6 transition-all hover:border-[hsl(45,100%,50%)] hover:shadow-[0_0_20px_rgba(250,204,21,0.1)] hover:-translate-y-1"
          >
            <div className="text-3xl mb-4">📝</div>
            <h3 className="text-lg font-bold text-white group-hover:text-[hsl(45,100%,50%)] transition-colors">Public Lead Intake</h3>
            <p className="text-xs text-gray-400 mt-2">
              Public student and job seeker registration form with compliance notice & consent agreements.
            </p>
          </div>

          {/* Card 2: Self-Service Client Portal */}
          <div 
            onClick={() => setLocation('/portal')}
            className="group cursor-pointer rounded-xl border border-[hsl(224,25%,26%)] bg-[hsl(224,25%,18%)] p-6 transition-all hover:border-[hsl(45,100%,50%)] hover:shadow-[0_0_20px_rgba(250,204,21,0.1)] hover:-translate-y-1"
          >
            <div className="text-3xl mb-4">🚀</div>
            <h3 className="text-lg font-bold text-white group-hover:text-[hsl(45,100%,50%)] transition-colors">Client Journey Portal</h3>
            <p className="text-xs text-gray-400 mt-2">
              Self-service status lookups using client tokens. Check visa schedules and document uploads.
            </p>
          </div>

          {/* Card 3: Partner & Affiliate Portal */}
          <div 
            onClick={() => setLocation('/partner')}
            className="group cursor-pointer rounded-xl border border-[hsl(224,25%,26%)] bg-[hsl(224,25%,18%)] p-6 transition-all hover:border-[hsl(45,100%,50%)] hover:shadow-[0_0_20px_rgba(250,204,21,0.1)] hover:-translate-y-1"
          >
            <div className="text-3xl mb-4">🤝</div>
            <h3 className="text-lg font-bold text-white group-hover:text-[hsl(45,100%,50%)] transition-colors">Partner Dashboard</h3>
            <p className="text-xs text-gray-400 mt-2">
              Affiliate referral submission, KYC validation (PAN/Bank details), and commission ledgers.
            </p>
          </div>

          {/* Card 4: Counselor Kanban Desk */}
          <div 
            onClick={() => setLocation('/kanban')}
            className="group cursor-pointer rounded-xl border border-[hsl(224,25%,26%)] bg-[hsl(224,25%,18%)] p-6 transition-all hover:border-[hsl(45,100%,50%)] hover:shadow-[0_0_20px_rgba(250,204,21,0.1)] hover:-translate-y-1"
          >
            <div className="text-3xl mb-4">📋</div>
            <h3 className="text-lg font-bold text-white group-hover:text-[hsl(45,100%,50%)] transition-colors">Counselor Kanban</h3>
            <p className="text-xs text-gray-400 mt-2">
              Interactive drag-and-drop workspace scoping client pipelines with WIP limits and stale flags.
            </p>
          </div>

          {/* Card 5: Super User Admin Control Panel */}
          <div 
            onClick={() => setLocation('/admin')}
            className="group cursor-pointer rounded-xl border border-brand-gold/25 bg-[hsl(224,25%,18%)] p-6 transition-all hover:border-brand-gold hover:shadow-[0_0_20px_rgba(215,160,25,0.1)] hover:-translate-y-1"
          >
            <div className="text-3xl mb-4">⚙️</div>
            <h3 className="text-lg font-bold text-white group-hover:text-brand-gold transition-colors">Admin Control Desk</h3>
            <p className="text-xs text-gray-400 mt-2">
              Staff registration, division scoping permissions mapping, and compliance audit trail logs.
            </p>
          </div>

          {/* Card 6: Client 360 Workspace — via Kanban card selection (no mock ID) */}
          <div 
            onClick={() => setLocation('/kanban')}
            className="group cursor-pointer rounded-xl border border-brand-gold/25 bg-[hsl(224,25%,18%)] p-6 transition-all hover:border-brand-gold hover:shadow-[0_0_20px_rgba(215,160,25,0.1)] hover:-translate-y-1"
          >
            <div className="text-3xl mb-4">👤</div>
            <h3 className="text-lg font-bold text-white group-hover:text-brand-gold transition-colors">Client 360 Profiles</h3>
            <p className="text-xs text-gray-400 mt-2">
              Open the Kanban pipeline and select any client card to view their full 360 profile, R2 document vault, eSign agreements, and ledgers.
            </p>
          </div>

        </div>

        {/* Bottom Section: Mock Authentication Panel */}
        <div className="rounded-xl border border-[hsl(224,25%,26%)] bg-[hsl(224,25%,18%)] p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-md font-semibold text-[hsl(45,100%,50%)]">
              Simulated Role Authentication Panel
            </h3>
            {currentUser && (
              <button 
                onClick={handleLogout}
                className="rounded bg-red-950/40 border border-red-800 px-3 py-1.5 text-xs text-red-400 hover:bg-red-900/40"
              >
                Log Out Session
              </button>
            )}
          </div>
          
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {mockUsers.map((user) => (
              <button
                key={user.role}
                onClick={() => handleMockLogin(user)}
                className="flex flex-col items-start rounded-lg bg-[hsl(224,25%,12%)] border border-[hsl(224,25%,26%)] p-4 text-left transition-all hover:border-[hsl(45,100%,50%)]"
              >
                <span className="font-semibold text-xs text-white">{user.name}</span>
                <span className="text-[10px] text-gray-500">{user.email}</span>
                <span className="mt-2 text-[10px] uppercase font-mono tracking-widest text-[hsl(45,100%,50%)]">
                  Role: {user.role}
                </span>
              </button>
            ))}
          </div>
        </div>

      </div>
    </div>
  );
}
