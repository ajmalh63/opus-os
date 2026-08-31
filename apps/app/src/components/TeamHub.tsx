import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRevealRoot } from '../lib/reveal';
const API = (import.meta as any).env?.VITE_API_URL || '';

// Team Hub (§5.5) — staff chat rooms (Durable Object per room) + R2 team drive.
// Polling-safe free-tier design: DO history is capped at 500 msgs; the panel
// polls `after` timestamps every 4s when focused.


interface Msg { id: string; senderId: string; senderName: string; body: string; ts: number; }

const ROOMS = [
  { id: 'ops', label: 'Operations', icon: 'M3 12l9-9 9 9M5 10v10h5v-6h4v6h5V10' },
  { id: 'sales', label: 'Sales & Funnel', icon: 'M3 3v18h18M7 14l4-4 3 3 5-6' },
  { id: 'finance', label: 'Finance & Compliance', icon: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z' },
  { id: 'umrah', label: 'Tours & Travels', icon: 'M12 3v18M3 12h18M12 12l-3-3m3 3l3-3' },
];

export default function TeamHub() {
  const [roomId, setRoomId] = useState('ops');
  const [after, setAfter] = useState(0);
  const [draft, setDraft] = useState('');
  const [meName, setMeName] = useState('Staff');
  const queryClient = useQueryClient();
  const boxRef = useRef<HTMLDivElement>(null);
  const rootRef = useRevealRoot<HTMLDivElement>();

  useEffect(() => {
    fetch(`${API}/api/auth/me`, { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => { if (d?.user?.name) setMeName(d.user.name); })
      .catch(() => {});
  }, []);

  const { data: msgs } = useQuery<{ messages: Msg[] }>({
    queryKey: ['teamMessages', roomId, after],
    queryFn: async () => {
      const r = await fetch(`${API}/api/teamhub/rooms/${roomId}/messages?after=${after}`, { credentials: 'include' });
      if (!r.ok) throw new Error('hub');
      return r.json();
    },
    refetchInterval: 4000,
  });

  const { data: files } = useQuery<{ files: any[] }>({
    queryKey: ['teamFiles'],
    queryFn: async () => { const r = await fetch(`${API}/api/teamhub/files`, { credentials: 'include' }); if (!r.ok) throw new Error('files'); return r.json(); },
  });

  const send = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${API}/api/teamhub/rooms/${roomId}/messages`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', },
        body: JSON.stringify({ body: draft }),
      });
      if (!r.ok) throw new Error('send');
      return r.json();
    },
    onSuccess: () => { setDraft(''); setAfter(Math.floor(Date.now() / 1000) - 4000); queryClient.invalidateQueries({ queryKey: ['teamMessages'] }); },
  });

  const all = msgs?.messages || [];
  useEffect(() => {
    boxRef.current?.scrollTo({ top: boxRef.current.scrollHeight, behavior: 'smooth' });
  }, [all.length]);

  return (
    <div ref={rootRef} className="grid min-h-full grid-cols-1 gap-5 lg:grid-cols-3">
      <div className="reveal lg:col-span-2 rounded-2xl border border-brand-navy/10 bg-white shadow-[0_20px_40px_-20px_rgba(10,45,80,0.10)]">
        <div className="flex flex-wrap items-center gap-2 border-b border-brand-navy/10 px-5 py-3">
          <h2 className="mr-2 font-display text-sm font-bold text-brand-navy">Team Hub</h2>
          {ROOMS.map((r) => (
            <button key={r.id} onClick={() => { setRoomId(r.id); setAfter(0); }}
              className={`inline-flex cursor-pointer items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-bold transition-all ${roomId === r.id ? 'bg-brand-gold text-brand-navy' : 'border border-brand-navy/15 text-brand-navy/70 hover:border-brand-gold hover:text-brand-gold'}`}>
              <svg className="h-3 w-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d={r.icon} /></svg>
              {r.label}
            </button>
          ))}
        </div>

        <div ref={boxRef} className="h-[46vh] space-y-3 overflow-y-auto px-5 py-4">
          {all.length === 0 && <p className="pt-10 text-center text-xs text-brand-navy/50">No messages yet — start the conversation.</p>}
          {all.map((m) => (
            <div key={m.id} className={`flex ${m.senderName === meName ? 'justify-end' : 'justify-start'}`}>
              <div className={`max-w-[75%] rounded-2xl px-3.5 py-2 text-xs ${m.senderName === meName ? 'bg-brand-gold/15 text-brand-navy border border-brand-gold/30' : 'border border-brand-navy/10 bg-brand-navy/[0.04] text-brand-navy'}`}>
                <div className="mb-0.5 flex items-baseline gap-2">
                  <span className={`text-[13px] font-bold uppercase tracking-wider ${m.senderName === meName ? 'text-brand-gold' : 'text-brand-navy/50'}`}>{m.senderName}</span>
                  <span className="text-xs opacity-60">{new Date(m.ts * 1000).toLocaleTimeString()}</span>
                </div>
                <p className="leading-relaxed">{m.body}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-2 border-t border-brand-navy/10 px-5 py-3">
          <input value={draft} onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && draft.trim()) send.mutate(); }}
            placeholder={`Message ${ROOMS.find((r) => r.id === roomId)?.label || ''}…`}
            className="flex-1 rounded-xl border border-brand-navy/10 bg-white px-3.5 py-2.5 text-xs text-brand-navy placeholder:text-brand-navy/40 focus:border-brand-gold focus:outline-none" />
          <button onClick={() => send.mutate()} disabled={send.isPending || !draft.trim()}
            className="cursor-pointer rounded-xl bg-brand-gold px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-brand-navy transition-all hover:bg-brand-gold/90 active:scale-[0.97] disabled:opacity-40">
            Send
          </button>
        </div>
      </div>

      <div className="reveal rounded-2xl border border-brand-navy/10 bg-white shadow-[0_20px_40px_-20px_rgba(10,45,80,0.10)]">
        <div className="border-b border-brand-navy/10 px-5 py-3">
          <h3 className="font-display text-sm font-bold text-brand-navy">Team Drive</h3>
          <p className="text-[13px] text-brand-navy/50">Shared files in R2 (team/)</p>
        </div>
        <div className="max-h-[46vh] space-y-1.5 overflow-y-auto px-3 py-3">
          {(files?.files || []).length === 0 && <p className="px-2 pt-8 text-center text-xs text-brand-navy/50">No shared files yet.</p>}
          {(files?.files || []).map((f) => (
            <div key={f.key} className="flex items-center gap-2 rounded-lg border border-brand-navy/10 bg-brand-navy/[0.04] px-3 py-2 text-sm">
              <svg className="h-4 w-4 shrink-0 text-brand-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
              <span className="truncate text-brand-navy/70">{f.key.replace('team/', '')}</span>
              <span className="ml-auto font-mono text-xs text-brand-navy/50">{(f.size / 1024).toFixed(0)}KB</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}