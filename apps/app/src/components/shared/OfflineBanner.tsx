import { useEffect, useState } from 'react';

/**
 * OfflineBanner — Stale-data kill switch + offline awareness (a11y: aria-live)
 * Shows when offline or when last sync >24h. Never shows stale numbers as fresh.
 */
export default function OfflineBanner({ lastSyncAt }: { lastSyncAt?: number }) {
  const [isOffline, setIsOffline] = useState(false);
  const [showStale, setShowStale] = useState(false);

  useEffect(() => {
    const upd = () => setIsOffline(!navigator.onLine);
    upd();
    window.addEventListener('online', upd);
    window.addEventListener('offline', upd);
    return () => {
      window.removeEventListener('online', upd);
      window.removeEventListener('offline', upd);
    };
  }, []);

  useEffect(() => {
    if (!lastSyncAt) return;
    const stale = Date.now() / 1000 - lastSyncAt > 24 * 3600;
    setShowStale(stale);
  }, [lastSyncAt]);

  if (!isOffline && !showStale) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className={`w-full px-4 py-2 text-xs font-bold text-center border-y ${isOffline ? 'bg-amber-50 border-amber-200 text-amber-800' : 'bg-slate-50 border-slate-200 text-slate-600'}`}
    >
      {isOffline ? '● Offline — retrying… Your slot stays reserved. We’ll auto-sync when back online.' : '● Sync paused >24h — showing last verified data. Call manager for live status.'}
    </div>
  );
}
