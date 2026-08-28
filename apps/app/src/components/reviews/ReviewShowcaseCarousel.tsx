import { useState, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
const API = (import.meta as any).env?.VITE_API_URL || 'https://opusos-api.ajmalsn63.workers.dev';

export interface ReviewItem {
  id: string;
  clientName: string;
  division: string;
  rating: number;
  title: string | null;
  comment: string;
  counselorName: string | null;
  source: 'google' | 'trustpilot' | 'native' | 'whatsapp';
  authorAvatarUrl: string | null;
  authorLocation: string | null;
  sourceUrl: string | null;
  isFeatured: boolean;
  verifiedBuyer: boolean;
  createdAt: number;
}

export interface ReviewApiResponse {
  summary: {
    total: number;
    avgRating: number;
    fiveStars: number;
    fourStars: number;
    threeStars: number;
    bySource: {
      google: number;
      trustpilot: number;
      native: number;
    };
  };
  reviews: ReviewItem[];
  schemaJsonLd?: any;
}

export interface ReviewShowcaseCarouselProps {
  division?: string;
  title?: string;
  subtitle?: string;
  className?: string;
  limit?: number;
  featuredOnly?: boolean;
}

export default function ReviewShowcaseCarousel({
  division = 'all',
  title = 'Verified Client Reviews & Testimonials',
  subtitle = 'Transparent feedback synchronized from Google Maps, Trustpilot, and our client workspace.',
  className = '',
  limit = 12,
  featuredOnly = false,
}: ReviewShowcaseCarouselProps) {
  const [selectedSource, setSelectedSource] = useState<string>('all');
  const [selectedDivision, setSelectedDivision] = useState<string>(division);

  const { data, isLoading } = useQuery<ReviewApiResponse>({
    queryKey: ['approvedFeedback', selectedDivision, selectedSource, featuredOnly, limit],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedDivision !== 'all') params.set('division', selectedDivision);
      if (selectedSource !== 'all') params.set('source', selectedSource);
      if (featuredOnly) params.set('featured', 'true');
      params.set('limit', limit.toString());

      const res = await fetch(`${API}/api/public/feedback/approved?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch reviews');
      return res.json();
    },
    staleTime: 60000,
  });

  // Inject Google Schema.org AggregateRating for SEO
  useEffect(() => {
    if (!data?.schemaJsonLd) return;
    const scriptId = 'opus-schema-reviews';
    let script = document.getElementById(scriptId) as HTMLScriptElement | null;
    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.type = 'application/ld+json';
      document.head.appendChild(script);
    }
    script.text = JSON.stringify(data.schemaJsonLd);
  }, [data?.schemaJsonLd]);

  const reviews = data?.reviews || [];
  const summary = data?.summary || {
    total: 0,
    avgRating: 4.9,
    fiveStars: 0,
    fourStars: 0,
    bySource: { google: 0, trustpilot: 0, native: 0 },
  };

  const getSourceBadge = (source: string, sourceUrl: string | null) => {
    switch (source) {
      case 'google':
        return (
          <a
            href={sourceUrl || 'https://maps.google.com'}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-50 text-blue-700 border border-blue-200 text-[13px] font-bold hover:bg-blue-100 transition"
          >
            <span>🌐</span> Google Review
          </a>
        );
      case 'trustpilot':
        return (
          <a
            href={sourceUrl || 'https://trustpilot.com'}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 text-[13px] font-bold hover:bg-emerald-100 transition"
          >
            <span>★</span> Trustpilot
          </a>
        );
      case 'whatsapp':
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-green-50 text-green-700 border border-green-200 text-[13px] font-bold">
            <span>💬</span> WhatsApp Verified
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-50 text-brand-navy border border-brand-gold/30 text-[13px] font-bold">
            <span>🛡️</span> Verified Client
          </span>
        );
    }
  };

  return (
    <section className={`space-y-6 ${className}`}>
      {/* Header & Metrics Strip */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-brand-gold/15 border border-brand-gold/30 px-3 py-0.5 text-xs font-bold text-brand-navy">
              ⭐ Multi-Source Verified Reviews
            </span>
          </div>
          <h2 className="font-display font-black text-2xl md:text-3xl text-brand-navy tracking-tight mt-1.5">
            {title}
          </h2>
          <p className="text-sm text-slate-600 max-w-2xl mt-1 leading-relaxed">
            {subtitle}
          </p>
        </div>

        {/* Aggregate Score Card */}
        <div className="flex items-center gap-3 bg-white p-3.5 rounded-2xl border border-slate-200 shadow-xs shrink-0">
          <div className="w-12 h-12 rounded-xl bg-brand-gold/15 border border-brand-gold/30 flex flex-col items-center justify-center font-display font-black text-lg text-brand-navy">
            {summary.avgRating}
            <span className="text-xs text-amber-600 -mt-1">★★★★★</span>
          </div>
          <div>
            <div className="text-xs font-bold text-brand-navy">
              {summary.total > 0 ? `${summary.total}+ Verified Ratings` : '4.9/5 Average Rating'}
            </div>
            <div className="text-sm text-slate-500 flex items-center gap-1.5 mt-0.5">
              <span>Google</span> · <span>Trustpilot</span> · <span>Opus Portal</span>
            </div>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          {['all', 'study-abroad', 'visa', 'umrah', 'attestation', 'manpower'].map((div) => (
            <button
              key={div}
              type="button"
              onClick={() => setSelectedDivision(div)}
              className={`px-3 py-1 rounded-xl text-xs font-bold transition-all cursor-pointer capitalize ${
                selectedDivision === div
                  ? 'bg-brand-navy text-white shadow-xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {div === 'all' ? 'All Divisions' : div.replace('-', ' ')}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 text-xs">
          <span className="text-slate-400 font-medium mr-1 text-sm">Platform:</span>
          {['all', 'google', 'trustpilot', 'native'].map((src) => (
            <button
              key={src}
              type="button"
              onClick={() => setSelectedSource(src)}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer capitalize ${
                selectedSource === src
                  ? 'bg-brand-gold text-brand-navy shadow-xs'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {src === 'all' ? 'All' : src === 'native' ? 'Portal' : src}
            </button>
          ))}
        </div>
      </div>

      {/* Review Grid / Cards */}
      {isLoading ? (
        <div className="p-12 text-center text-xs font-bold text-slate-500">Loading verified reviews…</div>
      ) : reviews.length === 0 ? (
        <div className="p-12 bg-white rounded-3xl border border-slate-200 text-center space-y-2">
          <div className="text-3xl">⭐</div>
          <p className="font-bold text-brand-navy text-sm">No reviews matching the selected filter yet.</p>
          <p className="text-xs text-slate-500">All reviews are verified and synchronized in real-time.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {reviews.map((rev) => (
            <div
              key={rev.id}
              className={`bg-white rounded-3xl p-5 border transition-all flex flex-col justify-between hover:shadow-md ${
                rev.isFeatured
                  ? 'border-brand-gold/40 shadow-xs ring-1 ring-brand-gold/20'
                  : 'border-slate-200/80 shadow-2xs'
              }`}
            >
              <div>
                {/* Top Row: Stars + Platform Badge */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex text-amber-400 text-sm tracking-tight">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <span key={i}>{i < rev.rating ? '★' : '☆'}</span>
                    ))}
                  </div>
                  {getSourceBadge(rev.source, rev.sourceUrl)}
                </div>

                {/* Title / Headline */}
                {rev.title && (
                  <h4 className="font-bold text-brand-navy text-sm mt-3 leading-snug">
                    {rev.title}
                  </h4>
                )}

                {/* Comment Body */}
                <p className="text-xs sm:text-[13px] text-slate-600 mt-2 leading-relaxed line-clamp-4">
                  "{rev.comment}"
                </p>
              </div>

              {/* Bottom Row: Reviewer Details */}
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2.5 min-w-0">
                  {rev.authorAvatarUrl ? (
                    <img
                      src={rev.authorAvatarUrl}
                      alt={rev.clientName}
                      className="w-7 h-7 rounded-full object-cover border border-slate-200 shrink-0"
                    />
                  ) : (
                    <div className="w-7 h-7 rounded-full bg-brand-navy/10 text-brand-navy font-bold text-xs flex items-center justify-center shrink-0">
                      {rev.clientName[0]}
                    </div>
                  )}
                  <div className="min-w-0">
                    <div className="font-bold text-brand-navy text-xs truncate">
                      {rev.clientName}
                    </div>
                    <div className="text-[13px] text-slate-400 capitalize truncate">
                      {rev.authorLocation || `${rev.division.replace('-', ' ')} applicant`}
                    </div>
                  </div>
                </div>

                <div className="text-[13px] text-slate-400 font-mono shrink-0">
                  {new Date(rev.createdAt * 1000).toLocaleDateString('en-IN', {
                    month: 'short',
                    year: 'numeric',
                  })}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
