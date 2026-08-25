import { useEffect } from 'react';
import ArtifactShell from './ArtifactShell';
import { EVENTS, track } from '../../lib/umami';

interface PackageTier {
  id: string;
  name: string;
  duration: string;
  stayInfo: string;
  estPrice: string;
  statusBadge: string;
}

const PLANNED_PACKAGES: PackageTier[] = [
  {
    id: 'p1',
    name: 'Classic Economy Group',
    duration: '14 Days Total (Hyderabad Departure)',
    stayInfo: '7N Makkah + 7N Madinah · Quad Sharing · Indian Catering',
    estPrice: '₹85,000',
    statusBadge: 'Upcoming Planning',
  },
  {
    id: 'p2',
    name: 'Executive 4-Star Package',
    duration: '14 Days Total (Direct Flights)',
    stayInfo: 'Walking distance to Haramain · Twin / Triple · Full Ziyarat',
    estPrice: '₹1,15,000',
    statusBadge: 'Inquiry Open',
  },
  {
    id: 'p3',
    name: 'Custom Family VIP Package',
    duration: 'Flexible Dates & Duration',
    stayInfo: '5-Star Clock Tower Frontage · Private GMC Ground Transit',
    estPrice: 'Custom Quote',
    statusBadge: 'Bespoke Itinerary',
  }
];

export default function DepartureCountdown() {
  useEffect(() => {
    track(EVENTS.umrahView);
  }, []);

  return (
    <ArtifactShell 
      title="Umrah Package & Itinerary Planner" 
      caption="Custom group planning, verified hotel tiers & flight coordination from Hyderabad"
      statusLabel="Seasonal Planning"
    >
      <div className="space-y-2.5 max-h-[300px] sm:max-h-none overflow-y-auto sm:overflow-visible pr-1 sm:pr-0">
        {PLANNED_PACKAGES.map((pkg) => (
          <div 
            key={pkg.id} 
            className="flex items-center justify-between rounded-xl border border-brand-navy/5 bg-white/95 p-3 shadow-xs hover:border-brand-gold/30 transition-colors"
          >
            <div className="min-w-0 pr-2">
              <p className="text-xs font-bold text-brand-navy truncate">{pkg.name}</p>
              <p className="text-[10px] text-brand-textLight truncate mt-0.5">{pkg.stayInfo}</p>
              <div className="flex items-center gap-2 mt-1">
                <span className="text-[11px] font-semibold text-brand-gold">{pkg.estPrice}</span>
                <span className="text-[9px] text-brand-textLight">· {pkg.duration}</span>
              </div>
            </div>

            <div className="shrink-0 text-right">
              <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-gold/30 bg-brand-gold/10 px-2.5 py-0.5 text-[10px] font-bold text-brand-navy">
                <span className="h-1.5 w-1.5 rounded-full bg-brand-gold" />
                {pkg.statusBadge}
              </span>
            </div>
          </div>
        ))}

        <div className="rounded-xl bg-brand-navy/5 border border-brand-navy/10 px-3 py-2 flex items-center justify-between text-[10px] text-brand-textLight">
          <span>Hotel bookings & flight schedules subject to seasonal availability</span>
          <span className="font-bold text-brand-navy">Hyderabad Hub</span>
        </div>
      </div>
    </ArtifactShell>
  );
}
