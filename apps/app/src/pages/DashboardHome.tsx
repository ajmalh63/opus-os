import { useQuery } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { useSession } from '../lib/session';

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

interface InboxSummary { open: number; unread: number; }

const KPI_CARDS = [
  { key: 'leads', label: 'Total Leads' },
  { key: 'customers', label: 'Customers' },
  { key: 'conv', label: 'Lead → Customer' },
  { key: 'stale', label: 'Stale / Awaiting' },
  { key: 'inboxOpen', label: 'Open Conversations' },
  { key: 'inboxUnread', label: 'Unread' },
] as const;

export default function DashboardHome() {
  const [, setLocation] = useLocation();
  const { me } = useSession();

  const role = me?.role;
  const canFunnel = ['super_admin', 'manager'].includes(role || '');
  const canCampaigns = role === 'super_admin';

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
      return { open: convs.length, unread: convs.reduce((a: number, c: any) => a + (c.unread || 0), 0) };
    },
  });

  const { data: campaigns } = useQuery<{ campaigns: any[] }>({
    queryKey: ['dashCampaigns'],
    queryFn: async () => { const r = await fetch('/api/admin/campaigns', { headers: AUTH }); if (!r.ok) throw new Error('campaigns'); return r.json(); },
    enabled: canCampaigns,
  });

  const kpis: Record<string, string | number> = {
    leads: funnel?.totalLeads ?? '–',
    customers: funnel?.customers ?? '–',
    conv: funnel ? `${(funnel.leadToCustomer * 100).toFixed(1)}%` : '–',
    stale: funnel?.staleCount ?? '–',
    inboxOpen: inbox?.open ?? '–',
    inboxUnread: inbox?.unread ?? '–',
  };

  const actions = [
    { label: 'Open Kanban', to: '/kanban', icon: 'M6 3h12M9 3v18M15 3v18M4 21h16', hint: 'Pipeline & cases' },
    { label: 'Open Inbox', to: '/inbox', icon: 'M22 12h-6l-2 3h-4l-2-3H2l2.2-6.4A2 2 0 018.1 4h7.8a2 2 0 001.9 1.27L22 12z', hint: 'WhatsApp + chat' },
  ];
  if (canCampaigns) actions.unshift({ label: 'Manage Campaigns', to: '/workspaces/campaigns', icon: 'M11 5.88v13.36a1.76 1.76 0 01-3 1.25L3 15.8V9.2l5-6.33a1.76 1.76 0 013 1.01z', hint: `${campaigns?.campaigns?.length || 0} live` });

  return (
    <div className="min-h-full space-y-8">
      {/* Hero */}
      <section className="relative overflow-hidden rounded-2xl border border-white/[0.07] bg-gradient-to-br from-brand-navy via-[#0c1a3d] to-[#0a1128] p-6 md:p-8">
        <div className="pointer-events-none absolute -right-16 -top-24 h-72 w-72 rounded-full bg-brand-gold/10 blur-3xl" aria-hidden="true" />
        <div className="relative z-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-brand-gold">
              {me?.role?.replace('_', ' ') || 'Staff'} Command Center
            </p>
            <h1 className="mt-2 font-display text-2xl font-extrabold tracking-tight md:text-3xl">
              Welcome back, {me?.name?.split(' ')[0] || 'there'}
            </h1>
            <p className="mt-2 max-w-xl text-sm text-slate-400">
              Everything running for Opus Overseas in one place — pipeline, revenue, WhatsApp, compliance, campaigns.
              {me?.twoFactorEnabled && <span className="ml-2 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-bold text-emerald-300">2FA ON</span>}
            </p>
          </div>
          <div className="flex gap-2">
            {actions.slice(0, 2).map((a) => (
              <button key={a.to} onClick={() => setLocation(a.to)}
                className="inline-flex cursor-pointer items-center gap-2 rounded-full bg-brand-gold px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-brand-navy transition-all hover:bg-brand-1 active:scale-[0.98]">
                {a.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* KPI row */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-xs font-bold uppercase tracking-[0.16em] text-slate-400">At a glance</h2>
          {canFunnel && <button onClick={() => setLocation('/workspaces/funnel')} className="cursor-pointer text-[11px] font-semibold text-brand-gold hover:underline">Full funnel →</button>}
        </div>
        <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
          {KPI_CARDS.map((k) => (
            <div key={k.key} className="rounded-xl border border-white/[0.07] bg-white/[0.03] p-4">
              <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">{k.label}</div>
              <div className="mt-2 font-display text-2xl font-extrabold text-white">{kpis[k.key]}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Quick actions */}
      <section>
        <h2 className="mb-3 text-xs font-bold uppercase tracking-[0.16em] text-slate-400">Quick actions</h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
          {actions.map((a) => (
            <button key={a.to} onClick={() => setLocation(a.to)}
              className="group flex cursor-pointer items-center gap-4 rounded-xl border border-white/[0.07] bg-white/[0.03] p-4 text-left transition-all hover:border-brand-gold/50 hover:bg-white/[0.06]">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-lg bg-brand-gold/10 text-brand-gold">
                <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}><path strokeLinecap="round" strokeLinejoin="round" d={a.icon} /></svg>
              </span>
              <span>
                <span className="block text-[13px] font-semibold text-white group-hover:text-brand-gold">{a.label}</span>
                <span className="mt-0.5 block text-[11px] text-slate-500">{a.hint}</span>
              </span>
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}