import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from '../lib/session';
import { useRevealRoot } from '../lib/reveal';

// Staff unified inbox  OpenWA + Chatwoot inbound conversations become visible
// here; replies dispatch via the WhatsApp gateway (sendWhatsApp).

const baseAuth = (): HeadersInit => {
  const s = document.cookie.split(';').map(p => p.trim()).find(p => p.startsWith('better-auth.session_token='));
  return s ? { Cookie: s } : {};
};

interface Conversation {
  id: string; channel: string; contactKey: string; contactName: string | null;
  lastMessage: string | null; lastMessageAt: number | null; unread: number; status: string;
}
interface Msg { id: string; direction: string; body: string; createdAt: number; }

export default function Inbox() {
  const rootRef = useRevealRoot<HTMLDivElement>();
  const { me } = useSession();
  const qc = useQueryClient();
  const [selected, setSelected] = useState<string | null>(null);
  const [reply, setReply] = useState('');
  const [toast, setToast] = useState<{ kind: 'ok' | 'err'; text: string } | null>(null);

  const { data, isLoading } = useQuery<{ conversations: Conversation[]; unreadTotal: number }>({
    queryKey: ['inbox'],
    queryFn: async () => { const r = await fetch('/api/inbox', { headers: baseAuth() }); if (!r.ok) throw new Error('load failed'); return r.json(); },
    refetchInterval: 15000, // near-real-time while open
  });

  const { data: thread } = useQuery<{ conversation: Conversation; messages: Msg[] }>({
    queryKey: ['inboxThread', selected],
    queryFn: async () => { const r = await fetch(`/api/inbox/${selected}/thread`, { headers: baseAuth() }); if (!r.ok) throw new Error('load failed'); return r.json(); },
    enabled: !!selected,
  });

  const sendReply = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/inbox/${selected}/reply`, {
        method: 'POST', headers: { ...baseAuth(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: reply }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d?.error || 'Reply failed');
      return d;
    },
    onSuccess: (d) => {
      setToast({ kind: 'ok', text: d.queued ? 'Reply sent via WhatsApp.' : 'Reply logged (gateway pending config).' });
      setReply('');
      qc.invalidateQueries({ queryKey: ['inbox'] });
      qc.invalidateQueries({ queryKey: ['inboxThread', selected] });
    },
    onError: (e: any) => setToast({ kind: 'err', text: e.message }),
  });

  const fmt = (ts: number | null) => ts ? new Date(ts * 1000).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : '';

return (
    <div ref={rootRef} className="min-h-full text-brand-navy">
      <div className="mx-auto flex min-h-full max-w-7xl flex-col gap-6">
        <div className="reveal flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold">Unified Inbox</h1>
            <p className="text-xs text-brand-navy/40">WhatsApp + website chat (OpenWA / Chatwoot)</p>
          </div>
          <div className="flex items-center gap-3">
            {data?.unreadTotal ? (
              <span className="rounded-full bg-rose-500/20 px-3 py-1 text-[10px] font-bold text-rose-700">{data.unreadTotal} unread</span>
            ) : (
              <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-[10px] font-bold text-emerald-700">Live</span>
            )}
          </div>
        </div>

        {toast && <div className={`rounded-xl px-4 py-3 text-xs font-semibold ${toast.kind === 'ok' ? 'bg-emerald-500/15 text-emerald-700' : 'bg-rose-500/15 text-rose-700'}`}>{toast.text}</div>}

        <div className="grid flex-1 grid-cols-1 gap-5 lg:grid-cols-3">
          {/* Conversation list */}
          <div className="reveal rounded-2xl border border-brand-navy/10 bg-white p-3">
            <div className="mb-3 px-2 text-[10px] font-bold uppercase tracking-wider text-brand-gold">Conversations</div>
            {isLoading && <p className="p-6 text-center text-xs text-brand-navy/40">Loading…</p>}
            {!isLoading && (!data?.conversations || data.conversations.length === 0) && (
              <p className="p-6 text-center text-xs text-brand-navy/40">No conversations yet. WhatsApp/web messages will appear here.</p>
            )}
            <div className="space-y-2">
              {(data?.conversations || []).map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelected(c.id)}
                  className={`w-full rounded-xl p-3 text-left transition-all ${selected === c.id ? 'bg-brand-gold/15 border border-brand-gold/40' : 'bg-brand-navy/[0.04] border border-transparent hover:bg-brand-navy/[0.06]'}`}
                >
                  <div className="flex items-center justify-between">
                    <span className="truncate text-sm font-semibold">{c.contactName || c.contactKey}</span>
                    {c.unread > 0 && <span className="h-2.5 w-2.5 rounded-full bg-brand-gold" />}
                  </div>
                  <p className="mt-1 truncate text-[11px] text-brand-navy/40">{c.lastMessage || '\u200B'}</p>
                  <p className="mt-1 text-[10px] text-brand-navy/50">{fmt(c.lastMessageAt)} · {c.channel}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Thread */}
          <div className="reveal rounded-2xl border border-brand-navy/10 bg-white p-4 lg:col-span-2">
            {!selected ? (
              <div className="flex h-full min-h-[320px] items-center justify-center text-xs text-brand-navy/40">Select a conversation to reply.</div>
            ) : (
              <div className="flex h-full flex-col">
                <div className="mb-3 flex items-center justify-between border-b border-brand-navy/10 pb-3">
                  <div>
                    <p className="font-display text-sm font-bold">{thread?.conversation.contactName || thread?.conversation.contactKey}</p>
                    <p className="text-[10px] text-brand-navy/40">{thread?.conversation.channel} · {thread?.conversation.contactKey}</p>
                  </div>
                  {me && <span className="text-[10px] text-brand-navy/40">Replying as {me.name?.split(' ')[0]}</span>}
                </div>

                <div className="flex-1 space-y-2 overflow-y-auto pr-1" style={{ maxHeight: '46vh' }}>
                  {(thread?.messages || []).map((m) => (
                    <div key={m.id} className={`max-w-[80%] rounded-xl px-3.5 py-2.5 text-xs ${m.direction === 'outgoing' ? 'ml-auto bg-emerald-600 text-white' : 'bg-brand-navy/[0.06] text-brand-navy border border-brand-navy/10'}`}>
                      <p className="leading-relaxed">{m.body}</p>
                      <p className="mt-1 text-[9px] text-brand-navy/50">{fmt(m.createdAt)}</p>
                    </div>
                  ))}
                  {thread && thread.messages.length === 0 && <p className="p-4 text-center text-xs text-brand-navy/50">No messages in this thread yet.</p>}
                </div>

                <form
                  onSubmit={(e) => { e.preventDefault(); if (reply.trim() && selected) sendReply.mutate(); }}
                  className="mt-3 flex gap-2 border-t border-brand-navy/10 pt-3"
                >
                  <input
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder="Type a WhatsApp reply…"
                    className="flex-1 rounded-xl border border-brand-navy/10 bg-white px-4 py-3 text-sm text-brand-navy placeholder:text-brand-navy/40 focus:border-brand-gold focus:outline-none"
                  />
                  <button type="submit" disabled={sendReply.isPending || !reply.trim()} className="rounded-xl bg-brand-gold px-5 py-3 text-xs font-bold uppercase tracking-wider text-brand-navy transition-all hover:bg-brand-gold-hover disabled:opacity-40">
                    {sendReply.isPending ? '…' : 'Send'}
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
