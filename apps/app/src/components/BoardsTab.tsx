import { useState, useEffect } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useSession } from '../lib/session';
import { useRevealRoot } from '../lib/reveal';
const API = (import.meta as any).env?.VITE_API_URL || 'https://opusos-api.ajmalsn63.workers.dev';

// ── Task Boards — the KANBAN SYSTEM (gold standard 2026) ───────────────────
// WIP limits enforced (drop-blocked + 409 from API), classes of service with
// an Expedite lane (limit 1, bypasses the column cap), blocker flags, true
// cycle time, explicit policies, aging signals, and a live flow strip — so
// the board is a mirror of real flow, and reviews run on data.


interface TaskRow {
  id: string; title: string; priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'in_progress' | 'done' | 'cancelled';
  cos: 'standard' | 'expedite' | 'fixed_date';
  assigneeId: string | null; assigneeName: string | null; clientId: string | null;
  dueDate: number | null; createdAt: number; inProgressAt: number | null; blockedReason: string | null;
  description?: string | null;
}
interface BoardData {
  tasks: TaskRow[]; staffTotal: number;
  prefs: { columnLimitInProgress: number; personLimitInProgress: number; expediteLimit: number; policyText: string; doneAutoArchiveDays: number };
  metrics: { cycleHours: { p50: number | null; p85: number | null; p95: number | null }; leadHoursP50: number | null; throughput7d: number; wip: { inProgress: number; expedite: number }; blocked: { id: string; title: string; assigneeName: string | null; reason: string; ageHours: number }[]; wipAgeHours: number[] };
}

const COLUMNS: { key: TaskRow['status']; label: string; accent: string }[] = [
  { key: 'open', label: 'Open', accent: 'border-t-slate-300' },
  { key: 'in_progress', label: 'In progress', accent: 'border-t-amber-400' },
  { key: 'done', label: 'Done', accent: 'border-t-emerald-400' },
];
const PRIORITY_STYLE: Record<string, string> = {
  urgent: 'bg-rose-500/15 text-rose-700', high: 'bg-amber-500/15 text-amber-700',
  medium: 'bg-slate-500/15 text-slate-300', low: 'bg-emerald-500/15 text-emerald-700',
};
const REL = (h: number) => (h < 24 ? `${h}h` : `${Math.round(h / 24)}d`);
const HOURS = (at: number) => Math.max(0, Math.floor((Date.now() / 1000 - at) / 3600));

const Card = ({
  t,
  nowS,
  dragId,
  setDragId,
  setDragOverCol,
  setSelectedTaskId,
  isMe,
  move,
  inLaneCount,
  expediteLimit,
}: {
  t: TaskRow;
  nowS: number;
  dragId: string | null;
  setDragId: (id: string | null) => void;
  setDragOverCol: (col: string | null) => void;
  setSelectedTaskId: (id: string | null) => void;
  isMe: (r: TaskRow) => boolean;
  move: any;
  inLaneCount: (lane: string) => number;
  expediteLimit: number;
}) => {
  const overdue = !!t.dueDate && t.dueDate < nowS && t.status !== 'done';
  const stale = t.status === 'in_progress' && HOURS(Number(t.inProgressAt || t.createdAt)) >= 48;
  const blocked = !!t.blockedReason;
  return (
    <div
      draggable
      onDragStart={(e) => {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', t.id);
        setTimeout(() => {
          setDragId(t.id);
        }, 0);
      }}
      onDragEnd={() => {
        setDragId(null);
        setDragOverCol(null);
      }}
      onClick={() => setSelectedTaskId(t.id)}
      className={`rounded-xl border bg-white px-3 py-2.5 shadow-sm active:cursor-grabbing hover:border-brand-gold hover:shadow transition duration-200 select-none ${dragId === t.id ? 'opacity-40' : ''} ${blocked ? 'border-l-4 border-l-rose-500 border-brand-navy/10' : 'border-brand-navy/10'} cursor-grab`}
    >
      <div className="flex items-start justify-between gap-2 text-brand-navy">
        <span className={`text-xs font-semibold ${blocked ? 'text-rose-700' : 'text-brand-navy'}`}>
          {blocked && <span className="mr-1">⚠</span>}
          {t.title}
        </span>
        <span className={`shrink-0 rounded px-1 py-0.5 text-xs font-bold uppercase ${PRIORITY_STYLE[t.priority] || PRIORITY_STYLE.medium}`}>{t.priority}</span>
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[13px] text-brand-navy/50">
        <span className={`rounded px-1 py-0.5 font-bold uppercase ${t.cos === 'expedite' ? 'bg-rose-500/15 text-rose-700' : t.cos === 'fixed_date' ? 'bg-violet-500/15 text-violet-300' : 'bg-slate-500/10 text-slate-350'}`}>{t.cos === 'expedite' ? '⚡ expedite' : t.cos}</span>
        <span className="truncate">{t.assigneeName || (t.assigneeId ? t.assigneeId.slice(0, 8) : 'unassigned')}{isMe(t) ? ' (me)' : ''}</span>
        {t.clientId && <span className="shrink-0 font-mono">{t.clientId.slice(0, 12)}</span>}
        {stale && <span className="shrink-0 rounded bg-amber-500/15 px-1 py-0.5 font-bold text-amber-700">aging {REL(HOURS(Number(t.inProgressAt || t.createdAt)))}</span>}
        {overdue && <span className="shrink-0 font-bold text-rose-600">overdue</span>}
      </div>
      {blocked && <div className="mt-1 truncate text-[13px] text-rose-700">blocked: {t.blockedReason}</div>}
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {(['block', 'expedite', 'clear'] as const).map((a) => {
          if (a === 'block' && blocked) return null;
          if (a === 'clear' && !blocked) return null;
          if (a === 'expedite' && t.cos === 'expedite') return null;
          if (a === 'expedite' && t.status === 'done') return null;
          return (
            <button
              key={a}
              onClick={(e) => {
                e.stopPropagation();
                if (a === 'block') {
                  const reason = prompt('Blocked because (visible to the team):');
                  if (reason?.trim()) move.mutate({ id: t.id, patch: { blockedReason: reason.trim().slice(0, 300) } });
                } else if (a === 'clear') move.mutate({ id: t.id, patch: { blockedReason: null } });
                else if (a === 'expedite') {
                  if (inLaneCount('expedite') >= expediteLimit) alert(`Expedite lane full (limit ${expediteLimit}) — resolve one first`);
                  else move.mutate({ id: t.id, patch: { cos: 'expedite' } });
                }
              }}
              className="rounded-full border border-brand-navy/15 px-1.5 py-0.5 text-xs font-bold uppercase text-brand-navy/50 hover:border-rose-500 hover:text-rose-700"
            >
              {a === 'block' ? '⛔ block' : a === 'clear' ? 'unblock' : '⚡ expedite'}
            </button>
          );
        })}
        {t.status === 'done' && (
          <button onClick={(e) => { e.stopPropagation(); if (confirm('Archive this card?')) move.mutate({ id: t.id, patch: { status: 'cancelled' } }); }} className="rounded-full border border-brand-navy/15 px-1.5 py-0.5 text-xs font-bold uppercase text-brand-navy/50 hover:bg-rose-600 hover:text-white">archive</button>
        )}
      </div>
    </div>
  );
};

export default function BoardsTab() {
  const qc = useQueryClient();
  const { me } = useSession();
  const rootRef = useRevealRoot<HTMLDivElement>();
  const isManager = me?.role === 'super_admin' || me?.role === 'manager';
  const [showCreate, setShowCreate] = useState(false);
  const [showPolicies, setShowPolicies] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [myOnly, setMyOnly] = useState(false);
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [settings, setSettings] = useState({ columnLimitInProgress: 6, personLimitInProgress: 3, expediteLimit: 1, policyText: '' });
  const [form, setForm] = useState({ title: '', priority: 'medium' as TaskRow['priority'], cos: 'standard' as TaskRow['cos'], due: '', assigneeId: '' });

  // Selected Task for Slide Preview Drawer (represented by ID to support clean cache invalidations)
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  // Fetch Board Columns Data
  const { data, isLoading, isError, refetch } = useQuery<BoardData>({
    queryKey: ['boardSystem'],
    queryFn: async () => { const r = await fetch(`${API}/api/tasks/board`, { credentials: 'include' }); if (!r.ok) throw new Error('board'); return r.json(); },
  });

  // Derived selected task from query cache
  const selectedTask = data?.tasks.find((t) => t.id === selectedTaskId) || null;

  // Local state for editing metadata in drawer
  const [editTitle, setEditTitle] = useState('');
  const [editDesc, setEditDesc] = useState('');
  const [editDue, setEditDue] = useState('');

  useEffect(() => {
    if (selectedTask) {
      setEditTitle(selectedTask.title || '');
      setEditDesc(selectedTask.description || '');
      setEditDue(selectedTask.dueDate ? new Date(selectedTask.dueDate * 1000).toISOString().split('T')[0] : '');
    }
  }, [selectedTask?.id, selectedTask?.title, selectedTask?.description, selectedTask?.dueDate]);
  const { data: directory } = useQuery<{ staff: { id: string; name: string; role: string }[]; total: number }>({
    queryKey: ['staffDirectory'],
    queryFn: async () => { const r = await fetch(`${API}/api/tasks/staff-directory`, { credentials: 'include' }); if (!r.ok) throw new Error('staff'); return r.json(); },
  });

  const invalidate = () => qc.invalidateQueries({ queryKey: ['boardSystem'] });

  const move = useMutation({
    mutationFn: async ({ id, patch }: { id: string; patch: Record<string, unknown> }) => {
      const r = await fetch(`${API}/api/tasks/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(patch) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'move failed');
      return d;
    },
    onSuccess: (d) => { invalidate(); if (d?.warning) alert(d.warning); },
    onError: (e: any) => alert((e as Error).message),
  });

  const create = useMutation({
    mutationFn: async () => {
      const body: Record<string, unknown> = { title: form.title.trim(), priority: form.priority, cos: form.cos };
      if (form.assigneeId) body.assigneeId = form.assigneeId;
      if (form.due) body.dueDate = Math.floor(new Date(form.due).getTime() / 1000);
      const r = await fetch(`${API}/api/tasks`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'create failed');
      return d;
    },
    onSuccess: () => { invalidate(); setShowCreate(false); setForm({ title: '', priority: 'medium', cos: 'standard', due: '', assigneeId: '' }); },
    onError: (e: any) => alert((e as Error).message),
  });

  const savePrefs = useMutation({
    mutationFn: async () => {
      const r = await fetch(`${API}/api/tasks/board/prefs`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settings) });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(d.error || 'prefs failed');
      return d;
    },
    onSuccess: () => { invalidate(); setShowSettings(false); },
    onError: (e: any) => alert((e as Error).message),
  });

  // Task Delete Mutation
  const deleteTaskMutation = useMutation({
    mutationFn: async (payload: { taskId: string }) => {
      const res = await fetch(`${API}/api/tasks/${payload.taskId}`, {
        method: 'DELETE',
        });
      if (!res.ok) {
        throw new Error(await res.text() || 'Failed to delete task');
      }
      return res.json();
    },
    onSuccess: () => {
      invalidate();
      setSelectedTaskId(null);
    },
    onError: (err: any) => {
      alert(`Error: ${err.message || 'Failed to delete task'}`);
    },
  });

  if (isLoading) return <div className="p-12 text-center text-xs text-brand-navy/40">Loading board system…</div>;
  if (isError || !data) return <div className="p-12 text-center text-xs text-rose-700 bg-rose-50 rounded-lg">Failed to load board. <button className="underline" onClick={() => refetch()}>Retry</button></div>;

  const nowS = Math.floor(Date.now() / 1000);
  const all = data.tasks;
  const visibleTasks = myOnly && me ? all.filter((t) => t.assigneeId === me.id || t.assigneeId === null) : all;
  const visible = visibleTasks.filter((t) => {
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchesTitle = t.title.toLowerCase().includes(q);
      const matchesAssignee = (t.assigneeName || '').toLowerCase().includes(q);
      const matchesClient = (t.clientId || '').toLowerCase().includes(q);
      if (!matchesTitle && !matchesAssignee && !matchesClient) return false;
    }
    return true;
  });
  const active = all.filter((t) => t.status !== 'done' && t.status !== 'cancelled');
  const expediteActive = active.filter((t) => t.cos === 'expedite');
  const myCount = all.filter((t) => t.assigneeId === me?.id && t.status !== 'done' && t.status !== 'cancelled').length;
  const cap = data.prefs.columnLimitInProgress;
  const iProgress = all.filter((t) => t.status === 'in_progress' && t.cos !== 'expedite').length;
  const overCap = iProgress >= cap;
  const isMe = (r: TaskRow) => !!me && r.assigneeId === me.id;

  const inLaneCount = (lane: string) => all.filter((t) => t.cos === lane && t.status !== 'done' && t.status !== 'cancelled').length;
  const canCardDrop = (id: string, targetStatus: string) => {
    const t = all.find((x) => x.id === id);
    if (!t || t.status === targetStatus) return false;
    if (targetStatus === 'in_progress' && t.cos !== 'expedite') return iProgress < cap;
    return true;
  };
  return (
    <div ref={rootRef} className="space-y-5 p-6 text-brand-navy">
      <div className="reveal flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2.5">
            <span className="gold-dot" />
            <p className="text-[13px] font-bold uppercase tracking-[0.18em] text-brand-gold">Boards</p>
          </div>
          <h2 className="mt-2 font-display text-sm font-bold text-brand-navy">Task Boards</h2>
          <p className="mt-1 text-sm text-brand-navy/40">Kanban system · {data.staffTotal} staff · finish-before-start enforced by WIP limits; expedite bypasses with limit {data.prefs.expediteLimit}.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2.5">
          {/* Real-time Search Box */}
          <div className="relative min-w-[200px]">
            <input
              type="text"
              placeholder="Search task title, staff..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="text-xs border border-brand-navy/10 rounded-full px-4 py-2 bg-white text-brand-navy placeholder:text-brand-navy/35 focus:outline-none focus:ring-1 focus:ring-brand-gold w-full"
            />
          </div>
          {isManager && (
            <button onClick={() => { setSettings({ columnLimitInProgress: data.prefs.columnLimitInProgress, personLimitInProgress: data.prefs.personLimitInProgress, expediteLimit: data.prefs.expediteLimit, policyText: data.prefs.policyText }); setShowSettings(true); }}
              className="rounded-full border border-brand-navy/15 bg-brand-navy/[0.04] px-3 py-2 text-[13px] font-bold uppercase text-brand-navy/70 hover:border-brand-gold/50 hover:text-brand-gold">⚙ Policies &amp; limits</button>
          )}
          <button onClick={() => setShowPolicies((v) => !v)} className="rounded-full border border-brand-navy/15 bg-brand-navy/[0.04] px-3 py-2 text-[13px] font-bold uppercase text-brand-navy/70 hover:border-brand-gold/50 hover:text-brand-gold">Policies</button>
          <button onClick={() => setMyOnly((v) => !v)} className={`rounded-full px-4 py-2 text-sm font-extrabold uppercase transition ${myOnly ? 'bg-brand-1 text-brand-navy' : 'border border-brand-navy/15 bg-brand-navy/[0.04] text-brand-navy/70'}`}>My tasks ({myCount})</button>
          <button onClick={() => setShowCreate((v) => !v)} className="rounded-full bg-brand-gold px-4 py-2 text-sm font-extrabold uppercase text-brand-navy hover:bg-brand-gold/90">{showCreate ? 'Close' : '+ New task'}</button>
        </div>
      </div>

      {/* Flow strip — the feedback loop's numbers */}
      <div className="reveal grid grid-cols-2 gap-2 md:grid-cols-5">
        {[
          ['Throughput 7d', String(data.metrics.throughput7d)],
          ['Cycle p50', data.metrics.cycleHours.p50 != null ? `${data.metrics.cycleHours.p50}h` : '—'],
          ['Cycle p85', data.metrics.cycleHours.p85 != null ? `${data.metrics.cycleHours.p85}h` : '—'],
          ['Active WIP', `${data.metrics.wip.inProgress}${overCap ? ' ⚠ over ' + cap : ''}`],
          ['Blocked', String(data.metrics.blocked.length)],
        ].map(([k, v]) => (
          <div key={k} className={`rounded-xl border px-3 py-2 ${overCap && k === 'Active WIP' ? 'border-rose-500/40 bg-rose-500/10' : 'border-brand-navy/10 bg-white'}`}>
            <div className="text-xs font-bold uppercase tracking-widest text-brand-navy/40">{k}</div>
            <div className={`font-display text-lg font-extrabold ${k === 'Blocked' && data.metrics.blocked.length > 0 ? 'text-rose-600' : 'text-brand-navy'}`}>{v}</div>
          </div>
        ))}
      </div>

      {showPolicies && (
        <div className="rounded-2xl border border-brand-navy/10 bg-white p-4">
          <div className="text-[13px] font-bold uppercase tracking-widest text-brand-navy/40">Explicit policies (Definition of Done)</div>
          <p className="mt-1.5 text-sm leading-relaxed text-brand-navy/40">{data.prefs.policyText}</p>
        </div>
      )}

      {data.metrics.blocked.length > 0 && (
        <div className="rounded-2xl border border-rose-500/40 bg-rose-500/10 px-4 py-2.5 text-sm text-rose-700">
          <span className="font-bold">{data.metrics.blocked.length} blocked:</span>
          {data.metrics.blocked.slice(0, 5).map((b) => (
            <span key={b.id} className="ml-2">• {b.title} <span className="opacity-70">({b.assigneeName || 'unassigned'} · {REL(b.ageHours)} · {b.reason?.slice(0, 40)})</span></span>
          ))}
          {data.metrics.blocked.length > 5 && <span className="ml-1 opacity-70">+{data.metrics.blocked.length - 5} more</span>}
        </div>
      )}

      {/* Expedite lane — class of service, always visible */}
      <section className={`reveal rounded-2xl border-t-4 border-t-rose-400 border-b border-x border-brand-navy/10 bg-rose-500/10 p-3 ${expediteActive.length === 0 ? 'hidden' : ''}`}>
        <div className="flex items-center justify-between px-1 pb-2">
          <span className="text-[13px] font-bold uppercase tracking-widest text-rose-700">⚡ Expedite lane · {expediteActive.length}/{data.prefs.expediteLimit}</span>
          {inLaneCount('expedite') >= data.prefs.expediteLimit && <span className="text-[13px] font-bold text-rose-600">lane full — limit reached</span>}
        </div>
        <div className="flex flex-wrap gap-2">
          {expediteActive.map((t) => <div key={t.id} className="w-72 max-w-full"><Card t={t} nowS={nowS} dragId={dragId} setDragId={setDragId} setDragOverCol={setDragOverCol} setSelectedTaskId={setSelectedTaskId} isMe={isMe} move={move} inLaneCount={inLaneCount} expediteLimit={data.prefs.expediteLimit} /></div>)}
        </div>
        <div className="mt-1.5 text-[13px] text-brand-navy/40">Expedite bypasses the column WIP cap (gold standard: max 1, all-hands on it).</div>
      </section>

      <div className="reveal grid grid-cols-1 gap-4 md:grid-cols-3">
        {COLUMNS.map((col) => {
          const colTasks = visible
            .filter((t) => t.status === col.key)
            .filter((t) => (col.key === 'in_progress' ? !(myOnly && t.cos === 'expedite' && expediteActive.includes(t)) : true));
          const isCapped = col.key === 'in_progress';
          const colCount = isCapped ? iProgress : colTasks.length;
          const full = isCapped && colCount >= cap;
          const isTargetDrag = dragOverCol === col.key;
          return (
            <section
              key={col.key}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOverCol(col.key);
              }}
              onDragLeave={() => setDragOverCol(null)}
              onDrop={() => {
                setDragOverCol(null);
                if (!dragId) return;
                const t = all.find((x) => x.id === dragId);
                if (!t || t.status === col.key) { setDragId(null); return; }
                if (!canCardDrop(dragId, col.key)) { alert(`WIP limit (${cap}) reached on In progress — finish or pull something else first`); setDragId(null); return; }
                move.mutate({ id: dragId, patch: { status: col.key } });
                setDragId(null);
              }}
              className={`rounded-2xl border-t-4 ${col.accent} border-x border-b p-3 min-h-40 transition-all duration-200 ${
                isTargetDrag 
                  ? 'border-brand-gold bg-brand-gold/5 shadow-md scale-[1.01]' 
                  : dragId 
                    ? 'border-dashed border-brand-navy/20 bg-brand-navy/[0.01]' 
                    : 'border-brand-navy/10 bg-white'
              }`}
            >
              <div className="flex items-center justify-between px-1 pb-2">
                <span className="text-[13px] font-bold uppercase tracking-widest text-brand-navy/40">{col.label}</span>
                <span className={`rounded-full px-2 py-0.5 text-[13px] font-bold ${full ? 'bg-rose-500/15 text-rose-700' : 'bg-brand-navy/[0.05] text-brand-navy/50'}`}>
                  {isCapped ? `${colCount}/${cap}` : colCount}
                </span>
              </div>
              {isCapped && full && (
                <div className="mb-2 rounded-lg border border-rose-500/40 bg-rose-500/10 px-2 py-1 text-[13px] font-bold text-rose-700">WIP cap reached — finish before starting (expedite excepted)</div>
              )}
              <div className="space-y-2">
                {colTasks.map((t) => <Card key={t.id} t={t} nowS={nowS} dragId={dragId} setDragId={setDragId} setDragOverCol={setDragOverCol} setSelectedTaskId={setSelectedTaskId} isMe={isMe} move={move} inLaneCount={inLaneCount} expediteLimit={data.prefs.expediteLimit} />)}
                {colTasks.length === 0 && <div className="rounded-xl border border-dashed border-brand-navy/15 py-6 text-center text-[13px] text-brand-navy/50">Drop tasks here</div>}
              </div>
            </section>
          );
        })}
      </div>

      {/* OVERLAY & PREVIEW DRAWER */}
      {selectedTask && (
        <>
          <div 
            onClick={() => setSelectedTaskId(null)}
            className="fixed inset-0 bg-brand-navy/50 z-40 transition-opacity"
          ></div>
          
          <aside className="fixed top-0 right-0 h-full w-96 bg-white shadow-2xl z-50 p-8 flex flex-col justify-between border-l border-brand-navy/10 transition-transform duration-300 overflow-y-auto">
            <div className="flex flex-col gap-6 text-brand-navy">
              <div className="flex justify-between items-start border-b border-brand-navy/10 pb-4">
                <div>
                  <span className="text-xs font-bold text-brand-gold uppercase tracking-widest">Task Details</span>
                  <h3 className="font-display font-extrabold text-sm text-brand-navy mt-1 truncate max-w-[200px]" title={selectedTask.title}>{selectedTask.title}</h3>
                  <p className="text-xs text-brand-navy/40 mt-0.5">Task ID: <span className="font-mono text-brand-navy font-semibold">{selectedTask.id.slice(0, 8)}</span></p>
                </div>
                <button 
                  onClick={() => setSelectedTaskId(null)}
                  className="w-6 h-6 rounded-full hover:bg-brand-navy/[0.06] text-brand-navy/40 hover:text-brand-navy flex items-center justify-center transition"
                >
                  ✕
                </button>
              </div>

              {/* Task Fields & Controls */}
              <div className="space-y-4">
                {/* Editable Title */}
                <div className="flex flex-col gap-1 py-1 border-b border-brand-navy/[0.08]">
                  <label className="text-xs uppercase text-brand-navy/40 font-bold">Task Title</label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onBlur={() => {
                      if (editTitle.trim() && editTitle.trim() !== selectedTask.title) {
                        move.mutate({ id: selectedTask.id, patch: { title: editTitle.trim() } });
                      }
                    }}
                    className="text-xs border border-brand-navy/10 rounded px-2.5 py-1.5 w-full bg-white text-brand-navy font-semibold focus:outline-none focus:ring-1 focus:ring-brand-gold"
                  />
                </div>

                {/* Editable Description */}
                <div className="flex flex-col gap-1 py-1 border-b border-brand-navy/[0.08]">
                  <label className="text-xs uppercase text-brand-navy/40 font-bold">Description</label>
                  <textarea
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    onBlur={() => {
                      if (editDesc.trim() !== (selectedTask.description || '')) {
                        move.mutate({ id: selectedTask.id, patch: { description: editDesc.trim() } });
                      }
                    }}
                    placeholder="Enter task details..."
                    rows={3}
                    className="text-xs border border-brand-navy/10 rounded px-2.5 py-1.5 w-full bg-white text-brand-navy focus:outline-none focus:ring-1 focus:ring-brand-gold"
                  />
                </div>

                {/* Priority Selector */}
                <div className="flex justify-between items-center text-xs py-2 border-b border-brand-navy/[0.08]">
                  <span className="text-brand-navy/40 font-semibold">Priority</span>
                  <select
                    value={selectedTask.priority}
                    onChange={(e) => {
                      move.mutate({ id: selectedTask.id, patch: { priority: e.target.value } });
                    }}
                    className="text-xs border border-brand-navy/10 rounded px-2 py-1 bg-white text-brand-navy font-bold focus:outline-none focus:ring-brand-gold"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                    <option value="urgent">Urgent</option>
                  </select>
                </div>

                {/* Class of Service (COS) */}
                <div className="flex justify-between items-center text-xs py-2 border-b border-brand-navy/[0.08]">
                  <span className="text-brand-navy/40 font-semibold">Class of Service</span>
                  <select
                    value={selectedTask.cos}
                    onChange={(e) => {
                      move.mutate({ id: selectedTask.id, patch: { cos: e.target.value } });
                    }}
                    className="text-xs border border-brand-navy/10 rounded px-2 py-1 bg-white text-brand-navy font-bold focus:outline-none focus:ring-brand-gold"
                  >
                    <option value="standard">Standard</option>
                    <option value="fixed_date">Fixed-Date</option>
                    <option value="expedite">Expedite ⚡</option>
                  </select>
                </div>

                {/* Status Column selector */}
                <div className="flex justify-between items-center text-xs py-2 border-b border-brand-navy/[0.08]">
                  <span className="text-brand-navy/40 font-semibold">Status / Column</span>
                  <select
                    value={selectedTask.status}
                    onChange={(e) => {
                      move.mutate({ id: selectedTask.id, patch: { status: e.target.value } });
                    }}
                    className="text-xs border border-brand-navy/10 rounded px-2 py-1 bg-white text-brand-navy font-bold focus:outline-none focus:ring-brand-gold"
                  >
                    <option value="open">Open</option>
                    <option value="in_progress">In Progress</option>
                    <option value="done">Done</option>
                  </select>
                </div>

                {/* Assignee Selector */}
                <div className="flex justify-between items-center text-xs py-2 border-b border-brand-navy/[0.08]">
                  <span className="text-brand-navy/40 font-semibold">Assign To</span>
                  <select
                    value={selectedTask.assigneeId || ''}
                    onChange={(e) => {
                      const val = e.target.value || null;
                      move.mutate({ id: selectedTask.id, patch: { assigneeId: val } });
                    }}
                    className="text-xs border border-brand-navy/10 rounded px-2 py-1 bg-white text-brand-navy font-bold focus:outline-none focus:ring-brand-gold max-w-[150px]"
                  >
                    <option value="">Unassigned</option>
                    {directory?.staff.map((s) => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </select>
                </div>

                {/* Due Date Editor */}
                <div className="flex justify-between items-center text-xs py-2 border-b border-brand-navy/[0.08]">
                  <span className="text-brand-navy/40 font-semibold">Due Date</span>
                  <input
                    type="date"
                    value={editDue}
                    onChange={(e) => setEditDue(e.target.value)}
                    onBlur={() => {
                      const ts = editDue ? Math.floor(new Date(editDue).getTime() / 1000) : null;
                      if (ts !== selectedTask.dueDate) {
                        move.mutate({ id: selectedTask.id, patch: { dueDate: ts } });
                      }
                    }}
                    className="text-xs border border-brand-navy/10 rounded px-2 py-1 bg-white text-brand-navy font-bold focus:outline-none focus:ring-brand-gold"
                  />
                </div>
              </div>

              {/* Danger Zone */}
              <div className="space-y-2 border rounded-xl border-rose-200 bg-rose-50/20 p-4 mt-2">
                <h4 className="text-xs font-bold text-rose-800 uppercase tracking-wider">Danger Zone</h4>
                <p className="text-xs text-rose-700/80">Permanently delete this operation task from the database. This cannot be undone.</p>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`Are you sure you want to permanently delete the task "${selectedTask.title}"?`)) {
                      deleteTaskMutation.mutate({ taskId: selectedTask.id });
                    }
                  }}
                  className="w-full bg-rose-650 hover:bg-rose-700 text-white py-2 rounded text-[13px] font-bold uppercase tracking-wider transition cursor-pointer"
                >
                  Delete Task Completely
                </button>
              </div>
            </div>
          </aside>
        </>
      )}

      {showCreate && (
        <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-brand-navy/10 bg-white p-4">
          <input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} placeholder="Task title — e.g. Follow up on College of the Rockies offer" className="min-w-72 flex-1 rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-xs text-brand-navy placeholder:text-brand-navy/40 focus:border-brand-gold focus:outline-none" />
          <select value={form.priority} onChange={(e) => setForm({ ...form, priority: e.target.value as any })} className="rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-xs text-brand-navy focus:border-brand-gold focus:outline-none">
            <option value="low" className="bg-white">Low</option><option value="medium" className="bg-white">Medium</option><option value="high" className="bg-white">High</option><option value="urgent" className="bg-white">Urgent</option>
          </select>
          <select value={form.cos} onChange={(e) => setForm({ ...form, cos: e.target.value as any })} className="rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-xs text-brand-navy focus:border-brand-gold focus:outline-none">
            <option value="standard" className="bg-white">Standard</option><option value="fixed_date" className="bg-white">Fixed-date</option><option value="expedite" className="bg-white">Expedite ⚡</option>
          </select>
          <input type="date" value={form.due} onChange={(e) => setForm({ ...form, due: e.target.value })} className="rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-xs text-brand-navy focus:border-brand-gold focus:outline-none" />
          <select value={form.assigneeId} onChange={(e) => setForm({ ...form, assigneeId: e.target.value })} className="rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-xs text-brand-navy focus:border-brand-gold focus:outline-none">
            <option value="" className="bg-white">Unassigned</option>
            {directory?.staff.map((s) => <option key={s.id} value={s.id} className="bg-white">{s.name}{me?.id === s.id ? ' (me)' : ''}</option>)}
          </select>
          <button onClick={() => create.mutate()} disabled={create.isPending || form.title.trim().length < 2} className="rounded-full bg-brand-gold px-4 py-2 text-sm font-bold uppercase text-brand-navy hover:bg-brand-gold/90 disabled:opacity-40">
            {create.isPending ? 'Creating…' : 'Create task'}
          </button>
        </div>
      )}

      {showSettings && isManager && (
        <div className="rounded-2xl border border-brand-navy/10 bg-white p-4 space-y-3">
          <div className="text-[13px] font-bold uppercase tracking-widest text-brand-navy/40">System settings (audited — experiment trail: change, observe 2 weeks, adjust on data)</div>
          <div className="grid grid-cols-3 gap-3">
            <label className="text-sm text-brand-navy/40">In-progress WIP cap
              <input type="number" min={1} max={20} value={settings.columnLimitInProgress} onChange={(e) => setSettings({ ...settings, columnLimitInProgress: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-xs text-brand-navy focus:border-brand-gold focus:outline-none" />
            </label>
            <label className="text-sm text-brand-navy/40">Person WIP cap (soft)
              <input type="number" min={1} max={10} value={settings.personLimitInProgress} onChange={(e) => setSettings({ ...settings, personLimitInProgress: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-xs text-brand-navy focus:border-brand-gold focus:outline-none" />
            </label>
            <label className="text-sm text-brand-navy/40">Expedite lane cap
              <input type="number" min={1} max={5} value={settings.expediteLimit} onChange={(e) => setSettings({ ...settings, expediteLimit: Number(e.target.value) })} className="mt-1 w-full rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-xs text-brand-navy focus:border-brand-gold focus:outline-none" />
            </label>
          </div>
          <textarea value={settings.policyText} onChange={(e) => setSettings({ ...settings, policyText: e.target.value })} rows={3} className="w-full rounded-lg border border-brand-navy/10 bg-white px-3 py-2 text-xs text-brand-navy placeholder:text-brand-navy/40 focus:border-brand-gold focus:outline-none" />
          <button onClick={() => savePrefs.mutate()} disabled={savePrefs.isPending} className="rounded-full bg-brand-gold px-4 py-2 text-sm font-extrabold uppercase text-brand-navy hover:bg-brand-gold/90">
            {savePrefs.isPending ? 'Saving…' : 'Save settings'}
          </button>
        </div>
      )}
    </div>
  );
}