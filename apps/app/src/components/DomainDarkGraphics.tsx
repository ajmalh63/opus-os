export type DarkDomainVariant = "attestation" | "visa" | "study" | "umrah" | "recruitment" | "about" | "global";

interface DomainDarkGraphicsProps {
  variant: DarkDomainVariant;
  className?: string;
}

export default function DomainDarkGraphics({ variant, className = "" }: DomainDarkGraphicsProps) {
  return (
    <div
      className={`pointer-events-none absolute inset-0 overflow-hidden select-none ${className}`}
      aria-hidden="true"
    >
      {/* Ambient Gradient Glows */}
      <div className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-brand-gold/10 blur-3xl" />
      <div className="absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-sky-500/10 blur-3xl" />

      {/* 1. ATTESTATION & APOSTILLE: Diplomatic Guilloché Security Watermark & MEA Hologram Lattice */}
      {variant === "attestation" && (
        <svg
          className="absolute right-[-8%] top-[-10%] h-[42rem] w-[42rem] text-brand-gold/15 opacity-80"
          viewBox="0 0 600 600"
          fill="none"
          stroke="currentColor"
        >
          {/* Concentric Guilloché Circles */}
          <circle cx="300" cy="300" r="270" strokeWidth="1.5" strokeDasharray="8 6" />
          <circle cx="300" cy="300" r="245" strokeWidth="0.8" />
          <circle cx="300" cy="300" r="220" strokeWidth="1.2" strokeDasharray="4 4" />
          <circle cx="300" cy="300" r="175" strokeWidth="2" />
          <circle cx="300" cy="300" r="140" strokeWidth="0.8" strokeDasharray="3 3" />
          <circle cx="300" cy="300" r="95" strokeWidth="1.5" />
          <circle cx="300" cy="300" r="50" strokeWidth="2" strokeDasharray="6 6" />
          <circle cx="300" cy="300" r="15" fill="currentColor" opacity="0.3" />

          {/* 12-Point Sovereign Seal Rosette */}
          <polygon
            points="300,40 335,130 430,70 395,165 490,175 420,240 495,300 420,360 490,425 395,435 430,530 335,470 300,560 265,470 170,530 205,435 110,425 180,360 105,300 180,240 110,175 205,165 170,70 265,130"
            strokeWidth="1.2"
            opacity="0.6"
          />

          {/* Diplomatic Ribbon Watermark Lines */}
          <path d="M50,300 Q150,120 300,300 T550,300" strokeWidth="1.2" strokeDasharray="5 5" />
          <path d="M50,260 Q150,80 300,260 T550,260" strokeWidth="0.8" />
          <path d="M50,340 Q150,160 300,340 T550,340" strokeWidth="0.8" />
          <path d="M300,50 Q480,150 300,300 T300,550" strokeWidth="1.2" strokeDasharray="5 5" />

          {/* Hologram Corner Notary Stamped Dots */}
          <circle cx="150" cy="150" r="4" fill="currentColor" opacity="0.5" />
          <circle cx="450" cy="150" r="4" fill="currentColor" opacity="0.5" />
          <circle cx="150" cy="450" r="4" fill="currentColor" opacity="0.5" />
          <circle cx="450" cy="450" r="4" fill="currentColor" opacity="0.5" />
        </svg>
      )}

      {/* 2. VISA SERVICES: Consular Radar, Flight Great-Circles & Biometric RFID Trajectories */}
      {variant === "visa" && (
        <svg
          className="absolute right-[-5%] top-[-15%] h-[46rem] w-[46rem] text-emerald-400/15 opacity-85"
          viewBox="0 0 700 700"
          fill="none"
          stroke="currentColor"
        >
          {/* Radar Radial Scanning Grids */}
          <circle cx="350" cy="350" r="320" strokeWidth="1" strokeDasharray="10 8" />
          <circle cx="350" cy="350" r="260" strokeWidth="1.2" />
          <circle cx="350" cy="350" r="195" strokeWidth="1" strokeDasharray="6 6" />
          <circle cx="350" cy="350" r="130" strokeWidth="1.5" />
          <circle cx="350" cy="350" r="65" strokeWidth="1" />
          <circle cx="350" cy="350" r="8" fill="currentColor" opacity="0.4" />

          {/* Consular Radar Sweep Crosshairs */}
          <line x1="350" y1="20" x2="350" y2="680" strokeWidth="1" strokeDasharray="4 4" />
          <line x1="20" y1="350" x2="680" y2="350" strokeWidth="1" strokeDasharray="4 4" />
          <line x1="120" y1="120" x2="580" y2="580" strokeWidth="0.8" opacity="0.4" />
          <line x1="120" y1="580" x2="580" y2="120" strokeWidth="0.8" opacity="0.4" />

          {/* International Air-Corridor Flight Arcs */}
          <path d="M70,450 C180,180 520,160 630,420" strokeWidth="1.8" strokeDasharray="8 6" />
          <path d="M120,530 C250,220 480,240 600,510" strokeWidth="1.2" />
          <path d="M50,280 C220,400 480,380 650,240" strokeWidth="1.2" strokeDasharray="4 4" />

          {/* Biometric Passport RFID Chip Geometry */}
          <rect x="290" y="290" width="120" height="120" rx="20" strokeWidth="1.2" strokeDasharray="6 3" />
          <circle cx="350" cy="350" r="24" strokeWidth="1.5" />
          
          {/* Waypoint Blips */}
          <circle cx="210" cy="270" r="5" fill="currentColor" opacity="0.6" />
          <circle cx="490" cy="230" r="6" fill="#d7a019" opacity="0.7" />
          <circle cx="430" cy="460" r="4" fill="currentColor" opacity="0.5" />
        </svg>
      )}

      {/* 3. STUDY ABROAD: Academic Armillary Sphere, Astrolabe & Global University Meridians */}
      {variant === "study" && (
        <svg
          className="absolute right-[-5%] top-[-10%] h-[44rem] w-[44rem] text-brand-gold/15 opacity-80"
          viewBox="0 0 600 600"
          fill="none"
          stroke="currentColor"
        >
          {/* Outer Astrolabe Degree Ring */}
          <circle cx="300" cy="300" r="275" strokeWidth="1.8" />
          <circle cx="300" cy="300" r="255" strokeWidth="0.8" strokeDasharray="2 4" />
          <circle cx="300" cy="300" r="215" strokeWidth="1.2" strokeDasharray="8 6" />
          
          {/* 8-Point Compass & Meridian Ellipses */}
          <ellipse cx="300" cy="300" rx="255" ry="110" strokeWidth="1.2" />
          <ellipse cx="300" cy="300" rx="255" ry="110" transform="rotate(45 300 300)" strokeWidth="1" strokeDasharray="6 4" />
          <ellipse cx="300" cy="300" rx="255" ry="110" transform="rotate(90 300 300)" strokeWidth="1.2" />
          <ellipse cx="300" cy="300" rx="255" ry="110" transform="rotate(135 300 300)" strokeWidth="1" strokeDasharray="6 4" />

          {/* Academic Compass Rose Star */}
          <polygon
            points="300,60 325,235 480,180 345,265 540,300 345,335 480,420 325,365 300,540 275,365 120,420 255,335 60,300 255,265 120,180 275,235"
            strokeWidth="1.2"
            opacity="0.5"
          />
          <circle cx="300" cy="300" r="40" strokeWidth="2" />
          <circle cx="300" cy="300" r="10" fill="currentColor" opacity="0.3" />

          {/* Collegiate Constellation Stars */}
          <circle cx="180" cy="180" r="4" fill="currentColor" opacity="0.6" />
          <circle cx="420" cy="180" r="5" fill="#38bdf8" opacity="0.6" />
          <circle cx="180" cy="420" r="4" fill="currentColor" opacity="0.6" />
          <circle cx="420" cy="420" r="5" fill="#d7a019" opacity="0.7" />
        </svg>
      )}

      {/* 4. UMRAH TRAVEL: Sacred 8-Fold Girih Star Rosette Arabesque & Kaaba Azimuth Lattice */}
      {variant === "umrah" && (
        <svg
          className="absolute right-[-6%] top-[-8%] h-[44rem] w-[44rem] text-brand-gold/20 opacity-85"
          viewBox="0 0 600 600"
          fill="none"
          stroke="currentColor"
        >
          {/* Sacred Interlocking 8-Fold Girih Stars */}
          <rect x="150" y="150" width="300" height="300" strokeWidth="1.5" />
          <rect x="150" y="150" width="300" height="300" transform="rotate(45 300 300)" strokeWidth="1.5" />
          <rect x="150" y="150" width="300" height="300" transform="rotate(22.5 300 300)" strokeWidth="0.8" strokeDasharray="6 4" />
          <rect x="150" y="150" width="300" height="300" transform="rotate(67.5 300 300)" strokeWidth="0.8" strokeDasharray="6 4" />

          {/* Concentric Islamic Geometry Rings */}
          <circle cx="300" cy="300" r="280" strokeWidth="1.5" strokeDasharray="10 8" />
          <circle cx="300" cy="300" r="212" strokeWidth="1" />
          <circle cx="300" cy="300" r="148" strokeWidth="1.5" />
          <circle cx="300" cy="300" r="85" strokeWidth="1" strokeDasharray="4 4" />
          <circle cx="300" cy="300" r="30" strokeWidth="2" />
          <circle cx="300" cy="300" r="8" fill="currentColor" opacity="0.5" />

          {/* Arch & Minaret Pinnacle Outlines */}
          <path d="M300,20 C340,110 320,180 300,212 C280,180 260,110 300,20 Z" strokeWidth="1.2" opacity="0.6" />
          <path d="M300,580 C340,490 320,420 300,388 C280,420 260,490 300,580 Z" strokeWidth="1.2" opacity="0.6" />
          <path d="M20,300 C110,340 180,320 212,300 C180,280 110,260 20,300 Z" strokeWidth="1.2" opacity="0.6" />
          <path d="M580,300 C490,340 420,320 388,300 C420,280 490,260 580,300 Z" strokeWidth="1.2" opacity="0.6" />

          {/* Corner Crescent Accents */}
          <circle cx="120" cy="120" r="8" fill="currentColor" opacity="0.4" />
          <circle cx="480" cy="120" r="8" fill="currentColor" opacity="0.4" />
          <circle cx="120" cy="480" r="8" fill="currentColor" opacity="0.4" />
          <circle cx="480" cy="480" r="8" fill="currentColor" opacity="0.4" />
        </svg>
      )}

      {/* 5. RECRUITMENT & GLOBAL CAREERS: Transcontinental Talent Supply Routes & MEA Node Matrix */}
      {variant === "recruitment" && (
        <svg
          className="absolute right-[-6%] top-[-10%] h-[44rem] w-[44rem] text-sky-400/15 opacity-80"
          viewBox="0 0 600 600"
          fill="none"
          stroke="currentColor"
        >
          {/* Global Supply Grid Matrix */}
          <line x1="60" y1="120" x2="540" y2="120" strokeWidth="0.8" strokeDasharray="8 6" />
          <line x1="60" y1="210" x2="540" y2="210" strokeWidth="1" />
          <line x1="60" y1="300" x2="540" y2="300" strokeWidth="1.5" />
          <line x1="60" y1="390" x2="540" y2="390" strokeWidth="1" />
          <line x1="60" y1="480" x2="540" y2="480" strokeWidth="0.8" strokeDasharray="8 6" />

          <line x1="120" y1="60" x2="120" y2="540" strokeWidth="0.8" strokeDasharray="8 6" />
          <line x1="210" y1="60" x2="210" y2="540" strokeWidth="1" />
          <line x1="300" y1="60" x2="300" y2="540" strokeWidth="1.5" />
          <line x1="390" y1="60" x2="390" y2="540" strokeWidth="1" />
          <line x1="480" y1="60" x2="480" y2="540" strokeWidth="0.8" strokeDasharray="8 6" />

          {/* Transcontinental Corridor Curves */}
          <path d="M120,480 Q250,150 480,210" strokeWidth="1.8" strokeDasharray="8 4" />
          <path d="M210,540 Q380,250 540,120" strokeWidth="1.2" />
          <path d="M60,300 Q300,100 480,480" strokeWidth="1.4" strokeDasharray="5 5" />

          {/* Institutional Concentric Node Rings */}
          <circle cx="300" cy="300" r="180" strokeWidth="1" strokeDasharray="6 6" />
          <circle cx="300" cy="300" r="90" strokeWidth="1.5" />

          {/* Verified Employer Node Stations */}
          <circle cx="120" cy="480" r="8" fill="#d7a019" opacity="0.8" />
          <circle cx="300" cy="210" r="6" fill="currentColor" opacity="0.7" />
          <circle cx="480" cy="210" r="8" fill="#38bdf8" opacity="0.8" />
          <circle cx="390" cy="390" r="7" fill="currentColor" opacity="0.6" />
          <circle cx="210" cy="120" r="5" fill="currentColor" opacity="0.5" />
        </svg>
      )}

      {/* 6. ABOUT US & GLOBAL PLATFORM: Corporate Governance Shield & Planetary Orbitals */}
      {(variant === "about" || variant === "global") && (
        <svg
          className="absolute right-[-5%] top-[-8%] h-[42rem] w-[42rem] text-brand-gold/15 opacity-80"
          viewBox="0 0 600 600"
          fill="none"
          stroke="currentColor"
        >
          <circle cx="300" cy="300" r="260" strokeWidth="1.5" strokeDasharray="10 8" />
          <circle cx="300" cy="300" r="190" strokeWidth="1" />
          <circle cx="300" cy="300" r="120" strokeWidth="1.5" strokeDasharray="6 4" />
          <circle cx="300" cy="300" r="50" strokeWidth="2" />
          <circle cx="300" cy="300" r="10" fill="currentColor" opacity="0.5" />

          <path d="M60,300 C150,140 450,140 540,300" strokeWidth="1.5" />
          <path d="M60,300 C150,460 450,460 540,300" strokeWidth="1.5" />
          <path d="M300,60 C140,150 140,450 300,540" strokeWidth="1.5" />
          <path d="M300,60 C460,150 460,450 300,540" strokeWidth="1.5" />
        </svg>
      )}
    </div>
  );
}
