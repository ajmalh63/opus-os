import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useRevealRoot } from '../lib/reveal';
const API = (import.meta as any).env?.VITE_API_URL || 'https://opusos-api.ajmalsn63.workers.dev';

interface ToolStatus { state: 'ok' | 'unconfigured' | 'error'; label: string; summary: string }
interface ToolSnapshot {
  tool: string; label: string; status: ToolStatus; fetchedAt: number;
  metrics: Record<string, number | string | null>;
  items: { tool: string; kind: string; id: string; title: string; detail: string | null; at: number }[];
}
interface LiveData {
  tools: ToolSnapshot[];
  feed: { tool: string; kind: string; id: string; title: string; detail: string | null; at: number }[];
}

interface TouchPoint {
  seq: number;
  day: number;
  channel: string;
  stage: string;
  subject: string;
  body: string;
  tool: string;
}

interface ScoreJourney {
  id: string;
  key: string;
  name: string;
  division: string;
  scoreTier: 'hot' | 'warm' | 'cold' | 'stale';
  scoreRange: string;
  goal: string;
  description: string;
  channelStack: string[];
  qualifyingLeadsCount: number;
  touches: TouchPoint[];
}

interface MatrixData {
  ok: boolean;
  summary: {
    totalLeads: number;
    hotCount: number;
    warmCount: number;
    coldCount: number;
    staleCount: number;
  };
  divisionStats: Record<string, { total: number; hot: number; warm: number; cold: number }>;
  journeys: ScoreJourney[];
}

const TIER_BADGES = {
  hot: 'bg-rose-500 text-white',
  warm: 'bg-amber-500 text-white',
  cold: 'bg-sky-500 text-white',
  stale: 'bg-slate-600 text-white',
};

const CHANNEL_ICONS: Record<string, string> = {
  whatsapp: '🟢 WhatsApp',
  email: '🔵 Email',
  phone_task: '📞 Phone Call',
  agreement: '✍️ e-Sign Contract',
};

function relTime(at: number) {
  const s = Math.floor(Date.now() / 1000) - at;
  if (s < 90) return `${s}s ago`;
  if (s < 3600) return `${Math.floor(s / 60)}m ago`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ago`;
  return `${Math.floor(s / 86400)}d ago`;
}

export default function CampaignsTab() {
  const rootRef = useRevealRoot<HTMLDivElement>();
  const [selectedDivision, setSelectedDivision] = useState<string>('all');
  const [selectedTier, setSelectedTier] = useState<string>('all');
  const [selectedTouch, setSelectedTouch] = useState<TouchPoint | null>(null);

  // Live tools telemetry
  const { data: live } = useQuery<LiveData>({
    queryKey: ['integrationsLive'],
    queryFn: async () => {
      const r = await fetch(`${API}/api/integrations/live`);
      if (!r.ok) throw new Error('integrations');
      return r.json();
    },
  });

  // Score-driven marketing journeys matrix
  const { data: matrix } = useQuery<MatrixData>({
    queryKey: ['campaignsScoreMatrix'],
    queryFn: async () => {
      const r = await fetch(`${API}/api/admin/campaigns/matrix`);
      if (!r.ok) throw new Error('matrix');
      return r.json();
    },
  });

  const journeys = matrix?.journeys || [];
  const summary = matrix?.summary || { totalLeads: 0, hotCount: 0, warmCount: 0, coldCount: 0, staleCount: 0 };

  const filteredJourneys = journeys.filter((j) => {
    if (selectedDivision !== 'all' && j.division !== selectedDivision && j.division !== 'general') return false;
    if (selectedTier !== 'all' && j.scoreTier !== selectedTier) return false;
    return true;
  });

  return (
    <div ref={rootRef} className="space-y-6 p-4 sm:p-6 bg-[#FAF8F4] min-h-screen">
      {/* HEADER & STRATEGY INTRO */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white border border-brand-navy/10 rounded-3xl p-6 shadow-sm">
        <div>
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-brand-gold animate-pulse" />
            <h2 className="font-display text-lg font-black text-brand-navy">
              Automated Sales Playbook (Score-Driven Sequences)
            </h2>
          </div>
          <p className="text-xs text-brand-navy/60 mt-1 max-w-2xl">
            When a new lead arrives, OpusOS scores their interest level and automatically moves them through these multi-day sequences (WhatsApp ➔ Email ➔ Call Task ➔ Agreement).
          </p>
        </div>

        <div className="flex items-center gap-3">
          <a
            href="/workspaces/marketing"
            className="rounded-xl bg-brand-navy px-4 py-2 text-xs font-bold text-brand-gold hover:bg-brand-navy/90 shadow-xs transition"
          >
            🎨 Go to Marketing Studio ➔
          </a>
        </div>
      </div>

      {/* SCORE TIER STRIP (AUDIENCE SEGMENTATION) */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          {
            tier: 'hot',
            title: '🔥 Hot Leads (75 – 100)',
            desc: 'VIP Conversion Fast-Track',
            count: summary.hotCount,
            accent: 'border-rose-300 bg-rose-50/70',
            badge: 'bg-rose-600 text-white',
            action: 'Immediate 48h Close',
          },
          {
            tier: 'warm',
            title: '☀️ Warm Leads (40 – 74)',
            desc: 'Trust & Value Drip Sequence',
            count: summary.warmCount,
            accent: 'border-amber-300 bg-amber-50/70',
            badge: 'bg-amber-600 text-white',
            action: 'Nurture & Guide',
          },
          {
            tier: 'cold',
            title: '❄️ Cold Leads (0 – 39)',
            desc: 'Discovery & Newsletter Blast',
            count: summary.coldCount,
            accent: 'border-sky-300 bg-sky-50/70',
            badge: 'bg-sky-600 text-white',
            action: 'Broad Awareness',
          },
          {
            tier: 'stale',
            title: '🔄 Stale Leads (>30d)',
            desc: 'Intake Deadline Fee Waiver',
            count: summary.staleCount,
            accent: 'border-slate-300 bg-slate-50/70',
            badge: 'bg-slate-700 text-white',
            action: 'Win-Back Campaign',
          },
        ].map((t) => (
          <button
            key={t.tier}
            type="button"
            onClick={() => setSelectedTier(selectedTier === t.tier ? 'all' : t.tier)}
            className={`p-4 rounded-2xl border text-left transition cursor-pointer shadow-xs ${
              selectedTier === t.tier ? 'ring-2 ring-brand-navy shadow-md' : ''
            } ${t.accent}`}
          >
            <div className="flex items-center justify-between">
              <span className={`px-2 py-0.5 rounded-full text-[13px] font-black uppercase tracking-wider ${t.badge}`}>
                {t.count} Leads
              </span>
              <span className="text-[13px] font-bold text-brand-navy/50">{t.action}</span>
            </div>
            <div className="font-display font-bold text-sm text-brand-navy mt-2">{t.title}</div>
            <div className="text-sm text-brand-navy/60 mt-0.5">{t.desc}</div>
          </button>
        ))}
      </div>

      {/* FILTERS BAR */}
      <div className="flex items-center justify-between gap-4 flex-wrap bg-white border border-brand-navy/10 rounded-2xl p-3 shadow-xs text-xs">
        <div className="flex items-center gap-1.5 flex-wrap">
          <span className="font-bold text-brand-navy/60 px-2 text-sm uppercase tracking-wider">Division:</span>
          {[
            { key: 'all', label: 'All Divisions' },
            { key: 'study-abroad', label: '🎓 Study Abroad' },
            { key: 'umrah', label: '🕋 Umrah' },
            { key: 'attestation', label: '📜 Attestation' },
            { key: 'general', label: '🌐 General / Discovery' },
          ].map((d) => (
            <button
              key={d.key}
              type="button"
              onClick={() => setSelectedDivision(d.key)}
              className={`px-3 py-1.5 rounded-xl font-bold transition cursor-pointer ${
                selectedDivision === d.key
                  ? 'bg-brand-navy text-white shadow-xs'
                  : 'bg-brand-navy/[0.04] text-brand-navy/70 hover:bg-brand-navy/[0.08]'
              }`}
            >
              {d.label}
            </button>
          ))}
        </div>

        <div className="text-xs font-semibold text-brand-navy/50">
          Showing <strong>{filteredJourneys.length}</strong> active campaign blueprints
        </div>
      </div>

      {/* SCORE-DRIVEN CAMPAIGNS MATRIX */}
      <div className="space-y-4">
        {filteredJourneys.map((j) => (
          <div
            key={j.id}
            className="bg-white border border-brand-navy/15 rounded-3xl p-6 shadow-sm space-y-5 hover:border-brand-gold/50 transition-all duration-300"
          >
            {/* JOURNEY HEADER */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-brand-navy/10 pb-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-display font-black text-base text-brand-navy">{j.name}</h3>
                  <span className={`px-2.5 py-0.5 rounded-full text-[13px] font-black uppercase tracking-wider ${TIER_BADGES[j.scoreTier]}`}>
                    Score: {j.scoreRange}
                  </span>
                  <span className="px-2.5 py-0.5 rounded-full bg-brand-navy/[0.06] text-brand-navy text-[13px] font-bold uppercase tracking-wider">
                    {j.division}
                  </span>
                </div>
                <p className="text-xs text-brand-navy/70 max-w-3xl leading-relaxed">{j.description}</p>
                <div className="text-sm font-semibold text-emerald-800 flex items-center gap-1.5 pt-1">
                  <span>🎯 Goal:</span>
                  <span>{j.goal}</span>
                </div>
              </div>

              {/* AUDIENCE & SYNC ACTIONS */}
              <div className="flex md:flex-col items-end justify-between gap-2 shrink-0">
                <div className="text-right">
                  <div className="text-[13px] uppercase tracking-wider font-bold text-brand-navy/40">Target Audience</div>
                  <div className="text-sm font-display font-black text-brand-navy">
                    {j.qualifyingLeadsCount} Leads Eligible
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => alert(`Enrolling ${j.qualifyingLeadsCount} qualifying leads into ${j.name} via Listmonk & OpenWA!`)}
                  className="px-4 py-2 rounded-xl bg-brand-gold hover:bg-brand-gold/90 text-brand-navy text-xs font-black uppercase tracking-wider cursor-pointer shadow-xs transition"
                >
                  ⚡ Enroll Leads
                </button>
              </div>
            </div>

            {/* VISUAL TOUCHPOINT SEQUENCE TIMELINE */}
            <div className="space-y-2">
              <div className="text-[13px] font-bold uppercase tracking-wider text-brand-navy/50 flex items-center justify-between">
                <span>Multi-Touch Execution Sequence ({j.touches.length} Touchpoints)</span>
                <span className="text-brand-navy/40 font-mono">Omnichannel: {j.channelStack.join(' · ')}</span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                {j.touches.map((t) => (
                  <div
                    key={t.seq}
                    onClick={() => setSelectedTouch(t)}
                    className="p-3.5 rounded-2xl border border-brand-navy/10 bg-brand-navy/[0.01] hover:bg-brand-navy/[0.03] hover:border-brand-navy/25 transition cursor-pointer space-y-2 group shadow-2xs"
                  >
                    <div className="flex items-center justify-between text-[13px]">
                      <span className="font-mono font-bold text-brand-gold bg-brand-navy px-2 py-0.5 rounded-md">
                        Day {t.day}
                      </span>
                      <span className="font-bold text-brand-navy/70">
                        {CHANNEL_ICONS[t.channel] || t.channel}
                      </span>
                    </div>

                    <div>
                      <div className="text-xs font-bold text-brand-navy group-hover:text-brand-gold transition line-clamp-1">
                        {t.stage}
                      </div>
                      <div className="text-sm text-brand-navy/60 line-clamp-2 mt-0.5">
                        {t.subject}
                      </div>
                    </div>

                    <div className="pt-2 border-t border-brand-navy/5 flex items-center justify-between text-[13px] text-brand-navy/40">
                      <span>Engine: <strong>{t.tool}</strong></span>
                      <span className="text-brand-gold font-bold group-hover:underline">Preview Copy →</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* LIVE EVENT STREAM FEED */}
      <div className="bg-white border border-brand-navy/15 rounded-3xl p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between border-b border-brand-navy/10 pb-3">
          <div>
            <h3 className="font-display font-bold text-sm text-brand-navy">
              Live Deliveries & Dispatch Stream ({live?.feed?.length || 0})
            </h3>
            <p className="text-sm text-brand-navy/50">
              Real-time message dispatches and campaign events across Listmonk, OpenWA, and Chatwoot.
            </p>
          </div>
          <span className="px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 text-[13px] font-bold uppercase border border-emerald-200">
            Realtime Stream
          </span>
        </div>

        <div className="space-y-1.5 max-h-64 overflow-y-auto">
          {(live?.feed || []).map((f) => (
            <div
              key={`${f.tool}-${f.kind}-${f.id}`}
              className="flex items-center justify-between gap-3 p-2.5 rounded-xl border border-brand-navy/5 hover:bg-brand-navy/[0.02] text-xs"
            >
              <div className="flex items-center gap-2 truncate">
                <span className="px-2 py-0.5 rounded bg-brand-navy text-white text-[13px] font-bold uppercase font-mono">
                  {f.tool}
                </span>
                <span className="font-semibold text-brand-navy truncate">{f.title}</span>
                {f.detail && <span className="text-brand-navy/50 text-sm hidden sm:inline truncate">· {f.detail}</span>}
              </div>
              <span className="text-[13px] font-mono text-brand-navy/40 shrink-0">
                {relTime(f.at)}
              </span>
            </div>
          ))}
          {(!live?.feed || live.feed.length === 0) && (
            <div className="py-6 text-center text-xs text-brand-navy/40">
              No recent dispatches logged yet.
            </div>
          )}
        </div>
      </div>

      {/* TOUCHPOINT PREVIEW MODAL */}
      {selectedTouch && (
        <div className="fixed inset-0 bg-brand-navy/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white border border-brand-navy/15 rounded-3xl shadow-2xl max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-brand-navy/10 pb-3">
              <div className="flex items-center gap-2.5">
                <span className="px-2.5 py-1 bg-brand-navy text-brand-gold rounded-lg font-mono text-xs font-bold">
                  Day {selectedTouch.day}
                </span>
                <div>
                  <h3 className="font-display font-bold text-sm text-brand-navy">{selectedTouch.stage}</h3>
                  <p className="text-[13px] text-brand-navy/50">
                    Engine: {selectedTouch.tool} · Channel: {CHANNEL_ICONS[selectedTouch.channel] || selectedTouch.channel}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedTouch(null)}
                className="w-8 h-8 rounded-full border border-brand-navy/20 flex items-center justify-center text-brand-navy/60 hover:text-brand-navy cursor-pointer font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="block font-bold text-brand-navy/60 text-[13px] uppercase mb-1">Subject / Headline</label>
                <div className="p-3 bg-brand-navy/[0.02] border border-brand-navy/10 rounded-xl font-semibold text-brand-navy">
                  {selectedTouch.subject}
                </div>
              </div>

              <div>
                <label className="block font-bold text-brand-navy/60 text-[13px] uppercase mb-1">Message Template Copy</label>
                <div className="p-4 bg-amber-500/[0.02] border border-brand-navy/10 rounded-2xl whitespace-pre-line text-brand-navy/85 leading-relaxed font-sans text-xs">
                  {selectedTouch.body}
                </div>
              </div>

              <div className="p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-900 space-y-1">
                <div className="font-bold">✨ Personalization Variables:</div>
                <div className="text-[13px] font-mono text-emerald-800">
                  {`{name}`} ➔ Signer Name · {`{booking_url}`} ➔ Counselor Calendar · {`{sign_url}`} ➔ Digital E-Sign Portal
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-brand-navy/10 flex justify-between items-center text-xs">
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(`${selectedTouch.subject}\n\n${selectedTouch.body}`);
                  alert('Template copied to clipboard!');
                }}
                className="px-4 py-2 rounded-xl border border-brand-navy/15 text-brand-navy font-semibold hover:bg-brand-navy/5 cursor-pointer"
              >
                📋 Copy Template
              </button>
              <button
                type="button"
                onClick={() => setSelectedTouch(null)}
                className="px-5 py-2 rounded-xl bg-brand-navy text-white font-bold cursor-pointer shadow-xs"
              >
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}