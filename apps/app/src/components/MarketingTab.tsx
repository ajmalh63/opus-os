import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRevealRoot } from '../lib/reveal';

// ── Marketing Automation — UNIFIED CONTROL PANEL ─────────────────────────────
// Operations happen in the backend tools through their VPC APIs (Listmonk,
// Mautic automation, Chatwoot, OpenWA); this UI is the unified Superadmin
// control plane with full visibility into Journeys, Templates, Assets, Forms,
// Pages, DWC, Audiences, WhatsApp Workflows, and Suppression.

const getJson = async (url: string) => {
  const r = await fetch(url, { credentials: 'include' });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
};

const STATE_STYLE: Record<string, string> = {
  ok: 'bg-emerald-500/15 text-emerald-700',
  unconfigured: 'bg-slate-500/15 text-slate-400',
  error: 'bg-rose-500/15 text-rose-700',
};

type LiveData = { tools: any[]; feed: any[] };

const REL = (at: number) => {
  const s = Math.floor(Date.now() / 1000) - at;
  if (s < 90) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
};

function ErrPanel({ what, onRetry }: { what: string; onRetry: any }) {
  return (
    <div className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-6 text-center">
      <p className="text-[11px] font-bold text-amber-800">Unable to load {what} — tool may be unconfigured.</p>
      <button onClick={onRetry} className="mt-2 text-[10px] font-bold uppercase text-brand-gold hover:underline">Retry</button>
    </div>
  );
}

function asArray(d: any): any[] {
  if (Array.isArray(d)) return d;
  if (d && typeof d === 'object') {
    if (Array.isArray(d.data)) return d.data;
    if (Array.isArray(d.results)) return d.results;
    if (Array.isArray(d.campaigns)) return d.campaigns;
    if (Array.isArray(d.templates)) return d.templates;
    if (Array.isArray(d.lists)) return d.lists;
    if (Array.isArray(d.bounces)) return d.bounces;
    if (d.data && Array.isArray(d.data.results)) return d.data.results;
  }
  return [];
}

// ── Overview ──────────────────────────────────────────────────────────────────
function Overview({ live }: { live: LiveData }) {
  return (
    <div className="space-y-6">
      <section className="reveal grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-4">
        {live.tools.map((t) => (
          <div key={t.tool} className={`rounded-2xl border p-4 shadow-[0_16px_30px_-18px_rgba(10,45,80,0.10)] transition-all duration-300 hover:border-brand-gold/40 ${t.status.state === 'ok' ? 'border-emerald-500/30 bg-white' : 'border-brand-navy/10 bg-white'}`}>
            <div className="flex items-center justify-between gap-2">
              <span className="font-display text-sm font-extrabold text-brand-navy">{t.label}</span>
              <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${STATE_STYLE[t.status.state] || STATE_STYLE.unconfigured}`}>{t.status.state}</span>
            </div>
            <p className="mt-1.5 text-[11px] leading-relaxed text-brand-navy/40">{t.status.summary}</p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {Object.entries(t.metrics || {}).map(([k, v]) => (
                <span key={k} className="rounded bg-brand-navy/[0.05] px-1.5 py-0.5 font-mono text-[10px] text-brand-navy/40">{k}: {String(v ?? '—')}</span>
              ))}
            </div>
          </div>
        ))}
      </section>
      <section className="reveal rounded-2xl border border-brand-navy/10 bg-white p-4 shadow-[0_20px_40px_-15px_rgba(10,45,80,0.10)]">
        <div className="text-[10px] font-bold uppercase tracking-widest text-brand-navy/40">Live event feed · {live.feed.length} items</div>
        <div className="mt-3 max-h-72 space-y-1 overflow-y-auto pr-1">
          {live.feed.map((f: any) => (
            <div key={`${f.tool}-${f.kind}-${f.id}`} className="flex items-center gap-2 rounded-lg px-2 py-1.5 text-[11px] hover:bg-brand-gold/10">
              <span className={`w-16 shrink-0 rounded px-1 py-0.5 text-center font-bold uppercase ${STATE_STYLE.ok}`}>{f.tool}</span>
              <span className="min-w-0 flex-1 truncate text-brand-navy/70">{f.title}</span>
              {f.detail && <span className="hidden truncate text-[10px] text-brand-navy/50 md:block md:max-w-[16rem]">{f.detail}</span>}
              <span className="shrink-0 text-[10px] text-brand-navy/50">{REL(f.at)}</span>
            </div>
          ))}
          {live.feed.length === 0 && <div className="py-8 text-center text-[11px] text-brand-navy/50">No tool events yet.</div>}
        </div>
      </section>
    </div>
  );
}

// ── Mautic Journeys View ───────────────────────────────────────────────────────
function JourneysView() {
  const { data: mauticCamps, isLoading, isError, refetch } = useQuery<any>({
    queryKey: ['mautic-campaigns'],
    queryFn: () => getJson('/api/integrations/mautic/campaigns'),
  });

  const campaigns = mauticCamps?.campaigns ? Object.values(mauticCamps.campaigns) : [];

  if (isLoading) return <div className="p-10 text-center text-xs text-brand-navy/50">Loading automated journeys…</div>;
  if (isError) return <ErrPanel what="campaign journeys" onRetry={refetch} />;

  const tierMeta: Record<string, { label: string; cls: string; border: string; badge: string; icon: string }> = {
    hot: { label: 'Hot Tier — VIP Fast-Track (Score 50+)', cls: 'bg-rose-50/50', border: 'border-rose-200', badge: 'bg-rose-100 text-rose-800', icon: '🔥' },
    warm: { label: 'Warm Tier — Authority Nurture (Score 20-49)', cls: 'bg-amber-50/50', border: 'border-amber-200', badge: 'bg-amber-100 text-amber-800', icon: '⭐' },
    cold: { label: 'Cold Tier — Re-Engagement (Score < 20)', cls: 'bg-blue-50/50', border: 'border-blue-200', badge: 'bg-blue-100 text-blue-800', icon: '❄️' },
  };

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-rose-200 bg-white p-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-rose-600">🔥 Hot VIP Queue</div>
          <div className="mt-1 font-display text-2xl font-extrabold text-brand-navy">Score 50+</div>
          <div className="mt-1 text-[11px] text-brand-navy/50">Instant Counselor Strategy Session + 48h Waiver Window</div>
        </div>
        <div className="rounded-2xl border border-amber-200 bg-white p-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-amber-600">⭐ Warm Nurture Queue</div>
          <div className="mt-1 font-display text-2xl font-extrabold text-brand-navy">Score 20–49</div>
          <div className="mt-1 text-[11px] text-brand-navy/50">5-Step Strategic Blueprint + Case Studies & Proof</div>
        </div>
        <div className="rounded-2xl border border-blue-200 bg-white p-4">
          <div className="text-[10px] font-bold uppercase tracking-wider text-blue-600">❄️ Cold Re-Activation</div>
          <div className="mt-1 font-display text-2xl font-extrabold text-brand-navy">Score &lt; 20</div>
          <div className="mt-1 text-[11px] text-brand-navy/50">2026/2027 Policy Updates + 60s 1-Click Refresh</div>
        </div>
      </div>

      <div className="space-y-4">
        {campaigns.map((c: any) => {
          const nameLower = (c.name || '').toLowerCase();
          const tier = nameLower.includes('hot') ? 'hot' : nameLower.includes('warm') ? 'warm' : 'cold';
          const meta = tierMeta[tier];
          const events = c.events ? Object.values(c.events) : [];

          return (
            <div key={c.id} className={`rounded-2xl border p-5 transition-all shadow-sm ${meta.border} ${meta.cls}`}>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-brand-navy/10 pb-3">
                <div className="flex items-center gap-2">
                  <span className="text-lg">{meta.icon}</span>
                  <div>
                    <h3 className="font-display font-bold text-sm text-brand-navy">{c.name}</h3>
                    <p className="text-[11px] text-brand-navy/50">{c.description || 'Automated multi-step lifecycle campaign'}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2.5 py-0.5 text-[9px] font-bold uppercase ${c.isPublished ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                    {c.isPublished ? 'Live & Active' : 'Draft'}
                  </span>
                  <a href={`https://mautic.opusoverseas.com/s/campaigns/view/${c.id}`} target="_blank" rel="noreferrer" className="rounded-lg bg-brand-navy px-3 py-1 text-[10px] font-bold text-brand-gold hover:bg-brand-navy/90">
                    Open in Mautic ↗
                  </a>
                </div>
              </div>

              {/* Steps timeline */}
              <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3">
                {events.map((ev: any, idx: number) => (
                  <div key={ev.id} className="rounded-xl border border-brand-navy/10 bg-white p-3 shadow-xs">
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="font-bold text-brand-gold uppercase">Step {idx + 1} · {ev.triggerMode === 'immediate' ? 'Immediate' : `After ${ev.triggerInterval || '2'} ${ev.triggerIntervalUnit || 'days'}`}</span>
                      <span className="font-mono text-brand-navy/40">{ev.type}</span>
                    </div>
                    <div className="mt-1 text-xs font-semibold text-brand-navy">{ev.name}</div>
                  </div>
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Mautic 12 HTML5 Templates View ─────────────────────────────────────────────
function MauticTemplatesView() {
  const { data, isLoading, isError, refetch } = useQuery<any>({
    queryKey: ['mautic-emails'],
    queryFn: () => getJson('/api/integrations/mautic/emails?limit=30'),
  });

  const [previewEmail, setPreviewEmail] = useState<any | null>(null);

  if (isLoading) return <div className="p-10 text-center text-xs text-brand-navy/50">Loading HTML5 email suite…</div>;
  if (isError) return <ErrPanel what="email templates" onRetry={refetch} />;

  const emails: any[] = data?.emails ? Object.values(data.emails) : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[11px] text-brand-navy/50">
          <strong>{emails.length} Responsive HTML5 Templates</strong> provisioned across Hot, Warm, and Cold tiers. All templates feature clean client-facing subjects and brand styling.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {emails.map((e: any) => {
          const nameLower = (e.name || '').toLowerCase();
          const badgeColor = nameLower.includes('hot') ? 'bg-rose-100 text-rose-800' : nameLower.includes('warm') ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800';

          return (
            <div key={e.id} className="rounded-2xl border border-brand-navy/10 bg-white p-4 shadow-sm space-y-3 flex flex-col justify-between hover:border-brand-gold/40 transition">
              <div>
                <div className="flex items-center justify-between gap-1">
                  <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${badgeColor}`}>
                    {nameLower.includes('hot') ? '🔥 Hot Tier' : nameLower.includes('warm') ? '⭐ Warm Tier' : '❄️ Cold Tier'}
                  </span>
                  <span className="font-mono text-[9px] text-brand-navy/40">ID: {e.id}</span>
                </div>
                <h4 className="mt-2 text-xs font-bold text-brand-navy leading-snug">{e.name}</h4>
                <p className="mt-1 text-[11px] text-brand-navy/60 line-clamp-2 italic">
                  &ldquo;{e.subject}&rdquo;
                </p>
              </div>

              <div className="flex items-center justify-between border-t border-brand-navy/[0.06] pt-3">
                <span className="text-[9px] text-brand-navy/40">From: {e.fromName || 'Opus Overseas'}</span>
                <button onClick={() => setPreviewEmail(e)} className="rounded-lg bg-brand-navy/5 px-2.5 py-1 text-[10px] font-bold text-brand-navy hover:bg-brand-gold hover:text-brand-navy transition">
                  Preview HTML5 ↗
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* HTML5 Preview Modal */}
      {previewEmail && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-navy/60 p-4 backdrop-blur-xs">
          <div className="relative flex h-[90vh] w-full max-w-3xl flex-col rounded-2xl bg-white shadow-2xl overflow-hidden">
            <div className="flex items-center justify-between border-b border-brand-navy/10 px-5 py-3.5 bg-brand-cream">
              <div>
                <div className="text-xs font-bold text-brand-navy">{previewEmail.name}</div>
                <div className="text-[10px] text-brand-navy/50">Subject: {previewEmail.subject}</div>
              </div>
              <button onClick={() => setPreviewEmail(null)} className="rounded-full bg-brand-navy/10 px-3 py-1 text-xs font-bold text-brand-navy hover:bg-brand-navy hover:text-white">
                ✕ Close
              </button>
            </div>
            <div className="flex-1 overflow-hidden bg-[#FAF8F4] p-2">
              <iframe title="Email Preview" srcDoc={previewEmail.customHtml} className="h-full w-full rounded-lg border border-brand-navy/10 bg-white" />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── WhatsApp & Chatwoot Workflows View ─────────────────────────────────────────
function WhatsAppView() {
  const { data, isLoading, isError, refetch } = useQuery<any>({
    queryKey: ['wa-templates'],
    queryFn: () => getJson('/api/marketing/whatsapp/templates'),
  });

  const [activeCategory, setActiveCategory] = useState<'all' | 'operational' | 'marketing'>('all');
  const [selectedTemplate, setSelectedTemplate] = useState<any | null>(null);
  const [testPhone, setTestPhone] = useState('');
  const [testName, setTestName] = useState('Test Applicant');
  const [isSending, setIsSending] = useState(false);
  const [sendResult, setSendResult] = useState<any | null>(null);

  if (isLoading) return <div className="p-10 text-center text-xs text-brand-navy/50">Loading WhatsApp & Chatwoot automation suite…</div>;
  if (isError) return <ErrPanel what="WhatsApp templates" onRetry={refetch} />;

  const templates: any[] = data?.templates || [];
  const filtered = activeCategory === 'all' ? templates : templates.filter((t: any) => t.category === activeCategory);

  const handleTestSend = async () => {
    if (!testPhone || !selectedTemplate) return;
    setIsSending(true);
    setSendResult(null);
    try {
      const res = await fetch('/api/marketing/whatsapp/test-send', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: testPhone,
          name: testName,
          templateKey: selectedTemplate.key,
          variables: { ...selectedTemplate.sampleVariables, name: testName },
          division: selectedTemplate.division,
        }),
      });
      const json = await res.json();
      setSendResult(json);
    } catch (e: any) {
      setSendResult({ success: false, error: e.message });
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Topology Header */}
      <div className="rounded-2xl border border-emerald-500/20 bg-emerald-50/40 p-5 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">📱</span>
            <h3 className="font-display font-bold text-sm text-brand-navy">Chatwoot Brain + OpenWA Delivery Architecture</h3>
          </div>
          <span className="rounded-full bg-emerald-100 px-3 py-0.5 text-[10px] font-bold text-emerald-800 uppercase">
            Live Gateway
          </span>
        </div>
        <p className="text-[11px] leading-relaxed text-brand-navy/60">
          Messages are created in <strong>Chatwoot</strong> (maintaining customer timeline, counselor notes, and SLA timers) and dispatched via <strong>OpenWA</strong>. If the client replies on WhatsApp, the message immediately illuminates in Chatwoot for human counselor handoff.
        </p>
      </div>

      {/* Categories Filter */}
      <div className="flex items-center justify-between gap-3">
        <div className="flex gap-1.5">
          {[
            { key: 'all', label: `All Workflows (${templates.length})` },
            { key: 'operational', label: `Operational Triggers (${templates.filter((t: any) => t.category === 'operational').length})` },
            { key: 'marketing', label: `Marketing Drips (${templates.filter((t: any) => t.category === 'marketing').length})` },
          ].map((c) => (
            <button
              key={c.key}
              onClick={() => setActiveCategory(c.key as any)}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${activeCategory === c.key ? 'bg-brand-navy text-white' : 'bg-brand-navy/5 text-brand-navy/60 hover:bg-brand-navy/10'}`}
            >
              {c.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid of Templates */}
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
        {filtered.map((t: any) => (
          <div key={t.key} className="rounded-2xl border border-brand-navy/10 bg-white p-4 shadow-sm space-y-3 flex flex-col justify-between hover:border-brand-gold/40 transition">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className={`rounded-full px-2 py-0.5 text-[9px] font-bold uppercase ${t.category === 'operational' ? 'bg-blue-100 text-blue-800' : 'bg-rose-100 text-rose-800'}`}>
                  {t.category}
                </span>
                <span className="font-mono text-[9px] text-brand-navy/40">{t.division}</span>
              </div>
              <h4 className="text-xs font-bold text-brand-navy">{t.name}</h4>
              <p className="text-[11px] text-brand-navy/50">{t.description}</p>
              
              <div className="rounded-lg bg-brand-cream border border-brand-navy/[0.06] p-3 text-[11px] text-brand-navy/80 whitespace-pre-wrap font-sans leading-relaxed">
                {t.renderedSample}
              </div>
            </div>

            <div className="pt-2 border-t border-brand-navy/[0.06] flex items-center justify-between">
              <span className="text-[9px] font-mono text-brand-navy/40">{t.key}</span>
              <button
                onClick={() => { setSelectedTemplate(t); setSendResult(null); }}
                className="rounded-lg bg-brand-navy/5 px-3 py-1 text-[10px] font-bold text-brand-navy hover:bg-brand-gold hover:text-brand-navy transition"
              >
                Test Send 📱
              </button>
            </div>
          </div>
        ))}
      </div>

      {/* Live Test Modal */}
      {selectedTemplate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-navy/60 p-4 backdrop-blur-xs">
          <div className="relative flex w-full max-w-lg flex-col rounded-2xl bg-white shadow-2xl overflow-hidden p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-brand-navy/10 pb-3">
              <div>
                <h3 className="font-display font-bold text-sm text-brand-navy">Test WhatsApp Dispatch</h3>
                <p className="text-[11px] text-brand-navy/50">{selectedTemplate.name}</p>
              </div>
              <button onClick={() => setSelectedTemplate(null)} className="rounded-full bg-brand-navy/10 px-3 py-1 text-xs font-bold text-brand-navy hover:bg-brand-navy hover:text-white">
                ✕ Close
              </button>
            </div>

            <div className="space-y-3">
              <div>
                <label className="text-[10px] font-bold uppercase text-brand-navy/60">Recipient Phone (with country code)</label>
                <input
                  type="text"
                  value={testPhone}
                  onChange={(e) => setTestPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                  className="mt-1 w-full rounded-lg border border-brand-navy/15 px-3 py-2 text-xs font-mono focus:border-brand-gold focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase text-brand-navy/60">Recipient Name</label>
                <input
                  type="text"
                  value={testName}
                  onChange={(e) => setTestName(e.target.value)}
                  placeholder="Test Applicant"
                  className="mt-1 w-full rounded-lg border border-brand-navy/15 px-3 py-2 text-xs focus:border-brand-gold focus:outline-none"
                />
              </div>
              <div>
                <label className="text-[10px] font-bold uppercase text-brand-navy/60">Message Preview</label>
                <div className="mt-1 max-h-40 overflow-y-auto rounded-lg bg-brand-cream p-3 text-[11px] text-brand-navy/80 whitespace-pre-wrap">
                  {selectedTemplate.template({ ...selectedTemplate.sampleVariables, name: testName })}
                </div>
              </div>
            </div>

            {sendResult && (
              <div className={`rounded-lg p-3 text-xs ${sendResult.success ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-rose-50 text-rose-800 border border-rose-200'}`}>
                {sendResult.success ? '✅ Message dispatched successfully through Chatwoot & OpenWA!' : `❌ Dispatch failed: ${sendResult.error || sendResult.result?.error || 'Unknown error'}`}
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2 border-t border-brand-navy/10">
              <button onClick={() => setSelectedTemplate(null)} className="rounded-lg px-4 py-2 text-xs font-semibold text-brand-navy/60 hover:bg-brand-navy/5">
                Cancel
              </button>
              <button
                disabled={!testPhone || isSending}
                onClick={handleTestSend}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-700 disabled:opacity-50 transition"
              >
                {isSending ? 'Dispatching…' : 'Send WhatsApp Message 🚀'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Assets, Forms & Landing Pages View ─────────────────────────────────────────
function AssetsAndFormsView() {
  const { data: assetsData, isLoading: aLoading } = useQuery<any>({ queryKey: ['mautic-assets'], queryFn: () => getJson('/api/integrations/mautic/assets') });
  const { data: formsData, isLoading: fLoading } = useQuery<any>({ queryKey: ['mautic-forms'], queryFn: () => getJson('/api/integrations/mautic/forms') });
  const { data: pagesData, isLoading: pLoading } = useQuery<any>({ queryKey: ['mautic-pages'], queryFn: () => getJson('/api/integrations/mautic/pages') });

  if (aLoading || fLoading || pLoading) return <div className="p-10 text-center text-xs text-brand-navy/50">Loading marketing assets & forms…</div>;

  const assets = assetsData?.assets ? Object.values(assetsData.assets) : [];
  const forms = formsData?.forms ? Object.values(formsData.forms) : [];
  const pages = pagesData?.pages ? Object.values(pagesData.pages) : [];

  return (
    <div className="space-y-6">
      {/* 1. Downloadable Lead Magnets */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-display font-bold text-sm text-brand-navy">📄 Downloadable Lead Magnet Assets ({assets.length})</h3>
          <span className="text-[10px] text-brand-navy/40">Downloads auto-award +10 points in Mautic</span>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {assets.map((a: any) => (
            <div key={a.id} className="rounded-2xl border border-brand-navy/10 bg-white p-4 shadow-sm space-y-2">
              <div className="flex items-center justify-between">
                <span className="rounded bg-brand-gold/20 px-1.5 py-0.5 font-mono text-[9px] font-bold text-brand-navy uppercase">{a.extension} Guide</span>
                <span className="text-[10px] font-bold text-emerald-700">{a.downloadCount || 0} Downloads</span>
              </div>
              <h4 className="text-xs font-bold text-brand-navy leading-snug">{a.title}</h4>
              <p className="text-[11px] text-brand-navy/50 line-clamp-2">{a.description}</p>
              <div className="pt-2 border-t border-brand-navy/[0.06] text-[9px] font-mono text-brand-navy/40 truncate">
                Alias: /{a.alias}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 2. Forms & Pages */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Forms */}
        <div className="space-y-3">
          <h3 className="font-display font-bold text-sm text-brand-navy">📋 Lead Intake & Evaluation Forms ({forms.length})</h3>
          <div className="space-y-2">
            {forms.map((f: any) => (
              <div key={f.id} className="rounded-xl border border-brand-navy/10 bg-white p-3.5 shadow-xs flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-bold text-brand-navy">{f.name}</div>
                  <div className="text-[10px] text-brand-navy/40">{f.description || 'Intake capture form'}</div>
                </div>
                <span className="rounded bg-emerald-100 text-emerald-800 text-[9px] font-bold px-2 py-0.5 uppercase shrink-0">
                  {f.postAction || 'Message'}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Landing Pages */}
        <div className="space-y-3">
          <h3 className="font-display font-bold text-sm text-brand-navy">🌐 Standalone Landing Pages ({pages.length})</h3>
          <div className="space-y-2">
            {pages.map((p: any) => (
              <div key={p.id} className="rounded-xl border border-brand-navy/10 bg-white p-3.5 shadow-xs flex items-center justify-between gap-2">
                <div>
                  <div className="text-xs font-bold text-brand-navy">{p.title}</div>
                  <div className="text-[10px] text-brand-gold font-mono">Alias: /{p.alias}</div>
                </div>
                <span className="rounded bg-blue-100 text-blue-800 text-[9px] font-bold px-2 py-0.5 uppercase shrink-0">
                  {p.hits || 0} Hits
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Dynamic Web Content (DWC) View ────────────────────────────────────────────
function DWCView() {
  const { data, isLoading, isError, refetch } = useQuery<any>({
    queryKey: ['mautic-dwc'],
    queryFn: () => getJson('/api/integrations/mautic/dwc'),
  });

  if (isLoading) return <div className="p-10 text-center text-xs text-brand-navy/50">Loading dynamic web content slots…</div>;
  if (isError) return <ErrPanel what="dynamic web content" onRetry={refetch} />;

  const items = data?.dynamicContent ? Object.values(data.dynamicContent) : [];

  return (
    <div className="space-y-4">
      <p className="text-[11px] text-brand-navy/50">
        Dynamic Web Content (DWC) slots dynamically personalize Opus OS website & portal banners based on the contact's lead score & tier.
      </p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {items.map((d: any) => (
          <div key={d.id} className="rounded-2xl border border-brand-navy/10 bg-white p-4 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[10px] font-bold text-brand-gold bg-brand-navy/5 px-2 py-0.5 rounded">
                Slot: {d.slotName}
              </span>
              <span className="rounded-full bg-emerald-100 text-emerald-800 text-[9px] font-bold px-2 py-0.5 uppercase">
                Active
              </span>
            </div>
            <h4 className="text-xs font-bold text-brand-navy">{d.name}</h4>
            <p className="text-[11px] text-brand-navy/50">{d.description}</p>
            <div className="rounded-lg bg-brand-cream border border-brand-navy/[0.06] p-2.5 text-[10px] text-brand-navy/70 overflow-hidden font-mono">
              {d.content}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Listmonk Audiences & Suppression Views ────────────────────────────────────
function AudiencesView() {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['lm-audiences'], queryFn: () => getJson('/api/integrations/listmonk/lists?perPage=30&page=1') });
  if (isLoading) return <div className="p-10 text-center text-xs text-brand-navy/50">Loading audiences…</div>;
  if (error) return <ErrPanel what="audiences" onRetry={refetch} />;
  const rows: any[] = asArray(data);

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-brand-navy/50">{rows.length} audience lists managed in Listmonk.</p>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {rows.map((r: any) => (
          <div key={r.id} className="rounded-xl border border-brand-navy/10 bg-white p-4 shadow-xs flex items-center justify-between">
            <div>
              <div className="text-xs font-bold text-brand-navy">{r.name}</div>
              <div className="text-[10px] text-brand-navy/40 capitalize">{r.type} · Opt-in: {r.optin}</div>
            </div>
            <div className="text-right font-display font-extrabold text-sm text-brand-gold">{r.subscribers_count ?? 0} subs</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function SuppressionView() {
  const { data, isLoading, error, refetch } = useQuery({ queryKey: ['lm-bounces'], queryFn: () => getJson('/api/integrations/listmonk/bounces?perPage=30&page=1') });
  if (isLoading) return <div className="p-10 text-center text-xs text-brand-navy/50">Loading suppression ledger…</div>;
  if (error) return <ErrPanel what="suppression ledger" onRetry={refetch} />;
  const rows: any[] = asArray(data);

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-brand-navy/50">DPDP-compliant suppression ledger and bounce logs.</p>
      <div className="overflow-x-auto rounded-2xl border border-brand-navy/10 bg-white">
        <table className="w-full text-left text-xs">
          <thead className="border-b border-brand-navy/[0.08] text-[10px] uppercase font-bold tracking-wider text-brand-gold bg-brand-cream">
            <tr><th className="px-4 py-2.5">Subscriber</th><th className="px-4 py-2.5">Type</th><th className="px-4 py-2.5">Source</th><th className="px-4 py-2.5">Date</th></tr>
          </thead>
          <tbody className="divide-y divide-brand-navy/[0.06]">
            {rows.map((b: any, i: number) => (
              <tr key={b.id || i} className="hover:bg-brand-navy/[0.02]">
                <td className="px-4 py-2.5 font-semibold text-brand-navy">{b.email || b.subscriber_id}</td>
                <td className="px-4 py-2.5 capitalize text-rose-600">{b.type || 'Hard Bounce'}</td>
                <td className="px-4 py-2.5 text-brand-navy/50">{b.source || 'SMTP Gateway'}</td>
                <td className="px-4 py-2.5 text-brand-navy/40">{b.created_at ? new Date(b.created_at).toLocaleString() : '—'}</td>
              </tr>
            ))}
            {rows.length === 0 && <tr><td colSpan={4} className="p-6 text-center text-brand-navy/40 italic">No suppressions recorded.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Tab Bar Navigation ────────────────────────────────────────────────────────
const TABS = [
  { key: 'overview', label: 'Overview' },
  { key: 'whatsapp', label: '📱 WhatsApp & Chatwoot (11)' },
  { key: 'journeys', label: 'Mautic Journeys' },
  { key: 'templates', label: 'HTML5 Templates (12)' },
  { key: 'assets_forms', label: 'Assets, Forms & Pages' },
  { key: 'dwc', label: 'Dynamic Web Content' },
  { key: 'audiences', label: 'Audiences' },
  { key: 'suppression', label: 'Suppression & Bounces' },
] as const;

export default function MarketingTab() {
  const [tab, setTab] = useState<string>('overview');
  const { data: live, isLoading, isError, refetch } = useQuery<LiveData>({
    queryKey: ['integrationsLive'],
    queryFn: () => getJson('/api/integrations/live'),
  });
  const rootRef = useRevealRoot<HTMLDivElement>();

  return (
    <div ref={rootRef} className="space-y-6 p-6">
      <div className="reveal">
        <div className="flex items-center gap-2.5">
          <span className="gold-dot" />
          <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-brand-gold">Superadmin Marketing Suite</p>
        </div>
        <h2 className="mt-2 font-display text-sm font-bold text-brand-navy">Marketing Automation, WhatsApp & Lead Journeys</h2>
        <p className="mt-1 text-[11px] text-brand-navy/50">
          Unified control center — Live synchronization between Opus OS Lead Engine, Chatwoot Brain, and VPS Microservices (OpenWA · Mautic · Listmonk).
        </p>
      </div>

      <div className="reveal flex flex-wrap gap-1 rounded-full border border-brand-navy/15 bg-brand-navy/[0.04] p-1 text-[10px] font-bold uppercase">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`rounded-full px-4 py-1.5 transition ${tab === t.key ? 'bg-brand-gold text-brand-navy shadow-xs' : 'text-brand-navy/50 hover:text-brand-gold'}`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'overview' && (isLoading ? <div className="p-10 text-center text-xs text-brand-navy/50">Loading tool feeds…</div> : isError || !live ? <ErrPanel what="tool feeds" onRetry={refetch} /> : <Overview live={live} />)}
      {tab === 'whatsapp' && <WhatsAppView />}
      {tab === 'journeys' && <JourneysView />}
      {tab === 'templates' && <MauticTemplatesView />}
      {tab === 'assets_forms' && <AssetsAndFormsView />}
      {tab === 'dwc' && <DWCView />}
      {tab === 'audiences' && <AudiencesView />}
      {tab === 'suppression' && <SuppressionView />}
    </div>
  );
}