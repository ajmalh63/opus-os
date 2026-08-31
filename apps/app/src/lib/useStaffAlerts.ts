import { useState, useEffect, useCallback } from 'react';
const API = (import.meta as any).env?.VITE_API_URL || '';

// Live staff alert feed — polls /api/staff/alerts (role-filtered server-side).
// Used by the WorkspaceShell header bell + the dashboard activity panel.
export function useStaffAlerts(intervalMs = 20000) {
  const [alerts, setAlerts] = useState<any[]>([]);
  const [newCount, setNewCount] = useState(0);

  const refresh = useCallback(async () => {
    try {
      const r = await fetch(`${API}/api/staff/alerts`);
      if (!r.ok) return;
      const j = await r.json();
      setAlerts(j.alerts || []);
      setNewCount(j.newCount || 0);
    } catch { /* poll silently */ }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, intervalMs);
    return () => clearInterval(t);
  }, [refresh, intervalMs]);

  const markSeen = useCallback(async (id: string) => {
    await fetch(`${API}/api/staff/alerts/${id}/seen`, { method: 'POST' }).catch(() => {});
    setAlerts((a) => a.map((x) => (x.id === id ? { ...x, status: 'seen' } : x)));
    setNewCount((c) => Math.max(0, c - 1));
  }, []);

  const dismiss = useCallback(async (id: string) => {
    await fetch(`${API}/api/staff/alerts/${id}`, { method: 'DELETE' }).catch(() => {});
    setAlerts((a) => a.filter((x) => x.id !== id));
  }, []);

  const clearSeen = useCallback(async () => {
    await fetch(`${API}/api/staff/alerts/clear`, { method: 'POST' }).catch(() => {});
    setAlerts((a) => a.filter((x) => x.status !== 'seen'));
  }, []);

  const markAllSeen = useCallback(async () => {
    const fresh = alerts.filter((a) => a.status === 'new');
    for (const a of fresh) await markSeen(a.id);
  }, [alerts, markSeen]);

  return { alerts, newCount, refresh, markSeen, markAllSeen, dismiss, clearSeen };
}
