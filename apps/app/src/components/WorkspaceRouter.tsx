import { useRoute } from 'wouter';
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
import PerformanceTab from './PerformanceTab';
import MarketingTab from './MarketingTab';
import BoardsTab from './BoardsTab';

const AUTH = {
  get Cookie() {
    const s = document.cookie.split(';').map((p: string) => p.trim()).find((p: string) => p.startsWith('better-auth.session_token='));
    return s || '';
  }
} as Record<string, string>;

// Client-side mirror of the server Rbac gate. The server enforces the real
// ceiling (403) - this mirror only decides what to render.
const MODULE_ROLES: Record<string, string[]> = {
  funnel: ['super_admin', 'manager'],
  campaigns: ['super_admin'],
  growth: ['super_admin', 'manager'],
  roles: ['super_admin'],
  compliance: ['super_admin', 'manager'],
  audit: ['super_admin'],
  infra: ['super_admin'],
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
      const r = await fetch('/api/admin/audit-logs?limit=100', { headers: AUTH });
      if (!r.ok) throw new Error('audit');
      return r.json();
    },
  });
  const logs = data?.logs || [];
  const rootRef = useRevealRoot<HTMLDivElement>();
  return (
    <div ref={rootRef} className="min-h-full p-6 md:p-8">
      <div className="reveal mb-6">
        <h2 className="font-display text-lg font-bold text-brand-navy">Audit trail</h2>
        <p className="mt-1 text-xs text-brand-navy/40">Immutable record of every critical mutation: money, agreements, consents, RBAC, kanban moves, inbox replies.</p>
      </div>
      <div className="reveal overflow-x-auto rounded-2xl border border-brand-navy/10 bg-white shadow-[0_20px_40px_-15px_rgba(10,45,80,0.10)]">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-brand-navy/[0.08] bg-brand-navy/[0.04] text-[10px] uppercase tracking-wider text-brand-gold">
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
            {logs.length === 0 && (
              <tr><td colSpan={6} className="px-4 py-10 text-center text-brand-navy/50">No audit events yet.</td></tr>
            )}
            {logs.map((l: any) => (
              <tr key={l.id} className="border-b border-brand-navy/[0.08] text-brand-navy/70 hover:bg-brand-navy/[0.04]">
                <td className="whitespace-nowrap px-4 py-2.5">{new Date((l.createdAt || 0) * 1000).toLocaleString()}</td>
                <td className="px-4 py-2.5">{l.actorId ? (l.actorName || 'staff') : 'system'}</td>
                <td className="px-4 py-2.5">
                  <span className="rounded bg-brand-gold/10 px-1.5 py-0.5 font-mono text-[10px] text-brand-gold">{l.action}</span>
                </td>
                <td className="px-4 py-2.5">{l.entityName}</td>
                <td className="px-4 py-2.5 font-mono text-[11px] text-brand-navy/50">{l.entityId}</td>
                <td className="px-4 py-2.5 text-brand-navy/50">{l.ipAddress || '-'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RestrictedModule({ name }: { name: string }) {
  const rootRef = useRevealRoot<HTMLDivElement>();
  return (
    <div ref={rootRef} className="grid min-h-[70vh] place-items-center p-12">
      <div className="reveal max-w-sm text-center">
        <div className="mx-auto w-fit rounded-full border border-rose-200/60 bg-rose-50 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-rose-700">
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
    case 'compliance': return <ComplianceTab />;
    case 'roles': return <RolesTab />;
    case 'infra': return <InfraHealth />;
    case 'flow': return <FlowAnalytics />;
    case 'teamhub': return <TeamHub />;
case 'transactions': return <TransactionsTab />;
    case 'performance': return <PerformanceTab />;
    case 'boards': return <BoardsTab />;
    case 'marketing': return <MarketingTab />;
    default: return <NotFoundModule name={name} />;
  }
}

export function WorkspaceRouter() {
  const [match, params] = useRoute('/workspaces/:slug');
  if (match && params?.slug) return <WorkspaceModule name={params.slug} />;
  return <DashboardHome />;
}
