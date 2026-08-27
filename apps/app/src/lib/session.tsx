import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';

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

  const API = (import.meta as any).env?.VITE_API_URL || 'https://opusos-api.ajmalsn63.workers.dev';
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
  return (
    <SessionCtx.Provider value={{ me, loading, refresh }}>{children}</SessionCtx.Provider>
  );
}

export function useSession() {
  return useContext(SessionCtx);
}