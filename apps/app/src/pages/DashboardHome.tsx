import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { useSession } from '../lib/session';
import ArtifactShell from '../components/artifacts/ArtifactShell';
import { useRevealRoot, useCountUp } from '../lib/reveal';

const AUTH = {
  get Cookie() {
    const s = document.cookie.split(';').map((p: string) => p.trim()).find((p: string) => p.startsWith('better-auth.session_token='));
    return s || '';
  }
} as Record<string, string>;

interface Funnel {
  totalLeads: number;
  customers: number;
  leadToCustomer: number;
  staleCount: number;
  funnel: { stage: string; count: number; reachedStage: number; conversionRate: number }[];
  velocity: Record<string, number>;
}

interface InboxSummary { total: number; unread: number; }

const LABELS: Record<string, string> = { lead: 'Leads', qualified: 'Qualified', documents: 'Documents', processing: 'Processing', complete: 'Complete' };

export default function DashboardHome() {
  const [, setLocation] = useLocation();
  const { me } = useSession();
  const rootReveal = useRevealRoot<HTMLDivElement>();

  const canFunnel = ['super_admin', 'manager'].includes(me?.role || '');
  const canCampaigns = me?.role === 'super_admin';

  const { data: funnel } = useQuery<Funnel>({
    queryKey: ['dashFunnel'],
    queryFn: async () => { const r = await fetch('/api/marketing/funnel', { headers: AUTH }); if (!r.ok) throw new Error('funnel'); return r.json(); },
    enabled: canFunnel,
  });

  const { data: inbox } = useQuery<InboxSummary>({
    queryKey: ['dashInbox'],
    queryFn: async () => {
      const r = await fetch('/api/inbox', { headers: AUTH });
      if (!r.ok) throw new Error('inbox');
      const j = await r.json();
      const convs = j.conversations || [];
      return { total: convs.length, unread: convs.reduce((a: number, c: any) => a + (c.unread || 0), 0) };
    },
  });

  const { data: campaigns } = useQuery<{ campaigns: any[] }>({
    queryKey: ['dashCampaigns'],
    queryFn: async () => { const r = await fetch('/api/admin/campaigns', { headers: AUTH }); if (!r.ok) throw new Error('campaigns'); return r.json(); },
    enabled: canCampaigns,
  });

  // My Work (all staff roles) — open task count for the non-funnel KPI
  const { data: myTasksData } = useQuery<{ openCount: number }>({
    queryKey: ['dashMyTasks'],
    queryFn: async () => { const r = await fetch('/api/tasks/assigned-to-me'); if (!r.ok) throw new Error('tasks'); return r.json(); },
    enabled: !canFunnel,
  });
  const myOpenTasks = myTasksData?.openCount ?? 0;

  const leads = funnel?.totalLeads ?? 0;
  const customers = funnel?.customers ?? 0;
  const conv = funnel ? (funnel.leadToCustomer * 100) : null;
  const stale = funnel?.staleCount ?? 0;
  const inOpen = inbox?.total ?? 0;
  const inUnread = inbox?.unread ?? 0;

  useCountUp('kpi-leads', leads, [leads]);
  useCountUp('kpi-customers', customers, [customers]);
  useCountUp('kpi-stale', stale, [stale]);

  const actions = [
    { label: 'Open Pipeline', to: '/kanban', hint: 'Clients & board', icon: 'M6 3h12M9 3v18M15 3v18M4 21h16' },
    { label: 'Open Inbox', to: '/inbox', hint: 'WhatsApp + chat', icon: 'M22 12h-6l-2 3h-4l-2-3H2l2.2-6.4A2 2 0 018.1 4h7.8a2 2 0 001.9 1.27L22 12z' },
  ];
  if (canCampaigns) actions.unshift({ label: 'Manage Campaigns', to: '/workspaces/campaigns', hint: `${campaigns?.campaigns?.length || 0} live`, icon: 'M11 5.88v13.36a1.76 1.76 0 01-3 1.25L3 15.8V9.2l5-6.33a1.76 1.76 0 013 1.01z' });

  return (
    <div ref={rootReveal as any} className="min-h-full space-y-8">
      {/* Hero — same split layout as the public hero: eyebrow, huge navy title */}
      <section className="reveal relative overflow-hidden rounded-[2rem] border border-brand-navy/10 bg-white/70 p-7 shadow-[0_24px_60px_-25px_rgba(10,45,80,0.3)] backdrop-blur-xl md:p-9">
        <div className="pointer-events-none absolute -right-20 -top-28 h-80 w-80 rounded-full bg-brand-gold/15 blur-3xl" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-24 -left-16 h-72 w-72 rounded-full bg-brand-blue/15 blur-3xl" aria-hidden="true" />
        <div className="relative z-10 flex flex-wrap items-end justify-between gap-5">
          <div className="max-w-xl">
            <p className="inline-block rounded-full border border-brand-gold/40 bg-brand-gold/10 px-3.5 py-1 text-[10px] font-bold uppercase tracking-[0.18em] text-brand-gold">
              {me?.role?.replace('_', ' ') || 'Staff'} · Command Center
            </p>
            <h1 className="mt-3 font-display text-3xl font-extrabold tracking-tight text-brand-navy md:text-4xl">
              Good to see you, {me?.name?.split(' ')[0] || 'there'}
            </h1>
            <p className="mt-2.5 text-sm leading-relaxed text-slate-500">
              Everything running for Opus Overseas in one place — pipeline, revenue, WhatsApp, compliance, campaigns.
              {me?.twoFactorEnabled && <span className="ml-2 inline-block rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-bold text-emerald-700">2FA ON</span>}
            </p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            {actions.slice(0, 3).map((a, i) => (
              <button
                key={a.to}
                onClick={() => setLocation(a.to)}
                style={{ transitionDelay: `${i * 60}ms` }}
                className="group inline-flex cursor-pointer items-center gap-2.5 rounded-full bg-brand-navy px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-white transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-brand-gold hover:text-brand-navy active:scale-[0.97]"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d={a.icon} /></svg>
                {a.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Live KPI artifact row — role-aware: funnel metrics only for mgr+ */}
      <section className="reveal grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
        {canFunnel ? (
          <>
            <ArtifactShell title="Total Leads" caption="All intake across 5 divisions">
              <div className="font-display text-3xl font-extrabold text-brand-navy" data-count="kpi-leads">{leads}</div>
            </ArtifactShell>
            <ArtifactShell title="Customers" caption="Signed engagements">
              <div className="font-display text-3xl font-extrabold text-brand-navy" data-count="kpi-customers">{customers}</div>
            </ArtifactShell>
            <ArtifactShell title="Conversion" caption="lead → customer">
              <div className="font-display text-3xl font-extrabold text-brand-gold">{conv !== null ? conv.toFixed(1) : '–'}%</div>
            </ArtifactShell>
            <ArtifactShell title="Stale" caption="awaiting reactivation">
              <div className="font-display text-3xl font-extrabold text-brand-navy" data-count="kpi-stale">{stale}</div>
            </ArtifactShell>
          </>
        ) : (
          <>
            <ArtifactShell title="My Open Tasks" caption="assigned to you">
              <div className="font-display text-3xl font-extrabold text-brand-navy">{myOpenTasks}</div>
            </ArtifactShell>
          </>
        )}
        <ArtifactShell title="Open chats" caption="unified inbox">
          <div className="font-display text-3xl font-extrabold text-brand-navy">{inOpen}</div>
        </ArtifactShell>
        <ArtifactShell title="Unread" caption="needs attention">
          <div className={`font-display text-3xl font-extrabold ${inUnread ? 'text-rose-600' : 'text-emerald-600'}`}>{inUnread}</div>
        </ArtifactShell>
      </section>

      {/* Funnel + quick actions */}
      <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="reveal lg:col-span-2">
          <ArtifactShell title="Pipeline velocity" caption="Leads per stage right now (live)">
            <div className="space-y-3">
              {(funnel?.funnel || []).length === 0 && <p className="py-4 text-xs text-slate-400">No stage data yet — intake creates stages automatically.</p>}
              {(funnel?.funnel || []).slice(0, 5).map((s) => (
                <div key={s.stage}>
                  <div className="mb-1 flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-slate-600">{LABELS[s.stage] || s.stage}</span>
                    <span className="font-mono text-slate-500">{s.count} · {Math.round(s.conversionRate * 100)}%</span>
                  </div>
                  <div className="h-2 overflow-hidden rounded-full bg-brand-navy/5">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-brand-navy to-brand-gold transition-[width] duration-700 ease-[cubic-bezier(0.32,0.72,0,1)]"
                      style={{ width: `${Math.max(2, Math.min(100, s.conversionRate * 100))}%` }}
                    />
                  </div>
                </div>
              ))}
              {canFunnel && (
                <button onClick={() => setLocation('/workspaces/funnel')} className="mt-3 cursor-pointer text-[11px] font-bold text-brand-gold hover:underline">
                  Open full funnel →
                </button>
              )}
            </div>
          </ArtifactShell>
        </div>

        <div className="reveal space-y-4">
          <ArtifactShell title="Jump right in" caption="Next best actions">
            <div className="flex flex-col gap-2.5">
              {actions.map((a) => (
                <button
                  key={a.to}
                  onClick={() => setLocation(a.to)}
                  className="group flex cursor-pointer items-center gap-3 rounded-xl border border-brand-navy/10 bg-white/80 px-3.5 py-3 text-left transition-all duration-300 hover:border-brand-gold/60 hover:shadow-lg active:scale-[0.98]"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-brand-gold/15 text-brand-gold transition-transform duration-300 group-hover:scale-110">
                    <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d={a.icon} /></svg>
                  </span>
                  <span>
                    <span className="block text-[13px] font-bold text-brand-navy group-hover:text-brand-gold">{a.label}</span>
                    <span className="block text-[11px] text-slate-500">{a.hint}</span>
                  </span>
                </button>
              ))}
            </div>
          </ArtifactShell>
          <ArtifactShell title="Org pulse" caption="Who's where">
            <div className="flex items-center gap-3 text-xs text-slate-600">
              <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-gold/15 font-bold text-brand-gold">{me?.name?.[0]?.toUpperCase() || 'O'}</span>
              <div>
                <div className="font-bold text-brand-navy">{me?.name || 'Operator'}</div>
                <div className="capitalize text-slate-500">{me?.role?.replace('_', ' ') || 'staff'}</div>
              </div>
            </div>
          </ArtifactShell>
        </div>
      </section>
    </div>
  );
}