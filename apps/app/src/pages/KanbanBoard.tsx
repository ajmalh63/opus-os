import React, { useState, useEffect } from 'react';
import { Link } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import BoardsTab from '../components/BoardsTab.js';

const divisionIcons: Record<string, string> = {
  'study-abroad': '🎓 Study Abroad',
  'visa': '🛂 Visa Prep',
  'umrah': '🧳 Tours & Travels',
  'attestation': '📜 Attestation',
  'manpower': '💼 Manpower',
};

interface Card {
  id: string;
  clientId: string;
  division: string;
  title: string;
  stageKey: string;
  outstandingBalance: number;
  status: string;
  counselorId: string | null;
  clientName: string;
  tasks?: CardTask[];
}

interface CardTask {
  id: string;
  title: string;
  priority: string;
  status: string;
  assigneeId: string | null;
  dueDate: number | null;
}

interface Column {
  id: string;
  key: string;
  name: string;
  sequence: number;
  wipLimit: number | null;
  cards: Card[];
}

export default function KanbanBoard() {
  const queryClient = useQueryClient();
  const [toast, setToast] = useState<{ show: boolean; msg: string }>({ show: false, msg: '' });
  const showToast = (msg: string) => {
    setToast({ show: true, msg });
    setTimeout(() => setToast({ show: false, msg: '' }), 3500);
  };

  const [boardType, setBoardType] = useState<'pipeline' | 'tasks'>('pipeline');
  const isPipeline = boardType === 'pipeline';
  const isTasks = boardType === 'tasks';
  // Filters State
  const [divisionFilter, setDivisionFilter] = useState('all');
  const [counselorFilter, setCounselorFilter] = useState('all');
  const [staleOnly, setStaleOnly] = useState(false);
  const [slaUrgentOnly, setSlaUrgentOnly] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  // Selected Card for Slide Preview Drawer (represented by ID to support clean cache invalidations)
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);

  // Fetch Board Columns Data
  const { data: boardData, isLoading, isError } = useQuery<{ columns: Column[] }>({
    queryKey: ['kanbanBoard'],
    queryFn: async () => {
      const res = await fetch('/api/kanban/board');
      if (!res.ok) {
        throw new Error('Failed to fetch board data');
      }
      return res.json();
    },
  });

  // Derived selected card from columns query cache (ensures automatic refresh)
  const selectedCard = boardData?.columns
    .flatMap((col) => col.cards)
    .find((card) => card.id === selectedCardId) || null;

  // Local state for editing metadata in drawer
  const [editTitle, setEditTitle] = useState('');
  const [editBalance, setEditBalance] = useState('');

  useEffect(() => {
    if (selectedCard) {
      setEditTitle(selectedCard.title || '');
      setEditBalance((selectedCard.outstandingBalance / 100).toFixed(2));
    }
  }, [selectedCard?.id, selectedCard?.title, selectedCard?.outstandingBalance]);

  // Fetch Staff list for filters & assignment dropdown
  const { data: staffData } = useQuery<{ staff: { id: string; name: string; role: string }[] }>({
    queryKey: ['staffDirectory'],
    queryFn: async () => {
      const res = await fetch('/api/tasks/staff-directory');
      if (!res.ok) throw new Error('Failed to fetch staff');
      return res.json();
    }
  });
  const staffList = staffData?.staff || [];

  // Counselor Assignment Mutation
  const assignCounselorMutation = useMutation({
    mutationFn: async (payload: { cardId: string; counselorId: string | null }) => {
      const res = await fetch(`/api/kanban/board/${payload.cardId}/counselor`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ counselorId: payload.counselorId }),
      });
      if (!res.ok) {
        throw new Error(await res.text() || 'Failed to assign counselor');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kanbanBoard'] });
      showToast('Counselor assigned successfully.');
    },
    onError: (err: any) => {
      showToast(`Error: ${err.message || 'Failed to assign counselor'}`);
    },
  });

  // Card Metadata Update Mutation
  const updateCardMetadata = useMutation({
    mutationFn: async (payload: { 
      cardId: string; 
      title?: string; 
      outstandingBalance?: number; 
      status?: 'active' | 'archived' | 'cancelled' 
    }) => {
      const res = await fetch(`/api/kanban/board/${payload.cardId}/metadata`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        throw new Error(await res.text() || 'Failed to update metadata');
      }
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['kanbanBoard'] });
      showToast('Card updated successfully.');
      if (data.status === 'archived' || data.status === 'cancelled') {
        setSelectedCardId(null);
      }
    },
    onError: (err: any) => {
      showToast(`Error: ${err.message || 'Failed to update metadata'}`);
    },
  });

  // Card Delete Mutation
  const deleteCardMutation = useMutation({
    mutationFn: async (payload: { cardId: string }) => {
      const res = await fetch(`/api/kanban/board/${payload.cardId}`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        throw new Error(await res.text() || 'Failed to delete card');
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kanbanBoard'] });
      showToast('Engagement card deleted successfully.');
      setSelectedCardId(null);
    },
    onError: (err: any) => {
      showToast(`Error: ${err.message || 'Failed to delete card'}`);
    },
  });

  // Card Move Mutation
  const moveMutation = useMutation({
    mutationFn: async (payload: { cardId: string; sourceStage: string; targetStage: string }) => {
      const res = await fetch('/api/kanban/board/move', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        throw new Error(await res.text() || 'Failed to move card');
      }
      return res.json();
    },
onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['kanbanBoard'] });
      if (data.wipLimitBreached) {
        showToast(`WIP limit warning — column reached limit of ${data.limit}.`);
      } else {
        showToast('Card moved successfully.');
      }
    },
    onError: (err: any) => {
      showToast(`Error: ${err.message || 'Failed to move card'}`);
    },
  });

  // Drag-and-Drop Handlers
  // Card Task Interlock — create a task ON the card + status toggle (plan §16)
  const [cardTaskTitle, setCardTaskTitle] = useState('');
  const addCardTask = useMutation({
    mutationFn: async () => {
      if (!selectedCard) throw new Error('no card');
      const res = await fetch(`/api/kanban/board/${selectedCard.id}/tasks`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: cardTaskTitle.trim(), priority: 'medium' }),
      });
      if (!res.ok) throw new Error(await res.text() || 'task add failed');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kanbanBoard'] });
      setCardTaskTitle('');
      showToast('Task added to card.');
    },
    onError: (e: any) => showToast((e as Error).message || 'Add failed'),
  });
  const toggleCardTask = useMutation({
    mutationFn: async ({ taskId, status }: { taskId: string; status: string }) => {
      const res = await fetch(`/api/kanban/board/tasks/${taskId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error('toggle failed');
      return res.json();
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['kanbanBoard'] }),
  });

  const deleteCardTask = useMutation({
    mutationFn: async (payload: { taskId: string }) => {
      const res = await fetch(`/api/kanban/board/tasks/${payload.taskId}`, {
        method: 'DELETE',
      });
      if (!res.ok) throw new Error(await res.text() || 'task delete failed');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kanbanBoard'] });
      showToast('Checklist task deleted.');
    },
    onError: (e: any) => showToast((e as Error).message || 'Delete failed'),
  });

  const [draggedCardId, setDraggedCardId] = useState<string | null>(null);
  const [draggedSourceStage, setDraggedSourceStage] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);
  const kanbanScrollerRef = React.useRef<HTMLDivElement>(null);
  const [kanbanIdx, setKanbanIdx] = useState(0);

  const handleDragStart = (e: React.DragEvent, cardId: string, sourceStage: string) => {
    setDraggedCardId(cardId);
    setDraggedSourceStage(sourceStage);
    e.dataTransfer.setData('text/plain', cardId);
  };

  const handleDragOver = (e: React.DragEvent, columnKey: string) => {
    e.preventDefault();
    setDragOverCol(columnKey);
  };

  const handleDragLeave = () => {
    setDragOverCol(null);
  };

  const handleDrop = (e: React.DragEvent, targetStage: string) => {
    e.preventDefault();
    setDragOverCol(null);
    const cardId = e.dataTransfer.getData('text/plain') || draggedCardId;
    if (!cardId || !draggedSourceStage) return;

    if (draggedSourceStage !== targetStage) {
      moveMutation.mutate({
        cardId,
        sourceStage: draggedSourceStage,
        targetStage,
      });
    }

    setDraggedCardId(null);
    setDraggedSourceStage(null);
  };

// Helper to filter cards locally based on UI filters
  const getFilteredCards = (cards: Card[]) => {
    return cards.filter(card => {
      // Search Query filter
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesName = card.clientName.toLowerCase().includes(q);
        const matchesId = card.clientId.toLowerCase().includes(q);
        if (!matchesName && !matchesId) return false;
      }
      // Division Filter
      if (divisionFilter !== 'all' && card.division !== divisionFilter) return false;
      // Counselor Filter
      if (counselorFilter !== 'all') {
        if (counselorFilter === 'unassigned' && card.counselorId !== null) return false;
        if (counselorFilter !== 'unassigned' && card.counselorId !== counselorFilter) return false;
      }
      // Stale aging: cards still in the lead/qualified stage or flagged by the API
      if (staleOnly) {
        const isStale = card.stageKey === 'lead' || card.stageKey === 'qualified';
        if (!isStale) return false;
      }
      // SLA Urgent / Stuck Radar Filter (tasks due in ≤3 days or unassigned/stuck in review)
      if (slaUrgentOnly) {
        const nowSec = Math.floor(Date.now() / 1000);
        const hasUrgentTask = card.tasks?.some(t => t.dueDate && t.status !== 'done' && t.dueDate - nowSec <= 3 * 86400);
        const isStuck = card.counselorId === null || card.stageKey === 'documents' || card.stageKey === 'under_review';
        if (!hasUrgentTask && !isStuck) return false;
      }
      return true;
    });
  };

  if (isLoading) {
    return <div className="p-8 text-center text-xs font-semibold text-brand-navy">Loading Kanban Board...</div>;
  }

  if (isError) {
    return <div className="p-8 text-center text-xs font-semibold text-brand-error">Failed to load board. Make sure API is running.</div>;
  }

  if (boardType === 'tasks') {
    return (
      <div className="flex h-full min-h-full w-full flex-col overflow-hidden text-brand-navy font-sans">
        <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <header className="bg-white/85 backdrop-blur-xl border-b border-brand-navy/10 py-4 px-8 flex justify-between items-center z-10 shrink-0">
            <div className="flex items-center gap-6">
              <div>
                <div className="flex items-center gap-2">
                  <span className="gold-dot" />
                  <span className="text-xs font-bold uppercase tracking-[0.2em] text-brand-gold">Operations · Staff Tasks</span>
                </div>
                <h2 className="mt-1 font-display font-extrabold text-lg text-brand-navy">Staff Operations Tasks</h2>
              </div>
              <div className="flex bg-brand-navy/[0.05] rounded-lg p-0.5 border border-brand-navy/10 text-sm font-bold self-end mb-1">
                <button
                  onClick={() => setBoardType('pipeline')}
                  className={`px-3 py-1 rounded-md transition-all cursor-pointer ${isPipeline ? 'bg-brand-gold text-brand-navy shadow-xs font-extrabold' : 'text-brand-navy/50 hover:text-brand-navy'}`}
                >
                  Clients Pipeline
                </button>
                <button
                  onClick={() => setBoardType('tasks')}
                  className={`px-3 py-1 rounded-md transition-all cursor-pointer ${isTasks ? 'bg-brand-gold text-brand-navy shadow-xs font-extrabold' : 'text-brand-navy/50 hover:text-brand-navy'}`}
                >
                  Staff Tasks Board
                </button>
              </div>
            </div>
          </header>
          <div className="flex-1 overflow-y-auto p-8 bg-transparent text-brand-navy">
            <BoardsTab />
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-full w-full flex-col overflow-hidden text-brand-navy font-sans">

      {/* MAIN CONTAINER */}
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
        
        {/* TOP FILTER BAR */}
        <header className="bg-white/85 backdrop-blur-xl border-b border-brand-navy/10 py-4 px-8 flex flex-wrap gap-4 items-center justify-between z-10 shrink-0">
          <div className="flex items-center gap-6">
            <div>
              <div className="flex items-center gap-2">
                <span className="gold-dot" />
                <span className="text-xs font-bold uppercase tracking-[0.2em] text-brand-gold">Operations · Pipeline</span>
              </div>
              <h2 className="mt-1 font-display font-extrabold text-lg text-brand-navy">Universal Pipeline Board</h2>
            </div>
            <div className="flex bg-brand-navy/[0.05] rounded-lg p-0.5 border border-brand-navy/10 text-sm font-bold self-end mb-1">
              <button
                onClick={() => setBoardType('pipeline')}
                className={`px-3 py-1 rounded-md transition-all cursor-pointer ${isPipeline ? 'bg-brand-gold text-brand-navy shadow-xs font-extrabold' : 'text-brand-navy/50 hover:text-brand-navy'}`}
              >
                Clients Pipeline
              </button>
              <button
                onClick={() => setBoardType('tasks')}
                className={`px-3 py-1 rounded-md transition-all cursor-pointer ${isTasks ? 'bg-brand-gold text-brand-navy shadow-xs font-extrabold' : 'text-brand-navy/50 hover:text-brand-navy'}`}
              >
                Staff Tasks Board
              </button>
            </div>
          </div>

          <div className="flex items-center gap-4 flex-wrap">
            {/* Realtime Search Bar */}
            <div className="min-w-[200px]">
              <label className="text-xs uppercase text-brand-navy/40 font-semibold block mb-0.5">Search Candidate</label>
              <input
                type="text"
                placeholder="Search name or ID..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="text-xs border border-brand-navy/10 rounded px-2.5 py-1.5 w-full bg-white text-brand-navy font-medium focus:outline-none focus:ring-1 focus:ring-brand-gold placeholder:text-brand-navy/30"
              />
            </div>

            {/* Division Select */}
            <div>
              <label className="text-xs uppercase text-brand-navy/40 font-semibold block mb-0.5">Division</label>
              <select 
                value={divisionFilter}
                onChange={(e) => setDivisionFilter(e.target.value)}
                className="text-xs border border-brand-navy/10 rounded px-2.5 py-1.5 bg-white text-brand-navy font-medium focus:outline-none focus:ring-1 focus:ring-brand-gold [&>option]:bg-white"
              >
                <option value="all">All Divisions</option>
                <option value="study-abroad">Study Abroad</option>
                <option value="visa">Visa Services</option>
                <option value="attestation">Attestation</option>
                <option value="umrah">Tours &amp; Travels</option>
                <option value="manpower">Manpower Recruitment</option>
              </select>
            </div>

            {/* Counselor Select */}
            <div>
              <label className="text-xs uppercase text-brand-navy/40 font-semibold block mb-0.5">Counselor</label>
              <select 
                value={counselorFilter}
                onChange={(e) => setCounselorFilter(e.target.value)}
                className="text-xs border border-brand-navy/10 rounded px-2.5 py-1.5 bg-white text-brand-navy font-medium focus:outline-none focus:ring-1 focus:ring-brand-gold [&>option]:bg-white"
              >
                <option value="all">All Staff</option>
                <option value="unassigned">Unassigned</option>
                {staffList.map((s) => (
                  <option key={s.id} value={s.id}>{s.name} ({s.role.toUpperCase()})</option>
                ))}
              </select>
            </div>

            {/* Stale Aging Toggle */}
            <div className="flex items-center gap-2 select-none self-end pb-1.5">
              <input 
                type="checkbox" 
                id="agingFilter" 
                checked={staleOnly}
                onChange={(e) => setStaleOnly(e.target.checked)}
                className="rounded border-brand-navy/20 text-brand-gold focus:ring-brand-gold"
              />
              <label htmlFor="agingFilter" className="text-xs font-semibold text-brand-error flex items-center gap-1 cursor-pointer">
                <span className="w-2.5 h-2.5 rounded-full bg-brand-error animate-pulse"></span>
                Show Stale (&gt;48h)
              </label>
            </div>

            {/* SLA Urgent / Stuck Radar Toggle */}
            <div className="flex items-center gap-2 select-none self-end pb-1.5">
              <input 
                type="checkbox" 
                id="slaUrgentFilter" 
                checked={slaUrgentOnly}
                onChange={(e) => setSlaUrgentOnly(e.target.checked)}
                className="rounded border-brand-navy/20 text-brand-gold focus:ring-brand-gold"
              />
              <label htmlFor="slaUrgentFilter" className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-300 px-2 py-0.5 rounded-full flex items-center gap-1.5 cursor-pointer shadow-2xs">
                <span>🔥 SLA Radar (≤3d / Stuck)</span>
              </label>
            </div>
          </div>
        </header>

        {/* Mobile swipe hint for kanban */}
        <div className="md:hidden px-5 pt-3 flex items-center justify-between">
          <span className="inline-flex items-center gap-1.5 text-[13px] font-bold uppercase tracking-wider text-brand-navy/40">
            <span className="w-4 h-0.5 bg-brand-gold/30 rounded-full" /> Swipe columns <span className="animate-pulse">→</span>
          </span>
          <div className="flex items-center gap-1.5">
            {(boardData?.columns || []).map((_, i) => (
              <span key={i} className={`h-1.5 rounded-full transition-all ${i === kanbanIdx ? 'w-5 bg-brand-gold' : 'w-1.5 bg-brand-navy/15'}`} />
            ))}
          </div>
        </div>

        {/* KANBAN COLUMNS BODY */}
        <div
          ref={kanbanScrollerRef}
          className="flex-1 overflow-x-auto p-4 md:p-8 flex gap-4 md:gap-6 items-start snap-x snap-mandatory md:snap-none scroll-smooth"
          style={{ WebkitOverflowScrolling: 'touch', perspective: '1200px' } as any}
          onScroll={() => {
            const el = kanbanScrollerRef.current;
            if (!el) return;
            const center = el.getBoundingClientRect().left + el.getBoundingClientRect().width / 2;
            let closest = 0; let min = Infinity;
            el.querySelectorAll<HTMLElement>('.kanban-col').forEach((col, idx) => {
              const r = col.getBoundingClientRect();
              const c = r.left + r.width / 2;
              const d = Math.abs(c - center);
              if (d < min) { min = d; closest = idx; }
              if (window.innerWidth < 768 && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
                const dist = (c - center) / el.getBoundingClientRect().width;
                const rotateY = dist * -12;
                const scale = 1 - Math.abs(dist) * 0.06;
                col.style.transform = `perspective(800px) rotateY(${rotateY}deg) scale(${scale})`;
                col.style.opacity = String(Math.max(0.9, 1 - Math.abs(dist) * 0.12));
              }
            });
            setKanbanIdx(closest);
          }}
        >
          {boardData?.columns.map((column) => {
            const filteredCards = getFilteredCards(column.cards);
            const isTargetDrag = dragOverCol === column.key;
            const isWipViolated = column.wipLimit !== null && filteredCards.length > column.wipLimit;
            const totalBalance = filteredCards.reduce((sum, c) => sum + c.outstandingBalance, 0);

            return (
              <div 
                key={column.key}
                onDragOver={(e) => handleDragOver(e, column.key)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, column.key)}
                className={`kanban-col w-[82vw] md:w-72 snap-center md:snap-align-none bg-brand-navy/[0.04] border rounded-xl flex flex-col shrink-0 overflow-hidden shadow-sm transition-all duration-200 will-change-transform ${
                  isTargetDrag 
                    ? 'border-brand-gold bg-brand-gold/5 shadow-md scale-[1.01]' 
                    : draggedCardId 
                      ? 'border-dashed border-brand-navy/20 bg-brand-navy/[0.02]' 
                      : 'border-brand-navy/10'
                }`}
                style={{ transformStyle: 'preserve-3d' } as any}
              >
                {/* Column Header */}
                <div className={`p-4 border-b flex justify-between items-center transition ${
                  isWipViolated ? 'bg-red-500/15 border-brand-error' : 'bg-brand-navy/[0.03] border-brand-navy/[0.08]'
                }`}>
                  <div className="flex flex-col">
                    <span className="font-display font-bold text-xs text-brand-navy uppercase tracking-wider">{column.name}</span>
                    <div className="flex items-center gap-1.5 mt-0.5 text-xs text-brand-navy/40 font-bold uppercase">
                      {column.wipLimit && (
                        <span>Limit: {column.wipLimit} |</span>
                      )}
                      <span className="text-brand-gold font-mono">₹{(totalBalance / 100).toFixed(2)}</span>
                    </div>
                  </div>
                  <span className={`px-2 py-0.5 text-[13px] rounded font-bold ${
                    isWipViolated ? 'bg-brand-error text-white animate-bounce' : 'bg-brand-gold text-brand-navy'
                  }`}>
                    {filteredCards.length}
                  </span>
                </div>

                {/* Cards Container */}
                <div className="p-3 space-y-3 overflow-y-auto kanban-column flex-1">
                  {filteredCards.map((card) => {
                    const hasBlocker = card.counselorId === null;
                    const tasksDone = card.tasks?.filter(t => t.status === 'done').length || 0;
                    const totalTasks = card.tasks?.length || 0;
                    const progressPercent = totalTasks > 0 ? Math.round((tasksDone / totalTasks) * 100) : 0;

                    return (
                      <div
                        key={card.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, card.id, column.key)}
                        onClick={() => setSelectedCardId(card.id)}
                        className={`bg-white p-4 rounded-lg border shadow-sm hover:shadow-md hover:border-brand-gold transition duration-200 cursor-grab active:cursor-grabbing flex flex-col gap-3 select-none ${
                          hasBlocker ? 'border-l-4 border-l-brand-error' : 'border-brand-navy/10'
                        }`}
                      >
                        <div className="flex justify-between items-start gap-1">
                          <span className="text-xs font-bold text-brand-gold uppercase tracking-wider bg-brand-gold/10 px-1.5 py-0.5 rounded truncate max-w-[150px]">
                            {divisionIcons[card.division] || card.division}
                          </span>
                          <div className="flex items-center gap-1">
                            {(() => {
                              const nowSec = Math.floor(Date.now() / 1000);
                              const urgentTask = card.tasks?.find(t => t.dueDate && t.status !== 'done' && t.dueDate - nowSec <= 3 * 86400);
                              if (urgentTask && urgentTask.dueDate) {
                                const daysLeft = Math.max(0, Math.ceil((urgentTask.dueDate - nowSec) / 86400));
                                return (
                                  <span className="text-sm bg-red-100 text-red-900 border border-red-300 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider animate-pulse flex items-center gap-0.5 shrink-0">
                                    <span>🔥 {daysLeft === 0 ? 'Due Today' : `Due in ${daysLeft}d`}</span>
                                  </span>
                                );
                              }
                              return null;
                            })()}
                            {hasBlocker ? (
                              <span className="text-sm bg-rose-50 text-brand-error px-1.5 py-0.5 border border-rose-200 rounded font-bold uppercase tracking-wider animate-pulse flex items-center shrink-0">
                                ⚠️ Unassigned
                              </span>
                            ) : (
                              <span className="text-sm bg-slate-50 text-slate-500 px-1.5 py-0.5 border border-slate-200 rounded font-semibold uppercase tracking-wider shrink-0">
                                Assigned
                              </span>
                            )}
                          </div>
                        </div>

                        <div>
                          <h4 className="text-xs font-bold text-brand-navy truncate hover:text-brand-gold transition">{card.clientName}</h4>
                          <p className="text-xs text-brand-navy/40 mt-0.5 font-mono">ID: {card.clientId}</p>
                        </div>

                        {/* Task progress bar directly on the card */}
                        {totalTasks > 0 && (
                          <div className="space-y-1">
                            <div className="flex justify-between text-sm text-brand-navy/40 font-bold uppercase">
                              <span>Tasks progress</span>
                              <span>{tasksDone}/{totalTasks} ({progressPercent}%)</span>
                            </div>
                            <div className="w-full bg-brand-navy/5 h-1 rounded-full overflow-hidden border border-brand-navy/5">
                              <div 
                                className="bg-emerald-500 h-full rounded-full transition-all duration-300"
                                style={{ width: `${progressPercent}%` }}
                              />
                            </div>
                          </div>
                        )}

                        <div className="flex justify-between items-center text-[13px] text-brand-navy/40 pt-2 border-t border-brand-navy/[0.08]">
                          <span className="font-mono">Bal: ₹{(card.outstandingBalance / 100).toFixed(2)}</span>
                          <span className="font-semibold text-brand-gold hover:underline text-xs cursor-pointer">
                            View details →
                          </span>
                        </div>
                      </div>
                    );
                  })}

                  {filteredCards.length === 0 && (
                    <div className="p-8 text-center text-[13px] text-brand-navy/40 border border-dashed border-brand-navy/10 rounded-lg bg-white/50">
                      No Active Cards
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </main>

      {/* OVERLAY & PREVIEW DRAWER */}
      {selectedCard && (
        <>
          <div 
            onClick={() => setSelectedCardId(null)}
            className="fixed inset-0 bg-brand-navy/50 z-40 transition-opacity"
          ></div>
          
          <aside className="fixed top-0 right-0 h-full w-96 bg-white shadow-2xl z-50 p-8 flex flex-col justify-between border-l border-brand-navy/10 transition-transform duration-300 overflow-y-auto">
            <div className="flex flex-col gap-6">
              <div className="flex justify-between items-start border-b border-brand-navy/10 pb-4">
                <div>
                  <span className="text-xs font-bold text-brand-gold uppercase tracking-widest">Detail Preview</span>
                  <h3 className="font-display font-extrabold text-lg text-brand-navy mt-1">{selectedCard.clientName}</h3>
                  <p className="text-[13px] text-brand-navy/40 mt-0.5">Application Token: <span className="font-mono text-brand-navy font-semibold">{selectedCard.clientId}</span></p>
                </div>
                <button 
                  onClick={() => setSelectedCardId(null)}
                  className="w-6 h-6 rounded-full hover:bg-brand-navy/[0.06] text-brand-navy/40 hover:text-brand-navy flex items-center justify-center transition"
                >
                  ✕
                </button>
              </div>

              {/* CARD TASK LANE — engagement-bound work items */}
              <div className="space-y-3 border rounded-xl border-brand-navy/10 bg-brand-navy/[0.04] p-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold text-brand-navy uppercase tracking-wider">Card Tasks</h4>
                  <span className="text-xs text-brand-navy/40">linked to this card</span>
                </div>
                <div className="space-y-1.5 max-h-48 overflow-y-auto">
                  {(selectedCard.tasks || []).length === 0 && (
                    <p className="text-[13px] text-brand-navy/40 text-center py-2">No tasks on this card yet.</p>
                  )}
                  {selectedCard.tasks?.map((t) => (
                    <div key={t.id} className="flex items-center gap-2 bg-brand-navy/[0.04] border border-brand-navy/10 rounded-lg px-2.5 py-2 text-[13px]">
                      <span className={`w-2 h-2 rounded-full shrink-0 ${t.status === 'done' ? 'bg-emerald-500' : t.status === 'in_progress' ? 'bg-brand-gold' : 'bg-brand-navy/[0.08]'}`} />
                      <span className={`flex-1 truncate ${t.status === 'done' ? 'line-through text-brand-navy/40' : 'text-brand-navy font-medium'}`} title={t.title}>{t.title}</span>
                      <div className="flex gap-2 shrink-0">
                        <button
                          onClick={() => toggleCardTask.mutate({ taskId: t.id, status: t.status === 'done' ? 'open' : t.status === 'in_progress' ? 'done' : 'in_progress' })}
                          className="text-sm font-bold uppercase tracking-wider text-brand-gold hover:underline cursor-pointer"
                        >
                          {t.status === 'done' ? 'Reopen' : 'Complete'}
                        </button>
                        <button
                          onClick={() => {
                            if (confirm('Delete this checklist task?')) {
                              deleteCardTask.mutate({ taskId: t.id });
                            }
                          }}
                          className="text-sm font-bold uppercase tracking-wider text-rose-600 hover:underline cursor-pointer"
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <form onSubmit={(e) => { e.preventDefault(); if (cardTaskTitle.trim()) addCardTask.mutate(undefined, { onSuccess: () => setCardTaskTitle('') }); }} className="flex gap-2">
                  <input
                    value={cardTaskTitle}
                    onChange={(e) => setCardTaskTitle(e.target.value)}
                    placeholder="Add a task…"
                    className="flex-1 bg-white border border-brand-navy/10 rounded px-2.5 py-2 text-[13px] text-brand-navy placeholder:text-brand-navy/40 focus:border-brand-gold focus:outline-none"
                  />
                  <button type="submit" disabled={addCardTask.isPending || !cardTaskTitle.trim()} className="bg-brand-gold hover:bg-brand-goldHover text-brand-navy px-3 rounded text-[13px] font-bold uppercase disabled:opacity-40 cursor-pointer">
                    Add
                  </button>
                </form>
              </div>

              {/* Specs List & Controls */}
              <div className="space-y-4">
                {/* Editable Engagement Title */}
                <div className="flex flex-col gap-1 py-1.5 border-b border-brand-navy/[0.08]">
                  <label className="text-[13px] uppercase text-brand-navy/40 font-bold">Engagement Title</label>
                  <input
                    type="text"
                    value={editTitle}
                    onChange={(e) => setEditTitle(e.target.value)}
                    onBlur={() => {
                      if (editTitle.trim() && editTitle !== selectedCard.title) {
                        updateCardMetadata.mutate({ cardId: selectedCard.id, title: editTitle.trim() });
                      }
                    }}
                    className="text-xs border border-brand-navy/10 rounded px-2.5 py-1.5 w-full bg-white text-brand-navy font-semibold focus:outline-none focus:ring-1 focus:ring-brand-gold"
                  />
                </div>

                {/* Editable Outstanding Balance */}
                <div className="flex flex-col gap-1 py-1.5 border-b border-brand-navy/[0.08]">
                  <label className="text-[13px] uppercase text-brand-navy/40 font-bold">Outstanding Balance (₹)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={editBalance}
                    onChange={(e) => setEditBalance(e.target.value)}
                    onBlur={() => {
                      const val = parseFloat(editBalance);
                      if (!isNaN(val)) {
                        const balanceInPaise = Math.round(val * 100);
                        if (balanceInPaise !== selectedCard.outstandingBalance) {
                          updateCardMetadata.mutate({ cardId: selectedCard.id, outstandingBalance: balanceInPaise });
                        }
                      }
                    }}
                    className="text-xs border border-brand-navy/10 rounded px-2.5 py-1.5 w-full bg-white text-brand-navy font-mono font-bold focus:outline-none focus:ring-1 focus:ring-brand-gold"
                  />
                </div>

                {/* Service Division */}
                <div className="flex justify-between items-center text-xs py-2 border-b border-brand-navy/[0.08]">
                  <span className="text-brand-navy/40 font-semibold">Service Division</span>
                  <span className="font-bold text-brand-navy uppercase text-[13px] bg-brand-gold/10 px-1.5 py-0.5 rounded">
                    {divisionIcons[selectedCard.division] || selectedCard.division}
                  </span>
                </div>

                {/* Move Stage Selector */}
                <div className="flex flex-col gap-1.5 py-2 border-b border-brand-navy/[0.08]">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-brand-navy/40 font-semibold">Stage Position</span>
                    <select
                      value={selectedCard.stageKey}
                      onChange={(e) => {
                        moveMutation.mutate({
                          cardId: selectedCard.id,
                          sourceStage: selectedCard.stageKey,
                          targetStage: e.target.value,
                        });
                      }}
                      className="text-xs border border-brand-navy/10 rounded px-2 py-1 bg-white text-brand-navy font-bold focus:outline-none focus:ring-brand-gold"
                    >
                      {boardData?.columns.map((col) => (
                        <option key={col.key} value={col.key}>{col.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Counselor Selector */}
                <div className="flex flex-col gap-1.5 py-2 border-b border-brand-navy/[0.08]">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-brand-navy/40 font-semibold">Counselor Assignment</span>
                    <select
                      value={selectedCard.counselorId || ''}
                      onChange={(e) => {
                        const val = e.target.value || null;
                        assignCounselorMutation.mutate({ cardId: selectedCard.id, counselorId: val });
                      }}
                      className="text-xs border border-brand-navy/10 rounded px-2 py-1 bg-white text-brand-navy font-bold focus:outline-none focus:ring-brand-gold"
                    >
                      <option value="">Unassigned</option>
                      {staffList.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Engagement Status Dropdown */}
                <div className="flex flex-col gap-1.5 py-2 border-b border-brand-navy/[0.08]">
                  <div className="flex justify-between items-center text-xs">
                    <span className="text-brand-navy/40 font-semibold">Engagement Status</span>
                    <select
                      value={selectedCard.status}
                      onChange={(e) => {
                        const val = e.target.value as 'active' | 'archived' | 'cancelled';
                        updateCardMetadata.mutate({ cardId: selectedCard.id, status: val });
                      }}
                      className={`text-xs border rounded px-2 py-1 bg-white font-bold focus:outline-none focus:ring-brand-gold ${
                        selectedCard.status === 'active' 
                          ? 'text-emerald-700 border-emerald-250 bg-emerald-50/20' 
                          : selectedCard.status === 'cancelled'
                            ? 'text-rose-700 border-rose-250 bg-rose-50/20'
                            : 'text-slate-750 border-slate-250 bg-slate-50/20'
                      }`}
                    >
                      <option value="active">Active</option>
                      <option value="cancelled">Cancelled</option>
                      <option value="archived">Archived</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Danger Zone */}
              <div className="space-y-2 border rounded-xl border-rose-200 bg-rose-50/20 p-4 mt-2">
                <h4 className="text-xs font-bold text-rose-800 uppercase tracking-wider">Danger Zone</h4>
                <p className="text-xs text-rose-700/80">Permanently delete this engagement tracking card from the system database. This cannot be undone.</p>
                <button
                  type="button"
                  onClick={() => {
                    if (confirm(`Are you sure you want to permanently delete the engagement card for "${selectedCard.clientName}"? This will clear all its tracking metadata and linked tasks.`)) {
                      deleteCardMutation.mutate({ cardId: selectedCard.id });
                    }
                  }}
                  className="w-full bg-rose-650 hover:bg-rose-700 text-white py-2 rounded text-[13px] font-bold uppercase tracking-wider transition cursor-pointer"
                >
                  Delete Card Completely
                </button>
              </div>
            </div>

            {/* Profile Action Link */}
            <div className="pt-6 border-t border-brand-navy/10 mt-6">
              <Link href={`/clients/${selectedCard.clientId}`}>
                <span className="w-full bg-brand-navy hover:bg-brand-navyLight text-brand-navy py-2.5 rounded text-xs font-bold uppercase tracking-wider block text-center transition cursor-pointer shadow hover:shadow-md">
                  Open Client 360 Profile
                </span>
              </Link>
            </div>
          </aside>
        </>
      )}

      {/* TOAST SYSTEM */}
      <div 
        className={`fixed right-6 bottom-6 bg-brand-navy border-l-4 border-brand-gold text-brand-navy text-xs px-4 py-3 rounded-lg shadow-xl transition duration-300 z-50 flex items-center gap-2 ${
          toast.show ? 'translate-y-0 opacity-100' : 'translate-y-24 opacity-0'
        }`}
      >
        <span className="font-bold text-brand-gold">KANBAN BOARD:</span>
        <span>{toast.msg}</span>
      </div>
    </div>
  );
}
