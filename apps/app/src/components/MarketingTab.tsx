import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useRevealRoot } from '../lib/reveal';

// ── Marketing Automation — CONTROL PANEL (Tool-First, Phase 1) ─────────────
// Operations happen in the backend tools through their VPC APIs (Listmonk
// email, Mautic journeys, Chatwoot conversations, OpenWA WhatsApp); this UI
// is the unified control plane: every action routes via the OS command
// envelope (RBAC + audit), every read via the adapter passthrough.

const AUTH = {
  get Cookie() {
    const s = document.cookie.split(';').map((p: string) => p.trim()).find((p: string) => p.startsWith('better-auth.session_token='));
    return s || '';
  }
} as Record<string, string>;

const getJson = async (url: string) => { const r = await fetch(url, { headers: AUTH }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); };
const postCmd = async (tool: string, resource: string, action: string, body: any) => {
  const r = await fetch(`/api/integrations/${tool}/${resource}/${action}`, { method: 'POST', headers: { ...AUTH, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const d = await r.json().catch(() => ({}));
  if (!r.ok || d.ok === false) throw new Error(d.error || `HTTP ${r.status}`);
  return d.result;
};

const STATE_STYLE: Record<string, string> = {
  ok: 'bg-emerald-500/15 text-emerald-700',
  unconfigured: 'bg-slate-500/15 text-slate-400',
  error: 'bg-rose-500/15 text-rose-700',
};

type LiveData = { tools: any[]; feed: any[] };

const REL = (at: number) => {
  const s = Math.floor(Date.now() / 1000) - at;
  if (s < 90) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

function ErrPanel({ what, onRetry }: { what: string; onRetry: any }) {
  return (
    <div className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-6 text-center">
      <p className="text-[11px] font-bold text-amber-800">Unable to load {what} — tool may be unconfigured.</p>
      <button onClick={onRetry} className="mt-2 text-[10px] font-bold uppercase text-brand-gold hover:underline">Retry</button>
    </div>
  );
}

// ── Overview: live board (tool status + event feed) ────────────────────────
function Overview({ live }: { live: LiveData }) {
  return (
    <div className="space-y-6">
      <section className="reveal grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {live.tools.map((t) => (
          <div key={t.tool} className={`rounded-2xl border p-4 shadow-[0_16px_30px_-18px_rgba(10,45,80,0.10)] transition-all duration-300 hover:border-brand-gold/40 ${t.status.state === 'ok' ? 'border-emerald-500/30 bg-white' : 'border-brand-navy/10 bg-white'}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-display text-sm font-extrabold text-brand-navy">{t.label}</span>
              <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${STATE_STYLE[t.status.state] || STATE_STYLE.unconfigured}`}>{t.status.state}</span>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-brand-navy/40">{t.status.summary}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {Object.entries(t.metrics || {}).map(([k, v]) => (
                <span key={k} className="rounded bg-brand-navy/[0.05] px-1.5 py-0.5 font-mono text-[10px] text-brand-navy/40">{k}: {String(v ?? '—')}</span>
              ))}
            </div>
          </div>
        ))}
      </section>
      <section className="reveal rounded-2xl border border-brand-navy/10 bg-white p-4 shadow-[0_20px_40px_-15px_rgba(10,45,80,0.10)]">
        <div className="text-[10px] font-bold uppercase tracking-widest text-brand-navy/40">Live event feed · {live.feed.length} items</div>
        <div className="mt-3 max-h-72 space-y-1 overflow-y-auto pr-1">
          {live.feed.map((f: any) => (
            <div key={`${f.tool}-${f.kind}-${f.id}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] hover:bg-brand-gold/10">
              <span className={`w-16 shrink-0 rounded px-1 py-0.5 text-center font-bold uppercase ${STATE_STYLE.ok}`}>{f.tool}</span>
              <span className="min-w-0 flex-1 truncate text-brand-navy/70">{f.title}</span>
              {f.detail && <span className="hidden truncate text-[10px] text-brand-navy/50 md:block md:max-w-[16rem]">{f.detail}</span>}
              <span className="shrink-0 text-[10px] text-brand-navy/50">{REL(f.at)}</span>
            </div>
          ))}
          {live.feed.length === 0 && <div className="py-8 text-center text-[11px] text-brand-navy/50">No tool events yet.</div>}
        </div>
      </section>
    </div>
  );
}

// ── Campaigns: list + create / activate / pause / test / delete ────────────
function CampaignsView() {
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['lm-campaigns'], queryFn: () => getJson('/api/integrations/listmonk/campaigns?perPage=50&page=1') });
  const [show, setShow] = useState(false);
  const [form, setForm] = useState({ name: '', subject: '', lists: '', body: '' });
  const invalidate = () => { qc.invalidateQueries({ queryKey: ['lm-campaigns'] }); qc.invalidateQueries({ queryKey: ['integrationsLive'] }); };
  const act = useMutation({ mutationFn: async ({ id, action, body }: { id: number; action: string; body?: any }) => postCmd('listmonk', 'campaigns', action, { id, ...body }), onSuccess: invalidate, onError: (e: any) => alert((e as Error).message) });
  const create = useMutation({
    mutationFn: () => postCmd('listmonk', 'campaigns', 'create', { name: form.name.trim(), subject: form.subject.trim(), lists: form.lists.split(',').map((s) => Number(s.trim())).filter((n) => n > 0), body: form.body, type: 'regular' }),
    onSuccess: () => { invalidate(); setShow(false); setForm({ name: '', subject: '', lists: '', body: '' }); },
    onError: (e: any) => alert((e as Error).message),
  });

  if (isLoading) return <div className="p-10 text-center text-xs text-brand-navy/50">Loading campaigns…</div>;
  if (error) return <ErrPanel what="campaigns" onRetry={refetch} />;

  const rows: any[] = data?.data || [];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-brand-navy/40">{rows.length} campaigns — live from Listmonk; every action is audited through the OS.</p>
        <button onClick={() => setShow((v) => !v)} className="rounded-full bg-brand-gold px-4 py-2 text-[11px] font-extrabold uppercase text-brand-navy hover:bg-brand-gold/90">{show ? 'Close' : '+ New campaign'}</button>
      </div>
      {show && (
        <div className="space-y-2 rounded-2xl border border-brand-navy/10 bg-white p-4">
          <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Campaign name" className="w-full rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-xs text-brand-navy placeholder:text-brand-navy/40 focus:border-brand-gold focus:outline-none" />
          <input value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} placeholder="Email subject" className="w-full rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-xs text-brand-navy placeholder:text-brand-navy/40 focus:border-brand-gold focus:outline-none" />
          <input value={form.lists} onChange={(e) => setForm({ ...form, lists: e.target.value })} placeholder="List IDs (comma-separated — see Audiences tab)" className="w-full rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-xs text-brand-navy placeholder:text-brand-navy/40 focus:border-brand-gold focus:outline-none" />
          <textarea value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} placeholder={'HTML body — {{ name }} placeholders supported'} rows={5} className="w-full rounded-lg border border-brand-navy/10 bg-white px-3 py-2 font-mono text-xs text-brand-navy placeholder:text-brand-navy/40 focus:border-brand-gold focus:outline-none" />
          <button onClick={() => create.mutate()} disabled={create.isPending || !form.name.trim() || !form.subject.trim()} className="rounded-full bg-brand-gold px-4 py-2 text-[11px] font-bold uppercase text-brand-navy hover:bg-brand-gold/90 disabled:opacity-40">
            {create.isPending ? 'Creating…' : 'Create in Listmonk'}
          </button>
        </div>
      )}
      <div className="space-y-2">
        {rows.map((c: any) => (
          <div key={c.id} className="flex flex-wrap items-center gap-2 rounded-xl border border-brand-navy/10 bg-white px-3 py-2 transition-all duration-300 hover:border-brand-gold/40">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-semibold text-brand-navy">{c.name || `Campaign ${c.id}`}</span>
              <span className="block truncate text-[10px] text-brand-navy/50">{c.subject} · lists [{String(c.lists || []).slice(0, 40)}]</span>
            </span>
            <span className={`rounded px-1.5 py-0.5 text-[9px] font-bold uppercase ${STATE_STYLE[c.status === 'running' ? 'ok' : c.status === 'paused' ? 'error' : 'unconfigured']}`}>{c.status}</span>
            {c.status !== 'running' && <button onClick={() => act.mutate({ id: c.id, action: 'status', body: { status: 'running' } })} className="rounded-full border border-emerald-500/40 px-2 py-1 text-[9px] font-bold uppercase text-emerald-700 hover:bg-emerald-600 hover:text-white">Activate</button>}
            {c.status === 'running' && <button onClick={() => act.mutate({ id: c.id, action: 'status', body: { status: 'paused' } })} className="rounded-full border border-rose-500/40 px-2 py-1 text-[9px] font-bold uppercase text-rose-700 hover:bg-rose-600 hover:text-white">Pause</button>}
            <button onClick={() => { const e = prompt('Test emails (comma-separated):'); if (e) act.mutate({ id: c.id, action: 'test', body: { emails: e.split(',').map((s) => s.trim()).filter(Boolean) } }); }} className="rounded-full border border-brand-gold/50 px-2 py-1 text-[9px] font-bold uppercase text-brand-gold hover:bg-brand-gold hover:text-brand-navy">Send test</button>
            <button onClick={() => { if (confirm('Delete campaign?')) act.mutate({ id: c.id, action: 'delete' }); }} className="rounded-full border border-brand-navy/15 px-2 py-1 text-[9px] font-bold uppercase text-brand-navy/50 hover:bg-rose-600 hover:text-white">Delete</button>
          </div>
        ))}
        {rows.length === 0 && <div className="py-8 text-center text-[11px] text-brand-navy/50">No campaigns in Listmonk yet — create one above.</div>}
      </div>
    </div>
  );
}

// ── Templates: list + create + delete ──────────────────────────────────────
function TemplatesView() {
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['lm-templates'], queryFn: () => getJson('/api/integrations/listmonk/templates?perPage=30&page=1') });
  const invalidate = () => qc.invalidateQueries({ queryKey: ['lm-templates'] });
  const del = useMutation({ mutationFn: (id: number) => postCmd('listmonk', 'templates', 'delete', { id }), onSuccess: invalidate, onError: (e: any) => alert((e as Error).message) });

  if (isLoading) return <div className="p-10 text-center text-xs text-brand-navy/50">Loading templates…</div>;
  if (error) return <ErrPanel what="templates" onRetry={refetch} />;

  const rows: any[] = data?.data || [];
  return (
    <div className="space-y-4">
      <p className="text-[11px] text-brand-navy/40">{rows.length} templates — stored in Listmonk, rendered by the email engine.</p>
      <div className="grid gap-2 md:grid-cols-2">
        {rows.map((t: any) => (
          <div key={t.id} className="flex items-center justify-between gap-2 rounded-xl border border-brand-navy/10 bg-white px-3 py-2 transition-all duration-300 hover:border-brand-gold/40">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-semibold text-brand-navy">{t.name}</span>
              <span className="block truncate text-[10px] text-brand-navy/50">{t.subject || 'no subject'} · default: {t.is_default ? 'yes' : 'no'}</span>
            </span>
            <button onClick={() => del.mutate(t.id)} className="rounded-full border border-brand-navy/15 px-2 py-1 text-[9px] font-bold uppercase text-brand-navy/50 hover:bg-rose-600 hover:text-white">Delete</button>
          </div>
        ))}
      </div>
      {/*PART3*/}
    </div>
  );
}

// ── Audiences: Listmonk lists + subscriber creation ────────────────────────
function AudiencesView() {
  const qc = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['lm-lists'], queryFn: () => getJson('/api/integrations/listmonk/lists?perPage=30&page=1') });
  const [form, setForm] = useState({ name: '', type: 'public' });
  const invalidate = () => { qc.invalidateQueries({ queryKey: ['lm-lists'] }); qc.invalidateQueries({ queryKey: ['lm-campaigns'] }); };
  const create = useMutation({ mutationFn: () => postCmd('listmonk', 'lists', 'create', { name: form.name.trim(), optin: 'single' }), onSuccess: () => { invalidate(); setForm({ name: '', type: 'public' }); }, onError: (e: any) => alert((e as Error).message) });
  const del = useMutation({ mutationFn: (id: number) => postCmd('listmonk', 'lists', 'delete', { id }), onSuccess: invalidate, onError: (e: any) => alert((e as Error).message) });

  if (isLoading) return <div className="p-10 text-center text-xs text-brand-navy/50">Loading audiences…</div>;
  if (error) return <ErrPanel what="audiences" onRetry={refetch} />;

  const rows: any[] = data?.data || [];
  return (
    <div className="space-y-4">
      <p className="text-[11px] text-brand-navy/40">{rows.length} lists — these are the targeting audiences for campaigns (list IDs are used in the Campaigns tab).</p>
      <div className="flex flex-wrap items-center gap-2">
        <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="New list name" className="min-w-56 flex-1 rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-xs text-brand-navy placeholder:text-brand-navy/40 focus:border-brand-gold focus:outline-none" />
        <button onClick={() => create.mutate()} disabled={create.isPending || !form.name.trim()} className="rounded-full bg-brand-gold px-4 py-2 text-[11px] font-extrabold uppercase text-brand-navy hover:bg-brand-gold/90">Create list</button>
      </div>
      <div className="space-y-2">
        {rows.map((l: any) => (
          <div key={l.id} className="flex items-center gap-2 rounded-xl border border-brand-navy/10 bg-white px-3 py-2 transition-all duration-300 hover:border-brand-gold/40">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-xs font-semibold text-brand-navy">{l.name}</span>
              <span className="block text-[10px] text-brand-navy/50">{l.subscriber_count ?? '?'} subscribers · optin: {l.optin}</span>
            </span>
            <span className="rounded bg-brand-navy/[0.05] px-1.5 py-0.5 font-mono text-[10px] text-brand-navy/40">id {l.id}</span>
            <button onClick={() => del.mutate(l.id)} className="rounded-full border border-brand-navy/15 px-2 py-1 text-[9px] font-bold uppercase text-brand-navy/50 hover:bg-rose-600 hover:text-white">Delete</button>
          </div>
        ))}
        {rows.length === 0 && <div className="py-8 text-center text-[11px] text-brand-navy/50">No lists yet — create your first audience above.</div>}
      </div>
    </div>
  );
}

// ── Suppression: bounce evidence from the tool (OS suppression remains authoritative) ──
function SuppressionView() {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['lm-bounces'], queryFn: () => getJson('/api/integrations/listmonk/bounces?perPage=30&page=1') });
  if (isLoading) return <div className="p-10 text-center text-xs text-brand-navy/50">Loading bounces…</div>;
  if (error) return <ErrPanel what="bounces" onRetry={refetch} />;
  const rows: any[] = data?.data || [];
  return (
    <div className="space-y-4">
      <p className="text-[11px] text-brand-navy/40">
        {rows.length} recent bounces from Listmonk — evidence for list hygiene. The OS suppression registry (hard/3×soft/unsub/complaint via the
        Listmonk webhook) remains the authoritative send gate — this view is the proof layer.
      </p>
      <div className="overflow-x-auto rounded-2xl border border-brand-navy/10 bg-white">
        <table className="w-full text-left text-xs">
          <thead className="bg-brand-navy/[0.04] border-b border-brand-navy/[0.08] text-[10px] uppercase tracking-wider text-brand-gold">
            <tr>
              <th className="px-3 py-2 font-bold">Email</th>
              <th className="px-3 py-2 font-bold">Type</th>
              <th className="px-3 py-2 font-bold">Status</th>
              <th className="px-3 py-2 font-bold">Campaign</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((b: any) => (
              <tr key={b.id} className="border-b border-brand-navy/[0.08] last:border-0 hover:bg-brand-navy/[0.04]">
                <td className="px-3 py-2 text-brand-navy/70">{b.email}</td>
                <td className="px-3 py-2"><span className={`rounded px-1 py-0.5 text-[9px] font-bold uppercase ${String(b.type).toLowerCase().includes('hard') ? 'bg-rose-500/15 text-rose-700' : 'bg-amber-500/15 text-amber-700'}`}>{b.type}</span></td>
                <td className="px-3 py-2 text-brand-navy/40">{b.status}</td>
                <td className="px-3 py-2 text-brand-navy/40">{b.campaign_id ?? '—'}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={4} className="px-3 py-8 text-center text-brand-navy/50">No bounces recorded — clean list.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Module: tab bar over the four control views ────────────────────────────
const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'campaigns', label: 'Campaigns' },
  { key: 'templates', label: 'Templates' },
  { key: 'audiences', label: 'Audiences' },
  { key: 'suppression', label: 'Suppression' },
] as const;

export default function MarketingTab() {
  const { data: emailTrack } = useQuery<any>({
    queryKey: ['emailTracking'],
    queryFn: async () => {
      const r = await fetch('/api/marketing/email-tracking', { headers: AUTH });
      if (!r.ok) throw new Error('email tracking');
      return r.json();
    },
    refetchInterval: 60000
  });
  const [tab, setTab] = useState<string>('overview');
  const { data: live, isLoading, isError, refetch } = useQuery<LiveData>({
    queryKey: ['integrationsLive'],
    queryFn: () => getJson('/api/integrations/live'),
  });
  const rootRef = useRevealRoot<HTMLDivElement>();

  return (
    <div ref={rootRef} className="space-y-6 p-6">
      {/* Email engagement tracking (Listmonk opens/clicks) */}
      {emailTrack && (
        <div className="rounded-2xl border border-brand-navy/10 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-display font-bold text-brand-navy text-sm">📧 Email Engagement</h3>
            <span className="text-[10px] text-brand-navy/40">from Listmonk webhook events</span>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-3">
            <div className="rounded-lg bg-brand-navy/[0.04] p-2.5"><div className="text-[9px] font-bold uppercase text-brand-navy/40">Events</div><div className="font-extrabold text-brand-navy">{emailTrack.totals.sent}</div></div>
            <div className="rounded-lg bg-blue-50 p-2.5"><div className="text-[9px] font-bold uppercase text-blue-600">Opens</div><div className="font-extrabold text-blue-700">{emailTrack.totals.opens}</div></div>
            <div className="rounded-lg bg-emerald-50 p-2.5"><div className="text-[9px] font-bold uppercase text-emerald-600">Clicks</div><div className="font-extrabold text-emerald-700">{emailTrack.totals.clicks}</div></div>
            <div className="rounded-lg bg-amber-50 p-2.5"><div className="text-[9px] font-bold uppercase text-amber-600">Bounces</div><div className="font-extrabold text-amber-700">{emailTrack.totals.bounces}</div></div>
            <div className="rounded-lg bg-rose-50 p-2.5"><div className="text-[9px] font-bold uppercase text-rose-600">Unsubs</div><div className="font-extrabold text-rose-700">{emailTrack.totals.unsubs}</div></div>
          </div>
          {emailTrack.byEmail.length > 0 && (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-brand-navy/[0.08] text-[10px] uppercase font-bold tracking-wider text-brand-gold">
                  <tr><th className="px-3 py-2">Email</th><th className="px-3 py-2">Opens</th><th className="px-3 py-2">Clicks</th><th className="px-3 py-2">Bounces</th><th className="px-3 py-2">Unsubs</th><th className="px-3 py-2">Last event</th></tr>
                </thead>
                <tbody className="divide-y divide-brand-navy/[0.06]">
                  {emailTrack.byEmail.map((r: any) => (
                    <tr key={r.email} className="hover:bg-brand-navy/[0.03]">
                      <td className="px-3 py-2 font-semibold text-brand-navy">{r.email}</td>
                      <td className="px-3 py-2">{r.opens}</td>
                      <td className="px-3 py-2">{r.clicks}</td>
                      <td className="px-3 py-2">{r.bounces}</td>
                      <td className="px-3 py-2">{r.unsubs}</td>
                      <td className="px-3 py-2 text-brand-navy/40">{new Date(r.last * 1000).toLocaleString()}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {emailTrack.byEmail.length === 0 && <p className="text-[10px] text-brand-navy/40 italic">No email events yet — they appear once Listmonk is live and campaigns send.</p>}
        </div>
      )}

      <div className="reveal">
        <div className="flex items-center gap-2.5">
          <span className="gold-dot" />
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-gold">Marketing</p>
        </div>
        <h2 className="mt-2 font-display text-sm font-bold text-brand-navy">Marketing Automation</h2>
        <p className="mt-1 text-[11px] text-brand-navy/40">Control panel — operations run in the connected tools (Listmonk · Mautic · Chatwoot · OpenWA) via their VPC APIs; every command is RBAC-gated and audited by the OS.</p>
      </div>

      <div className="reveal flex flex-wrap gap-1 rounded-full border border-brand-navy/15 bg-brand-navy/[0.04] p-1 text-[10px] font-bold uppercase">
        {TABS.map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`rounded-full px-4 py-1.5 transition ${tab === t.key ? 'bg-brand-gold text-brand-navy' : 'text-brand-navy/50 hover:text-brand-gold'}`}>{t.label}</button>
        ))}
      </div>

      {tab === 'overview' && (isLoading ? <div className="p-10 text-center text-xs text-brand-navy/50">Loading tool feeds…</div> : isError || !live ? <ErrPanel what="tool feeds" onRetry={refetch} /> : <Overview live={live} />)}
      {tab === 'campaigns' && <CampaignsView />}
      {tab === 'templates' && <TemplatesView />}
      {tab === 'audiences' && <AudiencesView />}
      {tab === 'suppression' && <SuppressionView />}
    </div>
  );
}