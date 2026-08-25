import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';

export function PortalMessages({ token }: { token: string }) {
  const qc = useQueryClient();
  const [body, setBody] = useState('');
  const { data, isLoading } = useQuery<any>({
    queryKey: ['portalMessages', token],
    queryFn: async () => {
      const r = await fetch('/api/public/portal/messages', { headers: token ? { 'X-Portal-Token': token } : {} });
      if (!r.ok) return { messages: [] };
      return r.json();
    },
    enabled: !!token,
    refetchInterval: 10000,
  });
  const send = async () => {
    if (!body.trim()) return;
    await fetch('/api/public/portal/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Portal-Token': token },
      body: JSON.stringify({ body: body.trim() }),
    });
    setBody('');
    qc.invalidateQueries({ queryKey: ['portalMessages'] });
  };
  return (
    <div className="rounded-2xl border border-brand-navy/10 bg-white p-4 space-y-3">
      <div className="text-xs font-bold text-brand-navy">Messages — Counselor thread (realtime)</div>
      <div className="max-h-64 overflow-y-auto space-y-2 bg-brand-navy/[0.02] rounded-xl p-3">
        {(data?.messages || []).length === 0 && <div className="text-[11px] text-brand-navy/40 text-center py-6">No messages yet — say hello, your counselor replies here (not WhatsApp).</div>}
        {(data?.messages || []).map((m:any)=> (
          <div key={m.id} className={`max-w-[85%] rounded-xl px-3 py-2 text-xs ${m.direction==='inbound' ? 'bg-brand-navy text-white ml-auto' : 'bg-white border border-brand-navy/10'}`}>
            <div>{m.body}</div>
            <div className="text-[9px] opacity-60 mt-1">{new Date(m.createdAt*1000).toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' })}</div>
          </div>
        ))}
        {isLoading && <div className="text-[10px] text-brand-navy/30">Loading…</div>}
      </div>
      <div className="flex gap-2">
        <input value={body} onChange={e=>setBody(e.target.value)} onKeyDown={e=> e.key==='Enter' && !e.shiftKey && (e.preventDefault(), send())} placeholder="Type a message… (Shift+Enter newline)" className="flex-1 border border-brand-navy/10 rounded-full px-4 py-2 text-xs" />
        <button onClick={send} className="bg-brand-navy text-white px-4 py-2 rounded-full text-xs font-bold">Send</button>
      </div>
      <p className="text-[10px] text-brand-navy/40">Staff sees this in Inbox → `staff:global:messages` realtime. No email needed.</p>
    </div>
  );
}
