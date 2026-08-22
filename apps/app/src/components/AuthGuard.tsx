import { useEffect, type ReactNode } from 'react';
import { useLocation } from 'wouter';
import { useSession } from '../lib/session';

const STAFF_ROLES = ['super_admin', 'manager', 'counselor', 'coordinator', 'receptionist'];

// Route guard: renders children only for authenticated staff users;
// clients are automatically routed to the client portal (/portal).
export default function AuthGuard({ children, allowClient = false }: { children: ReactNode; allowClient?: boolean }) {
  const { me, loading } = useSession();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!loading) {
      if (!me) {
        setLocation('/login');
      } else if (!allowClient && !STAFF_ROLES.includes(me.role)) {
        setLocation('/portal');
      }
    }
  }, [loading, me, allowClient, setLocation]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-brand-cream">
        <div className="flex flex-col items-center gap-3">
          <span className="h-8 w-8 animate-spin rounded-full border-2 border-brand-gold border-t-transparent" />
          <span className="text-xs text-brand-textLight">Checking session…</span>
        </div>
      </div>
    );
  }

  if (!me || (!allowClient && !STAFF_ROLES.includes(me.role))) return null;
  return <>{children}</>;
}
