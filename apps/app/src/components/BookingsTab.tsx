import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRevealRoot } from '../lib/reveal';

const AUTH = {
  get Cookie() {
    const s = document.cookie.split(';').map(p => p.trim()).find(p => p.startsWith('better-auth.session_token='));
    return s || '';
  }
} as Record<string, string>;

const DIV_LABELS: Record<string, string> = {
  'study-abroad': 'Study Abroad', visa: 'Visa', manpower: 'Manpower',
};

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    scheduled: 'bg-emerald-500/15 text-emerald-700',
    rescheduled: 'bg-amber-500/15 text-amber-700',
    cancelled: 'bg-rose-500/15 text-rose-600',
    completed: 'bg-brand-navy/[0.06] text-brand-navy/50',
    no_show: 'bg-rose-500/15 text-rose-600',
  };
  return <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase ${map[status] || 'bg-brand-navy/[0.06] text-brand-navy/50'}`}>{status}</span>;
}

function BookingRow({ b }: { b: any }) {
  const d = new Date(b.startTime * 1000);
  return (
    <div className="flex justify-between items-center bg-brand-navy/[0.06] border border-brand-navy/10 rounded px-3 py-2 text-xs">
      <div>
        <span className="text-brand-navy font-semibold">{b.title}</span>
        <span className="text-brand-navy/40"> · {DIV_LABELS[b.division] || b.division}</span>
        <div className="text-[10px] text-brand-navy/50 mt-0.5">
          {b.attendeeName || 'Attendee'}{b.attendeeEmail ? ` · ${b.attendeeEmail}` : ''}
          {b.clientId ? ` · client ${b.clientId}` : ''}
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <span className="font-mono text-brand-navy/40">{d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} {d.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}</span>
        <StatusBadge status={b.status} />
      </div>
    </div>
  );
}

export default function BookingsTab() {
  const rootRef = useRevealRoot<HTMLDivElement>();
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<any>({
    queryKey: ['calBookings'],
    queryFn: async () => {
      const r = await fetch('/api/cal/bookings', { headers: AUTH });
      if (!r.ok) throw new Error('bookings');
      return r.json();
    },
    refetchInterval: 60000,
  });
  const { data: cfg } = useQuery<any>({ queryKey: ['calConfig'], queryFn: async () => (await fetch('/api/cal/config', { headers: AUTH })).json() });
  const [cfgForm, setCfgForm] = useState<any>({});
  const [showCfg, setShowCfg] = useState(false);

  const saveCfg = useMutation({
    mutationFn: async () => {
      const r = await fetch('/api/cal/config', { method: 'POST', headers: { 'Content-Type': 'application/json', ...AUTH }, body: JSON.stringify(cfgForm) });
      if (!r.ok) throw new Error('cfg');
      return r.json();
    },
    onSuccess: (d) => { alert(d.message); setCfgForm({}); qc.invalidateQueries({ queryKey: ['calConfig'] }); },
    onError: () => alert('Save failed'),
  });

  if (isLoading) return <div className="p-10 text-center text-xs text-brand-navy/50">Loading consultations…</div>;

  return (
    <div ref={rootRef} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="gold-dot" />
            <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-gold">Consultations</span>
          </div>
          <h2 className="font-display font-bold text-base text-brand-navy">Cal.com Bookings — Study Abroad · Visa · Manpower</h2>
        </div>
        <button onClick={() => setShowCfg(!showCfg)} className="border border-brand-navy/15 bg-brand-navy/[0.04] text-brand-navy hover:border-brand-gold/50 px-4 py-2 rounded text-xs font-bold transition cursor-pointer">
          ⚙ Config
        </button>
      </div>

      {/* Config panel */}
      {showCfg && (
        <div className="reveal rounded-2xl border border-brand-navy/10 bg-white p-5 space-y-3">
          <div className="flex items-center gap-2">
            <span className="gold-dot" />
            <h3 className="font-display font-bold text-sm text-brand-navy">Cal.com Configuration</h3>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
            <div>
              <label className="text-[10px] text-brand-navy/40 font-bold uppercase block mb-1">API key {cfg?.apiKey ? <span className="text-emerald-600">(saved {cfg.apiKey})</span> : null}</label>
              <input value={cfgForm.apiKey || ''} onChange={e => setCfgForm({ ...cfgForm, apiKey: e.target.value })} placeholder="cal_live_…" type="password" className="w-full bg-white border border-brand-navy/10 rounded px-3 py-2 text-xs text-brand-navy placeholder:text-brand-navy/40" />
            </div>
            <div>
              <label className="text-[10px] text-brand-navy/40 font-bold uppercase block mb-1">Webhook secret</label>
              <input value={cfgForm.webhookSecret || ''} onChange={e => setCfgForm({ ...cfgForm, webhookSecret: e.target.value })} placeholder="From cal.com → Developer → Webhooks" type="password" className="w-full bg-white border border-brand-navy/10 rounded px-3 py-2 text-xs text-brand-navy placeholder:text-brand-navy/40" />
            </div>
            <div>
              <label className="text-[10px] text-brand-navy/40 font-bold uppercase block mb-1">Event types JSON (division → eventTypeId)</label>
              <input value={cfgForm.eventTypes ? JSON.stringify(cfgForm.eventTypes) : ''} onChange={e => { try { setCfgForm({ ...cfgForm, eventTypes: JSON.parse(e.target.value) }); } catch { /* typing */ } }} placeholder='{"study-abroad":"123","visa":"456","manpower":"789"}' className="w-full bg-white border border-brand-navy/10 rounded px-3 py-2 text-xs text-brand-navy placeholder:text-brand-navy/40" />
            </div>
            <div>
              <label className="text-[10px] text-brand-navy/40 font-bold uppercase block mb-1">Booking links JSON (division → cal.com URL)</label>
              <input value={cfgForm.bookingLinks ? JSON.stringify(cfgForm.bookingLinks) : ''} onChange={e => { try { setCfgForm({ ...cfgForm, bookingLinks: JSON.parse(e.target.value) }); } catch { /* typing */ } }} placeholder='{"study-abroad":"https://cal.com/you/study-abroad","visa":"https://cal.com/you/visa","manpower":"https://cal.com/you/manpower"}' className="w-full bg-white border border-brand-navy/10 rounded px-3 py-2 text-xs text-brand-navy placeholder:text-brand-navy/40" />
            </div>
          </div>
          <button onClick={() => saveCfg.mutate()} className="bg-brand-gold hover:bg-brand-gold/90 text-brand-navy px-4 py-2 rounded text-xs font-bold cursor-pointer">💾 Save Config</button>
          <p className="text-[10px] text-brand-navy/40">Webhook URL: <code className="font-mono">https://&lt;api&gt;/api/webhooks/cal</code> — set it in cal.com → Settings → Developer → Webhooks with triggers: booking.created / cancelled / rescheduled / meeting.ended.</p>
        </div>
      )}

      {/* Counts */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { label: 'Today', value: data?.counts?.today ?? 0, cls: 'text-brand-gold' },
          { label: 'Upcoming', value: data?.counts?.upcoming ?? 0, cls: 'text-brand-navy' },
          { label: 'Completed', value: data?.counts?.completed ?? 0, cls: 'text-emerald-700' },
          { label: 'Cancelled', value: data?.counts?.cancelled ?? 0, cls: 'text-rose-600' },
        ].map(k => (
          <div key={k.label} className="rounded-2xl border border-brand-navy/10 bg-white p-4">
            <div className="text-[9px] font-bold uppercase tracking-[0.18em] text-brand-navy/40">{k.label}</div>
            <div className={`mt-1 font-display font-extrabold text-2xl ${k.cls}`}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* Today */}
      <div className="reveal rounded-2xl border border-brand-navy/10 bg-white p-5 space-y-3">
        <div className="flex items-center gap-2">
          <span className="gold-dot" />
          <h3 className="font-display font-bold text-sm text-brand-navy">Today's Consultations ({data?.today?.length ?? 0})</h3>
        </div>
        <div className="space-y-1.5">
          {(data?.today || []).map((b: any) => <BookingRow key={b.id} b={b} />)}
          {(data?.today || []).length === 0 && <p className="text-[10px] text-brand-navy/40 text-center py-2">No consultations today.</p>}
        </div>
      </div>

      {/* Upcoming */}
      <div className="reveal rounded-2xl border border-brand-navy/10 bg-white p-5 space-y-3">
        <div className="flex items-center gap-2">
          <span className="gold-dot" />
          <h3 className="font-display font-bold text-sm text-brand-navy">Upcoming ({data?.upcoming?.length ?? 0})</h3>
        </div>
        <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
          {(data?.upcoming || []).map((b: any) => <BookingRow key={b.id} b={b} />)}
          {(data?.upcoming || []).length === 0 && <p className="text-[10px] text-brand-navy/40 text-center py-2">No upcoming consultations.</p>}
        </div>
      </div>

      {/* Past */}
      <div className="reveal rounded-2xl border border-brand-navy/10 bg-white p-5 space-y-3">
        <div className="flex items-center gap-2">
          <span className="gold-dot" />
          <h3 className="font-display font-bold text-sm text-brand-navy">Past & Cancelled (last 50)</h3>
        </div>
        <div className="space-y-1.5 max-h-72 overflow-y-auto pr-1">
          {(data?.past || []).map((b: any) => <BookingRow key={b.id} b={b} />)}
          {(data?.past || []).length === 0 && <p className="text-[10px] text-brand-navy/40 text-center py-2">No past bookings yet.</p>}
        </div>
      </div>
    </div>
  );
}