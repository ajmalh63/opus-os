import { useState, useRef, useEffect } from 'react';
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
  const [search, setSearch] = useState('');
  // Team chat (merged into inbox): staff rooms
  const [teamMode, setTeamMode] = useState(false);
  const [roomId, setRoomId] = useState('ops');
  const [teamMsg, setTeamMsg] = useState('');
  const TEAM_ROOMS = [
    { id: 'ops', label: 'Operations' },
    { id: 'sales', label: 'Sales & Funnel' },
    { id: 'finance', label: 'Finance & Compliance' },
    { id: 'study-abroad', label: '🎓 Study Abroad' },
    { id: 'visa', label: '🛂 Visa Services' },
    { id: 'attestation', label: '📜 Attestation' },
    { id: 'umrah', label: '🕋 Umrah & Travel' },
    { id: 'manpower', label: '💼 Manpower' },
  ];
  const { data: teamThread } = useQuery<{ messages: any[] }>({
    queryKey: ['teamRoom', roomId],
    queryFn: async () => { const r = await fetch(`/api/teamhub/rooms/${roomId}/messages`, { headers: baseAuth() }); if (!r.ok) throw new Error('team'); return r.json(); },
    enabled: teamMode,
    refetchInterval: 5000,
  });
  const { data: teamMembers } = useQuery<{ members: any[] }>({
    queryKey: ['teamMembers'],
    queryFn: async () => { const r = await fetch('/api/teamhub/members', { headers: baseAuth() }); if (!r.ok) throw new Error('members'); return r.json(); },
    enabled: teamMode,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const uploadFile = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      const r = await fetch(`/api/teamhub/rooms/${roomId}/files`, { method: 'POST', headers: baseAuth(), body: fd });
      if (!r.ok) throw new Error('upload');
      return r.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['teamRoom', roomId] }); },
    onError: (e: any) => setToast({ kind: 'err', text: e.message }),
  });
  const sendTeam = useMutation({
    mutationFn: async () => {
      const r = await fetch(`/api/teamhub/rooms/${roomId}/messages`, { method: 'POST', headers: { ...baseAuth(), 'Content-Type': 'application/json' }, body: JSON.stringify({ body: teamMsg }) });
      if (!r.ok) throw new Error('team send');
      return r.json();
    },
    onSuccess: () => { setTeamMsg(''); qc.invalidateQueries({ queryKey: ['teamRoom', roomId] }); },
  });

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

  // Close members dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (membersRef.current && !membersRef.current.contains(e.target as Node)) setMembersOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

return (
    <div ref={rootRef} className="min-h-full text-brand-navy">
      <div className="mx-auto flex min-h-full max-w-7xl flex-col gap-6">
        <div className="reveal flex items-center justify-between">
          <div>
            <h1 className="font-display text-2xl font-bold">Unified Inbox</h1>
            <p className="text-xs text-brand-navy/40">WhatsApp + website chat (OpenWA / Chatwoot)</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex gap-1 rounded-full border border-brand-navy/15 bg-brand-navy/[0.04] p-1 text-[10px] font-bold uppercase">
              <button onClick={() => setTeamMode(false)} className={`px-3 py-1.5 rounded-full transition-all cursor-pointer ${!teamMode ? 'bg-brand-gold text-brand-navy' : 'text-brand-navy/50 hover:text-brand-navy'}`}>Clients</button>
              <button onClick={() => setTeamMode(true)} className={`px-3 py-1.5 rounded-full transition-all cursor-pointer ${teamMode ? 'bg-brand-gold text-brand-navy' : 'text-brand-navy/50 hover:text-brand-navy'}`}>Team</button>
            </div>
            {data?.unreadTotal ? (
              <span className="rounded-full bg-rose-500/20 px-3 py-1 text-[10px] font-bold text-rose-700">{data.unreadTotal} unread</span>
            ) : (
              <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-[10px] font-bold text-emerald-700">Live</span>
            )}
          </div>
        </div>

        {toast && <div className={`rounded-xl px-4 py-3 text-xs font-semibold ${toast.kind === 'ok' ? 'bg-emerald-500/15 text-emerald-700' : 'bg-rose-500/15 text-rose-700'}`}>{toast.text}</div>}

        {teamMode ? (
          <div className="grid flex-1 grid-cols-1 gap-5 lg:grid-cols-3">
            {/* Team rooms */}
            <div className="reveal rounded-2xl border border-brand-navy/10 bg-white p-3">
              <div className="mb-3 px-2 text-[10px] font-bold uppercase tracking-wider text-brand-gold">Team Rooms</div>
              <div className="space-y-2">
                {TEAM_ROOMS.map(r => (
                  <button key={r.id} onClick={() => setRoomId(r.id)} className={`w-full rounded-xl p-3 text-left transition-all ${roomId === r.id ? 'bg-brand-gold/15 border border-brand-gold/40' : 'bg-brand-navy/[0.04] border border-transparent hover:bg-brand-navy/[0.06]'}`}>
                    <span className="text-sm font-semibold">{r.label}</span>
                  </button>
                ))}
              </div>
            </div>
            {/* Team thread */}
            <div className="reveal rounded-2xl border border-brand-navy/10 bg-white p-4 lg:col-span-2 flex flex-col">
              <div className="mb-3 flex items-center justify-between">
                <div className="text-[10px] font-bold uppercase tracking-wider text-brand-gold">{TEAM_ROOMS.find(r => r.id === roomId)?.label} — internal chat</div>
                <div className="flex items-center gap-1.5">
                  {(teamMembers?.members || []).slice(0, 6).map((m: any) => (
                    <span key={m.id} title={`${m.name} · ${m.role}`} className="grid h-6 w-6 place-items-center rounded-full bg-brand-navy text-[8px] font-bold text-white cursor-help">{m.initials}</span>
                  ))}
                  {(teamMembers?.members || []).length > 6 && <span className="text-[9px] text-brand-navy/40">+{(teamMembers?.members || []).length - 6}</span>}
                </div>
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto max-h-[420px] pr-1">
                {(teamThread?.messages || []).map((m: any) => (
                  <div key={m.id} className={`max-w-[80%] rounded-xl px-3 py-2 text-xs ${m.senderId === me?.id ? 'bg-brand-gold/15 ml-auto' : 'bg-brand-navy/[0.06]'}`}>
                    <div className="text-[9px] text-brand-navy/40 mb-0.5">{m.senderName || 'staff'} · {fmt(m.createdAt)}</div>
                    {m.body}
                    {m.file && (
                      <a href={`/api/teamhub/files/${encodeURIComponent(m.file.key)}`} download={m.file.name} className="mt-1.5 flex items-center gap-2 rounded-lg border border-brand-navy/15 bg-white px-2.5 py-1.5 text-[10px] font-bold text-brand-navy hover:border-brand-gold/50 transition-all">
                        📎 {m.file.name}
                        <span className="text-brand-navy/40 font-normal">({(m.file.size / 1024).toFixed(0)} KB)</span>
                      </a>
                    )}
                  </div>
                ))}
                {(teamThread?.messages || []).length === 0 && <p className="text-center text-xs text-brand-navy/40 py-6">No messages yet — start the conversation.</p>}
              </div>
              <div className="mt-3 flex gap-2">
                <input value={teamMsg} onChange={e => setTeamMsg(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && teamMsg.trim()) sendTeam.mutate(); }} placeholder={`Message ${TEAM_ROOMS.find(r => r.id === roomId)?.label}…`} className="flex-1 rounded-xl border border-brand-navy/10 bg-white px-3 py-2 text-xs text-brand-navy outline-none focus:border-brand-gold" />
                <button onClick={() => fileInputRef.current?.click()} className="border border-brand-navy/15 bg-brand-navy/[0.04] text-brand-navy hover:border-brand-gold/50 px-3 py-2 rounded-xl text-xs font-bold cursor-pointer" title="Share file (max 10MB)">📎</button>
                <input ref={fileInputRef} type="file" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) uploadFile.mutate(f); e.target.value = ''; }} />
                <button onClick={() => sendTeam.mutate()} disabled={!teamMsg.trim()} className="bg-brand-gold hover:bg-brand-gold/90 text-brand-navy px-4 py-2 rounded-xl text-xs font-bold disabled:opacity-40 cursor-pointer">Send</button>
              </div>
            </div>
          </div>
        ) : (
        <div className="grid flex-1 grid-cols-1 gap-5 lg:grid-cols-3">
          {/* Conversation list */}
          <div className="reveal rounded-2xl border border-brand-navy/10 bg-white p-3">
            <div className="mb-3 px-2 text-[10px] font-bold uppercase tracking-wider text-brand-gold">Conversations</div>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="🔍 Search conversations…"
              className="w-full rounded-xl border border-brand-navy/10 bg-white px-3 py-2 text-xs text-brand-navy outline-none focus:border-brand-gold mb-2"
            />
            {isLoading && <p className="p-6 text-center text-xs text-brand-navy/40">Loading…</p>}
            {!isLoading && (!data?.conversations || data.conversations.length === 0) && (
              <p className="p-6 text-center text-xs text-brand-navy/40">No conversations yet. WhatsApp/web messages will appear here.</p>
            )}
            <div className="space-y-2">
              {(data?.conversations || []).filter((c: any) => {
                if (!search.trim()) return true;
                const q = search.toLowerCase();
                return (c.clientName || '').toLowerCase().includes(q) || (c.phone || '').includes(q) || (c.lastMessage || '').toLowerCase().includes(q);
              }).map((c) => (
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
        )}
      </div>
    </div>
  );
}
