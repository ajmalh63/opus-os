import { useState, useEffect, useRef } from 'react';
import gsap from 'gsap';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { useSession } from '../lib/session';
import { useRevealRoot, useCountUp } from '../lib/reveal';
import { useStaffAlerts } from '../lib/useStaffAlerts';
import { useTaskNotifications } from '../lib/useTaskNotifications';
import { Panel, PanelHead, KpiTile, WorkButton, EmptyState } from '../components/WorkChrome';

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
interface Task { id: string; title: string; status: 'open' | 'in_progress' | 'done'; priority?: string; }

const LABELS: Record<string, string> = { lead: 'Leads', qualified: 'Qualified', documents: 'Documents', processing: 'Processing', complete: 'Complete' };

interface Widget {
  key: string;
  label: string;
  visible: boolean;
  size: 'small' | 'medium' | 'large';
}

const DEFAULT_WIDGETS: Widget[] = [
  { key: 'tasks', label: 'My Tasks Feed', visible: true, size: 'large' },
  { key: 'leads', label: 'Total Leads KPI', visible: true, size: 'small' },
  { key: 'customers', label: 'Customers KPI', visible: true, size: 'small' },
  { key: 'conversion', label: 'Conversion %', visible: true, size: 'small' },
  { key: 'stale', label: 'Stale Leads', visible: true, size: 'small' },
  { key: 'chats', label: 'Open Chats', visible: true, size: 'small' },
  { key: 'unread', label: 'Unread Messages', visible: true, size: 'small' },
  { key: 'velocity', label: 'Pipeline Velocity Chart', visible: true, size: 'large' }
];

export default function DashboardHome() {
  const gridRef = useRef<HTMLDivElement>(null);

  const [, setLocation] = useLocation();
  const { me } = useSession();
  const queryClient = useQueryClient();
  const rootReveal = useRevealRoot<HTMLDivElement>();
  const { alerts, newCount, markAllSeen } = useStaffAlerts(15000);
  const [editMode, setEditMode] = useState(false);
  const [widgets, setWidgets] = useState<Widget[]>([]);

  // Load customizable layout from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(`opus_dash_widgets_${me?.id || 'default'}`);
    if (saved) {
      try { setWidgets(JSON.parse(saved)); } catch { setWidgets(DEFAULT_WIDGETS); }
    } else {
      setWidgets(DEFAULT_WIDGETS);
    }
  }, [me?.id]);

  const saveLayout = (updated: Widget[]) => {
    setWidgets(updated);
    localStorage.setItem(`opus_dash_widgets_${me?.id || 'default'}`, JSON.stringify(updated));
  };

  const toggleWidget = (key: string) => {
    const updated = widgets.map(w => w.key === key ? { ...w, visible: !w.visible } : w);
    saveLayout(updated);
  };

  const changeWidgetSize = (key: string, size: 'small' | 'medium' | 'large') => {
    const updated = widgets.map(w => w.key === key ? { ...w, size } : w);
    saveLayout(updated);
  };

  useEffect(() => {
    if (gridRef.current) {
      gsap.fromTo(gridRef.current.querySelectorAll('.reveal-widget'),
        { y: 20, opacity: 0 },
        { y: 0, opacity: 1, duration: 0.8, stagger: 0.08, ease: 'power3.out', delay: 0.15 }
      );
    }
  }, [widgets]);

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

  // Query for staff tasks checklist
  const { data: myTasksData } = useQuery<{ tasks?: Task[] }>({
    queryKey: ['dashTasksFeed'],
    queryFn: async () => { const r = await fetch('/api/tasks'); if (!r.ok) throw new Error('tasks'); return r.json(); }
  });

  const { toast: taskToast, dismissToast: dismissTaskToast } = useTaskNotifications(20000);

  const myTasks = myTasksData?.tasks || [];
  const openTasksList = myTasks.filter(t => t.status === 'open');

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
  ];
  if (canCampaigns) actions.unshift({ label: 'Marketing Automation', to: '/control', hint: `Admin console`, icon: 'M11 5.88v13.36a1.76 1.76 0 01-3 1.25L3 15.8V9.2l5-6.33a1.76 1.76 0 013 1.01z' });
  if (canFunnel) actions.unshift({ label: 'Staff Performance', to: '/control', hint: 'Output & workload', icon: 'M4 5h16M7 5v14M4 19h16M12 5v14M17 5v14' });

  const getGridSpan = (size: 'small' | 'medium' | 'large') => {
    if (size === 'small') return 'col-span-1 md:col-span-2 lg:col-span-1';
    if (size === 'medium') return 'col-span-1 md:col-span-2 lg:col-span-2';
    return 'col-span-full';
  };

  return (
    <div ref={rootReveal as any} className="min-h-full space-y-8">
      {/* Hero — command deck opener, same split layout as the public hero */}
      <section className="reveal relative overflow-hidden rounded-[2rem] border border-brand-navy/10 bg-white/70 p-7 shadow-[0_24px_60px_-25px_rgba(10,45,80,0.15)] backdrop-blur-xl md:p-9">
        <div className="pointer-events-none absolute -right-20 -top-28 h-80 w-80 rounded-full bg-brand-gold/15 blur-3xl" aria-hidden="true" />
        <div className="relative z-10 flex flex-wrap items-end justify-between gap-5">
          <div className="max-w-xl">
            <div className="flex items-center gap-2.5">
              <span className="gold-dot" />
              <span className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-gold">
                {me?.role?.replace('_', ' ') || 'Staff'} · Command Center
              </span>
            </div>
            <h1 className="mt-3 font-display text-3xl font-extrabold tracking-tight text-brand-navy md:text-4xl">
              Good to see you, {me?.name?.split(' ')[0] || 'there'}
            </h1>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <WorkButton onClick={() => setEditMode(!editMode)}>
              ⚙️ Customize Layout
            </WorkButton>
            {actions.slice(0, 3).map((a, i) => (
              <button
                key={a.to + a.label}
                onClick={() => setLocation(a.to)}
                style={{ transitionDelay: `${i * 60}ms` }}
                className="group inline-flex cursor-pointer items-center gap-2.5 rounded-full bg-brand-gold px-5 py-2.5 text-xs font-bold uppercase tracking-wider text-brand-navy shadow-[0_10px_24px_-10px_rgba(215,160,25,0.55)] transition-all duration-300 ease-[cubic-bezier(0.32,0.72,0,1)] hover:bg-brand-gold/90 active:scale-[0.97]"
              >
                {a.label}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Live Activity — instant sales/requests feed */}
      <section className="reveal rounded-2xl border border-brand-navy/10 bg-white p-6 shadow-[0_16px_40px_-22px_rgba(10,45,80,0.16)]">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <span className="gold-dot" />
            <h3 className="font-display text-sm font-bold text-brand-navy">Live Activity</h3>
            {newCount > 0 && <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[9px] font-bold text-white animate-pulse">{newCount} new</span>}
          </div>
          {newCount > 0 && <button onClick={markAllSeen} className="text-[10px] font-bold uppercase tracking-wider text-brand-gold hover:underline cursor-pointer">Mark all seen</button>}
        </div>
        {alerts.length === 0 ? (
          <p className="py-6 text-center text-xs text-brand-navy/40 italic">No client activity yet — sales and requests will appear here instantly.</p>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {alerts.slice(0, 9).map((a) => {
              const sev = a.severity || 'info';
              const sevStyle: Record<string, string> = {
                urgent: 'border-rose-300 bg-rose-50/80',
                warning: 'border-amber-300 bg-amber-50/70',
                info: 'border-brand-navy/10 bg-brand-navy/[0.03]',
              };
              const sevDot: Record<string, string> = {
                urgent: 'bg-rose-500',
                warning: 'bg-amber-400',
                info: 'bg-brand-gold',
              };
              const sevBadge: Record<string, string> = {
                urgent: 'bg-rose-500/15 text-rose-600',
                warning: 'bg-amber-500/15 text-amber-700',
                info: 'bg-brand-navy/[0.06] text-brand-navy/50',
              };
              return (
              <div key={a.id} className={`rounded-xl border p-3.5 transition-all ${a.status === 'new' ? `${sevStyle[sev]} animate-in fade-in slide-in-from-top-2 duration-300` : sevStyle[sev]}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-brand-navy truncate">{a.title}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {sev !== 'info' && <span className={`px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${sevBadge[sev]}`}>{sev}</span>}
                    {a.status === 'new' && <span className={`shrink-0 h-2 w-2 rounded-full animate-pulse ${sevDot[sev]}`} />}
                  </div>
                </div>
                {a.body && <p className="text-[10px] text-brand-navy/50 mt-1 truncate">{a.body}</p>}
                <div className="flex items-center justify-between mt-2">
                  <span className="text-[9px] uppercase tracking-wider text-brand-gold font-bold">{a.division} · {a.type}</span>
                  <span className="text-[9px] text-brand-navy/40">{new Date(a.createdAt * 1000).toLocaleTimeString()}</span>
                </div>
              </div>
              );
            })}
          </div>
        )}
      </section>

      {/* Customizable layout config panel */}
      {editMode && (
        <Panel className="animate-in fade-in slide-in-from-top-4 p-6 text-xs duration-300">
          <div className="flex items-center gap-2.5">
            <span className="gold-dot" />
            <h3 className="font-bold uppercase tracking-[0.18em] text-brand-gold">Configure your Dashboard</h3>
          </div>
          <div className="mt-5 grid grid-cols-2 gap-4 md:grid-cols-4">
            {widgets.map(w => (
              <div key={w.key} className="rounded-xl border border-brand-navy/10 bg-brand-navy/[0.04] p-3 shadow-none">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-bold text-brand-navy">{w.label}</span>
                  <input
                    type="checkbox"
                    checked={w.visible}
                    onChange={() => toggleWidget(w.key)}
                    className="h-4 w-4 cursor-pointer rounded accent-brand-gold"
                  />
                </div>
                {w.visible && (
                  <div className="mt-2.5 flex items-center gap-1.5">
                    <span className="text-[10px] font-semibold text-brand-navy/40">Size:</span>
                    <select
                      value={w.size}
                      onChange={(e) => changeWidgetSize(w.key, e.target.value as any)}
                      className="rounded border border-brand-navy/10 bg-white px-1.5 py-0.5 text-[9px] text-brand-navy outline-none focus:border-brand-gold/60"
                    >
                      <option value="small">Small (33%)</option>
                      <option value="medium">Medium (50%)</option>
                      <option value="large">Full Width</option>
                    </select>
                  </div>
                )}
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* New-task notification toast */}
      {taskToast && (
        <div className={`fixed top-4 right-4 z-[100] max-w-sm rounded-xl border p-4 shadow-lg animate-in slide-in-from-top-2 duration-300 ${taskToast.urgent ? 'border-rose-300 bg-rose-50' : 'border-brand-gold/40 bg-white'}`}>
          <div className="flex items-start gap-3">
            <span className={`text-lg ${taskToast.urgent ? 'text-rose-500' : 'text-brand-gold'}`}>{taskToast.urgent ? '🔔⚡' : '🔔'}</span>
            <div className="flex-1">
              <div className={`text-[10px] font-bold uppercase tracking-widest ${taskToast.urgent ? 'text-rose-600' : 'text-brand-gold'}`}>{taskToast.urgent ? 'URGENT — New task' : 'New task'}</div>
              <div className="text-xs font-semibold text-brand-navy mt-0.5">{taskToast.title}</div>
              <div className="text-[9px] text-brand-navy/40 mt-0.5">See it in My Assigned Open Tasks below.</div>
            </div>
            <button onClick={dismissTaskToast} className="text-brand-navy/40 hover:text-brand-navy cursor-pointer">✕</button>
          </div>
        </div>
      )}

      {/* Live widgets Grid */}
      <section ref={gridRef} className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {widgets.filter(w => w.visible).map(w => {
          const spanClass = getGridSpan(w.size);
          switch (w.key) {
            case 'tasks':
              return (
                <Panel key={w.key} className={`${spanClass} reveal-widget p-6 hover:border-brand-gold/40`}>
                  <PanelHead title={`📋 My Assigned Open Tasks (${openTasksList.length})`} caption="Check off to complete" />
                  <div className="mt-2 max-h-56 space-y-1.5 overflow-y-auto pr-1">
                    {openTasksList.map(t => {
                      const prio = t.priority || 'medium';
                      const prioStyle: Record<string, string> = {
                        urgent: 'border-l-4 border-rose-500 bg-rose-50/80',
                        high: 'border-l-4 border-amber-400 bg-amber-50/60',
                        medium: 'border-l-4 border-blue-400 bg-blue-50/40',
                        low: 'border-l-4 border-brand-navy/20 bg-brand-navy/[0.04]',
                      };
                      const prioBadge: Record<string, string> = {
                        urgent: 'bg-rose-500/15 text-rose-600',
                        high: 'bg-amber-500/15 text-amber-700',
                        medium: 'bg-blue-500/15 text-blue-700',
                        low: 'bg-brand-navy/[0.06] text-brand-navy/50',
                      };
                      return (
                      <div key={t.id} className={`flex items-center gap-2.5 rounded-lg p-2.5 text-xs transition-colors hover:brightness-95 ${prioStyle[prio] || prioStyle.medium}`}>
                        <input
                          type="checkbox"
                          className="h-4 w-4 cursor-pointer rounded accent-brand-gold"
                          onChange={async () => {
                            await fetch(`/api/kanban/board/tasks/${t.id}`, {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ status: 'done' })
                            });
                            queryClient.invalidateQueries({ queryKey: ['dashTasksFeed'] });
                          }}
                        />
                        <span className="font-medium text-brand-navy/80 flex-1">{t.title}</span>
                        <span className={`shrink-0 px-1.5 py-0.5 rounded text-[8px] font-bold uppercase ${prioBadge[prio] || prioBadge.medium}`}>{prio}</span>
                      </div>
                      );
                    })}
                    {openTasksList.length === 0 && (
                      <p className="py-6 text-center text-brand-navy/30 italic">No pending tasks for today.</p>
                    )}
                  </div>
                </Panel>
              );

            case 'leads':
              return (
                <div key={w.key} className={`${spanClass} reveal-widget`}>
                  <KpiTile accent label="Total Leads" caption="All intake registrations" value={leads} valueClass="text-brand-navy" countKey="kpi-leads" />
                </div>
              );

            case 'customers':
              return (
                <div key={w.key} className={`${spanClass} reveal-widget`}>
                  <KpiTile label="Customers" caption="Signed engagements" value={customers} countKey="kpi-customers" />
                </div>
              );

            case 'conversion':
              return (
                <div key={w.key} className={`${spanClass} reveal-widget`}>
                  <KpiTile label="Conversion" caption="lead ➔ customer" value={conv !== null ? `${conv.toFixed(1)}%` : '–'} valueClass="text-brand-gold" />
                </div>
              );

            case 'stale':
              return (
                <div key={w.key} className={`${spanClass} reveal-widget`}>
                  <KpiTile label="Stale" caption="Awaiting reactivation" value={stale} countKey="kpi-stale" />
                </div>
              );

            case 'chats':
              return (
                <div key={w.key} className={`${spanClass} reveal-widget`}>
                  <KpiTile label="Open chats" caption="Unified inbox" value={inOpen} />
                </div>
              );

            case 'unread':
              return (
                <div key={w.key} className={`${spanClass} reveal-widget`}>
                  <KpiTile
                    label="Unread messages"
                    caption="Needs attention"
                    value={inUnread}
                    valueClass={inUnread ? 'text-rose-600' : 'text-emerald-700'}
                  />
                </div>
              );

            case 'velocity':
              return (
                <Panel key={w.key} className={`${spanClass} reveal p-6`}>
                  <PanelHead title="Pipeline Velocity" caption="Stage conversion this period" />
                  <div className="space-y-3.5">
                    {(funnel?.funnel || []).length === 0 && <EmptyState title="No stage data yet." hint="Funnel builds as leads move through the pipeline" />}
                    {(funnel?.funnel || []).slice(0, 5).map((s) => (
                      <div key={s.stage}>
                        <div className="mb-1 flex items-center justify-between text-[11px]">
                          <span className="font-semibold text-brand-navy/70">{LABELS[s.stage] || s.stage}</span>
                          <span className="font-mono text-brand-navy/40">{s.count} · {Math.round(s.conversionRate * 100)}%</span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-white">
                          <div
                            className="h-full rounded-full bg-gradient-to-r from-brand-gold/80 to-brand-gold transition-[width] duration-700 ease-[cubic-bezier(0.32,0.72,0,1)]"
                            style={{ width: `${Math.max(2, Math.min(100, s.conversionRate * 100))}%` }}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </Panel>
              );

            default:
              return null;
          }
        })}
      </section>
    </div>
  );
}