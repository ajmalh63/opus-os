import { useState, useEffect, type ReactNode } from 'react';
import { useStaffAlerts } from '../lib/useStaffAlerts';
import { useLocation } from 'wouter';
import { useQuery } from '@tanstack/react-query';
import { useSession, type Me } from '../lib/session';
import WorkspaceLogo from './WorkspaceLogo';
import CommandPalette from './CommandPalette';

export interface NavItem {
  key: string;
  label: string;
  to: string;
  icon: string;
  roles: string[];
  match: string;
}

export interface NavSection {
  title: string;
  items: NavItem[];
}

const ALL = ['super_admin', 'manager', 'counselor', 'receptionist', 'coordinator'];

const I = {
  dash: 'M3 12l9-9 9 9M5 10v10h5v-6h4v6h5V10',
  kanban: 'M6 3h12M9 3v18M15 3v18M4 21h16',
  clients: 'M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2M9 11a4 4 0 100-8 4 4 0 000 8zm14 10v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75',
  inbox: 'M22 12h-6l-2 3h-4l-2-3H2M5.45 5.11L2 12v6a2 2 0 002 2h16a2 2 0 002-2v-6l-3.45-6.89A2 2 0 0016.76 4H7.24a2 2 0 00-1.79 1.11z',
  admindesk: 'M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z',
  funnel: 'M3 3v18h18M7 14l4-4 3 3 5-6',
  campaigns: 'M11 5.882V19.24a1.76 1.76 0 01-3.01 1.247L3 14.8V9.2l4.985-4.9A1.76 1.76 0 0111 5.67zM14.5 6.5a1 1 0 000 1.5M12 1.5c3.5 0 6 2.5 6 6s-2.5 6-6 6',
  growth: 'M2 12h3l3-9 4 18 3-9h3',
  compliance: 'M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  roles: 'M5.121 17.804A13.937 13.937 0 0112 16c2.5 0 4.847.655 6.879 1.804M15 10a3 3 0 11-6 0 3 3 0 016 0zm6 2a9 9 0 11-18 0 9 9 0 0118 0z',
  infra: 'M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.065 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065zM15 12a3 3 0 11-6 0 3 3 0 016 0z',
  audit: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2M6 12h12',
  partner: 'M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z',
  billing: 'M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4',
  team: 'M17 8h2a2 2 0 012 2v6a2 2 0 01-2 2h-2v4l-4-4H9a1.994 1.994 0 01-1.414-.583m7.44-2.982a1.994 1.994 0 00-.777-.435M6 12a2 2 0 00-2 2v4h2v4l4-4m-2-6h.01M8 8a4 4 0 108 0 4 4 0 00-8 0z',
  signout: 'M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1',
  panel: 'M11 19l-7-7 7-7m8 14l-7-7 7-7',
  panelOpen: 'M13 5l7 7-7 7M5 5l7 7-7 7',
  calendar: 'M8 2v4M16 2v4M3 8h18M5 4h14a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V6a2 2 0 012-2z',
  doc: 'M7 3h7l5 5v13a1 1 0 01-1 1H7a1 1 0 01-1-1V4a1 1 0 011-1zm7 0v5h5M9 13h6M9 17h6',
};

export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Overview',
    items: [
      { key: 'dashboard', label: 'Dashboard', to: '/dashboard', icon: I.dash, roles: ALL, match: '/dashboard' },
      { key: 'inbox', label: 'Inbox', to: '/inbox', icon: I.inbox, roles: ALL, match: '/inbox' },
      { key: 'clients', label: 'Clients', to: '/clients', icon: I.partner, roles: ['super_admin', 'manager', 'counselor', 'coordinator'], match: '/clients' },
      { key: 'kanban', label: 'Pipeline', to: '/kanban', icon: I.kanban, roles: ['super_admin', 'manager', 'counselor', 'coordinator'], match: '/kanban' },
      { key: 'divisions', label: 'Divisions', to: '/divisions', icon: I.dash, roles: ALL, match: '/divisions' },
    ],
  },
  {
    title: 'Operations',
    items: [
      { key: 'billing', label: 'Billing & GST', to: '/billing', icon: I.billing, roles: ALL, match: '/billing' },
      { key: 'analytics', label: 'Flow Analytics', to: '/analytics', icon: I.growth, roles: ['super_admin', 'manager'], match: '/analytics' },
      { key: 'visibility', label: 'Visibility Hub', to: '/visibility', icon: I.growth, roles: ['super_admin', 'manager'], match: '/visibility' },
      { key: 'bookings', label: 'Consultations', to: '/bookings', icon: I.calendar, roles: ['super_admin', 'manager', 'counselor', 'receptionist', 'coordinator'], match: '/bookings' },
      { key: 'agreements', label: 'Agreements', to: '/agreements', icon: I.doc, roles: ['super_admin', 'manager', 'counselor'], match: '/agreements' },
    ],
  },
  {
    title: 'Marketing',
    items: [
      { key: 'funnel', label: 'Sales Funnel', to: '/workspaces/funnel', icon: I.funnel, roles: ['super_admin', 'manager'], match: '/workspaces/funnel' },
      { key: 'marketing', label: 'Marketing', to: '/workspaces/marketing', icon: I.campaigns, roles: ['super_admin'], match: '/workspaces/marketing' },
      { key: 'campaigns', label: 'Campaigns', to: '/workspaces/campaigns', icon: I.campaigns, roles: ['super_admin'], match: '/workspaces/campaigns' },
      { key: 'growth', label: 'Leads & Growth', to: '/workspaces/growth', icon: I.growth, roles: ['super_admin', 'manager'], match: '/workspaces/growth' },
    ],
  },
  {
    title: 'Finance & Ops',
    items: [
      { key: 'compliance', label: 'Compliance', to: '/workspaces/compliance', icon: I.compliance, roles: ['super_admin', 'manager'], match: '/workspaces/compliance' },
      { key: 'performance', label: 'Performance', to: '/workspaces/performance', icon: I.growth, roles: ['super_admin'], match: '/workspaces/performance' },
      { key: 'growthmetrics', label: 'Growth Metrics', to: '/workspaces/growth', icon: I.growth, roles: ['super_admin'], match: '/workspaces/growth' },
      { key: 'infra', label: 'Infra Health', to: '/workspaces/infra', icon: I.infra, roles: ['super_admin'], match: '/workspaces/infra' },
    ],
  },
  {
    title: 'Security & Program',
    items: [
      { key: 'control', label: 'Admin Desk', to: '/control', icon: I.admindesk, roles: ['super_admin'], match: '/control' },
      { key: 'audit', label: 'Security Logs', to: '/workspaces/audit', icon: I.audit, roles: ['super_admin'], match: '/workspaces/audit' },
      { key: 'roles', label: 'Roles & Access', to: '/workspaces/roles', icon: I.roles, roles: ['super_admin'], match: '/workspaces/roles' },
    ],
  },
];

export function allowedNavFor(me: Me | null): NavSection[] {
  if (!me) return [];
  const role = me.role;
  if (role === 'super_admin') return NAV_SECTIONS;

  return NAV_SECTIONS
    .map((s) => ({
      ...s,
      items: s.items.filter((i) => {
        if (!i.roles.includes(role)) return false;
        // Verify custom divisions/modules assigned to standard staff
        const checkKeys = ['clients', 'kanban', 'billing', 'taxes', 'analytics', 'audit', 'divisions', 'study-abroad', 'visa', 'umrah', 'attestation', 'manpower', 'visibility', 'bookings', 'agreements'];
        if (checkKeys.includes(i.key)) {
          return me.userDivisions.includes(i.key);
        }
        return true;
      })
    }))
    .filter((s) => s.items.length > 0);
}

export default function WorkspaceShell({ children }: { children?: ReactNode }) {
  const { me, refresh } = useSession();
  const [location, setLocation] = useLocation();
  const [collapsed, setCollapsed] = useState(false);

  // Mobile pass: auto-collapse the sidebar on narrow screens
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    if (mq.matches) setCollapsed(true);
    const handler = (e: any) => setCollapsed(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, []);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [alertsOpen, setAlertsOpen] = useState(false);
  const { alerts, newCount, markAllSeen } = useStaffAlerts();

  // My Work badge: open tasks assigned to this staff member (live)
  const { data: myTasks } = useQuery<{ openCount: number }>({
    queryKey: ['myOpenTasks'],
    queryFn: async () => {
      const res = await fetch('/api/tasks/assigned-to-me');
      if (!res.ok) throw new Error('tasks');
      return res.json();
    },
    refetchInterval: 60_000,
  });
  const openTasks = myTasks?.openCount || 0;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setPaletteOpen((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const sections = allowedNavFor(me);

  // Unread inbox badge (polls like the inbox page)
  const { data: inboxData } = useQuery<{ unreadTotal?: number }>({
    queryKey: ['navInboxUnread'],
    queryFn: async () => {
      const r = await fetch('/api/inbox');
      if (!r.ok) return { unreadTotal: 0 };
      return r.json();
    },
    refetchInterval: 20000
  });
  const unread = inboxData?.unreadTotal || 0;
  const isActive = (match: string) => {
    const patterns = match.split('|');
    return patterns.some((p) => (p === '/workspaces' ? location === '/workspaces' || location === '/' : location.startsWith(p) || location.startsWith(p.split('?')[0])));
  };

  const signOut = async () => {
    await fetch('/api/auth/sign-out', { method: 'POST', credentials: 'include' });
    await refresh();
    setLocation('/login');
  };

  return (
    <div className="flex min-h-screen bg-[#FAF8F4] text-white selection:bg-brand-gold selection:text-brand-navy font-sans">
      <aside className={`sticky top-0 flex h-screen shrink-0 flex-col border-r border-white/10 bg-[#06182c]/98 shadow-2xl backdrop-blur-xl transition-[width] duration-300 z-30 ${collapsed ? 'w-[72px]' : 'w-[252px]'}`}>
        <div className="flex h-16 items-center gap-2 px-4 border-b border-white/10 bg-white/[0.02]">
          {collapsed ? <WorkspaceLogo compact /> : <WorkspaceLogo />}
          {!collapsed ? (
            <button onClick={() => setCollapsed(true)} title="Collapse sidebar"
              className="ml-auto cursor-pointer rounded-lg p-1.5 text-slate-400 transition-all hover:bg-white/10 hover:text-brand-gold">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d={I.panel} /></svg>
            </button>
          ) : (
            <button onClick={() => setCollapsed(false)} title="Expand sidebar"
              className="mx-auto cursor-pointer rounded-lg p-1.5 text-slate-400 transition-all hover:bg-white/10 hover:text-brand-gold">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d={I.panelOpen} /></svg>
            </button>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto px-2.5 py-4 scrollbar-thin scrollbar-thumb-white/10">
          {sections.map((section) => (
            <div key={section.title} className="mb-5">
              {!collapsed && (
                <div className="mb-2 px-3 text-[10px] font-extrabold uppercase tracking-[0.18em] text-brand-gold/80 flex items-center gap-1.5">
                  <span className="h-1 w-1 rounded-full bg-brand-gold/60" />
                  {section.title}
                </div>
              )}
              {collapsed && <div className="mx-2 mb-2 border-t border-white/10" />}
              <ul className="space-y-1">
                {section.items.map((item) => {
                  const active = isActive(item.to);
                  return (
                    <li key={item.key}>
                      <button
                        onClick={() => setLocation(item.to)}
                        title={collapsed ? item.label : undefined}
                        className={`group relative flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-xs font-medium transition-all duration-200 cursor-pointer ${
                          active 
                            ? 'bg-gradient-to-r from-brand-gold/20 via-brand-gold/10 to-transparent text-brand-gold font-bold shadow-xs border-l-2 border-brand-gold' 
                            : 'text-slate-300 hover:bg-white/[0.07] hover:text-white'
                        }`}
                      >
                        <svg className={`h-[18px] w-[18px] shrink-0 transition-transform group-hover:scale-110 ${active ? 'text-brand-gold drop-shadow-[0_0_8px_rgba(215,160,25,0.6)]' : 'text-slate-400 group-hover:text-white'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={active ? 2 : 1.6}>
                          <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                        </svg>
                        {!collapsed && <span className="truncate tracking-tight">{item.label}</span>}
                        {item.key === 'inbox' && unread > 0 && (
                          <span className="ml-auto rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-black text-white shadow-[0_0_10px_rgba(244,63,94,0.6)] animate-pulse">{unread}</span>
                        )}
                        {active && !collapsed && item.key !== 'inbox' && (
                          <span className="ml-auto h-1.5 w-1.5 rounded-full bg-brand-gold shadow-[0_0_6px_rgba(215,160,25,0.9)]" />
                        )}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className={`border-t border-white/10 p-3 bg-white/[0.02] ${collapsed ? 'text-center' : ''}`}>
          {!collapsed ? (
            <div className="flex items-center gap-3 rounded-xl p-1.5 hover:bg-white/[0.04] transition-colors">
              <button onClick={() => setLocation('/settings')} title="Settings & Profile"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gradient-to-br from-brand-gold to-amber-600 text-sm font-black text-brand-navy shadow-md hover:ring-2 hover:ring-brand-gold/60 cursor-pointer transition-all">
                {(me?.name || 'A').trim().charAt(0).toUpperCase()}
              </button>
              <div className="min-w-0 flex-1 cursor-pointer" onClick={() => setLocation('/settings')}>
                <div className="truncate text-xs font-bold text-white hover:text-brand-gold transition-colors">{me?.name || 'Ajmal'}</div>
                <div className="truncate text-[10px] uppercase tracking-wider font-semibold text-brand-gold/80">{me?.role?.replace('_', ' ') || 'super admin'}</div>
              </div>
              <button onClick={() => setLocation('/settings')} title="Settings"
                className="cursor-pointer rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-white/10 hover:text-white">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d={I.infra} /></svg>
              </button>
              <button onClick={signOut} title="Sign out"
                className="cursor-pointer rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-rose-500/20 hover:text-rose-400">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d={I.signout} /></svg>
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <button onClick={() => setLocation('/settings')} title="Settings & Profile"
                className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-brand-gold to-amber-600 text-sm font-black text-brand-navy shadow-md hover:ring-2 hover:ring-brand-gold/60 cursor-pointer transition-all">
                {(me?.name || 'A').trim().charAt(0).toUpperCase()}
              </button>
              <button onClick={signOut} title="Sign out"
                className="cursor-pointer rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-rose-500/20 hover:text-rose-400">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d={I.signout} /></svg>
              </button>
            </div>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-20 flex h-16 shrink-0 items-center gap-3 border-b border-white/10 bg-[#06182c]/90 px-6 backdrop-blur-md shadow-xs">
          {/* Breadcrumb Area */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-400">Workspace</span>
            <span className="text-slate-600">/</span>
            <div className="text-sm font-black text-white tracking-tight">
              {sections.flatMap((s) => s.items).find((i) => isActive(i.match || i.to))?.label || 'Dashboard'}
            </div>
          </div>

          {/* System Health Pulse Pill */}
          <div className="hidden sm:flex items-center gap-1.5 rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-bold text-emerald-300 shadow-xs">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse shadow-[0_0_6px_rgba(52,211,153,0.8)]" />
            <span>Operational</span>
          </div>

          {me?.twoFactorEnabled && (
            <span className="hidden md:inline-flex rounded-full bg-brand-gold/10 border border-brand-gold/30 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-brand-gold">
              🛡️ 2FA Verified
            </span>
          )}

          <div className="ml-auto flex items-center gap-3">
            {openTasks > 0 && (
              <button onClick={() => setLocation('/kanban')}
                className="inline-flex cursor-pointer items-center gap-2 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-1.5 text-xs font-bold text-amber-300 transition-all hover:bg-amber-500/20 shadow-xs active:scale-95">
                <span className="h-2 w-2 animate-pulse rounded-full bg-amber-400 shadow-[0_0_8px_rgba(251,191,36,0.8)]" />
                <span>My Work</span>
                <span className="rounded-full bg-amber-400/20 px-1.5 py-0.2 text-[10px]">{openTasks}</span>
              </button>
            )}

            {/* Live Activity Popover */}
            <div className="relative">
              <button
                onClick={() => setAlertsOpen(!alertsOpen)}
                className="relative cursor-pointer rounded-xl border border-white/10 bg-white/[0.03] p-2 text-slate-300 transition-all hover:border-brand-gold/50 hover:text-white active:scale-95"
                title="Live activity"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}><path strokeLinecap="round" strokeLinejoin="round" d="M15 17h5l-1.405-1.405A2.032 2.032 0 0118 14.158V11a6.002 6.002 0 00-4-5.659V5a2 2 0 10-4 0v.341C7.67 6.165 6 8.388 6 11v3.159c0 .538-.214 1.055-.595 1.436L4 17h5m6 0v1a3 3 0 11-6 0v-1m6 0H9" /></svg>
                {newCount > 0 && (
                  <span className="absolute -top-1 -right-1 grid h-4 w-4 place-items-center rounded-full bg-rose-500 text-[9px] font-black text-white shadow-[0_0_8px_rgba(244,63,94,0.8)] animate-pulse">{newCount > 9 ? '9+' : newCount}</span>
                )}
              </button>
              {alertsOpen && (
                <div className="absolute right-0 top-11 z-50 w-84 rounded-2xl border border-white/15 bg-[#0a233f] shadow-2xl overflow-hidden backdrop-blur-2xl">
                  <div className="flex items-center justify-between border-b border-white/10 px-4 py-3 bg-white/[0.02]">
                    <span className="text-[11px] font-extrabold uppercase tracking-wider text-brand-gold flex items-center gap-1.5">
                      <span className="h-1.5 w-1.5 rounded-full bg-brand-gold animate-pulse" />
                      Live Stream Alerts
                    </span>
                    {newCount > 0 && <button onClick={markAllSeen} className="text-[10px] font-bold uppercase text-slate-400 hover:text-brand-gold transition-colors cursor-pointer">Mark all seen</button>}
                  </div>
                  <div className="max-h-84 overflow-y-auto scrollbar-thin divide-y divide-white/5">
                    {alerts.length === 0 && <p className="px-4 py-8 text-center text-xs text-slate-400">No activity alerts yet.</p>}
                    {alerts.slice(0, 10).map((a) => (
                      <div key={a.id} className={`px-4 py-3 transition-colors ${a.status === 'new' ? 'bg-brand-gold/[0.08]' : 'hover:bg-white/[0.02]'}`}>
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-xs font-bold text-white truncate">{a.title}</span>
                          {a.status === 'new' && <span className="shrink-0 h-1.5 w-1.5 rounded-full bg-brand-gold shadow-[0_0_6px_rgba(215,160,25,0.9)]" />}
                        </div>
                        {a.body && <p className="text-[11px] text-slate-300 mt-1 line-clamp-2 leading-relaxed">{a.body}</p>}
                        <div className="flex items-center justify-between mt-2 pt-1 border-t border-white/5">
                          <span className="text-[9px] font-bold text-brand-gold/75 uppercase tracking-wider">{a.division} · {a.type}</span>
                          <span className="text-[10px] text-slate-400">{new Date(a.createdAt * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* Jump Command Palette Trigger */}
            <button
              onClick={() => setPaletteOpen(true)}
              className="hidden cursor-pointer items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs text-slate-300 transition-all hover:border-brand-gold/50 hover:bg-white/[0.06] hover:text-white sm:flex active:scale-95 shadow-xs"
            >
              <svg className="h-3.5 w-3.5 text-brand-gold" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.2-5.2m2.2-5.3a7.5 7.5 0 11-15 0 7.5 7.5 0 0115 0z" /></svg>
              <span>Command Bar</span>
              <kbd className="rounded-md border border-white/20 bg-white/10 px-1.5 py-0.5 font-mono text-[10px] font-bold text-slate-200">⌘K</kbd>
            </button>

            {/* User Chip */}
            <div className="flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] p-1 pr-3">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-gradient-to-br from-brand-gold to-amber-600 text-xs font-black text-brand-navy shadow-xs">
                {(me?.name || 'A').trim().charAt(0).toUpperCase()}
              </span>
              <span className="hidden sm:inline text-xs font-bold text-white tracking-tight">
                {me?.name || 'Ajmal'}
              </span>
            </div>
          </div>
        </header>

        <main className="relative flex min-h-0 flex-1 flex-col overflow-y-auto bg-[#FAF8F4]">
          {/* Off-white brand canvas: soft navy/gold orbs + film grain */}
          <div className="pointer-events-none absolute inset-0" aria-hidden="true">
            <div className="hero-orb -left-24 top-16 h-96 w-96 bg-brand-blue/[0.07] blur-[110px]" />
            <div className="hero-orb -right-20 top-1/3 h-[30rem] w-[30rem] bg-brand-gold/[0.06] blur-[130px]" />
            <div className="hero-orb bottom-0 left-1/3 h-80 w-80 bg-brand-blue/[0.05] blur-[110px]" />
          </div>
          <div className="film-grain" aria-hidden="true" />
          <div className="relative min-h-full w-full flex-1 px-6 py-6 text-brand-navy md:px-8 md:py-7">
            {children}
          </div>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
