import { useEffect, type ReactNode } from 'react';
import { useLocation } from 'wouter';
import { useSession } from '../lib/session';

// Route guard: renders children only for authenticated users; redirects to /login.
export default function AuthGuard({ children }: { children: ReactNode }) {
  const { me, loading } = useSession();
  const [, setLocation] = useLocation();

  useEffect(() => {
    if (!loading && !me) setLocation('/login');
  }, [loading, me, setLocation]);

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

  if (!me) return null;
  return <>{children}</>;
}