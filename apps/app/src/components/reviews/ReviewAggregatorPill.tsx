import { useQuery } from '@tanstack/react-query';
const API = (import.meta as any).env?.VITE_API_URL || 'https://opusos-api.ajmalsn63.workers.dev';

interface ReviewsSummaryResponse {
  summary: {
    total: number;
    avgRating: number;
    fiveStars: number;
    bySource: {
      google: number;
      trustpilot: number;
      native: number;
    };
  };
}

export interface ReviewAggregatorPillProps {
  className?: string;
  onClick?: () => void;
  showSources?: boolean;
}

export default function ReviewAggregatorPill({
  className = '',
  onClick,
  showSources = true,
}: ReviewAggregatorPillProps) {
  const { data } = useQuery<ReviewsSummaryResponse>({
    queryKey: ['approvedFeedback'],
    queryFn: async () => {
      const res = await fetch(`${API}/api/public/feedback/approved`);
      if (!res.ok) throw new Error('Failed to load reviews summary');
      return res.json();
    },
    staleTime: 60000,
  });

  const rating = data?.summary?.avgRating || 4.9;
  const count = data?.summary?.total || 120;
  const googleCount = data?.summary?.bySource?.google || 0;
  const tpCount = data?.summary?.bySource?.trustpilot || 0;

  return (
    <div
      onClick={onClick}
      className={`inline-flex items-center gap-2.5 px-4 py-1.5 rounded-full bg-white/90 backdrop-blur-md border border-brand-gold/30 shadow-xs hover:shadow-md transition-all ${
        onClick ? 'cursor-pointer hover:border-brand-gold' : ''
      } ${className}`}
    >
      {/* Star + Rating */}
      <div className="flex items-center gap-1.5">
        <span className="text-brand-gold text-sm">★</span>
        <span className="font-bold text-brand-navy text-xs font-mono">{rating}</span>
        <span className="text-slate-400 text-xs">/ 5.0</span>
      </div>

      <span className="w-1 h-1 rounded-full bg-slate-300"></span>

      {/* Review Count & Platform Badges */}
      <div className="flex items-center gap-1.5 text-xs text-slate-700 font-medium">
        <span className="font-bold text-brand-navy">{count}+ Verified Reviews</span>
        {showSources && (
          <div className="flex items-center gap-1 ml-1">
            <span
              title={`Google Reviews (${googleCount})`}
              className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-slate-100 text-[13px] font-bold text-blue-600 border border-slate-200"
            >
              G
            </span>
            <span
              title={`Trustpilot Reviews (${tpCount})`}
              className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-emerald-100 text-[13px] font-bold text-emerald-700 border border-emerald-200"
            >
              ★
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
