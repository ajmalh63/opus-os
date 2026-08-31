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
  satisfactionFeedback?: string;
  attachmentsJson?: string;
  createdAt: number;
  updatedAt: number;
}

interface TicketMessage {
  id: string;
  ticketId: string;
  senderType: 'client' | 'staff' | 'system';
  senderName: string;
  message: string;
  isInternalNote: boolean;
  attachmentsJson?: string;
  createdAt: number;
}

export function ClientHelpdeskSection({ token, clientId }: { token: string; clientId: string }) {
  const queryClient = useQueryClient();
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [isRaiseModalOpen, setIsRaiseModalOpen] = useState(false);
  const [replyText, setReplyText] = useState('');
  const [csatRating, setCsatRating] = useState<number>(5);
  const [csatFeedback, setCsatFeedback] = useState('');
  const [csatSubmitted, setCsatSubmitted] = useState(false);

  // Form State for New Ticket
  const [division, setDivision] = useState('general');
  const [category, setCategory] = useState('application_status');
  const [priority, setPriority] = useState<'low' | 'medium' | 'high' | 'urgent'>('medium');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [formError, setFormError] = useState('');

  // 1. Fetch Client Tickets & Kanban
  const { data } = useQuery<{ success: boolean; tickets: SupportTicket[]; kanban: { active: SupportTicket[]; awaiting_user: SupportTicket[]; resolved: SupportTicket[] } }>({
    queryKey: ['portalTickets', token],
    queryFn: async () => {
      const res = await fetch(`${API}/api/public/portal/tickets`, {
        headers: { 'X-Portal-Token': token },
      });
      if (!res.ok) throw new Error('Failed to load tickets');
      return res.json();
    },
    enabled: !!token,
    refetchInterval: 15000,
  });

  // 2. Fetch Selected Ticket Thread
  const { data: threadData, refetch: refetchThread } = useQuery<{ success: boolean; ticket: SupportTicket; messages: TicketMessage[] }>({
    queryKey: ['portalTicketThread', selectedTicketId, token],
    queryFn: async () => {
      if (!selectedTicketId) return null as any;
      const res = await fetch(`${API}/api/public/portal/tickets/${selectedTicketId}`, {
        headers: { 'X-Portal-Token': token },
      });
      if (!res.ok) throw new Error('Failed to load ticket thread');
      return res.json();
    },
    enabled: !!selectedTicketId && !!token,
    refetchInterval: 10000,
  });

  // 3. Real-time WebSocket Sync
  useEffect(() => {
    if (!clientId) return;
    const client = createSyncClient({
      plane: 'client',
      token,
      channels: [`client:${clientId}:tickets`],
      onEvent: (e) => {
        if (e.type === 'TICKET_CREATED' || e.type === 'TICKET_UPDATED' || e.type === 'TICKET_MESSAGE_ADDED') {
          queryClient.invalidateQueries({ queryKey: ['portalTickets', token] });
          queryClient.invalidateQueries({ queryKey: ['portalTicketThread', selectedTicketId, token] });
        }
      }
    });
    client.connect();
    return () => {
      client.disconnect();
    };
  }, [clientId, token, selectedTicketId, queryClient]);

  // 4. Create Ticket Mutation
  const createTicketMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${API}/api/public/portal/tickets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Portal-Token': token },
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
        throw new Error(err.error || 'Failed to raise ticket');
      }
      return res.json();
    },
    onSuccess: (d) => {
      setIsRaiseModalOpen(false);
      setSubject('');
      setDescription('');
      setFormError('');
      queryClient.invalidateQueries({ queryKey: ['portalTickets', token] });
      if (d.ticketId) setSelectedTicketId(d.ticketId);
    },
    onError: (err: any) => {
      setFormError(err.message || 'Failed to raise ticket');
    },
  });

  // 5. Send Reply Mutation
  const sendReplyMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTicketId || !replyText.trim()) return;
      const res = await fetch(`${API}/api/public/portal/tickets/${selectedTicketId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Portal-Token': token },
        body: JSON.stringify({ message: replyText.trim() }),
      });
      if (!res.ok) throw new Error('Failed to send reply');
      return res.json();
    },
    onSuccess: () => {
      setReplyText('');
      refetchThread();
      queryClient.invalidateQueries({ queryKey: ['portalTickets', token] });
    },
  });

  // 6. Submit CSAT Mutation
  const submitCsatMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTicketId) return;
      const res = await fetch(`${API}/api/public/portal/tickets/${selectedTicketId}/satisfaction`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Portal-Token': token },
        body: JSON.stringify({ rating: csatRating, feedback: csatFeedback }),
      });
      if (!res.ok) throw new Error('Failed to submit satisfaction feedback');
      return res.json();
    },
    onSuccess: () => {
      setCsatSubmitted(true);
      refetchThread();
      queryClient.invalidateQueries({ queryKey: ['portalTickets', token] });
    },
  });

  // 7. Close Ticket Mutation
  const closeTicketMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTicketId) return;
      const res = await fetch(`${API}/api/public/portal/tickets/${selectedTicketId}/close`, {
        method: 'POST',
        headers: { 'X-Portal-Token': token },
      });
      if (!res.ok) throw new Error('Failed to close ticket');
      return res.json();
    },
    onSuccess: () => {
      refetchThread();
      queryClient.invalidateQueries({ queryKey: ['portalTickets', token] });
    },
  });

  const tickets = data?.tickets || [];
  const kanban = data?.kanban || { active: [], awaiting_user: [], resolved: [] };
  const currentTicket = threadData?.ticket;
  const messages = threadData?.messages || [];

  return (
    <div className="space-y-6">
      {/* Top Banner & Action Header */}
      <div className="rounded-3xl border border-brand-navy/10 bg-gradient-to-r from-brand-cream/80 via-white to-brand-cream/40 p-6 md:p-8 backdrop-blur-md shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <span className="text-xl">🎧</span>
              <span className="text-[11px] font-black uppercase tracking-wider text-brand-gold bg-brand-navy px-2.5 py-0.5 rounded-full">
                Helpdesk & Resolution Center
              </span>
              <span className="text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2 py-0.5 rounded-full">
                ⚡ Avg. Response &lt; 2 Hrs
              </span>
            </div>
            <h1 className="text-2xl md:text-3xl font-display font-black text-brand-navy">
              Need Assistance or Found an Issue?
            </h1>
            <p className="text-sm text-brand-navy/70 mt-1 max-w-xl">
              Raise a support ticket directly to our senior counselor desk. Every ticket is backed by guaranteed SLA response times and real-time status updates.
            </p>
          </div>
          <button
            onClick={() => setIsRaiseModalOpen(true)}
            className="flex items-center justify-center gap-2 bg-gradient-to-r from-brand-gold to-amber-500 hover:from-brand-gold-hover hover:to-amber-600 text-brand-navy font-black text-sm px-6 py-3.5 rounded-2xl shadow-md transition-all transform hover:-translate-y-0.5 active:translate-y-0 cursor-pointer"
          >
            <span>➕</span>
            <span>Raise New Ticket</span>
          </button>
        </div>

        {/* Telemetry Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-6 pt-6 border-t border-brand-navy/10">
          <div className="p-3 bg-white/80 rounded-2xl border border-brand-navy/5">
            <div className="text-[11px] font-bold uppercase text-brand-navy/50">Total Tickets</div>
            <div className="text-2xl font-black text-brand-navy">{tickets.length}</div>
          </div>
          <div className="p-3 bg-white/80 rounded-2xl border border-brand-navy/5">
            <div className="text-[11px] font-bold uppercase text-blue-600">Active / In Review</div>
            <div className="text-2xl font-black text-blue-700">{kanban.active.length}</div>
          </div>
          <div className="p-3 bg-white/80 rounded-2xl border border-brand-navy/5">
            <div className="text-[11px] font-bold uppercase text-amber-600">Action Required</div>
            <div className="text-2xl font-black text-amber-700">{kanban.awaiting_user.length}</div>
          </div>
          <div className="p-3 bg-white/80 rounded-2xl border border-brand-navy/5">
            <div className="text-[11px] font-bold uppercase text-emerald-600">Resolved & Closed</div>
            <div className="text-2xl font-black text-emerald-700">{kanban.resolved.length}</div>
          </div>
        </div>
      </div>

      {/* Main 3-Column Client Kanban Board */}
      <div className="grid md:grid-cols-3 gap-6">
        {/* Column 1: Active / In Progress */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-blue-500"></span>
              <span className="text-xs font-black uppercase tracking-wider text-brand-navy">Active / In Review</span>
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
                <TicketCard key={t.id} ticket={t} isSelected={selectedTicketId === t.id} onClick={() => setSelectedTicketId(t.id)} />
              ))
            )}
          </div>
        </div>

        {/* Column 2: Awaiting Your Action */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-amber-500 animate-pulse"></span>
              <span className="text-xs font-black uppercase tracking-wider text-brand-navy">Awaiting Your Reply</span>
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
                <TicketCard key={t.id} ticket={t} isSelected={selectedTicketId === t.id} onClick={() => setSelectedTicketId(t.id)} />
              ))
            )}
          </div>
        </div>

        {/* Column 3: Resolved & Closed */}
        <div className="space-y-3">
          <div className="flex items-center justify-between px-2">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
              <span className="text-xs font-black uppercase tracking-wider text-brand-navy">Resolved & Closed</span>
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
                <TicketCard key={t.id} ticket={t} isSelected={selectedTicketId === t.id} onClick={() => setSelectedTicketId(t.id)} />
              ))
            )}
          </div>
        </div>
      </div>

      {/* Ticket Detail & Thread Modal / Drawer */}
      {selectedTicketId && currentTicket && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-navy/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl border border-brand-navy/10 w-full max-w-2xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
            {/* Header */}
            <div className="p-5 border-b border-brand-navy/10 flex items-center justify-between bg-brand-cream/40">
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-black px-2.5 py-0.5 rounded-md bg-brand-navy text-brand-gold font-mono">
                    {currentTicket.ticketNumber}
                  </span>
                  <StatusBadge status={currentTicket.status} />
                  <PriorityBadge priority={currentTicket.priority} />
                </div>
                <h3 className="text-base font-black text-brand-navy mt-1.5 line-clamp-1">{currentTicket.subject}</h3>
              </div>
              <button
                onClick={() => { setSelectedTicketId(null); setCsatSubmitted(false); }}
                className="p-2 rounded-xl text-brand-navy/40 hover:text-brand-navy hover:bg-brand-navy/5 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {/* Conversation Messages Container */}
            <div className="p-5 overflow-y-auto flex-1 space-y-4 bg-slate-50/50">
              {messages.map((m) => {
                const isMe = m.senderType === 'client';
                return (
                  <div key={m.id} className={`flex flex-col ${isMe ? 'items-end' : 'items-start'}`}>
                    <div className="text-[11px] font-bold text-brand-navy/40 mb-1 px-1">
                      {isMe ? 'You' : m.senderName || 'Opus Support Specialist'} • {new Date(m.createdAt * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                    <div
                      className={`p-3.5 rounded-2xl max-w-[85%] text-xs leading-relaxed ${
                        isMe
                          ? 'bg-brand-navy text-white rounded-tr-none shadow-sm'
                          : 'bg-white text-brand-navy border border-brand-navy/10 rounded-tl-none shadow-sm'
                      }`}
                    >
                      <div className="whitespace-pre-wrap">{m.message}</div>
                    </div>
                  </div>
                );
              })}

              {/* Status Alert Banner if Waiting on User */}
              {currentTicket.status === 'waiting_on_user' && (
                <div className="p-3 bg-amber-50 border border-amber-200 rounded-2xl text-xs text-amber-800 flex items-center gap-2">
                  <span>⚠️</span>
                  <span><strong>Action Needed:</strong> Our support desk has requested more details. Send a reply below to update the ticket.</span>
                </div>
              )}

              {/* Resolution CSAT Card if Resolved */}
              {(currentTicket.status === 'resolved' || currentTicket.status === 'closed') && (
                <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl space-y-2.5">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-black text-emerald-900">✨ Issue Marked as Resolved</span>
                    {currentTicket.status === 'resolved' && (
                      <button
                        onClick={() => closeTicketMutation.mutate()}
                        disabled={closeTicketMutation.isPending}
                        className="text-[11px] font-bold bg-emerald-600 hover:bg-emerald-700 text-white px-3 py-1 rounded-lg cursor-pointer transition-colors"
                      >
                        {closeTicketMutation.isPending ? 'Closing...' : 'Confirm & Close Ticket'}
                      </button>
                    )}
                  </div>

                  {!currentTicket.satisfactionRating && !csatSubmitted ? (
                    <div className="pt-2 border-t border-emerald-200/60 space-y-2">
                      <div className="text-[11px] font-bold text-emerald-800">How would you rate our assistance?</div>
                      <div className="flex items-center gap-1.5">
                        {[1, 2, 3, 4, 5].map((star) => (
                          <button
                            key={star}
                            onClick={() => setCsatRating(star)}
                            className={`text-lg p-1 transition-transform ${csatRating >= star ? 'text-amber-500 scale-110' : 'text-slate-300'}`}
                          >
                            ★
                          </button>
                        ))}
                      </div>
                      <input
                        type="text"
                        placeholder="Optional comments regarding your experience..."
                        value={csatFeedback}
                        onChange={(e) => setCsatFeedback(e.target.value)}
                        className="w-full text-xs p-2 bg-white border border-emerald-200 rounded-xl focus:outline-none focus:border-emerald-500"
                      />
                      <button
                        onClick={() => submitCsatMutation.mutate()}
                        disabled={submitCsatMutation.isPending}
                        className="text-xs font-black bg-brand-navy text-brand-gold px-4 py-1.5 rounded-xl cursor-pointer"
                      >
                        {submitCsatMutation.isPending ? 'Submitting...' : 'Submit Rating'}
                      </button>
                    </div>
                  ) : (
                    <div className="text-[11px] font-semibold text-emerald-700 pt-1">
                      ⭐ Feedback Recorded: {currentTicket.satisfactionRating || csatRating} / 5 Stars. Thank you!
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Reply Composer */}
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
                    placeholder="Type your message or response here..."
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    className="flex-1 text-xs p-3 bg-brand-cream/30 border border-brand-navy/10 rounded-2xl focus:outline-none focus:border-brand-gold"
                  />
                  <button
                    type="submit"
                    disabled={!replyText.trim() || sendReplyMutation.isPending}
                    className="bg-brand-navy hover:bg-brand-navy/90 disabled:opacity-50 text-brand-gold font-black text-xs px-5 py-3 rounded-2xl cursor-pointer transition-colors shadow-sm"
                  >
                    {sendReplyMutation.isPending ? 'Sending...' : 'Reply'}
                  </button>
                </form>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Raise Ticket Modal */}
      {isRaiseModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-brand-navy/60 backdrop-blur-sm animate-fade-in">
          <div className="bg-white rounded-3xl border border-brand-navy/10 w-full max-w-lg shadow-2xl p-6 md:p-8 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-brand-navy/10">
              <div className="flex items-center gap-2">
                <span className="text-xl">📝</span>
                <h3 className="text-lg font-black text-brand-navy">Raise a Support Ticket</h3>
              </div>
              <button onClick={() => setIsRaiseModalOpen(false)} className="text-brand-navy/40 hover:text-brand-navy">✕</button>
            </div>

            {formError && (
              <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-2xl">{formError}</div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                createTicketMutation.mutate();
              }}
              className="space-y-4 text-xs"
            >
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-brand-navy/70 mb-1">Division</label>
                  <select
                    value={division}
                    onChange={(e) => setDivision(e.target.value)}
                    className="w-full p-2.5 bg-brand-cream/30 border border-brand-navy/10 rounded-xl focus:outline-none focus:border-brand-gold font-medium"
                  >
                    <option value="general">General Support</option>
                    <option value="study-abroad">Study Abroad</option>
                    <option value="visa">Visa Preparation</option>
                    <option value="umrah">Tours & Travels (Umrah)</option>
                    <option value="attestation">Certificate Attestation</option>
                    <option value="manpower">Manpower Recruitment</option>
                    <option value="billing">Billing & Invoices</option>
                    <option value="technical">Technical Portal Issue</option>
                  </select>
                </div>

                <div>
                  <label className="block font-bold text-brand-navy/70 mb-1">Priority</label>
                  <select
                    value={priority}
                    onChange={(e) => setPriority(e.target.value as any)}
                    className="w-full p-2.5 bg-brand-cream/30 border border-brand-navy/10 rounded-xl focus:outline-none focus:border-brand-gold font-medium"
                  >
                    <option value="low">Low (48h SLA)</option>
                    <option value="medium">Medium (24h SLA)</option>
                    <option value="high">High (6h SLA)</option>
                    <option value="urgent">Urgent (2h SLA)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-bold text-brand-navy/70 mb-1">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="w-full p-2.5 bg-brand-cream/30 border border-brand-navy/10 rounded-xl focus:outline-none focus:border-brand-gold font-medium"
                >
                  <option value="application_status">Application Status Follow-up</option>
                  <option value="document_issue">Document Upload / Verification Query</option>
                  <option value="payment_billing">Payment Receipt / Refund Query</option>
                  <option value="visa_query">Embassy / Visa Appointment Query</option>
                  <option value="booking_change">Booking Modification / Dates</option>
                  <option value="technical_bug">Portal / Login Issue</option>
                  <option value="escalation">Urgent Escalation</option>
                  <option value="other">Other Inquiry</option>
                </select>
              </div>

              <div>
                <label className="block font-bold text-brand-navy/70 mb-1">Subject</label>
                <input
                  type="text"
                  required
                  placeholder="Brief summary of your query..."
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="w-full p-2.5 bg-brand-cream/30 border border-brand-navy/10 rounded-xl focus:outline-none focus:border-brand-gold font-medium"
                />
              </div>

              <div>
                <label className="block font-bold text-brand-navy/70 mb-1">Description</label>
                <textarea
                  required
                  rows={4}
                  placeholder="Please provide full details so our team can resolve your ticket promptly..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="w-full p-2.5 bg-brand-cream/30 border border-brand-navy/10 rounded-xl focus:outline-none focus:border-brand-gold font-medium"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-brand-navy/10">
                <button
                  type="button"
                  onClick={() => setIsRaiseModalOpen(false)}
                  className="px-4 py-2 text-brand-navy/60 font-bold hover:text-brand-navy"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={createTicketMutation.isPending}
                  className="bg-brand-navy hover:bg-brand-navy/90 text-brand-gold font-black px-6 py-2.5 rounded-xl shadow-md transition-all cursor-pointer"
                >
                  {createTicketMutation.isPending ? 'Submitting...' : 'Submit Ticket'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// Sub-components
// ----------------------------------------------------------------------------
function TicketCard({ ticket, isSelected, onClick }: { ticket: SupportTicket; isSelected: boolean; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      className={`p-4 rounded-2xl bg-white border cursor-pointer transition-all hover:shadow-md ${
        isSelected ? 'border-brand-gold ring-2 ring-brand-gold/30 bg-amber-50/20' : 'border-brand-navy/10 hover:border-brand-navy/30'
      }`}
    >
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <span className="text-[10px] font-black px-2 py-0.5 rounded bg-brand-navy/10 text-brand-navy font-mono">
          {ticket.ticketNumber}
        </span>
        <PriorityBadge priority={ticket.priority} />
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

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    open: { label: 'Open', cls: 'bg-blue-50 text-blue-700 border-blue-200' },
    in_progress: { label: 'In Progress', cls: 'bg-indigo-50 text-indigo-700 border-indigo-200' },
    waiting_on_user: { label: 'Awaiting Action', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
    resolved: { label: 'Resolved', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    closed: { label: 'Closed', cls: 'bg-slate-100 text-slate-700 border-slate-200' },
  };
  const s = map[status] || { label: status, cls: 'bg-slate-100 text-slate-700' };
  return <span className={`text-[10px] font-black px-2 py-0.5 rounded-full border ${s.cls}`}>{s.label}</span>;
}

function PriorityBadge({ priority }: { priority: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    low: { label: 'Low', cls: 'bg-slate-100 text-slate-600' },
    medium: { label: 'Medium', cls: 'bg-blue-50 text-blue-600' },
    high: { label: 'High', cls: 'bg-amber-50 text-amber-700 font-bold' },
    urgent: { label: 'Urgent', cls: 'bg-rose-50 text-rose-700 font-black animate-pulse' },
  };
  const p = map[priority] || { label: priority, cls: 'bg-slate-100 text-slate-600' };
  return <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded ${p.cls}`}>{p.label}</span>;
}
