// Image placeholder vault (Section 24 design plan): every visual slot renders
// either a real image (when `src` is provided via the images config) or a styled
// placeholder carrying the ready-to-use image prompt. Swap images in
// `src/config/images.ts` — no component changes needed.

const RATIOS: Record<string, string> = {
  '16/9': 'aspect-[16/9]',
  '4/3': 'aspect-[4/3]',
  '3/2': 'aspect-[3/2]',
  '1/1': 'aspect-square',
};

export default function Img({
  prompt,
  ratio = '16/9',
  label,
  src,
  alt,
  className = '',
}: {
  prompt: string;
  ratio?: '16/9' | '4/3' | '3/2' | '1/1';
  label?: string;
  src?: string;
  alt?: string;
  className?: string;
}) {
  const ratioClass = RATIOS[ratio] ?? RATIOS['16/9'];

  if (src) {
    return (
      <div className={`relative overflow-hidden rounded-2xl border border-brand-navy/10 bg-brand-cream ${ratioClass} ${className}`}>
        <img src={src} alt={alt || label || 'Opus Overseas'} loading="lazy" className="absolute inset-0 h-full w-full object-cover" />
      </div>
    );
  }

  return (
    <div
      className={`relative overflow-hidden rounded-2xl border border-brand-gold/30 bg-gradient-to-br from-brand-navy/[0.04] via-white to-brand-gold/[0.06] ${ratioClass} ${className}`}
      title={`IMG PROMPT: ${prompt}`}
    >
      <div className="img-slot-shimmer absolute inset-0" aria-hidden="true" />
      <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
        <svg className="h-7 w-7 text-brand-gold/70" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
          <rect x="3" y="3" width="18" height="18" rx="3" />
          <circle cx="9" cy="9" r="2" />
          <path d="M21 15l-4.5-4.5L7 20" />
        </svg>
        <span className="max-w-[80%] truncate rounded-full border border-brand-gold/30 bg-brand-gold/10 px-2.5 py-1 text-[9px] font-semibold uppercase tracking-wider text-brand-gold">
          {label || 'Image'}
        </span>
        <span className="line-clamp-2 text-[10px] leading-snug text-brand-textLight/70">{prompt}</span>
      </div>
    </div>
  );
}