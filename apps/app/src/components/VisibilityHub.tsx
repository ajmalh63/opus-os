import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useRevealRoot } from '../lib/reveal';
import BlogManager from './BlogManager';


const rs = (n?: number) => `₹${((n || 0) / 100).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;

const TABS = [
  { key: 'seo', label: '🔍 SEO Hub' },
  { key: 'aeo', label: '🤖 AEO Monitor' },
  { key: 'blog', label: '📝 Blog Studio' },
  { key: 'ga', label: '📊 Analytics' },
  { key: 'gbp', label: '📍 Google Business' },
  { key: 'gsc', label: '🖥️ Search Console' },
  { key: 'reviews', label: '⭐ Reviews' },
  { key: 'attribution', label: '🎯 Attribution' },
  { key: 'reports', label: '📅 Reports' },
];

function ScoreBadge({ score }: { score: number }) {
  const cls = score >= 80 ? 'bg-emerald-500/15 text-emerald-700' : score >= 50 ? 'bg-amber-500/15 text-amber-700' : 'bg-rose-500/15 text-rose-600';
  return <span className={`px-2 py-0.5 rounded-full text-[13px] font-bold ${cls}`}>{score}/100</span>;
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="reveal rounded-2xl border border-brand-navy/10 bg-white p-5 space-y-3">
      <div className="flex items-center gap-2">
        <span className="gold-dot" />
        <h3 className="font-display font-bold text-sm text-brand-navy">{title}</h3>
      </div>
      {children}
    </div>
  );
}

// ============ V1: SEO HUB ============
function SeoTab() {
  const qc = useQueryClient();
  const { data, isLoading } = useQuery<any>({ queryKey: ['seoPages'], queryFn: async () => (await fetch('/api/visibility/seo/pages', { credentials: 'include' })).json() });
  const { data: audit } = useQuery<any>({ queryKey: ['seoAudit'], queryFn: async () => (await fetch('/api/visibility/seo/audit', { credentials: 'include' })).json() });
  const { data: kw } = useQuery<any>({ queryKey: ['seoKeywords'], queryFn: async () => (await fetch('/api/visibility/seo/keywords', { credentials: 'include' })).json() });
  const [editing, setEditing] = useState<any>(null);
  const [form, setForm] = useState<any>({});
  const [kwForm, setKwForm] = useState({ keyword: '', targetUrl: '', volume: '', position: '' });

  const savePage = useMutation({
    mutationFn: async () => {
      const r = await fetch('/api/visibility/seo/pages', { method: 'POST', headers: { 'Content-Type': 'application/json', }, body: JSON.stringify({ route: editing.route, ...form }) });
      if (!r.ok) throw new Error('save');
      return r.json();
    },
    onSuccess: (d) => { setEditing(null); qc.invalidateQueries({ queryKey: ['seoPages'] }); qc.invalidateQueries({ queryKey: ['seoAudit'] }); alert(d.message); },
    onError: () => alert('Save failed'),
  });
  const addKeyword = useMutation({
    mutationFn: async () => {
      const r = await fetch('/api/visibility/seo/keywords', { method: 'POST', headers: { 'Content-Type': 'application/json', }, body: JSON.stringify({ ...kwForm, volume: kwForm.volume ? Number(kwForm.volume) : undefined, position: kwForm.position ? Number(kwForm.position) : undefined }) });
      if (!r.ok) throw new Error('kw');
      return r.json();
    },
    onSuccess: () => { setKwForm({ keyword: '', targetUrl: '', volume: '', position: '' }); qc.invalidateQueries({ queryKey: ['seoKeywords'] }); },
  });

  if (isLoading) return <div className="p-10 text-center text-xs text-brand-navy/50">Loading SEO hub…</div>;

  return (
    <div className="space-y-5">
      <Section title={`Site Audit — ${audit?.avgScore ?? 0}/100 average`}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          {(audit?.pages || []).map((p: any) => (
            <div key={p.route} className="rounded-xl border border-brand-navy/10 bg-brand-navy/[0.03] p-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-brand-navy">{p.label} <span className="text-brand-navy/40 font-mono">{p.route}</span></span>
                <ScoreBadge score={p.score} />
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {p.issues.map((i: any, idx: number) => (
                  <span key={idx} className={`px-1.5 py-0.5 rounded text-sm font-bold uppercase ${i.level === 'critical' ? 'bg-rose-500/15 text-rose-600' : i.level === 'high' ? 'bg-amber-500/15 text-amber-700' : 'bg-brand-navy/[0.06] text-brand-navy/50'}`}>{i.label}</span>
                ))}
                {p.issues.length === 0 && <span className="px-1.5 py-0.5 rounded text-sm font-bold uppercase bg-emerald-500/15 text-emerald-700">✓ All good</span>}
              </div>
            </div>
          ))}
        </div>
        <p className="text-[13px] text-brand-navy/40">Gold-standard checks: title ≤70 chars · meta ≤165 · OG tags · valid JSON-LD. Sitemap: <code className="font-mono">/sitemap.xml</code> · Robots: <code className="font-mono">/robots.txt</code> (AI crawlers allowed, training crawlers blocked).</p>
      </Section>

      <Section title="Page Meta & Structured Data Manager">
        {!editing ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
            {(data?.pages || []).map((p: any) => (
              <button key={p.route} onClick={() => { setEditing(p); setForm({ title: p.title, metaDescription: p.metaDescription, ogTitle: p.ogTitle, ogImage: p.ogImage, schemaJson: p.schemaJson }); }} className="text-left rounded-xl border border-brand-navy/10 p-3 hover:border-brand-gold/50 transition-all cursor-pointer">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-brand-navy">{p.label}</span>
                  <span className={`text-xs font-bold ${p.hasMeta && p.hasSchema ? 'text-emerald-600' : 'text-amber-600'}`}>{p.hasMeta && p.hasSchema ? '✓ Complete' : '⚠ Incomplete'}</span>
                </div>
                <div className="text-[13px] text-brand-navy/40 mt-0.5 truncate">{p.title || 'No title yet — click to edit'}</div>
              </button>
            ))}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-brand-navy">Editing: {editing.label} <span className="font-mono text-brand-navy/40">{editing.route}</span></span>
              <button onClick={() => setEditing(null)} className="text-[13px] font-bold text-brand-navy/50 hover:text-brand-navy cursor-pointer">✕ Cancel</button>
            </div>
            <input value={form.title || ''} onChange={e => setForm({ ...form, title: e.target.value })} placeholder="Title tag (≤70 chars)" className="w-full bg-white border border-brand-navy/10 rounded px-3 py-2 text-xs text-brand-navy placeholder:text-brand-navy/40" />
            <textarea value={form.metaDescription || ''} onChange={e => setForm({ ...form, metaDescription: e.target.value })} placeholder="Meta description (≤165 chars)" rows={2} className="w-full bg-white border border-brand-navy/10 rounded px-3 py-2 text-xs text-brand-navy placeholder:text-brand-navy/40" />
            <input value={form.ogTitle || ''} onChange={e => setForm({ ...form, ogTitle: e.target.value })} placeholder="Open Graph title" className="w-full bg-white border border-brand-navy/10 rounded px-3 py-2 text-xs text-brand-navy placeholder:text-brand-navy/40" />
            <input value={form.ogImage || ''} onChange={e => setForm({ ...form, ogImage: e.target.value })} placeholder="OG image URL" className="w-full bg-white border border-brand-navy/10 rounded px-3 py-2 text-xs text-brand-navy placeholder:text-brand-navy/40" />
            <textarea value={form.schemaJson || ''} onChange={e => setForm({ ...form, schemaJson: e.target.value })} placeholder='JSON-LD schema (e.g. {"@context":"https://schema.org","@type":"Service",...})' rows={5} className="w-full bg-white border border-brand-navy/10 rounded px-3 py-2 text-xs font-mono text-brand-navy placeholder:text-brand-navy/40" />
            <button onClick={() => savePage.mutate()} className="bg-brand-gold hover:bg-brand-gold/90 text-brand-navy px-4 py-2 rounded text-xs font-bold cursor-pointer">💾 Save Page SEO</button>
          </div>
        )}
      </Section>

      <Section title="Keyword Tracker">
        <div className="flex flex-wrap gap-2">
          <input value={kwForm.keyword} onChange={e => setKwForm({ ...kwForm, keyword: e.target.value })} placeholder="Keyword" className="w-44 bg-white border border-brand-navy/10 rounded px-2 py-2 text-xs text-brand-navy placeholder:text-brand-navy/40" />
          <input value={kwForm.targetUrl} onChange={e => setKwForm({ ...kwForm, targetUrl: e.target.value })} placeholder="Target URL" className="w-40 bg-white border border-brand-navy/10 rounded px-2 py-2 text-xs text-brand-navy placeholder:text-brand-navy/40" />
          <input value={kwForm.volume} onChange={e => setKwForm({ ...kwForm, volume: e.target.value })} placeholder="Volume" className="w-20 bg-white border border-brand-navy/10 rounded px-2 py-2 text-xs text-brand-navy placeholder:text-brand-navy/40" />
          <input value={kwForm.position} onChange={e => setKwForm({ ...kwForm, position: e.target.value })} placeholder="Position" className="w-20 bg-white border border-brand-navy/10 rounded px-2 py-2 text-xs text-brand-navy placeholder:text-brand-navy/40" />
          <button onClick={() => addKeyword.mutate()} className="bg-brand-gold hover:bg-brand-gold/90 text-brand-navy px-4 py-2 rounded text-xs font-bold cursor-pointer">+ Track</button>
        </div>
        <div className="space-y-1.5">
          {(kw?.keywords || []).map((k: any) => (
            <div key={k.id} className="flex justify-between items-center bg-brand-navy/[0.06] border border-brand-navy/10 rounded px-3 py-2 text-xs">
              <span className="text-brand-navy font-semibold">{k.keyword} <span className="text-brand-navy/40">· {k.targetUrl || '—'}</span></span>
              <span className="flex items-center gap-2">
                {k.volume ? <span className="text-brand-navy/40">vol {k.volume}</span> : null}
                <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${k.position && k.position <= 10 ? 'bg-emerald-500/15 text-emerald-700' : k.position ? 'bg-amber-500/15 text-amber-700' : 'bg-brand-navy/[0.06] text-brand-navy/40'}`}>{k.position ? `#${k.position}` : 'untracked'}</span>
              </span>
            </div>
          ))}
          {(kw?.keywords || []).length === 0 && <p className="text-[13px] text-brand-navy/40 text-center py-2">No keywords tracked yet.</p>}
        </div>
      </Section>
    </div>
  );
}

// ============ V4: AEO MONITOR ============
function AeoTab() {
  const qc = useQueryClient();
  const { data: checks } = useQuery<any>({ queryKey: ['aeoChecks'], queryFn: async () => (await fetch('/api/visibility/aeo/checks', { credentials: 'include' })).json() });
  const { data: passages } = useQuery<any>({ queryKey: ['aeoPassages'], queryFn: async () => (await fetch('/api/visibility/aeo/passages', { credentials: 'include' })).json() });
  const [query, setQuery] = useState('');
  const [engine, setEngine] = useState('ai_overviews');
  const [running, setRunning] = useState(false);
  const [pForm, setPForm] = useState({ title: '', targetQuery: '', passage: '', stats: '' });

  const runCheck = async () => {
    if (!query.trim()) return;
    setRunning(true);
    try {
      const r = await fetch('/api/visibility/aeo/check', { method: 'POST', headers: { 'Content-Type': 'application/json', }, body: JSON.stringify({ query, engine }) });
      const d = await r.json();
      alert(d.result ? (d.result.mentioned ? `✅ Mentioned — ${d.result.snippet}` : `❌ Not mentioned — ${d.result.snippet}`) : (d.message || 'Check recorded'));
      qc.invalidateQueries({ queryKey: ['aeoChecks'] });
    } catch { alert('Check failed'); }
    setRunning(false);
  };

  const addPassage = useMutation({
    mutationFn: async () => {
      const r = await fetch('/api/visibility/aeo/passages', { method: 'POST', headers: { 'Content-Type': 'application/json', }, body: JSON.stringify(pForm) });
      if (!r.ok) throw new Error('passage');
      return r.json();
    },
    onSuccess: (d) => { alert(d.message); setPForm({ title: '', targetQuery: '', passage: '', stats: '' }); qc.invalidateQueries({ queryKey: ['aeoPassages'] }); },
    onError: () => alert('Save failed'),
  });

  return (
    <div className="space-y-5">
      <Section title={`Answer Engine Monitor — ${checks?.mentionRate ?? 0}% mention rate (${checks?.total ?? 0} checks)`}>
        <div className="flex flex-wrap gap-2">
          <input value={query} onChange={e => setQuery(e.target.value)} placeholder="Query to check (e.g. 'best study abroad consultants in India')" className="flex-1 min-w-[240px] bg-white border border-brand-navy/10 rounded px-3 py-2 text-xs text-brand-navy placeholder:text-brand-navy/40" />
          <select value={engine} onChange={e => setEngine(e.target.value)} className="bg-white border border-brand-navy/10 rounded px-2 py-2 text-xs text-brand-navy">
            <option value="ai_overviews" className="bg-white">Google AI Overviews</option>
            <option value="chatgpt" className="bg-white">ChatGPT</option>
            <option value="perplexity" className="bg-white">Perplexity</option>
            <option value="gemini" className="bg-white">Gemini</option>
            <option value="claude" className="bg-white">Claude</option>
            <option value="grok" className="bg-white">Grok</option>
          </select>
          <button onClick={runCheck} disabled={running} className="bg-brand-gold hover:bg-brand-gold/90 text-brand-navy px-4 py-2 rounded text-xs font-bold disabled:opacity-40 cursor-pointer">{running ? 'Checking…' : '🔎 Run Check'}</button>
        </div>
        <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
          {(checks?.checks || []).slice(0, 20).map((c: any) => (
            <div key={c.id} className="flex items-start gap-2 bg-brand-navy/[0.06] border border-brand-navy/10 rounded px-3 py-2 text-xs">
              <span className={`mt-0.5 text-sm ${c.mentioned ? '' : 'grayscale opacity-40'}`}>{c.mentioned ? '✅' : '❌'}</span>
              <div className="flex-1">
                <div className="text-brand-navy font-semibold">{c.query} <span className="text-brand-navy/40">· {c.engine} · {new Date(c.checkedAt * 1000).toLocaleString()}</span></div>
                <div className="text-[13px] text-brand-navy/50 mt-0.5">{c.snippet}</div>
              </div>
            </div>
          ))}
          {(checks?.checks || []).length === 0 && <p className="text-[13px] text-brand-navy/40 text-center py-2">No checks yet — run your first citation check above.</p>}
        </div>
      </Section>

      <Section title="Answer-First Passage Library (gold standard: 134–167 words, named stats)">
        <div className="space-y-2">
          <input value={pForm.title} onChange={e => setPForm({ ...pForm, title: e.target.value })} placeholder="Passage title" className="w-full bg-white border border-brand-navy/10 rounded px-3 py-2 text-xs text-brand-navy placeholder:text-brand-navy/40" />
          <input value={pForm.targetQuery} onChange={e => setPForm({ ...pForm, targetQuery: e.target.value })} placeholder="Target query (e.g. 'how long does UAE attestation take?')" className="w-full bg-white border border-brand-navy/10 rounded px-3 py-2 text-xs text-brand-navy placeholder:text-brand-navy/40" />
          <textarea value={pForm.passage} onChange={e => setPForm({ ...pForm, passage: e.target.value })} placeholder="Self-contained quotable passage (134-167 words, direct answer in first 40-60 words)" rows={4} className="w-full bg-white border border-brand-navy/10 rounded px-3 py-2 text-xs text-brand-navy placeholder:text-brand-navy/40" />
          <input value={pForm.stats} onChange={e => setPForm({ ...pForm, stats: e.target.value })} placeholder="Named statistics included (e.g. 'processing 2-4 weeks, 98% success rate')" className="w-full bg-white border border-brand-navy/10 rounded px-3 py-2 text-xs text-brand-navy placeholder:text-brand-navy/40" />
          <button onClick={() => addPassage.mutate()} className="bg-brand-gold hover:bg-brand-gold/90 text-brand-navy px-4 py-2 rounded text-xs font-bold cursor-pointer">+ Save Passage</button>
        </div>
        <div className="space-y-1.5">
          {(passages?.passages || []).map((p: any) => (
            <div key={p.id} className="bg-brand-navy/[0.06] border border-brand-navy/10 rounded px-3 py-2 text-xs">
              <div className="text-brand-navy font-semibold">{p.title} <span className="text-brand-navy/40">→ {p.targetQuery}</span></div>
              <div className="text-[13px] text-brand-navy/50 mt-0.5 line-clamp-2">{p.passage}</div>
              {p.stats && <div className="text-xs text-emerald-700 mt-0.5">📊 {p.stats}</div>}
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

// ============ V2: ANALYTICS (GA4) ============
function GaTab() {
  const qc = useQueryClient();
  const { data: cfg } = useQuery<any>({ queryKey: ['ga4Config'], queryFn: async () => (await fetch('/api/visibility/ga4/config', { credentials: 'include' })).json() });
  const { data: events } = useQuery<any>({ queryKey: ['ga4Events'], queryFn: async () => (await fetch('/api/visibility/ga4/events', { credentials: 'include' })).json() });
  const [mid, setMid] = useState('');
  const [cfToken, setCfToken] = useState('');
  const [gtmId, setGtmId] = useState('');
  const [metaPixelId, setMetaPixelId] = useState('');
  const saveCfg = useMutation({
    mutationFn: async () => {
      const r = await fetch('/api/visibility/ga4/config', { method: 'POST', headers: { 'Content-Type': 'application/json', }, body: JSON.stringify({ measurementId: mid, cfWaToken: cfToken, gtmId, metaPixelId }) });
      if (!r.ok) throw new Error('cfg');
      return r.json();
    },
    onSuccess: (d) => { alert(d.message); qc.invalidateQueries({ queryKey: ['ga4Config'] }); },
  });

  const maxEvent = Math.max(1, ...Object.values(events?.byEvent || {}).map(Number));

  return (
    <div className="space-y-5">
      <Section title="Analytics Configuration — GA4 + GTM + Meta Pixel + Cloudflare Web Analytics">
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex-1 min-w-[220px]">
            <label className="text-[13px] text-brand-navy/40 font-bold uppercase block mb-1">GA4 Measurement ID</label>
            <input value={mid || cfg?.measurementId || ''} onChange={e => setMid(e.target.value)} placeholder="G-XXXXXXXXXX" className="w-full bg-white border border-brand-navy/10 rounded px-3 py-2 text-xs text-brand-navy placeholder:text-brand-navy/40" />
          </div>
          <div className="flex-1 min-w-[220px]">
            <label className="text-[13px] text-brand-navy/40 font-bold uppercase block mb-1">Google Tag Manager ID</label>
            <input value={gtmId || cfg?.gtmId || ''} onChange={e => setGtmId(e.target.value)} placeholder="GTM-XXXXXXX" className="w-full bg-white border border-brand-navy/10 rounded px-3 py-2 text-xs text-brand-navy placeholder:text-brand-navy/40" />
          </div>
          <div className="flex-1 min-w-[220px]">
            <label className="text-[13px] text-brand-navy/40 font-bold uppercase block mb-1">Meta Pixel ID</label>
            <input value={metaPixelId || cfg?.metaPixelId || ''} onChange={e => setMetaPixelId(e.target.value)} placeholder="123456789012345" className="w-full bg-white border border-brand-navy/10 rounded px-3 py-2 text-xs text-brand-navy placeholder:text-brand-navy/40" />
          </div>
          <div className="flex-1 min-w-[220px]">
            <label className="text-[13px] text-brand-navy/40 font-bold uppercase block mb-1">Cloudflare Web Analytics token (free)</label>
            <input value={cfToken || cfg?.cfWaToken || ''} onChange={e => setCfToken(e.target.value)} placeholder="Paste token from Cloudflare dashboard → Web Analytics" className="w-full bg-white border border-brand-navy/10 rounded px-3 py-2 text-xs text-brand-navy placeholder:text-brand-navy/40" />
          </div>
          <button onClick={() => saveCfg.mutate()} className="bg-brand-gold hover:bg-brand-gold/90 text-brand-navy px-4 py-2 rounded text-xs font-bold cursor-pointer">Save</button>
        </div>
        <p className="text-[13px] text-brand-navy/40">GA4 + GTM + Meta Pixel fire from one config — no redeploy needed. D1-local events (lead form, payments, portal) stay here for goals + attribution; CF beacon is cookie-free, bot-filtered. GTM orchestrates all tags; dataLayer is source of truth.</p>
      </Section>

      <Section title={`Traffic Events — last 30 days (${events?.total ?? 0} total)`}>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <div className="text-xs font-bold uppercase text-brand-navy/40 mb-2">By event</div>
            <div className="space-y-1.5">
              {Object.entries(events?.byEvent || {}).map(([k, v]: any) => (
                <div key={k} className="flex items-center gap-2 text-[13px]">
                  <span className="w-28 truncate text-brand-navy font-semibold">{k}</span>
                  <div className="flex-1 h-2 rounded-full bg-brand-navy/[0.06] overflow-hidden"><div className="h-full bg-brand-gold rounded-full" style={{ width: `${(v / maxEvent) * 100}%` }} /></div>
                  <span className="text-brand-navy/40 font-mono">{v}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs font-bold uppercase text-brand-navy/40 mb-2">By page</div>
            <div className="space-y-1.5">
              {Object.entries(events?.byPage || {}).map(([k, v]: any) => (
                <div key={k} className="flex items-center gap-2 text-[13px]">
                  <span className="w-28 truncate text-brand-navy font-semibold">{k}</span>
                  <div className="flex-1 h-2 rounded-full bg-brand-navy/[0.06] overflow-hidden"><div className="h-full bg-brand-gold rounded-full" style={{ width: `${(v / maxEvent) * 100}%` }} /></div>
                  <span className="text-brand-navy/40 font-mono">{v}</span>
                </div>
              ))}
            </div>
          </div>
          <div>
            <div className="text-xs font-bold uppercase text-brand-navy/40 mb-2">By source</div>
            <div className="space-y-1.5">
              {Object.entries(events?.bySource || {}).map(([k, v]: any) => (
                <div key={k} className="flex items-center gap-2 text-[13px]">
                  <span className="w-28 truncate text-brand-navy font-semibold">{k}</span>
                  <div className="flex-1 h-2 rounded-full bg-brand-navy/[0.06] overflow-hidden"><div className="h-full bg-brand-gold rounded-full" style={{ width: `${(v / maxEvent) * 100}%` }} /></div>
                  <span className="text-brand-navy/40 font-mono">{v}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </Section>
    </div>
  );
}

// ============ V3: GOOGLE BUSINESS PROFILE ============
function GbpTab() {
  const qc = useQueryClient();
  const { data: prof } = useQuery<any>({ queryKey: ['gbpProfile'], queryFn: async () => (await fetch('/api/visibility/gbp/profile', { credentials: 'include' })).json() });
  const { data: posts } = useQuery<any>({ queryKey: ['gbpPosts'], queryFn: async () => (await fetch('/api/visibility/gbp/posts', { credentials: 'include' })).json() });
  const [form, setForm] = useState<any>({});
  const [postForm, setPostForm] = useState({ title: '', body: '', status: 'draft' });

  const save = useMutation({
    mutationFn: async () => {
      const r = await fetch('/api/visibility/gbp/profile', { method: 'POST', headers: { 'Content-Type': 'application/json', }, body: JSON.stringify(form) });
      if (!r.ok) throw new Error('gbp');
      return r.json();
    },
    onSuccess: (d) => { alert(d.message); qc.invalidateQueries({ queryKey: ['gbpProfile'] }); },
  });
  const addPost = useMutation({
    mutationFn: async () => {
      const r = await fetch('/api/visibility/gbp/posts', { method: 'POST', headers: { 'Content-Type': 'application/json', }, body: JSON.stringify(postForm) });
      if (!r.ok) throw new Error('post');
      return r.json();
    },
    onSuccess: (d) => { alert(d.message); setPostForm({ title: '', body: '', status: 'draft' }); qc.invalidateQueries({ queryKey: ['gbpPosts'] }); },
  });

  const p = prof?.profile || {};
  const checks = prof?.checks || [];

  return (
    <div className="space-y-5">
      <Section title={`Google Business Profile — ${prof?.completeness ?? 0}/100 completeness (the #1 AI Overviews signal)`}>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {checks.map((ch: any) => (
            <span key={ch.key} className={`px-2 py-1 rounded-full text-xs font-bold ${ch.filled ? 'bg-emerald-500/15 text-emerald-700' : 'bg-rose-500/15 text-rose-600'}`}>{ch.filled ? '✓' : '✗'} {ch.label}</span>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
          <input value={form.name ?? p.name ?? ''} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Business name" className="bg-white border border-brand-navy/10 rounded px-3 py-2 text-xs text-brand-navy placeholder:text-brand-navy/40" />
          <input value={form.category ?? p.category ?? ''} onChange={e => setForm({ ...form, category: e.target.value })} placeholder="Primary category (e.g. Education consultant)" className="bg-white border border-brand-navy/10 rounded px-3 py-2 text-xs text-brand-navy placeholder:text-brand-navy/40" />
          <input value={form.address ?? p.address ?? ''} onChange={e => setForm({ ...form, address: e.target.value })} placeholder="Address" className="bg-white border border-brand-navy/10 rounded px-3 py-2 text-xs text-brand-navy placeholder:text-brand-navy/40" />
          <input value={form.phone ?? p.phone ?? ''} onChange={e => setForm({ ...form, phone: e.target.value })} placeholder="Phone" className="bg-white border border-brand-navy/10 rounded px-3 py-2 text-xs text-brand-navy placeholder:text-brand-navy/40" />
          <input value={form.website ?? p.website ?? ''} onChange={e => setForm({ ...form, website: e.target.value })} placeholder="Website" className="bg-white border border-brand-navy/10 rounded px-3 py-2 text-xs text-brand-navy placeholder:text-brand-navy/40" />
          <input value={form.hoursJson ?? p.hoursJson ?? ''} onChange={e => setForm({ ...form, hoursJson: e.target.value })} placeholder='Hours JSON (e.g. {"Mon":"9-6"})' className="bg-white border border-brand-navy/10 rounded px-3 py-2 text-xs text-brand-navy placeholder:text-brand-navy/40" />
          <input value={form.attributesJson ?? p.attributesJson ?? ''} onChange={e => setForm({ ...form, attributesJson: e.target.value })} placeholder='Attributes JSON (e.g. {"WheelchairAccessible":true})' className="bg-white border border-brand-navy/10 rounded px-3 py-2 text-xs text-brand-navy placeholder:text-brand-navy/40" />
        </div>
        <button onClick={() => save.mutate()} className="bg-brand-gold hover:bg-brand-gold/90 text-brand-navy px-4 py-2 rounded text-xs font-bold cursor-pointer">💾 Save Profile</button>
      </Section>

      <Section title="GBP Posts Scheduler">
        <div className="space-y-2">
          <input value={postForm.title} onChange={e => setPostForm({ ...postForm, title: e.target.value })} placeholder="Post title" className="w-full bg-white border border-brand-navy/10 rounded px-3 py-2 text-xs text-brand-navy placeholder:text-brand-navy/40" />
          <textarea value={postForm.body} onChange={e => setPostForm({ ...postForm, body: e.target.value })} placeholder="Post body" rows={2} className="w-full bg-white border border-brand-navy/10 rounded px-3 py-2 text-xs text-brand-navy placeholder:text-brand-navy/40" />
          <div className="flex gap-2">
            <select value={postForm.status} onChange={e => setPostForm({ ...postForm, status: e.target.value })} className="bg-white border border-brand-navy/10 rounded px-2 py-2 text-xs text-brand-navy">
              <option value="draft" className="bg-white">Draft</option>
              <option value="scheduled" className="bg-white">Scheduled</option>
              <option value="published" className="bg-white">Published</option>
            </select>
            <button onClick={() => addPost.mutate()} className="bg-brand-gold hover:bg-brand-gold/90 text-brand-navy px-4 py-2 rounded text-xs font-bold cursor-pointer">+ Save Post</button>
          </div>
        </div>
        <div className="space-y-1.5">
          {(posts?.posts || []).map((pst: any) => (
            <div key={pst.id} className="flex justify-between items-center bg-brand-navy/[0.06] border border-brand-navy/10 rounded px-3 py-2 text-xs">
              <span className="text-brand-navy font-semibold">{pst.title}</span>
              <span className={`px-1.5 py-0.5 rounded text-xs font-bold uppercase ${pst.status === 'published' ? 'bg-emerald-500/15 text-emerald-700' : pst.status === 'scheduled' ? 'bg-amber-500/15 text-amber-700' : 'bg-brand-navy/[0.06] text-brand-navy/40'}`}>{pst.status}</span>
            </div>
          ))}
        </div>
      </Section>
    </div>
  );
}

// ============ V5: SEARCH CONSOLE ============
function GscTab() {
  const qc = useQueryClient();
  const { data } = useQuery<any>({ queryKey: ['gscQueries'], queryFn: async () => (await fetch('/api/visibility/search-console/queries', { credentials: 'include' })).json() });
  const [form, setForm] = useState({ keyword: '', impressions: '', clicks: '', position: '' });
  const add = useMutation({
    mutationFn: async () => {
      const r = await fetch('/api/visibility/seo/keywords', { method: 'POST', headers: { 'Content-Type': 'application/json', }, body: JSON.stringify({ keyword: form.keyword, impressions: Number(form.impressions) || 0, clicks: Number(form.clicks) || 0, position: form.position ? Number(form.position) : undefined }) });
      if (!r.ok) throw new Error('gsc');
      return r.json();
    },
    onSuccess: () => { setForm({ keyword: '', impressions: '', clicks: '', position: '' }); qc.invalidateQueries({ queryKey: ['gscQueries'] }); },
  });

  return (
    <div className="space-y-5">
      <Section title={`Search Console — ${data?.totalImpressions ?? 0} impressions · ${data?.totalClicks ?? 0} clicks · ${data?.ctr ?? 0}% CTR`}>
        <p className="text-[13px] text-brand-navy/40">Enter query data from Google Search Console (or the AI Overviews performance report). Connect the real GSC API later via OAuth.</p>
        <div className="flex flex-wrap gap-2">
          <input value={form.keyword} onChange={e => setForm({ ...form, keyword: e.target.value })} placeholder="Query" className="w-44 bg-white border border-brand-navy/10 rounded px-2 py-2 text-xs text-brand-navy placeholder:text-brand-navy/40" />
          <input value={form.impressions} onChange={e => setForm({ ...form, impressions: e.target.value })} placeholder="Impressions" className="w-24 bg-white border border-brand-navy/10 rounded px-2 py-2 text-xs text-brand-navy placeholder:text-brand-navy/40" />
          <input value={form.clicks} onChange={e => setForm({ ...form, clicks: e.target.value })} placeholder="Clicks" className="w-20 bg-white border border-brand-navy/10 rounded px-2 py-2 text-xs text-brand-navy placeholder:text-brand-navy/40" />
          <input value={form.position} onChange={e => setForm({ ...form, position: e.target.value })} placeholder="Position" className="w-20 bg-white border border-brand-navy/10 rounded px-2 py-2 text-xs text-brand-navy placeholder:text-brand-navy/40" />
          <button onClick={() => add.mutate()} className="bg-brand-gold hover:bg-brand-gold/90 text-brand-navy px-4 py-2 rounded text-xs font-bold cursor-pointer">+ Add</button>
        </div>
        <div className="space-y-1.5">
          {(data?.queries || []).map((q: any) => (
            <div key={q.id} className="flex justify-between items-center bg-brand-navy/[0.06] border border-brand-navy/10 rounded px-3 py-2 text-xs">
              <span className="text-brand-navy font-semibold">{q.keyword}</span>
              <span className="flex items-center gap-3 text-brand-navy/40 font-mono">
                <span>{q.impressions || 0} imp</span>
                <span>{q.clicks || 0} clk</span>
                <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${q.position && q.position <= 10 ? 'bg-emerald-500/15 text-emerald-700' : 'bg-brand-navy/[0.06] text-brand-navy/40'}`}>{q.position ? `#${q.position}` : '—'}</span>
              </span>
            </div>
          ))}
          {(data?.queries || []).length === 0 && <p className="text-[13px] text-brand-navy/40 text-center py-2">No query data yet.</p>}
        </div>
      </Section>
    </div>
  );
}

// ============ V6: REVIEWS ============
function ReviewsTab() {
  const qc = useQueryClient();
  const { data } = useQuery<any>({ queryKey: ['gbpReviews'], queryFn: async () => (await fetch('/api/visibility/gbp/reviews', { credentials: 'include' })).json() });
  const [form, setForm] = useState({ source: 'google', rating: 5, author: '', text: '' });
  const [drafts, setDrafts] = useState<Record<string, string>>({});

  const add = useMutation({
    mutationFn: async () => {
      const r = await fetch('/api/visibility/gbp/reviews', { method: 'POST', headers: { 'Content-Type': 'application/json', }, body: JSON.stringify(form) });
      if (!r.ok) throw new Error('review');
      return r.json();
    },
    onSuccess: (d) => { alert(d.message); setForm({ source: 'google', rating: 5, author: '', text: '' }); qc.invalidateQueries({ queryKey: ['gbpReviews'] }); },
  });
  const respond = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/visibility/gbp/reviews/${id}/respond`, { method: 'POST', headers: { 'Content-Type': 'application/json', }, body: JSON.stringify({ responseDraft: drafts[id] || '' }) });
      if (!r.ok) throw new Error('resp');
      return r.json();
    },
    onSuccess: (d) => { alert(d.message); qc.invalidateQueries({ queryKey: ['gbpReviews'] }); },
  });

  return (
    <div className="space-y-5">
      <Section title={`Reviews & Reputation — ⭐ ${data?.avgRating ?? 0}/5 avg · ${data?.total ?? 0} reviews · ${data?.negative ?? 0} negative`}>
        <div className="flex flex-wrap gap-2">
          <select value={form.source} onChange={e => setForm({ ...form, source: e.target.value })} className="bg-white border border-brand-navy/10 rounded px-2 py-2 text-xs text-brand-navy">
            <option value="google" className="bg-white">Google</option>
            <option value="trustpilot" className="bg-white">Trustpilot</option>
            <option value="justdial" className="bg-white">JustDial</option>
            <option value="other" className="bg-white">Other</option>
          </select>
          <select value={form.rating} onChange={e => setForm({ ...form, rating: Number(e.target.value) })} className="bg-white border border-brand-navy/10 rounded px-2 py-2 text-xs text-brand-navy">
            {[5, 4, 3, 2, 1].map(r => <option key={r} value={r} className="bg-white">{'⭐'.repeat(r)}</option>)}
          </select>
          <input value={form.author} onChange={e => setForm({ ...form, author: e.target.value })} placeholder="Reviewer name" className="w-36 bg-white border border-brand-navy/10 rounded px-2 py-2 text-xs text-brand-navy placeholder:text-brand-navy/40" />
          <input value={form.text} onChange={e => setForm({ ...form, text: e.target.value })} placeholder="Review text" className="flex-1 min-w-[200px] bg-white border border-brand-navy/10 rounded px-2 py-2 text-xs text-brand-navy placeholder:text-brand-navy/40" />
          <button onClick={() => add.mutate()} className="bg-brand-gold hover:bg-brand-gold/90 text-brand-navy px-4 py-2 rounded text-xs font-bold cursor-pointer">+ Record</button>
        </div>
        <div className="space-y-2">
          {(data?.reviews || []).map((r: any) => (
            <div key={r.id} className="bg-brand-navy/[0.06] border border-brand-navy/10 rounded px-3 py-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-brand-navy font-semibold">{'⭐'.repeat(r.rating)} <span className="text-brand-navy/40">· {r.author || 'Anonymous'} · {r.source}</span></span>
                <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${r.responded ? 'bg-emerald-500/15 text-emerald-700' : 'bg-amber-500/15 text-amber-700'}`}>{r.responded ? '✓ Responded' : 'Needs response'}</span>
              </div>
              {r.text && <div className="text-[13px] text-brand-navy/50 mt-1">{r.text}</div>}
              {!r.responded && (
                <div className="flex gap-2 mt-2">
                  <input value={drafts[r.id] || ''} onChange={e => setDrafts({ ...drafts, [r.id]: e.target.value })} placeholder="Draft a response…" className="flex-1 bg-white border border-brand-navy/10 rounded px-2 py-1.5 text-[13px] text-brand-navy placeholder:text-brand-navy/40" />
                  <button onClick={() => respond.mutate(r.id)} className="bg-brand-navy text-white px-3 py-1.5 rounded text-[13px] font-bold cursor-pointer">Save Draft</button>
                </div>
              )}
            </div>
          ))}
          {(data?.reviews || []).length === 0 && <p className="text-[13px] text-brand-navy/40 text-center py-2">No reviews recorded yet. Negative reviews (≤2⭐) trigger staff alerts automatically.</p>}
        </div>
      </Section>
    </div>
  );
}

// ============ V7: ATTRIBUTION ============
function AttributionTab() {
  const { data } = useQuery<any>({ queryKey: ['attribution'], queryFn: async () => (await fetch('/api/visibility/attribution', { credentials: 'include' })).json() });
  const maxRev = Math.max(1, ...(data?.channels || []).map((c: any) => c.revenue));
  return (
    <div className="space-y-5">
      <Section title="Channel Attribution — lead source → conversion → revenue">
        <p className="text-[13px] text-brand-navy/40">Every client's <code className="font-mono">leadSource</code> (website, whatsapp, walk-in, partner, referral, UTM) is mapped to revenue. UTM capture on the public site feeds this automatically.</p>
        <div className="space-y-3">
          {(data?.channels || []).map((c: any) => (
            <div key={c.channel} className="rounded-xl border border-brand-navy/10 bg-brand-navy/[0.03] p-3">
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-brand-navy capitalize">{c.channel}</span>
                <span className="text-brand-gold font-mono font-bold">{rs(c.revenue)}</span>
              </div>
              <div className="h-2 rounded-full bg-brand-navy/[0.06] overflow-hidden mb-2"><div className="h-full bg-brand-gold rounded-full" style={{ width: `${(c.revenue / maxRev) * 100}%` }} /></div>
              <div className="flex gap-3 text-[13px] text-brand-navy/50">
                <span>{c.leads} leads</span>
                <span>{c.converted} converted</span>
                <span className="text-emerald-700 font-bold">{c.conversionPct}% conv</span>
                <span>ARPU {rs(c.arpu)}</span>
              </div>
            </div>
          ))}
          {(data?.channels || []).length === 0 && <p className="text-[13px] text-brand-navy/40 text-center py-2">No client data yet.</p>}
        </div>
      </Section>
    </div>
  );
}

// ============ E7: SCHEDULED REPORTS ============
function ReportsTab() {
  const qc = useQueryClient();
  const { data } = useQuery<any>({ queryKey: ['reportSchedules'], queryFn: async () => (await fetch('/api/visibility/reports/schedules', { credentials: 'include' })).json() });
  const [form, setForm] = useState({ name: '', reportType: 'revenue', period: 'monthly', recipients: '' });
  const add = useMutation({
    mutationFn: async () => {
      const r = await fetch('/api/visibility/reports/schedules', { method: 'POST', headers: { 'Content-Type': 'application/json', }, body: JSON.stringify(form) });
      if (!r.ok) throw new Error('sched');
      return r.json();
    },
    onSuccess: (d) => { alert(d.message); setForm({ name: '', reportType: 'revenue', period: 'monthly', recipients: '' }); qc.invalidateQueries({ queryKey: ['reportSchedules'] }); },
  });
  const runNow = useMutation({
    mutationFn: async (id: string) => {
      const r = await fetch(`/api/visibility/reports/schedules/${id}/run`, { method: 'POST', });
      if (!r.ok) throw new Error('run');
      return r.json();
    },
    onSuccess: (d) => { alert(d.message); qc.invalidateQueries({ queryKey: ['reportSchedules'] }); },
  });

  return (
    <div className="space-y-5">
      <Section title="Scheduled Reports (E7)">
        <div className="flex flex-wrap gap-2">
          <input value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} placeholder="Report name (e.g. Monthly Revenue)" className="w-44 bg-white border border-brand-navy/10 rounded px-2 py-2 text-xs text-brand-navy placeholder:text-brand-navy/40" />
          <select value={form.reportType} onChange={e => setForm({ ...form, reportType: e.target.value })} className="bg-white border border-brand-navy/10 rounded px-2 py-2 text-xs text-brand-navy">
            <option value="revenue" className="bg-white">Revenue</option>
            <option value="growth" className="bg-white">Growth</option>
            <option value="funnels" className="bg-white">Funnels</option>
            <option value="compliance" className="bg-white">Compliance</option>
            <option value="visibility" className="bg-white">Visibility</option>
          </select>
          <select value={form.period} onChange={e => setForm({ ...form, period: e.target.value })} className="bg-white border border-brand-navy/10 rounded px-2 py-2 text-xs text-brand-navy">
            <option value="weekly" className="bg-white">Weekly</option>
            <option value="monthly" className="bg-white">Monthly</option>
            <option value="quarterly" className="bg-white">Quarterly</option>
          </select>
          <input value={form.recipients} onChange={e => setForm({ ...form, recipients: e.target.value })} placeholder="Emails (comma-separated)" className="flex-1 min-w-[200px] bg-white border border-brand-navy/10 rounded px-2 py-2 text-xs text-brand-navy placeholder:text-brand-navy/40" />
          <button onClick={() => add.mutate()} className="bg-brand-gold hover:bg-brand-gold/90 text-brand-navy px-4 py-2 rounded text-xs font-bold cursor-pointer">+ Schedule</button>
        </div>
        <div className="space-y-1.5">
          {(data?.schedules || []).map((s: any) => (
            <div key={s.id} className="flex justify-between items-center bg-brand-navy/[0.06] border border-brand-navy/10 rounded px-3 py-2 text-xs">
              <div>
                <span className="text-brand-navy font-semibold">{s.name}</span>
                <span className="text-brand-navy/40"> · {s.reportType} · {s.period}{s.recipients ? ` → ${s.recipients}` : ''}</span>
                {s.lastRunAt && <span className="text-brand-navy/30"> · last run {new Date(s.lastRunAt * 1000).toLocaleDateString()}</span>}
              </div>
              <div className="flex items-center gap-2">
                <span className={`px-1.5 py-0.5 rounded text-xs font-bold ${s.enabled ? 'bg-emerald-500/15 text-emerald-700' : 'bg-brand-navy/[0.06] text-brand-navy/40'}`}>{s.enabled ? 'ON' : 'OFF'}</span>
                <button onClick={() => runNow.mutate(s.id)} className="border border-brand-navy/15 px-2 py-1 rounded text-xs font-bold text-brand-navy hover:border-brand-gold/50 cursor-pointer">▶ Run now</button>
              </div>
            </div>
          ))}
          {(data?.schedules || []).length === 0 && <p className="text-[13px] text-brand-navy/40 text-center py-2">No schedules yet. Each run is audit-logged; email delivery needs SMTP config (TODO).</p>}
        </div>
      </Section>
    </div>
  );
}

// ============ MAIN ============
export default function VisibilityHub() {
  const rootRef = useRevealRoot<HTMLDivElement>();
  const [tab, setTab] = useState('seo');

  return (
    <div ref={rootRef} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="gold-dot" />
            <span className="text-[13px] font-bold uppercase tracking-[0.18em] text-brand-gold">Visibility Hub</span>
          </div>
          <h2 className="font-display font-bold text-base text-brand-navy">SEO · AEO/GEO · Analytics · Google Business · Reviews · Attribution</h2>
        </div>
      </div>

      <div className="flex flex-wrap gap-1 rounded-full border border-brand-navy/15 bg-brand-navy/[0.04] p-1 text-[13px] font-bold uppercase">
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} className={`px-3 py-1.5 rounded-full transition-all cursor-pointer ${tab === t.key ? 'bg-brand-gold text-brand-navy' : 'text-brand-navy/50 hover:text-brand-navy'}`}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'seo' && <SeoTab />}
      {tab === 'aeo' && <AeoTab />}
      {tab === 'blog' && <BlogManager />}
      {tab === 'ga' && <GaTab />}
      {tab === 'gbp' && <GbpTab />}
      {tab === 'gsc' && <GscTab />}
      {tab === 'reviews' && <ReviewsTab />}
      {tab === 'attribution' && <AttributionTab />}
      {tab === 'reports' && <ReportsTab />}
    </div>
  );
}