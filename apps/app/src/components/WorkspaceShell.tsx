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
  dash: 'M3 12l9-9 9 9M5 10v10h5v-6h4v6h5V10', // Dashboard Home
  inbox: 'M20 13V6a2 2 0 00-2-2H6a2 2 0 00-2 2v7m16 0v5a2 2 0 01-2 2H6a2 2 0 01-2-2v-5m16 0h-4.5a2.5 2.5 0 01-2.5-2.5V13m-6 0h-4', // Unified Messaging Inbox
  clients: 'M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z', // Client Directory
  kanban: 'M9 17V7m0 10a2 2 0 01-2 2H5a2 2 0 01-2-2V7a2 2 0 012-2h2a2 2 0 012 2m0 10a2 2 0 002 2h2a2 2 0 002-2M9 7a2 2 0 012-2h2a2 2 0 012 2m0 10V7m0 10a2 2 0 002 2h2a2 2 0 002-2V7a2 2 0 00-2-2h-2a2 2 0 00-2 2', // Kanban Board
  divisions: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10', // Division Hubs
  billing: 'M12 8c-1.657 0-3 .895-3 2s1.343 2 3 2 3 .895 3 2-1.343 2-3 2m0-8c1.11 0 2.08.402 2.599 1M12 8V7m0 1v8m0 0v1m0-1c-1.11 0-2.08-.402-2.599-1M21 12a9 9 0 11-18 0 9 9 0 0118 0z', // Billing & Currency
  analytics: 'M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z', // Flow Analytics
  visibility: 'M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z', // Visibility Radar
  bookings: 'M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z', // Consultations Calendar
  agreements: 'M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z', // Legal Agreements
  funnel: 'M3 4a1 1 0 011-1h16a1 1 0 011 1v2.586a1 1 0 01-.293.707l-6.414 6.414a1 1 0 00-.293.707V17l-4 4v-6.586a1 1 0 00-.293-.707L3.293 7.293A1 1 0 013 6.586V4z', // Sales Funnel Filter
  marketing: 'M11 5.882V19.24a1.76 1.76 0 01-3.01 1.247L3 14.8V9.2l4.985-4.9A1.76 1.76 0 0111 5.67zM14.5 6.5a1 1 0 000 1.5M12 1.5c3.5 0 6 2.5 6 6s-2.5 6-6 6', // Marketing Megaphone
  campaigns: 'M13 10V3L4 14h7v7l9-11h-7z', // Campaigns Rocket / Fast Launch
  growth: 'M13 7h8m0 0v8m0-8l-8 8-4-4-6 6', // Leads & Growth Chart
  compliance: 'M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z', // Shield Compliance
  performance: 'M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z', // Performance Bar Metrics
  growthmetrics: 'M16 8v8m-4-5v5m-4-2v2m-2 4h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z', // Growth Metrics
  infra: 'M5 12h14M5 12a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v4a2 2 0 01-2 2M5 12a2 2 0 00-2 2v4a2 2 0 002 2h14a2 2 0 002-2v-4a2 2 0 00-2-2m-2-4h.01M17 16h.01', // Server Infrastructure
  control: 'M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4', // Admin Desk Controls
  audit: 'M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01', // Security Logs
  roles: 'M10 6H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V8a2 2 0 00-2-2h-5m-4 0V5a2 2 0 114 0v1m-4 0a2 2 0 104 0m-5 8a2 2 0 100-4 2 2 0 000 4zm0 0c1.306 0 2.417.835 2.83 2H9.17A3.001 3.001 0 0112 14z', // Roles & Access Badge
  signout: 'M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1',
  panel: 'M11 19l-7-7 7-7m8 14l-7-7 7-7',
  panelOpen: 'M13 5l7 7-7 7M5 5l7 7-7 7',
};

export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Overview',
    items: [
      { key: 'dashboard', label: 'Dashboard', to: '/dashboard', icon: I.dash, roles: ALL, match: '/dashboard' },
      { key: 'inbox', label: 'Inbox', to: '/inbox', icon: I.inbox, roles: ALL, match: '/inbox' },
      { key: 'clients', label: 'Clients', to: '/clients', icon: I.clients, roles: ['super_admin', 'manager', 'counselor', 'coordinator'], match: '/clients' },
      { key: 'kanban', label: 'Pipeline', to: '/kanban', icon: I.kanban, roles: ['super_admin', 'manager', 'counselor', 'coordinator'], match: '/kanban' },
      { key: 'divisions', label: 'Divisions', to: '/divisions', icon: I.divisions, roles: ALL, match: '/divisions' },
    ],
  },
  {
    title: 'Operations',
    items: [
      { key: 'billing', label: 'Billing & GST', to: '/billing', icon: I.billing, roles: ALL, match: '/billing' },
      { key: 'analytics', label: 'Flow Analytics', to: '/analytics', icon: I.analytics, roles: ['super_admin', 'manager'], match: '/analytics' },
      { key: 'visibility', label: 'Visibility Hub', to: '/visibility', icon: I.visibility, roles: ['super_admin', 'manager'], match: '/visibility' },
      { key: 'bookings', label: 'Consultations', to: '/bookings', icon: I.bookings, roles: ['super_admin', 'manager', 'counselor', 'receptionist', 'coordinator'], match: '/bookings' },
      { key: 'agreements', label: 'Agreements', to: '/agreements', icon: I.agreements, roles: ['super_admin', 'manager', 'counselor'], match: '/agreements' },
    ],
  },
  {
    title: 'Marketing',
    items: [
      { key: 'funnel', label: 'Sales Funnel', to: '/workspaces/funnel', icon: I.funnel, roles: ['super_admin', 'manager'], match: '/workspaces/funnel' },
      { key: 'marketing', label: 'Marketing', to: '/workspaces/marketing', icon: I.marketing, roles: ['super_admin'], match: '/workspaces/marketing' },
      { key: 'campaigns', label: 'Campaigns', to: '/workspaces/campaigns', icon: I.campaigns, roles: ['super_admin'], match: '/workspaces/campaigns' },
      { key: 'growth', label: 'Leads & Growth', to: '/workspaces/growth', icon: I.growth, roles: ['super_admin', 'manager'], match: '/workspaces/growth' },
    ],
  },
  {
    title: 'Finance & Ops',
    items: [
      { key: 'compliance', label: 'Compliance', to: '/workspaces/compliance', icon: I.compliance, roles: ['super_admin', 'manager'], match: '/workspaces/compliance' },
      { key: 'performance', label: 'Performance', to: '/workspaces/performance', icon: I.performance, roles: ['super_admin'], match: '/workspaces/performance' },
      { key: 'growthmetrics', label: 'Growth Metrics', to: '/workspaces/growth', icon: I.growthmetrics, roles: ['super_admin'], match: '/workspaces/growth' },
      { key: 'infra', label: 'Infra Health', to: '/workspaces/infra', icon: I.infra, roles: ['super_admin'], match: '/workspaces/infra' },
    ],
  },
  {
    title: 'Security & Program',
    items: [
      { key: 'control', label: 'Admin Desk', to: '/control', icon: I.control, roles: ['super_admin'], match: '/control' },
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
