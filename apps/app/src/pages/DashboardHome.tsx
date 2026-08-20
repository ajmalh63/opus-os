import { useState, useEffect, useRef } from 'react';
import gsap from 'gsap';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocation } from 'wouter';
import { useSession } from '../lib/session';
import { useRevealRoot, useCountUp } from '../lib/reveal';
import { useStaffAlerts } from '../lib/useStaffAlerts';
import { useTaskNotifications } from '../lib/useTaskNotifications';
import { Panel, PanelHead, KpiTile, EmptyState } from '../components/WorkChrome';


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
  const { alerts, newCount, markAllSeen, dismiss, clearSeen } = useStaffAlerts(15000);
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
    queryFn: async () => { const r = await fetch('/api/marketing/funnel', { credentials: 'include' }); if (!r.ok) throw new Error('funnel'); return r.json(); },
    enabled: canFunnel,
  });

  const { data: inbox } = useQuery<InboxSummary>({
    queryKey: ['dashInbox'],
    queryFn: async () => {
      const r = await fetch('/api/inbox', { credentials: 'include' });
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

  // Revenue intelligence (manager+)
  const { data: staleData } = useQuery<any>({
    queryKey: ['staleClients'],
    queryFn: async () => {
      const r = await fetch('/api/analytics/stale-clients');
      if (!r.ok) return null;
      return r.json();
    },
    refetchInterval: 60000
  });

  const { data: revenueData } = useQuery<any>({
    queryKey: ['revenueSummary'],
    queryFn: async () => {
      const r = await fetch('/api/analytics/revenue');
      if (!r.ok) return null;
      return r.json();
    },
    refetchInterval: 60000
  });
  const INR = (p: number) => '₹' + (p / 100).toLocaleString('en-IN');
  const [, navigate] = useLocation();

  // Where each division's notifications should take you
  const DIVISION_LINK: Record<string, string> = {
    attestation: '/divisions/attestation',
    visa: '/divisions/visa',
    manpower: '/divisions/manpower',
    umrah: '/divisions/umrah',
    'study-abroad': '/divisions/study-abroad',
  };
  const openAlert = (a: any) => navigate(a.link || DIVISION_LINK[a.division] || '/dashboard');
  const openTask = (t: any) => navigate(t.clientId ? `/clients/${t.clientId}` : '/kanban');

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
      {/* Hero — command deck opener with dark luxury glass styling */}
      <section className="reveal relative overflow-hidden rounded-[2.2rem] border border-brand-navy/15 bg-gradient-to-br from-[#09223e] via-[#06182c] to-[#040f1d] p-8 text-white shadow-[0_25px_60px_-20px_rgba(6,24,44,0.35)] backdrop-blur-2xl md:p-10">
        <div className="pointer-events-none absolute -right-16 -top-24 h-96 w-96 rounded-full bg-brand-gold/20 blur-[100px] animate-pulse" aria-hidden="true" />
        <div className="pointer-events-none absolute -left-20 -bottom-24 h-80 w-80 rounded-full bg-brand-blue/20 blur-[100px]" aria-hidden="true" />
        
        <div className="relative z-10 flex flex-wrap items-end justify-between gap-6">
          <div className="max-w-2xl">
            <div className="flex items-center gap-2.5">
              <span className="h-2 w-2 rounded-full bg-brand-gold shadow-[0_0_10px_rgba(215,160,25,0.9)] animate-pulse" />
              <span className="text-[10px] font-black uppercase tracking-[0.24em] text-brand-gold">
                {me?.role?.replace('_', ' ') || 'Super Admin'} · Executive Command Deck
              </span>
            </div>
            <h1 className="mt-3.5 font-display text-3xl font-black tracking-tight text-white md:text-4xl">
              Welcome back, {me?.name?.split(' ')[0] || 'Ajmal'}
            </h1>
            <p className="mt-2 text-xs leading-relaxed text-slate-300 max-w-xl">
              Real-time telemetry across Study Abroad, Umrah, Attestation, and Visa operations. All systems operational.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <button
              onClick={() => setEditMode(!editMode)}
              className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white backdrop-blur-md transition-all hover:bg-white/20 hover:border-brand-gold/60 active:scale-95 shadow-sm"
            >
              ⚙️ Layout
            </button>
            {actions.slice(0, 3).map((a, i) => (
              <button
                key={a.to + a.label}
                onClick={() => setLocation(a.to)}
                style={{ transitionDelay: `${i * 60}ms` }}
                className="group inline-flex cursor-pointer items-center gap-2.5 rounded-full bg-gradient-to-r from-brand-gold to-amber-500 px-5 py-2.5 text-xs font-black uppercase tracking-wider text-brand-navy shadow-[0_12px_28px_-8px_rgba(215,160,25,0.6)] transition-all duration-300 hover:brightness-110 hover:shadow-[0_15px_32px_-6px_rgba(215,160,25,0.75)] active:scale-95"
              >
                <span>{a.label}</span>
                <span className="text-sm transition-transform group-hover:translate-x-0.5">→</span>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Live Activity Stream — real-time sales, leads & requests */}
      <section className="reveal rounded-2xl border border-brand-navy/10 bg-white/95 p-6 shadow-[0_20px_50px_-20px_rgba(10,45,80,0.10)] backdrop-blur-sm">
        <div className="flex items-center justify-between mb-5 border-b border-brand-navy/10 pb-3">
          <div className="flex items-center gap-2.5">
            <span className="h-2 w-2 rounded-full bg-brand-gold shadow-[0_0_8px_rgba(215,160,25,0.8)] animate-pulse" />
            <h3 className="font-display text-sm font-extrabold text-brand-navy tracking-tight">Live Activity Stream</h3>
            {newCount > 0 && (
              <span className="rounded-full bg-rose-500 px-2 py-0.5 text-[9px] font-black text-white shadow-[0_0_8px_rgba(244,63,94,0.6)] animate-pulse">
                {newCount} new
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {newCount > 0 && (
              <button onClick={markAllSeen} className="text-[10px] font-extrabold uppercase tracking-wider text-brand-gold hover:underline cursor-pointer">
                ✓ Mark all seen
              </button>
            )}
            {alerts.some(a => a.status === 'seen') && (
              <button onClick={() => { if (confirm('Clear all completed notifications?')) clearSeen(); }} className="text-[10px] font-bold uppercase tracking-wider text-brand-textLight hover:text-rose-500 cursor-pointer transition-colors">
                🗑 Clear done
              </button>
            )}
          </div>
        </div>
        {alerts.length === 0 ? (
          <div className="py-8 text-center">
            <p className="text-xs font-semibold text-brand-textLight italic">No active alerts — real-time sales and client requests will stream here instantly.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {alerts.slice(0, 9).map((a) => {
              const sev = a.severity || 'info';
              const sevStyle: Record<string, string> = {
                urgent: 'border-rose-300 bg-rose-50/90 shadow-sm',
                warning: 'border-amber-300 bg-amber-50/80 shadow-sm',
                info: 'border-brand-navy/10 bg-brand-navy/[0.02] hover:bg-brand-navy/[0.04]',
              };
              const sevDot: Record<string, string> = {
                urgent: 'bg-rose-500 shadow-[0_0_6px_rgba(244,63,94,0.8)]',
                warning: 'bg-amber-400 shadow-[0_0_6px_rgba(251,191,36,0.8)]',
                info: 'bg-brand-gold shadow-[0_0_6px_rgba(215,160,25,0.8)]',
              };
              const sevBadge: Record<string, string> = {
                urgent: 'bg-rose-500/15 text-rose-700 border border-rose-300',
                warning: 'bg-amber-500/15 text-amber-800 border border-amber-300',
                info: 'bg-brand-navy/[0.06] text-brand-navy/60 border border-brand-navy/10',
              };
              return (
              <div key={a.id} onClick={() => openAlert(a)} className={`group rounded-xl border p-4 transition-all duration-200 cursor-pointer hover:shadow-md hover:border-brand-gold/60 ${a.status === 'new' ? `${sevStyle[sev]} ring-1 ring-brand-gold/30 animate-in fade-in slide-in-from-top-2 duration-300` : sevStyle[sev]}`}>
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-brand-navy truncate tracking-tight">{a.title}</span>
                  <div className="flex items-center gap-1.5 shrink-0">
                    {sev !== 'info' && <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${sevBadge[sev]}`}>{sev}</span>}
                    {a.status === 'new' && <span className={`shrink-0 h-2 w-2 rounded-full animate-pulse ${sevDot[sev]}`} />}
                  </div>
                </div>
                {a.body && <p className="text-[11px] text-brand-textLight mt-1.5 line-clamp-2 leading-relaxed">{a.body}</p>}
                <div className="flex items-center justify-between mt-3 pt-2 border-t border-brand-navy/5">
                  <span className="text-[9px] uppercase tracking-wider text-brand-gold font-extrabold">{a.division} · {a.type}</span>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] text-brand-textLight">{new Date(a.createdAt * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    <button
                      onClick={(e) => { e.stopPropagation(); dismiss(a.id); }}
                      title="Dismiss notification"
                      className="text-brand-navy/30 hover:text-rose-500 cursor-pointer text-xs transition-colors"
                    >
                      ✕
                    </button>
                  </div>
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

      {/* Executive revenue summary strip */}
      {revenueData && (
        <section className="reveal grid grid-cols-2 md:grid-cols-5 gap-3">
          <KpiTile label="Collected (month)" caption={`${revenueData.month.pctOfTarget !== null ? `${revenueData.month.pctOfTarget}% of target` : 'no target set'}`} value={INR(revenueData.month.collectedPaise)} valueClass="text-emerald-700" onClick={() => navigate('/billing')} />
          <KpiTile label="Pipeline value" caption="active engagements" value={INR(revenueData.month.pipelineValue)} onClick={() => navigate('/kanban')} />
          <KpiTile label="30-day forecast" caption="weighted pipeline" value={INR(revenueData.forecast.d30)} valueClass="text-brand-gold" onClick={() => navigate('/analytics')} />
          <KpiTile label="AR overdue" caption={`${INR(revenueData.arAging.d90 + revenueData.arAging.overdue)} beyond 90d`} value={INR(revenueData.arAging.d30 + revenueData.arAging.d60 + revenueData.arAging.d90 + revenueData.arAging.overdue)} valueClass="text-rose-600" onClick={() => navigate('/billing')} />
          <KpiTile label="Cash flow (6mo)" caption="collected vs pending" value={INR(revenueData.cashFlow.reduce((s: number, m: any) => s + m.collected, 0))} onClick={() => navigate('/analytics')} />
        </section>
      )}

      {/* Stale clients — follow-up automation */}
      {staleData && staleData.stale.length > 0 && (
        <section className="reveal rounded-2xl border border-amber-200/80 bg-gradient-to-br from-amber-50/90 to-amber-100/30 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-3 border-b border-amber-200/60 pb-2">
            <div className="flex items-center gap-2">
              <span className="text-base">🕰️</span>
              <h3 className="font-display font-extrabold text-brand-navy text-sm tracking-tight">Clients Needing Attention ({staleData.stale.length})</h3>
            </div>
            <span className="text-[11px] font-semibold text-amber-900/60">No contact in 3+ days</span>
          </div>
          <div className="flex flex-wrap gap-2.5">
            {staleData.stale.slice(0, 8).map((c: any) => (
              <button
                key={c.engagementId}
                onClick={() => navigate(`/clients/${c.clientId}`)}
                className="inline-flex items-center gap-2 rounded-xl border border-amber-300/80 bg-white/90 px-3.5 py-2 text-xs font-bold text-brand-navy shadow-xs hover:border-brand-gold hover:shadow-md transition-all cursor-pointer active:scale-95"
              >
                <span>{c.clientName}</span>
                <span className="text-[10px] font-extrabold uppercase text-brand-gold tracking-wider">{c.division.replace('-', ' ')}</span>
                <span className="rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-black text-amber-800">{c.daysSinceContact}d</span>
              </button>
            ))}
          </div>
        </section>
      )}

      {/* New-task notification toast */}
      {taskToast && (
        <div className={`fixed top-5 right-5 z-[100] max-w-sm rounded-2xl border p-4 shadow-2xl backdrop-blur-xl animate-in slide-in-from-top-3 duration-300 ${taskToast.urgent ? 'border-rose-400 bg-rose-50/95 ring-2 ring-rose-400/40' : 'border-brand-gold/60 bg-white/95 ring-2 ring-brand-gold/30'}`}>
          <div className="flex items-start gap-3">
            <span className="text-2xl">{taskToast.urgent ? '🚨' : '🔔'}</span>
            <div className="flex-1">
              <div className={`text-[10px] font-black uppercase tracking-widest ${taskToast.urgent ? 'text-rose-600' : 'text-brand-gold'}`}>{taskToast.urgent ? 'URGENT TASK DISPATCH' : 'NEW TASK ASSIGNED'}</div>
              <div className="text-xs font-bold text-brand-navy mt-0.5">{taskToast.title}</div>
              <div className="text-[10px] text-brand-textLight mt-1">Check off in My Assigned Tasks feed.</div>
            </div>
            <button onClick={dismissTaskToast} className="text-brand-navy/40 hover:text-brand-navy cursor-pointer text-sm">✕</button>
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
                <Panel key={w.key} className={`${spanClass} reveal-widget p-6 hover:border-brand-gold/60 transition-all`}>
                  <PanelHead 
                    title={`📋 Priority Action Queue (${openTasksList.length})`} 
                    caption="Check off to mark as completed in real-time" 
                  />
                  <div className="mt-3 max-h-64 space-y-2 overflow-y-auto pr-1 scrollbar-thin">
                    {openTasksList.map(t => {
                      const prio = t.priority || 'medium';
                      const prioStyle: Record<string, string> = {
                        urgent: 'border-l-4 border-rose-500 bg-rose-50/90 hover:bg-rose-50 shadow-xs',
                        high: 'border-l-4 border-amber-500 bg-amber-50/70 hover:bg-amber-50 shadow-xs',
                        medium: 'border-l-4 border-blue-500 bg-blue-50/50 hover:bg-blue-50 shadow-xs',
                        low: 'border-l-4 border-brand-navy/20 bg-brand-navy/[0.02] hover:bg-brand-navy/[0.04]',
                      };
                      const prioBadge: Record<string, string> = {
                        urgent: 'bg-rose-500/15 text-rose-700 font-black border border-rose-300',
                        high: 'bg-amber-500/15 text-amber-800 font-extrabold border border-amber-300',
                        medium: 'bg-blue-500/15 text-blue-800 font-bold border border-blue-200',
                        low: 'bg-brand-navy/[0.06] text-brand-navy/60 font-semibold border border-brand-navy/10',
                      };
                      return (
                      <div key={t.id} onClick={() => openTask(t)} className={`flex items-center gap-3 rounded-xl p-3 text-xs transition-all duration-200 hover:translate-x-0.5 cursor-pointer ${prioStyle[prio] || prioStyle.medium}`}>
                        <input
                          type="checkbox"
                          className="h-4.5 w-4.5 cursor-pointer rounded-md accent-brand-gold"
                          onClick={(e) => e.stopPropagation()}
                          onChange={async () => {
                            await fetch(`/api/kanban/board/tasks/${t.id}`, {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ status: 'done' })
                            });
                            queryClient.invalidateQueries({ queryKey: ['dashTasksFeed'] });
                          }}
                        />
                        <span className="font-bold text-brand-navy flex-1 tracking-tight">{t.title}</span>
                        <span className={`shrink-0 px-2 py-0.5 rounded-full text-[9px] uppercase tracking-wider ${prioBadge[prio] || prioBadge.medium}`}>{prio}</span>
                      </div>
                      );
                    })}
                    {openTasksList.length === 0 && (
                      <div className="py-8 text-center">
                        <span className="text-2xl">🎉</span>
                        <p className="text-xs font-bold text-brand-navy mt-1.5">Zero pending tasks</p>
                        <p className="text-[11px] text-brand-textLight">You are all caught up for today!</p>
                      </div>
                    )}
                  </div>
                </Panel>
              );

            case 'leads':
              return (
                <div key={w.key} className={`${spanClass} reveal-widget`}>
                  <KpiTile accent label="Total Leads" caption="All intake registrations" value={leads} valueClass="text-brand-navy" countKey="kpi-leads" onClick={() => navigate('/clients')} />
                </div>
              );

            case 'customers':
              return (
                <div key={w.key} className={`${spanClass} reveal-widget`}>
                  <KpiTile label="Customers" caption="Signed engagements" value={customers} countKey="kpi-customers" onClick={() => navigate('/clients')} />
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