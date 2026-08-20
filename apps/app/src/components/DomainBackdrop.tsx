export type DomainTheme = 'global' | 'study' | 'visa' | 'umrah' | 'attestation' | 'careers';

export default function DomainBackdrop({
  theme = 'global',
  className = '',
}: {
  theme?: DomainTheme;
  className?: string;
}) {
  return (
    <div className={`pointer-events-none absolute inset-0 overflow-hidden ${className}`} aria-hidden="true">
      {theme === 'global' && (
        <svg className="absolute -right-20 -top-20 h-[38rem] w-[38rem] opacity-[0.06] text-brand-gold" viewBox="0 0 500 500" fill="none" stroke="currentColor">
          <circle cx="250" cy="250" r="200" strokeWidth="1.5" strokeDasharray="6 6" />
          <circle cx="250" cy="250" r="140" strokeWidth="1" />
          <circle cx="250" cy="250" r="80" strokeWidth="1" strokeDasharray="4 4" />
          <path d="M50,250 C120,120 380,120 450,250" strokeWidth="1.5" />
          <path d="M50,250 C120,380 380,380 450,250" strokeWidth="1.5" />
          <path d="M250,50 C120,120 120,380 250,450" strokeWidth="1.5" />
          <path d="M250,50 C380,120 380,380 250,450" strokeWidth="1.5" />
        </svg>
      )}

      {theme === 'study' && (
        <svg className="absolute -left-16 top-1/4 h-[36rem] w-[36rem] opacity-[0.05] text-brand-gold" viewBox="0 0 500 500" fill="none" stroke="currentColor">
          <circle cx="250" cy="250" r="220" strokeWidth="1" />
          <circle cx="250" cy="250" r="180" strokeWidth="1.5" strokeDasharray="8 8" />
          <polygon points="250,30 310,190 470,250 310,310 250,470 190,310 30,250 190,190" strokeWidth="1" />
          <circle cx="250" cy="250" r="60" strokeWidth="2" />
        </svg>
      )}

      {theme === 'visa' && (
        <svg className="absolute -right-24 top-10 h-[40rem] w-[40rem] opacity-[0.06] text-emerald-400" viewBox="0 0 600 600" fill="none" stroke="currentColor">
          <path d="M50,300 Q150,50 300,300 T550,300" strokeWidth="1.5" strokeDasharray="6 4" />
          <path d="M50,250 Q200,100 350,250 T550,250" strokeWidth="1" />
          <path d="M50,350 Q200,500 350,350 T550,350" strokeWidth="1" />
          <circle cx="300" cy="300" r="180" strokeWidth="1.5" strokeDasharray="4 8" />
          <circle cx="300" cy="300" r="120" strokeWidth="1" />
        </svg>
      )}

      {theme === 'umrah' && (
        <svg className="absolute right-0 top-12 h-[38rem] w-[38rem] opacity-[0.07] text-brand-gold" viewBox="0 0 500 500" fill="none" stroke="currentColor">
          <rect x="125" y="125" width="250" height="250" strokeWidth="1.5" />
          <rect x="125" y="125" width="250" height="250" transform="rotate(45 250 250)" strokeWidth="1.5" />
          <circle cx="250" cy="250" r="170" strokeWidth="1" strokeDasharray="5 5" />
          <circle cx="250" cy="250" r="90" strokeWidth="1" />
          <path d="M250,80 Q290,180 250,220 Q210,180 250,80" strokeWidth="1.5" />
          <path d="M250,420 Q290,320 250,280 Q210,320 250,420" strokeWidth="1.5" />
        </svg>
      )}

      {theme === 'attestation' && (
        <svg className="absolute -left-20 top-20 h-[38rem] w-[38rem] opacity-[0.05] text-sky-400" viewBox="0 0 500 500" fill="none" stroke="currentColor">
          <circle cx="250" cy="250" r="210" strokeWidth="2" />
          <circle cx="250" cy="250" r="195" strokeWidth="1" strokeDasharray="3 3" />
          <circle cx="250" cy="250" r="160" strokeWidth="1.5" />
          <circle cx="250" cy="250" r="100" strokeWidth="2" strokeDasharray="8 4" />
          <polygon points="250,90 280,180 370,180 300,230 330,310 250,260 170,310 200,230 130,180 220,180" strokeWidth="1" />
        </svg>
      )}

      {theme === 'careers' && (
        <svg className="absolute -right-16 top-1/3 h-[36rem] w-[36rem] opacity-[0.05] text-brand-gold" viewBox="0 0 500 500" fill="none" stroke="currentColor">
          <line x1="50" y1="100" x2="450" y2="100" strokeWidth="1" strokeDasharray="8 8" />
          <line x1="50" y1="200" x2="450" y2="200" strokeWidth="1" />
          <line x1="50" y1="300" x2="450" y2="300" strokeWidth="1" strokeDasharray="8 8" />
          <line x1="50" y1="400" x2="450" y2="400" strokeWidth="1" />
          <line x1="100" y1="50" x2="100" y2="450" strokeWidth="1" strokeDasharray="8 8" />
          <line x1="250" y1="50" x2="250" y2="450" strokeWidth="1.5" />
          <line x1="400" y1="50" x2="400" y2="450" strokeWidth="1" strokeDasharray="8 8" />
          <circle cx="100" cy="200" r="6" fill="currentColor" />
          <circle cx="250" cy="100" r="8" fill="currentColor" />
          <circle cx="400" cy="300" r="6" fill="currentColor" />
        </svg>
      )}
    </div>
  );
}
