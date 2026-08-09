import { useState, useEffect, type ReactNode } from 'react';
import { useLocation } from 'wouter';
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
  signout: 'M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1',
  panel: 'M11 19l-7-7 7-7m8 14l-7-7 7-7',
  panelOpen: 'M13 5l7 7-7 7M5 5l7 7-7 7',
};

export const NAV_SECTIONS: NavSection[] = [
  {
    title: 'Overview',
    items: [
      { key: 'dashboard', label: 'Dashboard', to: '/workspaces', icon: I.dash, roles: ALL, match: '/workspaces' },
{ key: 'pipeline', label: 'Clients & Pipeline', to: '/kanban', icon: I.kanban, roles: ['super_admin', 'manager', 'counselor', 'coordinator'], match: '/kanban|/clients' },
    ],
  },
  {
    title: 'Work',
    items: [
      { key: 'inbox', label: 'Unified Inbox', to: '/inbox', icon: I.inbox, roles: ALL, match: '/inbox' },
      // Admin API is owner-ceiled server-side; managers never get past 403.
      { key: 'admindesk', label: 'Admin Control Desk', to: '/admin', icon: I.admindesk, roles: ['super_admin'], match: '/admin' },
    ],
  },
  {
    title: 'Growth & Marketing',
    items: [
      { key: 'funnel', label: 'Sales Funnel', to: '/workspaces/funnel', icon: I.funnel, roles: ['super_admin', 'manager'], match: '/workspaces/funnel' },
      { key: 'campaigns', label: 'Campaigns', to: '/workspaces/campaigns', icon: I.campaigns, roles: ['super_admin'], match: '/workspaces/campaigns' },
      { key: 'growth', label: 'Growth & Incentives', to: '/workspaces/growth', icon: I.growth, roles: ['super_admin', 'manager'], match: '/workspaces/growth' },
    ],
  },
  {
    title: 'Systems & Compliance',
    items: [
      { key: 'compliance', label: 'Compliance (GST)', to: '/workspaces/compliance', icon: I.compliance, roles: ['super_admin', 'manager'], match: '/workspaces/compliance' },
      { key: 'roles', label: 'Roles & Permissions', to: '/workspaces/roles', icon: I.roles, roles: ['super_admin'], match: '/workspaces/roles' },
      { key: 'infra', label: 'Infrastructure', to: '/workspaces/infra', icon: I.infra, roles: ['super_admin'], match: '/workspaces/infra' },
      { key: 'audit', label: 'Audit Trail', to: '/workspaces/audit', icon: I.audit, roles: ['super_admin'], match: '/workspaces/audit' },
    ],
  },
];

export function allowedNavFor(me: Me | null): NavSection[] {
  const role = me?.role;
  return NAV_SECTIONS
    .map((s) => ({ ...s, items: s.items.filter((i) => i.roles.includes(role || '')) }))
    .filter((s) => s.items.length > 0);
}

export default function WorkspaceShell({ children }: { children?: ReactNode }) {
  const { me, refresh } = useSession();
  const [location, setLocation] = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);

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
  const isActive = (match: string) => {
    const patterns = match.split('|');
    return patterns.some((p) => (p === '/workspaces' ? location === '/workspaces' || location === '/' : location.startsWith(p)));
  };

  const signOut = async () => {
    await fetch('/api/auth/sign-out', { method: 'POST', credentials: 'include' });
    await refresh();
    setLocation('/login');
  };

  return (
    <div className="flex min-h-screen bg-[#0A1128] text-white">
      <aside className={`sticky top-0 flex h-screen shrink-0 flex-col border-r border-white/[0.06] bg-[#0B132B]/95 transition-[width] duration-300 ${collapsed ? 'w-[72px]' : 'w-[248px]'}`}>
        <div className="flex h-14 items-center gap-2 px-4">
          {collapsed ? <WorkspaceLogo compact /> : <WorkspaceLogo />}
          {!collapsed ? (
            <button onClick={() => setCollapsed(true)} title="Collapse"
              className="ml-auto cursor-pointer rounded-md p-1 text-slate-500 transition-colors hover:bg-white/10 hover:text-white">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}><path strokeLinecap="round" strokeLinejoin="round" d={I.panel} /></svg>
            </button>
          ) : (
            <button onClick={() => setCollapsed(false)} title="Expand"
              className="cursor-pointer rounded-md p-1 text-slate-500 transition-colors hover:bg-white/10 hover:text-white">
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}><path strokeLinecap="round" strokeLinejoin="round" d={I.panelOpen} /></svg>
            </button>
          )}
        </div>

        <nav className="flex-1 overflow-y-auto px-2 py-4">
          {sections.map((section) => (
            <div key={section.title} className="mb-5">
              {!collapsed && (
                <div className="mb-1.5 px-2 text-[10px] font-bold uppercase tracking-[0.14em] text-slate-500">{section.title}</div>
              )}
              {collapsed && <div className="mx-2 mb-2 border-t border-white/10" />}
              <ul className="space-y-0.5">
                {section.items.map((item) => {
                  const active = isActive(item.to);
                  return (
                    <li key={item.key}>
                      <button
                        onClick={() => setLocation(item.to)}
                        title={collapsed ? item.label : undefined}
                        className={`group flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left text-[13px] transition-colors ${
                          active ? 'bg-brand-gold/10 text-brand-gold' : 'text-slate-300 hover:bg-white/[0.06] hover:text-white'
                        }`}
                      >
                        <svg className={`h-[17px] w-[17px] shrink-0 ${active ? 'text-brand-gold' : 'text-slate-400 group-hover:text-white'}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}>
                          <path strokeLinecap="round" strokeLinejoin="round" d={item.icon} />
                        </svg>
                        {!collapsed && <span className="truncate">{item.label}</span>}
                        {active && !collapsed && <span className="ml-auto h-1.5 w-1.5 rounded-full bg-brand-gold" />}
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </nav>

        <div className={`border-t border-white/10 p-3 ${collapsed ? 'text-center' : ''}`}>
          {!collapsed ? (
            <div className="flex items-center gap-3">
              <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-gold/15 text-sm font-bold text-brand-gold">
                {(me?.name || 'O').trim().charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-xs font-semibold">{me?.name || 'Operator'}</div>
                <div className="truncate text-[10px] capitalize text-slate-500">{me?.role?.replace('_', ' ') || 'staff'}</div>
              </div>
              <button onClick={signOut} title="Sign out"
                className="cursor-pointer rounded-md p-1.5 text-slate-500 transition-colors hover:bg-red-500/10 hover:text-red-400">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}><path strokeLinecap="round" strokeLinejoin="round" d={I.signout} /></svg>
              </button>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <div className="grid h-9 w-9 place-items-center rounded-full bg-brand-gold/15 text-sm font-bold text-brand-gold">
                {(me?.name || 'O').trim().charAt(0).toUpperCase()}
              </div>
              <button onClick={signOut} title="Sign out"
                className="cursor-pointer rounded-md p-1.5 text-slate-500 transition-colors hover:bg-red-500/10 hover:text-red-400">
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}><path strokeLinecap="round" strokeLinejoin="round" d={I.signout} /></svg>
              </button>
            </div>
          )}
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
<header className="sticky top-0 z-20 flex h-14 shrink-0 items-center gap-3 border-b border-white/[0.06] bg-[#0A1128]/85 px-6 backdrop-blur">
          <div className="text-sm font-semibold text-white">
            {sections.flatMap((s) => s.items).find((i) => isActive(i.match || i.to))?.label || 'Workspace'}
          </div>
          {me?.twoFactorEnabled && (
            <span className="rounded-full bg-emerald-500/10 px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-emerald-300">2FA on</span>
          )}
<div className="ml-auto flex items-center gap-3">
            <button
              onClick={() => setPaletteOpen(true)}
              className="hidden cursor-pointer items-center gap-2 rounded-md border border-white/10 px-2.5 py-1 text-[11px] text-slate-400 transition-colors hover:border-brand-gold/40 hover:text-white sm:flex"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.6}><path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-5.2-5.2m2.2-5.3a7.5 7.5 0 11-15 0 7.5 7.5 0 0115 0z" /></svg>
              Jump…
              <kbd className="rounded border border-white/15 bg-white/5 px-1 font-mono text-[9px]">⌘K</kbd>
            </button>
            <span className="hidden rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider text-slate-400 sm:inline">
              {me?.role?.replace('_', ' ')}
            </span>
            <span className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-brand-gold/15 text-[11px] font-bold text-brand-gold">
              {(me?.name || 'O').trim().charAt(0).toUpperCase()}
            </span>
          </div>
        </header>

<main className="flex min-h-0 flex-1 flex-col overflow-y-auto bg-[#FAF8F4]">
          <div className="min-h-full w-full flex-1 px-6 py-6 md:px-8 md:py-7">
            {children}
          </div>
        </main>
      </div>

      <CommandPalette open={paletteOpen} onClose={() => setPaletteOpen(false)} />
    </div>
  );
}
