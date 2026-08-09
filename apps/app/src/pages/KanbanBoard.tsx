import React, { useState } from 'react';
import { Link } from 'wouter';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

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

  // Filters State
  const [divisionFilter, setDivisionFilter] = useState('all');
  const [counselorFilter, setCounselorFilter] = useState('all');
  const [staleOnly, setStaleOnly] = useState(false);

  // Selected Card for Slide Preview Drawer
  const [selectedCard, setSelectedCard] = useState<Card | null>(null);

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
        showToast(`âš ï¸ WIP Limit Warning! Column reached limit of ${data.limit}.`);
      } else {
        showToast('Card moved successfully.');
      }
    },
    onError: (err: any) => {
      showToast(`Error: ${err.message || 'Failed to move card'}`);
    },
  });

  // Drag-and-Drop Handlers
  const [draggedCardId, setDraggedCardId] = useState<string | null>(null);
  const [draggedSourceStage, setDraggedSourceStage] = useState<string | null>(null);
  const [dragOverCol, setDragOverCol] = useState<string | null>(null);

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
      return true;
    });
  };

  if (isLoading) {
    return <div className="p-8 text-center text-xs font-semibold text-brand-navy">Loading Kanban Board...</div>;
  }

  if (isError) {
    return <div className="p-8 text-center text-xs font-semibold text-brand-error">Failed to load board. Make sure API is running.</div>;
  }

  return (
    <div className="flex h-full min-h-full w-full flex-col overflow-hidden text-brand-textDark font-sans">

      {/* MAIN CONTAINER */}
      <main className="flex-1 flex flex-col min-h-0 overflow-hidden">
        
        {/* TOP FILTER BAR */}
        <header className="bg-white border-b border-gray-200 py-4 px-8 flex flex-wrap gap-4 items-center justify-between z-10 shrink-0">
          <div className="flex items-center gap-4">
            <h2 className="font-display font-bold text-lg text-brand-navy">Universal Pipeline Board</h2>
          </div>

          <div className="flex items-center gap-3 flex-wrap">
            {/* Division Select */}
            <div>
              <label className="text-[9px] uppercase text-brand-textLight font-semibold block mb-0.5">Division</label>
              <select 
                value={divisionFilter}
                onChange={(e) => setDivisionFilter(e.target.value)}
                className="text-xs border border-gray-300 rounded px-2.5 py-1.5 bg-white font-medium focus:outline-none focus:ring-1 focus:ring-brand-gold"
              >
                <option value="all">All Divisions</option>
                <option value="study-abroad">Study Abroad</option>
                <option value="visa">Visa Services</option>
                <option value="attestation">Attestation</option>
                <option value="umrah">Umrah / Travel</option>
                <option value="manpower">Manpower Recruitment</option>
              </select>
            </div>

            {/* Counselor Select */}
            <div>
              <label className="text-[9px] uppercase text-brand-textLight font-semibold block mb-0.5">Counselor</label>
              <select 
                value={counselorFilter}
                onChange={(e) => setCounselorFilter(e.target.value)}
                className="text-xs border border-gray-300 rounded px-2.5 py-1.5 bg-white font-medium focus:outline-none focus:ring-1 focus:ring-brand-gold"
              >
                <option value="all">All Staff</option>
                <option value="unassigned">Unassigned</option>
                <option value="counselor-1">Santhosh Kumar</option>
                <option value="counselor-2">Visa Specialist</option>
              </select>
            </div>

            {/* Stale Aging Toggle */}
            <div className="flex items-center gap-2 mt-3 select-none">
              <input 
                type="checkbox" 
                id="agingFilter" 
                checked={staleOnly}
                onChange={(e) => setStaleOnly(e.target.checked)}
                className="rounded border-gray-300 text-brand-gold focus:ring-brand-gold"
              />
              <label htmlFor="agingFilter" className="text-xs font-semibold text-brand-error flex items-center gap-1 cursor-pointer">
                <span className="w-2.5 h-2.5 rounded-full bg-brand-error animate-pulse"></span>
                Show Stale Work (&gt;48h)
              </label>
            </div>
          </div>
        </header>

        {/* KANBAN COLUMNS BODY */}
        <div className="flex-1 overflow-x-auto p-8 flex gap-6 items-start">
          {boardData?.columns.map((column) => {
            const filteredCards = getFilteredCards(column.cards);
            const isTargetDrag = dragOverCol === column.key;
            const isWipViolated = column.wipLimit !== null && filteredCards.length > column.wipLimit;

            return (
              <div 
                key={column.key}
                onDragOver={(e) => handleDragOver(e, column.key)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(e, column.key)}
                className={`w-72 bg-white/40 border rounded-xl flex flex-col shrink-0 overflow-hidden shadow-sm transition ${
                  isTargetDrag ? 'drag-over' : 'border-gray-200'
                }`}
              >
                {/* Column Header */}
                <div className={`p-4 border-b flex justify-between items-center transition ${
                  isWipViolated ? 'bg-red-50 border-brand-error' : 'bg-white border-gray-100'
                }`}>
                  <div className="flex flex-col">
                    <span className="font-display font-bold text-xs text-brand-navy uppercase tracking-wider">{column.name}</span>
                    {column.wipLimit && (
                      <span className="text-[9px] text-brand-textLight">Limit: {column.wipLimit} cards</span>
                    )}
                  </div>
                  <span className={`px-1.5 py-0.5 text-[9px] rounded font-bold uppercase tracking-wider ${
                    isWipViolated ? 'bg-brand-error text-white animate-bounce' : 'bg-brand-gold text-brand-navy'
                  }`}>
                    {filteredCards.length}
                  </span>
                </div>

                {/* Cards Container */}
                <div className="p-3 space-y-3 overflow-y-auto kanban-column flex-1">
                  {filteredCards.map((card) => {
                    // Cards with no counselor assignment are attention items (blocker-ish)
                    const hasBlocker = card.counselorId === null;
                    return (
                      <div
                        key={card.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, card.id, column.key)}
                        onClick={() => setSelectedCard(card)}
                        className="bg-white p-4 rounded-lg border border-gray-200 shadow-sm hover:border-brand-gold transition duration-200 cursor-grab active:cursor-grabbing flex flex-col gap-3 select-none"
                      >
                        <div className="flex justify-between items-start">
                          <span className="text-[9px] font-bold text-brand-gold uppercase tracking-wider bg-brand-cream px-1.5 py-0.5 rounded">
                            {card.division}
                          </span>
                          {hasBlocker && (
                            <span className="w-2.5 h-2.5 rounded-full bg-brand-error animate-pulse" title="Unassigned - needs counselor"></span>
                          )}
                        </div>

                        <div>
                          <h4 className="text-xs font-bold text-brand-navy truncate">{card.clientName}</h4>
                          <p className="text-[9px] text-brand-textLight mt-0.5">Token: {card.clientId}</p>
                        </div>

                        <div className="flex justify-between items-center text-[10px] text-brand-textLight pt-2 border-t border-gray-50">
                          <span>Bal: ₹{(card.outstandingBalance / 100).toFixed(2)}</span>
                          <span className="font-medium text-brand-navy">
                            {card.counselorId ? 'Assigned' : 'Unassigned'}
                          </span>
                        </div>
                      </div>
                    );
                  })}

                  {filteredCards.length === 0 && (
                    <div className="p-8 text-center text-[10px] text-brand-textLight border border-dashed border-gray-200 rounded-lg">
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
            onClick={() => setSelectedCard(null)}
            className="fixed inset-0 bg-brand-navy/35 z-40 transition-opacity"
          ></div>
          
          <aside className="fixed top-0 right-0 h-full w-96 bg-white shadow-2xl z-50 p-8 flex flex-col justify-between border-l border-gray-200 transition-transform duration-300">
            <div className="flex flex-col gap-6">
              <div className="flex justify-between items-start border-b border-gray-100 pb-4">
                <div>
                  <span className="text-[9px] font-bold text-brand-gold uppercase tracking-widest">Detail Preview</span>
                  <h3 className="font-display font-extrabold text-lg text-brand-navy mt-1">{selectedCard.clientName}</h3>
                  <p className="text-[10px] text-brand-textLight mt-0.5">Application Token: <span className="font-mono text-brand-navy font-semibold">{selectedCard.clientId}</span></p>
                </div>
                <button 
                  onClick={() => setSelectedCard(null)}
                  className="w-6 h-6 rounded-full hover:bg-gray-100 text-gray-400 hover:text-brand-navy flex items-center justify-center transition"
                >
                  âœ•
                </button>
              </div>

              {/* Specs List */}
              <div className="space-y-4">
                <div className="flex justify-between text-xs py-2 border-b border-gray-50">
                  <span className="text-brand-textLight font-semibold">Service Division</span>
                  <span className="font-bold text-brand-navy uppercase">{selectedCard.division}</span>
                </div>
                <div className="flex justify-between text-xs py-2 border-b border-gray-50">
                  <span className="text-brand-textLight font-semibold">Outstanding Balance</span>
                  <span className="font-bold text-brand-error">₹{(selectedCard.outstandingBalance / 100).toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-xs py-2 border-b border-gray-50">
                  <span className="text-brand-textLight font-semibold">Stage Position</span>
                  <span className="font-bold text-brand-gold uppercase">{selectedCard.stageKey}</span>
                </div>
                <div className="flex justify-between text-xs py-2 border-b border-gray-50">
                  <span className="text-brand-textLight font-semibold">Counselor Assignment</span>
                  <span className="font-bold text-brand-navy">
                    {selectedCard.counselorId ? `ID: ${selectedCard.counselorId}` : 'Unassigned (General Queue)'}
                  </span>
                </div>
                <div className="flex justify-between text-xs py-2 border-b border-gray-50">
                  <span className="text-brand-textLight font-semibold">Engagement Status</span>
                  <span className="px-2 py-0.5 rounded text-[10px] uppercase font-bold tracking-wider bg-green-100 text-green-800">
                    {selectedCard.status}
                  </span>
                </div>
              </div>
            </div>

            {/* Profile Action Link */}
            <div className="pt-6 border-t border-gray-100">
              <Link href={`/clients/${selectedCard.clientId}`}>
                <span className="w-full bg-brand-navy hover:bg-brand-navyLight text-white py-2.5 rounded text-xs font-bold uppercase tracking-wider block text-center transition cursor-pointer shadow hover:shadow-md">
                  Open Client 360 Profile
                </span>
              </Link>
            </div>
          </aside>
        </>
      )}

      {/* TOAST SYSTEM */}
      <div 
        className={`fixed right-6 bottom-6 bg-brand-navy border-l-4 border-brand-gold text-white text-xs px-4 py-3 rounded-lg shadow-xl transition duration-300 z-50 flex items-center gap-2 ${
          toast.show ? 'translate-y-0 opacity-100' : 'translate-y-24 opacity-0'
        }`}
      >
        <span className="font-bold text-brand-gold">KANBAN BOARD:</span>
        <span>{toast.msg}</span>
      </div>
    </div>
  );
}
