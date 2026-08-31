import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import { createSyncClient } from './syncClient';

// Lightweight session context backed by Better Auth /api/auth endpoints.
// The frontend never touches tokens directly — the browser sends the
// httpOnly session cookie on every request (same-origin fetch).

export interface Me {
  authenticated: true;
  id: string;
  name: string;
  email: string;
  role: string;
  userDivisions: string[];
  twoFactorEnabled: boolean;
  emailVerified: boolean;
}

interface SessionState {
  me: Me | null;
  loading: boolean;
  refresh: () => Promise<void>;
}

const SessionCtx = createContext<SessionState>({ me: null, loading: true, refresh: async () => {} });

export function SessionProvider({ children }: { children: ReactNode }) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const API = (import.meta as any).env?.VITE_API_URL || '';
  const refresh = async () => {
    try {
      const res = await fetch(`${API}/api/auth/me`, { credentials: 'include' });
      if (!res.ok) { setMe(null); return; }
      const data = await res.json();
      setMe(data.authenticated ? data : null);
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { refresh(); }, []);
  // Gold standard realtime RBAC revocation: if current user is suspended/archived,
  // SyncHub staff:{id}:auth AUTH_REVOKED kills session within seconds (not next 30d expiry)
  useEffect(() => {
    if (!me?.id) return;
    const enabled = (import.meta as any).env?.VITE_SYNC_ENABLED !== 'false';
    if (!enabled || typeof window === 'undefined') return;
    const c = createSyncClient({
      plane: 'staff',
      channels: [`staff:${me.id}:auth`, 'staff:global:roles'],
      enabled,
      onEvent: (e) => {
        const payload = e.payload as any;
        const isTargeted = payload?.userId === me.id;
        const isGlobalSuspend = ['ROLE_SUSPENDED','ROLE_ARCHIVED','ROLE_DELETED'].includes(e.type) && isTargeted;
        const isAuthRevoked = e.type === 'AUTH_REVOKED' && isTargeted;
        if (isAuthRevoked || isGlobalSuspend) {
          // Force re-validate; server will now return null due to status check → me becomes null → workspace drops
          refresh().then(() => {
            if (isAuthRevoked || isGlobalSuspend) {
              window.dispatchEvent(new CustomEvent('opus:force-logout', { detail: { reason: e.type }}));
            }
          });
        }
        if (e.type === 'STAFF_SCOPE_UPDATE' && isTargeted) refresh();
      },
    });
    c.connect();
    return () => { try { (c as any).disconnect?.(); } catch {} };
  }, [me?.id]);
  return (
    <SessionCtx.Provider value={{ me, loading, refresh }}>{children}</SessionCtx.Provider>
  );
}

export function useSession() {
  return useContext(SessionCtx);
}