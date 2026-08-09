import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

// SUPER_ADMIN ONLY surface (server also enforces the /api/admin ceiling).
// Campaigns = division+context targeted nurture plans; touches are dispatched
// by the automation lane through the WhatsApp provider (Wave 2 brainstorm).

const AUTH = {
  get Cookie() {
    const s = document.cookie.split(';').map((p: string) => p.trim()).find((p: string) => p.startsWith('better-auth.session_token='));
    return s || '';
  }
} as Record<string, string>;

type Touch = { id: string; campaignId: string; seq: number; day: number; stage: 'value' | 'case_study' | 'offer' | 'final'; body: string };
interface Campaign {
  id: string; key: string; name: string; description: string | null;
  division: string; eligibilityJson: string; status: 'draft' | 'active' | 'paused';
  createdAt: number; updatedAt: number; touches: Touch[];
}

const DIVISIONS = [
  { key: 'study-abroad', label: 'Study Abroad' },
  { key: 'visa', label: 'Visa Processing' },
  { key: 'umrah', label: 'Umrah Packages' },
  { key: 'attestation', label: 'Document Attestation' },
  { key: 'manpower', label: 'Manpower Recruitment' },
];

const STAGES: Record<string, string> = { value: 'Value', case_study: 'Case Study', offer: 'Offer', final: 'Final' };
const STATUS_STYLE: Record<string, string> = {
  active: 'bg-emerald-950/60 text-emerald-300 border-emerald-700/50',
  paused: 'bg-amber-950/60 text-amber-300 border-amber-700/50',
  draft: 'bg-slate-800/60 text-slate-300 border-slate-600/50',
};

const EMPTY_TOUCH = () => ({ seq: 1, day: 0, stage: 'value' as const, body: '' });

export default function CampaignsTab() {
  const queryClient = useQueryClient();
  const [toast, setToast] = useState<{ show: boolean; msg: string; type: 'success' | 'error' }>({ show: false, msg: '', type: 'success' });
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    key: '', name: '', description: '', division: 'study-abroad',
    status: 'draft' as 'draft' | 'active' | 'paused', eligibilityJson: '',
    touches: [EMPTY_TOUCH()],
  });

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ show: true, msg, type });
    setTimeout(() => setToast({ show: false, msg: '', type: 'success' }), 4000);
  };

  const { data, isLoading, isError } = useQuery<{ campaigns: Campaign[] }>({
    queryKey: ['adminCampaigns'],
    queryFn: async () => {
      const r = await fetch('/api/admin/campaigns', { headers: AUTH });
      if (!r.ok) throw new Error('load failed');
      return r.json();
    },
  });

  const createCampaign = useMutation({
    mutationFn: async () => {
      let eligibilityJson: Record<string, unknown> = {};
      if (form.eligibilityJson.trim()) {
        try { eligibilityJson = JSON.parse(form.eligibilityJson); }
        catch { throw new Error('Eligibility JSON must be valid JSON, e.g. {"targetCountry":["US","UK"]}'); }
      }
      const r = await fetch('/api/admin/campaigns', {
        method: 'POST', headers: { ...AUTH, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          key: form.key.trim(),
          name: form.name.trim(),
          description: form.description.trim() || undefined,
          division: form.division,
          status: form.status,
          eligibilityJson,
          touches: form.touches.map((t, i) => ({ seq: i + 1, day: Number(t.day), stage: t.stage, body: t.body.trim() }))
            .filter(t => t.body.length > 0),
        }),
      });
      if (!r.ok) { const e = await r.json().catch(() => null); throw new Error(e?.error || 'Create failed'); }
      return r.json();
    },
    onSuccess: (d) => {
      queryClient.invalidateQueries({ queryKey: ['adminCampaigns'] });
      setShowForm(false);
      showToast(`Campaign "${d.key}" created with ${d.touchCount} touch(es).`);
    },
    onError: (e: any) => showToast((e as Error).message, 'error'),
  });

  const setStatus = useMutation({
    mutationFn: async ({ key, status }: { key: string; status: string }) => {
      const r = await fetch(`/api/admin/campaigns/${key}/status`, {
        method: 'PATCH', headers: { ...AUTH, 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!r.ok) { const e = await r.json().catch(() => null); throw new Error(e?.error || 'Status change failed'); }
      return r.json();
    },
    onSuccess: (d) => {
      queryClient.invalidateQueries({ queryKey: ['adminCampaigns'] });
      showToast(`Campaign ${d.key} → ${d.status}`);
    },
    onError: (e: any) => showToast((e as Error).message, 'error'),
  });

  const setFormTouch = (i: number, patch: Partial<Touch>) => {
    setForm(f => ({ ...f, touches: f.touches.map((t, idx) => (idx === i ? { ...t, ...patch } : t)) }));
  };

  if (isLoading) return <div className="p-12 text-center text-xs text-slate-400">Loading campaign catalog...</div>;
  if (isError || !data) {
    return (
      <div className="p-12 text-center text-xs text-rose-400 bg-rose-950/20 border border-rose-900/50 rounded-lg">
        Failed to load campaigns. Super-admin session required.
      </div>
    );
  }

  const campaigns = data.campaigns || [];

  return (
    <div className="p-6 space-y-6">
      {toast.show && (
        <div className={`fixed top-4 right-4 z-50 px-4 py-2 rounded text-xs font-bold shadow ${toast.type === 'success' ? 'bg-emerald-600 text-white' : 'bg-rose-600 text-white'}`}>
          {toast.msg}
        </div>
      )}

      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-sm font-bold text-white uppercase tracking-wide">Nurture Campaigns</h2>
          <p className="text-[11px] text-slate-400 mt-1">
            Division + context targeted WhatsApp sequences (super-admin surface). Eligible leads are matched at nurture-plan time.
          </p>
        </div>
        <button
          onClick={() => setShowForm(v => !v)}
          className="px-3 py-1.5 rounded text-xs font-bold uppercase tracking-wider bg-brand-gold text-brand-navy hover:bg-brand-goldHover transition"
        >
          {showForm ? 'Close' : '+ New Campaign'}
        </button>
      </div>

      {showForm && (
        <div className="border border-slate-700/60 bg-slate-900/60 rounded-lg p-4 space-y-3 panel-entrance">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <input value={form.key} onChange={(e) => setForm({ ...form, key: e.target.value })} placeholder="key (slug)" className="bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs text-white" />
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Campaign name" className="bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs text-white" />
            <select value={form.division} onChange={(e) => setForm({ ...form, division: e.target.value })} className="bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs text-white">
              {DIVISIONS.map(d => <option key={d.key} value={d.key}>{d.label}</option>)}
            </select>
            <select value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value as any })} className="bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs text-white">
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="paused">Paused</option>
            </select>
          </div>
          <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Description" className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs text-white" />
          <input value={form.eligibilityJson} onChange={(e) => setForm({ ...form, eligibilityJson: e.target.value })} placeholder='Eligibility JSON — e.g. {"targetCountry":["US","UK"]} (empty = whole division)' className="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs text-white font-mono" />

          <div className="space-y-2">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Touch plan (day offset, stage, body — {{name}} / {{targetCountry}} tokens supported)</p>
            {form.touches.map((t, i) => (
              <div key={i} className="grid grid-cols-[40px_60px_100px_1fr] gap-2 items-center">
                <span className="text-[10px] text-slate-500">#{i + 1}</span>
                <input type="number" min={0} value={t.day} onChange={(e) => setFormTouch(i, { day: Number(e.target.value) })} className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white" />
                <select value={t.stage} onChange={(e) => setFormTouch(i, { stage: e.target.value as any })} className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white">
                  {Object.entries(STAGES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
                </select>
                <input value={t.body} onChange={(e) => setFormTouch(i, { body: e.target.value })} placeholder="Message body" className="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-white" />
              </div>
            ))}
            <button onClick={() => setForm({ ...form, touches: [...form.touches, EMPTY_TOUCH()] })} className="text-[11px] text-brand-gold hover:underline">+ Add touch</button>
          </div>

          <button
            onClick={() => createCampaign.mutate()}
            disabled={createCampaign.isPending || !form.key.trim() || !form.name.trim()}
            className="px-4 py-2 rounded text-xs font-bold uppercase tracking-wider bg-emerald-600 text-white hover:bg-emerald-500 disabled:opacity-40 transition"
          >
            {createCampaign.isPending ? 'Creating...' : 'Create Campaign'}
          </button>
        </div>
      )}

      <div className="space-y-4">
        {campaigns.length === 0 && (
          <div className="p-10 text-center text-xs text-slate-500 border border-dashed border-slate-700 rounded-lg">
            No campaigns yet — create one to start targeting leads by division + context.
          </div>
        )}
        {campaigns.map((c) => (
          <div key={c.id} className="border border-slate-700/60 bg-slate-900/60 rounded-lg overflow-hidden">
            <div className="flex items-center justify-between px-4 py-3 border-b border-slate-800">
              <div>
                <div className="flex items-center gap-2">
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider border ${STATUS_STYLE[c.status] || STATUS_STYLE.draft}`}>{c.status}</span>
                  <span className="text-xs font-bold text-white">{c.name}</span>
                  <code className="text-[10px] text-slate-500">{c.key}</code>
                </div>
                <p className="text-[10px] text-slate-400 mt-0.5">
                  {DIVISIONS.find(d => d.key === c.division)?.label || c.division} · {c.touches.length} touch(es) · {c.description || 'No description'}
                  {c.eligibilityJson !== '{}' && c.eligibilityJson ? ` · eligibility: ${c.eligibilityJson}` : ''}
                </p>
              </div>
              <div className="flex gap-2">
                {(['active', 'paused', 'draft'] as const).map((s) => (
                  s !== c.status && (
                    <button
                      key={s}
                      onClick={() => setStatus.mutate({ key: c.key, status: s })}
                      disabled={setStatus.isPending}
                      className="px-2 py-1 rounded text-[10px] font-bold uppercase tracking-wider border border-slate-600 text-slate-300 hover:border-brand-gold hover:text-brand-gold transition disabled:opacity-40"
                    >
                      {s}
                    </button>
                  )
                ))}
              </div>
            </div>
            <div className="px-4 py-3 space-y-1.5">
              {c.touches.map((t) => (
                <div key={t.seq} className="flex items-start gap-3 text-[11px]">
                  <span className="text-slate-500 shrink-0 w-6">D+{t.day}</span>
                  <span className="text-brand-gold shrink-0 uppercase w-20">{STAGES[t.stage] || t.stage}</span>
                  <span className="text-slate-300">{t.body}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}