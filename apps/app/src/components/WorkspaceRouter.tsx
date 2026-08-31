import { useRoute } from 'wouter';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useSession } from '../lib/session';
import { useRevealRoot } from '../lib/reveal';
import DashboardHome from '../pages/DashboardHome';
import FunnelTab from './FunnelTab';
import CampaignsTab from './CampaignsTab';
import GrowthTab from './GrowthTab';
import ComplianceTab from './ComplianceTab';
import RolesTab from './RolesTab';
import FlowAnalytics from './FlowAnalytics';
import TeamHub from './TeamHub';
import TransactionsTab from './TransactionsTab';
import InfraHealth from './InfraHealth';
import FleetConsole from './fleet/FleetConsole';
import PerformanceTab from './PerformanceTab';
import MarketingTab from './MarketingTab';
import BoardsTab from './BoardsTab';
import AiGovernanceTab from './admin/AiGovernanceTab';
import GrowthMetricsTab from './GrowthMetricsTab';
const API = (import.meta as any).env?.VITE_API_URL || '';


// Client-side mirror of the server Rbac gate. The server enforces the real
// ceiling (403) - this mirror only decides what to render.
const MODULE_ROLES: Record<string, string[]> = {
  ai: ['super_admin'],
  funnel: ['super_admin', 'manager'],
  campaigns: ['super_admin'],
  growth: ['super_admin', 'manager'],
  growthmetrics: ['super_admin', 'manager'],
  roles: ['super_admin'],
  compliance: ['super_admin', 'manager'],
  audit: ['super_admin'],
   infra: ['super_admin'],
  fleet: ['super_admin'],
  flow: ['super_admin', 'manager'],
teamhub: ['super_admin', 'manager', 'counselor', 'receptionist', 'coordinator'],
  transactions: ['super_admin', 'manager', 'counselor', 'receptionist', 'coordinator'],
  boards: ['super_admin', 'manager', 'counselor', 'receptionist', 'coordinator'],
  performance: ['super_admin', 'manager'],
  marketing: ['super_admin', 'manager'],
};

// Audit trail viewer (super_admin) - the immutable change log.
function AuditView() {
  const { data } = useQuery<{ logs?: any[] }>({
    queryKey: ['auditTrail'],
    queryFn: async () => {
      const r = await fetch(`${API}/api/admin/audit-logs?limit=500`, { credentials: 'include' });
      if (!r.ok) throw new Error('audit');
      return r.json();
    },
  });
  const logs = data?.logs || [];
  const rootRef = useRevealRoot<HTMLDivElement>();
  const [fAction, setFAction] = useState('');
  const [fEntity, setFEntity] = useState('');
  const [fActor, setFActor] = useState('');

  const actions = [...new Set(logs.map((l: any) => l.action).filter(Boolean))].sort();
  const entities = [...new Set(logs.map((l: any) => l.entityName).filter(Boolean))].sort();
  const actors = [...new Set(logs.map((l: any) => l.actorName || l.actorId).filter(Boolean))].sort();

  const filtered = logs.filter((l: any) => {
    if (fAction && l.action !== fAction) return false;
    if (fEntity && l.entityName !== fEntity) return false;
    if (fActor && (l.actorName || l.actorId) !== fActor) return false;
    return true;
  });

  // Runtime logs sub-view (in-OS log viewer)
  const [view, setView] = useState<'audit' | 'runtime'>('audit');
  const [rtLevel, setRtLevel] = useState('');
  const [rtSource, setRtSource] = useState('');
  const { data: rt } = useQuery<{ logs?: any[]; sources?: string[] }>({
    queryKey: ['runtimeLogs', rtLevel, rtSource],
    queryFn: async () => {
      const r = await fetch(`${API}/api/admin/runtime-logs?limit=300&level=${rtLevel}&source=${encodeURIComponent(rtSource)}`, { credentials: 'include' });
      if (!r.ok) throw new Error('runtime');
      return r.json();
    },
    refetchInterval: 30000,
  });
  const rtLogs = rt?.logs || [];

  const exportCsv = () => {
    const rows = filtered.map((l: any) => [new Date((l.createdAt || 0) * 1000).toISOString(), l.actorName || l.actorId || '', l.action || '', l.entityName || '', l.entityId || '', l.ipAddress || '']);
    const head = ['Time', 'Actor', 'Action', 'Entity', 'ID', 'IP'];
    const csv = [head, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `audit-log-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div ref={rootRef} className="min-h-full p-6 md:p-8">
      <div className="reveal mb-6 flex items-center justify-between">
        <div>
          <h2 className="font-display text-lg font-bold text-brand-navy">Security Logs</h2>
          <p className="mt-1 text-xs text-brand-navy/40">Immutable audit trail of every critical mutation + runtime logs from the API.</p>
        </div>
        <div className="flex gap-1 rounded-full border border-brand-navy/15 bg-brand-navy/[0.04] p-1 text-[13px] font-bold uppercase">
          <button onClick={() => setView('audit')} className={`px-3 py-1.5 rounded-full transition-all cursor-pointer ${view === 'audit' ? 'bg-brand-gold text-brand-navy' : 'text-brand-navy/50 hover:text-brand-navy'}`}>Audit Trail</button>
          <button onClick={() => setView('runtime')} className={`px-3 py-1.5 rounded-full transition-all cursor-pointer ${view === 'runtime' ? 'bg-brand-gold text-brand-navy' : 'text-brand-navy/50 hover:text-brand-navy'}`}>Runtime Logs</button>
        </div>
      </div>
      <div className="reveal mb-4 flex flex-wrap items-center gap-2">
        <select value={fAction} onChange={(e) => setFAction(e.target.value)} className="rounded-lg border border-brand-navy/10 bg-white px-2.5 py-1.5 text-[13px] text-brand-navy outline-none cursor-pointer">
          <option value="">All actions</option>
          {actions.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select value={fEntity} onChange={(e) => setFEntity(e.target.value)} className="rounded-lg border border-brand-navy/10 bg-white px-2.5 py-1.5 text-[13px] text-brand-navy outline-none cursor-pointer">
          <option value="">All entities</option>
          {entities.map(e => <option key={e} value={e}>{e}</option>)}
        </select>
        <select value={fActor} onChange={(e) => setFActor(e.target.value)} className="rounded-lg border border-brand-navy/10 bg-white px-2.5 py-1.5 text-[13px] text-brand-navy outline-none cursor-pointer">
          <option value="">All actors</option>
          {actors.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <span className="text-[13px] text-brand-navy/40 font-bold">{filtered.length} events</span>
        <button onClick={exportCsv} disabled={filtered.length === 0} className="ml-auto rounded-lg border border-brand-navy/15 bg-brand-navy/[0.04] px-3 py-1.5 text-[13px] font-bold text-brand-navy hover:border-brand-gold/50 transition-all cursor-pointer disabled:opacity-40">📤 Export CSV</button>
      </div>
      {view === 'runtime' && (
        <div className="reveal mb-4 flex flex-wrap items-center gap-2">
          <select value={rtLevel} onChange={(e) => setRtLevel(e.target.value)} className="rounded-lg border border-brand-navy/10 bg-white px-2.5 py-1.5 text-[13px] text-brand-navy outline-none cursor-pointer">
            <option value="">All levels</option>
            <option value="info">info</option>
            <option value="warn">warn</option>
            <option value="error">error</option>
          </select>
          <select value={rtSource} onChange={(e) => setRtSource(e.target.value)} className="rounded-lg border border-brand-navy/10 bg-white px-2.5 py-1.5 text-[13px] text-brand-navy outline-none cursor-pointer">
            <option value="">All sources</option>
            {(rt?.sources || []).map(sr => <option key={sr} value={sr}>{sr}</option>)}
          </select>
          <span className="text-[13px] text-brand-navy/40 font-bold">{rtLogs.length} entries · 30s auto-refresh</span>
        </div>
      )}
      {view === 'runtime' && (
        <div className="reveal overflow-x-auto rounded-2xl border border-brand-navy/10 bg-white shadow-[0_20px_40px_-15px_rgba(10,45,80,0.10)]">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-brand-navy/[0.08] bg-brand-navy/[0.04] text-[13px] uppercase tracking-wider text-brand-gold">
              <tr>
                <th className="px-4 py-3">Time</th>
                <th className="px-4 py-3">Level</th>
                <th className="px-4 py-3">Source</th>
                <th className="px-4 py-3">Message</th>
                <th className="px-4 py-3">Detail</th>
              </tr>
            </thead>
            <tbody>
              {rtLogs.length === 0 && (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-brand-navy/50">No runtime logs yet — they appear as the API handles requests.</td></tr>
              )}
              {rtLogs.map((l: any) => (
                <tr key={l.id} className="border-b border-brand-navy/[0.08] text-brand-navy/70 hover:bg-brand-navy/[0.04]">
                  <td className="whitespace-nowrap px-4 py-2.5">{new Date((l.createdAt || 0) * 1000).toLocaleString()}</td>
                  <td className="px-4 py-2.5">
                    <span className={`rounded px-1.5 py-0.5 font-mono text-[13px] ${l.level === 'error' ? 'bg-rose-500/15 text-rose-600' : l.level === 'warn' ? 'bg-amber-500/15 text-amber-700' : 'bg-emerald-500/15 text-emerald-700'}`}>{l.level}</span>
                  </td>
                  <td className="px-4 py-2.5 font-mono text-[13px] text-brand-navy/50">{l.source}</td>
                  <td className="px-4 py-2.5">{l.message}</td>
                  <td className="px-4 py-2.5 font-mono text-[13px] text-brand-navy/40">{l.detail ? String(l.detail).slice(0, 80) : '-'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {view === 'audit' && (
      <div className="reveal overflow-x-auto rounded-2xl border border-brand-navy/10 bg-white shadow-[0_20px_40px_-15px_rgba(10,45,80,0.10)]">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-brand-navy/[0.08] bg-brand-navy/[0.04] text-[13px] uppercase tracking-wider text-brand-gold">
            <tr>
              <th className="px-4 py-3">Time</th>
              <th className="px-4 py-3">Actor</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Entity</th>
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">IP</th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-brand-navy/50">No audit events match.</td></tr>
            )}
            {filtered.map((l: any) => (
              <tr key={l.id} className="border-b border-brand-navy/[0.08] text-brand-navy/70 hover:bg-brand-navy/[0.04]">
                <td className="whitespace-nowrap px-4 py-2.5">{new Date((l.createdAt || 0) * 1000).toLocaleString()}</td>
                <td className="px-4 py-2.5">{l.actorId ? (l.actorName || 'staff') : 'system'}</td>
                <td className="px-4 py-2.5">
                  <span className="rounded bg-brand-gold/10 px-1.5 py-0.5 font-mono text-[13px] text-brand-gold">{l.action}</span>
                </td>
                <td className="px-4 py-2.5">{l.entityName}</td>
                <td className="px-4 py-2.5 font-mono text-sm text-brand-navy/50">{l.entityId}</td>
                <td className="px-4 py-2.5 text-brand-navy/50">{l.ipAddress || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}
    </div>
  );
}

function RestrictedModule({ name }: { name: string }) {
  const rootRef = useRevealRoot<HTMLDivElement>();
  return (
    <div ref={rootRef} className="grid min-h-[70vh] place-items-center p-12">
      <div className="reveal max-w-sm text-center">
        <div className="mx-auto w-fit rounded-full border border-rose-200/60 bg-rose-50 px-3 py-1 text-[13px] font-bold uppercase tracking-wider text-rose-700">
          Restricted
        </div>
        <p className="mt-4 text-sm text-brand-navy/70">
          The "{name}" module requires the right role. The server blocks it too - ask the owner if you need access.
        </p>
      </div>
    </div>
  );
}

function NotFoundModule({ name }: { name: string }) {
  const rootRef = useRevealRoot<HTMLDivElement>();
  return (
    <div ref={rootRef} className="grid min-h-[70vh] place-items-center p-12">
      <div className="reveal max-w-sm text-center">
        <p className="text-sm text-brand-navy/40">Module "{name}" not found - return to the dashboard.</p>
      </div>
    </div>
  );
}

export function WorkspaceModule({ name }: { name: string }) {
  const { me } = useSession();
  const allowed = (MODULE_ROLES[name] || []).includes(me?.role || '');
  if (!allowed) return <RestrictedModule name={name} />;

  switch (name) {
    case 'audit': return <AuditView />;
    case 'funnel': return <FunnelTab />;
    case 'campaigns': return <CampaignsTab />;
    case 'growth': return <GrowthTab />;
    case 'growthmetrics': return <GrowthMetricsTab />;
    case 'compliance': return <ComplianceTab />;
    case 'roles': return <RolesTab />;
    case 'infra': return <InfraHealth />;
    case 'fleet': return <FleetConsole />;
    case 'flow': return <FlowAnalytics />;
    case 'teamhub': return <TeamHub />;
case 'transactions': return <TransactionsTab />;
    case 'performance': return <PerformanceTab />;
    case 'boards': return <BoardsTab />;
    case 'marketing': return <MarketingTab />;
    case 'ai': return <AiGovernanceTab />;
    default: return <NotFoundModule name={name} />;
  }
}

export function WorkspaceRouter() {
  const [match, params] = useRoute('/workspaces/:slug');
  if (match && params?.slug) return <WorkspaceModule name={params.slug} />;
  return <DashboardHome />;
}
