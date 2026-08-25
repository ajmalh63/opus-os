import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';

interface FeedbackSubmission {
  id: string;
  clientId: string | null;
  clientName: string;
  division: string;
  rating: number;
  title: string | null;
  comment: string;
  feedbackType: string;
  isPublicApproved: boolean;
  displayOrder: number;
  counselorName: string | null;
  createdAt: number;
}

interface FeedbackApiResponse {
  metrics: {
    total: number;
    avgRating: number;
    fiveStars: number;
    fourStars: number;
    threeOrLess: number;
    approved: number;
    csatPercent: number;
  };
  submissions: FeedbackSubmission[];
}

export default function FeedbackModerationTab() {
  const queryClient = useQueryClient();
  const [filterRating, setFilterRating] = useState<string>('all');
  const [filterDivision, setFilterDivision] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');

  const { data, isLoading, isError } = useQuery<FeedbackApiResponse>({
    queryKey: ['adminFeedback'],
    queryFn: async () => {
      const res = await fetch('/api/admin/feedback');
      if (!res.ok) throw new Error('Failed to fetch feedback');
      return res.json();
    },
    refetchInterval: 30000,
  });

  const moderateMutation = useMutation({
    mutationFn: async ({ id, isPublicApproved }: { id: string; isPublicApproved: boolean }) => {
      const res = await fetch(`/api/admin/feedback/${id}/moderate`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isPublicApproved }),
      });
      if (!res.ok) throw new Error('Failed to update moderation state');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminFeedback'] });
      queryClient.invalidateQueries({ queryKey: ['approvedFeedback'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/feedback/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete feedback');
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['adminFeedback'] });
      queryClient.invalidateQueries({ queryKey: ['approvedFeedback'] });
    },
  });

  const metrics = data?.metrics || {
    total: 0,
    avgRating: 5.0,
    fiveStars: 0,
    fourStars: 0,
    threeOrLess: 0,
    approved: 0,
    csatPercent: 100,
  };

  const submissions = (data?.submissions || []).filter((sub) => {
    if (filterRating !== 'all') {
      if (filterRating === '5' && sub.rating !== 5) return false;
      if (filterRating === '4' && sub.rating !== 4) return false;
      if (filterRating === 'low' && sub.rating > 3) return false;
    }
    if (filterDivision !== 'all' && sub.division !== filterDivision) return false;
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      const matchName = sub.clientName.toLowerCase().includes(q);
      const matchComment = sub.comment.toLowerCase().includes(q);
      const matchTitle = (sub.title || '').toLowerCase().includes(q);
      if (!matchName && !matchComment && !matchTitle) return false;
    }
    return true;
  });

  return (
    <div className="space-y-6">
      {/* 1. CSAT & METRICS STRIP */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="p-4 rounded-2xl bg-white border border-brand-navy/10 shadow-xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-brand-navy/50">Average Rating</p>
          <div className="flex items-baseline gap-1 mt-1">
            <span className="text-2xl font-black text-brand-navy font-mono">{metrics.avgRating}</span>
            <span className="text-amber-500 font-bold">★</span>
          </div>
          <p className="text-[10px] text-emerald-600 font-semibold mt-0.5">{metrics.csatPercent}% CSAT Score</p>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-brand-navy/10 shadow-xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-brand-navy/50">Total Submissions</p>
          <p className="text-2xl font-black text-brand-navy font-mono mt-1">{metrics.total}</p>
          <p className="text-[10px] text-slate-500 mt-0.5">{metrics.fiveStars} five-star ratings</p>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-brand-navy/10 shadow-xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-brand-navy/50">Publicly Featured</p>
          <p className="text-2xl font-black text-brand-gold font-mono mt-1">{metrics.approved}</p>
          <p className="text-[10px] text-slate-500 mt-0.5">Live on client carousels</p>
        </div>

        <div className="p-4 rounded-2xl bg-white border border-brand-navy/10 shadow-xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-brand-navy/50">Detractor Alerts</p>
          <p className={`text-2xl font-black font-mono mt-1 ${metrics.threeOrLess > 0 ? 'text-rose-600' : 'text-slate-400'}`}>
            {metrics.threeOrLess}
          </p>
          <p className="text-[10px] text-slate-500 mt-0.5">Ratings ≤ 3 stars</p>
        </div>
      </div>

      {/* 2. FILTERS & SEARCH */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white p-4 rounded-2xl border border-brand-navy/10 shadow-xs">
        <div className="flex items-center gap-3 flex-wrap">
          <input
            type="text"
            placeholder="Search reviews or clients..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="text-xs border border-brand-navy/15 rounded-xl px-3 py-2 text-brand-navy font-medium outline-none focus:ring-1 focus:ring-brand-gold min-w-[200px]"
          />

          <select
            value={filterRating}
            onChange={(e) => setFilterRating(e.target.value)}
            className="text-xs border border-brand-navy/15 rounded-xl px-3 py-2 text-brand-navy font-medium outline-none focus:ring-1 focus:ring-brand-gold bg-white"
          >
            <option value="all">All Ratings</option>
            <option value="5">5 Stars Only</option>
            <option value="4">4 Stars</option>
            <option value="low">≤ 3 Stars (Detractors)</option>
          </select>

          <select
            value={filterDivision}
            onChange={(e) => setFilterDivision(e.target.value)}
            className="text-xs border border-brand-navy/15 rounded-xl px-3 py-2 text-brand-navy font-medium outline-none focus:ring-1 focus:ring-brand-gold bg-white"
          >
            <option value="all">All Divisions</option>
            <option value="study-abroad">Study Abroad</option>
            <option value="visa">Visa Filing</option>
            <option value="umrah">Umrah</option>
            <option value="attestation">Attestation</option>
            <option value="manpower">Manpower</option>
            <option value="general">General</option>
          </select>
        </div>

        <div className="text-xs font-bold text-slate-500">
          Showing {submissions.length} of {metrics.total} submissions
        </div>
      </div>

      {/* 3. MODERATION DATA TABLE */}
      <div className="bg-white rounded-3xl border border-brand-navy/10 shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-xs font-bold text-slate-500">Loading feedback submissions…</div>
        ) : isError ? (
          <div className="p-8 text-center text-xs font-bold text-rose-500">Failed to load feedback records.</div>
        ) : submissions.length === 0 ? (
          <div className="p-12 text-center space-y-2">
            <div className="text-3xl">💬</div>
            <p className="font-bold text-brand-navy text-sm">No feedback matching current filters.</p>
            <p className="text-xs text-slate-500">Submissions from client portals and reviews will appear here live.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="border-b border-brand-navy/10 bg-[#FAF8F4] text-[10px] font-bold uppercase tracking-wider text-brand-navy/60">
                  <th className="py-3.5 px-4">Rating</th>
                  <th className="py-3.5 px-4">Client & Division</th>
                  <th className="py-3.5 px-4">Review & Headline</th>
                  <th className="py-3.5 px-4">Counselor</th>
                  <th className="py-3.5 px-4">Date</th>
                  <th className="py-3.5 px-4 text-center">Public Carousel</th>
                  <th className="py-3.5 px-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-brand-navy/5">
                {submissions.map((sub) => (
                  <tr key={sub.id} className="hover:bg-slate-50/60 transition-colors">
                    {/* Rating */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="flex text-amber-500 font-bold">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <span key={i}>{i < sub.rating ? '★' : '☆'}</span>
                        ))}
                      </div>
                    </td>

                    {/* Client & Division */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      <div className="font-bold text-brand-navy">{sub.clientName}</div>
                      <div className="text-[10px] text-slate-500 capitalize">{sub.division}</div>
                    </td>

                    {/* Review Body */}
                    <td className="py-3.5 px-4 max-w-sm">
                      {sub.title && <div className="font-bold text-brand-navy truncate">{sub.title}</div>}
                      <div className="text-slate-600 line-clamp-2 leading-relaxed text-[11px]">{sub.comment}</div>
                    </td>

                    {/* Counselor */}
                    <td className="py-3.5 px-4 whitespace-nowrap">
                      {sub.counselorName ? (
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 font-medium text-[10px]">
                          {sub.counselorName}
                        </span>
                      ) : (
                        <span className="text-slate-400 text-[10px]">—</span>
                      )}
                    </td>

                    {/* Date */}
                    <td className="py-3.5 px-4 whitespace-nowrap text-[10px] text-slate-500 font-mono">
                      {new Date(sub.createdAt * 1000).toLocaleDateString('en-IN', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                      })}
                    </td>

                    {/* Public Feature Toggle */}
                    <td className="py-3.5 px-4 text-center whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() =>
                          moderateMutation.mutate({
                            id: sub.id,
                            isPublicApproved: !sub.isPublicApproved,
                          })
                        }
                        className={`px-3 py-1 rounded-full text-[10px] font-bold cursor-pointer transition-all ${
                          sub.isPublicApproved
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-2xs'
                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200 border border-slate-200'
                        }`}
                      >
                        {sub.isPublicApproved ? '✓ Featured' : 'Hidden'}
                      </button>
                    </td>

                    {/* Actions */}
                    <td className="py-3.5 px-4 text-right whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => {
                          if (confirm(`Delete review from ${sub.clientName}?`)) {
                            deleteMutation.mutate(sub.id);
                          }
                        }}
                        className="text-[11px] text-rose-500 hover:text-rose-700 font-bold cursor-pointer"
                      >
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
