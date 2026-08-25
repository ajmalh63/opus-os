import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';

export interface ClientFeedbackModalProps {
  open: boolean;
  onClose: () => void;
  clientName?: string;
  division?: string;
  counselorName?: string;
  portalToken?: string;
}

export default function ClientFeedbackModal({
  open,
  onClose,
  clientName = '',
  division = 'general',
  counselorName = '',
  portalToken,
}: ClientFeedbackModalProps) {
  const queryClient = useQueryClient();
  const [rating, setRating] = useState<number>(5);
  const [hoverRating, setHoverRating] = useState<number>(0);
  const [name, setName] = useState(clientName);
  const [selectedDivision, setSelectedDivision] = useState(division);
  const [title, setTitle] = useState('');
  const [comment, setComment] = useState('');
  const [counselor, setCounselor] = useState(counselorName);
  const [consent, setConsent] = useState(true);
  const [submitted, setSubmitted] = useState(false);

  const mutation = useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/public/feedback', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(portalToken ? { 'X-Portal-Token': portalToken } : {}),
        },
        body: JSON.stringify({
          clientName: name.trim() || 'Valued Client',
          rating,
          division: selectedDivision,
          title: title.trim() || undefined,
          comment: comment.trim(),
          counselorName: counselor.trim() || undefined,
          consentToPublish: consent,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to submit feedback');
      }
      return res.json();
    },
    onSuccess: () => {
      setSubmitted(true);
      queryClient.invalidateQueries({ queryKey: ['approvedFeedback'] });
      queryClient.invalidateQueries({ queryKey: ['adminFeedback'] });
      setTimeout(() => {
        setSubmitted(false);
        onClose();
        setTitle('');
        setComment('');
      }, 2000);
    },
  });

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
    >
      <div className="absolute inset-0 bg-brand-navy/60 backdrop-blur-sm" onClick={onClose} aria-hidden />
      <div className="relative w-full max-w-lg bg-white rounded-3xl border border-brand-navy/10 shadow-2xl p-6 sm:p-7 space-y-5 max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xl">⭐</span>
              <h3 className="font-display font-bold text-lg text-brand-navy">Share Your Experience & Review</h3>
            </div>
            <p className="text-xs text-slate-500 mt-1">
              Help us maintain our gold standard of transparent, verified service.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 grid place-items-center text-slate-600 cursor-pointer shrink-0"
          >
            ✕
          </button>
        </div>

        {submitted ? (
          <div className="p-6 rounded-2xl bg-emerald-50 border border-emerald-200 text-center space-y-2">
            <div className="text-3xl">🎉</div>
            <h4 className="font-bold text-emerald-900 text-sm">Thank You for Your Feedback!</h4>
            <p className="text-xs text-emerald-700">Your review helps future applicants and keeps our service honest.</p>
          </div>
        ) : (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (!comment.trim()) return;
              mutation.mutate();
            }}
            className="space-y-4"
          >
            {/* Star Rating Picker */}
            <div className="space-y-1 text-center bg-[#FAF8F4] p-4 rounded-2xl border border-brand-navy/10">
              <label className="text-xs font-bold uppercase tracking-wider text-brand-navy block">
                Overall Satisfaction Rating
              </label>
              <div className="flex items-center justify-center gap-2 pt-1">
                {[1, 2, 3, 4, 5].map((star) => (
                  <button
                    key={star}
                    type="button"
                    onClick={() => setRating(star)}
                    onMouseEnter={() => setHoverRating(star)}
                    onMouseLeave={() => setHoverRating(0)}
                    className="text-3xl transition-transform hover:scale-125 focus:outline-none cursor-pointer"
                  >
                    {star <= (hoverRating || rating) ? '⭐' : '☆'}
                  </button>
                ))}
              </div>
              <p className="text-[11px] font-bold text-brand-navy/70 pt-1">
                {rating === 5 ? '⭐⭐⭐⭐⭐ Exceptional & Fast' : rating === 4 ? '⭐⭐⭐⭐ Great Experience' : rating === 3 ? '⭐⭐⭐ Satisfactory' : '⚠️ Needs Improvement'}
              </p>
            </div>

            {/* Division & Name */}
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold uppercase text-brand-navy/60 block mb-1">Your Name / Initials</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Rahul Sharma"
                  className="w-full text-xs border border-brand-navy/15 rounded-xl px-3 py-2 text-brand-navy font-medium focus:ring-1 focus:ring-brand-gold outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase text-brand-navy/60 block mb-1">Division / Service</label>
                <select
                  value={selectedDivision}
                  onChange={(e) => setSelectedDivision(e.target.value)}
                  className="w-full text-xs border border-brand-navy/15 rounded-xl px-3 py-2 text-brand-navy font-medium focus:ring-1 focus:ring-brand-gold outline-none bg-white"
                >
                  <option value="general">General Advisory</option>
                  <option value="study-abroad">Study Abroad Admissions</option>
                  <option value="visa">Visa Filing & Prep</option>
                  <option value="umrah">Umrah & Travel</option>
                  <option value="attestation">Document Attestation</option>
                  <option value="manpower">Manpower Placement</option>
                </select>
              </div>
            </div>

            {/* Review Title & Counselor */}
            <div className="grid sm:grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] font-bold uppercase text-brand-navy/60 block mb-1">Headline (Optional)</label>
                <input
                  type="text"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="e.g. Got my German visa in 14 days!"
                  className="w-full text-xs border border-brand-navy/15 rounded-xl px-3 py-2 text-brand-navy font-medium focus:ring-1 focus:ring-brand-gold outline-none"
                />
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase text-brand-navy/60 block mb-1">Counselor Name (Optional)</label>
                <input
                  type="text"
                  value={counselor}
                  onChange={(e) => setCounselor(e.target.value)}
                  placeholder="e.g. S. Sharma"
                  className="w-full text-xs border border-brand-navy/15 rounded-xl px-3 py-2 text-brand-navy font-medium focus:ring-1 focus:ring-brand-gold outline-none"
                />
              </div>
            </div>

            {/* Review Body */}
            <div>
              <label className="text-[10px] font-bold uppercase text-brand-navy/60 block mb-1">Your Detailed Experience *</label>
              <textarea
                rows={3}
                required
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                placeholder="Tell us what went well, how clear the process was, or what we can improve..."
                className="w-full text-xs border border-brand-navy/15 rounded-xl px-3 py-2 text-brand-navy font-medium focus:ring-1 focus:ring-brand-gold outline-none resize-none"
              />
            </div>

            {/* Consent to Feature */}
            <div className="flex items-start gap-2.5 pt-1">
              <input
                type="checkbox"
                id="consentPublish"
                checked={consent}
                onChange={(e) => setConsent(e.target.checked)}
                className="rounded border-brand-navy/20 text-brand-navy focus:ring-brand-gold mt-0.5"
              />
              <label htmlFor="consentPublish" className="text-[11px] text-slate-600 leading-tight cursor-pointer">
                I agree to have my review featured publicly on the Opus Overseas platform (last name will be formatted with initial for privacy).
              </label>
            </div>

            {mutation.isError && (
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs">
                {(mutation.error as Error).message || 'Submission failed'}
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 py-2.5 rounded-full border border-slate-200 bg-white text-slate-700 text-xs font-bold hover:bg-slate-50 cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={mutation.isPending || !comment.trim()}
                className="flex-1 py-2.5 rounded-full bg-brand-navy hover:bg-brand-gold hover:text-brand-navy text-white text-xs font-bold transition-all shadow-xs disabled:opacity-40 cursor-pointer"
              >
                {mutation.isPending ? 'Submitting…' : 'Submit 5-Star Review →'}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
