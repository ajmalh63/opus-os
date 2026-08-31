import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { createSyncClient } from '../../lib/syncClient';
const API = (import.meta as any).env?.VITE_API_URL || '';

interface SupportTicket {
  id: string;
  ticketNumber: string;
  division: string;
  category: string;
  subject: string;
  description: string;
  priority: 'low' | 'medium' | 'high' | 'urgent';
  status: 'open' | 'in_progress' | 'waiting_on_user' | 'resolved' | 'closed';
  slaDueAt?: number;
  slaRemainingSeconds?: number;
  satisfactionRating?: number;
  createdAt: number;
  updatedAt: number;
}

interface TicketMessage {
  id: string;
  ticketId: string;
  senderType: 'partner' | 'staff' | 'system';
  senderName: string;
  message: string;
  isInternalNote: boolean;
  createdAt: number;
}

export function PartnerHelpdeskSection({ partnerId, apiToken }: { partnerId: string; apiToken?: string }) {
  const queryClient = useQueryClient();
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [replyText, setReplyText] = useState('');

  // Form State
  const [division, setDivision] = useState('general');
  const [category, setCategory] = useState('commission_payout');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('high');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState('');

  const authHeaders: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(apiToken ? { Authorization: `Bearer ${apiToken}` } : {}),
  };

  // 1. Fetch Partner Tickets & Kanban
  const { data } = useQuery<{ success: boolean; tickets: SupportTicket[]; kanban: { active: SupportTicket[]; awaiting_user: SupportTicket[]; resolved: SupportTicket[] } }>({
    queryKey: ['partnerTickets', partnerId],
    queryFn: async () => {
      const res = await fetch(`${API}/api/partner/${partnerId}/tickets`, {
        headers: authHeaders,
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to load partner tickets');
      return res.json();
    },
    enabled: !!partnerId,
    refetchInterval: 15000,
  });

  // 2. Fetch Selected Ticket Thread
  const { data: threadData, refetch: refetchThread } = useQuery<{ success: boolean; ticket: SupportTicket; messages: TicketMessage[] }>({
    queryKey: ['partnerTicketThread', partnerId, selectedTicketId],
    queryFn: async () => {
      if (!selectedTicketId) return null as any;
      const res = await fetch(`${API}/api/partner/${partnerId}/tickets/${selectedTicketId}`, {
        headers: authHeaders,
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to load thread');
      return res.json();
    },
    enabled: !!selectedTicketId && !!partnerId,
    refetchInterval: 10000,
  });

  // 3. Real-time WebSocket Sync
  useEffect(() => {
    if (!partnerId) return;
    const client = createSyncClient({
      plane: 'partner',
      apiToken,
      channels: [`partner:${partnerId}:tickets`],
      onEvent: (e) => {
        if (e.type === 'TICKET_CREATED' || e.type === 'TICKET_UPDATED' || e.type === 'TICKET_MESSAGE_ADDED') {
          queryClient.invalidateQueries({ queryKey: ['partnerTickets', partnerId] });
          queryClient.invalidateQueries({ queryKey: ['partnerTicketThread', partnerId, selectedTicketId] });
        }
      }
    });
    client.connect();
    return () => {
      client.disconnect();
    };
  }, [partnerId, selectedTicketId, apiToken, queryClient]);

  // 4. Create Ticket Mutation
  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API}/api/partner/${partnerId}/tickets`, {
        method: 'POST',
        headers: authHeaders,
        credentials: 'include',
        body: JSON.stringify({
          division,
          category,
          priority,
          subject,
          description,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to submit partner ticket');
      }
      return res.json();
    },
    onSuccess: (d) => {
      setIsModalOpen(false);
      setSubject('');
      setDescription('');
      setFormError('');
      queryClient.invalidateQueries({ queryKey: ['partnerTickets', partnerId] });
      if (d.ticketId) setSelectedTicketId(d.ticketId);
    },
    onError: (err: any) => {
      setFormError(err.message || 'Failed to submit partner escalation');
    },
  });

  // 5. Send Reply Mutation
  const sendReplyMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTicketId || !replyText.trim()) return;
      const res = await fetch(`${API}/api/partner/${partnerId}/tickets/${selectedTicketId}/messages`, {
        method: 'POST',
        headers: authHeaders,
        credentials: 'include',
        body: JSON.stringify({ message: replyText.trim() }),
      });
      if (!res.ok) throw new Error('Failed to send reply');
      return res.json();
    },
    onSuccess: () => {
      setReplyText('');
      refetchThread();
      queryClient.invalidateQueries({ queryKey: ['partnerTickets', partnerId] });
    },
  });

  const tickets = data?.tickets || [];
  const kanban = data?.kanban || { active: [], awaiting_user: [], resolved: [] };
  const currentTicket = threadData?.ticket;
  const messages = threadData?.messages || [];

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="rounded-3xl border border-brand-navy/10 bg-gradient-to-r from-brand-navy via-slate-900 to-brand-navy p-6 md:p-8 text-white shadow-lg">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-xl">🤝</span>
              <span className="text-[11px] font-black uppercase tracking-wider text-brand-navy bg-brand-gold px-2.5 py-0.5 rounded-full">
                Partner Desk & Escalations
              </span>
              <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-950/60 border border-emerald-500/30 px-2.5 py-0.5 rounded-full">
                Direct Line to Senior Management
              </span>
            </div>
            <h2 className="text-2xl font-display font-black text-white">Partner Support & Inquiry Desk</h2>
            <p className="text-xs text-white/70 mt-1 max-w-xl">
              Track commissions, query client bookings, request custom collateral, or escalate urgent files with prioritized partner SLA routing.
            </p>
          </div>
          <button
            onClick={() => setIsModalOpen(true)}
            className="flex items-center justify-center gap-2 bg-gradient-to-r from-brand-gold to-amber-500 hover:from-brand-gold-hover hover:to-amber-600 text-brand-navy font-black text-xs px-6 py-3.5 rounded-2xl shadow-md cursor-pointer transition-all transform hover:-translate-y-0.5"
          >
            <span>⚡</span>
            <span>Raise Escalation Ticket</span>
          </button>
        </div>

        {/* Quick Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6 pt-6 border-t border-white/10 text-brand-navy">
          <div className="p-3 bg-white/90 rounded-2xl border border-white/20">
            <div className="text-[10px] font-bold uppercase text-brand-navy/60">Total Escalations</div>
            <div className="text-xl font-black">{tickets.length}</div>
          </div>
          <div className="p-3 bg-white/90 rounded-2xl border border-white/20">
            <div className="text-[10px] font-bold uppercase text-blue-600">Active / In Process</div>
            <div className="text-xl font-black text-blue-700">{kanban.active.length}</div>
          </div>
          <div className="p-3 bg-white/90 rounded-2xl border border-white/20">
            <div className="text-[10px] font-bold uppercase text-amber-600">Action Pending</div>
            <div className="text-xl font-black text-amber-700">{kanban.awaiting_user.length}</div>
          </div>
          <div className="p-3 bg-white/90 rounded-2xl border border-white/20">
            <div className="text-[10px] font-bold uppercase text-emerald-600">Resolved</div>
            <div className="text-xl font-black text-emerald-700">{kanban.resolved.length}</div>
          </div>
        </div>
      </div>

      {/* 3-Column Kanban Board */}
      <div className="grid md:grid-cols-3 gap-6">
        {/* Active Column */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
              <span className="text-xs font-black uppercase text-brand-navy">Active Tickets</span>
            </div>
            <span className="text-xs font-black px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200">
              {kanban.active.length}
            </span>
          </div>
          <div className="space-y-3 min-h-[220px] p-3 rounded-2xl bg-brand-cream/40 border border-brand-navy/5">
            {kanban.active.length === 0 ? (
              <div className="text-center py-10 text-xs text-brand-navy/40">No active tickets</div>
            ) : (
              kanban.active.map((t) => (
                <PartnerTicketCard key={t.id} ticket={t} isSelected={selectedTicketId === t.id} onClick={() => setSelectedTicketId(t.id)} />
              ))
            )}
          </div>
        </div>

        {/* Awaiting Partner Column */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></span>
              <span className="text-xs font-black uppercase text-brand-navy">Action Required</span>
            </div>
            <span className="text-xs font-black px-2 py-0.5 rounded-full bg-amber-50 text-amber-700 border border-amber-200">
              {kanban.awaiting_user.length}
            </span>
          </div>
          <div className="space-y-3 min-h-[220px] p-3 rounded-2xl bg-amber-50/40 border border-amber-200/50">
            {kanban.awaiting_user.length === 0 ? (
              <div className="text-center py-10 text-xs text-brand-navy/40">No pending actions</div>
            ) : (
              kanban.awaiting_user.map((t) => (
                <PartnerTicketCard key={t.id} ticket={t} isSelected={selectedTicketId === t.id} onClick={() => setSelectedTicketId(t.id)} />
              ))
            )}
          </div>
        </div>

        {/* Resolved Column */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
              <span className="text-xs font-black uppercase text-brand-navy">Resolved</span>
            </div>
            <span className="text-xs font-black px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
              {kanban.resolved.length}
            </span>
          </div>
          <div className="space-y-3 min-h-[220px] p-3 rounded-2xl bg-brand-cream/40 border border-brand-navy/5">
            {kanban.resolved.length === 0 ? (
              <div className="text-center py-10 text-xs text-brand-navy/40">No resolved tickets</div>
            ) : (
              kanban.resolved.map((t) => (
                <PartnerTicketCard key={t.id} ticket={t} isSelected={selectedTicketId === t.id} onClick={() => setSelectedTicketId(t.id)} />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Ticket Thread Modal */}
      {selectedTicketId && currentTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-navy/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl border border-brand-navy/10 w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-brand-navy/10 flex items-center justify-between bg-brand-cream/40">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black px-2.5 py-0.5 rounded-md bg-brand-navy text-brand-gold font-mono">
                    {currentTicket.ticketNumber}
                  </span>
                  <span className="text-[10px] font-black px-2 py-0.5 rounded bg-amber-100 text-amber-800">
                    {currentTicket.status.replace('_', ' ').toUpperCase()}
                  </span>
                </div>
                <h3 className="text-sm font-black text-brand-navy mt-1.5">{currentTicket.subject}</h3>
              </div>
              <button
                onClick={() => setSelectedTicketId(null)}
                className="p-2 rounded-xl text-brand-navy/40 hover:text-brand-navy hover:bg-brand-navy/5 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-5 overflow-y-auto flex-1 space-y-4 bg-slate-50/50">
              {messages.map((m) => {
                const isMe = m.senderType === 'partner';
                return (
                  <div key={m.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                    <div className="text-[11px] font-bold text-brand-navy/40 mb-1 px-1">
                      {isMe ? 'You (Partner)' : m.senderName || 'Opus Senior Desk'} • {new Date(m.createdAt * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div
                      className={`p-3.5 rounded-2xl max-w-[85%] text-xs leading-relaxed ${
                        isMe
                          ? 'bg-slate-900 text-white rounded-tr-none shadow-sm'
                          : 'bg-white text-brand-navy border border-brand-navy/10 rounded-tl-none shadow-sm'
                      }`}
                    >
                      <div className="whitespace-pre-wrap">{m.message}</div>
                    </div>
                  </div>
                );
              })}
            </div>

            {currentTicket.status !== 'closed' && (
              <div className="p-4 border-t border-brand-navy/10 bg-white">
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    sendReplyMutation.mutate();
                  }}
                  className="flex items-center gap-2"
                >
                  <input
                    type="text"
                    placeholder="Type reply or additional instructions..."
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    className="flex-1 text-xs p-3 bg-brand-cream/30 border border-brand-navy/10 rounded-2xl focus:outline-none focus:border-brand-gold"
                  />
                  <button
                    type="submit"
                    disabled={!replyText.trim() || sendReplyMutation.isPending}
                    className="bg-brand-navy hover:bg-brand-navy/90 text-brand-gold font-black text-xs px-5 py-3 rounded-2xl cursor-pointer"
                  >
                    {sendReplyMutation.isPending ? 'Sending...' : 'Reply'}
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Raise Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-navy/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl border border-brand-navy/10 w-full max-w-lg shadow-2xl p-6 md:p-8 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-brand-navy/10">
              <div className="flex items-center gap-2">
                <span className="text-xl">⚡</span>
                <h3 className="text-base font-black text-brand-navy">Raise Partner Escalation Ticket</h3>
              </div>
              <button onClick={() => setIsModalOpen(false)} className="text-brand-navy/40 hover:text-brand-navy">✕</button>
            </div>

            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-2xl">{formError}</div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                createMutation.mutate();
              }}
              className="space-y-4 text-xs"
            >
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-bold text-brand-navy/70 mb-1">Division</label>
                  <select
                    value={division}
                    onChange={(e) => setDivision(e.target.value)}
                    className="w-full p-2.5 bg-brand-cream/30 border border-brand-navy/10 rounded-xl"
                  >
                    <option value="general">General Partner Query</option>
                    <option value="study-abroad">Study Abroad</option>
                    <option value="visa">Visa Applications</option>
                    <option value="umrah">Umrah & Tours</option>
                    <option value="attestation">Attestation</option>
                    <option value="manpower">Manpower</option>
                    <option value="billing">Payouts & Finance</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-brand-navy/70 mb-1">Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                    className="w-full p-2.5 bg-brand-cream/30 border border-brand-navy/10 rounded-xl"
                  >
                    <option value="commission_payout">Commission / Payout Status</option>
                    <option value="booking_change">Client Booking Escalation</option>
                    <option value="application_status">Lead Conversion Review</option>
                    <option value="escalation">Urgent VIP Request</option>
                    <option value="technical_bug">Affiliate Link / Dashboard Issue</option>
                    <option value="other">Other Inquiry</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-brand-navy/70 mb-1">Priority</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as any)}
                    className="w-full p-2.5 bg-brand-cream/30 border border-brand-navy/10 rounded-xl font-bold"
                  >
                    <option value="urgent">🔴 Urgent (2h SLA)</option>
                    <option value="high">🟠 High (6h SLA)</option>
                    <option value="medium">🟡 Medium (24h SLA)</option>
                    <option value="low">🟢 Low (48h SLA)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-brand-navy/70 mb-1">Subject</label>
                <input
                  type="text"
                  required
                  placeholder="e.g., Payout reconciliation for August batch #104"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full p-2.5 bg-brand-cream/30 border border-brand-navy/10 rounded-xl"
                />
              </div>

              <div>
                <label className="block font-bold text-brand-navy/70 mb-1">Description</label>
                <textarea
                  required
                  rows={4}
                  placeholder="Details of the query..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full p-2.5 bg-brand-cream/30 border border-brand-navy/10 rounded-xl"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-brand-navy/10">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-brand-navy/60 font-bold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createMutation.isPending}
                  className="bg-brand-navy text-brand-gold font-black px-6 py-2.5 rounded-xl cursor-pointer"
                >
                  {createMutation.isPending ? 'Submitting...' : 'Submit Escalation'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function PartnerTicketCard({ ticket, isSelected, onClick }: { ticket: SupportTicket; isSelected: boolean; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className={`p-4 rounded-2xl bg-white border cursor-pointer transition-all hover:shadow-md ${
        isSelected ? 'border-brand-gold ring-2 ring-brand-gold/30 bg-amber-50/20' : 'border-brand-navy/10'
      }`}
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-[10px] font-black px-2 py-0.5 rounded bg-brand-navy/10 text-brand-navy font-mono">
          {ticket.ticketNumber}
        </span>
        <span className="text-[10px] uppercase font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded">
          {ticket.priority}
        </span>
      </div>
      <h4 className="text-xs font-bold text-brand-navy line-clamp-1">{ticket.subject}</h4>
      <p className="text-[11px] text-brand-navy/60 line-clamp-2 mt-1">{ticket.description}</p>
      <div className="flex items-center justify-between mt-3 pt-2 border-t border-brand-navy/5 text-[10px] text-brand-navy/40">
        <span>{ticket.division}</span>
        <span>{new Date(ticket.createdAt * 1000).toLocaleDateString()}</span>
      </div>
    </div>
  );
}
