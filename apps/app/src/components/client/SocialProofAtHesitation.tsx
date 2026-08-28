import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import ClientFeedbackModal from './ClientFeedbackModal';
const API = (import.meta as any).env?.VITE_API_URL || 'https://opusos-api.ajmalsn63.workers.dev';

export interface ReviewItem {
  id: string;
  clientName: string;
  division: string;
  rating: number;
  title?: string | null;
  comment: string;
  counselorName?: string | null;
  createdAt: number;
}

const divisionLabels: Record<string, string> = {
  'study-abroad': '🎓 Study Abroad',
  visa: '🛂 Visa Processing',
  umrah: '🕋 Umrah Pilgrimage',
  attestation: '📜 Document Attestation',
  manpower: '💼 Global Placement',
  general: '⭐ Verified Client',
};

export default function SocialProofAtHesitation({
  portalToken,
  clientName,
  division,
  counselorName,
}: {
  portalToken?: string;
  clientName?: string;
  division?: string;
  counselorName?: string;
}) {
  const [showModal, setShowModal] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);

  const { data } = useQuery<{ reviews: ReviewItem[] }>({
    queryKey: ['approvedFeedback'],
    queryFn: async () => {
      const res = await fetch(`${API}/api/public/feedback/approved`);
      if (!res.ok) return { reviews: [] };
      return res.json();
    },
    staleTime: 60000,
  });

  const reviews = data?.reviews || [];
  const hasReviews = reviews.length > 0;

  // Auto-advance carousel every 6 seconds if multiple reviews exist
  useEffect(() => {
    if (reviews.length <= 1) return;
    const timer = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % reviews.length);
    }, 6000);
    return () => clearInterval(timer);
  }, [reviews.length]);

  const activeReview = reviews[currentIndex] || null;

  return (
    <>
      <div className="bg-white rounded-3xl border border-brand-navy/10 p-5 md:p-6 shadow-sm space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-brand-gold animate-pulse" />
            <p className="text-sm font-black tracking-[0.12em] text-brand-navy uppercase">
              {hasReviews ? 'VERIFIED CLIENT OUTCOMES & REVIEWS' : 'HOW WE BUILD TRUST — HONESTLY'}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="text-[13px] font-bold text-brand-navy hover:text-brand-gold transition-colors flex items-center gap-1 cursor-pointer"
          >
            <span>⭐ Share Feedback</span>
            <span>→</span>
          </button>
        </div>

        {hasReviews && activeReview ? (
          /* DYNAMIC 5-STAR REVIEWS CAROUSEL */
          <div className="relative rounded-2xl bg-gradient-to-br from-[#FFFDF9] to-[#FAF6EE] border border-[#EDE8DC] p-4 sm:p-5 space-y-3 transition-all duration-300 shadow-2xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div className="flex text-amber-500 text-sm">
                  {Array.from({ length: 5 }).map((_, i) => (
                    <span key={i}>{i < activeReview.rating ? '★' : '☆'}</span>
                  ))}
                </div>
                <span className="text-sm font-bold text-brand-navy">{activeReview.clientName}</span>
                <span className="px-2 py-0.5 rounded-full bg-emerald-100/80 border border-emerald-300 text-emerald-900 text-xs font-bold">
                  ✓ Verified
                </span>
              </div>
              <span className="text-[13px] font-semibold text-slate-500 bg-white/80 border border-slate-200/80 px-2 py-0.5 rounded-md">
                {divisionLabels[activeReview.division] || activeReview.division}
              </span>
            </div>

            {activeReview.title && (
              <p className="font-bold text-xs text-brand-navy leading-snug">
                "{activeReview.title}"
              </p>
            )}

            <p className="text-xs text-slate-700 leading-relaxed italic">
              "{activeReview.comment}"
            </p>

            {activeReview.counselorName && (
              <p className="text-[13px] text-slate-500 font-medium">
                Guidance by Counselor: <span className="font-bold text-brand-navy">{activeReview.counselorName}</span>
              </p>
            )}

            {/* Carousel Navigation & Dots */}
            {reviews.length > 1 && (
              <div className="flex items-center justify-between pt-2 border-t border-[#EDE8DC]">
                <div className="flex items-center gap-1.5">
                  {reviews.map((_, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setCurrentIndex(idx)}
                      aria-label={`Go to review ${idx + 1}`}
                      className={`h-1.5 rounded-full transition-all cursor-pointer ${
                        idx === currentIndex ? 'w-5 bg-brand-navy' : 'w-1.5 bg-slate-300'
                      }`}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setCurrentIndex((prev) => (prev === 0 ? reviews.length - 1 : prev - 1))}
                    aria-label="Previous review"
                    className="w-6 h-6 rounded-full bg-white border border-slate-200 grid place-items-center text-xs text-slate-600 hover:bg-slate-50 cursor-pointer shadow-2xs"
                  >
                    ‹
                  </button>
                  <button
                    type="button"
                    onClick={() => setCurrentIndex((prev) => (prev + 1) % reviews.length)}
                    aria-label="Next review"
                    className="w-6 h-6 rounded-full bg-white border border-slate-200 grid place-items-center text-xs text-slate-600 hover:bg-slate-50 cursor-pointer shadow-2xs"
                  >
                    ›
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          /* HONEST EMPTY STATE BEFORE FIRST REVIEWS */
          <>
            <div className="p-4 rounded-2xl bg-[#FFFBF0] border border-[#EDE8DC] text-xs leading-relaxed space-y-2">
              <p className="font-bold text-brand-navy">No fake reviews yet — and that’s honest.</p>
              <p className="text-slate-600">
                Real client stories appear here after our first journeys — with permission. For now, trust comes from{' '}
                <span className="font-semibold text-slate-700">transparent steps, live updates, and no inflated numbers.</span>
              </p>
              <button
                type="button"
                onClick={() => setShowModal(true)}
                className="mt-2 text-sm font-bold text-brand-navy hover:text-brand-gold transition-colors inline-flex items-center gap-1 cursor-pointer underline"
              >
                Be the first to share your journey →
              </button>
            </div>
            <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 text-xs">
              <p className="font-semibold text-slate-700">What you’ll see here after launch:</p>
              <ul className="mt-1.5 space-y-1 text-slate-600 list-disc list-inside text-sm">
                <li>Real, verifiable client outcomes (with consent)</li>
                <li>Transparent timelines — no hidden steps</li>
                <li>Your story could be first — helped with care</li>
              </ul>
            </div>
          </>
        )}

        <div className="flex items-center justify-between text-[13px] text-slate-400">
          <span>Building in public • Live client reviews</span>
          <button
            type="button"
            onClick={() => setShowModal(true)}
            className="font-bold text-brand-navy hover:text-brand-gold transition-colors cursor-pointer"
          >
            + Rate Your Counselor
          </button>
        </div>
      </div>

      <ClientFeedbackModal
        open={showModal}
        onClose={() => setShowModal(false)}
        clientName={clientName}
        division={division}
        counselorName={counselorName}
        portalToken={portalToken}
      />
    </>
  );
}
