import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import WorkspaceShell from '../components/WorkspaceShell';
import { createSyncClient } from '../lib/syncClient';
const API = (import.meta as any).env?.VITE_API_URL || '';

interface SupportTicket {
  id: string;
  ticketNumber: string;
  source: 'client' | 'partner' | 'internal';
  clientId?: string;
  partnerId?: string;
  creatorName: string;
  creatorEmail?: string;
  creatorPhone?: string;
  division: string;
  category: string;
  subject: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'in_progress' | 'waiting_on_user' | 'resolved' | 'closed';
  assigneeId?: string;
  assigneeName?: string;
  slaDueAt?: number;
  slaPausedAt?: number;
  slaRemainingSeconds?: number;
  isSlaBreached?: boolean;
  isPaused?: boolean;
  firstResponseAt?: number;
  resolvedAt?: number;
  closedAt?: number;
  satisfactionRating?: number;
  satisfactionFeedback?: string;
  createdAt: number;
  updatedAt: number;
}

interface TicketMessage {
  id: string;
  ticketId: string;
  senderType: 'client' | 'partner' | 'staff' | 'system';
  senderId: string;
  senderName: string;
  message: string;
  isInternalNote: boolean;
  createdAt: number;
}

export function HelpdeskCommandCenter() {
  const queryClient = useQueryClient();
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [divisionFilter, setDivisionFilter] = useState('all');
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [sourceFilter, setSourceFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Composer State
  const [replyMessage, setReplyMessage] = useState('');
  const [isInternalNote, setIsInternalNote] = useState(false);

  // 1. Fetch Kanban Tickets & Metrics
  const { data } = useQuery<{
    success: boolean;
    tickets: SupportTicket[];
    kanban: {
      open: SupportTicket[];
      in_progress: SupportTicket[];
      waiting_on_user: SupportTicket[];
      resolved: SupportTicket[];
      closed: SupportTicket[];
    };
    metrics: {
      total: number;
      open: number;
      inProgress: number;
      waitingOnUser: number;
      resolved: number;
      closed: number;
      slaBreachedCount: number;
      unassignedCount: number;
      avgCsat: number;
    };
  }>({
    queryKey: ['staffTickets', divisionFilter, priorityFilter, sourceFilter, searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (divisionFilter !== 'all') params.set('division', divisionFilter);
      if (priorityFilter !== 'all') params.set('priority', priorityFilter);
      if (sourceFilter !== 'all') params.set('source', sourceFilter);
      if (searchQuery.trim()) params.set('q', searchQuery.trim());

      const res = await fetch(`${API}/api/helpdesk/tickets?${params.toString()}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to load tickets');
      return res.json();
    },
    refetchInterval: 15000,
  });

  // 2. Fetch Selected Ticket Detail
  const { data: ticketDetail, refetch: refetchDetail } = useQuery<{
    success: boolean;
    ticket: SupportTicket;
    messages: TicketMessage[];
  }>({
    queryKey: ['staffTicketDetail', selectedTicketId],
    queryFn: async () => {
      if (!selectedTicketId) return null as any;
      const res = await fetch(`${API}/api/helpdesk/tickets/${selectedTicketId}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to load ticket detail');
      return res.json();
    },
    enabled: !!selectedTicketId,
    refetchInterval: 8000,
  });

  // 3. Realtime WebSocket Sync for Global Staff Desk
  useEffect(() => {
    const client = createSyncClient({
      plane: 'staff',
      channels: ['staff:global:tickets'],
      onEvent: (e) => {
        if (e.type === 'TICKET_CREATED' || e.type === 'TICKET_UPDATED' || e.type === 'TICKET_MESSAGE_ADDED') {
          queryClient.invalidateQueries({ queryKey: ['staffTickets'] });
          queryClient.invalidateQueries({ queryKey: ['staffTicketDetail', selectedTicketId] });
        }
      }
    });
    client.connect();
    return () => {
      client.disconnect();
    };
  }, [selectedTicketId, queryClient]);

  // 4. Update Status Mutation
  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status, note }: { id: string; status: string; note?: string }) => {
      const res = await fetch(`${API}/api/helpdesk/tickets/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status, note }),
      });
      if (!res.ok) throw new Error('Failed to update status');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['staffTickets'] });
      refetchDetail();
    },
  });

  // 5. Send Message / Internal Note Mutation
  const sendMessageMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTicketId || !replyMessage.trim()) return;
      const res = await fetch(`${API}/api/helpdesk/tickets/${selectedTicketId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          message: replyMessage.trim(),
          isInternalNote,
        }),
      });
      if (!res.ok) throw new Error('Failed to send message');
      return res.json();
    },
    onSuccess: () => {
      setReplyMessage('');
      refetchDetail();
      queryClient.invalidateQueries({ queryKey: ['staffTickets'] });
    },
  });

  const kanban = data?.kanban || { open: [], in_progress: [], waiting_on_user: [], resolved: [], closed: [] };
  const metrics = data?.metrics || {
    total: 0,
    open: 0,
    inProgress: 0,
    waitingOnUser: 0,
    resolved: 0,
    closed: 0,
    slaBreachedCount: 0,
    unassignedCount: 0,
    avgCsat: 5.0,
  };
  const activeTicket = ticketDetail?.ticket;
  const messages = ticketDetail?.messages || [];

  const handleCannedResponse = (text: string) => {
    setReplyMessage((prev) => (prev ? `${prev}\n${text}` : text));
  };

  return (
    <WorkspaceShell>
      <div className="space-y-6 max-w-7xl mx-auto p-4 md:p-6 animate-fade-in">
        {/* Header Strip */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-xl">🎧</span>
              <span className="text-[11px] font-black uppercase tracking-wider text-brand-navy bg-brand-gold px-2.5 py-0.5 rounded-full">
                Helpdesk & Resolution Center
              </span>
              <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                ITIL v4 Gold Standard
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-display font-black text-brand-navy">
              Omni-Workspace Helpdesk Command
            </h1>
            <p className="text-xs text-brand-navy/60 mt-0.5">
              Live multi-tenant triage desk syncing client and partner workspaces in real time.
            </p>
          </div>

          {/* Quick Metrics Cards */}
          <div className="flex items-center gap-2 overflow-x-auto pb-2 md:pb-0">
            <div className="p-3 bg-white rounded-2xl border border-brand-navy/10 shadow-sm min-w-[100px]">
              <div className="text-[10px] font-bold uppercase text-brand-navy/50">Active WIP</div>
              <div className="text-xl font-black text-brand-navy">{metrics.open + metrics.inProgress}</div>
            </div>
            <div className="p-3 bg-white rounded-2xl border border-rose-200 bg-rose-50/40 shadow-sm min-w-[100px]">
              <div className="text-[10px] font-bold uppercase text-rose-600">SLA Breached</div>
              <div className="text-xl font-black text-rose-700">{metrics.slaBreachedCount}</div>
            </div>
            <div className="p-3 bg-white rounded-2xl border border-amber-200 bg-amber-50/40 shadow-sm min-w-[100px]">
              <div className="text-[10px] font-bold uppercase text-amber-600">Awaiting User</div>
              <div className="text-xl font-black text-amber-700">{metrics.waitingOnUser}</div>
            </div>
            <div className="p-3 bg-white rounded-2xl border border-emerald-200 bg-emerald-50/40 shadow-sm min-w-[100px]">
              <div className="text-[10px] font-bold uppercase text-emerald-600">CSAT Score</div>
              <div className="text-xl font-black text-emerald-700">⭐ {metrics.avgCsat}</div>
            </div>
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div className="bg-white p-4 rounded-2xl border border-brand-navy/10 shadow-sm flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <input
              type="text"
              placeholder="Search tickets, clients, numbers..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="p-2 bg-brand-cream/30 border border-brand-navy/10 rounded-xl min-w-[220px] focus:outline-none focus:border-brand-gold"
            />

            <select
              value={divisionFilter}
              onChange={(e) => setDivisionFilter(e.target.value)}
              className="p-2 bg-brand-cream/30 border border-brand-navy/10 rounded-xl font-medium text-brand-navy"
            >
              <option value="all">All Divisions</option>
              <option value="study-abroad">Study Abroad</option>
              <option value="visa">Visa Applications</option>
              <option value="umrah">Umrah & Tours</option>
              <option value="attestation">Attestation</option>
              <option value="manpower">Manpower</option>
              <option value="billing">Billing</option>
              <option value="technical">Technical</option>
              <option value="general">General</option>
            </select>

            <select
              value={priorityFilter}
              onChange={(e) => setPriorityFilter(e.target.value)}
              className="p-2 bg-brand-cream/30 border border-brand-navy/10 rounded-xl font-medium text-brand-navy"
            >
              <option value="all">All Priorities</option>
              <option value="urgent">Urgent</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>

            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="p-2 bg-brand-cream/30 border border-brand-navy/10 rounded-xl font-medium text-brand-navy"
            >
              <option value="all">All Sources</option>
              <option value="client">Client Tickets</option>
              <option value="partner">Partner Escalations</option>
            </select>
          </div>

          <div className="text-xs font-bold text-brand-navy/60">
            Showing {data?.tickets?.length || 0} Tickets
          </div>
        </div>

        {/* 5-Column Enterprise Staff Kanban Board */}
        <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
          {/* 1. Open */}
          <KanbanColumn
            title="1. Open / Triage"
            count={kanban.open.length}
            color="bg-blue-500"
            tickets={kanban.open}
            selectedId={selectedTicketId}
            onSelect={setSelectedTicketId}
          />

          {/* 2. In Progress */}
          <KanbanColumn
            title="2. In Progress"
            count={kanban.in_progress.length}
            color="bg-indigo-500"
            tickets={kanban.in_progress}
            selectedId={selectedTicketId}
            onSelect={setSelectedTicketId}
          />

          {/* 3. Waiting on User (SLA Paused) */}
          <KanbanColumn
            title="3. Waiting on User"
            subtitle="⏱️ SLA Clock Paused"
            count={kanban.waiting_on_user.length}
            color="bg-amber-500"
            tickets={kanban.waiting_on_user}
            selectedId={selectedTicketId}
            onSelect={setSelectedTicketId}
          />

          {/* 4. Resolved */}
          <KanbanColumn
            title="4. Resolved"
            count={kanban.resolved.length}
            color="bg-emerald-500"
            tickets={kanban.resolved}
            selectedId={selectedTicketId}
            onSelect={setSelectedTicketId}
          />

          {/* 5. Closed */}
          <KanbanColumn
            title="5. Closed"
            count={kanban.closed.length}
            color="bg-slate-400"
            tickets={kanban.closed}
            selectedId={selectedTicketId}
            onSelect={setSelectedTicketId}
          />
        </div>

        {/* Ticket Detail Drawer / Modal */}
        {selectedTicketId && activeTicket && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-navy/60 backdrop-blur-sm animate-fade-in">
            <div className="bg-white rounded-3xl border border-brand-navy/10 w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
              {/* Header Bar */}
              <div className="p-6 border-b border-brand-navy/10 flex items-center justify-between bg-gradient-to-r from-brand-cream/60 to-white">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-black px-2.5 py-0.5 rounded-md bg-brand-navy text-brand-gold font-mono">
                      {activeTicket.ticketNumber}
                    </span>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded uppercase tracking-wider bg-slate-100 text-brand-navy">
                      {activeTicket.source}
                    </span>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-blue-50 text-blue-700">
                      {activeTicket.division}
                    </span>
                    <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-indigo-50 text-indigo-700">
                      {activeTicket.category}
                    </span>
                  </div>
                  <h2 className="text-lg font-black text-brand-navy mt-2">{activeTicket.subject}</h2>
                  <div className="text-xs text-brand-navy/60 mt-0.5">
                    Raised by <strong>{activeTicket.creatorName}</strong> ({activeTicket.creatorEmail || 'No email'}) • {new Date(activeTicket.createdAt * 1000).toLocaleString()}
                  </div>
                </div>

                <button
                  onClick={() => setSelectedTicketId(null)}
                  className="p-2 rounded-xl text-brand-navy/40 hover:text-brand-navy hover:bg-brand-navy/5 cursor-pointer text-base"
                >
                  ✕
                </button>
              </div>

              {/* Status and Action Control Strip */}
              <div className="px-6 py-3 bg-slate-50 border-b border-brand-navy/10 flex flex-wrap items-center justify-between gap-3 text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-brand-navy/70">Stage:</span>
                  <select
                    value={activeTicket.status}
                    onChange={(e) =>
                      updateStatusMutation.mutate({
                        id: activeTicket.id,
                        status: e.target.value,
                      })
                    }
                    className="p-1.5 bg-white border border-brand-navy/20 rounded-lg font-bold text-brand-navy focus:outline-none"
                  >
                    <option value="open">Open</option>
                    <option value="in_progress">In Progress</option>
                    <option value="waiting_on_user">Waiting on User (Pause SLA)</option>
                    <option value="resolved">Resolved</option>
                    <option value="closed">Closed</option>
                  </select>
                </div>

                {/* SLA Indicator */}
                <div className="flex items-center gap-2">
                  {activeTicket.status === 'waiting_on_user' ? (
                    <span className="font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full">
                      ⏱️ SLA Paused ({Math.round((activeTicket.slaRemainingSeconds || 0) / 3600)}h left)
                    </span>
                  ) : activeTicket.isSlaBreached ? (
                    <span className="font-black text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-full animate-pulse">
                      🚨 SLA Breached
                    </span>
                  ) : (
                    <span className="font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                      🛡️ SLA Target: {activeTicket.slaDueAt ? new Date(activeTicket.slaDueAt * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'N/A'}
                    </span>
                  )}
                </div>
              </div>

              {/* Thread Timeline Body */}
              <div className="p-6 overflow-y-auto flex-1 space-y-4 bg-slate-50/40">
                {messages.map((m) => {
                  const isInternal = m.isInternalNote;
                  const isStaff = m.senderType === 'staff';
                  return (
                    <div
                      key={m.id}
                      className={`p-4 rounded-2xl text-xs leading-relaxed border shadow-sm ${
                        isInternal
                          ? 'bg-amber-50 border-amber-300/80 text-amber-950 ml-4'
                          : isStaff
                          ? 'bg-brand-navy text-white ml-8 rounded-tr-none'
                          : 'bg-white text-brand-navy mr-8 border-brand-navy/10 rounded-tl-none'
                      }`}
                    >
                      <div className="flex items-center justify-between text-[10px] font-bold opacity-75 mb-1.5">
                        <div className="flex items-center gap-1.5">
                          {isInternal && <span className="bg-amber-200 text-amber-900 px-1.5 py-0.2 rounded font-black">🔒 INTERNAL NOTE (PRIVATE)</span>}
                          <span>{m.senderName} ({m.senderType.toUpperCase()})</span>
                        </div>
                        <span>{new Date(m.createdAt * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                      </div>
                      <div className="whitespace-pre-wrap">{m.message}</div>
                    </div>
                  );
                })}
              </div>

              {/* Dual Composer Strip */}
              <div className="p-4 border-t border-brand-navy/10 bg-white space-y-3">
                {/* Canned Responses / Macros */}
                <div className="flex items-center gap-2 overflow-x-auto pb-1 text-[11px]">
                  <span className="font-bold text-brand-navy/50 whitespace-nowrap">⚡ Macros:</span>
                  <button
                    type="button"
                    onClick={() => handleCannedResponse('We have received your request and our specialist is reviewing the files.')}
                    className="bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-lg text-brand-navy whitespace-nowrap cursor-pointer"
                  >
                    Under Review
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCannedResponse('Please provide the missing document pages to proceed with embassy submission.')}
                    className="bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-lg text-brand-navy whitespace-nowrap cursor-pointer"
                  >
                    Request Documents
                  </button>
                  <button
                    type="button"
                    onClick={() => handleCannedResponse('Your payment has been successfully reconciled and your booking is confirmed.')}
                    className="bg-slate-100 hover:bg-slate-200 px-2.5 py-1 rounded-lg text-brand-navy whitespace-nowrap cursor-pointer"
                  >
                    Payment Confirmed
                  </button>
                </div>

                <div className="flex items-center gap-4">
                  <label className="flex items-center gap-2 text-xs font-black cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={isInternalNote}
                      onChange={(e) => setIsInternalNote(e.target.checked)}
                      className="rounded text-amber-500 focus:ring-amber-400"
                    />
                    <span className={isInternalNote ? 'text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200' : 'text-brand-navy/60'}>
                      🔒 Post as Internal Note (Staff Only)
                    </span>
                  </label>
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    sendMessageMutation.mutate();
                  }}
                  className="flex items-start gap-2"
                >
                  <textarea
                    rows={2}
                    placeholder={isInternalNote ? 'Write private staff notes here...' : 'Write public message to client/partner...'}
                    value={replyMessage}
                    onChange={(e) => setReplyMessage(e.target.value)}
                    className={`flex-1 text-xs p-3 border rounded-2xl focus:outline-none ${
                      isInternalNote ? 'bg-amber-50/50 border-amber-300 focus:border-amber-500' : 'bg-brand-cream/30 border-brand-navy/10 focus:border-brand-gold'
                    }`}
                  />
                  <button
                    type="submit"
                    disabled={!replyMessage.trim() || sendMessageMutation.isPending}
                    className={`font-black text-xs px-6 py-4 rounded-2xl cursor-pointer shadow-sm transition-all ${
                      isInternalNote
                        ? 'bg-amber-500 hover:bg-amber-600 text-brand-navy'
                        : 'bg-brand-navy hover:bg-brand-navy/90 text-brand-gold'
                    }`}
                  >
                    {sendMessageMutation.isPending ? 'Saving...' : isInternalNote ? 'Add Note' : 'Send'}
                  </button>
                </form>
              </div>
            </div>
          </div>
        )}
      </div>
    </WorkspaceShell>
  );
}

function KanbanColumn({
  title,
  subtitle,
  count,
  color,
  tickets,
  selectedId,
  onSelect,
}: {
  title: string;
  subtitle?: string;
  count: number;
  color: string;
  tickets: SupportTicket[];
  selectedId: string | null;
  onSelect: (id: string) => void;
}) {
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between px-2">
        <div className="flex flex-col">
          <div className="flex items-center gap-2">
            <span className={`w-2.5 h-2.5 rounded-full ${color}`}></span>
            <span className="text-xs font-black uppercase tracking-wider text-brand-navy">{title}</span>
          </div>
          {subtitle && <span className="text-[10px] text-amber-700 font-bold ml-4.5">{subtitle}</span>}
        </div>
        <span className="text-xs font-black px-2 py-0.5 rounded-full bg-slate-100 text-brand-navy border border-slate-200">
          {count}
        </span>
      </div>

      <div className="space-y-3 min-h-[350px] p-3 rounded-2xl bg-brand-cream/30 border border-brand-navy/5">
        {tickets.length === 0 ? (
          <div className="text-center py-16 text-xs text-brand-navy/30">No tickets</div>
        ) : (
          tickets.map((t) => (
            <StaffTicketCard key={t.id} ticket={t} isSelected={selectedId === t.id} onClick={() => onSelect(t.id)} />
          ))
        )}
      </div>
    </div>
  );
}

function StaffTicketCard({ ticket, isSelected, onClick }: { ticket: SupportTicket; isSelected: boolean; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className={`p-3.5 rounded-2xl bg-white border cursor-pointer transition-all hover:shadow-md ${
        isSelected
          ? 'border-brand-gold ring-2 ring-brand-gold/30 bg-amber-50/20'
          : ticket.isSlaBreached
          ? 'border-rose-300 bg-rose-50/20'
          : 'border-brand-navy/10 hover:border-brand-navy/30'
      }`}
    >
      <div className="flex items-center justify-between gap-1 mb-1.5">
        <span className="text-[10px] font-black px-2 py-0.5 rounded bg-brand-navy text-brand-gold font-mono">
          {ticket.ticketNumber}
        </span>
        <span
          className={`text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded ${
            ticket.priority === 'urgent'
              ? 'bg-rose-50 text-rose-700 font-black animate-pulse'
              : ticket.priority === 'high'
              ? 'bg-amber-50 text-amber-700'
              : 'bg-slate-100 text-slate-600'
          }`}
        >
          {ticket.priority}
        </span>
      </div>

      <h4 className="text-xs font-bold text-brand-navy line-clamp-1">{ticket.subject}</h4>
      <div className="text-[11px] text-brand-navy/60 line-clamp-1 mt-0.5">
        {ticket.creatorName} • <span className="font-semibold">{ticket.division}</span>
      </div>

      <div className="flex items-center justify-between mt-3 pt-2 border-t border-brand-navy/5 text-[10px]">
        <span className="text-brand-navy/50">{ticket.assigneeName || 'Unassigned'}</span>
        {ticket.status === 'waiting_on_user' ? (
          <span className="text-amber-700 font-bold">⏱️ SLA Paused</span>
        ) : ticket.isSlaBreached ? (
          <span className="text-rose-600 font-black">🚨 Breached</span>
        ) : (
          <span className="text-emerald-700 font-medium">Active</span>
        )}
      </div>
    </div>
  );
}
