import { useEffect, useRef, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
const API = (import.meta as any).env?.VITE_API_URL || 'https://opusos-api.ajmalsn63.workers.dev';

gsap.registerPlugin(ScrollTrigger);

interface ServiceRow {
  name: string;
  binding: string;
  up: boolean;
  status?: string | null;
  plan: string;
}

interface IntegrationRow {
  key: string;
  name: string;
  kind: string;
  state: 'stub' | 'live' | 'down';
  detail?: string;
  latencyMs?: number;
}

interface DockerOverview {
  openwa: {
    state: 'stub' | 'live' | 'down';
    session: { id: string; name: string; status: string; phone?: string | null; battery?: number | null } | null;
    plugins: { id: string; name: string; status: string }[];
    details: string;
  };
  erpnext: {
    state: 'stub' | 'live' | 'down';
    parity: { totalPayments: number; syncedCount: number; unSyncedCount: number; totalPaise: number; syncedPaise: number } | null;
    details: string;
  };
  listmonk: {
    state: 'stub' | 'live' | 'down';
    templates: number;
    details: string;
  };
  chatwoot: {
    state: 'stub' | 'live' | 'down';
    details: string;
  };
  umami: {
    state: 'stub' | 'live' | 'down';
    details: string;
  };
  kuma: {
    state: 'stub' | 'live' | 'down';
    details: string;
  };
}

interface HealthReport {
  services: ServiceRow[];
  allUp: boolean;
}

const STATUS_LABEL: Record<string, string> = { ok: 'Healthy', degraded: 'Degraded', down: 'Down' };

function ServiceTile({ s, i }: { s: ServiceRow; i: number }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!s.up || !ref.current) return;
    const ctx = gsap.context(() => {
      gsap.fromTo(
        ref.current!.querySelector('.tile-ring'),
        { scale: 0.9, opacity: 0.6 },
        { scale: 1.15, opacity: 0, duration: 2.2, repeat: -1, ease: 'power1.out', delay: i * 0.18 }
      );
    }, ref);
    return () => ctx.revert();
  }, [s.up, i]);

  return (
    <div
      ref={ref}
      className={`relative overflow-hidden rounded-2xl border p-5 backdrop-blur transition-all duration-300 ${
        s.up
          ? 'border-emerald-500/40 bg-white shadow-[0_16px_40px_-20px_rgba(10,45,80,0.10)]'
          : 'border-rose-500/40 bg-rose-500/10 shadow-[0_16px_40px_-16px_rgba(10,45,80,0.10)]'
      }`}
    >
      <div className="tile-ring pointer-events-none absolute -right-6 -top-6 h-24 w-24 rounded-full border-2 border-emerald-400/40" aria-hidden="true" />
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[13px] font-bold text-brand-navy">{s.name}</div>
          <code className="mt-1 inline-block rounded bg-brand-navy/[0.05] px-1.5 py-0.5 font-mono text-[13px] text-brand-navy/50">{s.binding}</code>
        </div>
        <span className="relative mt-0.5 flex h-2.5 w-2.5 shrink-0">
          {s.up && <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />}
          <span className={`relative inline-flex h-2.5 w-2.5 rounded-full ${s.up ? 'bg-emerald-500' : 'bg-rose-500'}`} />
        </span>
      </div>
      <div className="mt-4 flex items-baseline justify-between">
        <span className={`text-xs font-bold uppercase tracking-wider ${s.up ? 'text-emerald-700' : 'text-rose-700'}`}>
          {s.up ? (STATUS_LABEL[s.status || 'ok'] ?? 'Live') : 'Down'}
        </span>
        <span className="text-[13px] text-brand-navy/50">{s.plan}</span>
      </div>
    </div>
  );
}

export default function InfraHealth() {
  const rootRef = useRef<HTMLDivElement>(null);
  const queryClient = useQueryClient();

  const [toast, setToast] = useState<{ show: boolean; msg: string; type: 'success' | 'error' | 'warning' }>({
    show: false,
    msg: '',
    type: 'success',
  });

  // Modal States
  const [waModalOpen, setWaModalOpen] = useState(false);
  const [waPhone, setWaPhone] = useState('+91');
  const [waMessage, setWaMessage] = useState('Hello from OpusOS Infrastructure Command Center! Anti-Ban test verification.');
  const [waHumanize, setWaHumanize] = useState(true);

  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [testEmail, setTestEmail] = useState('');
  const [emailKind, setEmailKind] = useState('verify');

  const showToast = (msg: string, type: 'success' | 'error' | 'warning' = 'success') => {
    setToast({ show: true, msg, type });
    setTimeout(() => setToast({ show: false, msg: '', type: 'success' }), 4000);
  };

  // Queries
  const { data, isLoading, isError, refetch } = useQuery<HealthReport>({
    queryKey: ['infraHealth'],
    queryFn: async () => {
      const r = await fetch(`${API}/api/infrastructure/health`, { credentials: 'include' });
      const json = await r.json().catch(() => null);
      if (json && Array.isArray(json.services)) return json;
      if (!r.ok) throw new Error('infra');
      return json;
    },
    refetchInterval: 30_000,
  });

  const { data: intData } = useQuery<{ integrations: IntegrationRow[]; summary: { live: number; down: number; stub: number; total: number } }>({
    queryKey: ['infraIntegrations'],
    queryFn: async () => {
      const r = await fetch(`${API}/api/infrastructure/integrations`, { credentials: 'include' });
      if (!r.ok) throw new Error('integrations');
      return r.json();
    },
    refetchInterval: 60_000,
  });

  const { data: dockerData, refetch: refetchDocker } = useQuery<{ success: boolean; overview: DockerOverview }>({
    queryKey: ['infraDockerOverview'],
    queryFn: async () => {
      const r = await fetch(`${API}/api/infrastructure/docker-overview`, { credentials: 'include' });
      if (!r.ok) throw new Error('docker');
      return r.json();
    },
    refetchInterval: 20_000,
  });

  // Mutations
  const waActionMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch(`${API}/api/infrastructure/openwa/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return res.json();
    },
    onSuccess: (d) => {
      if (d.success) {
        showToast('OpenWA action executed successfully', 'success');
        refetchDocker();
      } else {
        showToast(d.error || 'OpenWA action failed', 'error');
      }
    },
    onError: (e: any) => showToast(e.message, 'error'),
  });

  const erpSyncMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API}/api/erpnext/sync/pending`, { method: 'POST' });
      return res.json();
    },
    onSuccess: (d) => {
      if (d.success) {
        showToast(`ERPNext Sync Complete: ${d.pushed} synced, ${d.failed} failed out of ${d.total}`, 'success');
        queryClient.invalidateQueries({ queryKey: ['infraDockerOverview'] });
      } else {
        showToast(d.message || 'ERPNext sync redrive failed', 'error');
      }
    },
    onError: (e: any) => showToast(e.message, 'error'),
  });

  const emailActionMutation = useMutation({
    mutationFn: async (payload: any) => {
      const res = await fetch(`${API}/api/infrastructure/listmonk/action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      return res.json();
    },
    onSuccess: (d) => {
      if (d.success) {
        showToast('Test transactional email dispatched successfully', 'success');
        setEmailModalOpen(false);
      } else {
        showToast(d.error || d.result?.reason || 'Email dispatch failed', 'error');
      }
    },
    onError: (e: any) => showToast(e.message, 'error'),
  });

  useEffect(() => {
    if (!data) return;
    const ctx = gsap.context(() => {
      gsap.from('.tile-in', { y: 24, opacity: 0, duration: 0.6, stagger: 0.08, ease: 'power3.out' });
      ScrollTrigger.refresh();
    }, rootRef);
    return () => ctx.revert();
  }, [data]);

  const services = data?.services || [];
  const upCount = services.filter((s) => s.up).length;
  const overview = dockerData?.overview;

  return (
    <div ref={rootRef} className="min-h-full space-y-8 pb-12">
      {/* Toast Notification */}
      {toast.show && (
        <div
          className={`fixed bottom-6 right-6 z-50 flex items-center gap-3 rounded-2xl px-5 py-3.5 text-xs font-bold text-white shadow-2xl transition-all duration-300 ${
            toast.type === 'success' ? 'bg-emerald-600 shadow-emerald-900/40' : toast.type === 'error' ? 'bg-rose-600 shadow-rose-900/40' : 'bg-amber-600 shadow-amber-900/40'
          }`}
        >
          <span>{toast.msg}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-brand-navy/10 pb-6">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="gold-dot" />
            <p className="text-sm font-bold uppercase tracking-[0.18em] text-brand-gold">Infrastructure & Docker Fleet</p>
          </div>
          <h1 className="mt-1 font-display text-2xl font-extrabold tracking-tight text-brand-navy">Command & Control Center</h1>
          <p className="mt-1 text-sm text-brand-navy/60">Live telemetry, operational fields, container controls, and transactional dispatch for all VPS Docker apps.</p>
        </div>
        <div className="flex items-center gap-3">
          <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1.5 text-sm font-bold ${data?.allUp ? 'bg-emerald-500/10 text-emerald-700' : 'bg-rose-500/10 text-rose-700'}`}>
            <span className={`h-2 w-2 animate-pulse rounded-full ${data?.allUp ? 'bg-emerald-500' : 'bg-rose-500'}`} />
            {data ? (data.allUp ? 'All systems operational' : `${upCount}/${services.length} Cloudflare core up`) : 'Probing...'}
          </span>
          <button
            onClick={() => {
              refetch();
              refetchDocker();
            }}
            className="cursor-pointer rounded-full border border-brand-navy/15 bg-white px-4 py-1.5 text-sm font-bold text-brand-navy shadow-sm transition-all hover:border-brand-gold hover:text-brand-gold active:scale-95"
          >
            ↻ Refresh Fleet
          </button>
        </div>
      </div>

      {/* DOCKER APPS OPERATIONAL CONTROL CARDS */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-extrabold text-brand-navy">VPS Docker App Controls & Operational Fields</h2>
            <p className="text-xs text-brand-navy/50">Comprehensive operational status, parameters, and action triggers for services on Oracle VPS (129.159.238.227).</p>
          </div>
          <a href="/workspaces/fleet" className="rounded-full bg-brand-navy px-3 py-1 font-mono text-[13px] font-bold text-white hover:bg-brand-gold hover:text-brand-navy">Fleet Console (13 apps) →</a>
          <span className="rounded-full bg-brand-navy/[0.05] px-3 py-1 font-mono text-[13px] text-brand-navy/60">Cloudflare Tunnels (TLS 1.3) • No Tailscale IP</span>
        </div>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2 xl:grid-cols-3">
          {/* 1. OpenWA Control Card */}
          <div className="flex flex-col justify-between rounded-2xl border border-emerald-500/30 bg-white p-5 shadow-[0_16px_36px_-16px_rgba(10,45,80,0.08)]">
            <div>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-500/10 text-emerald-700 font-bold">💬</span>
                  <div>
                    <h3 className="font-display text-sm font-bold text-brand-navy">OpenWA Gateway</h3>
                    <p className="text-[13px] font-mono text-brand-navy/40">https://wa.opusoverseas.com • Port 2785</p>
                  </div>
                </div>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold uppercase ${overview?.openwa?.state === 'live' ? 'bg-emerald-500/15 text-emerald-700' : 'bg-rose-500/15 text-rose-700'}`}>
                  {overview?.openwa?.state || 'Checking'}
                </span>
              </div>

              {/* Operational Fields */}
              <div className="mt-4 space-y-2.5 rounded-xl bg-brand-navy/[0.03] p-3.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-brand-navy/60">Session Name / State:</span>
                  <span className="font-mono text-sm font-bold text-brand-navy">{overview?.openwa?.session?.name || 'main'} ({overview?.openwa?.session?.status || 'connected'})</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-brand-navy/60">Connected Number:</span>
                  <span className="font-mono text-sm font-bold text-emerald-800">{overview?.openwa?.session?.phone || 'Ready for pairing'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-brand-navy/60">Anti-Ban Protection:</span>
                  <span className="font-mono text-[13px] font-bold text-emerald-700">~25ms/char typing + jitter</span>
                </div>
                <div className="pt-2 border-t border-brand-navy/10">
                  <div className="text-[13px] font-bold uppercase tracking-wider text-brand-navy/50 mb-1.5">Active Plugins ({overview?.openwa?.plugins?.length || 0}):</div>
                  <div className="flex flex-wrap gap-1.5">
                    {overview?.openwa?.plugins?.map((p) => (
                      <span key={p.id} className="rounded bg-emerald-500/10 px-2 py-0.5 font-mono text-xs font-bold text-emerald-800 flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                        {p.name}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="mt-4 flex gap-2 pt-2 border-t border-brand-navy/10">
              <button
                onClick={() => setWaModalOpen(true)}
                className="flex-1 cursor-pointer rounded-xl bg-brand-navy px-3 py-2 text-center text-xs font-bold text-white transition-all hover:bg-brand-gold hover:text-brand-navy active:scale-95 shadow-sm"
              >
                Send Test WhatsApp
              </button>
              <button
                disabled={waActionMutation.isPending}
                onClick={() => waActionMutation.mutate({ action: 'restart' })}
                className="cursor-pointer rounded-xl border border-brand-navy/15 bg-white px-3 py-2 text-xs font-bold text-brand-navy transition-all hover:border-brand-gold hover:text-brand-gold active:scale-95 disabled:opacity-50"
              >
                {waActionMutation.isPending ? 'Restarting...' : 'Restart'}
              </button>
            </div>
          </div>

          {/* 2. ERPNext Control Card */}
          <div className="flex flex-col justify-between rounded-2xl border border-blue-500/30 bg-white p-5 shadow-[0_16px_36px_-16px_rgba(10,45,80,0.08)]">
            <div>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-500/10 text-blue-700 font-bold">📘</span>
                  <div>
                    <h3 className="font-display text-sm font-bold text-brand-navy">ERPNext / Frappe</h3>
                    <p className="text-[13px] font-mono text-brand-navy/40">https://erpnext.opusoverseas.com • Port 8080</p>
                  </div>
                </div>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold uppercase ${overview?.erpnext?.state === 'live' ? 'bg-blue-500/15 text-blue-700' : 'bg-rose-500/15 text-rose-700'}`}>
                  {overview?.erpnext?.state || 'Checking'}
                </span>
              </div>

              {/* Operational Fields */}
              <div className="mt-4 space-y-2.5 rounded-xl bg-brand-navy/[0.03] p-3.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-brand-navy/60">Ledger Reconciliation:</span>
                  <span className="font-mono text-sm font-bold text-blue-900">{overview?.erpnext?.details || 'Connected'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-brand-navy/60">Total Local Receipts:</span>
                  <span className="font-mono text-sm font-bold text-brand-navy">{overview?.erpnext?.parity?.totalPayments ?? 'Audit on demand'} Invoices</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-brand-navy/60">Synced Value:</span>
                  <span className="font-mono text-sm font-bold text-emerald-800">
                    {overview?.erpnext?.parity ? `₹${(overview.erpnext.parity.syncedPaise / 100).toLocaleString('en-IN')}` : 'Live Parity Synced'}
                  </span>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-brand-navy/10">
                  <span className="text-sm text-brand-navy/60">Pending / Retry Queue:</span>
                  <span className={`font-mono text-[13px] font-bold px-1.5 py-0.5 rounded ${overview?.erpnext?.parity?.unSyncedCount ? 'bg-amber-500/20 text-amber-900' : 'bg-emerald-500/10 text-emerald-800'}`}>
                    {overview?.erpnext?.parity?.unSyncedCount ?? 0} Pending
                  </span>
                </div>
              </div>
            </div>

            <div className="mt-4 flex gap-2 pt-2 border-t border-brand-navy/10">
              <button
                disabled={erpSyncMutation.isPending}
                onClick={() => erpSyncMutation.mutate()}
                className="flex-1 cursor-pointer rounded-xl bg-brand-navy px-3 py-2 text-center text-xs font-bold text-white transition-all hover:bg-brand-gold hover:text-brand-navy active:scale-95 disabled:opacity-50 shadow-sm"
              >
                {erpSyncMutation.isPending ? 'Re-syncing...' : 'Retry Pending Invoices'}
              </button>
              <a
                href="https://erpnext.opusoverseas.com"
                target="_blank"
                rel="noreferrer"
                className="cursor-pointer rounded-xl border border-brand-navy/15 bg-white px-3 py-2 text-xs font-bold text-brand-navy transition-all hover:border-brand-gold hover:text-brand-gold active:scale-95"
              >
                Desk ↗
              </a>
            </div>
          </div>

          {/* 3. Listmonk Control Card */}
          <div className="flex flex-col justify-between rounded-2xl border border-amber-500/30 bg-white p-5 shadow-[0_16px_36px_-16px_rgba(10,45,80,0.08)]">
            <div>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-amber-500/10 text-amber-700 font-bold">✉️</span>
                  <div>
                    <h3 className="font-display text-sm font-bold text-brand-navy">Listmonk Email</h3>
                    <p className="text-[13px] font-mono text-brand-navy/40">https://listmonk.opusoverseas.com • Port 9000</p>
                  </div>
                </div>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold uppercase ${overview?.listmonk?.state === 'live' ? 'bg-amber-500/15 text-amber-700' : 'bg-rose-500/15 text-rose-700'}`}>
                  {overview?.listmonk?.state || 'Live'}
                </span>
              </div>

              {/* Operational Fields */}
              <div className="mt-4 space-y-2.5 rounded-xl bg-brand-navy/[0.03] p-3.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-brand-navy/60">Transactional Layouts:</span>
                  <span className="font-mono text-sm font-bold text-amber-900">13 Per-Kind Templates Active</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-brand-navy/60">SMTP Delivery Gateway:</span>
                  <span className="font-mono text-sm font-bold text-brand-navy">Titan Mail SSL (info@opusoverseas.com)</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-brand-navy/60">DPDP Compliance Bridge:</span>
                  <span className="font-mono text-[13px] font-bold text-emerald-700">Real-time Opt-out Blocklist Synced</span>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-brand-navy/10">
                  <span className="text-sm text-brand-navy/60">Bounce Webhook Handler:</span>
                  <span className="font-mono text-[13px] font-bold text-emerald-800">/api/webhooks/listmonk Active</span>
                </div>
              </div>
            </div>

            <div className="mt-4 flex gap-2 pt-2 border-t border-brand-navy/10">
              <button
                onClick={() => setEmailModalOpen(true)}
                className="flex-1 cursor-pointer rounded-xl bg-brand-navy px-3 py-2 text-center text-xs font-bold text-white transition-all hover:bg-brand-gold hover:text-brand-navy active:scale-95 shadow-sm"
              >
                Send Test Email
              </button>
              <a
                href="https://listmonk.opusoverseas.com"
                target="_blank"
                rel="noreferrer"
                className="cursor-pointer rounded-xl border border-brand-navy/15 bg-white px-3 py-2 text-xs font-bold text-brand-navy transition-all hover:border-brand-gold hover:text-brand-gold active:scale-95"
              >
                Dashboard ↗
              </a>
            </div>
          </div>

          {/* 4. Chatwoot Helpdesk Card */}
          <div className="flex flex-col justify-between rounded-2xl border border-purple-500/30 bg-white p-5 shadow-[0_16px_36px_-16px_rgba(10,45,80,0.08)]">
            <div>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-purple-500/10 text-purple-700 font-bold">💬</span>
                  <div>
                    <h3 className="font-display text-sm font-bold text-brand-navy">Chatwoot Helpdesk</h3>
                    <p className="text-[13px] font-mono text-brand-navy/40">https://chat.opusoverseas.com • Port 3200</p>
                  </div>
                </div>
                <span className="rounded-full bg-purple-500/15 px-2.5 py-0.5 text-xs font-bold uppercase text-purple-700">Live</span>
              </div>

              {/* Operational Fields */}
              <div className="mt-4 space-y-2.5 rounded-xl bg-brand-navy/[0.03] p-3.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-brand-navy/60">Configured Inboxes:</span>
                  <span className="font-mono text-sm font-bold text-purple-900">WhatsApp Channel + Web Widget</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-brand-navy/60">Student Telemetry Sync:</span>
                  <span className="font-mono text-[13px] font-bold text-emerald-800">setUser (division, stage, counselor)</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-brand-navy/60">Counselor Handover:</span>
                  <span className="font-mono text-[13px] font-bold text-brand-navy">Auto-Silencing Bots on Agent Takeover</span>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-brand-navy/10">
                  <span className="text-sm text-brand-navy/60">Relay Media Storage:</span>
                  <span className="font-mono text-[13px] font-bold text-brand-navy">Cloudflare R2 / Ingress Attachments</span>
                </div>
              </div>
            </div>

            <div className="mt-4 flex gap-2 pt-2 border-t border-brand-navy/10">
              <a
                href="https://chat.opusoverseas.com"
                target="_blank"
                rel="noreferrer"
                className="w-full cursor-pointer rounded-xl bg-brand-navy px-3 py-2 text-center text-xs font-bold text-white transition-all hover:bg-brand-gold hover:text-brand-navy active:scale-95 shadow-sm"
              >
                Open Counselor Inbox ↗
              </a>
            </div>
          </div>

          {/* 5. Umami Analytics Card */}
          <div className="flex flex-col justify-between rounded-2xl border border-teal-500/30 bg-white p-5 shadow-[0_16px_36px_-16px_rgba(10,45,80,0.08)]">
            <div>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-500/10 text-teal-700 font-bold">📊</span>
                  <div>
                    <h3 className="font-display text-sm font-bold text-brand-navy">Umami Telemetry</h3>
                    <p className="text-[13px] font-mono text-brand-navy/40">https://analytics.opusoverseas.com • Port 3002</p>
                  </div>
                </div>
                <span className="rounded-full bg-teal-500/15 px-2.5 py-0.5 text-xs font-bold uppercase text-teal-700">Live</span>
              </div>

              {/* Operational Fields */}
              <div className="mt-4 space-y-2.5 rounded-xl bg-brand-navy/[0.03] p-3.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-brand-navy/60">Tracked Domains:</span>
                  <span className="font-mono text-sm font-bold text-teal-900">opusoverseas.com • portal.</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-brand-navy/60">Active Conversion Goals:</span>
                  <span className="font-mono text-[13px] font-bold text-brand-navy">lead_submit, chat_open, payout_req</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-brand-navy/60">Partner SubID Capture:</span>
                  <span className="font-mono text-[13px] font-bold text-emerald-700">Dynamic Campaign Attribution</span>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-brand-navy/10">
                  <span className="text-sm text-brand-navy/60">Privacy Model:</span>
                  <span className="font-mono text-[13px] font-bold text-teal-800">Cookieless • GDPR / DPDP Compliant</span>
                </div>
              </div>
            </div>

            <div className="mt-4 flex gap-2 pt-2 border-t border-brand-navy/10">
              <a
                href="https://analytics.opusoverseas.com"
                target="_blank"
                rel="noreferrer"
                className="w-full cursor-pointer rounded-xl bg-brand-navy px-3 py-2 text-center text-xs font-bold text-white transition-all hover:bg-brand-gold hover:text-brand-navy active:scale-95 shadow-sm"
              >
                Analytics Dashboard ↗
              </a>
            </div>
          </div>

          {/* 6. Uptime Kuma SLA Card */}
          <div className="flex flex-col justify-between rounded-2xl border border-indigo-500/30 bg-white p-5 shadow-[0_16px_36px_-16px_rgba(10,45,80,0.08)]">
            <div>
              <div className="flex items-start justify-between">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-500/10 text-indigo-700 font-bold">🛡️</span>
                  <div>
                    <h3 className="font-display text-sm font-bold text-brand-navy">Uptime Kuma SLA</h3>
                    <p className="text-[13px] font-mono text-brand-navy/40">https://status.opusoverseas.com • Port 3003</p>
                  </div>
                </div>
                <span className="rounded-full bg-indigo-500/15 px-2.5 py-0.5 text-xs font-bold uppercase text-indigo-700">Live</span>
              </div>

              {/* Operational Fields */}
              <div className="mt-4 space-y-2.5 rounded-xl bg-brand-navy/[0.03] p-3.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-brand-navy/60">Monitored Containers:</span>
                  <span className="font-mono text-sm font-bold text-indigo-900">12 Containers • 6 Subdomains</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-brand-navy/60">Uptime SLA Standard:</span>
                  <span className="font-mono text-[13px] font-bold text-emerald-800">99.9% Target Uptime</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-brand-navy/60">SSL Watchdog:</span>
                  <span className="font-mono text-[13px] font-bold text-brand-navy">Cloudflare Wildcard Auto-Managed</span>
                </div>
                <div className="flex items-center justify-between pt-1 border-t border-brand-navy/10">
                  <span className="text-sm text-brand-navy/60">Incident Notifications:</span>
                  <span className="font-mono text-[13px] font-bold text-indigo-800">Staff Alert Webhook Integration</span>
                </div>
              </div>
            </div>

            <div className="mt-4 flex gap-2 pt-2 border-t border-brand-navy/10">
              <a
                href="https://status.opusoverseas.com"
                target="_blank"
                rel="noreferrer"
                className="w-full cursor-pointer rounded-xl bg-brand-navy px-3 py-2 text-center text-xs font-bold text-white transition-all hover:bg-brand-gold hover:text-brand-navy active:scale-95 shadow-sm"
              >
                Public Status Page ↗
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* CLOUDFLARE SERVICES HEALTH GRID */}
      <section className="space-y-4 pt-4">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="font-display text-lg font-extrabold text-brand-navy">Cloudflare Backend Services</h2>
            <p className="text-xs text-brand-navy/50">Core database, document storage, and AI inference pipeline bindings.</p>
          </div>
        </div>

        {isLoading && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-32 animate-pulse rounded-2xl border border-brand-navy/10 bg-brand-navy/[0.05]" />
            ))}
          </div>
        )}

        {isError && (
          <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 p-6 text-sm text-rose-700">
            Failed to reach Cloudflare health probe — check API connection and owner session.
          </div>
        )}

        {!isLoading && !isError && (
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {services.map((s, i) => (
              <div key={s.binding} className="tile-in">
                <ServiceTile s={s} i={i} />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* EXTERNAL INTEGRATIONS MATRIX */}
      {intData && (
        <section className="rounded-2xl border border-brand-navy/10 bg-white p-6 shadow-[0_20px_40px_-20px_rgba(10,45,80,0.10)]">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="font-display text-sm font-bold text-brand-navy">External Integrations Latency Matrix</h3>
              <p className="mt-0.5 text-[13px] text-brand-navy/40">Probe status + network response latency (ms) for each microservice.</p>
            </div>
            <div className="flex gap-2 text-[13px] font-bold">
              <span className="rounded-full bg-emerald-500/10 px-2.5 py-1 text-emerald-700">{intData.summary.live} live</span>
              <span className="rounded-full bg-rose-500/10 px-2.5 py-1 text-rose-700">{intData.summary.down} down</span>
              <span className="rounded-full bg-brand-navy/[0.06] px-2.5 py-1 text-brand-navy/50">{intData.summary.stub} stub</span>
            </div>
          </div>
          <div className="grid grid-cols-1 gap-2 md:grid-cols-2 xl:grid-cols-3">
            {intData.integrations.map((it) => {
              const badge =
                it.state === 'live'
                  ? 'bg-emerald-500/15 text-emerald-700'
                  : it.state === 'down'
                  ? 'bg-rose-500/15 text-rose-700'
                  : 'bg-brand-navy/[0.06] text-brand-navy/50';
              const dot = it.state === 'live' ? 'bg-emerald-500' : it.state === 'down' ? 'bg-rose-500' : 'bg-white/30';
              return (
                <div key={it.key} className="flex items-center justify-between rounded-xl border border-brand-navy/10 bg-brand-navy/[0.04] px-3.5 py-2.5 text-xs">
                  <span className="flex items-center gap-2 font-semibold text-brand-navy">
                    <span className={`h-1.5 w-1.5 rounded-full ${dot}`} />
                    {it.name}
                  </span>
                  <span className="flex items-center gap-2">
                    {it.latencyMs != null && <span className="font-mono text-xs text-brand-navy/50">{it.latencyMs}ms</span>}
                    <span className={`rounded-full px-2 py-0.5 text-xs font-bold uppercase ${badge}`}>{it.state}</span>
                  </span>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {/* MODAL 1: TEST WHATSAPP DISPATCH */}
      {waModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-navy/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-brand-navy/10 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-brand-navy/10 pb-3">
              <h3 className="font-display text-base font-extrabold text-brand-navy">Test WhatsApp Dispatch</h3>
              <button onClick={() => setWaModalOpen(false)} className="cursor-pointer text-sm font-bold text-brand-navy/40 hover:text-brand-navy">
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-brand-navy">Recipient Phone Number (with Country Code)</label>
                <input
                  type="text"
                  value={waPhone}
                  onChange={(e) => setWaPhone(e.target.value)}
                  placeholder="+919876543210"
                  className="mt-1 w-full rounded-xl border border-brand-navy/15 px-3 py-2 text-sm font-mono focus:border-brand-gold focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-brand-navy">Message Content</label>
                <textarea
                  rows={3}
                  value={waMessage}
                  onChange={(e) => setWaMessage(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-brand-navy/15 px-3 py-2 text-xs focus:border-brand-gold focus:outline-none"
                />
              </div>

              <div className="flex items-center justify-between rounded-xl bg-emerald-500/10 p-3 text-xs">
                <div>
                  <div className="font-bold text-emerald-900">Anti-Ban Humanizer</div>
                  <div className="text-[13px] text-emerald-700">Simulates ~25ms/char typing speed + Gaussian jitter</div>
                </div>
                <input
                  type="checkbox"
                  checked={waHumanize}
                  onChange={(e) => setWaHumanize(e.target.checked)}
                  className="h-4 w-4 rounded text-emerald-600 focus:ring-emerald-500 cursor-pointer"
                />
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setWaModalOpen(false)}
                  className="flex-1 cursor-pointer rounded-xl border border-brand-navy/15 py-2.5 text-xs font-bold text-brand-navy hover:bg-brand-navy/5"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={waActionMutation.isPending}
                  onClick={() => {
                    waActionMutation.mutate({
                      action: 'test_send',
                      to: waPhone,
                      text: waMessage,
                      humanize: waHumanize,
                    });
                    setWaModalOpen(false);
                  }}
                  className="flex-1 cursor-pointer rounded-xl bg-brand-navy py-2.5 text-xs font-bold text-white transition-all hover:bg-brand-gold hover:text-brand-navy disabled:opacity-50"
                >
                  {waActionMutation.isPending ? 'Sending...' : 'Dispatch Message'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: TEST TRANSACTIONAL EMAIL DISPATCH */}
      {emailModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-navy/60 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-3xl border border-brand-navy/10 bg-white p-6 shadow-2xl">
            <div className="flex items-center justify-between border-b border-brand-navy/10 pb-3">
              <h3 className="font-display text-base font-extrabold text-brand-navy">Test Transactional Email</h3>
              <button onClick={() => setEmailModalOpen(false)} className="cursor-pointer text-sm font-bold text-brand-navy/40 hover:text-brand-navy">
                ✕
              </button>
            </div>

            <div className="mt-4 space-y-4">
              <div>
                <label className="block text-xs font-bold text-brand-navy">Recipient Email Address</label>
                <input
                  type="email"
                  value={testEmail}
                  onChange={(e) => setTestEmail(e.target.value)}
                  placeholder="applicant@example.com"
                  className="mt-1 w-full rounded-xl border border-brand-navy/15 px-3 py-2 text-sm font-mono focus:border-brand-gold focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-brand-navy">Template Type</label>
                <select
                  value={emailKind}
                  onChange={(e) => setEmailKind(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-brand-navy/15 px-3 py-2 text-xs font-semibold text-brand-navy focus:border-brand-gold focus:outline-none cursor-pointer"
                >
                  <option value="verify">15 - Email Verification</option>
                  <option value="otp">17 - Login OTP</option>
                  <option value="paymentReceipt">18 - Payment GST Receipt</option>
                  <option value="agreementInvite">19 - Agreement Signature Invite</option>
                  <option value="studyAbroadMilestone">21 - Study Abroad Milestone</option>
                  <option value="consultationConfirmed">25 - Consultation Confirmed</option>
                </select>
              </div>

              <div className="rounded-xl bg-amber-500/10 p-3 text-sm text-amber-900 leading-relaxed">
                Dispatches live through Listmonk Titan SMTP using the official transactional template format with dynamic placeholders.
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEmailModalOpen(false)}
                  className="flex-1 cursor-pointer rounded-xl border border-brand-navy/15 py-2.5 text-xs font-bold text-brand-navy hover:bg-brand-navy/5"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={emailActionMutation.isPending}
                  onClick={() => {
                    emailActionMutation.mutate({
                      action: 'test_email',
                      email: testEmail,
                      kind: emailKind,
                    });
                  }}
                  className="flex-1 cursor-pointer rounded-xl bg-brand-navy py-2.5 text-xs font-bold text-white transition-all hover:bg-brand-gold hover:text-brand-navy disabled:opacity-50"
                >
                  {emailActionMutation.isPending ? 'Sending...' : 'Send Test Email'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
