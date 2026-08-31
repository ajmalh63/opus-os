import { useEffect, useMemo, useState } from 'react';
import { createSyncClient } from '../../lib/syncClient';

/**
 * NotificationCenter — client-facing bell + live event feed (Week 3–4 roadmap).
 *
 * Fed entirely by the realtime SyncHub channels already published by the API
 * (client:{id}:applications / :payments / :visa / :tickets). No extra polling,
 * no extra backend. Events persist per-client in localStorage; unread badge
 * clears on open. A11y: aria-expanded bell, Escape closes, list is a labelled region.
 */

type NotificationItem = {
  id: string;
  type: string;
  title: string;
  detail?: string;
  ts: number;
  read: boolean;
};

const EVENT_META: Record<string, { icon: string; title: string }> = {
  MANPOWER_DEPLOYMENT_CREATED: { icon: '🚀', title: 'New application started' },
  MANPOWER_DEPLOYMENT_UPDATED: { icon: '📋', title: 'Application status updated' },
  MANPOWER_MEMBERSHIP_GRANTED: { icon: '✅', title: 'Candidate Pass activated' },
  PAYMENT_VERIFIED: { icon: '💳', title: 'Payment confirmed' },
  VISA_STATUS_UPDATED: { icon: '🛂', title: 'Visa application updated' },
  VISA_APPLICATION_SUBMITTED: { icon: '📄', title: 'Visa application submitted' },
  TICKET_CREATED: { icon: '🎫', title: 'Support ticket created' },
  TICKET_UPDATED: { icon: '🎫', title: 'Support ticket updated' },
  TICKET_MESSAGE_ADDED: { icon: '💬', title: 'New reply on your ticket' },
};

function timeAgo(ts: number): string {
  const s = Math.max(1, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return 'just now';
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

const MAX_ITEMS = 50;

export default function NotificationCenter({ token, clientId }: { token: string; clientId?: string }) {
  const storageKey = `opus_notifications_${clientId || 'anon'}`;
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationItem[]>(() => {
    try {
      const raw = clientId ? localStorage.getItem(`opus_notifications_${clientId}`) : null;
      return raw ? (JSON.parse(raw) as NotificationItem[]) : [];
    } catch {
      return [];
    }
  });

  // Persist whenever the feed changes.
  useEffect(() => {
    if (!clientId) return;
    try { localStorage.setItem(storageKey, JSON.stringify(items.slice(0, MAX_ITEMS))); } catch {}
  }, [items, clientId, storageKey]);

  // Live feed — one WS multiplexing the client's four channels.
  useEffect(() => {
    if (!clientId) return;
    const client = createSyncClient({
      plane: 'client',
      token,
      channels: [
        `client:${clientId}:applications`,
        `client:${clientId}:payments`,
        `client:${clientId}:visa`,
        `client:${clientId}:tickets`,
      ],
      onEvent: (e) => {
        const meta = EVENT_META[e.type] || { icon: '🔔', title: e.type.replace(/_/g, ' ').toLowerCase() };
        setItems((prev) => {
          if (prev.some((p) => p.id === e.id)) return prev; // dedupe (replay-safe)
          const next: NotificationItem = {
            id: e.id,
            type: e.type,
            title: meta.title,
            detail: meta.icon,
            ts: e.ts || Date.now(),
            read: false,
          };
          return [next, ...prev].slice(0, MAX_ITEMS);
        });
      },
    });
    client.connect();
    return () => client.disconnect();
  }, [clientId, token]);

  const unread = useMemo(() => items.filter((i) => !i.read).length, [items]);
  const markAllRead = () => setItems((prev) => prev.map((i) => ({ ...i, read: true })));
  const clearAll = () => setItems([]);
  if (!clientId) return null;
  return renderBell(open, setOpen, unread, items, markAllRead, clearAll);
}

function renderBell(
  open: boolean,
  setOpen: (v: boolean) => void,
  unread: number,
  items: NotificationItem[],
  markAllRead: () => void,
  clearAll: () => void,
) {
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => { setOpen(!open); if (!open) markAllRead(); }}
        aria-label={`Notifications${unread ? ` — ${unread} unread` : ''}`}
        aria-expanded={open}
        className="relative grid place-items-center w-9 h-9 rounded-full bg-white border border-slate-200 text-slate-600 hover:text-brand-navy hover:border-brand-gold transition shadow-xs cursor-pointer"
      >
        <span aria-hidden>🔔</span>
        {unread > 0 && (
          <span
            data-testid="notif-unread-badge"
            className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-500 text-white text-[10px] font-black grid place-items-center border-2 border-white"
          >
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} aria-hidden />
          <div
            role="region"
            aria-label="Notification feed"
            onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
            className="absolute right-0 top-11 z-50 w-80 sm:w-96 bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden"
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
              <span className="text-[11px] font-black uppercase tracking-widest text-slate-500">Notifications</span>
              <button onClick={clearAll} className="text-[11px] font-bold text-slate-400 hover:text-rose-600 cursor-pointer uppercase tracking-wider">Clear</button>
            </div>
            <ul className="max-h-80 overflow-y-auto divide-y divide-slate-50">
              {items.length === 0 && (
                <li className="px-4 py-10 text-center text-xs text-slate-400">
                  You're all caught up — updates about your applications, payments and tickets land here live.
                </li>
              )}
              {items.map((n) => (
                <li key={n.id} className={`flex gap-3 px-4 py-3 text-sm ${n.read ? 'bg-white' : 'bg-amber-50/50'}`}>
                  <span aria-hidden className="text-base leading-5">{n.detail}</span>
                  <div className="min-w-0">
                    <p className={`text-xs ${n.read ? 'text-slate-600' : 'font-bold text-brand-navy'}`}>{n.title}</p>
                    <p className="text-[11px] text-slate-400 mt-0.5">{timeAgo(n.ts)}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}

