import { useState, useRef, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSession } from '../lib/session';
import { useRevealRoot } from '../lib/reveal';
import AiTranslatePanel from '../components/ai/AiTranslatePanel';
const API = (import.meta as any).env?.VITE_API_URL || '';

// Staff unified inbox  OpenWA + Chatwoot inbound conversations become visible
// here; replies dispatch via the WhatsApp gateway (sendWhatsApp).

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
  const [showTranslator, setShowTranslator] = useState(false);
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
    { id: 'umrah', label: '🧳 Tours & Travels' },
    { id: 'manpower', label: '💼 Manpower' },
  ];
  const { data: teamThread } = useQuery<{ messages: any[] }>({
    queryKey: ['teamRoom', roomId],
    queryFn: async () => { const r = await fetch(`${API}/api/teamhub/rooms/${roomId}/messages`, { credentials: 'include' }); if (!r.ok) throw new Error('team'); return r.json(); },
    enabled: teamMode,
    refetchInterval: 5000,
  });
  const { data: teamMembers } = useQuery<{ members: any[] }>({
    queryKey: ['teamMembers'],
    queryFn: async () => { const r = await fetch(`${API}/api/teamhub/members`, { credentials: 'include' }); if (!r.ok) throw new Error('members'); return r.json(); },
    enabled: teamMode,
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [membersOpen, setMembersOpen] = useState(false);
  const membersRef = useRef<HTMLDivElement>(null);
  const uploadFile = useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append('file', file);
      const r = await fetch(`${API}/api/teamhub/rooms/${roomId}/files`, { method: 'POST', credentials: 'include', body: fd });
      if (!r.ok) throw new Error('upload');
      return r.json();
    },
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['teamRoom', roomId] }); },
    onError: (e: any) => setToast({ kind: 'err', text: e.message }),
  });
  const sendTeam = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${API}/api/teamhub/rooms/${roomId}/messages`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ body: teamMsg }) });
      if (!r.ok) throw new Error('team send');
      return r.json();
    },
    onSuccess: () => { setTeamMsg(''); qc.invalidateQueries({ queryKey: ['teamRoom', roomId] }); },
  });

  const { data, isLoading } = useQuery<{ conversations: Conversation[]; unreadTotal: number }>({
    queryKey: ['inbox'],
    queryFn: async () => { const r = await fetch(`${API}/api/inbox`, { credentials: 'include' }); if (!r.ok) throw new Error('load failed'); return r.json(); },
    refetchInterval: 15000, // near-real-time while open
  });

  const { data: thread } = useQuery<{ conversation: Conversation; messages: Msg[] }>({
    queryKey: ['inboxThread', selected],
    queryFn: async () => { const r = await fetch(`${API}/api/inbox/${selected}/thread`, { credentials: 'include' }); if (!r.ok) throw new Error('load failed'); return r.json(); },
    enabled: !!selected,
  });

  const sendReply = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${API}/api/inbox/${selected}/reply`, {
        method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
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
            <button
              onClick={() => setShowTranslator(!showTranslator)}
              className={`px-3.5 py-1.5 rounded-full text-[13px] font-bold uppercase transition-all cursor-pointer flex items-center gap-1.5 ${showTranslator ? 'bg-brand-gold text-brand-navy shadow-xs border border-brand-gold/40' : 'bg-brand-navy/[0.04] border border-brand-navy/15 text-brand-navy/60 hover:text-brand-navy'}`}
            >
              ✨ AI Translator
            </button>
            <div className="flex gap-1 rounded-full border border-brand-navy/15 bg-brand-navy/[0.04] p-1 text-[13px] font-bold uppercase">
              <button onClick={() => setTeamMode(false)} className={`px-3 py-1.5 rounded-full transition-all cursor-pointer ${!teamMode ? 'bg-brand-gold text-brand-navy' : 'text-brand-navy/50 hover:text-brand-navy'}`}>Clients</button>
              <button onClick={() => setTeamMode(true)} className={`px-3 py-1.5 rounded-full transition-all cursor-pointer ${teamMode ? 'bg-brand-gold text-brand-navy' : 'text-brand-navy/50 hover:text-brand-navy'}`}>Team</button>
            </div>
            {data?.unreadTotal ? (
              <span className="rounded-full bg-rose-500/20 px-3 py-1 text-[13px] font-bold text-rose-700">{data.unreadTotal} unread</span>
            ) : (
              <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-[13px] font-bold text-emerald-700">Live</span>
            )}
          </div>
        </div>

        {showTranslator && (
          <div className="reveal rounded-2xl border border-brand-navy/10 bg-white p-5 shadow-sm">
            <div className="mb-3 border-b border-brand-navy/10 pb-2">
              <h3 className="font-display font-bold text-sm text-brand-navy">✨ AI Multilingual Communications Translator</h3>
              <p className="text-[13px] text-brand-navy/40">Translate inbound foreign language inquiries (Arabic, Urdu, Hindi, German, etc.) to English or craft client replies in their native language.</p>
            </div>
            <AiTranslatePanel />
          </div>
        )}

        {toast && <div className={`rounded-xl px-4 py-3 text-xs font-semibold ${toast.kind === 'ok' ? 'bg-emerald-500/15 text-emerald-700' : 'bg-rose-500/15 text-rose-700'}`}>{toast.text}</div>}

        {teamMode ? (
          <div className="grid flex-1 grid-cols-1 gap-5 lg:grid-cols-3">
            {/* Team rooms */}
            <div className="reveal rounded-2xl border border-brand-navy/10 bg-white p-3">
              <div className="mb-3 px-2 text-[13px] font-bold uppercase tracking-wider text-brand-gold">Team Rooms</div>
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
                <div className="text-[13px] font-bold uppercase tracking-wider text-brand-gold">{TEAM_ROOMS.find(r => r.id === roomId)?.label} — internal chat</div>
                <div className="relative" ref={membersRef}>
                  <button onClick={() => setMembersOpen(!membersOpen)} className="flex items-center gap-1.5 rounded-full border border-brand-navy/15 bg-brand-navy/[0.04] px-3 py-1 text-[13px] font-bold text-brand-navy hover:border-brand-gold/50 transition-all cursor-pointer">
                    👥 Members <span className="text-brand-navy/40">({(teamMembers?.members || []).length})</span>
                    <span className={`transition-transform ${membersOpen ? 'rotate-180' : ''}`}>▾</span>
                  </button>
                  {membersOpen && (
                    <div className="absolute right-0 top-8 z-20 w-64 rounded-xl border border-brand-navy/10 bg-white shadow-xl p-2 space-y-1">
                      {(teamMembers?.members || []).map((m: any) => (
                        <div key={m.id} className="flex items-center gap-2.5 rounded-lg px-2 py-1.5 hover:bg-brand-navy/[0.04]">
                          <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-navy text-xs font-bold text-white">{m.initials}</span>
                          <div className="min-w-0">
                            <div className="truncate text-sm font-semibold text-brand-navy">{m.name}</div>
                            <div className="truncate text-xs text-brand-navy/40">{m.role} · {m.email}</div>
                          </div>
                        </div>
                      ))}
                      {(teamMembers?.members || []).length === 0 && <p className="px-2 py-3 text-center text-[13px] text-brand-navy/40">No staff found.</p>}
                    </div>
                  )}
                </div>
              </div>
              <div className="flex-1 space-y-2 overflow-y-auto max-h-[420px] pr-1">
                {(teamThread?.messages || []).map((m: any) => (
                  <div key={m.id} className={`max-w-[80%] rounded-xl px-3 py-2 text-xs ${m.senderId === me?.id ? 'bg-brand-gold/15 ml-auto' : 'bg-brand-navy/[0.06]'}`}>
                    <div className="text-xs text-brand-navy/40 mb-0.5">{m.senderName || 'staff'} · {fmt(m.createdAt)}</div>
                    {m.body}
                    {m.file && (
                      <a href={`/api/teamhub/files/${encodeURIComponent(m.file.key)}`} download={m.file.name} className="mt-1.5 flex items-center gap-2 rounded-lg border border-brand-navy/15 bg-white px-2.5 py-1.5 text-[13px] font-bold text-brand-navy hover:border-brand-gold/50 transition-all">
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
          <div className="reveal rounded-2xl border border-brand-navy/10 bg-white/95 p-4 shadow-[0_20px_50px_-20px_rgba(10,45,80,0.10)] backdrop-blur-sm flex flex-col">
            <div className="mb-3 flex items-center justify-between px-1">
              <span className="text-[13px] font-extrabold uppercase tracking-[0.2em] text-brand-gold flex items-center gap-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-gold" />
                Active Inbound Streams
              </span>
              <span className="text-[13px] font-bold text-brand-textLight">{(data?.conversations || []).length} chats</span>
            </div>
            <div className="relative mb-3">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search conversations, clients, phones…"
                className="w-full rounded-xl border border-brand-navy/15 bg-white px-3.5 py-2.5 text-xs text-brand-navy placeholder:text-brand-navy/35 outline-none transition-all focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 font-sans shadow-xs"
              />
            </div>
            {isLoading && <p className="p-8 text-center text-xs text-brand-textLight">Loading conversations…</p>}
            {!isLoading && (!data?.conversations || data.conversations.length === 0) && (
              <div className="p-8 text-center">
                <p className="text-xs font-semibold text-brand-textLight">No conversations yet.</p>
                <p className="text-[13px] text-brand-textLight mt-1">Inbound WhatsApp, Email, or Web chats will appear here live.</p>
              </div>
            )}
            <div className="space-y-2 overflow-y-auto max-h-[520px] pr-1 scrollbar-thin">
              {(data?.conversations || []).filter((c: any) => {
                if (!search.trim()) return true;
                const q = search.toLowerCase();
                return (c.contactName || '').toLowerCase().includes(q) || (c.contactKey || '').includes(q) || (c.lastMessage || '').toLowerCase().includes(q);
              }).map((c) => {
                const isSelected = selected === c.id;
                const isWa = c.channel?.toLowerCase().includes('wa') || c.channel?.toLowerCase().includes('whatsapp');
                return (
                <button
                  key={c.id}
                  onClick={() => setSelected(c.id)}
                  className={`group w-full rounded-xl p-3.5 text-left transition-all duration-200 cursor-pointer ${
                    isSelected 
                      ? 'bg-gradient-to-r from-brand-gold/20 via-brand-gold/10 to-transparent border border-brand-gold/60 shadow-xs' 
                      : 'bg-brand-navy/[0.02] border border-brand-navy/10 hover:bg-brand-navy/[0.05] hover:border-brand-navy/20'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[13px] font-black ${isWa ? 'bg-emerald-500/20 text-emerald-700' : 'bg-blue-500/20 text-blue-700'}`}>
                        {isWa ? '💬' : '🌐'}
                      </span>
                      <span className="truncate text-xs font-extrabold text-brand-navy tracking-tight">{c.contactName || c.contactKey}</span>
                    </div>
                    {c.unread > 0 && (
                      <span className="rounded-full bg-rose-500 px-1.5 py-0.2 text-xs font-black text-white shadow-[0_0_6px_rgba(244,63,94,0.6)] animate-pulse">{c.unread}</span>
                    )}
                  </div>
                  <p className="mt-1.5 truncate text-sm font-medium text-brand-textLight">{c.lastMessage || 'No recent messages'}</p>
                  <div className="mt-2 flex items-center justify-between pt-1 border-t border-brand-navy/5 text-xs font-bold text-brand-navy/40">
                    <span className="uppercase tracking-wider">{c.channel}</span>
                    <span>{fmt(c.lastMessageAt)}</span>
                  </div>
                </button>
                );
              })}
            </div>
          </div>

          {/* Thread Panel */}
          <div className="reveal rounded-2xl border border-brand-navy/10 bg-white/95 p-5 shadow-[0_20px_50px_-20px_rgba(10,45,80,0.10)] backdrop-blur-sm lg:col-span-2 flex flex-col">
            {!selected ? (
              <div className="flex h-full min-h-[400px] flex-col items-center justify-center text-center p-8">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-brand-gold/10 border border-brand-gold/30 mb-3">
                  <span className="text-2xl">📬</span>
                </div>
                <h4 className="font-display font-extrabold text-sm text-brand-navy">No conversation selected</h4>
                <p className="mt-1 text-xs text-brand-textLight max-w-sm">Select an inbound thread from the left to read messages, use AI translation, and dispatch verified replies.</p>
              </div>
            ) : (
              <div className="flex h-full flex-col">
                <div className="mb-3 flex items-center justify-between border-b border-brand-navy/10 pb-3">
                  <div className="flex items-center gap-3">
                    <div className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-brand-navy to-brand-blue text-sm font-black text-white shadow-xs">
                      {(thread?.conversation.contactName || thread?.conversation.contactKey || 'C').charAt(0).toUpperCase()}
                    </div>
                    <div>
                      <p className="font-display text-sm font-black text-brand-navy tracking-tight">{thread?.conversation.contactName || thread?.conversation.contactKey}</p>
                      <p className="text-[13px] font-semibold text-brand-textLight uppercase tracking-wider">{thread?.conversation.channel} · {thread?.conversation.contactKey}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setShowTranslator(!showTranslator)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-xs ${showTranslator ? 'bg-brand-gold text-brand-navy' : 'bg-brand-navy/[0.05] border border-brand-navy/10 text-brand-navy hover:border-brand-gold'}`}
                    >
                      ✨ AI Translator
                    </button>
                    {me && <span className="hidden sm:inline text-[13px] font-semibold text-brand-textLight">Replying as <strong className="text-brand-navy">{me.name?.split(' ')[0]}</strong></span>}
                  </div>
                </div>

                {showTranslator && (
                  <div className="mb-3">
                    <AiTranslatePanel />
                  </div>
                )}

                {/* Message Stream */}
                <div className="flex-1 space-y-3 overflow-y-auto pr-1.5 scrollbar-thin" style={{ maxHeight: '46vh', minHeight: '260px' }}>
                  {(thread?.messages || []).map((m) => {
                    const isOut = m.direction === 'outgoing';
                    return (
                    <div key={m.id} className={`max-w-[78%] rounded-2xl px-4 py-3 text-xs shadow-xs transition-all ${
                      isOut 
                        ? 'ml-auto bg-gradient-to-r from-[#0a2d50] to-[#0d3b66] text-white rounded-br-xs' 
                        : 'bg-[#f4f1ea] text-brand-navy border border-brand-navy/10 rounded-bl-xs'
                    }`}>
                      <p className="leading-relaxed text-[12px] font-medium">{m.body}</p>
                      <div className={`mt-1.5 flex items-center justify-end gap-1.5 text-xs font-semibold ${isOut ? 'text-white/60' : 'text-brand-navy/40'}`}>
                        <span>{fmt(m.createdAt)}</span>
                        {isOut && <span>✓✓</span>}
                      </div>
                    </div>
                    );
                  })}
                  {thread && thread.messages.length === 0 && (
                    <p className="p-8 text-center text-xs text-brand-textLight italic">No messages in this thread yet. Send a greeting to initiate contact.</p>
                  )}
                </div>

                {/* Canned macro reply pills */}
                <div className="mt-3 flex flex-wrap gap-1.5 border-t border-brand-navy/10 pt-3">
                  <span className="text-[13px] font-bold text-brand-gold uppercase tracking-wider self-center mr-1">Quick:</span>
                  {[
                    "Hello! How can we assist you today?",
                    "Documents received. We are reviewing them now.",
                    "Your application status has been updated in your portal.",
                    "Please let us know your convenient time for a quick call."
                  ].map((macro) => (
                    <button
                      key={macro}
                      type="button"
                      onClick={() => setReply(macro)}
                      className="rounded-lg border border-brand-navy/10 bg-brand-navy/[0.02] px-2.5 py-1 text-[13px] font-medium text-brand-navy hover:border-brand-gold hover:bg-brand-gold/10 transition-colors cursor-pointer"
                    >
                      {macro}
                    </button>
                  ))}
                </div>

                {/* Reply Form */}
                <form
                  onSubmit={(e) => { e.preventDefault(); if (reply.trim() && selected) sendReply.mutate(); }}
                  className="mt-3 flex gap-2"
                >
                  <input
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder="Type a verified WhatsApp / omnichannel reply…"
                    className="flex-1 rounded-xl border border-brand-navy/15 bg-white px-4 py-3 text-xs text-brand-navy placeholder:text-brand-navy/40 focus:border-brand-gold focus:ring-2 focus:ring-brand-gold/20 focus:outline-none font-sans shadow-xs"
                  />
                  <button type="submit" disabled={sendReply.isPending || !reply.trim()} className="rounded-xl bg-gradient-to-r from-brand-gold to-amber-500 px-6 py-3 text-xs font-black uppercase tracking-wider text-brand-navy shadow-md transition-all hover:brightness-110 active:scale-95 disabled:opacity-40 cursor-pointer">
                    {sendReply.isPending ? 'Sending…' : 'Send Reply →'}
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
